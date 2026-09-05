'use strict';
const crypto = require('node:crypto');
const { verifyWebhookSignature } = require('../payments');

// CozyOS — Crypto Provider Adapter (Phase 5.3)
// File Reference: server/webauthn-rp/providers/crypto-provider.js
//
// Conforms to the standard PaymentRegistry adapter contract
// (createPayment/getPayment/refundPayment/cancelPayment/verifyWebhook/
// getCapabilities/mapProviderStatus), but its shape is different from
// every other adapter: crypto verification in this architecture is
// PULL-based, not PUSH-based — CozyOS itself independently checks the
// blockchain (see crypto-payments.js's verifyTransaction()) rather than
// a provider calling us. There is no genuine external webhook for
// crypto in this design at all.
//
// Because of that, "verifyWebhook" here is repurposed as a real,
// signed INTERNAL event channel: crypto-payments.js signs a small
// payload with an internal secret (generated fresh per server process,
// never derived from or confused with a real provider credential) after
// its own real, independent verification succeeds, and calls
// PaymentRegistry.processProviderEvent('crypto', payload, headers) —
// which routes through this adapter's verifyWebhook() exactly like any
// other provider event would. This closes a real gap: without this
// signing step, anything that could reach processProviderEvent()
// directly could forge a "crypto payment succeeded" event for
// provider_id='crypto'. Reuses the same real HMAC primitive
// (verifyWebhookSignature(), Phase 4) rather than inventing a second
// authenticity mechanism.
//
// createPayment()/getPayment() are intentionally NOT the real entry
// point for crypto — server/webauthn-rp/crypto-payments.js's
// createCryptoPaymentIntent() is, because it needs asset/network/
// destination-resolution logic no generic adapter interface can
// express. This adapter's createPayment() exists only so PaymentRegistry's
// generic createPaymentIntent() call inside createCryptoPaymentIntent()
// has something real to call — it simply reports PENDING (a crypto
// payment is never synchronously complete) with no side effects.

function createCryptoProviderAdapter({ internalEventSecret }) {
  if (typeof internalEventSecret !== 'string' || internalEventSecret.length < 16) {
    throw new TypeError('[crypto-provider] internalEventSecret must be a real, sufficiently long string, generated fresh per process — never a fixed literal.');
  }

  return {
    async createPayment(_paymentDetails) {
      // Real crypto payments are never synchronously complete — the
      // customer has not sent anything yet at intent-creation time.
      return { providerPaymentId: `crypto_${crypto.randomUUID()}`, providerStatus: 'pending' };
    },
    async getPayment(providerPaymentId) {
      return { providerPaymentId, providerStatus: 'pending' };
    },
    async refundPayment(_providerPaymentId, _amountMinorUnits) {
      // Crypto refunds require sending real crypto back to a customer
      // address CozyOS does not necessarily have — genuinely a distinct,
      // manual/administrative operation, not modeled as a standard
      // refund this round. Honest, not a fabricated success.
      throw new Error('[crypto-provider] refundPayment(): crypto refunds require a real, distinct manual process — not implemented as an automatic operation.');
    },
    async cancelPayment(_providerPaymentId) {
      return { cancelled: true };
    },
    /**
     * verifyWebhook — real signature verification, but of an INTERNAL
     * event (see file header), not an external provider webhook. Reuses
     * verifyWebhookSignature() (Phase 4) exactly as any HMAC-based
     * external adapter would.
     */
    async verifyWebhook(rawPayload, headers = {}) {
      const signature = headers['x-crypto-internal-signature'];
      const valid = verifyWebhookSignature({ payload: rawPayload, signature, secret: internalEventSecret });
      if (!valid) return { valid: false, reason: 'invalid_internal_signature' };
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
        card: false, mobile_money: false, bank_transfer: false, crypto: true,
        refunds: false, partial_refunds: false, payouts: false, recurring: false,
        payment_links: false, webhooks: false, // no genuine external webhook exists for this provider — see file header
      };
    },
    mapProviderStatus(providerStatus) {
      const map = { pending: 'PENDING', succeeded: 'SUCCEEDED', failed: 'FAILED', cancelled: 'CANCELLED', expired: 'EXPIRED' };
      return Object.prototype.hasOwnProperty.call(map, providerStatus) ? map[providerStatus] : 'UNKNOWN';
    },
  };
}

/**
 * signInternalCryptoEvent — helper used by crypto-payments.js to
 * produce the (payload, headers) pair verifyWebhook() above expects.
 * Kept here, next to verifyWebhook(), so the signing and verification
 * halves of this internal mechanism are never allowed to drift apart.
 */
function signInternalCryptoEvent(payloadObject, internalEventSecret) {
  const payload = JSON.stringify(payloadObject);
  const signature = crypto.createHmac('sha256', internalEventSecret).update(payload).digest('hex');
  return { rawPayload: payload, headers: { 'x-crypto-internal-signature': signature } };
}

module.exports = { createCryptoProviderAdapter, signInternalCryptoEvent };
