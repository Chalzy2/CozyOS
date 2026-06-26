let _dbInstance = null;
const SCHEMA_META = { name: "CozyOS_Storage_Cluster", version: 8 };

export default {
    async initInternal() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(SCHEMA_META.name, SCHEMA_META.version);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("cozy_sync_queue")) db.createObjectStore("cozy_sync_queue", { keyPath: "id" });
                if (!db.objectStoreNames.contains("cozy_ai_memory")) db.createObjectStore("cozy_ai_memory", { keyPath: "key" });
                if (!db.objectStoreNames.contains("cozy_plugins")) db.createObjectStore("cozy_plugins", { keyPath: "pluginId" });
            };
            req.onsuccess = (e) => { _dbInstance = e.target.result; resolve(true); };
            req.onerror = (e) => reject(e.target.error);
        });
    },
    getRawInstance() { return _dbInstance; },
    async writeLocal(storeName, data) {
        return new Promise(r => {
            if (!_dbInstance) return r(false);
            const tx = _dbInstance.transaction(storeName, "readwrite");
            tx.objectStore(storeName).put(data).onsuccess = () => r(true);
        });
    },
    async readLocal(storeName, key) {
        return new Promise(r => {
            if (!_dbInstance) return r(null);
            const tx = _dbInstance.transaction(storeName, "readonly");
            tx.objectStore(storeName).get(key).onsuccess = (e) => r(e.target.result);
        });
    }
};
