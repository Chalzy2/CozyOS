'use strict';
/**
 * server/webauthn-rp/test/mpesa-provider-contract.test.js
 *
 * Phase 5.2 — M-Pesa adapter boundary preparation, STATIC verification
 * only. Deliberately does NOT use the full certification harness: that
 * harness calls adapter.createPayment() for real, which this adapter
 * honestly throws on (no real Daraja integration exists).
 *
 * What IS genuinely verifiable without any real Daraja connection:
 *   - every required contract method is present
 *   - getCapabilities() declares a real, documented capability set
 *   - mapProviderStatus() never returns a value outside the canonical
 *     set, and specifically maps the documented STK Push timeout code
 *     to UNKNOWN, never FAILED
 *   - every operational method honestly throws rather than fabricating
 *     a response
 *
 * STATUS OF EVERY RESULT BELOW: STATICALLY VERIFIED. Not REAL RUNTIME.
 * No network call is made or attempted by this file.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED_ADAPTER_METHODS, CANONICAL_STATUSES } = require('../payments');
const { createMpesaProviderAdapter, REQUIRED_ENV_VARS } = require('../providers/mpesa-provider');

test('[mpesa boundary prep] implements every required adapter method', () => {
  const adapter = createMpesaProviderAdapter();
  const missing = REQUIRED_ADAPTER_METHODS.filter((m) => typeof adapter[m] !== 'function');
  assert.deepEqual(missing, []);
});

test('[mpesa boundary prep] isConfigured() honestly reports false — no real credentials exist in this environment', () => {
  for (const name of REQUIRED_ENV_VARS) delete process.env[name];
  const adapter = createMpesaProviderAdapter();
  assert.equal(adapter.isConfigured(), false);
});

test('[mpesa boundary prep] getCapabilities() declares a real, documented capability set (not fabricated)', async () => {
  const adapter = createMpesaProviderAdapter();
  const caps = await adapter.getCapabilities();
  assert.equal(caps.mobile_money, true);
  assert.equal(caps.webhooks, true, 'STK Push is asynchronous by design — must declare webhook support');
  assert.equal(caps.card, false);
  assert.equal(caps.crypto, false);
});

test('[mpesa boundary prep] mapProviderStatus: success code maps to SUCCEEDED', () => {
  const adapter = createMpesaProviderAdapter();
  assert.equal(adapter.mapProviderStatus(0), 'SUCCEEDED');
});

test('[mpesa boundary prep] mapProviderStatus: documented timeout code maps to UNKNOWN, never FAILED', () => {
  const adapter = createMpesaProviderAdapter();
  assert.equal(adapter.mapProviderStatus(1037), 'UNKNOWN');
});

test('[mpesa boundary prep] mapProviderStatus: any unrecognized code maps to UNKNOWN, never a guess', () => {
  const adapter = createMpesaProviderAdapter();
  const result = adapter.mapProviderStatus(999999);
  assert.equal(result, 'UNKNOWN');
  assert.ok(CANONICAL_STATUSES.includes(result));
});

test('[mpesa boundary prep] mapProviderStatus is not exploitable via prototype-chain property names (already correctly guarded via hasOwnProperty)', () => {
  const adapter = createMpesaProviderAdapter();
  for (const dangerousKey of ['__proto__', 'constructor', 'toString']) {
    const result = adapter.mapProviderStatus(dangerousKey);
    assert.equal(typeof result, 'string');
    assert.equal(result, 'UNKNOWN');
  }
});

test('[mpesa boundary prep] every operational method honestly throws "not implemented" rather than fabricating a response', async () => {
  const adapter = createMpesaProviderAdapter();
  await assert.rejects(() => adapter.createPayment({}), /not implemented/);
  await assert.rejects(() => adapter.getPayment('x'), /not implemented/);
  await assert.rejects(() => adapter.refundPayment('x', 100), /not implemented/);
  await assert.rejects(() => adapter.cancelPayment('x'), /not implemented/);
  await assert.rejects(() => adapter.verifyWebhook('{}', {}), /not implemented/);
});

test('[mpesa boundary prep] this adapter is never registered with the real server — confirmed by source inspection', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!serverSource.includes('mpesa-provider'), 'server.js must never import the M-Pesa boundary-preparation stub');
});
