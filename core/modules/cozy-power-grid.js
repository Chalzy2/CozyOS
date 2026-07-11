/**
 * CozyOS Enterprise Framework — CozyPowerGrid
 * File Reference: core/modules/power/cozy-power-grid.js
 * Layer: Core / Business Domain — Power Management
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   A unified software coordinator for power management during churches,
 *   conferences, schools, hospitals, emergency camps, and outdoor events.
 *   Tracks power sources (grid, battery bank, solar, generator, vehicle DC,
 *   portable station), battery/solar/generator telemetry, and independent
 *   load groups with priority-based shedding. Works fully offline.
 *
 * WHAT THIS MODULE DOES NOT DO (Zero Logic Rule)
 *   - Never switches a relay, breaker, or physical device. It only
 *     determines a PREFERRED source or load state and emits an event —
 *     any physical switching is the responsibility of hardware/firmware
 *     listening to those events.
 *   - Has no cloud dependency and no AI dependency — every method here
 *     is synchronous, local, and works fully offline.
 *   - Does not know about Bluetooth/RS485/CAN Bus/MPPT/IoT/ESP32/
 *     Raspberry Pi/Arduino/PLC protocols. Future hardware integrations
 *     feed data into this coordinator through the SAME generic methods
 *     (updateSource/updateBatteryState/updateSolarState/
 *     updateGeneratorState) any other caller already uses — no special
 *     adapter layer, no public API change required for a new protocol.
 *
 * OPTIONAL INTEGRATIONS
 *   CozyCertification — read generically for the "certificationStatus"
 *                        diagnostics field.
 *   ServiceRegistry    — registerCoordinator(), with retry if not yet
 *                        loaded (load order isn't guaranteed).
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const POWERGRID_VERSION = "1.0.0-ENTERPRISE";

    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
    const VALID_SOURCE_STATUSES = Object.freeze(["ONLINE", "OFFLINE", "STANDBY", "FAULT"]);
    const VALID_LOAD_STATUSES = Object.freeze(["ENABLED", "DISABLED"]);
    const DEFAULT_PRIORITY_ORDER = Object.freeze(["GRID", "BATTERY_BANK", "SOLAR", "GENERATOR", "EMERGENCY"]);

    class CozyOSPowerGridCoordinator {
        // ---- registries ----
        #sources = new Map();       // id -> source record
        #loadGroups = new Map();    // id -> load group record

        // ---- live state ----
        #batteryState = null;
        #solarState = null;
        #generatorState = { running: false, fuelLevel: null, runtimeMinutes: 0, faults: [], maintenanceReminder: false, lastUpdated: null };
        #priorityOrder = DEFAULT_PRIORITY_ORDER.slice();
        #activeSourceId = null;
        #criticalPowerBudgetWatts = null;
        #batteryThresholds = { low: 30, critical: 15 };

        // ---- history (all bounded) ----
        #powerHistory = [];
        #batteryHistory = [];
        #solarHistory = [];
        #generatorHistory = [];
        #warnings = [];
        #faults = [];
        #timelineEvents = [];
        #auditLogs = [];

        // ---- event bus ----
        #listeners = new Map();
        #onceWrapped = new Map();

        #diagnostics = {
            sourcesRegistered: 0, loadGroupsRegistered: 0, eventsEmitted: 0,
            warningsRaised: 0, faultsRaised: 0, errorsHidden: 0, memoryBaseline: 5.4,
            createdAt: new Date().toISOString()
        };

        getVersion() { return POWERGRID_VERSION; }

        // =====================================================================
        // ─── UTILITIES ────────────────────────────────────────────────────────
        // =====================================================================

        #deepClone(value) {
            if (typeof structuredClone === "function") {
                try { return structuredClone(value); } catch (_err) { /* fall through */ }
            }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #deepFreeze(obj) {
            if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
                Object.getOwnPropertyNames(obj).forEach((key) => this.#deepFreeze(obj[key]));
                Object.freeze(obj);
            }
            return obj;
        }

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            return `${prefix}_${raw}`;
        }

        // Merges `patch` onto a clone of `base`, rejecting __proto__/
        // constructor/prototype keys at every level — the single merge path
        // every update method routes through.
        #safeMerge(base, patch) {
            const result = this.#deepClone(base);
            if (!patch || typeof patch !== "object") return result;
            for (const key of Object.keys(patch)) {
                if (FORBIDDEN_KEYS.has(key)) continue;
                const value = patch[key];
                if (value && typeof value === "object" && !Array.isArray(value) && result[key] && typeof result[key] === "object" && !Array.isArray(result[key])) {
                    result[key] = this.#safeMerge(result[key], value);
                } else {
                    result[key] = this.#deepClone(value);
                }
            }
            return result;
        }

        #enforceValidInput(input) {
            if (input === null || typeof input !== "object" || Array.isArray(input)) {
                throw new TypeError("[PowerGrid] Input must be a plain object.");
            }
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 500) this.#timelineEvents.shift();
        }

        #logWarning(code, msg) {
            this.#warnings.push(Object.freeze({ id: this.#generateId("warn"), timestamp: new Date().toISOString(), code, msg }));
            if (this.#warnings.length > 500) this.#warnings.shift();
            this.#diagnostics.warningsRaised++;
        }

        #logFault(code, msg) {
            this.#faults.push(Object.freeze({ id: this.#generateId("fault"), timestamp: new Date().toISOString(), code, msg }));
            if (this.#faults.length > 500) this.#faults.shift();
            this.#diagnostics.faultsRaised++;
        }

        #pushPowerHistory(entry) {
            this.#powerHistory.push(Object.freeze({ timestamp: new Date().toISOString(), ...entry }));
            if (this.#powerHistory.length > 500) this.#powerHistory.shift();
        }

        // =====================================================================
        // ─── EVENT BUS (on / off / once / emit) ───────────────────────────────
        // =====================================================================

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[PowerGrid] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[PowerGrid] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[PowerGrid] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsHidden++; return false; }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            let safePayload = payload;
            try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            for (const fn of Array.from(set)) {
                try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            return true;
        }

        // =====================================================================
        // ─── POWER SOURCES ────────────────────────────────────────────────────
        // =====================================================================

        /**
         * registerSource(input)
         *   input: { name, type, status, voltage, current, estimatedRuntime,
         *   priority }. type is intentionally free-text — "Future sources"
         *   are supported without a closed enum; only status is validated
         *   against known lifecycle states.
         */
        registerSource(input = {}) {
            this.#enforceValidInput(input);
            if (typeof input.name !== "string" || !input.name.trim()) throw new Error("[PowerGrid] registerSource(): missing required field name.");
            if (typeof input.type !== "string" || !input.type.trim()) throw new Error("[PowerGrid] registerSource(): missing required field type.");
            if (input.status !== undefined && !VALID_SOURCE_STATUSES.includes(input.status)) {
                throw new Error(`[PowerGrid] registerSource(): invalid status "${input.status}". Must be one of: ${VALID_SOURCE_STATUSES.join(", ")}.`);
            }
            const id = input.id || this.#generateId("src");
            const now = new Date().toISOString();
            const { metadata, ...fields } = input;
            const record = this.#safeMerge({
                id, name: input.name, type: input.type,
                status: input.status || "OFFLINE",
                voltage: input.voltage ?? null, current: input.current ?? null,
                estimatedRuntime: input.estimatedRuntime ?? null,
                priority: input.priority ?? null,
                health: input.health ?? 100,
                lastUpdated: now, createdAt: now,
                metadata: metadata && typeof metadata === "object" ? metadata : {}
            }, fields);
            record.id = id;
            record.createdAt = now;
            record.lastUpdated = now;
            record.metadata = metadata && typeof metadata === "object" ? this.#deepClone(metadata) : {};

            this.#sources.set(id, this.#deepFreeze(record));
            this.#diagnostics.sourcesRegistered = this.#sources.size;
            this.#logAudit("SOURCE_REGISTERED", `${id} (${input.type}) registered.`);
            this.#logTimeline(`Source registered: ${input.name}`);
            this.emit("power:sourceRegistered", { id, type: input.type });
            return this.getSource(id);
        }

        /**
         * updateSource(id, patch)
         *   Detects GRID-type status transitions and emits power:gridLost /
         *   power:gridRestored automatically — the one place this
         *   coordinator infers a domain event from a plain state change,
         *   since "grid lost/restored" is exactly a GRID source's status
         *   transitioning to/from OFFLINE.
         */
        updateSource(id, patch = {}) {
            this.#enforceValidInput(patch);
            const existing = this.#sources.get(id);
            if (!existing) throw new Error(`[PowerGrid] updateSource(): no source found with id "${id}".`);
            if (patch.status !== undefined && !VALID_SOURCE_STATUSES.includes(patch.status)) {
                throw new Error(`[PowerGrid] updateSource(): invalid status "${patch.status}". Must be one of: ${VALID_SOURCE_STATUSES.join(", ")}.`);
            }
            const merged = this.#safeMerge(existing, patch);
            merged.id = id;
            merged.createdAt = existing.createdAt;
            merged.lastUpdated = new Date().toISOString();
            this.#sources.set(id, this.#deepFreeze(merged));
            this.#pushPowerHistory({ kind: "source", id, status: merged.status });
            this.#logAudit("SOURCE_UPDATED", `${id} updated.`);
            this.emit("power:sourceUpdated", { id });

            if (existing.type === "GRID" && patch.status !== undefined && patch.status !== existing.status) {
                if (patch.status === "OFFLINE" && existing.status !== "OFFLINE") {
                    this.#logWarning("GRID_LOST", `Grid source ${id} went offline.`);
                    this.emit("power:gridLost", { id });
                } else if (existing.status === "OFFLINE" && patch.status !== "OFFLINE") {
                    this.emit("power:gridRestored", { id });
                }
            }
            return this.getSource(id);
        }

        removeSource(id) {
            const existing = this.#sources.get(id);
            if (!existing) return false;
            this.#sources.delete(id);
            if (this.#activeSourceId === id) this.#activeSourceId = null;
            this.#diagnostics.sourcesRegistered = this.#sources.size;
            this.#logAudit("SOURCE_REMOVED", `${id} removed.`);
            this.emit("power:sourceRemoved", { id });
            return true;
        }

        getSource(id) {
            const record = this.#sources.get(id);
            return record ? this.#deepFreeze(this.#deepClone(record)) : null;
        }

        listSources(filter = {}) {
            let results = Array.from(this.#sources.values());
            if (filter.type) results = results.filter(s => s.type === filter.type);
            if (filter.status) results = results.filter(s => s.status === filter.status);
            return this.#deepFreeze(results.map(r => this.#deepClone(r)));
        }

        // =====================================================================
        // ─── PRIORITY / ACTIVE SOURCE ─────────────────────────────────────────
        // =====================================================================

        setPriorityOrder(order) {
            if (!Array.isArray(order) || order.some(o => typeof o !== "string")) {
                throw new TypeError("[PowerGrid] setPriorityOrder(): order must be an array of strings.");
            }
            this.#priorityOrder = order.slice();
            this.#logAudit("PRIORITY_ORDER_CHANGED", order.join(" > "));
        }

        getPriorityOrder() { return this.#priorityOrder.slice(); }

        /**
         * determinePreferredSource()
         *   Pure decision — returns the highest-priority ONLINE source's id,
         *   or null. Never switches anything physically; if the result
         *   differs from the previously active source, emits
         *   power:sourceChanged so hardware/firmware can act on it.
         */
        determinePreferredSource() {
            const online = Array.from(this.#sources.values()).filter(s => s.status === "ONLINE");
            let chosen = null;
            for (const type of this.#priorityOrder) {
                const candidate = online.find(s => s.type === type);
                if (candidate) { chosen = candidate; break; }
            }
            if (!chosen && online.length > 0) chosen = online[0];

            const newId = chosen ? chosen.id : null;
            if (newId !== this.#activeSourceId) {
                const previous = this.#activeSourceId;
                this.#activeSourceId = newId;
                this.#logAudit("SOURCE_CHANGED", `${previous || "none"} -> ${newId || "none"}`);
                this.#logTimeline(`Active source changed to ${newId || "none"}`);
                this.emit("power:sourceChanged", { previous, current: newId });
            }
            return newId;
        }

        getActiveSource() { return this.#activeSourceId ? this.getSource(this.#activeSourceId) : null; }

        // =====================================================================
        // ─── BATTERY MANAGEMENT ───────────────────────────────────────────────
        // =====================================================================

        setBatteryThresholds({ low, critical } = {}) {
            if (low !== undefined) {
                if (typeof low !== "number" || low < 0 || low > 100) throw new TypeError("[PowerGrid] setBatteryThresholds(): low must be 0-100.");
                this.#batteryThresholds.low = low;
            }
            if (critical !== undefined) {
                if (typeof critical !== "number" || critical < 0 || critical > 100) throw new TypeError("[PowerGrid] setBatteryThresholds(): critical must be 0-100.");
                this.#batteryThresholds.critical = critical;
            }
        }

        getBatteryThresholds() { return { ...this.#batteryThresholds }; }

        /**
         * updateBatteryState(patch)
         *   patch: { voltage, current, capacity, temperature, chargePercent,
         *   healthPercent, cycleCount, chargingState: "CHARGING"|
         *   "DISCHARGING"|"IDLE" }. Computes a rough runtime estimate,
         *   raises power:batteryLow / power:batteryCritical when crossing
         *   configured thresholds (never re-fires while already below), and
         *   auto-sheds loads if a critical power budget is configured.
         */
        updateBatteryState(patch = {}) {
            this.#enforceValidInput(patch);
            const previous = this.#batteryState;
            const base = previous || {
                voltage: null, current: null, capacity: null, temperature: null,
                chargePercent: null, healthPercent: null, cycleCount: 0,
                chargingState: "IDLE", runtimeEstimateMinutes: null
            };
            const merged = this.#safeMerge(base, patch);
            merged.lastUpdated = new Date().toISOString();

            if (typeof merged.capacity === "number" && typeof merged.current === "number" && merged.current > 0 && merged.chargingState === "DISCHARGING") {
                merged.runtimeEstimateMinutes = Math.round(((merged.capacity * (merged.chargePercent ?? 100) / 100) / merged.current) * 60);
            }

            this.#batteryState = this.#deepFreeze(merged);
            this.#batteryHistory.push(Object.freeze({ timestamp: merged.lastUpdated, chargePercent: merged.chargePercent, voltage: merged.voltage, chargingState: merged.chargingState }));
            if (this.#batteryHistory.length > 500) this.#batteryHistory.shift();
            this.emit("power:batteryUpdated", { chargePercent: merged.chargePercent });

            const prevPct = previous ? previous.chargePercent : null;
            const pct = merged.chargePercent;
            if (typeof pct === "number") {
                const wasBelowCritical = typeof prevPct === "number" && prevPct <= this.#batteryThresholds.critical;
                const wasBelowLow = typeof prevPct === "number" && prevPct <= this.#batteryThresholds.low;
                if (pct <= this.#batteryThresholds.critical && !wasBelowCritical) {
                    this.#logFault("BATTERY_CRITICAL", `Battery at ${pct}% (critical threshold ${this.#batteryThresholds.critical}%).`);
                    this.emit("power:batteryCritical", { chargePercent: pct });
                    if (this.#criticalPowerBudgetWatts !== null) this.autoShedLoads(this.#criticalPowerBudgetWatts);
                } else if (pct <= this.#batteryThresholds.low && !wasBelowLow) {
                    this.#logWarning("BATTERY_LOW", `Battery at ${pct}% (low threshold ${this.#batteryThresholds.low}%).`);
                    this.emit("power:batteryLow", { chargePercent: pct });
                }
            }
            return this.getBatteryState();
        }

        getBatteryState() { return this.#batteryState ? this.#deepClone(this.#batteryState) : null; }
        getBatteryHistory(predicate) {
            const list = this.#batteryHistory.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // =====================================================================
        // ─── SOLAR MANAGEMENT ─────────────────────────────────────────────────
        // =====================================================================

        /**
         * updateSolarState(patch)
         *   patch: { voltage, current, watts, controllerStatus,
         *   todayEnergyWh, totalEnergyWh, estimatedChargingTimeMinutes }.
         *   Emits power:solarConnected the moment watts transitions from
         *   0/null to a positive value.
         */
        updateSolarState(patch = {}) {
            this.#enforceValidInput(patch);
            const previous = this.#solarState;
            const base = previous || {
                voltage: null, current: null, watts: null, controllerStatus: null,
                todayEnergyWh: 0, totalEnergyWh: 0, estimatedChargingTimeMinutes: null
            };
            const merged = this.#safeMerge(base, patch);
            merged.lastUpdated = new Date().toISOString();
            this.#solarState = this.#deepFreeze(merged);
            this.#solarHistory.push(Object.freeze({ timestamp: merged.lastUpdated, watts: merged.watts, todayEnergyWh: merged.todayEnergyWh }));
            if (this.#solarHistory.length > 500) this.#solarHistory.shift();
            this.emit("power:solarUpdated", { watts: merged.watts });

            const previouslyProducing = previous && typeof previous.watts === "number" && previous.watts > 0;
            const nowProducing = typeof merged.watts === "number" && merged.watts > 0;
            if (nowProducing && !previouslyProducing) {
                this.#logTimeline("Solar connected / producing power.");
                this.emit("power:solarConnected", { watts: merged.watts });
            }
            return this.getSolarState();
        }

        getSolarState() { return this.#solarState ? this.#deepClone(this.#solarState) : null; }
        getSolarHistory(predicate) {
            const list = this.#solarHistory.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // =====================================================================
        // ─── GENERATOR ────────────────────────────────────────────────────────
        // =====================================================================

        startGenerator(meta = {}) {
            this.#enforceValidInput(meta);
            const merged = this.#safeMerge(this.#generatorState, meta);
            merged.running = true;
            merged.lastUpdated = new Date().toISOString();
            this.#generatorState = this.#deepFreeze(merged);
            this.#generatorHistory.push(Object.freeze({ timestamp: merged.lastUpdated, event: "STARTED" }));
            if (this.#generatorHistory.length > 500) this.#generatorHistory.shift();
            this.#logAudit("GENERATOR_STARTED", "Generator started.");
            this.emit("power:generatorStarted", {});
            return this.getGeneratorState();
        }

        stopGenerator(meta = {}) {
            this.#enforceValidInput(meta);
            const merged = this.#safeMerge(this.#generatorState, meta);
            merged.running = false;
            merged.lastUpdated = new Date().toISOString();
            this.#generatorState = this.#deepFreeze(merged);
            this.#generatorHistory.push(Object.freeze({ timestamp: merged.lastUpdated, event: "STOPPED" }));
            if (this.#generatorHistory.length > 500) this.#generatorHistory.shift();
            this.#logAudit("GENERATOR_STOPPED", "Generator stopped.");
            this.emit("power:generatorStopped", {});
            return this.getGeneratorState();
        }

        /**
         * updateGeneratorState(patch)
         *   patch: { fuelLevel, runtimeMinutes, faults, maintenanceReminder }.
         *   Does not start/stop the generator (use startGenerator/
         *   stopGenerator for that) — this updates telemetry only.
         */
        updateGeneratorState(patch = {}) {
            this.#enforceValidInput(patch);
            const merged = this.#safeMerge(this.#generatorState, patch);
            merged.lastUpdated = new Date().toISOString();
            this.#generatorState = this.#deepFreeze(merged);
            this.emit("power:generatorUpdated", { fuelLevel: merged.fuelLevel });
            if (Array.isArray(patch.faults) && patch.faults.length > 0) {
                for (const fault of patch.faults) this.#logFault("GENERATOR_FAULT", String(fault));
            }
            return this.getGeneratorState();
        }

        getGeneratorState() { return this.#deepClone(this.#generatorState); }
        getGeneratorHistory(predicate) {
            const list = this.#generatorHistory.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // =====================================================================
        // ─── LOAD GROUPS ──────────────────────────────────────────────────────
        // =====================================================================

        createLoadGroup(input = {}) {
            this.#enforceValidInput(input);
            if (typeof input.name !== "string" || !input.name.trim()) throw new Error("[PowerGrid] createLoadGroup(): missing required field name.");
            const id = input.id || this.#generateId("load");
            const now = new Date().toISOString();
            const record = this.#safeMerge({
                id, name: input.name,
                priority: input.priority ?? 0,
                powerUsageWatts: input.powerUsageWatts ?? 0,
                status: input.status || "ENABLED",
                createdAt: now, lastUpdated: now
            }, input);
            record.id = id;
            record.createdAt = now;
            record.lastUpdated = now;
            if (!VALID_LOAD_STATUSES.includes(record.status)) throw new Error(`[PowerGrid] createLoadGroup(): invalid status "${record.status}".`);
            this.#loadGroups.set(id, this.#deepFreeze(record));
            this.#diagnostics.loadGroupsRegistered = this.#loadGroups.size;
            this.#logAudit("LOAD_GROUP_CREATED", `${id} (${input.name}) created.`);
            this.emit("power:loadGroupCreated", { id });
            return this.getLoadGroup(id);
        }

        updateLoadGroup(id, patch = {}) {
            this.#enforceValidInput(patch);
            const existing = this.#loadGroups.get(id);
            if (!existing) throw new Error(`[PowerGrid] updateLoadGroup(): no load group found with id "${id}".`);
            if (patch.status !== undefined && !VALID_LOAD_STATUSES.includes(patch.status)) {
                throw new Error(`[PowerGrid] updateLoadGroup(): invalid status "${patch.status}".`);
            }
            const merged = this.#safeMerge(existing, patch);
            merged.id = id;
            merged.createdAt = existing.createdAt;
            merged.lastUpdated = new Date().toISOString();
            this.#loadGroups.set(id, this.#deepFreeze(merged));
            this.#logAudit("LOAD_GROUP_UPDATED", `${id} updated.`);
            this.emit("power:loadGroupUpdated", { id });
            return this.getLoadGroup(id);
        }

        enableLoad(id) {
            const existing = this.#loadGroups.get(id);
            if (!existing) throw new Error(`[PowerGrid] enableLoad(): no load group found with id "${id}".`);
            if (existing.status === "ENABLED") return this.getLoadGroup(id);
            const merged = this.#deepClone(existing);
            merged.status = "ENABLED";
            merged.lastUpdated = new Date().toISOString();
            this.#loadGroups.set(id, this.#deepFreeze(merged));
            this.#logAudit("LOAD_ENABLED", `${id} enabled.`);
            this.emit("power:loadEnabled", { id });
            return this.getLoadGroup(id);
        }

        disableLoad(id, reason = null) {
            const existing = this.#loadGroups.get(id);
            if (!existing) throw new Error(`[PowerGrid] disableLoad(): no load group found with id "${id}".`);
            if (existing.status === "DISABLED") return this.getLoadGroup(id);
            const merged = this.#deepClone(existing);
            merged.status = "DISABLED";
            merged.lastUpdated = new Date().toISOString();
            this.#loadGroups.set(id, this.#deepFreeze(merged));
            this.#logAudit("LOAD_DISABLED", `${id} disabled.${reason ? ` Reason: ${reason}` : ""}`);
            this.emit("power:loadDisabled", { id, reason });
            return this.getLoadGroup(id);
        }

        getLoadGroup(id) {
            const record = this.#loadGroups.get(id);
            return record ? this.#deepFreeze(this.#deepClone(record)) : null;
        }

        listLoadGroups(filter = {}) {
            let results = Array.from(this.#loadGroups.values());
            if (filter.status) results = results.filter(l => l.status === filter.status);
            return this.#deepFreeze(results.map(r => this.#deepClone(r)));
        }

        setCriticalPowerBudget(watts) {
            if (watts !== null && (typeof watts !== "number" || watts < 0)) throw new TypeError("[PowerGrid] setCriticalPowerBudget(): watts must be a non-negative number or null.");
            this.#criticalPowerBudgetWatts = watts;
        }

        getCriticalPowerBudget() { return this.#criticalPowerBudgetWatts; }

        /**
         * autoShedLoads(availableWatts)
         *   Pure decision: disables the lowest-priority ENABLED load groups
         *   until total usage fits availableWatts (or nothing is left to
         *   shed). Never touches hardware — disableLoad() only records
         *   state and emits power:loadDisabled.
         */
        autoShedLoads(availableWatts) {
            if (typeof availableWatts !== "number" || availableWatts < 0) throw new TypeError("[PowerGrid] autoShedLoads(): availableWatts must be a non-negative number.");
            const enabled = Array.from(this.#loadGroups.values()).filter(l => l.status === "ENABLED").sort((a, b) => a.priority - b.priority);
            let totalUsage = enabled.reduce((sum, l) => sum + (l.powerUsageWatts || 0), 0);
            const shed = [];
            for (const group of enabled) {
                if (totalUsage <= availableWatts) break;
                this.disableLoad(group.id, "Automatic load shedding — insufficient available power.");
                totalUsage -= (group.powerUsageWatts || 0);
                shed.push(group.id);
            }
            this.#logAudit("AUTO_SHED", `Shed ${shed.length} load group(s) to fit ${availableWatts}W budget.`);
            return shed;
        }

        // =====================================================================
        // ─── HISTORY / DIAGNOSTICS ────────────────────────────────────────────
        // =====================================================================

        getPowerHistory(predicate) {
            const list = this.#powerHistory.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getWarnings(predicate) {
            const list = this.#warnings.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getFaults(predicate) {
            const list = this.#faults.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getTimeline(predicate) {
            const list = this.#timelineEvents.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(POWERGRID_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            let certificationStatus = "Unknown — CozyCertification not connected";
            let integrationCount = 0;
            if (window.CozyOS.Certification && typeof window.CozyOS.Certification.getWorkspaceSummary === "function") {
                integrationCount++;
                try {
                    const summary = window.CozyOS.Certification.getWorkspaceSummary("PowerGrid");
                    certificationStatus = summary && summary.certification ? summary.certification : "NOT_CERTIFIED";
                } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            if (window.CozyOS.ServiceRegistry) integrationCount++;

            return this.#deepFreeze(this.#deepClone({
                ...this.#diagnostics,
                moduleVersion: POWERGRID_VERSION,
                dependencies: [
                    { name: "CozyCertification", required: false, purpose: "Certification status in diagnostics" },
                    { name: "ServiceRegistry", required: false, purpose: "Coordinator catalog registration" }
                ],
                integrationCount,
                sourceCount: this.#sources.size,
                loadGroupCount: this.#loadGroups.size,
                activeSourceId: this.#activeSourceId,
                batteryChargePercent: this.#batteryState ? this.#batteryState.chargePercent : null,
                generatorRunning: this.#generatorState.running,
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length,
                warningCount: this.#warnings.length,
                faultCount: this.#faults.length,
                certificationStatus
            }));
        }

        // =====================================================================
        // ─── EXPORT / IMPORT SNAPSHOT ─────────────────────────────────────────
        // =====================================================================

        exportSnapshot() {
            return this.#deepFreeze(this.#deepClone({
                version: POWERGRID_VERSION,
                exportedAt: new Date().toISOString(),
                sources: Array.from(this.#sources.values()),
                loadGroups: Array.from(this.#loadGroups.values()),
                batteryState: this.#batteryState,
                solarState: this.#solarState,
                generatorState: this.#generatorState,
                priorityOrder: this.#priorityOrder,
                powerHistory: this.#powerHistory,
                batteryHistory: this.#batteryHistory,
                solarHistory: this.#solarHistory,
                generatorHistory: this.#generatorHistory,
                warnings: this.#warnings,
                faults: this.#faults
            }));
        }

        /**
         * importSnapshot(snapshot, { mergeStrategy })
         *   mergeStrategy: "merge" (default — keep-latest-lastUpdated on
         *   conflict) or "replace" (wipe every registry/state/history first).
         */
        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[PowerGrid] importSnapshot(): snapshot must be an object.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") {
                throw new TypeError('[PowerGrid] importSnapshot(): mergeStrategy must be "merge" or "replace".');
            }
            if (mergeStrategy === "replace") {
                this.#sources.clear();
                this.#loadGroups.clear();
                this.#powerHistory.length = 0;
                this.#batteryHistory.length = 0;
                this.#solarHistory.length = 0;
                this.#generatorHistory.length = 0;
                this.#warnings.length = 0;
                this.#faults.length = 0;
                this.#batteryState = null;
                this.#solarState = null;
            }

            let imported = 0, skipped = 0;
            for (const incoming of (snapshot.sources || [])) {
                if (!incoming || typeof incoming.id !== "string") { skipped++; continue; }
                const existing = this.#sources.get(incoming.id);
                if (existing && mergeStrategy === "merge" && new Date(incoming.lastUpdated || 0) <= new Date(existing.lastUpdated || 0)) { skipped++; continue; }
                this.#sources.set(incoming.id, this.#deepFreeze(this.#deepClone(incoming)));
                imported++;
            }
            for (const incoming of (snapshot.loadGroups || [])) {
                if (!incoming || typeof incoming.id !== "string") { skipped++; continue; }
                const existing = this.#loadGroups.get(incoming.id);
                if (existing && mergeStrategy === "merge" && new Date(incoming.lastUpdated || 0) <= new Date(existing.lastUpdated || 0)) { skipped++; continue; }
                this.#loadGroups.set(incoming.id, this.#deepFreeze(this.#deepClone(incoming)));
                imported++;
            }
            if (snapshot.batteryState && (mergeStrategy === "replace" || !this.#batteryState)) this.#batteryState = this.#deepFreeze(this.#deepClone(snapshot.batteryState));
            if (snapshot.solarState && (mergeStrategy === "replace" || !this.#solarState)) this.#solarState = this.#deepFreeze(this.#deepClone(snapshot.solarState));
            if (snapshot.generatorState) this.#generatorState = this.#deepFreeze(this.#deepClone(snapshot.generatorState));
            if (Array.isArray(snapshot.priorityOrder)) this.#priorityOrder = snapshot.priorityOrder.slice();

            this.#diagnostics.sourcesRegistered = this.#sources.size;
            this.#diagnostics.loadGroupsRegistered = this.#loadGroups.size;
            this.#logAudit("SNAPSHOT_IMPORTED", `${imported} record(s) imported, ${skipped} skipped (strategy: ${mergeStrategy}).`);
            this.emit("power:snapshotImported", { imported, skipped, mergeStrategy });
            return { imported, skipped };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === POWERGRID_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.PowerGrid && typeof window.CozyOS.PowerGrid.getVersion === "function") {
        const existingVersion = window.CozyOS.PowerGrid.getVersion();
        if (existingVersion !== POWERGRID_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: PowerGrid existing v${existingVersion} conflicts with load target v${POWERGRID_VERSION}.`);
        }
        return;
    }

    window.CozyOS.PowerGrid = new CozyOSPowerGridCoordinator();

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
        name: "PowerGrid", category: "Business Domain", icon: "power.svg",
        description: "CozyPowerGrid — unified offline power management for grid/battery/solar/generator sources and priority-based load groups. Never switches hardware directly; only decides and emits events."
    });
})();
