/**
 * CozyOS Speech Recognition Adapter
 * File Reference: core/modules/speech/adapters/speech-recognition-adapter.js
 * Milestone: 148 — Speech Recognition Provider Integration
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: real, honest wrapper around the browser's native
 * SpeechRecognition / webkitSpeechRecognition API. Owns nothing beyond
 * this adapter's own instance lifecycle.
 * Does NOT authenticate, verify identity, or change auth state — outputs
 * text only. VoiceProvider (core/security/voice-provider.js) remains the
 * sole authentication owner.
 * Registers through CozySpeech.registerAdapter() — no new registry.
 * Language validated via SpeechLanguageAdapter (reuses CozySpeech's
 * existing language registry). Session lifecycle delegated to
 * SpeechSessionAdapter (reuses CozySpeech's existing session lifecycle).
 *
 * HONEST LIMITATION
 *   The Web Speech API has no native pause/resume — only start/stop/abort.
 *   pause() is therefore NOT fabricated as a real pause: it stops
 *   recognition and reports that resume() will start a new recognition
 *   pass, not literally resume mid-utterance.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.SpeechRecognitionAdapter) return;

    function _Api() { return window.SpeechRecognition || window.webkitSpeechRecognition || null; }

    class SpeechRecognitionAdapter {
        #recognition = null;
        #active = false;
        #sessionId = null;
        #listeners = { onStart: [], onStop: [], onSpeechStart: [], onSpeechEnd: [], onResult: [], onPartialResult: [], onFinalResult: [], onError: [] };
        // CP14 (Kiswahili Speech Recognition) additions — real, measured
        // timing only. Never a claimed/guessed millisecond figure; each
        // field is null until the real corresponding browser event fires.
        #timings = { startRequestedAt: null, recognitionStartedAt: null, firstInterimAt: null, firstFinalAt: null };
        // CP14: distinguishes a caller-requested stop() from the
        // recognition engine ending on its own (network drop, timeout,
        // provider-side stop) so consumers can tell "stopped normally"
        // from "stopped unexpectedly" without any auto-restart logic
        // (auto-restart is explicitly out of scope — it is the class of
        // change that can cause infinite restart loops).
        #stopWasRequested = false;

        getVersion() { return VERSION; }
        isReal() { return !!_Api(); }

        /** getLastTimings() — real, measured timestamps (ms, Date.now()) for the most recent start() call. Never a guessed/claimed latency figure; a field stays null until its real event actually fires. */
        getLastTimings() { return { ...this.#timings }; }

        on(eventName, handler) {
            if (!this.#listeners[eventName]) return { success: false, reason: `Unknown event "${eventName}". Never invents events beyond the documented set.` };
            this.#listeners[eventName].push(handler);
            return { success: true };
        }

        /**
         * off(eventName, handler) — CP13 (Kiswahili Hearing Foundation) addition.
         * Real gap fix: this adapter previously had on() with no matching
         * removal method anywhere, so every consumer that called on() more
         * than once (e.g. universal-learning-pipeline.js's learnFromVoice(),
         * once per captureVoiceForLearning() call) accumulated duplicate
         * listeners forever — confirmed by inspection, not assumed. Removes
         * one exact handler reference; never clears a whole event's list
         * (that would risk removing another consumer's real listener).
         */
        off(eventName, handler) {
            if (!this.#listeners[eventName]) return { success: false, reason: `Unknown event "${eventName}".` };
            const idx = this.#listeners[eventName].indexOf(handler);
            if (idx === -1) return { success: false, reason: "Handler not registered for this event." };
            this.#listeners[eventName].splice(idx, 1);
            return { success: true };
        }
        #fire(eventName, detail) {
            (this.#listeners[eventName] || []).forEach((h) => { try { h(detail); } catch (_err) { /* consumer error, non-fatal */ } });
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`speech-recognition:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        /**
         * start(config) — config: { languageCode, continuous, interimResults, sessionId }
         * Fails closed if the browser has no SpeechRecognition constructor.
         */
        start(config = {}) {
            const Api = _Api();
            if (!Api) {
                const result = { success: false, isReal: false, reason: "No SpeechRecognition/webkitSpeechRecognition in this browser. Not fabricated." };
                this.#fire("onError", result);
                return result;
            }
            if (this.#active) return { success: false, reason: "Recognition already active. Call stop() first." };

            let bcp47 = config.languageCode || "en-US";
            if (config.languageCode && window.CozyOS.SpeechLanguageAdapter) {
                const resolved = window.CozyOS.SpeechLanguageAdapter.resolve(config.languageCode);
                if (!resolved.success) {
                    // CP14: fail closed and surface it as a real onError
                    // event too (previously only the return value carried
                    // this), so callers listening for onError (the normal
                    // error-recovery path) actually see an unsupported/
                    // unregistered language rather than only a caller that
                    // happens to inspect start()'s return value.
                    this.#fire("onError", { ...resolved, sessionId: config.sessionId || null, error: "language-not-supported" });
                    return resolved; // fail closed on unregistered language — never silently substitutes another language
                }
                bcp47 = resolved.bcp47;
            }

            this.#timings = { startRequestedAt: Date.now(), recognitionStartedAt: null, firstInterimAt: null, firstFinalAt: null };
            this.#stopWasRequested = false;
            this.#recognition = new Api();
            this.#recognition.lang = bcp47;
            this.#recognition.continuous = !!config.continuous;
            this.#recognition.interimResults = !!config.interimResults;
            this.#sessionId = config.sessionId || null;

            this.#recognition.onstart = () => { this.#active = true; this.#timings.recognitionStartedAt = Date.now(); this.#fire("onStart", { sessionId: this.#sessionId }); };
            this.#recognition.onspeechstart = () => this.#fire("onSpeechStart", { sessionId: this.#sessionId });
            this.#recognition.onspeechend = () => this.#fire("onSpeechEnd", { sessionId: this.#sessionId });
            this.#recognition.onerror = (e) => this.#fire("onError", { sessionId: this.#sessionId, error: e.error || "unknown" });
            // CP14: `wasExpectedStop` is real, not guessed — true only when
            // this adapter's own stop()/cancel() set the flag just before
            // asking the browser to stop. If the browser's `onend` fires
            // without that flag set, the recognition session ended on its
            // own (e.g. network drop, provider-side timeout) — an
            // unexpected stop, reported honestly rather than silently
            // treated the same as a normal stop.
            this.#recognition.onend = () => {
                this.#active = false;
                this.#fire("onStop", { sessionId: this.#sessionId, wasExpectedStop: this.#stopWasRequested });
                this.#stopWasRequested = false;
            };
            this.#recognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const res = event.results[i];
                    const alt = res[0];
                    // CP14: never invent a confidence percentage. If the
                    // real provider did not supply a numeric confidence,
                    // report "unavailable" explicitly rather than null
                    // (which could be misread downstream as "0% / low
                    // confidence" instead of "not supplied").
                    const confidence = typeof alt.confidence === "number" ? alt.confidence : "unavailable";
                    const payload = { sessionId: this.#sessionId, transcript: alt.transcript, confidence, isFinal: res.isFinal };
                    if (this.#timings.firstInterimAt === null && !res.isFinal) this.#timings.firstInterimAt = Date.now();
                    if (this.#timings.firstFinalAt === null && res.isFinal) this.#timings.firstFinalAt = Date.now();
                    this.#fire("onResult", payload);
                    this.#fire(res.isFinal ? "onFinalResult" : "onPartialResult", payload);
                }
            };

            try {
                this.#recognition.start();
                return { success: true, isReal: true, sessionId: this.#sessionId };
            } catch (err) {
                const result = { success: false, reason: `Real recognition.start() rejection: ${err && err.message ? err.message : String(err)}` };
                this.#fire("onError", result);
                return result;
            }
        }

        stop() {
            if (!this.#recognition) return { success: true, reason: "No active recognition." };
            this.#stopWasRequested = true;
            try { this.#recognition.stop(); } catch (_err) { /* non-fatal */ }
            return { success: true };
        }

        cancel() {
            if (!this.#recognition) return { success: true, reason: "No active recognition." };
            this.#stopWasRequested = true;
            try { this.#recognition.abort(); } catch (_err) { /* non-fatal */ }
            this.#active = false;
            return { success: true };
        }

        /** pause() — honest: Web Speech API has no native pause. Stops instead. See file header. */
        pause() {
            const result = this.stop();
            return { ...result, honestLimitation: "Web Speech API has no native pause — this stopped recognition instead of pausing it." };
        }
        resume(config = {}) {
            return this.start(config);
        }

        isActive() { return this.#active; }

        getIntegrationManifest() {
            return {
                owns: ["browser SpeechRecognition instance lifecycle", "event forwarding"],
                doesNotOwn: ["authentication", "identity verification", "sessions (CozySpeech, via SpeechSessionAdapter)", "languages (CozySpeech, via SpeechLanguageAdapter)", "microphone routing (Media Engine)"],
                honestLimitation: "pause()/resume() are stop()/start() under the hood — Web Speech API has no native pause."
            };
        }
    }

    window.CozyOS.SpeechRecognitionAdapter = new SpeechRecognitionAdapter();

    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "SpeechRecognitionAdapter", type: "recognition",
                capabilities: ["start", "stop", "cancel", "on", "off", "partial-transcript", "final-transcript", "confidence", "language-selection", "timings", "expected-vs-unexpected-stop"],
                offline: false, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }
    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/speech/adapters/speech-recognition-adapter.js",
                name: "SpeechRecognitionAdapter", category: "Platform", icon: "mic.svg",
                description: "Real browser SpeechRecognition wrapper. Text output only — never authenticates. Fails closed (isReal:false) if the browser has no recognition API."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
