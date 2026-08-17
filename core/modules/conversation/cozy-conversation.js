/**
 * CozyOS Conversation Intelligence Engine
 * File Reference: core/modules/conversation/cozy-conversation.js
 * Milestone: 164 — Cozy Conversation Intelligence Engine
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   No existing conversation/meeting/discussion engine found in the
 *   repository (searched core/modules/conversation/, conversation-engine.js,
 *   cozy-conversation.js, meeting-engine.js, discussion-engine.js,
 *   conversation-intelligence.js). New canonical owner.
 *   Owns: conversation registry, sessions, timeline, topics, knowledge
 *   extraction results, summaries, search, reports, health, providers.
 *   Never owns: audio capture, speech recognition, translation, AI
 *   providers, memory storage, workflow, authentication, identity — all
 *   consumed through their real owners below.
 *
 * DEPENDENCY REVIEW — HONEST GAP REPORT
 *   The requested pipeline (Listening -> Hearing -> Speech -> Language ->
 *   Translation -> Memory -> Interpretation -> Thinking -> Intelligence ->
 *   Conversation Intelligence) assumes engines that do not exist in this
 *   repository:
 *     - "Listening Engine"     — no separate file; capture currently
 *                                 lives in VoiceCaptureAdapter / CozyHearing.
 *     - "Interpretation Engine" — does not exist.
 *     - "Thinking Engine"       — does not exist.
 *     - "Intelligence Engine"   — does not exist as a distinct platform
 *                                 engine (only domain handlers under core/ai/).
 *   Per this milestone's own Runtime Rules ("if evidence is missing,
 *   return isReal=false, fail closed"), this file does NOT fabricate
 *   those engines or silently pretend they exist. Every integration
 *   point below checks for the real global at call time and reports
 *   unavailable honestly if absent. Confirmed real integrations:
 *   window.CozyOS.CozyHearing, .SpeechRecognitionAdapter, .LanguageEngine,
 *   .CozyTranslate, .CozyMemory / .MemoryLifecycle, .PolicyDecisionEngine.
 *
 * EXTENSION-POINT PATTERN (matches FaceProvider.registerBackend /
 * CozyHearing.registerClassifier)
 *   Topic detection, decision/task/prayer-request/action-item extraction,
 *   and summarization all require real language understanding this
 *   offline environment cannot fabricate. Each is a registration point
 *   (registerTopicProvider / registerKnowledgeExtractor /
 *   registerSummaryProvider). With nothing registered, the corresponding
 *   methods return isReal:false and fail closed — never a fabricated
 *   summary, decision, or Bible verse. One optional reference provider
 *   (BasicKeywordTopicProvider) is included and clearly labeled as
 *   simple keyword matching, not AI — real, but modest.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CozyConversation) return;

    const CONVERSATION_TYPES = Object.freeze(["meeting", "church", "bible-study", "prayer-meeting", "business", "classroom", "customer-support", "interview", "consultation", "family", "community", "phone-call", "live-event", "training", "sales", "custom"]);
    const TOPIC_DOMAINS = Object.freeze(["business", "finance", "agriculture", "church", "education", "health", "technology", "customer-service", "security", "family", "government", "community", "custom"]);
    const HEALTH = Object.freeze({ READY: "ready", ACTIVE: "active", DISABLED: "disabled", UNAVAILABLE: "unavailable", ERROR: "error" });

    function _uid(prefix) { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }
    function _dep(name) { return window.CozyOS[name] || null; }

    class CozyConversationEngine {
        #conversations = new Map();  // id -> { id, type, state, createdAt, startedAt, endedAt, participants }
        #timelines = new Map();      // id -> [ {speaker, text, languageCode, timestamp, source} ]
        #topicProviders = new Map(); // id -> {descriptor, fn}
        #knowledgeExtractors = new Map();
        #summaryProviders = new Map();
        #enabled = true;
        #lastError = null;

        getVersion() { return VERSION; }

        // ── RL-014 Platform Inspection Contract (Milestone 173, additive only) ──
        getId() { return "CozyConversation"; }
        getName() { return "CozyConversation"; }
        /** @returns {string[]} real optional integrations this engine checks for via _dep() at call time (see file header's "Confirmed real integrations"). */
        getDependencies() { return ["CozyHearing", "SpeechRecognitionAdapter", "LanguageEngine", "CozyTranslate", "CozyMemory", "MemoryLifecycle", "PolicyDecisionEngine"]; }
        getConversationTypes() { return CONVERSATION_TYPES.slice(); }
        getTopicDomains() { return TOPIC_DOMAINS.slice(); }

        // ── Dependency status (honest) ─────────────────────────────────────
        getDependencyStatus() {
            return {
                listeningEngine: { available: false, note: "No distinct Listening Engine exists. Capture is provided by VoiceCaptureAdapter/CozyHearing." },
                hearingEngine: { available: !!_dep("CozyHearing") },
                speechEngine: { available: !!_dep("SpeechRecognitionAdapter") },
                languageEngine: { available: !!_dep("LanguageEngine") },
                translationEngine: { available: !!_dep("CozyTranslate") },
                memoryEngine: { available: !!(_dep("CozyMemory") || _dep("MemoryLifecycle")) },
                interpretationEngine: { available: false, note: "Does not exist in this repository." },
                thinkingEngine: { available: false, note: "Does not exist in this repository." },
                intelligenceEngine: { available: false, note: "No distinct Intelligence Engine exists — only domain handlers under core/ai/." },
                policyDecisionEngine: { available: !!_dep("PolicyDecisionEngine") }
            };
        }

        // ── Session API ─────────────────────────────────────────────────────
        createConversation({ type = "custom", participants = [] } = {}) {
            if (!CONVERSATION_TYPES.includes(type)) return { success: false, reason: `Unknown conversation type "${type}".` };
            const id = _uid("conv");
            this.#conversations.set(id, { id, type, state: "created", createdAt: new Date().toISOString(), startedAt: null, endedAt: null, participants });
            this.#timelines.set(id, []);
            return { success: true, conversationId: id };
        }
        startConversation(id) { return this.#transition(id, ["created", "paused"], "active", "startedAt"); }
        pauseConversation(id) { return this.#transition(id, ["active"], "paused"); }
        resumeConversation(id) { return this.#transition(id, ["paused"], "active"); }
        endConversation(id) { return this.#transition(id, ["active", "paused"], "ended", "endedAt"); }
        cancelConversation(id) { return this.#transition(id, ["created", "active", "paused"], "cancelled"); }
        listConversations(predicate) { const l = Array.from(this.#conversations.values()); return predicate ? l.filter(predicate) : l; }
        getConversation(id) { return this.#conversations.get(id) || null; }

        #transition(id, fromStates, to, stamp) {
            const c = this.#conversations.get(id);
            if (!c) return { success: false, reason: `Conversation "${id}" not found.` };
            if (!fromStates.includes(c.state)) return { success: false, reason: `Conversation is "${c.state}", expected one of [${fromStates.join(", ")}].` };
            const updated = { ...c, state: to };
            if (stamp) updated[stamp] = new Date().toISOString();
            this.#conversations.set(id, updated);
            return { success: true, conversationId: id, state: to };
        }

        // ── Timeline — real, caller-supplied transcript segments only ──────
        /** addTranscriptSegment() — never generates text itself. Caller (e.g. SpeechRecognitionAdapter consumer) supplies real recognized text. */
        addTranscriptSegment(conversationId, { speaker = "unknown", text, languageCode = null, timestamp = null, source = "unspecified" } = {}) {
            if (!this.#conversations.has(conversationId)) return { success: false, reason: `Conversation "${conversationId}" not found.` };
            if (!text || typeof text !== "string") return { success: false, reason: "text is required and must be a real transcript string." };
            const segment = { speaker, text, languageCode, timestamp: timestamp || new Date().toISOString(), source };
            this.#timelines.get(conversationId).push(segment);
            return { success: true, segment };
        }
        getTimeline(conversationId) { return this.#timelines.get(conversationId) ? this.#timelines.get(conversationId).slice() : null; }

        // ── Topic providers (extension point) ──────────────────────────────
        registerTopicProvider(descriptor = {}, fn) {
            if (!descriptor.id || typeof fn !== "function") return { success: false, reason: "descriptor.id and a real fn are required." };
            this.#topicProviders.set(descriptor.id, { descriptor: Object.freeze({ id: descriptor.id, name: descriptor.name || descriptor.id, domains: descriptor.domains || [] }), fn });
            return { success: true };
        }
        listTopicProviders() { return Array.from(this.#topicProviders.values()).map((p) => p.descriptor); }

        listTopics(conversationId) {
            const timeline = this.#timelines.get(conversationId);
            if (!timeline) return { success: false, reason: `Conversation "${conversationId}" not found.` };
            if (this.#topicProviders.size === 0) return { success: false, isReal: false, topics: [], reason: "No topic provider registered. Not fabricated — fails closed." };
            const fullText = timeline.map((s) => s.text).join(" ");
            const results = [];
            for (const { fn, descriptor } of this.#topicProviders.values()) {
                try { const r = fn(fullText, timeline); if (Array.isArray(r)) results.push(...r.map((t) => ({ ...t, providerId: descriptor.id }))); }
                catch (err) { this.#lastError = err && err.message ? err.message : String(err); }
            }
            return { success: true, isReal: true, topics: results };
        }
        findTopic(conversationId, query) {
            const r = this.listTopics(conversationId);
            if (!r.success) return r;
            return { success: true, matches: r.topics.filter((t) => (t.label || "").toLowerCase().includes(String(query).toLowerCase())) };
        }
        explainTopic(conversationId, topicLabel) {
            const timeline = this.#timelines.get(conversationId);
            if (!timeline) return { success: false, reason: `Conversation "${conversationId}" not found.` };
            const matching = timeline.filter((s) => s.text.toLowerCase().includes(String(topicLabel).toLowerCase()));
            if (matching.length === 0) return { success: true, isReal: true, topic: topicLabel, segments: [], note: "No transcript segments mention this topic." };
            return { success: true, isReal: true, topic: topicLabel, segments: matching };
        }

        // ── Knowledge extractors (extension point) ─────────────────────────
        registerKnowledgeExtractor(descriptor = {}, fn) {
            if (!descriptor.id || !descriptor.kind || typeof fn !== "function") return { success: false, reason: "descriptor.id, descriptor.kind, and a real fn are required." };
            this.#knowledgeExtractors.set(descriptor.id, { descriptor: Object.freeze({ id: descriptor.id, kind: descriptor.kind, name: descriptor.name || descriptor.id }), fn });
            return { success: true };
        }
        #extract(conversationId, kind) {
            const timeline = this.#timelines.get(conversationId);
            if (!timeline) return { success: false, reason: `Conversation "${conversationId}" not found.` };
            const matching = Array.from(this.#knowledgeExtractors.values()).filter((e) => e.descriptor.kind === kind);
            if (matching.length === 0) return { success: false, isReal: false, results: [], reason: `No knowledge extractor registered for "${kind}". Not fabricated — fails closed.` };
            const results = [];
            for (const { fn, descriptor } of matching) {
                try { const r = fn(timeline); if (Array.isArray(r)) results.push(...r.map((x) => ({ ...x, extractorId: descriptor.id }))); }
                catch (err) { this.#lastError = err && err.message ? err.message : String(err); }
            }
            return { success: true, isReal: true, results };
        }
        findDecision(conversationId) { return this.#extract(conversationId, "decision"); }
        findTask(conversationId) { return this.#extract(conversationId, "task"); }
        findActionItem(conversationId) { return this.#extract(conversationId, "action-item"); }
        findPrayerRequest(conversationId) { return this.#extract(conversationId, "prayer-request"); }
        findQuestion(conversationId) { return this.#extract(conversationId, "question"); }

        // ── Summary / Report providers (extension point) ───────────────────
        registerSummaryProvider(descriptor = {}, fn) {
            if (!descriptor.id || typeof fn !== "function") return { success: false, reason: "descriptor.id and a real fn are required." };
            this.#summaryProviders.set(descriptor.id, { descriptor: Object.freeze({ id: descriptor.id, name: descriptor.name || descriptor.id }), fn });
            return { success: true };
        }
        summariseConversation(conversationId) {
            const timeline = this.#timelines.get(conversationId);
            if (!timeline) return { success: false, reason: `Conversation "${conversationId}" not found.` };
            if (this.#summaryProviders.size === 0) return { success: false, isReal: false, reason: "No summary provider registered. Not fabricated — fails closed." };
            const [{ fn, descriptor }] = this.#summaryProviders.values();
            try { return { success: true, isReal: true, providerId: descriptor.id, summary: fn(timeline) }; }
            catch (err) { return { success: false, reason: err && err.message ? err.message : String(err) }; }
        }
        generateMinutes(conversationId) { return this.#generateReport(conversationId, "minutes"); }
        generateReport(conversationId, reportType = "summary") { return this.#generateReport(conversationId, reportType); }
        #generateReport(conversationId, reportType) {
            const summary = this.summariseConversation(conversationId);
            const decisions = this.findDecision(conversationId);
            const tasks = this.findTask(conversationId);
            return {
                reportType, conversationId, generatedAt: new Date().toISOString(),
                facts: { segmentCount: (this.#timelines.get(conversationId) || []).length },
                summary: summary.success ? summary.summary : null, summaryIsReal: !!summary.isReal,
                decisions: decisions.success ? decisions.results : [], decisionsIsReal: !!decisions.isReal,
                tasks: tasks.success ? tasks.results : [], tasksIsReal: !!tasks.isReal,
                note: "facts.segmentCount is a direct count from stored transcript data. summary/decisions/tasks are AI-generated-suggestion fields, separately flagged with *IsReal, and empty/false when no provider is registered."
            };
        }

        // ── Search API — operates only on stored data ──────────────────────
        searchConversation(query) {
            const q = String(query).toLowerCase();
            const hits = [];
            for (const [id, timeline] of this.#timelines.entries()) {
                const matches = timeline.filter((s) => s.text.toLowerCase().includes(q));
                if (matches.length) hits.push({ conversationId: id, matches });
            }
            return { success: true, results: hits };
        }
        searchTopics(query) { const out = []; for (const id of this.#conversations.keys()) { const r = this.findTopic(id, query); if (r.success) out.push({ conversationId: id, matches: r.matches }); } return { success: true, results: out }; }
        searchQuestions(query) { return this.#searchExtracted("question", query); }
        searchTasks(query) { return this.#searchExtracted("task", query); }
        #searchExtracted(kind, query) {
            const q = String(query).toLowerCase();
            const out = [];
            for (const id of this.#conversations.keys()) {
                const r = this.#extract(id, kind);
                if (r.success) out.push({ conversationId: id, matches: r.results.filter((x) => JSON.stringify(x).toLowerCase().includes(q)) });
            }
            return { success: true, results: out };
        }
        searchReports() { return { success: false, isReal: false, reason: "Reports are generated on demand, not stored — nothing to search yet." }; }
        searchPeople(query) {
            const q = String(query).toLowerCase();
            const out = [];
            for (const [id, timeline] of this.#timelines.entries()) {
                const speakers = [...new Set(timeline.map((s) => s.speaker))].filter((s) => s.toLowerCase().includes(q));
                if (speakers.length) out.push({ conversationId: id, speakers });
            }
            return { success: true, results: out };
        }
        searchProducts(query) { return this.searchConversation(query); }

        // ── Capabilities (real, honest) ─────────────────────────────────────
        getCapabilities() {
            return Object.freeze({
                supportsConversationSummary: this.#summaryProviders.size > 0,
                supportsTopicExtraction: this.#topicProviders.size > 0,
                supportsQuestionAnswering: this.#knowledgeExtractors.size > 0,
                supportsReportGeneration: this.#summaryProviders.size > 0,
                supportsBusinessInsights: this.#knowledgeExtractors.size > 0,
                supportsChurchMeetings: Array.from(this.#knowledgeExtractors.values()).some((e) => e.descriptor.kind === "prayer-request"),
                supportsEducation: false,
                supportsTranslation: !!_dep("CozyTranslate"),
                supportsMultiLanguage: !!_dep("LanguageEngine")
            });
        }

        // ── Health ────────────────────────────────────────────────────────
        getHealth() {
            if (this.#lastError) return { health: HEALTH.ERROR, reason: this.#lastError };
            if (!this.#enabled) return { health: HEALTH.DISABLED };
            const anyActive = Array.from(this.#conversations.values()).some((c) => c.state === "active");
            return { health: anyActive ? HEALTH.ACTIVE : HEALTH.READY, conversationCount: this.#conversations.size };
        }
        disable() { this.#enabled = false; }
        enable() { this.#enabled = true; }

        getIntegrationManifest() {
            return {
                owns: ["conversation registry/sessions/timeline", "topic/knowledge/summary provider registries", "search over stored data", "report assembly"],
                doesNotOwn: ["audio capture", "speech recognition", "translation", "AI providers", "memory storage", "workflow execution", "authentication", "identity"],
                unavailableDependencies: ["Listening Engine (distinct)", "Interpretation Engine", "Thinking Engine", "Intelligence Engine (distinct)"],
                honestLimitation: "Topics/decisions/tasks/prayer-requests/summaries all return isReal:false and empty results until a real provider is registered. Never fabricates transcript content, speakers, or Bible verses."
            };
        }
    }

    
    window.CozyOS.CozyConversation = new CozyConversationEngine();

    // ── Optional reference provider: BasicKeywordTopicProvider ─────────────
    // Real, transparent keyword matching — explicitly NOT AI. Registered by
    // default so the engine is usable out of the box; any real provider can
    // be registered alongside or instead of it.
    (function registerBasicKeywordTopicProvider() {
        const KEYWORDS = {
            business: ["sale", "customer", "price", "stock", "order", "payment"],
            church: ["prayer", "sermon", "worship", "bible", "ministry", "fellowship"],
            education: ["lesson", "homework", "student", "exam", "topic", "revision"],
            health: ["patient", "symptom", "medicine", "clinic", "diagnosis"]
        };
        window.CozyOS.CozyConversation.registerTopicProvider(
            { id: "basic-keyword-topic-provider", name: "Basic Keyword Topic Provider (non-AI)", domains: Object.keys(KEYWORDS) },
            (fullText) => {
                const lower = fullText.toLowerCase();
                return Object.entries(KEYWORDS)
                    .map(([domain, words]) => ({ label: domain, matchedKeywords: words.filter((w) => lower.includes(w)) }))
                    .filter((t) => t.matchedKeywords.length > 0);
            }
        );
    })();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/conversation/cozy-conversation.js",
                name: "CozyConversation", category: "Platform", icon: "message-circle.svg",
                description: "Canonical Conversation Intelligence Engine. Orchestrates real engines (Hearing/Speech/Language/Translation/Memory/Policy). Topic/knowledge/summary extraction fails closed until real providers are registered — never fabricates conversation content."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
