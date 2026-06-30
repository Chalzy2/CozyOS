/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── DELTA SYNCHRONIZATION ENGINE
 * FILE: core/connectivity/sync.js
 * VERSION: 1.1.0-CORE (v2.4.1 Stabilization/Alignment Pass)
 *
 * NOTE: Hardening/alignment pass on top of the frozen 1.0.0-CORE sync
 * engine. Class name, constructor, file path, and exports are unchanged.
 * The existing flow (Background Sync → Queue Fetch → Delta Compression →
 * Transport Selection → Conflict Resolution → Queue Eviction → Retry
 * Handling) is preserved exactly — this pass only adds defensive guards,
 * idempotency, per-task fault isolation, and diagnostics around it.
 */

"use strict";

import { BinaryCompressor } from "./compression.js";
import { ConflictResolver } from "./conflict.js";

export class SyncEngine {
    constructor(kernel) {
        this.kernel = kernel;
        this.compressor = new BinaryCompressor();
        this.resolver = new ConflictResolver(this.kernel);
        this.isSyncing = false;

        // Lightweight, additive runtime statistics. tasksProcessed/
        // tasksSucceeded/tasksFailed/conflictsResolved/lastError reset at
        // the start of each triggerBackgroundSync() run; startedAt/
        // completedAt/lastSyncTime track the most recent run's timing.
        this._statistics = {
            startedAt: null,
            completedAt: null,
            lastSyncTime: null,
            tasksProcessed: 0,
            tasksSucceeded: 0,
            tasksFailed: 0,
            conflictsResolved: 0,
            lastError: null
        };
    }

    /**
     * Public method, signature and overall behavior unchanged. Idempotent
     * against concurrent invocation (the existing `isSyncing` guard is
     * preserved as the concurrency control), now wrapped with defensive
     * dependency checks and guaranteed to reset `isSyncing` even if an
     * unexpected exception occurs outside the existing try/catch.
     */
    async triggerBackgroundSync() {
        if (this.isSyncing) return;

        if (!this.kernel?.offline || typeof this.kernel.offline.isAirGapped !== "function") {
            console.warn("[SYNC ENGINE] kernel.offline is unavailable — skipping background sync run.");
            return;
        }
        if (this.kernel.offline.isAirGapped()) return;

        if (!this.kernel?.queue || typeof this.kernel.queue.getFetchableTasks !== "function") {
            console.warn("[SYNC ENGINE] kernel.queue is unavailable — skipping background sync run.");
            return;
        }

        this.isSyncing = true;
        this._statistics.startedAt = Date.now();
        this._statistics.tasksProcessed = 0;
        this._statistics.tasksSucceeded = 0;
        this._statistics.tasksFailed = 0;
        this._statistics.conflictsResolved = 0;
        this._statistics.lastError = null;

        console.log("🔄 [SYNC ENGINE] Commencing background delta synchronization run...");

        try {
            const pendingTasks = await this.kernel.queue.getFetchableTasks();

            for (const task of pendingTasks) {
                if (!this._isValidTask(task)) {
                    this._statistics.tasksFailed++;
                    console.warn("[SYNC ENGINE] Skipped malformed queue task during synchronization:", task);
                    continue; // never abort the whole cycle for one bad task
                }

                this._statistics.tasksProcessed++;
                try {
                    await this.synchronizeTaskItem(task);
                    this._statistics.tasksSucceeded++;
                } catch (taskErr) {
                    // synchronizeTaskItem() already routes normal failures
                    // through queue.incrementFailureCount(); this catch is
                    // an extra safety net so one task's unexpected throw
                    // never aborts the remaining tasks in the cycle.
                    this._statistics.tasksFailed++;
                    this._statistics.lastError = taskErr && taskErr.message ? taskErr.message : String(taskErr);
                    console.error(`[SYNC ENGINE] Unexpected fault synchronizing task ${task.taskId}:`, taskErr);
                }
            }
        } catch (syncErr) {
            this._statistics.lastError = syncErr && syncErr.message ? syncErr.message : String(syncErr);
            console.error("[SYNC CYCLE FAULT]", syncErr);
        } finally {
            this.isSyncing = false;
            this._statistics.completedAt = Date.now();
            this._statistics.lastSyncTime = this._statistics.completedAt;
        }
    }

    /**
     * Public method, signature unchanged. Synchronizes a single task:
     * compress delta, select transport, send, resolve conflict or evict.
     * Defensive checks added around router/compressor/resolver/queue;
     * existing control flow and error handling (incrementFailureCount on
     * send failure) preserved exactly.
     */
    async synchronizeTaskItem(task) {
        if (!this.compressor || typeof this.compressor.generateDeltaPayload !== "function") {
            console.warn(`[SYNC ENGINE] Compressor is unavailable — cannot synchronize task ${task.taskId}.`);
            return;
        }

        // Build optimized incremental delta payloads
        const compressedDelta = await this.compressor.generateDeltaPayload(task);

        if (!this.kernel?.router || typeof this.kernel.router.resolveBestAvailableTransport !== "function") {
            console.warn(`[SYNC ENGINE] kernel.router is unavailable — cannot resolve transport for task ${task.taskId}.`);
            return;
        }

        const bestTransport = await this.kernel.router.resolveBestAvailableTransport(task.priority);
        if (!bestTransport) return;

        try {
            const networkResponse = await bestTransport.send(compressedDelta);
            if (networkResponse.hasConflict) {
                if (!this.resolver || typeof this.resolver.handleMergeAnomaly !== "function") {
                    console.warn(`[SYNC ENGINE] Conflict resolver is unavailable — cannot resolve conflict for task ${task.taskId}.`);
                    return;
                }
                await this.resolver.handleMergeAnomaly(task, networkResponse.serverState);
                this._statistics.conflictsResolved++;
            } else {
                if (this.kernel?.queue && typeof this.kernel.queue.evict === "function") {
                    await this.kernel.queue.evict(task.taskId);
                }
            }
        } catch (err) {
            if (this.kernel?.queue && typeof this.kernel.queue.incrementFailureCount === "function") {
                await this.kernel.queue.incrementFailureCount(task.taskId, err.message);
            } else {
                console.warn(`[SYNC ENGINE] kernel.queue is unavailable — could not record failure for task ${task.taskId}:`, err.message);
            }
        }
    }

    /**
     * Returns true if synchronization is currently in progress.
     */
    isSynchronizationRunning() {
        return this.isSyncing;
    }

    /**
     * Returns a snapshot of sync engine runtime diagnostics.
     */
    getSyncStatus() {
        return {
            isSyncing: this.isSyncing,
            startedAt: this._statistics.startedAt,
            completedAt: this._statistics.completedAt,
            lastSyncTime: this._statistics.lastSyncTime,
            tasksProcessed: this._statistics.tasksProcessed,
            tasksSucceeded: this._statistics.tasksSucceeded,
            tasksFailed: this._statistics.tasksFailed,
            conflictsResolved: this._statistics.conflictsResolved,
            lastError: this._statistics.lastError
        };
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /**
     * Minimal structural validation for a queue task before it is trusted
     * enough to enter the synchronization pipeline. Mirrors the shape
     * produced by UniversalQueue.insert() (taskId, route, status) without
     * depending on queue.js internals or re-implementing its own
     * validation rules — only screens out structurally broken entries so
     * one bad task can't abort the whole sync cycle.
     */
    _isValidTask(task) {
        if (!task || typeof task !== "object") return false;
        if (!task.taskId || typeof task.taskId !== "string") return false;
        if (!task.status || typeof task.status !== "string") return false;
        return true;
    }
                        }
