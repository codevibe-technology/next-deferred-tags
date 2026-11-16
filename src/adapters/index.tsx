'use client';

/**
 * Use another consent tool with next-deferred-tags. Each `connect*` function listens to
 * the tool's own events and passes the visitor's choice to `setConsent()`, so
 * `<DeferredTags consent="stored">` follows it. Returns a function that stops listening.
 *
 * ```tsx
 * import { ConsentBridge } from 'next-deferred-tags/adapters';
 * <DeferredTags gtm="GTM-XXXX" consent="stored" />
 * <ConsentBridge source="cookiebot" />
 * ```
 */
import { useEffect } from 'react';
import type { ConsentChoice } from '../consent.js';
import { getConsent, setConsent } from '../events.js';
import { cookiebotChoice, oneTrustChoice, tcfChoice, type TcData } from './map.js';

export { cookiebotChoice, oneTrustChoice, tcfChoice, type TcData } from './map.js';

type Opts = { version?: string };

function apply(choice: ConsentChoice | null, opts: Opts) {
  if (!choice) return;
  const now = getConsent(opts);
  if (now && now.analytics === choice.analytics && now.marketing === choice.marketing) return;
  setConsent(choice, opts);
}

type W = Window & {
  Cookiebot?: { consent?: { statistics?: boolean; marketing?: boolean }; hasResponse?: boolean };
  OnetrustActiveGroups?: string;
  __tcfapi?: (cmd: string, version: number, cb: (tc: TcData & { listenerId?: number }, ok: boolean) => void, param?: unknown) => void;
};

/** Cookiebot: follows CookiebotOnConsentReady / OnAccept / OnDecline. */
export function connectCookiebot(opts: Opts = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as W;
  const read = () => {
    if (w.Cookiebot?.hasResponse) apply(cookiebotChoice(w.Cookiebot.consent), opts);
  };
  const events = ['CookiebotOnConsentReady', 'CookiebotOnAccept', 'CookiebotOnDecline'];
  for (const e of events) window.addEventListener(e, read);
  read();
  return () => {
    for (const e of events) window.removeEventListener(e, read);
  };
}

/** OneTrust: follows the OneTrustGroupsUpdated event. Pass your category ids if they differ from C0002 / C0004. */
export function connectOneTrust(opts: Opts & { groups?: { analytics?: string[]; marketing?: string[] } } = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as W;
  const read = () => {
    // OneTrust sets the active groups before the visitor decides too (necessary only);
    // treat that as "not decided" unless its consent cookie records a choice.
    const decided = document.cookie.includes('OptanonAlertBoxClosed=');
    if (decided) apply(oneTrustChoice(w.OnetrustActiveGroups, opts.groups), opts);
  };
  window.addEventListener('OneTrustGroupsUpdated', read);
  read();
  return () => window.removeEventListener('OneTrustGroupsUpdated', read);
}

/** Any IAB TCF v2 consent tool, including Google's own consent banner. */
export function connectTcf(opts: Opts = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as W;
  let listenerId: number | undefined;
  let stopped = false;
  let tries = 0;
  const start = () => {
    if (stopped) return;
    if (!w.__tcfapi) {
      // The consent tool may load after us: retry for up to 10 seconds.
      if (tries++ < 20) setTimeout(start, 500);
      return;
    }
    w.__tcfapi('addEventListener', 2, (tc, ok) => {
      if (!ok) return;
      listenerId = tc.listenerId;
      apply(tcfChoice(tc), opts);
    });
  };
  start();
  return () => {
    stopped = true;
    if (w.__tcfapi && listenerId !== undefined) w.__tcfapi('removeEventListener', 2, () => {}, listenerId);
  };
}

const CONNECT = { cookiebot: connectCookiebot, onetrust: connectOneTrust, tcf: connectTcf } as const;

export interface ConsentBridgeProps extends Opts {
  /** Which consent tool to follow. */
  source: keyof typeof CONNECT;
  /** OneTrust only: your category ids. */
  groups?: { analytics?: string[]; marketing?: string[] };
}

/** Follow another consent tool's choices. Put it next to `<DeferredTags consent="stored">`. */
export function ConsentBridge({ source, version, groups }: ConsentBridgeProps) {
  const gKey = JSON.stringify(groups ?? {});
  useEffect(() => {
    if (source === 'onetrust') return connectOneTrust({ version, groups });
    return CONNECT[source]({ version });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, gKey]);
  return null;
}

export default ConsentBridge;
