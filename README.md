<p align="center">
  <img src=".github/assets/banner.png" alt="next-deferred-tags: marketing tags load after your page is ready" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/next-deferred-tags"><img src="https://img.shields.io/npm/v/next-deferred-tags?style=flat-square&color=1B6AE0&labelColor=0A1525" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/next-deferred-tags"><img src="https://img.shields.io/npm/dm/next-deferred-tags?style=flat-square&color=1B6AE0&labelColor=0A1525" alt="npm downloads"></a>
  <a href="https://github.com/codevibe-technology/next-deferred-tags/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/codevibe-technology/next-deferred-tags/ci.yml?branch=main&style=flat-square&label=CI&labelColor=0A1525" alt="CI"></a>
  <a href="https://bundlephobia.com/package/next-deferred-tags"><img src="https://img.shields.io/bundlephobia/minzip/next-deferred-tags?style=flat-square&color=2DD4BF&labelColor=0A1525&label=size" alt="bundle size"></a>
  <img src="https://img.shields.io/badge/Next.js-13.4%2B-1B6AE0?style=flat-square&labelColor=0A1525" alt="Next.js 13.4+">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2DD4BF?style=flat-square&labelColor=0A1525" alt="MIT license"></a>
</p>

<p align="center">
  <b>Keep Google Tag Manager, GA4, the Meta Pixel and LinkedIn Insight out of your page load,<br>without losing a single page view or event.</b>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#why-this-exists">Why</a> ·
  <a href="#features">Features</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#props">Props</a> ·
  <a href="#trade-offs-honestly">Trade-offs</a> ·
  <a href="#faq">FAQ</a>
</p>

---

## Quick start

```bash
npm install next-deferred-tags
```

```tsx
// app/layout.tsx
import { DeferredTags } from 'next-deferred-tags';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <DeferredTags gtm="GTM-XXXXXXX" />
      </body>
    </html>
  );
}
```

That is the whole setup. Tag Manager now loads on the visitor's first scroll, tap or key press, or 5 seconds after the page has loaded, whichever comes first. Page views and events pushed before then are queued and replayed in order.

## Why this exists

Marketing tags are often the heaviest JavaScript on a Next.js marketing site, and with the usual setup they download and run **while the page is still loading**. That is exactly the window in which PageSpeed measures Total Blocking Time and Largest Contentful Paint, and in which a real visitor on a mid-range phone is waiting.

<p align="center">
  <img src=".github/assets/how-it-works.png" alt="Diagram: the usual setup runs tags during page load; next-deferred-tags runs them after the visitor interacts" width="100%">
</p>

On [codevibe.in](https://codevibe.in?utm_source=github&utm_medium=readme&utm_campaign=next-deferred-tags&utm_content=body), Tag Manager and the LinkedIn Insight Tag were about **480 KB of script and ~1.8 s of main-thread work** in Lighthouse's mobile run. Deferring them was one of the changes that took the site from **54 to 99 on mobile PageSpeed**. The full story, including the other fixes, is in our [speed case study](https://codevibe.in/case-studies/website-speed-optimization?utm_source=github&utm_medium=readme&utm_campaign=next-deferred-tags&utm_content=case-study). This package is that component, generalised and tested.

## Features

- ⚡ **Nothing downloads during page load.** No tag `<script>` in the server HTML and no requests until the visitor interacts or the delay passes.
- 🧾 **No lost data.** The same queues the official snippets create (`dataLayer`, `gtag`, `fbq`, `lintrk`) exist from the first render, so early page views and events are replayed in order. Tag Manager sees the first page view before `gtm.js`, exactly as with the standard snippet.
- 🧭 **Page views on client-side navigation.** Every route change pushes `{ event: 'pageview', page }`, de-duplicated for React Strict Mode.
- 🧩 **Several vendors, one trigger.** GTM, GA4 (gtag.js), Meta Pixel, LinkedIn Insight and any extra scripts.
- 🍪 **Consent friendly.** Hold everything with `enabled={false}`, then flip it or call `loadTagsNow()`.
- 🔒 **CSP friendly.** Pass a `nonce` and it is added to every injected script.
- 📄 **Static pages stay static.** `useSearchParams` sits inside its own `Suspense`, so it does not force dynamic rendering.
- 🪶 **Tiny.** No dependencies besides Next.js and React.

## Usage

### Google Tag Manager

```tsx
<DeferredTags gtm="GTM-XXXXXXX" />
```

In GTM, create a **Custom Event** trigger for `pageview` and use it for page-view tags. Tags that should run once per load can stay on **Initialization - All Pages**.

### GA4 without Tag Manager

```tsx
<DeferredTags ga4="G-XXXXXXXXXX" />
```

GA4 sends its own `page_view` when it loads and tracks client-side navigation through enhanced measurement (on by default).

### Meta Pixel, LinkedIn Insight and other scripts

```tsx
<DeferredTags
  gtm="GTM-XXXXXXX"
  metaPixel="1234567890"
  linkedin="1234567"
  scripts={[
    'https://example.com/widget.js',
    { src: 'https://plausible.io/js/script.js', attributes: { 'data-domain': 'example.com' } },
  ]}
/>
```

If the Meta Pixel or LinkedIn already run through Tag Manager, pass only `gtm` so they are not loaded twice.

### Events

```tsx
'use client';
import { pushEvent, trackMetaEvent } from 'next-deferred-tags';

export function ContactForm() {
  async function onSubmit() {
    // ...send the form
    pushEvent('enquiry_submitted', { form: 'contact' }); // dataLayer, for GTM or gtag
    trackMetaEvent('Lead');                              // when metaPixel is configured directly
  }
  // ...
}
```

Both work before the tags have loaded. The events wait in the queue.

### Cookie consent

```tsx
<DeferredTags gtm="GTM-XXXXXXX" enabled={hasConsent} />
```

While `enabled` is `false` nothing loads. To load immediately after the visitor accepts:

```ts
import { loadTagsNow } from 'next-deferred-tags';

loadTagsNow();
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `gtm` | `string` | | Tag Manager container id |
| `ga4` | `string` | | GA4 measurement id, for gtag.js without Tag Manager |
| `metaPixel` | `string` | | Meta Pixel id |
| `linkedin` | `string` | | LinkedIn Insight Tag partner id |
| `scripts` | `Array<string \| { src, attributes? }>` | | Extra scripts to load at the same moment |
| `nonce` | `string` | | CSP nonce for every injected script |
| `triggers` | `string[]` | `['pointerdown', 'keydown', 'touchstart', 'scroll']` | Window events that load the tags |
| `delay` | `number \| false` | `5000` | Load this many ms after `window.onload` even without interaction. `false` waits for an interaction only |
| `enabled` | `boolean` | `true` | Set `false` to hold everything back, for example until consent |
| `trackPageViews` | `boolean` | `true` | Push a page-view event on load and on every route change |
| `pageViewEvent` | `string` | `'pageview'` | dataLayer event name for page views |
| `onLoad` | `(reason: string) => void` | | Called once after the scripts are added (`'scroll'`, `'timeout'`, `'manual'`...) |

**Helpers:** `pushEvent`, `trackMetaEvent`, `loadTagsNow`, `tagsLoaded`.
**Building blocks** (framework-free, for your own wrapper): `scheduleOnInteraction`, `installStubs`, `loadTags`, `trackPageView`.

## How it works

1. **On mount** it creates the vendor queues the official snippets create (`dataLayer`, `gtag`, `fbq` with `init`, `lintrk`) but adds no scripts.
2. It pushes a page view for the current URL, and another on every client-side navigation.
3. It listens for the trigger events (passive, capture phase, once) and starts the fallback timer after `window.onload`.
4. On the first trigger it removes the listeners and the timer, then appends the vendor scripts with `async`. Each script reads its queue when it starts.

State lives on `window.__nextDeferredTags`, so a second `<DeferredTags>` or a remount never loads anything twice.

## Trade-offs, honestly

- **Visitors who leave within the delay without interacting are not counted.** Someone who opens a page and closes it after 3 seconds without scrolling sends no hit. For most marketing sites that is a small slice of bounces. If every hit matters, lower `delay`, or also send key conversions server-side (GA4 Measurement Protocol, Meta Conversions API).
- **Lab scores improve partly because Lighthouse never interacts.** Real visitors still get the tags, just after the page has rendered and become usable, which is the point.
- **Tag Manager preview mode works**, but tags appear after your first scroll or click, not instantly.

## Compared with `@next/third-parties`

[`@next/third-parties`](https://www.npmjs.com/package/@next/third-parties) is the official way to add GTM and GA to Next.js and keeps the snippet tidy. It loads the script with `next/script`'s default `afterInteractive` strategy, right after hydration, so the tag cost still lands inside the load window PageSpeed measures. `next-deferred-tags` waits for an interaction or a delay instead, and handles several vendors and route-change page views in one component. If the tags' load cost does not matter for your site, `@next/third-parties` is the simpler choice.

## FAQ

<details>
<summary><b>Is this just gaming Lighthouse?</b></summary>

No. Lighthouse does score better because it never scrolls, but the real benefit is for real visitors: the main thread is free while the page renders, and the tags run once the visitor is already reading. Every page view and event is still recorded for anyone who stays, interacts, or simply waits 5 seconds.
</details>

<details>
<summary><b>Does it work with the Pages Router?</b></summary>

It is built and tested for the App Router (Next.js 13.4+). It uses `next/navigation`, which the Pages Router also supports, but that path is not tested yet. Reports are very welcome.
</details>

<details>
<summary><b>Will my GTM triggers still fire?</b></summary>

Yes. Tag Manager processes the queued dataLayer in order when it loads, including the first `pageview`. Use a Custom Event trigger on `pageview` for page-view tags so client-side navigations are counted too.
</details>

<details>
<summary><b>Can I load the tags earlier for some pages?</b></summary>

Yes: call `loadTagsNow()` wherever you need them immediately, or set a smaller `delay`.
</details>

## Example

[`examples/app-router`](examples/app-router) is a minimal Next.js app with GTM, the Meta Pixel and LinkedIn. This release was tested in Next.js 15.3 with Chrome: no tag requests before interaction, all scripts after the first scroll, the 5-second fallback without interaction, and queued events and client-side page views replayed in order.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

```bash
git clone https://github.com/codevibe-technology/next-deferred-tags.git
cd next-deferred-tags
npm install
npm test        # unit tests for the scheduler and the vendor queues
npm run build
```

## License

[MIT](LICENSE) © [Codevibe Technology](https://codevibe.in?utm_source=github&utm_medium=readme&utm_campaign=next-deferred-tags&utm_content=license)

---

<p align="center">
  <a href="https://codevibe.in?utm_source=github&utm_medium=readme&utm_campaign=next-deferred-tags&utm_content=footer-logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/codevibe-logo-light.png">
      <img src=".github/assets/codevibe-logo-dark.png" alt="Codevibe" height="28">
    </picture>
  </a>
</p>

<p align="center">
  Built and maintained by <a href="https://codevibe.in?utm_source=github&utm_medium=readme&utm_campaign=next-deferred-tags&utm_content=built-by"><b>Codevibe</b></a>, a software development agency in Gurugram, India.<br>
  We build fast web apps, mobile apps and AI products for startups.<br>
  <a href="https://codevibe.in?utm_source=github&utm_medium=readme&utm_campaign=next-deferred-tags&utm_content=footer-links">Website</a> · <a href="https://codevibe.in/case-studies/website-speed-optimization?utm_source=github&utm_medium=readme&utm_campaign=next-deferred-tags&utm_content=footer-case-study">Speed case study</a> · <a href="mailto:hello@codevibe.in">hello@codevibe.in</a>
</p>
