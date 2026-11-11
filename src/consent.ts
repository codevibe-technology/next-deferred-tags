/**
 * Cookie consent: the visitor's choice, Google Consent Mode v2 signals, and storage.
 *
 * Framework-free so it can be tested without a browser. The React pieces
 * (`<DeferredTags consent>` and `<ConsentBanner>`) build on these functions.
 */

export interface ConsentChoice {
  /** Analytics cookies (GA4 through Tag Manager or gtag.js). */
  analytics: boolean;
  /** Advertising and remarketing (Google Ads, Meta Pixel, LinkedIn Insight, other scripts). */
  marketing: boolean;
}

export type ConsentAction = 'accept_all' | 'reject_all' | 'custom';

export interface StoredConsent extends ConsentChoice {
  /** Random id, kept across changes, so a consent log can link a visitor's choices. */
  id: string;
  /** Your consent version. Bump it to ask everyone again. */
  version: string;
  /** When the choice was made (ms since epoch). */
  ts: number;
}

export const CONSENT_COOKIE = 'ndt_consent';
export const CONSENT_EVENT = 'next-deferred-tags:consent';
export const OPEN_SETTINGS_EVENT = 'next-deferred-tags:open-consent';
const MAX_AGE_DAYS = 365;

/** Everything optional is off. Used until the visitor decides. */
export const DENIED: ConsentChoice = { analytics: false, marketing: false };

/** Google Consent Mode v2 signals for a choice. */
export function consentModeSignals(c: ConsentChoice | null | undefined): Record<string, 'granted' | 'denied'> {
  const ad = c?.marketing ? 'granted' : 'denied';
  return {
    analytics_storage: c?.analytics ? 'granted' : 'denied',
    ad_storage: ad,
    ad_user_data: ad,
    ad_personalization: ad,
  };
}

type CookieDoc = { cookie: string };

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Read the stored choice. Returns null when there is none, it is too old, or the version changed. */
export function readConsent(doc: CookieDoc | undefined = typeof document === 'undefined' ? undefined : document, version = '1'): StoredConsent | null {
  if (!doc) return null;
  const raw = doc.cookie.split('; ').find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  if (!raw) return null;
  try {
    const c = JSON.parse(decodeURIComponent(raw.slice(CONSENT_COOKIE.length + 1))) as StoredConsent;
    if (c.version !== version) return null;
    if (!c.ts || Date.now() - c.ts > MAX_AGE_DAYS * 864e5) return null;
    return { id: String(c.id), version: c.version, ts: c.ts, analytics: !!c.analytics, marketing: !!c.marketing };
  } catch {
    return null;
  }
}

/** Save a choice in a first-party cookie and return the stored record. */
export function writeConsent(
  choice: ConsentChoice,
  opts: { doc?: CookieDoc; version?: string; secure?: boolean } = {},
): StoredConsent {
  const doc = opts.doc ?? (typeof document === 'undefined' ? undefined : document);
  const version = opts.version ?? '1';
  const prev = readConsent(doc, version);
  const stored: StoredConsent = { id: prev?.id ?? newId(), version, ts: Date.now(), analytics: !!choice.analytics, marketing: !!choice.marketing };
  if (doc) {
    const secure = opts.secure ?? (typeof location !== 'undefined' && location.protocol === 'https:');
    doc.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(stored))}; Max-Age=${MAX_AGE_DAYS * 86400}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
  }
  return stored;
}

/** AI assistants that send visitors, keyed by referrer host or utm_source value. */
export const AI_ASSISTANTS: Record<string, string> = {
  'chatgpt.com': 'ChatGPT',
  'chat.openai.com': 'ChatGPT',
  'perplexity.ai': 'Perplexity',
  'www.perplexity.ai': 'Perplexity',
  'claude.ai': 'Claude',
  'gemini.google.com': 'Gemini',
  'copilot.microsoft.com': 'Copilot',
  'chat.deepseek.com': 'DeepSeek',
  'meta.ai': 'Meta AI',
  'www.meta.ai': 'Meta AI',
  'chat.mistral.ai': 'Mistral',
  'grok.com': 'Grok',
  'you.com': 'You.com',
};

/**
 * Recognise a visit sent by an AI assistant, from the referrer or from the
 * `utm_source` some assistants add to links (ChatGPT adds `utm_source=chatgpt.com`).
 */
export function detectAiReferral(referrer: string, url: string): { assistant: string; source: string } | null {
  try {
    const host = referrer ? new URL(referrer).hostname.toLowerCase() : '';
    if (host && AI_ASSISTANTS[host]) return { assistant: AI_ASSISTANTS[host], source: host };
  } catch {
    // not a URL
  }
  try {
    const utm = new URL(url).searchParams.get('utm_source')?.toLowerCase() ?? '';
    if (utm && AI_ASSISTANTS[utm]) return { assistant: AI_ASSISTANTS[utm], source: utm };
  } catch {
    // not a URL
  }
  return null;
}
