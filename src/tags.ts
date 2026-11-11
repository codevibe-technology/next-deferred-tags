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
 */

export interface ScriptSpec {
  src: string;
  /** Extra attributes, e.g. `{ 'data-domain': 'example.com' }`. */
  attributes?: Record<string, string>;
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
  /** Any other scripts to load at the same moment. */
  scripts?: Array<string | ScriptSpec>;
  /** CSP nonce added to every injected script. */
  nonce?: string;
}

interface State {
  stubs: Record<string, true>;
  loaded: boolean;
  config: TagConfig;
  lastPage?: string;
  onLoad: Array<() => void>;
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
  __nextDeferredTags?: State;
};

export type DocLike = {
  createElement(tag: 'script'): { async: boolean; src: string; nonce?: string; setAttribute(k: string, v: string): void };
  head: { appendChild(node: unknown): unknown };
};

export function getState(w: TagWindow): State {
  if (!w.__nextDeferredTags) w.__nextDeferredTags = { stubs: {}, loaded: false, config: {}, onLoad: [] };
  return w.__nextDeferredTags;
}

/** Merge new ids into the stored config (first value for each key wins). */
function remember(state: State, cfg: TagConfig) {
  const c = state.config;
  for (const k of ['gtm', 'ga4', 'metaPixel', 'linkedin', 'nonce'] as const) {
    if (cfg[k] && !c[k]) c[k] = cfg[k];
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
    if (!w.gtag) {
      // Same as the official snippet: gtag pushes its `arguments` object.
      w.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments);
      };
    }
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
}

function addScript(doc: DocLike, spec: string | ScriptSpec, nonce?: string) {
  const s = doc.createElement('script');
  const { src, attributes } = typeof spec === 'string' ? { src: spec, attributes: undefined } : spec;
  s.async = true;
  s.src = src;
  if (nonce) s.nonce = nonce;
  for (const [k, v] of Object.entries(attributes ?? {})) s.setAttribute(k, v);
  doc.head.appendChild(s);
}

/** Inject the real scripts once. Returns false if they were already loaded. */
export function loadTags(w: TagWindow, doc: DocLike, cfg: TagConfig = {}): boolean {
  installStubs(w, cfg);
  const state = getState(w);
  if (state.loaded) return false;
  state.loaded = true;
  const c = state.config;

  if (c.gtm) {
    w.dataLayer!.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    addScript(doc, `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(c.gtm)}`, c.nonce);
  }
  if (c.ga4) {
    w.gtag!('js', new Date());
    w.gtag!('config', c.ga4);
    addScript(doc, `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(c.ga4)}`, c.nonce);
  }
  if (c.metaPixel) addScript(doc, 'https://connect.facebook.net/en_US/fbevents.js', c.nonce);
  if (c.linkedin) addScript(doc, 'https://snap.licdn.com/li.lms-analytics/insight.min.js', c.nonce);
  for (const s of c.scripts ?? []) addScript(doc, s, c.nonce);

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
  if (state.config.metaPixel && w.fbq) w.fbq('track', 'PageView');
  return true;
}
