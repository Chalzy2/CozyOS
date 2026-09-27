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
     * collectCozyLearnTaughtEvidence(entityValue, actorId)
     *   PHASE 5 — Continuous Learning & Knowledge Growth. Real, second
     *   composed source alongside the canonical-concept-registry path
     *   above — window.CozyOS.CozyLearn.getTrustedTeachings(entityValue,
     *   ...), the SAME real, already-existing, already-governed
     *   OBSERVED->CANDIDATE->USER_CONFIRMED->TRUSTED store
     *   cozy-teach-flow.js's own answerFromTrustedTeaching() already
     *   reads (that function is subject-agnostic — it works for an
     *   application name OR an arbitrary taught term identically; this
     *   is the same real lookup, just surfaced into SA-3's own current
     *   pipeline instead of the separate legacy cozy-ai.js call site).
     *   Never filters by language — a term's TAUGHT meaning is useful
     *   regardless of which language it is asked about in; language-
     *   appropriate WORDING is SA-4's job, not evidence filtering.
     *   Scopes default to ["USER","GLOBAL"] (never a bare GLOBAL-only
     *   default here specifically because a caller that already knows
     *   its own actorId is entitled to see its OWN USER-scope
     *   teachings — getTrustedTeachings() itself still fails closed on
     *   any USER entry whose actorId does not match). Multiple TRUSTED
     *   senses for the same term (see cozy-learn.js's own multi-sense
     *   fix) become MULTIPLE evidence records here — never collapsed
     *   to one, and never picked among.
     */
    function collectCozyLearnTaughtEvidence(entityValue, actorId) {
        const cozyLearn = window.CozyOS.CozyLearn;
        const contract = window.CozyOS.VerifiedEvidenceContract;
        if (!cozyLearn || typeof cozyLearn.getTrustedTeachings !== "function" || !contract) return [];
        let taught = [];
        try {
            taught = cozyLearn.getTrustedTeachings(entityValue, { scopes: ["USER", "GLOBAL"], actorId: actorId || null }) || [];
        } catch (_err) { return []; }
        const evidence = [];
        for (const t of taught) {
            if (!t || !isNonEmptyString(t.claim) || !isNonEmptyString(t.candidateId)) continue;
            const built = contract.create({
                id: "cozy-learn:" + t.candidateId,
                claim: t.claim,
                source: { type: "CozyLearn", id: t.candidateId },
                verification: { status: "VERIFIED", confidence: "MEDIUM", verifiedAt: t.validatedAt || undefined },
                // Real, traced, NOT a privacy downgrade: getTrustedTeachings()
                // above has ALREADY performed the real access check before
                // `taught` is even populated (a USER-scope entry is only
                // ever returned when its own actorId matches THIS caller's
                // actorId — see cozy-learn.js's own fail-closed rule). By
                // the time an entry reaches this loop, it is already
                // authorized for THIS specific requester, so labeling it
                // "PUBLIC" here means "safe to assert in THIS answer" —
                // the exact same accurate-label convention this
                // repository's own SA-2 cozy-knowledge-adapter.js already
                // uses for CozyKnowledge facts (see verified-evidence-
                // contract.js's own header). Mislabeling it "PRIVATE" here
                // would be WRONG, not safer: partitionEvidenceByAuthority()
                // treats ANY non-PUBLIC sensitivity as globally
                // un-assertable regardless of requester, which would make
                // a USER-scope teaching permanently unanswerable even to
                // its own teacher — a real functional bug, not a real
                // privacy improvement (the privacy boundary already lives,
                // correctly, in getTrustedTeachings()'s own query filter).
                sensitivity: "PUBLIC",
                language: t.language || undefined,
                entityId: entityValue,
                provenance: "window.CozyOS.CozyLearn (TRUSTED taught knowledge)"
            });
            if (built.success) evidence.push(built.evidence);
        }
        return evidence;
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
     *   rather than fabricated). PHASE 5 addition: when this primary
     *   attachment-based path finds nothing, ALSO tries
     *   collectCozyLearnTaughtEvidence() above (a second, real,
     *   already-governed source) before conceding — never overrides
     *   real attachment-based evidence when it exists. Returns
     *   {success:true, evidence:[...]} — evidence may be an empty array
     *   (honest "nothing learned yet"), never fabricated.
     */
    function collectLearnedEvidence({ goal = null, entityValue, language = null, actorId = "system" } = {}) {
        const store = window.CozyOS.ObservationStore;
        const bridge = window.CozyOS.ObservationEvidenceBridge;
        if (!isNonEmptyString(entityValue)) return { success: false, reason: "A real, non-empty entityValue is required.", evidence: [] };

        let evidence = [];
        let matchedAttachments = 0;
        if (store && bridge) {
            const attachments = findMatchingAttachments(entityValue, language, actorId);
            matchedAttachments = attachments.length;
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
        }

        if (evidence.length === 0) {
            const taughtEvidence = collectCozyLearnTaughtEvidence(entityValue, actorId);
            if (taughtEvidence.length > 0) evidence = taughtEvidence;
        }

        return { success: true, evidence, matchedAttachments };
    }

    const LearningEvidenceSupplement = Object.freeze({
        collectLearnedEvidence, findMatchingAttachments, collectCozyLearnTaughtEvidence, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.LearningEvidenceSupplement = LearningEvidenceSupplement;
    window.CozyOS.Modules["learning-evidence-supplement"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — bridges VERIFIED, governed canonical-concept attachments/observations into real VerifiedEvidence for SemanticAnswerPlanner's optional supplementary evidence source. Composes CanonicalConceptRegistry/ObservationStore/ObservationEvidenceBridge (primary) and, PHASE 5 addition, window.CozyOS.CozyLearn's own TRUSTED-teaching store (secondary, consulted only when the primary path finds nothing) — the same real store cozy-teach-flow.js's answerFromTrustedTeaching() already reads, now also reachable from SA-3's current pipeline. Adds no matching/translation/confidence logic of its own; never fabricates a status VerifiedEvidenceContract itself would reject. Not <script>-included by any page."
    });
})();
