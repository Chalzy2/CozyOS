/**
 * MpesaOS Application Shell — Development Storage Shim
 * File Reference: MpesaOS/assets/dev-storage-shim.js
 * Layer: Presentation / Development Fallback Only
 * Version: 1.0.0-DEV-FALLBACK
 *
 * IMPORTANT — DEVELOPMENT/DEMO USE ONLY.
 * mpesaOS.js requires window.CozyStorage as a hard dependency. In a real
 * CozyOS deployment, window.CozyStorage is the platform's real persistence
 * layer and is already present before this shell loads.
 *
 * This file installs a minimal, in-memory, non-persistent stand-in ONLY
 * when window.CozyStorage does not already exist, so the shell is runnable
 * standalone for development, demos, and certification dry-runs. It is
 * skipped entirely — a true no-op — the moment a real CozyStorage exists.
 *
 * This file does not modify mpesaOS.js and implements no MpesaOS business
 * logic itself; it only satisfies the generic storage contract mpesaOS.js
 * calls against (get/save/delete/beginTransaction/acquireDistributedMutex/
 * releaseDistributedMutex).
 */

(function () {
    "use strict";

    if (window.CozyStorage) {
        // Real platform storage already present — do nothing.
        return;
    }

    const memoryStores = new Map(); // `${tenantId}:${storeName}` -> Map(id -> record)
    const locks = new Map();        // lockKey -> expiry timestamp

    function storeKey(storeName, tenantId) {
        return `${tenantId || "default"}::${storeName}`;
    }

    function getStore(storeName, tenantId) {
        const key = storeKey(storeName, tenantId);
        if (!memoryStores.has(key)) memoryStores.set(key, new Map());
        return memoryStores.get(key);
    }

    const DevStorageShim = {
        async get(storeName, id, tenantId) {
            const store = getStore(storeName, tenantId);
            return store.has(id) ? store.get(id) : null;
        },

        async save(storeName, record, tenantId) {
            if (!record || typeof record !== "object" || record.id === undefined) {
                throw new TypeError("[dev-storage-shim] save() requires a record with an id.");
            }
            const store = getStore(storeName, tenantId);
            store.set(record.id, { ...record });
            return record;
        },

        async delete(storeName, id, tenantId) {
            const store = getStore(storeName, tenantId);
            return store.delete(id);
        },

        async beginTransaction(storeNames, tenantId) {
            const pendingWrites = [];
            return {
                async save(storeName, record) {
                    pendingWrites.push({ storeName, record });
                },
                async commit() {
                    for (const { storeName, record } of pendingWrites) {
                        await DevStorageShim.save(storeName, record, tenantId);
                    }
                    return true;
                },
                async rollback() {
                    pendingWrites.length = 0;
                    return true;
                }
            };
        },

        async acquireDistributedMutex(lockKey, tenantId, ttlMs) {
            const fullKey = `${tenantId || "default"}::${lockKey}`;
            const now = Date.now();
            const expiry = locks.get(fullKey);
            if (expiry && expiry > now) return false;
            locks.set(fullKey, now + (ttlMs || 30000));
            return true;
        },

        async releaseDistributedMutex(lockKey, tenantId) {
            const fullKey = `${tenantId || "default"}::${lockKey}`;
            locks.delete(fullKey);
            return true;
        }
    };

    window.CozyStorage = DevStorageShim;
    console.warn("[MpesaOS Shell] Real window.CozyStorage not found. In-memory development shim installed — data will not persist across reloads. Replace with the platform's real CozyStorage module before production deployment.");
})();
