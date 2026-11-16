/**
 * Turn another consent tool's state into a `{ analytics, marketing }` choice.
 * Pure functions: no window access, so they are easy to test.
 */
import type { ConsentChoice } from '../consent.js';

/** Cookiebot: `window.Cookiebot.consent` ({ statistics, marketing, ... }). */
export function cookiebotChoice(consent: { statistics?: boolean; marketing?: boolean } | null | undefined): ConsentChoice | null {
  if (!consent) return null;
  return { analytics: !!consent.statistics, marketing: !!consent.marketing };
}

/**
 * OneTrust: `window.OnetrustActiveGroups`, a comma list such as ",C0001,C0002,".
 * Default category ids: C0002 performance (analytics), C0004 targeting (marketing).
 * Pass your own ids if your OneTrust setup differs.
 */
export function oneTrustChoice(
  activeGroups: string | null | undefined,
  groups: { analytics?: string[]; marketing?: string[] } = {},
): ConsentChoice | null {
  if (!activeGroups) return null;
  const active = new Set(activeGroups.split(',').map((g) => g.trim()).filter(Boolean));
  const any = (ids: string[]) => ids.some((id) => active.has(id));
  return { analytics: any(groups.analytics ?? ['C0002']), marketing: any(groups.marketing ?? ['C0004']) };
}

/** The parts of an IAB TCF v2 `tcData` object we read. */
export interface TcData {
  eventStatus?: string;
  gdprApplies?: boolean;
  purpose?: { consents?: Record<string, boolean> };
}

/**
 * IAB TCF v2 (Google's consent banner, Didomi, Quantcast, Sourcepoint and others).
 * Analytics: purpose 1 (store/access) with 8 (measure content) or 9 (market research).
 * Marketing: purposes 1, 3 and 4 (create and use personalised ad profiles).
 * Returns null until the visitor has decided (or the banner is shown for the first time).
 */
export function tcfChoice(tc: TcData | null | undefined): ConsentChoice | null {
  if (!tc) return null;
  if (tc.eventStatus !== 'tcloaded' && tc.eventStatus !== 'useractioncomplete') return null;
  if (tc.gdprApplies === false) return { analytics: true, marketing: true };
  const p = tc.purpose?.consents ?? {};
  const has = (n: number) => !!p[n];
  return { analytics: has(1) && (has(8) || has(9)), marketing: has(1) && has(3) && has(4) };
}
