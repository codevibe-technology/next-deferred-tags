'use client';

import { ConsentBanner } from 'next-deferred-tags';

// onChoice is a function, so the banner is wrapped in a client component.
export function Consent() {
  return (
    <ConsentBanner
      privacyHref="/about"
      onChoice={(consent, action) => {
        // Keep a consent log on your server, e.g.:
        // navigator.sendBeacon('/api/consent', JSON.stringify({ ...consent, action }));
        console.log('consent', action, consent);
      }}
    />
  );
}
