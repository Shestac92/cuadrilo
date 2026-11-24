import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fetchPublic, isNonPublicAddress } from '../../src/publicFetch';

/** Downloads from outside links (src/publicFetch.ts), as on a real server (no ALLOW_LOCAL_FETCH). */
describe('public fetch', () => {
  const options = { maxBytes: 1024, timeoutMs: 2000, maxRedirects: 0 };

  it('non-public addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fd00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
    ]) {
      assert.ok(isNonPublicAddress(address), address);
    }
    for (const address of ['8.8.8.8', '172.32.0.1', '2a00:1450:4001::1'])
      assert.ok(!isNonPublicAddress(address), address);
  });

  it('https only, no credentials, no inside addresses', async () => {
    assert.deepEqual(await fetchPublic('http://example.com/a.png', options), { ok: false, reason: 'url' });
    assert.deepEqual(await fetchPublic('https://user:pass@example.com/a.png', options), { ok: false, reason: 'url' });
    assert.deepEqual(await fetchPublic('ftp://example.com/a.png', options), { ok: false, reason: 'url' });
    assert.deepEqual(await fetchPublic('not a link', options), { ok: false, reason: 'url' });
    assert.deepEqual(await fetchPublic('https://127.0.0.1/a.png', options), { ok: false, reason: 'url' }, 'an IP');
    assert.deepEqual(await fetchPublic('https://[::1]/a.png', options), { ok: false, reason: 'url' });
    // A name that resolves inside is stopped when the connection is made.
    assert.deepEqual(await fetchPublic('https://localhost/a.png', options), { ok: false, reason: 'address' });
  });
});
