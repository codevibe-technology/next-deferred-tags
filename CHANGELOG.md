# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## Unreleased

## [0.2.0] - 2026-11-12

### Added

- Cookie consent: the `consent` prop turns on Google Consent Mode v2 (every signal denied until the visitor agrees, set before Tag Manager or gtag.js loads, updated on every choice), holds the Meta Pixel, the LinkedIn Insight Tag and extra scripts until marketing consent, and pushes a `consent_update` dataLayer event for Tag Manager. `consent` accepts `"stored"`, a `{ analytics, marketing }` choice from any consent tool, or `null`.
- `consentMode="basic"` keeps Google tags out of the page until the visitor accepts; the default `"advanced"` loads them with signals denied.
- `<ConsentBanner>`: an accessible banner with equal-weight "Reject all" and "Accept all", per-category switches, light and dark themes, custom text, `unstyled` mode, and `onChoice` for keeping a consent log. `openConsentSettings()` reopens it.
- `setConsent()`, `getConsent()` and the framework-free `initConsent`, `updateConsent`, `consentModeSignals`, `readConsent`, `writeConsent`. The choice is stored in a first-party `ndt_consent` cookie for 12 months, with a random id that survives changes and a version that can be bumped to ask again.
- `scripts` entries accept `consent: 'analytics' | 'marketing' | 'necessary'`.
- AI referrals: visits sent by ChatGPT, Perplexity, Claude, Gemini, Copilot and other assistants push an `ai_referral` dataLayer event once per visit (`aiReferrals` prop, on by default). `detectAiReferral()` is exported.
- Automated releases: merging a `chore(release)` pull request publishes to npm with provenance and creates the GitHub release from these notes.

### Changed

- CI runs on `actions/checkout` and `actions/setup-node` v7.
- Contributing guide documents the commit and changelog rules. Pull request titles and changelog entries are checked in CI.
- Links to codevibe.in in the README, contributing guide and issue template carry UTM tags. The README on GitHub says `utm_source=github`; the README published to npm says `utm_source=npm` (switched by the new `prepack`/`postpack` scripts), so visits from each can be told apart.
- The npm homepage link points to the package page on codevibe.in, and the README links it and the write-up.
- The README opens with a 30-second preview (animated GIF) of the launch video, linking to the full 76-second video with sound on codevibe.in.

### Fixed

- The README and the how-it-works diagram gave the cost of the tags on codevibe.in as about 480 KB and ~1.8 s of main-thread work. They now match the measured figures in the speed case study: 470 KiB of script and 4.2 s of the 4.7 s Total Blocking Time.

## [0.1.0] - 2026-11-11

First release.

### Added

- `<DeferredTags>` loads Google Tag Manager, GA4 (gtag.js), the Meta Pixel, the LinkedIn Insight Tag and extra scripts on the first interaction or 5 seconds after load.
- Vendor queues are created on mount, so page views and events are replayed when the scripts arrive.
- Page views on load and on every client-side navigation, de-duplicated for React Strict Mode.
- `enabled` prop and `loadTagsNow()` for cookie consent, `nonce` for CSP.
- `pushEvent`, `trackMetaEvent`, `tagsLoaded` helpers and framework-free building blocks.
