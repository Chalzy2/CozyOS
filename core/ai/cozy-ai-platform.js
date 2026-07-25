/**
 * ── CozyOS AI ENGINE PLATFORM ──
 * FILE: core/ai/cozy-ai-platform.js
 * VERSION: 1.0.0-ENTERPRISE
 * MILESTONE: 151
 *
 * CORE ARCHITECTURAL INVARIANT
 *   This is the shared platform AI engine every CozyOS application consumes
 *   (CozyBuilder, ShopOS, MpesaOS, QuarryOS, Vision, Speech, Translation,
 *   Wallet, Vault, and future modules). It is NOT an assistant and NOT a
 *   chatbot — it is registry, session, and pipeline infrastructure.
 *
 *   Attaches to window.CozyOS.AI (core/ai.js, CozyAIEngine) as the
 *   "platform" sub-engine via initializeSubEngine(), the same convention
 *   core/ai/cozy-ai-language.js and core/ai/cozy-ai-memory.js already use.
 *   Never modifies core/ai.js's own intent-routing responsibility.
 *
 * OWNERSHIP REVIEW (performed before writing this file)
 *   Canonical owners found and EXTENDED, never duplicated:
 *     - window.CozyOS.AI            (core/ai.js)              — intent router, parent coordinator
 *     - window.CozyOS.AIMode        (core/modules/aimode/cozy-ai-mode.js) — AI Provider Gateway.
 *       This file already owns provider registration/selection (registerProvider,
 *       getMode/setMode, listRegisteredProviders, getProviderInfo). This platform
 *       NEVER re-implements a provider registry — it delegates to AIMode for every
 *       provider question and only adds Model/Capability metadata on top.
 *     - window.CozyOS.SessionService (core/modules/session/cozy-session-service.js)
 *       — canonical current-user session. Consumed read-only via current(); never
 *       re-implemented, never stores identity itself.
 *     - window.CozyOS.ContextEngine  (core/context/cozy-context-engine.js) — app
 *       "personality" content. Consumed read-only via getActiveContext(); this
 *       platform's Context Manager is a different, AI-request-scoped concept
 *       (conversation/user/workspace/session context for a single AI call) and
 *       does not own or duplicate application personality content.
 *     - window.CozyOS.Config.ai (core/config.js) — existing static AI config
 *       keys (aiProcessingEnabled, defaultAIProvider, provider keys). Read as the
 *       base layer; this platform layers runtime-mutable overrides on top rather
 *       than creating a second config store.
 *
 * WHAT THIS FILE DOES NOT OWN (Zero Duplication Rule)
 *   Voice, Translation, Authentication, Identity, Notifications, Media, Vision,
 *   Camera, Firebase — all consumed by reference (Tool Registry entries or
 *   direct optional calls), never implemented here.
 *
 * REGISTRY-ONLY DISCIPLINE
 *   Model Registry, Capability Registry, and Tool Registry store metadata only.
 *   No model, capability, or tool ships pre-registered — an empty registry is
 *   reported honestly rather than inventing plausible defaults (Zero
 *   Fabrication Rule, same convention as cozy-context-engine.js).
 *
 * RUNTIME RULES
 *   Never fabricates an AI response, model, or provider. If no provider is
 *   registered/active on AIMode, submitRequest() fails closed with a
 *   structured "provider_unavailable" result — it does not simulate a reply.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const PLATFORM_VERSION = "1.0.0-ENTERPRISE";

    const PROMPT_KINDS = Object.freeze(["system", "developer", "user", "runtime"]);
    const SESSION_STATES = Object.freeze(["active", "resumed", "closed", "cancelled"]);
    const HEALTH_STATES = Object.freeze(["ready", "loading", "degraded", "error", "offline"]);

    const DEFAULT_CONFIG = Object.freeze({
        defaultProvider: null,   // no hardcoded provider — set explicitly via setConfig()
        defaultModel:    null,   // no hardcoded model
        temperature:     0.7,
        maxTokens:       1024,
        streaming:       false,
        retryPolicy:     Object.freeze({ maxRetries: 2, backoffMs: 500 }),
        timeoutMs:       30000,
    });

    function safeId(prefix) {
        try {
            if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
                return `${prefix}_${crypto.randomUUID()}`;
            }
        } catch (_) { /* fall through */ }
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function deepFreeze(obj) {
        return Object.freeze({ ...obj });
    }

    class CozyAIEnginePlatform {
        constructor(masterController) {
            this.master  = masterController || null;
            this.version = PLATFORM_VERSION;

            // ── AI Model Registry (metadata only) ──────────────────────────────
            this._models = new Map();

            // ── AI Capability Registry (metadata only) ─────────────────────────
            this._capabilities = new Map();

            // ── AI Tool Registry (metadata only, no implementation) ────────────
            this._tools = new Map();

            // ── AI Prompt Manager ───────────────────────────────────────────────
            this._prompts = { system: new Map(), developer: new Map(), user: new Map(), runtime: new Map() };

            // ── AI Session Manager (AI conversation sessions — distinct from
            //    window.CozyOS.SessionService's user/auth session) ──────────────
            this._sessions = new Map();

            // ── AI Conversation Manager ─────────────────────────────────────────
            this._conversations = new Map();

            // ── AI Request Queue / Response Pipeline ───────────────────────────
            this._queue = [];
            this._queueRunning = false;

            // ── AI Configuration (layered over window.CozyOS.Config.ai) ────────
            this._configOverrides = {};

            // ── AI Health Status ────────────────────────────────────────────────
            this._health = { state: "loading", lastError: null, updatedAt: new Date().toISOString() };

            // ── Simple event emitter (matches sibling AI files' convention) ────
            this._listeners = new Map();

            // Self-register on the parent AI coordinator, same convention as
            // core/ai/cozy-ai-language.js and core/ai/cozy-ai-memory.js.
            if (this.master && typeof this.master.initializeSubEngine === "function") {
                this.master.initializeSubEngine("platform", this);
            } else {
                console.warn("[Cozy AI Platform] No masterController.initializeSubEngine() available — running unattached.");
            }

            this._setHealth("ready");
        }

        // ── Manifest / lifecycle contract (required by cozy-ai-integration.js's
        //    ENGINE_LIFECYCLE_METHODS: evaluate, getHealth, getCapabilities, getVersion) ──

        getVersion() { return this.version; }

        getManifest() {
            return {
                name: "platform",
                version: this.version,
                capabilities: this.getCapabilities(),
                dependencies: [],
                author: "CozyOS Core",
            };
        }

        getHealth() { return { ...this._health }; }

        // ── RL-014 Platform Inspection Contract (Milestone 173, additive only) ──
        /** @returns {string} stable identifier — matches getManifest().name and the registerEngine("platform", ...) call. */
        getId() { return "platform"; }
        /** @returns {string} human-readable name — matches the ServiceRegistry catalog entry. */
        getName() { return "Cozy AI Engine Platform"; }
        /** @returns {string[]} delegates to the existing getManifest() contract rather than duplicating dependency logic. */
        getDependencies() { return this.getManifest().dependencies; }

        _setHealth(state, error) {
            if (!HEALTH_STATES.includes(state)) return;
            this._health = { state, lastError: error ? String(error.message || error).slice(0, 256) : null, updatedAt: new Date().toISOString() };
            this._emit("health.changed", this.getHealth());
        }

        /** Honest capability report: registered capability names only — never assumed. */
        getCapabilities() { return Array.from(this._capabilities.keys()); }

        /**
         * evaluate(input)
         *   Minimal, honest lifecycle hook expected by the integration bus. This is
         *   NOT a chat entry point — it reports whether the platform can currently
         *   service a given capability, without executing anything.
         */
        async evaluate(input) {
            const capability = input && input.capability;
            if (!capability) return { evaluated: false, reason: "no_capability_specified" };
            return { evaluated: true, capability, supported: this.supportsCapability(capability) };
        }

        // ── Events ───────────────────────────────────────────────────────────────

        on(event, handler) {
            if (typeof event !== "string" || !event.trim()) throw new TypeError("[Cozy AI Platform] on(): eventName required.");
            if (typeof handler !== "function") throw new TypeError("[Cozy AI Platform] on(): handler required.");
            if (!this._listeners.has(event)) this._listeners.set(event, new Set());
            this._listeners.get(event).add(handler);
            return () => this.off(event, handler);
        }

        off(event, handler) {
            const set = this._listeners.get(event);
            if (!set) return false;
            const removed = set.delete(handler);
            if (set.size === 0) this._listeners.delete(event);
            return removed;
        }

        _emit(event, payload) {
            const set = this._listeners.get(event);
            if (!set || set.size === 0) return;
            for (const fn of Array.from(set)) {
                try { fn(payload); } catch (_err) { /* listener errors never break platform state */ }
            }
        }

        // ── AI Configuration ───────────────────────────────────────────────────────

        /**
         * getConfig()
         *   Layers, in priority order: built-in defaults < window.CozyOS.Config.ai
         *   (existing static config, core/config.js) < runtime overrides set via
         *   setConfig(). Never a second source of truth for provider API keys.
         */
        getConfig() {
            const staticConfig = (window.CozyOS.Config && window.CozyOS.Config.ai) || {};
            return {
                ...DEFAULT_CONFIG,
                defaultProvider: staticConfig.defaultAIProvider ?? DEFAULT_CONFIG.defaultProvider,
                ...staticConfig,
                ...this._configOverrides,
            };
        }

        setConfig(partial) {
            if (!partial || typeof partial !== "object") throw new TypeError("[Cozy AI Platform] setConfig(): partial must be an object.");
            this._configOverrides = { ...this._configOverrides, ...partial };
            this._emit("config.changed", this.getConfig());
            return this.getConfig();
        }

        // ── AI Provider Registry (delegated to CozyAIMode — never duplicated) ──────

        getProviderGateway() { return window.CozyOS.AIMode || null; }

        /** Honest passthrough: empty array (not a fabricated list) if AIMode isn't loaded. */
        listProviders() {
            const gateway = this.getProviderGateway();
            return gateway ? gateway.listRegisteredProviders() : [];
        }

        listProviderModes() {
            const gateway = this.getProviderGateway();
            return gateway ? gateway.listModes() : [];
        }

        getActiveProviderMode() {
            const gateway = this.getProviderGateway();
            return gateway ? gateway.getMode() : null;
        }

        getProviderInfo(mode) {
            const gateway = this.getProviderGateway();
            return gateway ? gateway.getProviderInfo(mode) : null;
        }

        // ── AI Model Registry (registry only — no hardcoded models) ────────────────

        registerModel(modelId, descriptor = {}) {
            if (typeof modelId !== "string" || !modelId.trim()) throw new TypeError("[Cozy AI Platform] registerModel(): modelId required.");
            const record = deepFreeze({
                modelId,
                provider:      descriptor.provider || null,
                displayName:   descriptor.displayName || modelId,
                capabilities:  Array.isArray(descriptor.capabilities) ? [...descriptor.capabilities] : [],
                contextWindow: Number.isFinite(descriptor.contextWindow) ? descriptor.contextWindow : null,
                notes:         descriptor.notes || null,
                registeredAt:  new Date().toISOString(),
            });
            this._models.set(modelId, record);
            this._emit("model.registered", record);
            return record;
        }

        unregisterModel(modelId) { return this._models.delete(modelId); }
        getModel(modelId) { return this._models.get(modelId) || null; }
        listModels(filterFn) {
            const all = Array.from(this._models.values());
            return typeof filterFn === "function" ? all.filter(filterFn) : all;
        }

        // ── AI Capability Registry (registry only) ──────────────────────────────────

        registerCapability(name, descriptor = {}) {
            if (typeof name !== "string" || !name.trim()) throw new TypeError("[Cozy AI Platform] registerCapability(): name required.");
            const record = deepFreeze({
                name,
                description: descriptor.description || null,
                registeredAt: new Date().toISOString(),
            });
            this._capabilities.set(name, record);
            this._emit("capability.registered", record);
            return record;
        }

        unregisterCapability(name) { return this._capabilities.delete(name); }
        getCapability(name) { return this._capabilities.get(name) || null; }
        listCapabilities() { return Array.from(this._capabilities.values()); }

        /**
         * supportsCapability(name)
         *   Honest gate: true only if (a) the capability is registered, (b) at
         *   least one registered model advertises it, and (c) a provider is
         *   actually active. Never assumes yes.
         */
        supportsCapability(name) {
            if (!this._capabilities.has(name)) return false;
            const hasModel = this.listModels(m => m.capabilities.includes(name)).length > 0;
            return hasModel && this._hasActiveRegisteredProvider();
        }

        /**
         * True only when AIMode's active mode is an actual registered provider —
         * NOT merely truthy. AIMode defaults to "OFFLINE_ONLY", which is a real
         * mode string but never a usable provider; treating it as "active" would
         * be exactly the kind of fabricated availability this platform must not report.
         */
        _hasActiveRegisteredProvider() {
            const gateway = this.getProviderGateway();
            if (!gateway) return false;
            const activeMode = gateway.getMode ? gateway.getMode() : null;
            const registered = gateway.listRegisteredProviders ? gateway.listRegisteredProviders() : [];
            return !!activeMode && registered.includes(activeMode);
        }

        // ── AI Tool Registry (registry only — no implementation, e.g. Vision,
        //    Speech, Translation, Media, OCR, Builder, Firebase) ────────────────────

        registerTool(name, descriptor = {}) {
            if (typeof name !== "string" || !name.trim()) throw new TypeError("[Cozy AI Platform] registerTool(): name required.");
            const record = deepFreeze({
                name,
                description: descriptor.description || null,
                ownerRef:    descriptor.ownerRef || null, // e.g. "CozyOS.Vision" — reference only
                inputSchema: descriptor.inputSchema || null,
                registeredAt: new Date().toISOString(),
            });
            this._tools.set(name, record);
            this._emit("tool.registered", record);
            return record;
        }

        unregisterTool(name) { return this._tools.delete(name); }
        getTool(name) { return this._tools.get(name) || null; }
        listTools() { return Array.from(this._tools.values()); }

        // ── AI Prompt Manager ────────────────────────────────────────────────────────

        registerPrompt(kind, key, template) {
            if (!PROMPT_KINDS.includes(kind)) throw new TypeError(`[Cozy AI Platform] registerPrompt(): kind must be one of ${PROMPT_KINDS.join(", ")}.`);
            if (typeof key !== "string" || !key.trim()) throw new TypeError("[Cozy AI Platform] registerPrompt(): key required.");
            this._prompts[kind].set(key, template);
            return true;
        }

        getPrompt(kind, key) {
            if (!PROMPT_KINDS.includes(kind)) return null;
            return this._prompts[kind].get(key) || null;
        }

        listPrompts(kind) {
            if (!PROMPT_KINDS.includes(kind)) return [];
            return Array.from(this._prompts[kind].keys());
        }

        /** Assembles prompt layers into one payload. Composition only — never executes. */
        composePrompt({ systemKey, developerKey, userKey, runtimeKey, variables = {} } = {}) {
            const layers = {
                system:    systemKey    ? this.getPrompt("system", systemKey)       : null,
                developer: developerKey ? this.getPrompt("developer", developerKey) : null,
                user:      userKey      ? this.getPrompt("user", userKey)           : null,
                runtime:   runtimeKey   ? this.getPrompt("runtime", runtimeKey)     : null,
            };
            const interpolate = (tpl) => typeof tpl === "string"
                ? tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => (Object.prototype.hasOwnProperty.call(variables, k) ? String(variables[k]) : `{{${k}}}`))
                : tpl;
            return {
                system:    interpolate(layers.system),
                developer: interpolate(layers.developer),
                user:      interpolate(layers.user),
                runtime:   interpolate(layers.runtime),
            };
        }

        // ── AI Context Manager (request-scoped; never owns identity) ──────────────

        /**
         * buildContext()
         *   Assembles ephemeral, request-scoped context by consuming existing
         *   owners read-only: SessionService for who's signed in, ContextEngine
         *   for the calling app's personality content. Never stores identity;
         *   nothing here persists past the call.
         */
        buildContext({ sessionId = null, conversationId = null, appId = null } = {}) {
            const userSnapshot = window.CozyOS.SessionService && typeof window.CozyOS.SessionService.current === "function"
                ? window.CozyOS.SessionService.current()
                : null;

            const applicationContext = (appId && window.CozyOS.ContextEngine && typeof window.CozyOS.ContextEngine.getContextForApp === "function")
                ? window.CozyOS.ContextEngine.getContextForApp(appId)
                : null;

            return {
                userContext:        userSnapshot ? { uid: userSnapshot.uid, roles: userSnapshot.roles, companyId: userSnapshot.companyId } : null,
                workspaceContext:   { tenantId: userSnapshot?.companyId || window.CozyOS?.ActiveTenantId || null },
                applicationContext,
                sessionContext:     sessionId ? this.getSessionMetadata(sessionId) : null,
                conversationContext: conversationId ? this.getConversation(conversationId) : null,
                builtAt: new Date().toISOString(),
            };
        }

        // ── AI Session Manager ──────────────────────────────────────────────────────

        createSession({ tenantId = null, appId = null, capability = null } = {}) {
            const sessionId = safeId("aisess");
            const session = {
                sessionId, tenantId, appId, capability,
                state: "active",
                createdAt: new Date().toISOString(),
                history: [],
                metadata: {},
            };
            this._sessions.set(sessionId, session);
            this._emit("session.created", { sessionId });
            return { ...session };
        }

        resumeSession(sessionId) {
            const session = this._sessions.get(sessionId);
            if (!session) throw new Error(`[Cozy AI Platform] resumeSession(): unknown session "${sessionId}".`);
            if (session.state === "closed" || session.state === "cancelled") {
                session.state = "resumed";
            }
            return { ...session };
        }

        closeSession(sessionId) {
            const session = this._sessions.get(sessionId);
            if (!session) return false;
            session.state = "closed";
            this._emit("session.closed", { sessionId });
            return true;
        }

        cancelSession(sessionId) {
            const session = this._sessions.get(sessionId);
            if (!session) return false;
            session.state = "cancelled";
            this._emit("session.cancelled", { sessionId });
            return true;
        }

        getSessionHistory(sessionId) {
            const session = this._sessions.get(sessionId);
            return session ? [...session.history] : [];
        }

        getSessionMetadata(sessionId) {
            const session = this._sessions.get(sessionId);
            if (!session) return null;
            const { history, ...metadata } = session;
            return { ...metadata };
        }

        // ── AI Conversation Manager ──────────────────────────────────────────────────

        startConversation(sessionId, opts = {}) {
            const session = this._sessions.get(sessionId);
            if (!session) throw new Error(`[Cozy AI Platform] startConversation(): unknown session "${sessionId}".`);
            const conversationId = safeId("aiconv");
            const conversation = { conversationId, sessionId, messages: [], startedAt: new Date().toISOString(), metadata: opts.metadata || {} };
            this._conversations.set(conversationId, conversation);
            session.history.push(conversationId);
            this._emit("conversation.started", { conversationId, sessionId });
            return { ...conversation };
        }

        appendMessage(conversationId, message) {
            const conversation = this._conversations.get(conversationId);
            if (!conversation) throw new Error(`[Cozy AI Platform] appendMessage(): unknown conversation "${conversationId}".`);
            if (!message || typeof message !== "object" || !message.role) throw new TypeError("[Cozy AI Platform] appendMessage(): message must include a role.");
            conversation.messages.push({ ...message, at: new Date().toISOString() });
            return conversation.messages.length;
        }

        getConversation(conversationId) {
            const conversation = this._conversations.get(conversationId);
            return conversation ? { ...conversation, messages: [...conversation.messages] } : null;
        }

        endConversation(conversationId) {
            const conversation = this._conversations.get(conversationId);
            if (!conversation) return false;
            conversation.endedAt = new Date().toISOString();
            this._emit("conversation.ended", { conversationId });
            return true;
        }

        // ── AI Request Queue + Response Pipeline ────────────────────────────────────

        /**
         * submitRequest()
         *   Queues a request and drives it through the response pipeline. Fails
         *   closed if no provider is active on AIMode — never fabricates a
         *   response. The actual provider call is delegated entirely to
         *   AIMode.requestAssistance(), the one real call path into a provider
         *   this platform is aware of; this file makes no network calls itself.
         */
        async submitRequest(request = {}) {
            const entry = {
                requestId: safeId("aireq"),
                request,
                enqueuedAt: new Date().toISOString(),
                status: "queued",
            };
            this._queue.push(entry);
            this._emit("request.queued", { requestId: entry.requestId });
            return this._processQueue();
        }

        async _processQueue() {
            if (this._queueRunning) return null;
            this._queueRunning = true;
            let lastResult = null;
            try {
                while (this._queue.length > 0) {
                    const entry = this._queue.shift();
                    entry.status = "processing";
                    lastResult = await this._dispatchToProvider(entry);
                    entry.status = lastResult.status;
                }
            } finally {
                this._queueRunning = false;
            }
            return lastResult;
        }

        async _dispatchToProvider(entry) {
            const gateway = this.getProviderGateway();
            const config = this.getConfig();

            if (!gateway || typeof gateway.requestAssistance !== "function") {
                this._setHealth("offline");
                return { requestId: entry.requestId, status: "provider_unavailable", responseText: null, pipelineState: "unsupported" };
            }

            if (!this._hasActiveRegisteredProvider()) {
                this._setHealth("degraded");
                return { requestId: entry.requestId, status: "no_active_provider", responseText: null, pipelineState: "unsupported" };
            }

            const retryPolicy = config.retryPolicy || DEFAULT_CONFIG.retryPolicy;
            let attempt = 0;
            let lastError = null;

            while (attempt <= retryPolicy.maxRetries) {
                try {
                    const outcome = await gateway.requestAssistance(
                        entry.request.task || "platform-request",
                        entry.request.payload || {}
                    );
                    this._setHealth("ready");
                    return { requestId: entry.requestId, status: "success", pipelineState: "completed", outcome };
                } catch (err) {
                    lastError = err;
                    attempt += 1;
                    if (attempt <= retryPolicy.maxRetries) {
                        await new Promise(res => setTimeout(res, retryPolicy.backoffMs * attempt));
                    }
                }
            }

            this._setHealth("error", lastError);
            return { requestId: entry.requestId, status: "provider_error", pipelineState: "fault", error: lastError ? String(lastError.message || lastError).slice(0, 256) : "unknown" };
        }

        getQueueDepth() { return this._queue.length; }
    }

    // ── GLOBAL INITIALIZATION ────────────────────────────────────────────────────
    // Extends window.CozyOS.AI (core/ai.js) rather than creating a parallel engine.
    if (window.CozyOS.AI) {
        const platform = new CozyAIEnginePlatform(window.CozyOS.AI);

        // Optional: register with the integration bus for capability discovery /
        // health polling, same convention as other optional sub-engines
        // (CORE_AI_ENGINES.optional in core/ai/cozy-ai-integration.js).
        if (window.CozyOS.AI.integration && typeof window.CozyOS.AI.integration.registerEngine === "function") {
            window.CozyOS.AI.integration.registerEngine("platform", platform, platform.getCapabilities(), { priority: 100 })
                .catch(err => console.warn("[Cozy AI Platform] registerEngine() with integration bus failed:", err.message));
        }

        // Optional: catalog entry in ServiceRegistry, same convention cozy-ai-mode.js uses.
        try {
            if (typeof window.CozyOS.registerCoordinator === "function") {
                window.CozyOS.registerCoordinator({
                    name: "Cozy AI Engine Platform",
                    key: "AI.platform",
                    category: "platform",
                    description: "Shared AI provider/model/session/prompt/tool registries used by every CozyOS application.",
                });
            }
        } catch (_err) { /* non-fatal — cataloguing is descriptive only */ }
    } else {
        console.error("[Cozy AI Platform] window.CozyOS.AI (core/ai.js) is not loaded. Platform cannot attach — load order dependency unmet.");
    }
})();
