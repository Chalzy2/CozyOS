/**
 * CozyOS Enterprise Framework — Automation Coordination Subsystem
 * File Reference: core/modules/automation/cozy-automation.js
 * Layer: Kernel / Core Service Coordination
 * Version: 1.0.4-ENTERPRISE
 *
 * REVISION NOTES (v1.0.4):
 * - Added CozyMeeting to the closed integration registry — confirmed as a
 *   legitimate Enterprise coordinator (automation coordinates reminders,
 *   attendance collection, follow-ups, and CozyLive broadcast metadata
 *   around meetings; it does not run meetings itself).
 * - Did NOT add CozyAutomation to its own list — no kernel in this family
 *   (CozyStorage, CozySpeech, CozyLive) self-references; kept consistent.
 * - Did NOT remove CozySpeech/CozyTranslate/CozyMedia/CozyCamera/CozyVision
 *   despite their absence from the latest proposed list — removal isn't
 *   additive, and CozyVision's own spec explicitly self-describes as a
 *   coordinator-tier kernel, contradicting any case for its removal.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const VERSION = "1.0.4-ENTERPRISE";

    const FORBIDDEN_SECURITY_KEYWORDS = [
        "password", "secret", "token", "jwt", "apikey", "certificate",
        "biometric", "fingerprint", "iristemplate", "faceembedding",
        "voiceembedding", "privatekey", "publickey"
    ];

    class CozyAutomationKernel {
        #registries = {
            automation: new Map(),
            workflow: new Map(),
            trigger: new Map(),
            action: new Map(),
            condition: new Map(),
            schedule: new Map(),
            executionPlan: new Map(),
            template: new Map(),
            policy: new Map(),
            group: new Map()
        };

        #sessions = new Map();
        #plugins = new Map();
        #closedIntegrations = new Map();
        #timeline = [];
        #auditLog = [];
        #eventListeners = new Map();

        #validSessionStates = ["CREATED", "ACTIVE", "PAUSED", "STOPPED", "ENDED", "ARCHIVED"];
        #sessionTransitionMatrix = {
            "CREATED": ["ACTIVE", "STOPPED", "ARCHIVED"],
            "ACTIVE": ["PAUSED", "STOPPED", "ENDED"],
            "PAUSED": ["ACTIVE", "STOPPED", "ENDED"],
            "STOPPED": ["ACTIVE", "ENDED"],
            "ENDED": ["ARCHIVED"],
            "ARCHIVED": []
        };

        #diagnostics = {
            sessions: 0, automations: 0, workflows: 0, triggers: 0, actions: 0,
            conditions: 0, schedules: 0, executionPlans: 0, templates: 0, policies: 0,
            groups: 0, plugins: 0, integrations: 0, imports: 0, exports: 0,
            sync: 0, timeline: 0, audit: 0, errors: 0
        };

        constructor() {
            this.#initializeKernelIntegrations();
        }

        #initializeKernelIntegrations() {
            const architecturalTargets = [
                "CozyAI", "CozyNetwork", "CozyStorage", "CozyNotification", "CozyAccessibility",
                "CozySpeech", "CozyTranslate", "CozyEmergency", "CozyMedia", "CozyCamera",
                "CozyVision", "CozyIdentity", "CozySync", "CozyAnalytics", "CozyLive",
                "CozyAttendance", "CozySecurity", "CozyMeeting"
            ];
            for (const systemId of architecturalTargets) {
                this.#closedIntegrations.set(systemId.toLowerCase(), Object.freeze({
                    systemId,
                    registeredAt: new Date().toISOString(),
                    activeState: "DISCONNECTED",
                    connectionContext: null,
                    lastUpdated: new Date().toISOString(),
                    meta: this.#generateUniversalMetadata()
                }));
            }
            this.#diagnostics.integrations = this.#closedIntegrations.size;
            this.#logAuditRecord("KERNEL_INITIALIZATION", "System", "kernel", "CozyAutomation core initialization secure baseline verified.");
            this.#logTimelineEvent("system.boot", { status: "functional" });
        }

        #enforceSecurityGuardrails(payload, path = "root") {
            if (payload === null || payload === undefined) return;
            if (typeof payload === "function") {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] Security Breach: Dynamic execution function rejected at path "${path}".`);
            }
            if (typeof payload === "object") {
                for (const key of Object.keys(payload)) {
                    const normalizedKey = key.toLowerCase().trim();
                    const currentPath = `${path}.${key}`;

                    for (const keyword of FORBIDDEN_SECURITY_KEYWORDS) {
                        if (normalizedKey.includes(keyword)) {
                            this.#diagnostics.errors++;
                            throw new Error(`[CozyAutomation] Security Access Denied: Prohibited property key "${key}" rejected at path "${currentPath}".`);
                        }
                    }
                    this.#enforceSecurityGuardrails(payload[key], currentPath);
                }
            }
        }

        #generateUniversalMetadata(explicitMeta = {}) {
            return {
                localId: explicitMeta.localId || "loc_" + crypto.randomUUID(),
                globalId: explicitMeta.globalId || null,
                syncState: explicitMeta.syncState || "LOCAL_ONLY",
                conflictState: explicitMeta.conflictState || null,
                version: Number(explicitMeta.version || 1),
                lastModified: explicitMeta.lastModified || new Date().toISOString(),
                createdOffline: explicitMeta.createdOffline !== undefined ? !!explicitMeta.createdOffline : true
            };
        }

        createSession(config = {}) {
            this.#enforceSecurityGuardrails(config, "createSession");
            const sessionId = config.sessionId || "session_" + crypto.randomUUID();

            if (this.#sessions.has(sessionId)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] createSession: Session "${sessionId}" already exists.`);
            }

            const { meta, ...callerSuppliedDescriptors } = config;

            const session = {
                sessionId,
                label: callerSuppliedDescriptors.label || "",
                context: callerSuppliedDescriptors.context || null,
                state: "CREATED",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                startedAt: null,
                pausedAt: null,
                stoppedAt: null,
                endedAt: null,
                archivedAt: null,
                meta: this.#generateUniversalMetadata(meta)
            };

            this.#sessions.set(sessionId, session);
            this.#diagnostics.sessions++;
            this.#logAuditRecord("SESSION_CREATED", "session", sessionId, "createSession");
            this.#logTimelineEvent("session.created", { sessionId });
            return sessionId;
        }

        transitionSessionState(sessionId, targetState) {
            if (!this.#sessions.has(sessionId)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] transitionSessionState: Session "${sessionId}" not found.`);
            }
            if (!this.#validSessionStates.includes(targetState)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] transitionSessionState: State unsupported "${targetState}".`);
            }

            const session = this.#sessions.get(sessionId);
            const currentState = session.state;

            const legalMoves = this.#sessionTransitionMatrix[currentState] || [];
            if (!legalMoves.includes(targetState)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] Lifecycle Violation: Transition path from "${currentState}" to "${targetState}" is illegal.`);
            }

            const now = new Date().toISOString();
            session.state = targetState;
            session.updatedAt = now;
            session.meta.version++;
            session.meta.lastModified = now;

            if (targetState === "ACTIVE" && !session.startedAt) session.startedAt = now;
            if (targetState === "PAUSED") session.pausedAt = now;
            if (targetState === "STOPPED") session.stoppedAt = now;
            if (targetState === "ENDED") session.endedAt = now;
            if (targetState === "ARCHIVED") session.archivedAt = now;

            this.#logAuditRecord("SESSION_TRANSITION", "session", sessionId, "transitionSessionState", { from: currentState, to: targetState });
            this.#logTimelineEvent("session.transitioned", { sessionId, from: currentState, to: targetState });
            return this.#deepCloneAndFreeze(session);
        }

        getSession(id) { return this.#sessions.has(id) ? this.#deepCloneAndFreeze(this.#sessions.get(id)) : null; }
        listSessions(predicate) {
            const all = Array.from(this.#sessions.values());
            return Object.freeze(predicate ? all.filter(predicate).map(s => this.#deepCloneAndFreeze(s)) : all.map(s => this.#deepCloneAndFreeze(s)));
        }
        hasSession(id) { return !!id && this.#sessions.has(id); }
        countSessions() { return this.#sessions.size; }

        #getDiagnosticField(registryKey) {
            const mappings = {
                automation: "automations", workflow: "workflows", trigger: "triggers",
                action: "actions", condition: "conditions", schedule: "schedules",
                executionPlan: "executionPlans", template: "templates", policy: "policies",
                group: "groups"
            };
            return mappings[registryKey];
        }

        #getIdPrefix(registryKey) {
            const prefixes = {
                automation: "atm", workflow: "wrk", trigger: "trg", action: "act",
                condition: "cnd", schedule: "sch", executionPlan: "pln", template: "tpl",
                policy: "plc", group: "grp"
            };
            return prefixes[registryKey];
        }

        #createRecord(registryKey, data = {}) {
            this.#enforceSecurityGuardrails(data, `${registryKey}.create`);

            const prefix = this.#getIdPrefix(registryKey);
            const id = data.id || `${prefix}_${crypto.randomUUID()}`;

            if (this.#registries[registryKey].has(id)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] ${registryKey}.create: Record "${id}" already exists.`);
            }

            const { meta, ...fields } = data;
            const now = new Date().toISOString();

            const record = {
                id,
                ...fields,
                createdAt: now,
                updatedAt: now,
                meta: this.#generateUniversalMetadata(meta)
            };

            this.#registries[registryKey].set(id, record);

            const counterField = this.#getDiagnosticField(registryKey);
            if (counterField) this.#diagnostics[counterField]++;

            this.#logAuditRecord("CREATE", registryKey, id, `${registryKey}.create`);
            this.#logTimelineEvent(`${registryKey}.created`, { id });
            return id;
        }

        #readRecord(registryKey, id) {
            const targetMap = this.#registries[registryKey];
            return targetMap.has(id) ? this.#deepCloneAndFreeze(targetMap.get(id)) : null;
        }

        #updateRecord(registryKey, id, patch = {}) {
            this.#enforceSecurityGuardrails(patch, `${registryKey}.update`);
            const targetMap = this.#registries[registryKey];
            if (!targetMap.has(id)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] ${registryKey}.update: Record "${id}" not found.`);
            }

            const existingRecord = targetMap.get(id);
            const { meta, ...patchFields } = patch;
            const prevMeta = existingRecord.meta || {};
            const now = new Date().toISOString();

            const updatedRecord = {
                ...existingRecord,
                ...patchFields,
                id,
                updatedAt: now,
                meta: this.#generateUniversalMetadata({
                    ...prevMeta,
                    version: (prevMeta.version || 1) + 1,
                    lastModified: now,
                    syncState: meta?.syncState || prevMeta.syncState,
                    conflictState: meta?.conflictState || prevMeta.conflictState,
                    globalId: meta?.globalId || prevMeta.globalId
                })
            };

            targetMap.set(id, updatedRecord);
            this.#logAuditRecord("UPDATE", registryKey, id, `${registryKey}.update`);
            this.#logTimelineEvent(`${registryKey}.updated`, { id });
            return this.#deepCloneAndFreeze(updatedRecord);
        }

        #deleteRecord(registryKey, id) {
            const targetMap = this.#registries[registryKey];
            if (!targetMap.has(id)) return false;

            targetMap.delete(id);
            const counterField = this.#getDiagnosticField(registryKey);
            if (counterField) this.#diagnostics[counterField] = Math.max(0, this.#diagnostics[counterField] - 1);

            this.#logAuditRecord("DELETE", registryKey, id, `${registryKey}.delete`);
            this.#logTimelineEvent(`${registryKey}.deleted`, { id });
            return true;
        }

        #listRecords(registryKey, predicate) {
            const all = Array.from(this.#registries[registryKey].values());
            return Object.freeze(predicate ? all.filter(predicate).map(r => this.#deepCloneAndFreeze(r)) : all.map(r => this.#deepCloneAndFreeze(r)));
        }

        #hasRecord(registryKey, id) { return !!id && this.#registries[registryKey].has(id); }
        #countRecords(registryKey) { return this.#registries[registryKey].size; }

        on(event, handler) {
            if (typeof handler !== "function") throw new TypeError("[CozyAutomation] Event listener must be a function.");
            if (!this.#eventListeners.has(event)) this.#eventListeners.set(event, new Set());
            this.#eventListeners.get(event).add({ handler, once: false });
        }

        off(event, handler) {
            const set = this.#eventListeners.get(event);
            if (!set) return;
            for (const entry of set) {
                if (entry.handler === handler) {
                    set.delete(entry);
                    return;
                }
            }
        }

        once(event, handler) {
            if (typeof handler !== "function") throw new TypeError("[CozyAutomation] Event listener must be a function.");
            if (!this.#eventListeners.has(event)) this.#eventListeners.set(event, new Set());
            this.#eventListeners.get(event).add({ handler, once: true });
        }

        emit(event, data) {
            this.#enforceSecurityGuardrails({ event }, "emit");
            const set = this.#eventListeners.get(event);
            if (!set || set.size === 0) return;
            const clearPayload = this.#deepCloneAndFreeze(data);
            const removalQueue = [];
            for (const entry of set) {
                try {
                    entry.handler(clearPayload);
                } catch (fault) {
                    this.#diagnostics.errors++;
                }
                if (entry.once) removalQueue.push(entry);
            }
            for (const entry of removalQueue) {
                set.delete(entry);
            }
        }

        getRegistryInterface(key) {
            if (!this.#registries[key]) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] getRegistryInterface: Unknown registry "${key}".`);
            }
            return Object.freeze({
                create: (d) => this.#createRecord(key, d),
                read: (id) => this.#readRecord(key, id),
                update: (id, p) => this.#updateRecord(key, id, p),
                delete: (id) => this.#deleteRecord(key, id),
                list: (pred) => this.#listRecords(key, pred),
                get: (id) => this.#readRecord(key, id),
                has: (id) => this.#hasRecord(key, id),
                count: () => this.#countRecords(key)
            });
        }

        registerPlugin(config = {}) {
            this.#enforceSecurityGuardrails(config, "registerPlugin");
            const pluginId = config.pluginId || "plugin_" + crypto.randomUUID();
            if (this.#plugins.has(pluginId)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] registerPlugin: Plugin "${pluginId}" already registered.`);
            }

            const { meta, ...fields } = config;
            const record = {
                pluginId,
                name: fields.name || "",
                type: fields.type || "general",
                version: fields.version || "1.0.0",
                description: fields.description || "",
                registeredAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                meta: this.#generateUniversalMetadata(meta)
            };

            this.#plugins.set(pluginId, record);
            this.#diagnostics.plugins++;
            this.#logAuditRecord("PLUGIN_REGISTERED", "plugin", pluginId, "registerPlugin");
            this.#logTimelineEvent("plugin.registered", { pluginId });
            return pluginId;
        }

        removePlugin(pluginId) {
            if (!this.#plugins.has(pluginId)) return false;
            this.#plugins.delete(pluginId);
            this.#diagnostics.plugins = Math.max(0, this.#diagnostics.plugins - 1);
            this.#logAuditRecord("PLUGIN_REMOVAL", "plugin", pluginId, "removePlugin");
            this.#logTimelineEvent("plugin.removed", { pluginId });
            return true;
        }

        listPlugins(predicate) {
            const all = Array.from(this.#plugins.values());
            return Object.freeze(predicate ? all.filter(predicate).map(p => this.#deepCloneAndFreeze(p)) : all.map(p => this.#deepCloneAndFreeze(p)));
        }
        getPlugin(id) { return this.#plugins.has(id) ? this.#deepCloneAndFreeze(this.#plugins.get(id)) : null; }
        hasPlugin(id) { return !!id && this.#plugins.has(id); }
        countPlugins() { return this.#plugins.size; }

        updateClosedIntegrationMetadata(systemId, update = {}) {
            this.#enforceSecurityGuardrails(update, "updateClosedIntegrationMetadata");
            const key = String(systemId).toLowerCase().trim();

            let targetKey = null;
            for (const existingId of this.#closedIntegrations.keys()) {
                if (existingId === key) {
                    targetKey = existingId;
                    break;
                }
            }

            if (!targetKey) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] updateClosedIntegrationMetadata: Unknown integration "${systemId}".`);
            }

            const existing = this.#closedIntegrations.get(targetKey);
            const prevMeta = existing.meta || {};
            const now = new Date().toISOString();

            const record = {
                systemId: existing.systemId,
                registeredAt: existing.registeredAt,
                activeState: update.activeState !== undefined ? update.activeState : existing.activeState,
                connectionContext: update.connectionContext !== undefined ? update.connectionContext : existing.connectionContext,
                lastUpdated: now,
                meta: this.#generateUniversalMetadata({
                    ...prevMeta,
                    version: (prevMeta.version || 1) + 1,
                    lastModified: now
                })
            };

            this.#closedIntegrations.set(targetKey, Object.freeze(record));
            this.#logAuditRecord("INTEGRATION_UPDATED", "integration", existing.systemId, "updateClosedIntegrationMetadata");
            this.#logTimelineEvent("integration.updated", { systemId: existing.systemId });
            return Object.freeze(record);
        }

        getClosedIntegrationState(systemId) {
            const key = String(systemId).toLowerCase().trim();
            return this.#closedIntegrations.has(key) ? this.#deepCloneAndFreeze(this.#closedIntegrations.get(key)) : null;
        }

        listClosedIntegrations(predicate) {
            const all = Array.from(this.#closedIntegrations.values());
            return Object.freeze(predicate ? all.filter(predicate).map(i => this.#deepCloneAndFreeze(i)) : all.map(i => this.#deepCloneAndFreeze(i)));
        }
        hasClosedIntegration(systemId) { return !!systemId && this.#closedIntegrations.has(String(systemId).toLowerCase().trim()); }
        countClosedIntegrations() { return this.#closedIntegrations.size; }

        #logTimelineEvent(eventType, payload = {}) {
            const record = {
                timelineId: "tl_" + crypto.randomUUID(),
                eventType: String(eventType),
                payload: this.#deepCloneAndFreeze(payload),
                timestamp: new Date().toISOString()
            };
            this.#timeline.push(Object.freeze(record));
            this.#diagnostics.timeline = this.#timeline.length;
            this.emit(`cozyautomation.${eventType}`, payload);
        }

        getTimeline(predicate) {
            const list = this.#timeline.map(e => this.#deepCloneAndFreeze(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        #logAuditRecord(action, entityType, entityId, context, meta = {}) {
            const record = {
                auditId: "audit_" + crypto.randomUUID(),
                action: String(action),
                entityType: String(entityType),
                entityId: String(entityId),
                context: String(context),
                meta: this.#deepCloneAndFreeze(meta),
                timestamp: new Date().toISOString()
            };
            this.#auditLog.push(Object.freeze(record));
            this.#diagnostics.audit = this.#auditLog.length;
        }

        getAuditLog(predicate) {
            const list = this.#auditLog.map(e => this.#deepCloneAndFreeze(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        exportKernelStateSnapshot() {
            this.#diagnostics.exports++;
            this.#logAuditRecord("EXPORT", "kernel", "snapshot", "exportKernelStateSnapshot");

            const registrySnapshots = {};
            for (const key of Object.keys(this.#registries)) {
                registrySnapshots[key] = Object.fromEntries(this.#registries[key]);
            }

            return this.#deepCloneAndFreeze({
                exportedAt: new Date().toISOString(),
                kernelName: "CozyAutomationKernel",
                version: VERSION,
                sessions: Object.fromEntries(this.#sessions),
                registries: registrySnapshots,
                plugins: Object.fromEntries(this.#plugins),
                closedIntegrations: Object.fromEntries(this.#closedIntegrations),
                timeline: [...this.#timeline],
                auditLog: [...this.#auditLog],
                diagnostics: this.getDiagnosticsReport()
            });
        }

        importAndMergeState(rawInput) {
            try {
                let parsed;
                if (typeof rawInput === "string") {
                    parsed = JSON.parse(rawInput);
                } else {
                    parsed = rawInput;
                }

                this.#enforceSecurityGuardrails(parsed, "importAndMergeState");

                if (!parsed || parsed.version !== VERSION) {
                    this.#diagnostics.errors++;
                    throw new Error(`[CozyAutomation] Framework architecture version target discrepancy. Kernel: ${VERSION} Target: ${parsed?.version}`);
                }

                this.#diagnostics.imports++;

                const mergeResult = {
                    sessions: { merged: 0, skipped: 0 },
                    registries: {},
                    plugins: { merged: 0, skipped: 0 },
                    integrations: { merged: 0, skipped: 0 }
                };

                if (parsed.sessions) {
                    for (const [id, incoming] of Object.entries(parsed.sessions)) {
                        const metrics = this.#executeStateMerge(this.#sessions, id, incoming);
                        mergeResult.sessions.merged += metrics.merged;
                        mergeResult.sessions.skipped += metrics.skipped;
                    }
                }
                this.#diagnostics.sessions = this.#sessions.size;

                if (parsed.registries) {
                    for (const registryKey of Object.keys(this.#registries)) {
                        mergeResult.registries[registryKey] = { merged: 0, skipped: 0 };
                        const incomingMap = parsed.registries[registryKey];
                        if (incomingMap) {
                            for (const [id, record] of Object.entries(incomingMap)) {
                                const metrics = this.#executeStateMerge(this.#registries[registryKey], id, record, true);
                                mergeResult.registries[registryKey].merged += metrics.merged;
                                mergeResult.registries[registryKey].skipped += metrics.skipped;
                            }
                        }
                        const counterField = this.#getDiagnosticField(registryKey);
                        if (counterField) this.#diagnostics[counterField] = this.#registries[registryKey].size;
                    }
                }

                if (parsed.plugins) {
                    for (const [id, incoming] of Object.entries(parsed.plugins)) {
                        const metrics = this.#executeStateMerge(this.#plugins, id, incoming);
                        mergeResult.plugins.merged += metrics.merged;
                        mergeResult.plugins.skipped += metrics.skipped;
                    }
                }
                this.#diagnostics.plugins = this.#plugins.size;

                if (parsed.closedIntegrations) {
                    for (const [id, incoming] of Object.entries(parsed.closedIntegrations)) {
                        if (this.#closedIntegrations.has(id)) {
                            const metrics = this.#executeStateMerge(this.#closedIntegrations, id, incoming);
                            mergeResult.integrations.merged += metrics.merged;
                            mergeResult.integrations.skipped += metrics.skipped;
                        }
                    }
                }
                this.#diagnostics.integrations = this.#closedIntegrations.size;

                if (parsed.timeline) {
                    for (const t of parsed.timeline) {
                        if (!this.#timeline.some(e => e.timelineId === t.timelineId)) {
                            this.#timeline.push(Object.freeze(t));
                        }
                    }
                }
                this.#diagnostics.timeline = this.#timeline.length;

                if (parsed.auditLog) {
                    for (const a of parsed.auditLog) {
                        if (!this.#auditLog.some(e => e.auditId === a.auditId)) {
                            this.#auditLog.push(Object.freeze(a));
                        }
                    }
                }
                this.#diagnostics.audit = this.#auditLog.length;

                this.#diagnostics.sync++;
                this.#logAuditRecord("IMPORT", "kernel", "merge", "importAndMergeState", { result: mergeResult });
                this.#logTimelineEvent("kernel.imported", { result: mergeResult });

                return this.#deepCloneAndFreeze(mergeResult);
            } catch (err) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyAutomation] Serialization Crash: Import processing execution halted: ${err.message}`);
            }
        }

        #executeStateMerge(targetMap, entityId, prospectiveRecord, supportsSkippedStore = false) {
            this.#enforceSecurityGuardrails(prospectiveRecord, `merge.${entityId}`);

            if (!targetMap.has(entityId)) {
                targetMap.set(entityId, this.#deepCloneAndFreeze(prospectiveRecord));
                return { merged: 1, skipped: 0 };
            }

            const current = targetMap.get(entityId);
            const currentVersion = current.meta?.version || 0;
            const incomingVersion = prospectiveRecord.meta?.version || 0;
            const currentModified = current.meta?.lastModified || "";
            const incomingModified = prospectiveRecord.meta?.lastModified || "";

            let shouldOverwrite = false;
            if (incomingVersion > currentVersion) {
                shouldOverwrite = true;
            } else if (incomingVersion === currentVersion && incomingModified > currentModified) {
                shouldOverwrite = true;
            }

            if (shouldOverwrite) {
                targetMap.set(entityId, this.#deepCloneAndFreeze(prospectiveRecord));
                return { merged: 1, skipped: 0 };
            } else {
                if (supportsSkippedStore) {
                    const localSkippedId = `${entityId}_skipped_sk_${crypto.randomUUID()}`;
                    const markedSkipped = {
                        ...prospectiveRecord,
                        meta: {
                            ...(prospectiveRecord.meta || {}),
                            syncState: "MERGE_SKIPPED_INCOMING_OLDER"
                        }
                    };
                    targetMap.set(localSkippedId, this.#deepCloneAndFreeze(markedSkipped));
                }
                return { merged: 0, skipped: 1 };
            }
        }

        getDiagnosticsReport() {
            return Object.freeze({
                kernelName: "CozyAutomationKernel",
                version: VERSION,
                generatedAt: new Date().toISOString(),
                ...this.#diagnostics
            });
        }

        #deepCloneAndFreeze(obj, seen) {
            seen = seen || new Map();
            if (obj === null || typeof obj !== "object") return obj;
            if (seen.has(obj)) return seen.get(obj);

            if (Array.isArray(obj)) {
                const out = [];
                seen.set(obj, out);
                obj.forEach(item => out.push(this.#deepCloneAndFreeze(item, seen)));
                return Object.freeze(out);
            }
            if (obj instanceof Date) return Object.freeze(new Date(obj.getTime()));
            if (obj instanceof RegExp) return Object.freeze(new RegExp(obj.source, obj.flags));
            if (obj instanceof Map) {
                const out = new Map();
                seen.set(obj, out);
                for (const [k, v] of obj) out.set(this.#deepCloneAndFreeze(k, seen), this.#deepCloneAndFreeze(v, seen));
                return Object.freeze(out);
            }
            if (obj instanceof Set) {
                const out = new Set();
                seen.set(obj, out);
                for (const v of obj) out.add(this.#deepCloneAndFreeze(v, seen));
                return Object.freeze(out);
            }
            const clone = {};
            seen.set(obj, clone);
            for (const key of Object.keys(obj)) {
                clone[key] = this.#deepCloneAndFreeze(obj[key], seen);
            }
            return Object.freeze(clone);
        }
    }

    if (window.CozyOS.CozyAutomation) {
        if (window.CozyOS.CozyAutomation.getVersion() === VERSION) {
            return;
        } else {
            throw new Error(`[CozyAutomationKernel] VERSION_CONFLICT: registered version "${window.CozyOS.CozyAutomation.getVersion()}" conflicts with loading version "${VERSION}". Only one version may be active at a time.`);
        }
    }

    const instanceReference = new CozyAutomationKernel();

    window.CozyOS.CozyAutomation = Object.freeze({
        getVersion: () => VERSION,
        getDiagnosticsReport: () => instanceReference.getDiagnosticsReport(),
        exportKernelStateSnapshot: () => instanceReference.exportKernelStateSnapshot(),
        importAndMergeState: (raw) => instanceReference.importAndMergeState(raw),
        getTimeline: (pred) => instanceReference.getTimeline(pred),
        getAuditLog: (pred) => instanceReference.getAuditLog(pred),

        on: (evt, cb) => instanceReference.on(evt, cb),
        off: (evt, cb) => instanceReference.off(evt, cb),
        once: (evt, cb) => instanceReference.once(evt, cb),
        emit: (evt, payload) => instanceReference.emit(evt, payload),

        createSession: (conf) => instanceReference.createSession(conf),
        transitionSessionState: (id, state) => instanceReference.transitionSessionState(id, state),
        getSession: (id) => instanceReference.getSession(id),
        listSessions: (pred) => instanceReference.listSessions(pred),
        countSessions: () => instanceReference.countSessions(),
        hasSession: (id) => instanceReference.hasSession(id),

        registerPlugin: (p) => instanceReference.registerPlugin(p),
        removePlugin: (id) => instanceReference.removePlugin(id),
        getPlugin: (id) => instanceReference.getPlugin(id),
        listPlugins: (pred) => instanceReference.listPlugins(pred),
        countPlugins: () => instanceReference.countPlugins(),
        hasPlugin: (id) => instanceReference.hasPlugin(id),

        updateClosedIntegrationMetadata: (id, update) => instanceReference.updateClosedIntegrationMetadata(id, update),
        getClosedIntegrationState: (id) => instanceReference.getClosedIntegrationState(id),
        listClosedIntegrations: (pred) => instanceReference.listClosedIntegrations(pred),
        countClosedIntegrations: () => instanceReference.countClosedIntegrations(),
        hasClosedIntegration: (id) => instanceReference.hasClosedIntegration(id),

        automation: instanceReference.getRegistryInterface("automation"),
        workflow: instanceReference.getRegistryInterface("workflow"),
        trigger: instanceReference.getRegistryInterface("trigger"),
        action: instanceReference.getRegistryInterface("action"),
        condition: instanceReference.getRegistryInterface("condition"),
        schedule: instanceReference.getRegistryInterface("schedule"),
        executionPlan: instanceReference.getRegistryInterface("executionPlan"),
        template: instanceReference.getRegistryInterface("template"),
        policy: instanceReference.getRegistryInterface("policy"),
        group: instanceReference.getRegistryInterface("group")
    });

})();
