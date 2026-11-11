import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getState, installStubs, loadTags, trackPageView, type DocLike, type TagWindow } from '../src/tags.js';

function fakeDoc() {
  const added: Array<{ src: string; async: boolean; nonce?: string; attrs: Record<string, string> }> = [];
  const doc: DocLike = {
    createElement: () => {
      const el = {
        async: false,
        src: '',
        nonce: undefined as string | undefined,
        attrs: {} as Record<string, string>,
        setAttribute(k: string, v: string) {
          el.attrs[k] = v;
        },
      };
      return el;
    },
    head: {
      appendChild: (node: unknown) => {
        added.push(node as (typeof added)[number]);
        return node;
      },
    },
  };
  return { doc, added };
}

test('stubs queue page views and events without downloading anything', () => {
  const w: TagWindow = {};
  const { added } = fakeDoc();
  installStubs(w, { gtm: 'GTM-TEST', metaPixel: '123', linkedin: '456', ga4: 'G-TEST' });
  trackPageView(w, '/');
  w.gtag!('event', 'sign_up');
  assert.equal(added.length, 0);
  assert.deepEqual(w.dataLayer![0], { event: 'pageview', page: '/' });
  assert.equal(w.fbq!.queue!.length, 2); // init + PageView
  assert.deepEqual(w.fbq!.queue![0], ['init', '123']);
  assert.deepEqual(w.fbq!.queue![1], ['track', 'PageView']);
  assert.deepEqual(w._linkedin_data_partner_ids, ['456']);
  assert.equal(typeof w.lintrk, 'function');
});

test('loadTags injects each vendor script once, after the queued page view', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  installStubs(w, { gtm: 'GTM-TEST', metaPixel: '123', linkedin: '456', scripts: [{ src: 'https://x.test/a.js', attributes: { 'data-x': '1' } }], nonce: 'abc' });
  trackPageView(w, '/');
  assert.equal(loadTags(w, doc), true);
  assert.equal(loadTags(w, doc), false);

  assert.deepEqual(
    added.map((s) => s.src),
    [
      'https://www.googletagmanager.com/gtm.js?id=GTM-TEST',
      'https://connect.facebook.net/en_US/fbevents.js',
      'https://snap.licdn.com/li.lms-analytics/insight.min.js',
      'https://x.test/a.js',
    ],
  );
  assert.ok(added.every((s) => s.async && s.nonce === 'abc'));
  assert.equal(added[3].attrs['data-x'], '1');
  // The queued page view comes before gtm.js, which is how GTM replays it.
  assert.equal((w.dataLayer![0] as { event: string }).event, 'pageview');
  assert.equal((w.dataLayer![1] as { event: string }).event, 'gtm.js');
});

test('GA4 without Tag Manager gets the gtag.js bootstrap', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  loadTags(w, doc, { ga4: 'G-TEST' });
  assert.equal(added[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-TEST');
  const args = w.dataLayer!.map((a) => Array.from(a as ArrayLike<unknown>));
  assert.equal(args[0][0], 'js');
  assert.deepEqual(args[1], ['config', 'G-TEST']);
});

test('the same page twice in a row is tracked once (React Strict Mode)', () => {
  const w: TagWindow = {};
  installStubs(w, { gtm: 'GTM-TEST' });
  assert.equal(trackPageView(w, '/a'), true);
  assert.equal(trackPageView(w, '/a'), false);
  assert.equal(trackPageView(w, '/b'), true);
  assert.equal(trackPageView(w, '/a'), true);
  assert.equal(w.dataLayer!.length, 3);
});

test('several components merge their config and stubs stay idempotent', () => {
  const w: TagWindow = {};
  const { doc, added } = fakeDoc();
  installStubs(w, { gtm: 'GTM-TEST', metaPixel: '123' });
  installStubs(w, { gtm: 'GTM-TEST', metaPixel: '123', linkedin: '456' });
  assert.equal(w.fbq!.queue!.filter((q) => (q as unknown[])[0] === 'init').length, 1);
  loadTags(w, doc);
  assert.equal(added.length, 3);
  assert.equal(getState(w).loaded, true);
});

test('an existing gtag or fbq on the page is kept', () => {
  const calls: unknown[] = [];
  const existing = Object.assign((...a: unknown[]) => calls.push(a), { queue: [] as unknown[] });
  const w: TagWindow = { fbq: existing };
  installStubs(w, { metaPixel: '999' });
  assert.equal(w.fbq, existing);
  assert.deepEqual(calls, [['init', '999']]);
});
