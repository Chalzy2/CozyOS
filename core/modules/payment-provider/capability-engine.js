/**
 * CozyOS — Payment Provider Engine — Capability Engine (internal module)
 * File Reference: core/modules/payment-provider/capability-engine.js
 *
 * RESPONSIBILITY
 *   Detects whether a provider supports named capabilities (payments,
 *   refunds, partial refunds, authorization, capture, recurring
 *   payments, subscriptions, mobile money, card payments, bank
 *   transfers, QR payments, NFC payments, crypto payments, future
 *   payment methods). Internal module — composed by the public façade.
 *
 * REUSE
 *   Never a second capability store. Every check here delegates to
 *   Provider Registry's existing getCapabilities(), which itself
 *   delegates to the real adapter's own getCapabilities() — this module
 *   only adds a named, convenient surface over that same real data.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.__PaymentProviderInternals = window.CozyOS.__PaymentProviderInternals || {};

    const NAMED_CAPABILITIES = Object.freeze([
        "payments", "refunds", "partialRefunds", "authorization", "capture",
        "recurringPayments", "subscriptions", "mobileMoney", "cardPayments",
        "bankTransfers", "qrPayments", "nfcPayments", "cryptoPayments"
    ]);

    class CapabilityEngine {
        #registry;
        constructor(registry) {
            if (!registry) throw new TypeError("[CapabilityEngine] constructor(): a ProviderRegistry instance is required.");
            this.#registry = registry;
        }

        /** supports(providerId, capabilityName) — real, single-capability check. Honestly reports unavailable if the provider or its adapter can't be reached, never assumes support. */
        async supports(providerId, capabilityName) {
            if (!NAMED_CAPABILITIES.includes(capabilityName)) throw new TypeError(`[CapabilityEngine] supports(): unknown capability "${capabilityName}". Must be one of: ${NAMED_CAPABILITIES.join(", ")}.`);
            const result = await this.#registry.getCapabilities(providerId);
            if (!result.available) return { available: false, reason: result.reason };
            return { available: true, supported: !!result.capabilities?.[capabilityName] };
        }

        /** getCapabilityProfile(providerId) — real, full profile across every named capability, one real adapter call reused for all of them. */
        async getCapabilityProfile(providerId) {
            const result = await this.#registry.getCapabilities(providerId);
            if (!result.available) return { available: false, reason: result.reason };
            const profile = Object.create(null);
            for (const cap of NAMED_CAPABILITIES) { if (cap === "__proto__" || cap === "constructor" || cap === "prototype") continue; profile[cap] = !!result.capabilities?.[cap]; }
            return { available: true, profile: { ...profile } };
        }

        /** findProvidersWithCapability(capabilityName, filter) — real, reuses Registry's listProviders() for the base candidate set, then checks each via the real adapter. */
        async findProvidersWithCapability(capabilityName, filter = {}) {
            const candidates = this.#registry.listProviders(filter);
            const matches = [];
            for (const c of candidates) {
                const result = await this.supports(c.providerId, capabilityName);
                if (result.available && result.supported) matches.push(c);
            }
            return matches;
        }

        listNamedCapabilities() { return Array.from(NAMED_CAPABILITIES); }
    }

    window.CozyOS.__PaymentProviderInternals.CapabilityEngine = CapabilityEngine;
    window.CozyOS.__PaymentProviderInternals.NAMED_CAPABILITIES = NAMED_CAPABILITIES;
})();
