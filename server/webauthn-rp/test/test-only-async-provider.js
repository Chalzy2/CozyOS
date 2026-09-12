'use strict';
/**
 * server/webauthn-rp/test/test-only-async-provider.js
 *
 * ============================================================
 * TEST-ONLY — NEVER REGISTERED WITH THE REAL SERVER
 * ============================================================
 * This adapter exists SOLELY to exercise the async/webhook machinery in
 * server/webauthn-rp/payments.js that the real cash adapter cannot
 * exercise (cash is synchronous and has no webhook mechanism at all).
 * It is imported only by test files under server/webauthn-rp/test/ and
 * is never imported by server.js, never registered via
 * payments.registerProvider() outside a test, and generates no evidence
 * that could be mistaken for a real provider connection.
 *
 * Per Phase 5.2's explicit instruction: "A test-double can exist only
 * inside the isolated certification/test environment. It must never
 * masquerade as a real production provider or generate fake 'real
 * provider' evidence." Every test using this file labels its results
 * TEST-ONLY / SIMULATED, never REAL RUNTIME.
 *
 * Simulates a provider shaped like M-Pesa STK Push (the strongest real
 * candidate per Phase 5.1 discovery): payment creation returns PENDING
 * immediately, the real result arrives via a separate webhook call, and
 * an HMAC-style webhook signature is used (one legitimate mechanism
 * among several — this is a simulation of ONE possible mechanism, not a
 * claim that the real Daraja API uses this specific one; Phase 5.1
 * flagged that as an open question for real research once credentials
 * exist).
 */
const crypto = require('node:crypto');
const { verifyWebhookSignature } = require('../payments');

const TEST_WEBHOOK_SECRET = 'test-only-simulated-webhook-secret-do-not-use-in-production';

function createTestOnlyAsyncProviderAdapter() {
  const payments = new Map();

  return {
    async createPayment({ amountMinorUnits, currency }) {
      const providerPaymentId = `testasync_${crypto.randomUUID()}`;
      payments.set(providerPaymentId, { amountMinorUnits, currency });
      return { providerPaymentId, providerStatus: 'pending' };
    },
    async getPayment(providerPaymentId) {
      const record = payments.get(providerPaymentId);
      return { providerPaymentId, providerStatus: record ? 'pending' : 'not_found' };
    },
    async refundPayment(providerPaymentId, amountMinorUnits) {
      return { refunded: true, providerPaymentId, amountMinorUnits };
    },
    async cancelPayment(providerPaymentId) {
      return { cancelled: true, providerPaymentId };
    },
    /**
     * verifyWebhook — real HMAC verification (via the same
     * verifyWebhookSignature() primitive built in Phase 4) PLUS real
     * payload normalization, satisfying Phase 5.2's "webhook/event
     * normalization" requirement.
     */
    async verifyWebhook(rawPayload, headers = {}) {
      const signature = headers['x-test-signature'];
      const valid = verifyWebhookSignature({ payload: rawPayload, signature, secret: TEST_WEBHOOK_SECRET });
      if (!valid) return { valid: false, reason: 'invalid_signature' };
      let parsed;
      try {
        parsed = JSON.parse(rawPayload);
      } catch (_err) {
        return { valid: false, reason: 'malformed_payload' };
      }
      return {
        valid: true,
        providerEventId: parsed.eventId,
        providerPaymentId: parsed.providerPaymentId,
        providerStatus: parsed.status,
        amountMinorUnits: parsed.amountMinorUnits,
        currency: parsed.currency,
      };
    },
    async getCapabilities() {
      return {
        card: false, mobile_money: true, bank_transfer: false, crypto: false,
        refunds: true, partial_refunds: false, payouts: false, recurring: false,
        payment_links: false, webhooks: true,
      };
    },
    /**
     * mapProviderStatus — deliberately maps an unrecognized/ambiguous
     * status to 'UNKNOWN', never guessing FAILED or SUCCEEDED.
     */
    mapProviderStatus(providerStatus) {
      const map = {
        pending: 'PENDING',
        succeeded: 'SUCCEEDED',
        failed: 'FAILED',
        cancelled: 'CANCELLED',
        timeout: 'UNKNOWN',
        ambiguous_network_error: 'UNKNOWN',
      };
      // Same fix as cash-provider.js — see that file's comment for the
      // empirically-confirmed prototype-key exploitation this guards
      // against. Especially important here since this adapter's
      // providerStatus genuinely comes from parsed, attacker-influenced
      // webhook JSON (see verifyWebhook() above), unlike cash's, which
      // only ever receives its own internally-generated strings.
      return Object.prototype.hasOwnProperty.call(map, providerStatus) ? map[providerStatus] : 'UNKNOWN';
    },
  };
}

/**
 * simulateTestOnlyWebhookEvent — builds a real, correctly (or
 * deliberately incorrectly) signed webhook payload for the
 * certification harness to feed into
 * PaymentRegistry.processProviderEvent(). This is test fixture
 * construction, not provider connectivity.
 */
function simulateTestOnlyWebhookEvent({ intent, kind }) {
  const basePayload = {
    eventId: crypto.randomUUID(),
    providerPaymentId: intent.providerPaymentId,
    amountMinorUnits: intent.amountMinorUnits,
    currency: intent.currency,
    status: 'succeeded',
  };

  if (kind === 'succeeded') {
    const payload = JSON.stringify(basePayload);
    const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(payload).digest('hex');
    return { rawPayload: payload, headers: { 'x-test-signature': signature } };
  }
  if (kind === 'invalid_signature') {
    const payload = JSON.stringify(basePayload);
    return { rawPayload: payload, headers: { 'x-test-signature': 'deliberately-wrong-signature' } };
  }
  if (kind === 'amount_mismatch') {
    const payload = JSON.stringify({ ...basePayload, amountMinorUnits: basePayload.amountMinorUnits + 999999 });
    const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(payload).digest('hex');
    return { rawPayload: payload, headers: { 'x-test-signature': signature } };
  }
  if (kind === 'unknown') {
    const payload = JSON.stringify({ ...basePayload, status: 'ambiguous_network_error' });
    const signature = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(payload).digest('hex');
    return { rawPayload: payload, headers: { 'x-test-signature': signature } };
  }
  throw new TypeError(`[test-only-async-provider] simulateTestOnlyWebhookEvent(): unknown kind "${kind}".`);
}

module.exports = { createTestOnlyAsyncProviderAdapter, simulateTestOnlyWebhookEvent, TEST_WEBHOOK_SECRET };
