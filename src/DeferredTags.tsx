'use client';

import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { CONSENT_EVENT, detectAiReferral, readConsent, type ConsentChoice, type StoredConsent } from './consent.js';
import { DEFAULT_DELAY_MS, DEFAULT_TRIGGERS, scheduleOnInteraction } from './schedule.js';
import {
  getState,
  initConsent,
  installStubs,
  loadTags,
  trackPageView,
  updateConsent,
  type ConsentMode,
  type DocLike,
  type ScriptSpec,
  type TagConfig,
  type TagWindow,
} from './tags.js';

/**
 * - an object: the visitor's current choice (from your own consent tool)
 * - `null`: consent handling on, visitor has not chosen yet (everything optional denied)
 * - `'stored'`: use the choice saved by `<ConsentBanner>` / `setConsent()` and follow its changes
 */
export type ConsentSetting = ConsentChoice | null | 'stored';

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
  /**
   * Turn on cookie consent handling. Google tags then run in Consent Mode v2 (all
   * signals denied until the visitor agrees), and the Meta Pixel, LinkedIn Insight Tag
   * and other scripts load only after marketing consent. Default: off.
   */
  consent?: ConsentSetting;
  /** `'advanced'` (default) or `'basic'`. See the README. */
  consentMode?: ConsentMode;
  /** With `consent="stored"`: bump to ask everyone again. Default `'1'`. */
  consentVersion?: string;
  /**
   * Push `{ event: 'ai_referral', ai_assistant, ai_source }` once per visit when the
   * visitor came from ChatGPT, Perplexity, Claude, Gemini, Copilot and others. Default true.
   */
  aiReferrals?: boolean;
}

const asWindow = () => window as unknown as TagWindow;
const asDoc = () => document as unknown as DocLike;

function scriptsKey(scripts?: Array<string | ScriptSpec>): string {
  return JSON.stringify(scripts ?? []);
}

function toChoice(s: StoredConsent | null): ConsentChoice | null {
  return s ? { analytics: s.analytics, marketing: s.marketing } : null;
}

function resolveConsent(setting: ConsentSetting | undefined, version: string): ConsentChoice | null | undefined {
  if (setting === undefined) return undefined;
  if (setting === 'stored') return toChoice(readConsent(document, version));
  return setting;
}

interface Prep {
  config: TagConfig;
  consent?: ConsentSetting;
  consentMode: ConsentMode;
  consentVersion: string;
}

/** Consent defaults first, then the vendor queues. Safe to call from every effect. */
function prepare(w: TagWindow, p: Prep) {
  const c = resolveConsent(p.consent, p.consentVersion);
  if (c !== undefined) initConsent(w, c, p.consentMode);
  installStubs(w, p.config);
}

const AI_FLAG = 'ndt_ai_referral';

function reportAiReferral(w: TagWindow) {
  try {
    if (sessionStorage.getItem(AI_FLAG)) return;
    const hit = detectAiReferral(document.referrer, window.location.href);
    if (!hit) return;
    sessionStorage.setItem(AI_FLAG, hit.assistant);
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event: 'ai_referral', ai_assistant: hit.assistant, ai_source: hit.source });
  } catch {
    // sessionStorage unavailable: skip
  }
}

function PageViews({ prep, eventName, aiReferrals }: { prep: Prep; eventName: string; aiReferrals: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? '';

  useEffect(() => {
    const w = asWindow();
    prepare(w, prep);
    if (aiReferrals) reportAiReferral(w);
    trackPageView(w, (pathname ?? window.location.pathname) + (query ? `?${query}` : ''), eventName);
    // prep is captured on purpose; page views depend only on the URL.
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
  consent,
  consentMode = 'advanced',
  consentVersion = '1',
  aiReferrals = true,
}: DeferredTagsProps) {
  const config: TagConfig = { gtm, ga4, metaPixel, linkedin, scripts, nonce };
  const prep: Prep = { config, consent, consentMode, consentVersion };
  const onLoadRef = useRef(onLoad);
  onLoadRef.current = onLoad;
  const triggerKey = triggers.join(',');
  const sKey = scriptsKey(scripts);
  const consentKey = consent === undefined ? 'off' : consent === null ? 'null' : consent === 'stored' ? 'stored' : `${!!consent.analytics}${!!consent.marketing}`;

  // Consent changes: a new choice passed in, or (with "stored") a choice saved by the banner.
  useEffect(() => {
    if (consent === undefined) return;
    const w = asWindow();
    prepare(w, prep);
    if (consent !== 'stored') {
      if (consent) updateConsent(w, asDoc(), consent);
      return;
    }
    const onChange = (e: Event) => {
      const stored = (e as CustomEvent<StoredConsent>).detail;
      if (stored) updateConsent(w, asDoc(), stored);
    };
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentKey, consentMode, consentVersion]);

  useEffect(() => {
    const w = asWindow();
    prepare(w, prep);
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

  // Without page-view tracking the AI-referral event still needs a place to run.
  useEffect(() => {
    if (!trackPageViews && aiReferrals) reportAiReferral(asWindow());
  }, [trackPageViews, aiReferrals]);

  if (!trackPageViews) return null;
  return (
    <Suspense fallback={null}>
      <PageViews prep={prep} eventName={pageViewEvent} aiReferrals={aiReferrals} />
    </Suspense>
  );
}

export default DeferredTags;
