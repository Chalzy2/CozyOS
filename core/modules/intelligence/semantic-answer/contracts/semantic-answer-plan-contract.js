/**
 * CozyAI — Semantic Answer Plan Contract (SA-1)
 * File Reference: core/modules/intelligence/semantic-answer/contracts/semantic-answer-plan-contract.js
 *
 * WHAT THIS IS
 *   Contract A of the Semantic Answer Construction & Language
 *   Realization architecture (see SEMANTIC-ANSWER-CONSTRUCTION-
 *   IMPLEMENTATION-MAP.md at repo root for the full audit this is
 *   built on). Answers WHAT CozyAI should say — never HOW it should be
 *   worded. A SemanticAnswerPlan is language-neutral: the same plan
 *   (goal + entity + claims) can be realized into different natural
 *   sentences per target language by the realizer (SA-4).
 *
 * SA-1 SCOPE — CONTRACTS AND FIXTURES ONLY
 *   This file defines and validates the shape only. It does NOT decide
 *   a real question's goal/entity/claims (that is SA-3's job, wiring
 *   the already-existing, real window.CozyOS.SemanticIntentEngine —
 *   core/living/cozy-ai-semantic-intent.js — into this contract). It
 *   is not <script>-included by any page and changes no production
 *   behavior. It does not call CozyAnswerEngine, CozyAI.getContext(),
 *   CozyKnowledge, CozyMemory, SemanticIntentEngine, or any other
 *   existing authority.
 *
 * GOAL TAXONOMY — two real, disclosed sources, never invented
 *   REQUIRED_INFORMATION_GOALS: the exact concepts the Semantic Answer
 *   Construction spec requires to exist (HUMAN_BENEFIT, CAPABILITY,
 *   IMPORTANCE, VALUE, PRACTICAL_WORK_CONTRIBUTION, DIFFERENTIATION,
 *   BENEFITS, DEFINITION, COMPARISON, LIST, HOW_TO, CLARIFICATION,
 *   UNKNOWN).
 *   EXISTING_SEMANTIC_GOALS: the real, already-implemented GOAL_MAP
 *   values from window.CozyOS.SemanticIntentEngine (core/living/
 *   cozy-ai-semantic-intent.js:91-111, plus its dynamic goalOverride
 *   values computed in analyze()) — copied here verbatim so this
 *   contract's GOAL enum is the real union the spec asks for ("Goals
 *   must include the existing semantic goals and the required
 *   information-goal concepts"), not a narrower reinvention. SA-3
 *   decides the real mapping from a SemanticIntentEngine result onto
 *   one of these goals — this file only defines the closed set.
 *
 * CRITICAL, PER EXPLICIT PROJECT DIRECTION (do not lose this)
 *   This enum existing does NOT mean a goal like HUMAN_BENEFIT is
 *   satisfied by selecting a pre-written `*Sw` string out of
 *   APPLICATION_HUMAN_PURPOSE_DATA. That would still be stored-answer
 *   retrieval, just with two languages, which is explicitly the
 *   destination this architecture must NOT collapse into. A goal
 *   describes WHAT must be communicated; VerifiedEvidence (Contract B)
 *   carries the underlying MEANING/facts; LanguageRealizationRequest
 *   (Contract C) is what actually constructs the target-language
 *   sentence FROM that meaning (SA-4) — existing `*Sw` strings may
 *   serve as verified linguistic material/fixtures for that
 *   construction, never as the final response mechanism itself.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const SCHEMA_VERSION = "cozy.semantic-answer-plan.v1";
    const MODULE_VERSION = "1.0.0-sa1";
    if (window.CozyOS.Modules["semantic-answer-plan-contract"]) return;

    // Required information-goal concepts (spec §3.A, verbatim).
    const REQUIRED_INFORMATION_GOALS = Object.freeze([
        "HUMAN_BENEFIT", "BENEFITS", "CAPABILITY", "IMPORTANCE", "VALUE",
        "PRACTICAL_WORK_CONTRIBUTION", "DIFFERENTIATION", "DEFINITION",
        "COMPARISON", "LIST", "HOW_TO", "CLARIFICATION", "UNKNOWN",
    ]);

    // Existing, real SemanticIntentEngine GOAL_MAP values (core/living/
    // cozy-ai-semantic-intent.js:91-111) + its dynamic goalOverride
    // values (same file: "UNDERSTAND_USEFULNESS_BEFORE_PURCHASE",
    // "MAKE_PURCHASE_DECISION", "UNDERSTAND_APPLICATION") — copied
    // verbatim, not re-derived, so a real plan built from a real
    // SemanticIntentEngine result always has a matching GOAL here.
    const EXISTING_SEMANTIC_GOALS = Object.freeze([
        "PURCHASE_PRODUCT_OR_SERVICE", "UNDERSTAND_USEFULNESS", "UNDERSTAND_CAPABILITIES",
        "UNDERSTAND_ENTITY", "START_USING_APPLICATION", "UNDERSTAND_COST",
        "MAKE_COMPARISON_DECISION", "CHECK_ASSISTANT_CAPABILITY", "CREATE_REMINDER",
        "CANCEL_EXISTING_ITEM", "MODIFY_EXISTING_ITEM", "RESOLVE_PROBLEM",
        "GET_RECOMMENDATION", "UNDERSTAND_CONCEPT", "TRANSLATE_TEXT",
        "FIND_INFORMATION", "DECLINE_ACTION",
        "UNDERSTAND_USEFULNESS_BEFORE_PURCHASE", "MAKE_PURCHASE_DECISION",
        "UNDERSTAND_APPLICATION",
    ]);

    const GOAL = Object.freeze([...REQUIRED_INFORMATION_GOALS, ...EXISTING_SEMANTIC_GOALS]);
    const GOAL_SET = new Set(GOAL);

    // answerMode — HOW the plan's content should be structured, distinct
    // from GOAL (WHAT topic/information need). Real, disclosed, minimal
    // set; extended in a later phase only if a genuine new structural
    // shape is needed — never grown speculatively.
    const ANSWER_MODE = Object.freeze([
        "DIRECT_ANSWER", "EXPLANATION", "COMPARISON", "LIST",
        "HOW_TO_STEPS", "CLARIFICATION_REQUEST", "REFUSAL",
    ]);
    const ANSWER_MODE_SET = new Set(ANSWER_MODE);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    /**
     * validate(plan)
     *   Real, structural validation only — checks presence/type/enum
     *   membership of every required field. Does NOT check that claims
     *   are actually grounded in real VerifiedEvidence records (this
     *   file has no access to them) — only that each claim carries a
     *   real evidenceIds array shape, per the spec's "claims reference
     *   evidence IDs; claims themselves are not permission to invent
     *   facts." Real cross-referencing against genuine evidence ids is
     *   SA-5's job (Response Validation Result's own `evidence` check).
     */
    function validate(plan) {
        const errors = [];
        if (!isPlainObject(plan)) return { valid: false, errors: ["plan must be a real object."] };

        if (plan.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}", got ${JSON.stringify(plan.schemaVersion)}.`);
        if (!isNonEmptyString(plan.goal) || !GOAL_SET.has(plan.goal)) errors.push(`goal must be a real, recognized goal. Got ${JSON.stringify(plan.goal)}.`);
        if (!isNonEmptyString(plan.answerMode) || !ANSWER_MODE_SET.has(plan.answerMode)) errors.push(`answerMode must be a real, recognized mode. Got ${JSON.stringify(plan.answerMode)}.`);

        if (!isPlainObject(plan.entity)) {
            errors.push("entity must be a real object ({type, value, canonicalValue?}).");
        } else {
            if (!isNonEmptyString(plan.entity.type)) errors.push("entity.type must be a real, non-empty string.");
            if (!isNonEmptyString(plan.entity.value)) errors.push("entity.value must be a real, non-empty string.");
            if (plan.entity.canonicalValue !== undefined && !isNonEmptyString(plan.entity.canonicalValue)) errors.push("entity.canonicalValue, when present, must be a real, non-empty string.");
        }

        if (!Array.isArray(plan.claims)) {
            errors.push("claims must be a real array.");
        } else {
            plan.claims.forEach((claim, i) => {
                if (!isPlainObject(claim)) { errors.push(`claims[${i}] must be a real object.`); return; }
                if (!isNonEmptyString(claim.claimId)) errors.push(`claims[${i}].claimId must be a real, non-empty string.`);
                if (!isNonEmptyString(claim.text)) errors.push(`claims[${i}].text must be a real, non-empty string.`);
                if (!Array.isArray(claim.evidenceIds)) errors.push(`claims[${i}].evidenceIds must be a real array.`);
                else if (claim.evidenceIds.some((id) => !isNonEmptyString(id))) errors.push(`claims[${i}].evidenceIds must contain only real, non-empty evidence id strings.`);
            });
            if (plan.claims.length === 0 && plan.goal !== "CLARIFICATION" && plan.goal !== "UNKNOWN") {
                errors.push(`claims must be non-empty for goal "${plan.goal}" — only CLARIFICATION/UNKNOWN plans may have zero claims.`);
            }
        }

        if (!isNonEmptyString(plan.language)) errors.push('language must be a real, non-empty languageId string (e.g. "sw", "en") — see LanguageRealizationRequestContract for the fuller language descriptor object used at realization time.');

        // Optional fields — validated only if present, never required.
        if (plan.audience !== undefined && !isNonEmptyString(plan.audience)) errors.push("audience, when present, must be a real, non-empty string.");
        if (plan.detailLevel !== undefined && !isNonEmptyString(plan.detailLevel)) errors.push("detailLevel, when present, must be a real, non-empty string.");
        if (plan.tone !== undefined && !isNonEmptyString(plan.tone)) errors.push("tone, when present, must be a real, non-empty string.");
        if (plan.conversationContext !== undefined && !isPlainObject(plan.conversationContext)) errors.push("conversationContext, when present, must be a real object.");

        return { valid: errors.length === 0, errors };
    }

    /**
     * create(fields)
     *   Convenience constructor — fills schemaVersion, validates the
     *   result, and returns {success, plan?, errors?}. Never silently
     *   returns an invalid plan.
     */
    function create(fields = {}) {
        const plan = Object.assign({ schemaVersion: SCHEMA_VERSION }, fields);
        const result = validate(plan);
        return result.valid ? { success: true, plan } : { success: false, errors: result.errors };
    }

    const SemanticAnswerPlanContract = Object.freeze({
        SCHEMA_VERSION, GOAL, REQUIRED_INFORMATION_GOALS, EXISTING_SEMANTIC_GOALS,
        ANSWER_MODE, validate, create, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.SemanticAnswerPlanContract = SemanticAnswerPlanContract;
    window.CozyOS.Modules["semantic-answer-plan-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-1 — Semantic Answer Plan contract/validator. Defines WHAT CozyAI should say (goal+entity+claims+language), never wording. No production behavior change; not loaded by any page yet."
    });
})();
