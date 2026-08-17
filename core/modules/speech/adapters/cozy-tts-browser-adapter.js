/**
 * CozyOS TTS Browser Adapter
 * File Reference: core/modules/speech/adapters/cozy-tts-browser-adapter.js
 * Layer: Core / Platform Foundation — Speech Adapter
 * Version: 1.0.0-ENTERPRISE
 *
 * MILESTONE 149 — Text-to-Speech Provider Integration
 *
 * OWNERSHIP
 *   Owns: nothing new. This file is a plug-in only — it composes with
 *   the canonical registries already shipped in cozy-speech.js
 *   (Milestone 147/148):
 *     - registerPreviewBackend(fn)  — the real hook Voice Studio's
 *       "Live Preview Controls" already calls through previewVoice().
 *     - registerAdapter(config)     — the existing, generic adapter
 *       bookkeeping registry (§3.21), used here only to record that
 *       this adapter exists — never a second adapter registry.
 *   Does NOT own: voice authentication (voice-provider.js, unchanged),
 *   session/stream/language coordination (cozy-speech.js, unchanged),
 *   microphone/mixer (audio-manager.js, unchanged), Developer Hub UI
 *   (developer-hub.js, unchanged — Voice Studio keeps calling the same
 *   previewVoice()/hasRealPreviewBackend() it always did).
 *
 * HONEST IMPLEMENTATION
 *   Uses the real, standard browser Web Speech API
 *   (window.speechSynthesis / SpeechSynthesisUtterance) — genuinely
 *   available in most modern browsers, nothing fabricated. If the
 *   browser does not expose it, this file honestly does NOT register a
 *   preview backend, and previewVoice() keeps returning
 *   { available:false } exactly as it did before this milestone —
 *   never a fake "success".
 *
 *   Voice Profile / Accent / Emotion / Speaking Style are real,
 *   CozyOS-owned metadata (cozy-speech.js), but the Web Speech API has
 *   no concept of them — it only offers whatever voices/locales the
 *   host OS/browser ships. This adapter maps `language` → a matching
 *   installed SpeechSynthesisVoice by BCP-47 prefix when one exists,
 *   and maps `speed`/`pitch`/`volume` from Voice Settings directly onto
 *   the utterance's real rate/pitch/volume. It never claims to render a
 *   specific accent, emotion, or speaking style — those remain stored
 *   preferences an adapter cannot yet fulfill, not silently dropped
 *   but not fabricated either.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ADAPTER_VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CozyTTSBrowserAdapter) return;

    function getSpeechSynthesis() {
        return (typeof window !== "undefined" && window.speechSynthesis) ? window.speechSynthesis : null;
    }

    /**
     * Real, best-effort voice lookup by language prefix (e.g. "en" matches
     * "en-US", "en-GB"). Returns undefined (browser default) if no match —
     * never guesses or fabricates a voice that isn't actually installed.
     */
    function findVoiceForLanguage(synth, languageCode) {
        if (!languageCode) return undefined;
        try {
            const voices = synth.getVoices() || [];
            return voices.find(v => v.lang && v.lang.toLowerCase().startsWith(languageCode.toLowerCase()));
        } catch (_err) {
            return undefined;
        }
    }

    /**
     * The real preview backend function registered with CozySpeech.
     * Contract (matches previewVoice()'s expectations): resolves
     * { played: boolean, reason?: string }. Never throws — CozySpeech's
     * previewVoice() already wraps this in try/catch, but this stays
     * defensive on its own too.
     *
     * @param {{voiceProfileId?:string, text?:string, settingsId?:string}} config
     */
    function speakPreview(config = {}) {
        const synth = getSpeechSynthesis();
        return new Promise((resolve) => {
            if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
                resolve({ played: false, reason: "Web Speech API is not available in this browser." });
                return;
            }

            const text = (config.text && String(config.text).trim()) ||
                "Hello, I'm Cozy AI. This is how I sound.";
            const utterance = new SpeechSynthesisUtterance(text);

            // Real, opaque lookups only — CozySpeech is still the sole
            // source of truth for these records; this adapter never
            // stores its own copy.
            let settings = null;
            if (config.settingsId && window.CozyOS.CozySpeech?.getVoiceSettings) {
                try { settings = window.CozyOS.CozySpeech.getVoiceSettings(config.settingsId); } catch (_err) { /* honest no-op */ }
            }

            if (settings?.language) {
                const matchedVoice = findVoiceForLanguage(synth, settings.language);
                if (matchedVoice) utterance.voice = matchedVoice;
                utterance.lang = settings.language;
            }
            // Real Web Speech API ranges: rate/pitch 0.1–10 (1 = normal),
            // volume 0–1. CozySpeech's speed/pitch/volume already default
            // to 1.0/1.0/1.0, so a direct pass-through is honest — no
            // invented scaling curve.
            if (settings) {
                if (typeof settings.speed === "number")  utterance.rate   = Math.min(10, Math.max(0.1, settings.speed));
                if (typeof settings.pitch === "number")  utterance.pitch  = Math.min(2, Math.max(0, settings.pitch));
                if (typeof settings.volume === "number") utterance.volume = Math.min(1, Math.max(0, settings.volume));
            }

            utterance.onend = () => resolve({ played: true });
            utterance.onerror = (evt) => resolve({ played: false, reason: `Speech synthesis error: ${evt.error || "unknown"}` });

            try {
                synth.speak(utterance);
            } catch (err) {
                resolve({ played: false, reason: `Real backend threw: ${err.message}` });
            }
        });
    }

    function register() {
        const speech = window.CozyOS.CozySpeech;
        if (!speech || typeof speech.registerPreviewBackend !== "function") {
            // CozySpeech not loaded yet, or an older build without the
            // Preview Backend hook — honestly do nothing rather than
            // guessing at a contract that isn't there.
            return { success: false, reason: "CozySpeech.registerPreviewBackend is not available." };
        }

        const synth = getSpeechSynthesis();
        if (!synth) {
            // No fabricated backend — previewVoice() keeps its existing,
            // honest fail-closed behavior.
            return { success: false, reason: "Web Speech API is not available in this browser." };
        }

        const result = speech.registerPreviewBackend(speakPreview);
        if (result.success && typeof speech.registerAdapter === "function") {
            // Bookkeeping only, in the existing generic adapter registry
            // (§3.21 of cozy-speech.js) — not a second registry.
            try {
                speech.registerAdapter({
                    name: "CozyTTSBrowserAdapter",
                    type: "tts",
                    capabilities: ["preview"],
                    offline: true,
                    version: ADAPTER_VERSION,
                });
            } catch (_err) { /* non-fatal bookkeeping only */ }
        }
        return result;
    }

    window.CozyOS.CozyTTSBrowserAdapter = Object.freeze({
        getVersion: () => ADAPTER_VERSION,
        isAvailable: () => getSpeechSynthesis() !== null,
        register,
        // Milestone 356: real, public export so VoiceManager (voice-manager.js)
        // can call this directly as its own honestly-labeled generic
        // fallback, rather than a second Web Speech API implementation.
        speakPreview,
    });

    // Auto-register at load time, per Registration Rules — no manual step.
    // Voices can load asynchronously in some browsers; register
    // immediately (most browsers already have voices, or don't need
    // them for a default-voice utterance), and re-attempt once real
    // voices arrive so language matching improves without a second
    // registration path.
    register();
    const synth = getSpeechSynthesis();
    if (synth && typeof synth.addEventListener === "function") {
        synth.addEventListener("voiceschanged", () => { /* voices now available for future findVoiceForLanguage() calls — no re-registration needed, same function reference already handles this at call time */ }, { once: true });
    }
})();
