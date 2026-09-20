/**
 * CozyAI — Learning Priority
 * File Reference: core/modules/learning/adapters/learning-priority.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-6.
 *
 * WHAT THIS IS
 *   "Not every observation deserves equal processing... an internal
 *   technical processing priority [never] a political or subjective
 *   ranking." A pure, deterministic, disclosed-weights function — no
 *   I/O, no persistence, no side effects. Used only to order background
 *   processing inside continuous-learning-fabric.js; NEVER consulted by
 *   ObservationLifecycle/CozyLanguageAcquisitionPipeline/CozyLearn's own
 *   real promotion decisions, which remain entirely evidence-governed as
 *   before (see those files' own headers) — priority never promotes
 *   anything on its own.
 *
 * WEIGHTS (disclosed, not tuned against any private data)
 *   repeatedCorrection   40  — "repeated correction causing frequent
 *                              user misunderstanding" is the phase
 *                              brief's own explicit HIGH example.
 *   contradiction        25  — an open conflict is worth resolving.
 *   independentEvidence   5 per independent contributor (capped at 25)
 *   contextCoverage       3 per distinct context (capped at 15)
 *   languageGap           15 — a known concept missing a language.
 *   unknownWordRepeated   10 — the phase brief's own MEDIUM example.
 *   semanticImportance   0-10 (caller-supplied, e.g. query frequency)
 *   verificationQuality  0-10 (caller-supplied)
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml6";
    if (window.CozyOS.Modules["learning-priority"]) return;

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

    /**
     * computePriority({ isCorrectionRepeated, isUnknownWordRepeated,
     *   isContradiction, independentContributors, contexts, languageGap,
     *   semanticImportance, verificationQuality })
     *   Returns {score, tier} where tier is HIGH (score >= 40), MEDIUM
     *   (score >= 15), or LOW (otherwise) — thresholds chosen so the
     *   brief's own two worked examples land exactly where it says:
     *   repeated correction => HIGH; repeated unknown word alone => MEDIUM;
     *   one isolated uncertain observation => LOW.
     */
    function computePriority({
        isCorrectionRepeated = false, isUnknownWordRepeated = false, isContradiction = false,
        independentContributors = 0, contexts = 0, languageGap = false,
        semanticImportance = 0, verificationQuality = 0,
    } = {}) {
        let score = 0;
        if (isCorrectionRepeated) score += 40;
        if (isContradiction) score += 25;
        if (languageGap) score += 15;
        if (isUnknownWordRepeated) score += 10;
        score += clamp(independentContributors, 0, 5) * 5;
        score += clamp(contexts, 0, 5) * 3;
        score += clamp(semanticImportance, 0, 10);
        score += clamp(verificationQuality, 0, 10);

        const tier = score >= 40 ? "HIGH" : score >= 15 ? "MEDIUM" : "LOW";
        return { score, tier };
    }

    const LearningPriority = Object.freeze({ computePriority, getVersion: () => MODULE_VERSION });
    window.CozyOS.LearningPriority = LearningPriority;
    window.CozyOS.Modules["learning-priority"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — pure, deterministic, disclosed-weights technical processing priority (HIGH/MEDIUM/LOW). Never used to auto-promote knowledge; consulted only for background-processing order. No I/O. Not <script>-included by any page."
    });
})();
