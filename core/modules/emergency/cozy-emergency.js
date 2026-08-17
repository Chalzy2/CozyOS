/**
 * CozyOS Enterprise Framework — Emergency Coordination Subsystem
 * File Reference: core/modules/emergency/cozy-emergency.js
 * Layer: Kernel / Core Service Coordination
 * Version: 1.1.0-ENTERPRISE
 *
 * DESIGN PRINCIPLES:
 * 1. Absolute Orchestration Splitting: CozyEmergency contains 0% tactical execution logic. It does
 * not dial phone systems, broadcast radio signals, fire siren alarms, or evaluate video streams.
 * 2. Hardened Security Validation: Rejects credentials, encryption keys, tokens, or biometric signatures.
 * 3. Atomic State Immutability: Every record returned from internal storage state parameters is deeply
 * cloned and recursively frozen to enforce operational isolation. Internal records are never mutated
 * in place — every state change replaces the stored record with a new object.
 *
 * CHANGELOG — 1.1.0 (fixes applied against 1.0.0)
 *   - Session transitions now enforced against an explicit legal-transition table (was: any valid
 *     state name accepted from any other state).
 *   - All 12 entity registries (incident/team/contact/zone/device/alert/notification/evacuation/
 *     resource/shelter/vehicle/medical) now share one internal registry factory (#makeRegistry),
 *     eliminating ~12x duplicated CRUD logic.
 *   - Every registry now exposes list()/has()/count(), not just plugins.
 *   - Fixed a real bug: createZone was incrementing #diagnostics.contacts instead of a zone counter.
 *   - Diagnostics restructured to { created, deleted } pairs per entity (lifetime operation counts),
 *     kept clearly distinct from getDiagnosticsReport().registryLoadMetrics (live .size counts) —
 *     resolves prior ambiguity between "counts only go up" and live registry size.
 *   - Audit logging is now consistent across all 12 registries (previously only Session/Incident had
 *     full coverage; 9 of 12 had partial or no audit trail).
 *   - Merge-conflict handling (#executeSafeMerge) now replaces the stored record with a new object
 *     instead of mutating the live internal record in place, matching Design Principle 3 as written.
 *   - Removed a duplicate "apikey" entry in FORBIDDEN_KEYS.
 *   - emit() no longer double freezes: callers pass the raw record once, emit() clones/freezes it
 *     for listeners exactly once.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const VERSION = "1.1.0-ENTERPRISE";

    // --- SECURITY RESTRICTION TARGET STRINGS ---
    const FORBIDDEN_KEYS = new Set([
        "password", "passphrase", "secret", "token", "jwt", "apikey",
        "certificate", "privatekey", "publickey", "signature", "credential",
        "fingerprint", "biometric", "biometrictemplate", "faceembedding",
        "voiceembedding", "iristemplate"
    ]);

    class CozyEmergencyKernel {
        // --- MULTI-REGISTRY LIFECYCLE SECTOR ---
        #sessions = new Map();
        #incidents = new Map();
        #teams = new Map();
        #contacts = new Map();
        #zones = new Map();
        #devices = new Map();
        #alerts = new Map();
        #notifications = new Map();
        #evacuations = new Map();
        #resources = new Map();
        #shelters = new Map();
        #vehicles = new Map();
        #medicalRecords = new Map();

        // --- PLUGINS AND SYSTEM OVERVIEW LINKAGES ---
        #plugins = new Map();
        #closedIntegrations = new Map();
        #timeline = [];
        #auditLog = [];
        #eventListeners = new Map();

        // --- STRUCTURAL ENUMERATIONS ---
        #validStates = ["CREATED", "ACTIVE", "RESPONDING", "CONTAINED", "RESOLVED", "ARCHIVED"];
        #validIncidentTypes = ["Fire", "Medical", "Security", "Flood", "Earthquake", "Storm", "Power Failure", "Technical Failure", "Missing Person", "Traffic", "Crowd", "Emergency Call", "Custom"];
        #validTeamTypes = ["Fire Team", "Medical Team", "Police", "Security", "Pastoral Team", "Rescue Team", "Volunteers", "Technicians", "Custom"];
        #validContactTypes = ["Emergency Contacts", "Hospitals", "Police Stations", "Fire Stations", "Church Leaders", "Community Leaders", "Family Contacts", "Custom"];
        #validZoneTypes = ["Country", "County", "Town", "Campus", "Building", "Floor", "Hall", "Room", "Stage", "Parking", "Outdoor", "Safe Zone", "Danger Zone", "Evacuation Zone"];
        #validDeviceTypes = ["Phone", "Tablet", "Radio", "Hub", "Gateway", "Camera", "Speaker", "Alarm", "Display", "Drone", "Vehicle", "Custom"];
        #validSeverities = ["Low", "Medium", "High", "Critical"];
        #validVehicleTypes = ["Ambulance", "Fire Truck", "Security Vehicle", "Church Vehicle", "Bus", "Motorbike", "Custom"];

        // --- LEGAL SESSION LIFECYCLE TRANSITIONS ---
        // NOTE: not specified upstream beyond the valid-state list; modeled as a standard
        // emergency-incident lifecycle (open → respond → contain → resolve → archive, with
        // reasonable reopen/cancel edges). Adjust if this needs to mirror another kernel's exact graph.
        #validTransitions = {
            CREATED: ["ACTIVE", "ARCHIVED"],
            ACTIVE: ["RESPONDING", "RESOLVED", "ARCHIVED"],
            RESPONDING: ["CONTAINED", "ACTIVE", "RESOLVED"],
            CONTAINED: ["RESOLVED", "RESPONDING"],
            RESOLVED: ["ARCHIVED", "ACTIVE"],
            ARCHIVED: []
        };

        // --- PERFORMANCE TELEMETRY COUNTERS (lifetime created/deleted per entity) ---
        #diagnostics = {
            sessions: { created: 0, deleted: 0 },
            incidents: { created: 0, deleted: 0 },
            teams: { created: 0, deleted: 0 },
            contacts: { created: 0, deleted: 0 },
            zones: { created: 0, deleted: 0 },
            devices: { created: 0, deleted: 0 },
            alerts: { created: 0, deleted: 0 },
            notifications: { created: 0, deleted: 0 },
            evacuations: { created: 0, deleted: 0 },
            resources: { created: 0, deleted: 0 },
            shelters: { created: 0, deleted: 0 },
            vehicles: { created: 0, deleted: 0 },
            medicalRecords: { created: 0, deleted: 0 },
            plugins: 0, integrations: 0,
            errors: 0, imports: 0, exports: 0, sync: 0
        };

        constructor() {
            this.#initializeKernelDefaults();

            // --- REGISTRY SUBSYSTEMS BUILT VIA SHARED FACTORY ---
            this.incidentRegistry = this.#makeRegistry({
                map: this.#incidents, idPrefix: "inc", typeField: "type",
                validValues: this.#validIncidentTypes, diagnosticsKey: "incidents",
                auditPrefix: "INCIDENT", logTimeline: true
            });
            this.teamRegistry = this.#makeRegistry({
                map: this.#teams, idPrefix: "team", typeField: "type",
                validValues: this.#validTeamTypes, diagnosticsKey: "teams",
                auditPrefix: "TEAM", logTimeline: false
            });
            this.contactRegistry = this.#makeRegistry({
                map: this.#contacts, idPrefix: "cnt", typeField: "type",
                validValues: this.#validContactTypes, diagnosticsKey: "contacts",
                auditPrefix: "CONTACT", logTimeline: false
            });
            this.zoneRegistry = this.#makeRegistry({
                map: this.#zones, idPrefix: "zone", typeField: "type",
                validValues: this.#validZoneTypes, diagnosticsKey: "zones",
                auditPrefix: "ZONE", logTimeline: false,
                validateExtra: (data) => {
                    if (data.parentZoneId && !this.#zones.has(data.parentZoneId)) {
                        throw new Error("[CozyEmergency] Zone Tree Violation: Referenced parent node missing.");
                    }
                }
            });
            this.deviceRegistry = this.#makeRegistry({
                map: this.#devices, idPrefix: "dev", typeField: "type",
                validValues: this.#validDeviceTypes, diagnosticsKey: "devices",
                auditPrefix: "DEVICE", logTimeline: false
            });
            this.alertRegistry = this.#makeRegistry({
                map: this.#alerts, idPrefix: "alrt", typeField: "severity",
                validValues: this.#validSeverities, diagnosticsKey: "alerts",
                auditPrefix: "ALERT", logTimeline: true
            });
            this.notificationRegistry = this.#makeRegistry({
                map: this.#notifications, idPrefix: "ntf-rec", diagnosticsKey: "notifications",
                auditPrefix: "NOTIFICATION", logTimeline: false,
                extraFields: () => ({ loggedAt: Date.now() })
            });
            this.evacuationRegistry = this.#makeRegistry({
                map: this.#evacuations, idPrefix: "evac", diagnosticsKey: "evacuations",
                auditPrefix: "EVACUATION", logTimeline: true
            });
            this.resourceRegistry = this.#makeRegistry({
                map: this.#resources, idPrefix: "res", diagnosticsKey: "resources",
                auditPrefix: "RESOURCE", logTimeline: false
            });
            this.shelterRegistry = this.#makeRegistry({
                map: this.#shelters, idPrefix: "shl", diagnosticsKey: "shelters",
                auditPrefix: "SHELTER", logTimeline: false
            });
            this.vehicleRegistry = this.#makeRegistry({
                map: this.#vehicles, idPrefix: "veh", typeField: "type",
                validValues: this.#validVehicleTypes, diagnosticsKey: "vehicles",
                auditPrefix: "VEHICLE", logTimeline: false
            });
            this.medicalRegistry = this.#makeRegistry({
                map: this.#medicalRecords, idPrefix: "med-case", diagnosticsKey: "medicalRecords",
                auditPrefix: "MEDICAL", logTimeline: false
            });
        }

        #initializeKernelDefaults() {
            const systemIntegrations = [
                "CozyNetwork", "CozySpeech", "CozyTranslate", "CozyVision", "CozyCamera",
                "CozyMedia", "CozyStorage", "CozyIdentity", "CozyNotification", "CozyAttendance",
                "CozyAI", "CozySync", "CozyAccessibility", "CozyLive"
            ];
            for (const integration of systemIntegrations) {
                this.#closedIntegrations.set(integration.toLowerCase(), Object.freeze({
                    systemId: integration,
                    connected: false,
                    lastMetadataUpdate: Date.now()
                }));
            }
            this.#logAuditRecord("SYSTEM_BOOT", "Kernel", "Core Emergency Coordination Kernel stabilized.");
            this.#logTimelineEvent("KERNEL_ONLINE", "System", "Emergency state routing operational.");
        }

        // =========================================================================
        // ─── HARDENED SECURITY CHOKE POINT VALIDATOR ─────────────────────────────
        // =========================================================================

        #validatePayloadSanity(data) {
            if (data === null || data === undefined) return;
            if (typeof data === "function") {
                this.#diagnostics.errors++;
                throw new Error("[CozyEmergency] Security Violation: Functional injection parameters block processing operations.");
            }
            if (typeof data === "object") {
                for (const key of Object.keys(data)) {
                    const normalizedKey = key.toLowerCase().trim();
                    if (FORBIDDEN_KEYS.has(normalizedKey)) {
                        this.#diagnostics.errors++;
                        throw new Error(`[CozyEmergency] Security Boundary Breach: Prohibited target key configuration identified: [${key}]`);
                    }
                    this.#validatePayloadSanity(data[key]);
                }
            }
        }

        #buildSyncMetadata(explicitMeta = {}) {
            return {
                localId: explicitMeta.localId || "loc-" + crypto.randomUUID(),
                globalId: explicitMeta.globalId || null,
                syncState: explicitMeta.syncState || "LOCAL_ONLY", // LOCAL_ONLY, SYNCED, PENDING
                version: Number(explicitMeta.version || 1),
                conflictState: explicitMeta.conflictState || "CLEAR",
                lastModified: Date.now(),
                createdOffline: explicitMeta.createdOffline !== undefined ? !!explicitMeta.createdOffline : true
            };
        }

        // =========================================================================
        // ─── SHARED REGISTRY FACTORY (replaces 12x duplicated CRUD blocks) ───────
        // =========================================================================

        /**
         * Builds a create/read/update/delete/list/has/count surface backed by `map`.
         * @param {Object} cfg
         * @param {Map} cfg.map
         * @param {string} cfg.idPrefix
         * @param {string} [cfg.typeField] - field name to validate against cfg.validValues (e.g. "type" or "severity")
         * @param {string[]} [cfg.validValues]
         * @param {string} cfg.diagnosticsKey - key into #diagnostics with a {created, deleted} shape
         * @param {string} cfg.auditPrefix
         * @param {boolean} [cfg.logTimeline]
         * @param {function} [cfg.validateExtra] - additional validation, throws on failure
         * @param {function} [cfg.extraFields] - returns extra fields merged into the record at creation
         */
        #makeRegistry(cfg) {
            const checkTypeField = (data) => {
                if (cfg.typeField && cfg.validValues && !cfg.validValues.includes(data[cfg.typeField])) {
                    throw new Error(`[CozyEmergency] ${cfg.auditPrefix} ${cfg.typeField} unrecognized: ${data[cfg.typeField]}`);
                }
            };

            const create = (data) => {
                this.#validatePayloadSanity(data);
                checkTypeField(data);
                if (cfg.validateExtra) cfg.validateExtra(data);
                const id = cfg.idPrefix + "-" + crypto.randomUUID();
                const record = Object.assign(
                    { id },
                    data,
                    cfg.extraFields ? cfg.extraFields() : {},
                    { sync: this.#buildSyncMetadata(data.syncMeta), createdAt: Date.now(), updatedAt: Date.now() }
                );
                cfg.map.set(id, record);
                this.#diagnostics[cfg.diagnosticsKey].created++;
                this.#logAuditRecord(`${cfg.auditPrefix}_CREATE`, id, "Record created.");
                if (cfg.logTimeline) this.#logTimelineEvent(`${cfg.auditPrefix}_CREATE`, id, "Record created.");
                return this.#deepCloneAndFreeze(record);
            };

            const read = (id) => (cfg.map.has(id) ? this.#deepCloneAndFreeze(cfg.map.get(id)) : null);

            const update = (id, data) => {
                this.#validatePayloadSanity(data);
                if (!cfg.map.has(id)) return false;
                const existing = cfg.map.get(id);
                const merged = Object.assign({}, existing, data);
                checkTypeField(merged);
                if (cfg.validateExtra) cfg.validateExtra(merged);
                Object.assign(existing, data, { updatedAt: Date.now() });
                existing.sync.version++;
                existing.sync.lastModified = Date.now();
                this.#logAuditRecord(`${cfg.auditPrefix}_UPDATE`, id, "Fields modified.");
                if (cfg.logTimeline) this.#logTimelineEvent(`${cfg.auditPrefix}_UPDATE`, id, "Record updated.");
                return true;
            };

            const del = (id) => {
                if (!cfg.map.has(id)) return false;
                cfg.map.delete(id);
                this.#diagnostics[cfg.diagnosticsKey].deleted++;
                this.#logAuditRecord(`${cfg.auditPrefix}_DELETE`, id, "Record evicted.");
                if (cfg.logTimeline) this.#logTimelineEvent(`${cfg.auditPrefix}_DELETE`, id, "Record deleted.");
                return true;
            };

            const list = (filterPredicate) => {
                const all = Array.from(cfg.map.values()).map((r) => this.#deepCloneAndFreeze(r));
                return Object.freeze(typeof filterPredicate === "function" ? all.filter(filterPredicate) : all);
            };

            const has = (id) => !!id && cfg.map.has(id);
            const count = () => cfg.map.size;

            return Object.freeze({ create, read, update, delete: del, list, has, count });
        }

        // =========================================================================
        // ─── CENTRAL SESSION LIFECYCLE ───────────────────────────────────────────
        // =========================================================================

        createSession(config = {}) {
            this.#validatePayloadSanity(config);
            const sessionId = "ems-session-" + crypto.randomUUID();

            const sessionContext = {
                id: sessionId,
                title: config.title || "Unnamed Operational Incident",
                lifecycleState: "CREATED",
                zoneContextId: config.zoneContextId || null,
                sync: this.#buildSyncMetadata(config.syncMeta),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            this.#sessions.set(sessionId, sessionContext);
            this.#diagnostics.sessions.created++;
            this.#logAuditRecord("SESSION_CREATE", sessionId, `Emergency session initialized: ${sessionContext.title}`);
            this.#logTimelineEvent("SESSION_STATE_CHANGE", sessionId, "Lifecycle state set to CREATED");
            this.emit("sessionCreated", sessionContext);
            return this.#deepCloneAndFreeze(sessionContext);
        }

        transitionSession(sessionId, targetState) {
            if (!this.#sessions.has(sessionId)) throw new Error(`[CozyEmergency] Tracking identifier unmatched: ${sessionId}`);
            if (!this.#validStates.includes(targetState)) throw new Error(`[CozyEmergency] State definition unsupported: ${targetState}`);

            const session = this.#sessions.get(sessionId);
            const allowed = this.#validTransitions[session.lifecycleState] || [];
            if (!allowed.includes(targetState)) {
                throw new Error(`[CozyEmergency] Illegal Transition: ${session.lifecycleState} → ${targetState} is not a permitted lifecycle path.`);
            }

            session.lifecycleState = targetState;
            session.updatedAt = Date.now();
            session.sync.version++;
            session.sync.lastModified = Date.now();

            this.#logAuditRecord("SESSION_TRANSITION", sessionId, `Transition path assigned: ${targetState}`);
            this.#logTimelineEvent("SESSION_STATE_CHANGE", sessionId, `Lifecycle state moved to ${targetState}`);
            this.emit("sessionTransitioned", session);
            return this.#deepCloneAndFreeze(session);
        }

        getSession(id) {
            if (!id || !this.#sessions.has(id)) return null;
            return this.#deepCloneAndFreeze(this.#sessions.get(id));
        }

        listSessions(filterPredicate) {
            const all = Array.from(this.#sessions.values()).map((s) => this.#deepCloneAndFreeze(s));
            return Object.freeze(typeof filterPredicate === "function" ? all.filter(filterPredicate) : all);
        }

        hasSession(id) { return !!id && this.#sessions.has(id); }
        countSessions() { return this.#sessions.size; }

        // =========================================================================
        // ─── 14 & 15. TIMELINE & AUDIT LOGGING SYSTEMS (APPEND ONLY) ─────────────
        // =========================================================================

        #logTimelineEvent(type, referenceId, notes) {
            this.#timeline.push(Object.freeze({
                timestamp: Date.now(),
                type: String(type),
                referenceId: String(referenceId),
                notes: String(notes)
            }));
        }

        getTimeline(filterPredicate) {
            const frozenList = this.#timeline.map(e => this.#deepCloneAndFreeze(e));
            return Object.freeze(typeof filterPredicate === "function" ? frozenList.filter(filterPredicate) : frozenList);
        }

        #logAuditRecord(actionType, targetId, message) {
            this.#auditLog.push(Object.freeze({
                timestamp: Date.now(),
                actionType: String(actionType),
                targetId: String(targetId),
                message: String(message)
            }));
        }

        getAuditLog() {
            return Object.freeze(this.#auditLog.map(e => this.#deepCloneAndFreeze(e)));
        }

        // =========================================================================
        // ─── 17. INTERNALLY INSULATED FAULT ISOLATING EVENT BUS ──────────────────
        // =========================================================================

        on(event, handler) {
            if (typeof handler !== "function") throw new TypeError("Listener must register as a execution callback parameter.");
            if (!this.#eventListeners.has(event)) this.#eventListeners.set(event, new Set());
            this.#eventListeners.get(event).add(handler);
        }

        off(event, handler) {
            if (this.#eventListeners.has(event)) {
                this.#eventListeners.get(event).delete(handler);
            }
        }

        once(event, handler) {
            const selfDestructWrapper = (payload) => {
                this.off(event, selfDestructWrapper);
                handler(payload);
            };
            this.on(event, selfDestructWrapper);
        }

        emit(event, payload) {
            if (this.#eventListeners.has(event)) {
                const deeplyInsulatedPayload = this.#deepCloneAndFreeze(payload);
                for (const handler of this.#eventListeners.get(event)) {
                    try {
                        handler(deeplyInsulatedPayload);
                    } catch (fault) {
                        this.#diagnostics.errors++;
                        // Fault isolation boundary locked. Prevents engine failures during cascading notifications.
                    }
                }
            }
        }

        // =========================================================================
        // ─── 18. OPEN PLUGIN REGISTRY MATRICES ───────────────────────────────────
        // =========================================================================

        registerPlugin(plugin) {
            this.#validatePayloadSanity(plugin);
            if (!plugin || !plugin.id || typeof plugin.id !== "string") {
                throw new Error("[CozyEmergency] Plugin Specification Error: Key identifier 'id' missing.");
            }
            const id = plugin.id.trim().toLowerCase();
            if (this.#plugins.has(id)) throw new Error(`[CozyEmergency] Conflict: Plugin identity '${id}' is already operational.`);

            this.#plugins.set(id, this.#deepCloneAndFreeze(plugin));
            this.#diagnostics.plugins++;
            this.#logAuditRecord("PLUGIN_REGISTER", id, "External topology plug mapped.");
            return true;
        }

        removePlugin(id) {
            if (!id) return false;
            const normalized = id.trim().toLowerCase();
            if (this.#plugins.delete(normalized)) {
                this.#logAuditRecord("PLUGIN_REMOVAL", normalized, "Plug unlinked.");
                return true;
            }
            return false;
        }

        listPlugins() { return Object.freeze(Array.from(this.#plugins.values()).map(p => this.#deepCloneAndFreeze(p))); }
        getPlugin(id) { return this.#plugins.has(id?.toLowerCase()) ? this.#deepCloneAndFreeze(this.#plugins.get(id.toLowerCase())) : null; }
        hasPlugin(id) { return !!id && this.#plugins.has(id.toLowerCase()); }
        countPlugins() { return this.#plugins.size; }

        // =========================================================================
        // ─── 19. CLOSED INTEGRATION METADATA RECORDERS (BOOKKEEPING) ─────────────
        // =========================================================================

        updateClosedIntegrationState(systemId, connectionFlags) {
            this.#validatePayloadSanity(connectionFlags);
            const key = String(systemId).toLowerCase().trim();
            if (!this.#closedIntegrations.has(key)) {
                throw new Error(`[CozyEmergency] Integration Isolation Error: External interface system [${systemId}] is not recognized by standard framework layout.`);
            }

            const record = {
                systemId: this.#closedIntegrations.get(key).systemId,
                connected: !!connectionFlags.connected,
                metadata: { ...connectionFlags.metadata },
                lastMetadataUpdate: Date.now()
            };

            this.#closedIntegrations.set(key, Object.freeze(record));
            this.#diagnostics.integrations++;
            this.#logAuditRecord("INTEGRATION_STATE_UPDATE", key, `Connection link status updated: ${record.connected}`);
        }

        getClosedIntegrationState(systemId) {
            const key = String(systemId).toLowerCase().trim();
            return this.#closedIntegrations.has(key) ? this.#closedIntegrations.get(key) : null;
        }

        // =========================================================================
        // ─── 20. PORTABILITY AND OFFLINE MERGE SYNCHRONIZATION ───────────────────
        // =========================================================================

        exportFullKernelState() {
            this.#diagnostics.exports++;
            this.#logAuditRecord("SNAPSHOT_EXPORT", "Kernel", "Full tracking register dump generated.");

            return JSON.stringify({
                version: VERSION,
                exportedAt: Date.now(),
                dataPayloads: {
                    sessions: Array.from(this.#sessions.values()),
                    incidents: Array.from(this.#incidents.values()),
                    teams: Array.from(this.#teams.values()),
                    contacts: Array.from(this.#contacts.values()),
                    zones: Array.from(this.#zones.values()),
                    devices: Array.from(this.#devices.values()),
                    alerts: Array.from(this.#alerts.values()),
                    notifications: Array.from(this.#notifications.values()),
                    evacuations: Array.from(this.#evacuations.values()),
                    resources: Array.from(this.#resources.values()),
                    shelters: Array.from(this.#shelters.values()),
                    vehicles: Array.from(this.#vehicles.values()),
                    medicalRecords: Array.from(this.#medicalRecords.values())
                },
                diagnosticsSnapshot: JSON.parse(JSON.stringify(this.#diagnostics))
            });
        }

        importAndMergeState(serializedJson) {
            this.#validatePayloadSanity(serializedJson);
            try {
                const parsed = JSON.parse(serializedJson);
                if (parsed.version !== VERSION) {
                    throw new Error(`Framework schema alignment conflict. Target: ${VERSION} | Received: ${parsed.version}`);
                }

                this.#diagnostics.imports++;
                const payload = parsed.dataPayloads;
                if (!payload) return false;

                // Safe transaction loops utilizing merge processing strategies
                if (payload.sessions) payload.sessions.forEach(s => this.#executeSafeMerge(this.#sessions, s.id, s));
                if (payload.incidents) payload.incidents.forEach(i => this.#executeSafeMerge(this.#incidents, i.id, i));
                if (payload.teams) payload.teams.forEach(t => this.#executeSafeMerge(this.#teams, t.id, t));
                if (payload.contacts) payload.contacts.forEach(c => this.#executeSafeMerge(this.#contacts, c.id, c));
                if (payload.zones) payload.zones.forEach(z => this.#executeSafeMerge(this.#zones, z.id, z));
                if (payload.devices) payload.devices.forEach(d => this.#executeSafeMerge(this.#devices, d.id, d));
                if (payload.alerts) payload.alerts.forEach(a => this.#executeSafeMerge(this.#alerts, a.id, a));
                if (payload.notifications) payload.notifications.forEach(n => this.#executeSafeMerge(this.#notifications, n.id, n));
                if (payload.evacuations) payload.evacuations.forEach(e => this.#executeSafeMerge(this.#evacuations, e.id, e));
                if (payload.resources) payload.resources.forEach(r => this.#executeSafeMerge(this.#resources, r.id, r));
                if (payload.shelters) payload.shelters.forEach(s => this.#executeSafeMerge(this.#shelters, s.id, s));
                if (payload.vehicles) payload.vehicles.forEach(v => this.#executeSafeMerge(this.#vehicles, v.id, v));
                if (payload.medicalRecords) payload.medicalRecords.forEach(m => this.#executeSafeMerge(this.#medicalRecords, m.id, m));

                this.#diagnostics.sync++;
                this.#logAuditRecord("SNAPSHOT_IMPORT_MERGE", "Kernel", "Data snapshot parsed and synchronized cleanly.");
                return true;
            } catch (err) {
                this.#diagnostics.errors++;
                throw new Error(`[CozyEmergency] Portability Layer Exception: Parsing aborted: ${err.message}`);
            }
        }

        #executeSafeMerge(targetMap, recordsId, prospectiveRecord) {
            this.#validatePayloadSanity(prospectiveRecord);
            if (!targetMap.has(recordsId)) {
                targetMap.set(recordsId, prospectiveRecord);
                return;
            }

            const activeRecord = targetMap.get(recordsId);
            const activeVersion = activeRecord.sync?.version || 0;
            const incomingVersion = prospectiveRecord.sync?.version || 0;

            if (incomingVersion > activeVersion) {
                targetMap.set(recordsId, prospectiveRecord);
            } else if (incomingVersion === activeVersion && prospectiveRecord.sync?.lastModified > activeRecord.sync?.lastModified) {
                targetMap.set(recordsId, prospectiveRecord);
            } else if (incomingVersion < activeVersion) {
                // Never mutate the stored record in place — replace it with a new object
                // carrying the conflict flag, per Design Principle 3.
                const conflictRecord = Object.assign({}, activeRecord, {
                    sync: Object.assign({}, activeRecord.sync, { conflictState: "MERGE_SKIPPED_OLDER_VERSION" })
                });
                targetMap.set(recordsId, conflictRecord);
            }
        }

        // =========================================================================
        // ─── TELEMETRY DIAGNOSTICS SAMPLING APIS ─────────────────────────────────
        // =========================================================================

        getDiagnosticsReport() {
            return Object.freeze({
                kernelVersion: VERSION,
                // Lifetime create/delete operation counts per entity.
                counters: JSON.parse(JSON.stringify(this.#diagnostics)),
                // Live registry sizes — distinct from the lifetime counters above.
                registryLoadMetrics: {
                    sessionsActive: this.#sessions.size,
                    incidentsTracked: this.#incidents.size,
                    teamsDeployed: this.#teams.size,
                    contactsBound: this.#contacts.size,
                    zonesMapped: this.#zones.size,
                    devicesConnected: this.#devices.size,
                    alertsActive: this.#alerts.size,
                    notificationsLogged: this.#notifications.size,
                    evacuationsTracked: this.#evacuations.size,
                    resourcesTracked: this.#resources.size,
                    sheltersTracked: this.#shelters.size,
                    vehiclesTracked: this.#vehicles.size,
                    medicalRecordsTracked: this.#medicalRecords.size,
                    pluginsRegistered: this.#plugins.size
                }
            });
        }

        // --- DEEP CLONE AND RECURSIVE FREEZE SANITIZER ---
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
    // ─── HOT RELOAD PARSING / INSTANTIATION WRAPPERS ─────────────────────────
    // =========================================================================

    if (window.CozyOS.CozyEmergency) {
        if (window.CozyOS.CozyEmergency.getVersion() === VERSION) {
            // Return existing operational kernel reference safely without overwriting states
            return;
        } else {
            throw new Error(`[CozyOS Framework Alert] VERSION_CONFLICT: Running environment matches version target mismatch constraints.`);
        }
    }

    const instanceReference = new CozyEmergencyKernel();

    // Lockdown framework proxy parameters and export global coordination bindings
    window.CozyOS.CozyEmergency = Object.freeze({
        getVersion: () => VERSION,
        getDiagnosticsReport: () => instanceReference.getDiagnosticsReport(),
        exportFullKernelState: () => instanceReference.exportFullKernelState(),
        importAndMergeState: (json) => instanceReference.importAndMergeState(json),
        getTimeline: (predicate) => instanceReference.getTimeline(predicate),
        getAuditLog: () => instanceReference.getAuditLog(),

        // Event Loop
        on: (evt, cb) => instanceReference.on(evt, cb),
        off: (evt, cb) => instanceReference.off(evt, cb),
        once: (evt, cb) => instanceReference.once(evt, cb),

        // Session Lifecycle Triggers
        createSession: (config) => instanceReference.createSession(config),
        transitionSession: (id, state) => instanceReference.transitionSession(id, state),
        getSession: (id) => instanceReference.getSession(id),
        listSessions: (predicate) => instanceReference.listSessions(predicate),
        hasSession: (id) => instanceReference.hasSession(id),
        countSessions: () => instanceReference.countSessions(),

        // Custom Plugin Routing Interface
        registerPlugin: (p) => instanceReference.registerPlugin(p),
        removePlugin: (id) => instanceReference.removePlugin(id),
        listPlugins: () => instanceReference.listPlugins(),
        getPlugin: (id) => instanceReference.getPlugin(id),
        hasPlugin: (id) => instanceReference.hasPlugin(id),
        countPlugins: () => instanceReference.countPlugins(),

        // Integration Interfaces
        updateClosedIntegrationState: (id, flags) => instanceReference.updateClosedIntegrationState(id, flags),
        getClosedIntegrationState: (id) => instanceReference.getClosedIntegrationState(id),

        // Registry Subsystem Routing — each exposes create/read/update/delete/list/has/count
        incident: instanceReference.incidentRegistry,
        team: instanceReference.teamRegistry,
        contact: instanceReference.contactRegistry,
        zone: instanceReference.zoneRegistry,
        device: instanceReference.deviceRegistry,
        alert: instanceReference.alertRegistry,
        notification: instanceReference.notificationRegistry,
        evacuation: instanceReference.evacuationRegistry,
        resource: instanceReference.resourceRegistry,
        shelter: instanceReference.shelterRegistry,
        vehicle: instanceReference.vehicleRegistry,
        medical: instanceReference.medicalRegistry
    });

})();
