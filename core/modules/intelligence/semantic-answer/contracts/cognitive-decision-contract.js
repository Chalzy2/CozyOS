/**
 * CozyAI — Cognitive Decision & Language Intelligence Vocabulary Contract
 * File Reference: core/modules/intelligence/semantic-answer/contracts/cognitive-decision-contract.js
 * Part of: SA-3 EXTENSION — Universal Language Intelligence, Gap Detection &
 * Governed Learning (LIF-1 — Language Capability Model). See
 * ../LANGUAGE-INTELLIGENCE-FOUNDATION-ROADMAP.md for the full future-phase
 * roadmap this file's vocabulary belongs to.
 *
 * WHAT THIS IS
 *   Pure vocabulary/shape contracts, same convention as SA-1's other
 *   contracts (schemaVersion + validate() + create()). This file does NOT
 *   implement gap detection, evidence discovery, translation, or learning —
 *   it only defines the closed enums and record shapes that let the
 *   cognitive planning layer (SA-3) REPRESENT "I don't know this yet" /
 *   "I have a candidate but it needs verification" / "I found conflicting
 *   evidence" instead of silently guessing, silently translating, or
 *   silently promoting unverified material.
 *
 * WHY A NEW FILE RATHER THAN EDITING SA-1's EXISTING CONTRACTS
 *   SemanticAnswerPlanContract.validate() (SA-1) does not reject unknown
 *   fields — a plan may carry an additional, optional `cognitiveStatus`
 *   value from this contract's PLAN_STATUS enum without any change to that
 *   file. VerifiedEvidenceContract (SA-1) already has an open,
 *   non-enum `source.type` string specifically so SA-2/future adapters can
 *   extend it without a contract change; this file's LANGUAGE_EVIDENCE_SOURCE
 *   enum is the disclosed, closed set future LIF adapters will use for that
 *   field's value for language-evidence sources specifically. Nothing here
 *   requires, or performs, any change to SA-1 or SA-2's existing files —
 *   this is additive only, per explicit instruction not to restart or
 *   discard SA-1/SA-2.
 *
 * PLAN_STATUS — cognitive decision states a SemanticAnswerPlan (or an
 *   in-progress planning attempt that does not reach a plan) can be in.
 *   Distinct from SA-1's ANSWER_MODE (which describes response SHAPE —
 *   DIRECT_ANSWER/LIST/etc.): PLAN_STATUS describes the cognitive layer's
 *   epistemic state BEFORE realization. UNDERSTOOD/CLARIFICATION_REQUIRED/
 *   ACTION_REQUIRED/UNKNOWN correspond to today's SA-3 planner outcomes;
 *   AMBIGUOUS/INSUFFICIENT_EVIDENCE/EVIDENCE_CONFLICT/LANGUAGE_GAP/
 *   VERIFICATION_REQUIRED/LEARNING_CANDIDATE are the new, honest states this
 *   extension's spec requires SA-3 be able to represent even before any
 *   LIF phase exists to resolve them.
 *
 * LANGUAGE_GAP_TYPE — the 26 gap categories named verbatim in the SA-3
 *   extension spec §5. A LanguageGap record names ONE of these; it does not
 *   resolve it (that's LIF-3 onward).
 *
 * LANGUAGE_EVIDENCE_SOURCE — future evidence provenance classes named in
 *   the spec (§10-§15, §23): APPLICATION and ORGANIZATION and PUBLIC and
 *   MEMORY already have real SA-2 adapters (window.CozyOS.
 *   CozyKnowledgeEvidenceAdapter / CozyMemoryEvidenceAdapter). CODEBASE,
 *   DOCUMENT, AUDIO, VIDEO, AUDIOBOOK, USER_TAUGHT, NLLB_CANDIDATE have NO
 *   adapter yet — naming them here does not create one (per explicit
 *   instruction: "do not build everything now"). Each of these MUST retain
 *   its real source class in any future evidence record — code-derived
 *   terminology is never relabeled as verified natural language, an NLLB
 *   candidate is never relabeled APPLICATION, etc.
 *
 * TRANSLATION_STATUS — encodes spec §9 directly: a translation-engine
 *   (NLLB or any future engine) output starts and stays CANDIDATE_TRANSLATION
 *   until an explicit, separate verification step (LIF-9, via existing
 *   CozyLearn governance) moves it to VERIFIED_LANGUAGE_KNOWLEDGE. This
 *   contract enforces the transition can never be skipped structurally: only
 *   `create()` can move a record between states, and moving to
 *   VERIFIED_LANGUAGE_KNOWLEDGE requires a real, non-empty `verifiedBy`.
 *
 * COVERAGE_DIMENSION / COVERAGE_LEVEL — spec §19-§20's multi-dimensional
 *   coverage model. Deliberately never a single percentage: a
 *   LanguageCoverageEntry names exactly one dimension for exactly one
 *   language (optionally scoped to one domain) at exactly one level.
 *   Aggregating many entries into a fluency picture is LIF-12's job, not
 *   this file's.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa3-extension";
    if (window.CozyOS.Modules["cognitive-decision-contract"]) return;

    const LANGUAGE_GAP_SCHEMA_VERSION = "cozy.language-gap.v1";
    const LANGUAGE_COVERAGE_SCHEMA_VERSION = "cozy.language-coverage.v1";
    const TRANSLATION_CANDIDATE_SCHEMA_VERSION = "cozy.translation-candidate.v1";

    const PLAN_STATUS = Object.freeze([
        "UNDERSTOOD", "AMBIGUOUS", "UNKNOWN", "INSUFFICIENT_EVIDENCE",
        "EVIDENCE_CONFLICT", "LANGUAGE_GAP", "VERIFICATION_REQUIRED",
        "LEARNING_CANDIDATE", "CLARIFICATION_REQUIRED", "ACTION_REQUIRED",
    ]);
    const PLAN_STATUS_SET = new Set(PLAN_STATUS);

    const LANGUAGE_GAP_TYPE = Object.freeze([
        "LEXICAL_GAP", "GRAMMAR_GAP", "ENTITY_NAME_GAP", "PLACE_NAME_GAP",
        "ANIMAL_TERM_GAP", "PLANT_TERM_GAP", "NUMBER_GAP", "DATE_TIME_GAP",
        "GREETING_GAP", "QUESTION_FORM_GAP", "VERB_GAP", "NOUN_GAP",
        "ADJECTIVE_GAP", "CONNECTOR_GAP", "DOMAIN_TERMINOLOGY_GAP",
        "TRANSLATION_GAP", "PRONUNCIATION_GAP", "STT_GAP", "TTS_GAP",
        "NATURALNESS_GAP", "REGISTER_GAP", "CONTEXT_GAP",
        "CULTURAL_USAGE_GAP", "SEMANTIC_GAP", "EVIDENCE_GAP",
        "VERIFICATION_GAP",
    ]);
    const LANGUAGE_GAP_TYPE_SET = new Set(LANGUAGE_GAP_TYPE);

    const GAP_CLOSURE_STATUS = Object.freeze(["OPEN", "CANDIDATE_FOUND", "NEEDS_VERIFICATION", "CLOSED"]);
    const GAP_CLOSURE_STATUS_SET = new Set(GAP_CLOSURE_STATUS);

    // Real SA-2 adapters exist today for APPLICATION/ORGANIZATION/PUBLIC/MEMORY
    // (see verified-evidence-adapter.js's own SOURCE_TYPE). The rest are named,
    // disclosed future classes with no adapter yet.
    const LANGUAGE_EVIDENCE_SOURCE = Object.freeze([
        "APPLICATION", "CODEBASE", "DOCUMENT", "AUDIO", "VIDEO", "AUDIOBOOK",
        "USER_TAUGHT", "NLLB_CANDIDATE", "ORGANIZATION", "PUBLIC", "MEMORY",
    ]);
    const LANGUAGE_EVIDENCE_SOURCE_SET = new Set(LANGUAGE_EVIDENCE_SOURCE);

    const TRANSLATION_STATUS = Object.freeze(["CANDIDATE_TRANSLATION", "NEEDS_VERIFICATION", "VERIFIED_LANGUAGE_KNOWLEDGE"]);
    const TRANSLATION_STATUS_SET = new Set(TRANSLATION_STATUS);

    const COVERAGE_DIMENSION = Object.freeze([
        "VOCABULARY", "ENTITIES", "PLACES", "GRAMMAR", "PRONUNCIATION", "TTS", "STT",
        "DOMAIN_TERMINOLOGY", "EVERYDAY_CONVERSATION", "SEMANTIC_CORRECTNESS",
        "GRAMMATICAL_CORRECTNESS", "LEXICAL_CORRECTNESS", "NATURALNESS", "REGISTER",
        "CULTURAL_APPROPRIATENESS", "CONVERSATIONAL_CONTINUITY", "TRANSLATION_FIDELITY",
        "MEANING_PRESERVATION",
    ]);
    const COVERAGE_DIMENSION_SET = new Set(COVERAGE_DIMENSION);

    const COVERAGE_LEVEL = Object.freeze(["VERIFIED", "PARTIAL", "INSUFFICIENT"]);
    const COVERAGE_LEVEL_SET = new Set(COVERAGE_LEVEL);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    /** validateLanguageGap(gap) — real, structural validation of a LanguageGap record. */
    function validateLanguageGap(gap) {
        const errors = [];
        if (!isPlainObject(gap)) return { valid: false, errors: ["gap must be a real object."] };
        if (gap.schemaVersion !== LANGUAGE_GAP_SCHEMA_VERSION) errors.push(`schemaVersion must be "${LANGUAGE_GAP_SCHEMA_VERSION}", got ${JSON.stringify(gap.schemaVersion)}.`);
        if (!isNonEmptyString(gap.gapType) || !LANGUAGE_GAP_TYPE_SET.has(gap.gapType)) errors.push(`gapType must be one of ${LANGUAGE_GAP_TYPE.join("/")}. Got ${JSON.stringify(gap.gapType)}.`);
        if (!isNonEmptyString(gap.language)) errors.push("language must be a real, non-empty languageId string.");
        if (!isNonEmptyString(gap.status) || !GAP_CLOSURE_STATUS_SET.has(gap.status)) errors.push(`status must be one of ${GAP_CLOSURE_STATUS.join("/")}. Got ${JSON.stringify(gap.status)}.`);

        if (gap.domain !== undefined && !isNonEmptyString(gap.domain)) errors.push("domain, when present, must be a real, non-empty string.");
        if (gap.concept !== undefined && !isNonEmptyString(gap.concept)) errors.push("concept, when present, must be a real, non-empty string.");
        if (gap.notes !== undefined && !isNonEmptyString(gap.notes)) errors.push("notes, when present, must be a real, non-empty string.");
        if (gap.evidenceSourcesConsidered !== undefined) {
            if (!Array.isArray(gap.evidenceSourcesConsidered)) errors.push("evidenceSourcesConsidered, when present, must be a real array.");
            else if (gap.evidenceSourcesConsidered.some((s) => !LANGUAGE_EVIDENCE_SOURCE_SET.has(s))) errors.push(`evidenceSourcesConsidered, when present, must contain only values from ${LANGUAGE_EVIDENCE_SOURCE.join("/")}.`);
        }
        // A gap reported CLOSED must name at least one real evidence source that closed it — never closed with no basis.
        if (gap.status === "CLOSED" && (!Array.isArray(gap.evidenceSourcesConsidered) || gap.evidenceSourcesConsidered.length === 0)) {
            errors.push('status "CLOSED" requires a real, non-empty evidenceSourcesConsidered array — a gap cannot be reported closed with no evidence basis.');
        }

        return { valid: errors.length === 0, errors };
    }

    function createLanguageGap(fields = {}) {
        const gap = Object.assign({ schemaVersion: LANGUAGE_GAP_SCHEMA_VERSION }, fields);
        const result = validateLanguageGap(gap);
        return result.valid ? { success: true, gap } : { success: false, errors: result.errors };
    }

    /** validateLanguageCoverageEntry(entry) — one dimension, one language, one level. Never an aggregate score. */
    function validateLanguageCoverageEntry(entry) {
        const errors = [];
        if (!isPlainObject(entry)) return { valid: false, errors: ["entry must be a real object."] };
        if (entry.schemaVersion !== LANGUAGE_COVERAGE_SCHEMA_VERSION) errors.push(`schemaVersion must be "${LANGUAGE_COVERAGE_SCHEMA_VERSION}", got ${JSON.stringify(entry.schemaVersion)}.`);
        if (!isNonEmptyString(entry.language)) errors.push("language must be a real, non-empty languageId string.");
        if (!isNonEmptyString(entry.dimension) || !COVERAGE_DIMENSION_SET.has(entry.dimension)) errors.push(`dimension must be one of ${COVERAGE_DIMENSION.join("/")}. Got ${JSON.stringify(entry.dimension)}.`);
        if (!isNonEmptyString(entry.level) || !COVERAGE_LEVEL_SET.has(entry.level)) errors.push(`level must be one of ${COVERAGE_LEVEL.join("/")}. Got ${JSON.stringify(entry.level)}.`);
        if (entry.domain !== undefined && !isNonEmptyString(entry.domain)) errors.push("domain, when present, must be a real, non-empty string.");
        if (entry.notes !== undefined && !isNonEmptyString(entry.notes)) errors.push("notes, when present, must be a real, non-empty string.");
        return { valid: errors.length === 0, errors };
    }

    function createLanguageCoverageEntry(fields = {}) {
        const entry = Object.assign({ schemaVersion: LANGUAGE_COVERAGE_SCHEMA_VERSION }, fields);
        const result = validateLanguageCoverageEntry(entry);
        return result.valid ? { success: true, entry } : { success: false, errors: result.errors };
    }

    /**
     * validateTranslationCandidate(candidate)
     *   Structurally enforces spec §9: status "VERIFIED_LANGUAGE_KNOWLEDGE"
     *   requires a real, non-empty verifiedBy — there is no field
     *   combination that reaches VERIFIED_LANGUAGE_KNOWLEDGE without one.
     */
    function validateTranslationCandidate(candidate) {
        const errors = [];
        if (!isPlainObject(candidate)) return { valid: false, errors: ["candidate must be a real object."] };
        if (candidate.schemaVersion !== TRANSLATION_CANDIDATE_SCHEMA_VERSION) errors.push(`schemaVersion must be "${TRANSLATION_CANDIDATE_SCHEMA_VERSION}", got ${JSON.stringify(candidate.schemaVersion)}.`);
        if (!isNonEmptyString(candidate.sourceLanguage)) errors.push("sourceLanguage must be a real, non-empty languageId string.");
        if (!isNonEmptyString(candidate.targetLanguage)) errors.push("targetLanguage must be a real, non-empty languageId string.");
        if (!isNonEmptyString(candidate.sourceText)) errors.push("sourceText must be a real, non-empty string.");
        if (!isNonEmptyString(candidate.candidateText)) errors.push("candidateText must be a real, non-empty string.");
        if (!isNonEmptyString(candidate.engine)) errors.push("engine must be a real, non-empty string naming the translation engine (e.g. \"NLLB\").");
        if (!isNonEmptyString(candidate.status) || !TRANSLATION_STATUS_SET.has(candidate.status)) errors.push(`status must be one of ${TRANSLATION_STATUS.join("/")}. Got ${JSON.stringify(candidate.status)}.`);
        if (candidate.status === "VERIFIED_LANGUAGE_KNOWLEDGE" && !isNonEmptyString(candidate.verifiedBy)) {
            errors.push('status "VERIFIED_LANGUAGE_KNOWLEDGE" requires a real, non-empty verifiedBy — a translation-engine candidate can never self-promote to verified language knowledge.');
        }
        if (candidate.verifiedBy !== undefined && !isNonEmptyString(candidate.verifiedBy)) errors.push("verifiedBy, when present, must be a real, non-empty string.");
        return { valid: errors.length === 0, errors };
    }

    function createTranslationCandidate(fields = {}) {
        const candidate = Object.assign({ schemaVersion: TRANSLATION_CANDIDATE_SCHEMA_VERSION }, fields);
        const result = validateTranslationCandidate(candidate);
        return result.valid ? { success: true, candidate } : { success: false, errors: result.errors };
    }

    /** isPlanStatus(value) — small guard so callers never compare against a typo'd literal. */
    function isPlanStatus(value) { return isNonEmptyString(value) && PLAN_STATUS_SET.has(value); }

    const CognitiveDecisionContract = Object.freeze({
        PLAN_STATUS, LANGUAGE_GAP_TYPE, GAP_CLOSURE_STATUS, LANGUAGE_EVIDENCE_SOURCE,
        TRANSLATION_STATUS, COVERAGE_DIMENSION, COVERAGE_LEVEL,
        LANGUAGE_GAP_SCHEMA_VERSION, LANGUAGE_COVERAGE_SCHEMA_VERSION, TRANSLATION_CANDIDATE_SCHEMA_VERSION,
        validateLanguageGap, createLanguageGap,
        validateLanguageCoverageEntry, createLanguageCoverageEntry,
        validateTranslationCandidate, createTranslationCandidate,
        isPlanStatus,
        getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.CognitiveDecisionContract = CognitiveDecisionContract;
    window.CozyOS.Modules["cognitive-decision-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-3 EXTENSION (LIF-1) — Cognitive decision states, language-gap taxonomy, language-evidence-source taxonomy, translation-candidate-vs-verified distinction, and multi-dimensional coverage vocabulary. Pure contracts/enums; no gap detection, evidence discovery, translation, or learning implemented. Additive only — SA-1/SA-2 files unchanged."
    });
})();
