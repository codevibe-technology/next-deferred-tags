# Example: next-deferred-tags with the App Router

```bash
npm install
npm run build && npm start
```

Open the page with DevTools' Network tab filtered to `googletagmanager|facebook|licdn`. Nothing loads until you scroll or click, or until 5 seconds after the page has loaded. Then check `window.dataLayer` and `window.fbq.queue` in the console: the first page view, the sign-up event and the client-side page view for `/about` are all there, in order.

The ids in `app/layout.tsx` are placeholders. Replace them with your own.
