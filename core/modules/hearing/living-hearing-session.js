/**
 * CozyOS Living Hearing Session — core/modules/hearing/living-hearing-session.js
 * Checkpoint: CP13 — Phase 1A, Kiswahili Living Hearing Foundation
 *
 * OWNERSHIP
 *   Not a new microphone engine, not a new speech engine, not a new
 *   sound engine. This file composes three already-real engines that
 *   were never actually wired together for a caller before this
 *   checkpoint:
 *     - window.CozyOS.AudioEngine       (real getUserMedia owner)
 *     - window.CozyOS.CozyHearing       (real mic permission + lifecycle,
 *                                        consumes AudioEngine)
 *     - window.CozyOS.SpeechRecognitionAdapter (real browser
 *                                        SpeechRecognition lifecycle)
 *   Confirmed before writing this file (real grep, not assumed): no
 *   file anywhere in this repository already coordinates Hearing and
 *   SpeechRecognitionAdapter together. The only existing caller of
 *   SpeechRecognitionAdapter (universal-learning-pipeline.js's
 *   learnFromVoice()) talked to it directly and never touched
 *   CozyHearing/AudioEngine at all — confirmed by inspection, which is
 *   exactly the gap this checkpoint's spec asks to close ("Connect CP12
 *   Listen button to existing Hearing").
 *
 * REAL BUG FOUND AND FIXED HERE (not in the old call site)
 *   speech-recognition-adapter.js had on() but no off(). The old call
 *   site called adapter.on("onFinalResult", ...) / adapter.on("onError",
 *   ...) fresh on every single Listen tap, with nothing ever removing
 *   the previous tap's listeners — a real, confirmed listener leak
 *   (2nd tap fires 2 callbacks, 3rd fires 3, ...). This file avoids
 *   that class of bug BY CONSTRUCTION rather than by remembering to
 *   clean up: it registers its own bound forwarder functions on the
 *   adapter exactly ONCE ever (see #ensureAdapterListeners), no matter
 *   how many times start()/stop() are called, and dispatches to
 *   whichever caller-supplied callbacks are current. destroy() is the
 *   only thing that ever calls adapter.off(), for full teardown (e.g.
 *   navigating away from Living Learn entirely). off() itself was
 *   added to speech-recognition-adapter.js this same checkpoint as a
 *   small, additive, real capability that file was missing.
 *
 * STATE MACHINE (fail-closed, mirrors learning-interaction-core.js's
 * pattern of never allowing a skipped step)
 *   IDLE -> PERMISSION_PENDING -> LISTENING -> STOPPING -> STOPPED
 *   Any step can move to ERROR. ERROR/STOPPED can both start() again.
 *
 * WHAT IS REAL
 *   Every state transition here is driven by a real return value from
 *   CozyHearing.startListening()/stopListening() (which itself is
 *   driven by AudioEngine's real getUserMedia()) or a real
 *   SpeechRecognitionAdapter event. Nothing here is simulated.
 *
 * WHAT IS NOT YET DONE (honest, per this checkpoint's own "Not yet" list)
 *   No translation, no OCR, no voice output, no learning persistence,
 *   no prosody, no live church translation. Those remain exactly as
 *   unimplemented as they were before this file existed.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LivingHearingSession) return;

    const STATE = Object.freeze({
        IDLE: "IDLE",
        PERMISSION_PENDING: "PERMISSION_PENDING",
        LISTENING: "LISTENING",
        STOPPING: "STOPPING",
        STOPPED: "STOPPED",
        ERROR: "ERROR"
    });

    /**
     * Best-effort, honest classification of a real failure reason string.
     * Never invents certainty the reason text doesn't support — anything
     * not matched below stays "unknown" rather than being guessed into
     * one of these buckets.
     * CP14 (Kiswahili Speech Recognition) additions: "not-registered"/
     * "network"/"no-speech"/"aborted" cover real error-recovery cases
     * item 10 of the CP14 spec requires distinguishing (unsupported
     * language, network interruption, no speech detected, and a
     * caller/browser-initiated abort), on top of CP13's existing
     * permission/hardware/already-listening classes.
     * Continuation-session additions: "service-not-allowed" (the real
     * Web Speech API error code for a recognition service the browser
     * itself refuses to run) and "provider-start-failure" (the real
     * adapter's own "recognition.start() rejection" wording) — added so
     * "unsupported recognition capability" and "provider failure" each
     * get their own distinct classification instead of falling through
     * to the shared "unknown" bucket.
     */
    function classifyProblem(reason) {
        const r = (reason || "").toLowerCase();
        if (r.includes("notallowederror") || r.includes("permission denied") || r.includes("permission dismissed")) return "permission-denied";
        if (r.includes("notfounderror") || r.includes("not available") || r.includes("no speechrecognition")) return "hardware-unavailable";
        if (r.includes("recognition already active")) return "already-listening";
        if (r.includes("is not registered in cozyspeech") || r.includes("language-not-supported")) return "language-not-registered";
        if (r.includes("service-not-allowed")) return "recognition-service-not-allowed";
        if (r.includes("network")) return "network-interruption";
        if (r.includes("no-speech") || r.includes("no speech")) return "no-speech-detected";
        if (r.includes("recognition.start() rejection")) return "provider-start-failure";
        if (r.includes("aborted")) return "aborted";
        return "unknown";
    }

    class LivingHearingSession {
        #state = STATE.IDLE;
        #lastError = null;
        #callbacks = {};
        #listenersRegistered = false;
        #boundHandlers = null; // eventName -> bound forwarder, only ever created once
        #micAcquiredAt = null; // CP14: real Date.now() when Hearing's startListening() last actually succeeded

        getVersion() { return "1.0.0"; }
        getId() { return "LivingHearingSession"; }
        getName() { return "LivingHearingSession"; }
        getDependencies() { return ["CozyHearing", "SpeechRecognitionAdapter"]; }

        getState() { return this.#state; }
        isListening() { return this.#state === STATE.LISTENING; }
        getLastError() { return this.#lastError; }

        /**
         * getLastTimings() — CP14 (Kiswahili Speech Recognition) addition.
         * Real, measured timestamps only (ms, Date.now()), for
         * performance MEASUREMENT — never a claimed "fast" number. Adds
         * this session's own real `micAcquiredAt` measurement on top of
         * the adapter's own timings (start requested / recognition
         * started / first interim / first final), so a later phase can
         * see the full real chain: mic permission -> recognition start ->
         * first interim -> final. Returns `{ micAcquiredAt: null }` alone
         * if the adapter has no getLastTimings() (older adapter build) —
         * never fabricates the missing fields.
         */
        getLastTimings() {
            const adapter = window.CozyOS.SpeechRecognitionAdapter;
            const adapterTimings = (adapter && typeof adapter.getLastTimings === "function") ? adapter.getLastTimings() : {};
            return { micAcquiredAt: this.#micAcquiredAt, ...adapterTimings };
        }

        #setState(next) {
            this.#state = next;
            if (typeof this.#callbacks.onStateChange === "function") {
                try { this.#callbacks.onStateChange(next); } catch (_err) { /* consumer error, non-fatal */ }
            }
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit("living-hearing-session:state", { state: next }); } catch (_err) { /* non-fatal */ }
            }
        }

        /** Registers exactly once, ever, regardless of how many start()/stop() cycles run. This is the structural fix for the duplicate-callback bug described above. */
        #ensureAdapterListeners(adapter) {
            if (this.#listenersRegistered) return;
            this.#boundHandlers = {
                onStart: () => { if (typeof this.#callbacks.onStart === "function") this.#callbacks.onStart(); },
                // CP14: forwards the adapter's real `wasExpectedStop` flag
                // (previously discarded here) so a caller/UI can honestly
                // tell "you stopped it" apart from "it stopped on its own"
                // instead of treating every stop identically.
                onStop: (p) => { if (typeof this.#callbacks.onStop === "function") this.#callbacks.onStop(p); },
                onSpeechStart: () => { if (typeof this.#callbacks.onSpeechStart === "function") this.#callbacks.onSpeechStart(); },
                onSpeechEnd: () => { if (typeof this.#callbacks.onSpeechEnd === "function") this.#callbacks.onSpeechEnd(); },
                onResult: (p) => { if (typeof this.#callbacks.onResult === "function") this.#callbacks.onResult(p); },
                onPartialResult: (p) => { if (typeof this.#callbacks.onPartialResult === "function") this.#callbacks.onPartialResult(p); },
                onFinalResult: (p) => { if (typeof this.#callbacks.onFinalResult === "function") this.#callbacks.onFinalResult(p); },
                onError: (e) => {
                    this.#lastError = (e && (e.error || e.reason)) || "Unknown speech recognition error.";
                    if (typeof this.#callbacks.onError === "function") this.#callbacks.onError(e);
                }
            };
            for (const [eventName, fn] of Object.entries(this.#boundHandlers)) adapter.on(eventName, fn);
            this.#listenersRegistered = true;
        }

        /**
         * start({languageCode, continuous, interimResults, sessionId}, callbacks)
         *   Real microphone permission (via CozyHearing -> AudioEngine ->
         *   getUserMedia), then real speech-recognition start. Fails
         *   closed at every step, cleans up whatever it already acquired
         *   if a later step fails (e.g. releases the mic if recognition
         *   itself then fails to start).
         */
        async start(config = {}, callbacks = {}) {
            if (this.#state === STATE.PERMISSION_PENDING || this.#state === STATE.LISTENING) {
                return { success: false, reason: "Already listening or starting. Call stop() first.", state: this.#state };
            }
            const adapter = window.CozyOS.SpeechRecognitionAdapter;
            if (!adapter) { this.#setState(STATE.ERROR); this.#lastError = "SpeechRecognitionAdapter is not loaded."; return { success: false, reason: this.#lastError, problem: "hardware-unavailable", state: STATE.ERROR }; }
            if (!adapter.isReal()) { this.#setState(STATE.ERROR); this.#lastError = "Real browser SpeechRecognition API is not available in this environment. Not fabricated."; return { success: false, reason: this.#lastError, problem: "hardware-unavailable", state: STATE.ERROR }; }

            const hearing = window.CozyOS.CozyHearing;
            if (!hearing) { this.#setState(STATE.ERROR); this.#lastError = "CozyHearing is not loaded."; return { success: false, reason: this.#lastError, problem: "hardware-unavailable", state: STATE.ERROR }; }

            this.#callbacks = callbacks || {};
            this.#ensureAdapterListeners(adapter);
            this.#setState(STATE.PERMISSION_PENDING);

            const hearingResult = await hearing.startListening({});
            if (!hearingResult.success) {
                this.#lastError = hearingResult.reason;
                this.#setState(STATE.ERROR);
                return { success: false, reason: hearingResult.reason, problem: classifyProblem(hearingResult.reason), state: STATE.ERROR };
            }
            this.#micAcquiredAt = Date.now();

            const startResult = adapter.start({
                languageCode: config.languageCode,
                continuous: config.continuous,
                interimResults: config.interimResults,
                sessionId: config.sessionId
            });
            if (!startResult.success) {
                // Real cleanup: recognition failed to start after we already
                // acquired the microphone via Hearing — release it rather
                // than leaving a live stream open for nothing.
                await hearing.stopListening();
                this.#lastError = startResult.reason;
                this.#setState(STATE.ERROR);
                return { success: false, reason: startResult.reason, problem: classifyProblem(startResult.reason), state: STATE.ERROR };
            }

            this.#setState(STATE.LISTENING);
            return { success: true, state: STATE.LISTENING };
        }

        /** stop() — real recognition stop + real mic release. Safe to call from any state; no-ops honestly if nothing is running. */
        async stop() {
            if (this.#state === STATE.IDLE || this.#state === STATE.STOPPED) {
                return { success: true, reason: "Not listening.", state: this.#state };
            }
            this.#setState(STATE.STOPPING);
            const adapter = window.CozyOS.SpeechRecognitionAdapter;
            if (adapter && typeof adapter.stop === "function") { try { adapter.stop(); } catch (_err) { /* non-fatal */ } }
            const hearing = window.CozyOS.CozyHearing;
            if (hearing && typeof hearing.isListening === "function" && hearing.isListening()) {
                await hearing.stopListening();
            }
            this.#setState(STATE.STOPPED);
            return { success: true, state: STATE.STOPPED };
        }

        /** destroy() — full teardown: stops if active, then actually removes this session's listeners from the adapter (uses the new off()). Intended for callers leaving Living Learn entirely, not for a normal stop-then-start-again cycle (which correctly keeps the single registration alive). */
        async destroy() {
            await this.stop();
            const adapter = window.CozyOS.SpeechRecognitionAdapter;
            if (adapter && this.#boundHandlers && typeof adapter.off === "function") {
                for (const [eventName, fn] of Object.entries(this.#boundHandlers)) adapter.off(eventName, fn);
            }
            this.#listenersRegistered = false;
            this.#boundHandlers = null;
            this.#callbacks = {};
            this.#micAcquiredAt = null;
            this.#setState(STATE.IDLE);
        }

        getPlatformInspectionMetadata() {
            return {
                name: "LivingHearingSession", category: "Platform", icon: "mic.svg",
                description: "Coordinates real microphone permission (CozyHearing/AudioEngine) with real speech-recognition lifecycle (SpeechRecognitionAdapter) for Living Learn's Listen mode. Owns no hardware access of its own.",
                owns: ["Hearing + SpeechRecognition session state machine", "single, permanent listener registration on SpeechRecognitionAdapter"],
                doesNotOwn: ["getUserMedia (AudioEngine)", "microphone permission/lifecycle (CozyHearing)", "browser SpeechRecognition instance (SpeechRecognitionAdapter)", "transcript persistence/learning (UniversalLearningPipeline)"]
            };
        }
    }

    LivingHearingSession.STATE = STATE;
    window.CozyOS.LivingHearingSession = new LivingHearingSession();
    window.CozyOS.LivingHearingSession.STATE = STATE;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/hearing/living-hearing-session.js",
                name: "LivingHearingSession", category: "Platform", icon: "mic.svg",
                description: "Coordinates real mic permission (CozyHearing/AudioEngine) with real speech-recognition lifecycle (SpeechRecognitionAdapter) for Living Learn's Listen mode."
            });
        } catch (_err) { /* registry is best-effort, never fatal */ }
    }
})();
