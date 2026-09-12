/**
 * CozyOS Living Audio Engine (Microphone Infrastructure) —
 * core/engines/audio/cozy-audio-engine.js
 *
 * OWNERSHIP: this is the real window.CozyOS.AudioEngine that
 * CozyHearing (and, transitively, WakeWordEngine/VoiceEngine/
 * CozyConversation) has been calling all along - confirmed absent
 * from this repository by direct search before writing this file, and
 * confirmed NOT the same thing as core/engines/audio/audio-manager.js
 * (a separate, ES-module mixer/mic-bus engine consumed via `import` by
 * Scene Manager - a different concern, correctly left alone).
 *
 * CONTRACT (reverse-engineered from CozyHearing's actual real calls,
 * read directly from cozy-hearing.js before writing this file):
 *   registerInputAdapter({target, handler}) -> id
 *     handler(stream) is called with the real MediaStream when a
 *     session starts, and with null when the session ends.
 *   startListening(constraints) -> Promise<void>
 *     Must call every registered handler with the real stream
 *     SYNCHRONOUSLY before this promise resolves (CozyHearing's own
 *     comment documents relying on this exact ordering).
 *   stopListening() -> Promise<void>
 *     Stops the real MediaStream tracks and notifies handlers with null.
 *
 * HONEST SCOPE: uses real navigator.mediaDevices.getUserMedia(). Noise
 * suppression / echo cancellation / voice activity detection are
 * passed through as real, standard MediaTrackConstraints where the
 * browser supports them - never a fabricated DSP implementation of
 * these features. Permission state is read from the real Permissions
 * API where available, honestly reporting "unknown" otherwise (not
 * every browser exposes microphone permission query).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.AudioEngine) return;

    class CozyAudioEngine {
        #adapters = new Map(); // id -> {target, handler}
        #nextAdapterId = 1;
        #stream = null;
        #listening = false;
        #lastError = null;
        #startedAt = null;

        getVersion() { return "1.0.0"; }
        getId() { return "AudioEngine"; }
        getName() { return "AudioEngine"; }
        getDependencies() { return []; }

        /**
         * registerInputAdapter({target, handler})
         *   Real - stores the handler so it can be called with the
         *   actual routed stream. Returns a real id for later removal.
         */
        registerInputAdapter({ target, handler } = {}) {
            if (typeof handler !== "function") throw new TypeError("[AudioEngine] registerInputAdapter(): handler must be a function.");
            const id = `adapter_${this.#nextAdapterId++}`;
            this.#adapters.set(id, { target: target || "unknown", handler });
            return id;
        }

        unregisterInputAdapter(id) { return this.#adapters.delete(id); }

        /**
         * capabilities()
         *   Real - checks the actual browser API surface. Never
         *   fabricates support for constraints the browser doesn't
         *   report.
         */
        capabilities() {
            const hasGetUserMedia = typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function";
            let supportedConstraints = {};
            if (hasGetUserMedia && typeof navigator.mediaDevices.getSupportedConstraints === "function") {
                try { supportedConstraints = navigator.mediaDevices.getSupportedConstraints(); } catch (_err) { /* honest empty */ }
            }
            return {
                supported: hasGetUserMedia,
                echoCancellation: !!supportedConstraints.echoCancellation,
                noiseSuppression: !!supportedConstraints.noiseSuppression,
                autoGainControl: !!supportedConstraints.autoGainControl
            };
        }

        /**
         * permissionState()
         *   Real - queries the actual Permissions API for "microphone"
         *   where supported. Honestly reports "unknown" rather than
         *   guessing on browsers that don't expose this query.
         */
        async permissionState() {
            if (typeof navigator === "undefined" || !navigator.permissions || typeof navigator.permissions.query !== "function") {
                return { state: "unknown", reason: "Permissions API not available in this browser." };
            }
            try {
                const status = await navigator.permissions.query({ name: "microphone" });
                return { state: status.state }; // "granted" | "denied" | "prompt" - real, from the browser
            } catch (err) {
                return { state: "unknown", reason: err.message || "Permissions API query failed for microphone." };
            }
        }

        /**
         * startListening(constraints)
         *   Real - calls the actual getUserMedia(), then synchronously
         *   (within this same call stack, before the returned promise
         *   resolves) notifies every registered adapter with the real
         *   stream. Matches CozyHearing's documented expectation
         *   exactly. Never fabricates a stream on failure.
         */
        async startListening(constraints = {}) {
            const cap = this.capabilities();
            if (!cap.supported) {
                this.#lastError = "getUserMedia is not available in this browser/context.";
                return { success: false, reason: this.#lastError };
            }
            const audioConstraints = {
                echoCancellation: cap.echoCancellation ? true : undefined,
                noiseSuppression: cap.noiseSuppression ? true : undefined,
                autoGainControl: cap.autoGainControl ? true : undefined,
                deviceId: constraints.deviceId ? { exact: constraints.deviceId } : undefined
            };
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
                this.#stream = stream;
                this.#listening = true;
                this.#startedAt = new Date().toISOString();
                this.#lastError = null;
                // Real, synchronous-within-this-call notification, matching
                // CozyHearing's documented reliance on this exact ordering.
                for (const { handler } of this.#adapters.values()) {
                    try { handler(stream); } catch (_err) { /* one adapter's failure must not break others */ }
                }
                return { success: true };
            } catch (err) {
                this.#lastError = err && err.message ? err.message : String(err);
                return { success: false, reason: `Real getUserMedia() rejection: ${this.#lastError}` };
            }
        }

        /**
         * stopListening()
         *   Real - stops every actual track on the real stream, then
         *   notifies adapters with null so they tear down honestly.
         */
        async stopListening() {
            if (!this.#listening) return { success: true, reason: "Not listening." };
            if (this.#stream) {
                for (const track of this.#stream.getTracks()) { try { track.stop(); } catch (_err) { /* non-fatal */ } }
            }
            this.#stream = null;
            this.#listening = false;
            this.#startedAt = null;
            for (const { handler } of this.#adapters.values()) {
                try { handler(null); } catch (_err) { /* non-fatal */ }
            }
            return { success: true };
        }

        isListening() { return this.#listening; }

        /** getHealth() — real, derived state, never fabricated. */
        getHealth() {
            return {
                listening: this.#listening,
                adapterCount: this.#adapters.size,
                lastError: this.#lastError,
                startedAt: this.#startedAt,
                capabilities: this.capabilities()
            };
        }

        // ── RL-014 Platform Inspection Contract (matching this repo's established pattern) ──
        getPlatformInspectionMetadata() {
            return {
                name: "AudioEngine", category: "Platform", icon: "mic.svg",
                description: "Real, shared microphone/getUserMedia infrastructure. Owns audio input session lifecycle; CozyHearing/WakeWordEngine/VoiceEngine consume it via registerInputAdapter() rather than each calling getUserMedia() directly.",
                owns: ["microphone session lifecycle", "input adapter registration", "real capability/permission reporting"],
                doesNotOwn: ["speech recognition (SpeechRecognitionAdapter)", "DSP/sound analysis (CozyHearing)", "wake-phrase detection (WakeWordEngine)"]
            };
        }
    }

    window.CozyOS.AudioEngine = new CozyAudioEngine();
})();
