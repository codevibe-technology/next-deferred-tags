# Changelog

## 0.1.0 (2026-11-11)

First release.

- `<DeferredTags>` loads Google Tag Manager, GA4 (gtag.js), the Meta Pixel, the LinkedIn Insight Tag and extra scripts on the first interaction or 5 seconds after load.
- Vendor queues are created on mount, so page views and events are replayed when the scripts arrive.
- Page views on load and on every client-side navigation, de-duplicated for React Strict Mode.
- `enabled` prop and `loadTagsNow()` for cookie consent, `nonce` for CSP.
- `pushEvent`, `trackMetaEvent`, `tagsLoaded` helpers and framework-free building blocks.
