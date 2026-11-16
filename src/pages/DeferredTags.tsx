'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/router.js';
import { DeferredTagsCore, type DeferredTagsProps, type RouteTrackerProps } from '../core.js';
import { routeUrl } from './route.js';


function PagesRouterTracker({ onRoute }: RouteTrackerProps) {
  const router = useRouter();
  const ready = router.isReady;

  // First page view once the router knows the real URL (dynamic routes start as the pattern).
  useEffect(() => {
    if (ready) onRoute(window.location.pathname + window.location.search);
  }, [ready, onRoute]);

  // Client-side navigations. Hash-only changes fire hashChangeComplete instead, so they
  // are not counted.
  useEffect(() => {
    const onChange = (url: string) => onRoute(routeUrl(url));
    router.events.on('routeChangeComplete', onChange);
    return () => router.events.off('routeChangeComplete', onChange);
  }, [router.events, onRoute]);

  return null;
}

/**
 * Pages Router version of `<DeferredTags>`. Put it once in `pages/_app.tsx`:
 *
 * ```tsx
 * import { DeferredTags } from 'next-deferred-tags/pages';
 *
 * export default function App({ Component, pageProps }: AppProps) {
 *   return (
 *     <>
 *       <Component {...pageProps} />
 *       <DeferredTags gtm="GTM-XXXXXXX" />
 *     </>
 *   );
 * }
 * ```
 */
export function DeferredTags(props: DeferredTagsProps) {
  return <DeferredTagsCore {...props} RouteTracker={PagesRouterTracker} />;
}

export default DeferredTags;
