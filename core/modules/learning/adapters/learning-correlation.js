/**
 * CozyAI — Learning Correlation
 * File Reference: core/modules/learning/adapters/learning-correlation.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-3.
 *
 * WHAT THIS IS
 *   Connects a NEW observation to the SAME canonical concept an EARLIER
 *   observation already established, across time/context/source/
 *   contributor — the "a Kiswahili word in a conversation, a PDF, a TV
 *   broadcast, an image, and a correction should become related
 *   evidence for the SAME concept, not five unrelated facts" requirement.
 *   Composes only real, existing pieces: adapters/canonical-concept-
 *   registry.js (attachment storage) and adapters/observation-store.js
 *   (observation persistence) — no new storage, no new matching engine.
 *   Term-equality matching reuses the exact same real, deterministic
 *   normalization MultimodalObservationCore.computeTextSimilarity()
 *   already implements for cross-modal matching (NFD-normalize, strip
 *   diacritics, lowercase) — never a second text-comparison algorithm.
 *
 * CORRELATE, NEVER SILENTLY MERGE
 *   When a matching attachment already exists (same concept, same
 *   language, same normalized term, AND the same meaning — see below),
 *   this file does NOT overwrite it or fabricate a higher confidence —
 *   it records the new observation's id alongside the existing ones on
 *   that SAME attachment (relatedObservationIds) and returns
 *   strengthened:true. The real trust-tier consequence of that
 *   correlation (does this observation's contributor count as a
 *   genuinely independent contributor?) is still entirely
 *   CozyLanguageAcquisitionPipeline's own real, unmodified job — this
 *   file never touches independent-contributor counting itself.
 *
 * SAME SPELLING, DIFFERENT MEANING — NEVER COLLAPSED
 *   Spelling/Correction Learning phase, section 9, verbatim: "If the
 *   same expression appears with different meanings, do NOT collapse
 *   them merely because spelling is identical." Matching therefore
 *   requires term+language AND meaning to agree (both null/absent counts
 *   as agreeing, for callers that never supply one) before an
 *   observation strengthens an EXISTING attachment; a same-term,
 *   different-meaning observation creates its own, separate attachment
 *   under the SAME concept instead (still connected at the concept
 *   level — section 11's "concept-centered learning" — but never merged
 *   at the attachment/evidence level).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml";
    if (window.CozyOS.Modules["learning-correlation"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /**
     * correlateObservation({ conceptId, domain, observation, relationshipType, actorId })
     *   Real, composed. Ensures the concept exists (getOrCreateConcept()
     *   is idempotent), persists the observation (observation-store.js),
     *   then either strengthens an existing same-term attachment or
     *   creates a new one. Returns {success, attachment, strengthened,
     *   relatedObservationCount}.
     */
    function correlateObservation({ conceptId, domain = "general", observation, relationshipType = "PRIMARY_TERM", meaning = null, actorId = "system" } = {}) {
        const registry = window.CozyOS.CanonicalConceptRegistry;
        const store = window.CozyOS.ObservationStore;
        const core = window.CozyOS.MultimodalObservationCore;
        if (!registry || !store || !core) return { success: false, reason: "CanonicalConceptRegistry/ObservationStore/MultimodalObservationCore are not all loaded." };
        if (!isNonEmptyString(conceptId)) return { success: false, reason: "A real, non-empty conceptId is required." };
        if (!observation || !observation.contentRef || !isNonEmptyString(observation.contentRef.derivedText)) {
            return { success: false, reason: "A real observation with real contentRef.derivedText is required." };
        }

        const concept = registry.getOrCreateConcept({ conceptId, domain, actorId });
        if (!concept.success) return concept;

        store.saveObservation(Object.assign({}, observation, { canonicalConceptId: conceptId }), { actorId });

        const existing = registry.listAttachments(conceptId, { actorId });
        const term = observation.contentRef.derivedText;
        const language = observation.candidateLanguage || null;
        const effectiveMeaning = meaning || (observation.context && observation.context.meaning) || null;
        const normalizedMeaning = (v) => (v ? String(v).trim().toLowerCase() : null);
        const match = (existing.attachments || []).find((a) =>
            a.language === language &&
            core.computeTextSimilarity(a.term, term) >= 0.95 &&
            normalizedMeaning(a.meaning) === normalizedMeaning(effectiveMeaning)
        );

        if (match) {
            const relatedObservationIds = Array.from(new Set([...(match.relatedObservationIds || match.observationIds || []), observation.observationId]));
            const strengthened = Object.assign({}, match, { relatedObservationIds });
            const memory = window.CozyOS.CozyMemory;
            if (memory && typeof memory.saveMemory === "function") {
                memory.saveMemory(registry.NAMESPACE, `attachment:${match.attachmentId}`, strengthened, { owner: actorId, actorId, visibility: "public", tags: [`concept:${conceptId}`] });
            }
            return { success: true, attachment: strengthened, strengthened: true, relatedObservationCount: relatedObservationIds.length };
        }

        const created = registry.attachObservation({ conceptId, observation, relationshipType, meaning: effectiveMeaning, actorId });
        if (!created.success) return created;
        return { success: true, attachment: created.attachment, strengthened: false, relatedObservationCount: 1 };
    }

    const LearningCorrelation = Object.freeze({ correlateObservation, getVersion: () => MODULE_VERSION });
    window.CozyOS.LearningCorrelation = LearningCorrelation;
    window.CozyOS.Modules["learning-correlation"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — correlates repeated observations of the same term/concept across time/source/modality onto one shared attachment (relatedObservationIds), rather than creating unrelated duplicates. Composes CanonicalConceptRegistry/ObservationStore/MultimodalObservationCore only. Not <script>-included by any page."
    });
})();
