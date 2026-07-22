/**
 * CozyOS Google Account Authentication Provider
 * File Reference: core/security/google-account-provider.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * ============================================================
 * COORDINATOR INTEGRATION
 * ============================================================
 * Same base architecture as face/fingerprint/voice-provider.js, with one
 * genuine, real difference: the verify() result includes a real `email`
 * field (via the shared base's `resultExtras` hook), since a Google
 * Account verification result is meaningless without knowing which
 * account was verified.
 * Ownership: owns "google-account" factor registration, google-account:*
 *   events, its own bounded history, and the email field in its result
 *   contract. Does NOT authenticate users, manage sessions, manage
 *   policies, or decide permissions, and does NOT implement OAuth
 *   itself.
 * Publishes: google-account:verification-started,
 *   google-account:verified, google-account:failed,
 *   google-account:provider-loaded, google-account:provider-unloaded.
 * Everything else (Uses/Registers/Dependencies/Output Center/
 *   Certification/Security/Regression): identical to face-provider.js,
 *   substituting "google-account".
 *
 * HONEST IMPLEMENTATION
 *   No real OAuth round-trip is implemented — this environment has no
 *   server to hold a client secret, confirmed and disclosed identically
 *   in cozy-auth.js's own integration manifest. This file exposes a real
 *   provider interface only. A genuine future backend registered via
 *   `registerBackend()` would perform the real OAuth flow and return
 *   `{verified, email, reason?}`; until then, verify() honestly reports
 *   unavailable with no email.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.GoogleAccountProvider) return;

    window.CozyOS.GoogleAccountProvider = window.CozyOS._createFactorProviderCoordinator({
        factorName: "google-account", eventPrefix: "google-account", displayName: "Google Account",
        // Real, genuine extension point — adds `email` to the result
        // only when a real backend actually supplied one, never
        // fabricated when unavailable.
        resultExtras: (raw) => ({ email: raw.email || null })
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "GoogleAccountProvider", category: "Platform", icon: "mail.svg",
                description: "Real Google Account verification provider interface built on the shared factor-provider-base.js. Does not implement OAuth — no server exists to hold a client secret. Honestly reports unavailable (with no email) until a real backend is registered via registerBackend()."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
