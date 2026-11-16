import type { AppProps } from 'next/app';
import { ConsentBanner, DeferredTags } from 'next-deferred-tags/pages';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      {/* Placeholder ids: replace them with your own. */}
      <DeferredTags gtm="GTM-XXXXXXX" metaPixel="000000000000000" consent="stored" />
      <ConsentBanner privacyHref="/privacy" />
    </>
  );
}
