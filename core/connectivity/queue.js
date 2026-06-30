/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── TRANSACTIONS QUEUE KERNEL MODULE
 * FILE: core/connectivity/queue.js
 * VERSION: 1.1.1-CORE (v2.4.1 Engine Contract Alignment — Stabilization Pass)
 *
 * NOTE: Hardening/alignment pass on top of the frozen 1.0.0-CORE queue.
 * Class name, constructor, and all existing public methods are unchanged.
 * No business logic, retry semantics, or memory-only behavior altered.
 */

"use strict";

export class UniversalQueue {
    constructor(kernel) {
        this.kernel = kernel;
        this.tasksMemoryMap = [];
        this.maxRetryLimit = 5;

        // Lightweight, additive, in-memory statistics. Not persisted —
        // consistent with the existing memory-only queue behavior.
        this._statistics = {
            totalQueued: 0,
            totalDeadLetters: 0,
            totalRetries: 0
        };
    }

    /**
     * Inserts a transaction envelope into the queue. Accepts the standard
     * CozyOS v2.4.1 engine contract: { route, authContext, payload }.
     * Validates the envelope before insertion and de-dupes against any
     * existing still-QUEUED item with an identical checksum.
     *
     * Returns the full queued object (per v2.4.1 hardening requirements).
     * `queuedItem.taskId` remains present for callers that only read
     * `.taskId` off the result. Legacy callers expecting a bare taskId
     * string should use push() below instead.
     */
    async insert(transaction) {
        const start = performance.now();

        const envelope = this._validateEnvelope(transaction);

        const checksum = this._generateChecksumSignature(envelope);

        // Duplicate detection: if an identical, still-QUEUED transaction
        // already exists, return that existing item instead of creating a
        // second copy.
        const existing = this.tasksMemoryMap.find(
            (t) => t.checksum === checksum && t.status === "QUEUED"
        );
        if (existing) {
            return existing;
        }

        const queuedItem = {
            taskId: `task_cuck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            priority: (envelope.payload && envelope.payload.priority) || "NORMAL",
            retryCount: 0,
            route: envelope.route,
            authContext: envelope.authContext,
            payload: envelope.payload,
            status: "QUEUED",
            checksum: checksum,
            failures: []
        };

        this.tasksMemoryMap.push(queuedItem);
        this._statistics.totalQueued++;

        // Request structural snapshot mutation commit
        if (this.kernel?.scheduler?.flagDirtyState) {
            this.kernel.scheduler.flagDirtyState();
        }

        const insertionLatency = performance.now() - start;
        if (this.kernel?.metrics?.trackQueueInsertionTime) {
            this.kernel.metrics.trackQueueInsertionTime(insertionLatency);
        }

        return queuedItem;
    }

    async getFetchableTasks() {
        return this.tasksMemoryMap.filter(t => t.status === "QUEUED" && t.retryCount < this.maxRetryLimit);
    }

    async evict(taskId) {
        this.tasksMemoryMap = this.tasksMemoryMap.filter(t => t.taskId !== taskId);
        if (this.kernel?.scheduler?.flagDirtyState) {
            this.kernel.scheduler.flagDirtyState();
        }
        console.log(`✓ [UNIVERSAL QUEUE] Transaction item evicted following processing: ${taskId}`);
    }

    async incrementFailureCount(taskId, errorMessage) {
        const targetItem = this.tasksMemoryMap.find(t => t.taskId === taskId);
        if (targetItem) {
            targetItem.retryCount++;
            this._statistics.totalRetries++;
            targetItem.failures.push({ time: Date.now(), reason: errorMessage });
            if (targetItem.retryCount >= this.maxRetryLimit) {
                targetItem.status = "DEAD_LETTER_HOLD";
                this._statistics.totalDeadLetters++;
                console.error(`🔒 [UNIVERSAL QUEUE] Critical item delivery exhaustion. Moved to DLH structure: ${taskId}`);
            }
            if (this.kernel?.scheduler?.flagDirtyState) {
                this.kernel.scheduler.flagDirtyState();
            }
        }
    }

    // ── Additive helper methods (do not change existing API surface) ───

    /**
     * Returns the queued item for a given taskId without mutating state,
     * or null if not found.
     */
    peek(taskId) {
        return this.tasksMemoryMap.find((t) => t.taskId === taskId) || null;
    }

    /**
     * Returns true if a queued item with the given taskId currently exists.
     */
    exists(taskId) {
        return this.tasksMemoryMap.some((t) => t.taskId === taskId);
    }

    /**
     * Returns the total number of items currently held in memory,
     * regardless of status (QUEUED, DEAD_LETTER_HOLD, etc).
     */
    count() {
        return this.tasksMemoryMap.length;
    }

    /**
     * Clears the entire in-memory queue. Memory-only operation — does not
     * touch storage/persistence (none exists in this module). Flags the
     * scheduler dirty state, consistent with other mutating operations.
     */
    clear() {
        this.tasksMemoryMap = [];
        if (this.kernel?.scheduler?.flagDirtyState) {
            this.kernel.scheduler.flagDirtyState();
        }
    }

    /**
     * Returns all items currently in DEAD_LETTER_HOLD status.
     */
    getDeadLetterQueue() {
        return this.tasksMemoryMap.filter((t) => t.status === "DEAD_LETTER_HOLD");
    }

    /**
     * Returns lightweight, additive queue statistics. Counters are
     * cumulative for the lifetime of this in-memory instance (not reset on
     * eviction), consistent with memory-only, non-persisted behavior.
     */
    getStatistics() {
        return {
            totalQueued: this._statistics.totalQueued,
            totalDeadLetters: this._statistics.totalDeadLetters,
            totalRetries: this._statistics.totalRetries,
            currentQueueLength: this.tasksMemoryMap.length
        };
    }

    // ── Backward-compatible aliases for OfflineCoordinator and other
    //    callers still using the pre-v1.1.0 queue method names. ─────────

    /**
     * Alias for insert(), kept for legacy callers using `queue.push(...)`.
     * Unlike insert() (which now returns the full queued object per the
     * v2.4.1 hardening pass), push() resolves to the bare taskId string —
     * matching what the original insert() returned and what existing
     * OfflineCoordinator call sites expect.
     */
    async push(transaction) {
        const queuedItem = await this.insert(transaction);
        return queuedItem.taskId;
    }

    /**
     * Drains all currently fetchable (QUEUED, under retry limit) tasks by
     * routing each through the kernel's SmartRouter, evicting on success
     * and recording a failure (with existing retry/DLH semantics) on
     * error. Defensive-checks router availability; does not change retry
     * limits, DEAD_LETTER_HOLD transitions, or any other existing logic.
     */
    async flushAll() {
        const tasks = await this.getFetchableTasks();

        for (const task of tasks) {
            try {
                if (this.kernel?.router?.route) {
                    await this.kernel.router.route({
                        route: task.route,
                        authContext: task.authContext,
                        payload: task.payload
                    });
                    await this.evict(task.taskId);
                }
            } catch (err) {
                await this.incrementFailureCount(task.taskId, err.message);
            }
        }

        return true;
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /**
     * Validates and normalizes an incoming transaction into the standard
     * CozyOS v2.4.1 engine contract: { route, authContext, payload }.
     * Throws descriptive errors on invalid input; does not rely on legacy
     * action/auth fields.
     */
    _validateEnvelope(transaction) {
        if (transaction === null || transaction === undefined) {
            throw new TypeError("[UNIVERSAL QUEUE] Insertion rejected: transaction envelope cannot be null or undefined.");
        }
        if (typeof transaction !== "object") {
            throw new TypeError("[UNIVERSAL QUEUE] Insertion rejected: transaction envelope must be an object.");
        }

        const route = transaction.route;
        if (!route || typeof route !== "string") {
            throw new Error("[UNIVERSAL QUEUE] Insertion rejected: transaction envelope is missing a valid string 'route'.");
        }

        const payload = transaction.payload !== undefined ? transaction.payload : {};
        if (typeof payload !== "object" || payload === null) {
            throw new TypeError("[UNIVERSAL QUEUE] Insertion rejected: transaction envelope 'payload' must be an object.");
        }

        const authContext = transaction.authContext !== undefined ? transaction.authContext : null;

        return {
            route: route.trim(),
            authContext,
            payload
        };
    }

    /**
     * Deterministic checksum generation over the normalized envelope.
     * Keys are serialized in an explicit, fixed order (route, authContext,
     * payload) so that two structurally identical envelopes always produce
     * an identical checksum regardless of property insertion order on the
     * original object passed to insert().
     */
    _generateChecksumSignature(envelope) {
        const normalized = {
            route: envelope.route,
            authContext: envelope.authContext === undefined ? null : envelope.authContext,
            payload: this._sortObjectKeysDeep(envelope.payload)
        };
        const jsonStr = JSON.stringify(normalized);
        let hashValue = 0;
        for (let idx = 0; idx < jsonStr.length; idx++) {
            hashValue = (hashValue << 5) - hashValue + jsonStr.charCodeAt(idx);
            hashValue |= 0;
        }
        return `crc-${hashValue.toString(16)}`;
    }

    /**
     * Recursively sorts object keys so JSON.stringify produces a stable,
     * order-independent representation. Arrays are preserved in original
     * order (order is semantically meaningful for arrays); only plain
     * object key order is normalized.
     */
    _sortObjectKeysDeep(value) {
        if (Array.isArray(value)) {
            return value.map((v) => this._sortObjectKeysDeep(v));
        }
        if (value && typeof value === "object") {
            const sortedKeys = Object.keys(value).sort();
            const result = {};
            for (const key of sortedKeys) {
                result[key] = this._sortObjectKeysDeep(value[key]);
            }
            return result;
        }
        return value;
    }
}
