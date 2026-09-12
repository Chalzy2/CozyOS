'use strict';

// CozyOS — M-Pesa (Daraja) Provider Adapter — BOUNDARY PREPARATION ONLY
// File Reference: server/webauthn-rp/providers/mpesa-provider.js
//
// ============================================================
// STATUS: NOT REAL RUNTIME. NEVER REGISTERED WITH THE REAL SERVER.
// ============================================================
// This file exists per Phase 5.2's explicit instruction to "prepare the
// adapter boundary" for M-Pesa (the strongest real candidate per Phase
// 5.1 discovery) — WITHOUT claiming any runtime certification. Every
// method that would need a real network call to Safaricom's Daraja API
// honestly throws "not implemented" rather than faking a response. This
// mirrors the exact disclosed-stub pattern the existing CLIENT-side
// core/modules/payment-provider/mpesa-provider.js already established —
// the same honest posture, in the server runtime, using the credential-
// shape convention that file's own configure({consumerKey,
// consumerSecret, shortcode}) already got right (confirmed against
// current official Daraja documentation during Phase 5.1 research).
//
// Per the Phase 5.2 instruction: "Don't let the absence of M-Pesa
// credentials cause Cloud to build a fake M-Pesa integration just to
// make tests pass." Accordingly:
//   - This file is NOT imported by server.js.
//   - This file is NOT registered via payments.registerProvider()
//     anywhere outside its own contract-shape test.
//   - Its own test only certifies the static CONTRACT (required methods
//     present, capabilities declared, status-mapping never guesses) —
//     never a create/webhook/refund cycle, since that would require a
//     real Daraja connection this environment does not have.
//
// REAL CREDENTIAL SHAPE (per current Daraja documentation, Phase 5.1
// research): OAuth2 client-credentials — Base64(ConsumerKey:ConsumerSecret)
// as Basic Auth to /oauth/v1/generate, returns a Bearer token (~1 hour
// TTL). STK Push requires shortcode + a Daraja-issued passkey +
// timestamp-derived password. Per this codebase's established
// credential convention (server/webauthn-rp/providers/credential-resolver.js,
// extending process.env.COZY_*), the real environment variable names
// this adapter would read once real credentials exist:
//   COZY_MPESA_CONSUMER_KEY
//   COZY_MPESA_CONSUMER_SECRET
//   COZY_MPESA_SHORTCODE
//   COZY_MPESA_PASSKEY
//   COZY_MPESA_CALLBACK_URL
//
// OPEN QUESTIONS this file deliberately does NOT resolve (Phase 5.1
// discovery gaps) — real research once credentials exist:
//   - Whether Daraja's callback authenticity relies on a payload
//     signature (HMAC-style) or IP allowlisting/network-level trust
//     instead. verifyWebhook() below is a STUB, not an answer.
//   - Exact STK Push result codes for timeout vs. explicit customer
//     cancellation vs. genuine failure — mapProviderStatus() below maps
//     currently-documented codes conservatively, defaulting anything
//     unrecognized to 'UNKNOWN', never guessing.

const { isCredentialConfigured } = require('./credential-resolver');

const REQUIRED_ENV_VARS = Object.freeze([
  'COZY_MPESA_CONSUMER_KEY',
  'COZY_MPESA_CONSUMER_SECRET',
  'COZY_MPESA_SHORTCODE',
  'COZY_MPESA_PASSKEY',
]);

function notImplemented(methodName) {
  return new Error(`[mpesa-provider] ${methodName}(): not implemented — no real Daraja API integration exists. This adapter is boundary preparation only (Phase 5.2), not a working provider.`);
}

function createMpesaProviderAdapter() {
  return {
    /** isConfigured — real check against the actual credential convention, never fabricated. */
    isConfigured() {
      return REQUIRED_ENV_VARS.every((name) => isCredentialConfigured(name));
    },

    async createPayment(_paymentDetails) {
      throw notImplemented('createPayment');
    },
    async getPayment(_providerPaymentId) {
      throw notImplemented('getPayment');
    },
    async refundPayment(_providerPaymentId, _amountMinorUnits) {
      throw notImplemented('refundPayment');
    },
    async cancelPayment(_providerPaymentId) {
      throw notImplemented('cancelPayment');
    },
    /**
     * verifyWebhook — STUB. Real implementation requires resolving the
     * open question above (signature vs. IP-allowlist authenticity)
     * with real Daraja sandbox access — not guessable from documentation
     * alone. Honestly throws rather than fabricating a result.
     */
    async verifyWebhook(_rawPayload, _headers) {
      throw notImplemented('verifyWebhook');
    },

    /**
     * getCapabilities — the one method that IS real: declaring what
     * Daraja's STK Push flow is documented to support today,
     * independent of whether credentials exist yet.
     */
    async getCapabilities() {
      return {
        card: false, mobile_money: true, bank_transfer: false, crypto: false,
        refunds: false, // Daraja reversal is a distinct, restricted operation, not a standard consumer refund API
        partial_refunds: false, payouts: false, recurring: false,
        payment_links: false, webhooks: true, // STK Push is asynchronous by design; the real result arrives via callback
      };
    },

    /**
     * mapProviderStatus — real mapping for the STK Push result codes
     * documented today, conservative for everything else.
     */
    mapProviderStatus(providerStatus) {
      const map = {
        0: 'SUCCEEDED', // ResultCode 0 = success, per current STK Push callback documentation
        1032: 'CANCELLED', // request cancelled by user (customer declined on their phone)
        1037: 'UNKNOWN', // timeout — customer did not respond in time; NOT the same as a confirmed failure
      };
      if (Object.prototype.hasOwnProperty.call(map, providerStatus)) return map[providerStatus];
      return 'UNKNOWN'; // any other/unrecognized result code: never a guess
    },
  };
}

module.exports = { createMpesaProviderAdapter, REQUIRED_ENV_VARS };
