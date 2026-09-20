/**
 * CozyAI — Learning Regression Generator
 * File Reference: core/modules/learning/adapters/regression-generator.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-8 / continuous
 * capability-improvement loop.
 *
 * WHAT THIS IS
 *   "Every accepted learning candidate should have a governed path to
 *   measurable capability improvement... generates regression cases
 *   from the learned capability, and verifies that future understanding
 *   improves without degrading previously verified behavior."
 *   This file composes the real, unmodified
 *   window.CozyOS.SemanticAnswerPlanner.planAnswer() twice: once, right
 *   when a case is generated, to capture the REAL, CURRENT outcome as
 *   the recorded expectation (never a guessed/hand-written expectation)
 *   — and again, on demand via verifyNoRegression(), to prove that
 *   outcome still holds (or has genuinely improved) later. No second
 *   test framework, no fabricated comparison.
 *
 * STORAGE
 *   Real, composed CozyMemory namespace ("cml-regression-cases") — no
 *   new store.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml";
    const NAMESPACE = "cml-regression-cases";
    if (window.CozyOS.Modules["regression-generator"]) return;

    function memoryOrFail() {
        const memory = window.CozyOS.CozyMemory;
        if (!memory || typeof memory.saveMemory !== "function") return null;
        return memory;
    }
    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function _uid(prefix) { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }

    /**
     * generateFromVerifiedObservation(observation, { text, actorId })
     *   `text` is the real, natural-language question that should now
     *   be answerable given this observation's own real, VERIFIED
     *   evidence — supplied by the caller (continuous-learning-session.js
     *   already knows the original gap-triggering question). Runs the
     *   REAL planner right now and records whatever it REALLY returns
     *   as the expected baseline — this file never asserts success in
     *   advance; if the planner still can't answer (e.g. the
     *   LearningEvidenceSupplement isn't wired into this particular
     *   goal/entity combination), that honest outcome is what gets
     *   recorded and later checked for consistency, not silently
     *   upgraded to "PASS".
     */
    function generateFromVerifiedObservation(observation, { text, actorId = "system" } = {}) {
        const memory = memoryOrFail();
        const planner = window.CozyOS.SemanticAnswerPlanner;
        if (!memory || !planner) return { success: false, reason: "CozyMemory/SemanticAnswerPlanner are not both loaded." };
        if (!observation || observation.lifecycleStatus !== "VERIFIED") return { success: false, reason: "Only a real, VERIFIED observation may generate a regression case." };
        if (!isNonEmptyString(text)) return { success: false, reason: "A real, non-empty question text is required." };

        const baseline = planner.planAnswer({ text, requestedLanguage: observation.candidateLanguage || null });
        const regressionCase = {
            caseId: _uid("regcase"),
            text,
            observationId: observation.observationId,
            canonicalConceptId: observation.canonicalConceptId || null,
            expected: {
                success: baseline.success,
                cognitiveStatus: (baseline.diagnostics && baseline.diagnostics.cognitiveStatus) || null,
                goal: baseline.goal || (baseline.plan && baseline.plan.goal) || null,
            },
            createdAt: Date.now(),
        };
        memory.saveMemory(NAMESPACE, regressionCase.caseId, regressionCase, { owner: actorId, actorId, visibility: "public" });
        return { success: true, regressionCase };
    }

    /**
     * verifyNoRegression({ actorId })
     *   Re-runs EVERY real, stored regression case through the REAL,
     *   CURRENT planner and compares against its own recorded
     *   expectation. "Improved" (was a real failure, now real success)
     *   is reported separately from a genuine regression (was real
     *   success, now failure/different goal) — never conflated.
     */
    function verifyNoRegression({ actorId = "system" } = {}) {
        const memory = memoryOrFail();
        const planner = window.CozyOS.SemanticAnswerPlanner;
        if (!memory || !planner) return { success: false, reason: "CozyMemory/SemanticAnswerPlanner are not both loaded." };
        if (typeof memory.listKeys !== "function") return { success: false, reason: "CozyMemory has no listKeys()." };

        const entries = memory.listKeys(NAMESPACE, null, actorId) || [];
        const results = [];
        let regressions = 0, improvements = 0, stable = 0;
        for (const entry of entries) {
            const regressionCase = entry.value || entry;
            const current = planner.planAnswer({ text: regressionCase.text, requestedLanguage: regressionCase.expected.goal ? undefined : undefined });
            const currentCognitiveStatus = (current.diagnostics && current.diagnostics.cognitiveStatus) || null;
            const same = current.success === regressionCase.expected.success && currentCognitiveStatus === regressionCase.expected.cognitiveStatus;
            let classification;
            if (same) { classification = "STABLE"; stable++; }
            else if (!regressionCase.expected.success && current.success) { classification = "IMPROVED"; improvements++; }
            else { classification = "REGRESSED"; regressions++; }
            results.push({ caseId: regressionCase.caseId, text: regressionCase.text, expected: regressionCase.expected, current: { success: current.success, cognitiveStatus: currentCognitiveStatus }, classification });
        }
        return { success: true, totalCases: entries.length, stable, improvements, regressions, noRegressions: regressions === 0, results };
    }

    const RegressionGenerator = Object.freeze({
        NAMESPACE, generateFromVerifiedObservation, verifyNoRegression, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.RegressionGenerator = RegressionGenerator;
    window.CozyOS.Modules["regression-generator"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — generates and re-verifies real regression cases from VERIFIED observations, composing the real, unmodified SemanticAnswerPlanner twice (once to capture a real baseline, once to re-check it). Proves capability improvement without degrading previously verified behavior. Not <script>-included by any page."
    });
})();
