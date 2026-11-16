'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { DeferredTagsCore, type DeferredTagsProps, type RouteTrackerProps } from './core.js';

export type { ConsentSetting, DeferredTagsProps } from './core.js';

function AppRouterTracker({ onRoute }: RouteTrackerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams?.toString() ?? '';

  useEffect(() => {
    onRoute((pathname ?? window.location.pathname) + (query ? `?${query}` : ''));
  }, [pathname, query, onRoute]);

  return null;
}

function SuspendedTracker(props: RouteTrackerProps) {
  return (
    <Suspense fallback={null}>
      <AppRouterTracker {...props} />
    </Suspense>
  );
}

/**
 * Loads Google Tag Manager, GA4, the Meta Pixel, the LinkedIn Insight Tag and any other
 * scripts on the visitor's first interaction or a few seconds after the page loads,
 * whichever comes first. Events and page views are queued until then, so nothing is lost.
 *
 * App Router: put it once in your root layout. (Pages Router: import from
 * `next-deferred-tags/pages` and put it in `pages/_app.tsx`.)
 *
 * ```tsx
 * <DeferredTags gtm="GTM-XXXXXXX" linkedin="1234567" />
 * ```
 */
export function DeferredTags(props: DeferredTagsProps) {
  return <DeferredTagsCore {...props} RouteTracker={SuspendedTracker} />;
}

export default DeferredTags;
