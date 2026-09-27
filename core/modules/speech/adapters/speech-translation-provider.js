/**
 * CozyOS Speech Translation — Provider Registry
 * File Reference: core/modules/speech/adapters/speech-translation-provider.js
 * Layer: Core / Speech Adapter
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 150
 *
 * RESPONSIBILITY (single source of truth for THIS registry only)
 *   Holds the list of real translation providers (browser / cloud /
 *   offline / future-AI) and aggregates their honestly-declared
 *   capabilities. Owns nothing about speech itself — CozySpeech remains
 *   the Speech/Session/Language/Adapter Coordinator; this file only
 *   answers "which providers exist and what can they really do."
 *
 * NEVER FABRICATE
 *   No provider is invented here. If no provider is registered, every
 *   capability is honestly `false` and translate() rejects with
 *   isReal: false rather than returning invented text.
 *
 * BROWSER PROVIDER — REAL, DISCLOSED DETECTION
 *   Chrome ships an experimental on-device Translator API
 *   (`self.Translator`) on some builds/flags. If present, it is real
 *   and on-device (offline-capable) — this file wraps it as a genuine
 *   "browser-native" provider. If absent (the common case today), no
 *   browser provider is auto-registered — this is not simulated.
 *
 * CLOUD PROVIDERS — EXTENSION POINT ONLY
 *   register() accepts a { type: "cloud", ... } provider, but no cloud
 *   provider is implemented or bundled in this milestone (per spec:
 *   "Design extension points only. No implementation.").
 *
 * Provider contract (all real, checked before use):
 *   {
 *     name: string,
 *     type: "browser" | "cloud" | "offline" | "ai",
 *     supportsRealtime?: boolean,
 *     supportsOffline?: boolean,
 *     supportsAutoDetect?: boolean,
 *     supportsStreaming?: boolean,
 *     translate(text, { sourceLanguage, targetLanguage }): Promise<{ translatedText: string, isReal: true }>
 *   }
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const PROVIDER_REGISTRY_VERSION = "1.0.0-ENTERPRISE";

    if (window.CozyOS.SpeechTranslationProviders?.getVersion) {
        if (window.CozyOS.SpeechTranslationProviders.getVersion() !== PROVIDER_REGISTRY_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: SpeechTranslationProviders.");
        }
        return;
    }

    const _providers = new Map();

    function _validateProvider(provider) {
        if (!provider || typeof provider !== "object") throw new TypeError("[SpeechTranslationProviders] register(): provider object required.");
        if (typeof provider.name !== "string" || !provider.name.trim()) throw new TypeError("[SpeechTranslationProviders] register(): provider.name is required.");
        if (!["browser", "cloud", "offline", "ai"].includes(provider.type)) throw new TypeError('[SpeechTranslationProviders] register(): provider.type must be "browser" | "cloud" | "offline" | "ai".');
        if (typeof provider.translate !== "function") throw new TypeError("[SpeechTranslationProviders] register(): provider.translate() is required.");
    }

    /**
     * detectRealBrowserProvider()
     * Real, bounded check for Chrome's experimental on-device Translator
     * API. Returns a real provider object only if the API genuinely
     * exists on this browser; returns null otherwise. Never simulates
     * translation if the check fails.
     */
    async function detectRealBrowserProvider() {
        try {
            if (typeof self !== "undefined" && typeof self.Translator !== "undefined" && typeof self.Translator.create === "function") {
                return {
                    name: "browser-native",
                    type: "browser",
                    supportsRealtime: false,
                    supportsOffline: true, // Chrome's on-device translator genuinely runs locally.
                    supportsAutoDetect: false,
                    supportsStreaming: false,
                    async translate(text, { sourceLanguage, targetLanguage } = {}) {
                        if (typeof text !== "string" || !text.trim()) throw new TypeError("[browser-native provider] translate(): text is required.");
                        if (!sourceLanguage || !targetLanguage) throw new TypeError("[browser-native provider] translate(): sourceLanguage and targetLanguage are required.");
                        const translator = await self.Translator.create({ sourceLanguage, targetLanguage });
                        const translatedText = await translator.translate(text);
                        return { translatedText, isReal: true };
                    }
                };
            }
        } catch (_e) {
            // Fails closed: any detection error means "not available", never a fabricated provider.
        }
        return null;
    }

    const SpeechTranslationProviders = {
        getVersion() { return PROVIDER_REGISTRY_VERSION; },

        register(provider) {
            _validateProvider(provider);
            _providers.set(provider.name, Object.freeze({ ...provider }));
            return provider.name;
        },

        unregister(name) { return _providers.delete(name); },

        list() { return Object.freeze(Array.from(_providers.values())); },

        get(name) { return _providers.get(name) || null; },

        hasAny() { return _providers.size > 0; },

        /**
         * getCapabilities()
         * Honest aggregation across every real registered provider.
         * Any flag with zero supporting providers is false — never
         * inferred, never defaulted to true.
         */
        getCapabilities() {
            const providers = Array.from(_providers.values());
            return Object.freeze({
                supportsTranslation: providers.length > 0,
                supportsRealtimeTranslation: providers.some(p => p.supportsRealtime === true),
                supportsOfflineTranslation: providers.some(p => p.supportsOffline === true),
                supportsAutoDetectLanguage: providers.some(p => p.supportsAutoDetect === true),
                supportsStreamingTranslation: providers.some(p => p.supportsStreaming === true),
            });
        },

        /**
         * translate(text, opts, preferredProviderName?)
         * Delegates to a real registered provider. Fails closed
         * (isReal: false, no text) if none exists — never invents a
         * translation.
         */
        async translate(text, { sourceLanguage, targetLanguage } = {}, preferredProviderName = null) {
            const provider = preferredProviderName ? this.get(preferredProviderName) : Array.from(_providers.values())[0];
            if (!provider) return { isReal: false, translatedText: null, reason: "No translation provider registered. Failing closed." };
            try {
                const result = await provider.translate(text, { sourceLanguage, targetLanguage });
                return { isReal: true, translatedText: result.translatedText, providerName: provider.name };
            } catch (err) {
                return { isReal: false, translatedText: null, reason: err.message };
            }
        },

        /** Runs real detection and self-registers a browser-native provider if genuinely available. Safe to call more than once (idempotent). */
        async autoDetectBrowserProvider() {
            if (_providers.has("browser-native")) return true;
            const detected = await detectRealBrowserProvider();
            if (detected) { this.register(detected); return true; }
            return false;
        },

        /**
         * getAvailabilitySnapshot() — SA-8 PHASE 4 (Provider-Agnostic
         * Capability Audit & Availability Contract) addition. Real,
         * additive — extends this EXISTING registry (list()/get(),
         * both untouched) rather than building a second translation
         * registry. For every registered provider, returns its real,
         * declared capability flags plus an honestly-computed
         * `availability`:
         *   AVAILABLE_OFFLINE / AVAILABLE_ONLINE - the provider's own
         *     isAvailable() (already real for nllb-bridge — a live
         *     /health re-check, per that file's own header) resolved
         *     true; offline/online decided by its supportsOffline flag.
         *   REGISTERED_BUT_INACTIVE - isAvailable() resolved false (a
         *     real, disclosed example today: the local NLLB bridge
         *     process is not running).
         *   UNKNOWN - the provider implements no isAvailable() at all
         *     (e.g. browser-native, which is only ever registered when
         *     genuinely detected — see autoDetectBrowserProvider() — so
         *     its registration alone is real signal, but this registry
         *     never assumes a registered provider stays available
         *     without asking it). Never silently promoted to available.
         * Times out any single slow isAvailable() rather than blocking
         * the whole snapshot; never makes a network call of its own —
         * only awaits whatever each provider's own check already does.
         */
        async getAvailabilitySnapshot({ timeoutMs = 2000 } = {}) {
            const providers = Array.from(_providers.values());
            const entries = await Promise.all(providers.map(async (provider) => {
                let availability = "UNKNOWN";
                if (typeof provider.isAvailable === "function") {
                    try {
                        const resolved = await Promise.race([
                            provider.isAvailable(),
                            new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
                        ]);
                        if (resolved === true) availability = provider.supportsOffline === true ? "AVAILABLE_OFFLINE" : "AVAILABLE_ONLINE";
                        else if (resolved === false) availability = "REGISTERED_BUT_INACTIVE";
                        else availability = "UNKNOWN";
                    } catch (_err) {
                        availability = "REGISTERED_BUT_INACTIVE";
                    }
                }
                return Object.freeze({
                    name: provider.name, type: provider.type, availability,
                    supportsRealtime: provider.supportsRealtime === true,
                    supportsOffline: provider.supportsOffline === true,
                    supportsAutoDetect: provider.supportsAutoDetect === true,
                    supportsStreaming: provider.supportsStreaming === true,
                });
            }));
            return Object.freeze(entries);
        }
    };

    window.CozyOS.SpeechTranslationProviders = Object.freeze(SpeechTranslationProviders);
})();
