/**
 * CozyOS — On-Device Conversational Provider
 * File Reference: core/modules/intelligence/providers/on-device-conversational-provider.js
 * Repair: RP-025-A — On-Device Conversational Provider + Explicit Provider Activation
 *
 * OWNERSHIP
 *   Registers a real "on-device" provider into the ALREADY-EXISTING
 *   registerProvider() extension point exposed by window.CozyOS.LivingAI
 *   (core/living/cozy-living-ai.js — NOT modified by this file; that
 *   file's own doc comment already names "on-device" as a reserved slot
 *   for exactly this). Also registers a real, optional descriptor with
 *   window.CozyOS.ProviderManager (core/shell/provider-manager.js — NOT
 *   modified) when it is present, so this provider's real state is
 *   listed/health-checked the same way every other provider is.
 *   resolveConversationalReply(), CognitiveCoordinator,
 *   cozy-intelligence-provider.js, and core/config.js are not touched —
 *   this file only calls public APIs those already expose.
 *
 * HONEST SCOPE
 *   Composes the browser's own on-device language-model API (the
 *   Prompt API — the current unprefixed `LanguageModel` global, or the
 *   earlier origin-trial `window.ai.languageModel` shape) ONLY when the
 *   browser actually exposes it. Never bundles, downloads, or fabricates
 *   a model of its own. No API credentials are used or required.
 *   Live-checked state, every call:
 *
 *     no on-device model API in this browser        -> NOT_READY
 *     API present, availability check fails/blocked  -> NOT_READY
 *     API present, model downloadable/not installed   -> MODEL_NOT_INSTALLED
 *     API present, model available + session created  -> READY / ONLINE
 *
 * ACTIVATION
 *   registerProvider() only fills the registry slot. It does NOT make
 *   this provider active — window.CozyOS.LivingAI.setActiveProvider()
 *   remains the one explicit choke point (confirmed by reading
 *   AIProviderRegistry.register() before writing this file: it only
 *   auto-activates the FIRST provider ever registered, which is already
 *   "reasoning-pipeline"). This file never calls setActiveProvider().
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["on-device-conversational-provider"]) return;

    const PROVIDER_NAME = "on-device";

    /**
     * detectLanguageModelAPI()
     *   Real, live feature detection only — never assumes an API exists
     *   because a browser version usually has it. Checks both real
     *   shapes shipped across Chrome versions. Returns null (the honest
     *   "no on-device model API here") if neither is present.
     */
    function detectLanguageModelAPI() {
        if (typeof self !== "undefined" && "LanguageModel" in self && self.LanguageModel) {
            return self.LanguageModel;
        }
        if (typeof window !== "undefined" && window.ai && window.ai.languageModel) {
            return window.ai.languageModel;
        }
        return null;
    }

    /**
     * checkAvailability(api)
     *   Real — calls the API's own availability()/capabilities() method
     *   and returns its honest, unmodified result. Never infers or
     *   upgrades what the browser itself reports.
     */
    async function checkAvailability(api) {
        try {
            if (typeof api.availability === "function") return await api.availability();
            if (typeof api.capabilities === "function") {
                const cap = await api.capabilities();
                return cap && cap.available;
            }
        } catch (err) {
            return { error: (err && err.message) || "availability check failed" };
        }
        return "unknown";
    }

    let cachedSession = null;

    /**
     * getStatus()
     *   Real, live status classification. Shared by both think() and
     *   the ProviderManager health snapshot below so both surfaces
     *   report the exact same honest fact, never two different claims
     *   about the same underlying state.
     */
    async function getStatus() {
        const api = detectLanguageModelAPI();
        if (!api) {
            return { state: "NOT_READY", reason: "No on-device language-model API is exposed by this browser." };
        }
        const availability = await checkAvailability(api);
        if (availability === "available" || availability === "readily") {
            return { state: "READY", reason: "On-device model is installed and available.", availability };
        }
        if (availability === "downloadable" || availability === "after-download" || availability === "downloading") {
            return { state: "MODEL_NOT_INSTALLED", reason: "On-device model API is present but the model itself is not yet downloaded/installed.", availability };
        }
        if (availability && availability.error) {
            return { state: "NOT_READY", reason: `Availability check failed: ${availability.error}` };
        }
        return { state: "NOT_READY", reason: `On-device model is not available in this browser/session (reported: ${JSON.stringify(availability)}).`, availability };
    }

    /**
     * The real provider object — satisfies LivingAI's required
     * think(text, options) -> {success, result|reason} contract. On
     * success, result carries a real .text field so
     * resolveConversationalReply() (core/living/cozy-living-assistant.js,
     * unmodified) recognizes it as a genuine conversational answer.
     */
    const onDeviceProvider = {
        async think(text, _options = {}) {
            const status = await getStatus();
            if (status.state !== "READY") {
                return { success: false, reason: status.reason, state: status.state };
            }
            try {
                const api = detectLanguageModelAPI();
                if (!cachedSession) {
                    cachedSession = await api.create({
                        initialPrompts: [{ role: "system", content: "You are the CozyOS on-device assistant. Answer briefly and honestly." }]
                    });
                }
                const answer = await cachedSession.prompt(text);
                if (typeof answer !== "string" || !answer.trim()) {
                    return { success: false, reason: "On-device model returned an empty response.", state: "READY" };
                }
                return { success: true, result: { text: answer } };
            } catch (err) {
                cachedSession = null;
                return { success: false, reason: (err && err.message) || "On-device model call failed.", state: "NOT_READY" };
            }
        },
        describe() {
            return {
                kind: "on-device model",
                isLLM: true,
                offline: true,
                note: "Real browser on-device language-model API (Prompt API) when available; honestly reports NOT_READY/MODEL_NOT_INSTALLED otherwise. No API credentials, no network calls, no fabricated ONLINE state."
            };
        }
    };

    // Real, additive export (Phase 10C-3A) — exposes the exact same real
    // provider object registered above so a real, separate adapter
    // (on-device-cognitive-adapter.js) can compose the identical
    // detection/session/think() logic elsewhere without re-implementing
    // or forking it. Not a new provider, not a second implementation —
    // the same object, same closure state (cachedSession included).
    window.CozyOS.OnDeviceConversationalProvider = onDeviceProvider;

    function registerWithLivingAI() {
        const ai = window.CozyOS.LivingAI;
        if (!ai || typeof ai.registerProvider !== "function") return false;
        ai.registerProvider(PROVIDER_NAME, onDeviceProvider);
        return true;
    }

    // Real, optional visibility/health integration. Not required for
    // this provider to function — LivingAI.think() never consults
    // ProviderManager — only for admin-facing listing/health per the
    // repair spec ("ProviderManager is used for provider
    // visibility/health"). Skips silently if ProviderManager isn't
    // loaded on this page (e.g. index.html today).
    let lastKnownHealth = { health: "UNKNOWN", reason: "Not yet checked." };
    async function refreshHealth() {
        const status = await getStatus();
        const healthLabel = status.state === "READY" ? "ONLINE" : status.state;
        lastKnownHealth = { health: healthLabel, reason: status.reason };
    }

    function registerWithProviderManager() {
        const pm = window.CozyOS.ProviderManager;
        if (!pm || typeof pm.register !== "function") return false;
        pm.register({
            id: "on-device-conversational",
            name: "On-Device Conversational AI",
            category: "intelligence",
            version: VERSION,
            dependencies: [],
            // Real, synchronous snapshot of the last live getStatus()
            // check — ProviderManager.health() calls getHealth()
            // synchronously, so this never blocks on the async
            // detection round-trip; before the first refreshHealth()
            // resolves it honestly reports UNKNOWN, never a guess.
            getHealth() { return lastKnownHealth; }
        });
        return true;
    }

    registerWithLivingAI();
    registerWithProviderManager();
    refreshHealth();

    window.CozyOS.Modules["on-device-conversational-provider"] = Object.freeze({
        version: VERSION,
        description: "RP-025-A — real on-device conversational provider composing the browser's own Prompt API (LanguageModel) when present; honestly reports NOT_READY/MODEL_NOT_INSTALLED otherwise (no bundled model, no credentials, no network calls). Registers into LivingAI's existing 'on-device' provider slot and (optionally) ProviderManager for visibility/health. Never auto-activates — LivingAI.setActiveProvider('on-device') remains the sole activation choke point; this file never calls it. (Phase 10C-3A: also exports the same provider object as window.CozyOS.OnDeviceConversationalProvider so a real, separate cognitive adapter can compose it.)"
    });
})();
