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

    // Rejected outright before any dynamic key assignment or merge — this is
    // the prototype-pollution guard. Checked in #enforceSecurityGuardrails,
    // the single choke point every create/update/merge/emit path already
    // routes through, so the guard lives in exactly one place.
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // Single source of truth for the ten entity-type registries this kernel
    // manages — used both to build #registries and to expose the matching
    // registry-shortcut namespaces at export time, so the list only ever
    // needs to be written once.
    const REGISTRY_KEYS = [
        "automation", "workflow", "trigger", "action", "condition",
        "schedule", "executionPlan", "template", "policy", "group"
    ];

    class CozyAutomationKernel {
        #registries = Object.fromEntries(REGISTRY_KEYS.map((key) => [key, new Map()]));

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
            sync: 0, timeline: 0, audit: 0, errors: 0, memoryBaseline: 6.4
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
                this.#closedIntegrations.set(systemId.toLowerCase(), this.#deepFreeze({
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
                    if (FORBIDDEN_KEYS.has(key)) {
                        this.#diagnostics.errors++;
                        throw new Error(`[CozyAutomation] Security Access Denied: Prototype-pollution key "${key}" rejected at path "${path}.${key}".`);
                    }
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

        // This kernel doesn't render HTML itself today, but any label/
        // description a caller supplies (session labels, plugin names,
        // template content) could end up composed into markup by a
        // consumer — this is the standard escaping utility every CozyOS
        // coordinator carries for that case.
        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
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

        on(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[CozyAutomation] Event listener must be a function.");
            if (!this.#eventListeners.has(eventName)) this.#eventListeners.set(eventName, new Set());
            this.#eventListeners.get(eventName).add({ handler, once: false });
        }

        off(eventName, handler) {
            const set = this.#eventListeners.get(eventName);
            if (!set) return;
            for (const entry of set) {
                if (entry.handler === handler) {
                    set.delete(entry);
                    return;
                }
            }
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[CozyAutomation] Event listener must be a function.");
            if (!this.#eventListeners.has(eventName)) this.#eventListeners.set(eventName, new Set());
            this.#eventListeners.get(eventName).add({ handler, once: true });
        }

        emit(eventName, data) {
            if (typeof eventName !== "string" || !eventName.trim()) {
                this.#diagnostics.errors++;
                return;
            }
            this.#enforceSecurityGuardrails({ eventName }, "emit");
            const set = this.#eventListeners.get(eventName);
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
            if (this.#timeline.length > 500) this.#timeline.shift();
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
            if (this.#auditLog.length > 500) this.#auditLog.shift();
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

        /**
         * importAndMergeState(rawInput, { mergeStrategy })
         *   mergeStrategy: "merge" (default — existing smart version/
         *   timestamp-based merge, unchanged behavior) or "replace" (wipe
         *   every registry/session/plugin/integration/timeline/audit entry
         *   first, then import exactly what's given).
         */
        importAndMergeState(rawInput, { mergeStrategy = "merge" } = {}) {
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") {
                throw new TypeError('[CozyAutomation] importAndMergeState(): mergeStrategy must be "merge" or "replace".');
            }
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

                if (mergeStrategy === "replace") {
                    this.#sessions.clear();
                    for (const key of Object.keys(this.#registries)) this.#registries[key].clear();
                    this.#plugins.clear();
                    this.#timeline.length = 0;
                    this.#auditLog.length = 0;
                    // Closed integrations are re-seeded, not cleared to empty —
                    // an empty integrations table would contradict this
                    // kernel's own baseline initialization guarantee.
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
                            if (this.#timeline.length > 500) this.#timeline.shift();
                        }
                    }
                }
                this.#diagnostics.timeline = this.#timeline.length;

                if (parsed.auditLog) {
                    for (const a of parsed.auditLog) {
                        if (!this.#auditLog.some(e => e.auditId === a.auditId)) {
                            this.#auditLog.push(Object.freeze(a));
                            if (this.#auditLog.length > 500) this.#auditLog.shift();
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

        /**
         * importSnapshot(rawInput, options)
         *   Conventionally-named alias for importAndMergeState() — same
         *   behavior, same options. Kept as a genuine alias rather than
         *   renaming the original, so nothing that already calls
         *   importAndMergeState() breaks.
         */
        importSnapshot(rawInput, options) {
            return this.importAndMergeState(rawInput, options);
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

        getVersion() { return VERSION; }

        getDiagnosticsReport() {
            return Object.freeze({
                kernelName: "CozyAutomationKernel",
                version: VERSION,
                generatedAt: new Date().toISOString(),
                // Metadata-only integration points this kernel tracks state
                // for (see #closedIntegrations) — not functional API-call
                // dependencies. CozyAutomation never calls into any of these;
                // it only records their connection state.
                dependencies: Array.from(this.#closedIntegrations.values()).map(i => ({
                    name: i.systemId, required: false, purpose: "Tracked integration state only — no functional API calls made."
                })),
                ...this.#diagnostics
            });
        }

        /**
         * isVersionCompatible(version)
         *   Simplified major-version compatibility check — same major
         *   version as this kernel is treated as compatible. Not a
         *   certification decision; CozyCertification remains the
         *   authority on upgrade safety.
         */
        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        #deepFreeze(obj) {
            if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
                Object.getOwnPropertyNames(obj).forEach((key) => this.#deepFreeze(obj[key]));
                Object.freeze(obj);
            }
            return obj;
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

    // Direct instance export, matching every other CozyOS coordinator's
    // convention (CozyCertification, Company, Customer, ServiceRegistry all
    // export their instance the same direct way) rather than a hand-wrapped
    // frozen facade — one less layer, and consistent across the platform.
    // Private (#) fields remain genuinely inaccessible from outside the
    // class regardless of this change; the facade's Object.freeze() was
    // only ever protecting the public method references themselves, which
    // none of this project's other coordinators protect either.
    window.CozyOS.CozyAutomation = new CozyAutomationKernel();

    // Registry-shortcut namespaces — same public surface as before
    // (window.CozyOS.CozyAutomation.automation.create(...), etc.).
    for (const registryKey of REGISTRY_KEYS) {
        window.CozyOS.CozyAutomation[registryKey] = window.CozyOS.CozyAutomation.getRegistryInterface(registryKey);
    }

    // Auto-register with the Service Registry — retries if it isn't loaded
    // yet (load order isn't guaranteed), instead of only ever trying once.
    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "CozyAutomation", category: "Business Domain", icon: "automation.svg",
        description: "CozyAutomation — automation coordination kernel for sessions, workflows, triggers, actions, conditions, schedules, and plugin/integration state across CozyOS."
    });

})();
