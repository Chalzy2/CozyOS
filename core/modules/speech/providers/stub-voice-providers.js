/**
 * CozyOS Voice Providers — Future/Unavailable Stubs
 * File Reference: core/modules/speech/providers/stub-voice-providers.js
 * Layer: Core / Platform Foundation — Voice Provider
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 356 — CozyOS Voice Framework
 *
 * OWNERSHIP
 *   Owns: registering honest, non-functional placeholder entries with
 *   VoiceManager for every provider named in the Milestone 356 spec
 *   that this platform does not have a real, working backend for
 *   today — so they are visible and selectable-as-a-target in the
 *   Voice & Speech settings UI, but never claimed to actually speak.
 *   Does NOT own: Charles (a real provider — see
 *   charles-voice-provider.js), VoiceManager's routing/fallback logic,
 *   or any actual Google/Microsoft/AI Studio API integration — none
 *   exists in this codebase, and none is fabricated here.
 *
 * RUNTIME RULE
 *   Every provider below registers with speak:null and a real,
 *   specific status (not_installed / requires_api_key /
 *   requires_configuration / unsupported_on_device). VoiceManager's
 *   own dispatch logic already skips any provider without a real
 *   speak function — these entries exist purely so the UI can list
 *   and honestly label them, never so they can be invoked.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.StubVoiceProviders) return; // duplicate-load guard

    // Each entry is a real, distinct provider identity with an honest
    // status and a plain-language reason a real Settings UI can show
    // as-is. `future` documents what a real adapter would need to
    // implement — reference only, never executed.
    const STUB_PROVIDERS = Object.freeze([
        {
            providerId: "google", displayName: "Google Voice Provider", status: "requires_api_key",
            reason: "No Google Cloud Text-to-Speech API key is configured for this CozyOS installation.",
            nextStep: "Configure Google Speech credentials",
            future: "GoogleVoiceProvider would call Google Cloud TTS's REST API with a configured API key/service account, entirely optional and online-only per CozySpeech's own offline-first mandate.",
        },
        {
            providerId: "microsoft", displayName: "Microsoft Voice Provider", status: "requires_api_key",
            reason: "No Azure Cognitive Services Speech key is configured for this CozyOS installation.",
            nextStep: "Configure Microsoft Speech service",
            future: "MicrosoftVoiceProvider would call Azure's Speech SDK/REST endpoint with a configured subscription key and region.",
        },
        {
            providerId: "swahili-pack", displayName: "Swahili Voice Pack", status: "not_installed",
            reason: "No Swahili voice pack has been installed on this device yet.",
            nextStep: "Install Swahili Voice Pack",
            future: "SwahiliVoiceProvider would load an installed .voicepack (see voice-pack-import.js) whose manifest declares language: \"sw\".",
        },
        {
            providerId: "female-pack", displayName: "Female Voice Pack", status: "not_installed",
            reason: "No installed voice pack on this device is tagged gender: \"female\" yet. The Web Speech API this platform's generic fallback uses does not reliably expose voice gender, so this cannot be guessed from installed system voices.",
            nextStep: "Install Female Voice Pack",
            future: "Would prefer an installed .voicepack manifest with gender: \"female\" over guessing from untagged system voices.",
        },
        {
            providerId: "ai-studio", displayName: "AI Studio Voice Provider", status: "requires_api_key",
            reason: "No AI Studio API key is configured for this CozyOS installation.",
            nextStep: "Connect AI Studio provider",
            future: "AIStudioVoiceProvider would call a configured generative-voice API — provider-agnostic interface, no vendor assumed yet.",
        },
        {
            providerId: "community", displayName: "Community Voice Packs", status: "not_installed",
            reason: "No community voice pack catalog source is configured for this CozyOS installation.",
            nextStep: "Import a compatible .voicepack",
            future: "CommunityVoiceProvider would list/install .voicepack entries from a configured community catalog URL or local folder — none configured yet.",
        },
    ]);

    function tryRegisterAll() {
        const vm = window.CozyOS.VoiceManager;
        if (!vm || typeof vm.registerProvider !== "function") return false;
        for (const stub of STUB_PROVIDERS) {
            vm.registerProvider({
                providerId: stub.providerId, displayName: stub.displayName, status: stub.status,
                capabilities: { recordedPhrasePlayback: false, dynamicSynthesis: stub.status },
                speak: null,
                nextStep: stub.nextStep,
                meta: { reason: stub.reason, future: stub.future },
            });
        }
        return true;
    }

    window.CozyOS.StubVoiceProviders = Object.freeze({
        getVersion: () => VERSION,
        listDefinitions: () => STUB_PROVIDERS.map((s) => ({ ...s })),
    });

    if (!tryRegisterAll() && typeof document !== "undefined") {
        document.addEventListener("DOMContentLoaded", tryRegisterAll, { once: true });
    }
})();
