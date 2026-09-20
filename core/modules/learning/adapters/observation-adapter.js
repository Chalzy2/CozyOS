/**
 * CozyAI — Multimodal Observation Adapter
 * File Reference: core/modules/learning/adapters/observation-adapter.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — governed foundation phase.
 *
 * WHAT THIS IS
 *   Composes the real, existing window.CozyOS.MultimodalObservationCore
 *   (cross-modal text-similarity matching, decideLearningAction()) and
 *   wraps its real output in MultimodalObservationContract's envelope
 *   (source type, provenance, consent, lifecycle, learning scope). This
 *   file NEVER re-implements matching/confidence math, NEVER drives a
 *   camera/microphone/network itself, and NEVER performs OCR or speech
 *   recognition — every adapter function below takes ALREADY-CAPTURED,
 *   ALREADY-DERIVED input (a transcript, an OCR result object, extracted
 *   document text), exactly the same discipline
 *   core/modules/learning/universal-learning-pipeline.js's own
 *   learnFromMultimodalObservation()/captureVoiceForLearning() already
 *   established (confirmed by reading that file before this one was
 *   written) — real capture stays the caller's job (e.g.
 *   LearningCameraAdapter.captureForLearning(),
 *   SpeechRecognitionAdapter, window.CozyOS.OCR.extractText()), kept
 *   separate so this file is independently testable without a browser.
 *
 * CONSENT — every public function requires a real consent object and
 *   fails closed (never constructs an observation) when
 *   consent.authorized !== true. This is the one, single enforcement
 *   point for every "do not silently capture/record/identify" rule in
 *   the phase brief — callers cannot route around it by using a
 *   different adapter function, since they all funnel through
 *   #buildEnvelope() below.
 *
 * TEMPORAL SEGMENTATION — fromLiveMedia() accepts an optional
 *   `segmentWindowMs` (default 2000, i.e. ~2s, within the requested
 *   1-3s range) purely as a DESCRIPTIVE field recorded on the
 *   observation's context — this file does not itself schedule or poll
 *   anything; real segmentation timing is the caller's own
 *   capture-loop responsibility (e.g. a future LearningCameraAdapter-
 *   style consumer), consistent with "do not require every modality to
 *   be processed every second."
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-lif";
    if (window.CozyOS.Modules["multimodal-observation-adapter"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    function _uid(prefix) {
        return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`;
    }

    /**
     * #buildEnvelope — the ONE place every adapter function below routes
     * through. Composes MultimodalObservationCore.buildObservation() for
     * the real cross-modal matching (when both visual and audio are
     * given), then wraps it in MultimodalObservationContract's envelope.
     * Returns {success:false, reason:"CONSENT_NOT_AUTHORIZED"} before
     * ever touching the core engine when consent is missing/false —
     * fail-closed, never a partially-built observation.
     */
    function buildEnvelope({ sourceType, modality, candidateLanguage = null, visual = null, audio = null, derivedText, sessionId, application, actorId = null, context = null, consent, learningScope = "PERSONAL", mediaRetentionPolicy = "NOT_RETAINED" } = {}) {
        if (!isPlainObject(consent) || consent.authorized !== true) {
            return { success: false, reason: "CONSENT_NOT_AUTHORIZED", errors: ["A real, explicit consent.authorized === true is required — this observation was not built."] };
        }
        const core = window.CozyOS.MultimodalObservationCore;
        const contract = window.CozyOS.MultimodalObservationContract;
        if (!core || typeof core.buildObservation !== "function") return { success: false, reason: "MultimodalObservationCore is not loaded." };
        if (!contract || typeof contract.create !== "function") return { success: false, reason: "MultimodalObservationContract is not loaded." };

        const coreObservation = core.buildObservation({ userId: actorId, visual, audio, context });
        const text = isNonEmptyString(derivedText) ? derivedText
            : (visual && isNonEmptyString(visual.text)) ? visual.text
            : (audio && isNonEmptyString(audio.transcript)) ? audio.transcript
            : null;
        if (!isNonEmptyString(text)) return { success: false, reason: "NO_DERIVED_TEXT", errors: ["At least one real, non-empty derived text/transcript/OCR result is required."] };

        const now = Date.now();
        const built = contract.create({
            observationId: coreObservation.observationId,
            sourceType, modality, candidateLanguage,
            provenance: { sessionId: sessionId || _uid("session"), application: application || "unknown", actorId },
            timestamps: { observedAt: now, ingestedAt: now },
            contentRef: { derivedText: text, mediaRetentionPolicy },
            context,
            consent,
            evidenceState: coreObservation.matching,
            learningScope,
            lifecycleStatus: "OBSERVED",
            canonicalConceptId: null,
        });
        if (!built.success) return { success: false, reason: "CONTRACT_VALIDATION_FAILED", errors: built.errors };
        return { success: true, observation: built.observation, coreObservation };
    }

    /** fromText(fields) — a plain, already-typed/spoken text observation (e.g. a Live Window conversation turn). */
    function fromText({ text, candidateLanguage = null, sessionId, application, actorId = null, context = null, consent, learningScope = "PERSONAL" } = {}) {
        return buildEnvelope({ sourceType: "TEXT", modality: "TEXT", candidateLanguage, derivedText: text, sessionId, application, actorId, context, consent, learningScope });
    }

    /**
     * fromOCR(ocrResult, opts)
     *   ocrResult: the REAL, already-produced return value of
     *   window.CozyOS.OCR.extractText() ({available, text, confidence,
     *   words, lines}) — this function never calls extractText() itself.
     */
    function fromOCR(ocrResult, { candidateLanguage = null, sessionId, application, actorId = null, context = null, consent, learningScope = "PERSONAL" } = {}) {
        if (!ocrResult || ocrResult.available !== true || !isNonEmptyString(ocrResult.text)) {
            return { success: false, reason: "CAPABILITY_UNAVAILABLE", errors: ["A real, available OCR result with non-empty text is required — this file never fabricates extracted text."] };
        }
        return buildEnvelope({
            sourceType: "OCR", modality: "VISUAL", candidateLanguage,
            visual: { text: ocrResult.text, confidence: typeof ocrResult.confidence === "number" ? ocrResult.confidence : null, source: "ocr" },
            sessionId, application, actorId, context, consent, learningScope,
        });
    }

    /**
     * fromAudioTranscript(transcriptResult, opts)
     *   transcriptResult: the REAL, already-produced result of a speech
     *   capture (e.g. UniversalLearningPipeline.captureVoiceForLearning()'s
     *   own `audio` field shape: {transcript, confidence, language,
     *   source}) — this function never invokes speech recognition itself.
     */
    function fromAudioTranscript(transcriptResult, { candidateLanguage = null, sessionId, application, actorId = null, context = null, consent, learningScope = "PERSONAL" } = {}) {
        if (!transcriptResult || !isNonEmptyString(transcriptResult.transcript)) {
            return { success: false, reason: "CAPABILITY_UNAVAILABLE", errors: ["A real, non-empty transcript is required — this file never fabricates a transcript."] };
        }
        return buildEnvelope({
            sourceType: "AUDIO", modality: "AUDIO", candidateLanguage: candidateLanguage || transcriptResult.language || null,
            audio: { transcript: transcriptResult.transcript, confidence: typeof transcriptResult.confidence === "number" ? transcriptResult.confidence : null, language: transcriptResult.language || null, source: transcriptResult.source || "microphone" },
            sessionId, application, actorId, context, consent, learningScope,
        });
    }

    /**
     * fromDocument({ extractedText, documentRef }, opts)
     *   Same honest-gap discipline as
     *   CozyLanguageAcquisitionPipeline.acquireFromDocument(): this
     *   function performs NO PDF/DOCX parsing itself (confirmed no real
     *   parser exists anywhere in this repository — see cozy-knowledge-
     *   ingestion.js's own disclosed dangling CozyOCR.extractPdfText
     *   reference and universal-learning-pipeline.js's own
     *   learnFromDocument() stub). Requires the caller to already have
     *   real extracted text.
     */
    function fromDocument({ extractedText, documentRef = null, candidateLanguage = null, sessionId, application, actorId = null, context = null, consent, learningScope = "PERSONAL" } = {}) {
        if (!isNonEmptyString(extractedText)) {
            return { success: false, reason: "CAPABILITY_UNAVAILABLE", errors: ["No real PDF/document text-extraction engine exists in this repository — a caller-supplied, already-extracted extractedText is required."] };
        }
        return buildEnvelope({
            sourceType: "PDF_DOCUMENT", modality: "TEXT", candidateLanguage, derivedText: extractedText,
            sessionId, application, actorId, context: Object.assign({}, context, { documentRef }), consent, learningScope,
        });
    }

    /**
     * fromLiveMedia({ visual, audio, segmentWindowMs }, opts)
     *   For authorized in-app live media (e.g. a future Live TV/live-
     *   session feature — no such generic feature exists in this
     *   repository today; only ChurchOS's LivingWorshipPlayer does,
     *   which has its own, separate, unmodified authorization system).
     *   `visual`/`audio` are already-captured/derived — this function
     *   never accesses a camera, microphone, or any live-media API.
     *   consent is NOT optional here (buildEnvelope already enforces
     *   this for every source type, but it is restated because this is
     *   the specific path the phase brief's Live-TV-unauthorized-session
     *   test targets).
     */
    function fromLiveMedia({ visual = null, audio = null, segmentWindowMs = 2000, candidateLanguage = null, sessionId, application, actorId = null, context = null, consent, learningScope = "PERSONAL" } = {}) {
        if (!visual && !audio) return { success: false, reason: "NO_DERIVED_TEXT", errors: ["At least one real, already-derived visual or audio observation is required."] };
        return buildEnvelope({
            sourceType: "LIVE_MEDIA", modality: (visual && audio) ? "MULTIMODAL" : (visual ? "VISUAL" : "AUDIO"), candidateLanguage,
            visual, audio, sessionId, application, actorId,
            context: Object.assign({}, context, { segmentWindowMs }), consent, learningScope,
        });
    }

    /** fromApplicationEvent({ eventText, eventType }, opts) — an observation derived from an existing CozyOS application event, never a new event bus. */
    function fromApplicationEvent({ eventText, eventType = null, candidateLanguage = null, sessionId, application, actorId = null, context = null, consent, learningScope = "PERSONAL" } = {}) {
        if (!isNonEmptyString(eventText)) return { success: false, reason: "NO_DERIVED_TEXT", errors: ["A real, non-empty eventText is required."] };
        return buildEnvelope({
            sourceType: "APPLICATION_EVENT", modality: "TEXT", candidateLanguage, derivedText: eventText,
            sessionId, application, actorId, context: Object.assign({}, context, { eventType }), consent, learningScope,
        });
    }

    /** fromUserCorrection({ priorText, correctedText }, opts) — stores the correction as its own, real, attributable observation, never silently overwriting the prior one. */
    function fromUserCorrection({ priorText, correctedText, candidateLanguage = null, sessionId, application, actorId = null, context = null, consent, learningScope = "PERSONAL" } = {}) {
        if (!isNonEmptyString(correctedText)) return { success: false, reason: "NO_DERIVED_TEXT", errors: ["A real, non-empty correctedText is required."] };
        return buildEnvelope({
            sourceType: "USER_CORRECTION", modality: "TEXT", candidateLanguage, derivedText: correctedText,
            sessionId, application, actorId, context: Object.assign({}, context, { priorText: priorText || null }), consent, learningScope,
        });
    }

    /** fromCommunityContribution({ term, meaning }, opts) — a voluntary community language-learning contribution, real observation envelope only; actual community governance is adapters/observation-lifecycle.js's job. */
    function fromCommunityContribution({ term, meaning = null, candidateLanguage, sessionId, application, actorId = null, context = null, consent, learningScope = "COMMUNITY_CANDIDATE" } = {}) {
        if (!isNonEmptyString(term)) return { success: false, reason: "NO_DERIVED_TEXT", errors: ["A real, non-empty term is required."] };
        if (!isNonEmptyString(candidateLanguage)) return { success: false, reason: "LANGUAGE_REQUIRED", errors: ["candidateLanguage is required for a community language contribution."] };
        return buildEnvelope({
            sourceType: "COMMUNITY_CONTRIBUTION", modality: "TEXT", candidateLanguage, derivedText: term,
            sessionId, application, actorId, context: Object.assign({}, context, { meaning }), consent, learningScope,
        });
    }

    /**
     * publishToSense(observation, {sensorId})
     *   Optional, real integration with window.CozyOS.CozySense's own,
     *   existing observation bus (registerObservation()) — never a new
     *   bus. Requires the sensor to already be registered (CozySense's
     *   own real rule; this function does not auto-register one). Purely
     *   additive/optional: nothing else in this file requires it.
     */
    function publishToSense(observation, { sensorId } = {}) {
        const sense = window.CozyOS.CozySense;
        if (!sense || typeof sense.registerObservation !== "function") return { success: false, reason: "CozySense is not loaded." };
        return sense.registerObservation({
            sensorId, sourceEngine: "MultimodalObservationAdapter", observationType: "detected",
            metadata: { sourceType: observation.sourceType, modality: observation.modality, candidateLanguage: observation.candidateLanguage },
            data: observation,
        });
    }

    const MultimodalObservationAdapter = Object.freeze({
        fromText, fromOCR, fromAudioTranscript, fromDocument, fromLiveMedia,
        fromApplicationEvent, fromUserCorrection, fromCommunityContribution,
        publishToSense, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.MultimodalObservationAdapter = MultimodalObservationAdapter;
    window.CozyOS.Modules["multimodal-observation-adapter"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — real observation adapter. Composes the existing MultimodalObservationCore (cross-modal matching, unmodified) into MultimodalObservationContract-valid records. Never captures media/OCR/speech itself; every function takes already-derived input. Consent is fail-closed for every source type. Not <script>-included by any page."
    });
})();
