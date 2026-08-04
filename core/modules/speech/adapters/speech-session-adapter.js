/**
 * CozyOS Speech Session Adapter
 * File Reference: core/modules/speech/adapters/speech-session-adapter.js
 * Milestone: 148 — Speech Recognition Provider Integration
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: none over session state. Every method here is a thin
 * pass-through to CozySpeech's EXISTING session lifecycle
 * (createSpeechSession/startSpeechSession/pauseSpeechSession/
 * resumeSpeechSession/stopSpeechSession/endSpeechSession). This file adds
 * no parallel session store — "Session ownership remains CozySpeech."
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.SpeechSessionAdapter) return;

    function _speech() { return window.CozyOS.CozySpeech || null; }

    class SpeechSessionAdapter {
        getVersion() { return VERSION; }

        createRecognitionSession(config = {}) {
            const speech = _speech();
            if (!speech || typeof speech.createSpeechSession !== "function") {
                return { success: false, reason: "CozySpeech not available." };
            }
            try {
                const sessionId = speech.createSpeechSession({ ...config, environment: config.environment || "recognition" });
                return { success: true, sessionId };
            } catch (err) {
                return { success: false, reason: err && err.message ? err.message : String(err) };
            }
        }

        start(sessionId) { return this.#delegate("startSpeechSession", sessionId); }
        pause(sessionId) { return this.#delegate("pauseSpeechSession", sessionId); }
        resume(sessionId) { return this.#delegate("resumeSpeechSession", sessionId); }
        stop(sessionId) { return this.#delegate("stopSpeechSession", sessionId); }
        end(sessionId) { return this.#delegate("endSpeechSession", sessionId); }

        #delegate(method, sessionId) {
            const speech = _speech();
            if (!speech || typeof speech[method] !== "function") return { success: false, reason: "CozySpeech not available." };
            try {
                speech[method](sessionId);
                return { success: true, sessionId };
            } catch (err) {
                return { success: false, reason: err && err.message ? err.message : String(err) };
            }
        }

        getIntegrationManifest() {
            return { owns: ["pass-through only"], doesNotOwn: ["session state, lifecycle, or storage (CozySpeech)"] };
        }
    }

    window.CozyOS.SpeechSessionAdapter = new SpeechSessionAdapter();

    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "SpeechSessionAdapter", type: "session",
                capabilities: ["recognition-session-delegation"], offline: true, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/speech/adapters/speech-session-adapter.js",
                name: "SpeechSessionAdapter", category: "Platform", icon: "list.svg",
                description: "Thin pass-through to CozySpeech's existing session lifecycle for recognition sessions. No parallel session store."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
