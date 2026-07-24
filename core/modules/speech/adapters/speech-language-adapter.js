/**
 * CozyOS Speech Language Adapter
 * File Reference: core/modules/speech/adapters/speech-language-adapter.js
 * Milestone: 148 — Speech Recognition Provider Integration
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: none over the language registry. Validates a requested
 * recognition language against CozySpeech's EXISTING registerLanguage()/
 * listLanguages(), and maps it to the BCP-47 tag the browser API needs.
 * Never registers a language itself — fails closed if unregistered.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.SpeechLanguageAdapter) return;

    class SpeechLanguageAdapter {
        getVersion() { return VERSION; }

        /** resolve(languageCode) — real lookup against CozySpeech; never fabricates a match. */
        resolve(languageCode) {
            const speech = window.CozyOS.CozySpeech;
            if (!speech || typeof speech.listLanguages !== "function") {
                return { success: false, reason: "CozySpeech not available to validate against." };
            }
            const known = speech.listLanguages().find((l) => l.languageCode === languageCode);
            if (!known) {
                return { success: false, reason: `"${languageCode}" is not registered in CozySpeech.registerLanguage(). Register it there first — not fabricated here.` };
            }
            return { success: true, languageCode, bcp47: known.bcp47Tag || known.languageCode };
        }

        getIntegrationManifest() {
            return { owns: ["resolution/validation only"], doesNotOwn: ["language registry (CozySpeech)"] };
        }
    }

    window.CozyOS.SpeechLanguageAdapter = new SpeechLanguageAdapter();

    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "SpeechLanguageAdapter", type: "language",
                capabilities: ["language-validation"], offline: true, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "SpeechLanguageAdapter", category: "Platform", icon: "globe.svg",
                description: "Validates recognition language against CozySpeech's existing language registry. Registers nothing new."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
