/**
 * CozyOS Voice Processor Adapter
 * File Reference: core/modules/speech/adapters/voice-processor-adapter.js
 * Milestone: 147 (reframed) — Speech Platform Adapter
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP: real, honest signal processing only — gain normalization and
 * energy-based silence/voice-activity detection via the real Web Audio API
 * (AnalyserNode/GainNode). This is genuine DSP, not AI.
 * Does NOT perform: speech recognition, emotion analysis, accent detection,
 * speaker recognition, or any AI inference. Those have no real backend
 * available offline and are NOT fabricated here — see
 * voice-capability-stub.js, which honestly reports them as DEFERRED.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.VoiceProcessorAdapter) return;

    class VoiceProcessorAdapter {
        #audioCtx = null;
        #analyser = null;
        #gainNode = null;
        #source = null;

        getVersion() { return VERSION; }

        isSupported() {
            return typeof window !== "undefined" && (!!window.AudioContext || !!window.webkitAudioContext);
        }

        /** attach(stream) — wires a real MediaStream into a real analysis+gain graph. */
        attach(stream) {
            if (!this.isSupported()) return { success: false, reason: "Web Audio API not available in this environment." };
            if (!stream || typeof stream.getAudioTracks !== "function") return { success: false, reason: "attach() requires a real MediaStream (e.g. from VoiceCaptureAdapter)." };
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                this.#audioCtx = new AC();
                this.#source = this.#audioCtx.createMediaStreamSource(stream);
                this.#analyser = this.#audioCtx.createAnalyser();
                this.#analyser.fftSize = 2048;
                this.#gainNode = this.#audioCtx.createGain();
                this.#gainNode.gain.value = 1.0;
                this.#source.connect(this.#analyser).connect(this.#gainNode);
                return { success: true };
            } catch (err) {
                return { success: false, reason: `Real Web Audio graph construction failed: ${err && err.message ? err.message : String(err)}` };
            }
        }

        /** getEnergyLevel() — real RMS energy from the live analyser buffer (0..1). */
        getEnergyLevel() {
            if (!this.#analyser) return { success: false, reason: "Not attached. Call attach(stream) first." };
            const buffer = new Uint8Array(this.#analyser.fftSize);
            this.#analyser.getByteTimeDomainData(buffer);
            let sumSquares = 0;
            for (let i = 0; i < buffer.length; i++) {
                const normalized = (buffer[i] - 128) / 128;
                sumSquares += normalized * normalized;
            }
            const rms = Math.sqrt(sumSquares / buffer.length);
            return { success: true, energy: rms };
        }

        /** isSilent(thresholdRms) — real, honest threshold-based VAD. Not ML-based speech detection. */
        isSilent(thresholdRms = 0.02) {
            const result = this.getEnergyLevel();
            if (!result.success) return result;
            return { success: true, silent: result.energy < thresholdRms, energy: result.energy, threshold: thresholdRms };
        }

        setGain(value) {
            if (!this.#gainNode) return { success: false, reason: "Not attached." };
            this.#gainNode.gain.value = value;
            return { success: true, gain: value };
        }

        detach() {
            try { if (this.#audioCtx) this.#audioCtx.close(); } catch (_err) { /* non-fatal */ }
            this.#audioCtx = null; this.#analyser = null; this.#gainNode = null; this.#source = null;
            return { success: true };
        }

        getIntegrationManifest() {
            return {
                owns: ["gain normalization (real GainNode)", "energy-based silence/VAD detection (real AnalyserNode)"],
                doesNotOwn: ["speech recognition", "emotion analysis", "accent detection", "speaker recognition"],
                honestLimitation: "No AI/ML processing is performed. Silence detection is energy-threshold-based DSP, not voice activity ML."
            };
        }
    }

    window.CozyOS.VoiceProcessorAdapter = new VoiceProcessorAdapter();

    if (window.CozyOS.CozySpeech && typeof window.CozyOS.CozySpeech.registerAdapter === "function") {
        try {
            window.CozyOS.CozySpeech.registerAdapter({
                name: "VoiceProcessorAdapter", type: "processor",
                capabilities: ["gain-normalization", "energy-based-silence-detection"],
                offline: true, version: VERSION
            });
        } catch (_err) { /* non-fatal */ }
    }

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/speech/adapters/voice-processor-adapter.js",
                name: "VoiceProcessorAdapter", category: "Platform", icon: "waveform.svg",
                description: "Real Web Audio API gain normalization and energy-based silence detection. No speech recognition, emotion, or accent AI — honestly out of scope."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
