/**
 * CozyOS UNIVERSAL CONNECTIVITY KERNEL ── HIGH-THROUGHPUT SMART CACHE
 * FILE: core/connectivity/cache.js
 * VERSION: 1.1.0-CORE (v2.4.1 Engine Contract Alignment — Stabilization Pass)
 *
 * NOTE: Hardening/alignment pass on top of the frozen 1.0.0-CORE cache.
 * Class name, constructor, file path, exports, Map-based memory
 * architecture, and TTL behavior are all unchanged. No business logic,
 * routing logic, storage, networking, offline logic, queue logic, or
 * module-specific behavior introduced.
 */

"use strict";

export class SmartCache {
    constructor(kernel) {
        this.kernel = kernel;
        this._cacheStorageMap = new Map();
        this.defaultTTL = 60000; // 60 seconds default threshold
    }

    /**
     * Looks up a cached dataset for the given transaction envelope.
     * Accepts the standard CozyOS v2.4.1 engine contract:
     * { route, authContext, payload }.
     */
    async lookup(transaction) {
        const normalized = this._normalizeCacheRequest(transaction);
        const trackingKey = this._deriveCacheTrackingKey(normalized);
        const structureNode = this._cacheStorageMap.get(trackingKey);

        if (!structureNode) return null;

        if (Date.now() - structureNode.timestamp > structureNode.ttl) {
            this._cacheStorageMap.delete(trackingKey);
            return null;
        }

        return structureNode.dataset;
    }

    /**
     * Writes a dataset into the cache, keyed against the given transaction
     * envelope. Accepts the standard CozyOS v2.4.1 engine contract:
     * { route, authContext, payload }.
     */
    async write(transaction, dataset, customTTL = null) {
        const normalized = this._normalizeCacheRequest(transaction);
        const trackingKey = this._deriveCacheTrackingKey(normalized);
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

    // ── Backward-compatible aliases (additive only) ─────────────────────

    /**
     * Alias for lookup(), kept for legacy callers using `cache.get(...)`.
     */
    async get(transaction) {
        return await this.lookup(transaction);
    }

    /**
     * Alias for write(), kept for legacy callers using `cache.set(...)`.
     */
    async set(transaction, dataset, customTTL = null) {
        return await this.write(transaction, dataset, customTTL);
    }

    // ── New utility methods (additive only) ─────────────────────────────

    /**
     * Returns true if a non-expired cache entry exists for the given
     * transaction envelope. Expired entries are treated as absent (and
     * evicted), consistent with lookup()'s expiration handling.
     */
    async has(transaction) {
        const normalized = this._normalizeCacheRequest(transaction);
        const trackingKey = this._deriveCacheTrackingKey(normalized);
        const structureNode = this._cacheStorageMap.get(trackingKey);
        if (!structureNode) return false;

        if (Date.now() - structureNode.timestamp > structureNode.ttl) {
            this._cacheStorageMap.delete(trackingKey);
            return false;
        }
        return true;
    }

    /**
     * Removes a single cache entry for the given transaction envelope, if
     * present. Returns true if an entry was removed, false otherwise.
     */
    async remove(transaction) {
        const normalized = this._normalizeCacheRequest(transaction);
        const trackingKey = this._deriveCacheTrackingKey(normalized);
        return this._cacheStorageMap.delete(trackingKey);
    }

    /**
     * Clears the entire in-memory cache. Memory-only operation — does not
     * touch storage/persistence (none exists in this module).
     */
    clear() {
        this._cacheStorageMap.clear();
    }

    /**
     * Returns the number of entries currently held in the cache,
     * regardless of expiration state (matches sweepExpiredNodes()'s lazy
     * expiration model — call sweepExpiredNodes() first if an exact live
     * count is required).
     */
    size() {
        return this._cacheStorageMap.size;
    }

    // ── Internal helpers ─────────────────────────────────────────────────

    /**
     * Validates and normalizes an incoming cache request into the standard
     * CozyOS v2.4.1 engine contract: { route, authContext, payload }.
     * Throws descriptive errors on invalid input. Does not rely on legacy
     * collection/action/id/query fields.
     */
    _normalizeCacheRequest(transaction) {
        if (transaction === null || transaction === undefined) {
            throw new TypeError("[SMART CACHE] Request rejected: transaction envelope cannot be null or undefined.");
        }
        if (typeof transaction !== "object") {
            throw new TypeError("[SMART CACHE] Request rejected: transaction envelope must be an object.");
        }

        const route = transaction.route;
        if (!route || typeof route !== "string") {
            throw new Error("[SMART CACHE] Request rejected: transaction envelope is missing a valid string 'route'.");
        }

        const payload = transaction.payload !== undefined ? transaction.payload : {};
        if (typeof payload !== "object" || payload === null) {
            throw new TypeError("[SMART CACHE] Request rejected: transaction envelope 'payload' must be an object.");
        }

        const authContext = transaction.authContext !== undefined ? transaction.authContext : null;

        return {
            route: route.trim(),
            authContext,
            payload
        };
    }

    /**
     * Deterministic, route-based cache key generator. Replaces the legacy
     * `collection:id:query` key shape with one derived from the
     * standardized { route, normalized payload } envelope. Payload keys
     * are sorted recursively so structurally identical payloads always
     * produce the same key regardless of original property order.
     */
    _deriveCacheTrackingKey(normalized) {
        const sortedPayload = this._sortObjectKeysDeep(normalized.payload);
        return `${normalized.route}:${JSON.stringify(sortedPayload)}`;
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
