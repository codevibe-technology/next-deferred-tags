'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CONSENT_EVENT, readConsent, type ConsentChoice, type StoredConsent } from './consent.js';
import { setConsent } from './events.js';
import { CONSENT_REGIONS, consentRequired, readCountry } from './region.js';

export interface ConsentGateProps {
  /** Which consent the content needs. YouTube, Vimeo, Maps and social embeds: `'marketing'`. */
  category: keyof ConsentChoice;
  /** The embed (iframe, video player, map). Rendered only once the visitor allows the category. */
  children: ReactNode;
  /** What to show instead. Default: a short note and a button that allows the category. */
  placeholder?: ReactNode;
  /** Text of the default placeholder. */
  text?: { message?: string; button?: string };
  /** Same values as `<DeferredTags>` / `<ConsentBanner>`. */
  version?: string;
  country?: string;
  consentRegions?: readonly string[] | 'all';
  className?: string;
}

/**
 * Hold back an embed that sets cookies (YouTube, Vimeo, Google Maps, social posts) until the
 * visitor allows its category. Outside the consent regions it renders straight away.
 *
 * ```tsx
 * <ConsentGate category="marketing">
 *   <iframe src="https://www.youtube-nocookie.com/embed/..." title="Product tour" />
 * </ConsentGate>
 * ```
 */
export function ConsentGate({ category, children, placeholder, text, version = '1', country, consentRegions = CONSENT_REGIONS, className }: ConsentGateProps) {
  // Unknown on the server and the first render: show the placeholder, never the embed.
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const check = (stored?: StoredConsent | null) => {
      const c = stored ?? readConsent(document, version);
      if (c) setAllowed(!!c[category]);
      else setAllowed(!consentRequired(country ?? readCountry(document), consentRegions));
    };
    check();
    const onChange = (e: Event) => check((e as CustomEvent<StoredConsent>).detail);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, version, country]);

  if (allowed) return <>{children}</>;
  if (placeholder !== undefined) return <>{placeholder}</>;

  const allow = () => {
    const now = readConsent(document, version);
    setConsent({ analytics: !!now?.analytics, marketing: !!now?.marketing, [category]: true }, { version });
  };
  const label = category === 'marketing' ? 'advertising' : 'functional';
  return (
    <div
      className={['ndt-consent-gate', className].filter(Boolean).join(' ')}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20, minHeight: 160, textAlign: 'center', fontSize: 14, background: 'rgba(127,127,127,.12)', borderRadius: 8 }}
    >
      <p style={{ margin: 0 }}>{text?.message ?? `This content sets ${label} cookies. Allow them to view it here.`}</p>
      <button type="button" onClick={allow} style={{ font: 'inherit', fontWeight: 600, padding: '8px 14px', borderRadius: 6, border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
        {text?.button ?? 'Allow and show'}
      </button>
    </div>
  );
}

export default ConsentGate;
