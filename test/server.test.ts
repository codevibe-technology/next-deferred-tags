import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentFromRequest, createConsentLogHandler, gaClientId, sendGa4Event, sendMetaEvent, type ConsentRecord } from '../src/server/index.js';

const consentCookie = (analytics: boolean, marketing: boolean, version = '1') =>
  `ndt_consent=${encodeURIComponent(JSON.stringify({ id: 'abcdef123456', version, ts: Date.now(), analytics, marketing }))}`;

const req = (cookie: string, extra: Record<string, string> = {}) =>
  new Request('https://example.com/api/x', {
    method: 'POST',
    headers: { cookie, 'user-agent': 'UA/1', 'x-forwarded-for': '203.0.113.7, 10.0.0.1', referer: 'https://example.com/contact', ...extra },
  });

function captureFetch() {
  const calls: Array<{ url: string; body: any }> = [];
  const orig = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = orig) };
}

test('consent is read from the request cookie, with the version check', () => {
  assert.deepEqual(consentFromRequest(req(consentCookie(true, false))), { analytics: true, marketing: false });
  assert.equal(consentFromRequest(req(consentCookie(true, true, '2'))), null);
  assert.equal(consentFromRequest(req('a=1')), null);
});

test('Meta: nothing is sent without marketing consent', async () => {
  const f = captureFetch();
  try {
    const r = await sendMetaEvent(req(consentCookie(true, false)), { name: 'Lead', eventId: 'e1', pixelId: '1', accessToken: 't' });
    assert.deepEqual(r, { ok: false, skipped: 'no marketing consent' });
    assert.equal(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

test('Meta: hashes email and phone, passes event id, IP, browser and click cookies', async () => {
  const f = captureFetch();
  try {
    const r = await sendMetaEvent(req(`${consentCookie(true, true)}; _fbp=fb.1.1.2; _fbc=fb.1.1.abc`), {
      name: 'Lead',
      eventId: 'e1',
      email: ' Test@Example.com ',
      phone: '98765 43210',
      defaultCountryCode: '91',
      pixelId: '123',
      accessToken: 'tok',
      customData: { content_name: 'contact' },
    });
    assert.deepEqual(r, { ok: true });
    assert.match(f.calls[0].url, /graph\.facebook\.com\/v21\.0\/123\/events\?access_token=tok$/);
    const d = f.calls[0].body.data[0];
    assert.equal(d.event_id, 'e1');
    assert.equal(d.event_source_url, 'https://example.com/contact');
    assert.equal(d.user_data.client_ip_address, '203.0.113.7');
    assert.equal(d.user_data.fbp, 'fb.1.1.2');
    // sha256("test@example.com") and sha256("919876543210")
    assert.equal(d.user_data.em[0], '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b');
    assert.equal(d.user_data.ph[0].length, 64);
    assert.ok(!JSON.stringify(f.calls[0].body).includes('Example.com'));
  } finally {
    f.restore();
  }
});

test('GA4: needs analytics consent and the _ga cookie, passes ad consent', async () => {
  const f = captureFetch();
  try {
    assert.equal(gaClientId(req('_ga=GA1.1.123456.789')), '123456.789');
    const none = await sendGa4Event(req(consentCookie(false, false)), { name: 'generate_lead', measurementId: 'G-1', apiSecret: 's' });
    assert.equal(none.ok, false);
    const noGa = await sendGa4Event(req(consentCookie(true, false)), { name: 'generate_lead', measurementId: 'G-1', apiSecret: 's' });
    assert.equal(noGa.ok, false);
    const r = await sendGa4Event(req(`${consentCookie(true, false)}; _ga=GA1.1.123456.789`), { name: 'generate_lead', params: { value: 1 }, measurementId: 'G-1', apiSecret: 's' });
    assert.deepEqual(r, { ok: true });
    assert.equal(f.calls.length, 1);
    assert.match(f.calls[0].url, /mp\/collect\?measurement_id=G-1&api_secret=s$/);
    assert.equal(f.calls[0].body.client_id, '123456.789');
    assert.deepEqual(f.calls[0].body.consent, { ad_user_data: 'DENIED', ad_personalization: 'DENIED' });
    assert.equal(f.calls[0].body.events[0].params.value, 1);
  } finally {
    f.restore();
  }
});

test('consent log handler saves valid records and rejects bad ones', async () => {
  const saved: ConsentRecord[] = [];
  const POST = createConsentLogHandler({ save: (r) => void saved.push(r) });
  const post = (body: string) => POST(new Request('https://example.com/api/consent', { method: 'POST', body, headers: { referer: 'https://example.com/' } }));
  const ok = await post(JSON.stringify({ id: 'abcdef123456', version: '1', ts: 1, analytics: true, marketing: false, action: 'custom' }));
  assert.equal(ok.status, 204);
  assert.equal(saved[0].action, 'custom');
  assert.equal(saved[0].page, 'https://example.com/');
  assert.ok(!('ip' in saved[0]));
  assert.equal((await post('not json')).status, 400);
  assert.equal((await post(JSON.stringify({ id: 'x', version: '1', ts: 1, analytics: true, marketing: false, action: 'custom' }))).status, 400);
  assert.equal((await post(JSON.stringify({ id: 'abcdef123456', version: '1', ts: 1, analytics: 'yes', marketing: false, action: 'custom' }))).status, 400);
  assert.equal((await post('x'.repeat(3000))).status, 413);
  assert.equal(saved.length, 1);
});
