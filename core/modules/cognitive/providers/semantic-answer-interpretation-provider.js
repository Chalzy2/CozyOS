/**
 * CozyOS — Semantic Answer Cognitive Interpretation Provider (SA-3B)
 * File Reference: core/modules/cognitive/providers/semantic-answer-interpretation-provider.js
 *
 * WHAT THIS IS
 *   The ONE, minimal activation bridge SA-3B adds. It calls two already-
 *   real, already-certified authorities — window.CozyOS.SemanticIntentEngine
 *   (Phase 6, unmodified) and window.CozyOS.SemanticAnswerPlanner (SA-3,
 *   frozen, unmodified) — and reshapes their real output into
 *   CozyInterpretation's own, existing provider return contract:
 *   `fn(evidenceArray, context) -> {category, type, meaning, confidence?,
 *   supportingData?, relationships?}` (cozy-interpretation.js:93). Nothing
 *   here re-implements intent classification, entity resolution, evidence
 *   retrieval, or planning — every real decision was already made by
 *   SemanticIntentEngine/SA-2/SA-3 before this file ever sees it. This is
 *   NOT a second AI, second orchestrator, second intent engine, or second
 *   CognitiveCoordinator.
 *
 * RE-AUDIT FINDING THAT SHAPED THIS FILE'S ACTIVATION PATH (read before
 * changing this file)
 *   SA-3B's own re-audit of current HEAD (per its directive: "do not
 *   assume cognitive providers are absent — confirm directly") found the
 *   PRIOR audit's "zero registered providers anywhere" claim was STALE.
 *   core/modules/intelligence/ai-bootstrap.js — real, already
 *   `<script>`-included on index.html/dashboard.html/admin-workspace.html,
 *   self-invoking at load time — already registers real, ALREADY-DEFAULT
 *   providers on all three engines this repository's cognitive stack
 *   exposes: "living-nlu-baseline" (CozyInterpretation), "living-planner-
 *   baseline" (CozyThinking), "living-reasoning-baseline" (CozyReasoning).
 *   Because CozyInterpretation.interpret() invokes exactly ONE provider
 *   per call (the caller-selected `providerId`, or — when omitted — the
 *   FIRST-EVER-registered provider, frozen as `#defaultProviderId`), this
 *   bridge registering itself as a SECOND CozyInterpretation provider
 *   would NOT make it reachable: CognitiveCoordinator.run() never passes
 *   an explicit interpretation providerId, so "living-nlu-baseline" would
 *   keep winning every real call, and this bridge would sit registered-
 *   but-silently-unreachable — the exact "present but unreachable"
 *   failure mode SA-3B's own directive (§5B) warns against, except here
 *   caused by a genuine, pre-existing, already-real, already-relied-upon
 *   OTHER provider, not a bug. Silently taking over the default slot
 *   (e.g. by loading this file's script tag before ai-bootstrap.js's) was
 *   rejected: it would orphan "living-nlu-baseline"/"living-planner-
 *   baseline" — a real, already-active behavior change SA-3B's own
 *   fallback-compatibility requirement (§38) forbids introducing quietly.
 *
 *   RESOLUTION: this bridge STILL registers with CozyInterpretation via
 *   its real, existing registerProvider() API (below) — a real, live,
 *   independently selectable provider named "semantic-answer-cognitive-
 *   provider", available to any future caller that explicitly requests it
 *   by id. But the actual, real, live-turn ACTIVATION this phase delivers
 *   is via CognitiveCoordinator.run() calling this file's own exported
 *   `buildInterpretation()` directly, as one new, clearly-separated,
 *   additive pipeline stage (`diagnostics.stages.semanticAnswer` /
 *   `result.semanticAnswer` — see cognitive-coordinator.js's own SA-3B
 *   changelog note) that runs ALONGSIDE, never instead of, the existing
 *   Interpretation/Thinking/Reasoning stages and their real
 *   "living-*-baseline" providers, which this file changes nothing about.
 *   No existing default provider is displaced. No existing stage's
 *   output changes.
 *
 * WHY THIS FILE IS SEPARATE FROM THE FROZEN SA-3 PLANNER FILE
 *   SA-3 (core/modules/intelligence/semantic-answer/planning/
 *   semantic-answer-planner.js) is certified and frozen per the SA-3B
 *   directive — this file never edits it. This adapter lives outside
 *   that directory precisely so SA-3's own file boundary stays
 *   untouched; it only ever CALLS SemanticAnswerPlanner.planAnswer(),
 *   which was always SA-3's real, intended public entry point.
 *
 * INPUT — what this provider actually receives
 *   evidenceArray: CognitiveCoordinator.run()'s own real evidence shape,
 *   `[{source:"user-input", data:<realText>}]` (cognitive-coordinator.js's
 *   own run() method, unchanged by SA-3B). context: SA-3B's one real,
 *   minimal, additive change to CognitiveCoordinator.run() now threads
 *   `{actorId, conversationState}` into CozyInterpretation.interpret()'s
 *   own `context` parameter (previously always `{}` — see cognitive-
 *   coordinator.js's own SA-3B changelog note). `conversationState`, when
 *   present, is the EXACT real shape cozy-living-assistant.js's own
 *   private `#conversationState` field carries
 *   ({lastIntent, lastApplication, lastDiscussedApplication,
 *   lastLanguage}) — this file does not invent a new context shape, and
 *   SA-3's planner (SA-3 EXTENSION) already accepts this exact shape
 *   verbatim.
 *
 * OUTPUT — deliberately diagnostic, never a final answer
 *   `meaning` here is a short, safe classification label (e.g.
 *   "HUMAN_BENEFIT — ChurchOS"), never the actual claim/evidence text and
 *   never a constructed sentence — SA-4 (language realization) does not
 *   exist yet, and this file does not pretend otherwise. `supportingData`
 *   carries only safe, non-sensitive diagnostic fields (cognitiveStatus,
 *   goal, entitySource, claimCount, language, reason) — never raw
 *   evidence text, memory contents, or a private reasoning trace. This
 *   result is consumed by CognitiveCoordinator's own downstream stages
 *   (Thinking/Reasoning/Intelligence, all still real-but-providerless per
 *   the SA-3B audit — genuinely unaffected by this change) and by
 *   diagnostics; it is NEVER wired into the actual reply text a user
 *   sees. The real, existing response chain (#send() ->
 *   CozyAnswerEngine.answer() -> CozyAdvisor.advise() -> rule-based
 *   fallback) is completely unmodified by SA-3B — see cozy-living-
 *   assistant.js (unchanged; confirmed by `git diff`).
 *
 * FAILURE DISCIPLINE
 *   This function is synchronous and never throws for a legitimate
 *   cognitive outcome (UNDERSTOOD/AMBIGUOUS/UNKNOWN/INSUFFICIENT_
 *   EVIDENCE/EVIDENCE_CONFLICT/LANGUAGE_GAP/ACTION_REQUIRED/
 *   CLARIFICATION_REQUIRED are all real, valid, non-throwing returns —
 *   SA-3's planAnswer() itself is documented to never throw). If
 *   SemanticAnswerPlanner or SemanticIntentEngine are not loaded (should
 *   never happen on a real page after this file's own script-tag
 *   placement, but checked defensively, consistent with this repository's
 *   own "checked at call time, never assumed present" convention), this
 *   returns a real, honest "not available" result — never a fabricated
 *   plan. CozyInterpretation.interpret()'s own existing try/catch (cozy-
 *   interpretation.js:162-169) is what turns a genuine unexpected
 *   exception into the real COGNITIVE_INFRASTRUCTURE_FAILURE diagnostic
 *   (`isReal:false, reason:"Provider threw: ..."`) — this file adds no
 *   separate error-handling system of its own.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa3b";
    const PROVIDER_ID = "semantic-answer-cognitive-provider";
    if (window.CozyOS.Modules["semantic-answer-interpretation-provider"]) return;

    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /** classifyCategory(cognitiveStatus) — real, disclosed mapping onto CozyInterpretation's own closed CATEGORIES enum. */
    function classifyCategory(cognitiveStatus) {
        if (cognitiveStatus === "ACTION_REQUIRED") return "action-item";
        if (cognitiveStatus === "CLARIFICATION_REQUIRED" || cognitiveStatus === "AMBIGUOUS") return "request";
        if (cognitiveStatus === "UNDERSTOOD") return "question";
        return "custom"; // UNKNOWN, INSUFFICIENT_EVIDENCE, EVIDENCE_CONFLICT, LANGUAGE_GAP, VERIFICATION_REQUIRED, LEARNING_CANDIDATE
    }

    /** mapConfidence(overall) — SA-1/SA-3's own HIGH/MEDIUM/LOW/UNKNOWN convention mapped onto CozyInterpretation's own required numeric confidence. Real, disclosed, one-directional (SA-1's contract itself is never changed to use numbers). */
    function mapConfidence(overall) {
        switch (overall) {
            case "HIGH": return 0.9;
            case "MEDIUM": return 0.6;
            case "LOW": return 0.3;
            default: return null;
        }
    }

    function extractText(evidenceArray) {
        const list = Array.isArray(evidenceArray) ? evidenceArray : [];
        const userInput = list.find((e) => e && e.source === "user-input") || list[0];
        return userInput && typeof userInput.data === "string" ? userInput.data : "";
    }

    /**
     * buildInterpretation(evidenceArray, context)
     *   The real provider function. See file header for the full
     *   contract. Exported (not just registered) so this bridge's own
     *   logic can be unit-tested directly, the same convention SA-3's own
     *   planner uses for resolveGoal()/resolveContextualEntity().
     */
    function buildInterpretation(evidenceArray, context) {
        const planner = window.CozyOS.SemanticAnswerPlanner;
        const intentEngine = window.CozyOS.SemanticIntentEngine;
        if (!planner || typeof planner.planAnswer !== "function" || !intentEngine || typeof intentEngine.analyze !== "function") {
            return {
                category: "custom", type: "semantic", meaning: null, confidence: null,
                supportingData: { cognitiveStatus: null, reason: "SEMANTIC_PLANNING_NOT_AVAILABLE" },
            };
        }

        const text = extractText(evidenceArray);
        const conversationState = isPlainObject(context) && isPlainObject(context.conversationState) ? context.conversationState : null;
        const actorId = isPlainObject(context) && isNonEmptyString(context.actorId) ? context.actorId : null;

        const result = planner.planAnswer({ text, conversationState, actorId });

        const cognitiveStatus = (result.diagnostics && result.diagnostics.cognitiveStatus) || null;
        const goal = (result.plan && result.plan.goal) || result.goal || null;
        const entityValue = (result.plan && result.plan.entity && result.plan.entity.value) || result.entity || null;
        const entitySource = (result.diagnostics && result.diagnostics.entitySource) || null;
        const claimCount = (result.plan && Array.isArray(result.plan.claims)) ? result.plan.claims.length : 0;
        const language = (result.plan && result.plan.language) || result.language || null;
        const overallConfidence = result.diagnostics && result.diagnostics.intentResult && result.diagnostics.intentResult.confidence
            ? result.diagnostics.intentResult.confidence.overall : null;

        return {
            category: classifyCategory(cognitiveStatus),
            type: "semantic",
            meaning: goal ? `${goal} — ${entityValue || "no-entity"}` : cognitiveStatus,
            confidence: mapConfidence(overallConfidence),
            supportingData: {
                cognitiveStatus, goal, entitySource, claimCount, language,
                reason: result.success ? null : (result.reason || null),
                planSchemaVersion: (result.plan && result.plan.schemaVersion) || null,
            },
            // WAVE 1 (Cognitive-to-Answer Contract) — additive field, not
            // part of CozyInterpretation's own provider contract (that
            // fixed {category,type,meaning,confidence,supportingData}
            // shape is unchanged above). CognitiveCoordinator.run() calls
            // this function DIRECTLY (cognitive-coordinator.js's own
            // "Stage 1b" — never through CozyInterpretation.interpret(),
            // which would strip any field outside its own explicit
            // allowlist; confirmed by reading interpret()'s real
            // results.map() before adding this), so this survives intact
            // as result.semanticAnswer.rawPlanResult on the real
            // CognitiveCoordinator.run() return value. This is SA-3's own
            // real, complete SemanticAnswerPlanner.planAnswer() output —
            // the exact same object CozyAnswerEngine.tryConstructSemanticAnswer()
            // already computes a SECOND time today by calling planAnswer()
            // again with the same input. Exposing it here lets that
            // redundant second call be skipped when this one is reused
            // (see cozy-answer-engine.js), without this file gaining any
            // new responsibility — it still only ever calls planAnswer()
            // once, exactly as before.
            rawPlanResult: result,
        };
    }

    function register() {
        const interpretation = window.CozyOS.CozyInterpretation;
        if (!interpretation || typeof interpretation.registerProvider !== "function") return { success: false, reason: "CozyInterpretation is not loaded." };
        if (interpretation.findProvider(PROVIDER_ID)) return { success: true, alreadyRegistered: true };
        return interpretation.registerProvider(
            { id: PROVIDER_ID, name: "SA-3 Semantic Answer Cognitive Provider", supportedSourceTypes: ["custom"], supportsRelationships: false, supportsExplain: false, offline: true },
            (evidenceArray, context) => buildInterpretation(evidenceArray, context)
        );
    }

    const registrationResult = register();

    const SemanticAnswerInterpretationProvider = Object.freeze({
        PROVIDER_ID, buildInterpretation, register, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.SemanticAnswerInterpretationProvider = SemanticAnswerInterpretationProvider;
    window.CozyOS.Modules["semantic-answer-interpretation-provider"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-3B — activation bridge. Registers the real, existing SemanticIntentEngine + SA-3 SemanticAnswerPlanner as a genuine window.CozyOS.CozyInterpretation provider, via that engine's own pre-existing registerProvider() API. No new AI, orchestrator, intent engine, memory system, or authorization system. Never produces final answer text. Registration result at load time: " + JSON.stringify(registrationResult),
    });
})();
