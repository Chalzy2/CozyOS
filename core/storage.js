/**
 * ── COZYOS CENTRAL CORE STORAGE ARCHITECTURE ──
 * FILE: core/storage.js
 */

let _dbInstance = null;
const SCHEMA_META = { name: "CozyOS_Storage_Cluster", version: 8 };

const REQUIRED_STORES = [
    "users", 
    "settings", 
    "inventory", 
    "audit_logs", 
    "sync_queue", 
    "language_packs", 
    "ai_cache", 
    "documents", 
    "plugins"
];

const CozyStorage = {
    /**
     * Initializes IndexedDB and safely sets up all architectural object stores
     */
    async initInternal() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(SCHEMA_META.name, SCHEMA_META.version);
            
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                REQUIRED_STORES.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
                    }
                });
            };
            
            req.onsuccess = (e) => { 
                _dbInstance = e.target.result; 
                resolve(true); 
            };
            
            req.onerror = (e) => reject(e.target.error);
        });
    },

    getRawInstance() { 
        return _dbInstance; 
    },

    /**
     * Write or Update local system data safely
     */
    async writeLocal(storeName, data) {
        return new Promise((resolve, reject) => {
            if (!_dbInstance) return resolve(false);
            try {
                const tx = _dbInstance.transaction(storeName, "readwrite");
                const store = tx.objectStore(storeName);
                const req = store.put(data);
                
                req.onsuccess = () => resolve(true);
                req.onerror = (e) => reject(e.target.error);
            } catch (err) {
                reject(err);
            }
        });
    },

    /**
     * Read a specific record matching a key identity
     */
    async readLocal(storeName, key) {
        return new Promise((resolve, reject) => {
            if (!_dbInstance) return resolve(null);
            try {
                const tx = _dbInstance.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                const req = store.get(key);
                
                req.onsuccess = (e) => resolve(e.target.result || null);
                req.onerror = (e) => reject(e.target.error);
            } catch (err) {
                reject(err);
            }
        });
    },

    /**
     * Read all collection items inside a data store
     */
    async readAllLocal(storeName) {
        return new Promise((resolve, reject) => {
            if (!_dbInstance) return resolve([]);
            try {
                const tx = _dbInstance.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);
                const req = store.getAll();
                
                req.onsuccess = (e) => resolve(e.target.result || []);
                req.onerror = (e) => reject(e.target.error);
            } catch (err) {
                reject(err);
            }
        });
    },

    /**
     * Dedicated offline-first operation tracking queue handler
     */
    async queueOfflineOperation(actionType, targetStore, payload) {
        const syncItem = {
            action: actionType,
            store: targetStore,
            data: payload,
            timestamp: Date.now()
        };
        return this.writeLocal("sync_queue", syncItem);
    },

    /**
     * Storage Telemetry: Reports current usage metrics
     */
    async reportStorageUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                usedMB: (estimate.usage / (1024 * 1024)).toFixed(2),
                quotaMB: (estimate.quota / (1024 * 1024)).toFixed(2),
                percentage: ((estimate.usage / estimate.quota) * 100).toFixed(2)
            };
        }
        return { usedMB: "0.00", quotaMB: "0.00", percentage: "0" };
    }
};

// ── CONNECTION GATEWAY WIREUP ──
// 1. Expose to standard global browser context for easy <script src="..."> access
if (typeof window !== "undefined") {
    window.CozyStorage = CozyStorage;
}

// 2. Keep standard ES module export support alive simultaneously
export default CozyStorage;
