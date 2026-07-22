/**
 * CozyOS Fingerprint Authentication Provider
 * File Reference: core/security/fingerprint-provider.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * ============================================================
 * COORDINATOR INTEGRATION
 * ============================================================
 * Identical architecture to face-provider.js — only ownership changes
 * (the "fingerprint" factor instead of "face"), per the explicit
 * instruction not to duplicate that file's logic. All real behavior
 * (registration, honest-default verification, events, history,
 * reporting) is inherited from the shared factor-provider-base.js.
 * Ownership: owns "fingerprint" factor registration, fingerprint:*
 *   events, and its own bounded history. Does NOT authenticate users,
 *   manage sessions, manage policies, or decide permissions.
 * Uses / Registers / Dependencies / Output Center / Certification /
 *   Security / Regression: identical to face-provider.js, substituting
 *   "fingerprint" for "face" throughout.
 * Publishes: fingerprint:verification-started, fingerprint:verified,
 *   fingerprint:failed, fingerprint:provider-loaded,
 *   fingerprint:provider-unloaded.
 *
 * HONEST IMPLEMENTATION
 *   No browser-native fingerprint verification exists. This file does
 *   not fake one — see face-provider.js's header for the full, shared
 *   rationale (identical here).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.FingerprintProvider) return;

    window.CozyOS.FingerprintProvider = window.CozyOS._createFactorProviderCoordinator({
        factorName: "fingerprint", eventPrefix: "fingerprint", displayName: "Fingerprint"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "FingerprintProvider", category: "Platform", icon: "fingerprint.svg",
                description: "Real fingerprint authentication provider interface built on the shared factor-provider-base.js. No fabricated verification — honestly reports unavailable until a real backend is registered via registerBackend()."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
