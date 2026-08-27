/**
 * CozyOS — Answer Engine (Micro-Milestone H)
 * File Reference: core/modules/intelligence/answer/cozy-answer-engine.js
 *
 * WHAT THIS IS
 *   The one missing link the milestone asked for:
 *
 *     QUESTION -> Question Understanding -> Context Retrieval ->
 *     existing FAQ/Knowledge path (where applicable) -> AnswerEngine ->
 *     structured, verified answer.
 *
 *   Every fact this file returns is read from an already-existing,
 *   unmodified authority. This file adds NO new memory engine, NO new
 *   knowledge authority, NO new story authority, and does NOT replace
 *   or duplicate cozyos-identity-faq-router.js's identity/public-story
 *   answers. It composes:
 *
 *     - window.CozyOS.CozyIdentityFAQRouter  (identity/origin/vision/
 *       mission/differentiation/etc. — unmodified, tried FIRST, never
 *       re-implemented here)
 *     - window.CozyOS.CozyAI.getContext()    (unmodified Micro-Milestone
 *       F composition of CozyKnowledge + CozyMemory/Living Memory)
 *     - window.CozyOS.CozyKnowledge          (read-only, and only to
 *       re-render a getter's own already-VERIFIED raw fact when
 *       getContext()'s generic `content: fact.answer` projection is
 *       empty for facts that don't carry an `answer` field, e.g.
 *       listApplicationsFact()/listProvidersFact() carry `applications`/
 *       `entries` instead — see renderResultContent() below. This is a
 *       display-formatting step over evidence getContext() already
 *       marked VERIFIED, not a second retrieval path or new authority.)
 *
 * QUESTION UNDERSTANDING — HONEST SCOPE
 *   There is no repository-wide "CozyQuestionUnderstanding" NLU engine.
 *   The real, existing "understanding" this file relies on is:
 *     1. CozyIdentityFAQRouter.detectIntent() — real substring/word-
 *        overlap scoring against a fixed, disclosed trigger table
 *        (identity/origin/vision/mission/differentiation/etc.).
 *     2. CozyAI.getContext()'s own deterministic keyword routing tables
 *        (CONTEXT_STORY_ROUTES / CONTEXT_KNOWLEDGE_ROUTES) — which
 *        getter(s) actually returned VERIFIED evidence tells this file
 *        what the question was "about," without re-implementing that
 *        routing.
 *   On top of those two REAL signals, this file adds one small, fixed,
 *   disclosed regex-based label (why-like / comparison-like) purely to
 *   choose a responseMode (WHY_REASONING vs COMPARISON vs FACT vs
 *   EXPLANATION) for the final structured answer. This is NOT semantic
 *   understanding and is never used to retrieve or fabricate evidence —
 *   only to label evidence that was already, separately, verified.
 *
 * REASONING — HONEST SCOPE
 *   "Synthesis" here means: join distinct, already-VERIFIED content
 *   strings from one or more composed authorities into one coherent
 *   answer, with a short connective phrase. It never invents a claim
 *   that is not already present in a composed authority's VERIFIED
 *   output. If nothing verified was found, evidenceState is
 *   INSUFFICIENT_DATA (or UNAVAILABLE if a required authority is not
 *   loaded at all) and the returned answer says so honestly.
 *
 * PUBLIC / PRIVATE BOUNDARY
 *   This file never references the FounderStory engine directly. It has no
 *   code path to the private Founder Story Vault at all — every public-
 *   story fact it can ever see already passed through FounderStory
 *   .getPublicStory() inside cozy-knowledge-registry.js before this
 *   file ever touches it. This is structural (nothing to import/call),
 *   not merely a permission check.
 *
 * MEMORY / AUTHORIZATION
 *   actorId is passed straight through to CozyAI.getContext(), which
 *   passes it straight through to CozyMemory.recall()'s own existing
 *   visibility/owner/organisation enforcement. This file never invents
 *   an actorId of "system" and never bypasses that check.
 *
 * OUTPUT SHAPE
 *   { answer, intent, responseMode, evidenceState, sources,
 *     reasoningUsed, contextUsed }
 *
 *   evidenceState  : "VERIFIED" | "INSUFFICIENT_DATA" | "UNAVAILABLE"
 *   responseMode   : "FACT" | "EXPLANATION" | "WHY_REASONING" |
 *                    "COMPARISON" | "INSUFFICIENT_EVIDENCE"
 *                    (encouragement, if ever added, is identified as a
 *                    responseMode value only — no encouragement engine
 *                    exists or is built here)
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const VERSION = "1.0.0";
    if (window.CozyOS.Modules["cozy-answer-engine"]) return;

    // Identity-router intent IDs that are inherently comparison-shaped
    // or why-shaped. Fixed, disclosed labels only — not new facts.
    const COMPARISON_INTENTS = new Set(["COZYOS_DIFFERENTIATION", "COZYOS_UNIQUENESS"]);
    const WHY_INTENTS = new Set(["COZYOS_ORIGIN", "COZYOS_WHY_CREATED"]);

    const WHY_PATTERN = /\bwhy\b/i;
    const COMPARISON_PATTERN = /\b(differ|different|compare|comparison|versus|\bvs\.?\b|better than|unlike|compared to)\b/i;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /**
     * renderResultContent(result)
     *   result is one entry from CozyAI.getContext()'s `results` array.
     *   If it already carries usable text (`content`), use it as-is —
     *   never re-derive text getContext() already gave us. Only when
     *   `content` is empty AND the result came from the knowledge-
     *   registry (i.e. carries a `getter` name) does this re-call that
     *   SAME getter on window.CozyOS.CozyKnowledge to read the raw
     *   fact's own array/object fields (applications/entries/steps),
     *   which getContext()'s generic `fact.answer` projection does not
     *   carry for every getter. The getter itself is not re-verified —
     *   getContext() already confirmed evidence === "VERIFIED" before
     *   this result ever reached us; this only reformats it for display.
     */
    function renderResultContent(result) {
        if (isNonEmptyString(result.content)) return result.content;
        if (!result.getter) return null;
        const knowledge = window.CozyOS.CozyKnowledge;
        if (!knowledge || typeof knowledge[result.getter] !== "function") return null;
        let raw = null;
        try { raw = knowledge[result.getter](); } catch (_err) { return null; }
        if (!raw || raw.evidence !== "VERIFIED") return null;
        if (Array.isArray(raw.applications) && raw.applications.length > 0) {
            return `CozyOS currently includes these applications: ${raw.applications.join(", ")}.`;
        }
        if (Array.isArray(raw.entries) && raw.entries.length > 0) {
            return `Registered providers: ${raw.entries.join("; ")}.`;
        }
        if (Array.isArray(raw.steps) && raw.steps.length > 0) {
            return raw.steps.join(" ");
        }
        if (isNonEmptyString(raw.answer)) return raw.answer;
        return null;
    }

    /** Real substring dedup by authority+getter/namespace+key — never drops a genuinely distinct source. */
    function dedupeSources(sources) {
        const seen = new Set();
        const out = [];
        for (const s of sources) {
            const key = `${s.authority}|${s.getter || s.namespace || ""}|${s.key || ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(s);
        }
        return out;
    }

    function classifyContextIntent(ctxResults) {
        const getters = new Set(ctxResults.filter(r => r.getter).map(r => r.getter));
        if (getters.has("listApplicationsFact")) return "APPLICATION";
        if (getters.has("listProvidersFact")) return "TECHNICAL";
        if (getters.has("getFounderFact")) return "IDENTITY";
        if (getters.has("getVisionFact")) return "VISION";
        if (getters.has("getMissionFact") || getters.has("getProjectOriginFact") || getters.has("getProjectHistoryFact") || getters.has("getPublicStoryFact")) return "ORIGIN_OR_STORY";
        if (ctxResults.some(r => r.authority === "cozy-memory" || r.authority === "living-memory")) return "PROJECT_KNOWLEDGE";
        return "GENERAL";
    }

    function synthesizeFromContext(question, ctxResults) {
        const pieces = [];
        for (const r of ctxResults) {
            const text = renderResultContent(r);
            if (isNonEmptyString(text)) pieces.push(text);
        }
        return pieces;
    }

    /**
     * answer(question, { actorId, language, memoryQuery })
     *   Real. Never throws — a missing/failing composed authority
     *   degrades the relevant field, never a fabricated answer.
     */
    async function answer(question, { actorId = null, language = null, memoryQuery = null } = {}) {
        if (typeof question !== "string" || !question.trim()) {
            return {
                answer: "A real, non-empty question is required.",
                intent: "INVALID_INPUT", responseMode: "INSUFFICIENT_EVIDENCE",
                evidenceState: "INSUFFICIENT_DATA", sources: [], reasoningUsed: false, contextUsed: []
            };
        }

        const router = window.CozyOS.CozyIdentityFAQRouter;
        const ai = window.CozyOS.CozyAI;

        if (!router && !ai) {
            return {
                answer: "The answer composition authorities (CozyIdentityFAQRouter / CozyAI) are not loaded in this environment.",
                intent: "UNKNOWN", responseMode: "INSUFFICIENT_EVIDENCE",
                evidenceState: "UNAVAILABLE", sources: [], reasoningUsed: false, contextUsed: []
            };
        }

        const whyLike = WHY_PATTERN.test(question);
        const comparisonLike = COMPARISON_PATTERN.test(question);

        // --- Step: existing FAQ/Knowledge path (identity/origin/vision/etc.) ---
        let faqResult = null;
        if (router && typeof router.resolve === "function") {
            try { faqResult = await router.resolve(question, { language }); } catch (_err) { faqResult = null; }
        }
        const faqMatched = !!(faqResult && faqResult.matched);

        // --- Step: Context Retrieval (always run — even a matched FAQ
        // question may have additional verified context worth citing,
        // and this is how a multi-intent question picks up its second
        // half, e.g. "What is CozyOS and what applications does it have?") ---
        let ctx = { success: false, results: [] };
        if (ai && typeof ai.getContext === "function") {
            try { ctx = await ai.getContext(question, { actorId, memoryQuery }); } catch (_err) { ctx = { success: false, results: [] }; }
        }
        const ctxResults = (ctx && Array.isArray(ctx.results)) ? ctx.results : [];

        if (faqMatched) {
            const isReal = faqResult.isReal !== false;
            let responseMode = "FACT";
            if (COMPARISON_INTENTS.has(faqResult.intentId)) responseMode = "COMPARISON";
            else if (WHY_INTENTS.has(faqResult.intentId)) responseMode = "WHY_REASONING";
            if (!isReal) responseMode = "INSUFFICIENT_EVIDENCE";

            const sources = [{
                authority: "identity-faq-router",
                provenance: faqResult.source || "window.CozyOS.CozyIdentityFAQRouter",
                intentId: faqResult.intentId,
                evidence: isReal ? "VERIFIED" : "NOT_FOUND"
            }];

            // Multi-intent: fold in any DISTINCT, non-overlapping context
            // evidence (e.g. an applications/architecture fact alongside
            // an identity fact) rather than silently dropping it.
            let combinedAnswer = faqResult.answer;
            const extraPieces = synthesizeFromContext(question, ctxResults.filter(r => r.authority === "knowledge-registry" || r.authority === "cozy-memory" || r.authority === "living-memory"));
            let multiIntent = null;
            if (extraPieces.length > 0) {
                const secondaryIntent = classifyContextIntent(ctxResults);
                if (secondaryIntent !== "GENERAL" && secondaryIntent !== "ORIGIN_OR_STORY" && secondaryIntent !== "IDENTITY" && secondaryIntent !== "VISION") {
                    combinedAnswer = `${faqResult.answer} Additionally: ${extraPieces.join(" ")}`;
                    multiIntent = secondaryIntent;
                    responseMode = "EXPLANATION";
                    for (const r of ctxResults) sources.push({ authority: r.authority, provenance: r.provenance, getter: r.getter, namespace: r.namespace, key: r.key, evidence: "VERIFIED" });
                }
            }

            return {
                answer: combinedAnswer,
                intent: multiIntent ? [faqResult.intentId, multiIntent] : faqResult.intentId,
                responseMode,
                evidenceState: isReal ? "VERIFIED" : "INSUFFICIENT_DATA",
                sources: dedupeSources(sources),
                reasoningUsed: !!multiIntent,
                contextUsed: ctxResults
            };
        }

        // --- No FAQ match: general Question-Understanding + Context path ---
        if (ctxResults.length === 0) {
            return {
                answer: "I don't have verified information to answer that yet. Please rephrase, or this may not be something CozyOS has documented/verified.",
                intent: "UNKNOWN", responseMode: "INSUFFICIENT_EVIDENCE",
                evidenceState: (ai && typeof ai.getContext === "function") ? "INSUFFICIENT_DATA" : "UNAVAILABLE",
                sources: [], reasoningUsed: false, contextUsed: []
            };
        }

        const intent = classifyContextIntent(ctxResults);
        const pieces = synthesizeFromContext(question, ctxResults);

        if (pieces.length === 0) {
            return {
                answer: "Some related context exists, but nothing in it could be honestly rendered as a verified answer.",
                intent, responseMode: "INSUFFICIENT_EVIDENCE",
                evidenceState: "INSUFFICIENT_DATA", sources: [], reasoningUsed: false, contextUsed: ctxResults
            };
        }

        let responseMode;
        if (whyLike) responseMode = "WHY_REASONING";
        else if (comparisonLike) responseMode = "COMPARISON";
        else if (pieces.length > 1) responseMode = "EXPLANATION";
        else responseMode = "FACT";

        const answerText = pieces.length > 1
            ? pieces.join(" Additionally, ")
            : pieces[0];

        const sources = dedupeSources(ctxResults.map(r => ({
            authority: r.authority, provenance: r.provenance, getter: r.getter,
            namespace: r.namespace, key: r.key, evidence: "VERIFIED"
        })));

        return {
            answer: answerText,
            intent,
            responseMode,
            evidenceState: "VERIFIED",
            sources,
            reasoningUsed: pieces.length > 1 || responseMode === "WHY_REASONING" || responseMode === "COMPARISON",
            contextUsed: ctxResults
        };
    }

    const CozyAnswerEngine = Object.freeze({ answer, getVersion: () => VERSION });
    window.CozyOS.CozyAnswerEngine = CozyAnswerEngine;

    window.CozyOS.Modules["cozy-answer-engine"] = Object.freeze({
        version: VERSION,
        description: "Micro-Milestone H — AnswerEngine. Composes the existing, unmodified CozyIdentityFAQRouter (identity/origin/vision/mission/differentiation/etc., tried first) and CozyAI.getContext() (CozyKnowledge VERIFIED facts + CozyMemory/Living Memory search) into one structured {answer,intent,responseMode,evidenceState,sources,reasoningUsed,contextUsed} result. No new memory/knowledge/story authority. No FounderStory reference anywhere in this file — the public/private boundary is structural, not a permission check. Never defaults actorId to \"system\"."
    });
})();
