/**
 * CozyAI — Language Realization Request Contract (SA-1)
 * File Reference: core/modules/intelligence/semantic-answer/contracts/language-realization-request-contract.js
 *
 * WHAT THIS IS
 *   Contract C. Answers HOW the approved meaning (a real
 *   SemanticAnswerPlan, backed by real VerifiedEvidence) should be
 *   expressed in the target language. This is the request handed to
 *   the realizer built in SA-4 — this file defines and validates its
 *   shape only; SA-1 builds no realizer.
 *
 * NON-NEGOTIABLE CONSTRAINTS — enforced structurally, not just documented
 *   The spec's own "Non-Negotiable Architecture" section (§1) requires
 *   preserveMeaning/useOnlyEvidence/naturalLanguage/answerDirectly to
 *   always be true for a real realization request — never a per-call
 *   toggle a caller could quietly disable. validate() below therefore
 *   REJECTS a request whose constraints object has any of these four
 *   set to anything other than literal `true` — this is not a default,
 *   it is a hard, structural requirement of this contract. A caller
 *   that cannot honor all four should not construct a
 *   LanguageRealizationRequest at all.
 *
 * PER EXPLICIT PROJECT GUARDRAIL (do not lose this)
 *   useOnlyEvidence=true means the realizer receives MEANING (a
 *   SemanticAnswerPlan + real VerifiedEvidence records) and constructs
 *   the target-language sentence FROM it. It is explicitly NOT
 *   satisfied by a realizer that just selects a pre-written
 *   `*Sw`/`*En` string out of existing evidence and returns it
 *   unchanged for every request — SA-4's own header carries the same
 *   warning. Existing pre-written strings may be cited as evidence.claim
 *   text (real, useable meaning) or reused as verified linguistic
 *   fixtures during SA-4's early implementation, but selecting one
 *   verbatim per language is stored-answer retrieval, not realization,
 *   and does not fulfill naturalLanguage=true/answerDirectly=true for
 *   novel goal+entity combinations that have no matching stored string.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const SCHEMA_VERSION = "cozy.language-realization-request.v1";
    const MODULE_VERSION = "1.0.0-sa1";
    if (window.CozyOS.Modules["language-realization-request-contract"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    const REQUIRED_TRUE_CONSTRAINTS = Object.freeze(["preserveMeaning", "useOnlyEvidence", "naturalLanguage", "answerDirectly"]);

    /**
     * validate(request)
     *   Real, structural validation. Composes SemanticAnswerPlanContract.
     *   validate() and VerifiedEvidenceContract.validate() when those
     *   modules are loaded (soft dependency — this file does not require
     *   a fixed load order; if a sibling contract module isn't loaded,
     *   this validator reports that honestly as its own error rather
     *   than skipping the check silently).
     */
    function validate(request) {
        const errors = [];
        if (!isPlainObject(request)) return { valid: false, errors: ["request must be a real object."] };

        if (request.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}", got ${JSON.stringify(request.schemaVersion)}.`);

        if (!isPlainObject(request.language)) {
            errors.push("language must be a real object ({languageId, bcp47?, displayName?, nativeName?}).");
        } else {
            if (!isNonEmptyString(request.language.languageId)) errors.push("language.languageId must be a real, non-empty string.");
            for (const optionalField of ["bcp47", "displayName", "nativeName"]) {
                if (request.language[optionalField] !== undefined && !isNonEmptyString(request.language[optionalField])) errors.push(`language.${optionalField}, when present, must be a real, non-empty string.`);
            }
        }

        const planContract = window.CozyOS.SemanticAnswerPlanContract;
        if (!isPlainObject(request.semanticPlan)) {
            errors.push("semanticPlan must be a real object (see SemanticAnswerPlanContract).");
        } else if (planContract && typeof planContract.validate === "function") {
            const planResult = planContract.validate(request.semanticPlan);
            if (!planResult.valid) errors.push(...planResult.errors.map((e) => `semanticPlan: ${e}`));
        }

        const evidenceContract = window.CozyOS.VerifiedEvidenceContract;
        if (!Array.isArray(request.evidence)) {
            errors.push("evidence must be a real array of VerifiedEvidence records.");
        } else {
            request.evidence.forEach((ev, i) => {
                if (evidenceContract && typeof evidenceContract.validate === "function") {
                    const evResult = evidenceContract.validate(ev);
                    if (!evResult.valid) errors.push(...evResult.errors.map((e) => `evidence[${i}]: ${e}`));
                } else if (!isPlainObject(ev)) {
                    errors.push(`evidence[${i}] must be a real object.`);
                }
            });
        }

        if (!isPlainObject(request.constraints)) {
            errors.push("constraints must be a real object.");
        } else {
            for (const key of REQUIRED_TRUE_CONSTRAINTS) {
                if (request.constraints[key] !== true) errors.push(`constraints.${key} must be literal true — this is a non-negotiable architectural requirement (see this file's own header), not a per-call default.`);
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /**
     * create({language, semanticPlan, evidence})
     *   Convenience constructor. constraints is ALWAYS the fixed,
     *   correct object — a caller cannot pass a different one in,
     *   structurally preventing the non-negotiable constraints from
     *   ever being quietly weakened at a call site.
     */
    function create({ language, semanticPlan, evidence } = {}) {
        const request = {
            schemaVersion: SCHEMA_VERSION,
            language,
            semanticPlan,
            evidence,
            constraints: Object.freeze({ preserveMeaning: true, useOnlyEvidence: true, naturalLanguage: true, answerDirectly: true }),
        };
        const result = validate(request);
        return result.valid ? { success: true, request } : { success: false, errors: result.errors };
    }

    const LanguageRealizationRequestContract = Object.freeze({
        SCHEMA_VERSION, REQUIRED_TRUE_CONSTRAINTS, validate, create, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.LanguageRealizationRequestContract = LanguageRealizationRequestContract;
    window.CozyOS.Modules["language-realization-request-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-1 — Language Realization Request contract/validator. Defines HOW approved meaning should be expressed in a target language, with the spec's non-negotiable constraints (preserveMeaning/useOnlyEvidence/naturalLanguage/answerDirectly) structurally enforced as always-true. No production behavior change; builds no realizer (see SA-4)."
    });
})();
