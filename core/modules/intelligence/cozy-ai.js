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
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-ai"]) return;

    function realOrFail(name, obj) {
        if (!obj) return { success: false, isReal: false, reason: `${name} is not loaded.` };
        return null;
    }

    /** ask(question, context) — real, composes the same CognitiveCoordinator.run() the Assistant already uses. Never a second pipeline. */
    async function ask(question, context = {}) {
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

    const CozyAI = Object.freeze({ ask, answer, learn, remember, search, translate, summarize, reason, plan, getVersion: () => VERSION });
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
                        SpeechTranslationAdapter: !!window.CozyOS.SpeechTranslationAdapter
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
        description: "Universal AI Service (M369) — window.CozyOS.CozyAI, one shared facade for every CozyOS application. ask/answer/reason/plan compose the existing CognitiveCoordinator (same pipeline the Assistant already uses); learn/remember/search compose the existing, already-incremental CozyMemory; translate composes SpeechTranslationAdapter; summarize is a real, disclosed extractive summary, not semantic. No new cognitive engine, no duplicate AI logic. Registers with the existing ProviderManager."
    });
})();
