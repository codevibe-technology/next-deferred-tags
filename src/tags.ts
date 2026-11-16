/**
 * Vendor bootstraps, split into two steps:
 *
 * 1. `installStubs` runs on mount. It creates the same queues the official snippets
 *    create (`dataLayer`, `gtag`, `fbq`) so page views and events are never lost,
 *    but downloads nothing.
 * 2. `loadTags` runs on the first interaction (or the timeout). It adds the real
 *    scripts, which then read everything that was queued.
 *
 * Both are idempotent: calling them again, or from several components, is safe.
 *
 * With consent handling on (`initConsent`), tags with a vendor consent mode (Google,
 * Microsoft Clarity, Microsoft UET) load with storage denied in `'advanced'` mode, and the
 * Meta Pixel, LinkedIn Insight Tag, TikTok Pixel, Hotjar and other scripts wait for consent.
 */
import { consentModeSignals, DENIED, type ConsentChoice } from './consent.js';

export interface ScriptSpec {
  src: string;
  /** Extra attributes, e.g. `{ 'data-domain': 'example.com' }`. */
  attributes?: Record<string, string>;
  /**
   * With consent handling on, which choice this script needs. Default `'marketing'`.
   * `'necessary'` loads it regardless of consent.
   */
  consent?: 'analytics' | 'marketing' | 'necessary';
}

export interface TagConfig {
  /** Google Tag Manager container id, e.g. `GTM-XXXXXXX`. */
  gtm?: string;
  /** GA4 measurement id for gtag.js without Tag Manager, e.g. `G-XXXXXXXXXX`. */
  ga4?: string;
  /** Meta (Facebook) Pixel id, for the pixel without Tag Manager. */
  metaPixel?: string;
  /** LinkedIn Insight Tag partner id. */
  linkedin?: string;
  /** Microsoft Clarity project id. Analytics consent. */
  clarity?: string;
  /** Microsoft Advertising (Bing) UET tag id. Marketing consent. */
  uet?: string;
  /** TikTok Pixel id. Marketing consent. */
  tiktok?: string;
  /** Hotjar site id. Analytics consent. */
  hotjar?: string | number;
  /** Any other scripts to load at the same moment. */
  scripts?: Array<string | ScriptSpec>;
  /** CSP nonce added to every injected script. */
  nonce?: string;
}

/**
 * How Google tags behave before consent:
 * - `'advanced'` (default): Tag Manager / gtag.js load with every signal denied and send
 *   cookieless pings, which Google uses for conversion modelling.
 * - `'basic'`: Google tags are not loaded at all until the visitor accepts analytics or marketing.
 */
export type ConsentMode = 'advanced' | 'basic';

interface State {
  stubs: Record<string, true>;
  /** The trigger fired (interaction, timeout or loadTagsNow). */
  loaded: boolean;
  /** Which vendor scripts are in the page. */
  injected: Record<string, true>;
  config: TagConfig;
  lastPage?: string;
  onLoad: Array<() => void>;
  /** Consent handling is on: undefined when off, null while the visitor has not chosen. */
  consent?: ConsentChoice | null;
  consentMode: ConsentMode;
}

type AnyFn = (...args: unknown[]) => void;
export type TagWindow = {
  dataLayer?: unknown[];
  gtag?: AnyFn;
  fbq?: AnyFn & { queue?: unknown[]; callMethod?: AnyFn; loaded?: boolean; version?: string; push?: AnyFn };
  _fbq?: unknown;
  _linkedin_partner_id?: string;
  _linkedin_data_partner_ids?: string[];
  lintrk?: AnyFn & { q?: unknown[] };
  clarity?: AnyFn & { q?: unknown[] };
  uetq?: { push: AnyFn } | unknown[];
  UET?: new (o: Record<string, unknown>) => { push: AnyFn };
  ttq?: TikTokQueue;
  TiktokAnalyticsObject?: string;
  hj?: AnyFn & { q?: unknown[] };
  _hjSettings?: { hjid: number; hjsv: number };
  __nextDeferredTags?: State;
};

/** The `ttq` queue the official TikTok base code creates. */
export type TikTokQueue = unknown[] & {
  methods?: string[];
  setAndDefer?: (target: Record<string, unknown>, method: string) => void;
  load?: (id: string, opts?: Record<string, unknown>) => void;
  _i?: Record<string, unknown>;
  _t?: Record<string, number>;
  _o?: Record<string, unknown>;
  [method: string]: unknown;
};

export type DocLike = {
  createElement(tag: 'script'): { async: boolean; src: string; nonce?: string; onload?: (() => void) | null; setAttribute(k: string, v: string): void };
  head: { appendChild(node: unknown): unknown };
};

export function getState(w: TagWindow): State {
  if (!w.__nextDeferredTags) w.__nextDeferredTags = { stubs: {}, loaded: false, injected: {}, config: {}, onLoad: [], consentMode: 'advanced' };
  return w.__nextDeferredTags;
}

function ensureGtag(w: TagWindow) {
  w.dataLayer = w.dataLayer || [];
  if (!w.gtag) {
    // Same as the official snippet: gtag pushes its `arguments` object.
    w.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  }
}

/**
 * What a vendor needs before it may load, with consent handling on:
 * - `'google'`: Google tags (Consent Mode): any time in advanced mode, else analytics or marketing
 * - `'modeled-analytics'` / `'modeled-marketing'`: vendors with their own consent mode
 *   (Clarity, UET): any time in advanced mode (storage denied), else that category
 * - `'analytics'` / `'marketing'`: that category; `'necessary'`: always
 */
type Need = 'google' | 'modeled-analytics' | 'modeled-marketing' | 'analytics' | 'marketing' | 'necessary';

/** Whether a vendor may load under the current consent. */
function allowed(state: State, need: Need): boolean {
  if (state.consent === undefined || need === 'necessary') return true;
  const c = state.consent ?? DENIED;
  if (need === 'google') return state.consentMode === 'advanced' || c.analytics || c.marketing;
  if (need === 'modeled-analytics') return state.consentMode === 'advanced' || c.analytics;
  if (need === 'modeled-marketing') return state.consentMode === 'advanced' || c.marketing;
  return c[need];
}

const storage = (on: boolean) => (on ? 'granted' : 'denied');

/** Tell Clarity, UET and TikTok about the current choice (only those configured). */
function signalVendors(w: TagWindow, state: State, phase: 'default' | 'update') {
  const c = state.consent ?? DENIED;
  const cfg = state.config;
  if (cfg.clarity && w.clarity) w.clarity('consentv2', { ad_Storage: storage(c.marketing), analytics_Storage: storage(c.analytics) });
  if (cfg.uet && state.stubs.uet) {
    w.uetq = w.uetq || [];
    (w.uetq as { push: AnyFn }).push('consent', phase, { ad_storage: storage(c.marketing) });
  }
  if (cfg.tiktok && w.ttq) {
    const t = w.ttq as unknown as Record<string, AnyFn>;
    if (c.marketing) t.grantConsent();
    else if (phase === 'update') t.revokeConsent();
    else t.holdConsent();
  }
}

/**
 * Turn consent handling on (first call) and set the default Google Consent Mode signals.
 * Must run before Tag Manager or gtag.js loads; `<DeferredTags consent>` does this on mount.
 */
export function initConsent(w: TagWindow, choice: ConsentChoice | null, mode: ConsentMode = 'advanced'): void {
  const state = getState(w);
  if (state.stubs.consent) return;
  state.stubs.consent = true;
  state.consentMode = mode;
  state.consent = choice;
  ensureGtag(w);
  w.gtag!('consent', 'default', { ...consentModeSignals(choice), functionality_storage: 'granted', security_storage: 'granted' });
  w.gtag!('set', 'ads_data_redaction', !choice?.marketing);
  if (choice) w.dataLayer!.push({ event: 'consent_update', consent_analytics: choice.analytics, consent_marketing: choice.marketing });
  // Vendors whose stubs already exist get their default now; the rest when installStubs runs.
  state.stubs.vendorConsent = true;
  signalVendors(w, state, 'default');
}

/**
 * Apply a new choice: update Google Consent Mode, tell Tag Manager (a `consent_update`
 * dataLayer event) and load any vendor that is now allowed, if the tags are already due.
 */
export function updateConsent(w: TagWindow, doc: DocLike, choice: ConsentChoice): void {
  const state = getState(w);
  if (!state.stubs.consent) initConsent(w, null, state.consentMode);
  const before = state.consent;
  state.consent = { analytics: !!choice.analytics, marketing: !!choice.marketing };
  if (before && before.analytics === state.consent.analytics && before.marketing === state.consent.marketing) return;
  ensureGtag(w);
  w.gtag!('consent', 'update', consentModeSignals(state.consent));
  w.gtag!('set', 'ads_data_redaction', !state.consent.marketing);
  w.dataLayer!.push({ event: 'consent_update', consent_analytics: state.consent.analytics, consent_marketing: state.consent.marketing });
  if (state.config.metaPixel && w.fbq) w.fbq('consent', state.consent.marketing ? 'grant' : 'revoke');
  signalVendors(w, state, 'update');
  if (state.loaded) {
    const newlyMeta = !state.injected.meta && allowed(state, 'marketing') && state.config.metaPixel;
    const newlyTikTok = !state.injected.tiktok && allowed(state, 'marketing') && state.config.tiktok;
    inject(w, doc);
    // These pixels did not record page views before consent: record the current one now.
    if (newlyMeta && w.fbq && state.lastPage) w.fbq('track', 'PageView');
    if (newlyTikTok && w.ttq && state.lastPage) (w.ttq as unknown as Record<string, AnyFn>).page();
  }
}

/** Merge new ids into the stored config (first value for each key wins). */
function remember(state: State, cfg: TagConfig) {
  const c = state.config;
  for (const k of ['gtm', 'ga4', 'metaPixel', 'linkedin', 'clarity', 'uet', 'tiktok', 'hotjar', 'nonce'] as const) {
    if (cfg[k] && !c[k]) (c as Record<string, unknown>)[k] = cfg[k];
  }
  if (cfg.scripts?.length) {
    const have = new Set((c.scripts ?? []).map((s) => (typeof s === 'string' ? s : s.src)));
    c.scripts = [...(c.scripts ?? []), ...cfg.scripts.filter((s) => !have.has(typeof s === 'string' ? s : s.src))];
  }
}

export function installStubs(w: TagWindow, cfg: TagConfig): void {
  const state = getState(w);
  remember(state, cfg);
  const c = state.config;

  w.dataLayer = w.dataLayer || [];

  if (c.ga4 && !state.stubs.gtag) {
    state.stubs.gtag = true;
    ensureGtag(w);
  }

  if (c.metaPixel && !state.stubs.fbq) {
    state.stubs.fbq = true;
    if (!w.fbq) {
      const n = function fbq(...args: unknown[]) {
        if (n.callMethod) n.callMethod(...args);
        else n.queue!.push(args);
      } as NonNullable<TagWindow['fbq']>;
      n.push = n;
      n.loaded = true;
      n.version = '2.0';
      n.queue = [];
      w.fbq = n;
      if (!w._fbq) w._fbq = n;
    }
    // With consent handling on and marketing not granted, the pixel starts revoked.
    if (state.consent !== undefined && !state.consent?.marketing) w.fbq('consent', 'revoke');
    w.fbq('init', c.metaPixel);
  }

  if (c.linkedin && !state.stubs.linkedin) {
    state.stubs.linkedin = true;
    w._linkedin_partner_id = c.linkedin;
    w._linkedin_data_partner_ids = w._linkedin_data_partner_ids || [];
    if (!w._linkedin_data_partner_ids.includes(c.linkedin)) w._linkedin_data_partner_ids.push(c.linkedin);
    if (!w.lintrk) {
      const q: unknown[] = [];
      w.lintrk = Object.assign((a: unknown, b: unknown) => {
        q.push([a, b]);
      }, { q });
    }
  }

  if (c.clarity && !state.stubs.clarity) {
    state.stubs.clarity = true;
    // Same queue as Clarity's snippet.
    if (!w.clarity) {
      const fn = function clarity() {
        // eslint-disable-next-line prefer-rest-params
        (fn.q = fn.q || []).push(arguments);
      } as NonNullable<TagWindow['clarity']>;
      w.clarity = fn;
    }
    if (state.stubs.vendorConsent) w.clarity('consentv2', { ad_Storage: storage(!!state.consent?.marketing), analytics_Storage: storage(!!state.consent?.analytics) });
  }

  if (c.uet && !state.stubs.uet) {
    state.stubs.uet = true;
    w.uetq = w.uetq || [];
    // UET treats a missing default as granted, so set it before the tag loads.
    if (state.stubs.vendorConsent) (w.uetq as { push: AnyFn }).push('consent', 'default', { ad_storage: storage(!!state.consent?.marketing) });
  }

  if (c.tiktok && !state.stubs.tiktok) {
    state.stubs.tiktok = true;
    installTikTokStub(w);
    const t = w.ttq as unknown as Record<string, AnyFn>;
    if (state.stubs.vendorConsent) {
      if (state.consent?.marketing) t.grantConsent();
      else t.holdConsent();
    }
  }

  if (c.hotjar && !state.stubs.hotjar) {
    state.stubs.hotjar = true;
    if (!w.hj) {
      const fn = function hj() {
        // eslint-disable-next-line prefer-rest-params
        (fn.q = fn.q || []).push(arguments);
      } as NonNullable<TagWindow['hj']>;
      w.hj = fn;
    }
    w._hjSettings = { hjid: Number(c.hotjar), hjsv: 6 };
  }
}

const TIKTOK_METHODS = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie', 'holdConsent', 'revokeConsent', 'grantConsent'];

/** The queue part of TikTok's base code (without the script tag, which loads later). */
function installTikTokStub(w: TagWindow) {
  if (w.ttq) return;
  w.TiktokAnalyticsObject = 'ttq';
  const ttq = [] as unknown as TikTokQueue;
  ttq.methods = TIKTOK_METHODS;
  ttq.setAndDefer = (target, method) => {
    target[method] = (...args: unknown[]) => {
      (target as unknown as unknown[]).push([method, ...args]);
    };
  };
  for (const m of TIKTOK_METHODS) ttq.setAndDefer(ttq as unknown as Record<string, unknown>, m);
  ttq._i = {};
  ttq._t = {};
  ttq._o = {};
  w.ttq = ttq;
}

function addScript(doc: DocLike, spec: string | ScriptSpec, nonce?: string, onload?: () => void) {
  const s = doc.createElement('script');
  if (onload) s.onload = onload;
  const { src, attributes } = typeof spec === 'string' ? { src: spec, attributes: undefined } : spec;
  s.async = true;
  s.src = src;
  if (nonce) s.nonce = nonce;
  for (const [k, v] of Object.entries(attributes ?? {})) s.setAttribute(k, v);
  doc.head.appendChild(s);
}

/** Add every script the current consent allows and that is not in the page yet. */
function inject(w: TagWindow, doc: DocLike) {
  const state = getState(w);
  const c = state.config;
  const once = (key: string, need: Parameters<typeof allowed>[1], add: () => void) => {
    if (state.injected[key] || !allowed(state, need)) return;
    state.injected[key] = true;
    add();
  };

  if (c.gtm) {
    once('gtm', 'google', () => {
      w.dataLayer!.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      addScript(doc, `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(c.gtm!)}`, c.nonce);
    });
  }
  if (c.ga4) {
    once('ga4', 'google', () => {
      w.gtag!('js', new Date());
      w.gtag!('config', c.ga4);
      addScript(doc, `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(c.ga4!)}`, c.nonce);
    });
  }
  if (c.metaPixel) once('meta', 'marketing', () => addScript(doc, 'https://connect.facebook.net/en_US/fbevents.js', c.nonce));
  if (c.linkedin) once('linkedin', 'marketing', () => addScript(doc, 'https://snap.licdn.com/li.lms-analytics/insight.min.js', c.nonce));
  if (c.clarity) once('clarity', 'modeled-analytics', () => addScript(doc, `https://www.clarity.ms/tag/${encodeURIComponent(c.clarity!)}`, c.nonce));
  if (c.uet) {
    once('uet', 'modeled-marketing', () =>
      addScript(doc, 'https://bat.bing.com/bat.js', c.nonce, () => {
        // As in Microsoft's snippet: hand the queue to UET and record the page load.
        // enableAutoSpaTracking makes UET count client-side navigations itself.
        if (!w.UET || !Array.isArray(w.uetq)) return;
        const tag = new w.UET({ ti: c.uet, enableAutoSpaTracking: true, q: w.uetq });
        w.uetq = tag;
        tag.push('pageLoad');
      }),
    );
  }
  if (c.tiktok) {
    once('tiktok', 'marketing', () => {
      const t = w.ttq!;
      const id = c.tiktok!;
      t._i![id] = [];
      t._t![id] = Date.now();
      t._o![id] = {};
      addScript(doc, `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`, c.nonce);
    });
  }
  if (c.hotjar) {
    once('hotjar', 'analytics', () => addScript(doc, `https://static.hotjar.com/c/hotjar-${encodeURIComponent(String(c.hotjar))}.js?sv=6`, c.nonce));
  }
  for (const s of c.scripts ?? []) {
    const spec = typeof s === 'string' ? { src: s } : s;
    once(`script:${spec.src}`, spec.consent ?? 'marketing', () => addScript(doc, s, c.nonce));
  }
}

/**
 * Inject the real scripts once (only those the visitor's consent allows, when consent
 * handling is on; the rest load when consent is given). Returns false if this already ran.
 */
export function loadTags(w: TagWindow, doc: DocLike, cfg: TagConfig = {}): boolean {
  installStubs(w, cfg);
  const state = getState(w);
  if (state.loaded) return false;
  state.loaded = true;
  inject(w, doc);

  for (const fn of state.onLoad.splice(0)) {
    try {
      fn();
    } catch {
      // A failing callback must not stop the others.
    }
  }
  return true;
}

/**
 * Record a page view: `{ event: 'pageview', page }` on the dataLayer (for a GTM
 * "Custom Event" trigger) and `PageView` on the Meta Pixel when it is configured
 * directly. The same page twice in a row is ignored (React Strict Mode runs effects twice).
 */
export function trackPageView(w: TagWindow, page: string, eventName = 'pageview'): boolean {
  const state = getState(w);
  if (state.lastPage === page) return false;
  state.lastPage = page;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ event: eventName, page });
  // Without marketing consent these pixels record nothing, not even queued page views.
  if (state.config.metaPixel && w.fbq && allowed(state, 'marketing')) w.fbq('track', 'PageView');
  if (state.config.tiktok && w.ttq && allowed(state, 'marketing')) (w.ttq as unknown as Record<string, AnyFn>).page();
  // Clarity, Hotjar and UET (enableAutoSpaTracking) follow client-side navigation themselves.
  return true;
}
