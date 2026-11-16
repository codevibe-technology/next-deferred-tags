/**
 * Server helpers: send key conversions from your server, so visitors who leave before the
 * tags load (or block them) are still counted, and keep a log of consent choices.
 *
 * Import from `next-deferred-tags/server` in Route Handlers, Server Actions, Pages Router
 * API routes or middleware. Plain `fetch` and Web Crypto only: works on Node and the Edge
 * runtime, with no dependencies. Never import this file in client code.
 */
import { CONSENT_COOKIE, type ConsentAction, type ConsentChoice } from '../consent.js';

export { consentLogSchema, sheetsConsentLog, sqlConsentLog } from './consentLog.js';
// For middleware: set the ndt_country cookie from your host's header (no client code).
export { CONSENT_REGIONS, COUNTRY_COOKIE, consentRequired, countryFromHeaders } from '../region.js';
export type { ConsentLogEntry, ConsentLogStore, QueryFn, SqlDialect } from './consentLog.js';

type Headers = { get(name: string): string | null };
type RequestLike = { headers: Headers };

const env = (k: string): string | undefined => (typeof process !== 'undefined' ? process.env?.[k] : undefined) || undefined;

/** A cookie from the request, URL-decoded. */
export function requestCookie(req: RequestLike, name: string): string | undefined {
  const raw = req.headers.get('cookie') || '';
  const hit = raw.split(/;\s*/).find((c) => c.startsWith(`${name}=`));
  if (!hit) return undefined;
  try {
    return decodeURIComponent(hit.slice(name.length + 1));
  } catch {
    return hit.slice(name.length + 1);
  }
}

/**
 * The visitor's stored choice from the `ndt_consent` cookie, or null when there is none
 * (or the version differs). Same rules as the browser side.
 */
export function consentFromRequest(req: RequestLike, version = '1'): ConsentChoice | null {
  const raw = requestCookie(req, CONSENT_COOKIE);
  if (!raw) return null;
  try {
    const c = JSON.parse(raw) as { version?: string; analytics?: boolean; marketing?: boolean; ts?: number };
    if (c.version !== version) return null;
    if (!c.ts || Date.now() - c.ts > 365 * 864e5) return null;
    return { analytics: c.analytics === true, marketing: c.marketing === true };
  } catch {
    return null;
  }
}

/** Web Crypto: global on Edge, browsers and Node 19+; Node 18 has it only in `node:crypto`. */
async function subtle(): Promise<SubtleCrypto> {
  const g = (globalThis as { crypto?: Crypto }).crypto;
  if (g?.subtle) return g.subtle;
  const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'node:crypto')) as unknown as { webcrypto: Crypto };
  return mod.webcrypto.subtle;
}

async function sha256(v: string): Promise<string> {
  const data = new TextEncoder().encode(v);
  const hash = await (await subtle()).digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

function clientIp(req: RequestLike): string | undefined {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || '')?.trim() || undefined;
}

/** Result of a send: `ok` when the platform accepted it; `skipped` says why nothing was sent. */
export type SendResult = { ok: true } | { ok: false; skipped?: string; status?: number; error?: string };

/** How the consent check works for server events. */
export interface ConsentOptions {
  /** Consent version, as passed to `<DeferredTags consentVersion>`. Default `'1'`. */
  consentVersion?: string;
  /**
   * Skip the consent check. Only for sites that do not use consent handling, or where
   * the law does not require consent for this visitor. Default `false`.
   */
  ignoreConsent?: boolean;
}

export interface MetaEvent extends ConsentOptions {
  /** Standard or custom event name, e.g. `'Lead'`, `'Purchase'`. */
  name: string;
  /** The same id you passed to `trackMetaEvent(..., { eventId })`, so Meta counts it once. */
  eventId: string;
  email?: string;
  phone?: string;
  /** Added to 10-digit phone numbers without a country code, e.g. `'91'`. */
  defaultCountryCode?: string;
  /** Page the event happened on (full URL). Default: the request's Referer. */
  eventSourceUrl?: string;
  /** e.g. `{ value: 4999, currency: 'INR', content_name: 'Contact form' }`. */
  customData?: Record<string, unknown>;
  /** Default: env `META_PIXEL_ID`. */
  pixelId?: string;
  /** Default: env `META_CAPI_TOKEN`. Never sent to the browser. */
  accessToken?: string;
  /** Default: env `META_TEST_EVENT_CODE` (Events Manager > Test events). */
  testEventCode?: string;
  /** Graph API version. Default `'v21.0'`. */
  apiVersion?: string;
}

/**
 * Send an event to Meta's Conversions API. Email and phone are hashed (SHA-256) before they
 * leave your server. Sent only with marketing consent, unless `ignoreConsent`. Never throws.
 *
 * ```ts
 * // app/api/contact/route.ts
 * await sendMetaEvent(req, { name: 'Lead', eventId: body.eventId, email: body.email });
 * ```
 */
export async function sendMetaEvent(req: RequestLike, ev: MetaEvent): Promise<SendResult> {
  const pixelId = ev.pixelId ?? env('META_PIXEL_ID');
  const token = ev.accessToken ?? env('META_CAPI_TOKEN');
  if (!pixelId || !token) return { ok: false, skipped: 'missing META_PIXEL_ID or META_CAPI_TOKEN' };
  if (!ev.eventId) return { ok: false, skipped: 'missing eventId (needed so Meta counts the event once)' };
  if (!ev.ignoreConsent && !consentFromRequest(req, ev.consentVersion)?.marketing) return { ok: false, skipped: 'no marketing consent' };

  const user_data: Record<string, unknown> = {
    client_ip_address: clientIp(req),
    client_user_agent: req.headers.get('user-agent') || undefined,
    fbp: requestCookie(req, '_fbp'),
    fbc: requestCookie(req, '_fbc'),
  };
  const email = (ev.email || '').trim().toLowerCase();
  if (email) user_data.em = [await sha256(email)];
  let phone = (ev.phone || '').replace(/\D/g, '');
  if (phone && phone.length === 10 && ev.defaultCountryCode) phone = ev.defaultCountryCode.replace(/\D/g, '') + phone;
  if (phone) user_data.ph = [await sha256(phone)];

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: ev.name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        action_source: 'website',
        event_source_url: ev.eventSourceUrl ?? req.headers.get('referer') ?? undefined,
        user_data,
        custom_data: ev.customData,
      },
    ],
  };
  const test = ev.testEventCode ?? env('META_TEST_EVENT_CODE');
  if (test) body.test_event_code = test;

  return post(`https://graph.facebook.com/${ev.apiVersion ?? 'v21.0'}/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`, body);
}

export interface Ga4Event extends ConsentOptions {
  /** Event name, e.g. `'generate_lead'`. */
  name: string;
  params?: Record<string, unknown>;
  /** Your own signed-in user id, if any. */
  userId?: string;
  /** Default: env `GA4_MEASUREMENT_ID`. */
  measurementId?: string;
  /** Default: env `GA4_API_SECRET` (Admin > Data streams > Measurement Protocol API secrets). */
  apiSecret?: string;
}

/** The GA client id from the `_ga` cookie ("GA1.1.123.456" becomes "123.456"). */
export function gaClientId(req: RequestLike): string | undefined {
  const ga = requestCookie(req, '_ga');
  const m = ga?.match(/^GA\d\.\d\.(\d+\.\d+)$/);
  return m?.[1];
}

/**
 * Send an event to GA4 with the Measurement Protocol, joined to the visitor's session by
 * the `_ga` cookie. Sent only with analytics consent, unless `ignoreConsent`. GA4 does not
 * de-duplicate, so use it for events the browser did not send. Never throws.
 */
export async function sendGa4Event(req: RequestLike, ev: Ga4Event): Promise<SendResult> {
  const id = ev.measurementId ?? env('GA4_MEASUREMENT_ID');
  const secret = ev.apiSecret ?? env('GA4_API_SECRET');
  if (!id || !secret) return { ok: false, skipped: 'missing GA4_MEASUREMENT_ID or GA4_API_SECRET' };
  const consent = consentFromRequest(req, ev.consentVersion);
  if (!ev.ignoreConsent && !consent?.analytics) return { ok: false, skipped: 'no analytics consent' };
  const clientId = gaClientId(req);
  if (!clientId) return { ok: false, skipped: 'no _ga cookie (GA4 has not run in this browser yet)' };

  const ad = consent?.marketing || ev.ignoreConsent ? 'GRANTED' : 'DENIED';
  const body = {
    client_id: clientId,
    ...(ev.userId ? { user_id: ev.userId } : {}),
    consent: { ad_user_data: ad, ad_personalization: ad },
    events: [{ name: ev.name, params: { engagement_time_msec: 1, ...(ev.params ?? {}) } }],
  };
  return post(`https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`, body);
}

async function post(url: string, body: unknown): Promise<SendResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(5000) : undefined,
    });
    if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Events sent by `<DeferredTags flushTo>` when a visitor left before the tags loaded. */
export interface FlushedEvents {
  events: Array<Record<string, unknown> & { event: string }>;
  /** The page the visitor left from. */
  page?: string;
  /** Landing page with its click ids and UTM tags, if any. */
  landing?: { url: string; params: Record<string, string>; ts: number };
}

/**
 * A Route Handler for `<DeferredTags flushTo="/api/events">`. Checks the beacon body and
 * passes the events to your `handle` function, where you forward the ones that matter,
 * for example with `sendGa4Event` or `sendMetaEvent`. Returns 204.
 *
 * ```ts
 * // app/api/events/route.ts
 * export const POST = createFlushHandler({
 *   handle: async ({ events }, req) => {
 *     for (const e of events) if (e.event === 'generate_lead') await sendGa4Event(req, { name: 'generate_lead' });
 *   },
 * });
 * ```
 */
export function createFlushHandler(opts: { handle: (data: FlushedEvents, req: Request) => unknown | Promise<unknown> }) {
  return async function POST(req: Request): Promise<Response> {
    let input: unknown;
    try {
      const text = await req.text();
      if (text.length > 16384) return new Response('Too large', { status: 413 });
      input = JSON.parse(text);
    } catch {
      return new Response('Bad JSON', { status: 400 });
    }
    const d = input as Partial<FlushedEvents> | null;
    if (!d || !Array.isArray(d.events)) return new Response('Bad body', { status: 400 });
    const events = d.events.filter((e): e is FlushedEvents['events'][number] => !!e && typeof e === 'object' && typeof (e as { event?: unknown }).event === 'string').slice(0, 50);
    try {
      await opts.handle({ events, page: typeof d.page === 'string' ? d.page : undefined, landing: d.landing }, req);
    } catch (err) {
      console.error('next-deferred-tags: handling flushed events failed', err);
    }
    return new Response(null, { status: 204 });
  };
}

/** One consent choice as received by the consent log handler. */
export interface ConsentRecord extends ConsentChoice {
  /** Random id from the visitor's cookie, kept across their changes. */
  id: string;
  version: string;
  /** When the visitor chose (ms since epoch, from their browser). */
  ts: number;
  action: ConsentAction;
  /** When your server received it (ISO time). */
  receivedAt: string;
  /** The page the choice was made on, from the Referer header. */
  page?: string;
}

const ACTIONS: readonly ConsentAction[] = ['accept_all', 'reject_all', 'custom'];

/** Check a posted consent record. Returns null when it is not valid. */
export function parseConsentRecord(input: unknown): Omit<ConsentRecord, 'receivedAt' | 'page'> | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length < 8 || r.id.length > 64) return null;
  if (typeof r.version !== 'string' || r.version.length > 32) return null;
  if (typeof r.ts !== 'number' || !Number.isFinite(r.ts)) return null;
  if (typeof r.analytics !== 'boolean' || typeof r.marketing !== 'boolean') return null;
  if (!ACTIONS.includes(r.action as ConsentAction)) return null;
  return { id: r.id, version: r.version, ts: r.ts, analytics: r.analytics, marketing: r.marketing, action: r.action as ConsentAction };
}

/**
 * A Route Handler that receives `<ConsentBanner onChoice>` records and passes each valid
 * one to your `save` function (a database row, a sheet, a file). It stores no IP address;
 * add one in `save` only if your policy says so. Returns 204, or 400 for a bad record.
 *
 * ```ts
 * // app/api/consent/route.ts
 * export const POST = createConsentLogHandler({ save: (r) => db.consentLog.create({ data: r }) });
 *
 * // layout
 * <ConsentBanner onChoice={(c, action) => fetch('/api/consent', { method: 'POST', body: JSON.stringify({ ...c, action }), keepalive: true })} />
 * ```
 *
 * A consent log helps you show what each visitor chose and when. It does not by itself
 * make a site compliant with GDPR or India's DPDP Act.
 */
export function createConsentLogHandler(opts: { save: (record: ConsentRecord, req: Request) => unknown | Promise<unknown> }) {
  return async function POST(req: Request): Promise<Response> {
    let input: unknown;
    try {
      const text = await req.text();
      if (text.length > 2048) return new Response('Too large', { status: 413 });
      input = JSON.parse(text);
    } catch {
      return new Response('Bad JSON', { status: 400 });
    }
    const rec = parseConsentRecord(input);
    if (!rec) return new Response('Bad consent record', { status: 400 });
    try {
      await opts.save({ ...rec, receivedAt: new Date().toISOString(), page: req.headers.get('referer') ?? undefined }, req);
    } catch (err) {
      console.error('next-deferred-tags: saving the consent record failed', err);
      return new Response('Not saved', { status: 500 });
    }
    return new Response(null, { status: 204 });
  };
}
