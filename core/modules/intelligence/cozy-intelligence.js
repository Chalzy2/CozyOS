/**
 * CozyOS Intelligence Engine
 * File Reference: core/modules/intelligence/cozy-intelligence.js
 * Milestone: 168 — Cozy Intelligence Engine Platform
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   No existing intelligence/insight/analytics engine found in the
 *   repository. New canonical owner.
 *   Owns: intelligence/insight registry, sessions, pipeline, providers,
 *   trend/pattern/opportunity/risk analysis results, recommendation
 *   registry, forecast registry, timeline, diagnostics, health.
 *   Never owns: AI provider registry, memory storage, interpretation,
 *   thinking, workflow execution, policy decisions, authentication,
 *   speech recognition, translation — consumed only, via real, verified
 *   integrations (CozyThinking, CozyInterpretation, CozyConversation,
 *   CozyMemory — all checked at call time).
 *
 * DISCIPLINE
 *   This is the top of the reasoning chain (Interpretation -> Thinking
 *   -> Intelligence -> Policy Decision). It never captures raw input,
 *   never recognises speech, never stores memory, never fabricates a
 *   trend, pattern, recommendation, forecast, or confidence value. Every
 *   method requires real evidence (typically CozyThinking/
 *   CozyInterpretation results) and a registered provider; with none
 *   registered, everything returns
 *   { available:false, isReal:false, reason:"No intelligence provider registered." }.
 *   Predictions/forecasts are explicitly provider-dependent —
 *   supportsForecasting() is false unless a provider that declares
 *   forecast support is registered.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CozyIntelligence) return;

    const CATEGORIES = Object.freeze(["business-intelligence", "meeting-intelligence", "customer-intelligence", "sales-intelligence", "financial-intelligence", "church-intelligence", "educational-intelligence", "research-intelligence", "operational-intelligence", "security-intelligence", "project-intelligence", "service-intelligence", "market-intelligence", "community-intelligence", "healthcare-intelligence", "custom"]);
    const INSIGHT_TYPES = Object.freeze(["trend", "pattern", "opportunity", "risk", "recommendation", "forecast", "prediction", "anomaly", "performance", "growth", "decline", "summary", "custom"]);
    const PIPELINE_STAGES = Object.freeze(["input-validation", "evidence-collection", "knowledge-aggregation", "pattern-discovery", "trend-analysis", "insight-generation", "recommendation-generation", "completion"]);
    const PATTERN_KINDS = Object.freeze(["frequency", "repetition", "seasonality", "growth", "decline", "correlation", "outlier", "relationship", "custom"]);
    const TREND_PERIODS = Object.freeze(["daily", "weekly", "monthly", "quarterly", "yearly", "custom"]);
    const RECOMMENDATION_DOMAINS = Object.freeze(["business", "church", "customer", "education", "operations", "project", "research", "personal-productivity", "custom"]);
    const HEALTH = Object.freeze({ READY: "ready", ANALYSING: "analysing", WAITING: "waiting", PAUSED: "paused", UNAVAILABLE: "unavailable", ERROR: "error" });

    function _uid(prefix) { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }
    function _dep(name) { return window.CozyOS[name] || null; }

    class CozyIntelligenceEngine {
        #sessions = new Map();
        #insightTypesRegistry = new Map(); // custom insight types beyond enum
        #providers = new Map();
        #results = new Map();       // insightId -> full result
        #pipelineTimeline = new Map();
        #defaultProviderId = null;
        #enabled = true;
        #analysing = false;
        #lastError = null;

        getVersion() { return VERSION; }

        // ── RL-014 Platform Inspection Contract (Milestone 173, additive only) ──
        getId() { return "CozyIntelligence"; }
        getName() { return "CozyIntelligence"; }
        /** @returns {string[]} real optional integrations checked via _dep() at call time. */
        getDependencies() { return ["CozyConversation", "CozyInterpretation", "CozyThinking"]; }
        getCategories() { return CATEGORIES.slice(); }
        getInsightTypes() { return INSIGHT_TYPES.slice(); }
        getPatternKinds() { return PATTERN_KINDS.slice(); }
        getTrendPeriods() { return TREND_PERIODS.slice(); }
        getRecommendationDomains() { return RECOMMENDATION_DOMAINS.slice(); }

        // ── Insight Type Registry ────────────────────────────────────────────
        registerInsightType({ id, name, basedOn = "custom" } = {}) {
            if (!id || !name) return { success: false, reason: "id and name are required." };
            if (!INSIGHT_TYPES.includes(basedOn)) return { success: false, reason: `Unknown basedOn type "${basedOn}".` };
            this.#insightTypesRegistry.set(id, Object.freeze({ id, name, basedOn }));
            return { success: true };
        }
        removeInsightType(id) { return this.#insightTypesRegistry.delete(id); }
        findInsightType(id) { return this.#insightTypesRegistry.get(id) || null; }
        listInsightTypes() { return Array.from(this.#insightTypesRegistry.values()); }

        // ── Provider Registry ────────────────────────────────────────────────
        /** fn(request) -> { insights?, trends?, patterns?, opportunities?, risks?, recommendations?, forecast?, confidence? } */
        registerProvider(descriptor = {}, fn) {
            if (!descriptor.id || typeof fn !== "function") return { success: false, reason: "descriptor.id and a real fn are required." };
            this.#providers.set(descriptor.id, {
                descriptor: Object.freeze({
                    id: descriptor.id, name: descriptor.name || descriptor.id,
                    supportedCategories: Array.isArray(descriptor.supportedCategories) ? descriptor.supportedCategories.filter((c) => CATEGORIES.includes(c)) : [],
                    supportsForecast: !!descriptor.supportsForecast, supportsPatternDiscovery: !!descriptor.supportsPatternDiscovery,
                    supportsTrendAnalysis: !!descriptor.supportsTrendAnalysis, supportsRecommendations: !!descriptor.supportsRecommendations, offline: !!descriptor.offline
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
        createSession({ category = "custom" } = {}) {
            if (!CATEGORIES.includes(category)) return { success: false, reason: `Unknown category "${category}".` };
            const id = _uid("intel-session");
            this.#sessions.set(id, { id, category, state: "created", createdAt: new Date().toISOString(), insightIds: [] });
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

        // ── Real, verified evidence intake ──────────────────────────────────
        fromThinking(reasoningId) {
            const thinking = _dep("CozyThinking");
            if (!thinking || typeof thinking.explainReasoning !== "function") return { success: false, reason: "CozyThinking not available." };
            const r = thinking.explainReasoning(reasoningId);
            if (!r.success) return { success: false, reason: `Reasoning "${reasoningId}" not found or unavailable.` };
            return { success: true, thinkingResult: r };
        }
        fromInterpretation(interpretationId) {
            const interp = _dep("CozyInterpretation");
            if (!interp || typeof interp.getEvidence !== "function") return { success: false, reason: "CozyInterpretation not available." };
            const evidence = interp.getEvidence(interpretationId);
            if (!evidence) return { success: false, reason: `Interpretation "${interpretationId}" not found.` };
            return { success: true, evidence };
        }

        // ── Core pipeline ────────────────────────────────────────────────────
        /**
         * analyse({ evidence, thinkingResults, interpretationResults, category, providerId, sessionId })
         *   evidence: array of real evidence — required.
         */
        analyse({ evidence, thinkingResults = [], interpretationResults = [], category = "custom", providerId = null, sessionId = null } = {}) {
            const insightId = _uid("insight");
            const stamp = (stage) => { const t = this.#pipelineTimeline.get(insightId) || []; t.push({ stage, at: new Date().toISOString() }); this.#pipelineTimeline.set(insightId, t); };

            stamp("input-validation");
            if (!CATEGORIES.includes(category)) return { success: false, available: false, isReal: false, reason: `Unknown category "${category}".` };
            if (!Array.isArray(evidence) || evidence.length === 0) return { success: false, available: false, isReal: false, reason: "evidence must be a non-empty array of real evidence. Not fabricated." };

            stamp("evidence-collection");
            stamp("knowledge-aggregation");

            const provider = providerId ? this.#providers.get(providerId) : (this.#defaultProviderId ? this.#providers.get(this.#defaultProviderId) : null);
            if (!provider) { stamp("completion"); return { success: false, available: false, isReal: false, reason: "No intelligence provider registered." }; }

            this.#analysing = true;
            stamp("pattern-discovery");
            stamp("trend-analysis");
            let raw;
            try { raw = provider.fn({ evidence, thinkingResults, interpretationResults, category }); }
            catch (err) {
                this.#analysing = false; provider.healthy = false;
                this.#lastError = err && err.message ? err.message : String(err);
                stamp("completion");
                return { success: false, available: true, isReal: false, reason: `Provider threw: ${this.#lastError}` };
            }
            this.#analysing = false;
            stamp("insight-generation");
            stamp("recommendation-generation");

            const result = {
                insightId, category, provider: provider.descriptor.id,
                evidence, thinkingResults, interpretationResults,
                insights: Array.isArray(raw.insights) ? raw.insights.filter((i) => INSIGHT_TYPES.includes(i.type)) : [],
                trends: Array.isArray(raw.trends) ? raw.trends : [],
                patterns: Array.isArray(raw.patterns) ? raw.patterns.filter((p) => PATTERN_KINDS.includes(p.kind)) : [],
                opportunities: Array.isArray(raw.opportunities) ? raw.opportunities : [],
                risks: Array.isArray(raw.risks) ? raw.risks : [],
                recommendations: Array.isArray(raw.recommendations) ? raw.recommendations.map((r) => ({ ...r, executesAutomatically: false })) : [],
                forecast: (provider.descriptor.supportsForecast && raw.forecast) ? raw.forecast : null,
                confidence: typeof raw.confidence === "number" ? raw.confidence : null,
                isReal: true, timestamp: new Date().toISOString()
            };
            this.#results.set(insightId, result);
            if (sessionId && this.#sessions.has(sessionId)) { const s = this.#sessions.get(sessionId); this.#sessions.set(sessionId, { ...s, insightIds: [...s.insightIds, insightId] }); }
            stamp("completion");
            return { success: true, available: true, isReal: true, ...result };
        }

        generateInsights(request) { return this.analyse(request); }
        discoverPatterns(evidence, opts = {}) { const r = this.analyse({ evidence, ...opts }); return r.success ? { success: true, isReal: true, patterns: r.patterns } : r; }
        discoverTrends(evidence, opts = {}) { const r = this.analyse({ evidence, ...opts }); return r.success ? { success: true, isReal: true, trends: r.trends } : r; }
        identifyOpportunities(evidence, opts = {}) { const r = this.analyse({ evidence, ...opts }); return r.success ? { success: true, isReal: true, opportunities: r.opportunities } : r; }
        identifyRisks(evidence, opts = {}) { const r = this.analyse({ evidence, ...opts }); return r.success ? { success: true, isReal: true, risks: r.risks } : r; }
        generateRecommendations(evidence, { domain = "custom", ...opts } = {}) {
            if (!RECOMMENDATION_DOMAINS.includes(domain)) return { success: false, isReal: false, reason: `Unknown recommendation domain "${domain}".` };
            const r = this.analyse({ evidence, ...opts });
            if (!r.success) return r;
            return { success: true, isReal: true, domain, recommendations: r.recommendations, note: "Recommendations are advisory only and never execute automatically." };
        }

        /** forecast() — explicitly provider-dependent; unavailable without a provider declaring supportsForecast. */
        forecast(evidence, { period = "monthly", providerId = null, ...opts } = {}) {
            if (!TREND_PERIODS.includes(period)) return { success: false, available: false, isReal: false, reason: `Unknown period "${period}".` };
            const provider = providerId ? this.#providers.get(providerId) : (this.#defaultProviderId ? this.#providers.get(this.#defaultProviderId) : null);
            if (!provider || !provider.descriptor.supportsForecast) return { success: false, available: false, isReal: false, reason: "No forecasting provider registered. Never fabricated." };
            const r = this.analyse({ evidence, providerId: provider.descriptor.id, ...opts });
            if (!r.success) return r;
            return { success: true, available: true, isReal: !!r.forecast, period, forecast: r.forecast };
        }

        summariseInsights(insightId) {
            const r = this.#results.get(insightId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Insight not found." };
            return { success: true, available: true, isReal: true, category: r.category, insightCount: r.insights.length, trendCount: r.trends.length, recommendationCount: r.recommendations.length, confidence: r.confidence };
        }
        compareInsights(idA, idB) {
            const a = this.#results.get(idA), b = this.#results.get(idB);
            if (!a || !b) return { success: false, available: false, isReal: false, reason: "Both insight ids must exist." };
            return { success: true, available: true, isReal: true, comparison: { confidenceDelta: (a.confidence ?? 0) - (b.confidence ?? 0), insightCountA: a.insights.length, insightCountB: b.insights.length } };
        }

        // ── Diagnostics ──────────────────────────────────────────────────────
        getPipelineStatus(insightId) { return this.#pipelineTimeline.get(insightId) || null; }
        getInsightStatistics() {
            const byType = {}, byCategory = {};
            for (const r of this.#results.values()) { byCategory[r.category] = (byCategory[r.category] || 0) + 1; for (const i of r.insights) byType[i.type] = (byType[i.type] || 0) + 1; }
            return { total: this.#results.size, byType, byCategory };
        }
        getProviderStatus() { return this.listProviders().map((d) => ({ ...d, healthy: this.getProviderHealth(d.id).healthy })); }
        getTrendStatistics() { let total = 0; for (const r of this.#results.values()) total += r.trends.length; return { totalTrends: total }; }
        getRecommendationStatistics() {
            const byDomain = {};
            for (const r of this.#results.values()) for (const rec of r.recommendations) byDomain[rec.domain || "custom"] = (byDomain[rec.domain || "custom"] || 0) + 1;
            return { byDomain };
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
                supportsPatternDiscovery: providers.some((p) => p.descriptor.supportsPatternDiscovery),
                supportsTrendAnalysis: providers.some((p) => p.descriptor.supportsTrendAnalysis),
                supportsRecommendations: providers.some((p) => p.descriptor.supportsRecommendations),
                supportsForecasting: providers.some((p) => p.descriptor.supportsForecast),
                supportsBusinessIntelligence: providers.some((p) => p.descriptor.supportedCategories.includes("business-intelligence")),
                supportsMeetingIntelligence: providers.some((p) => p.descriptor.supportedCategories.includes("meeting-intelligence")) && !!_dep("CozyConversation"),
                supportsChurchIntelligence: providers.some((p) => p.descriptor.supportedCategories.includes("church-intelligence")),
                supportsCustomerIntelligence: providers.some((p) => p.descriptor.supportedCategories.includes("customer-intelligence")),
                supportsEducation: providers.some((p) => p.descriptor.supportedCategories.includes("educational-intelligence")),
                supportsResearch: providers.some((p) => p.descriptor.supportedCategories.includes("research-intelligence"))
            });
        }

        // ── Search ───────────────────────────────────────────────────────────
        searchInsights(query) { const q = String(query).toLowerCase(); return Array.from(this.#results.values()).filter((r) => JSON.stringify(r.insights).toLowerCase().includes(q)); }
        searchRecommendations(query) {
            const q = String(query).toLowerCase();
            return Array.from(this.#results.values()).flatMap((r) => r.recommendations.filter((rec) => JSON.stringify(rec).toLowerCase().includes(q)).map((rec) => ({ insightId: r.insightId, recommendation: rec })));
        }
        searchPatterns(query) {
            const q = String(query).toLowerCase();
            return Array.from(this.#results.values()).flatMap((r) => r.patterns.filter((p) => JSON.stringify(p).toLowerCase().includes(q)).map((p) => ({ insightId: r.insightId, pattern: p })));
        }
        searchTrends(query) {
            const q = String(query).toLowerCase();
            return Array.from(this.#results.values()).flatMap((r) => r.trends.filter((t) => JSON.stringify(t).toLowerCase().includes(q)).map((t) => ({ insightId: r.insightId, trend: t })));
        }
        searchSessions(predicate) { return this.listSessions(predicate); }
        searchReports() { return { success: false, isReal: false, reason: "Reports are assembled on demand from insights, not stored separately — nothing to search yet." }; }

        // ── Health ───────────────────────────────────────────────────────────
        getHealth() {
            if (this.#lastError) return { health: HEALTH.ERROR, reason: this.#lastError };
            if (!this.#enabled) return { health: HEALTH.UNAVAILABLE };
            if (this.#analysing) return { health: HEALTH.ANALYSING };
            if (this.#providers.size === 0) return { health: HEALTH.WAITING, reason: "No providers registered." };
            return { health: HEALTH.READY, providerCount: this.#providers.size, resultCount: this.#results.size };
        }
        disable() { this.#enabled = false; }
        enable() { this.#enabled = true; }

        getIntegrationManifest() {
            return {
                owns: ["intelligence/insight registry", "sessions/pipeline/providers", "trend/pattern/opportunity/risk results", "recommendation registry", "forecast registry", "diagnostics"],
                doesNotOwn: ["AI provider registry", "memory storage", "interpretation", "thinking", "workflow execution", "policy decisions", "authentication", "speech recognition", "translation"],
                honestLimitation: "analyse() and every derived method return available:false/isReal:false with no output when no provider is registered or evidence is missing. forecast() additionally requires the active provider to declare supportsForecast — otherwise always unavailable, never a fabricated prediction. Recommendations are always tagged executesAutomatically:false."
            };
        }
    }

    window.CozyOS.CozyIntelligence = new CozyIntelligenceEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CozyIntelligence", category: "Platform", icon: "lightbulb.svg",
                description: "Canonical Intelligence Engine. Insight/trend/pattern/recommendation/forecast generation via registered providers only — fails closed, never fabricates. Top of the reasoning chain: Interpretation -> Thinking -> Intelligence -> Policy Decision."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
