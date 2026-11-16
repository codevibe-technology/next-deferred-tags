/**
 * Region rules: ask for consent only where the law requires it, and only when the
 * visitor's country is known. An unknown country always means "ask".
 *
 * The package cannot look up a visitor's country itself. Your host can: pass the
 * country from its header as the `country` prop, or set the `ndt_country` cookie in
 * middleware (keeps pages static). See the README.
 */

/** EU and EEA member states, plus the UK, Switzerland and India. */
export const CONSENT_REGIONS: readonly string[] = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO',
  'GB', 'CH',
  'IN',
];

export const COUNTRY_COOKIE = 'ndt_country';

/** Headers hosts and CDNs set with the visitor's country (ISO 3166-1 alpha-2). */
export const COUNTRY_HEADERS: readonly string[] = ['x-vercel-ip-country', 'cf-ipcountry', 'cloudfront-viewer-country', 'x-country-code', 'x-geo-country'];

const normalise = (c: string | null | undefined): string | undefined => {
  const v = (c ?? '').trim().toUpperCase();
  // Cloudflare uses XX (unknown) and T1 (Tor).
  return /^[A-Z]{2}$/.test(v) && v !== 'XX' && v !== 'T1' ? v : undefined;
};

/**
 * Whether consent must be asked for this visitor. True when the country is unknown,
 * or in `regions` (default `CONSENT_REGIONS`). `regions: 'all'` asks everyone.
 */
export function consentRequired(country: string | null | undefined, regions: readonly string[] | 'all' = CONSENT_REGIONS): boolean {
  if (regions === 'all') return true;
  const c = normalise(country);
  if (!c) return true;
  return regions.includes(c);
}

/** The visitor's country from request headers (Vercel, Cloudflare, CloudFront and others). */
export function countryFromHeaders(headers: { get(name: string): string | null }): string | undefined {
  for (const h of COUNTRY_HEADERS) {
    const c = normalise(headers.get(h));
    if (c) return c;
  }
  return undefined;
}

/** The country set in the `ndt_country` cookie by your middleware, if any. */
export function readCountry(doc: { cookie: string } | undefined = typeof document === 'undefined' ? undefined : document): string | undefined {
  if (!doc) return undefined;
  const raw = doc.cookie.split('; ').find((c) => c.startsWith(`${COUNTRY_COOKIE}=`));
  return raw ? normalise(decodeURIComponent(raw.slice(COUNTRY_COOKIE.length + 1))) : undefined;
}
