/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── ENGINE LOOP SCHEDULER
 * FILE: core/connectivity/scheduler.js
 * VERSION: 1.1.0-CORE (v2.4.1 Stabilization/Alignment Pass)
 *
 * NOTE: Hardening/alignment pass on top of the frozen 1.0.0-CORE scheduler.
 * Class name, constructor, file path, and exports are unchanged. The three
 * existing loops (Background Sync, Cache Sweeper, Persistence Checkpoint),
 * their intervals, and snapshot/queue/offline/router/cache business logic
 * are all untouched — this pass only adds defensive guards, idempotency,
 * lifecycle control, and diagnostics around the existing loops.
 */

"use strict";

import { StateSnapshotEngine } from "./snapshot.js";

export class ChronosScheduler {
    constructor(kernel) {
        this.kernel = kernel;
        this.snapshotEngine = new StateSnapshotEngine(this.kernel);
        this.isStateDirty = false;

        this.backgroundSyncTimer = null;
        this.cacheSweeperTimer   = null;
        this.persistenceTimer    = null;

        this._running = false;

        // Lightweight, additive runtime statistics. Reset on each
        // successful startLoops() invocation (i.e. once per boot in
        // normal operation, or on a deliberate stop/start cycle).
        this._statistics = {
            startedAt: null,
            backgroundRuns: 0,
            cacheSweeps: 0,
            checkpointCommits: 0,
            lastCheckpointTime: null
        };
    }

    /**
     * Public method, signature unchanged. Starts the three existing
     * scheduler loops at their existing intervals. Idempotent: calling
     * startLoops() while already running is a no-op (logged, not thrown)
     * so duplicate boot calls never create duplicate timers.
     */
    async startLoops() {
        if (this._running) {
            console.log("ℹ️ [CHRONOS SCHEDULER] startLoops() called while already running — skipping duplicate timer creation.");
            return;
        }

        // Process background data consolidation runs every 10 seconds
        this.backgroundSyncTimer = setInterval(() => {
            this._runBackgroundSync();
        }, 10000);

        // Run smart data cache pruning sweeps every 30 seconds
        this.cacheSweeperTimer = setInterval(() => {
            this._runCacheSweep();
        }, 30000);

        // Atomic storage flusher to process dirty states every 30 seconds
        this.persistenceTimer = setInterval(async () => {
            await this._runPersistenceCheckpoint();
        }, 30000);

        this._running = true;
        this._statistics.startedAt = Date.now();
        console.log("✓ [CHRONOS SCHEDULER] All loops started: Background Sync (10s), Cache Sweeper (30s), Persistence Checkpoint (30s).");
    }

    /**
     * Safely stops every running loop, clearing each interval and
     * resetting timer references to null. Safe to call even if loops were
     * never started or have already been stopped.
     */
    stopLoops() {
        if (this.backgroundSyncTimer !== null) {
            clearInterval(this.backgroundSyncTimer);
            this.backgroundSyncTimer = null;
        }
        if (this.cacheSweeperTimer !== null) {
            clearInterval(this.cacheSweeperTimer);
            this.cacheSweeperTimer = null;
        }
        if (this.persistenceTimer !== null) {
            clearInterval(this.persistenceTimer);
            this.persistenceTimer = null;
        }

        this._running = false;
        console.log("⚠️ [CHRONOS SCHEDULER] All loops stopped, timers cleared.");
    }

    /**
     * Returns true if the scheduler's loops are currently active.
     */
    isRunning() {
        return this._running;
    }

    /**
     * Returns a snapshot of scheduler runtime diagnostics.
     */
    getSchedulerStatus() {
        return {
            running: this._running,
            startedAt: this._statistics.startedAt,
            backgroundRuns: this._statistics.backgroundRuns,
            cacheSweeps: this._statistics.cacheSweeps,
            checkpointCommits: this._statistics.checkpointCommits,
            lastCheckpointTime: this._statistics.lastCheckpointTime,
            isStateDirty: this.isStateDirty
        };
    }

    flagDirtyState() {
        this.isStateDirty = true;
    }

    // ── Internal loop bodies ─────────────────────────────────────────────
    // Extracted from the inline setInterval callbacks so defensive checks
    // are isolated, testable, and easy to reason about without touching
    // the loop registration/timing logic above.

    /**
     * Background Sync loop body. Defensively checks kernel.offline and
     * kernel.sync before use; behavior is otherwise unchanged from the
     * original inline implementation.
     */
    _runBackgroundSync() {
        if (!this.kernel?.offline || typeof this.kernel.offline.isAirGapped !== "function") {
            return;
        }
        if (!this.kernel?.sync || typeof this.kernel.sync.triggerBackgroundSync !== "function") {
            return;
        }

        if (!this.kernel.offline.isAirGapped()) {
            this.kernel.sync.triggerBackgroundSync();
            this._statistics.backgroundRuns++;
        }
    }

    /**
     * Cache Sweeper loop body. Defensively checks kernel.cache before use;
     * behavior is otherwise unchanged from the original inline
     * implementation.
     */
    _runCacheSweep() {
        if (!this.kernel?.cache || typeof this.kernel.cache.sweepExpiredNodes !== "function") {
            return;
        }

        this.kernel.cache.sweepExpiredNodes();
        this._statistics.cacheSweeps++;
    }

    /**
     * Persistence Checkpoint loop body. Defensively checks snapshotEngine
     * before use; behavior is otherwise unchanged from the original inline
     * implementation.
     */
    async _runPersistenceCheckpoint() {
        if (!this.isStateDirty) return;
        if (!this.snapshotEngine || typeof this.snapshotEngine.forceAtomicCheckpointCommit !== "function") {
            return;
        }

        this.isStateDirty = false;
        await this.snapshotEngine.forceAtomicCheckpointCommit();
        this._statistics.checkpointCommits++;
        this._statistics.lastCheckpointTime = Date.now();
    }
}
