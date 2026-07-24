/**
 * CozyOS Speech Preview Adapter
 * File Reference: core/modules/speech/adapters/speech-preview-adapter.js
 * Milestone: 148 — Speech Recognition Provider Integration
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: real diagnostics only — Test Microphone (delegates to the
 * existing VoiceCaptureAdapter), Recognition Demo (delegates to the real
 * SpeechRecognitionAdapter for one short pass), and Recognition Status.
 * Never fakes a transcript or a microphone reading.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.SpeechPreviewAdapter) return;

    class SpeechPreviewAdapter {
        getVersion() { return VERSION; }

        /** testMicrophone() — real, delegates to VoiceCaptureAdapter; stops immediately after confirming access. */
        async testMicrophone() {
            const capture = window.CozyOS.VoiceCaptureAdapter;
            if (!capture) return { success: false, reason: "VoiceCaptureAdapter not available." };
            const result = await capture.startCapture();
            if (result.success) capture.stopCapture();
            return result;
        }

        /**
         * recognitionDemo(config) — real, short-lived use of SpeechRecognitionAdapter.
         * Returns whatever the browser actually produces, or isReal:false if
         * unsupported. Never simulates a transcript.
         */
        recognitionDemo(config = {}) {
            const rec = window.CozyOS.SpeechRecognitionAdapter;
            if (!rec) return { success: false, isReal: false, reason: "SpeechRecognitionAdapter not available." };
            if (!rec.isReal()) return { success: false, isReal: false, reason: "Browser has no SpeechRecognition API. Not fabricated." };
            return rec.start({ ...config, continuous: false, interimResults: true });
        }

        recognitionStatus() {
            const rec = window.CozyOS.SpeechRecognitionAdapter;
            const cap = window.CozyOS.SpeechCapabilityAdapter;
            return {
                adapterPresent: !!rec,
                active: rec ? rec.isActive() : false,
                capabilities: cap ? cap.getCapabilities() : null
            };
        }

        getIntegrationManifest() {
            return { owns: ["diagnostics only"], doesNotOwn: ["microphone (VoiceCaptureAdapter)", "recognition (SpeechRecognitionAdapter)"] };
        }
    }

    window.CozyOS.SpeechPreviewAdapter = new SpeechPreviewAdapter();

    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "SpeechPreviewAdapter", type: "preview",
                capabilities: ["test-microphone", "recognition-demo", "recognition-status"], offline: false, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "SpeechPreviewAdapter", category: "Platform", icon: "activity.svg",
                description: "Real mic test and recognition demo diagnostics. Delegates to VoiceCaptureAdapter/SpeechRecognitionAdapter — never fakes a transcript."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
