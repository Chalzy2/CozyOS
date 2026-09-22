'use strict';

/**
 * core/modules/learning/language-fluency-diagnostic.js
 * PHASE 5 EXTENSION — Universal Language Fluency: Self-Audit, Gap
 * Discovery, Learning, Verification & Automatic Improvement.
 *
 * WHAT THIS IS
 *   The composed answer to "Why can I not yet speak this language
 *   fluently?" (the extension's own Section 2/30 requirement). This
 *   file invents NO new AI, NO new language engine, NO new learning
 *   engine, and NO new storage. It is a pure, read-only composer over
 *   real, already-existing authorities, confirmed present before this
 *   file was written:
 *
 *     - window.CozyOS.CozyLanguagePacks.getLanguageCapabilities(id)
 *       (Phase 4 + this Phase 5 extension's own additive dimensions) —
 *       the per-language multidimensional capability model.
 *     - window.CozyOS.LanguageGapRegistry (CML-6) — concept-level
 *       LANGUAGE_GAP tracking, backed by real VERIFIED-observation
 *       coverage checks.
 *     - window.CozyOS.ActiveLearning (CML-6) — the real, governed
 *       contributor clarification-question lifecycle.
 *
 *   All three were real, tested, and CERTIFIED (CML-6's own commit
 *   gate) before this Phase 5 pass, but — per the Phase 5 architecture
 *   audit's own finding — none of them were reachable from any live
 *   page or from each other: CozyLanguagePacks' capability model had no
 *   composed view of LanguageGapRegistry's concept-level gaps or
 *   ActiveLearning's pending contributor questions. This file is the
 *   Phase 5 REWIRING: one real, additive composition, not a new engine.
 *
 * HONESTY DISCIPLINE
 *   Every field on the returned diagnostic traces to a real, checkable
 *   value from one of the three composed authorities above. A missing
 *   authority degrades honestly (an empty list / an UNKNOWN dimension
 *   state with a real, disclosed reason) — this file never fabricates
 *   a fluency claim. "Overall" is derived, never a single fabricated
 *   percentage (per the extension's own Section 21 prohibition on
 *   collapsing multidimensional capability into one number).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-phase5-language-fluency";
    if (window.CozyOS.Modules["language-fluency-diagnostic"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function normalize(v) { return isNonEmptyString(v) ? v.trim().toLowerCase() : null; }

    // Dimensions a real, human-fluent-feeling conversation needs but
    // this repository does not yet honestly claim a real state for on
    // EVERY language — surfaced explicitly (never silently omitted) so
    // a diagnostic can say "this is the actual missing capability."
    const STRONG_STATES = Object.freeze(["VERIFIED", "AVAILABLE"]);
    const WEAK_STATES = Object.freeze(["PARTIAL", "TESTING", "VALIDATING", "DISCOVERED"]);

    /**
     * getLanguageFluencyDiagnostic(languageId, { actorId })
     *   Real, composed, read-only. Returns null only when the language
     *   is not registered at all in CozyLanguagePacks (the one
     *   authoritative registry — never a second one here).
     */
    function getLanguageFluencyDiagnostic(languageId, { actorId = "system" } = {}) {
        const id = normalize(languageId);
        if (!id) return null;

        const packs = window.CozyOS.CozyLanguagePacks;
        if (!packs || typeof packs.getLanguageCapabilities !== "function") {
            return { languageId: id, available: false, reason: "CozyLanguagePacks is not loaded." };
        }
        const capabilities = packs.getLanguageCapabilities(id);
        if (!capabilities) return null; // real "never heard of this language" — CozyLanguagePacks' own honest null

        const dimensions = capabilities.dimensions || {};
        const dimensionEntries = Object.entries(dimensions);
        const strong = dimensionEntries.filter(([, d]) => d && STRONG_STATES.includes(d.state));
        const weak = dimensionEntries.filter(([, d]) => d && WEAK_STATES.includes(d.state));
        const unknownOrGap = dimensionEntries.filter(([, d]) => d && (d.state === "UNKNOWN" || d.state === "GAP"));

        // Concept-level gaps (CML-6 LanguageGapRegistry) — real, open,
        // evidence-required records for THIS language specifically.
        const gapRegistry = window.CozyOS.LanguageGapRegistry;
        const conceptGaps = (gapRegistry && typeof gapRegistry.listOpenGaps === "function")
            ? gapRegistry.listOpenGaps({ actorId }).filter((g) => g && g.language === id)
            : [];

        // Pending contributor questions (CML-6 ActiveLearning) — real,
        // governed, already-asked-but-unanswered clarifications for
        // this language, so this diagnostic never suggests asking a
        // question that is already pending.
        const activeLearning = window.CozyOS.ActiveLearning;
        const pendingQuestions = (activeLearning && typeof activeLearning.listPendingQuestions === "function")
            ? activeLearning.listPendingQuestions({ language: id, actorId })
            : [];

        // Overall — derived, multidimensional (never one fabricated
        // percentage, per the extension's own Section 21). AVAILABLE
        // only when the real conversational gate (naturalLanguageRealization
        // dimension, sourced from CozyLanguageRegistry.isAvailable())
        // is itself VERIFIED; NOT_YET_AVAILABLE otherwise, honestly.
        const conversational = dimensions.naturalLanguageRealization;
        const overall = (conversational && conversational.state === "VERIFIED") ? "AVAILABLE" : "NOT_YET_AVAILABLE";

        // "What is missing" — the extension's own Section 2 core
        // requirement: identify the ACTUAL gap, never just "not
        // supported." Each entry names the real dimension and its own
        // real, disclosed reason (verbatim from getLanguageCapabilities()
        // — never re-derived or guessed here).
        const whatIsMissing = unknownOrGap.map(([dimension, d]) => ({ dimension, state: d.state, reason: d.note || null }));
        const whatIsPartial = weak.map(([dimension, d]) => ({ dimension, state: d.state, reason: d.note || null }));
        const whatIsVerified = strong.map(([dimension]) => dimension);

        return {
            languageId: id,
            overall,
            capabilities,
            whatIsVerified,
            whatIsPartial,
            whatIsMissing,
            openConceptGaps: conceptGaps,
            pendingContributorQuestions: pendingQuestions,
            summary: overall === "AVAILABLE"
                ? `${id} is conversationally AVAILABLE; ${whatIsMissing.length} dimension(s) beyond core conversation remain UNKNOWN/GAP.`
                : `${id} is NOT yet conversationally AVAILABLE (${conversational ? conversational.state : "UNKNOWN"}); ${whatIsMissing.length} dimension(s) are UNKNOWN/GAP, ${conceptGaps.length} open concept-level gap(s), ${pendingQuestions.length} pending contributor question(s).`,
        };
    }

    const LanguageFluencyDiagnostic = Object.freeze({
        getLanguageFluencyDiagnostic, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.LanguageFluencyDiagnostic = LanguageFluencyDiagnostic;
    window.CozyOS.Modules["language-fluency-diagnostic"] = Object.freeze({
        version: MODULE_VERSION,
        description: "PHASE 5 EXTENSION — Universal Language Fluency self-audit composer. Answers 'why can I not yet speak this language fluently' by composing the real, existing CozyLanguagePacks.getLanguageCapabilities() (multidimensional capability model), LanguageGapRegistry (CML-6 concept-level gaps), and ActiveLearning (CML-6 governed contributor questions) — no new AI, no new learning engine, no new storage. Read-only."
    });
})();
