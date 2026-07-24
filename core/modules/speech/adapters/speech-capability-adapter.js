/**
 * CozyOS Speech Capability Adapter
 * File Reference: core/modules/speech/adapters/speech-capability-adapter.js
 * Milestone: 148 — Speech Recognition Provider Integration
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: real, honest feature detection only. No recognition logic.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.SpeechCapabilityAdapter) return;

    function _api() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }

    class SpeechCapabilityAdapter {
        getVersion() { return VERSION; }

        getCapabilities() {
            const Api = _api();
            const supportsRecognition = !!Api;
            return Object.freeze({
                supportsRecognition,
                // continuous/interimResults/lang are real, settable properties on the
                // SpeechRecognition spec whenever the constructor exists at all.
                supportsContinuousRecognition: supportsRecognition,
                supportsInterimResults: supportsRecognition,
                // confidence is part of the SpeechRecognitionResult spec, but actual
                // per-device accuracy of the value is not verifiable from JS — we only
                // report whether the field is expected to be present, never a score.
                supportsConfidence: supportsRecognition,
                supportsLanguageSelection: supportsRecognition,
                // No browser JS API reliably reports whether recognition runs
                // on-device vs. cloud-backed. Never assumed — fails closed to false.
                supportsOfflineRecognition: false,
                isReal: supportsRecognition,
                honestLimitation: supportsRecognition
                    ? "supportsOfflineRecognition is always false: no client-side API can verify on-device vs. cloud-backed recognition."
                    : "No SpeechRecognition/webkitSpeechRecognition constructor found in this environment. All capabilities false — not fabricated."
            });
        }

        getIntegrationManifest() {
            return { owns: ["real feature detection"], doesNotOwn: ["recognition", "sessions", "languages"] };
        }
    }

    window.CozyOS.SpeechCapabilityAdapter = new SpeechCapabilityAdapter();

    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "SpeechCapabilityAdapter", type: "capability",
                capabilities: ["feature-detection"], offline: true, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "SpeechCapabilityAdapter", category: "Platform", icon: "check-circle.svg",
                description: "Real, honest feature detection for browser SpeechRecognition. Never assumes offline support."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
