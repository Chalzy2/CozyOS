/**
 * CozyOS Reasoning Engine
 * File Reference: core/modules/reasoning/cozy-reasoning.js
 * Milestone: 170 — Cozy Reasoning Engine Platform
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   No existing reasoning/logic/inference engine found in the repository.
 *   New canonical owner.
 *   Owns: reasoning registry/sessions/strategies, logical rule registry,
 *   inference registry, reasoning pipeline/providers, contradiction
 *   detection, assumption tracking, conclusion validation, diagnostics,
 *   health.
 *   Never owns: AI provider registry, memory storage, interpretation,
 *   thinking, intelligence, policy decisions, workflow execution,
 *   authentication, speech recognition, translation — consumed only,
 *   via real, verified integrations (CozyThinking, CozyInterpretation —
 *   checked at call time, same as CozyIntelligence's pattern).
 *
 * DISTINCTION FROM THINKING ENGINE
 *   CozyThinking organises evidence into alternatives and strategies —
 *   "what alternatives and reasoning strategies can we apply?"
 *   CozyReasoning validates the logical chain — "does this conclusion
 *   actually follow from this evidence, under these rules, given these
 *   assumptions?" It consumes CozyThinking's output as one of several
 *   possible inputs but does not replace or duplicate it.
 *
 * DISCIPLINE
 *   reason()/validateConclusion() require real evidence and a
 *   registered provider; with none, everything returns
 *   { available:false, isReal:false, reason:"No reasoning provider registered." }.
 *   Logical rules are reasoning logic only (if/then structures over
 *   evidence), never policy rules — PolicyDecisionEngine remains solely
 *   responsible for allow/deny decisions. Contradictions and assumptions
 *   are only ever what a provider reports or what a registered logical
 *   rule mechanically detects — never guessed by this file.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CozyReasoning) return;

    const REASONING_TYPES = Object.freeze(["deductive", "inductive", "abductive", "evidence-based", "rule-based", "comparative", "constraint-based", "hypothesis-validation", "decision-support", "business-logic", "educational", "research", "custom"]);
    const PIPELINE_STAGES = Object.freeze(["input-validation", "evidence-review", "context-assembly", "rule-evaluation", "assumption-detection", "contradiction-detection", "conclusion-validation", "reasoning-trace-generation", "completion"]);
    const CONTRADICTION_KINDS = Object.freeze(["evidence-conflict", "rule-conflict", "timeline-conflict", "data-conflict", "assumption-conflict", "custom"]);
    const HEALTH = Object.freeze({ READY: "ready", REASONING: "reasoning", WAITING: "waiting", PAUSED: "paused", UNAVAILABLE: "unavailable", ERROR: "error" });

    function _uid(prefix) { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }
    function _dep(name) { return window.CozyOS[name] || null; }
    function _getPath(obj, path) { return path.split(".").reduce((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), obj); }

    class CozyReasoningEngine {
        #sessions = new Map();
        #rules = new Map();       // ruleId -> { id, name, condition:[{field,operator,value}], thenAssert, description }
        #providers = new Map();
        #results = new Map();     // reasoningId -> full result
        #pipelineTimeline = new Map();
        #defaultProviderId = null;
        #enabled = true;
        #reasoning = false;
        #lastError = null;

        getVersion() { return VERSION; }

        // ── RL-014 Platform Inspection Contract (Milestone 173, additive only) ──
        getId() { return "CozyReasoning"; }
        getName() { return "CozyReasoning"; }
        /** @returns {string[]} real optional integrations checked via _dep() at call time. */
        getDependencies() { return ["CozyInterpretation", "CozyThinking"]; }
        getReasoningTypes() { return REASONING_TYPES.slice(); }
        getContradictionKinds() { return CONTRADICTION_KINDS.slice(); }

        // ── Logical Rule Registry — reasoning logic only, never policy ─────
        registerRule({ id = null, name, condition = [], thenAssert, description = "" } = {}) {
            if (!name || !thenAssert) return { success: false, reason: "name and thenAssert are required." };
            const ruleId = id || _uid("rule");
            this.#rules.set(ruleId, Object.freeze({ id: ruleId, name, condition, thenAssert, description }));
            return { success: true, ruleId };
        }
        removeRule(id) { return this.#rules.delete(id); }
        findRule(id) { return this.#rules.get(id) || null; }
        listRules() { return Array.from(this.#rules.values()); }

        #matchCondition(cond, context) {
            const actual = _getPath(context, cond.field);
            switch (cond.operator) {
                case "equals": return actual === cond.value;
                case "notEquals": return actual !== cond.value;
                case "exists": return actual !== undefined && actual !== null;
                case "notExists": return actual === undefined || actual === null;
                case "gte": return typeof actual === "number" && actual >= cond.value;
                case "lte": return typeof actual === "number" && actual <= cond.value;
                default: return false;
            }
        }
        /** evaluateRules(context) — real, mechanical rule matching only. Never a fabricated inference. */
        evaluateRules(context = {}) {
            const applied = [];
            for (const rule of this.#rules.values()) {
                const matched = rule.condition.every((c) => this.#matchCondition(c, context));
                if (matched) applied.push({ ruleId: rule.id, name: rule.name, assertion: rule.thenAssert });
            }
            return applied;
        }

        // ── Provider Registry ────────────────────────────────────────────────
        /** fn(request) -> { conclusion?, reasoningTrace?, assumptions?, contradictions?, confidence?, valid? } */
        registerProvider(descriptor = {}, fn) {
            if (!descriptor.id || typeof fn !== "function") return { success: false, reason: "descriptor.id and a real fn are required." };
            this.#providers.set(descriptor.id, {
                descriptor: Object.freeze({
                    id: descriptor.id, name: descriptor.name || descriptor.id,
                    supportedTypes: Array.isArray(descriptor.supportedTypes) ? descriptor.supportedTypes.filter((t) => REASONING_TYPES.includes(t)) : [],
                    supportsContradictionDetection: !!descriptor.supportsContradictionDetection, supportsAssumptionTracking: !!descriptor.supportsAssumptionTracking,
                    supportsExplain: !!descriptor.supportsExplain, offline: !!descriptor.offline
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
        createSession({ type = "evidence-based" } = {}) {
            if (!REASONING_TYPES.includes(type)) return { success: false, reason: `Unknown reasoning type "${type}".` };
            const id = _uid("reason-session");
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

        // ── Real, verified evidence intake ──────────────────────────────────
        fromThinking(reasoningResultId) {
            const thinking = _dep("CozyThinking");
            if (!thinking || typeof thinking.explainReasoning !== "function") return { success: false, reason: "CozyThinking not available." };
            const r = thinking.explainReasoning(reasoningResultId);
            if (!r.success) return { success: false, reason: `Thinking result "${reasoningResultId}" not found or unavailable.` };
            return { success: true, thinkingResult: r };
        }
        fromInterpretation(interpretationId) {
            const interp = _dep("CozyInterpretation");
            if (!interp || typeof interp.getEvidence !== "function") return { success: false, reason: "CozyInterpretation not available." };
            const evidence = interp.getEvidence(interpretationId);
            if (!evidence) return { success: false, reason: `Interpretation "${interpretationId}" not found.` };
            return { success: true, evidence };
        }

        // ── Core reasoning pipeline ──────────────────────────────────────────
        /** reason({ evidence, interpretationsUsed, thinkingResults, type, ruleContext, providerId, sessionId }) */
        async reason({ evidence, interpretationsUsed = [], thinkingResults = [], type = "evidence-based", ruleContext = {}, providerId = null, sessionId = null } = {}) {
            const reasoningId = _uid("reasoning");
            const stamp = (stage) => { const t = this.#pipelineTimeline.get(reasoningId) || []; t.push({ stage, at: new Date().toISOString() }); this.#pipelineTimeline.set(reasoningId, t); };

            stamp("input-validation");
            if (!REASONING_TYPES.includes(type)) return { success: false, available: false, isReal: false, reason: `Unknown reasoning type "${type}".` };
            if (!Array.isArray(evidence) || evidence.length === 0) return { success: false, available: false, isReal: false, reason: "evidence must be a non-empty array of real evidence. Not fabricated." };

            stamp("evidence-review");
            stamp("context-assembly");
            stamp("rule-evaluation");
            const rulesApplied = this.evaluateRules(ruleContext);

            const provider = providerId ? this.#providers.get(providerId) : (this.#defaultProviderId ? this.#providers.get(this.#defaultProviderId) : null);
            if (!provider) { stamp("completion"); return { success: false, available: false, isReal: false, reason: "No reasoning provider registered." }; }

            this.#reasoning = true;
            stamp("assumption-detection");
            stamp("contradiction-detection");
            let raw;
            try { raw = await provider.fn({ evidence, interpretationsUsed, thinkingResults, type, rulesApplied }); }
            catch (err) {
                this.#reasoning = false; provider.healthy = false;
                this.#lastError = err && err.message ? err.message : String(err);
                stamp("completion");
                return { success: false, available: true, isReal: false, reason: `Provider threw: ${this.#lastError}` };
            }
            this.#reasoning = false;
            stamp("conclusion-validation");
            stamp("reasoning-trace-generation");

            const contradictions = Array.isArray(raw.contradictions) ? raw.contradictions.filter((c) => CONTRADICTION_KINDS.includes(c.kind)) : [];
            const assumptions = Array.isArray(raw.assumptions) ? raw.assumptions.map((a) => ({
                source: a.source || "provider", reason: a.reason || null, supportingEvidence: a.supportingEvidence || null,
                confidence: typeof a.confidence === "number" ? a.confidence : null, explicitlySupplied: !!a.explicitlySupplied
            })) : [];

            const result = {
                reasoningId, type, provider: provider.descriptor.id,
                evidence, interpretationsUsed, thinkingResults, rulesApplied,
                assumptions, contradictions,
                conclusion: raw.conclusion != null ? raw.conclusion : null,
                conclusionValid: typeof raw.valid === "boolean" ? raw.valid : null,
                reasoningTrace: Array.isArray(raw.reasoningTrace) ? raw.reasoningTrace : [],
                confidence: typeof raw.confidence === "number" ? raw.confidence : null,
                isReal: true, timestamp: new Date().toISOString()
            };
            this.#results.set(reasoningId, result);
            if (sessionId && this.#sessions.has(sessionId)) { const s = this.#sessions.get(sessionId); this.#sessions.set(sessionId, { ...s, reasoningIds: [...s.reasoningIds, reasoningId] }); }
            stamp("completion");
            return { success: true, available: true, isReal: true, ...result };
        }

        /** validateConclusion() — checks a caller-supplied conclusion against evidence via a registered provider. Never validates on its own guess. */
        validateConclusion(conclusion, evidence, opts = {}) {
            if (conclusion == null) return { success: false, available: false, isReal: false, reason: "conclusion is required." };
            const provider = opts.providerId ? this.#providers.get(opts.providerId) : (this.#defaultProviderId ? this.#providers.get(this.#defaultProviderId) : null);
            if (!provider) return { success: false, available: false, isReal: false, reason: "No reasoning provider registered." };
            if (!Array.isArray(evidence) || evidence.length === 0) return { success: false, available: false, isReal: false, reason: "evidence must be a non-empty array." };
            try {
                const raw = provider.fn({ evidence, conclusionToValidate: conclusion, type: opts.type || "evidence-based" });
                return { success: true, available: true, isReal: true, valid: typeof raw.valid === "boolean" ? raw.valid : null, confidence: typeof raw.confidence === "number" ? raw.confidence : null, reasoningTrace: raw.reasoningTrace || [] };
            } catch (err) { return { success: false, available: true, isReal: false, reason: err && err.message ? err.message : String(err) }; }
        }

        evaluateLogic(ruleContext = {}) { return { success: true, isReal: true, rulesApplied: this.evaluateRules(ruleContext) }; }

        detectContradictions(reasoningId) {
            const r = this.#results.get(reasoningId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Reasoning not found." };
            return { success: true, available: true, isReal: true, contradictions: r.contradictions };
        }
        identifyAssumptions(reasoningId) {
            const r = this.#results.get(reasoningId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Reasoning not found." };
            return { success: true, available: true, isReal: true, assumptions: r.assumptions };
        }
        traceReasoning(reasoningId) {
            const r = this.#results.get(reasoningId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Reasoning not found." };
            return { success: true, available: true, isReal: true, reasoningTrace: r.reasoningTrace };
        }
        explainConclusion(reasoningId) {
            const r = this.#results.get(reasoningId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Reasoning not found." };
            return {
                success: true, available: true, isReal: true,
                conclusion: r.conclusion, evidence: r.evidence, rulesApplied: r.rulesApplied, assumptions: r.assumptions,
                contradictions: r.contradictions, provider: r.provider, confidence: r.confidence
            };
        }
        compareReasoning(idA, idB) {
            const a = this.#results.get(idA), b = this.#results.get(idB);
            if (!a || !b) return { success: false, available: false, isReal: false, reason: "Both reasoning ids must exist." };
            return { success: true, available: true, isReal: true, comparison: { confidenceDelta: (a.confidence ?? 0) - (b.confidence ?? 0), contradictionCountA: a.contradictions.length, contradictionCountB: b.contradictions.length } };
        }
        summariseReasoning(reasoningId) {
            const r = this.#results.get(reasoningId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Reasoning not found." };
            return { success: true, available: true, isReal: true, type: r.type, conclusionValid: r.conclusionValid, assumptionCount: r.assumptions.length, contradictionCount: r.contradictions.length, confidence: r.confidence };
        }

        // ── Diagnostics ──────────────────────────────────────────────────────
        getPipelineStatus(reasoningId) { return this.#pipelineTimeline.get(reasoningId) || null; }
        getRuleStatistics() { return { total: this.#rules.size }; }
        getProviderStatus() { return this.listProviders().map((d) => ({ ...d, healthy: this.getProviderHealth(d.id).healthy })); }
        getReasoningStatistics() {
            const byType = {};
            for (const r of this.#results.values()) byType[r.type] = (byType[r.type] || 0) + 1;
            return { total: this.#results.size, byType };
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
                supportsLogicalValidation: providers.length > 0,
                supportsContradictionDetection: providers.some((p) => p.descriptor.supportsContradictionDetection),
                supportsAssumptionTracking: providers.some((p) => p.descriptor.supportsAssumptionTracking),
                supportsReasoningTrace: providers.length > 0,
                supportsConclusionValidation: providers.length > 0,
                supportsRuleEvaluation: this.#rules.size > 0,
                supportsExplainability: providers.some((p) => p.descriptor.supportsExplain)
            });
        }

        // ── Search ───────────────────────────────────────────────────────────
        searchReasoning(query) { const q = String(query).toLowerCase(); return Array.from(this.#results.values()).filter((r) => JSON.stringify(r.conclusion).toLowerCase().includes(q)); }
        searchConclusions(query) { const q = String(query).toLowerCase(); return Array.from(this.#results.values()).filter((r) => r.conclusion != null && JSON.stringify(r.conclusion).toLowerCase().includes(q)).map((r) => ({ reasoningId: r.reasoningId, conclusion: r.conclusion })); }
        searchRules(query) { const q = String(query).toLowerCase(); return this.listRules().filter((r) => r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q)); }
        searchSessions(predicate) { return this.listSessions(predicate); }
        searchContradictions(kind) { return Array.from(this.#results.values()).flatMap((r) => r.contradictions.filter((c) => !kind || c.kind === kind).map((c) => ({ reasoningId: r.reasoningId, contradiction: c }))); }
        searchAssumptions(query) {
            const q = String(query).toLowerCase();
            return Array.from(this.#results.values()).flatMap((r) => r.assumptions.filter((a) => JSON.stringify(a).toLowerCase().includes(q)).map((a) => ({ reasoningId: r.reasoningId, assumption: a })));
        }

        // ── Health ───────────────────────────────────────────────────────────
        getHealth() {
            if (this.#lastError) return { health: HEALTH.ERROR, reason: this.#lastError };
            if (!this.#enabled) return { health: HEALTH.UNAVAILABLE };
            if (this.#reasoning) return { health: HEALTH.REASONING };
            if (this.#providers.size === 0) return { health: HEALTH.WAITING, reason: "No providers registered." };
            return { health: HEALTH.READY, providerCount: this.#providers.size, resultCount: this.#results.size };
        }
        disable() { this.#enabled = false; }
        enable() { this.#enabled = true; }

        getIntegrationManifest() {
            return {
                owns: ["reasoning registry/sessions/strategies", "logical rule registry", "inference registry", "reasoning pipeline/providers", "contradiction detection", "assumption tracking", "conclusion validation", "diagnostics"],
                doesNotOwn: ["AI provider registry", "memory storage", "interpretation", "thinking", "intelligence", "policy decisions", "workflow execution", "authentication", "speech recognition", "translation"],
                honestLimitation: "reason()/validateConclusion() return available:false/isReal:false with no output when no provider is registered or evidence is missing. evaluateRules() only performs mechanical condition matching against caller-supplied context — never a semantic inference. Logical rules registered here describe reasoning logic only and are never policy rules; PolicyDecisionEngine remains the sole allow/deny authority."
            };
        }
    }

    window.CozyOS.CozyReasoning = new CozyReasoningEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({ sourcePath: "core/modules/reasoning/cozy-reasoning.js",
                name: "CozyReasoning", category: "Platform", icon: "link.svg",
                description: "Canonical Reasoning Engine. Logical validation, contradiction/assumption tracking, and reasoning traces via registered providers only — fails closed, never fabricates evidence, logic, or confidence."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();                                                                                                                           
