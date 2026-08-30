/**
 * CozyOS Enterprise Framework — Analytics Coordination Subsystem
 * File Reference: core/modules/analytics/cozy-analytics.js
 * Layer: Kernel / Core Service Coordination
 * Version: 1.0.2-ENTERPRISE
 *
 * DESIGN PRINCIPLES:
 * 1. Absolute Isolation Splitting: CozyAnalytics is 100% execution-free. It does not interface
 * with Network sockets, WebSockets, HTTP requests, IndexedDB, LocalStorage, File System I/O,
 * data compression engines, or raw statistics/aggregation mathematical compute steps.
 * 2. Full-Fidelity State Portability: Captures the entire system blueprint (registries, sessions,
 * timelines, audit logs, plugins, and closed integrations) to ensure stateless node portability.
 * 3. Dry Registry Architectural Engine: Unifies repetitive CRUD parameters into a single secure engine,
 * enforcing live diagnostic counters, append-only timelines, immutable mutation auditing, and event emission.
 *
 * CERTIFICATION FIXES APPLIED (v1.0.2-ENTERPRISE certification pass):
 * - MEDIUM: diagnostics.errors is now incremented immediately before every
 *   intentional throw in transitionSessionState() (session-not-found,
 *   unsupported-state), registerPlugin() (missing id, duplicate id), and
 *   updateClosedIntegrationMetadata() (unknown integration) — previously
 *   only some throw sites incremented the counter, letting it under-report
 *   real runtime failures.
 * - LOW: the unused `optionalRegistryKey` parameter was removed from
 *   #executeStateMerge(), along with the corresponding argument at its one
 *   call site that passed it.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const VERSION = "1.0.2-ENTERPRISE";

    const FORBIDDEN_SECURITY_KEYWORDS = [
        "password", "secret", "token", "jwt", "apikey", "certificate",
        "biometric", "fingerprint", "iristemplate", "faceembedding",
        "voiceembedding", "privatekey", "publickey"
    ];

    class CozyAnalyticsKernel {
        // --- CENTRAL REGISTRY DECLARATION MAPS ---
        #registries = {
            analyticsNode: new Map(),
            analyticsTarget: new Map(),
            analyticsQueue: new Map(),
            analyticsJob: new Map(),
            analyticsPolicy: new Map(),
            analyticsSchedule: new Map(),
            analyticsSnapshot: new Map()
        };

        // --- CORE KERNEL DATA FLOWS ---
        #sessions = new Map();
        #plugins = new Map();
        #closedIntegrations = new Map();
        #timeline = [];
        #auditLog = [];
        #eventListeners = new Map();

        // --- SYSTEM ENUMERATIONS AND LEGAL MATRIX MAPS ---
        #validSessionStates = ["CREATED", "ACTIVE", "PAUSED", "STOPPED", "ENDED", "ARCHIVED"];
        #sessionTransitionMatrix = {
            "CREATED": ["ACTIVE", "STOPPED", "ARCHIVED"],
            "ACTIVE": ["PAUSED", "STOPPED", "ENDED"],
            "PAUSED": ["ACTIVE", "STOPPED", "ENDED"],
            "STOPPED": ["ARCHIVED"],
            "ENDED": ["ARCHIVED"],
            "ARCHIVED": []
        };

        // --- SUB-SYSTEM DIAGNOSTICS PERFORMANCE COUNTERS ---
        #diagnostics = {
            sessions: 0, analyticsNodes: 0, analyticsTargets: 0, analyticsQueues: 0, analyticsJobs: 0,
            analyticsPolicies: 0, analyticsSchedules: 0, analyticsSnapshots: 0, plugins: 0, integrations: 0, 
            errors: 0, imports: 0, exports: 0, sync: 0, timeline: 0, audit: 0
        };

        constructor() {
            this.#initializeKernelIntegrations();
        }

        #initializeKernelIntegrations() {
            const architecturalTargets = [
                "CozyAI", "CozyNetwork", "CozyStorage", "CozyNotification", "CozyAccessibility",
                "CozySpeech", "CozyTranslate", "CozyEmergency", "CozyMedia", "CozyCamera",
                "CozyVision", "CozyIdentity", "CozyAutomation", "CozySync", "CozyLive"
            ];
            for (const systemId of architecturalTargets) {
                this.#closedIntegrations.set(systemId.toLowerCase(), Object.freeze({
                    systemId,
                    registeredAt: Date.now(),
                    activeState: "MONITORING_ONLY",
                    connectionContext: {},
                    lastUpdated: Date.now()
                }));
            }
            this.#diagnostics.integrations = this.#closedIntegrations.size;
            this.#logAuditRecord("KERNEL_INITIALIZATION", "System", "CozyAnalytics core initialization secure baseline verified.");
            this.#logTimelineEvent("SYSTEM_BOOT", "Kernel", "Analytics framework coordination subsystem functional.");
        }

        // =========================================================================
        // ─── RECURSIVE SECURITY CHOKE-POINT VALIDATOR ────────────────────────────
        // =========================================================================

        #enforceSecurityGuardrails(payload) {
            if (payload === null || payload === undefined) return;
            if (typeof payload === "function") {
                this.#diagnostics.errors++;
                throw new Error("[CozyAnalytics] Security Breach: Dynamic execution functions are strictly prohibited.");
            }
            if (typeof payload === "object") {
                for (const key of Object.keys(payload)) {
                    const normalizedKey = key.toLowerCase().trim();
                    
                    for (const keyword of FORBIDDEN_SECURITY_KEYWORDS) {
                        if (normalizedKey.includes(keyword)) {
                            this.#diagnostics.errors++;
                            throw new Error(`[CozyAnalytics] Security Access Denied: Prohibited property pattern matching isolated: [${key}]`);
                        }
                    }
                    this.#enforceSecurityGuardrails(payload[key]);
                }
            }
        }

        #generateUniversalMetadata(explicitMeta = {}) {
            return {
                localId: explicitMeta.localId || "loc-" + crypto.randomUUID(),
                globalId: explicitMeta.globalId || null,
                syncState: explicitMeta.syncState || "LOCAL_ONLY",
                conflictState: explicitMeta.conflictState || "CLEAR",
                version: Number(explicitMeta.version || 1),
                lastModified: Date.now(),
                createdOffline: explicitMeta.createdOffline !== undefined ? !!explicitMeta.createdOffline : true
            };
        }

        // =========================================================================
        // ─── SESSION REGISTRY LIFECYCLE MANAGEMENT ───────────────────────────────
        // =========================================================================

        createSession(config = {}) {
            this.#enforceSecurityGuardrails(config);
            const sessionId = "anl-session-" + crypto.randomUUID();

            const { syncMeta, ...callerSuppliedDescriptors } = config;

            const session = {
                id: sessionId,
                ...callerSuppliedDescriptors,
                lifecycleState: "CREATED",
                meta: this.#generateUniversalMetadata(syncMeta),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            this.#sessions.set(sessionId, session);
            this.#diagnostics.sessions++;
            this.#logAuditRecord("SESSION_CREATE", sessionId, "State set to CREATED");
            this.#logTimelineEvent("SESSION_LIFECYCLE_CHANGE", sessionId, "Analytics coordination session initialized.");
            this.emit("sessionCreated", this.#deepCloneAndFreeze(session));
            return this.#deepCloneAndFreeze(session);
        }

        transitionSessionState(sessionId, targetState) {
            if (!this.#sessions.has(sessionId)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAnalytics] Session unmatched: ${sessionId}`);
            }
            if (!this.#validSessionStates.includes(targetState)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAnalytics] State unsupported: ${targetState}`);
            }

            const session = this.#sessions.get(sessionId);
            const currentState = session.lifecycleState;

            const legalMoves = this.#sessionTransitionMatrix[currentState] || [];
            if (!legalMoves.includes(targetState)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAnalytics] Lifecycle Violation: Transition path from [${currentState}] to [${targetState}] is illegal.`);
            }

            session.lifecycleState = targetState;
            session.updatedAt = Date.now();
            session.meta.version++;
            session.meta.lastModified = Date.now();

            this.#logAuditRecord("SESSION_TRANSITION", sessionId, `Moved from ${currentState} to ${targetState}`);
            this.#logTimelineEvent("SESSION_LIFECYCLE_CHANGE", sessionId, `Lifecycle state set to: ${targetState}`);
            this.emit("sessionTransitioned", this.#deepCloneAndFreeze(session));
            return this.#deepCloneAndFreeze(session);
        }

        getSession(id) { return this.#sessions.has(id) ? this.#deepCloneAndFreeze(this.#sessions.get(id)) : null; }
        listSessions() { return Object.freeze(Array.from(this.#sessions.values()).map(s => this.#deepCloneAndFreeze(s))); }
        hasSession(id) { return !!id && this.#sessions.has(id); }
        countSessions() { return this.#sessions.size; }

        // =========================================================================
        // ─── DRYANALYTICS REUSABLE CORE REGISTRY ENGINE (CRUD + METRICS) ─────────
        // =========================================================================

        #getDiagnosticField(registryKey) {
            const mappings = {
                analyticsNode: "analyticsNodes", analyticsTarget: "analyticsTargets", analyticsQueue: "analyticsQueues", 
                analyticsJob: "analyticsJobs", analyticsPolicy: "analyticsPolicies", analyticsSchedule: "analyticsSchedules", 
                analyticsSnapshot: "analyticsSnapshots"
            };
            return mappings[registryKey];
        }

        #createRecord(registryKey, data) {
            this.#enforceSecurityGuardrails(data);
            
            const { syncMeta, ...fields } = data;
            const prefix = registryKey.substring(0, 4);
            const id = `${prefix}-${crypto.randomUUID()}`;
            const record = { id, ...fields, meta: this.#generateUniversalMetadata(syncMeta) };

            this.#registries[registryKey].set(id, record);

            const counterField = this.#getDiagnosticField(registryKey);
            if (counterField) this.#diagnostics[counterField]++;

            this.#logAuditRecord(`${registryKey.toUpperCase()}_CREATE`, id, `Record initialization added to register context.`);
            this.#logTimelineEvent(`${registryKey.toUpperCase()}_EVENT`, id, `New registry analytics asset instantiated.`);
            this.emit(`${registryKey}:create`, this.#deepCloneAndFreeze(record));
            return this.#deepCloneAndFreeze(record);
        }

        #readRecord(registryKey, id) {
            const targetMap = this.#registries[registryKey];
            return targetMap.has(id) ? this.#deepCloneAndFreeze(targetMap.get(id)) : null;
        }

        #updateRecord(registryKey, id, data) {
            this.#enforceSecurityGuardrails(data);
            const targetMap = this.#registries[registryKey];
            if (!targetMap.has(id)) return false;

            const existingRecord = targetMap.get(id);
            const updatedRecord = {
                ...existingRecord,
                ...data,
                id,
                meta: {
                    ...existingRecord.meta,
                    version: (existingRecord.meta?.version || 1) + 1,
                    lastModified: Date.now()
                }
            };

            targetMap.set(id, updatedRecord);
            this.#logAuditRecord(`${registryKey.toUpperCase()}_UPDATE`, id, `Fields mutation event recorded.`);
            this.#logTimelineEvent(`${registryKey.toUpperCase()}_EVENT`, id, `Asset tracking configuration updated.`);
            this.emit(`${registryKey}:update`, this.#deepCloneAndFreeze(updatedRecord));
            return true;
        }

        #deleteRecord(registryKey, id) {
            const targetMap = this.#registries[registryKey];
            if (!targetMap.has(id)) return false;

            targetMap.delete(id);
            const counterField = this.#getDiagnosticField(registryKey);
            if (counterField) this.#diagnostics[counterField] = Math.max(0, this.#diagnostics[counterField] - 1);

            this.#logAuditRecord(`${registryKey.toUpperCase()}_DELETE`, id, `Asset completely purged from active analytics space.`);
            this.#logTimelineEvent(`${registryKey.toUpperCase()}_EVENT`, id, `Asset registration tracking removed.`);
            this.emit(`${registryKey}:delete`, { id });
            return true;
        }

        #listRecords(registryKey) {
            return Object.freeze(Array.from(this.#registries[registryKey].values()).map(r => this.#deepCloneAndFreeze(r)));
        }

        #hasRecord(registryKey, id) { return !!id && this.#registries[registryKey].has(id); }
        #countRecords(registryKey) { return this.#registries[registryKey].size; }

        // =========================================================================
        // ─── INTERNALLY INSULATED FAULT ISOLATING EVENT BUS ──────────────────
        // =========================================================================

        on(event, handler) {
            if (typeof handler !== "function") throw new TypeError("Event listener handlers must resolve to an executable function.");
            if (!this.#eventListeners.has(event)) this.#eventListeners.set(event, new Set());
            this.#eventListeners.get(event).add(handler);
        }

        off(event, handler) {
            if (this.#eventListeners.has(event)) {
                this.#eventListeners.get(event).delete(handler);
            }
        }

        once(event, handler) {
            const destructHook = (payload) => {
                this.off(event, destructHook);
                handler(payload);
            };
            this.on(event, destructHook);
        }

        emit(event, payload) {
            if (this.#eventListeners.has(event)) {
                const clearPayload = this.#deepCloneAndFreeze(payload);
                for (const handler of this.#eventListeners.get(event)) {
                    try {
                        handler(clearPayload);
                    } catch (fault) {
                        this.#diagnostics.errors++;
                    }
                }
            }
        }

        // =========================================================================
        // ─── REGISTRY ROUTER PROXIES (CRUD COMPLIANCE) ───────────────────────────
        // =========================================================================

        getRegistryInterface(key) {
            return Object.freeze({
                create: (d) => this.#createRecord(key, d),
                read: (id) => this.#readRecord(key, id),
                update: (id, d) => this.#updateRecord(key, id, d),
                delete: (id) => this.#deleteRecord(key, id),
                list: () => this.#listRecords(key),
                get: (id) => this.#readRecord(key, id),
                has: (id) => this.#hasRecord(key, id),
                count: () => this.#countRecords(key)
            });
        }

        // =========================================================================
        // ─── SYSTEM PLUGIN CONFIGURATION ENGINE REGISTRIES ───────────────────────
        // =========================================================================

        registerPlugin(plugin) {
            this.#enforceSecurityGuardrails(plugin);
            if (!plugin || !plugin.id || typeof plugin.id !== "string") {
                this.#diagnostics.errors++;
                throw new Error("[CozyAnalytics] Error: Mandatory target profile property 'id' missing.");
            }
            const id = plugin.id.trim().toLowerCase();
            if (this.#plugins.has(id)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAnalytics] Collision: Plugin [${id}] is already tracking.`);
            }

            this.#plugins.set(id, this.#deepCloneAndFreeze(plugin));
            this.#diagnostics.plugins++;
            this.#logAuditRecord("PLUGIN_REGISTRATION", id, "External analytics capability plugin bound.");
            return true;
        }

        removePlugin(id) {
            if (!id) return false;
            const key = id.trim().toLowerCase();
            if (this.#plugins.delete(key)) {
                this.#logAuditRecord("PLUGIN_REMOVAL", key, "Plugin cleared from metadata environment.");
                this.#diagnostics.plugins = Math.max(0, this.#diagnostics.plugins - 1);
                return true;
            }
            return false;
        }

        listPlugins() { return Object.freeze(Array.from(this.#plugins.values()).map(p => this.#deepCloneAndFreeze(p))); }
        getPlugin(id) { return this.#plugins.has(id?.toLowerCase()) ? this.#deepCloneAndFreeze(this.#plugins.get(id.toLowerCase())) : null; }
        hasPlugin(id) { return !!id && this.#plugins.has(id.toLowerCase()); }
        countPlugins() { return this.#plugins.size; }

        // =========================================================================
        // ─── CLOSED SYSTEM LINKAGE MONITORS (BOOKKEEPING ONLY) ───────────────────
        // =========================================================================

        updateClosedIntegrationMetadata(systemId, flags) {
            this.#enforceSecurityGuardrails(flags);
            const key = String(systemId).toLowerCase().trim();
            if (!this.#closedIntegrations.has(key)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAnalytics] System Target Refusal: System context [${systemId}] is independent of CozyOS framework standard specifications.`);
            }

            const existing = this.#closedIntegrations.get(key);
            const record = {
                systemId: existing.systemId,
                registeredAt: existing.registeredAt,
                activeState: flags.activeState || "MONITORING_ONLY",
                connectionContext: flags.connectionContext ? { ...flags.connectionContext } : {},
                lastUpdated: Date.now()
            };

            this.#closedIntegrations.set(key, Object.freeze(record));
            this.#logAuditRecord("CLOSED_INTEGRATION_SYNC", key, "Internal framework analytics communication channels mapped.");
        }

        getClosedIntegrationState(systemId) {
            const key = String(systemId).toLowerCase().trim();
            return this.#closedIntegrations.has(key) ? this.#closedIntegrations.get(key) : null;
        }

        listClosedIntegrations() { return Object.freeze(Array.from(this.#closedIntegrations.values()).map(i => this.#deepCloneAndFreeze(i))); }
        hasClosedIntegration(systemId) { return !!systemId && this.#closedIntegrations.has(String(systemId).toLowerCase().trim()); }
        countClosedIntegrations() { return this.#closedIntegrations.size; }

        // =========================================================================
        // ─── TIMELINE & AUDIT WORKSPACES (APPEND-ONLY) ───────────────────────────
        // =========================================================================

         #logTimelineEvent(type, referenceId, notes) {
            this.#timeline.push(Object.freeze({
                timestamp: Date.now(),
                type: String(type),
                referenceId: String(referenceId),
                notes: String(notes)
            }));
            this.#diagnostics.timeline = this.#timeline.length;
        }

        getTimeline(predicate) {
            const list = this.#timeline.map(e => this.#deepCloneAndFreeze(e));
            return Object.freeze(typeof predicate === "function" ? list.filter(predicate) : list);
        }

        #logAuditRecord(actionType, targetId, text) {
            this.#auditLog.push(Object.freeze({
                timestamp: Date.now(),
                actionType: String(actionType),
                targetId: String(targetId),
                text: String(text)
            }));
            this.#diagnostics.audit = this.#auditLog.length;
        }

        getAuditLog() { return Object.freeze(this.#auditLog.map(e => this.#deepCloneAndFreeze(e))); }

        // =========================================================================
        // ─── DISCONNECTED EDGE SYSTEM STATE PORTABILITY MATRIX ───────────────────
        // =========================================================================

        exportKernelStateSnapshot() {
            this.#diagnostics.exports++;
            this.#logAuditRecord("REGISTRY_EXPORT", "Kernel", "Fidelity analytics register snapshot generation executed.");

            const serializableRegistries = {};
            for (const key of Object.keys(this.#registries)) {
                serializableRegistries[key] = Array.from(this.#registries[key].values());
            }

            return JSON.stringify({
                version: VERSION,
                timestamp: Date.now(),
                sessions: Array.from(this.#sessions.values()),
                registries: serializableRegistries,
                plugins: Array.from(this.#plugins.values()),
                closedIntegrations: Array.from(this.#closedIntegrations.values()),
                timeline: this.#timeline,
                auditLog: this.#auditLog,
                diagnosticsSummary: { ...this.#diagnostics }
            });
        }

        importAndMergeState(jsonPayload) {
            try {
                const parsed = JSON.parse(jsonPayload);
                this.#enforceSecurityGuardrails(parsed);

                if (parsed.version !== VERSION) {
                    throw new Error(`Framework architecture version target discrepancy. Kernel: ${VERSION} Target: ${parsed.version}`);
                }

                this.#diagnostics.imports++;

                // 1. Restore Sessions
                if (parsed.sessions) {
                    parsed.sessions.forEach(s => this.#executeStateMerge(this.#sessions, s.id, s));
                }
                this.#diagnostics.sessions = this.#sessions.size;

                // 2. Restore Standard Registries
                const r = parsed.registries;
                if (r) {
                    for (const registryKey of Object.keys(this.#registries)) {
                        if (r[registryKey]) {
                            r[registryKey].forEach(record => {
                                this.#executeStateMerge(this.#registries[registryKey], record.id, record);
                            });
                        }
                        const counterField = this.#getDiagnosticField(registryKey);
                        if (counterField) {
                            this.#diagnostics[counterField] = this.#registries[registryKey].size;
                        }
                    }
                }

                // 3. Restore Plugins
                if (parsed.plugins) {
                    parsed.plugins.forEach(p => {
                        this.#enforceSecurityGuardrails(p);
                        if (p && p.id) this.#plugins.set(p.id.trim().toLowerCase(), this.#deepCloneAndFreeze(p));
                    });
                }
                this.#diagnostics.plugins = this.#plugins.size;

                // 4. Restore Closed Integrations Metadata
                if (parsed.closedIntegrations) {
                    parsed.closedIntegrations.forEach(i => {
                        this.#enforceSecurityGuardrails(i);
                        if (i && i.systemId) this.#closedIntegrations.set(i.systemId.trim().toLowerCase(), Object.freeze(i));
                    });
                }
                this.#diagnostics.integrations = this.#closedIntegrations.size;

                // 5. Historical Logs Aggregation (Append Non-Duplicates)
                if (parsed.timeline) {
                    parsed.timeline.forEach(t => {
                        if (!this.#timeline.some(existing => existing.timestamp === t.timestamp && existing.referenceId === t.referenceId)) {
                            this.#timeline.push(Object.freeze(t));
                        }
                    });
                }
                this.#diagnostics.timeline = this.#timeline.length;

                if (parsed.auditLog) {
                    parsed.auditLog.forEach(a => {
                        if (!this.#auditLog.some(existing => existing.timestamp === a.timestamp && existing.targetId === a.targetId)) {
                            this.#auditLog.push(Object.freeze(a));
                        }
                    });
                }
                this.#diagnostics.audit = this.#auditLog.length;

                this.#diagnostics.sync++;
                this.#logAuditRecord("REGISTRY_MERGE", "Kernel", "External data registries synchronized accurately.");
                return true;
            } catch (err) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAnalytics] Serialization Crash: Import processing execution halted: ${err.message}`);
            }
        }

        #executeStateMerge(targetMap, entityId, prospectiveRecord) {
            this.#enforceSecurityGuardrails(prospectiveRecord);
            if (!targetMap.has(entityId)) {
                targetMap.set(entityId, prospectiveRecord);
                return;
            }

            const current = targetMap.get(entityId);
            const currentVersion = current.meta?.version || 0;
            const incomingVersion = prospectiveRecord.meta?.version || 0;

            if (incomingVersion > currentVersion) {
                targetMap.set(entityId, prospectiveRecord);
            } else if (incomingVersion === currentVersion && prospectiveRecord.meta?.lastModified > current.meta?.lastModified) {
                targetMap.set(entityId, prospectiveRecord);
            } else if (incomingVersion < currentVersion) {
                const updatedConflictRecord = {
                    ...current,
                    meta: {
                        ...current.meta,
                        conflictState: "MERGE_SKIPPED_INCOMING_OLDER",
                        lastModified: Date.now()
                    }
                };
                targetMap.set(entityId, Object.freeze(updatedConflictRecord));
            }
        }

        // =========================================================================
        // ─── TELEMETRY ANALYSIS HOOKS ────────────────────────────────────────────
        // =========================================================================

        getDiagnosticsReport() {
            const statusSummary = {
                kernelVersion: VERSION,
                counters: { ...this.#diagnostics },
                registryLoadDepth: {
                    sessionsTracked: this.#sessions.size,
                    pluginsTracked: this.#plugins.size,
                    closedIntegrationsTracked: this.#closedIntegrations.size
                }
            };
            for (const key of Object.keys(this.#registries)) {
                const counterField = this.#getDiagnosticField(key);
                statusSummary.registryLoadDepth[`${counterField}Tracked`] = this.#registries[key].size;
            }
            return Object.freeze(statusSummary);
        }

        // --- INTERNAL OBJECT CLONING SANITIZER MATRIX ---
        #deepCloneAndFreeze(obj) {
            if (obj === null || typeof obj !== "object") return obj;
            if (Array.isArray(obj)) return Object.freeze(obj.map(item => this.#deepCloneAndFreeze(item)));
            const clone = {};
            for (const key of Object.keys(obj)) {
                clone[key] = this.#deepCloneAndFreeze(obj[key]);
            }
            return Object.freeze(clone);
        }
    }

    // =========================================================================
    // ─── HOT RELOAD VALIDATION WRAPPER PARSER ────────────────────────────────
    // =========================================================================

    if (window.CozyOS.CozyAnalytics) {
        if (window.CozyOS.CozyAnalytics.getVersion() === VERSION) {
            return;
        } else {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: Running environment matches mismatched version constraints.`);
        }
    }

    const instanceReference = new CozyAnalyticsKernel();

    window.CozyOS.CozyAnalytics = Object.freeze({
        getVersion: () => VERSION,
        getDiagnosticsReport: () => instanceReference.getDiagnosticsReport(),
        exportKernelStateSnapshot: () => instanceReference.exportKernelStateSnapshot(),
        importAndMergeState: (json) => instanceReference.importAndMergeState(json),
        getTimeline: (pred) => instanceReference.getTimeline(pred),
        getAuditLog: () => instanceReference.getAuditLog(),

        // PubSub Bus Bindings
        on: (evt, cb) => instanceReference.on(evt, cb),
        off: (evt, cb) => instanceReference.off(evt, cb),
        once: (evt, cb) => instanceReference.once(evt, cb),
        emit: (evt, payload) => instanceReference.emit(evt, payload),

        // Session Interface Orchestration
        createSession: (conf) => instanceReference.createSession(conf),
        transitionSessionState: (id, state) => instanceReference.transitionSessionState(id, state),
        getSession: (id) => instanceReference.getSession(id),
        listSessions: () => instanceReference.listSessions(),
        hasSession: (id) => instanceReference.hasSession(id),
        countSessions: () => instanceReference.countSessions(),

        // Extensible Plugins Registry
        registerPlugin: (p) => instanceReference.registerPlugin(p),
        removePlugin: (id) => instanceReference.removePlugin(id),
        listPlugins: () => instanceReference.listPlugins(),
        getPlugin: (id) => instanceReference.getPlugin(id),
        hasPlugin: (id) => instanceReference.hasPlugin(id),
        countPlugins: () => instanceReference.countPlugins(),

        // Closed System Tracking Connectors
        updateClosedIntegrationMetadata: (id, flags) => instanceReference.updateClosedIntegrationMetadata(id, flags),
        getClosedIntegrationState: (id) => instanceReference.getClosedIntegrationState(id),
        listClosedIntegrations: () => instanceReference.listClosedIntegrations(),
        hasClosedIntegration: (id) => instanceReference.hasClosedIntegration(id),
        countClosedIntegrations: () => instanceReference.countClosedIntegrations(),

        // Unified Subsystem Registries Explicit Interface Map
        analyticsNode: instanceReference.getRegistryInterface("analyticsNode"),
        analyticsTarget: instanceReference.getRegistryInterface("analyticsTarget"),
        analyticsQueue: instanceReference.getRegistryInterface("analyticsQueue"),
        analyticsJob: instanceReference.getRegistryInterface("analyticsJob"),
        analyticsPolicy: instanceReference.getRegistryInterface("analyticsPolicy"),
        analyticsSchedule: instanceReference.getRegistryInterface("analyticsSchedule"),
        analyticsSnapshot: instanceReference.getRegistryInterface("analyticsSnapshot")
    });

})();
