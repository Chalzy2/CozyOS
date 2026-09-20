/**
 * CozyAI — Canonical Concept Contract
 * File Reference: core/modules/learning/contracts/canonical-concept-contract.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — governed foundation phase.
 *
 * WHAT THIS IS
 *   Genuinely new — a repository-wide grep for "canonicalConcept",
 *   "conceptId", "canonical concept" (before this file was written)
 *   found zero matches anywhere in this repository. No existing file
 *   provides a "one canonical concept, many language/modality
 *   attachments" structure. `cozy-language-knowledge-model.js` (RP-035)
 *   comes closest but only links two already-registered PER-LANGUAGE
 *   expression records pairwise (`createTranslationRelationship`) — it
 *   has no shared, language-neutral concept id either side attaches to.
 *   This file adds exactly that missing layer, and nothing else: it
 *   does not register languages (CozyLanguagePacks, unmodified), does
 *   not classify meaning safety (CozyKnowledgeSafetyGate, unmodified,
 *   already composed by CozyLanguagePacks.submitExpression() before any
 *   attachment here exists), and does not decide what counts as
 *   evidence (VerifiedEvidenceContract / MultimodalObservationContract,
 *   unmodified).
 *
 * TWO RECORD SHAPES
 *   ConceptRecord (`cozy.ai.canonical-concept.v1`) — one row per
 *   concept: {conceptId, domain, description?, relatedConceptIds[],
 *   createdAt}. Genuinely language-neutral — "CONCEPT_WATER" has no
 *   English or Kiswahili wording of its own; the wording lives entirely
 *   in its attachments.
 *   ConceptAttachment (`cozy.ai.canonical-concept-attachment.v1`) — one
 *   row per (concept, language, term) link: {attachmentId, conceptId,
 *   language, term, relationshipType, observationIds[], evidenceIds[],
 *   confidence}. `relationshipType` is a real, closed, disclosed set —
 *   never free text — so "maji"(sw)/"water"(en) can both attach as
 *   PRIMARY_TERM to CONCEPT_WATER, while "mvua"(sw, rain)/"river"/
 *   "thirst" attach as RELATED_CONTEXT, each carrying its own real
 *   evidence/observation ids rather than being merged into one
 *   undifferentiated bag of "related words."
 *
 * GOVERNANCE — this file validates shape only
 *   Whether an attachment is trustworthy is NOT this file's job — that
 *   is exactly what MultimodalObservationContract's lifecycleStatus and
 *   CozyLearn/CozyLanguageAcquisitionPipeline's own promotion paths
 *   already govern (see adapters/observation-lifecycle.js). An
 *   attachment's `evidenceIds`/`observationIds` are the real, disclosed
 *   trail back to that governance — this contract never invents a
 *   confidence number un-backed by at least one real id in one of those
 *   two arrays (validate() enforces at least one of the two is
 *   non-empty).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const CONCEPT_SCHEMA_VERSION = "cozy.ai.canonical-concept.v1";
    const ATTACHMENT_SCHEMA_VERSION = "cozy.ai.canonical-concept-attachment.v1";
    const MODULE_VERSION = "1.0.0-lif";
    if (window.CozyOS.Modules["canonical-concept-contract"]) return;

    const RELATIONSHIP_TYPE = Object.freeze(["PRIMARY_TERM", "RELATED_CONTEXT", "TRANSLATION", "USAGE_EXAMPLE"]);
    const RELATIONSHIP_TYPE_SET = new Set(RELATIONSHIP_TYPE);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
    function isStringArray(v) { return Array.isArray(v) && v.every((x) => isNonEmptyString(x)); }

    function validateConcept(concept) {
        const errors = [];
        if (!isPlainObject(concept)) return { valid: false, errors: ["concept must be a real object."] };
        if (concept.schemaVersion !== CONCEPT_SCHEMA_VERSION) errors.push(`schemaVersion must be "${CONCEPT_SCHEMA_VERSION}", got ${JSON.stringify(concept.schemaVersion)}.`);
        if (!isNonEmptyString(concept.conceptId)) errors.push("conceptId must be a real, non-empty string.");
        if (!isNonEmptyString(concept.domain)) errors.push("domain must be a real, non-empty string (e.g. \"agriculture\", \"greeting\", \"identity\").");
        if (concept.description !== undefined && concept.description !== null && !isNonEmptyString(concept.description)) errors.push("description, when present, must be a real, non-empty string or null.");
        if (concept.relatedConceptIds !== undefined && !isStringArray(concept.relatedConceptIds)) errors.push("relatedConceptIds, when present, must be an array of real, non-empty conceptId strings.");
        if (typeof concept.createdAt !== "number") errors.push("createdAt must be a real number (epoch ms).");
        return { valid: errors.length === 0, errors };
    }

    function createConcept(fields = {}) {
        const concept = Object.assign({ schemaVersion: CONCEPT_SCHEMA_VERSION, relatedConceptIds: [], createdAt: Date.now() }, fields);
        const result = validateConcept(concept);
        return result.valid ? { success: true, concept } : { success: false, errors: result.errors };
    }

    function validateAttachment(attachment) {
        const errors = [];
        if (!isPlainObject(attachment)) return { valid: false, errors: ["attachment must be a real object."] };
        if (attachment.schemaVersion !== ATTACHMENT_SCHEMA_VERSION) errors.push(`schemaVersion must be "${ATTACHMENT_SCHEMA_VERSION}", got ${JSON.stringify(attachment.schemaVersion)}.`);
        if (!isNonEmptyString(attachment.attachmentId)) errors.push("attachmentId must be a real, non-empty string.");
        if (!isNonEmptyString(attachment.conceptId)) errors.push("conceptId must be a real, non-empty string.");
        if (!isNonEmptyString(attachment.language)) errors.push("language must be a real, non-empty languageId string — this contract never validates it against a fixed list (see file header).");
        if (!isNonEmptyString(attachment.term)) errors.push("term must be a real, non-empty string (the actual word/phrase in that language).");
        if (!isNonEmptyString(attachment.relationshipType) || !RELATIONSHIP_TYPE_SET.has(attachment.relationshipType)) errors.push(`relationshipType must be one of ${RELATIONSHIP_TYPE.join("/")}. Got ${JSON.stringify(attachment.relationshipType)}.`);
        // CML addition — real, additive, optional. "If the same
        // expression appears with different meanings, do NOT collapse
        // them merely because spelling is identical" (Spelling/Correction
        // Learning phase, section 9). meaning has no fixed vocabulary
        // (a real gloss/definition string) and defaults to null, exactly
        // like description on ConceptRecord above — omitting it
        // reproduces this contract's pre-CML behavior exactly.
        if (attachment.meaning !== undefined && attachment.meaning !== null && !isNonEmptyString(attachment.meaning)) errors.push("meaning, when present, must be a real, non-empty string or null.");

        const observationIds = Array.isArray(attachment.observationIds) ? attachment.observationIds : [];
        const evidenceIds = Array.isArray(attachment.evidenceIds) ? attachment.evidenceIds : [];
        if (attachment.observationIds !== undefined && !isStringArray(observationIds)) errors.push("observationIds, when present, must be an array of real, non-empty strings.");
        if (attachment.evidenceIds !== undefined && !isStringArray(evidenceIds)) errors.push("evidenceIds, when present, must be an array of real, non-empty strings.");
        if (observationIds.length === 0 && evidenceIds.length === 0) errors.push("an attachment must carry at least one real observationId or evidenceId — never an unbacked relationship.");

        if (attachment.confidence !== undefined && attachment.confidence !== null) {
            if (typeof attachment.confidence !== "number" || attachment.confidence < 0 || attachment.confidence > 1) errors.push("confidence, when present, must be a real number in [0, 1].");
        }
        return { valid: errors.length === 0, errors };
    }

    function createAttachment(fields = {}) {
        const attachment = Object.assign({ schemaVersion: ATTACHMENT_SCHEMA_VERSION, observationIds: [], evidenceIds: [], meaning: null }, fields);
        const result = validateAttachment(attachment);
        return result.valid ? { success: true, attachment } : { success: false, errors: result.errors };
    }

    const CanonicalConceptContract = Object.freeze({
        CONCEPT_SCHEMA_VERSION, ATTACHMENT_SCHEMA_VERSION, RELATIONSHIP_TYPE,
        validateConcept, createConcept, validateAttachment, createAttachment,
        getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.CanonicalConceptContract = CanonicalConceptContract;
    window.CozyOS.Modules["canonical-concept-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — canonical concept contract. Genuinely new (confirmed no prior art exists in this repository): a language-neutral ConceptRecord plus typed ConceptAttachment records linking real observation/evidence ids across languages and modalities to the same concept. Structural validation only; no storage, no promotion logic (see adapters/canonical-concept-registry.js). Not <script>-included by any page."
    });
})();
