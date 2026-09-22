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
        // UNIVERSAL QUESTION UNDERSTANDING REPAIR — label these two
        // platform-level facts honestly by knowledge domain instead of
        // falling through to "GENERAL", now that cozy-ai.js's
        // CONTEXT_KNOWLEDGE_ROUTES can route human-benefit/problem-
        // solved-style questions to them (see that file's own comment).
        if (getters.has("getWhyUseCozyOSFact")) return "HUMAN_BENEFITS";
        if (getters.has("getDifferentiationFact")) return "IMPORTANCE";
        if (getters.has("getMissionFact") || getters.has("getProjectOriginFact") || getters.has("getProjectHistoryFact") || getters.has("getPublicStoryFact")) return "ORIGIN_OR_STORY";
        // LIVE WINDOW APPLICATION SEMANTIC UNDERSTANDING REPAIR —
        // cozy-ai.js's getContext() composes a named application's own
        // real human-purpose/capability knowledge under this authority
        // (see that file's own comment); label it honestly by its real
        // domain instead of falling through to "GENERAL".
        if (ctxResults.some(r => r.authority === "application-knowledge")) return "APPLICATION_INFORMATION";
        // Phase 2: CozyAI + Live Window Business-Data Q&A — cozy-ai.js's
        // getContext() composes CozyBusinessDataIntent's real, private,
        // per-actor business-data answer under this authority; label it
        // honestly as private business data, distinct from public
        // application knowledge (see cozy-ai.js's own comment).
        if (ctxResults.some(r => r.authority === "interestos-business-data")) return "BUSINESS_DATA";
        // Phase 3: Teach Cozy / Governed Learning — "cozy-teach" is the
        // live create/confirm/reject/conflict exchange itself;
        // "cozy-teach-knowledge" is a later question answered FROM a
        // previously TRUSTED taught fact (see cozy-ai.js's own comment).
        if (ctxResults.some(r => r.authority === "cozy-teach" || r.authority === "cozy-teach-knowledge")) return "TEACHING";
        if (ctxResults.some(r => r.authority === "live-worship-session")) return "LIVE_WORSHIP";
        if (ctxResults.some(r => r.authority === "cozy-memory" || r.authority === "living-memory")) return "PROJECT_KNOWLEDGE";
        return "GENERAL";
    }

    /**
     * LIVE WINDOW LANGUAGE-REALIZATION REPAIR (Phase 4 correction) —
     * real bug found via an actual Live Window run: a fully-Kiswahili
     * question ("CozyOS ni nini?") correctly got a Kiswahili-realized
     * answer from CozyIdentityFAQRouter, but this file then spliced RAW
     * English "knowledge-registry" prose (from cozy-public-knowledge-
     * source.js, English-authored this pass — see that file's own
     * disclosure at the "why-use-cozyos:verified"/"differentiation:
     * verified" template keys) onto it with a bare, hardcoded English
     * "Additionally:" connector, producing a mixed-language final
     * answer. Root cause: realization was applied only to the FAQ
     * router's own single piece, never to the composed multi-piece
     * result as a whole, and "knowledge-registry" content was
     * concatenated with no language awareness at all.
     *
     * FIX — reuses the SAME existing disclosure pattern the two
     * template keys above already use for their own single-piece case
     * ("content:english-only-notice", cozy-language-templates.js),
     * generalized to this file's multi-piece composition. Only
     * "knowledge-registry" pieces are wrapped — that authority's raw
     * fact content is the one confirmed, disclosed English-only source;
     * "cozy-memory"/"living-memory" pieces (arbitrary user-typed
     * content, unknown language) and "application-knowledge" pieces
     * (already real EN/SW-resolved by getApplicationDetailedInfoFact())
     * are left exactly as before — never presumptively mislabeled.
     * English behavior (effLang==="en") is completely unchanged by
     * either helper below.
     */
    function normalizeLanguage(language) {
        return (typeof language === "string" && language.trim()) ? language.trim().toLowerCase() : "en";
    }

    function joinPiecesForLanguage(pieces, effLang) {
        if (pieces.length === 0) return "";
        if (pieces.length === 1) return pieces[0];
        if (effLang === "en") return pieces.join(" Additionally, ");
        const realizer = window.CozyOS && window.CozyOS.CozyLanguageRealize;
        const connector = (realizer && realizer.realize("connector:additionally", effLang)) || "Additionally,";
        return pieces.join(` ${connector} `);
    }

    /**
     * COZY CONSTRUCTION SENTENCE ARCHITECTURE (SA-7 — Live Window
     * Integration). The real SA-1..SA-6 pipeline (SemanticAnswerPlanner
     * -> LanguageRealizer -> ResponseValidator -> RepairLoop) was fully
     * built and independently tested (see core/modules/intelligence/
     * semantic-answer/) but, until this integration, was never actually
     * consumed by the live answer chain — confirmed by that planner's
     * own header, which explicitly reserved live wiring for this exact
     * phase. This function is the ONE place that composes it into a
     * real answer.
     *
     * WHY THIS EXISTS, NOT A SECOND "DIRECT CONSTRUCTION" MECHANISM
     * ALONGSIDE THE OLD synthesizeFromContext() PATH ABOVE
     *   The old path (renderResultContent/synthesizeFromContext) reads
     *   getContext()'s own generic `content` projection — already-joined
     *   prose that was never separated into discrete claims+evidence,
     *   so it has no way to construct a sentence FROM evidence per
     *   language; it can only honestly wrap already-composed English
     *   text when no Kiswahili exists (see this file's own
     *   "content:english-only-notice" comment above). The SA pipeline is
     *   architecturally different: SA-3's planner gathers real, GRANULAR
     *   VerifiedEvidence (one record per real fact, already tagged with
     *   its own real language) and SA-4 constructs the final sentence
     *   DIRECTLY from whichever language's evidence was requested — for
     *   an application-level goal with a real Kiswahili sibling
     *   (APPLICATION_HUMAN_PURPOSE_DATA's own humanBenefitsSw/
     *   humanPurposeSw etc.), this produces a genuine, validated,
     *   directly-constructed Kiswahili sentence, never an English
     *   sentence generated first and translated/wrapped second. Tried
     *   ONLY when the FAQ router did not match (an identity/origin/
     *   vision/mission/differentiation question about CozyOS itself has
     *   no APPLICATION_HUMAN_PURPOSE_DATA entry — "CozyOS" is the
     *   platform, not one of the registered applications this data
     *   models — so it is correctly, honestly left to the FAQ router,
     *   which already answers it directly and correctly in the user's
     *   language; see this file's own delivery notes for the full
     *   disclosure of this architectural boundary).
     *
     * GRACEFUL, ADDITIVE, NEVER A HARD DEPENDENCY
     *   Every one of SA-3/SA-4/SA-5/SA-6's real modules is composed
     *   read-only and defensively — if any is not loaded (e.g. every
     *   existing Node unit test in this file's own test suite, none of
     *   which load the semantic-answer/ chain), or the planner cannot
     *   plan this question (no entity resolved, no evidence, a
     *   CLARIFICATION/UNKNOWN goal, an ACTION goal, a language gap), or
     *   the repair loop ultimately REJECTs/exhausts its attempts, this
     *   function returns null and the EXISTING chain below runs exactly
     *   as it did before this integration — byte-identical, zero
     *   regression risk for every case this new pipeline declines.
     */
    async function tryConstructSemanticAnswer({ question, actorId, entityHint, language, cognitiveResult }) {
        const planner = window.CozyOS.SemanticAnswerPlanner;
        if (!planner || typeof planner.planAnswer !== "function") return null;

        // WAVE 1 (Cognitive-to-Answer Contract) — reuse CognitiveCoordinator's
        // own already-computed SA-3 plan for this exact turn when it is
        // genuinely present and structurally valid (real success:true,
        // real plan.goal), rather than calling planner.planAnswer() a
        // second time with the same input. This is the fix for the
        // repository's own confirmed, documented redundancy ("SA-3's
        // planner invoked twice per turn... confirmed redundant, not
        // harmful, but wasted work"). Never blindly trusted: any
        // precomputed result missing a real success/plan falls straight
        // through to the exact same fresh planAnswer() call this
        // function has always made, so a caller that never supplies
        // cognitiveResult (every existing test, every pre-Wave-1 call
        // site) sees byte-identical behavior.
        //
        // WAVE 7a (multi-turn entity-switching repair) — root cause,
        // traced through the real, live call chain rather than assumed:
        // cognitiveResult is computed EARLY in the turn by SA-3B's bridge
        // (semantic-answer-interpretation-provider.js's buildInterpretation(),
        // called from CognitiveCoordinator.run() inside rule-based-
        // conversational-provider.js's think()) — which calls
        // planner.planAnswer({text, conversationState, actorId}) with NO
        // entityHint at all (confirmed by reading that file directly).
        // Its own entity resolution therefore depends entirely on
        // SemanticIntentEngine's real, disclosed-incomplete KNOWN_ENTITIES
        // spotting plus SA-3's own resolveContextualEntity() conversation-
        // state-inheritance fallback (semantic-answer-planner.js) — when
        // the CURRENT turn names an entity that engine doesn't recognize,
        // that fallback honestly (and correctly, from SA-3's own narrow
        // view) inherits the PREVIOUS turn's lastDiscussedApplication
        // instead, producing a structurally VALID but wrong-entity plan.
        // Separately and independently, cozy-living-assistant.js's own
        // `entityHint` (`contextualEntityName`, #send()) is computed AFTER
        // this turn's conversationState is updated and is the correct,
        // already-tested signal for what the CURRENT turn actually named.
        // Reusing cognitiveResult without ever comparing the two lets a
        // stale, previous-turn entity silently win over the correct one —
        // this is the exact, reproduced "answers the previous app instead
        // of the one just asked about" defect. The minimum fix: only
        // reuse cognitiveResult when its own resolved entity agrees with
        // entityHint (or no entityHint was supplied at all, preserving
        // every pre-Wave-7a caller's exact behavior); otherwise fall
        // through to the SAME fresh planAnswer() call below that already
        // correctly threads entityHint through SA-3's real entityHint
        // priority (see semantic-answer-planner.js's own
        // resolveContextualEntity(), which checks entityHint FIRST).
        // No new entity-resolution system, no new comparison authority —
        // this reuses the exact two signals the real call chain already,
        // separately, computes.
        let planResult;
        const cachedEntityValue = cognitiveResult && cognitiveResult.plan && cognitiveResult.plan.entity && cognitiveResult.plan.entity.value;
        const cachedEntityAgreesWithThisTurn = !isNonEmptyString(entityHint)
            || (isNonEmptyString(cachedEntityValue) && cachedEntityValue.trim().toLowerCase() === entityHint.trim().toLowerCase());
        if (cognitiveResult && cognitiveResult.success === true && cognitiveResult.plan && cognitiveResult.plan.goal && cachedEntityAgreesWithThisTurn) {
            planResult = cognitiveResult;
        } else {
            try { planResult = planner.planAnswer({ text: question, actorId, entityHint, requestedLanguage: language }); }
            catch (_err) { return null; }
        }
        if (!planResult || !planResult.success) return null;

        const plan = planResult.plan;
        // CLARIFICATION/UNKNOWN/REFUSAL: SA-4 has no real evidence to
        // construct from by definition — let the existing chain's own,
        // already-tested honest-fallback text handle these, never a
        // second, competing "I don't know" phrasing.
        if (plan.goal === "CLARIFICATION" || plan.goal === "UNKNOWN" || plan.answerMode === "REFUSAL") return null;

        const requestContract = window.CozyOS.LanguageRealizationRequestContract;
        const repairLoop = window.CozyOS.RepairLoop;
        if (!requestContract || typeof requestContract.create !== "function" || !repairLoop || typeof repairLoop.realizeValidated !== "function") return null;

        const built = requestContract.create({
            language: { languageId: plan.language },
            semanticPlan: plan,
            evidence: planResult.evidence || [],
        });
        if (!built.success) return null;

        let outcome;
        try {
            outcome = repairLoop.realizeValidated({
                request: built.request,
                actorContext: (typeof actorId === "string" && actorId.trim() && actorId !== "anonymous") ? { actorId } : null,
            });
        } catch (_err) { return null; }
        if (!outcome || !outcome.success) return null;

        return { plan, candidate: outcome.candidate, evidence: planResult.evidence || [] };
    }

    /**
     * buildCognitiveContext(cognitiveResult)
     *   WAVE 1 (Cognitive-to-Answer Contract) — a best-effort, honest
     *   summary of whatever CognitiveCoordinator's real SA-3
     *   SemanticAnswerPlanner.planAnswer() output actually contains for
     *   this turn, extending answer()'s existing return shape additively
     *   (a new field alongside answer/intent/responseMode/... — never a
     *   new contract file, never a second answer/cognitive system).
     *   Every field here traces to real, already-computed data on
     *   `cognitiveResult` (SA-1's own SemanticAnswerPlanContract shape
     *   plus SA-3's own diagnostics shape, both already real and used
     *   elsewhere in this codebase — see semantic-answer-interpretation-
     *   provider.js's own buildInterpretation() for the same field
     *   paths). Fields this repository genuinely does not compute
     *   anywhere yet (dialect/region, situation, a real capability
     *   graph, a derived advice/next-step requirement) are left `null`
     *   rather than fabricated — see MULTILINGUAL-INTELLIGENCE-AUDIT.md
     *   §5 for the same, already-disclosed gaps. Returns null when no
     *   real cognitive result was ever supplied, so a caller can tell
     *   "genuinely nothing available" apart from "available but empty."
     */
    function buildCognitiveContext(cognitiveResult) {
        if (!cognitiveResult || typeof cognitiveResult !== "object") return null;
        const plan = cognitiveResult.plan || null;
        const diagnostics = cognitiveResult.diagnostics || null;
        if (!plan && !diagnostics) return null;
        const cognitiveStatus = diagnostics ? diagnostics.cognitiveStatus || null : null;
        return {
            language: (plan && plan.language) || null,
            dialectRegion: null, // not modeled anywhere in this repository yet — honestly unknown, never guessed
            intent: (plan && plan.goal) || null,
            entities: (plan && plan.entity) ? [plan.entity] : [],
            goal: (plan && plan.goal) || null,
            situation: null, // not modeled anywhere in this repository yet
            conversationContext: (plan && plan.conversationContext) || null,
            ambiguity: cognitiveStatus ? (cognitiveStatus === "AMBIGUOUS" || cognitiveStatus === "CLARIFICATION_REQUIRED") : null,
            evidenceClaimCount: (plan && Array.isArray(plan.claims)) ? plan.claims.length : null,
            uncertainty: (diagnostics && diagnostics.intentResult && diagnostics.intentResult.confidence) ? diagnostics.intentResult.confidence.overall || null : null,
            relevantCapabilities: null, // no real capability graph exists yet — see audit §5 (Rule 37 MISSING)
            reasoningResult: cognitiveStatus,
            responseMode: (plan && plan.answerMode) || null,
            clarificationRequired: cognitiveStatus === "CLARIFICATION_REQUIRED",
            adviceRequired: null, // CozyAdvisor makes this determination independently today, not derived from the cognitive result
            nextStepRequired: null, // not modeled anywhere in this repository yet
        };
    }

    function synthesizeFromContext(question, ctxResults, effLang) {
        const lang = effLang || "en";
        const realizer = window.CozyOS && window.CozyOS.CozyLanguageRealize;
        const pieces = [];
        for (const r of ctxResults) {
            const text = renderResultContent(r);
            if (!isNonEmptyString(text)) continue;
            if (lang !== "en" && r.authority === "knowledge-registry") {
                const wrapped = realizer && realizer.realize("content:english-only-notice", lang, text);
                pieces.push(wrapped || `Additionally: ${text}`);
            } else {
                pieces.push(text);
            }
        }
        return pieces;
    }

    /**
     * answer(question, { actorId, language, memoryQuery, entityHint,
     *                     liveSessionId, supportScope })
     *   Real. Never throws — a missing/failing composed authority
     *   degrades the relevant field, never a fabricated answer.
     *   liveSessionId (LIVE INTEGRATION AUDIT addition) — passed straight
     *   through to CozyAI.getContext() (see that file's own comment);
     *   this file adds no live-session logic of its own.
     *   supportScope (SUPPORT INTEGRATION addition) — passed straight
     *   through to CozyAI.getContext() unchanged; this file performs no
     *   authorization of its own for it (getContext() independently,
     *   freshly re-verifies platform-admin + active support grant every
     *   call — see that file's own comment for the full check).
     *   businessContext (BUSINESS INTEGRATION addition) — passed straight
     *   through to CozyAI.getContext() unchanged; this file adds no
     *   business-calculation logic of its own (InterestOSBusinessWorkspace.
     *   computeSummary() already enforces owner/visibility fail-closed).
     *   businessConversationState (Phase 2: Business-Data Q&A addition) —
     *   passed straight through to CozyAI.getContext(), which passes it
     *   straight through to CozyBusinessDataIntent — the real, previous-
     *   turn {lastBusinessMetric, lastBusinessTimeRange, lastBusinessTableId}
     *   a bare follow-up ("And yesterday?") needs to resolve without the
     *   user repeating themselves. This file adds no business intent
     *   classification of its own; the returned businessDataConversationState
     *   field (see the return shape below) is CozyBusinessDataIntent's own
     *   real, disclosed updated state, for the caller (cozy-living-
     *   assistant.js) to carry into the NEXT turn — the same existing
     *   #conversationState mechanism lastDiscussedApplication already
     *   uses, never a second memory/context system.
     *   teachConversationState (Phase 3: Teach Cozy / Governed Learning
     *   addition) — same pattern as businessConversationState immediately
     *   above: passed straight through to CozyAI.getContext(), which
     *   passes it straight through to CozyTeachFlow, so a pending
     *   yes/no teaching-confirmation exchange survives to the next turn.
     *   The returned teachDataConversationState field is CozyTeachFlow's
     *   own real, disclosed updated state for the caller to carry
     *   forward — this file adds no teaching/governance logic of its own.
     */
    async function answer(question, { actorId = null, language = null, memoryQuery = null, entityHint = null, liveSessionId = null, supportScope = null, businessContext = null, businessConversationState = null, teachConversationState = null, cognitiveResult = null } = {}) {
        // WAVE 1 (Cognitive-to-Answer Contract) — computed once, honestly,
        // from whatever the caller actually supplied (cozy-living-
        // assistant.js passes CognitiveCoordinator's real per-turn result;
        // every pre-Wave-1 caller passes nothing, so this is null and
        // every return below carries cognitiveContext: null, unchanged).
        // See buildCognitiveContext()'s own header for exactly which
        // fields are real vs. honestly unknown.
        const cognitiveContext = buildCognitiveContext(cognitiveResult);
        if (typeof question !== "string" || !question.trim()) {
            return {
                answer: "A real, non-empty question is required.",
                intent: "INVALID_INPUT", responseMode: "INSUFFICIENT_EVIDENCE",
                evidenceState: "INSUFFICIENT_DATA", sources: [], reasoningUsed: false, contextUsed: [], businessDataConversationState: null, teachDataConversationState: null, cognitiveContext
            };
        }

        const router = window.CozyOS.CozyIdentityFAQRouter;
        const ai = window.CozyOS.CozyAI;

        if (!router && !ai) {
            return {
                answer: "The answer composition authorities (CozyIdentityFAQRouter / CozyAI) are not loaded in this environment.",
                intent: "UNKNOWN", responseMode: "INSUFFICIENT_EVIDENCE",
                evidenceState: "UNAVAILABLE", sources: [], reasoningUsed: false, contextUsed: [], businessDataConversationState: null, teachDataConversationState: null, cognitiveContext
            };
        }

        const whyLike = WHY_PATTERN.test(question);
        const comparisonLike = COMPARISON_PATTERN.test(question);

        // --- Step: existing FAQ/Knowledge path (identity/origin/vision/etc.) ---
        // UNIVERSAL QUESTION UNDERSTANDING REPAIR — real bug found via
        // an actual Live Window run (not just unit tests): CozyIdentityFAQRouter
        // owns no per-application knowledge and already has a real,
        // deliberate scope guard for that — "a query naming another
        // real CozyOS application is never this router's to answer"
        // (see that file's own _mentionsOtherApplication() comment) —
        // but that guard only ever sees the LITERAL text of one turn.
        // A bare pronoun follow-up naming no application at all (e.g.
        // "Who benefits from it?" right after a real, specific
        // application was under discussion) has no app name for that
        // guard to catch, so the router's own word-overlap scorer could
        // still fuzzy-match a short, low-specificity platform trigger
        // (observed live: "who benefits from cozyos" matched "Who
        // benefits from it?" purely via the shared word "benefits" once
        // the brand name and connectives are stopworded) and confidently
        // answer with the wrong, platform-level text ahead of the
        // correctly-scoped, application-specific answer. entityHint
        // (see cozy-living-assistant.js's own comment) is the SAME real
        // conversation-context signal already used to guard getContext()
        // below — applying it here too, honestly extending the router's
        // own stated scope rule to context-implied applications, not
        // only textually-named ones.
        // PHASE 3 (Teach Cozy / Governed Learning) — a pending yes/no
        // teaching-confirmation reply must NEVER be intercepted by the
        // FAQ router below. Real bug found via the real-browser test
        // suite: CozyIdentityFAQRouter has its own honest low-confidence
        // fallback (isReal:false, "I don't have a canonical answer for
        // that...") that can still report matched:true for a short,
        // ambiguous reply like "ndiyo" - which would otherwise replace
        // CozyTeachFlow's real confirm/reject/pending reply with that
        // unrelated fallback text, even though the real candidate was
        // still correctly confirmed/promoted behind the scenes (this
        // file adds no teaching logic of its own; CozyTeachFlow's real
        // state machine call already happened inside ai.getContext()
        // regardless of what gets returned here — only the user-visible
        // TEXT was at risk of being wrong). Same "checked first, ahead
        // of every other authority" discipline as cozy-ai.js's own
        // getContext() composition order.
        const skipFaqRouterForPendingTeach = !!(teachConversationState && teachConversationState.pendingCandidateId);

        let faqResult = null;
        const skipFaqRouterForNamedApp = typeof entityHint === "string" && entityHint.trim().length > 0;
        if (router && typeof router.resolve === "function" && !skipFaqRouterForNamedApp && !skipFaqRouterForPendingTeach) {
            try { faqResult = await router.resolve(question, { language }); } catch (_err) { faqResult = null; }
        }
        const faqMatched = !!(faqResult && faqResult.matched);

        // --- Step: Context Retrieval (always run — even a matched FAQ
        // question may have additional verified context worth citing,
        // and this is how a multi-intent question picks up its second
        // half, e.g. "What is CozyOS and what applications does it have?") ---
        let ctx = { success: false, results: [] };
        if (ai && typeof ai.getContext === "function") {
            try { ctx = await ai.getContext(question, { actorId, memoryQuery, entityHint, liveSessionId, supportScope, businessContext, language, businessConversationState, teachConversationState }); } catch (_err) { ctx = { success: false, results: [] }; }
        }
        const ctxResults = (ctx && Array.isArray(ctx.results)) ? ctx.results : [];
        const businessDataConversationState = (ctx && ctx.businessDataConversationState) || null;
        const teachDataConversationState = (ctx && ctx.teachDataConversationState) || null;

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
            const effLang = normalizeLanguage(language);
            let combinedAnswer = faqResult.answer;
            const extraPieces = synthesizeFromContext(question, ctxResults.filter(r => r.authority === "knowledge-registry" || r.authority === "cozy-memory" || r.authority === "living-memory"), effLang);
            let multiIntent = null;
            if (extraPieces.length > 0) {
                const secondaryIntent = classifyContextIntent(ctxResults);
                if (secondaryIntent !== "GENERAL" && secondaryIntent !== "ORIGIN_OR_STORY" && secondaryIntent !== "IDENTITY" && secondaryIntent !== "VISION") {
                    // LIVE WINDOW LANGUAGE-REALIZATION REPAIR — see
                    // synthesizeFromContext()'s own header comment above
                    // for the full root cause. English keeps the exact
                    // prior literal "Additionally: " connector, byte-
                    // identical; extraPieces above already individually
                    // honest-wraps any "knowledge-registry" content for a
                    // non-English effLang, so the non-English branch only
                    // needs a language-aware connector between pieces
                    // (or none at all for a single piece).
                    combinedAnswer = effLang === "en"
                        ? `${faqResult.answer} Additionally: ${extraPieces.join(" ")}`
                        : `${faqResult.answer} ${joinPiecesForLanguage(extraPieces, effLang)}`;
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
                contextUsed: ctxResults,
                businessDataConversationState,
                teachDataConversationState,
                cognitiveContext
            };
        }

        // --- COZY CONSTRUCTION SENTENCE ARCHITECTURE (SA-7) — tried only
        // when the FAQ router did not match (see tryConstructSemanticAnswer()'s
        // own header for the full rationale). A real, validated,
        // directly-constructed answer takes priority over the older
        // generic-context-concatenation path immediately below, for the
        // application-level questions it can actually plan for; every
        // question it declines falls through unchanged. ---
        const semanticConstruction = await tryConstructSemanticAnswer({ question, actorId, entityHint, language, cognitiveResult });
        if (semanticConstruction) {
            const { plan, candidate, evidence } = semanticConstruction;
            return {
                answer: candidate.text,
                intent: plan.goal,
                responseMode: plan.answerMode,
                evidenceState: "VERIFIED",
                sources: dedupeSources(evidence.filter((ev) => candidate.evidenceIds.includes(ev.id)).map((ev) => ({
                    authority: "semantic-answer-construction", provenance: (ev.source && ev.source.type) || "window.CozyOS.VerifiedEvidenceAdapter",
                    getter: null, namespace: null, key: ev.id, evidence: (ev.verification && ev.verification.status) || "VERIFIED",
                }))),
                reasoningUsed: candidate.evidenceIds.length > 1,
                contextUsed: ctxResults,
                businessDataConversationState, teachDataConversationState,
                cognitiveContext
            };
        }

        // --- No FAQ match: general Question-Understanding + Context path ---
        if (ctxResults.length === 0) {
            return {
                answer: "I don't have verified information to answer that yet. Please rephrase, or this may not be something CozyOS has documented/verified.",
                intent: "UNKNOWN", responseMode: "INSUFFICIENT_EVIDENCE",
                evidenceState: (ai && typeof ai.getContext === "function") ? "INSUFFICIENT_DATA" : "UNAVAILABLE",
                sources: [], reasoningUsed: false, contextUsed: [], businessDataConversationState, teachDataConversationState, cognitiveContext
            };
        }

        const intent = classifyContextIntent(ctxResults);
        const effLang = normalizeLanguage(language);
        const pieces = synthesizeFromContext(question, ctxResults, effLang);

        if (pieces.length === 0) {
            return {
                answer: "Some related context exists, but nothing in it could be honestly rendered as a verified answer.",
                intent, responseMode: "INSUFFICIENT_EVIDENCE",
                evidenceState: "INSUFFICIENT_DATA", sources: [], reasoningUsed: false, contextUsed: ctxResults, businessDataConversationState, teachDataConversationState, cognitiveContext
            };
        }

        let responseMode;
        if (whyLike) responseMode = "WHY_REASONING";
        else if (comparisonLike) responseMode = "COMPARISON";
        else if (pieces.length > 1) responseMode = "EXPLANATION";
        else responseMode = "FACT";

        // LIVE WINDOW LANGUAGE-REALIZATION REPAIR — English keeps the
        // exact prior literal " Additionally, " join, byte-identical;
        // `pieces` above already individually honest-wraps any
        // "knowledge-registry" content for a non-English effLang (see
        // synthesizeFromContext()'s own header comment), so the non-
        // English branch only needs a language-aware connector.
        const answerText = effLang === "en"
            ? (pieces.length > 1 ? pieces.join(" Additionally, ") : pieces[0])
            : joinPiecesForLanguage(pieces, effLang);

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
            contextUsed: ctxResults,
            businessDataConversationState,
            teachDataConversationState,
            cognitiveContext
        };
    }

    const CozyAnswerEngine = Object.freeze({ answer, getVersion: () => VERSION });
    window.CozyOS.CozyAnswerEngine = CozyAnswerEngine;

    window.CozyOS.Modules["cozy-answer-engine"] = Object.freeze({
        version: VERSION,
        description: "Micro-Milestone H — AnswerEngine. Composes the existing, unmodified CozyIdentityFAQRouter (identity/origin/vision/mission/differentiation/etc., tried first) and CozyAI.getContext() (CozyKnowledge VERIFIED facts + CozyMemory/Living Memory search) into one structured {answer,intent,responseMode,evidenceState,sources,reasoningUsed,contextUsed,cognitiveContext} result. No new memory/knowledge/story authority. No FounderStory reference anywhere in this file — the public/private boundary is structural, not a permission check. Never defaults actorId to \"system\". WAVE 1 (Cognitive-to-Answer Contract) — answer() now accepts an optional cognitiveResult (CognitiveCoordinator's real, already-computed SA-3 plan for this turn); when present and valid, tryConstructSemanticAnswer() reuses it instead of calling SemanticAnswerPlanner.planAnswer() a second time, and buildCognitiveContext() surfaces an honest summary of it on every return. Absent for every pre-Wave-1 caller — behavior is byte-identical when cognitiveResult is not supplied."
    });
})();
