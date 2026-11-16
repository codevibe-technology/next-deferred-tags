import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeUrl } from '../src/pages/route.js';

test('Pages Router URLs keep path and query, drop the hash', () => {
  assert.equal(routeUrl('/blog/post?a=1#top'), '/blog/post?a=1');
  assert.equal(routeUrl('/pricing'), '/pricing');
  assert.equal(routeUrl('/#section'), '/');
  assert.equal(routeUrl('/search?q=a%23b'), '/search?q=a%23b');
});
