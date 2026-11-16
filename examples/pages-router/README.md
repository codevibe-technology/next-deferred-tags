# Example: next-deferred-tags with the Pages Router

```bash
npm install
npm run build && npm start
```

`pages/_app.tsx` imports from `next-deferred-tags/pages`. Everything else works as in the App Router example: nothing loads until you scroll or click, or until 5 seconds after the page has loaded, and the page views for `/` and the client-side visit to `/about` wait in `window.dataLayer` until Tag Manager arrives.

The ids in `pages/_app.tsx` are placeholders. Replace them with your own.
