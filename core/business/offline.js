/**
 * ── COZYOS OFFLINE-FIRST SYNCHRONIZATION ENGINE ──
 * FILE: core/business/offline.js
 */

const DB_NAME = "CozyOS_Retail_Offline_DB";
const DB_VERSION = 1;

export default {
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("sales")) db.createObjectStore("sales", { keyPath: "id" });
                if (!db.objectStoreNames.contains("inventory")) db.createObjectStore("inventory", { keyPath: "id" });
                if (!db.objectStoreNames.contains("sync_queue")) db.createObjectStore("sync_queue", { keyPath: "id" });
                if (!db.objectStoreNames.contains("float_ledger")) db.createObjectStore("float_ledger", { keyPath: "tenantId" });
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    isOnline() {
        return navigator.onLine;
    },

    async queueOfflineTx(payload) {
        const db = await this.initIndexedDB();
        return new Promise((resolve) => {
            const tx = db.transaction(["sync_queue", "sales"], "readwrite");
            tx.objectStore("sync_queue").put({ id: payload.id, type: "POS_SALE", data: payload });
            tx.objectStore("sales").put(payload);
            tx.oncomplete = () => resolve(true);
        });
    },

    async pushLocalQueueToServer() {
        if (!this.isOnline()) return;
        const db = await this.initIndexedDB();
        
        const tx = db.transaction("sync_queue", "readonly");
        const store = tx.objectStore("sync_queue");
        const allRecords = await new Promise(res => store.getAll().onsuccess = (e) => res(e.target.result));

        for (const record of allRecords) {
            try {
                // Post payload packet straight to core API endpoints infrastructure
                const response = await fetch("/api/v1/sync/payload", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(record.data)
                });
                
                if (response.ok) {
                    const writeTx = db.transaction("sync_queue", "readwrite");
                    writeTx.objectStore("sync_queue").delete(record.id);
                }
            } catch (err) {
                console.error("Sync retry paused: Network channel handshake interrupted.", err);
                break;
            }
        }
    }
};
