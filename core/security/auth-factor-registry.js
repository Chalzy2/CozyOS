/**
 * CozyOS Authentication Factor Registry
 * File Reference: core/security/auth-factor-registry.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single, real source of truth for "which authentication factors
 *   exist and what can currently verify them." `AuthPolicyEngine` asks
 *   this registry "do you have a provider for X" rather than knowing
 *   anything about Face, Voice, or any other specific factor itself —
 *   the same Rule 80/81 discipline this project has applied to formulas
 *   (one source of truth, composition over duplication), applied here to
 *   authentication factors.
 *
 * HONEST DISTINCTION, LOAD-BEARING
 *   "Registered" and "functional" are two different, real things, and
 *   this file keeps them visibly separate rather than conflating a name
 *   existing with a capability existing. Every factor below is a real,
 *   registered NAME with a real provider object — but `isReal: false`
 *   honestly marks every provider that cannot currently perform genuine
 *   verification (Face/Fingerprint/Voice/Google Account/Device
 *   Certificate/Security Key/OTP all fall in this category in this
 *   static, client-side environment). Registering a factor name is not
 *   the same claim as the factor working.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const FACTOR_REGISTRY_VERSION = "1.0.0-ENTERPRISE";

    function makeStubProvider(factorName, note) {
        return {
            factorName, isReal: false, note: note || `No real ${factorName} provider exists yet in this static, client-side environment.`,
            async verify(_context) { return { available: false, verified: false, reason: note || `${factorName} verification is not implemented.` }; }
        };
    }

    class CozyAuthFactorRegistry {
        #providers = new Map(); // factorName -> {factorName, isReal, note, verify}

        constructor() {
            // Real, pre-registered factor NAMES — matching the requested
            // checklist. Every one is a real entry in this registry;
            // "isReal: false" honestly marks which ones have no genuine
            // verification capability yet.
            const initial = [
                ["face", "No real biometric hardware access exists in this static, client-side environment."],
                ["fingerprint", "No real biometric hardware access exists in this static, client-side environment."],
                ["voice", "No real voice-sample verification exists anywhere in this codebase."],
                ["trusted-device", "No real device-trust mechanism exists yet — see AdminRecoveryPolicy (not yet built)."],
                ["recovery-questions", "No real recovery-question storage/verification exists yet."],
                ["recovery-phrase", "No real recovery-phrase storage/verification exists yet."],
                ["google-account", "No real OAuth round-trip is possible — no server exists to hold a client secret."],
                ["device-certificate", "No real device-certificate issuance/verification exists yet."],
                ["security-key", "No real FIDO2/WebAuthn integration exists yet (future factor)."],
                ["otp", "No real one-time-passcode delivery mechanism exists yet (future factor)."]
            ];
            for (const [name, note] of initial) this.#providers.set(name, makeStubProvider(name, note));
        }

        getVersion() { return FACTOR_REGISTRY_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        /**
         * registerFactor(factorName, provider)
         *   Real — allows a genuine future provider (e.g. a real
         *   WebAuthn-backed security-key check) to replace a stub, or a
         *   brand-new factor name to be introduced without ever touching
         *   `AuthPolicyEngine`'s own code. Fails closed on a malformed
         *   provider.
         */
        registerFactor(factorName, provider) {
            if (!factorName || typeof provider?.verify !== "function") {
                return { success: false, reason: "A real factorName string and a provider with a real verify() function are both required." };
            }
            this.#providers.set(factorName, { factorName, isReal: provider.isReal === true, note: provider.note || null, verify: provider.verify });
            return { success: true };
        }

        /** hasProvider(factorName) — real existence check, used by AuthPolicyEngine instead of it knowing about factors directly. */
        hasProvider(factorName) { return this.#providers.has(factorName); }

        /** getProvider(factorName) — real lookup; returns the actual provider (including its real verify function) or null. */
        getProvider(factorName) { return this.#providers.get(factorName) || null; }

        /** listFactors() — real, current registry contents, honestly distinguishing registered-name from functional. */
        listFactors() {
            return [...this.#providers.values()].map(p => ({ factorName: p.factorName, isReal: p.isReal, note: p.note }));
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: FACTOR_REGISTRY_VERSION, totalFactors: this.#providers.size, realProviders: this.listFactors().filter(f => f.isReal).length, factors: this.listFactors() });
        }
    }

    if (window.CozyOS.AuthFactorRegistry && typeof window.CozyOS.AuthFactorRegistry.getVersion === "function") {
        const existingVersion = window.CozyOS.AuthFactorRegistry.getVersion();
        if (existingVersion !== FACTOR_REGISTRY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: AuthFactorRegistry existing v${existingVersion} conflicts with load target v${FACTOR_REGISTRY_VERSION}.`);
        return;
    }

    window.CozyOS.AuthFactorRegistry = new CozyAuthFactorRegistry();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "AuthFactorRegistry", category: "Platform", icon: "list.svg",
                description: "Real, single source of truth for which authentication factors exist and what can currently verify them. AuthPolicyEngine asks this registry rather than knowing about specific factors directly. 'Registered' and 'functional' are kept visibly distinct — isReal:false honestly marks every factor with no genuine verification capability yet."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
