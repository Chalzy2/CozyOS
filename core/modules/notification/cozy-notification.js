/**
 * CozyOS Enterprise Framework — Cognitive Notification Subsystem
 * File Reference: core/modules/notification/cozy-notification.js
 * Layer: Kernel / Core Service Coordination
 * Version: 1.0.1-ENTERPRISE
 *
 * DESIGN PRINCIPLES:
 * 1. Absolute Isolation Splitting: CozyNotification is 100% execution-free. It does not interface
 * with APNs, Firebase (FCM), SMTP servers, or SMS gateways, nor does it perform cryptographic actions.
 * 2. Immutable Lifecycle Records: Every data interaction is scrubbed using recursive type checks and
 * deep-frozen to eliminate unsecure cross-domain memory reference bleed.
 * 3. Dry Registry Architectural Engine: Unifies repetitive CRUD parameters into a single secure engine,
 * enforcing live diagnostic counters, append-only timelines, immutable mutation auditing, and event emission.
 *
 * CHANGELOG — 1.0.1 (fixes applied against 1.0.0)
 *   - Fixed a real bug: the public API referenced instanceReference.__recipientsEnum,
 *     __channelsEnum, __topicsEnum, __queueStatesEnum, __devicesEnum, __groupsEnum — none of
 *     which were ever defined, so every typed create() call (recipient/channel/topic/queue/
 *     device/group) received `undefined` as allowedTypes and would throw on first use.
 *     Registry interfaces are now built inside the constructor, where the private enum
 *     fields (#validRecipients etc.) are directly in scope, and exposed as instance
 *     properties — no more reaching for private state from outside the class.
 *   - Session registry now exposes getSession/listSessions/hasSession/countSessions,
 *     matching the inspection surface every other registry already has.
 *   - hasPlugin/countPlugins (already implemented internally) are now exported on the
 *     public API — they existed but were never wired up.
 *   - Closed integrations now expose listClosedIntegrations/hasClosedIntegration/
 *     countClosedIntegrations, matching every other frozen kernel's registry pattern.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const VERSION = "1.0.1-ENTERPRISE";

    const FORBIDDEN_SECURITY_KEYS = new Set([
        "password", "secret", "token", "jwt", "apikey", "certificate",
        "biometric", "fingerprint", "iristemplate", "faceembedding",
        "voiceembedding", "privatekey", "publickey"
    ]);

    class CozyNotificationKernel {
        // --- CENTRAL REGISTRY DECLARATION MAPS ---
        #registries = {
            notification: new Map(),
            recipient: new Map(),
            channel: new Map(),
            topic: new Map(),
            subscription: new Map(),
            preference: new Map(),
            queue: new Map(),
            device: new Map(),
            group: new Map(),
            template: new Map()
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

        #validRecipients = ["People", "Groups", "Departments", "Church Members", "Visitors", "Guests", "Devices", "Roles", "Communities", "Emergency Teams", "Custom"];
        #validChannels = ["Push", "Email", "SMS", "WhatsApp", "Telegram", "Signal", "Desktop", "Web", "Mobile", "TV", "Display", "Church Screen", "Speaker Display", "Custom"];
        #validTopics = ["Announcements", "Prayer", "Events", "Meetings", "Attendance", "Emergency", "Security", "Media", "Live", "Finance", "Youth", "Children", "Church", "Hospital", "Education", "Marketplace", "Custom"];
        #validDeviceTypes = ["Phones", "Tablets", "PC", "TV", "Display", "Hub", "Gateway", "ESP32", "Custom"];
        #validGroupTypes = ["Departments", "Church Groups", "Teams", "Communities", "Schools", "Hospitals", "Companies", "Custom"];
        #validQueueStates = ["Pending", "Queued", "Scheduled", "Delivered Metadata", "Failed Metadata", "Cancelled Metadata", "Retry Metadata"];

        // --- SUB-SYSTEM DIAGNOSTICS PERFORMANCE COUNTERS ---
        #diagnostics = {
            sessions: 0, notifications: 0, recipients: 0, channels: 0, subscriptions: 0,
            topics: 0, preferences: 0, queue: 0, devices: 0, groups: 0, templates: 0,
            plugins: 0, integrations: 0, errors: 0, imports: 0, exports: 0, sync: 0,
            timeline: 0, audit: 0
        };

        constructor() {
            this.#initializeKernelIntegrations();

            // --- REGISTRY INTERFACES BUILT HERE, WHERE PRIVATE ENUM FIELDS ARE IN SCOPE ---
            // (Building these outside the class had no access to #validRecipients etc.,
            // which is what produced the undefined-enum bug in 1.0.0.)
            this.notificationRegistry = this.getRegistryInterface("notification");
            this.recipientRegistry = this.getRegistryInterface("recipient", "type", this.#validRecipients);
            this.channelRegistry = this.getRegistryInterface("channel", "type", this.#validChannels);
            this.topicRegistry = this.getRegistryInterface("topic", "type", this.#validTopics);
            this.subscriptionRegistry = this.getRegistryInterface("subscription");
            this.preferenceRegistry = this.getRegistryInterface("preference");
            this.queueRegistry = this.getRegistryInterface("queue", "state", this.#validQueueStates);
            this.deviceRegistry = this.getRegistryInterface("device", "type", this.#validDeviceTypes);
            this.groupRegistry = this.getRegistryInterface("group", "type", this.#validGroupTypes);
            this.templateRegistry = this.getRegistryInterface("template");
        }

        #initializeKernelIntegrations() {
            const architecturalTargets = [
                "CozyAI", "CozyNetwork", "CozySync", "CozyMeeting", "CozyAttendance",
                "CozyEmergency", "CozyVision", "CozySpeech", "CozyTranslate", "CozyMedia",
                "CozyCamera", "CozyStorage", "CozyIdentity", "CozyAccessibility", "CozyAnalytics",
                "CozyAutomation", "CozyLive"
            ];
            for (const systemId of architecturalTargets) {
                this.#closedIntegrations.set(systemId.toLowerCase(), Object.freeze({
                    systemId,
                    registeredAt: Date.now(),
                    activeState: "MONITORING_ONLY"
                }));
            }
            this.#logAuditRecord("KERNEL_INITIALIZATION", "System", "CozyNotification core initialization secure baseline verified.");
            this.#logTimelineEvent("SYSTEM_BOOT", "Kernel", "Notification framework subsystem functional.");
        }

        // =========================================================================
        // ─── RECURSIVE SECURITY CHOKE-POINT VALIDATOR ────────────────────────────
        // =========================================================================

        #enforceSecurityGuardrails(payload) {
            if (payload === null || payload === undefined) return;
            if (typeof payload === "function") {
                this.#diagnostics.errors++;
                throw new Error("[CozyNotification] Security Breach: Dynamic execution functions are strictly prohibited.");
            }
            if (typeof payload === "object") {
                for (const key of Object.keys(payload)) {
                    const normalizedKey = key.toLowerCase().trim();
                    if (FORBIDDEN_SECURITY_KEYS.has(normalizedKey)) {
                        this.#diagnostics.errors++;
                        throw new Error(`[CozyNotification] Security Access Denied: Prohibited property identified: [${key}]`);
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
            const sessionId = "ntf-session-" + crypto.randomUUID();

            const session = {
                id: sessionId,
                lifecycleState: "CREATED",
                meta: this.#generateUniversalMetadata(config.syncMeta),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            this.#sessions.set(sessionId, session);
            this.#diagnostics.sessions++;
            this.#logAuditRecord("SESSION_CREATE", sessionId, "State set to CREATED");
            this.#logTimelineEvent("SESSION_LIFECYCLE_CHANGE", sessionId, "Session initialized.");
            this.emit("sessionCreated", session);
            return this.#deepCloneAndFreeze(session);
        }

        transitionSessionState(sessionId, targetState) {
            if (!this.#sessions.has(sessionId)) throw new Error(`[CozyNotification] Session unmatched: ${sessionId}`);
            if (!this.#validSessionStates.includes(targetState)) throw new Error(`[CozyNotification] State unsupported: ${targetState}`);

            const session = this.#sessions.get(sessionId);
            const currentState = session.lifecycleState;

            const legalMoves = this.#sessionTransitionMatrix[currentState] || [];
            if (!legalMoves.includes(targetState)) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyNotification] Lifecycle Violation: Transition path from [${currentState}] to [${targetState}] is illegal.`);
            }

            session.lifecycleState = targetState;
            session.updatedAt = Date.now();
            session.meta.version++;
            session.meta.lastModified = Date.now();

            this.#logAuditRecord("SESSION_TRANSITION", sessionId, `Moved from ${currentState} to ${targetState}`);
            this.#logTimelineEvent("SESSION_LIFECYCLE_CHANGE", sessionId, `Lifecycle state set to: ${targetState}`);
            this.emit("sessionTransitioned", session);
            return this.#deepCloneAndFreeze(session);
        }

        getSession(id) {
            if (!id || !this.#sessions.has(id)) return null;
            return this.#deepCloneAndFreeze(this.#sessions.get(id));
        }

        listSessions(predicate) {
            const list = Array.from(this.#sessions.values()).map(s => this.#deepCloneAndFreeze(s));
            return Object.freeze(typeof predicate === "function" ? list.filter(predicate) : list);
        }

        hasSession(id) { return !!id && this.#sessions.has(id); }
        countSessions() { return this.#sessions.size; }

        // =========================================================================
        // ─── DRYSYNC REUSABLE CORE REGISTRY ENGINE (CRUD + METRICS) ──────────────
        // =========================================================================

        #getDiagnosticField(registryKey) {
            const mappings = {
                notification: "notifications", recipient: "recipients", channel: "channels",
                subscription: "subscriptions", topic: "topics", preference: "preferences",
                queue: "queue", device: "devices", group: "groups", template: "templates"
            };
            return mappings[registryKey];
        }

        #createRecord(registryKey, data, typeValidator = null, allowedTypes = []) {
            this.#enforceSecurityGuardrails(data);
            if (typeValidator && !allowedTypes.includes(data[typeValidator])) {
                throw new Error(`[CozyNotification] Custom Constraint Validation Failure on [${registryKey}]: ${data[typeValidator]}`);
            }

            const prefix = registryKey.substring(0, 4);
            const id = `${prefix}-${crypto.randomUUID()}`;
            const record = { id, ...data, meta: this.#generateUniversalMetadata(data.syncMeta) };

            this.#registries[registryKey].set(id, record);

            const counterField = this.#getDiagnosticField(registryKey);
            if (counterField) this.#diagnostics[counterField]++;

            this.#logAuditRecord(`${registryKey.toUpperCase()}_CREATE`, id, `Record initialization added to register context.`);
            this.#logTimelineEvent(`${registryKey.toUpperCase()}_EVENT`, id, `New registry asset instantiated.`);
            this.emit(`${registryKey}:create`, record);
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
                id, // Preserve system anchor key absolute protection
                meta: {
                    ...existingRecord.meta,
                    version: (existingRecord.meta?.version || 1) + 1,
                    lastModified: Date.now()
                }
            };

            targetMap.set(id, updatedRecord);
            this.#logAuditRecord(`${registryKey.toUpperCase()}_UPDATE`, id, `Fields mutation event recorded.`);
            this.#logTimelineEvent(`${registryKey.toUpperCase()}_EVENT`, id, `Asset tracking configuration updated.`);
            this.emit(`${registryKey}:update`, updatedRecord);
            return true;
        }

        #deleteRecord(registryKey, id) {
            const targetMap = this.#registries[registryKey];
            if (!targetMap.has(id)) return false;

            targetMap.delete(id);
            const counterField = this.#getDiagnosticField(registryKey);
            if (counterField) this.#diagnostics[counterField] = Math.max(0, this.#diagnostics[counterField] - 1);

            this.#logAuditRecord(`${registryKey.toUpperCase()}_DELETE`, id, `Asset completely purged from active data space.`);
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

        getRegistryInterface(key, typeField = null, allowedTypes = []) {
            return Object.freeze({
                create: (d) => this.#createRecord(key, d, typeField, allowedTypes),
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
                throw new Error("[CozyNotification] Error: Mandatory target profile property 'id' missing.");
            }
            const id = plugin.id.trim().toLowerCase();
            if (this.#plugins.has(id)) throw new Error(`[CozyNotification] Collision: Plugin [${id}] is already tracking.`);

            this.#plugins.set(id, this.#deepCloneAndFreeze(plugin));
            this.#diagnostics.plugins++;
            this.#logAuditRecord("PLUGIN_REGISTRATION", id, "External channel orchestration plugin bound.");
            return true;
        }

        removePlugin(id) {
            if (!id) return false;
            const key = id.trim().toLowerCase();
            if (this.#plugins.delete(key)) {
                this.#logAuditRecord("PLUGIN_REMOVAL", key, "Plugin cleared.");
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
                throw new Error(`[CozyNotification] System Target Refusal: System context [${systemId}] is independent of CozyOS framework standard specifications.`);
            }

            const record = {
                systemId: this.#closedIntegrations.get(key).systemId,
                activeState: flags.activeState || "MONITORING_ONLY",
                connectionContext: { ...flags.connectionContext },
                lastUpdated: Date.now()
            };

            this.#closedIntegrations.set(key, Object.freeze(record));
            this.#diagnostics.integrations++;
            this.#logAuditRecord("CLOSED_INTEGRATION_SYNC", key, "Internal capability maps refreshed.");
        }

        getClosedIntegrationState(systemId) {
            const key = String(systemId).toLowerCase().trim();
            return this.#closedIntegrations.has(key) ? this.#closedIntegrations.get(key) : null;
        }

        listClosedIntegrations() {
            return Object.freeze(Array.from(this.#closedIntegrations.values()));
        }

        hasClosedIntegration(systemId) {
            return !!systemId && this.#closedIntegrations.has(String(systemId).toLowerCase().trim());
        }

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
            this.#diagnostics.timeline++;
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
            this.#diagnostics.audit++;
        }

        getAuditLog() { return Object.freeze(this.#auditLog.map(e => this.#deepCloneAndFreeze(e))); }

        // =========================================================================
        // ─── DISCONNECTED EDGE SYSTEM STATE PORTABILITY MATRIX ───────────────────
        // =========================================================================

        exportKernelStateSnapshot() {
            this.#diagnostics.exports++;
            this.#logAuditRecord("REGISTRY_EXPORT", "Kernel", "Fidelity register snapshot generation executed.");

            const serializableRegistries = {};
            for (const key of Object.keys(this.#registries)) {
                serializableRegistries[key] = Array.from(this.#registries[key].values());
            }

            return JSON.stringify({
                version: VERSION,
                timestamp: Date.now(),
                sessions: Array.from(this.#sessions.values()),
                registries: serializableRegistries,
                diagnosticsSummary: { ...this.#diagnostics }
            });
        }

        importAndMergeState(jsonPayload) {
            this.#enforceSecurityGuardrails(jsonPayload);
            try {
                const parsed = JSON.parse(jsonPayload);
                if (parsed.version !== VERSION) {
                    throw new Error(`Framework architecture version target discrepancy. Kernel: ${VERSION} Target: ${parsed.version}`);
                }

                this.#diagnostics.imports++;

                if (parsed.sessions) {
                    parsed.sessions.forEach(s => this.#executeStateMerge(this.#sessions, s.id, s));
                }

                const r = parsed.registries;
                if (r) {
                    for (const registryKey of Object.keys(this.#registries)) {
                        if (r[registryKey]) {
                            r[registryKey].forEach(record => {
                                this.#executeStateMerge(this.#registries[registryKey], record.id, record, registryKey);
                            });
                        }
                    }
                }

                this.#diagnostics.sync++;
                this.#logAuditRecord("REGISTRY_MERGE", "Kernel", "External data registries synchronized accurately.");
                return true;
            } catch (err) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyNotification] Serialization Crash: Import processing execution halted: ${err.message}`);
            }
        }

        #executeStateMerge(targetMap, entityId, prospectiveRecord, optionalRegistryKey = null) {
            this.#enforceSecurityGuardrails(prospectiveRecord);
            if (!targetMap.has(entityId)) {
                targetMap.set(entityId, prospectiveRecord);
                if (optionalRegistryKey) {
                    const counterField = this.#getDiagnosticField(optionalRegistryKey);
                    if (counterField) this.#diagnostics[counterField]++;
                }
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
                // Resolution: Replace record context parameters immutably to eliminate side-effects
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
                registryLoadDepth: {}
            };
            for (const key of Object.keys(this.#registries)) {
                statusSummary.registryLoadDepth[`${key}sTracked`] = this.#registries[key].size;
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

    if (window.CozyOS.CozyNotification) {
        if (window.CozyOS.CozyNotification.getVersion() === VERSION) {
            return;
        } else {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: Target version mismatch.`);
        }
    }

    const instanceReference = new CozyNotificationKernel();

    window.CozyOS.CozyNotification = Object.freeze({
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

        // Session Interface Orchestration
        createSession: (conf) => instanceReference.createSession(conf),
        transitionSessionState: (id, state) => instanceReference.transitionSessionState(id, state),
        getSession: (id) => instanceReference.getSession(id),
        listSessions: (pred) => instanceReference.listSessions(pred),
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

        // Shared Subsystem Registries Explicit Interface Map
        notification: instanceReference.notificationRegistry,
        recipient: instanceReference.recipientRegistry,
        channel: instanceReference.channelRegistry,
        topic: instanceReference.topicRegistry,
        subscription: instanceReference.subscriptionRegistry,
        preference: instanceReference.preferenceRegistry,
        queue: instanceReference.queueRegistry,
        device: instanceReference.deviceRegistry,
        group: instanceReference.groupRegistry,
        template: instanceReference.templateRegistry
    });

})();
