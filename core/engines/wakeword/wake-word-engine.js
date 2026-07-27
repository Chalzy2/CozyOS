/**
 * CozyOS Wake Word Engine
 * File Reference: core/engines/wakeword/wake-word-engine.js
 * Milestone: 179 — Wake Word Engine (new capability, no existing owner)
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: wake-phrase registration and continuous listen-for-phrase
 * detection only. Does NOT own sessions, streams, sources, transcription,
 * or general speech recognition — those remain owned by
 * core/modules/speech/cozy-speech.js. This file registers itself as a
 * real adapter with the EXISTING CozySpeech registry (registerAdapter),
 * does not create a new one, and does NOT modify cozy-speech.js —
 * CozySpeech.listIntegrations() is a documented CLOSED registry
 * ("added only through official CozyOS releases, not application code"),
 * so it is read, never written.
 *
 * Real detection mechanism: the standard Web Speech API
 * (SpeechRecognition / webkitSpeechRecognition) in continuous mode,
 * matching interim/final transcripts against registered wake phrases.
 * No bundled offline wake-word model exists in this repository — see
 * Gate 4 known limitations in Milestone-179-Gate4.md.
 *
 * CozyAI integration: exposes a callback/event contract
 * ("wakeword:detected") that CozyAI or any other consumer can subscribe
 * to. Does NOT fabricate a live CozyAI connection — none exists yet
 * (confirmed gap, Milestone 178 Gate 4).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.WakeWordEngine) return;

    function _uid(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function _normalize(text) {
        return String(text || "").toLowerCase().trim().replace(/\s+/g, " ");
    }

    class WakeWordEngine {
        #phrases = new Map();      // phraseId -> { phraseId, phrase, normalized, onDetected, registeredAt }
        #recognition = null;
        #listening = false;
        #shouldRestart = false;    // true while start() is active, so onend can auto-restart continuous listening
        #lastError = null;

        getVersion() { return VERSION; }

        isSupported() {
            return typeof window !== "undefined" &&
                !!(window.SpeechRecognition || window.webkitSpeechRecognition);
        }

        #emit(event, detail) {
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`wakeword:${event}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        /**
         * Register a phrase to listen for.
         * @param {{ phrase: string, onDetected?: (detail: object) => void }} config
         * @returns {string} phraseId
         */
        registerWakePhrase(config) {
            const phrase = config && config.phrase;
            if (typeof phrase !== "string" || phrase.trim().length === 0) {
                throw new TypeError("[WakeWordEngine] registerWakePhrase(): config.phrase is required and must be a non-empty string.");
            }
            const phraseId = (config && config.phraseId) || _uid("wakephrase");
            this.#phrases.set(phraseId, {
                phraseId,
                phrase,
                normalized: _normalize(phrase),
                onDetected: typeof (config && config.onDetected) === "function" ? config.onDetected : null,
                registeredAt: Date.now(),
            });
            return phraseId;
        }

        unregisterWakePhrase(phraseId) {
            return this.#phrases.delete(phraseId);
        }

        listWakePhrases() {
            return Object.freeze(Array.from(this.#phrases.values(), (p) => Object.freeze({
                phraseId: p.phraseId, phrase: p.phrase, registeredAt: p.registeredAt,
            })));
        }

        #matchPhrase(transcript) {
            const normalizedTranscript = _normalize(transcript);
            if (!normalizedTranscript) return null;
            for (const entry of this.#phrases.values()) {
                if (entry.normalized && normalizedTranscript.includes(entry.normalized)) {
                    return entry;
                }
            }
            return null;
        }

        #handleResult(evt) {
            try {
                const results = evt.results;
                for (let i = evt.resultIndex; i < results.length; i++) {
                    const result = results[i];
                    const transcript = result && result[0] ? result[0].transcript : "";
                    const match = this.#matchPhrase(transcript);
                    if (match) {
                        const detail = {
                            phraseId: match.phraseId,
                            phrase: match.phrase,
                            transcript,
                            isFinal: !!result.isFinal,
                            timestamp: Date.now(),
                        };
                        this.#emit("detected", detail);
                        if (match.onDetected) {
                            try { match.onDetected(detail); } catch (_err) { /* non-fatal, consumer's callback */ }
                        }
                    }
                }
            } catch (_err) { /* non-fatal — malformed event from the browser API */ }
        }

        /**
         * Start continuous listening for registered wake phrases.
         * @returns {{ success: boolean, reason?: string }}
         */
        start() {
            if (!this.isSupported()) {
                return { success: false, reason: "SpeechRecognition not available in this environment." };
            }
            if (this.#listening) {
                return { success: false, reason: "Already listening. Call stop() first." };
            }
            if (this.#phrases.size === 0) {
                return { success: false, reason: "No wake phrases registered. Call registerWakePhrase() first." };
            }
            const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new RecognitionCtor();
            recognition.continuous = true;
            recognition.interimResults = true;

            recognition.onresult = (evt) => this.#handleResult(evt);
            recognition.onerror = (evt) => {
                this.#lastError = (evt && evt.error) || "unknown-error";
                this.#emit("error", { error: this.#lastError });
            };
            recognition.onend = () => {
                this.#listening = false;
                this.#emit("stopped", {});
                // Web Speech API sessions end on their own (silence, timeout, etc.).
                // Auto-restart only while the caller has not explicitly called stop().
                if (this.#shouldRestart) {
                    try {
                        recognition.start();
                        this.#listening = true;
                        this.#emit("started", { restarted: true });
                    } catch (_err) { /* non-fatal — browser may reject rapid restart */ }
                }
            };

            try {
                recognition.start();
            } catch (err) {
                return { success: false, reason: `Real SpeechRecognition.start() rejection: ${err && err.message ? err.message : String(err)}` };
            }

            this.#recognition = recognition;
            this.#listening = true;
            this.#shouldRestart = true;
            this.#emit("started", { restarted: false });
            return { success: true };
        }

        stop() {
            this.#shouldRestart = false;
            if (!this.#recognition) return { success: true, reason: "Not listening." };
            try { this.#recognition.stop(); } finally { this.#recognition = null; }
            this.#listening = false;
            return { success: true };
        }

        getStatus() {
            return Object.freeze({
                supported: this.isSupported(),
                listening: this.#listening,
                registeredPhraseCount: this.#phrases.size,
                lastError: this.#lastError,
            });
        }

        getIntegrationManifest() {
            return {
                owns: ["wake phrase registration", "continuous wake-phrase detection"],
                doesNotOwn: ["sessions (CozySpeech)", "streams (CozySpeech)", "sources (CozySpeech)", "general transcription", "recognition adapters"],
                registersWith: ["CozySpeech.registerAdapter()"],
                consumerContract: ["wakeword:detected (PlatformEventBus)", "registerWakePhrase({ onDetected })"],
            };
        }
    }

    window.CozyOS.WakeWordEngine = new WakeWordEngine();

    // Register with the EXISTING CozySpeech adapter registry (metadata
    // only — no functions), so this engine is discoverable through the
    // canonical coordinator instead of creating a parallel one.
    // cozy-speech.js itself is never modified (its integration registry
    // is documented CLOSED).
    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "WakeWordEngine", type: "wakeword",
                capabilities: ["wake-phrase-detection", "browser-speech-recognition"],
                offline: false, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "WakeWordEngine", category: "Platform", icon: "mic.svg",
                description: "Continuous wake-phrase detection using the browser's SpeechRecognition API. Registers with CozySpeech's existing adapter registry — no new speech owner. No bundled offline model; requires a browser SpeechRecognition implementation."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
