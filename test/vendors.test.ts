import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initConsent, installStubs, loadTags, trackPageView, updateConsent, type DocLike, type TagWindow } from '../src/tags.js';

type El = { async: boolean; src: string; nonce?: string; onload?: (() => void) | null; setAttribute(k: string, v: string): void };

function fakeDoc() {
  const added: El[] = [];
  const doc: DocLike = {
    createElement: () => ({ async: false, src: '', setAttribute() {} }),
    head: { appendChild: (n: unknown) => (added.push(n as El), n) },
  };
  return { doc, added };
}

const IDS = { clarity: 'clar123', uet: '987654', tiktok: 'CTIK123', hotjar: 4242 };
const call = (w: TagWindow, k: 'ttq') => w[k] as unknown as Record<string, (...a: unknown[]) => void>;
const queued = (q: unknown) => Array.from(q as ArrayLike<unknown>, (x) => Array.from(x as ArrayLike<unknown>));

test('without consent handling all four load on the trigger, with their snippet URLs', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  installStubs(w, IDS);
  trackPageView(w, '/');
  assert.equal(added.length, 0);
  assert.equal(loadTags(w, doc), true);
  assert.deepEqual(added.map((s) => s.src), [
    'https://www.clarity.ms/tag/clar123',
    'https://bat.bing.com/bat.js',
    'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=CTIK123&lib=ttq',
    'https://static.hotjar.com/c/hotjar-4242.js?sv=6',
  ]);
  // TikTok page view queued before load; nothing consent-related pushed.
  assert.deepEqual((w.ttq as unknown[]).filter((x) => Array.isArray(x)), [['page']]);
  assert.deepEqual(w._hjSettings, { hjid: 4242, hjsv: 6 });
  assert.deepEqual(w.uetq, []);
});

test('UET gets its queue and a pageLoad once bat.js has loaded', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  installStubs(w, { uet: '987654' });
  (w.uetq as unknown[]).push('event', 'early', {});
  loadTags(w, doc);
  const made: Array<Record<string, unknown>> = [];
  w.UET = class {
    pushed: unknown[] = [];
    constructor(o: Record<string, unknown>) {
      made.push(o);
    }
    push(...a: unknown[]) {
      this.pushed.push(a);
    }
  } as unknown as TagWindow['UET'];
  added[0].onload!();
  assert.equal(made[0].ti, '987654');
  assert.equal(made[0].enableAutoSpaTracking, true);
  assert.deepEqual(made[0].q, ['event', 'early', {}]);
  assert.deepEqual((w.uetq as unknown as { pushed: unknown[] }).pushed, [['pageLoad']]);
});

test('advanced consent: Clarity and UET load with storage denied, TikTok and Hotjar wait', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  initConsent(w, null);
  installStubs(w, IDS);
  trackPageView(w, '/');
  loadTags(w, doc);
  assert.deepEqual(added.map((s) => s.src), ['https://www.clarity.ms/tag/clar123', 'https://bat.bing.com/bat.js']);
  assert.deepEqual(queued(w.clarity!.q), [['consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' }]]);
  assert.deepEqual(w.uetq, ['consent', 'default', { ad_storage: 'denied' }]);
  // TikTok is held and records no page view without marketing consent.
  assert.deepEqual((w.ttq as unknown[]).filter((x) => Array.isArray(x)), [['holdConsent']]);
});

test('basic consent keeps Clarity and UET out too', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  initConsent(w, null, 'basic');
  installStubs(w, IDS);
  loadTags(w, doc);
  assert.equal(added.length, 0);
});

test('accepting loads TikTok and Hotjar and tells every vendor', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  initConsent(w, null);
  installStubs(w, IDS);
  trackPageView(w, '/pricing');
  loadTags(w, doc);
  updateConsent(w, doc, { analytics: true, marketing: true });
  assert.deepEqual(added.map((s) => s.src).slice(2), [
    'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=CTIK123&lib=ttq',
    'https://static.hotjar.com/c/hotjar-4242.js?sv=6',
  ]);
  assert.deepEqual(queued(w.clarity!.q).at(-1), ['consentv2', { ad_Storage: 'granted', analytics_Storage: 'granted' }]);
  assert.deepEqual((w.uetq as unknown[]).slice(-3), ['consent', 'update', { ad_storage: 'granted' }]);
  const tk = (w.ttq as unknown[]).filter((x) => Array.isArray(x));
  assert.deepEqual(tk, [['holdConsent'], ['grantConsent'], ['page']]);
  // Withdrawing later revokes TikTok.
  updateConsent(w, doc, { analytics: true, marketing: false });
  assert.deepEqual((w.ttq as unknown[]).filter((x) => Array.isArray(x)).at(-1), ['revokeConsent']);
  call(w, 'ttq').track('SubmitForm');
  assert.deepEqual((w.ttq as unknown[]).at(-1), ['track', 'SubmitForm']);
});

test('analytics only: Hotjar loads, TikTok stays out', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  initConsent(w, { analytics: true, marketing: false });
  installStubs(w, IDS);
  loadTags(w, doc);
  assert.deepEqual(added.map((s) => s.src), [
    'https://www.clarity.ms/tag/clar123',
    'https://bat.bing.com/bat.js',
    'https://static.hotjar.com/c/hotjar-4242.js?sv=6',
  ]);
  assert.deepEqual(queued(w.clarity!.q), [['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }]]);
});
