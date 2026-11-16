/**
 * Keep the ad click ids and UTM tags from the page the visitor landed on.
 *
 * Tags normally read `gclid`, `fbclid` and the rest from the URL when they load. With
 * deferred tags, a visitor may have moved to another page by then, so the ids are gone and
 * the ad gets no credit. We read them on the first render and hand them over when the tags
 * load: as fields on the first page view, as GA4's `page_location`, and as Meta's `_fbc`.
 */

export const CLICK_IDS = ['gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'ttclid', 'msclkid', 'li_fat_id', 'twclid'] as const;
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'] as const;

export interface Landing {
  /** Full URL of the landing page, with its query string. */
  url: string;
  /** Click ids and UTM tags found in it. */
  params: Record<string, string>;
  /** When the visitor landed (ms since epoch). */
  ts: number;
}

const KEY = 'ndt_landing';

/** Click ids and UTM tags in a URL, or null when there are none. */
export function attributionParams(url: string): Record<string, string> | null {
  let search: URLSearchParams;
  try {
    search = new URL(url).searchParams;
  } catch {
    return null;
  }
  const out: Record<string, string> = {};
  for (const k of [...CLICK_IDS, ...UTM_KEYS]) {
    const v = search.get(k);
    if (v) out[k] = v.slice(0, 500);
  }
  return Object.keys(out).length ? out : null;
}

type Storage = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/**
 * Record the landing page for this tab's session, once (first touch wins). Returns the
 * stored landing, or null when the visitor arrived without click ids or UTM tags.
 */
export function captureLanding(url: string, storage?: Storage): Landing | null {
  try {
    const saved = storage?.getItem(KEY);
    if (saved) return JSON.parse(saved) as Landing;
  } catch {
    // unreadable: fall through
  }
  const params = attributionParams(url);
  if (!params) return null;
  const landing: Landing = { url, params, ts: Date.now() };
  try {
    storage?.setItem(KEY, JSON.stringify(landing));
  } catch {
    // storage full or blocked: keep it in memory only
  }
  return landing;
}

/** Meta's click cookie value built from an fbclid (format `fb.1.<ms>.<fbclid>`). */
export function fbcFromFbclid(fbclid: string, ts: number): string {
  return `fb.1.${ts}.${fbclid}`;
}
