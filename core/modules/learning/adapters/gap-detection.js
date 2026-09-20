/**
 * CozyAI — Gap Detection
 * File Reference: core/modules/learning/adapters/gap-detection.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML runtime loop.
 *
 * WHAT THIS IS
 *   The "first-class loop" needs a real trigger: CozyAI must know it
 *   does NOT understand something before it can go looking for
 *   authorized evidence. That trigger already exists, real and
 *   unmodified — window.CozyOS.SemanticAnswerPlanner.planAnswer()
 *   already reports a real, governed LANGUAGE_GAP or
 *   INSUFFICIENT_EVIDENCE cognitiveStatus (SA-3 EXTENSION,
 *   contracts/cognitive-decision-contract.js) whenever a real question
 *   cannot be answered from currently-verified evidence. This file adds
 *   NO new gap-detection logic — it only runs the real planner and
 *   translates its already-real outcome into the shape
 *   adapters/continuous-learning-session.js needs to decide whether
 *   this turn is a learning opportunity.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml";
    const GAP_STATUSES = Object.freeze(["LANGUAGE_GAP", "INSUFFICIENT_EVIDENCE", "UNKNOWN"]);
    if (window.CozyOS.Modules["gap-detection"]) return;

    /**
     * detectGap({ text, conversationState, requestedLanguage, actorId })
     *   Runs the real planAnswer() once and reports whether its real
     *   outcome represents a genuine knowledge/language gap. Never
     *   itself decides confidence/language/entity — every field below
     *   is read directly off the real planner result.
     */
    function detectGap({ text, conversationState = null, requestedLanguage = null, entityHint = null, actorId = null } = {}) {
        const planner = window.CozyOS.SemanticAnswerPlanner;
        if (!planner || typeof planner.planAnswer !== "function") return { success: false, reason: "SemanticAnswerPlanner is not loaded." };

        // CML-6 addition — real, additive, optional passthrough of the
        // planner's own real, pre-existing entityHint parameter (same
        // established convention as cozy-answer-engine.js's entityHint /
        // cozy-living-assistant.js's contextualEntityName — see
        // semantic-answer-planner.js's own planAnswer() header). Adds no
        // new entity-resolution logic of its own; omitting it reproduces
        // this file's pre-CML-6 behavior exactly.
        const result = planner.planAnswer({ text, conversationState, requestedLanguage, entityHint, actorId });
        const cognitiveStatus = (result.diagnostics && result.diagnostics.cognitiveStatus) || null;
        const gapDetected = GAP_STATUSES.includes(cognitiveStatus) && !result.success;

        return {
            success: true,
            gapDetected,
            cognitiveStatus,
            goal: result.goal || (result.plan && result.plan.goal) || null,
            entity: result.entity || (result.plan && result.plan.entity && result.plan.entity.value) || null,
            language: result.language || (result.plan && result.plan.language) || null,
            languageGap: result.languageGap || null,
            plannerResult: result,
        };
    }

    const GapDetection = Object.freeze({ GAP_STATUSES, detectGap, getVersion: () => MODULE_VERSION });
    window.CozyOS.GapDetection = GapDetection;
    window.CozyOS.Modules["gap-detection"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — real gap-detection trigger, composing the existing, unmodified SemanticAnswerPlanner.planAnswer(). Adds no new understanding/matching logic of its own. Not <script>-included by any page."
    });
})();
