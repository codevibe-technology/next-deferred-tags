# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

You can also read it on the [next-deferred-tags changelog page](https://codevibe.in/tools/next-deferred-tags/changelog?utm_source=github&utm_medium=changelog&utm_campaign=next-deferred-tags) on codevibe.in, which updates from this file. Every pull request that changes behaviour adds a line under "Unreleased" (CI checks this), and each release moves those lines under its version and date.

## Unreleased

### Added

- Pages Router support: `import { DeferredTags } from 'next-deferred-tags/pages'` in `pages/_app.tsx`. Page views are counted once the router is ready and on every `routeChangeComplete`; hash-only changes are not counted. The new entry point also exports `ConsentBanner` and every helper, so a Pages Router app imports everything from one place.
- `examples/pages-router`.
- Four more built-in tags, each queued from the first render and loaded on the same trigger as the others:
  - `clarity`: Microsoft Clarity. With consent handling on, Clarity gets its Consent API v2 signals (`consentv2`) and, in `"advanced"` mode, loads in its cookieless no-consent mode until analytics is accepted.
  - `uet`: Microsoft Advertising (Bing) UET. The default `ad_storage` is set to denied before the tag loads (UET otherwise assumes granted), and updated on every choice. Client-side navigations are counted by UET's own SPA tracking.
  - `tiktok`: TikTok Pixel. Loads after marketing consent, uses the pixel's `holdConsent` / `grantConsent` / `revokeConsent`, and records a page view per navigation only while marketing is allowed.
  - `hotjar`: Hotjar. It has no consent API, so it loads only after analytics consent.
- `trackTikTokEvent()`, `trackUetEvent()`, `clarityTag()` and `hotjarEvent()` helpers. Like `trackMetaEvent()`, they queue until the script loads.
- `<ConsentBanner showTools>` names the tools behind each category in the settings view ("Used by: Google, Microsoft Clarity, Hotjar"), read from the `<DeferredTags>` props. Off by default. New text key `usedBy`.
- `<ConsentBanner>` shows "Your consent ID" in the settings view once the visitor has chosen, so they can quote it when asking what they agreed to. It is the `visitorId` in the consent log. `showConsentId={false}` hides it; text key `consentId`.
- `CONSENT_TEXT_HI`: Hindi texts for the banner (`text={CONSENT_TEXT_HI}`).
- Consent regions: ask only where the law requires it. `<DeferredTags consent>` and `<ConsentBanner>` take a `country` (from your host's header) or read the `ndt_country` cookie your middleware sets. In a country outside `consentRegions` (default: EU/EEA, UK, Switzerland, India), tags run as if accepted and the banner does not open by itself; the visitor can still change it from a "Cookie settings" link. When the country is unknown, consent is asked. Helpers: `consentRequired()`, `countryFromHeaders()` (Vercel, Cloudflare, CloudFront and others), `readCountry()`, `CONSENT_REGIONS`.
- `next-deferred-tags/adapters`: follow another consent tool instead of `<ConsentBanner>`. `<ConsentBridge source="cookiebot" | "onetrust" | "tcf" />`, or `connectCookiebot()`, `connectOneTrust()` (custom category ids supported) and `connectTcf()` for any IAB TCF v2 tool, including Google's own consent banner. The choice is passed to `setConsent()`, so `<DeferredTags consent="stored">` follows it.
- `next-deferred-tags/server`, for Route Handlers, Server Actions and API routes (Node and Edge, no dependencies):
  - `sendMetaEvent()`: Meta Conversions API. Email and phone are hashed (SHA-256) before they leave the server, the IP, browser and `_fbp` / `_fbc` cookies are added, and the `eventId` you also pass to the browser pixel makes Meta count the event once. Sent only with marketing consent.
  - `sendGa4Event()`: GA4 Measurement Protocol, joined to the visitor's session through the `_ga` cookie. Sent only with analytics consent. GA4 does not de-duplicate, so use it for events the browser did not send.
  - `createConsentLogHandler()`: a Route Handler that checks each `<ConsentBanner onChoice>` record and passes it to your own `save` function. It stores no IP address.
  - Two ready places to keep that log permanently, each with `findByVisitor(id)` to show every choice a visitor made, oldest first:
    - `sqlConsentLog({ query, dialect })`: a table in your own Postgres, MySQL or SQLite database, through the query function of the client you already use (no new dependency). `consentLogSchema(dialect)` gives the `CREATE TABLE`.
    - `sheetsConsentLog({ url, secret })`: rows in a Google Sheet through a small Apps Script web app (`examples/consent-log-sheet/Code.gs`). Rows are only appended, and every request needs the secret.
  - `consentFromRequest()`, `gaClientId()` and `requestCookie()` helpers.
  - Ids and secrets come from `META_PIXEL_ID`, `META_CAPI_TOKEN`, `GA4_MEASUREMENT_ID` and `GA4_API_SECRET`, or from the call. They are never sent to the browser.
- `trackMetaEvent(name, params, { eventId })` and `newEventId()`, to send the same event from the browser and the server.
- Ad click ids survive the delay: `gclid`, `gbraid`, `wbraid`, `dclid`, `fbclid`, `ttclid`, `msclkid`, `li_fat_id`, `twclid` and the UTM tags are read from the landing page on the first render (first touch per tab) and handed over when the tags load, even if the visitor has moved to another page by then. The first page view carries `landing_page` and the ids for Tag Manager variables, GA4 (without Tag Manager) gets the landing URL as `page_location`, and the Meta Pixel gets an `_fbc` cookie built from the `fbclid`. `getLanding()` returns them, so forms can send each lead's source.
- `flushTo`: if a visitor leaves before the tags load, the queued events (not page views) go to your own endpoint with `navigator.sendBeacon`. `createFlushHandler()` in `next-deferred-tags/server` receives them. Respects analytics consent.
- Google Tag Assistant (GTM Preview) connects: with `gtm_debug` in the URL, or when opened from tagassistant.google.com, the tags load at once.
- GTM environments (`gtmAuth`, `gtmPreview`) and first-party script URLs for server-side tagging (`gtmScriptUrl`, `gtagScriptUrl`).
- `gtm`, `ga4` and `metaPixel` accept several ids.
- `urlPassthrough` for Google Consent Mode.
- `debug`: logs to the console when tags are scheduled, which trigger loaded them, each script's load time, consent changes and page views.
- `onBlocked(tag, src)`: called when a tag script fails to load, for example because of an ad blocker. With `debug`, a warning is logged too.
- `webVitals`: pushes LCP, INP, CLS, FCP and TTFB to the dataLayer as `web_vitals` events.
- `<ConsentGate category="marketing">`: holds back an embed that sets cookies (YouTube, Maps, social posts) until the visitor allows its category, with an "Allow and show" placeholder. Outside the consent regions it renders straight away.
- CI checks the size of the browser code (`npm run size`) and builds the Pages Router example. With everything above, `<DeferredTags>` alone is 5.9 KB minified and gzipped (3.1 KB in 0.2.0), and with `<ConsentBanner>` 8.7 KB (5.2 KB).
- `<ConsentBanner>` shows a small "Powered by Codevibe" link, with the Codevibe mark, at the bottom of its settings view (the one with the category switches), never in the first view. It links to the next-deferred-tags page on codevibe.in and opens in a new tab. On by default; `poweredBy={false}` removes it completely, and `text.poweredBy` translates the words before "Codevibe". The link carries the class `ndt-powered-by` for `unstyled` banners.

### Changed

- Upgrading from 0.2 needs no code changes. The new banner text keys (`poweredBy`, `usedBy`, `consentId`) are optional, so translations typed as `ConsentBannerText` for 0.2 still compile, and `test/compat/v0.2-api.tsx` (written against the 0.2 API) is compiled on every test run so this stays true. Visible differences after upgrading with the default banner: the new default texts, the "Powered by Codevibe" link and the consent ID line in the settings view (`text`, `poweredBy={false}` and `showConsentId={false}` restore the old look).
- The CHANGELOG and README link to the changelog page on codevibe.in.
- README rewritten for 0.3: Pages Router quick start, a table of every built-in tag with the consent it needs, events and ad click ids, regions with a middleware example, the banner (with a screenshot), other consent tools, embeds, the consent log (database and Google Sheet), server-side events, debugging, the full props list, and updated trade-offs, including the bundle size and the "Powered by" link.
- The package description and keywords cover the new tags, the Pages Router and the server helpers.
- `countryFromHeaders`, `consentRequired`, `COUNTRY_COOKIE` and `CONSENT_REGIONS` are also exported from `next-deferred-tags/server`, for middleware.
- New default banner texts in the style of large consent tools: "Cookie preferences", "Required cookies", "Functional cookies" and "Advertising cookies", each with a plain description and "Some examples include". The settings button reads "Manage preferences" and the save button "Confirm my choices". "Reject all" and "Accept all" keep equal weight, and the optional switches still start off. Sites that pass their own `text` are not affected.
- Route tracking is now a small per-router piece on top of a shared core, so the App Router and Pages Router builds load tags, queue events and handle consent the same way. The App Router import is unchanged.

## [0.2.0] - 2026-11-12

### Added

- Cookie consent: the `consent` prop turns on Google Consent Mode v2 (every signal denied until the visitor agrees, set before Tag Manager or gtag.js loads, updated on every choice), holds the Meta Pixel, the LinkedIn Insight Tag and extra scripts until marketing consent, and pushes a `consent_update` dataLayer event for Tag Manager. `consent` accepts `"stored"`, a `{ analytics, marketing }` choice from any consent tool, or `null`.
- `consentMode="basic"` keeps Google tags out of the page until the visitor accepts; the default `"advanced"` loads them with signals denied.
- `<ConsentBanner>`: an accessible banner with equal-weight "Reject all" and "Accept all", per-category switches, light and dark themes, custom text, `unstyled` mode, and `onChoice` for keeping a consent log. `openConsentSettings()` reopens it.
- `setConsent()`, `getConsent()` and the framework-free `initConsent`, `updateConsent`, `consentModeSignals`, `readConsent`, `writeConsent`. The choice is stored in a first-party `ndt_consent` cookie for 12 months, with a random id that survives changes and a version that can be bumped to ask again.
- `scripts` entries accept `consent: 'analytics' | 'marketing' | 'necessary'`.
- AI referrals: visits sent by ChatGPT, Perplexity, Claude, Gemini, Copilot and other assistants push an `ai_referral` dataLayer event once per visit (`aiReferrals` prop, on by default). `detectAiReferral()` is exported.
- Release workflow: merging a `chore(release)` pull request publishes to npm with provenance and creates the GitHub release from these notes, once npm trusted publishing is set up for the package. 0.2.0 itself was published by hand, without provenance.

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
