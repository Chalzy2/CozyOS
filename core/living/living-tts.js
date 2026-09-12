/**
 * CozyOS Living TTS — core/living/living-tts.js
 * Layer: Core / Living — Speech Integration Facade
 * Version: 1.0.0-ENTERPRISE
 *
 * MISSION
 *   Give every CozyOS "living" experience (login gate, CozyAI spoken
 *   responses, future LivingOS speech moments) ONE clean, honest
 *   speak() entry point — without becoming a second speech manager.
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   - CozySpeech (core/modules/speech/cozy-speech.js) already owns
 *     session/voice-profile/voice-settings bookkeeping and the ONE
 *     real preview/TTS backend slot (registerPreviewBackend/
 *     previewVoice). Unchanged.
 *   - VoiceManager (core/modules/speech/voice-manager.js) already IS
 *     the real Living TTS manager: provider registry, default/
 *     per-context voice assignment, and the real fallback chain
 *     (requested provider -> Charles -> generic browser TTS). It is
 *     already CozySpeech's registered preview backend. Unchanged.
 *   - CozyTTSBrowserAdapter and CharlesVoiceProvider already provide
 *     the two real backends VoiceManager routes to. Unchanged.
 *   - LivingSounds (core/living/cozy-living-sounds.js) already owns
 *     recorded UI/ambience sound-pack playback. This file does not
 *     touch it, does not replace it, and does not route speech
 *     through it — LivingSounds' play() resolves on playback START,
 *     not completion, which is wrong for speech that other stages
 *     need to wait on. TTS and recorded ambience remain separate
 *     concerns that coexist.
 *   - No existing file exposes a single, generically-named,
 *     status-reporting, event-integrated speak() a non-speech-expert
 *     caller (e.g. tomorrow's login-gate work, or CozyEnvironment)
 *     can use without knowing VoiceManager's/CozySpeech's internals.
 *     THAT is the one real, smallest missing integration this file
 *     fills — composition only, zero new registries, zero new state
 *     beyond a short-lived transient voice-settings record per call.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not implement speech synthesis or playback itself.
 *   - Does not maintain a second provider/adapter registry.
 *   - Does not change VoiceManager's default/per-context voice
 *     assignment, settings, or fallback logic.
 *   - Does not touch login-gate/launch-sequence files, founder-story
 *     files, or LivingSounds' registry.
 *   - Does not implement mute (explicitly out of scope this milestone
 *     — VoiceManager has no mute flag either; a future milestone can
 *     add one to VoiceManager and this facade will simply surface it).
 *
 * RECORDED-AUDIO VS TTS — KEPT HONEST, NEVER BLURRED
 *   After VoiceManager.speak() resolves, this file classifies the
 *   result's `kind` STRICTLY from that provider's own already-
 *   registered capabilities (VoiceManager.getProvider(providerId)
 *   .capabilities) — never guessed, never inferred from the provider
 *   name:
 *     - "recorded"    capabilities.recordedPhrasePlayback === true
 *     - "synthesized" capabilities.dynamicSynthesis === true, or the
 *                     provider is literally "browser"
 *     - "unknown"     neither flag is honestly set
 *   This file never claims a recording is TTS, or that a browser
 *   voice is a specific person's recorded voice.
 *
 * LANGUAGE / LOCALE
 *   VoiceManager.speak() does not currently accept a raw `language`
 *   field, and CozyTTSBrowserAdapter only resolves language via a
 *   registered CozySpeech VoiceSettings record (`settingsId`). Rather
 *   than modifying either already-composed, already-registered file,
 *   this facade composes CozySpeech's EXISTING registerVoiceSettings/
 *   removeVoiceSettings extension points: for a `speak({ language })`
 *   call with no explicit `settingsId`, it registers a short-lived
 *   VoiceSettings record for the duration of that one call and
 *   removes it immediately after — real language propagation with
 *   zero edits to VoiceManager or the browser adapter.
 *
 * PLATFORM EVENT BUS
 *   Emits real, honestly-named events via the existing, shared
 *   PlatformEventBus (core/shell/platform-event-bus.js) so other
 *   Living engines (CozyEnvironment, CozyLivingSync, a future
 *   LivingOS speech experience) can react to speech state without
 *   polling VoiceManager directly. Every emit is guarded and
 *   non-fatal if PlatformEventBus isn't loaded — matches the same
 *   pattern already used by voice-capture-adapter.js, speech-
 *   recognition-adapter.js, and speech-command-adapter.js:
 *     living-tts:speak-start        { text, context, language }
 *     living-tts:speak-success      { providerId, kind, context }
 *     living-tts:speak-unavailable  { context, reason }
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const LIVING_TTS_VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.LivingTTS) return; // duplicate-load guard — no second instance, ever

    function bus() {
        return (window.CozyOS && window.CozyOS.PlatformEventBus) || null;
    }
    function emit(event, detail) {
        const b = bus();
        if (b && typeof b.emit === "function") {
            try { b.emit(event, detail); } catch (_err) { /* non-fatal, matches existing speech adapters */ }
        }
    }

    /**
     * classifyKind(providerId)
     *   Real, derived-only classification — never fabricated. Reads
     *   the SAME capabilities each provider already registered with
     *   VoiceManager (Charles: recordedPhrasePlayback; browser:
     *   dynamicSynthesis). Returns "unknown" rather than guessing if
     *   a provider (e.g. a future cloud voice) declares neither flag.
     */
    function classifyKind(providerId) {
        if (!providerId) return "unknown";
        const vm = window.CozyOS.VoiceManager;
        if (providerId === "browser") return "synthesized";
        if (!vm || typeof vm.getProvider !== "function") return "unknown";
        const provider = vm.getProvider(providerId);
        const caps = (provider && provider.capabilities) || {};
        if (caps.recordedPhrasePlayback === true) return "recorded";
        if (caps.dynamicSynthesis === true) return "synthesized";
        return "unknown";
    }

    /**
     * withTransientLanguage(language, fn)
     *   If `language` is supplied and CozySpeech's voice-settings
     *   registry is available, registers a real, short-lived
     *   VoiceSettings record for the duration of `fn`, passes its
     *   settingsId to `fn`, and always removes it afterward — success
     *   or failure. Honest no-op (settingsId: undefined) if CozySpeech
     *   isn't loaded or no language was requested; callers that
     *   already supply their own settingsId are passed through
     *   untouched (this never overrides an explicit settingsId).
     */
    async function withTransientLanguage(language, existingSettingsId, fn) {
        if (existingSettingsId || !language) return fn(existingSettingsId);
        const speech = window.CozyOS.CozySpeech;
        if (!speech || typeof speech.registerVoiceSettings !== "function") return fn(undefined);
        let settingsId = null;
        try {
            settingsId = speech.registerVoiceSettings({ language });
            return await fn(settingsId);
        } finally {
            if (settingsId && typeof speech.removeVoiceSettings === "function") {
                try { speech.removeVoiceSettings(settingsId); } catch (_err) { /* non-fatal cleanup */ }
            }
        }
    }

    const LivingTTS = {
        getVersion() { return LIVING_TTS_VERSION; },

        /**
         * speak({ text, context, language, providerId, settingsId })
         *   THE one consistent Living TTS entry point. Composes
         *   VoiceManager.speak() (which already owns the real default-
         *   voice/context/fallback logic) and adds: honest language
         *   propagation, honest recorded-vs-synthesized classification,
         *   and PlatformEventBus lifecycle events. Never fabricates a
         *   played result — if VoiceManager reports unavailable, this
         *   does too.
         *
         *   Returns: { available, played, providerId, kind, reason }
         */
        async speak(request = {}) {
            const vm = window.CozyOS.VoiceManager;
            emit("living-tts:speak-start", { text: request.text ?? null, context: request.context ?? null, language: request.language ?? null });

            if (!vm || typeof vm.speak !== "function") {
                const reason = "VoiceManager is not loaded — Living TTS has no real backend to speak through.";
                emit("living-tts:speak-unavailable", { context: request.context ?? null, reason });
                return { available: false, played: false, providerId: null, kind: "unknown", reason };
            }

            const result = await withTransientLanguage(request.language, request.settingsId, (settingsId) =>
                vm.speak({
                    text: request.text,
                    context: request.context,
                    providerId: request.providerId,
                    settingsId,
                })
            );

            if (result && result.available && result.played) {
                const kind = classifyKind(result.providerId);
                emit("living-tts:speak-success", { providerId: result.providerId, kind, context: request.context ?? null });
                return { available: true, played: true, providerId: result.providerId, kind, reason: null };
            }

            const reason = (result && result.reason) || "No provider could speak this request.";
            emit("living-tts:speak-unavailable", { context: request.context ?? null, reason });
            return { available: false, played: false, providerId: null, kind: "unknown", reason };
        },

        /**
         * getStatus()
         *   Honest, fully-derived snapshot — nothing here is ever
         *   asserted independently of the real registries it reads.
         */
        getStatus() {
            const speech = window.CozyOS.CozySpeech;
            const vm = window.CozyOS.VoiceManager;
            const browserAdapter = window.CozyOS.CozyTTSBrowserAdapter;
            return Object.freeze({
                available: !!(speech && typeof speech.hasRealPreviewBackend === "function" && speech.hasRealPreviewBackend()),
                previewBackendRegistered: !!(speech && typeof speech.hasRealPreviewBackend === "function" && speech.hasRealPreviewBackend()),
                voiceManagerLoaded: !!vm,
                defaultProviderId: vm && typeof vm.getDefaultVoice === "function" ? vm.getDefaultVoice() : null,
                lastSpokenProviderId: vm && typeof vm.getLastSpokenProviderId === "function" ? vm.getLastSpokenProviderId() : null,
                providers: vm && typeof vm.listProviders === "function"
                    ? vm.listProviders().map((p) => ({ providerId: p.providerId, status: p.status, capabilities: p.capabilities }))
                    : [],
                browserTTSAvailable: !!(browserAdapter && typeof browserAdapter.isAvailable === "function" && browserAdapter.isAvailable()),
                contexts: vm && typeof vm.listContexts === "function" ? vm.listContexts() : [],
                muted: false, // no real mute flag exists anywhere yet — honestly reported, not implemented this milestone
            });
        },

        /** listContexts() — real pass-through, no second context list. */
        listContexts() {
            const vm = window.CozyOS.VoiceManager;
            return vm && typeof vm.listContexts === "function" ? vm.listContexts() : [];
        },

        /** classifyKind(providerId) — exposed so a caller can classify a providerId it already has (e.g. from getLastSpokenProviderId()) without duplicating this logic itself. */
        classifyKind,

        // ── RL-014 Platform Inspection Contract ──────────────────────────────
        getId() { return "LivingTTS"; },
        getName() { return "CozyOS Living TTS"; },
        getDependencies() { return ["CozySpeech", "VoiceManager"]; },
        getHealth() {
            const vm = window.CozyOS.VoiceManager;
            return Object.freeze({
                state: vm ? "ready" : "not_ready",
                voiceManagerLoaded: !!vm,
            });
        },
        getCapabilities() {
            return this.getStatus();
        },
        getIntegrationManifest() {
            return Object.freeze({
                uses: ["VoiceManager.speak() (real, verified, unmodified)", "CozySpeech.registerVoiceSettings()/removeVoiceSettings() (real, existing extension point, used only for transient language records)"],
                doesNotOwn: ["provider registry", "fallback logic", "default/per-context voice assignment — all VoiceManager's, untouched"],
                honestLimitation: "No mute flag exists anywhere in the composed chain yet; getStatus().muted is always false, not a real control.",
                events: ["living-tts:speak-start", "living-tts:speak-success", "living-tts:speak-unavailable"],
            });
        },
    };

    window.CozyOS.LivingTTS = Object.freeze(LivingTTS);

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/living/living-tts.js", name: "LivingTTS", category: "Living", icon: "volume-2.svg",
                description: "One consistent speak() capability for Living experiences. Composes CozySpeech + VoiceManager — no second TTS manager, no new provider registry.",
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
