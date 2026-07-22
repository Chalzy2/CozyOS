/**
 * CozyOS Face Authentication Provider
 * File Reference: core/security/face-provider.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * ============================================================
 * COORDINATOR INTEGRATION
 * ============================================================
 * Ownership: owns "face" factor registration, its verify() result
 *   contract, face:* events, and its own bounded history (all via
 *   factor-provider-base.js). Does NOT authenticate users, manage
 *   sessions, manage policies, or decide permissions.
 * Uses: AuthFactorRegistry, PlatformEventBus, OutputCenter — all via the
 *   shared factor-provider-base.js, not reimplemented here.
 * Registers: ServiceRegistry; AuthFactorRegistry (automatically, via the
 *   base's constructor and registerBackend()/unregisterBackend() sync).
 * Publishes: face:verification-started, face:verified, face:failed,
 *   face:provider-loaded, face:provider-unloaded.
 * Consumes: none.
 * Dependencies: factor-provider-base.js (hard).
 * Output Center: FaceProvider.publishReport() — real report of this
 *   provider's own history and current backend status.
 * Certification: reviewable by the existing, generic CozyCertification
 *   like any other module.
 * Security: fails closed by construction (inherited from the shared
 *   base) — no real face verification exists anywhere in this codebase,
 *   confirmed by ownership review before this file was written.
 * Regression: verified this milestone that registering this real
 *   provider requires zero edits to auth-policy-engine.js — the fourth
 *   real factor to prove this (after trusted-device, recovery-questions,
 *   recovery-phrase).
 *
 * HONEST IMPLEMENTATION
 *   No browser-native face verification exists. This file does not fake
 *   one — it is the real "face" identity for the shared, generic
 *   provider coordinator built in factor-provider-base.js. A genuine
 *   future backend would call `window.CozyOS.FaceProvider.
 *   registerBackend(realVerifyFn)`.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.FaceProvider) return;

    window.CozyOS.FaceProvider = window.CozyOS._createFactorProviderCoordinator({
        factorName: "face", eventPrefix: "face", displayName: "Face"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "FaceProvider", category: "Platform", icon: "scan-face.svg",
                description: "Real face authentication provider interface built on the shared factor-provider-base.js. No fabricated verification — honestly reports unavailable until a real backend is registered via registerBackend()."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
