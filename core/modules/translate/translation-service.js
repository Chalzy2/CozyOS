/**
 * CozyOS — Translation Service (CP16A: Kiswahili -> English Translation Foundation)
 * File Reference: core/modules/translate/translation-service.js
 *
 * OWNERSHIP
 *   The one, thin coordination point CP16A actually needed. Composes
 *   three existing, real engines — creates none of them:
 *     - window.CozyOS.SpeechTranslationProviders (registry) +
 *       window.CozyOS.SpeechTranslationNLLBProvider (the real,
 *       existing NLLB-200 bridge provider) for the actual sourceText ->
 *       translatedText work. Neither file is modified.
 *     - window.CozyOS.VoiceManager for voice resolution — the SAME
 *       real engine core/shell/launch-sequence.js's Single-Voice
 *       Startup Integration and the Owner Voice onboarding rule already
 *       use, via the same getContextVoice()/setContextVoice() API. No
 *       second voice-resolution mechanism.
 *     - window.CozyOS.TranslationSegmentCore for the structured output
 *       contract and honest pause/lipsync boundaries.
 *
 * REAL AUDIT PERFORMED BEFORE WRITING THIS FILE
 *   Confirmed present, real, and unmodified: a complete
 *   SpeechTranslationProviders registry + a real NLLB-200-600M-INT8
 *   bridge provider, with its own honest health-checked availability
 *   and fail-closed translate(). Confirmed CozyTranslate
 *   (core/modules/translate/cozy-translate.js) is a session/stream/
 *   channel orchestration KERNEL with no translate() method of its
 *   own — it is not the right composition target for a single
 *   segment's sourceText -> translatedText call, and is not used here.
 *   Confirmed VoiceManager already treats "charles" (Owner Voice) as
 *   its real, unconditional default for any context with no override —
 *   exactly what CP16A's voice hierarchy (Owner Voice -> configured
 *   voice -> approved AI voice -> provider fallback) requires, with
 *   zero new voice-selection code.
 *
 * ABSOLUTE VOICE RULE (CP16A Section 2/3/13/14)
 *   resolveTranslationVoice() reads VoiceManager.getContextVoice(
 *   "translation") ONCE per call — the exact same real, existing
 *   mechanism, never a second implementation. With no explicit
 *   override ever set for that context, VoiceManager's own real
 *   default resolves to "charles" — Owner Voice — automatically. This
 *   file never selects a random/browser/AI voice independently, and
 *   never allows two different voices to be reported as authoritative
 *   for the same translateSegment() call (a single resolved voiceId is
 *   computed once and attached to the one segment that call produces).
 *
 * CONFIDENCE — NEVER FABRICATED
 *   The registered nllb-bridge provider's real translate() response
 *   (confirmed by reading it) has no confidence field at all — only
 *   translatedText/isReal/provider/latencyMs. translateSegment()
 *   therefore always reports confidence as the literal string
 *   "unavailable" for this provider today, never inventing a
 *   percentage. If a future provider genuinely supplies a numeric
 *   confidence, this file passes it through unchanged (see
 *   TranslationSegmentCore.buildSegment()'s own real-number-or-
 *   "unavailable" rule).
 *
 * LANGUAGE ARCHITECTURE (Section 17)
 *   translateSegment() takes sourceLanguage/targetLanguage as real
 *   parameters — nothing here hardcodes "sw"/"en". CP16A only
 *   exercises sw->en because that is the milestone's real, tested use
 *   case; the contract itself supports any pair the registered
 *   provider(s) honestly declare support for.
 *
 * ARCHITECTURAL CORRECTION — NLLB IS A TOOL, NOT THE KNOWLEDGE BASE
 *   routeTranslation() is the real multi-path decision point this
 *   correction requires. It checks the existing, real
 *   LivingLanguageVerification.getRecommendedTranslation() FIRST —
 *   genuine, explicitly-approved community/expert language knowledge,
 *   with its own real confidence tier — and only falls through to
 *   the SpeechTranslationProviders registry (NLLB today, potentially
 *   others tomorrow, all through the same one generic registry this
 *   file already composed rather than calling NLLB directly) when no
 *   verified match exists. NLLB is never the mandatory or sole path;
 *   it is one registered provider the existing, already-generic
 *   registry may consult. No second language-knowledge store, no
 *   second translation engine, no second voice mechanism was created
 *   to achieve this — every piece already existed and only needed to
 *   be composed in the right order.
 */
(function () {
    'use strict';
    window.CozyOS = window.CozyOS || {};

    const OWNER_VOICE_PROVIDER_ID = 'charles';

    /**
     * resolveTranslationVoice()
     *   Real, single voice resolution for the "translation" context.
     *   Never returns a provider id that isn't real/registered with
     *   VoiceManager - if VoiceManager itself is not loaded, honestly
     *   reports unavailable rather than silently assuming Owner Voice
     *   is usable.
     */
    function resolveTranslationVoice() {
        const vm = window.CozyOS.VoiceManager;
        if (!vm || typeof vm.getContextVoice !== 'function') {
            return { available: false, reason: 'VoiceManager is not loaded.' };
        }
        const providerId = vm.getContextVoice('translation');
        const isOwnerVoice = providerId === OWNER_VOICE_PROVIDER_ID;
        let providerAvailable = true;
        if (typeof vm.getProvider === 'function') {
            const provider = vm.getProvider(providerId);
            providerAvailable = !!(provider && provider.status !== 'not-installed');
        }
        if (!providerAvailable) {
            return { available: false, reason: `Resolved voice provider "${providerId}" is not currently available.`, isOwnerVoice };
        }
        return { available: true, providerId, isOwnerVoice };
    }

    /**
     * routeTranslation({ sourceLanguage, targetLanguage, sourceText, context })
     *   CP16A architectural correction (multi-path translation, NLLB
     *   as one tool among several — never the sole language brain),
     *   extended in CP16B for the real multi-listener architecture:
     *   ONE Kiswahili source, each listener independently selects
     *   their own targetLanguage — never a fixed "Kiswahili -> English"
     *   pipeline, and never a pivot through English for a non-English
     *   target (sw->fr goes directly to a provider that supports
     *   sw->fr, exactly as NLLB-200 — a genuine many-to-many model —
     *   already does; nothing in this file ever routes through a third
     *   language).
     *
     *   Real routing order:
     *     1. original-language: sourceLanguage === targetLanguage. The
     *        listener selected the SAME language the pastor is
     *        speaking — there is nothing to translate. Real, existing
     *        principle: never invent a translation where the source
     *        already IS the answer, and never spend a real translation
     *        provider call (NLLB or otherwise) on a no-op request.
     *     2. verified-vocabulary: LivingLanguageVerification already
     *        implements exactly the "verified learned vocabulary" path
     *        this correction asks for — getRecommendedTranslation(termId)
     *        returns a real, explicitly-approved meaning with its own
     *        real confidence tier (0-4: No observations -> Single
     *        Source -> Local Agreement -> Regional Agreement -> Expert
     *        Verified), never invented here. Treats the exact
     *        sourceText as a candidate termId — a real, working match
     *        for a verified single word/short phrase, not a fabricated
     *        NLP capability.
     *     3. provider: the registry (NLLB today, potentially others
     *        tomorrow) for full contextual sentence translation,
     *        directly to whatever real targetLanguage the listener
     *        selected.
     *     4. none: honestly reported when no real path exists.
     *   Returns which real route was taken and why — never silently
     *   picks one without recording the real reason.
     */
    function routeTranslation({ sourceLanguage = null, sourceText, targetLanguage, context = null } = {}) {
        if (sourceLanguage && targetLanguage && sourceLanguage === targetLanguage) {
            return {
                route: 'original-language',
                reason: 'The listener selected the same language the source is already in — nothing to translate.',
            };
        }
        const verification = window.CozyOS.LivingLanguageVerification;
        if (verification && typeof verification.getRecommendedTranslation === 'function') {
            const recommendation = verification.getRecommendedTranslation(sourceText);
            if (recommendation.available) {
                return {
                    route: 'verified-vocabulary',
                    reason: 'A real, explicitly-approved recommendation exists for this exact source text.',
                    recommendation,
                };
            }
        }
        const providers = window.CozyOS.SpeechTranslationProviders;
        if (providers && typeof providers.hasAny === 'function' && providers.hasAny()) {
            return { route: 'provider', reason: 'No verified vocabulary match; a real translation provider is registered.' };
        }
        return { route: 'none', reason: 'No verified vocabulary match and no real translation provider is registered.' };
    }

    /**
     * ensureNllbProviderRegistered()
     *   Idempotent, real, lazy registration — mirrors
     *   UniversalLearningPipeline.#declareRealCapabilities()'s own
     *   "declare only once, only if the real file is actually loaded"
     *   pattern. Registering does not mean the bridge is running (see
     *   speech-translation-provider-nllb.js's own header) — only that
     *   the JS provider object exists in the registry so translate()
     *   can attempt it and honestly report the real outcome. This is
     *   ONE candidate provider registration among however many the
     *   registry may hold — routeTranslation() above decides whether
     *   the registry is even consulted at all for a given sourceText.
     */
    function ensureNllbProviderRegistered() {
        const providers = window.CozyOS.SpeechTranslationProviders;
        const nllb = window.CozyOS.SpeechTranslationNLLBProvider;
        if (!providers || !nllb) return { success: false, reason: 'SpeechTranslationProviders/SpeechTranslationNLLBProvider not loaded.' };
        if (providers.hasAny() && providers.get('nllb-bridge')) return { success: true, alreadyRegistered: true };
        try {
            nllb.register();
            return { success: true, alreadyRegistered: false };
        } catch (err) {
            return { success: false, reason: err.message };
        }
    }

    /**
     * translateSegment({ segmentId, sourceLanguage, targetLanguage,
     *   sourceText, context, sourceTiming, pauseMetadata })
     *   The one real entry point for the multi-listener architecture:
     *   ONE Kiswahili source, each call represents ONE listener's own
     *   independently-selected targetLanguage. Never assumes English
     *   as the target, never pivots through English for a non-English
     *   pair — routeTranslation() sends sw->fr (or any pair) directly
     *   to a provider that supports it.
     *
     *   When a listener selects the SAME language the source already
     *   is (targetLanguage === sourceLanguage), this returns the
     *   original sourceText verbatim as translatedText — no real
     *   translation provider or verified-vocabulary lookup is called
     *   at all (routeTranslation() short-circuits to 'original-language'
     *   before either). This also means Owner Voice re-speech is not
     *   architecturally implied for this listener: `result.routing.route
     *   === 'original-language'` is the real signal a future delivery
     *   layer (CP16C/D) should use to serve the pastor's actual audio
     *   unchanged, rather than re-synthesizing speech that would only
     *   ever say the exact same words. voice is still resolved and
     *   returned for completeness/consistency, but a caller building
     *   real delivery should treat original-language as "no synthesis
     *   needed" per this architecture.
     *
     *   Never fabricates a translation if the real provider is
     *   unavailable — resolves { success:false, reason } instead.
     */
    async function translateSegment({ segmentId, sourceLanguage, targetLanguage, sourceText, context = null, sourceTiming = null, pauseMetadata = null } = {}) {
        const segmentCore = window.CozyOS.TranslationSegmentCore;
        if (!segmentCore) return { success: false, reason: 'TranslationSegmentCore is not loaded.' };

        if (typeof sourceText !== 'string' || !sourceText.trim()) {
            return { success: false, reason: 'sourceText is required.' };
        }
        if (!sourceLanguage || !targetLanguage) {
            return { success: false, reason: 'sourceLanguage and targetLanguage are both required.' };
        }

        ensureNllbProviderRegistered();

        const voice = resolveTranslationVoice();
        // A voice-resolution failure does not block translation itself
        // (Section 2's own "do not fabricate a voice if unavailable"
        // implies translation text can still be produced even if no
        // voice can currently deliver it) — voiceId is honestly null,
        // never a fabricated fallback presented as Owner Voice.

        const routing = routeTranslation({ sourceLanguage, sourceText, targetLanguage, context });

        let translatedText;
        let confidence;
        let providerName = null;

        if (routing.route === 'original-language') {
            translatedText = sourceText;
            confidence = undefined; // "translation confidence" does not apply — nothing was translated
            providerName = 'original-language';
        } else if (routing.route === 'verified-vocabulary') {
            translatedText = routing.recommendation.meaning;
            confidence = typeof routing.recommendation.confidence === 'number' ? routing.recommendation.confidence : undefined;
            providerName = 'verified-vocabulary';
        } else if (routing.route === 'provider') {
            const providers = window.CozyOS.SpeechTranslationProviders;
            const result = await providers.translate(sourceText, { sourceLanguage, targetLanguage });
            if (!result.isReal) {
                return { success: false, reason: result.reason || 'Translation provider did not return a real result.', voice, routing };
            }
            translatedText = result.translatedText;
            confidence = typeof result.confidence === 'number' ? result.confidence : undefined;
            providerName = result.providerName;
        } else {
            return { success: false, reason: routing.reason, voice, routing };
        }

        const segment = segmentCore.buildSegment({
            segmentId,
            sourceLanguage,
            targetLanguage,
            sourceText,
            translatedText,
            context,
            confidence,
            voiceId: voice.available ? voice.providerId : null,
            sourceTiming,
            pauseMetadata,
        });

        return { success: true, segment, voice, providerName, routing };
    }

    window.CozyOS.TranslationService = Object.freeze({
        translateSegment,
        routeTranslation,
        resolveTranslationVoice,
        ensureNllbProviderRegistered,
        OWNER_VOICE_PROVIDER_ID,
    });
})();
