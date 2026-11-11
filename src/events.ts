import { getState, loadTags, type TagWindow } from './tags.js';

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
