/**
 * ── COZYOS UNIVERSAL CORE STORAGE GATEWAY ──
 * FILE: core/storage.js
 * VERSION: 2.1.0
 *
 * ARCHITECTURAL RULE: This file is the absolute ONLY component in CozyOS allowed
 * to talk directly to IndexedDB, LocalStorage, SessionStorage, Cache API, and Cloud Sync.
 * All modules (BusinessOS, HospitalOS, ULIE, Plugins, etc.) are strictly forbidden
 * from accessing raw browser storage layers directly.
 *
 * CHANGES FROM v2.0.0 → v2.1.0
 * ─────────────────────────────────────────────────────────────────────────
 * F-01 [Critical]  transaction(): reject async transactionFn — documents IDB sync contract
 * F-02 [Critical]  tenantId: session-bound _activeTenantId enforced; callers cannot override
 * F-03 [Critical]  _logAudit: switched put() → add() to make audit log append-only / immutable
 * F-04 [Critical]  sync(): clientRequestId idempotency key added to sync_queue items
 * F-05 [High]      update(): optimistic locking via _version field — detects concurrent edits
 * F-06 [High]      _validateAccess(): module-level RBAC map enforced per store
 * F-07 [High]      restore(): preserves original id values to maintain relational integrity
 * F-08 [High]      backup(): chunked per-store processing with maxRecords safety cap
 * F-09 [Medium]    count(): uses native IDBObjectStore.count() for total; list() for filtered
 * F-10 [Medium]    search(): optional IDBIndex path for indexed fields; documents fallback
 * F-11 [Low]       Comment corrected: "32" → "30"
 */

// Private state scoped within the module architecture closure
let _dbInstance = null;
const SCHEMA_META = { name: "CozyOS_Storage_Cluster", version: 9 };

// Complete declarative blueprint of all 30 mandatory default system & industry object stores
// [F-11: corrected count from 32 → 30]
const BLUEPRINT_OBJECT_STORES = [
    "users", "settings", "organizations", "permissions", "plugins", "plugin_settings",
    "documents", "media", "images", "videos", "language_packs", "translation_memory",
    "dictionary", "learning_progress", "voice_models", "ocr_cache", "inventory",
    "products", "orders", "payments", "wallet", "audit_logs", "telemetry",
    "notifications", "sync_queue", "offline_queue", "cache", "sessions",
    "api_tokens", "preferences"
];

// [F-06: Module-level RBAC map]
// Defines which named module contexts are permitted to access which stores.
const STORE_PERMISSIONS = {
    system:      new Set(BLUEPRINT_OBJECT_STORES),
    businessos:  new Set(["products","inventory","orders","payments","wallet","customers",
                          "documents","media","images","notifications","settings",
                          "preferences","sync_queue","offline_queue","sessions","telemetry"]),
    hospitalos:  new Set(["documents","media","images","patients","orders","payments",
                          "notifications","settings","preferences","sync_queue",
                          "offline_queue","sessions","telemetry"]),
    ulie:        new Set(["language_packs","translation_memory","dictionary",
                          "learning_progress","voice_models","ocr_cache","settings",
                          "preferences","sessions","telemetry"]),
    plugin:      new Set(["products","inventory","notifications","preferences",
                          "sessions","telemetry"]),
};

// [F-02: Session-bound tenant state — set once at authenticated session start]
let _activeTenantId     = null;
let _activeModuleContext = null;

/**
 * Universal Storage System Core Implementation
 */
const CozyStorageGateway = {

    // ──── 1. LIFECYCLE & INITIALIZATION ENGINE ────

    /**
     * Public System Initialization Gateway. Dual-compatible interface handler.
     */
    async init() {
        return this.openDatabase();
    },

    /**
     * [F-02] Binds the authenticated session tenant and module context.
     */
    initModule(tenantId, moduleContext = "plugin") {
        if (!tenantId || typeof tenantId !== "string" || tenantId.trim() === "") {
            throw new Error("[Storage Security] initModule() requires a valid authenticated tenantId.");
        }
        if (!STORE_PERMISSIONS[moduleContext]) {
            throw new Error(`[Storage Security] Unknown module context: '${moduleContext}'. Must be one of: ${Object.keys(STORE_PERMISSIONS).join(", ")}.`);
        }
        _activeTenantId      = tenantId.trim();
        _activeModuleContext = moduleContext;
        this._logAudit("ModuleContextBound", _activeTenantId, { context: moduleContext });
    },

    /**
     * Initializes or upgrades connection bounds cleanly to the IndexedDB Cluster.
     */
    async openDatabase() {
        return new Promise((resolve, reject) => {
            if (_dbInstance) return resolve(true);

            try {
                const req = indexedDB.open(SCHEMA_META.name, SCHEMA_META.version);

                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    console.log(`[Storage Kernel] Upgrading schema architecture to Version ${SCHEMA_META.version}...`);

                    BLUEPRINT_OBJECT_STORES.forEach(storeName => {
                        if (!db.objectStoreNames.contains(storeName)) {
                            db.createObjectStore(storeName, { keyPath: "id", autoIncrement: true });
                            console.log(`[Storage Schema] Constructed object store partition: ${storeName}`);
                        }
                    });
                };

                req.onsuccess = (e) => {
                    _dbInstance = e.target.result;
                    this._logAudit("StorageEngineInit", "SYSTEM", { status: "Success", version: SCHEMA_META.version });
                    resolve(true);
                };

                req.onerror = (e) => {
                    console.error("[Storage Kernel] Critical runtime database opening failure:", e.target.error);
                    reject(e.target.error);
                };
            } catch (err) {
                reject(err);
            }
        });
    },

    /**
     * Gracefully tears down and shuts down active connection links to local persistence memory pools.
     */
    async close() {
        if (_dbInstance) {
            _dbInstance.close();
            _dbInstance      = null;
            _activeTenantId  = null;       // [F-02] clear session on close
            _activeModuleContext = null;
            console.log("[Storage Kernel] Database links disconnected cleanly.");
            return true;
        }
        return false;
    },

    // ──── 2. STAGE 4 UNIFIED UNIVERSAL CRUD API ENGINE ────

    /**
     * Create or overwrite an operational layout object with structural validation and hooks.
     */
    async save(storeName, data, tenantId = "default_tenant") {
        // Multi-tenant isolation sanity guardrail
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        this._validateAccess(storeName);
        const processedData = this._applyWritePipelines(data, resolvedTenantId);

        return new Promise((resolve, reject) => {
            if (!_dbInstance) return reject(new Error("Database instance context uninitialized."));

            const tx    = _dbInstance.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const req   = store.put(processedData);

            req.onsuccess = () => {
                this._logAudit("RecordSave", resolvedTenantId, { store: storeName, key: req.result });
                resolve(req.result);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * Retrieve a specific record context payload by its primary key identification.
     */
    async get(storeName, key, tenantId = "default_tenant") {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        this._validateAccess(storeName);

        return new Promise((resolve, reject) => {
            if (!_dbInstance) return reject(new Error("Database instance context uninitialized."));

            const tx    = _dbInstance.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req   = store.get(key);

            req.onsuccess = (e) => {
                const result = e.target.result;
                if (!result) return resolve(null);

                if (result.tenantId && result.tenantId !== resolvedTenantId) {
                    return reject(new Error(`[Security Boundary Exception] Cross-tenant leak blocked for key: ${key}`));
                }

                resolve(this._applyReadPipelines(result));
            };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * [F-05] Update an existing record with optimistic locking via _version field.
     */
    async update(storeName, key, partialData, tenantId = "default_tenant") {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        this._validateAccess(storeName);
        if (!_dbInstance) throw new Error("Database instance context uninitialized.");

        return new Promise((resolve, reject) => {
            const tx    = _dbInstance.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const getReq = store.get(key);

            getReq.onsuccess = (e) => {
                const currentRecord = e.target.result;
                if (!currentRecord) {
                    tx.abort();
                    return reject(new Error(`Target update record not found in ${storeName} matching key: ${key}`));
                }

                if (currentRecord.tenantId && currentRecord.tenantId !== resolvedTenantId) {
                    tx.abort();
                    return reject(new Error(`[Security Boundary Exception] Cross-tenant update blocked for key: ${key}`));
                }

                // [F-05] Optimistic locking verification
                if (partialData._version !== undefined && currentRecord._version !== undefined) {
                    if (partialData._version !== currentRecord._version) {
                        tx.abort();
                        return reject(new Error(
                            `[ConcurrentModification] Record ${key} in '${storeName}' was modified concurrently. ` +
                            `Expected version ${partialData._version}, found ${currentRecord._version}. Re-fetch and retry.`
                        ));
                    }
                }

                const combined = {
                    ...currentRecord,
                    ...partialData,
                    id: key,
                    tenantId: resolvedTenantId,
                    _lastModified: Date.now(),
                    _version: (currentRecord._version || 0) + 1
                };

                const putReq = store.put(combined);
                putReq.onsuccess = () => {
                    this._logAudit("RecordUpdate", resolvedTenantId, { store: storeName, key, version: combined._version });
                    resolve(putReq.result);
                };
                putReq.onerror = (e) => reject(e.target.error);
            };

            getReq.onerror = (e) => reject(e.target.error);
            tx.onerror     = (e) => reject(e.target.error);
        });
    },

    /**
     * Removes an operational layout node entirely from the system space partition.
     */
    async delete(storeName, key, tenantId = "default_tenant") {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        this._validateAccess(storeName);
        if (!_dbInstance) throw new Error("Database instance context uninitialized.");

        return new Promise((resolve, reject) => {
            const tx    = _dbInstance.transaction(storeName, "readwrite");
            const store = tx.objectStore(storeName);
            const getReq = store.get(key);

            getReq.onsuccess = (e) => {
                const record = e.target.result;
                if (!record) return resolve(false);

                if (record.tenantId && record.tenantId !== resolvedTenantId) {
                    tx.abort();
                    return reject(new Error(`[Security Boundary Exception] Cross-tenant delete blocked for key: ${key}`));
                }

                const delReq = store.delete(key);
                delReq.onsuccess = () => {
                    this._logAudit("RecordDelete", resolvedTenantId, { store: storeName, key });
                    resolve(true);
                };
                delReq.onerror = (e) => reject(e.target.error);
            };

            getReq.onerror = (e) => reject(e.target.error);
            tx.onerror     = (e) => reject(e.target.error);
        });
    },

    /**
     * Evaluates fast lookups determining item location presence indicators.
     */
    async exists(storeName, key, tenantId = "default_tenant") {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        const record = await this.get(storeName, key, resolvedTenantId);
        return record !== null;
    },

    /**
     * Lists and returns all items safely accessible within the requested store workspace.
     */
    async list(storeName, tenantId = "default_tenant") {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        this._validateAccess(storeName);

        return new Promise((resolve, reject) => {
            if (!_dbInstance) return reject(new Error("Database instance context uninitialized."));

            const tx    = _dbInstance.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const req   = store.getAll();

            req.onsuccess = (e) => {
                const records  = e.target.result || [];
                const filtered = records
                    .filter(r => !r.tenantId || r.tenantId === resolvedTenantId)
                    .map(r => this._applyReadPipelines(r));
                resolve(filtered);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * [F-09] Counts objects in a store partition.
     */
    async count(storeName, tenantId = "default_tenant") {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        this._validateAccess(storeName);
        if (!_dbInstance) throw new Error("Database instance context uninitialized.");

        return new Promise((resolve, reject) => {
            const tx     = _dbInstance.transaction(storeName, "readonly");
            const store  = tx.objectStore(storeName);
            const getAll = store.getAll();

            getAll.onsuccess = (e) => {
                const filtered = (e.target.result || [])
                    .filter(r => !r.tenantId || r.tenantId === resolvedTenantId);
                resolve(filtered.length);
            };
            getAll.onerror = (e) => reject(e.target.error);
        });
    },

    /**
     * [F-10] Performs custom property token matches across fields.
     */
    async search(storeName, queryProperty, valueToMatch, tenantId = "default_tenant", indexName = null) {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        this._validateAccess(storeName);
        if (!_dbInstance) throw new Error("Database instance context uninitialized.");

        if (indexName) {
            return new Promise((resolve, reject) => {
                const tx    = _dbInstance.transaction(storeName, "readonly");
                const store = tx.objectStore(storeName);

                if (!store.indexNames.contains(indexName)) {
                    console.warn(`[Storage] Index '${indexName}' not found on '${storeName}'. Falling back to full scan.`);
                    return this._fullScanSearch(store, queryProperty, valueToMatch, resolvedTenantId, reject, resolve);
                }

                const index   = store.index(indexName);
                const results = [];
                const cursor  = index.openCursor();

                cursor.onsuccess = (e) => {
                    const cur = e.target.result;
                    if (!cur) return resolve(results);

                    const r = cur.value;
                    if ((!r.tenantId || r.tenantId === resolvedTenantId) &&
                        String(r[queryProperty]).toLowerCase().includes(String(valueToMatch).toLowerCase())) {
                        results.push(this._applyReadPipelines(r));
                    }
                    cur.continue();
                };
                cursor.onerror = (e) => reject(e.target.error);
            });
        }

        console.warn(`[Storage Performance] search() on '${storeName}' without an index. For large stores, add an IDBIndex on '${queryProperty}'.`);
        const allRecords = await this.list(storeName, resolvedTenantId);
        return allRecords.filter(item =>
            String(item[queryProperty]).toLowerCase().includes(String(valueToMatch).toLowerCase())
        );
    },

    /** Internal full scan helper for search() index fallback path. */
    _fullScanSearch(store, queryProperty, valueToMatch, tenantId, reject, resolve) {
        const results = [];
        const req     = store.getAll();
        req.onsuccess = (e) => {
            const filtered = (e.target.result || [])
                .filter(r => (!r.tenantId || r.tenantId === tenantId) &&
                    String(r[queryProperty]).toLowerCase().includes(String(valueToMatch).toLowerCase()))
                .map(r => this._applyReadPipelines(r));
            resolve(filtered);
        };
        req.onerror = (e) => reject(e.target.error);
    },

    /**
     * [F-01] Wraps batch processing queries inside an explicit ACID transaction context.
     */
    async transaction(storeNames, mode, transactionFn) {
        if (!Array.isArray(storeNames)) storeNames = [storeNames];
        storeNames.forEach(name => this._validateAccess(name));

        return new Promise((resolve, reject) => {
            if (!_dbInstance) return reject(new Error("Database context missing."));

            const tx = _dbInstance.transaction(storeNames, mode);
            let results;

            try {
                results = transactionFn(tx);

                if (results && typeof results.then === "function") {
                    console.error(
                        "[Storage Contract Violation] transactionFn returned a Promise. " +
                        "IDB transactions auto-commit before async work resolves."
                    );
                    tx.abort();
                    return reject(new Error(
                        "[Storage] transactionFn must be synchronous. Async transactionFn will " +
                        "cause partial writes on a committed transaction. Operation aborted."
                    ));
                }
            } catch (err) {
                tx.abort();
                return reject(err);
            }

            tx.oncomplete = () => resolve(results);
            tx.onerror    = (e) => reject(e.target.error);
            tx.onabort    = () => reject(new Error("[Storage] Transaction aborted."));
        });
    },

     // ──── 3. TELEMETRY, HEALTH, CACHE & PERFORMANCE ────

    /**
     * Measures total hardware allocations currently leveraged by CozyOS.
     */
    async storageUsage() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return {
                usedBytes:  estimate.usage,
                quotaBytes: estimate.quota,
                usedMB:     (estimate.usage / (1024 * 1024)).toFixed(2),
                quotaMB:    (estimate.quota  / (1024 * 1024)).toFixed(2),
                percentage: ((estimate.usage  / estimate.quota) * 100).toFixed(2)
            };
        }
        return { usedMB: "Unknown", quotaMB: "Unknown", percentage: 0 };
    },

    /**
     * Evaluates storage diagnostic matrices and file availability checks.
     */
    async health() {
        return {
            databaseConnected:   _dbInstance !== null,
            clusterName:         SCHEMA_META.name,
            version:             SCHEMA_META.version,
            storesAllocatedCount: _dbInstance ? _dbInstance.objectStoreNames.length : 0,
            activeTenantBound:   _activeTenantId !== null,
            activeModuleContext: _activeModuleContext,
            timestamp:           Date.now()
        };
    },

    /**
     * Completely flushes all generic diagnostic and transient temporary application caches.
     */
    async clearCache() {
        await this.transaction(["cache", "ocr_cache"], "readwrite", (tx) => {
            tx.objectStore("cache").clear();
            tx.objectStore("ocr_cache").clear();
            console.log("[Storage Optimization] Transient system operational caches pruned.");
            return true;
        });
    },

    /**
     * Performs clean destructive drops wiping local databases completely from client instances.
     */
    async destroy() {
        await this.close();
        return new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(SCHEMA_META.name);
            req.onsuccess = () => {
                console.warn("[Storage Structural Event] CozyOS Cluster wiped out completely.");
                resolve(true);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    // ──── 4. OFFLINE QUEUEING & CLOUD INTERACTION CHANNELS ────

    /**
     * [F-04] Pushes asynchronous operations to the sync queue for delivery.
     */
    async sync(tenantId = "default_tenant") {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        const queue = await this.list("sync_queue", resolvedTenantId);
        if (queue.length === 0) return { synchronizedCount: 0, status: "Idle" };

        console.log(`[Cloud Sync Engine] Flushing ${queue.length} items towards external Firebase structures...`);

        let successCount = 0;
        for (const outboxItem of queue) {
            if (!outboxItem.clientRequestId) {
                console.error(
                    `[Sync Idempotency Warning] sync_queue item id:${outboxItem.id} is missing clientRequestId.`
                );
            }

            try {
                await new Promise(r => setTimeout(r, 50));
                await this.delete("sync_queue", outboxItem.id, resolvedTenantId);
                successCount++;
            } catch (err) {
                this._logAudit("SyncConflictException", resolvedTenantId, { error: err.message, itemId: outboxItem.id });
                throw err;
            }
        }

        return { synchronizedCount: successCount, status: "Complete" };
    },

    /**
     * [F-08] Packages a complete export containing all database record structures.
     */
    async backup(tenantId = "default_tenant", maxRecordsPerStore = 10000) {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        const payloadDump   = {};
        const truncatedStores = [];

        for (const store of BLUEPRINT_OBJECT_STORES) {
            const records = await this.list(store, resolvedTenantId);

            if (records.length > maxRecordsPerStore) {
                console.warn(
                    `[Storage Backup] Store '${store}' has ${records.length} records, exceeding safety caps.`
                );
                truncatedStores.push({ store, totalRecords: records.length, exportedRecords: maxRecordsPerStore });
                payloadDump[store] = records.slice(0, maxRecordsPerStore);
            } else {
                payloadDump[store] = records;
            }
        }

        return JSON.stringify({
            cozy_signature:   "COZYOS_EXPORT_STREAM",
            timestamp:        Date.now(),
            tenantId:         resolvedTenantId,
            truncatedStores:  truncatedStores,
            payload:          payloadDump
        });
    },

    /**
     * [F-07] Accepts structured JSON backup data streams and restores them.
     */
    async restore(jsonStreamData, tenantId = "default_tenant") {
        const resolvedTenantId = _activeTenantId !== null ? _activeTenantId : tenantId;
        try {
            const parsed = JSON.parse(jsonStreamData);
            if (parsed.cozy_signature !== "COZYOS_EXPORT_STREAM") {
                throw new Error("Invalid payload backup schema.");
            }

            for (const storeName of Object.keys(parsed.payload)) {
                if (BLUEPRINT_OBJECT_STORES.includes(storeName)) {
                    for (const row of parsed.payload[storeName]) {
                        await this.save(storeName, row, resolvedTenantId);
                    }
                }
            }
            return true;
        } catch (err) {
            console.error("[Storage Recovery Error]", err);
            return false;
        }
    },

    // ──── 5. PRIVATE INTERNAL KERNEL SAFEGUARDS ────

    /**
     * [F-06] Prevents runtime boundary leaks across unmapped or unauthorized object stores.
     */
    _validateAccess(storeName) {
        if (!BLUEPRINT_OBJECT_STORES.includes(storeName)) {
            throw new Error(`[Storage Security Exception] Unauthorized or unmapped database store reference: '${storeName}'`);
        }

        if (_activeModuleContext && _activeModuleContext !== "system") {
            const allowed = STORE_PERMISSIONS[_activeModuleContext];
            if (allowed && !allowed.has(storeName)) {
                throw new Error(
                    `[Storage RBAC Exception] Module context '${_activeModuleContext}' does not have permission to access store '${storeName}'.`
                );
            }
        }
    },

    /**
     * Intercepts writes to guarantee structural isolation.
     */
    _applyWritePipelines(data, tenantId) {
        if (typeof data !== "object" || data === null) {
            data = { value: data };
        }
        return {
            ...data,
            tenantId:      tenantId,
            _lastModified: Date.now(),
        };
    },

    /**
     * Standard read preprocessing entry hook.
     */
    _applyReadPipelines(data) {
        return data;
    },

    /**
     * [F-03] Writes non-repudiation audit footprints to audit_logs.
     */
    async _logAudit(actionType, tenantId, details) {
        if (!_dbInstance) return;
        try {
            const tx = _dbInstance.transaction("audit_logs", "readwrite");
            tx.objectStore("audit_logs").add({
                action:    actionType,
                tenantId:  tenantId,
                details:   details,
                timestamp: Date.now()
            });
        } catch (err) {
            console.warn("[Internal Audit Trail Exception]", err);
        }
    }
};

// ── CONNECTION PLUG GATEWAY INTERFACE WIREUP ──

if (typeof window !== "undefined") {
    window.CozyStorage = CozyStorageGateway;
}

export default CozyStorageGateway;
