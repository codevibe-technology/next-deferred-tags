import { DeferredTags } from 'next-deferred-tags';
import { Consent } from './Consent';
import { CookieSettingsLink } from './CookieSettingsLink';

export const metadata = { title: 'next-deferred-tags example' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <footer>
          <CookieSettingsLink />
        </footer>
        {/* Google tags wait in Consent Mode; Meta and LinkedIn wait for marketing consent. */}
        <DeferredTags gtm="GTM-TEST000" metaPixel="1234567890" linkedin="456789" consent="stored" />
        <Consent />
      </body>
    </html>
  );
}
