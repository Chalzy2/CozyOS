/**
 * CozyOS Voice Capability Stub
 * File Reference: core/modules/speech/adapters/voice-capability-stub.js
 * Milestone: 147 (reframed) — Speech Platform Adapter
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: honest DEFERRED status for capabilities that Milestone 147
 * lists but that have no real backend available in this offline,
 * no-network environment: voice STYLE selection, EMOTION analysis,
 * ACCENT detection, and audio PREVIEW synthesis.
 *
 * RUNTIME RULE (per milestone spec): "Do not fabricate ... If no backend
 * exists: Return isReal = false. Fail closed." This file is that honest
 * report, consolidated into one place rather than four separate files
 * each independently claiming a capability that doesn't exist yet.
 *
 * Each call below returns { success: false, isReal: false, deferred: true }
 * and never simulates a plausible-looking result.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoiceCapabilityStub) return;

    const DEFERRED_CAPABILITIES = ["style-selection", "emotion-analysis", "accent-detection", "audio-preview-synthesis"];

    function _deferred(capability) {
        return Object.freeze({
            success: false, isReal: false, deferred: true, capability,
            reason: `No real backend for "${capability}" exists in this environment. Not fabricated — fails closed.`
        });
    }

    class VoiceCapabilityStub {
        getVersion() { return VERSION; }
        selectStyle(_styleId) { return _deferred("style-selection"); }
        analyzeEmotion(_audioSample) { return _deferred("emotion-analysis"); }
        detectAccent(_audioSample) { return _deferred("accent-detection"); }
        previewSynthesis(_text, _voiceId) { return _deferred("audio-preview-synthesis"); }
        listDeferredCapabilities() { return DEFERRED_CAPABILITIES.slice(); }
        getIntegrationManifest() {
            return {
                owns: ["honest DEFERRED reporting for style/emotion/accent/preview"],
                doesNotOwn: ["any real style/emotion/accent/preview backend — none exists yet"],
                honestLimitation: "Every method here returns isReal:false by design. Do not wire these into policy or UI as if real."
            };
        }
    }

    window.CozyOS.VoiceCapabilityStub = new VoiceCapabilityStub();

    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "VoiceCapabilityStub", type: "capability-stub",
                capabilities: DEFERRED_CAPABILITIES, offline: true, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "VoiceCapabilityStub", category: "Platform", icon: "mic-off.svg",
                description: "Honest DEFERRED status for style/emotion/accent/preview — no real backend exists. Fails closed; never fabricates a result."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
