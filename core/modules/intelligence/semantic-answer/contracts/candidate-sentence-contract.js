/**
 * CozyAI — Candidate Sentence Contract (SA-1)
 * File Reference: core/modules/intelligence/semantic-answer/contracts/candidate-sentence-contract.js
 *
 * WHAT THIS IS
 *   Contract D. The first generated wording is a CANDIDATE, never
 *   automatically final — this record is what the realizer (SA-4)
 *   produces and what the validator (SA-5) inspects before anything is
 *   ever shown to a user or sent to TTS. SA-1 defines and validates the
 *   shape only; it builds no realizer or validator.
 *
 * GENERATION MODE — real, disclosed (spec §3.D)
 *   COMPOSED        — built by joining/templating already-VERIFIED
 *                      evidence text (the realistic SA-4 starting point
 *                      for most goals).
 *   MODEL_GENERATED — produced by a generative model constrained to the
 *                      supplied evidence (a later, SA-8-scope
 *                      capability — not built in SA-1/SA-4's initial
 *                      cut).
 *   RULE_ASSISTED   — COMPOSED plus real, disclosed grammatical rules
 *                      (agreement, word order) applied for the target
 *                      language.
 *   REPAIRED        — produced by SA-6's repair loop from a prior
 *                      candidate + validator instructions, never from a
 *                      fresh, unrelated generation pass.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const SCHEMA_VERSION = "cozy.candidate-sentence.v1";
    const MODULE_VERSION = "1.0.0-sa1";
    if (window.CozyOS.Modules["candidate-sentence-contract"]) return;

    const GENERATION_MODE = Object.freeze(["COMPOSED", "MODEL_GENERATED", "RULE_ASSISTED", "REPAIRED"]);
    const GENERATION_MODE_SET = new Set(GENERATION_MODE);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
    function isPositiveInteger(v) { return Number.isInteger(v) && v > 0; }

    function validate(candidate) {
        const errors = [];
        if (!isPlainObject(candidate)) return { valid: false, errors: ["candidate must be a real object."] };

        if (candidate.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}", got ${JSON.stringify(candidate.schemaVersion)}.`);
        if (!isNonEmptyString(candidate.text)) errors.push("text must be a real, non-empty string.");
        if (!isNonEmptyString(candidate.language)) errors.push('language must be a real, non-empty languageId string (e.g. "sw", "en").');
        if (!isNonEmptyString(candidate.sourcePlanId)) errors.push("sourcePlanId must be a real, non-empty string referencing the SemanticAnswerPlan this candidate was realized from.");

        if (!Array.isArray(candidate.evidenceIds)) {
            errors.push("evidenceIds must be a real array.");
        } else if (candidate.evidenceIds.some((id) => !isNonEmptyString(id))) {
            errors.push("evidenceIds must contain only real, non-empty evidence id strings.");
        }

        if (!isPlainObject(candidate.generation)) {
            errors.push("generation must be a real object ({mode, provider?, attempt?}).");
        } else {
            if (!isNonEmptyString(candidate.generation.mode) || !GENERATION_MODE_SET.has(candidate.generation.mode)) errors.push(`generation.mode must be one of ${GENERATION_MODE.join("/")}. Got ${JSON.stringify(candidate.generation.mode)}.`);
            if (candidate.generation.provider !== undefined && !isNonEmptyString(candidate.generation.provider)) errors.push("generation.provider, when present, must be a real, non-empty string.");
            if (candidate.generation.attempt !== undefined && !isPositiveInteger(candidate.generation.attempt)) errors.push("generation.attempt, when present, must be a real positive integer (1 for the first attempt).");
        }

        return { valid: errors.length === 0, errors };
    }

    function create(fields = {}) {
        const candidate = Object.assign({ schemaVersion: SCHEMA_VERSION }, fields);
        const result = validate(candidate);
        return result.valid ? { success: true, candidate } : { success: false, errors: result.errors };
    }

    const CandidateSentenceContract = Object.freeze({
        SCHEMA_VERSION, GENERATION_MODE, validate, create, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.CandidateSentenceContract = CandidateSentenceContract;
    window.CozyOS.Modules["candidate-sentence-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-1 — Candidate Sentence contract/validator. Defines the shape of a NOT-YET-FINAL generated wording, tied back to its real source plan and evidence ids. No production behavior change; builds no realizer (see SA-4)."
    });
})();
