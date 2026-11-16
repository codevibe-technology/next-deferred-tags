// Everything except the router-specific <DeferredTags>, shared by both entry points.
export { ConsentBanner, DEFAULT_CONSENT_TEXT } from './ConsentBanner.js';
export type { ConsentBannerProps, ConsentBannerText } from './ConsentBanner.js';
export {
  clarityTag,
  getConsent,
  hotjarEvent,
  loadTagsNow,
  openConsentSettings,
  pushEvent,
  setConsent,
  tagsLoaded,
  trackMetaEvent,
  trackTikTokEvent,
  trackUetEvent,
} from './events.js';
export { AI_ASSISTANTS, CONSENT_COOKIE, consentModeSignals, detectAiReferral, readConsent, writeConsent } from './consent.js';
export type { ConsentAction, ConsentChoice, StoredConsent } from './consent.js';
export { DEFAULT_DELAY_MS, DEFAULT_TRIGGERS, scheduleOnInteraction } from './schedule.js';
export type { ScheduleOptions, Scheduled } from './schedule.js';
export { initConsent, installStubs, loadTags, trackPageView, updateConsent } from './tags.js';
export type { ConsentMode, ScriptSpec, TagConfig } from './tags.js';
