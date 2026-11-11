import { DeferredTags } from 'next-deferred-tags';

export const metadata = { title: 'next-deferred-tags example' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <DeferredTags gtm="GTM-TEST000" metaPixel="1234567890" linkedin="456789" />
      </body>
    </html>
  );
}
