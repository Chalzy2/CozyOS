/**
 * CozyOS Voice Engine
 * File Reference: core/engines/voice/voice-engine.js
 * Milestone: 180B — Developer Identity Voice Integration (new capability,
 * no existing owner — same pattern as WakeWordEngine, Milestone 179)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP (scoped honestly to what this milestone actually builds):
 *   Owns: recognizing when a final speech transcript is a
 *   developer/project-identity question ("who created you", "why was
 *   CozyOS built", "why Africa"), delegating it to the single canonical
 *   owner (window.CozyOS.DeveloperIdentity, core/identity/), and handing
 *   the resulting answer to CozySpeech for synthesis.
 *   Does NOT own: general voice session management, streams, or sources
 *   (core/modules/speech/cozy-speech.js), speech recognition itself
 *   (SpeechRecognitionAdapter), wake-phrase detection (WakeWordEngine),
 *   STT/TTS provider internals or Voice Profiles/Voice Settings storage
 *   (CozySpeech) — this file only reads/plays through those existing,
 *   real APIs. It does NOT implement general-purpose command routing or
 *   arbitrary conversational voice interaction; that remains out of
 *   scope (see Gate 1/Gate 4 of Milestone-180B-Continuation.md).
 *
 * Real detection mechanism: subscribes to the EXISTING
 * "speech-recognition:onFinalResult" PlatformEventBus event already
 * emitted by SpeechRecognitionAdapter (core/modules/speech/adapters/
 * speech-recognition-adapter.js) — no new event system, no new
 * recognition path invented.
 *
 * Real synthesis mechanism: hands the DeveloperIdentity answer text to
 * CozySpeech.previewVoice({ text, settingsId }) — the existing, real
 * text-to-speech hook (Milestone 147/149) that plays through whatever
 * real TTS backend is registered (e.g. cozy-tts-browser-adapter.js).
 * Honestly reports { available:false } when no such backend is
 * registered, exactly as previewVoice() already does — never fabricates
 * playback.
 *
 * Never stores a copy of any developer/project fact. Every answer is
 * read fresh from window.CozyOS.DeveloperIdentity.query() at the moment
 * it's needed.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoiceEngine) return; // duplicate-load guard

    const DEGRADED_ANSWER = "I don't have developer identity information available.";

    class VoiceEngine {
        #enabled = false;
        #unsubscribe = null;
        #lastResult = null;
        #stats = { queriesReceived: 0, delegated: 0, degraded: 0, notMatched: 0 };

        getVersion() { return VERSION; }

        #emit(event, detail) {
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`voice:${event}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        /**
         * [Milestone 180B] Pure pattern match against the three canonical
         * topics window.CozyOS.DeveloperIdentity.query() understands.
         * Matches text only — carries no developer/project data itself.
         * @returns {string|null}
         */
        _matchDeveloperIdentityTopic(transcript) {
            const q = String(transcript || "").toLowerCase();
            if (/who\s+(created|developed|built|made|founded)\s+(you|cozyai|cozyos)/.test(q) ||
                /who\s+is\s+(chalz\s+cozy|charles\s+cozy|charles\s+owuor)/.test(q) ||
                /(your|cozyos'?s?|cozyai'?s?)\s+(creator|founder|developer)\b/.test(q)) {
                return "who-created-you";
            }
            if (/why\s+(were\s+you|was\s+cozyos|was\s+cozyai)\s+(built|created|made)/.test(q) ||
                /why\s+(does\s+)?cozyos\s+exist/.test(q)) {
                return "why-created";
            }
            if (/why\s+africa/.test(q) || /african\s+knowledge\s+initiative/.test(q)) {
                return "why-africa-focus";
            }
            return null;
        }

        /**
         * Handles one recognized transcript. Public so any consumer
         * (the event subscription below, a manual test, or a future
         * caller) can invoke the same delegation path directly.
         * @param {{transcript:string, sessionId?:string, settingsId?:string}} input
         * @returns {{matched:boolean, answered:boolean, responseText?:string, spoken?:boolean, source:string}}
         */
        async handleTranscript(input = {}) {
            this.#stats.queriesReceived++;
            const transcript = input.transcript;
            const topic = this._matchDeveloperIdentityTopic(transcript);

            if (!topic) {
                this.#stats.notMatched++;
                return { matched: false, answered: false, source: "none" };
            }

            // Voice SHALL NOT answer — delegate to the single canonical owner.
            const identity = window.CozyOS.DeveloperIdentity;
            let responseText;
            let answered;

            if (!identity || typeof identity.query !== "function") {
                // Graceful degradation — honest, never fabricated.
                this.#stats.degraded++;
                responseText = DEGRADED_ANSWER;
                answered = false;
                this.#emit("developer-identity-unavailable", { topic, sessionId: input.sessionId || null });
            } else {
                const result = identity.query(topic);
                responseText = result.answer;
                answered = !!result.known;
                this.#stats.delegated++;
                this.#emit("developer-identity-delegated", { topic, known: answered, sessionId: input.sessionId || null });
            }

            // Voice formats speech only — it does not decide the content above.
            let spoken = false;
            const speech = window.CozyOS.CozySpeech;
            if (speech && typeof speech.previewVoice === "function" && typeof speech.hasRealPreviewBackend === "function" && speech.hasRealPreviewBackend()) {
                try {
                    const playback = await speech.previewVoice({ text: responseText, settingsId: input.settingsId });
                    spoken = !!playback.played;
                } catch (_err) { /* non-fatal — synthesis failure does not change the answered text/status */ }
            }

            const outcome = { matched: true, answered, responseText, spoken, source: "DeveloperIdentity" };
            this.#lastResult = outcome;
            return outcome;
        }

        /**
         * Subscribes to the existing SpeechRecognitionAdapter final-result
         * event via PlatformEventBus. Additive only — does not touch
         * SpeechRecognitionAdapter or CozySpeech.
         */
        enable() {
            if (this.#enabled) return { success: true, alreadyEnabled: true };
            if (!window.CozyOS.PlatformEventBus || typeof window.CozyOS.PlatformEventBus.on !== "function") {
                return { success: false, reason: "PlatformEventBus not available." };
            }
            this.#unsubscribe = window.CozyOS.PlatformEventBus.on("speech-recognition:onFinalResult", (payload) => {
                this.handleTranscript(payload || {});
            });
            this.#enabled = true;
            return { success: true };
        }

        disable() {
            if (this.#unsubscribe) { try { this.#unsubscribe(); } catch (_err) { /* non-fatal */ } }
            this.#unsubscribe = null;
            this.#enabled = false;
            return { success: true };
        }

        isEnabled() { return this.#enabled; }

        // ── Diagnostics (Milestone 180B) — existing diagnostics pattern ──

        available() {
            return !!(window.CozyOS.DeveloperIdentity && typeof window.CozyOS.DeveloperIdentity.query === "function");
        }

        dependencies() {
            return Object.freeze({
                DeveloperIdentity: !!window.CozyOS.DeveloperIdentity,
                PlatformEventBus: !!window.CozyOS.PlatformEventBus,
                CozySpeech: !!window.CozyOS.CozySpeech,
                SpeechRecognitionAdapter: !!window.CozyOS.SpeechRecognitionAdapter,
                ttsBackendRegistered: !!(window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.hasRealPreviewBackend === "function" && window.CozyOS.CozySpeech.hasRealPreviewBackend()),
            });
        }

        delegationStatus() {
            return Object.freeze({
                delegatesTo: "window.CozyOS.DeveloperIdentity.query()",
                storesOwnCopy: false,
                lastResult: this.#lastResult,
            });
        }

        health() {
            return Object.freeze({
                enabled: this.#enabled,
                available: this.available(),
                stats: { ...this.#stats },
            });
        }

        capabilities() {
            return Object.freeze([
                "developer-identity-question-detection",
                "developer-identity-delegation",
                "spoken-response-via-cozyspeech-preview-backend",
            ]);
        }

        getIntegrationManifest() {
            return {
                owns: ["recognizing developer/project-identity questions in a final transcript", "delegating them to DeveloperIdentity", "handing the answer to CozySpeech for synthesis"],
                doesNotOwn: ["voice sessions/streams/sources (CozySpeech)", "speech recognition (SpeechRecognitionAdapter)", "wake-phrase detection (WakeWordEngine)", "developer/project facts (DeveloperIdentity)", "general command routing (out of scope)"],
                consumerContract: ["handleTranscript({transcript, sessionId, settingsId})", "voice:developer-identity-delegated (PlatformEventBus)", "voice:developer-identity-unavailable (PlatformEventBus)"],
                gracefulDegradation: DEGRADED_ANSWER,
            };
        }
    }

    window.CozyOS.VoiceEngine = new VoiceEngine();

    // Register with the EXISTING CozySpeech adapter registry (metadata
    // only) — no new registry created. cozy-speech.js itself is not
    // modified (its integration registry is documented CLOSED).
    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "VoiceEngine", type: "voice",
                capabilities: ["developer-identity-delegation"], offline: false, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "VoiceEngine", category: "Platform", icon: "voice.svg",
                description: "Delegates developer/project-identity questions recognized in speech to DeveloperIdentity and speaks the answer via CozySpeech's existing preview/TTS hook. Owns no developer data and no general voice session/routing — see getIntegrationManifest()."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
