import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentRequired, countryFromHeaders, readCountry } from '../src/region.js';
import { cookiebotChoice, oneTrustChoice, tcfChoice } from '../src/adapters/map.js';

test('consent is asked in the EU, UK, Switzerland and India, and when the country is unknown', () => {
  for (const c of ['DE', 'fr', 'GB', 'CH', 'IN', 'NO']) assert.equal(consentRequired(c), true, c);
  for (const c of ['US', 'AE', 'SG', 'AU']) assert.equal(consentRequired(c), false, c);
  for (const c of [undefined, null, '', 'XX', 'T1', 'usa', '1']) assert.equal(consentRequired(c), true, String(c));
  assert.equal(consentRequired('US', 'all'), true);
  assert.equal(consentRequired('US', ['US']), true);
  assert.equal(consentRequired('IN', ['US']), false);
});

test('country comes from the first host header that has one', () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  assert.equal(countryFromHeaders(h({ 'x-vercel-ip-country': 'in' })), 'IN');
  assert.equal(countryFromHeaders(h({ 'cf-ipcountry': 'XX', 'cloudfront-viewer-country': 'US' })), 'US');
  assert.equal(countryFromHeaders(h({})), undefined);
  assert.equal(readCountry({ cookie: 'a=1; ndt_country=AE; b=2' }), 'AE');
  assert.equal(readCountry({ cookie: 'a=1' }), undefined);
});

test('Cookiebot statistics and marketing map to analytics and marketing', () => {
  assert.deepEqual(cookiebotChoice({ statistics: true, marketing: false }), { analytics: true, marketing: false });
  assert.equal(cookiebotChoice(undefined), null);
});

test('OneTrust groups map to analytics and marketing, with custom ids', () => {
  assert.deepEqual(oneTrustChoice(',C0001,C0002,'), { analytics: true, marketing: false });
  assert.deepEqual(oneTrustChoice(',C0001,C0002,C0004,'), { analytics: true, marketing: true });
  assert.deepEqual(oneTrustChoice(',C0001,'), { analytics: false, marketing: false });
  assert.deepEqual(oneTrustChoice(',1,3,', { analytics: ['3'], marketing: ['4'] }), { analytics: true, marketing: false });
  assert.equal(oneTrustChoice(''), null);
});

test('TCF purposes map to analytics and marketing once the visitor has decided', () => {
  const tc = (consents: Record<string, boolean>, eventStatus = 'useractioncomplete') => ({ eventStatus, gdprApplies: true, purpose: { consents } });
  assert.equal(tcfChoice(tc({ 1: true }, 'cmpuishown')), null);
  assert.deepEqual(tcfChoice(tc({ 1: true, 8: true })), { analytics: true, marketing: false });
  assert.deepEqual(tcfChoice(tc({ 1: true, 3: true, 4: true })), { analytics: false, marketing: true });
  assert.deepEqual(tcfChoice(tc({ 3: true, 4: true, 8: true })), { analytics: false, marketing: false });
  assert.deepEqual(tcfChoice({ eventStatus: 'tcloaded', gdprApplies: false }), { analytics: true, marketing: true });
});
