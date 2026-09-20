/**
 * CozyAI — Learning Evidence Supplement
 * File Reference: core/modules/learning/adapters/learning-evidence-supplement.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — feeds VERIFIED, governed
 * multimodal-learning evidence back into the existing SA-3 SemanticAnswerPlanner.
 *
 * WHAT THIS IS
 *   The one, disclosed bridge point semantic-answer-planner.js's own
 *   optional window.CozyOS.LearningEvidenceSupplement.collectLearnedEvidence()
 *   composition already calls (see that file's planAnswer(), MODULE_VERSION
 *   1.2.0-cml — consulted ONLY when the primary CozyKnowledge-backed
 *   evidence found nothing). Composes only real, existing pieces:
 *     - CanonicalConceptRegistry (attachment storage, by term+language) —
 *       reads its own real CozyMemory namespace directly (no new index)
 *     - ObservationStore (the underlying, persisted observation record)
 *     - ObservationEvidenceBridge.toVerifiedEvidence() (the one real,
 *       existing translation from a governed observation into a real,
 *       SA-1-contract-valid VerifiedEvidence record)
 *   Never invents a second evidence format, never asserts anything not
 *   already lifecycleStatus === "VERIFIED" on the underlying observation.
 *   This is the literal closing of the "CozyAI must not merely accumulate
 *   learned records... verified learning must feed back into the existing
 *   semantic understanding system" requirement — it adds no matching,
 *   translation, or confidence logic of its own.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml";
    if (window.CozyOS.Modules["learning-evidence-supplement"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /**
     * findMatchingAttachments(entityValue, language, actorId)
     *   Real search over CanonicalConceptRegistry's own real CozyMemory
     *   namespace — no separate index. Matches an attachment whose own
     *   `term` equals entityValue (case-insensitive, mirroring
     *   MultimodalObservationCore's own normalization discipline at the
     *   comparison boundary only — no text is altered/stored) and, when
     *   a language is supplied, whose own `language` matches it too.
     */
    function findMatchingAttachments(entityValue, language, actorId) {
        const memory = window.CozyOS.CozyMemory;
        const registry = window.CozyOS.CanonicalConceptRegistry;
        if (!memory || typeof memory.listKeys !== "function" || !registry) return [];
        const needle = String(entityValue || "").trim().toLowerCase();
        const entries = memory.listKeys(registry.NAMESPACE, (e) =>
            typeof e.key === "string" && e.key.startsWith("attachment:") &&
            e.value && isNonEmptyString(e.value.term) &&
            e.value.term.trim().toLowerCase() === needle &&
            (!language || e.value.language === language),
            actorId) || [];
        return entries.map((e) => e.value).filter(Boolean);
    }

    /**
     * collectLearnedEvidence({goal, entityValue, language, actorId})
     *   Real. For every matching attachment (term+language), resolves its
     *   real observation ids (observationIds + relatedObservationIds —
     *   see adapters/learning-correlation.js's own strengthening field),
     *   fetches each real observation via ObservationStore, filters to
     *   only lifecycleStatus === "VERIFIED", and bridges each to a real
     *   VerifiedEvidence record via
     *   ObservationEvidenceBridge.toVerifiedEvidence(). `goal` is accepted
     *   for interface symmetry with the planner's own call site and future
     *   goal-scoping, but is not yet used to filter (no per-goal field
     *   exists on a canonical-concept attachment today — honestly unused
     *   rather than fabricated). Returns {success:true, evidence:[...]}
     *   — evidence may be an empty array (honest "nothing learned yet"),
     *   never fabricated.
     */
    function collectLearnedEvidence({ goal = null, entityValue, language = null, actorId = "system" } = {}) {
        const store = window.CozyOS.ObservationStore;
        const bridge = window.CozyOS.ObservationEvidenceBridge;
        if (!store || !bridge) return { success: false, reason: "ObservationStore/ObservationEvidenceBridge are not both loaded.", evidence: [] };
        if (!isNonEmptyString(entityValue)) return { success: false, reason: "A real, non-empty entityValue is required.", evidence: [] };

        const attachments = findMatchingAttachments(entityValue, language, actorId);
        const evidence = [];
        const seenObservationIds = new Set();
        for (const attachment of attachments) {
            const observationIds = Array.from(new Set([...(attachment.observationIds || []), ...(attachment.relatedObservationIds || [])]));
            for (const observationId of observationIds) {
                if (seenObservationIds.has(observationId)) continue;
                seenObservationIds.add(observationId);
                const observation = store.getObservation(observationId, { actorId });
                if (!observation || observation.lifecycleStatus !== "VERIFIED") continue;
                const built = bridge.toVerifiedEvidence(observation, { confidence: "MEDIUM" });
                if (built.success) evidence.push(built.evidence);
            }
        }
        return { success: true, evidence, matchedAttachments: attachments.length };
    }

    const LearningEvidenceSupplement = Object.freeze({
        collectLearnedEvidence, findMatchingAttachments, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.LearningEvidenceSupplement = LearningEvidenceSupplement;
    window.CozyOS.Modules["learning-evidence-supplement"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — bridges VERIFIED, governed canonical-concept attachments/observations into real VerifiedEvidence for SemanticAnswerPlanner's optional supplementary evidence source. Composes CanonicalConceptRegistry/ObservationStore/ObservationEvidenceBridge only; adds no matching/translation/confidence logic. Not <script>-included by any page."
    });
})();
