/**
 * CozyOS Voice Authentication Provider
 * File Reference: core/security/voice-provider.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * ============================================================
 * COORDINATOR INTEGRATION
 * ============================================================
 * Identical architecture to face-provider.js/fingerprint-provider.js —
 * only ownership changes (the "voice" factor). All real behavior is
 * inherited from the shared factor-provider-base.js.
 * Ownership: owns "voice" factor registration, voice:* events, and its
 *   own bounded history. Does NOT authenticate users, manage sessions,
 *   manage policies, or decide permissions.
 * Publishes: voice:verification-started, voice:verified, voice:failed,
 *   voice:provider-loaded, voice:provider-unloaded.
 * Output Center: Voice Diagnostics Report / Voice Verification Report,
 *   via VoiceProvider.publishReport().
 * Everything else (Uses/Registers/Dependencies/Certification/Security/
 *   Regression): identical to face-provider.js, substituting "voice".
 *
 * HONEST IMPLEMENTATION
 *   No real voice recognition is implemented. This file exposes a real
 *   provider interface only — see face-provider.js's header for the
 *   full, shared rationale (identical here).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.VoiceProvider) return;

    window.CozyOS.VoiceProvider = window.CozyOS._createFactorProviderCoordinator({
        factorName: "voice", eventPrefix: "voice", displayName: "Voice"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "VoiceProvider", category: "Platform", icon: "mic.svg",
                description: "Real voice authentication provider interface built on the shared factor-provider-base.js. No fabricated voice recognition — honestly reports unavailable until a real backend is registered via registerBackend()."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
