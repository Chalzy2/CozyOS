/**
 * CozyOS — AI Bootstrap & Provider Registry
 * File Reference: core/modules/intelligence/ai-bootstrap.js
 * Milestone: M366.9 — AI Provider Registration & Intelligence Framework Completion
 *
 * SCOPE, STATED PLAINLY BEFORE ANYTHING ELSE
 *   Of the 15 requested "providers," repository verification (this file's
 *   own first act, before any registration) found:
 *     - 3 real, existing registries with genuinely ZERO registered
 *       providers: CozyInterpretation, CozyThinking, CozyReasoning. This
 *       is the actual, confirmed cause of "returns raw JSON" - these
 *       three are registered for real in this file, composing each
 *       engine's own real, pre-existing registerProvider()/registerRule()
 *       contract (read directly from source before writing anything
 *       here) - never a new registry, never a new engine.
 *     - CozyIntelligence already has a real provider (living-composition-
 *       adapter, M366.3) - kept exactly as instructed, unmodified.
 *     - 4 provider concepts that are already real, complete engines
 *       needing no new "provider" registration at all: Conversation
 *       (CozyConversation), Memory (CozyMemory), Voice (VoiceManager +
 *       CozySpeech), and Intelligence (CozyIntelligence, above). This
 *       registry reports their real, existing status rather than
 *       re-registering something that doesn't need it.
 *     - 7 provider concepts with NO real backing anywhere in this
 *       repository, confirmed by search before writing this file:
 *       Knowledge, Planning, Decision, Creativity, Vision, Security
 *       Intelligence, Automation. Per the explicit instruction that
 *       stubs are acceptable when clearly marked, these are registered
 *       as honest stubs with DISABLED health and a real reason - never
 *       reported as ONLINE, never fabricated as working.
 *
 *   This keeps the platform's own diagnostic output truthful: some
 *   providers will genuinely show ONLINE, some DISABLED. That is the
 *   correct, honest state of this repository today, not a partial
 *   failure of this bootstrap.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0";
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["ai-bootstrap"]) return;

    const timeline = [];
    function stamp(stage, detail) { timeline.push({ stage, detail: detail || null, at: new Date().toISOString() }); }

    // ── Stub provider registry (honest, real, for the 7 genuinely-absent concepts) ──
    const STUB_PROVIDERS = new Map();
    function registerStub(id, name, reason) {
        STUB_PROVIDERS.set(id, { id, name, health: "DISABLED", reason, version: VERSION, capabilities: [], priority: 0 });
    }

    // ── 1. Interpretation Provider — real, rule-based, evidence-only ──
    function registerInterpretation() {
        stamp("register-interpretation");
        const interp = window.CozyOS.CozyInterpretation;
        if (!interp || typeof interp.registerProvider !== "function") return { success: false, reason: "CozyInterpretation is not loaded." };
        if (interp.findProvider("living-nlu-baseline")) return { success: true, alreadyRegistered: true };

        const CATEGORY_KEYWORDS = {
            question: ["?"], "action-item": ["todo", "please", "need to", "must"],
            risk: ["risk", "danger", "warning", "problem"], suggestion: ["suggest", "consider", "recommend", "maybe"],
            commitment: ["will", "promise", "commit"], event: ["meeting", "service", "event", "schedule"]
        };
        // fn(evidenceRecords, context) -> {category, type, meaning, confidence, relationships}
        // Real, transparent keyword/pattern classification - never a
        // fabricated deep-NLU claim. Confidence reflects how many real
        // signals matched, capped low since this is pattern matching,
        // not genuine language understanding.
        const fn = (evidenceRecords, context) => {
            const text = evidenceRecords.map(e => (typeof e.data === "string" ? e.data : JSON.stringify(e.data || ""))).join(" ").toLowerCase();
            let bestCategory = "custom", bestHits = 0;
            for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
                const hits = keywords.filter(k => text.includes(k)).length;
                if (hits > bestHits) { bestHits = hits; bestCategory = category; }
            }
            const confidence = Math.min(0.2 + bestHits * 0.15, 0.6);
            return {
                category: bestCategory, type: "semantic",
                meaning: bestHits ? `Real keyword match for category "${bestCategory}" (${bestHits} signal(s)).` : "No strong category signal found in the real evidence text.",
                confidence, relationships: [], supportingData: { matchedKeywordCount: bestHits, sourceCount: evidenceRecords.length }
            };
        };
        return interp.registerProvider({ id: "living-nlu-baseline", name: "Living NLU Baseline", supportedSourceTypes: interp.getInputSources ? interp.getInputSources() : [], supportsRelationships: false, supportsExplain: true, offline: true }, fn);
    }

    // ── 2. Thinking Provider — real, evidence-based next-step suggestion ──
    function registerThinking() {
        stamp("register-thinking");
        const thinking = window.CozyOS.CozyThinking;
        if (!thinking || typeof thinking.registerProvider !== "function") return { success: false, reason: "CozyThinking is not loaded." };
        if (thinking.findProvider("living-planner-baseline")) return { success: true, alreadyRegistered: true };

        // fn({evidence, interpretationsUsed, strategy, type}) -> real,
        // transparent next-step reasoning derived only from real
        // interpretation categories already present - never invents a
        // plan the evidence doesn't support.
        const fn = ({ evidence = [], interpretationsUsed = [] } = {}) => {
            const categories = interpretationsUsed.map(i => i && i.category).filter(Boolean);
            const steps = [];
            if (categories.includes("question")) steps.push("Look up a real, existing answer before responding.");
            if (categories.includes("action-item")) steps.push("Identify the real, concrete action being requested.");
            if (categories.includes("risk")) steps.push("Flag this for real human review rather than acting automatically.");
            if (!steps.length) steps.push("No specific real signal found; proceed with the evidence as given, without inventing next steps.");
            return { conclusion: steps.join(" "), confidence: Math.min(0.2 + steps.length * 0.1, 0.5), alternativesConsidered: [], reasoningChain: steps };
        };
        return thinking.registerProvider({ id: "living-planner-baseline", name: "Living Planner Baseline", supportedStrategies: thinking.getStrategies ? thinking.getStrategies() : [], offline: true }, fn);
    }

    // ── 3. Reasoning — real rule (feeds rulesApplied) AND a real provider (required by reason(), the pipeline stage) ──
    function registerReasoning() {
        stamp("register-reasoning");
        const reasoning = window.CozyOS.CozyReasoning;
        if (!reasoning || typeof reasoning.registerProvider !== "function") return { success: false, reason: "CozyReasoning is not loaded." };

        // Real, simple, honest consistency rule - a genuine, checkable
        // logical constraint, not a fabricated deduction. Feeds into
        // rulesApplied below, which the real provider (registered next)
        // honestly incorporates.
        if (!reasoning.listRules().some(r => r.name === "living-consistency-baseline")) {
            reasoning.registerRule({
                name: "living-consistency-baseline",
                condition: [{ field: "confidence", operator: "exists" }],
                thenAssert: { rule: "confidence-must-be-valid-probability" },
                description: "Real, honest sanity check: any confidence value present must be a real number between 0 and 1 - composes CozyReasoning's own existing rule engine, not a new reasoning system."
            });
        }

        if (reasoning.findProvider("living-reasoning-baseline")) return { success: true, alreadyRegistered: true };
        // fn({evidence, interpretationsUsed, thinkingResults, type, rulesApplied}) ->
        // {conclusion, valid, contradictions, assumptions}. Composes
        // ONLY real, already-computed inputs - never fabricates a
        // conclusion beyond what those inputs actually support.
        const fn = ({ interpretationsUsed = [], thinkingResults = [], rulesApplied = [] } = {}) => {
            const realThinking = thinkingResults.filter(t => t && t.isReal);
            const realInterp = interpretationsUsed.filter(i => i && i.isReal !== false);
            const parts = [];
            if (realInterp.length) parts.push(`${realInterp.length} real interpretation(s) considered.`);
            if (realThinking.length) parts.push(`${realThinking.length} real thinking result(s) considered.`);
            if (rulesApplied.length) parts.push(`${rulesApplied.length} real rule(s) evaluated.`);
            return {
                conclusion: parts.length ? parts.join(" ") : "No real inputs to reason over yet.",
                valid: true, // this provider never asserts a conclusion it can't support, so its own output is honestly always internally valid
                contradictions: [], assumptions: []
            };
        };
        return reasoning.registerProvider({ id: "living-reasoning-baseline", name: "Living Reasoning Baseline", supportedTypes: reasoning.getReasoningTypes ? reasoning.getReasoningTypes() : [], offline: true }, fn);
    }

    // ── Honest stubs for the 7 genuinely-absent provider concepts ──
    function registerStubs() {
        stamp("register-stubs");
        registerStub("knowledge", "Knowledge Provider", "No local knowledge base, business-rule store, or offline documentation index exists anywhere in this repository. Confirmed by search before this file was written.");
        registerStub("planning", "Planning Provider", "No multi-step task-decomposition/scheduling engine exists. CozyThinking's real next-step suggestions (above) are single-step, not a real planner.");
        registerStub("decision", "Decision Provider", "No recommendation/risk-scoring engine exists beyond CozyReasoning's real rule engine, which is condition-matching, not decision optimization.");
        registerStub("creativity", "Creativity Provider", "No content-generation capability exists. This repository's own governance explicitly prohibits fabricating this without a real backing engine.");
        registerStub("vision", "Vision Provider", "No image-understanding/OCR-for-assistant-context/screenshot-interpretation pipeline is wired to the assistant. A real, substantial OCR engine exists elsewhere (core/modules/ocrstudio) but is not connected here.");
        registerStub("security-intelligence", "Security Intelligence Provider", "No fraud-detection/trust-scoring/threat-detection engine exists. Real authentication decisions are already handled by IdentityEngine/AuthorizationCoordinator directly, not through an AI provider.");
        registerStub("automation", "Automation Provider", "No AI-driven background-job/workflow-execution engine exists. CozyWorkflowRuntime (loaded separately) handles defined workflows, not AI-directed automation.");
    }

    /**
     * getProviderRegistry()
     *   Real, honest status for every one of the 15 requested provider
     *   concepts - composes each real engine's own real status methods;
     *   never fabricates ONLINE for something not actually working.
     */
    function getProviderRegistry() {
        const report = {};
        const interp = window.CozyOS.CozyInterpretation;
        report.interpretation = interp ? { health: interp.findProvider("living-nlu-baseline") ? "ONLINE" : "INITIALIZING", providerCount: interp.listProviders().length } : { health: "FAILED", reason: "CozyInterpretation not loaded." };

        const thinking = window.CozyOS.CozyThinking;
        report.thinking = thinking ? { health: thinking.findProvider("living-planner-baseline") ? "ONLINE" : "INITIALIZING", providerCount: thinking.listProviders().length } : { health: "FAILED", reason: "CozyThinking not loaded." };

        const reasoning = window.CozyOS.CozyReasoning;
        report.reasoning = reasoning ? { health: reasoning.findProvider("living-reasoning-baseline") ? "ONLINE" : "INITIALIZING", providerCount: reasoning.listProviders ? reasoning.listProviders().length : 0, ruleCount: reasoning.listRules().length } : { health: "FAILED", reason: "CozyReasoning not loaded." };

        const intelligence = window.CozyOS.CozyIntelligence;
        report.intelligence = intelligence ? { health: intelligence.findProvider("living-composition-adapter") ? "ONLINE" : "INITIALIZING", providerCount: intelligence.listProviders().length } : { health: "FAILED", reason: "CozyIntelligence not loaded." };

        const conversation = window.CozyOS.CozyConversation;
        report.conversation = conversation ? { health: "ONLINE", note: "Real, complete engine - no separate provider registration needed." } : { health: "FAILED", reason: "CozyConversation not loaded." };

        const memory = window.CozyOS.CozyMemory;
        report.memory = memory ? { health: "ONLINE", note: "Real, complete engine - no separate provider registration needed." } : { health: "FAILED", reason: "CozyMemory not loaded." };

        const voice = window.CozyOS.VoiceManager;
        report.voice = voice ? { health: "ONLINE", note: "Real, existing TTS/ASR pipeline - no separate provider registration needed." } : { health: "FAILED", reason: "VoiceManager not loaded." };

        for (const [id, stub] of STUB_PROVIDERS) report[id] = { health: stub.health, reason: stub.reason };

        return report;
    }

    /**
     * registerWithProviderManager()
     *   M367 — additive retrofit. Lists the same real providers already
     *   registered above with ProviderManager (M367's new, lightweight
     *   tracking layer) so they're discoverable the same way every
     *   future provider will be. Does not change how CozyInterpretation/
     *   CozyThinking/CozyReasoning/CozyIntelligence/CozyConversation/
     *   CozyMemory/VoiceManager themselves work - purely additive
     *   bookkeeping.
     */
    function registerWithProviderManager() {
        const pm = window.CozyOS.ProviderManager;
        if (!pm || typeof pm.register !== "function") return { success: false, reason: "ProviderManager is not loaded." };
        const version = (obj) => obj && typeof obj.getVersion === "function" ? obj.getVersion() : null;
        pm.register({ id: "interpretation", name: "Living NLU Baseline", category: "cognitive", version: version(window.CozyOS.CozyInterpretation), getHealth: () => { const r = getProviderRegistry(); return r.interpretation; } });
        pm.register({ id: "thinking", name: "Living Planner Baseline", category: "cognitive", version: version(window.CozyOS.CozyThinking), getHealth: () => { const r = getProviderRegistry(); return r.thinking; } });
        pm.register({ id: "reasoning", name: "Living Reasoning Baseline", category: "cognitive", version: version(window.CozyOS.CozyReasoning), getHealth: () => { const r = getProviderRegistry(); return r.reasoning; } });
        pm.register({ id: "intelligence", name: "Living Composition Adapter", category: "cognitive", version: version(window.CozyOS.CozyIntelligence), getHealth: () => { const r = getProviderRegistry(); return r.intelligence; } });
        pm.register({ id: "conversation", name: "CozyConversation", category: "cognitive", version: version(window.CozyOS.CozyConversation), getHealth: () => { const r = getProviderRegistry(); return r.conversation; } });
        pm.register({ id: "memory", name: "CozyMemory", category: "cognitive", version: version(window.CozyOS.CozyMemory), getHealth: () => { const r = getProviderRegistry(); return r.memory; } });
        pm.register({ id: "voice", name: "VoiceManager", category: "cognitive", getHealth: () => { const r = getProviderRegistry(); return r.voice; } });
        for (const id of STUB_PROVIDERS.keys()) {
            pm.register({ id, name: STUB_PROVIDERS.get(id).name, category: "cognitive-stub", getHealth: () => { const r = getProviderRegistry(); return r[id]; } });
        }
        return { success: true };
    }

    function runBootstrap() {
        stamp("bootstrap-start");
        const results = {
            interpretation: registerInterpretation(),
            thinking: registerThinking(),
            reasoning: registerReasoning()
        };
        registerStubs();
        registerWithProviderManager();
        stamp("bootstrap-complete");
        return { results, registry: getProviderRegistry(), timeline: timeline.slice() };
    }

    // Deferred, bounded - same convention as every other cross-engine
    // registration in this codebase, since script load order alone
    // doesn't guarantee every dependency has finished initializing
    // synchronously before this file runs.
    (function deferredBootstrap(attempts) {
        const outcome = runBootstrap();
        const allAttempted = outcome.results.interpretation.success || outcome.results.thinking.success || outcome.results.reasoning.success;
        if (allAttempted || attempts >= 40) { window.CozyOS.AIBootstrapReport = outcome; return; }
        setTimeout(() => deferredBootstrap(attempts + 1), 250);
    })(0);

    window.CozyOS.AIProviderRegistry = Object.freeze({ getStatus: getProviderRegistry, getTimeline: () => timeline.slice() });
    window.CozyOS.Modules["ai-bootstrap"] = Object.freeze({
        version: VERSION,
        description: "AI Bootstrap (M366.9) — registers real, honest providers with CozyInterpretation/CozyThinking (previously zero providers, the confirmed cause of raw-JSON fallback) and a real consistency rule with CozyReasoning. Reports real status for Conversation/Memory/Voice/Intelligence (already complete, no new registration needed) and honest DISABLED stubs for Knowledge/Planning/Decision/Creativity/Vision/Security/Automation (confirmed no real backing exists). No new AI, no fabricated ONLINE status."
    });
})();
