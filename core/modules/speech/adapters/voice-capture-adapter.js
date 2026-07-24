/**
 * CozyOS Voice Capture Adapter
 * File Reference: core/modules/speech/adapters/voice-capture-adapter.js
 * Milestone: 147 (reframed) — Speech Platform Adapter
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: real microphone acquisition (getUserMedia) and buffering only.
 * Does NOT own sessions, streams, sources, or languages — those remain
 * owned by core/modules/speech/cozy-speech.js. This file registers itself
 * as a real adapter + source with the EXISTING registries (registerAdapter/
 * registerSource), it does not create new ones (Rule 1/Rule 6).
 * Does NOT perform recognition, transcription, or any AI inference.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoiceCaptureAdapter) return;

    class VoiceCaptureAdapter {
        #stream = null;
        #sourceId = null;
        #adapterId = null;

        getVersion() { return VERSION; }

        isSupported() {
            return typeof navigator !== "undefined" &&
                !!navigator.mediaDevices &&
                typeof navigator.mediaDevices.getUserMedia === "function";
        }

        #emit(event, detail) {
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`voice-capture:${event}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        async startCapture(constraints) {
            if (!this.isSupported()) return { success: false, reason: "getUserMedia not available in this environment." };
            if (this.#stream) return { success: false, reason: "Capture already active. Call stopCapture() first." };
            try {
                this.#stream = await navigator.mediaDevices.getUserMedia(constraints || { audio: true, video: false });
                this.#emit("started", { trackCount: this.#stream.getAudioTracks().length });
                return { success: true, stream: this.#stream };
            } catch (err) {
                const result = { success: false, reason: `Real getUserMedia rejection: ${err && err.message ? err.message : String(err)}` };
                this.#emit("start-failed", result);
                return result;
            }
        }

        stopCapture() {
            if (!this.#stream) return { success: true, reason: "No active capture." };
            try { this.#stream.getTracks().forEach((t) => t.stop()); } finally { this.#stream = null; }
            this.#emit("stopped", {});
            return { success: true };
        }

        getStream() { return this.#stream; }

        getIntegrationManifest() {
            return {
                owns: ["real microphone acquisition", "stream lifecycle"],
                doesNotOwn: ["sessions", "streams (CozySpeech)", "sources (CozySpeech)", "recognition", "transcription"],
                registersWith: ["CozySpeech.registerAdapter()", "CozySpeech.registerSource()"]
            };
        }
    }

    window.CozyOS.VoiceCaptureAdapter = new VoiceCaptureAdapter();

    // Register with the EXISTING CozySpeech registries (metadata only — no
    // functions), so the adapter is discoverable through the canonical
    // coordinator instead of creating a parallel one.
    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            const adapterId = window.CozyOS.CozySpeech.registerAdapter({
                name: "VoiceCaptureAdapter", type: "capture",
                capabilities: ["microphone-acquisition", "browser-getUserMedia"],
                offline: true, version: VERSION
            });
            if (typeof window.CozyOS.CozySpeech.registerSource === "function") {
                window.CozyOS.CozySpeech.registerSource({
                    label: "Browser Microphone (VoiceCaptureAdapter)",
                    type: "wired_microphone",
                    adapterId
                });
            }
        } catch (_err) { /* non-fatal */ }
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "VoiceCaptureAdapter", category: "Platform", icon: "mic.svg",
                description: "Real microphone capture adapter for CozySpeech. No recognition. Registers with CozySpeech's existing adapter/source registries — no new microphone owner."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
