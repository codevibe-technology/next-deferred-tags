import {
  CONSENT_EVENT,
  OPEN_SETTINGS_EVENT,
  readConsent,
  writeConsent,
  type ConsentChoice,
  type StoredConsent,
} from './consent.js';
import { getState, loadTags, updateConsent, type DocLike, type TagWindow } from './tags.js';

const win = (): TagWindow | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as TagWindow));

/**
 * Push an event to the dataLayer. Works before the tags load: Tag Manager or gtag.js
 * reads the queue when it arrives.
 *
 * ```ts
 * pushEvent('enquiry_submitted', { form: 'contact' });
 * ```
 */
export function pushEvent(event: string, params: Record<string, unknown> = {}): void {
  const w = win();
  if (!w) return;
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ event, ...params });
}

/**
 * Send a Meta Pixel event when the pixel is configured directly (`metaPixel` prop).
 * Queued until the pixel script loads. If you run the pixel through Tag Manager,
 * use `pushEvent` and a GTM trigger instead.
 *
 * ```ts
 * trackMetaEvent('Lead', { content_name: 'contact' });
 * ```
 */
export function trackMetaEvent(name: string, params?: Record<string, unknown>): void {
  const w = win();
  if (!w?.fbq) return;
  if (params) w.fbq('track', name, params);
  else w.fbq('track', name);
}

/**
 * Load the tags now instead of waiting for an interaction, for example right after
 * the visitor accepts cookies. Does nothing if they are already loaded or if no
 * `<DeferredTags>` has mounted yet.
 */
export function loadTagsNow(): boolean {
  const w = win();
  if (!w || typeof document === 'undefined') return false;
  const state = getState(w);
  if (!Object.keys(state.config).length) return false;
  return loadTags(w, document as unknown as Parameters<typeof loadTags>[1]);
}

/** True once the tag scripts have been added to the page. */
export function tagsLoaded(): boolean {
  const w = win();
  return !!w?.__nextDeferredTags?.loaded;
}

/**
 * Save the visitor's cookie choice and apply it right away: Google Consent Mode is
 * updated, and the Meta Pixel / LinkedIn / other scripts load if marketing is allowed.
 * `<ConsentBanner>` calls this for you; call it yourself from your own consent UI.
 */
export function setConsent(choice: ConsentChoice, opts: { version?: string } = {}): StoredConsent | null {
  const w = win();
  if (!w || typeof document === 'undefined') return null;
  const stored = writeConsent(choice, { version: opts.version });
  updateConsent(w, document as unknown as DocLike, stored);
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: stored }));
  return stored;
}

/** The saved choice, or null when the visitor has not chosen (or the version changed). */
export function getConsent(opts: { version?: string } = {}): StoredConsent | null {
  return readConsent(typeof document === 'undefined' ? undefined : document, opts.version);
}

/** Re-open `<ConsentBanner>` so visitors can change or withdraw consent (e.g. a footer link). */
export function openConsentSettings(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
}
