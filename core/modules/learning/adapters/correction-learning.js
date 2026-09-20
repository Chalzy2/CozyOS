/**
 * CozyAI — Correction Learning
 * File Reference: core/modules/learning/adapters/correction-learning.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — Spelling/Correction
 * Learning phase.
 *
 * REPOSITORY REALITY CHECK (performed before writing this file)
 *   The repository already owns a real correction record type:
 *   window.CozyOS.CozyLanguageKnowledgeModel.createCorrection()
 *   (core/modules/intelligence/language-packs/cozy-language-knowledge-
 *   model.js, RP-035 Phase 1). It already: preserves originalValue
 *   without ever overwriting it, starts every record at validationState
 *   "PROPOSED" (never auto-verified), keeps an append-only history, and
 *   is reviewed only via its own explicit reviewCorrection(). This phase
 *   extended that file ADDITIVELY (never replaced) with an optional
 *   correctionType (SPELLING/WORD_CHOICE/GRAMMAR/TRANSLATION/MEANING/
 *   PRONUNCIATION/ENTITY_NAME/REGIONAL_USAGE/DIALECT/CONTEXT), an
 *   optional language, and an optional context field — the smallest
 *   change that lets one correction model serve every correction kind
 *   the phase brief requires, per its own "do not build spelling-
 *   learning.js/correction-database.js unless proven necessary" rule.
 *   No second correction store was created.
 *
 * WHAT THIS FILE ADDS ON TOP (composition, not duplication)
 *   CozyLanguageKnowledgeModel's own createCorrection() has no notion of
 *   governed multimodal evidence, repeated-observation correlation, or
 *   eventual promotion to VerifiedEvidence — that is this phase's own
 *   real, existing LIF pipeline (MultimodalObservationAdapter.
 *   fromUserCorrection() -> ObservationLifecycle -> ObservationEvidence
 *   Bridge, all pre-existing, unmodified by this file). recordCorrection()
 *   below calls BOTH real systems for the SAME correction event: the
 *   knowledge-model record is the permanent, human-reviewable original/
 *   corrected pair; the LIF observation is the same correction entering
 *   the SAME governed candidate -> validated -> verified pipeline every
 *   other observation source already uses, so a correction can
 *   eventually become real VerifiedEvidence and feed back into semantic
 *   understanding via learning-evidence-supplement.js — exactly like any
 *   other modality, never a parallel path.
 *
 * NEVER AUTO-VERIFIED
 *   Neither call this file makes moves anything to CONFIRMED/VALIDATED/
 *   VERIFIED on its own. confirmCorrection() below is the only way the
 *   knowledge-model record advances, and it always requires an explicit
 *   reviewerId. The LIF observation stays OBSERVED until a caller
 *   explicitly advances it through ObservationLifecycle (unchanged,
 *   composed as-is — this file never bypasses those governance gates).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml";
    if (window.CozyOS.Modules["correction-learning"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /**
     * recordCorrection({ targetRecordId, targetRecordType, originalValue,
     *   correctedValue, correctionType, language, context, reason,
     *   correctedBy, consent, actorId, sessionId, application })
     *
     *   Real, composed. Step 1: CozyLanguageKnowledgeModel.createCorrection()
     *   — the permanent, never-overwriting original/corrected pair record
     *   (REQUIRED; fails closed if that model is not loaded). Step 2:
     *   MultimodalObservationAdapter.fromUserCorrection() — the same
     *   correction as a real, governed OBSERVED observation (also
     *   required; fails closed on missing/false consent.authorized,
     *   exactly like every other observation source in this pipeline —
     *   a correction is not a special, consent-exempt path). Both steps
     *   must succeed for this function to report success; if the second
     *   fails, the first (permanent) record still exists — a partial
     *   LIF-governance failure never erases the underlying correction.
     */
    function recordCorrection({
        targetRecordId, targetRecordType, originalValue, correctedValue,
        correctionType = null, language = null, context = null, reason = null,
        correctedBy = null, consent, actorId = null, sessionId, application,
    } = {}) {
        const model = window.CozyOS.CozyLanguageKnowledgeModel;
        if (!model || typeof model.createCorrection !== "function") {
            return { success: false, reason: "CozyLanguageKnowledgeModel is not loaded." };
        }
        const correctionResult = model.createCorrection({
            targetRecordId, targetRecordType, originalValue, correctedValue,
            correctionType, language, context, reason, correctedBy,
        });
        if (correctionResult.status !== "CREATED") {
            return { success: false, reason: correctionResult.reason, correctionResult };
        }

        const adapter = window.CozyOS.MultimodalObservationAdapter;
        if (!adapter || typeof adapter.fromUserCorrection !== "function") {
            return { success: false, reason: "MultimodalObservationAdapter is not loaded.", correctionRecord: correctionResult.record };
        }
        const observationResult = adapter.fromUserCorrection({
            priorText: originalValue, correctedText: correctedValue,
            candidateLanguage: language,
            context: Object.assign({}, context && typeof context === "object" ? context : { note: context }, {
                correctionType, targetRecordId, targetRecordType, reason,
            }),
            consent, actorId, sessionId, application,
        });
        if (!observationResult.success) {
            return { success: false, reason: observationResult.reason, errors: observationResult.errors, correctionRecord: correctionResult.record };
        }

        return {
            success: true,
            correctionRecord: correctionResult.record,
            observation: observationResult.observation,
        };
    }

    /**
     * confirmCorrection(correctionId, { reviewerId, decision, note })
     *   Real, explicit review step on the permanent knowledge-model
     *   record — never automatic. decision defaults to "CONFIRMED" but
     *   accepts any of CozyLanguageKnowledgeModel.CORRECTION_VALIDATION_
     *   STATES (e.g. "REJECTED" for a mistaken correction — still never
     *   deletes the original correction record, only its validationState).
     */
    function confirmCorrection(correctionId, { reviewerId, decision = "CONFIRMED", note = null } = {}) {
        const model = window.CozyOS.CozyLanguageKnowledgeModel;
        if (!model || typeof model.reviewCorrection !== "function") {
            return { success: false, reason: "CozyLanguageKnowledgeModel is not loaded." };
        }
        if (!isNonEmptyString(reviewerId)) {
            return { success: false, reason: "A real reviewerId is required to confirm/reject a correction." };
        }
        const result = model.reviewCorrection(correctionId, decision, reviewerId, note);
        if (result.status !== "UPDATED") return { success: false, reason: result.reason };
        return { success: true, correctionRecord: result.record };
    }

    /** listCorrectionsFor(targetRecordId) — real, thin passthrough for callers that need every correction proposed for one record (e.g. conflicting corrections, test 13). */
    function listCorrectionsFor(targetRecordId) {
        const model = window.CozyOS.CozyLanguageKnowledgeModel;
        if (!model || typeof model.listCorrections !== "function") return [];
        return model.listCorrections({ targetRecordId });
    }

    const CorrectionLearning = Object.freeze({
        recordCorrection, confirmCorrection, listCorrectionsFor, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.CorrectionLearning = CorrectionLearning;
    window.CozyOS.Modules["correction-learning"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — spelling/grammar/word-choice/translation/meaning/pronunciation/entity-name/regional-usage/dialect/context correction learning. Composes the existing CozyLanguageKnowledgeModel.createCorrection() (permanent original/corrected record, never overwritten) AND MultimodalObservationAdapter.fromUserCorrection()/ObservationLifecycle (the same governed candidate->validated->verified pipeline every other observation uses). Never auto-verifies either record. Not <script>-included by any page."
    });
})();
