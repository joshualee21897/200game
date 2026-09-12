import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPushEnabled, getPublicKey, sendPush } from '../src/push.js';

// No VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are set in the test environment,
// which is exactly the "not configured yet" state a fresh deploy starts
// in - everything here should quietly no-op rather than throw.

test('push is disabled and reports no public key without VAPID env vars configured', () => {
  assert.equal(isPushEnabled(), false);
  assert.equal(getPublicKey(), null);
});

test('sendPush no-ops (does not throw) when push is not configured', async () => {
  await sendPush({ endpoint: 'https://example.com/push/abc' }, { title: 'hi' });
});
