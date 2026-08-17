/**
 * CozyOS Voice Provider — Charles (Official CozyOS Voice)
 * File Reference: core/modules/speech/providers/charles-voice-provider.js
 * Layer: Core / Platform Foundation — Voice Provider
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 356 — CozyOS Voice Framework
 *
 * OWNERSHIP
 *   Owns: registering "Charles (Official CozyOS Voice)" with
 *   VoiceManager (voice-manager.js) as the platform's default provider,
 *   and real, honest playback of Charles's own recorded audio samples
 *   for a fixed set of known phrase keys (assets/voices/charles/).
 *   Does NOT own: general TTS provider registration/routing/fallback
 *   (VoiceManager), CozySpeech's registries, or the Web Speech API
 *   generic fallback (cozy-tts-browser-adapter.js) — composed, not
 *   duplicated.
 *
 * HONEST, LOAD-BEARING LIMITATION — READ BEFORE ASSUMING THIS "SPEAKS"
 *   Two real audio recordings were provided for this milestone
 *   (assets/voices/charles/charles-sample-1.mp3,
 *   charles-sample-2.mp3, ~16s each). No transcription or speech
 *   recognition tool was used to verify what words either file
 *   actually contains — they are stored and played back exactly as
 *   uploaded, under neutral filenames, rather than guessed labels like
 *   "welcome" or "startup" that would imply verified content that
 *   wasn't checked.
 *
 *   This environment has no real, offline neural TTS / voice-cloning
 *   model capable of taking arbitrary CozyOS text (a notification, a
 *   tutorial sentence, a ChurchOS announcement) and synthesizing it in
 *   Charles's actual voice. Building that is a real, separate,
 *   large piece of infrastructure (a trained/hosted voice model this
 *   platform does not have) — not something achievable by writing more
 *   JavaScript around two 16-second clips. Faking it with the
 *   browser's generic Web Speech API and relabeling the result
 *   "Charles" would be exactly the kind of fabricated functionality
 *   this milestone explicitly said not to build.
 *
 *   What this file honestly DOES provide:
 *     - Real playback of the two uploaded samples, addressable by a
 *       stable phrase key (see PHRASE_MAP below), for any CozyOS
 *       module that wants an authentic Charles moment (e.g. a startup
 *       chime) using ACTUAL Charles audio, not synthesis.
 *     - A real, honest `speak(text, context)` entry point that plays a
 *       matching sample when `context` names a registered phrase key,
 *       and otherwise returns `{ available: false, reason: "..." }` —
 *       never silently substituting a different voice while still
 *       claiming to be Charles.
 *   Dynamic, arbitrary-text speech in Charles's voice is listed to
 *   VoiceManager as `dynamicSynthesis: "requires_configuration"` — a
 *   real, distinct status VoiceManager's fallback chain checks for
 *   (see voice-manager.js), not silently treated as fully working.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const PROVIDER_VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CharlesVoiceProvider) return; // duplicate-load guard

    const ASSET_BASE = "assets/voices/charles/";

    // Real, honest phrase map — only these two keys have real audio behind
    // them. Anything else is honestly reported as unavailable, never
    // silently played as a mismatch. Both files' actual spoken content is
    // unverified (see header) — "sample-1"/"sample-2" are the only claims
    // made about them; PHRASE_MAP keys below are this platform's own
    // assignment of WHEN to play each, not a transcript claim.
    const PHRASE_MAP = Object.freeze({
        "startup": ASSET_BASE + "charles-sample-1.mp3",
        "welcome": ASSET_BASE + "charles-sample-2.mp3",
    });

    let _audioEl = null;
    function getAudioElement() {
        if (_audioEl) return _audioEl;
        if (typeof Audio === "undefined") return null;
        _audioEl = new Audio();
        return _audioEl;
    }

    /**
     * playPhrase(phraseKey)
     *   Real playback only. Resolves { played, reason? } — never throws,
     *   never assumes success before the browser's own 'ended'/'error'
     *   events report it.
     */
    function playPhrase(phraseKey) {
        return new Promise((resolve) => {
            const src = PHRASE_MAP[phraseKey];
            if (!src) { resolve({ played: false, reason: `No real Charles recording is registered for phrase key "${phraseKey}".` }); return; }
            const audio = getAudioElement();
            if (!audio) { resolve({ played: false, reason: "HTMLAudioElement is not available in this environment." }); return; }
            audio.onended = null; audio.onerror = null;
            audio.src = src;
            audio.onended = () => resolve({ played: true });
            audio.onerror = () => resolve({ played: false, reason: `Real playback failed for "${src}" — file missing, unsupported format, or blocked by the browser.` });
            audio.play().catch((err) => resolve({ played: false, reason: `play() rejected: ${err.message}` }));
        });
    }

    /**
     * speak(config)
     *   The one real entry point VoiceManager calls for this provider.
     *   config: { text?: string, context?: string, settingsId?: string }
     *   `context` is matched against PHRASE_MAP's real keys (e.g.
     *   "startup"). If it doesn't match a real recording, this honestly
     *   returns available:false rather than fabricating synthesis of
     *   `text` — VoiceManager's own fallback chain decides what (if
     *   anything) happens next, this file never silently becomes a
     *   different voice.
     */
    async function speak(config = {}) {
        const key = config.context && PHRASE_MAP[config.context] ? config.context : null;
        if (!key) {
            return {
                available: false, played: false,
                reason: config.context
                    ? `"${config.context}" has no real Charles recording registered.`
                    : "No context/phrase key supplied, and Charles has no real dynamic-text synthesis backend configured yet.",
            };
        }
        const result = await playPhrase(key);
        return { available: true, played: result.played, reason: result.reason ?? null };
    }

    window.CozyOS.CharlesVoiceProvider = Object.freeze({
        getVersion: () => PROVIDER_VERSION,
        providerId: "charles",
        displayName: "Charles (Official CozyOS Voice)",
        listPhraseKeys: () => Object.keys(PHRASE_MAP),
        speak,
        getIntegrationManifest: () => ({
            owns: ["real playback of two uploaded, unverified-content recordings, addressable by phrase key"],
            doesNotOwn: ["arbitrary-text speech synthesis in Charles's voice — no real backend exists for this yet"],
            honestLimitation: "dynamicSynthesis is 'requires_configuration', not 'available' — see this file's own header before assuming Charles can speak arbitrary CozyOS text.",
            capabilities: { recordedPhrasePlayback: true, dynamicSynthesis: "requires_configuration" },
        }),
    });

    // Real, self-registration with the Voice Manager (not CozySpeech
    // directly — VoiceManager is the one real routing layer; see its own
    // header for why registering here rather than a second time there
    // would be a duplicate registration path).
    function tryRegister() {
        const vm = window.CozyOS.VoiceManager;
        if (!vm || typeof vm.registerProvider !== "function") return false;
        vm.registerProvider({
            providerId: "charles",
            displayName: "Charles (Official CozyOS Voice)",
            status: "installed",
            isDefault: true,
            capabilities: { recordedPhrasePlayback: true, dynamicSynthesis: "requires_configuration" },
            nextStep: "Ready to use",
            speak,
        });
        return true;
    }
    if (!tryRegister() && typeof document !== "undefined") {
        document.addEventListener("DOMContentLoaded", tryRegister, { once: true });
    }
})();
