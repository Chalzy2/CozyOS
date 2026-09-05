/**
 * ── CozyOS UNIVERSAL AI INTEGRATION & ORCHESTRATION ENGINE ──
 * FILE: core/ai/cozy-ai-integration.js
 * VERSION: 1.5.1
 * * CORE ARCHITECTURAL INVARIANT:
 * Acts exclusively as an isolated orchestration communication bus. It binds
 * to window.CozyOS.AI via initializeSubEngine without modifying frozen files.
 * Implements a dual-path debounced state flusher to maximize performance under
 * heavy AI pipeline traffic while guaranteeing persistence for critical lifecycle events.
 */

"use strict";

const EVENTS = Object.freeze({
    USER_LOGOUT:        "user.logout",
    PLUGIN_INSTALLED:   "plugin.installed",
    ENGINE_DEGRADED:    "engine.degraded",
    ENGINE_RECOVERED:   "engine.recovered",
    SESSION_EXPIRED:    "session.expired",
    LANGUAGE_CHANGED:   "language.changed",
    MEMORY_CREATED:     "memory.created",
    PIPELINE_FAILED:    "pipeline.failed",
    READY:              "integration.ready",
    TASK_COMPLETED:     "task.completed",
    QUOTA_EXCEEDED:     "quota.exceeded",
    ENGINE_STALE:        "engine.stale"
});

const CORE_AI_ENGINES = Object.freeze({
    required: ["language", "memory"],
    optional: ["business", "vision", "voice", "ocr", "reasoning", "worker_pool"],
});

const ENGINE_LIFECYCLE_METHODS = Object.freeze([
    "evaluate", "getHealth", "getCapabilities", "getVersion"
]);

const DEFAULT_QUEUE_INTERVAL_MS = 5000;
const DEFAULT_PERSIST_FLUSH_INTERVAL_MS = 3000; // Coalesce volatile updates every 3 seconds
const DEFAULT_MAX_REQUESTS_PER_HOUR = 5000;
const DEFAULT_STALE_ENGINE_GRACE_PERIOD_MS = 45000; // Window for required engines to re-register before a diagnostic warning fires

const TASK_PRIORITY = Object.freeze({
    Immediate:  0,
    Normal:     1,
    Background: 2,
    Scheduled:  3
});

function isVersionCompatible(version, constraint) {
    if (!constraint) return true;
    const match = /^>=\s*(\d+)\.(\d+)/.exec(constraint);
    if (!match) return true;
    const [, reqMajor, reqMinor] = match.map(Number);
    const vMatch = /^(\d+)\.(\d+)/.exec(String(version));
    if (!vMatch) return false;
    const [, major, minor] = vMatch.map(Number);
    if (major !== reqMajor) return major > reqMajor;
    return minor >= reqMinor;
}

class CozyAIIntegrationEngine {
    constructor(masterController) {
        if (!masterController) {
            throw new Error("[AI KERNEL FAULT] Master Controller (core/ai.js) is absent.");
        }

        this.moduleId = "ai_integration_core";
        this.version  = "1.5.1";

        // 1. Storage and Registries
        this._engines        = new Map();
        this._subscribers    = new Map();
        this._sessions       = new Map();
        this._contextCache   = new Map();

        // 2. Task Queues & Resource Quota Registries
        this._taskQueue      = [];
        this._activeWorkers  = new Set();
        this._tenantQuotas   = new Map();

        // 3. Performance Optimization & Scale Tuning Adjustments
        this.contextCacheTTL   = 3000;
        this.sessionTTL        = 30 * 60 * 1000;
        this.queueInterval     = DEFAULT_QUEUE_INTERVAL_MS;
        this.flushInterval     = DEFAULT_PERSIST_FLUSH_INTERVAL_MS;
        this.staleEngineGracePeriodMs = DEFAULT_STALE_ENGINE_GRACE_PERIOD_MS;

        this._isDirty          = false; // Memory tracking flag for debounced storage flush routines
        this._sessionSweepTimer = null;
        this._queueWorkerTimer  = null;
        this._cacheSweepTimer   = null;
        this._flushWorkerTimer  = null;
        this._staleEngineCheckTimer = null;
        this._startupTimestamp  = Date.now();
        this._staleWarningsEmitted = new Set();

        // 4. Middleware Hooks Arrays
        this._middlewarePipeline = [];
        this._pluginHooks = {
            beforePipeline:          [],
            afterPipeline:           [],
            beforeMemorySave:        [],
            beforeLanguageDetection: [],
            afterResponse:           [],
        };

        // 5. System Diagnostics & Performance Telemetry
        this._statistics = {
            totalDispatches:       0,
            failedRoutes:          0,
            totalProcessingTimeMs: 0,
            activeSessions:        0,
            cacheHits:             0,
            expiredSessions:       0,
            tasksExecuted:         0,
            quotaViolations:       0
        };
        this._startupErrors    = [];
        this._executionTraces  = [];

        this._readyResolve = null;
        this._readyPromise = new Promise(resolve => { this._readyResolve = resolve; });
        this._isReady       = false;

        masterController.initializeSubEngine("integration", this);

        this._initializeDefaultMiddleware();
        this._initializeInternalEventBindings();

        // Asynchronous bootstrap sequence
        this._asyncLifecycleInit();
    }

    async _asyncLifecycleInit() {
        try {
            await this._loadPersistentState();
            this.verifyRequiredDependencies();
            this._startSessionSweeper();
            this._startQueueProcessor();
            this._startCacheSweeper();
            this._startFlushProcessor(); // Activates debounced background persistence sweep loop
            this._startStaleEngineDiagnostics(); // Diagnostic-only watchdog for engines stuck in "stale"
        } catch (initErr) {
            this._startupErrors.push(`Lifecycle initialization fault: ${initErr.message}`);
            console.error("🚨 [AI INTEGRATION KERNEL CRITICAL FAULT]", initErr);
        } finally {
            this._isReady = true;
            this._readyResolve(this.getHealth());
            this.publish(EVENTS.READY, this.getHealth());
        }
    }

    async ready() {
        return this._readyPromise;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 1. MANIFEST REGISTRATION & FAULT TOLERANCE WITH HOT-SWAPPING
    // ─────────────────────────────────────────────────────────────────────────

    verifyRequiredDependencies() {
        console.log("► [AI KERNEL] Verifying Manifest System Status...");
        for (const dep of CORE_AI_ENGINES.required) {
            const exists = !!window.CozyOS?.AI?.[dep] || this._engines.has(dep);
            console.log(`${exists ? "✓" : "✗"} [REQUIRED] ${this._capitalise(dep)} Engine Established.`);
            if (!exists) this._startupErrors.push(`Missing baseline dependency manifest element: [${dep}]`);
        }
    }

    _capitalise(str) { return str.charAt(0).toUpperCase() + str.slice(1); }

    /**
     * Engine Onboarding via Manifest Check - CRITICAL EVENT: Immediate Write Pass
     */
    async registerEngine(engineKey, engineInstance, capabilities = [], options = {}) {
        const existing = this._engines.get(engineKey);
        if (existing && existing.status !== "stale") {
            throw new Error(`[AI Integration] Engine identity contract '${engineKey}' is already registered.`);
        }

        const missingMethods = ENGINE_LIFECYCLE_METHODS.filter(m => typeof engineInstance[m] !== "function");
        if (missingMethods.length > 0) {
            console.warn(`[AI Integration] Engine "${engineKey}" skipped mandatory methods: ${missingMethods.join(", ")}`);
        }

        const manifest = (typeof engineInstance.getManifest === "function")
            ? engineInstance.getManifest()
            : { name: engineKey, version: engineInstance.version || "1.0.0", capabilities: capabilities, dependencies: [] };

        const compatible = isVersionCompatible(manifest.version, options.minVersion);
        const engineState = {
            instance:            engineInstance,
            capabilities:        new Set(manifest.capabilities || capabilities),
            registeredAt:        new Date().toISOString(),
            status:              compatible ? "active" : "incompatible",
            priority:            options.priority ?? 100,
            version:             manifest.version,
            author:              manifest.author || "Unknown",
            failureCount:        0,
            circuitBreakerState: compatible ? "CLOSED" : "OPEN",
            consecutiveFailures: 0,
        };

        this._engines.set(engineKey, engineState);
        this._staleWarningsEmitted.delete(engineKey); // Engine is live again; allow future stale diagnostics to re-fire if it regresses

        // Critical registration bypasses the background debounce and commits instantly
        await this._persistStateImmediate();

        if (compatible) {
            this.publish(EVENTS.PLUGIN_INSTALLED, { moduleKey: engineKey, capabilities: Array.from(engineState.capabilities), version: engineState.version });
            return true;
        }
        return false;
    }

    /**
     * Live Dynamic Engine Patching - CRITICAL EVENT: Immediate Write Pass
     */
    async replaceEngine(engineKey, newEngineInstance) {
        const structuralRecord = this._engines.get(engineKey);
        if (!structuralRecord) {
            throw new Error(`[AI Integration Layer] Hot-Swap targets unallocated block space for context: ${engineKey}`);
        }

        console.log(`🔀 [AI HOT-SWAP] Intercepting worker thread paths for operational layer: [${engineKey}]`);

        if (typeof structuralRecord.instance?.shutdown === "function") {
            try { await structuralRecord.instance.shutdown(); } catch (e) { console.warn("[AI Hot-Swap Teardown Error]", e.message); }
        }

        structuralRecord.instance = newEngineInstance;
        structuralRecord.version = newEngineInstance.version || "1.0.0";
        structuralRecord.circuitBreakerState = "CLOSED";
        structuralRecord.consecutiveFailures = 0;
        structuralRecord.status = "active";
        this._staleWarningsEmitted.delete(engineKey); // Keep recovery paths consistent with registerEngine()

        if (typeof newEngineInstance.initialize === "function") {
            try { await newEngineInstance.initialize(); } catch (e) { console.error("[AI Hot-Swap Initialization Fault]", e.message); }
        }

        // Critical hot-swap mutation commits immediately
        await this._persistStateImmediate();
        this.publish(EVENTS.ENGINE_RECOVERED, { engineKey });
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 2. HIGH-THROUGHPUT MIDDLEWARE PIPELINE EXECUTION
    // ─────────────────────────────────────────────────────────────────────────

    _initializeDefaultMiddleware() {
        this.use(async (ctx, next) => {
            this._verifySecurityPermission(ctx.auth, "execute_ai_pipeline");
            this._enforceQuotaLimitations(ctx.tenantId);
            await next();
        });

        this.use(async (ctx, next) => {
            await this._executeHookChain("beforeLanguageDetection", ctx);
            const languageEngine = window.CozyOS?.AI?.language;
            ctx.language = languageEngine?.detectAndRouteDialect ? languageEngine.detectAndRouteDialect(ctx.query) : "en";
            await next();
        });

        this.use(async (ctx, next) => {
            await this._executeHookChain("beforeMemorySave", ctx);
            const memoryEngine = window.CozyOS?.AI?.memory;
            if (memoryEngine && typeof memoryEngine.search === "function") {
                ctx.memory = await memoryEngine.search(ctx.query, ctx.tenantId, { collection: "business_memory", moduleContext: ctx.moduleId });
            }
            await next();
        });
    }

    async executePipeline(requestPayload, authContext) {
        await this.ready();
        const startTime = (typeof performance !== "undefined") ? performance.now() : Date.now();
        const tenantId  = authContext?.tenantId || window.CozyOS?.ActiveTenantId || "tenant_01";
        const conversationId = requestPayload.conversationId || `conv_${Date.now()}`;

        this._statistics.totalDispatches++;

        const cacheKey = `${tenantId}:${conversationId}:${requestPayload.query.slice(0, 32)}`;
        const cached   = this._contextCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < this.contextCacheTTL)) {
            this._statistics.cacheHits++;
            return cached.response;
        }

        let session = this._sessions.get(conversationId);
        if (!session) {
            session = { sessionId: `sess_${Date.now()}`, conversationId, tenantId, language: "en", createdAt: Date.now(), lastActivity: Date.now() };
            this._sessions.set(conversationId, session);
            this._statistics.activeSessions = this._sessions.size;
        }
        session.lastActivity = Date.now();

        const context = {
            query: requestPayload.query,
            auth: authContext,
            tenantId,
            moduleId: requestPayload.moduleContext || "general",
            session,
            capability: requestPayload.requiredCapability || "reasoning",
        };

        let index = 0;
        const next = async () => {
            if (index < this._middlewarePipeline.length) {
                const middleware = this._middlewarePipeline[index++];
                await middleware(context, next);
            }
        };

        await this._executeHookChain("beforePipeline", context);
        await next();

        const targetEngineKey = this._resolveEngineByCapability(context.capability);
        const response = await this._executeWithFaultTolerance(targetEngineKey, context);

        await this._executeHookChain("afterPipeline", context);
        await this._executeHookChain("afterResponse", response);

        const runtimeMs = Math.round(((typeof performance !== "undefined") ? performance.now() : Date.now()) - startTime);
        this._statistics.totalProcessingTimeMs += runtimeMs;
        this._recordExecutionTrace(targetEngineKey, runtimeMs, true);

        const finalizedPayload = { success: true, payload: response, traceId: `tr-${Date.now()}` };
        this._contextCache.set(cacheKey, { response: finalizedPayload, timestamp: Date.now() });

        // Volatile telemetry mutation: Mark memory state as dirty for the throttled background flush
        this._markDirty();

        return finalizedPayload;
    }

    _enforceQuotaLimitations(tenantId) {
        const hourTimestamp = new Date().toISOString().slice(0, 13);
        const metricsKey = `${tenantId}:${hourTimestamp}`;
        const currentUsage = this._tenantQuotas.get(metricsKey) || 0;

        const maxHourlyLimit = window.CozyOS?.Config?.ai?.maxRequestsPerHour ?? DEFAULT_MAX_REQUESTS_PER_HOUR;
        if (currentUsage >= maxHourlyLimit) {
            this._statistics.quotaViolations++;
            this.publish(EVENTS.QUOTA_EXCEEDED, { tenantId, limit: maxHourlyLimit });
            throw new Error(`🔒 [RESOURCE EXHAUSTION] Tenant Workspace ${tenantId} exceeded allocated requests/hour threshold.`);
        }
        this._tenantQuotas.set(metricsKey, currentUsage + 1);
        this._markDirty();
    }

    _resolveEngineByCapability(capability) {
        if (this._engines.has("worker_pool") && this._engines.get("worker_pool").status === "active") {
            return "worker_pool";
        }
        let best = null, bestKey = null;
        for (const [key, eng] of this._engines.entries()) {
            if (eng.status !== "active" || eng.circuitBreakerState === "OPEN" || !eng.capabilities.has(capability)) continue;
            if (!best || eng.priority < best.priority) { best = eng; bestKey = key; }
        }
        return bestKey || "business";
    }

    async _executeWithFaultTolerance(engineKey, context, attempt = 1) {
        const eng = this._engines.get(engineKey);
        if (!eng || eng.circuitBreakerState === "OPEN" || eng.status === "incompatible" || eng.status === "stale") {
            return this._routeToFallbackEngine(context.capability, context);
        }

        try {
            const outcome = await eng.instance.evaluate(context.query, context);
            if (eng.circuitBreakerState === "HALF-OPEN") {
                eng.circuitBreakerState = "CLOSED";
                this.publish(EVENTS.ENGINE_RECOVERED, { engineKey });
                this._markDirty();
            }
            eng.consecutiveFailures = 0;
            return outcome;
        } catch (err) {
            eng.consecutiveFailures++;
            this._markDirty();
            if (eng.consecutiveFailures >= 3) {
                eng.circuitBreakerState = "OPEN";
                this.publish(EVENTS.ENGINE_DEGRADED, { engineKey, consecutiveFailures: eng.consecutiveFailures });
                setTimeout(() => { eng.circuitBreakerState = "HALF-OPEN"; this._markDirty(); }, 30000);
            }
            if (attempt < 3) return await this._executeWithFaultTolerance(engineKey, context, attempt + 1);
            this._statistics.failedRoutes++;
            this.publish(EVENTS.PIPELINE_FAILED, { engineKey, error: err.message });
            return this._routeToFallbackEngine(context.capability, context);
        }
    }

    _routeToFallbackEngine(capability, context) {
        const fallback = this._engines.get("business")?.instance || window.CozyOS?.AI?.business;
        if (fallback && typeof fallback.evaluate === "function") return fallback.evaluate(context.query, context);
        return { text: "⚠️ System Warning: Requested AI processing asset is temporarily unavailable." };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 3. PERSISTENT TASK QUEUE SCHEDULER
    // ─────────────────────────────────────────────────────────────────────────

    async enqueueTask(queryText, priorityMode = "Normal", capabilities = ["reasoning"], executionDelayMs = 0, authContext = {}) {
        const taskInstance = {
            taskId: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            query: queryText,
            priority: priorityMode,
            capabilities: capabilities,
            runAt: Date.now() + executionDelayMs,
            queuedAt: Date.now(),
            auth: authContext,
            status: "queued"
        };

        this._taskQueue.push(taskInstance);
        // Stable priority ordering: lower numeric rank runs first. Unknown priority labels
        // fall back to the "Normal" rank so legacy/unexpected values keep prior behavior.
        this._taskQueue.sort((a, b) => {
            const rankA = TASK_PRIORITY[a.priority] ?? TASK_PRIORITY.Normal;
            const rankB = TASK_PRIORITY[b.priority] ?? TASK_PRIORITY.Normal;
            return rankA - rankB;
        });

        // Task scheduling matrices modify structural states: Trigger immediate flush execution
        await this._persistStateImmediate();
        return taskInstance.taskId;
    }

    _startQueueProcessor() {
        this._queueWorkerTimer = setInterval(async () => {
            const now = Date.now();
            const processableTasks = this._taskQueue.filter(t => t.status === "queued" && t.runAt <= now);

            if (processableTasks.length === 0) return;

            for (const task of processableTasks) {
                task.status = "processing";
                try {
                    const outcome = await this.executePipeline({ query: task.query, requiredCapability: task.capabilities[0] }, task.auth);
                    task.status = "completed";
                    this._statistics.tasksExecuted++;
                    this.publish(EVENTS.TASK_COMPLETED, { taskId: task.taskId, outcome });
                } catch (err) {
                    task.status = "failed";
                    console.error(`[AI Scheduler Exception] Background task execution failure: ${task.taskId}`, err.message);
                }
            }
            this._taskQueue = this._taskQueue.filter(t => t.status === "queued");

             // Post-execution cleanup: Commit structural modifications immediately
            await this._persistStateImmediate();
        }, this.queueInterval);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // § 4. RUNTIME DEBOUNCED PERSISTENCE PIPELINE LAYER
    // ─────────────────────────────────────────────────────────────────────────

    _markDirty() {
        this._isDirty = true;
    }

    _startFlushProcessor() {
        this._flushWorkerTimer = setInterval(async () => {
            if (this._isDirty) {
                await this._persistStateImmediate();
            }
        }, this.flushInterval);
    }

    /**
     * Coalesced Low-Priority State Commit Core
     *
     * STALE-PERSISTENCE CONTRACT (intentional, do not "fix"):
     * Every engine record is written to storage with status "stale", even if it is
     * currently "active" in memory. Persisted engine metadata is diagnostic/historical
     * only — it is never treated as a live, routable registry on its own. On the next
     * boot, `_loadPersistentState()` rehydrates these records with `instance: null` and
     * `status: "stale"`, and they remain unroutable (see `_resolveEngineByCapability` /
     * `_executeWithFaultTolerance`, which both skip non-"active" engines) until the
     * owning module calls `registerEngine()` again during startup. That call is what
     * promotes an engine back to "active" and routable. This avoids ever resurrecting a
     * stale instance reference from storage and silently treating it as live.
     */
    async _persistStateImmediate() {
        this._isDirty = false; // Reset state flag immediately to handle concurrent mutations safely
        const storage = window.CozyOS?.Storage || window.CozyStorage;
        if (storage && typeof storage.save === "function") {
            const serializableMap = Array.from(this._engines.entries()).map(([k, v]) => [k, {
                status: v.status === "active" ? "stale" : v.status, // see STALE-PERSISTENCE CONTRACT above
                breaker: v.circuitBreakerState,
                version: v.version,
                priority: v.priority,
                capabilities: Array.from(v.capabilities),
                author: v.author,
                registeredAt: v.registeredAt,
            }]);
            const payload = {
                LocalID: "state_vector",
                engineStates: serializableMap,
                tasks: this._taskQueue,
                tenantQuotas: Array.from(this._tenantQuotas.entries()),
                statistics: this._statistics,
                activeSessions: Array.from(this._sessions.entries()).map(([id, s]) => ({
                    conversationId: id,
                    tenantId: s.tenantId,
                    lastActivity: s.lastActivity
                }))
            };
            try {
                await storage.save("ai_integration_state", payload, "system");
            } catch (e) {
                console.warn("[AI State Persistence Warning]", e.message);
                this._markDirty(); // Remark as dirty if storage layer errors out to ensure eventual consistency
            }
        }
    }

    async _loadPersistentState() {
        const storage = window.CozyOS?.Storage || window.CozyStorage;
        if (storage && typeof storage.find === "function") {
            try {
                const results = await storage.find("ai_integration_state", { LocalID: "state_vector" });
                if (results && results.length > 0) {
                    const saved = results[0];
                    if (saved.tasks) this._taskQueue = saved.tasks;
                    if (saved.tenantQuotas) this._tenantQuotas = new Map(saved.tenantQuotas);
                    if (saved.statistics) this._statistics = Object.assign({}, this._statistics, saved.statistics);
                    if (saved.engineStates) {
                        for (const [key, meta] of saved.engineStates) {
                            if (!this._engines.has(key)) {
                                this._engines.set(key, {
                                    instance: null,
                                    capabilities: new Set(meta.capabilities || []),
                                    registeredAt: meta.registeredAt,
                                    status: "stale",
                                    priority: meta.priority ?? 100,
                                    version: meta.version,
                                    author: meta.author || "Unknown",
                                    failureCount: 0,
                                    circuitBreakerState: meta.breaker || "OPEN",
                                    consecutiveFailures: 0,
                                });
                            }
                        }
                    }
                    console.log("► [AI INTEGRATION] Rehydrated task matrix configurations successfully.");
                }
            } catch (e) { console.warn("[AI State Rehydration Warning]", e.message); }
        }
    }

    _startSessionSweeper() {
        this._sessionSweepTimer = setInterval(() => {
            const now = Date.now();
            let swept = false;
            for (const [id, sess] of this._sessions.entries()) {
                if (now - sess.lastActivity > this.sessionTTL) {
                    this._sessions.delete(id);
                    this._statistics.expiredSessions++;
                    this.publish(EVENTS.SESSION_EXPIRED, { conversationId: id, tenantId: sess.tenantId });
                    swept = true;
                }
            }
            this._statistics.activeSessions = this._sessions.size;
            if (swept) this._markDirty();
        }, 60 * 1000);
    }

    _startCacheSweeper() {
        this._cacheSweepTimer = setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this._contextCache.entries()) {
                if (now - entry.timestamp >= this.contextCacheTTL) {
                    this._contextCache.delete(key);
                }
            }
        }, Math.max(this.contextCacheTTL, 1000));
    }

    /**
     * Diagnostic-only watchdog: after `staleEngineGracePeriodMs` has elapsed since startup,
     * check whether any required engine is still sitting in "stale" (i.e. it was rehydrated
     * from persisted state but has not yet called registerEngine() to become routable again).
     * This never interrupts startup or pipeline execution, and never changes routing or
     * fallback behavior — it only logs and publishes EVENTS.ENGINE_STALE so operators can
     * notice a delayed/missing re-registration.
     */
    _startStaleEngineDiagnostics() {
        this._staleEngineCheckTimer = setInterval(() => {
            const elapsed = Date.now() - this._startupTimestamp;
            if (elapsed < this.staleEngineGracePeriodMs) return;

            for (const dep of CORE_AI_ENGINES.required) {
                const eng = this._engines.get(dep);
                if (eng && eng.status === "stale" && !this._staleWarningsEmitted.has(dep)) {
                    this._staleWarningsEmitted.add(dep);
                    console.warn(`⚠️ [AI INTEGRATION] Required engine "${dep}" is still "stale" ${Math.round(elapsed / 1000)}s after startup — it has not called registerEngine() yet.`);
                    this.publish(EVENTS.ENGINE_STALE, { engineKey: dep, elapsedMs: elapsed });
                }
            }

            // Watchdog has done its one-time-per-engine job for the required set; no need to keep polling indefinitely.
            if (CORE_AI_ENGINES.required.every(dep => this._staleWarningsEmitted.has(dep) || this._engines.get(dep)?.status === "active")) {
                clearInterval(this._staleEngineCheckTimer);
                this._staleEngineCheckTimer = null;
            }
        }, 5000);
    }

    async destroy() {
        if (this._sessionSweepTimer) clearInterval(this._sessionSweepTimer);
        if (this._queueWorkerTimer) clearInterval(this._queueWorkerTimer);
        if (this._cacheSweepTimer) clearInterval(this._cacheSweepTimer);
        if (this._flushWorkerTimer) clearInterval(this._flushWorkerTimer);
        if (this._staleEngineCheckTimer) clearInterval(this._staleEngineCheckTimer);

        for (const task of this._taskQueue) {
            if (task.status === "processing") {
                task.status = "queued";
            }
        }

        // Critical System Teardown Pass: Commit remaining telemetry maps immediately
        try {
            await this._persistStateImmediate();
        } catch (e) {
            console.warn("[AI Shutdown Persistence Warning]", e.message);
        }

        this._sessions.clear();
        this._contextCache.clear();
    }

    _verifySecurityPermission(auth, permit) { if (window.CozyOS?.Auth?.checkCapability && !window.CozyOS.Auth.checkCapability(auth, permit)) throw new Error("🔒 Security Exception."); }
    _recordExecutionTrace(key, dur, ok) { this._executionTraces.push({ key, duration: `${dur}ms`, ok, timestamp: new Date().toISOString() }); if (this._executionTraces.length > 50) this._executionTraces.shift(); }
    getHealth() { return { status: this._startupErrors.length === 0 ? "healthy" : "degraded", engines: this._engines.size, activeSessions: this._sessions.size, ready: this._isReady }; }
    getStatistics() { return Object.assign({}, this._statistics); }

    exportMetrics() {
        return Object.assign({}, this._statistics, {
            latencyAverageMs: this._statistics.totalDispatches > 0 ? Math.round(this._statistics.totalProcessingTimeMs / this._statistics.totalDispatches) : 0,
            activeEnginesCount: this._engines.size,
            taskQueueDepth: this._taskQueue.length,
            circuitBreakerStates: Array.from(this._engines.entries()).map(([k, v]) => ({ engine: k, state: v.circuitBreakerState }))
        });
    }

    getEngineReport() {
        const report = {};
        for (const [key, eng] of this._engines.entries()) {
            report[key] = {
                status: eng.status,
                version: eng.version,
                priority: eng.priority,
                capabilities: Array.from(eng.capabilities),
                circuitBreakerState: eng.circuitBreakerState,
                registeredAt: eng.registeredAt,
            };
        }
        return report;
    }

    publish(evt, data) { const listeners = this._subscribers.get(evt); if (listeners) listeners.forEach(cb => setTimeout(() => cb(data), 0)); }
    subscribe(evt, cb) { if (!this._subscribers.has(evt)) this._subscribers.set(evt, new Set()); this._subscribers.get(evt).add(cb); }
    use(m) { this._middlewarePipeline.push(m); }
    async _executeHookChain(name, load) { const hooks = this._pluginHooks[name] || []; for (const h of hooks) { try { await h(load); } catch (e) { console.error(e); } } }
    _initializeInternalEventBindings() { this.subscribe(EVENTS.USER_LOGOUT, (d) => { for (const [k, v] of this._sessions.entries()) { if (v.tenantId === d.tenantId) this._sessions.delete(k); } this._statistics.activeSessions = this._sessions.size; this._markDirty(); }); }
}

CozyAIIntegrationEngine.EVENTS = EVENTS;
if (!window.CozyOS) window.CozyOS = {};
if (window.CozyOS.AI) new CozyAIIntegrationEngine(window.CozyOS.AI);
