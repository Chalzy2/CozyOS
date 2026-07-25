/**
 * CozyOS Interpretation Engine
 * File Reference: core/modules/interpretation/cozy-interpretation.js
 * Milestone: 166 — Cozy Interpretation Engine Platform
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   No platform-wide semantic/meaning engine existed. A file named
 *   "understanding-engine.js" exists at core/modules/builder/ but is
 *   scoped entirely to CozyBuilder's code-generation requirement
 *   analysis (text/code/PDF -> app-type detection) — a different domain,
 *   not a duplicate of this platform-wide engine. Not extended; this is
 *   a new canonical owner.
 *   Owns: interpretation registry/sessions/pipeline/providers, semantic
 *   category registry, evidence mapping, results, timeline, diagnostics,
 *   health.
 *   Never owns: AI provider registry, memory storage, workflow
 *   execution, policy decisions, authentication, translation, speech
 *   recognition, audio/video/camera capture — consumed only.
 *
 * EVIDENCE / CONFIDENCE DISCIPLINE
 *   interpret() never runs without at least one real evidence item and
 *   a registered provider. Confidence is only ever whatever a registered
 *   provider function returns — if a provider supplies none, confidence
 *   is null, never invented. With zero providers registered, every
 *   interpretation call returns { available:false, isReal:false,
 *   reason:"No interpretation provider registered." } and stores nothing.
 *   Relationship mapping and summarisation/explanation are likewise
 *   extension points — never a heuristic guess by this file standing in
 *   for real provider output.
 *
 * INTEGRATION NOTE
 *   Real, verified integrations: CozyConversation.getTimeline() (for
 *   interpretConversation) and CozyMemory.readMemory() (for
 *   interpretMemory) — both checked at call time, never assumed present.
 *   interpretOCR()/interpretDocument()/interpretStructuredData() accept
 *   caller-supplied evidence directly; this file did not verify OCR/
 *   Vision platform read APIs in this pass, so it does not claim to
 *   pull data from them automatically — callers pass the OCR/Vision
 *   result object they already have.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.CozyInterpretation) return;

    const INPUT_SOURCES = Object.freeze(["conversation-transcript", "speech-transcript", "ocr-result", "document", "pdf", "form", "image-metadata", "memory-record", "vision-observation", "hearing-observation", "workflow-result", "application-data", "sensor-observation", "json-object", "custom"]);
    const CATEGORIES = Object.freeze(["topic", "intent", "request", "question", "decision", "action-item", "task", "commitment", "agreement", "risk", "opportunity", "problem", "suggestion", "instruction", "event", "relationship", "business-meaning", "educational-meaning", "religious-discussion", "medical-information", "legal-information", "custom"]);
    const TYPES = Object.freeze(["semantic", "contextual", "document", "conversation", "meeting", "customer", "business", "educational", "religious", "technical", "visual", "audio", "cross-source", "custom"]);
    const PIPELINE_STAGES = Object.freeze(["input-validation", "evidence-collection", "context-assembly", "meaning-extraction", "confidence-assignment", "relationship-mapping", "result-generation", "completion"]);
    const RELATIONSHIP_TYPES = Object.freeze(["supports", "contradicts", "expands", "references", "depends-on", "explains", "summarises", "follows", "custom"]);
    const HEALTH = Object.freeze({ READY: "ready", INTERPRETING: "interpreting", PAUSED: "paused", WAITING: "waiting", UNAVAILABLE: "unavailable", ERROR: "error" });

    function _uid(prefix) { return `${prefix}_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(36).slice(2)}`; }
    function _dep(name) { return window.CozyOS[name] || null; }

    class CozyInterpretationEngine {
        #sessions = new Map();
        #providers = new Map();      // id -> { descriptor, fn }
        #semanticTypes = new Map();  // id -> descriptor
        #results = new Map();        // interpretationId -> full result
        #pipelineTimeline = new Map(); // interpretationId -> [ {stage, at} ]
        #defaultProviderId = null;
        #enabled = true;
        #interpreting = false;
        #lastError = null;

        getVersion() { return VERSION; }

        // ── RL-014 Platform Inspection Contract (Milestone 173, additive only) ──
        getId() { return "CozyInterpretation"; }
        getName() { return "CozyInterpretation"; }
        /** @returns {string[]} real optional integrations checked via _dep() at call time. */
        getDependencies() { return ["CozyConversation", "CozyMemory"]; }
        getInputSources() { return INPUT_SOURCES.slice(); }
        getCategories() { return CATEGORIES.slice(); }
        getTypes() { return TYPES.slice(); }
        getRelationshipTypes() { return RELATIONSHIP_TYPES.slice(); }

        // ── Semantic Registry ────────────────────────────────────────────────
        registerSemanticType({ id, name, category } = {}) {
            if (!id || !name) return { success: false, reason: "id and name are required." };
            if (category && !CATEGORIES.includes(category)) return { success: false, reason: `Unknown category "${category}".` };
            this.#semanticTypes.set(id, Object.freeze({ id, name, category: category || "custom" }));
            return { success: true };
        }
        removeSemanticType(id) { return this.#semanticTypes.delete(id); }
        findSemanticType(id) { return this.#semanticTypes.get(id) || null; }
        listSemanticTypes() { return Array.from(this.#semanticTypes.values()); }

        // ── Provider Registry ────────────────────────────────────────────────
        /** fn(evidenceArray, context) -> { category, type, meaning, confidence?, supportingData?, relationships? } | array of these */
        registerProvider(descriptor = {}, fn) {
            if (!descriptor.id || typeof fn !== "function") return { success: false, reason: "descriptor.id and a real fn are required." };
            this.#providers.set(descriptor.id, {
                descriptor: Object.freeze({
                    id: descriptor.id, name: descriptor.name || descriptor.id,
                    supportedSourceTypes: Array.isArray(descriptor.supportedSourceTypes) ? descriptor.supportedSourceTypes.filter((s) => INPUT_SOURCES.includes(s)) : [],
                    supportsRelationships: !!descriptor.supportsRelationships, supportsExplain: !!descriptor.supportsExplain, offline: !!descriptor.offline
                }),
                fn, healthy: true
            });
            if (!this.#defaultProviderId) this.#defaultProviderId = descriptor.id;
            return { success: true };
        }
        removeProvider(id) { const removed = this.#providers.delete(id); if (this.#defaultProviderId === id) this.#defaultProviderId = this.#providers.keys().next().value || null; return removed; }
        listProviders() { return Array.from(this.#providers.values()).map((p) => p.descriptor); }
        findProvider(id) { const p = this.#providers.get(id); return p ? p.descriptor : null; }
        setDefaultProvider(id) { if (!this.#providers.has(id)) return { success: false, reason: `Provider "${id}" not registered.` }; this.#defaultProviderId = id; return { success: true }; }
        getProviderHealth(id) { const p = this.#providers.get(id); return p ? { id, healthy: p.healthy } : { id, healthy: false, reason: "not registered" }; }

        // ── Session API ──────────────────────────────────────────────────────
        createSession({ type = "custom" } = {}) {
            if (!TYPES.includes(type)) return { success: false, reason: `Unknown interpretation type "${type}".` };
            const id = _uid("interp-session");
            this.#sessions.set(id, { id, type, state: "created", createdAt: new Date().toISOString(), interpretationIds: [] });
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

        // ── Core interpretation pipeline ────────────────────────────────────
        /**
         * interpret({ sourceType, evidence, context, providerId, sessionId })
         *   evidence: array of { source, data, timestamp? } — required, real.
         */
        interpret({ sourceType, evidence, context = {}, providerId = null, sessionId = null } = {}) {
            const interpretationId = _uid("interp");
            const stamp = (stage) => { const t = this.#pipelineTimeline.get(interpretationId) || []; t.push({ stage, at: new Date().toISOString() }); this.#pipelineTimeline.set(interpretationId, t); };

            stamp("input-validation");
            if (!INPUT_SOURCES.includes(sourceType)) return { success: false, available: false, isReal: false, reason: `Unknown sourceType "${sourceType}".` };
            if (!Array.isArray(evidence) || evidence.length === 0) return { success: false, available: false, isReal: false, reason: "evidence must be a non-empty array of real evidence items. Not fabricated." };

            stamp("evidence-collection");
            const evidenceRecords = evidence.map((e) => ({ source: e.source || sourceType, data: e.data, timestamp: e.timestamp || new Date().toISOString() }));

            stamp("context-assembly");
            const assembledContext = { ...context, sessionId };

            const provider = providerId ? this.#providers.get(providerId) : (this.#defaultProviderId ? this.#providers.get(this.#defaultProviderId) : null);
            if (!provider) {
                stamp("completion");
                return { success: false, available: false, isReal: false, reason: "No interpretation provider registered." };
            }

            this.#interpreting = true;
            stamp("meaning-extraction");
            let raw;
            try { raw = provider.fn(evidenceRecords, assembledContext); }
            catch (err) {
                this.#interpreting = false;
                provider.healthy = false;
                this.#lastError = err && err.message ? err.message : String(err);
                stamp("completion");
                return { success: false, available: true, isReal: false, reason: `Provider threw: ${this.#lastError}` };
            }
            this.#interpreting = false;
            const outputs = Array.isArray(raw) ? raw : [raw];

            stamp("confidence-assignment");
            stamp("relationship-mapping");
            const results = outputs.filter(Boolean).map((o) => ({
                interpretationId: _uid("result"),
                category: CATEGORIES.includes(o.category) ? o.category : "custom",
                type: TYPES.includes(o.type) ? o.type : "custom",
                meaning: o.meaning != null ? o.meaning : null,
                confidence: typeof o.confidence === "number" ? o.confidence : null,
                isReal: true,
                provider: provider.descriptor.id,
                evidence: evidenceRecords,
                relationships: Array.isArray(o.relationships) ? o.relationships.filter((r) => RELATIONSHIP_TYPES.includes(r.type)) : [],
                supportingData: o.supportingData || null,
                timestamp: new Date().toISOString()
            }));

            stamp("result-generation");
            results.forEach((r) => this.#results.set(r.interpretationId, r));
            if (sessionId && this.#sessions.has(sessionId)) {
                const s = this.#sessions.get(sessionId);
                this.#sessions.set(sessionId, { ...s, interpretationIds: [...s.interpretationIds, ...results.map((r) => r.interpretationId)] });
            }
            stamp("completion");

            return { success: true, available: true, isReal: true, interpretationId, results };
        }

        // ── Source-specific wrappers ─────────────────────────────────────────
        interpretConversation(conversationId, opts = {}) {
            const conv = _dep("CozyConversation");
            if (!conv || typeof conv.getTimeline !== "function") return { success: false, available: false, isReal: false, reason: "CozyConversation not available." };
            const timeline = conv.getTimeline(conversationId);
            if (!timeline) return { success: false, available: false, isReal: false, reason: `Conversation "${conversationId}" not found.` };
            return this.interpret({ sourceType: "conversation-transcript", evidence: timeline.map((s) => ({ source: "conversation-transcript", data: s })), ...opts });
        }
        interpretMemory(namespace, key, opts = {}) {
            const mem = _dep("CozyMemory");
            if (!mem || typeof mem.readMemory !== "function") return { success: false, available: false, isReal: false, reason: "CozyMemory not available." };
            const entry = mem.readMemory(namespace, key);
            if (!entry) return { success: false, available: false, isReal: false, reason: `Memory "${namespace}/${key}" not found.` };
            return this.interpret({ sourceType: "memory-record", evidence: [{ source: "memory-record", data: entry }], ...opts });
        }
        interpretOCR(ocrResult, opts = {}) { return this.interpret({ sourceType: "ocr-result", evidence: [{ source: "ocr-result", data: ocrResult }], ...opts }); }
        interpretDocument(document, opts = {}) { return this.interpret({ sourceType: "document", evidence: [{ source: "document", data: document }], ...opts }); }
        interpretStructuredData(obj, opts = {}) { return this.interpret({ sourceType: "json-object", evidence: [{ source: "json-object", data: obj }], ...opts }); }

        // ── Comparison / summarisation / explanation (extension points) ────
        compareInterpretations(idA, idB, { providerId = null } = {}) {
            const a = this.#results.get(idA), b = this.#results.get(idB);
            if (!a || !b) return { success: false, available: false, isReal: false, reason: "Both interpretation ids must exist." };
            const provider = providerId ? this.#providers.get(providerId) : (this.#defaultProviderId ? this.#providers.get(this.#defaultProviderId) : null);
            if (!provider || !provider.descriptor.supportsRelationships || typeof provider.fn.compare !== "function") {
                return { success: false, available: false, isReal: false, reason: "No provider with relationship-comparison support registered." };
            }
            try { return { success: true, available: true, isReal: true, comparison: provider.fn.compare(a, b) }; }
            catch (err) { return { success: false, available: true, isReal: false, reason: err && err.message ? err.message : String(err) }; }
        }
        summariseInterpretation(interpretationId, { providerId = null } = {}) {
            const r = this.#results.get(interpretationId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Interpretation not found." };
            const provider = providerId ? this.#providers.get(providerId) : this.#providers.get(r.provider);
            if (!provider || !provider.descriptor.supportsExplain || typeof provider.fn.summarise !== "function") {
                return { success: false, available: false, isReal: false, reason: "No provider with summarisation support registered." };
            }
            try { return { success: true, available: true, isReal: true, summary: provider.fn.summarise(r) }; }
            catch (err) { return { success: false, available: true, isReal: false, reason: err && err.message ? err.message : String(err) }; }
        }
        explainInterpretation(interpretationId, { providerId = null } = {}) {
            const r = this.#results.get(interpretationId);
            if (!r) return { success: false, available: false, isReal: false, reason: "Interpretation not found." };
            const provider = providerId ? this.#providers.get(providerId) : this.#providers.get(r.provider);
            if (!provider || !provider.descriptor.supportsExplain || typeof provider.fn.explain !== "function") {
                return { success: false, available: false, isReal: false, reason: "No provider with explanation support registered.", evidence: r.evidence };
            }
            try { return { success: true, available: true, isReal: true, explanation: provider.fn.explain(r) }; }
            catch (err) { return { success: false, available: true, isReal: false, reason: err && err.message ? err.message : String(err) }; }
        }
        getEvidence(interpretationId) { const r = this.#results.get(interpretationId); return r ? r.evidence : null; }

        // ── Diagnostics ──────────────────────────────────────────────────────
        getPipelineStatus(interpretationId) { return this.#pipelineTimeline.get(interpretationId) || null; }
        getProviderStatus() { return this.listProviders().map((d) => ({ ...d, healthy: this.getProviderHealth(d.id).healthy })); }
        getInterpretationStatistics() {
            const byCategory = {}, byType = {};
            for (const r of this.#results.values()) { byCategory[r.category] = (byCategory[r.category] || 0) + 1; byType[r.type] = (byType[r.type] || 0) + 1; }
            return { total: this.#results.size, byCategory, byType };
        }
        getSessionStatistics() {
            const byState = {};
            for (const s of this.#sessions.values()) byState[s.state] = (byState[s.state] || 0) + 1;
            return { total: this.#sessions.size, byState };
        }
        getEvidenceStatistics() {
            const bySource = {};
            for (const r of this.#results.values()) for (const e of r.evidence) bySource[e.source] = (bySource[e.source] || 0) + 1;
            return { bySource };
        }

        // ── Capabilities (real, honest) ─────────────────────────────────────
        getCapabilities() {
            const providers = Array.from(this.#providers.values());
            return Object.freeze({
                supportsConversationInterpretation: !!_dep("CozyConversation") && providers.some((p) => p.descriptor.supportedSourceTypes.includes("conversation-transcript")),
                supportsDocumentInterpretation: providers.some((p) => p.descriptor.supportedSourceTypes.includes("document")),
                supportsOCRInterpretation: providers.some((p) => p.descriptor.supportedSourceTypes.includes("ocr-result")),
                supportsStructuredData: providers.length > 0,
                supportsCrossSourceInterpretation: providers.length > 0,
                supportsSemanticRelationships: providers.some((p) => p.descriptor.supportsRelationships),
                supportsEvidenceTracking: true,
                supportsExplanation: providers.some((p) => p.descriptor.supportsExplain)
            });
        }

        
        // ── Search ───────────────────────────────────────────────────────────
        searchInterpretations(query) {
            const q = String(query).toLowerCase();
            return Array.from(this.#results.values()).filter((r) => JSON.stringify(r.meaning).toLowerCase().includes(q));
        }
        searchEvidence(query) {
            const q = String(query).toLowerCase();
            const hits = [];
            for (const r of this.#results.values()) { const matches = r.evidence.filter((e) => JSON.stringify(e.data).toLowerCase().includes(q)); if (matches.length) hits.push({ interpretationId: r.interpretationId, matches }); }
            return hits;
        }
        searchCategories(category) { return Array.from(this.#results.values()).filter((r) => r.category === category); }
        searchRelationships(type) { return Array.from(this.#results.values()).flatMap((r) => r.relationships.filter((rel) => rel.type === type).map((rel) => ({ interpretationId: r.interpretationId, relationship: rel }))); }
        searchSessions(predicate) { return this.listSessions(predicate); }

        // ── Health ───────────────────────────────────────────────────────────
        getHealth() {
            if (this.#lastError) return { health: HEALTH.ERROR, reason: this.#lastError };
            if (!this.#enabled) return { health: HEALTH.UNAVAILABLE };
            if (this.#interpreting) return { health: HEALTH.INTERPRETING };
            if (this.#providers.size === 0) return { health: HEALTH.WAITING, reason: "No providers registered." };
            return { health: HEALTH.READY, providerCount: this.#providers.size, resultCount: this.#results.size };
        }
        disable() { this.#enabled = false; }
        enable() { this.#enabled = true; }

        getIntegrationManifest() {
            return {
                owns: ["interpretation registry/sessions/pipeline/providers", "semantic type registry", "evidence mapping", "results", "diagnostics"],
                doesNotOwn: ["AI provider registry", "memory storage", "workflow execution", "policy decisions", "authentication", "translation", "speech recognition", "audio/video/camera capture"],
                honestLimitation: "interpret() returns available:false/isReal:false with zero results whenever no provider is registered or evidence is missing. Confidence is null unless a provider supplies it. compareInterpretations/summariseInterpretation/explainInterpretation require a provider that implements compare/summarise/explain — never a built-in heuristic guess."
            };
        }
    }

    window.CozyOS.CozyInterpretation = new CozyInterpretationEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CozyInterpretation", category: "Platform", icon: "search.svg",
                description: "Canonical Interpretation Engine. Evidence-based meaning extraction via registered providers only — fails closed with no fabricated meaning, confidence, or relationships when no provider is registered."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
