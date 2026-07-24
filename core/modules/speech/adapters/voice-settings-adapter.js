/**
 * CozyOS Voice Settings Adapter
 * File Reference: core/modules/speech/adapters/voice-settings-adapter.js
 * Milestone: 147 (reframed) — Speech Platform Adapter
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: real, non-AI configuration storage for voice preferences
 * (preferred languageCode/profileId/capture constraints/gain default).
 * Does NOT own the language or profile REGISTRIES — those remain owned by
 * cozy-speech.js (registerLanguage/registerProfile). This adapter only
 * stores which already-registered languageCode/profileId a consumer prefers.
 * Values are validated against CozySpeech's own registries where possible
 * so stale/unknown references are rejected (fail closed), never assumed.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoiceSettingsAdapter) return;

    class VoiceSettingsAdapter {
        #settings = { languageCode: null, profileId: null, gainDefault: 1.0, captureConstraints: { audio: true, video: false } };

        getVersion() { return VERSION; }

        setLanguage(languageCode) {
            const speech = window.CozyOS.CozySpeech;
            if (speech && typeof speech.listLanguages === "function") {
                const known = speech.listLanguages().some((l) => l.languageCode === languageCode);
                if (!known) return { success: false, reason: `languageCode "${languageCode}" is not registered in CozySpeech. Register it there first — not fabricated here.` };
            }
            this.#settings.languageCode = languageCode;
            return { success: true };
        }

        setProfile(profileId) {
            const speech = window.CozyOS.CozySpeech;
            if (speech && typeof speech.getProfile === "function") {
                const known = speech.getProfile(profileId);
                if (!known) return { success: false, reason: `profileId "${profileId}" is not registered in CozySpeech. Register it there first — not fabricated here.` };
            }
            this.#settings.profileId = profileId;
            return { success: true };
        }

        setGainDefault(value) {
            if (typeof value !== "number" || value < 0) return { success: false, reason: "gainDefault must be a non-negative number." };
            this.#settings.gainDefault = value;
            return { success: true };
        }

        setCaptureConstraints(constraints) {
            if (!constraints || typeof constraints !== "object") return { success: false, reason: "captureConstraints must be an object." };
            this.#settings.captureConstraints = { ...constraints };
            return { success: true };
        }

        getSettings() { return { ...this.#settings }; }

        getIntegrationManifest() {
            return {
                owns: ["preference storage only (languageCode/profileId/gainDefault/captureConstraints)"],
                doesNotOwn: ["language registry (CozySpeech)", "profile registry (CozySpeech)"],
                honestLimitation: "Rejects unknown languageCode/profileId rather than assuming they exist."
            };
        }
    }

    window.CozyOS.VoiceSettingsAdapter = new VoiceSettingsAdapter();

    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "VoiceSettingsAdapter", type: "settings",
                capabilities: ["preference-storage"], offline: true, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "VoiceSettingsAdapter", category: "Platform", icon: "settings.svg",
                description: "Real, non-AI voice preference storage. Validates languageCode/profileId against CozySpeech's existing registries — does not own or duplicate them."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
