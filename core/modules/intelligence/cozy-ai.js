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
        { keywords: ["founder", "creator", "who made", "who built", "who created"], getter: "getFounderFact" },
        // UNIVERSAL QUESTION UNDERSTANDING REPAIR — real root cause of
        // the observed "How is human benefits with it in real life?" /
        // "Human benefits with cozyos" / "What problems does cozyos
        // solve in real life" regression: these two real, already-
        // VERIFIED CozyOS-platform facts (getWhyUseCozyOSFact() /
        // getDifferentiationFact() — see cozy-public-knowledge-source.js,
        // condensing the owner-approved "solves practical, everyday
        // problems... for individuals, churches, schools, and
        // communities" / differentiation content) were never reachable
        // from THIS generic fallback path at all, because no keyword
        // route pointed to them. Whenever a question reached getContext()
        // without matching any higher-level intent (the FAQ router's
        // fixed trigger list, or the rule-based provider's own regex
        // set) — which is exactly what happens for genuinely indirect
        // or malformed phrasing no fixed pattern anticipated — this
        // left ctxResults empty (or non-empty-but-unrenderable) for
        // every human-benefit/problem-solved-style question, producing
        // the dishonest-sounding "Some related context exists, but
        // nothing in it could be honestly rendered" / "I don't have
        // verified information" fallbacks even though real, verified,
        // on-topic content existed the whole time.
        //
        // This is a routing-table addition only — no new knowledge, no
        // new authority, no per-phrase regex. Deliberately broad,
        // low-specificity keyword stems (substring-matched, so
        // "benefit"/"benefits", "problem"/"problems", "important"/
        // "importance" are each covered by one stem) because this path
        // is the LAST resort after every more specific router has
        // already had a chance to answer — see
        // _mentionsNamedApplication() below for the one honesty guard
        // this needs: never answer with PLATFORM-level content when the
        // question actually names a specific sub-application (that
        // remains getApplicationHumanPurposeFact()'s job).
        { keywords: ["benefit", "gain", "useful", "usefulness"], getter: "getWhyUseCozyOSFact" },
        { keywords: ["problem", "solve", "solving", "solves"], getter: "getWhyUseCozyOSFact" },
        // LIVE WINDOW NEXT REPAIR — real production gap: "How can
        // cozyos helps churches" names no specific application (unlike
        // "How does ChurchOS help people?", which _mentionsNamedApplication()
        // already routes away from this platform-level path), so it
        // belongs here, but no keyword stem covered "help"/"helps" —
        // only the already-covered "benefit"/"problem"/"important"
        // stems did. getWhyUseCozyOSFact() already, honestly, names
        // churches/schools/communities as real beneficiaries (see the
        // comment above) — this was a routing gap, not a knowledge gap.
        { keywords: ["help"], getter: "getWhyUseCozyOSFact" },
        { keywords: ["important", "importance", "matter", "point of cozyos"], getter: "getDifferentiationFact" },
        // LIVE WINDOW INCOGNITO REPAIR — real production gap: general
        // "I want to know more about CozyOS" / "Tell me more about
        // CozyOS" / "Learn more about CozyOS" phrasing shared no
        // keyword stem with any route above (nor any FAQ router
        // trigger), so getContext() returned zero results for this
        // whole phrasing class regardless of actor identity — the
        // question was never "personal", it was a genuine routing gap
        // in application/public knowledge retrieval. getWhyUseCozyOSFact()
        // already, honestly, describes what CozyOS is and who it's for
        // (see the "benefit"/"help" stems above, same getter, same
        // PLATFORM_ONLY_GETTERS guard so a question naming a real,
        // specific sub-application still defers to that application's
        // own answer instead of this platform-level one).
        { keywords: ["know more", "learn more", "more about cozyos", "tell me more"], getter: "getWhyUseCozyOSFact" },
        // LIVE WINDOW INCOGNITO REPAIR — the bare general-description
        // question ("What is CozyOS?", "CozyOS ni nini?", "What can
        // CozyOS do?", "CozyOS inafanya nini?", "CozyOS ina msaada
        // gani?") shares no keyword stem with anything above either —
        // every existing route requires a more specific word (benefit/
        // problem/help/vision/etc.) that a bare "what is X" question
        // never contains. These are exact, literal EN+SW phrasings of
        // the SAME single underlying "what is/does CozyOS (do)" intent
        // (the codebase's own established phrase-routing pattern —
        // see the FAQ router's own EN/SW TRIGGERS lists — not a new
        // per-language branch), all resolving to the SAME single real
        // getter as the routes above. No new knowledge, no new
        // authority, no language-specific logic of its own.
        {
            keywords: [
                "what is cozyos", "what's cozyos", "what can cozyos do", "what does cozyos do",
                "cozyos ni nini", "cozyos inafanya nini", "cozyos ina msaada gani"
            ],
            getter: "getWhyUseCozyOSFact"
        }
    ]);

    /**
     * _resolveNamedApplication(question)
     *   LIVE WINDOW APPLICATION SEMANTIC UNDERSTANDING REPAIR — real,
     *   dynamic entity resolution against the live application registry
     *   (window.CozyOS.listApplications() — the SAME source
     *   resolveApplicationByName()/listApplicationsFact() already read;
     *   no second inventory, no hardcoded app-name list). Returns the
     *   real, matched {id, name} record, or null.
     *
     *   Two passes, both against the SAME real registry, never a second
     *   knowledge source:
     *     1. Exact substring (whitespace/case-normalized) — the fast,
     *        unambiguous path this file already had.
     *     2. Fuzzy — reuses window.CozyOS.CozyLearn.levenshtein() (the
     *        ONE real, already-loaded edit-distance primitive this
     *        repository uses for spelling correction elsewhere, see
     *        cozy-learn.js's own suggestCorrection()) against each
     *        word/short-phrase in the question, so a genuine typo
     *        ("InteresOs" for "InterestOS") still resolves without a
     *        hand-built typo dictionary. Same safety threshold formula
     *        CozyLearn's own suggestCorrection() already uses
     *        (distance <= min(2, max(1, floor(name.length*0.3)))) —
     *        not a new, looser rule. Degrades to exact-substring-only,
     *        never throws, when CozyLearn isn't loaded.
     */
    function _resolveNamedApplication(question) {
        // Same two-source lookup as resolveApplicationByName() (rule-
        // based-conversational-provider.js) and getApplicationFact()/
        // getApplicationHumanPurposeFact() (cozy-knowledge-registry.js)
        // — the real window.CozyOS.listApplications() facade first,
        // window.CozyOS.ServiceRegistry.listApplications() as the same
        // honest fallback those other call sites already use. Not a
        // second/competing lookup path.
        const lister = (window.CozyOS && typeof window.CozyOS.listApplications === "function" && window.CozyOS.listApplications)
            || (window.CozyOS && window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.listApplications === "function" && (() => window.CozyOS.ServiceRegistry.listApplications()));
        if (!lister) return null;
        const apps = (() => { try { return lister(); } catch (_err) { return null; } })();
        if (!Array.isArray(apps)) return null;
        const validApps = apps.filter((a) => a && typeof a.name === "string" && a.name.trim().length > 0);

        const q = question.toLowerCase().replace(/\s+/g, "");
        const exact = validApps.find((a) => q.includes(a.name.toLowerCase().replace(/\s+/g, "")));
        if (exact) return { id: exact.id, name: exact.name };

        const learn = window.CozyOS && window.CozyOS.CozyLearn;
        if (!learn || typeof learn.levenshtein !== "function") return null;
        const words = question.toLowerCase().match(/[a-z]+/g) || [];
        let best = null;
        for (const word of words) {
            if (word.length < 4) continue; // too short to safely fuzzy-match (same guard cozy-learn.js's own detectUnknownTerms() uses)
            for (const app of validApps) {
                const needle = app.name.toLowerCase().replace(/\s+/g, "");
                if (needle.length < 4) continue;
                // Real, ordinary English/Kiswahili words that legitimately
                // appear in these questions ("churches" in "help
                // churches") can land within a small edit distance of a
                // real app name ("ChurchOS") purely by coincidence — a
                // real false-positive this file's own regression suite
                // caught. Every real CozyOS application name in this
                // registry ends in a short, disclosed, consistent suffix
                // (the "OS" naming convention, or a real full word like
                // "Authenticator") — requiring the candidate word's own
                // final two letters to match the app name's final two
                // letters is a genuine, structural signal from the SAME
                // real naming convention every application already
                // follows, not a new per-word dictionary, and it still
                // accepts real typos (an ordinary typo very rarely
                // changes a word's own last two letters) while rejecting
                // an unrelated, correctly-spelled word that merely
                // resembles the prefix.
                if (word.slice(-2) !== needle.slice(-2)) continue;
                const distance = learn.levenshtein(word, needle);
                const maxAllowed = Math.min(2, Math.max(1, Math.floor(needle.length * 0.3)));
                if (distance <= maxAllowed && (!best || distance < best.distance)) {
                    best = { app, distance };
                }
            }
        }
        return best ? { id: best.app.id, name: best.app.name } : null;
    }

    /** Backward-compatible boolean wrapper — see _resolveNamedApplication() above, the one real resolver both this and getContext()'s application-knowledge routing (below) share. */
    function _mentionsNamedApplication(question) {
        return !!_resolveNamedApplication(question);
    }

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
     * getContext(question, { actorId, memoryQuery, entityHint,
     *                         liveSessionId, supportScope })
     *   Real. See the MICRO-MILESTONE F section of the file header for
     *   what each composed authority is and why. Never throws - a
     *   missing/throwing dependency degrades that one authority to
     *   "no results from it", the same fail-closed convention
     *   CozyKnowledge already uses, never a fabricated answer.
     *
     *   liveSessionId (LIVE INTEGRATION AUDIT addition, optional) — a
     *   real ChurchOS worship-service id, the same one living-worship-
     *   player.js's own #serviceId already binds to (read by the caller,
     *   cozy-living-assistant.js's #send(), via LivingWorshipPlayer.
     *   getDiagnosticsReport().serviceId — never a second "which session
     *   is this" tracker). When supplied and a real, still-active
     *   ChurchWorshipSession service is found under that id, composes
     *   its own real getActiveService()/getRecentTranscript()/
     *   getServiceTimeline() into one honestly-labeled "live-worship-
     *   session" result — the ONLY way this file (or Live Window) can
     *   answer "what did the pastor just say" from the actual live
     *   transcript instead of fabricating an answer. No new speech/
     *   transcript/session engine — pure composition of the existing
     *   ChurchWorshipSession, same fail-closed discipline as every other
     *   authority here: an unknown/ended session id is silently skipped
     *   (never a fabricated "no service" claim pretending to be current
     *   context), so the caller's own "no context found" honesty path
     *   still applies.
     *
     *   supportScope (SUPPORT INTEGRATION addition, optional) — the SAME
     *   Live Window / same getContext() call, consumed under a THIRD,
     *   distinct authorization context: a CozyOS platform administrator
     *   with a real, active, scoped OrganizationSupport grant for the
     *   organization that owns liveSessionId. This never creates a
     *   second AI/context system — it is one additional, clearly-
     *   labeled "live-support-diagnostics" result entry, added ONLY when
     *   ALL of the following are independently, freshly verified here
     *   (never cached, never assumed from a prior call):
     *     1. liveSessionId resolves to a real, still-active
     *        ChurchWorshipSession service (same check the participant
     *        path above already performs);
     *     2. ChurchLiveSessionController.getSessionBundle(liveSessionId)
     *        resolves a real {orgId, hostUserId, ldceSessionId} bundle
     *        (the real, existing LDCE<->ChurchWorshipSession pairing —
     *        no second lookup table);
     *     3. IdentityEngine.isPlatformAdmin(actorId) is real and true;
     *     4. OrganizationSupport.isSupportActive(orgId, actorId,
     *        { requiredScope: supportScope }) reports a real, live
     *        (non-expired, non-revoked) grant for exactly that scope.
     *   Any one of these failing means this entry is silently omitted —
     *   the exact same fail-closed discipline as every other authority
     *   in this function, never a partial or downgraded diagnostic. A
     *   normal participant call (no supportScope, or an actor who is
     *   not a platform admin, or no active grant) can never reach this
     *   branch, so the participant/support contexts never mix in the
     *   same result set. Every real inspection this branch performs is
     *   also recorded via OrganizationSupport.recordSupportAction() —
     *   inspecting a session's live technical state under a support
     *   grant is itself an auditable action, per that file's own
     *   auditability requirement. This never moderates, never joins,
     *   never changes any session state — read-only composition of
     *   already-existing engines (LDCESessionEngine.getSession()/
     *   listParticipants(), ChurchLiveModerationControls.getSlowMode()/
     *   getQuestionsEnabled()) for a platform admin's own diagnostic
     *   view; corrective action still goes through those same existing,
     *   real, permission-checked engines, never a new one.
     */
    async function getContext(question, { actorId = null, memoryQuery = null, entityHint = null, liveSessionId = null, supportScope = null, businessContext = null, language = null, businessConversationState = null } = {}) {
        if (typeof question !== "string" || !question.trim()) {
            return { success: false, reason: "A real, non-empty question is required." };
        }
        const effectiveActorId = (typeof actorId === "string" && actorId.trim()) ? actorId : "anonymous";
        const results = [];
        let businessDataConversationState = null;

        // --- InterestOS business-DATA question (Phase 2: CozyAI + Live
        // Window Business-Data Q&A) — distinct from businessContext above
        // (that narrower hook only fires when a CALLER, e.g. InterestOS's
        // own embedded "Ask CozyAI" widget, already knows exactly which
        // table/period it means). This composes CozyBusinessDataIntent's
        // real, disclosed classifier + the SAME InterestOSBusinessWorkspace
        // as the one authoritative business-data source, for a genuinely
        // free-text question asked from the Live Window itself, with no
        // pre-selected table. Returns null (true no-op) for any question
        // with no business-data signal at all — see that file's own
        // header. Never touches CozyKnowledge/CozyMemory — this is
        // private, per-actor data, structurally kept out of the public
        // knowledge registry.
        // Skipped when a caller (e.g. InterestOS's own embedded "Ask
        // CozyAI" widget) already supplied an explicit businessContext —
        // that caller already knows exactly which table/period it means,
        // so auto-classifying the same question here would only ever
        // produce a redundant second statement of the same real number,
        // never a wrong one, but never a needed one either.
        const businessIntent = window.CozyOS.CozyBusinessDataIntent;
        if (businessIntent && typeof businessIntent.answerBusinessDataQuestion === "function" && !businessContext) {
            try {
                const businessResult = businessIntent.answerBusinessDataQuestion(question, { actorId: effectiveActorId, language, conversationState: businessConversationState });
                if (businessResult && businessResult.matched && businessResult.content) {
                    results.push({
                        authority: "interestos-business-data",
                        provenance: "window.CozyOS.CozyBusinessDataIntent -> window.CozyOS.InterestOSBusinessWorkspace",
                        evidence: "VERIFIED",
                        content: businessResult.content
                    });
                    businessDataConversationState = businessResult.updatedConversationState || null;
                }
            } catch (_err) { /* honest fall-through — never fabricate */ }
        }

        // --- Public Story + Knowledge Registry (both via CozyKnowledge; never FounderStory directly) ---
        const knowledge = window.CozyOS.CozyKnowledge;
        if (knowledge) {
            // LIVE WINDOW APPLICATION SEMANTIC UNDERSTANDING REPAIR —
            // listApplicationsFact() joined the platform-only suppression
            // set: a question that names one specific, real application
            // is wrong to answer with "here is the full app list" just
            // as much as it's wrong to answer with generic CozyOS
            // purpose text — both are platform-wide content standing in
            // for the named application's own real, existing knowledge
            // (composed just below).
            const PLATFORM_ONLY_GETTERS = new Set(["getWhyUseCozyOSFact", "getDifferentiationFact", "listApplicationsFact"]);
            // See _resolveNamedApplication() below AND this file's
            // caller (cozy-living-assistant.js's #send()) for the fuller
            // explanation: a THIS-TURN literal (or safely fuzzy-matched
            // — see _resolveNamedApplication()) app name is one real
            // signal that platform-level content is wrong here; an
            // explicit entityHint carried over from the real, previous
            // turn's conversationState.lastDiscussedApplication (a
            // pronoun follow-up naming no application of its own, e.g.
            // "Who benefits from it?" right after ShopOS) is the other.
            // Either one alone is sufficient to suppress the generic
            // CozyOS-platform routes below - never a guess, both trace
            // back to the SAME single entity-resolution authority.
            const namedApplication = _resolveNamedApplication(question)
                || ((typeof entityHint === "string" && entityHint.trim()) ? _resolveNamedApplication(entityHint) : null);
            const namesAnApp = !!namedApplication || (typeof entityHint === "string" && entityHint.trim().length > 0);
            let getterNames = [...new Set([...matchRoutes(question, CONTEXT_STORY_ROUTES), ...matchRoutes(question, CONTEXT_KNOWLEDGE_ROUTES)])];
            if (namesAnApp) getterNames = getterNames.filter((g) => !PLATFORM_ONLY_GETTERS.has(g));

            // --- Named-application knowledge (LIVE WINDOW APPLICATION
            // SEMANTIC UNDERSTANDING REPAIR) — when the question (or the
            // carried-forward conversational entity) names one real,
            // specific application, THAT application's own real,
            // already-loaded human-purpose knowledge is the authoritative
            // source, composed via getApplicationDetailedInfoFact() — the
            // SAME existing, real, already-tested composition function
            // the rule-based conversational provider's own "app-info"/
            // "app-importance" intents already use elsewhere in this
            // repository (no second application-knowledge store, no new
            // per-application logic). language, when given, is the SAME
            // per-turn language signal cozy-living-assistant.js already
            // resolves via LivingAI.think()/rule-based-conversational-
            // provider.js's own resolveLanguage() — this function adds no
            // language detection or translation of its own;
            // getApplicationDetailedInfoFact()/resolvePurposeForLanguage()
            // already do real, disclosed, fail-closed EN/SW resolution
            // per field, honestly reporting NOT_FOUND (never a silent
            // English substitution) when a Kiswahili payload genuinely
            // doesn't exist for that application yet.
            if (namedApplication && typeof knowledge.getApplicationDetailedInfoFact === "function") {
                try {
                    const detailFact = knowledge.getApplicationDetailedInfoFact(namedApplication.name, language);
                    if (detailFact && detailFact.evidence === "VERIFIED" && detailFact.answer) {
                        results.push({
                            authority: "application-knowledge",
                            provenance: "window.CozyOS.CozyKnowledge.getApplicationDetailedInfoFact",
                            applicationName: namedApplication.name,
                            evidence: "VERIFIED",
                            content: detailFact.answer
                        });
                    }
                } catch (_err) { /* honest fall-through — never fabricate */ }
            }

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

        // --- Live Worship Session (LIVE INTEGRATION AUDIT addition) ---
        if (typeof liveSessionId === "string" && liveSessionId.trim()) {
            const worship = window.CozyOS.ChurchWorshipSession;
            if (worship && typeof worship.getActiveService === "function") {
                let active = null;
                try { active = worship.getActiveService(liveSessionId); } catch (_err) { active = null; }
                if (active) {
                    const pieces = [];
                    try {
                        const recent = typeof worship.getRecentTranscript === "function" ? worship.getRecentTranscript(liveSessionId, { limit: 5 }) : null;
                        if (recent && recent.available && recent.entries.length > 0) {
                            pieces.push(`Most recently spoken (${active.sourceLanguage}): ${recent.entries.map(e => `"${e.text}"`).join(" ")}`);
                        }
                    } catch (_err) { /* honest fall-through */ }
                    try {
                        const timeline = typeof worship.getServiceTimeline === "function" ? worship.getServiceTimeline(liveSessionId) : null;
                        if (timeline && timeline.available && timeline.timeline.length > 0) {
                            const lastMarker = timeline.timeline[timeline.timeline.length - 1];
                            pieces.push(`Current service section: ${lastMarker.sectionType}${lastMarker.label ? ` (${lastMarker.label})` : ""}.`);
                        }
                        if (timeline && timeline.available && timeline.bibleReferences.length > 0) {
                            const lastRef = timeline.bibleReferences[timeline.bibleReferences.length - 1];
                            pieces.push(`Last Scripture reference detected: ${lastRef.rawMatch || `${lastRef.book} ${lastRef.chapter}:${lastRef.verseStart}`}.`);
                        }
                    } catch (_err) { /* honest fall-through */ }
                    // SUPPORT INTEGRATION fix: church-live-moderation-
                    // controls.js's setQuestionsEnabled()/getQuestionsEnabled()
                    // are keyed by the real LDCE sessionId (they call
                    // ldce.getSession(sessionId) internally), never by
                    // ChurchWorshipSession's own worshipServiceId that
                    // liveSessionId actually is (see this function's own
                    // header). Resolving the real pairing via
                    // ChurchLiveSessionController.getLdceSessionIdFor()
                    // (the same real pairing organization-workspace.js's
                    // own Toggle Questions control already uses) fixes a
                    // real, previously-silent bug: the line below was
                    // always looking up a key that could never match,
                    // always falling back to the default "DISABLED"
                    // state regardless of what the host actually set.
                    const sessionCtl = window.CozyOS.ChurchLiveSessionController;
                    const ldceSessionId = (sessionCtl && typeof sessionCtl.getLdceSessionIdFor === "function")
                        ? sessionCtl.getLdceSessionIdFor(liveSessionId) : null;

                    // Questions ON/OFF — composes church-live-moderation-
                    // controls.js's own real host toggle (see that file's
                    // setQuestionsEnabled()/getQuestionsEnabled()) so Live
                    // Window never claims a user can ask the pastor a
                    // question when the host has genuinely disabled that.
                    try {
                        const modControls = window.CozyOS.ChurchLiveModerationControls;
                        if (modControls && typeof modControls.getQuestionsEnabled === "function" && ldceSessionId) {
                            const qState = modControls.getQuestionsEnabled(ldceSessionId);
                            if (qState && qState.status === "OK") {
                                pieces.push(`Live questions to the host are currently ${qState.enabled ? "ENABLED" : "DISABLED"} for this session.`);
                            }
                        }
                    } catch (_err) { /* honest fall-through */ }

                    if (pieces.length > 0) {
                        results.push({
                            authority: "live-worship-session",
                            provenance: "window.CozyOS.ChurchWorshipSession",
                            liveSessionId,
                            evidence: "VERIFIED",
                            content: pieces.join(" ")
                        });
                    }

                    // --- SUPPORT INTEGRATION: live-support-diagnostics ---
                    // See this function's own header comment for the full
                    // four-point authorization this branch independently,
                    // freshly re-verifies every call — never cached, never
                    // inherited from the participant path above. A normal
                    // participant call (no supportScope) never reaches
                    // this branch at all.
                    if (typeof supportScope === "string" && supportScope.trim() && effectiveActorId !== "anonymous") {
                        try {
                            const identity = window.CozyOS.IdentityEngine;
                            const support = window.CozyOS.OrganizationSupport;
                            const bundle = (sessionCtl && typeof sessionCtl.getSessionBundle === "function") ? sessionCtl.getSessionBundle(liveSessionId) : null;
                            if (identity && typeof identity.isPlatformAdmin === "function" && identity.isPlatformAdmin(effectiveActorId) &&
                                support && typeof support.isSupportActive === "function" && bundle && bundle.orgId) {
                                const grant = support.isSupportActive(bundle.orgId, effectiveActorId, { requiredScope: supportScope });
                                if (grant && grant.active) {
                                    const diag = [];
                                    diag.push(`Worship service ${liveSessionId} (org ${bundle.orgId}, host ${bundle.hostUserId}), source language ${active.sourceLanguage}.`);

                                    const ldce = window.CozyOS.LDCESessionEngine;
                                    if (ldce && ldceSessionId) {
                                        try {
                                            const ldceSession = typeof ldce.getSession === "function" ? ldce.getSession(ldceSessionId) : null;
                                            // listParticipants() is fail-closed to a real host/participant
                                            // requester (see that file's own comment) — this passes the
                                            // real session hostId as the requester, a read-only technical
                                            // lookup on our already-support-authorized side, never a new
                                            // authorization path of its own.
                                            const roster = typeof ldce.listParticipants === "function" ? ldce.listParticipants(ldceSessionId, bundle.hostUserId) : [];
                                            if (ldceSession) diag.push(`LDCE session ${ldceSessionId}: ${roster.length} participant record(s), state "${ldceSession.state || "unknown"}".`);
                                        } catch (_err) { /* honest fall-through */ }
                                    }
                                    const modControls = window.CozyOS.ChurchLiveModerationControls;
                                    if (modControls && ldceSessionId) {
                                        try {
                                            const slow = typeof modControls.getSlowMode === "function" ? modControls.getSlowMode(ldceSessionId) : null;
                                            if (slow) diag.push(`Slow mode: ${slow.intervalMs > 0 ? slow.intervalMs + "ms" : "off"}.`);
                                            const qState = typeof modControls.getQuestionsEnabled === "function" ? modControls.getQuestionsEnabled(ldceSessionId) : null;
                                            if (qState && qState.status === "OK") diag.push(`Questions: ${qState.enabled ? "ON" : "OFF"}.`);
                                        } catch (_err) { /* honest fall-through */ }
                                    }

                                    results.push({
                                        authority: "live-support-diagnostics",
                                        provenance: "window.CozyOS.OrganizationSupport",
                                        liveSessionId,
                                        orgId: bundle.orgId,
                                        grantId: grant.grantId,
                                        evidence: "VERIFIED",
                                        content: diag.join(" ")
                                    });

                                    if (typeof support.recordSupportAction === "function") {
                                        try { support.recordSupportAction(grant.grantId, "live-context-inspected", { liveSessionId, question }); } catch (_err) { /* non-fatal */ }
                                    }
                                }
                            }
                        } catch (_err) { /* honest fall-through — never fabricate, never widen access on error */ }
                    }
                }
                // An unknown/ended session id is silently skipped — never
                // a fabricated "no live service" claim standing in for
                // real context (see this function's own header comment).
            }
        }

        // --- CozyMemory + Living Memory: fan real recall() (keyword/time-phrase
        // matching, already built) across every real namespace from
        // listNamespaces() (unmodified), split by the real "living-" namespace
        // prefix. Composes two existing public methods; adds no new matching
        // logic of its own — recall() already tokenizes a natural-language
        // question far better than a literal-substring search would.
        //
        // LIVE WINDOW INCOGNITO REPAIR — real, confirmed gap: this fan-out
        // previously searched EVERY namespace with no exclusion, including
        // CognitiveCoordinator.run()'s own internal bookkeeping namespace
        // ("cognitive-default" — see that file's own saveMemory() call,
        // which stores {input: <the raw question text>, outcome: <its own
        // internal trace>}). That record is not personal/project
        // knowledge a user asked CozyOS to remember — it's the
        // coordinator's own execution log — but because its `input` field
        // literally repeats prior question text, a related follow-up
        // question would keyword-match its own earlier self and get
        // pushed into `results` as an unrenderable non-string `content`
        // (an object, not text), which incorrectly turned a genuinely
        // empty context into a false non-empty one — masking real
        // application-knowledge routes and confusing the honest-empty-
        // state fallback in cozy-answer-engine.js. This exclusion is
        // narrow (the one literal, documented namespace name
        // CognitiveCoordinator itself uses for this purpose — see
        // cozy-living-assistant.js's own #send() comment, which already
        // assumed this exclusion existed) and actor-agnostic: it applies
        // identically to anonymous and signed-in callers, and every real
        // namespace a feature or user actually saves under (e.g.
        // "cozy-ai-learning", "living-*", "interestos:*") is untouched.
        const COORDINATOR_INTERNAL_NAMESPACES = new Set(["cognitive-default"]);
        const memory = window.CozyOS.CozyMemory;
        const query = (typeof memoryQuery === "string" && memoryQuery.trim()) ? memoryQuery : question;
        if (memory && typeof memory.listNamespaces === "function" && typeof memory.recall === "function") {
            let namespaces = [];
            try { namespaces = memory.listNamespaces() || []; } catch (_err) { namespaces = []; }
            namespaces = namespaces.filter((ns) => !(ns && COORDINATOR_INTERNAL_NAMESPACES.has(ns.name)));
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

        // --- InterestOS business-data summary (BUSINESS INTEGRATION addition) ---
        // Composes InterestOSBusinessWorkspace.computeSummary() — the one,
        // real, unmodified calculation engine — into a plain-English
        // result entry. getTable()/computeSummary() already enforce
        // owner/visibility, so a wrong actorId or unknown/foreign tableId
        // fails closed to `available: false` and contributes nothing here;
        // never a second calculation path of its own.
        if (businessContext && typeof businessContext === "object" && typeof businessContext.tableId === "string" && businessContext.tableId.trim()) {
            const workspace = window.CozyOS.InterestOSBusinessWorkspace;
            if (workspace && typeof workspace.computeSummary === "function") {
                try {
                    const summary = workspace.computeSummary(
                        businessContext.tableId,
                        { period: businessContext.period, referenceDate: businessContext.referenceDate },
                        effectiveActorId
                    );
                    if (summary && summary.available) {
                        const pieces = [
                            `For the ${summary.period} period (${summary.rowsInPeriod} recorded row(s)): revenue ${summary.revenue}, cost ${summary.cost}, expenses ${summary.expenses}, profit ${summary.profit}, cash balance ${summary.cashBalance}.`,
                            summary.cashBalanceAssumption
                        ];
                        if (summary.stockMovement.length > 0) {
                            pieces.push(`Stock movement: ${summary.stockMovement.map((s) => `${s.product} x${s.quantity}`).join(", ")}.`);
                        }
                        results.push({
                            authority: "interestos-business",
                            provenance: "window.CozyOS.InterestOSBusinessWorkspace",
                            tableId: businessContext.tableId,
                            evidence: "VERIFIED",
                            content: pieces.filter(Boolean).join(" ")
                        });
                    }
                } catch (_err) { /* honest fall-through — never fabricate */ }
            }
        }

        return {
            success: true, isReal: true, question, actorId: effectiveActorId,
            found: results.length > 0, results, businessDataConversationState,
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
