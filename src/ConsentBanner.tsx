'use client';

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { OPEN_SETTINGS_EVENT, readConsent, type ConsentAction, type ConsentChoice, type StoredConsent } from './consent.js';
import { setConsent } from './events.js';

export interface ConsentBannerText {
  title: string;
  body: ReactNode;
  policy: string;
  acceptAll: string;
  rejectAll: string;
  choose: string;
  save: string;
  necessary: string;
  necessaryDescription: string;
  analytics: string;
  analyticsDescription: string;
  marketing: string;
  marketingDescription: string;
  alwaysOn: string;
  /** Words before "Codevibe" in the settings view credit line. */
  poweredBy: string;
  /** Label before the list of tools in each category, e.g. "Used by". */
  usedBy: string;
}

export const DEFAULT_CONSENT_TEXT: ConsentBannerText = {
  title: 'Help us make this site better',
  body: 'Some cookies keep this site working. With your OK, we also use cookies to see which pages help people and which confuse them, and to show you ads that fit what you were looking at instead of random ones. You choose, and you can change it any time.',
  policy: 'Privacy policy',
  acceptAll: 'Accept all',
  rejectAll: 'Reject all',
  choose: 'Choose',
  save: 'Save choices',
  necessary: 'Essential',
  necessaryDescription: 'Keeps the site secure and remembers this choice.',
  analytics: 'Site improvement',
  analyticsDescription: 'Counts visits and shows which pages people use and where they get stuck, so we can fix what is confusing and keep the site fast.',
  marketing: 'Relevant ads',
  marketingDescription: 'Shows you ads that fit what you looked at here instead of random ones, and tells us which ads brought you here, so we stop paying for ads nobody wants.',
  alwaysOn: 'Always on',
  poweredBy: 'Powered by',
  usedBy: 'Used by',
};

/** Hindi texts. Pass as `text={CONSENT_TEXT_HI}`. */
export const CONSENT_TEXT_HI: ConsentBannerText = {
  title: 'इस साइट को बेहतर बनाने में हमारी मदद करें',
  body: 'कुछ कुकीज़ इस साइट को चलाने के लिए ज़रूरी हैं। आपकी अनुमति से हम कुकीज़ का इस्तेमाल यह समझने के लिए भी करते हैं कि कौन से पेज काम के हैं और कहाँ लोग अटकते हैं, और आपको वही विज्ञापन दिखाने के लिए जो आपकी पसंद से मेल खाते हैं। फ़ैसला आपका है, और आप इसे कभी भी बदल सकते हैं।',
  policy: 'गोपनीयता नीति',
  acceptAll: 'सभी स्वीकार करें',
  rejectAll: 'सभी अस्वीकार करें',
  choose: 'चुनें',
  save: 'चुनाव सेव करें',
  necessary: 'ज़रूरी',
  necessaryDescription: 'साइट को सुरक्षित रखती हैं और आपका यह चुनाव याद रखती हैं।',
  analytics: 'साइट सुधार',
  analyticsDescription: 'विज़िट गिनती हैं और दिखाती हैं कि लोग कौन से पेज इस्तेमाल करते हैं और कहाँ अटकते हैं, ताकि हम उलझन वाली चीज़ें ठीक कर सकें और साइट तेज़ रख सकें।',
  marketing: 'आपके काम के विज्ञापन',
  marketingDescription: 'बेतरतीब विज्ञापनों की जगह वे विज्ञापन दिखाती हैं जो आपकी पसंद से मेल खाते हैं, और बताती हैं कि आप किस विज्ञापन से यहाँ आए।',
  alwaysOn: 'हमेशा चालू',
  poweredBy: 'Powered by',
  usedBy: 'इस्तेमाल करने वाले',
};

/** Which configured tools each category covers, read from <DeferredTags>, for the settings view. */
function toolsByCategory(): Record<'analytics' | 'marketing', string[]> {
  const out = { analytics: [] as string[], marketing: [] as string[] };
  if (typeof window === 'undefined') return out;
  const c = (window as unknown as { __nextDeferredTags?: { config?: Record<string, unknown> } }).__nextDeferredTags?.config;
  if (!c) return out;
  if (c.gtm) {
    out.analytics.push('Google');
    out.marketing.push('Google');
  }
  if (c.ga4 && !c.gtm) out.analytics.push('Google Analytics');
  if (c.clarity) out.analytics.push('Microsoft Clarity');
  if (c.hotjar) out.analytics.push('Hotjar');
  if (c.metaPixel) out.marketing.push('Meta');
  if (c.linkedin) out.marketing.push('LinkedIn');
  if (c.tiktok) out.marketing.push('TikTok');
  if (c.uet) out.marketing.push('Microsoft Advertising');
  return out;
}

/** Where the settings view credit links to. */
export const POWERED_BY_URL =
  'https://codevibe.in/tools/next-deferred-tags?utm_source=next-deferred-tags&utm_medium=consent-banner&utm_campaign=powered-by';

export interface ConsentBannerProps {
  /** Link to your privacy or cookie policy. */
  privacyHref?: string;
  /** Replace any of the texts (for another language, pass a full set). */
  text?: Partial<ConsentBannerText>;
  /** Which optional categories to offer. Default both. */
  categories?: Array<keyof ConsentChoice>;
  /** Bump to ask everyone again (pass the same value to `<DeferredTags consentVersion>`). Default `'1'`. */
  version?: string;
  /**
   * Called after every choice, with the stored record (random id, version, timestamp,
   * choices) and how it was made. Send it to your server to keep a consent log.
   */
  onChoice?: (consent: StoredConsent, action: ConsentAction) => void;
  /** `'dark'` (default) or `'light'`. Colours can also be set with the CSS variables below. */
  theme?: 'dark' | 'light';
  /** `'bottom-left'` (default), `'bottom-right'` or `'bottom'` (full width). */
  position?: 'bottom-left' | 'bottom-right' | 'bottom';
  /**
   * In the settings view, name the tools each category turns on (read from
   * `<DeferredTags>`, e.g. "Used by: Google Analytics, Microsoft Clarity"). Default `true`.
   */
  showTools?: boolean;
  /** Drop the built-in styles and style the `ndt-consent*` class names yourself. */
  unstyled?: boolean;
  /**
   * Show a small "Powered by Codevibe" link at the bottom of the settings view (the one
   * with the category switches). It never appears in the first view. Default `true`;
   * `false` removes it completely.
   */
  poweredBy?: boolean;
  className?: string;
}

const THEMES = {
  dark: { '--ndt-bg': '#111827', '--ndt-fg': '#f9fafb', '--ndt-muted': 'rgba(249,250,251,.72)', '--ndt-border': 'rgba(255,255,255,.14)', '--ndt-accent': '#2563eb', '--ndt-button': 'rgba(255,255,255,.06)' },
  light: { '--ndt-bg': '#ffffff', '--ndt-fg': '#111827', '--ndt-muted': '#4b5563', '--ndt-border': '#d1d5db', '--ndt-accent': '#2563eb', '--ndt-button': '#f9fafb' },
} as const;

/**
 * A small, accessible cookie banner that works with `<DeferredTags consent="stored">`.
 * "Reject all" and "Accept all" carry equal weight, "Choose" offers per-category
 * switches, and `openConsentSettings()` opens it again so visitors can change their mind.
 *
 * ```tsx
 * <DeferredTags gtm="GTM-XXXX" linkedin="123" consent="stored" />
 * <ConsentBanner privacyHref="/privacy" onChoice={(c, action) => fetch('/api/consent', { method: 'POST', body: JSON.stringify({ ...c, action }) })} />
 * ```
 */
export function ConsentBanner({
  privacyHref,
  text,
  categories = ['analytics', 'marketing'],
  version = '1',
  onChoice,
  theme = 'dark',
  position = 'bottom-left',
  unstyled = false,
  poweredBy = true,
  showTools = true,
  className,
}: ConsentBannerProps) {
  const t = { ...DEFAULT_CONSENT_TEXT, ...text };
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(false);
  const [choice, setChoice] = useState<ConsentChoice>({ analytics: false, marketing: false });
  const titleId = useId();

  useEffect(() => {
    if (!readConsent(document, version)) setOpen(true);
    const reopen = () => {
      const c = readConsent(document, version);
      setChoice({ analytics: !!c?.analytics, marketing: !!c?.marketing });
      setDetail(true);
      setOpen(true);
    };
    window.addEventListener(OPEN_SETTINGS_EVENT, reopen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, reopen);
  }, [version]);

  if (!open) return null;

  const decide = (c: ConsentChoice, action: ConsentAction) => {
    const stored = setConsent(c, { version });
    setOpen(false);
    setDetail(false);
    if (stored) onChoice?.(stored, action);
  };
  const all = (v: boolean): ConsentChoice => ({ analytics: v && categories.includes('analytics'), marketing: v && categories.includes('marketing') });

  const st = (s: CSSProperties): CSSProperties | undefined => (unstyled ? undefined : s);
  const button: CSSProperties = {
    flex: '1 1 120px',
    font: 'inherit',
    fontWeight: 600,
    fontSize: 14,
    color: 'var(--ndt-fg)',
    background: 'var(--ndt-button)',
    border: '1px solid var(--ndt-border)',
    borderRadius: 6,
    padding: '10px 14px',
    cursor: 'pointer',
  };
  const box: CSSProperties = {
    ...(THEMES[theme] as unknown as CSSProperties),
    position: 'fixed',
    zIndex: 2147483000,
    bottom: 16,
    ...(position === 'bottom' ? { left: 16, right: 16 } : position === 'bottom-right' ? { right: 16 } : { left: 16 }),
    width: position === 'bottom' ? 'auto' : 'min(420px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 32px)',
    overflowY: 'auto',
    background: 'var(--ndt-bg)',
    color: 'var(--ndt-fg)',
    border: '1px solid var(--ndt-border)',
    borderRadius: 10,
    boxShadow: '0 18px 48px rgba(0,0,0,.28)',
    padding: 20,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    fontSize: 14,
    lineHeight: 1.55,
  };

  return (
    <div role="dialog" aria-modal="false" aria-labelledby={titleId} className={['ndt-consent', className].filter(Boolean).join(' ')} style={st(box)}>
      <p id={titleId} className="ndt-consent-title" style={st({ margin: '0 0 8px', fontWeight: 700, fontSize: 16 })}>
        {t.title}
      </p>
      {!detail ? (
        <p className="ndt-consent-body" style={st({ margin: '0 0 16px', color: 'var(--ndt-muted)' })}>
          {t.body}{' '}
          {privacyHref && (
            <a href={privacyHref} style={st({ color: 'inherit', textDecoration: 'underline' })}>
              {t.policy}
            </a>
          )}
        </p>
      ) : (
        <ul className="ndt-consent-list" style={st({ listStyle: 'none', margin: '4px 0 16px', padding: 0, display: 'grid', gap: 12 })}>
          <li className="ndt-consent-row" style={st({ display: 'flex', justifyContent: 'space-between', gap: 16 })}>
            <span>
              <strong style={st({ display: 'block' })}>{t.necessary}</strong>
              <span style={st({ color: 'var(--ndt-muted)', fontSize: 13 })}>{t.necessaryDescription}</span>
            </span>
            <span style={st({ flex: 'none', whiteSpace: 'nowrap', color: 'var(--ndt-muted)', fontSize: 12 })}>{t.alwaysOn}</span>
          </li>
          {categories.map((k) => {
            const tools = showTools ? toolsByCategory()[k] : [];
            return (
            <li key={k} className="ndt-consent-row" style={st({ display: 'flex', justifyContent: 'space-between', gap: 16 })}>
              <span>
                <strong style={st({ display: 'block' })}>{k === 'analytics' ? t.analytics : t.marketing}</strong>
                <span style={st({ display: 'block', color: 'var(--ndt-muted)', fontSize: 13 })}>{k === 'analytics' ? t.analyticsDescription : t.marketingDescription}</span>
                {tools.length > 0 && (
                  <span className="ndt-consent-tools" style={st({ display: 'block', color: 'var(--ndt-muted)', fontSize: 12, marginTop: 2, opacity: 0.85 })}>
                    {t.usedBy}: {tools.join(', ')}
                  </span>
                )}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={choice[k]}
                aria-label={k === 'analytics' ? t.analytics : t.marketing}
                className="ndt-consent-switch"
                onClick={() => setChoice((c) => ({ ...c, [k]: !c[k] }))}
                style={st({
                  flex: 'none',
                  width: 40,
                  height: 22,
                  borderRadius: 11,
                  border: 'none',
                  padding: 0,
                  position: 'relative',
                  cursor: 'pointer',
                  background: choice[k] ? 'var(--ndt-accent)' : 'var(--ndt-border)',
                })}
              >
                <span
                  aria-hidden="true"
                  style={st({
                    position: 'absolute',
                    top: 3,
                    left: choice[k] ? 21 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: '#fff',
                    transition: 'left .2s',
                  })}
                />
              </button>
            </li>
            );
          })}
        </ul>
      )}
      <div className="ndt-consent-actions" style={st({ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' })}>
        <button type="button" className="ndt-consent-reject" style={st(button)} onClick={() => decide(all(false), 'reject_all')}>
          {t.rejectAll}
        </button>
        <button type="button" className="ndt-consent-accept" style={st(button)} onClick={() => decide(all(true), 'accept_all')}>
          {t.acceptAll}
        </button>
        {detail ? (
          <button
            type="button"
            className="ndt-consent-save"
            style={st({ ...button, flexBasis: '100%', background: 'var(--ndt-accent)', borderColor: 'var(--ndt-accent)', color: '#fff' })}
            onClick={() => decide(choice, 'custom')}
          >
            {t.save}
          </button>
        ) : (
          <button
            type="button"
            className="ndt-consent-choose"
            style={st({ font: 'inherit', fontSize: 13.5, color: 'var(--ndt-muted)', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: '8px 4px' })}
            onClick={() => setDetail(true)}
          >
            {t.choose}
          </button>
        )}
      </div>
      {detail && poweredBy && (
        <p className="ndt-powered-by" style={st({ margin: '12px 0 0', fontSize: 11.5, color: 'var(--ndt-muted)', textAlign: 'center' })}>
          {t.poweredBy}{' '}
          <a href={POWERED_BY_URL} target="_blank" rel="noopener" style={st({ color: 'inherit', textDecoration: 'underline' })}>
            Codevibe
          </a>
        </p>
      )}
    </div>
  );
}

export default ConsentBanner;
