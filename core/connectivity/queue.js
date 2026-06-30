/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── TRANSACTIONS QUEUE KERNEL MODULE
 * FILE: core/connectivity/queue.js
 * VERSION: 1.0.0-CORE
 */

"use strict";

export class UniversalQueue {
    constructor(kernel) {
        this.kernel = kernel;
        this.tasksMemoryMap = [];
        this.maxRetryLimit = 5;
    }

    async insert(payload) {
        const start = performance.now();
        const queuedItem = {
            taskId: `task_cuck_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            timestamp: Date.now(),
            priority: payload.priority || "NORMAL",
            retryCount: 0,
            payload: payload,
            status: "QUEUED",
            checksum: this._generateChecksumSignature(payload),
            failures: []
        };

        this.tasksMemoryMap.push(queuedItem);
        
        // Request structural snapshot mutation commit
        this.kernel.scheduler.flagDirtyState();
        
        const insertionLatency = performance.now() - start;
        this.kernel.metrics.trackQueueInsertionTime(insertionLatency);

        return queuedItem.taskId;
    }

    async getFetchableTasks() {
        return this.tasksMemoryMap.filter(t => t.status === "QUEUED" && t.retryCount < this.maxRetryLimit);
    }

    async evict(taskId) {
        this.tasksMemoryMap = this.tasksMemoryMap.filter(t => t.taskId !== taskId);
        this.kernel.scheduler.flagDirtyState();
        console.log(`✓ [UNIVERSAL QUEUE] Transaction item evicted following processing: ${taskId}`);
    }

    async incrementFailureCount(taskId, errorMessage) {
        const targetItem = this.tasksMemoryMap.find(t => t.taskId === taskId);
        if (targetItem) {
            targetItem.retryCount++;
            targetItem.failures.push({ time: Date.now(), reason: errorMessage });
            if (targetItem.retryCount >= this.maxRetryLimit) {
                targetItem.status = "DEAD_LETTER_HOLD";
                console.error(`🔒 [UNIVERSAL QUEUE] Critical item delivery exhaustion. Moved to DLH structure: ${taskId}`);
            }
            this.kernel.scheduler.flagDirtyState();
        }
    }

    _generateChecksumSignature(obj) {
        const jsonStr = JSON.stringify(obj);
        let hashValue = 0;
        for (let idx = 0; idx < jsonStr.length; idx++) {
            hashValue = (hashValue << 5) - hashValue + jsonStr.charCodeAt(idx);
            hashValue |= 0;
        }
        return `crc-${hashValue.toString(16)}`;
    }
}
