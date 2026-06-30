/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── HIGH-THROUGHPUT SMART CACHE
 * FILE: core/connectivity/cache.js
 * VERSION: 1.0.0-CORE
 */

"use strict";

export class SmartCache {
    constructor(kernel) {
        this.kernel = kernel;
        this._cacheStorageMap = new Map();
        this.defaultTTL = 60000; // 60 seconds default threshold
    }

    async lookup(payload) {
        const trackingKey = this._deriveCacheTrackingKey(payload);
        const structureNode = this._cacheStorageMap.get(trackingKey);

        if (!structureNode) return null;

        if (Date.now() - structureNode.timestamp > structureNode.ttl) {
            this._cacheStorageMap.delete(trackingKey);
            return null;
        }

        return structureNode.dataset;
    }

    async write(payload, dataset, customTTL = null) {
        const trackingKey = this._deriveCacheTrackingKey(payload);
        this._cacheStorageMap.set(trackingKey, {
            dataset: dataset,
            timestamp: Date.now(),
            ttl: customTTL || this.defaultTTL
        });
    }

    sweepExpiredNodes() {
        const currentTime = Date.now();
        for (const [key, node] of this._cacheStorageMap.entries()) {
            if (currentTime - node.timestamp > node.ttl) {
                this._cacheStorageMap.delete(key);
            }
        }
    }

    _deriveCacheTrackingKey(payload) {
        return `${payload.collection || "generic"}:${payload.id || "all"}:${JSON.stringify(payload.query || "")}`;
    }
}
