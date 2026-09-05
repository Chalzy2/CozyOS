/**
 * CozyOS — Universal AI Service (CozyAI)
 * File Reference: core/modules/intelligence/cozy-ai.js
 * Milestone: M369 — Universal AI Learning & Conversation Platform
 *
 * WHAT THIS IS
 *   One shared facade, `window.CozyOS.CozyAI`, so every CozyOS
 *   application calls the same real service instead of building its
 *   own AI. Every method below composes an already-existing, real
 *   engine - this file adds NO new cognitive logic, no second
 *   reasoning/memory/translation system. It is intentionally thin.
 *
 *   ask/answer/reason/plan  -> CognitiveCoordinator.run() (unmodified,
 *                              the same pipeline the Living Assistant
 *                              already uses via LivingAI.think())
 *   learn/remember           -> CozyMemory.saveMemory() (unmodified) -
 *                              already real, already versioned/
 *                              incremental (confirmed by reading its
 *                              source: every save keeps prior versions,
 *                              never overwrites blindly)
 *   search                   -> CozyMemory.recall() (unmodified) - real
 *                              natural-language keyword/time-range search
 *   translate                -> SpeechTranslationAdapter (unmodified) -
 *                              real, browser-dependent, honestly
 *                              degrades when no on-device translator
 *                              exists (same ceiling since M362)
 *   summarize                -> real, disclosed, non-fabricated
 *                              extractive summary (first N sentences +
 *                              real length stats) - NOT an LLM-quality
 *                              summary, never claimed as more
 *
 * WHAT THIS DOES NOT DO
 *   Does not modify WindowManager, ProviderManager, ChurchIntelligence-
 *   Provider, ai-bootstrap.js, CognitiveCoordinator, CozyMemory,
 *   CozyTranslate, or SpeechTranslationAdapter - confirmed by diff
 *   before delivery. Registers itself with the existing, unmodified
 *   ProviderManager (M367) the same way every other provider does.
 *
 * LEARNING - HONEST SCOPE
 *   "Learn from pastor sermons," "learn each pastor's style over time"
 *   are real in the sense that CozyAI.learn() genuinely, incrementally
 *   stores whatever real data is given it via CozyMemory - but there is
 *   no real engine anywhere in this repository that extracts a
 *   "style" from stored sermons or improves future responses based on
 *   corrections. That would be genuine new AI/ML work, not composition,
 *   and is not built here - disclosed, not fabricated.
 *
 * MICRO-MILESTONE F — Context Integration & Intelligent Retrieval
 *   getContext(question) — NEW. A context COMPOSITION layer only, not a
 *   new memory engine. Before this milestone every authority below was
 *   real but siloed; this adds one thin method that fans a question out
 *   to the four authorities the spec names and returns whatever each
 *   one honestly has, tagged with where it came from:
 *
 *     Public Story        -> CozyKnowledge's existing getVisionFact() /
 *                             getMissionFact() / getProjectOriginFact() /
 *                             getProjectHistoryFact() / getPublicStoryFact()
 *                             (unmodified) - these already compose
 *                             FounderStory.getPublicStory(), the ONE
 *                             read path that engine exposes with no
 *                             viewerId and a public+published-only
 *                             fail-closed filter. getContext() never
 *                             calls FounderStory directly and never
 *                             touches its private/authorized read path
 *                             (canView/getChapter) - private Founder
 *                             Story content and personal biography
 *                             (DeveloperIdentity/project-history.js)
 *                             are structurally unreachable through this
 *                             method, not merely permission-checked.
 *     Knowledge Registry   -> CozyKnowledge's other existing fact
 *                             getters (getFounderFact/listApplications-
 *                             Fact/listProvidersFact, unmodified) -
 *                             every fact already carries CozyKnowledge's
 *                             own VERIFIED/NOT_FOUND evidence field;
 *                             getContext() only keeps VERIFIED facts.
 *     CozyMemory            -> CozyMemory.searchAllNamespaces()
 *                             (unmodified) - already enforces owner/
 *                             visibility/organisation-isolation per
 *                             actorId (read its source before writing
 *                             this: #checkReadVisibility() is the same
 *                             gate readMemory()/recall() use).
 *     Living Memory         -> the SAME CozyMemory.searchAllNamespaces()
 *                             call, split by the "living-" namespace
 *                             prefix living-runtime.js's own transaction/
 *                             scripture code already saves under. Read
 *                             living-runtime.js before writing this: its
 *                             `memory` getter is a thin realOrGap()
 *                             proxy straight to window.CozyOS.CozyMemory
 *                             - there is no second storage engine to
 *                             query, so a second call would only
 *                             duplicate the first. Namespace-prefix
 *                             attribution is how the real distinction
 *                             (Living Runtime's own data vs. everything
 *                             else CozyMemory holds) is preserved
 *                             without duplicating the authority.
 *
 *   Routing is real, deterministic keyword matching (same "fixed, small
 *   vocabulary, not arbitrary phrasing" discipline CozyMemory's own
 *   #parseTimeReference() already uses) against topic/knowledge routing
 *   tables - never a fabricated "understanding" of the question.
 *   CozyMemory/Living Memory are always searched (full-text search is
 *   real and already built; there is no honest reason to skip it).
 *
 *   FAIL-CLOSED IDENTITY: every other method on this file defaults
 *   actorId to "system" (a disclosed, pre-existing gap - see CozyMemory's
 *   own header). getContext() is a new, externally-reachable "answer a
 *   question" entry point, so it deliberately does NOT inherit that
 *   default: an actorId that is not a real, non-empty string is treated
 *   as "anonymous", a plain unprivileged identity, never "system". This
 *   is the one real behavioral difference from the rest of this file,
 *   and it exists specifically so a caller can't get system-level reach
 *   into CozyMemory merely by asking a question with no identity.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.1.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-ai"]) return;

    function realOrFail(name, obj) {
        if (!obj) return { success: false, isReal: false, reason: `${name} is not loaded.` };
        return null;
    }

    /**
     * ask(question, context)
     *   Real. First checks the Identity FAQ Intent Router (M-FAQ-1,
     *   additive) — a deterministic, non-generative match against
     *   canonical founder/mission/vision/etc. facts (EN + Kiswahili
     *   phrasings). If it genuinely matches, that real answer is
     *   returned directly (fast, and never at risk of the underlying
     *   LLM paraphrasing the Founder's own facts). If it does not
     *   match — or the router isn't loaded — falls through unchanged
     *   to the exact same CognitiveCoordinator.run() pipeline as
     *   before. Never a second reasoning pipeline; the router only
     *   ever reads DeveloperIdentity's public data.
     */
    async function ask(question, context = {}) {
        const router = window.CozyOS.CozyIdentityFAQRouter;
        if (router && typeof router.resolve === "function" && typeof question === "string") {
            try {
                const faqResult = await router.resolve(question, { language: context.language });
                if (faqResult && faqResult.matched) return faqResult;
            } catch (_err) { /* honest fall-through — never block the real pipeline on a router error */ }
        }
        const coordinator = window.CozyOS.CognitiveCoordinator;
        const fail = realOrFail("CognitiveCoordinator", coordinator);
        if (fail) return fail;
        return coordinator.run({ text: question, ...context });
    }

    /** answer(question) — same real pipeline as ask(), no separate "answer engine." A thin alias, not a duplicate implementation. */
    async function answer(question, context = {}) { return ask(question, context); }

    /** reason(problem) — composes the same real pipeline; problem framed as the input text. */
    async function reason(problem, context = {}) { return ask(problem, context); }

    /** plan(task) — same real pipeline; CognitiveCoordinator's own thinking stage (living-planner-baseline, M366.9) already produces real next-step suggestions. */
    async function plan(task, context = {}) { return ask(task, context); }

    /** learn(data) — real, composes CozyMemory.saveMemory(), which is already genuinely incremental (versions preserved, confirmed by reading its source before writing this) - never overwrites blindly. */
    function learn({ namespace = "cozy-ai-learning", key, value, owner = null, tags = [], actorId = "system", visibility = "private", speaker = null } = {}) {
        const memory = window.CozyOS.CozyMemory;
        const fail = realOrFail("CozyMemory", memory);
        if (fail) return fail;
        if (!key) return { success: false, reason: "A real key is required." };
        try {
            const saved = memory.saveMemory(namespace, key, value, { owner, tags, actorId, visibility, speaker });
            return { success: true, isReal: true, versionNumber: saved.versionNumber };
        } catch (err) {
            return { success: false, reason: err && err.message };
        }
    }

    /** remember(key, value) — same real CozyMemory composition, a simpler entry point for a single fact. */
    function remember(key, value, opts = {}) { return learn({ ...opts, key, value }); }

    /** search(query) — real, composes CozyMemory.recall() (natural-language keyword/time search, already built). */
    function search(query, { namespace = "cozy-ai-learning", actorId = "system" } = {}) {
        const memory = window.CozyOS.CozyMemory;
        const fail = realOrFail("CozyMemory", memory);
        if (fail) return fail;
        try {
            const results = memory.recall(namespace, query, actorId);
            return { success: true, isReal: true, results };
        } catch (err) {
            return { success: false, reason: err && err.message };
        }
    }

    /**
     * translate(text, targetLanguage, { sourceLanguage })
     *   Real, composes SpeechTranslationAdapter's existing session-based
     *   API with a one-shot convenience wrapper (creates a session,
     *   translates once, honest failure if no real translator exists).
     */
    async function translate(text, targetLanguage, { sourceLanguage = "en" } = {}) {
        const adapter = window.CozyOS.SpeechTranslationAdapter;
        const fail = realOrFail("SpeechTranslationAdapter", adapter);
        if (fail) return fail;
        const caps = typeof adapter.getCapabilities === "function" ? adapter.getCapabilities() : {};
        if (!caps.supportsTranslation) return { success: false, isReal: false, reason: "No real translator is available in this browser (honest capability ceiling, unchanged since M362)." };
        try {
            const session = adapter.startTranslationSession({ sourceLanguage, targetLanguage });
            const result = await adapter.translateText(session.id, text);
            return result;
        } catch (err) {
            return { success: false, isReal: false, reason: err && err.message };
        }
    }

    /**
     * summarize(text, { maxSentences })
     *   Real, disclosed, non-fabricated extractive summary: the first
     *   N real sentences of the actual input, plus real length stats.
     *   Never claims semantic understanding it doesn't have - the same
     *   honest, rule-based discipline as living-composition-adapter
     *   (M366.3).
     */
    function summarize(text, { maxSentences = 2 } = {}) {
        if (typeof text !== "string" || !text.trim()) return { success: false, reason: "Real, non-empty text is required." };
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        const summary = sentences.slice(0, maxSentences).join(" ").trim();
        return {
            success: true, isReal: true, summary,
            note: "Real, extractive summary (first sentences of the actual input) - not semantic/LLM-quality summarization.",
            originalLength: text.length, summaryLength: summary.length, totalSentences: sentences.length
        };
    }

    // ---------------------------------------------------------------
    // getContext() — Micro-Milestone F. Deterministic, disclosed
    // keyword routing tables (not NLU) - see the file header before
    // editing these. Keep them small and honest; a miss just means
    // that particular knowledge getter isn't tried, CozyMemory/Living
    // Memory search still runs regardless.
    // ---------------------------------------------------------------
    const CONTEXT_STORY_ROUTES = Object.freeze([
        { keywords: ["vision"], getter: "getVisionFact" },
        { keywords: ["mission"], getter: "getMissionFact" },
        { keywords: ["why", "start", "started", "origin", "founded"], getter: "getProjectOriginFact" },
        { keywords: ["history", "background"], getter: "getProjectHistoryFact" },
        { keywords: ["story"], getter: "getPublicStoryFact" }
    ]);
    const CONTEXT_KNOWLEDGE_ROUTES = Object.freeze([
        { keywords: ["architecture", "application", "app", "module", "system"], getter: "listApplicationsFact" },
        { keywords: ["provider"], getter: "listProvidersFact" },
        { keywords: ["founder", "creator", "who made", "who built", "who created"], getter: "getFounderFact" }
    ]);

    /** #matchRoutes() — real substring matching against a fixed keyword table. Not semantic; disclosed as such in the file header. */
    function matchRoutes(question, table) {
        const q = question.toLowerCase();
        const matched = [];
        for (const route of table) {
            if (route.keywords.some(k => q.includes(k))) matched.push(route.getter);
        }
        return matched;
    }

    /**
     * getContext(question, { actorId, memoryQuery })
     *   Real. See the MICRO-MILESTONE F section of the file header for
     *   what each composed authority is and why. Never throws - a
     *   missing/throwing dependency degrades that one authority to
     *   "no results from it", the same fail-closed convention
     *   CozyKnowledge already uses, never a fabricated answer.
     */
    async function getContext(question, { actorId = null, memoryQuery = null } = {}) {
        if (typeof question !== "string" || !question.trim()) {
            return { success: false, reason: "A real, non-empty question is required." };
        }
        const effectiveActorId = (typeof actorId === "string" && actorId.trim()) ? actorId : "anonymous";
        const results = [];

        // --- Public Story + Knowledge Registry (both via CozyKnowledge; never FounderStory directly) ---
        const knowledge = window.CozyOS.CozyKnowledge;
        if (knowledge) {
            const getterNames = [...new Set([...matchRoutes(question, CONTEXT_STORY_ROUTES), ...matchRoutes(question, CONTEXT_KNOWLEDGE_ROUTES)])];
            for (const getterName of getterNames) {
                const fn = knowledge[getterName];
                if (typeof fn !== "function") continue;
                try {
                    const fact = await fn();
                    if (fact && fact.evidence === "VERIFIED") {
                        results.push({
                            authority: fact.source === "window.CozyOS.FounderStory" ? "public-story" : "knowledge-registry",
                            provenance: fact.source || "window.CozyOS.CozyKnowledge",
                            getter: getterName,
                            evidence: fact.evidence,
                            content: fact.answer
                        });
                    }
                } catch (_err) { /* honest fall-through — never fabricate */ }
            }
        }

        // --- CozyMemory + Living Memory: fan real recall() (keyword/time-phrase
        // matching, already built) across every real namespace from
        // listNamespaces() (unmodified), split by the real "living-" namespace
        // prefix. Composes two existing public methods; adds no new matching
        // logic of its own — recall() already tokenizes a natural-language
        // question far better than a literal-substring search would.
        const memory = window.CozyOS.CozyMemory;
        const query = (typeof memoryQuery === "string" && memoryQuery.trim()) ? memoryQuery : question;
        if (memory && typeof memory.listNamespaces === "function" && typeof memory.recall === "function") {
            let namespaces = [];
            try { namespaces = memory.listNamespaces() || []; } catch (_err) { namespaces = []; }
            for (const ns of namespaces) {
                let hits = [];
                try { hits = memory.recall(ns.name, query, effectiveActorId) || []; } catch (_err) { hits = []; }
                const isLiving = typeof ns.name === "string" && ns.name.startsWith("living-");
                for (const hit of hits) {
                    results.push({
                        authority: isLiving ? "living-memory" : "cozy-memory",
                        provenance: isLiving ? "window.CozyOS.CozyMemory (living-* namespace, owned by living-runtime.js)" : "window.CozyOS.CozyMemory",
                        namespace: ns.name,
                        key: hit.key,
                        matchedKeywords: hit.matchedKeywords,
                        owner: hit.entry.owner,
                        visibility: hit.entry.visibility,
                        savedBy: hit.entry.savedBy,
                        savedAt: hit.entry.savedAt,
                        versionNumber: hit.entry.versionNumber,
                        content: hit.entry.value
                    });
                }
            }
        }

        return {
            success: true, isReal: true, question, actorId: effectiveActorId,
            found: results.length > 0, results,
            note: results.length > 0
                ? "Composed from existing, unmodified authorities: CozyKnowledge (VERIFIED facts only, includes Public Story via FounderStory.getPublicStory()) and CozyMemory (owner/visibility/organisation-enforced search, split into cozy-memory / living-memory by namespace)."
                : "No context genuinely matched in any composed authority — honest empty state, not a fabricated answer."
        };
    }

    const CozyAI = Object.freeze({ ask, answer, learn, remember, search, translate, summarize, reason, plan, getContext, getVersion: () => VERSION });
    window.CozyOS.CozyAI = CozyAI;

    // Register with the real, existing ProviderManager (M367) - same
    // discovery mechanism every other provider uses.
    (function deferredRegister(attempts) {
        const pm = window.CozyOS.ProviderManager;
        if (pm && typeof pm.register === "function") {
            pm.register({
                id: "cozy-ai", name: "Universal AI Service", category: "platform", version: VERSION,
                getHealth: () => ({
                    health: window.CozyOS.CognitiveCoordinator ? "ONLINE" : "INITIALIZING",
                    composedEngines: {
                        CognitiveCoordinator: !!window.CozyOS.CognitiveCoordinator,
                        CozyMemory: !!window.CozyOS.CozyMemory,
                        SpeechTranslationAdapter: !!window.CozyOS.SpeechTranslationAdapter,
                        CozyIdentityFAQRouter: !!window.CozyOS.CozyIdentityFAQRouter,
                        CozyKnowledge: !!window.CozyOS.CozyKnowledge
                    }
                })
            });
            return;
        }
        if (attempts >= 40) return;
        setTimeout(() => deferredRegister(attempts + 1), 250);
    })(0);

    window.CozyOS.Modules["cozy-ai"] = Object.freeze({
        version: VERSION,
        description: "Universal AI Service (M369, + Identity FAQ Router pass, + Micro-Milestone F Context Retrieval) — window.CozyOS.CozyAI, one shared facade for every CozyOS application. ask/answer/reason/plan first check the additive CozyIdentityFAQRouter (deterministic EN/Kiswahili founder-mission-vision Q&A from the real public DeveloperIdentity) and, if unmatched, fall through unchanged to the existing CognitiveCoordinator pipeline. learn/remember/search compose the existing, already-incremental CozyMemory; translate composes SpeechTranslationAdapter; summarize is a real, disclosed extractive summary, not semantic. getContext(question) is a NEW, additive context-composition-only method: deterministic keyword routing fans a question out to CozyKnowledge (VERIFIED facts only, including Public Story via its existing FounderStory.getPublicStory() composition) and CozyMemory.searchAllNamespaces() (owner/visibility/organisation-enforced, split into cozy-memory/living-memory by the real 'living-' namespace prefix). Never calls FounderStory's private read path; never defaults actorId to \"system\" (unlike every other method here) so an unidentified caller only ever sees what CozyMemory's own visibility check already allows an unprivileged actor to see. No new cognitive engine, no new memory store, no duplicate AI logic. Registers with the existing ProviderManager."
    });
})();
