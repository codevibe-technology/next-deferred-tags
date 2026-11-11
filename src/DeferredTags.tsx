'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DEFAULT_DELAY_MS, DEFAULT_TRIGGERS, scheduleOnInteraction } from './schedule.js';
import { getState, installStubs, loadTags, trackPageView, type DocLike, type ScriptSpec, type TagConfig, type TagWindow } from './tags.js';

export interface DeferredTagsProps extends TagConfig {
  /**
   * Events that load the tags. Default: `pointerdown`, `keydown`, `touchstart`, `scroll`.
   */
  triggers?: readonly string[];
  /**
   * Load anyway this many milliseconds after the window `load` event, so visitors who
   * only read are still measured. Default 5000. `false` waits for an interaction only.
   */
  delay?: number | false;
  /**
   * Set to `false` to hold the tags back entirely, e.g. until cookie consent. When it
   * turns `true`, scheduling starts. Default `true`.
   */
  enabled?: boolean;
  /**
   * Push `{ event: 'pageview', page }` to the dataLayer on the first render and on
   * every client-side navigation (and `PageView` on a directly configured Meta Pixel).
   * Default `true`.
   */
  trackPageViews?: boolean;
  /** Event name for page views. Default `'pageview'`. */
  pageViewEvent?: string;
  /** Called once, right after the scripts are added. */
  onLoad?: (reason: string) => void;
}

const asWindow = () => window as unknown as TagWindow;
const asDoc = () => document as unknown as DocLike;

function scriptsKey(scripts?: Array<string | ScriptSpec>): string {
  return JSON.stringify(scripts ?? []);
}

function PageViews({ config, eventName }: { config: TagConfig; eventName: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? '';

  useEffect(() => {
    const w = asWindow();
    installStubs(w, config);
    trackPageView(w, (pathname ?? window.location.pathname) + (query ? `?${query}` : ''), eventName);
    // config is captured on purpose; page views depend only on the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, query, eventName]);

  return null;
}

/**
 * Loads Google Tag Manager, GA4, the Meta Pixel, the LinkedIn Insight Tag and any other
 * scripts on the visitor's first interaction or a few seconds after the page loads,
 * whichever comes first. Events and page views are queued until then, so nothing is lost.
 *
 * Put it once in your root layout:
 *
 * ```tsx
 * <DeferredTags gtm="GTM-XXXXXXX" linkedin="1234567" />
 * ```
 */
export function DeferredTags({
  triggers = DEFAULT_TRIGGERS,
  delay = DEFAULT_DELAY_MS,
  enabled = true,
  trackPageViews = true,
  pageViewEvent = 'pageview',
  onLoad,
  gtm,
  ga4,
  metaPixel,
  linkedin,
  scripts,
  nonce,
}: DeferredTagsProps) {
  const config: TagConfig = { gtm, ga4, metaPixel, linkedin, scripts, nonce };
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const triggerKey = triggers.join(',');
  const sKey = scriptsKey(scripts);

  useEffect(() => {
    const w = asWindow();
    installStubs(w, config);
    if (!enabled || getState(w).loaded) return;
    const scheduled = scheduleOnInteraction({
      triggers,
      delay,
      target: window,
      doc: document,
      run: (reason) => {
        if (loadTags(w, asDoc(), config)) onLoadRef.current?.(reason);
      },
    });
    return scheduled.cancel;
    // The ids, triggers and scripts are compared by value through the keys below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gtm, ga4, metaPixel, linkedin, nonce, sKey, triggerKey, delay, enabled]);

  if (!trackPageViews) return null;
  return (
    <Suspense fallback={null}>
      <PageViews config={config} eventName={pageViewEvent} />
    </Suspense>
  );
}

export default DeferredTags;
