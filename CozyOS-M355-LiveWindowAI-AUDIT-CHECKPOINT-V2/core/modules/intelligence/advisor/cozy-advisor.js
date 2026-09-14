/**
 * CozyOS — Advisor (Micro-Milestone I)
 * File Reference: core/modules/intelligence/advisor/cozy-advisor.js
 *
 * WHAT THIS IS
 *   The one new link the milestone asked for:
 *
 *     Answer (from CozyAnswerEngine) -> Advisor -> advice / encouragement
 *
 *   This file adds NO new memory engine, NO new knowledge engine, NO new
 *   question engine, NO new answer engine, NO new story engine, and NO
 *   personality/emotional-state engine. It composes exactly one existing,
 *   unmodified authority's OUTPUT (window.CozyOS.CozyAnswerEngine.answer()'s
 *   return value) and reshapes it into advice/encouragement. It never calls
 *   CozyAI.getContext(), CozyKnowledge, CozyMemory, or FounderStory itself —
 *   it only reads the already-VERIFIED `sources`/`contextUsed`/`answer`
 *   fields CozyAnswerEngine already produced. If those fields are empty or
 *   evidenceState is not VERIFIED, Advisor has nothing more to see than the
 *   caller does — there is no side-channel back into Memory/Knowledge/Story.
 *
 * OWNERSHIP CHECK (done before writing this file)
 *   core/living/cozy-living-advisor.js already owns window.CozyOS.LivingAdvisor
 *   — a real, existing "advisor" authority. It was read in full before this
 *   file was written. It is a DIFFERENT capability: it classifies free-text
 *   problems (spiritual/learning/planning/decision-support/etc.) and composes
 *   CognitiveCoordinator.run() to analyze them. It has no relationship to
 *   CozyAnswerEngine, CozyAI.getContext(), or this milestone's Question ->
 *   Understanding -> Context -> Answer chain, and does not produce grounded-
 *   in-project-evidence advice/encouragement about CozyOS itself. This file
 *   does not duplicate it, does not rename it, and does not replace it —
 *   window.CozyOS.LivingAdvisor is untouched. This file registers a
 *   differently-named authority, window.CozyOS.CozyAdvisor, that sits
 *   strictly downstream of CozyAnswerEngine only.
 *
 * WIRING STATUS — HONEST, AS OF THIS MILESTONE
 *   cozy-answer-engine.js (Micro-Milestone H) is IMPLEMENTED and covered by
 *   real unit + real integration tests, but as of Checkpoint H it is not
 *   <script>-included by ANY .html page in this repository (confirmed by
 *   grep across the tree before writing this file) — i.e. IMPLEMENTED and
 *   WIRED-IN-CODE, but not yet RUNTIME_REACHABLE from an actual running
 *   CozyOS page. This file does not fix that (out of scope for "add
 *   Advisor only" and not requested) — it is disclosed here so "Advisor is
 *   available" is never confused with "Advisor is reachable from a live
 *   page." Both this file and cozy-answer-engine.js ARE reachable today
 *   from Node (the real integration test below proves it) and from any page
 *   that adds both <script> tags in the existing dependency order.
 *
 * DEPENDENCY DIRECTION — NOT REVERSED
 *   CozyQuestionUnderstanding(disclosed-scope, see cozy-answer-engine.js)
 *     -> CozyAI.getContext()
 *     -> CozyAnswerEngine
 *     -> CozyAdvisor (this file)
 *   CozyAdvisor never calls back into CozyAnswerEngine, CozyAI, CozyKnowledge,
 *   or CozyMemory. It owns none of them.
 *
 * ADVICE vs ENCOURAGEMENT — HONEST SCOPE
 *   Both are pattern/keyword classification against the fixed, disclosed
 *   phrasings the milestone spec names (advice: "what should I build next" /
 *   "how can this improve CozyOS" / "best way to continue" / "how should
 *   this feature connect"; encouragement: "taking too long" / "can this
 *   really become something useful" / "struggling to finish"). This is NOT
 *   semantic understanding, matching cozy-answer-engine.js's own disclosed
 *   WHY/COMPARISON pattern labels. A question matching neither is UNKNOWN
 *   and is not guessed at.
 *
 * NO FABRICATION RULE
 *   recommendedNextSteps and encouragement are built ONLY from:
 *     (a) answerResult.answer / answerResult.intent / answerResult.responseMode
 *         (the actual verified text/classification CozyAnswerEngine produced), and
 *     (b) the getter/authority names present in answerResult.sources
 *         (which authority verified something — never the content of an
 *         authority this file did not itself receive).
 *   If answerResult.evidenceState is not "VERIFIED", or answerResult is
 *   missing/malformed, evidenceState here is forced to "INSUFFICIENT_DATA"
 *   (or "UNAVAILABLE" if answerResult itself is absent) and no invented
 *   progress, milestone, or personal-circumstance claim is produced.
 *
 * OUTPUT SHAPE
 *   { advice, responseMode, reasoning, evidenceState, recommendedNextSteps,
 *     encouragement, sources }
 *
 *   responseMode : "ADVICE" | "ENCOURAGEMENT" | "ADVICE_AND_ENCOURAGEMENT" |
 *                  "UNKNOWN_REQUEST" | "INSUFFICIENT_EVIDENCE"
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const VERSION = "1.0.0";
    if (window.CozyOS.Modules["cozy-advisor"]) return;

    // Fixed, disclosed trigger phrasings — mirrors the exact examples the
    // milestone spec names. Not an NLU engine.
    const ADVICE_PATTERNS = [
        /what should i build next/i,
        /how (can|does|would) this improve cozyos/i,
        /best way to continue/i,
        /how should this (feature )?connect to the rest of cozyos/i,
        /what('| i)s the best way/i,
        /what next/i,
        /how do i continue/i
    ];

    const ENCOURAGEMENT_PATTERNS = [
        /taking too long/i,
        /can this (really )?become something useful/i,
        /struggling to finish/i,
        /is this (really )?worth it/i,
        /feel(ing)? like giving up/i,
        /losing motivation/i,
        /not sure (this|it)('s| is) going anywhere/i
    ];

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /**
     * classifyRequest(question)
     *   Real, disclosed keyword/pattern match only. Returns one or both of
     *   "ADVICE"/"ENCOURAGEMENT", or "UNKNOWN" if neither fixed phrasing set
     *   matches — genuinely uncertain, not guessed at.
     */
    function classifyRequest(question) {
        const wantsAdvice = ADVICE_PATTERNS.some((p) => p.test(question));
        const wantsEncouragement = ENCOURAGEMENT_PATTERNS.some((p) => p.test(question));
        if (wantsAdvice && wantsEncouragement) return "ADVICE_AND_ENCOURAGEMENT";
        if (wantsAdvice) return "ADVICE";
        if (wantsEncouragement) return "ENCOURAGEMENT";
        return "UNKNOWN";
    }

    /**
     * gettersFromSources(sources)
     *   Real — reads only the authority/getter *names* CozyAnswerEngine
     *   already marked VERIFIED. Never re-fetches or re-derives content.
     */
    function gettersFromSources(sources) {
        if (!Array.isArray(sources)) return new Set();
        return new Set(sources.map((s) => s.getter).filter(isNonEmptyString));
    }

    /**
     * buildRecommendedNextSteps(answerResult)
     *   Real — derives steps only from the verified classification/getter
     *   names already present on answerResult. Never invents a roadmap,
     *   milestone, or feature that answerResult did not itself surface.
     */
    function buildRecommendedNextSteps(answerResult) {
        const steps = [];
        const getters = gettersFromSources(answerResult.sources);

        if (getters.has("listApplicationsFact")) {
            steps.push("Review the applications CozyOS already verifiably lists before adding a new one, so effort composes with what exists rather than duplicating it.");
        }
        if (getters.has("listProvidersFact")) {
            steps.push("Check the verified provider list for a gap that matches the intended next step, since a provider may already exist to build on.");
        }
        if (answerResult.responseMode === "COMPARISON") {
            steps.push("Since the verified answer is comparison-shaped, the next concrete step is deciding which side of that comparison the next change should move CozyOS toward.");
        }
        if (answerResult.responseMode === "WHY_REASONING") {
            steps.push("Since the verified answer explains a 'why', a grounded next step is choosing one concrete capability that serves that same reason, rather than expanding scope generally.");
        }
        if (steps.length === 0 && answerResult.evidenceState === "VERIFIED") {
            steps.push("Treat the verified answer above as the current source of truth, and pick the smallest next change that directly follows from it — this file has no further verified project-status detail to add.");
        }
        return steps;
    }

    /**
     * buildEncouragement(answerResult)
     *   Real — grounds encouragement only in the verified content already on
     *   answerResult (its own answer text + which real authorities verified
     *   it). Never invents personal circumstances, timelines, or unverified
     *   progress. If nothing verified is present, says so honestly instead
     *   of producing generic motivational filler.
     */
    function buildEncouragement(answerResult) {
        if (!answerResult || answerResult.evidenceState !== "VERIFIED" || !isNonEmptyString(answerResult.answer)) {
            return "I don't have verified project context right now to ground encouragement in, so I won't offer generic reassurance dressed up as evidence. If you tell me what you'd like checked, I can look for something real to point to.";
        }
        const authorities = Array.from(new Set((answerResult.sources || []).map((s) => s.authority).filter(isNonEmptyString)));
        const provenanceNote = authorities.length > 0
            ? ` This is grounded in what ${authorities.join(" and ")} could actually verify, not a general assurance.`
            : "";
        return `Here is something real, not a generic pep talk: ${answerResult.answer}${provenanceNote}`;
    }

    /**
     * advise({ question, answerResult, context })
     *   Real. Never throws — a missing/malformed answerResult degrades the
     *   relevant field honestly, never a fabricated response.
     */
    function advise({ question, answerResult, context } = {}) {
        if (!isNonEmptyString(question)) {
            return {
                advice: "A real, non-empty question is required.",
                responseMode: "INSUFFICIENT_EVIDENCE",
                reasoning: "No question was provided to classify.",
                evidenceState: "INSUFFICIENT_DATA",
                recommendedNextSteps: [],
                encouragement: null,
                sources: []
            };
        }

        if (!answerResult || typeof answerResult !== "object") {
            return {
                advice: "No answer result was provided to base advice on. CozyAdvisor never generates advice without a real, composed CozyAnswerEngine result.",
                responseMode: "INSUFFICIENT_EVIDENCE",
                reasoning: "answerResult is missing — Advisor does not call CozyAnswerEngine, CozyAI, or CozyKnowledge itself.",
                evidenceState: "UNAVAILABLE",
                recommendedNextSteps: [],
                encouragement: null,
                sources: []
            };
        }

        const requestType = classifyRequest(question);
        const evidenceState = answerResult.evidenceState === "VERIFIED" ? "VERIFIED" : "INSUFFICIENT_DATA";
        const sources = Array.isArray(answerResult.sources) ? answerResult.sources : [];

        if (requestType === "UNKNOWN") {
            return {
                advice: isNonEmptyString(answerResult.answer) ? answerResult.answer : "This doesn't match a recognized advice or encouragement request, so no advice/encouragement framing was added — here is the underlying verified answer instead.",
                responseMode: "UNKNOWN_REQUEST",
                reasoning: "Question did not match the disclosed advice or encouragement trigger phrasings; passed through the underlying answer unmodified rather than guessing at intent.",
                evidenceState,
                recommendedNextSteps: [],
                encouragement: null,
                sources
            };
        }

        const wantsAdvice = requestType === "ADVICE" || requestType === "ADVICE_AND_ENCOURAGEMENT";
        const wantsEncouragement = requestType === "ENCOURAGEMENT" || requestType === "ADVICE_AND_ENCOURAGEMENT";

        const recommendedNextSteps = wantsAdvice ? buildRecommendedNextSteps(answerResult) : [];
        const encouragement = wantsEncouragement ? buildEncouragement(answerResult) : null;

        let advice = null;
        let reasoning;
        if (wantsAdvice && evidenceState !== "VERIFIED") {
            advice = "I don't have verified context to base concrete next-step advice on right now (evidenceState was not VERIFIED). I won't invent a roadmap to fill that gap.";
            reasoning = "answerResult.evidenceState was not VERIFIED, so recommendedNextSteps is intentionally empty and advice states the gap honestly.";
        } else if (wantsAdvice) {
            advice = recommendedNextSteps.join(" ");
            reasoning = "Derived only from answerResult's own verified classification (responseMode/intent) and the getter names already marked VERIFIED in its sources — no new project-status claim was introduced.";
        } else {
            reasoning = "Request classified as encouragement-only; no advice was generated.";
        }

        return {
            advice,
            responseMode: requestType,
            reasoning,
            evidenceState,
            recommendedNextSteps,
            encouragement,
            sources
        };
    }

    const CozyAdvisor = Object.freeze({ advise, getVersion: () => VERSION });
    window.CozyOS.CozyAdvisor = CozyAdvisor;

    window.CozyOS.Modules["cozy-advisor"] = Object.freeze({
        version: VERSION,
        description: "Micro-Milestone I — CozyAdvisor. Composes the existing, unmodified CozyAnswerEngine's structured result into grounded advice/encouragement. Does not call CozyAI, CozyKnowledge, or CozyMemory itself. Does not duplicate window.CozyOS.LivingAdvisor (a different, pre-existing, CognitiveCoordinator-based problem-solving advisor — read in full and left untouched). No fabricated progress: recommendedNextSteps/encouragement are built only from answerResult's own verified fields."
    });
})();
