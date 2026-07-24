/**
 * CozyOS Speech Command Adapter
 * File Reference: core/modules/speech/adapters/speech-command-adapter.js
 * Milestone: 148 — Speech Recognition Provider Integration
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: optional "command mode" flag on top of SpeechRecognitionAdapter.
 * Does NOT interpret, match, or route text to any command ("Open Wallet",
 * "Go Home", etc.). It only tags final transcripts as command-mode output
 * and forwards the raw text — intent handling belongs to a future AI
 * milestone, per spec: "Recognition only reports text. Do not interpret
 * commands."
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.SpeechCommandAdapter) return;

    class SpeechCommandAdapter {
        #enabled = false;
        #listeners = [];

        getVersion() { return VERSION; }

        enable() {
            if (this.#enabled) return { success: true, alreadyEnabled: true };
            const rec = window.CozyOS.SpeechRecognitionAdapter;
            if (!rec || typeof rec.on !== "function") return { success: false, reason: "SpeechRecognitionAdapter not available." };
            rec.on("onFinalResult", (payload) => {
                const commandPayload = { ...payload, mode: "command", interpreted: false };
                this.#listeners.forEach((h) => { try { h(commandPayload); } catch (_err) { /* non-fatal */ } });
                if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                    try { window.CozyOS.PlatformEventBus.emit("speech-command:text", commandPayload); } catch (_err) { /* non-fatal */ }
                }
            });
            this.#enabled = true;
            return { success: true };
        }

        onCommandText(handler) { this.#listeners.push(handler); return { success: true }; }
        isEnabled() { return this.#enabled; }

        getIntegrationManifest() {
            return {
                owns: ["command-mode tagging of raw transcript text"],
                doesNotOwn: ["command interpretation, matching, or routing — reserved for a future AI milestone"],
                honestLimitation: "Every payload has interpreted:false. This file never decides what a command 'means'."
            };
        }
    }

    window.CozyOS.SpeechCommandAdapter = new SpeechCommandAdapter();

    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "SpeechCommandAdapter", type: "command",
                capabilities: ["command-mode-text-tagging"], offline: false, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "SpeechCommandAdapter", category: "Platform", icon: "terminal.svg",
                description: "Tags final transcripts as command-mode text. Performs no interpretation — intent handling is a future AI milestone."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
