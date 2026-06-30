/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── CRASH PERSISTENCE REHYDRATION ENGINE
 * FILE: core/connectivity/recovery.js
 * VERSION: 1.1.0-CORE (v2.4.1 Engine Architecture Alignment — Stabilization Pass)
 *
 * NOTE: Hardening/alignment pass on top of the frozen 1.0.0-CORE recovery
 * engine. Class name, constructor, file path, exports, and the public
 * rehydrateKernelState() method signature/behavior are unchanged. Routing,
 * queue processing, offline, cache, and scheduler behavior are untouched —
 * this module only restores queue.tasksMemoryMap from storage on boot.
 */

"use strict";

export class RecoveryEngine {
    constructor(kernel) {
        this.kernel = kernel;

        // Lightweight, additive, in-memory recovery diagnostics. Reset
        // each time rehydrateKernelState() runs (i.e. once per boot in
        // normal operation).
        this._statistics = {
            recoveredCount: 0,
            skippedCount: 0,
            lastRecoveryTime: null,
            lastRecoveryError: null
        };
    }

    /**
     * Public method, signature and behavior unchanged: inspects local
     * storage for an uncommitted-transaction snapshot and, if found,
     * restores it into kernel.queue.tasksMemoryMap. On any failure or
     * absence of usable storage, the existing in-memory queue contents are
     * preserved exactly as they were (never cleared, never crashed).
     */
    async rehydrateKernelState() {
        console.log("► [RECOVERY ENGINE] Inspecting storage segments for uncommitted transactions...");

        this._statistics.recoveredCount = 0;
        this._statistics.skippedCount = 0;
        this._statistics.lastRecoveryError = null;

        const storage = this._resolveStorageService();
        if (!storage) {
            console.log("ℹ️ [RECOVERY ENGINE] No storage service available — skipping rehydration, existing queue state preserved.");
            this._statistics.lastRecoveryTime = Date.now();
            return;
        }

        try {
            const structuralRecords = await this._loadPersistedState(storage);
            if (!structuralRecords) {
                console.log("ℹ️ [RECOVERY ENGINE] No persisted connectivity state found — starting from current in-memory queue.");
                this._statistics.lastRecoveryTime = Date.now();
                return;
            }

            if (!structuralRecords.tasks || !Array.isArray(structuralRecords.tasks)) {
                console.log("ℹ️ [RECOVERY ENGINE] Persisted state contained no task array — nothing to rehydrate.");
                this._statistics.lastRecoveryTime = Date.now();
                return;
            }

            this._applyRecoveredTasks(structuralRecords.tasks);
            this._statistics.lastRecoveryTime = Date.now();
        } catch (err) {
            // Recovery failures must never crash boot or wipe the existing
            // queue: log the anomaly, record it for diagnostics, and leave
            // kernel.queue.tasksMemoryMap exactly as it was.
            this._statistics.lastRecoveryError = err && err.message ? err.message : String(err);
            this._statistics.lastRecoveryTime = Date.now();
            console.warn("[RECOVERY REHYDRATION ANOMALY] System states blank, initiating baseline configuration allocations.", err && err.message);
        }
    }

    /**
     * Additive diagnostics accessor. Returns a snapshot of recovery
     * statistics from the most recent rehydrateKernelState() run.
     */
    getRecoveryStatus() {
        return {
            recoveredCount: this._statistics.recoveredCount,
            skippedCount: this._statistics.skippedCount,
            lastRecoveryTime: this._statistics.lastRecoveryTime,
            lastRecoveryError: this._statistics.lastRecoveryError
        };
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /**
     * Resolves the storage service defensively. Returns null if neither
     * the primary nor fallback storage namespace is available.
     */
    _resolveStorageService() {
        const storage = window.CozyOS?.Storage || window.CozyStorage;
        if (!storage) return null;
        return storage;
    }

    /**
     * Loads the persisted connectivity state, preferring
     * storage.loadModuleData() when available (and supporting its
     * possibly-different response shape), falling back to storage.find()
     * exactly as the original implementation did. Returns the structural
     * records object, or null if nothing usable was found.
     */
    async _loadPersistedState(storage) {
        if (typeof storage.loadModuleData === "function") {
            try {
                const moduleData = await storage.loadModuleData("system_connectivity_state", { LocalID: "cuck_state_vector" });
                const records = this._extractRecordsFromResponse(moduleData);
                if (records) return records;
                // Fall through to storage.find() if loadModuleData() returned
                // nothing usable — do not assume it is the only valid path.
            } catch (err) {
                console.warn("[RECOVERY ENGINE] storage.loadModuleData() failed, falling back to storage.find().", err && err.message);
            }
        }

        if (typeof storage.find === "function") {
            const hydratedPayload = await storage.find("system_connectivity_state", { LocalID: "cuck_state_vector" });
            return this._extractRecordsFromResponse(hydratedPayload);
        }

        console.warn("[RECOVERY ENGINE] Storage service exposes neither loadModuleData() nor find() — cannot rehydrate.");
        return null;
    }

    /**
     * Normalizes a storage response into a single structural-records
     * object, defensively handling either an array-of-results shape
     * (legacy storage.find() behavior, first element used) or a
     * single-object shape (possible storage.loadModuleData() behavior).
     */
    _extractRecordsFromResponse(response) {
        if (!response) return null;
        if (Array.isArray(response)) {
            return response.length > 0 ? response[0] : null;
        }
        if (typeof response === "object") {
            return response;
        }
        return null;
    }

    /**
     * Validates each recovered task record before assigning it into
     * kernel.queue.tasksMemoryMap. Malformed items are skipped (counted,
     * logged) rather than allowed to crash recovery or corrupt the queue.
     * If kernel.queue is unavailable, the recovered tasks are discarded
     * defensively and the existing (absent) queue state is left untouched.
     */
    _applyRecoveredTasks(tasks) {
        if (!this.kernel?.queue) {
            console.warn("[RECOVERY ENGINE] kernel.queue is unavailable — cannot apply recovered tasks, skipping rehydration.");
            this._statistics.skippedCount += tasks.length;
            return;
        }

        const validTasks = [];
        for (const task of tasks) {
            if (this._isValidQueueRecord(task)) {
                validTasks.push(task);
                this._statistics.recoveredCount++;
            } else {
                this._statistics.skippedCount++;
                console.warn("[RECOVERY ENGINE] Skipped malformed queue record during rehydration:", task);
            }
        }

        // Preserve existing queue contents if nothing valid was recovered,
        // rather than overwriting with an empty array.
        if (validTasks.length === 0 && tasks.length > 0) {
            console.warn("[RECOVERY ENGINE] All recovered queue records were malformed — existing in-memory queue state preserved.");
            return;
        }

        this.kernel.queue.tasksMemoryMap = validTasks;
        console.log(`✓ [RECOVERY MODULE] Rehydrated [${validTasks.length}] uncommitted transaction(s) from local non-volatile storage blocks.`);
    }

    /**
     * Minimal structural validation for a queue record before it is
     * trusted enough to enter kernel.queue.tasksMemoryMap. Mirrors the
     * shape produced by UniversalQueue.insert() (taskId, route, status)
     * without depending on queue.js internals or re-implementing its
     * business logic.
     */
    _isValidQueueRecord(task) {
        if (!task || typeof task !== "object") return false;
        if (!task.taskId || typeof task.taskId !== "string") return false;
        if (!task.status || typeof task.status !== "string") return false;
        // route is the v2.4.1-contract field; tolerate its absence on
        // older persisted records rather than discarding them outright,
        // since this module must not redesign or enforce queue.js's own
        // validation rules — only screen out structurally broken entries.
        if (task.route !== undefined && typeof task.route !== "string") return false;
        return true;
    }
            }
