/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── ENGINE LOOP SCHEDULER
 * FILE: core/connectivity/scheduler.js
 * VERSION: 1.0.0-CORE
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
    }

    async startLoops() {
        // Process background data consolidation runs every 10 seconds
        this.backgroundSyncTimer = setInterval(() => {
            if (!this.kernel.offline.isAirGapped()) {
                this.kernel.sync.triggerBackgroundSync();
            }
        }, 10000);

        // Run smart data cache pruning sweeps every 30 seconds
        this.cacheSweeperTimer = setInterval(() => {
            this.kernel.cache.sweepExpiredNodes();
        }, 30000);

        // Atomic storage flusher to process dirty states every 3 seconds
        this.persistenceTimer = setInterval(async () => {
            if (this.isStateDirty) {
                this.isStateDirty = false;
                await this.snapshotEngine.forceAtomicCheckpointCommit();
            }
        }, 30000);
    }

    flagDirtyState() {
        this.isStateDirty = true;
    }
}
