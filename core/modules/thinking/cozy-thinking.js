/**
 * CozyOS Thinking Engine
 * File Reference: core/modules/thinking/cozy-thinking.js
 * Milestone: 167 — Cozy Thinking Engine Platform
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   No existing thinking/reasoning/logic/decision-preparation engine
 *   found in the repository. New canonical owner.
 *   Owns: thinking registry/sessions/strategies/providers, evidence
 *   evaluation, alternative generation, reasoning pipeline/timeline,
 *   diagnostics, health.
 *   Never owns: AI provider registry, memory storage, policy decisions,
 *   workflow execution, authentication, conversation storage, speech
 *   recognition, translation — consumed only, and only via real,
 *   verified integrations (see below); never fetched by guessing an
 *   unverified API.
 *
 * REASONING DISCIPLINE
 *   This engine organises reasoning — it never creates facts. Every
 *   think()/reason()/compare() call requires real evidence (typically
 *   CozyInterpretation results) and a registered provider. With no
 *   provider registered, every method returns
 *   { available:false, isReal:false, reason:"No thinking provider registered." }
 *   and produces no output. Confidence, alternatives, risks,
 *   opportunities, and explanations are only ever what a provider
 *   returns — never invented here. Decision matrices are evaluated
 *   (weighted scoring math on caller-supplied criteria), never resolved
 *   into an automatic choice — the engine never picks a winner.
 *
 * INTEGRATION NOTE
 *   Real, verified: evaluateEvidence()/think() accept interpretation
 *   results directly, or callers can fetch them from
 *   window.CozyOS.CozyInterpretation (checked at call time) via
 *   fromInterpretation(). No other engine API is assumed beyond what
 *   was already confirmed in Milestones 152/153/157/164/166.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CozyThinking) return;

    const STRATEGIES = Object.freeze(["analytical", "logical", "sequential", "comparative", "root-cause", "pros-and-cons", "evidence-based", "hypothesis", "decision-matrix", "risk-analysis", "constraint-based", "priority-based", "scenario-planning", "business-analysis", "educational", "research", "custom"]);
    const TYPES = Object.freeze(["business", "meeting", "research", "project", "customer", "education", "church", "medical", "legal", "financial", "technical", "general", "custom"]);
    const PIPELINE_STAGES = Object.freeze(["input-validation", "evidence-review", "context-collection", "alternative-generation", "reasoning", "comparison", "explanation", "completion"]);
    const ALTERNATIVE_CRITERIA = Object.freeze(["best-option", "lowest-risk", "lowest-cost", "fastest", "safest", "most-practical", "most-efficient", "custom"]);
    const MATRIX_DIMENSIONS = Object.freeze(["cost", "risk", "time", "complexity", "benefit", "priority", "confidence", "impact", "custom"]);
    const HEALTH = Object.freeze({ READY: "ready", THINKING: "thinking", PAUSED: "paused", WAITING: "waiting", UNAVAILABLE: "unavailable", ERROR: "error" });

    function _uid(prefix) { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }
    function _dep(name) { return window.CozyOS[name] || null; }

    class CozyThinkingEngine {
        #sessions = new Map();
        #strategiesRegistry = new Map(); // id -> descriptor (custom strategies beyond STRATEGIES enum)
        #providers = new Map();          // id -> { descriptor, fn }
        #results = new Map();            // reasoningId -> full result
        #pipelineTimeline = new Map();
        #defaultProviderId = null;
        #enabled = true;
        #thinking = false;
        #lastError = null;

        getVersion() { return VERSION; }

        // ── RL-014 Platform Inspection Contract (Milestone 173, additive only) ──
        getId() { return "CozyThinking"; }
        getName() { return "CozyThinking"; }
        /** @returns {string[]} real optional integration checked via _dep() at call time (fromInterpretation()). */
        getDependencies() { return ["CozyInterpretation"]; }
        getStrategies() { return STRATEGIES.slice(); }
        getTypes() { return TYPES.slice(); }
        getAlternativeCriteria() { return ALTERNATIVE_CRITERIA.slice(); }
        getMatrixDimensions() { return MATRIX_DIMENSIONS.slice(); }

        // ── Strategy Registry (custom strategies beyond the built-in enum) ──
        registerStrategy({ id, name, basedOn = "custom" } = {}) {
            if (!id || !name) return { success: false, reason: "id and name are required." };
            if (!STRATEGIES.includes(basedOn)) return { success: false, reason: `Unknown basedOn strategy "${basedOn}".` };
            this.#strategiesRegistry.set(id, Object.freeze({ id, name, basedOn }));
            return { success: true };
        }
        removeStrategy(id) { return this.#strategiesRegistry.delete(id); }
        findStrategy(id) { return this.#strategiesRegistry.get(id) || null; }
        listStrategies() { return Array.from(this.#strategiesRegistry.values()); }

        // ── Provider Registry ────────────────────────────────────────────────
        /** fn(request) -> { alternatives?, reasoningSteps?, confidence?, risks?, opportunities?, prosCons?, explanation? } */
        registerProvider(descriptor = {}, fn) {
            if (!descriptor.id || typeof fn !== "function") return { success: false, reason: "descriptor.id and a real fn are required." };
            this.#providers.set(descriptor.id, {
                descriptor: Object.freeze({
                    id: descriptor.id, name: descriptor.name || descriptor.id,
                    supportedStrategies: Array.isArray(descriptor.supportedStrategies) ? descriptor.supportedStrategies.filter((s) => STRATEGIES.includes(s)) : [],
                    supportsAlternatives: !!descriptor.supportsAlternatives, supportsDecisionMatrix: !!descriptor.supportsDecisionMatrix,
                    supportsRiskAnalysis: !!descriptor.supportsRiskAnalysis, supportsExplain: !!descriptor.supportsExplain, offline: !!descriptor.offline
                }),
                fn, healthy: true
            });
            if (!this.#defaultProviderId) this.#defaultProviderId = descriptor.id;
            return { success: true };
        }
        removeProvider(id) { const removed = this.#providers.delete(id); if (this.#defaultProviderId === id) this.#defaultProviderId = this.#providers.keys().next().value || null; return removed; }
        findProvider(id) { const p = this.#providers.get(id); return p ? p.descriptor : null; }
        listProviders() { return Array.from(this.#providers.values()).map((p) => p.descriptor); }
        setDefaultProvider(id) { if (!this.#providers.has(id)) return { success: false, reason: `Provider "${id}" not registered.` }; this.#defaultProviderId = id; return { success: true }; }
        getProviderHealth(id) { const p = this.#providers.get(id); return p ? { id, healthy: p.healthy } : { id, healthy: false, reason: "not registered" }; }

        // ── Session API ──────────────────────────────────────────────────────
        createSession({ type = "general" } = {}) {
            if (!TYPES.includes(type)) return { success: false, reason: `Unknown thinking type "${type}".` };
            const id = _uid("think-session");
            this.#sessions.set(id, { id, type, state: "created", createdAt: new Date().toISOString(), reasoningIds: [] });
            return { success: true, sessionId: id };
        }
        startSession(id) { return this.#transitionSession(id, ["created", "paused"], "active"); }
        pauseSession(id) { return this.#transitionSession(id, ["active"], "paused"); }
        resumeSession(id) { return this.#transitionSession(id, ["paused"], "active"); }
        completeSession(id) { return this.#transitionSession(id, ["active", "paused"], "completed"); }
        cancelSession(id) { return this.#transitionSession(id, ["created", "active", "paused"], "cancelled"); }
        listSessions(predicate) { const l = Array.from(this.#sessions.values()); return predicate ? l.filter(predicate) : l; }
        #transitionSession(id, from, to) {
            const s = this.#sessions.get(id);
            if (!s) return { success: false, reason: `Session "${id}" not found.` };
            if (!from.includes(s.state)) return { success: false, reason: `Session is "${s.state}", expected one of [${from.join(", ")}].` };
            this.#sessions.set(id, { ...s, state: to });
            return { success: true, sessionId: id, state: to };
        }

        // ── Evidence intake ──────────────────────────────────────────────────
        /** fromInterpretation(interpretationId) — real, verified pull from CozyInterpretation only. */
        fromInterpretation(interpretationId) {
            const interp = _dep("CozyInterpretation");
            if (!interp || typeof interp.getEvidence !== "function") return { success: false, reason: "CozyInterpretation not available." };
            const evidence = interp.getEvidence(interpretationId);
            if (!evidence) return { success: false, reason: `Interpretation "${interpretationId}" not found.` };
            return { success: true, evidence, interpretationId };
        }

        // ── Core reasoning pipeline ──────────────────────────────────────────
        /**
         * think({ evidence, interpretationsUsed, strategy, type, providerId, sessionId })
         *   evidence: array of real evidence/interpretation items — required.
         */
        async think({ evidence, interpretationsUsed = [], strategy = "evidence-based", type = "general", providerId = null, sessionId = null } = {}) {
            const reasoningId = _uid("reason");
            const stamp = (stage) => { const t = this.#pipelineTimeline.get(reasoningId) || []; t.push({ stage, at: new Date().toISOString() }); this.#pipelineTimeline.set(reasoningId, t); };

            stamp("input-validation");
            if (!STRATEGIES.includes(strategy)) return { success: false, available: false, isReal: false, reason: `Unknown strategy "${strategy}".` };
            if (!TYPES.includes(type)) return { success: false, available: false, isReal: false, reason: `Unknown type "${type}".` };
            if (!Array.isArray(evidence) || evidence.length === 0) return { success: false, available: false, isReal: false, reason: "evidence must be a non-empty array of real evidence. Not fabricated." };

            stamp("evidence-review");
            stamp("context-collection");

            const provider = providerId ? this.#providers.get(providerId) : (this.#defaultProviderId ? this.#providers.get(this.#defaultProviderId) : null);
            if (!provider) { stamp("completion"); return { success: false, available: false, isReal: false, reason: "No thinking provider registered." }; }

            this.#thinking = true;
            stamp("alternative-generation");
            stamp("reasoning");
            let raw;
            try { raw = await provider.fn({ evidence, interpretationsUsed, strategy, type }); }
            catch (err) {
                this.#thinking = false; provider.healthy = false;
                this.#lastError = err && err.message ? err.message : String(err);
                stamp("completion");
                return { success: false, available: true, isReal: false, reason: `Provider threw: ${this.#lastError}` };
            }
            this.#thinking = false;
            stamp("comparison");
            stamp("explanation");

            const result = {
                reasoningId, strategy, type, provider: provider.descriptor.id,
                evidence, interpretationsUsed,
                alternatives: Array.isArray(raw.alternatives) ? raw.alternatives : [],
                reasoningSteps: Array.isArray(raw.reasoningSteps) ? raw.reasoningSteps : [],
                confidence: typeof raw.confidence === "number" ? raw.confidence : null,
                risks: Array.isArray(raw.risks) ? raw.risks : [],
                opportunities: Array.isArray(raw.opportunities) ? raw.opportunities : [],
                explanation: raw.explanation != null ? raw.explanation : null,
                isReal: true, timestamp: new Date().toISOString()
            };
            this.#results.set(reasoningId, result);
            if (sessionId && this.#sessions.has(sessionId)) { const s = this.#sessions.get(sessionId); this.#sessions.set(sessionId, { ...s, reasoningIds: [...s.reasoningIds, reasoningId] }); }
            stamp("completion");
            return { success: true, available: true, isReal: true, ...result };
        }

        async reason(request) { return this.think(request); }

        compare(reasoningIdA, reasoningIdB) {
            const a = this.#results.get(reasoningIdA), b = this.#results.get(reasoningIdB);
            if (!a || !b) return { success: false, available: false, isReal: false, reason: "Both reasoning ids must exist." };
            return { success: true, available: true, isReal: true, comparison: { confidenceDelta: (a.confidence ?? 0) - (b.confidence ?? 0), alternativeCountA: a.alternatives.length, alternativeCountB: b.alternatives.length } };
        }
        async analyse(request) { return this.think({ ...request, strategy: request.strategy || "analytical" }); }

        // ── Alternatives / evaluation (provider-backed, never invented) ────
        async generateAlternatives(evidence, { providerId = null, criteria = "best-option" } = {}) {
            if (!ALTERNATIVE_CRITERIA.includes(criteria)) return { success: false, available: false, isReal: false, reason: `Unknown criteria "${criteria}".` };
            const result = await this.think({ evidence, strategy: "comparative", providerId });
            if (!result.success) return result;
            return { success: true, available: true, isReal: true, criteria, alternatives: result.alternatives };
        }
        rankAlternatives(alternatives, criteria = "best-option") {
            if (!Array.isArray(alternatives) || alternatives.length === 0) return { success: false, isReal: false, reason: "alternatives must be a non-empty array." };
            if (!alternatives.every((a) => typeof a.score === "number")) return { success: false, isReal: false, reason: "Every alternative needs a real numeric score from a provider — ranking never invents scores." };
            const ranked = [...alternatives].sort((a, b) => b.score - a.score);
            return { success: true, isReal: true, criteria, ranked };
        }
        evaluateEvidence(evidence) {
            if (!Array.isArray(evidence) || evidence.length === 0) return { success: false, isReal: false, reason: "evidence must be a non-empty array." };
            return { success: true, isReal: true, evidenceCount: evidence.length, sources: [...new Set(evidence.map((e) => e.source).filter(Boolean))] };
        }
        async identifyRisks(evidence, opts = {}) { const r = await this.think({ evidence, strategy: "risk-analysis", ...opts }); return r.success ? { success: true, isReal: true, risks: r.risks } : r; }
        async identifyOpportunities(evidence, opts = {}) { const r = await this.think({ evidence, strategy: "evidence-based", ...opts }); return r.success ? { success: true, isReal: true, opportunities: r.opportunities } : r; }
        async generateProsCons(evidence, opts = {}) {
            const r = await this.think({ evidence, strategy: "pros-and-cons", ...opts });
            if (!r.success) return r;
            return { success: true, isReal: true, pros: (r.alternatives || []).filter((a) => a.polarity === "pro"), cons: (r.alternatives || []).filter((a) => a.polarity === "con") };
        }

        // ── Decision matrix — real weighted math, never auto-chooses ───────
        buildDecisionMatrix(alternatives, weights = {}) {
            if (!Array.isArray(alternatives) || alternatives.length === 0) return { success: false, isReal: false, reason: "alternatives must be a non-empty array." };
            const dims = Object.keys(weights).filter((d) => MATRIX_DIMENSIONS.includes(d));
            if (dims.length === 0) return { success: false, isReal: false, reason: "weights must reference at least one known dimension." };
            const scored = alternatives.map((alt) => {
                let total = 0, weightSum = 0;
                for (const dim of dims) {
                    if (typeof alt[dim] !== "number") continue;
                    total += alt[dim] * weights[dim]; weightSum += weights[dim];
                }
                return { ...alt, weightedScore: weightSum > 0 ? total / weightSum : null };
            });
            return { success: true, isReal: true, dimensions: dims, matrix: scored, note: "Weighted scores are computed math on caller-supplied numeric values — the engine evaluates, it never picks a winner." };
        }

        // ── Explainability ───────────────────────────────────────────────────
        explainReasoning(reasoningId) {
            const r = this.#results.get(reasoningId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Reasoning not found." };
            return {
                success: true, available: true, isReal: true,
                why: r.explanation, evidence: r.evidence, strategy: r.strategy, alternatives: r.alternatives,
                confidence: r.confidence, provider: r.provider
            };
        }
        summariseThinking(reasoningId) {
            const r = this.#results.get(reasoningId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Reasoning not found." };
            return { success: true, available: true, isReal: true, strategy: r.strategy, alternativeCount: r.alternatives.length, riskCount: r.risks.length, confidence: r.confidence };
        }

        // ── Diagnostics ──────────────────────────────────────────────────────
        getPipelineStatus(reasoningId) { return this.#pipelineTimeline.get(reasoningId) || null; }
        getProviderStatus() { return this.listProviders().map((d) => ({ ...d, healthy: this.getProviderHealth(d.id).healthy })); }
        getStrategyStatus() { return { builtIn: STRATEGIES.slice(), custom: this.listStrategies() }; }
        getReasoningStatistics() {
            const byStrategy = {}, byType = {};
            for (const r of this.#results.values()) { byStrategy[r.strategy] = (byStrategy[r.strategy] || 0) + 1; byType[r.type] = (byType[r.type] || 0) + 1; }
            return { total: this.#results.size, byStrategy, byType };
        }
        getSessionStatistics() {
            const byState = {};
            for (const s of this.#sessions.values()) byState[s.state] = (byState[s.state] || 0) + 1;
            return { total: this.#sessions.size, byState };
        }

        // ── Capabilities (real, honest) ─────────────────────────────────────
        getCapabilities() {
            const providers = Array.from(this.#providers.values());
            return Object.freeze({
                supportsComparison: this.#results.size >= 2,
                supportsAlternatives: providers.some((p) => p.descriptor.supportsAlternatives),
                supportsDecisionMatrix: true,
                supportsRiskAnalysis: providers.some((p) => p.descriptor.supportsRiskAnalysis),
                supportsExplainability: providers.some((p) => p.descriptor.supportsExplain),
                supportsScenarioPlanning: providers.some((p) => p.descriptor.supportedStrategies.includes("scenario-planning")),
                supportsReasoning: providers.length > 0,
                supportsEvidenceEvaluation: true
            });
        }

        // ── Search ───────────────────────────────────────────────────────────
        searchReasoning(query) { const q = String(query).toLowerCase(); return Array.from(this.#results.values()).filter((r) => JSON.stringify(r.explanation).toLowerCase().includes(q)); }
        searchSessions(predicate) { return this.listSessions(predicate); }
        searchStrategies(query) { const q = String(query).toLowerCase(); return this.listStrategies().filter((s) => s.name.toLowerCase().includes(q)); }
        searchEvidence(query) {
            const q = String(query).toLowerCase();
            return Array.from(this.#results.values()).filter((r) => JSON.stringify(r.evidence).toLowerCase().includes(q)).map((r) => r.reasoningId);
        }
        searchAlternatives(query) {
            const q = String(query).toLowerCase();
            return Array.from(this.#results.values()).flatMap((r) => r.alternatives.filter((a) => JSON.stringify(a).toLowerCase().includes(q)).map((a) => ({ reasoningId: r.reasoningId, alternative: a })));
        }

        // ── Health ───────────────────────────────────────────────────────────
        getHealth() {
            if (this.#lastError) return { health: HEALTH.ERROR, reason: this.#lastError };
            if (!this.#enabled) return { health: HEALTH.UNAVAILABLE };
            if (this.#thinking) return { health: HEALTH.THINKING };
            if (this.#providers.size === 0) return { health: HEALTH.WAITING, reason: "No providers registered." };
            return { health: HEALTH.READY, providerCount: this.#providers.size, resultCount: this.#results.size };
        }
        disable() { this.#enabled = false; }
        enable() { this.#enabled = true; }

        getIntegrationManifest() {
            return {
                owns: ["thinking registry/sessions/strategies/providers", "reasoning pipeline/timeline", "diagnostics"],
                doesNotOwn: ["AI provider registry", "memory storage", "policy decisions", "workflow execution", "authentication", "conversation storage", "speech recognition", "translation"],
                honestLimitation: "think()/reason()/compare() return available:false/isReal:false with no output when no provider is registered or evidence is missing. buildDecisionMatrix() only computes weighted math on caller-supplied numeric values and never auto-selects a winner. rankAlternatives() refuses to run if any alternative lacks a real provider-supplied score."
            };
        }
    }

    window.CozyOS.CozyThinking = new CozyThinkingEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/thinking/cozy-thinking.js",
                name: "CozyThinking", category: "Platform", icon: "brain.svg",
                description: "Canonical Thinking Engine. Structured reasoning, comparison, and decision-matrix evaluation via registered providers only — fails closed, never fabricates evidence, alternatives, or confidence. Never chooses a final decision."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
