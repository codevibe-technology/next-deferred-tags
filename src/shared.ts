// Everything except the router-specific <DeferredTags>, shared by both entry points.
export { ConsentBanner, CONSENT_TEXT_HI, DEFAULT_CONSENT_TEXT, POWERED_BY_URL } from './ConsentBanner.js';
export type { ConsentBannerProps, ConsentBannerText } from './ConsentBanner.js';
export {
  clarityTag,
  getConsent,
  getLanding,
  hotjarEvent,
  loadTagsNow,
  newEventId,
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
export { CONSENT_REGIONS, COUNTRY_COOKIE, COUNTRY_HEADERS, consentRequired, countryFromHeaders, readCountry } from './region.js';
export { ConsentGate } from './ConsentGate.js';
export type { ConsentGateProps } from './ConsentGate.js';
export { attributionParams, CLICK_IDS, UTM_KEYS } from './landing.js';
export type { Landing } from './landing.js';
