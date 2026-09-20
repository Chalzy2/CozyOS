/**
 * CozyAI — Canonical Concept Registry
 * File Reference: core/modules/learning/adapters/canonical-concept-registry.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — governed foundation phase.
 *
 * WHAT THIS IS
 *   Real storage/query surface for CanonicalConceptContract records —
 *   composes window.CozyOS.CozyMemory.saveMemory()/readMemory()/
 *   searchMemory() under a dedicated namespace ("canonical-concepts"),
 *   the exact same "no new store" discipline
 *   universal-learning-pipeline.js's own confirmMultimodalObservation()
 *   already established for the "multimodal-learning" namespace
 *   (confirmed by reading that file before this one was written). This
 *   is not a second memory system — it is one more namespace inside the
 *   one, real, existing memory engine.
 *
 * WHY WORD/CONCEPT CONNECTION LIVES HERE, NOT IN THE CONTRACT FILE
 *   canonical-concept-contract.js only validates shape. Finding or
 *   creating the right concept for a new term, and recording a typed
 *   attachment with its real evidence trail, is real behavior — it
 *   belongs in this adapter, exactly like observation-lifecycle.js
 *   keeps its own real governance behavior separate from
 *   multimodal-observation-contract.js's pure shape validation.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-lif";
    const NAMESPACE = "canonical-concepts";
    if (window.CozyOS.Modules["canonical-concept-registry"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function _uid(prefix) {
        return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`;
    }

    function memoryOrFail() {
        const memory = window.CozyOS.CozyMemory;
        if (!memory || typeof memory.saveMemory !== "function") return null;
        return memory;
    }

    /**
     * getOrCreateConcept({ conceptId, domain, description, actorId })
     *   Real, idempotent: if conceptId already exists in CozyMemory,
     *   returns it unchanged; otherwise creates and persists a new,
     *   contract-valid ConceptRecord. Never silently overwrites an
     *   existing concept's domain/description.
     */
    function getOrCreateConcept({ conceptId, domain, description = null, actorId = "system" } = {}) {
        const memory = memoryOrFail();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        if (!isNonEmptyString(conceptId)) return { success: false, reason: "A real, non-empty conceptId is required." };

        // readMemory() returns CozyMemory's own real envelope
        // ({value, owner, tags, visibility, ...}), confirmed against its
        // real source (cozy-memory-engine.js's saveMemory()/readMemory())
        // and against cozy-learn.js's own load(), which unwraps `.value`
        // the same way — never the bare stored object directly.
        const existing = memory.readMemory(NAMESPACE, `concept:${conceptId}`, actorId);
        if (existing && existing.value) return { success: true, concept: existing.value, created: false };

        const contract = window.CozyOS.CanonicalConceptContract;
        if (!contract || typeof contract.createConcept !== "function") return { success: false, reason: "CanonicalConceptContract is not loaded." };
        const built = contract.createConcept({ conceptId, domain, description });
        if (!built.success) return { success: false, reason: "CONTRACT_VALIDATION_FAILED", errors: built.errors };

        memory.saveMemory(NAMESPACE, `concept:${conceptId}`, built.concept, { owner: actorId, actorId, visibility: "public" });
        return { success: true, concept: built.concept, created: true };
    }

    /**
     * attachObservation({ conceptId, observation, language, term, relationshipType, evidenceIds, confidence, actorId })
     *   Creates and persists a real ConceptAttachment linking a
     *   real, already-built observation (or explicit evidenceIds) to a
     *   concept. Requires the concept to already exist (via
     *   getOrCreateConcept()) — never auto-creates a concept implicitly,
     *   so a caller cannot accidentally spawn duplicate/typo'd concepts.
     */
    function attachObservation({ conceptId, observation = null, language, term, relationshipType, evidenceIds = [], confidence = null, meaning = null, actorId = "system" } = {}) {
        const memory = memoryOrFail();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        const conceptEntry = memory.readMemory(NAMESPACE, `concept:${conceptId}`, actorId);
        if (!conceptEntry || !conceptEntry.value) return { success: false, reason: `No existing concept "${conceptId}" — call getOrCreateConcept() first.` };

        const contract = window.CozyOS.CanonicalConceptContract;
        if (!contract || typeof contract.createAttachment !== "function") return { success: false, reason: "CanonicalConceptContract is not loaded." };
        const built = contract.createAttachment({
            attachmentId: _uid("attach"),
            conceptId,
            language: language || (observation && observation.candidateLanguage),
            term: term || (observation && observation.contentRef && observation.contentRef.derivedText),
            relationshipType,
            observationIds: observation ? [observation.observationId] : [],
            evidenceIds,
            confidence,
            meaning: meaning || (observation && observation.context && observation.context.meaning) || null,
        });
        if (!built.success) return { success: false, reason: "CONTRACT_VALIDATION_FAILED", errors: built.errors };

        memory.saveMemory(NAMESPACE, `attachment:${built.attachment.attachmentId}`, built.attachment, { owner: actorId, actorId, visibility: "public", tags: [`concept:${conceptId}`] });
        return { success: true, attachment: built.attachment };
    }

    /**
     * listAttachments(conceptId, {actorId})
     *   Real search over the real namespace, tag-filtered by concept.
     *   listKeys()'s own real code maps each entry to
     *   {key, ...deepClone(entry.current)} — and entry.current is itself
     *   CozyMemory's real envelope ({value, owner, tags, visibility,
     *   ...}), so each returned item is {key, value, owner, tags, ...};
     *   the actual attachment fields live under `.value` (confirmed
     *   against cozy-memory-engine.js's real saveMemory()/listKeys()
     *   before writing this function — the tag predicate itself
     *   correctly reads `.tags` at this same top level, since `tags` is
     *   a direct sibling of `value` inside entry.current).
     */
    function listAttachments(conceptId, { actorId = "system" } = {}) {
        const memory = memoryOrFail();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded.", attachments: [] };
        let entries;
        if (typeof memory.tagSearch === "function") {
            entries = memory.tagSearch(NAMESPACE, `concept:${conceptId}`, actorId) || [];
        } else if (typeof memory.listKeys === "function") {
            entries = memory.listKeys(NAMESPACE, (e) => Array.isArray(e.tags) && e.tags.includes(`concept:${conceptId}`), actorId) || [];
        } else {
            return { success: false, reason: "CozyMemory has neither tagSearch nor listKeys.", attachments: [] };
        }
        const attachments = entries
            .filter((e) => e.key.startsWith("attachment:") && e.value && e.value.conceptId === conceptId)
            .map((e) => e.value);
        return { success: true, attachments };
    }

    const CanonicalConceptRegistry = Object.freeze({
        NAMESPACE, getOrCreateConcept, attachObservation, listAttachments, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.CanonicalConceptRegistry = CanonicalConceptRegistry;
    window.CozyOS.Modules["canonical-concept-registry"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — real concept/attachment storage, composing CozyMemory under a dedicated namespace only (no new memory system). Lets multiple observations across language/modality/source attach to the same canonical concept with a typed relationship and a real evidence trail. Not <script>-included by any page."
    });
})();
