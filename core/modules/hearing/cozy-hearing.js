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
 *   who is speaking. Reuses VoiceCaptureAdapter (core/modules/speech/
 *   adapters/voice-capture-adapter.js) for raw microphone acquisition
 *   when present, so a second microphone owner is never created; falls
 *   back to its own getUserMedia call only if that adapter isn't loaded.
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

        getVersion() { return VERSION; }
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
            const audioSupported = (typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") &&
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

        // ── Listening lifecycle ────────────────────────────────────────────
        async startListening(constraints) {
            if (this.#listening) return { success: false, reason: "Already listening. Call stopListening() first." };
            try {
                let stream;
                const capture = window.CozyOS.VoiceCaptureAdapter;
                if (capture && typeof capture.startCapture === "function") {
                    const result = await capture.startCapture(constraints);
                    if (!result.success) return result;
                    stream = result.stream;
                } else {
                    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
                        return { success: false, isReal: false, reason: "No microphone API available in this environment." };
                    }
                    stream = await navigator.mediaDevices.getUserMedia(constraints || { audio: true, video: false });
                }
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) { stream.getTracks().forEach((t) => t.stop()); return { success: false, reason: "Web Audio API not available." }; }
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
                this.#lastError = err && err.message ? err.message : String(err);
                this.#log("listening-failed", { reason: this.#lastError });
                return { success: false, reason: `Real getUserMedia/AudioContext rejection: ${this.#lastError}` };
            }
        }

        stopListening() {
            if (!this.#listening) return { success: true, reason: "Not listening." };
            try { if (this.#stream) this.#stream.getTracks().forEach((t) => t.stop()); if (this.#audioCtx) this.#audioCtx.close(); }
            finally { this.#stream = null; this.#audioCtx = null; this.#analyser = null; this.#listening = false; }
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
            const categories = Array.isArray(descriptor.categories) ? descriptor.categories.filter((c) => SOUND_CATEGORIES.includes(c)) : [];
            this.#classifiers.set(descriptor.id, {
                descriptor: Object.freeze({ id: descriptor.id, name: descriptor.name, categories, offline: !!descriptor.offline, supportsMultiSound: !!descriptor.supportsMultiSound }),
                fn: classifierFn
            });
            this.#log("classifier-registered", { id: descriptor.id });
            return { success: true };
        }

        listClassifiers() { return Array.from(this.#classifiers.values()).map((c) => c.descriptor); }

        /** classifySound(audioSample?) — real invocation of a registered backend, or honest fail-closed. */
        classifySound(audioSample) {
            if (this.#classifiers.size === 0) {
                return { success: false, isReal: false, category: "unknown", confidence: null, reason: "No real classifier registered. Not fabricated — fails closed." };
            }
            const [{ fn, descriptor }] = this.#classifiers.values();
            try {
                const result = fn(audioSample || this.analyseSound());
                this.#log("classified", { classifierId: descriptor.id, category: result && result.category });
                return { success: true, isReal: true, classifierId: descriptor.id, ...result };
            } catch (err) {
                this.#lastError = err && err.message ? err.message : String(err);
                return { success: false, isReal: false, reason: `Classifier threw: ${this.#lastError}` };
            }
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
        disable() { this.stopListening(); this.#enabled = false; }
        enable() { this.#enabled = true; }

        getIntegrationManifest() {
            return {
                owns: ["hearing/sound-event registry", "real DSP sound analysis", "sessions", "classifier extension point"],
                doesNotOwn: ["speech recognition (CozySpeech)", "voice authentication (voice-provider.js)", "audio playback/recording (Media Engine)", "translation", "AI"],
                honestLimitation: "classifySound() returns isReal:false until a real classifier backend is registered via registerClassifier(). Analysis metrics (volume/energy/peak/frequency/silence) are real DSP, always available when listening."
            };
        }
    }

    window.CozyOS.CozyHearing = new CozyHearingEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CozyHearing", category: "Platform", icon: "ear.svg",
                description: "Canonical Hearing Engine. Real DSP sound analysis (volume/energy/peak/frequency/silence). Classification fails closed until a real classifier is registered — never fabricated."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
