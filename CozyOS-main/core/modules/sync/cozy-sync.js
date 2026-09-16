/**
 * CozyOS Enterprise Framework — Sync Coordination Subsystem
 * File Reference: core/modules/sync/cozy-sync.js
 * Layer: Kernel / Core Service Coordination
 * Version: 1.0.2-ENTERPRISE
 *
 * DESIGN PRINCIPLES:
 * 1. Absolute Isolation Splitting: CozySync is 100% execution-free. It does not interface
 * with Network sockets, WebSockets, HTTP requests, IndexedDB, LocalStorage, File System I/O,
 * background sync APIs, or data compression engines.
 * 2. Full-Fidelity State Portability: Captures the entire system blueprint (registries, sessions,
 * timelines, audit logs, plugins, and closed integrations) to ensure stateless node portability.
 * 3. Dry Registry Architectural Engine: Unifies repetitive CRUD parameters into a single secure engine,
 * enforcing live diagnostic counters, append-only timelines, immutable mutation auditing, and event emission.
 *
 * ── CHANGELOG v1.0.1 -> v1.0.2 (all additive/bugfix, no breaking API changes) ──
 *
 * [CRITICAL FIX] emit() was implemented but never exported on the public
 *   window.CozyOS.CozySync interface — on()/off()/once() were exported but
 *   not the corresponding publish method, so external coordinator kernels
 *   had no way to publish onto the shared event bus. Now exported.
 *
 * [HIGH FIX] importAndMergeState(jsonPayload) called
 *   #enforceSecurityGuardrails(jsonPayload) while jsonPayload was still a
 *   raw string — the guardrail only recurses into typeof "object", so this
 *   was a silent no-op at the top level. Confirmed by testing: a forbidden
 *   key nested in the JSON string was NOT caught at that point. It WAS
 *   still caught later, when each individual record is validated inside
 *   #executeStateMerge, so this was a design-intent violation (the
 *   "choke-point" comment implies validation before any processing begins)
 *   rather than an active hole — but it's fixed properly now: the guardrail
 *   runs on the parsed object, immediately after JSON.parse and before any
 *   merge logic executes.
 *
 * [MEDIUM FIX] #createRecord stored `...data` before extracting syncMeta,
 *   so syncMeta ended up duplicated both as its own top-level property AND
 *   inside the generated `meta` object. Confirmed by testing. Now
 *   destructured out first, matching the pattern createSession() already
 *   used correctly.
 *
 * [MEDIUM FIX] updateClosedIntegrationMetadata() rebuilt the integration
 *   record from only {systemId, activeState, connectionContext,
 *   lastUpdated} — registeredAt was dropped and became `undefined` after
 *   the very first update. Confirmed by testing. Now carried forward from
 *   the existing record.
 *
 * [LOW FIX] #executeStateMerge's unused `optionalRegistryKey` parameter
 *   removed, along with the now-unnecessary argument at its call site.
 *
 * [ADDITIONAL FIXES FOUND DURING INDEPENDENT VERIFICATION, not on the
 *   original review list]
 *   - #createRecord(registryKey, data) crashed with a raw, unhelpful
 *     "Cannot read properties of undefined (reading 'syncMeta')" if called
 *     with no data argument at all (e.g. `CozySync.topology.create()`).
 *     Confirmed by testing. Fixed with a default parameter.
 *   - updateClosedIntegrationMetadata(systemId, flags) crashed the same way
 *     ("reading 'activeState'") if called without a flags argument.
 *     Confirmed by testing. Fixed with a default parameter.
 *   - #updateRecord(registryKey, id, data) had the same latent risk pattern
 *     (no default on an object parameter that's later touched); given a
 *     default for consistency even though its current body only spreads
 *     `data` (which doesn't itself throw on undefined).
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

    class CozySyncKernel {
        // --- CENTRAL REGISTRY DECLARATION MAPS ---
        #registries = {
            topology: new Map(),
            syncProfile: new Map(),
            queueItem: new Map(),
            checkpoint: new Map(),
            conflict: new Map(),
            peer: new Map(),
            anchor: new Map()
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
            sessions: 0, topologies: 0, syncProfiles: 0, queueItems: 0, checkpoints: 0,
            conflicts: 0, peers: 0, anchors: 0, plugins: 0, integrations: 0,
            errors: 0, imports: 0, exports: 0, sync: 0, timeline: 0, audit: 0
        };

        constructor() {
            this.#initializeKernelIntegrations();
        }

        #initializeKernelIntegrations() {
            const architecturalTargets = [
                "CozyAI", "CozyNetwork", "CozyStorage", "CozyNotification", "CozyAccessibility",
                "CozySpeech", "CozyTranslate", "CozyEmergency", "CozyMedia", "CozyCamera",
                "CozyVision", "CozyIdentity", "CozyAutomation", "CozyAnalytics", "CozyLive"
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
            this.#logAuditRecord("KERNEL_INITIALIZATION", "System", "CozySync core initialization secure baseline verified.");
            this.#logTimelineEvent("SYSTEM_BOOT", "Kernel", "Sync framework coordination subsystem functional.");
        }

        // =========================================================================
        // ─── RECURSIVE SECURITY CHOKE-POINT VALIDATOR ────────────────────────────
        // =========================================================================

        #enforceSecurityGuardrails(payload) {
            if (payload === null || payload === undefined) return;
            if (typeof payload === "function") {
                this.#diagnostics.errors++;
                throw new Error("[CozySync] Security Breach: Dynamic execution functions are strictly prohibited.");
            }
            if (typeof payload === "object") {
                for (const key of Object.keys(payload)) {
                    const normalizedKey = key.toLowerCase().trim();

                    for (const keyword of FORBIDDEN_SECURITY_KEYWORDS) {
                        if (normalizedKey.includes(keyword)) {
                            this.#diagnostics.errors++;
                            throw new Error(`[CozySync] Security Access Denied: Prohibited property pattern matching isolated: [${key}]`);
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
            const sessionId = "syn-session-" + crypto.randomUUID();

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
            this.#logTimelineEvent("SESSION_LIFECYCLE_CHANGE", sessionId, "Sync coordination session initialized.");
            this.emit("sessionCreated", this.#deepCloneAndFreeze(session));
            return this.#deepCloneAndFreeze(session);
        }

        transitionSessionState(sessionId, targetState) {
            if (!this.#sessions.has(sessionId)) throw new Error(`[CozySync] Session unmatched: ${sessionId}`);
            if (!this.#validSessionStates.includes(targetState)) throw new Error(`[CozySync] State unsupported: ${targetState}`);

            const session = this.#sessions.get(sessionId);
            const currentState = session.lifecycleState;

            const legalMoves = this.#sessionTransitionMatrix[currentState] || [];
            if (!legalMoves.includes(targetState)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozySync] Lifecycle Violation: Transition path from [${currentState}] to [${targetState}] is illegal.`);
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
        // ─── DRYSYNC REUSABLE CORE REGISTRY ENGINE (CRUD + METRICS) ──────────────
        // =========================================================================

        #getDiagnosticField(registryKey) {
            const mappings = {
                topology: "topologies", syncProfile: "syncProfiles", queueItem: "queueItems",
                checkpoint: "checkpoints", conflict: "conflicts", peer: "peers", anchor: "anchors"
            };
            return mappings[registryKey];
        }

        #createRecord(registryKey, data = {}) {
            this.#enforceSecurityGuardrails(data);
            const prefix = registryKey.substring(0, 4);
            const id = `${prefix}-${crypto.randomUUID()}`;

            // [v1.0.2 fix] syncMeta destructured out before spreading, so it
            // is never duplicated as its own top-level property alongside the
            // generated `meta` object.
            const { syncMeta, ...fields } = data;
            const record = { id, ...fields, meta: this.#generateUniversalMetadata(syncMeta) };

            this.#registries[registryKey].set(id, record);

            const counterField = this.#getDiagnosticField(registryKey);
            if (counterField) this.#diagnostics[counterField]++;

            this.#logAuditRecord(`${registryKey.toUpperCase()}_CREATE`, id, `Record initialization added to register context.`);
            this.#logTimelineEvent(`${registryKey.toUpperCase()}_EVENT`, id, `New registry sync asset instantiated.`);
            this.emit(`${registryKey}:create`, this.#deepCloneAndFreeze(record));
            return this.#deepCloneAndFreeze(record);
        }

        #readRecord(registryKey, id) {
            const targetMap = this.#registries[registryKey];
            return targetMap.has(id) ? this.#deepCloneAndFreeze(targetMap.get(id)) : null;
        }

        #updateRecord(registryKey, id, data = {}) {
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

            this.#logAuditRecord(`${registryKey.toUpperCase()}_DELETE`, id, `Asset completely purged from active sync space.`);
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
                throw new Error("[CozySync] Error: Mandatory target profile property 'id' missing.");
            }
            const id = plugin.id.trim().toLowerCase();
            if (this.#plugins.has(id)) throw new Error(`[CozySync] Collision: Plugin [${id}] is already tracking.`);

            this.#plugins.set(id, this.#deepCloneAndFreeze(plugin));
            this.#diagnostics.plugins++;
            this.#logAuditRecord("PLUGIN_REGISTRATION", id, "External sync capability plugin bound.");
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

        updateClosedIntegrationMetadata(systemId, flags = {}) {
            this.#enforceSecurityGuardrails(flags);
            const key = String(systemId).toLowerCase().trim();
            const existing = this.#closedIntegrations.get(key);
            if (!existing) {
                throw new Error(`[CozySync] System Target Refusal: System context [${systemId}] is independent of CozyOS framework standard specifications.`);
            }

            const record = {
                systemId: existing.systemId,
                // [v1.0.2 fix] registeredAt carried forward from the existing
                // record — previously dropped entirely, becoming `undefined`
                // after the first update.
                registeredAt: existing.registeredAt,
                activeState: flags.activeState || "MONITORING_ONLY",
                connectionContext: flags.connectionContext ? { ...flags.connectionContext } : {},
                lastUpdated: Date.now()
            };

            this.#closedIntegrations.set(key, Object.freeze(record));
            this.#logAuditRecord("CLOSED_INTEGRATION_SYNC", key, "Internal framework sync communication channels mapped.");
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
            this.#logAuditRecord("REGISTRY_EXPORT", "Kernel", "Fidelity sync register snapshot generation executed.");

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

        /**
         * [v1.0.2 fix] The security guardrail previously ran on
         * `jsonPayload` while it was still a raw string — a no-op, since
         * the recursive validator only inspects typeof "object". It now
         * runs on `parsed`, immediately after JSON.parse and before any
         * merge logic executes, matching the stated "choke-point" design
         * intent. Per-record validation inside #executeStateMerge is
         * retained as well (defense in depth, not redundant — it also
         * covers records merged one at a time).
         */
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
                        if (p && p.id) this.#plugins.set(p.id.trim().toLowerCase(), this.#deepCloneAndFreeze(p));
                    });
                }
                this.#diagnostics.plugins = this.#plugins.size;

                // 4. Restore Closed Integrations Metadata
                if (parsed.closedIntegrations) {
                    parsed.closedIntegrations.forEach(i => {
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
                throw new Error(`[CozySync] Serialization Crash: Import processing execution halted: ${err.message}`);
            }
        }

        /**
         * [v1.0.2 fix] Removed the unused `optionalRegistryKey` parameter
         * (never referenced in the body) and updated the sole call site
         * above to no longer pass it.
         */
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

    if (window.CozyOS.CozySync) {
        if (window.CozyOS.CozySync.getVersion() === VERSION) {
            return; // Same version returns existing instance reference smoothly.
        } else {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: Running environment matches mismatched version constraints.`);
        }
    }

    const instanceReference = new CozySyncKernel();

    window.CozyOS.CozySync = Object.freeze({
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
        // [v1.0.2 CRITICAL FIX] emit() was implemented but never exported.
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
        topology: instanceReference.getRegistryInterface("topology"),
        syncProfile: instanceReference.getRegistryInterface("syncProfile"),
        queueItem: instanceReference.getRegistryInterface("queueItem"),
        checkpoint: instanceReference.getRegistryInterface("checkpoint"),
        conflict: instanceReference.getRegistryInterface("conflict"),
        peer: instanceReference.getRegistryInterface("peer"),
        anchor: instanceReference.getRegistryInterface("anchor")
    });

})();
