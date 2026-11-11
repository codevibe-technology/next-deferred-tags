import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentModeSignals, detectAiReferral, readConsent, writeConsent } from '../src/consent.js';
import { initConsent, installStubs, loadTags, trackPageView, updateConsent, type DocLike, type TagWindow } from '../src/tags.js';

function fakeDoc() {
  const added: string[] = [];
  const doc: DocLike = {
    createElement: () => ({ async: false, src: '', setAttribute() {} }),
    head: {
      appendChild: (node: unknown) => {
        added.push((node as { src: string }).src);
        return node;
      },
    },
  };
  return { doc, added };
}

const args = (w: TagWindow) => w.dataLayer!.map((a) => (a && typeof a === 'object' && 'length' in (a as object) ? Array.from(a as ArrayLike<unknown>) : a));

test('consent defaults are queued before Tag Manager, with everything optional denied', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  initConsent(w, null);
  installStubs(w, { gtm: 'GTM-TEST', metaPixel: '123', linkedin: '456' });
  trackPageView(w, '/');
  loadTags(w, doc);

  const dl = args(w);
  assert.deepEqual(dl[0], [
    'consent',
    'default',
    { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', functionality_storage: 'granted', security_storage: 'granted' },
  ]);
  const gtmIndex = dl.findIndex((x) => (x as { event?: string }).event === 'gtm.js');
  assert.ok(gtmIndex > 0, 'gtm.js comes after the consent default');
  // Advanced mode: GTM loads (cookieless), Meta and LinkedIn wait for marketing consent.
  assert.deepEqual(added, ['https://www.googletagmanager.com/gtm.js?id=GTM-TEST']);
  // The pixel starts revoked and records no page view.
  assert.deepEqual(w.fbq!.queue![0], ['consent', 'revoke']);
  assert.ok(!w.fbq!.queue!.some((q) => (q as unknown[])[1] === 'PageView'));
});

test('granting marketing loads the waiting tags and tells Google and Tag Manager', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  initConsent(w, null);
  installStubs(w, { gtm: 'GTM-TEST', metaPixel: '123', linkedin: '456', scripts: ['https://x.test/m.js', { src: 'https://x.test/n.js', consent: 'necessary' }] });
  trackPageView(w, '/pricing');
  loadTags(w, doc);
  assert.deepEqual(added, ['https://www.googletagmanager.com/gtm.js?id=GTM-TEST', 'https://x.test/n.js']);

  updateConsent(w, doc, { analytics: true, marketing: true });
  assert.deepEqual(added.slice(2), ['https://connect.facebook.net/en_US/fbevents.js', 'https://snap.licdn.com/li.lms-analytics/insight.min.js', 'https://x.test/m.js']);
  const dl = args(w);
  assert.ok(dl.some((x) => Array.isArray(x) && x[0] === 'consent' && x[1] === 'update' && (x[2] as Record<string, string>).ad_storage === 'granted'));
  assert.ok(dl.some((x) => (x as { event?: string }).event === 'consent_update' && (x as { consent_marketing?: boolean }).consent_marketing === true));
  const q = w.fbq!.queue!;
  assert.deepEqual(q.slice(-2), [['consent', 'grant'], ['track', 'PageView']]);

  // Same choice again: nothing new.
  const n = w.dataLayer!.length;
  updateConsent(w, doc, { analytics: true, marketing: true });
  assert.equal(w.dataLayer!.length, n);
});

test('basic mode keeps Google tags out until analytics or marketing is accepted', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  initConsent(w, null, 'basic');
  installStubs(w, { gtm: 'GTM-TEST', ga4: 'G-TEST' });
  loadTags(w, doc);
  assert.deepEqual(added, []);
  updateConsent(w, doc, { analytics: true, marketing: false });
  assert.deepEqual(added, ['https://www.googletagmanager.com/gtm.js?id=GTM-TEST', 'https://www.googletagmanager.com/gtag/js?id=G-TEST']);
});

test('a stored choice is restored before anything loads', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  initConsent(w, { analytics: true, marketing: true });
  installStubs(w, { gtm: 'GTM-TEST', linkedin: '456' });
  loadTags(w, doc);
  assert.equal(added.length, 2);
  const dl = args(w);
  assert.equal((dl[0] as unknown[])[1], 'default');
  assert.equal(((dl[0] as unknown[])[2] as Record<string, string>).analytics_storage, 'granted');
});

test('without consent handling nothing changes', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  installStubs(w, { gtm: 'GTM-TEST', metaPixel: '123' });
  trackPageView(w, '/');
  loadTags(w, doc);
  assert.equal(added.length, 2);
  assert.ok(!args(w).some((x) => Array.isArray(x) && x[0] === 'consent'));
});

test('stores the choice in a cookie with a stable id and version', () => {
  const doc = { cookie: '' };
  const a = writeConsent({ analytics: true, marketing: false }, { doc, secure: false });
  assert.match(doc.cookie, /^ndt_consent=/);
  // A browser keeps only name=value; emulate that.
  doc.cookie = doc.cookie.split(';')[0];
  const read = readConsent(doc);
  assert.equal(read?.analytics, true);
  assert.equal(read?.marketing, false);
  assert.equal(read?.id, a.id);
  const b = writeConsent({ analytics: true, marketing: true }, { doc, secure: false });
  assert.equal(b.id, a.id, 'the id survives a change of mind');
  doc.cookie = doc.cookie.split(';')[0];
  assert.equal(readConsent(doc, '2'), null, 'a new version asks again');
  assert.deepEqual(consentModeSignals(null).ad_storage, 'denied');
});

test('recognises visits sent by AI assistants', () => {
  assert.deepEqual(detectAiReferral('https://chatgpt.com/', 'https://x.test/'), { assistant: 'ChatGPT', source: 'chatgpt.com' });
  assert.deepEqual(detectAiReferral('', 'https://x.test/?utm_source=chatgpt.com'), { assistant: 'ChatGPT', source: 'chatgpt.com' });
  assert.deepEqual(detectAiReferral('https://www.perplexity.ai/search', 'https://x.test/'), { assistant: 'Perplexity', source: 'www.perplexity.ai' });
  assert.equal(detectAiReferral('https://www.google.com/', 'https://x.test/'), null);
  assert.equal(detectAiReferral('not a url', 'also not'), null);
});
