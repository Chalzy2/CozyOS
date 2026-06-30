/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── DELTA SYNCHRONIZATION ENGINE
 * FILE: core/connectivity/sync.js
 * VERSION: 1.0.0-CORE
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
    }

    async triggerBackgroundSync() {
        if (this.isSyncing) return;
        if (this.kernel.offline.isAirGapped()) return;

        this.isSyncing = true;
        console.log("🔄 [SYNC ENGINE] Commencing background delta synchronization run...");

        try {
            const pendingTasks = await this.kernel.queue.getFetchableTasks();
            for (const task of pendingTasks) {
                await this.synchronizeTaskItem(task);
            }
        } catch (syncErr) {
            console.error("[SYNC CYCLE FAULT]", syncErr);
        } finally {
            this.isSyncing = false;
        }
    }

    async synchronizeTaskItem(task) {
        // Build optimized incremental delta payloads
        const compressedDelta = await this.compressor.generateDeltaPayload(task);
        
        const bestTransport = await this.kernel.router.resolveBestAvailableTransport(task.priority);
        if (!bestTransport) return;

        try {
            const networkResponse = await bestTransport.send(compressedDelta);
            if (networkResponse.hasConflict) {
                await this.resolver.handleMergeAnomaly(task, networkResponse.serverState);
            } else {
                await this.kernel.queue.evict(task.taskId);
            }
        } catch (err) {
            await this.kernel.queue.incrementFailureCount(task.taskId, err.message);
        }
    }
}
