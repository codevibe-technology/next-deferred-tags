import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributionParams, captureLanding } from '../src/landing.js';
import { configureRuntime, getState, initConsent, installStubs, updateConsent, loadTags, trackPageView, type DocLike, type TagWindow } from '../src/tags.js';
import { createFlushHandler, type FlushedEvents } from '../src/server/index.js';

type El = { src: string; onload?: (() => void) | null; onerror?: (() => void) | null };
function fakeDoc(cookie = '') {
  const added: El[] = [];
  const doc: DocLike = {
    createElement: () => ({ async: false, src: '', setAttribute() {} }),
    head: { appendChild: (n: unknown) => (added.push(n as El), n) },
    cookie,
  };
  return { doc, added };
}
const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

test('click ids and UTM tags are kept from the first landing page in the session', () => {
  assert.equal(attributionParams('https://x.test/a?ref=1'), null);
  assert.deepEqual(attributionParams('https://x.test/a?gclid=G1&utm_source=google&x=1'), { gclid: 'G1', utm_source: 'google' });
  const store = memStore();
  assert.equal(captureLanding('https://x.test/', store), null);
  const first = captureLanding('https://x.test/offer?fbclid=F1&utm_campaign=bf', store)!;
  assert.deepEqual(first.params, { fbclid: 'F1', utm_campaign: 'bf' });
  // A later page without ids, or with other ids, keeps the first touch.
  assert.equal(captureLanding('https://x.test/contact?gclid=G2', store)!.url, 'https://x.test/offer?fbclid=F1&utm_campaign=bf');
});

test('the first page view carries the landing fields, later ones do not', () => {
  const w: TagWindow = {};
  configureRuntime(w, { landing: { url: 'https://x.test/?gclid=G1', params: { gclid: 'G1' }, ts: 1 } });
  installStubs(w, { gtm: 'GTM-A' });
  trackPageView(w, '/');
  trackPageView(w, '/pricing');
  assert.deepEqual(w.dataLayer![0], { event: 'pageview', page: '/', landing_page: 'https://x.test/?gclid=G1', gclid: 'G1' });
  assert.deepEqual(w.dataLayer![1], { event: 'pageview', page: '/pricing' });
});

test('Meta gets an _fbc cookie built from the landing fbclid, unless one exists', () => {
  const w: TagWindow = {};
  configureRuntime(w, { landing: { url: 'https://x.test/?fbclid=F1', params: { fbclid: 'F1' }, ts: 1700000000000 } });
  const { doc } = fakeDoc('');
  installStubs(w, { metaPixel: '1' });
  loadTags(w, doc);
  assert.match(doc.cookie!, /^_fbc=fb\.1\.1700000000000\.F1;/);

  const w2: TagWindow = {};
  configureRuntime(w2, { landing: { url: 'https://x.test/?fbclid=F1', params: { fbclid: 'F1' }, ts: 1 } });
  const d2 = fakeDoc('_fbc=fb.1.5.OLD');
  installStubs(w2, { metaPixel: '1' });
  loadTags(w2, d2.doc);
  assert.equal(d2.doc.cookie, '_fbc=fb.1.5.OLD');
});

test('a Meta pixel inside Tag Manager also gets _fbc, once marketing is allowed', () => {
  const w: TagWindow = {};
  configureRuntime(w, { landing: { url: 'https://x.test/?fbclid=F2', params: { fbclid: 'F2' }, ts: 1700000000000 } });
  const { doc } = fakeDoc('');
  installStubs(w, { gtm: 'GTM-A' });
  initConsent(w, { analytics: false, marketing: false });
  loadTags(w, doc);
  assert.equal(doc.cookie, '');
  updateConsent(w, doc, { analytics: true, marketing: true });
  assert.match(doc.cookie!, /^_fbc=fb\.1\.1700000000000\.F2;/);
});

test('several ids per tag, GTM environments and first-party script URLs', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  installStubs(w, {
    gtm: ['GTM-A', 'GTM-B'],
    ga4: ['G-1', 'G-2'],
    metaPixel: ['111', '222'],
    gtmAuth: 'abc',
    gtmPreview: 'env-3',
    gtmScriptUrl: 'https://sst.example.com/gtm.js',
  });
  loadTags(w, doc);
  assert.deepEqual(added.map((s) => s.src), [
    'https://sst.example.com/gtm.js?id=GTM-A&gtm_auth=abc&gtm_preview=env-3&gtm_cookies_win=x',
    'https://sst.example.com/gtm.js?id=GTM-B&gtm_auth=abc&gtm_preview=env-3&gtm_cookies_win=x',
    'https://www.googletagmanager.com/gtag/js?id=G-1',
    'https://connect.facebook.net/en_US/fbevents.js',
  ]);
  const configs = (w.dataLayer as unknown[]).map((a) => Array.from(a as ArrayLike<unknown>)).filter((a) => a[0] === 'config').map((a) => a[1]);
  assert.deepEqual(configs, ['G-1', 'G-2']);
  assert.deepEqual(w.fbq!.queue!.filter((q) => (q as unknown[])[0] === 'init').map((q) => (q as unknown[])[1]), ['111', '222']);
});

test('a blocked script calls onBlocked', () => {
  const w: TagWindow = {};
  const blocked: string[] = [];
  configureRuntime(w, { onBlocked: (tag) => blocked.push(tag) });
  const { doc, added } = fakeDoc();
  installStubs(w, { gtm: 'GTM-A', linkedin: '9' });
  loadTags(w, doc);
  added[1].onerror!();
  assert.deepEqual(blocked, ['LinkedIn Insight']);
  assert.equal(getState(w).loaded, true);
});

test('flush handler passes valid events on and rejects bad bodies', async () => {
  const got: FlushedEvents[] = [];
  const POST = createFlushHandler({ handle: (d) => void got.push(d) });
  const post = (body: string) => POST(new Request('https://x.test/api/events', { method: 'POST', body }));
  const ok = await post(JSON.stringify({ events: [{ event: 'generate_lead', form: 'contact' }, { nope: 1 }, 'x'], page: 'https://x.test/contact' }));
  assert.equal(ok.status, 204);
  assert.deepEqual(got[0].events, [{ event: 'generate_lead', form: 'contact' }]);
  assert.equal((await post('{"events":1}')).status, 400);
  assert.equal((await post('nope')).status, 400);
});
