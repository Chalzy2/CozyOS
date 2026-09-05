'use strict';
/**
 * server/webauthn-rp/test/provider-certification-harness.js
 *
 * CozyOS Provider Certification Harness (Phase 5.2).
 *
 * Every future payment provider adapter should be certified against
 * this SAME battery — Contract -> Security -> Idempotency -> Webhook ->
 * Refund -> Ledger Consistency — rather than each adapter growing its
 * own bespoke, inconsistent test suite. This is real, runnable
 * machinery, not documentation: it is applied to the real cash adapter
 * later in this same round to prove it actually works, and to a
 * TEST-ONLY adapter (see test-only-async-provider.js) built specifically
 * to exercise the async/webhook paths cash cannot exercise.
 *
 * IMPORTANT: this harness tests against a REAL PaymentRegistry backed by
 * a real, disposable SQLite database — not a mock. This is "real" in
 * the same sense every SQLite-backed test throughout this engagement
 * has been treated as real: genuine database transactions, genuine
 * constraint enforcement, genuine business logic — the only thing not
 * real is the external network call a live provider would make, which
 * no certified adapter in this harness ever performs (cash needs none;
 * the test-only adapter is explicitly fake and labeled as such).
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { openDb } = require('../db');
const { SQLiteDatabaseAdapter } = require('../database-adapter');
const { OrganizationRegistry } = require('../organizations');
const { BillingRegistry } = require('../billing');
const { PaymentRegistry, REQUIRED_ADAPTER_METHODS, CANONICAL_STATUSES } = require('../payments');

async function freshHarness(prefix) {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), `cert-${prefix}-`)), 'x.sqlite');
  const db = new SQLiteDatabaseAdapter(openDb(dbPath));
  const orgs = new OrganizationRegistry(db, {});
  const billing = new BillingRegistry(db, orgs, {});
  const payments = new PaymentRegistry(db, orgs, billing, {});
  const userId = crypto.randomUUID();
  const ts = Date.now();
  await db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', [userId, `cert-${prefix}-${crypto.randomUUID()}@example.com`, ts]);
  const org = await orgs.createOrganization(userId, { name: `CertOrg-${prefix}` });
  return { db, orgs, billing, payments, userId, organizationId: org.id, dbPath };
}

async function cleanupHarness(h) {
  await h.db.close();
  fs.rmSync(h.dbPath, { force: true });
}

/**
 * certifyProvider — registers a full node:test suite (via the `test`
 * function passed in) certifying `createAdapter()`'s output against the
 * standard contract. Set `supportsWebhooks: true` only if the adapter's
 * own getCapabilities().webhooks is true — the harness will otherwise
 * correctly SKIP (not fail) the webhook-specific battery, matching the
 * "capabilities declared by the adapter, never assumed" principle.
 */
function certifyProvider(test, { providerId, createAdapter, sampleAmountMinorUnits = 2500, sampleCurrency = 'KES', supportsWebhooks = false, simulateWebhookEvent = null }) {
  // ---------- Contract Tests ----------

  test(`[${providerId}] contract: implements every required adapter method`, () => {
    const adapter = createAdapter();
    const missing = REQUIRED_ADAPTER_METHODS.filter((m) => typeof adapter[m] !== 'function');
    assert.deepEqual(missing, [], `adapter is missing required method(s): ${missing.join(', ')}`);
  });

  test(`[${providerId}] contract: getCapabilities() returns a real object`, async () => {
    const adapter = createAdapter();
    const caps = await adapter.getCapabilities();
    assert.equal(typeof caps, 'object');
    assert.ok(caps !== null);
  });

  test(`[${providerId}] contract: mapProviderStatus() never returns a value outside the canonical status set`, () => {
    const adapter = createAdapter();
    const result = adapter.mapProviderStatus('__cert_harness_unrecognized_status__');
    assert.ok(CANONICAL_STATUSES.includes(result), `mapProviderStatus() returned "${result}", which is not a valid canonical status`);
  });

  test(`[${providerId}] security: mapProviderStatus() is not exploitable via prototype-chain property names`, () => {
    // Regression test for a real defect found during the Phase 5.2 final
    // security scan: a naive `map[providerStatus] || 'FALLBACK'` lookup
    // on a plain object literal returns a real object/function (truthy,
    // not undefined) for providerStatus values like "__proto__" or
    // "constructor", bypassing the fallback entirely and returning
    // something that is not even a string. Confirmed empirically before
    // the fix; every real adapter's mapProviderStatus() must guard
    // against this (e.g. via Object.prototype.hasOwnProperty.call()).
    const adapter = createAdapter();
    for (const dangerousKey of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']) {
      const result = adapter.mapProviderStatus(dangerousKey);
      assert.equal(typeof result, 'string', `mapProviderStatus("${dangerousKey}") returned a ${typeof result}, not a string — likely an unguarded object-key lookup`);
      assert.ok(CANONICAL_STATUSES.includes(result), `mapProviderStatus("${dangerousKey}") returned "${result}", not a valid canonical status`);
    }
  });

  test(`[${providerId}] contract: registers successfully with a real PaymentRegistry`, async () => {
    const h = await freshHarness(`${providerId}-register`);
    try {
      assert.doesNotThrow(() => h.payments.registerProvider(providerId, createAdapter()));
    } finally {
      await cleanupHarness(h);
    }
  });

  // ---------- Idempotency Tests ----------

  test(`[${providerId}] idempotency: a repeated request with the same idempotency key returns the same intent, never double-charges`, async () => {
    const h = await freshHarness(`${providerId}-idem`);
    try {
      h.payments.registerProvider(providerId, createAdapter());
      const key = `cert-idem-${crypto.randomUUID()}`;
      const first = await h.payments.createPaymentIntent(h.userId, h.organizationId, {
        amountMinorUnits: sampleAmountMinorUnits, currency: sampleCurrency, providerId, idempotencyKey: key,
      });
      const second = await h.payments.createPaymentIntent(h.userId, h.organizationId, {
        amountMinorUnits: sampleAmountMinorUnits, currency: sampleCurrency, providerId, idempotencyKey: key,
      });
      assert.equal(second.id, first.id);
    } finally {
      await cleanupHarness(h);
    }
  });

  // ---------- Ledger Consistency ----------

  test(`[${providerId}] ledger consistency: a successfully-created payment's wallet credit matches its amount exactly`, async () => {
    const h = await freshHarness(`${providerId}-ledger`);
    try {
      h.payments.registerProvider(providerId, createAdapter());
      const intent = await h.payments.createPaymentIntent(h.userId, h.organizationId, {
        amountMinorUnits: sampleAmountMinorUnits, currency: sampleCurrency, providerId,
      });
      if (intent.status === 'SUCCEEDED') {
        const balance = await h.billing.getWalletBalance(h.userId, h.organizationId);
        assert.equal(balance, sampleAmountMinorUnits, 'a synchronously-completed payment must credit the wallet by exactly its amount');
      }
    } finally {
      await cleanupHarness(h);
    }
  });

  // ---------- Refund Tests ----------

  test(`[${providerId}] refund: if the adapter declares refund support, a full refund exactly reverses a synchronously-completed payment`, async () => {
    const h = await freshHarness(`${providerId}-refund`);
    try {
      const adapter = createAdapter();
      h.payments.registerProvider(providerId, adapter);
      const caps = await adapter.getCapabilities();
      const intent = await h.payments.createPaymentIntent(h.userId, h.organizationId, {
        amountMinorUnits: sampleAmountMinorUnits, currency: sampleCurrency, providerId,
      });
      if (!caps.refunds || intent.status !== 'SUCCEEDED') {
        return;
      }
      const refunded = await h.payments.refundPayment(h.userId, h.organizationId, intent.id);
      assert.equal(refunded.status, 'REFUNDED');
      const balance = await h.billing.getWalletBalance(h.userId, h.organizationId);
      assert.equal(balance, 0, 'a full refund must exactly reverse the original credit');
    } finally {
      await cleanupHarness(h);
    }
  });

  // ---------- Security / Webhook Tests ----------

  if (!supportsWebhooks) {
    test(`[${providerId}] webhook battery: SKIPPED — adapter does not declare webhook support`, { skip: 'provider does not support webhooks (getCapabilities().webhooks !== true)' }, () => {});
    return;
  }

  if (typeof simulateWebhookEvent !== 'function') {
    throw new TypeError(`[provider-certification-harness] certifyProvider(): providerId "${providerId}" declares supportsWebhooks but no simulateWebhookEvent() was supplied.`);
  }

  test(`[${providerId}] webhook security: an invalid/unverifiable event is rejected and never changes payment or wallet state`, async () => {
    const h = await freshHarness(`${providerId}-webhook-invalid`);
    try {
      h.payments.registerProvider(providerId, createAdapter());
      const intent = await h.payments.createPaymentIntent(h.userId, h.organizationId, {
        amountMinorUnits: sampleAmountMinorUnits, currency: sampleCurrency, providerId,
      });
      const { rawPayload, headers } = simulateWebhookEvent({ intent, kind: 'invalid_signature' });
      const result = await h.payments.processProviderEvent(providerId, rawPayload, headers);
      assert.equal(result.applied, false);
      assert.equal(result.outcome, 'rejected_unverified');
      const after = await h.payments.getPaymentIntent(h.userId, h.organizationId, intent.id);
      assert.equal(after.status, intent.status, 'an invalid webhook must never change the payment intent status');
    } finally {
      await cleanupHarness(h);
    }
  });

  test(`[${providerId}] webhook idempotency: the same valid event delivered twice is applied once, ignored the second time`, async () => {
    const h = await freshHarness(`${providerId}-webhook-dup`);
    try {
      h.payments.registerProvider(providerId, createAdapter());
      const intent = await h.payments.createPaymentIntent(h.userId, h.organizationId, {
        amountMinorUnits: sampleAmountMinorUnits, currency: sampleCurrency, providerId,
      });
      const { rawPayload, headers } = simulateWebhookEvent({ intent, kind: 'succeeded' });
      const first = await h.payments.processProviderEvent(providerId, rawPayload, headers);
      assert.equal(first.applied, true);
      const second = await h.payments.processProviderEvent(providerId, rawPayload, headers);
      assert.equal(second.outcome, 'duplicate_ignored');
      const balance = await h.billing.getWalletBalance(h.userId, h.organizationId);
      assert.equal(balance, sampleAmountMinorUnits, 'a duplicate webhook must not double-credit the wallet');
    } finally {
      await cleanupHarness(h);
    }
  });

  test(`[${providerId}] webhook amount mismatch: a webhook claiming a different amount than the stored intent is rejected`, async () => {
    const h = await freshHarness(`${providerId}-webhook-amount`);
    try {
      h.payments.registerProvider(providerId, createAdapter());
      const intent = await h.payments.createPaymentIntent(h.userId, h.organizationId, {
        amountMinorUnits: sampleAmountMinorUnits, currency: sampleCurrency, providerId,
      });
      const { rawPayload, headers } = simulateWebhookEvent({ intent, kind: 'amount_mismatch' });
      const result = await h.payments.processProviderEvent(providerId, rawPayload, headers);
      assert.equal(result.outcome, 'rejected_amount_mismatch');
      const after = await h.payments.getPaymentIntent(h.userId, h.organizationId, intent.id);
      assert.equal(after.status, intent.status);
    } finally {
      await cleanupHarness(h);
    }
  });

  test(`[${providerId}] unknown-state safety: a webhook reporting an ambiguous/unknown status never changes payment or wallet state`, async () => {
    const h = await freshHarness(`${providerId}-webhook-unknown`);
    try {
      h.payments.registerProvider(providerId, createAdapter());
      const intent = await h.payments.createPaymentIntent(h.userId, h.organizationId, {
        amountMinorUnits: sampleAmountMinorUnits, currency: sampleCurrency, providerId,
      });
      const { rawPayload, headers } = simulateWebhookEvent({ intent, kind: 'unknown' });
      const result = await h.payments.processProviderEvent(providerId, rawPayload, headers);
      assert.equal(result.outcome, 'held_unknown_status');
      const after = await h.payments.getPaymentIntent(h.userId, h.organizationId, intent.id);
      assert.equal(after.status, intent.status, 'an UNKNOWN provider status must never be treated as success or failure');
      const balance = await h.billing.getWalletBalance(h.userId, h.organizationId);
      assert.equal(balance, 0, 'an UNKNOWN status must never trigger a wallet credit');
    } finally {
      await cleanupHarness(h);
    }
  });
}

module.exports = { certifyProvider, freshHarness, cleanupHarness };
