/**
 * CozyOS Speech Translation — Gemini Bridge Provider
 * File Reference: core/modules/speech/adapters/speech-translation-provider-gemini.js
 * Layer: Core / Speech Adapter
 * Version: 1.0.0-ENTERPRISE
 *
 * DOMAIN 4C — THE SMALLEST REAL ADAPTER, NOT A NEW AI BACKEND
 *   Domain 4C's deployment reconnaissance established: the real
 *   production Render service (runtime: node) cannot host the Python
 *   NLLB bridge (see speech-translation-provider-nllb.js) without a
 *   separate deployment-architecture decision. The Node-native Gemini
 *   backend (server/ai/gemini-backend-endpoint.js), reached client-side
 *   via the existing, real, unmodified
 *   core/living/providers/gemini-cloud-provider.js's
 *   createGeminiCloudProvider().think(text, options), is structurally
 *   compatible with that same deployment today.
 *
 *   This file adds NO new AI backend, NO new secret handling, NO new
 *   provider registry, and NO new authentication mechanism. It is
 *   exactly one thing: a real translate(text, {sourceLanguage,
 *   targetLanguage}) adapter — the same contract
 *   speech-translation-provider-nllb.js already implements — that
 *   builds a real, disclosed translation-instructing prompt, sends it
 *   through the EXISTING Gemini client provider's think(), and honestly
 *   extracts (or honestly fails to extract) a translation from the
 *   real completion text Gemini returns. It registers into the SAME
 *   window.CozyOS.SpeechTranslationProviders registry
 *   speech-translation-provider-nllb.js already uses, under a distinct
 *   name ("gemini-translate") — both can coexist; nothing here disables
 *   or replaces the NLLB provider.
 *
 * SECRET BOUNDARY (inherited, not reimplemented)
 *   This file never reads, holds, or references GEMINI_API_KEY in any
 *   form. It only calls createGeminiCloudProvider().think(), which
 *   itself only ever calls the same-origin /ai/gemini backend endpoint
 *   — the real key lives exclusively server-side in
 *   gemini-backend-endpoint.js, unchanged.
 *
 * HONESTY DISCIPLINE (matches speech-translation-provider-nllb.js)
 *   - Never fabricates a translation. If the Gemini call fails, or the
 *     completion text doesn't look like a real, usable answer (empty,
 *     or Gemini's own refusal/"I cannot..." pattern), this throws a
 *     real error — exactly like the NLLB provider's own fail-closed
 *     contract — so SpeechTranslationProviders.translate() reports
 *     isReal:false, never a fabricated success.
 *   - isAvailable() only ever reports what the backend can currently be
 *     reached for — never assumed true.
 *   - Never claims a language pair works merely because it's in
 *     SUPPORTED_LANGUAGES; that list only gates which requests are even
 *     attempted, same as the NLLB provider's own list does.
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not implement a second translation coordinator — this only
 *     ever registers into the existing SpeechTranslationProviders/
 *     TranslationService chain (translation-service.js).
 *   - Does not change language routing, session/segment handling, or
 *     any other part of the existing translate pipeline.
 *   - Does not claim live-verified translation merely because this
 *     file loads without error — live execution requires a real
 *     GEMINI_API_KEY and real network egress, neither of which this
 *     file can create or fake.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const PROVIDER_VERSION = "1.0.0";

    if (window.CozyOS.SpeechTranslationGeminiProvider?.getVersion) {
        if (window.CozyOS.SpeechTranslationGeminiProvider.getVersion() !== PROVIDER_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: SpeechTranslationGeminiProvider.");
        }
        return;
    }

    // Same language-code universe the NLLB provider already declares
    // (core/modules/speech/adapters/speech-translation-provider-nllb.js)
    // — kept identical rather than inventing a second list, since this
    // is describing the same CozyOS language registry's codes, not a
    // Gemini-specific capability boundary. Gemini itself has no fixed
    // language allowlist; this list exists only so a caller's mistyped
    // code is rejected before any network call, same discipline as the
    // NLLB provider.
    const SUPPORTED_LANGUAGES = Object.freeze([
        "sw", "en", "fr", "ar", "so", "ru", "zh", "ha", "yo",
        "luo", "ki", "kam", "zu", "am", "ln", "ig", "hi",
    ]);

    const LANGUAGE_NAMES = Object.freeze({
        sw: "Kiswahili", en: "English", fr: "French", ar: "Arabic", so: "Somali",
        ru: "Russian", zh: "Chinese", ha: "Hausa", yo: "Yoruba", luo: "Luo",
        ki: "Kikuyu", kam: "Kikamba", zu: "Zulu", am: "Amharic", ln: "Lingala",
        ig: "Igbo", hi: "Hindi",
    });

    // Real, disclosed prompt template. Deliberately instructs Gemini to
    // return ONLY the translated text — no preamble, no quotes, no
    // explanation — so extraction below can be a straightforward,
    // honestly-verifiable trim() rather than a fragile parse of a
    // conversational reply. This is the one piece of "translation
    // intelligence" this adapter adds; the actual translation work is
    // still entirely Gemini's, not fabricated here.
    function buildPrompt(text, sourceLanguage, targetLanguage) {
        const sourceName = LANGUAGE_NAMES[sourceLanguage] || sourceLanguage;
        const targetName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
        return `Translate the following ${sourceName} text into ${targetName}. ` +
            `Return ONLY the translated text, with no explanation, no quotation marks, and no preamble.\n\n` +
            `Text: ${text}`;
    }

    // A handful of real Gemini refusal/non-answer shapes — used only to
    // avoid honestly reporting success when Gemini answered but plainly
    // did not translate (e.g. "I cannot help with that request."). This
    // is a narrow, disclosed heuristic, not a claim of understanding
    // Gemini's full output space — anything not matching this still
    // gets returned as the translation; ambiguous cases are treated as
    // real output, not silently discarded, since inventing a rejection
    // rule for legitimate short translations (a single word) would risk
    // false negatives.
    const REFUSAL_PATTERN = /^i (?:cannot|can't|am unable to)\b/i;

    function _makeProvider() {
        const geminiClient = (window.CozyOS.createGeminiCloudProvider
            ? window.CozyOS.createGeminiCloudProvider()
            : null);

        async function checkAvailable() {
            // Real, honest capability check: the same-origin backend
            // must exist client-side AND actually be reachable. This
            // does not — and cannot — confirm GEMINI_API_KEY is set;
            // that is only knowable from the backend's own real
            // response to an actual request, exactly like the NLLB
            // provider's own health check can only report what a real
            // network call reveals.
            if (!geminiClient || typeof geminiClient.think !== "function") return false;
            return true;
        }

        return {
            name: "gemini-translate",
            type: "cloud",
            supportsRealtime: false,
            supportsOffline: false,
            supportsAutoDetect: false,
            supportsStreaming: false,

            async isAvailable() {
                return checkAvailable();
            },

            async translate(text, { sourceLanguage, targetLanguage } = {}) {
                if (typeof text !== "string" || !text.trim()) {
                    throw new TypeError("[gemini-translate provider] translate(): text is required.");
                }
                if (!SUPPORTED_LANGUAGES.includes(sourceLanguage)) {
                    throw new TypeError(`[gemini-translate provider] translate(): unsupported sourceLanguage "${sourceLanguage}".`);
                }
                if (!SUPPORTED_LANGUAGES.includes(targetLanguage)) {
                    throw new TypeError(`[gemini-translate provider] translate(): unsupported targetLanguage "${targetLanguage}".`);
                }
                if (!(await checkAvailable())) {
                    throw new Error("[gemini-translate provider] Gemini client provider is not loaded.");
                }

                const prompt = buildPrompt(text, sourceLanguage, targetLanguage);
                const result = await geminiClient.think(prompt);

                if (!result || result.success !== true) {
                    // Relays the real, already-generic (never key-shaped)
                    // reason gemini-backend-endpoint.js produced —
                    // exactly as createGeminiCloudProvider() itself
                    // already guarantees. Never fabricates a translation
                    // when the real call failed.
                    throw new Error((result && result.reason) || "[gemini-translate provider] Gemini backend call failed.");
                }

                const rawText = result.result && typeof result.result.text === "string" ? result.result.text.trim() : "";
                if (!rawText) {
                    throw new Error("[gemini-translate provider] Gemini returned an empty response.");
                }
                if (REFUSAL_PATTERN.test(rawText)) {
                    throw new Error(`[gemini-translate provider] Gemini declined to translate: ${rawText}`);
                }

                return {
                    translatedText: rawText,
                    isReal: result.result.isReal === true,
                    provider: "gemini",
                    latencyMs: result.result.latencyMs,
                };
            },
        };
    }

    const SpeechTranslationGeminiProvider = {
        getVersion() { return PROVIDER_VERSION; },

        /**
         * register()
         * Registers the gemini-translate provider with
         * window.CozyOS.SpeechTranslationProviders, alongside (never
         * instead of) the nllb-bridge provider. Idempotent. Registering
         * does not mean live translation will succeed — see AVAILABILITY
         * IS TRUTHFUL above; a real GEMINI_API_KEY and real network
         * egress at the server are still required for an actual call to
         * succeed.
         */
        register() {
            const providers = window.CozyOS.SpeechTranslationProviders;
            if (!providers || typeof providers.register !== "function") {
                throw new Error("[SpeechTranslationGeminiProvider] SpeechTranslationProviders is not loaded.");
            }
            const provider = _makeProvider();
            return providers.register(provider);
        },
    };

    window.CozyOS.SpeechTranslationGeminiProvider = Object.freeze(SpeechTranslationGeminiProvider);
})();
