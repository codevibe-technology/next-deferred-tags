'use client';

import { openConsentSettings } from 'next-deferred-tags';

export function CookieSettingsLink() {
  return (
    <button type="button" onClick={openConsentSettings}>
      Cookie settings
    </button>
  );
}
