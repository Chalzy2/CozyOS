/**
 * CozyOS Hearing Engine
 * File Reference: core/modules/hearing/cozy-hearing.js
 * Milestone: 157 — Cozy Hearing Engine
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Sound Understanding
 *
 * OWNERSHIP
 *   No existing hearing/sound-engine owner found in the repository
 *   (searched core/modules/hearing/, hearing-engine.js, cozy-hearing.js,
 *   audio-analysis.js, sound-engine.js, and a broad grep for
 *   sound-classification/SoundEvent/HearingEngine). This file is the new
 *   canonical owner.
 *   Distinct from CozySpeech (language) and VoiceProvider/CozyOS auth
 *   (identity) — this engine understands SOUND, not speech content or
 *   who is speaking.
 *   MILESTONE 158 UPDATE: this file no longer calls getUserMedia() at all,
 *   not even as a fallback. Audio Manager (core/engines/audio/
 *   audio-manager.js, window.CozyOS.AudioEngine) is the canonical
 *   Listening Engine and owns the platform's one real getUserMedia call
 *   site. This file registers itself as a "hearing" input adapter via
 *   AudioEngine.registerInputAdapter() and receives the real, routed
 *   MediaStream — it still owns building its own AudioContext/AnalyserNode
 *   on top of that stream for real DSP analysis (that remains this file's
 *   job, not AudioEngine's — "Never process audio itself" per the
 *   Listening Engine spec), but it never acquires the stream itself.
 *
 * WHAT IS REAL
 *   Volume, energy (RMS), peak, dominant-frequency estimate, silence
 *   detection, and noise-level estimate are all real, computed from a
 *   live Web Audio AnalyserNode (time + frequency domain data). These
 *   never require an external model.
 *
 * WHAT IS NOT FABRICATED — Classification
 *   Recognizing WHICH category a sound belongs to (gunshot, dog bark,
 *   glass break, etc.) requires a real trained audio classification
 *   model. None exists in this offline, no-network environment.
 *   classifySound() fails closed (isReal:false) unless a real classifier
 *   has been registered via registerClassifier(descriptor, classifierFn)
 *   — the same extension-point pattern used by FaceProvider/VoiceProvider
 *   (registerBackend). The classifier function is kept in a private Map,
 *   never exposed through the public metadata registry, and its
 *   confidence value is always whatever the real backend reports — never
 *   invented by this file.
 *   ADDITIVE (multi-provider architecture): classifyAll(audioSample,
 *   options) dispatches to every registered classifier (or a real
 *   options.classifierIds subset), highest declared descriptor.priority
 *   first, one classifier's throw never blocking another. classifySound()
 *   keeps its original single-result public contract and now gets that
 *   result by calling classifyAll() internally — registerClassifier()'s
 *   signature (descriptor, classifierFn) and analyseSound()'s meaning
 *   (real DSP metrics, unrelated to classification) are both unchanged.
 *   Provider-declared category labels are normalized to this file's
 *   existing kebab-case SOUND_CATEGORIES at the registration boundary
 *   (e.g. "Door Knock" -> "door-knock") — the canonical list itself is
 *   never changed to match a provider's label.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CozyHearing) return;

    const SOUND_CATEGORIES = Object.freeze([
        "human-speech", "music", "applause", "door-knock", "glass-break", "gunshot", "baby-cry",
        "dog-bark", "cat-meow", "vehicle", "engine", "horn", "alarm", "siren", "rain", "wind",
        "thunder", "ocean", "fire", "machine", "keyboard", "silence", "unknown"
    ]);
    const PROFILES = Object.freeze(["indoor", "outdoor", "office", "home", "factory", "vehicle", "classroom", "security", "meeting", "studio"]);
    const HEALTH = Object.freeze({ READY: "ready", LISTENING: "listening", DISABLED: "disabled", UNAVAILABLE: "unavailable", ERROR: "error" });

    /**
     * Normalizes a provider-declared category label (e.g. "Door Knock") to
     * this engine's canonical kebab-case form (e.g. "door-knock") so a
     * differently-labeled provider isn't silently dropped from
     * descriptor.categories. Never invents a category: returns null if the
     * normalized form still isn't one of SOUND_CATEGORIES. The canonical
     * list itself is never changed to match a provider's label.
     */
    function normalizeCategoryLabel(label) {
        if (typeof label !== "string") return null;
        const normalized = label.trim().toLowerCase().replace(/\s+/g, "-");
        return SOUND_CATEGORIES.includes(normalized) ? normalized : null;
    }

    class CozyHearingEngine {
        #audioCtx = null;
        #analyser = null;
        #stream = null;
        #listening = false;
        #sessions = new Map(); // sessionId -> {state, profile, startedAt, stoppedAt}
        #classifiers = new Map(); // id -> { descriptor (public), fn (private) }
        #history = [];
        #enabled = true;
        #lastError = null;
        #hearingInputAdapterId = null;
        #pendingStreamResolve = null;

        getVersion() { return VERSION; }

        // ── RL-014 Platform Inspection Contract (Milestone 173, additive only) ──
        /** @returns {string} stable identifier — matches the window.CozyOS registration key and ServiceRegistry entry. */
        getId() { return "CozyHearing"; }
        /** @returns {string} human-readable name. */
        getName() { return "CozyHearing"; }
        /** @returns {string[]} real runtime dependencies (window.CozyOS.AudioEngine, used by #ensureRegisteredWithAudioEngine()). */
        getDependencies() { return ["AudioEngine"]; }

        /** Registers as an AudioEngine input adapter exactly once (Milestone 158). Never fabricates a stream — only relays what AudioEngine actually routes. */
        #ensureRegisteredWithAudioEngine() {
            const engine = window.CozyOS.AudioEngine;
            if (!engine || this.#hearingInputAdapterId) return;
            this.#hearingInputAdapterId = engine.registerInputAdapter({
                target: "hearing",
                handler: (stream) => {
                    if (this.#pendingStreamResolve) {
                        const resolve = this.#pendingStreamResolve;
                        this.#pendingStreamResolve = null;
                        resolve(stream);
                    } else if (!stream) {
                        // AudioEngine ended the session out from under an already-listening Hearing Engine — tear down our own DSP graph honestly rather than hold a dead reference.
                        this.#teardownAnalysis();
                    }
                }
            });
        }

        #teardownAnalysis() {
            try { if (this.#audioCtx) this.#audioCtx.close(); } catch (_err) { /* already closed */ }
            this.#audioCtx = null; this.#analyser = null; this.#stream = null; this.#listening = false;
        }
        getSoundCategories() { return SOUND_CATEGORIES.slice(); }
        getProfiles() { return PROFILES.slice(); }

        #log(event, detail) {
            this.#history.push({ event, at: new Date().toISOString(), detail: detail || null });
            if (this.#history.length > 300) this.#history.shift();
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`hearing:${event}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }
        getHistory() { return this.#history.slice(); }

        // ── Capabilities (real, honest) ────────────────────────────────────
        getCapabilities() {
            const engine = window.CozyOS.AudioEngine;
            const micSupported = (engine && typeof engine.supportsMicrophone === "function")
                ? engine.supportsMicrophone()
                : (typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function");
            const audioSupported = micSupported &&
                (typeof window !== "undefined" && (!!window.AudioContext || !!window.webkitAudioContext));
            const anyClassifier = this.#classifiers.size > 0;
            const anyMultiSound = Array.from(this.#classifiers.values()).some((c) => c.descriptor.supportsMultiSound === true);
            const anyOffline = Array.from(this.#classifiers.values()).some((c) => c.descriptor.offline === true);
            return Object.freeze({
                supportsRealtimeListening: audioSupported,
                supportsClassification: anyClassifier,
                supportsNoiseDetection: audioSupported,
                supportsSilenceDetection: audioSupported,
                supportsMultiSound: anyMultiSound,
                supportsOfflineAnalysis: audioSupported && (this.#classifiers.size === 0 || anyOffline),
                honestLimitation: anyClassifier ? undefined : "No real classifier registered — classifySound() fails closed."
            });
        }

        // ── Listening lifecycle (Milestone 158: consumes AudioEngine's shared stream) ──
        async startListening(constraints) {
            if (this.#listening) return { success: false, reason: "Already listening. Call stopListening() first." };
            const engine = window.CozyOS.AudioEngine;
            if (!engine) {
                return { success: false, isReal: false, reason: "Listening Engine (window.CozyOS.AudioEngine) is not available in this environment." };
            }
            this.#ensureRegisteredWithAudioEngine();
            try {
                // routeAudio() inside AudioEngine.startListeningSession() calls our
                // handler synchronously before startListening()'s promise resolves,
                // so by the time await returns below, #pendingStreamResolve has
                // already fired for a successful start. This Promise just gives the
                // handler a place to hand the stream to this async function.
                const streamPromise = new Promise((resolve) => { this.#pendingStreamResolve = resolve; });
                await engine.startListening(constraints && constraints.deviceId ? { deviceId: constraints.deviceId } : {});
                const stream = await streamPromise;
                if (!stream) {
                    return { success: false, reason: "AudioEngine reported a started session but routed no stream." };
                }
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) { return { success: false, reason: "Web Audio API not available." }; }
                this.#stream = stream;
                this.#audioCtx = new AC();
                const source = this.#audioCtx.createMediaStreamSource(stream);
                this.#analyser = this.#audioCtx.createAnalyser();
                this.#analyser.fftSize = 2048;
                source.connect(this.#analyser);
                this.#listening = true;
                this.#log("listening-started", {});
                return { success: true };
            } catch (err) {
                this.#pendingStreamResolve = null;
                this.#lastError = err && err.message ? err.message : String(err);
                this.#log("listening-failed", { reason: this.#lastError });
                return { success: false, reason: `Real AudioEngine.startListening() rejection: ${this.#lastError}` };
            }
        }

        async stopListening() {
            if (!this.#listening) return { success: true, reason: "Not listening." };
            const engine = window.CozyOS.AudioEngine;
            // Hearing owns tearing down its OWN AudioContext/AnalyserNode (its DSP
            // graph); it does not stop the underlying MediaStream tracks itself —
            // AudioEngine owns the stream and stops it via its own
            // stopListening(), same as before Milestone 158 this file only ever
            // analysed, never released, hardware it didn't acquire.
            if (engine && typeof engine.stopListening === "function") {
                await engine.stopListening();
            }
            this.#teardownAnalysis();
            this.#log("listening-stopped", {});
            return { success: true };
        }

        isListening() { return this.#listening; }

        // ── Real DSP analysis ──────────────────────────────────────────────
        /** analyseSound() — real, instantaneous metrics from the live analyser. No confidence field: these are direct measurements, not inferences. */
        analyseSound() {
            if (!this.#analyser) return { success: false, reason: "Not listening. Call startListening() first." };
            const timeData = new Uint8Array(this.#analyser.fftSize);
            const freqData = new Uint8Array(this.#analyser.frequencyBinCount);
            this.#analyser.getByteTimeDomainData(timeData);
            this.#analyser.getByteFrequencyData(freqData);

            let sumSquares = 0, peak = 0;
            for (let i = 0; i < timeData.length; i++) {
                const normalized = (timeData[i] - 128) / 128;
                sumSquares += normalized * normalized;
                peak = Math.max(peak, Math.abs(normalized));
            }
            const rms = Math.sqrt(sumSquares / timeData.length);

            let maxBin = 0, maxVal = 0;
            for (let i = 0; i < freqData.length; i++) { if (freqData[i] > maxVal) { maxVal = freqData[i]; maxBin = i; } }
            const nyquist = this.#audioCtx.sampleRate / 2;
            const dominantFrequencyHz = (maxBin / freqData.length) * nyquist;

            const silent = rms < 0.02;
            return {
                success: true,
                volume: rms,
                energy: rms,
                peak,
                dominantFrequencyHz,
                noiseLevel: rms > 0.15 ? "high" : rms > 0.05 ? "moderate" : "low",
                silence: silent,
                capturedAt: new Date().toISOString()
            };
        }

        /** detectSound() — one-shot alias of analyseSound(), for single-capture use. */
        detectSound() { const r = this.analyseSound(); this.#log("detect", r.success ? { silence: r.silence } : { failed: true }); return r; }

        // ── Classification (extension point — never fabricated) ───────────
        registerClassifier(descriptor = {}, classifierFn) {
            if (!descriptor.id || !descriptor.name) return { success: false, reason: "descriptor.id and descriptor.name are required." };
            if (typeof classifierFn !== "function") return { success: false, reason: "classifierFn must be a real function — no default/fake classifier is provided." };
            // Normalize provider-declared labels (e.g. "Door Knock") to the
            // canonical form instead of silently dropping them; unmappable
            // labels are still dropped — canonical categories never change.
            const categories = Array.isArray(descriptor.categories) ? descriptor.categories.map(normalizeCategoryLabel).filter(Boolean) : [];
            this.#classifiers.set(descriptor.id, {
                descriptor: Object.freeze({
                    id: descriptor.id, name: descriptor.name, categories, offline: !!descriptor.offline,
                    supportsMultiSound: !!descriptor.supportsMultiSound,
                    // Additive: higher priority is preferred when classifySound()
                    // selects among multiple registered classifiers via
                    // classifyAll(). Defaults to 0 — a single registered
                    // classifier behaves exactly as before this field existed.
                    priority: typeof descriptor.priority === "number" ? descriptor.priority : 0
                }),
                fn: classifierFn
            });
            this.#log("classifier-registered", { id: descriptor.id });
            return { success: true };
        }

        listClassifiers() { return Array.from(this.#classifiers.values()).map((c) => c.descriptor); }

        /**
         * classifyAll(audioSample?, options?)
         *   Real multi-classifier dispatch — the new provider-architecture
         *   extension point. Runs every registered classifier (or
         *   options.classifierIds, a real subset) against the same sample,
         *   highest declared priority first. One classifier throwing never
         *   blocks the others. Fails closed (empty results + reason) with
         *   zero classifiers registered — never fabricated.
         */
        classifyAll(audioSample, options = {}) {
            const entries = Array.isArray(options.classifierIds) && options.classifierIds.length
                ? options.classifierIds.map((id) => this.#classifiers.get(id)).filter(Boolean)
                : Array.from(this.#classifiers.values());
            if (entries.length === 0) {
                return {
                    success: false, isReal: false, results: [],
                    reason: options.classifierIds ? "None of the requested classifierIds are registered." : "No real classifier registered. Not fabricated — fails closed."
                };
            }
            const sample = audioSample || this.analyseSound();
            const results = entries
                .slice()
                .sort((a, b) => (b.descriptor.priority || 0) - (a.descriptor.priority || 0))
                .map((entry) => {
                    try {
                        const result = entry.fn(sample);
                        this.#log("classified", { classifierId: entry.descriptor.id, category: result && result.category });
                        return { classifierId: entry.descriptor.id, success: true, isReal: true, ...result };
                    } catch (err) {
                        const reason = err && err.message ? err.message : String(err);
                        return { classifierId: entry.descriptor.id, success: false, isReal: false, reason: `Classifier threw: ${reason}` };
                    }
                });
            return { success: true, isReal: results.some((r) => r.isReal), results };
        }

        /**
         * classifySound(audioSample?) — the stable public single-result API.
         * Same external contract as before this milestone (success/isReal/
         * classifierId/category/confidence/...). Internally now delegates to
         * classifyAll() and returns the highest-priority classifier's real
         * result, so registering more than one classifier is no longer an
         * arbitrary Map-order pick. With exactly one classifier registered
         * (the common case so far), the returned value is unchanged.
         */
        classifySound(audioSample) {
            const dispatch = this.classifyAll(audioSample);
            if (!dispatch.success) {
                return { success: false, isReal: false, category: "unknown", confidence: null, reason: dispatch.reason };
            }
            const best = dispatch.results.find((r) => r.success);
            if (!best) {
                const firstFailure = dispatch.results[0];
                this.#lastError = firstFailure ? firstFailure.reason : "All registered classifiers failed.";
                return { success: false, isReal: false, reason: this.#lastError };
            }
            return best;
        }

        // ── Sessions ────────────────────────────────────────────────────────
        createSession({ profile = null } = {}) {
            if (profile && !PROFILES.includes(profile)) return { success: false, reason: `Unknown profile "${profile}".` };
            const sessionId = `hearing_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
            this.#sessions.set(sessionId, { state: "created", profile, startedAt: null, stoppedAt: null });
            return { success: true, sessionId };
        }
        startSession(sessionId) { return this.#transition(sessionId, "created", "active", "startedAt"); }
        stopSession(sessionId) { return this.#transition(sessionId, "active", "stopped", "stoppedAt"); }
        #transition(sessionId, from, to, stamp) {
            const s = this.#sessions.get(sessionId);
            if (!s) return { success: false, reason: `Session "${sessionId}" not found.` };
            if (s.state !== from) return { success: false, reason: `Session is "${s.state}", expected "${from}".` };
            this.#sessions.set(sessionId, { ...s, state: to, [stamp]: new Date().toISOString() });
            return { success: true };
        }
        getSession(sessionId) { return this.#sessions.get(sessionId) || null; }

        // ── Health ──────────────────────────────────────────────────────────
        getHealth() {
            if (this.#lastError) return { health: HEALTH.ERROR, reason: this.#lastError };
            if (!this.#enabled) return { health: HEALTH.DISABLED };
            if (this.#listening) return { health: HEALTH.LISTENING };
            const audioSupported = this.getCapabilities().supportsRealtimeListening;
            return { health: audioSupported ? HEALTH.READY : HEALTH.UNAVAILABLE };
        }
        disable() { this.stopListening().catch((err) => { this.#lastError = err && err.message ? err.message : String(err); }); this.#enabled = false; }
        enable() { this.#enabled = true; }

        getIntegrationManifest() {
            return {
                owns: ["hearing/sound-event registry", "real DSP sound analysis", "sessions", "classifier extension point", "multi-classifier dispatch (classifyAll)"],
                doesNotOwn: ["microphone acquisition/stream lifecycle (AudioEngine — Listening Engine)", "speech recognition (CozySpeech)", "voice authentication (voice-provider.js)", "audio playback/recording (Media Engine)", "translation", "AI"],
                registersWith: ["AudioEngine.registerInputAdapter()"],
                honestLimitation: "classifySound()/classifyAll() return isReal:false until at least one real classifier backend is registered via registerClassifier(). Analysis metrics (volume/energy/peak/frequency/silence) are real DSP, always available when listening."
            };
        }
    }

    window.CozyOS.CozyHearing = new CozyHearingEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/hearing/cozy-hearing.js",
                name: "CozyHearing", category: "Platform", icon: "ear.svg",
                description: "Canonical Hearing Engine. Real DSP sound analysis (volume/energy/peak/frequency/silence). Classification fails closed until a real classifier is registered — never fabricated."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();                                                                                   
