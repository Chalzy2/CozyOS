'use strict';

// CozyOS — Server-side Cash Provider Adapter
// File Reference: server/webauthn-rp/providers/cash-provider.js
//
// The one real, fully-functional payment provider this round: cash
// requires no external API, credentials, or network connection, so
// unlike a card/mobile-money/bank/crypto adapter, this one can be
// genuinely complete and genuinely tested end to end in this
// environment — not a disclosed stub.
//
// Mirrors the shape of the existing CLIENT-side
// core/modules/payment-provider/cash-provider.js (same idea: "create
// payment" means recording that cash was received; "verify payment"
// confirms a real record exists) — but this version is server-side,
// designed to plug into PaymentRegistry (server/webauthn-rp/payments.js),
// which is what actually persists the record to the real database and
// credits the real wallet ledger. This file itself holds no state at
// all — it has nothing to persist; PaymentRegistry owns persistence.
//
// "Verify" here is intentionally trivial (cash has no external system to
// reconcile against) — it exists only so this adapter satisfies
// PaymentRegistry's REQUIRED_ADAPTER_METHODS contract, the same
// interface every future real (card/mobile-money/bank/crypto) adapter
// will also have to implement.

const crypto = require('node:crypto');

function createCashProviderAdapter() {
  return {
    /**
     * createPayment — cash "completes" the instant it's recorded: there
     * is no pending/processing state for handing someone physical
     * currency. Returns a real providerPaymentId (used by PaymentRegistry
     * as the durable reference) and the provider's own status string,
     * which mapProviderStatus() below translates to a canonical one.
     */
    async createPayment({ amountMinorUnits, currency, metadata }) {
      if (!Number.isInteger(amountMinorUnits) || amountMinorUnits <= 0) {
        throw new TypeError('[cash-provider] createPayment(): a positive integer amount is required.');
      }
      return {
        providerPaymentId: `cash_${crypto.randomUUID()}`,
        providerStatus: 'completed',
      };
    },

    /** getPayment — queries the "provider" for a payment's live status. Cash has no external system to query — this always confirms the record PaymentRegistry itself already holds (Phase 5.2 renamed this from verifyPayment across the whole contract; behavior for cash is unchanged). */
    async getPayment(providerPaymentId) {
      return { providerPaymentId, providerStatus: 'completed' };
    },

    /** refundPayment — cash refunds are a real-world hand-back of currency; this adapter has no external call to make, it only confirms the operation is meaningful for this provider type. */
    async refundPayment(providerPaymentId, amountMinorUnits) {
      if (!Number.isInteger(amountMinorUnits) || amountMinorUnits <= 0) {
        throw new TypeError('[cash-provider] refundPayment(): a positive integer amount is required.');
      }
      return { refunded: true, providerPaymentId, amountMinorUnits };
    },

    /** cancelPayment — cash that was never actually collected can simply be cancelled; no external call needed. */
    async cancelPayment(providerPaymentId) {
      return { cancelled: true, providerPaymentId };
    },

    /**
     * verifyWebhook — cash has no webhook mechanism at all (a human
     * records the payment synchronously; there is no asynchronous
     * provider event to receive). Honestly reports {valid: false} for
     * any input, exactly matching this adapter's own getCapabilities()
     * declaring webhooks: false. This method exists only to satisfy
     * PaymentRegistry's formal adapter contract, which requires every
     * adapter to implement it even if the honest answer is "not
     * applicable to this provider."
     */
    async verifyWebhook(_rawPayload, _headers) {
      return { valid: false, reason: 'cash has no webhook mechanism' };
    },

    async getCapabilities() {
      return {
        card: false, mobile_money: false, bank_transfer: false, crypto: false,
        refunds: true, partial_refunds: true, payouts: false, recurring: false,
        payment_links: false, webhooks: false, // cash has no webhook mechanism — it's recorded synchronously by a human
      };
    },

    /**
     * mapProviderStatus — the canonical status mapping layer Phase 4
     * requires (provider status -> adapter -> canonical CozyOS status).
     * Cash's own status vocabulary is simple; a future real provider's
     * adapter would have a real mapping table here instead (e.g. Stripe's
     * "requires_payment_method"/"requires_action"/"processing"/"succeeded"
     * would each map to one of PaymentRegistry's CANONICAL_STATUSES).
     */
    mapProviderStatus(providerStatus) {
      const map = {
        completed: 'SUCCEEDED',
        refunded: 'REFUNDED',
        partially_refunded: 'PARTIALLY_REFUNDED',
        cancelled: 'CANCELLED',
      };
      // Phase 5.2 final security scan fix: a plain `map[providerStatus]`
      // lookup is exploitable — providerStatus === '__proto__' or
      // 'constructor' returns a real object/function (not undefined),
      // which is truthy and bypasses the `|| 'FAILED'` fallback entirely,
      // returning something that is not a canonical status string at
      // all. Confirmed empirically before this fix. hasOwnProperty
      // guards against the whole prototype-chain lookup class.
      return Object.prototype.hasOwnProperty.call(map, providerStatus) ? map[providerStatus] : 'FAILED';
    },
  };
}

module.exports = { createCashProviderAdapter };
