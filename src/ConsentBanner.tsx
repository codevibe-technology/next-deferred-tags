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
}

export const DEFAULT_CONSENT_TEXT: ConsentBannerText = {
  title: 'Your privacy choices',
  body: 'We use cookies to understand how this site is used and to measure our ads. Necessary cookies keep the site working and are always on. You can change your choice at any time.',
  policy: 'Privacy policy',
  acceptAll: 'Accept all',
  rejectAll: 'Reject all',
  choose: 'Choose',
  save: 'Save choices',
  necessary: 'Necessary',
  necessaryDescription: 'Remembers this choice and keeps the site secure. Always on.',
  analytics: 'Analytics',
  analyticsDescription: 'Which pages are visited and how people find the site.',
  marketing: 'Marketing',
  marketingDescription: 'Whether ads lead to enquiries, and showing ads to past visitors.',
  alwaysOn: 'On',
};

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
  /** Drop the built-in styles and style the `ndt-consent*` class names yourself. */
  unstyled?: boolean;
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
            <span style={st({ color: 'var(--ndt-muted)', fontSize: 12 })}>{t.alwaysOn}</span>
          </li>
          {categories.map((k) => (
            <li key={k} className="ndt-consent-row" style={st({ display: 'flex', justifyContent: 'space-between', gap: 16 })}>
              <span>
                <strong style={st({ display: 'block' })}>{k === 'analytics' ? t.analytics : t.marketing}</strong>
                <span style={st({ color: 'var(--ndt-muted)', fontSize: 13 })}>{k === 'analytics' ? t.analyticsDescription : t.marketingDescription}</span>
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
          ))}
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
    </div>
  );
}

export default ConsentBanner;
