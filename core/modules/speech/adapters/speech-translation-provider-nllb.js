/**
 * CozyOS Speech Translation — NLLB Bridge Provider
 * File Reference: core/modules/speech/adapters/speech-translation-provider-nllb.js
 * Layer: Core / Speech Adapter
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Registers exactly ONE real translation provider (name: "nllb-bridge")
 *   into the existing window.CozyOS.SpeechTranslationProviders registry
 *   (core/modules/speech/adapters/speech-translation-provider.js). This
 *   file implements no translation itself — it is a thin HTTP client for
 *   the local, persistent NLLB bridge
 *   (language-packs/shared/NLLB-200-600M-INT8/nllb_http_bridge.py),
 *   which loads the real NLLB-200-600M-INT8 model once and serves
 *   /translate over HTTP.
 *
 * AVAILABILITY IS TRUTHFUL
 *   "Registered" and "available" are two separate, honestly-computed
 *   facts. Registering this provider only means the JS object exists in
 *   the registry — it does NOT mean the bridge is running or the model
 *   is loaded. isAvailable()/translate() always re-check the bridge's
 *   real /health response (with a short cache) before claiming
 *   isReal: true. If the bridge cannot be reached, or /health reports
 *   modelLoaded: false, this provider fails closed:
 *     - isAvailable() resolves false
 *     - translate() rejects, which the registry's translate() wrapper
 *       turns into { isReal: false, reason: <honest message> }
 *   No fallback text, no fabricated translation, no reporting
 *   isReal: true when the bridge is unavailable.
 *
 * SCOPE
 *   Speech / live translation only. Never used for Scripture.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const PROVIDER_VERSION = "1.0.0-ENTERPRISE";

    if (window.CozyOS.SpeechTranslationNLLBProvider?.getVersion) {
        if (window.CozyOS.SpeechTranslationNLLBProvider.getVersion() !== PROVIDER_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: SpeechTranslationNLLBProvider.");
        }
        return;
    }

    // Same CozyOS <-> NLLB language contract owned by nllb_http_bridge.py.
    // Duplicated here only as a client-side validation allowlist (fail
    // fast before making a network call) — the bridge remains the single
    // source of truth for the actual mapping/translation.
    const SUPPORTED_LANGUAGES = Object.freeze([
        "sw", "en", "fr", "ar", "so", "ru", "zh", "ha", "yo",
        "luo", "ki", "kam", "zu", "am", "ln", "ig", "hi",
    ]);

    const DEFAULT_BASE_URL = "http://127.0.0.1:8177";
    const HEALTH_CACHE_MS = 3000;

    function _resolveBaseUrl() {
        try {
            if (window.CozyOS.config?.nllbBridgeUrl) return window.CozyOS.config.nllbBridgeUrl;
        } catch (_e) { /* ignore, fall through to default */ }
        return DEFAULT_BASE_URL;
    }

    function _makeProvider(baseUrl) {
        let _lastHealth = { at: 0, ok: false };

        async function checkHealth() {
            const now = Date.now();
            if (now - _lastHealth.at < HEALTH_CACHE_MS) return _lastHealth.ok;
            try {
                const res = await fetch(`${baseUrl}/health`, { method: "GET" });
                if (!res.ok) { _lastHealth = { at: now, ok: false }; return false; }
                const body = await res.json();
                const ok = body && body.ok === true && body.modelLoaded === true;
                _lastHealth = { at: now, ok };
                return ok;
            } catch (_e) {
                // Bridge not reachable (not started, wrong port, network error).
                _lastHealth = { at: now, ok: false };
                return false;
            }
        }

        return {
            name: "nllb-bridge",
            type: "offline",
            supportsRealtime: true,
            supportsOffline: true,
            supportsAutoDetect: false,
            supportsStreaming: false,

            /** Truthful availability: only true when the bridge genuinely reports a loaded model. */
            async isAvailable() {
                return checkHealth();
            },

            async translate(text, { sourceLanguage, targetLanguage } = {}) {
                if (typeof text !== "string" || !text.trim()) {
                    throw new TypeError("[nllb-bridge provider] translate(): text is required.");
                }
                if (!SUPPORTED_LANGUAGES.includes(sourceLanguage)) {
                    throw new TypeError(`[nllb-bridge provider] translate(): unsupported sourceLanguage "${sourceLanguage}".`);
                }
                if (!SUPPORTED_LANGUAGES.includes(targetLanguage)) {
                    throw new TypeError(`[nllb-bridge provider] translate(): unsupported targetLanguage "${targetLanguage}".`);
                }

                const healthy = await checkHealth();
                if (!healthy) {
                    // Fail closed — never fall back to another provider's
                    // behavior or return the original text as "translated".
                    throw new Error("[nllb-bridge provider] NLLB bridge unavailable (not running or model not loaded).");
                }

                let res;
                try {
                    res = await fetch(`${baseUrl}/translate`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text, sourceLanguage, targetLanguage }),
                    });
                } catch (networkErr) {
                    throw new Error(`[nllb-bridge provider] Bridge request failed: ${networkErr.message}`);
                }

                let body;
                try {
                    body = await res.json();
                } catch (_parseErr) {
                    throw new Error("[nllb-bridge provider] Bridge returned a non-JSON response.");
                }

                if (!res.ok || body.success !== true || body.isReal !== true) {
                    throw new Error(body?.reason || `[nllb-bridge provider] Bridge translation failed (HTTP ${res.status}).`);
                }

                return {
                    translatedText: body.translatedText,
                    isReal: true,
                    provider: "nllb",
                    latencyMs: body.latencyMs,
                };
            },
        };
    }

    const SpeechTranslationNLLBProvider = {
        getVersion() { return PROVIDER_VERSION; },

        /**
         * register(baseUrl?)
         * Registers the nllb-bridge provider with
         * window.CozyOS.SpeechTranslationProviders. Idempotent — safe to
         * call more than once (re-registering just overwrites the entry
         * with the same name, per the registry's own Map semantics).
         * Registering does NOT mean the bridge is available — see
         * AVAILABILITY IS TRUTHFUL above.
         */
        register(baseUrl) {
            const providers = window.CozyOS.SpeechTranslationProviders;
            if (!providers || typeof providers.register !== "function") {
                throw new Error("[SpeechTranslationNLLBProvider] SpeechTranslationProviders is not loaded.");
            }
            const provider = _makeProvider(baseUrl || _resolveBaseUrl());
            return providers.register(provider);
        },
    };

    window.CozyOS.SpeechTranslationNLLBProvider = Object.freeze(SpeechTranslationNLLBProvider);
})();
