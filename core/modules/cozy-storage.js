/**
 * CozyOS Enterprise Framework — Storage Subsystem
 * File Reference: core/modules/storage/cozy-storage.js
 * Layer: Core Infrastructure / Storage Coordination Kernel
 * Version: 1.0.0-ENTERPRISE
 *
 * Mission: coordinate storage spaces, objects, folders, collections,
 * versions, snapshots, indexes, search, quotas, and every other storage
 * concern across CozyOS — without ever implementing a database, filesystem,
 * cloud service, compression, encryption, or sync engine itself. This is a
 * coordinator: real work is always delegated to registered adapters
 * (window.CozyOS.CozyStorage.registerAdapter(category, adapter)).
 *
 * Offline operation is mandatory; internet/sync support is optional and
 * always delegated to CozySync. Nothing in this file touches the network,
 * the filesystem, or a database.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};

    const VERSION = "1.0.0-ENTERPRISE";

    // ============================================================
    // Shared internal utilities
    // ============================================================

    function generateId(prefix) {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    /** Deep clone + deep freeze. Preserves Date/RegExp/Map/Set (unlike a
     *  naive Object.keys()-only clone, which silently corrupts them to {}). */
    function deepCloneAndFreeze(obj, seen) {
        seen = seen || new Map();
        if (obj === null || typeof obj !== "object") return obj;
        if (seen.has(obj)) return seen.get(obj);

        if (Array.isArray(obj)) {
            const out = [];
            seen.set(obj, out);
            obj.forEach(item => out.push(deepCloneAndFreeze(item, seen)));
            return Object.freeze(out);
        }
        if (obj instanceof Date) return Object.freeze(new Date(obj.getTime()));
        if (obj instanceof RegExp) return Object.freeze(new RegExp(obj.source, obj.flags));
        if (obj instanceof Map) {
            const out = new Map();
            seen.set(obj, out);
            for (const [k, v] of obj) out.set(deepCloneAndFreeze(k, seen), deepCloneAndFreeze(v, seen));
            return Object.freeze(out);
        }
        if (obj instanceof Set) {
            const out = new Set();
            seen.set(obj, out);
            for (const v of obj) out.add(deepCloneAndFreeze(v, seen));
            return Object.freeze(out);
        }
        const out = {};
        seen.set(obj, out);
        for (const key of Object.keys(obj)) out[key] = deepCloneAndFreeze(obj[key], seen);
        return Object.freeze(out);
    }

    /** Fields CozyStorage must never accept or store, anywhere metadata is
     *  written — enforced once, here, and reused by every registry that
     *  accepts caller-supplied metadata (Single Source of Truth). */
    const FORBIDDEN_CREDENTIAL_FIELDS = Object.freeze([
        "password", "pin", "secret", "token", "privateKey", "seedPhrase",
        "biometricTemplate", "faceTemplate", "voiceTemplate", "fingerprintTemplate"
    ]);

    function assertNoCredentialFields(obj, context) {
        if (!obj || typeof obj !== "object") return;
        for (const field of FORBIDDEN_CREDENTIAL_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(obj, field)) {
                throw new Error(`[CozyStorage] Rejected: '${field}' is a forbidden credential field and cannot be stored (context: ${context}). CozyStorage never stores credentials — that belongs to CozyIdentity/CozySecurity.`);
            }
        }
    }

    // ============================================================
    // Audit Registry — every mutating call anywhere in this kernel
    // funnels through here. Append-only; never fabricated, never rewritten.
    // ============================================================

    const auditTrail = [];

    function recordAudit(action, targetType, targetId, detail) {
        auditTrail.push(deepCloneAndFreeze({
            id: generateId("audit"),
            action,
            targetType,
            targetId,
            detail: detail || null,
            timestamp: nowIso()
        }));
    }

    function listAudit(filter) {
        filter = filter || {};
        return Object.freeze(
            auditTrail
                .filter(entry =>
                    (!filter.action || entry.action === filter.action) &&
                    (!filter.targetType || entry.targetType === filter.targetType) &&
                    (!filter.targetId || entry.targetId === filter.targetId)
                )
                .slice()
        );
    }

    // ============================================================
    // Storage Quotas — updated internally by the registries below.
    // ============================================================

    const quota = {
        maxSize: Infinity,
        currentSize: 0,
        objectCount: 0,
        folderCount: 0,
        versionCount: 0,
        snapshotCount: 0,
        collectionCount: 0
    };

    function setMaxSize(bytes) {
        if (typeof bytes !== "number" || bytes <= 0) {
            throw new TypeError("[CozyStorage] setMaxSize requires a positive number of bytes.");
        }
        quota.maxSize = bytes;
    }

    function getQuota() {
        return deepCloneAndFreeze({
            maxSize: quota.maxSize,
            currentSize: quota.currentSize,
            availableSpace: quota.maxSize === Infinity ? Infinity : Math.max(0, quota.maxSize - quota.currentSize),
            objectCount: quota.objectCount,
            folderCount: quota.folderCount,
            versionCount: quota.versionCount,
            snapshotCount: quota.snapshotCount,
            collectionCount: quota.collectionCount
        });
    }

    function assertWithinQuota(additionalBytes) {
        if (quota.maxSize !== Infinity && quota.currentSize + additionalBytes > quota.maxSize) {
            throw new Error(`[CozyStorage] Quota exceeded: adding ${additionalBytes} bytes would exceed the ${quota.maxSize}-byte limit (currently ${quota.currentSize}).`);
        }
    }

    // ============================================================
    // Generic simple registry factory — used for every bookkeeping-only
    // registry below (Storage Types, Device Storage, Device Capabilities,
    // Plugins, Backup Plans, Restore Requests). Mirrors the same proven
    // shape as the certified TestRegistry: private Map, validated writes,
    // deep-frozen reads, case-insensitive id matching.
    // ============================================================

    function createSimpleRegistry(registryLabel, requiredFields) {
        const store = new Map();

        function register(id, record) {
            if (!id || typeof id !== "string" || id.trim() === "") {
                throw new Error(`[CozyStorage:${registryLabel}] A non-empty string id is required.`);
            }
            for (const field of requiredFields) {
                if (record == null || record[field] === undefined) {
                    throw new Error(`[CozyStorage:${registryLabel}] Missing required field '${field}'.`);
                }
            }
            assertNoCredentialFields(record, registryLabel);
            const key = id.trim().toLowerCase();
            if (store.has(key)) {
                throw new Error(`[CozyStorage:${registryLabel}] '${id}' is already registered.`);
            }
            const entry = deepCloneAndFreeze(Object.assign({}, record, { id, registeredAt: nowIso() }));
            store.set(key, entry);
            recordAudit("create", registryLabel, id, null);
            return entry;
        }

        function remove(id) {
            if (!id || typeof id !== "string") return false;
            const removed = store.delete(id.trim().toLowerCase());
            if (removed) recordAudit("delete", registryLabel, id, null);
            return removed;
        }

        function get(id) {
            if (!id || typeof id !== "string") return null;
            return store.get(id.trim().toLowerCase()) || null;
        }

        function list() {
            return Object.freeze(Array.from(store.values()));
        }

        function has(id) {
            return !!id && typeof id === "string" && store.has(id.trim().toLowerCase());
        }

        function count() {
            return store.size;
        }

        return { register, remove, get, list, has, count };
    }

    // ============================================================
    // Adapter Registry — the ONLY place real work happens, always
    // delegated. Compression/Encryption/Backup/Restore/Sync all route
    // through this.
    // ============================================================

    const adapters = new Map();

    function registerAdapter(category, adapter) {
        if (!category || typeof category !== "string") {
            throw new TypeError("[CozyStorage] registerAdapter requires a category string.");
        }
        if (!adapter || typeof adapter !== "object") {
            throw new TypeError("[CozyStorage] registerAdapter requires an adapter object.");
        }
        adapters.set(category, adapter);
        recordAudit("create", "Adapter", category, null);
    }

    function hasAdapter(category) {
        return adapters.has(category);
    }

    function delegate(category, method, ...args) {
        const adapter = adapters.get(category);
        if (!adapter || typeof adapter[method] !== "function") {
            throw new Error(`[CozyStorage] No '${category}' adapter registered with a '${method}' method. CozyStorage coordinates ${category} only — it never implements it directly.`);
        }
        return adapter[method](...args);
    }

    // ============================================================
    // Storage Space Lifecycle
    // ============================================================

    const storageSpaces = new Map();

    function createStorageSpace(id, type, meta) {
        if (!id || typeof id !== "string") throw new TypeError("[CozyStorage] createStorageSpace requires a string id.");
        if (storageSpaces.has(id)) throw new Error(`[CozyStorage] Storage space '${id}' already exists.`);
        assertNoCredentialFields(meta, "StorageSpace");
        const space = { id, type: type || "custom", state: "closed", meta: meta || {}, createdAt: nowIso(), updatedAt: nowIso() };
        storageSpaces.set(id, space);
        recordAudit("create", "StorageSpace", id, { type });
        return deepCloneAndFreeze(space);
    }

    function _requireSpace(id) {
        const space = storageSpaces.get(id);
        if (!space) throw new Error(`[CozyStorage] Storage space '${id}' does not exist.`);
        return space;
    }

    function _transitionSpace(id, action, fromStates, toState) {
        const space = _requireSpace(id);
        if (fromStates && !fromStates.includes(space.state)) {
            throw new Error(`[CozyStorage] Cannot ${action} storage space '${id}' from state '${space.state}'.`);
        }
        space.state = toState;
        space.updatedAt = nowIso();
        recordAudit(action, "StorageSpace", id, { toState });
        return deepCloneAndFreeze(space);
    }

    function openStorage(id) { return _transitionSpace(id, "open", ["closed", "archived"], "open"); }
    function closeStorage(id) { return _transitionSpace(id, "close", ["open", "locked"], "closed"); }
    function lockStorage(id) { return _transitionSpace(id, "lock", ["open", "closed"], "locked"); }
    function unlockStorage(id) { return _transitionSpace(id, "unlock", ["locked"], "closed"); }
    function archiveStorageSpace(id) { return _transitionSpace(id, "archive", ["closed"], "archived"); }
    function restoreStorageSpace(id) { return _transitionSpace(id, "restore", ["archived"], "closed"); }

    function deleteStorageSpace(id) {
        const space = _requireSpace(id);
        if (space.state === "locked") throw new Error(`[CozyStorage] Cannot delete a locked storage space ('${id}'). Unlock it first.`);
        storageSpaces.delete(id);
        recordAudit("delete", "StorageSpace", id, null);
        return true;
    }

    function cloneStorageSpace(id, newId) {
        const space = _requireSpace(id);
        if (!newId || typeof newId !== "string") throw new TypeError("[CozyStorage] cloneStorageSpace requires a new string id.");
        if (storageSpaces.has(newId)) throw new Error(`[CozyStorage] Storage space '${newId}' already exists.`);
        const clone = { id: newId, type: space.type, state: "closed", meta: deepCloneAndFreeze(space.meta), createdAt: nowIso(), updatedAt: nowIso() };
        storageSpaces.set(newId, clone);
        recordAudit("create", "StorageSpace", newId, { clonedFrom: id });
        return deepCloneAndFreeze(clone);
    }

    function snapshotStorageSpace(id) {
        const space = _requireSpace(id);
        const snap = deepCloneAndFreeze({ id: generateId("spacesnap"), storageSpaceId: id, state: space.meta, capturedAt: nowIso() });
        recordAudit("snapshot", "StorageSpace", id, { snapshotId: snap.id });
        return snap;
    }

    function getStorageSpace(id) {
        const space = storageSpaces.get(id);
        return space ? deepCloneAndFreeze(space) : null;
    }

    function listStorageSpaces() {
        return Object.freeze(Array.from(storageSpaces.values()).map(s => deepCloneAndFreeze(s)));
    }

    // ============================================================
    // Storage Types Registry — open, additive. Future types register
    // without modifying this file.
    // ============================================================

    const storageTypes = createSimpleRegistry("StorageType", ["type"]);
    function registerStorageType(type) { return storageTypes.register(type, { type }); }
    function listStorageTypes() { return storageTypes.list(); }

    // ============================================================
    // Folder Registry — unlimited nesting via parentId.
    // Deletion is refused while children exist (coordinator does not make
    // the business decision of cascading deletes on your behalf).
    // ============================================================

    const folders = new Map();

    function createFolder(name, parentId) {
        if (!name || typeof name !== "string") throw new TypeError("[CozyStorage] createFolder requires a string name.");
        if (parentId && !folders.has(parentId)) throw new Error(`[CozyStorage] Parent folder '${parentId}' does not exist.`);
        const id = generateId("folder");
        const folder = { id, name, parentId: parentId || null, state: "active", createdAt: nowIso(), updatedAt: nowIso() };
        folders.set(id, folder);
        quota.folderCount++;
        recordAudit("create", "Folder", id, { name, parentId: parentId || null });
        return deepCloneAndFreeze(folder);
    }

    function _requireFolder(id) {
        const folder = folders.get(id);
        if (!folder) throw new Error(`[CozyStorage] Folder '${id}' does not exist.`);
        return folder;
    }

    function renameFolder(id, newName) {
        const folder = _requireFolder(id);
        if (!newName || typeof newName !== "string") throw new TypeError("[CozyStorage] renameFolder requires a string newName.");
        folder.name = newName;
        folder.updatedAt = nowIso();
        recordAudit("update", "Folder", id, { renamedTo: newName });
        return deepCloneAndFreeze(folder);
    }

    function moveFolder(id, newParentId) {
        const folder = _requireFolder(id);
        if (newParentId === id) throw new Error("[CozyStorage] A folder cannot be its own parent.");
        if (newParentId && !folders.has(newParentId)) throw new Error(`[CozyStorage] Target parent folder '${newParentId}' does not exist.`);
        folder.parentId = newParentId || null;
        folder.updatedAt = nowIso();
        recordAudit("update", "Folder", id, { movedTo: newParentId || null });
        return deepCloneAndFreeze(folder);
    }

    function archiveFolder(id) {
        const folder = _requireFolder(id);
        folder.state = "archived";
        folder.updatedAt = nowIso();
        recordAudit("archive", "Folder", id, null);
        return deepCloneAndFreeze(folder);
    }

    function restoreFolder(id) {
        const folder = _requireFolder(id);
        folder.state = "active";
        folder.updatedAt = nowIso();
        recordAudit("restore", "Folder", id, null);
        return deepCloneAndFreeze(folder);
    }

    function deleteFolder(id) {
        _requireFolder(id);
        const hasChildFolders = Array.from(folders.values()).some(f => f.parentId === id);
        const hasChildObjects = Array.from(objects.values()).some(o => o.folderId === id);
        if (hasChildFolders || hasChildObjects) {
            throw new Error(`[CozyStorage] Cannot delete folder '${id}': it still contains child folders or objects. Move or remove them first.`);
        }
        folders.delete(id);
        quota.folderCount--;
        recordAudit("delete", "Folder", id, null);
        return true;
    }

    function listFolders(filter) {
        filter = filter || {};
        return Object.freeze(
            Array.from(folders.values())
                .filter(f => (filter.parentId === undefined || f.parentId === filter.parentId) && (!filter.state || f.state === filter.state))
                .map(f => deepCloneAndFreeze(f))
        );
    }

    // ============================================================
    // Object Registry — the central registry. Every object carries
    // metadata (validated against the credential blocklist) and may
    // belong to a folder.
    // ============================================================

    const objects = new Map();

    function registerObject(input) {
        if (!input || typeof input !== "object") throw new TypeError("[CozyStorage] registerObject requires an object payload.");
        if (input.folderId && !folders.has(input.folderId)) throw new Error(`[CozyStorage] Folder '${input.folderId}' does not exist.`);
        assertNoCredentialFields(input.metadata, "Object.metadata");

        const id = input.id || generateId("obj");
        if (objects.has(id)) throw new Error(`[CozyStorage] Object '${id}' already exists.`);

        const size = typeof input.size === "number" ? input.size : 0;
        assertWithinQuota(size);

        const record = {
            id,
            folderId: input.folderId || null,
            contentType: input.contentType || "application/octet-stream",
            collection: input.collection || null,
            state: "active",
            size,
            metadata: Object.assign({
                ownerId: null, organizationId: null, createdAt: nowIso(), updatedAt: nowIso(),
                version: 1, tags: [], labels: [], category: input.category || "custom",
                language: null, location: null, permissions: null, checksum: null,
                contentType: input.contentType || "application/octet-stream", size
            }, input.metadata || {})
        };
        objects.set(id, record);
        quota.objectCount++;
        quota.currentSize += size;
        recordAudit("create", "Object", id, { folderId: record.folderId });
        return deepCloneAndFreeze(record);
    }

    function _requireObject(id) {
        const obj = objects.get(id);
        if (!obj) throw new Error(`[CozyStorage] Object '${id}' does not exist.`);
        return obj;
    }

    function updateObject(id, patch) {
        const obj = _requireObject(id);
        if (patch && patch.metadata) assertNoCredentialFields(patch.metadata, "Object.metadata");
        if (patch && typeof patch.size === "number" && patch.size !== obj.size) {
            assertWithinQuota(patch.size - obj.size);
            quota.currentSize += (patch.size - obj.size);
            obj.size = patch.size;
        }
        if (patch && patch.metadata) Object.assign(obj.metadata, patch.metadata);
        if (patch && patch.contentType) obj.contentType = patch.contentType;
        obj.metadata.updatedAt = nowIso();
        obj.metadata.version = (obj.metadata.version || 1) + 1;
        recordAudit("update", "Object", id, null);
        return deepCloneAndFreeze(obj);
    }

    function removeObject(id) {
        const obj = _requireObject(id);
        objects.delete(id);
        quota.objectCount--;
        quota.currentSize -= obj.size;
        recordAudit("delete", "Object", id, null);
        return true;
    }

    function moveObject(id, newFolderId) {
        const obj = _requireObject(id);
        if (newFolderId && !folders.has(newFolderId)) throw new Error(`[CozyStorage] Folder '${newFolderId}' does not exist.`);
        obj.folderId = newFolderId || null;
        obj.metadata.updatedAt = nowIso();
        recordAudit("update", "Object", id, { movedTo: newFolderId || null });
        return deepCloneAndFreeze(obj);
    }

    function copyObject(id, newId) {
        const obj = _requireObject(id);
        const targetId = newId || generateId("obj");
        if (objects.has(targetId)) throw new Error(`[CozyStorage] Object '${targetId}' already exists.`);
        assertWithinQuota(obj.size);
        const mutableCopy = JSON.parse(JSON.stringify(obj));
        mutableCopy.id = targetId;
        objects.set(targetId, mutableCopy);
        quota.objectCount++;
        quota.currentSize += obj.size;
        recordAudit("create", "Object", targetId, { copiedFrom: id });
        return deepCloneAndFreeze(mutableCopy);
    }

    function archiveObject(id) {
        const obj = _requireObject(id);
        obj.state = "archived";
        obj.metadata.updatedAt = nowIso();
        recordAudit("archive", "Object", id, null);
        return deepCloneAndFreeze(obj);
    }

    function restoreObject(id) {
        const obj = _requireObject(id);
        obj.state = "active";
        obj.metadata.updatedAt = nowIso();
        recordAudit("restore", "Object", id, null);
        return deepCloneAndFreeze(obj);
    }

    function getObject(id) {
        const obj = objects.get(id);
        if (obj) recordAudit("read", "Object", id, null);
        return obj ? deepCloneAndFreeze(obj) : null;
    }

    function listObjects(filter) {
        filter = filter || {};
        return Object.freeze(
            Array.from(objects.values())
                .filter(o =>
                    (filter.folderId === undefined || o.folderId === filter.folderId) &&
                    (!filter.state || o.state === filter.state) &&
                    (!filter.collection || o.collection === filter.collection)
                )
                .map(o => deepCloneAndFreeze(o))
        );
    }

    // ============================================================
    // Collection Registry — logical groupings (Session, Identity, Church,
    // Marketplace, Translation, AI, Device, Custom).
    // ============================================================

    const collections = new Map();

    function createCollection(type, name) {
        if (!type || typeof type !== "string") throw new TypeError("[CozyStorage] createCollection requires a string type.");
        const id = generateId("coll");
        const collection = { id, type, name: name || type, objectIds: [], createdAt: nowIso() };
        collections.set(id, collection);
        quota.collectionCount++;
        recordAudit("create", "Collection", id, { type });
        return deepCloneAndFreeze(collection);
    }

    function addToCollection(collectionId, objectId) {
        const collection = collections.get(collectionId);
        if (!collection) throw new Error(`[CozyStorage] Collection '${collectionId}' does not exist.`);
        _requireObject(objectId);
        if (!collection.objectIds.includes(objectId)) collection.objectIds.push(objectId);
        recordAudit("update", "Collection", collectionId, { added: objectId });
        return deepCloneAndFreeze(collection);
    }

    function removeFromCollection(collectionId, objectId) {
        const collection = collections.get(collectionId);
        if (!collection) throw new Error(`[CozyStorage] Collection '${collectionId}' does not exist.`);
        collection.objectIds = collection.objectIds.filter(id => id !== objectId);
        recordAudit("update", "Collection", collectionId, { removed: objectId });
        return deepCloneAndFreeze(collection);
    }

    function getCollection(id) {
        const collection = collections.get(id);
        return collection ? deepCloneAndFreeze(collection) : null;
    }

    function listCollections(filter) {
        filter = filter || {};
        return Object.freeze(
            Array.from(collections.values())
                .filter(c => !filter.type || c.type === filter.type)
                .map(c => deepCloneAndFreeze(c))
        );
    }

    // ============================================================
    // Version History — never destroys prior versions unless the caller
    // explicitly calls a delete (no such method is exposed here, per spec).
    // ============================================================

    const versionHistory = new Map();

    function createVersion(objectId, data) {
        _requireObject(objectId);
        if (!versionHistory.has(objectId)) versionHistory.set(objectId, []);
        const history = versionHistory.get(objectId);
        const version = { versionId: generateId("ver"), objectId, data: deepCloneAndFreeze(data), createdAt: nowIso() };
        history.push(version);
        quota.versionCount++;
        recordAudit("version", "Object", objectId, { versionId: version.versionId });
        return deepCloneAndFreeze(version);
    }

    function listVersions(objectId) {
        return Object.freeze((versionHistory.get(objectId) || []).map(v => deepCloneAndFreeze(v)));
    }

    function restoreVersion(objectId, versionId) {
        const history = versionHistory.get(objectId) || [];
        const version = history.find(v => v.versionId === versionId);
        if (!version) throw new Error(`[CozyStorage] Version '${versionId}' not found for object '${objectId}'.`);
        const obj = _requireObject(objectId);
        Object.assign(obj.metadata, { restoredFromVersion: versionId, updatedAt: nowIso() });
        recordAudit("restore", "Object", objectId, { restoredFromVersion: versionId });
        return deepCloneAndFreeze(obj);
    }

    function compareVersions(objectId, versionIdA, versionIdB) {
        const history = versionHistory.get(objectId) || [];
        const a = history.find(v => v.versionId === versionIdA);
        const b = history.find(v => v.versionId === versionIdB);
        if (!a || !b) throw new Error(`[CozyStorage] One or both versions not found for object '${objectId}'.`);
        const keys = new Set([...Object.keys(a.data || {}), ...Object.keys(b.data || {})]);
        const differences = {};
        for (const key of keys) {
            const av = a.data ? a.data[key] : undefined;
            const bv = b.data ? b.data[key] : undefined;
            if (JSON.stringify(av) !== JSON.stringify(bv)) differences[key] = { from: av, to: bv };
        }
        return deepCloneAndFreeze({ objectId, versionIdA, versionIdB, differences });
    }

    // ============================================================
    // Snapshot Registry — Church / Marketplace / School / Workspace scopes.
    // ============================================================

    const snapshots = new Map();

    function createSnapshot(scope, label) {
        if (!scope || typeof scope !== "string") throw new TypeError("[CozyStorage] createSnapshot requires a string scope.");
        const id = generateId("snap");
        const snapshot = {
            id, scope, label: label || null,
            capturedObjects: Array.from(objects.values()).filter(o => !scope || o.collection === scope || scope === "Workspace"),
            capturedAt: nowIso()
        };
        snapshots.set(id, deepCloneAndFreeze(snapshot));
        quota.snapshotCount++;
        recordAudit("snapshot", "Snapshot", id, { scope });
        return snapshots.get(id);
    }

    function restoreSnapshot(id) {
        const snapshot = snapshots.get(id);
        if (!snapshot) throw new Error(`[CozyStorage] Snapshot '${id}' does not exist.`);
        recordAudit("restore", "Snapshot", id, null);
        return snapshot;
    }

    function exportSnapshot(id) {
        const snapshot = snapshots.get(id);
        if (!snapshot) throw new Error(`[CozyStorage] Snapshot '${id}' does not exist.`);
        recordAudit("export", "Snapshot", id, null);
        return snapshot;
    }

    function importSnapshot(data) {
        if (!data || !data.scope) throw new TypeError("[CozyStorage] importSnapshot requires snapshot data with a scope.");
        const id = generateId("snap");
        const snapshot = deepCloneAndFreeze(Object.assign({}, data, { id, importedAt: nowIso() }));
        snapshots.set(id, snapshot);
        quota.snapshotCount++;
        recordAudit("import", "Snapshot", id, { scope: data.scope });
        return snapshot;
    }

    function listSnapshots(filter) {
        filter = filter || {};
        return Object.freeze(Array.from(snapshots.values()).filter(s => !filter.scope || s.scope === filter.scope));
    }

    // ============================================================
    // Index Registry — bookkeeping only. No search intelligence lives here.
    // ============================================================

    const indexes = new Map();

    function registerIndex(name) {
        if (!name || typeof name !== "string") throw new TypeError("[CozyStorage] registerIndex requires a string name.");
        if (indexes.has(name)) throw new Error(`[CozyStorage] Index '${name}' already registered.`);
        indexes.set(name, new Map());
        recordAudit("create", "Index", name, null);
    }

    function addToIndex(name, key, targetId) {
        const index = indexes.get(name);
        if (!index) throw new Error(`[CozyStorage] Index '${name}' is not registered.`);
        if (!index.has(key)) index.set(key, new Set());
        index.get(key).add(targetId);
    }

    function removeFromIndex(name, key, targetId) {
        const index = indexes.get(name);
        if (!index) throw new Error(`[CozyStorage] Index '${name}' is not registered.`);
        const set = index.get(key);
        if (set) set.delete(targetId);
    }

    function queryIndex(name, key) {
        const index = indexes.get(name);
        if (!index) throw new Error(`[CozyStorage] Index '${name}' is not registered.`);
        return Object.freeze(Array.from(index.get(key) || []));
    }

    function listIndexes() {
        return Object.freeze(Array.from(indexes.keys()));
    }

    // ============================================================
    // Search Registry — deterministic, linear scan. No AI.
    // ============================================================

    function search(criteria) {
        criteria = criteria || {};
        return Object.freeze(
            Array.from(objects.values())
                .filter(o => {
                    if (criteria.id && o.id !== criteria.id) return false;
                    if (criteria.name && o.metadata.name !== criteria.name) return false;
                    if (criteria.type && o.contentType !== criteria.type) return false;
                    if (criteria.tag && !(o.metadata.tags || []).includes(criteria.tag)) return false;
                    if (criteria.language && o.metadata.language !== criteria.language) return false;
                    if (criteria.organization && o.metadata.organizationId !== criteria.organization) return false;
                    if (criteria.collection && o.collection !== criteria.collection) return false;
                    if (criteria.folder && o.folderId !== criteria.folder) return false;
                    if (criteria.date && (o.metadata.createdAt || "").slice(0, 10) !== criteria.date) return false;
                    if (criteria.metadata) {
                        for (const key of Object.keys(criteria.metadata)) {
                            if (o.metadata[key] !== criteria.metadata[key]) return false;
                        }
                    }
                    return true;
                })
                .map(o => deepCloneAndFreeze(o))
        );
    }

    // ============================================================
    // Compression / Encryption Registries — coordination + delegation only.
    // ============================================================

    function registerCompressionAdapter(name, adapter) { registerAdapter(`compression:${name}`, adapter); }
    function requestCompress(objectId, adapterName, options) {
        _requireObject(objectId);
        const result = delegate(`compression:${adapterName}`, "compress", objectId, options);
        recordAudit("update", "Object", objectId, { compressedBy: adapterName });
        return result;
    }
    function requestDecompress(objectId, adapterName, options) {
        _requireObject(objectId);
        const result = delegate(`compression:${adapterName}`, "decompress", objectId, options);
        recordAudit("update", "Object", objectId, { decompressedBy: adapterName });
        return result;
    }

    function registerEncryptionAdapter(name, adapter) { registerAdapter(`encryption:${name}`, adapter); }
    function requestEncrypt(objectId, adapterName, options) {
        _requireObject(objectId);
        const result = delegate(`encryption:${adapterName}`, "encrypt", objectId, options);
        recordAudit("update", "Object", objectId, { encryptedBy: adapterName });
        return result;
    }
    function requestDecrypt(objectId, adapterName, options) {
        _requireObject(objectId);
        const result = delegate(`encryption:${adapterName}`, "decrypt", objectId, options);
        recordAudit("update", "Object", objectId, { decryptedBy: adapterName });
        return result;
    }

    // ============================================================
    // Backup Registry — Plans / History / Targets / Status. Coordination
    // only; the actual backup engine is always an adapter.
    // ============================================================

    const backupPlans = createSimpleRegistry("BackupPlan", ["target", "schedule"]);
    const backupHistory = [];

    function createBackupPlan(id, target, schedule) { return backupPlans.register(id, { target, schedule, status: "idle" }); }
    function listBackupPlans() { return backupPlans.list(); }
    function recordBackupEvent(planId, status, detail) {
        if (!backupPlans.has(planId)) throw new Error(`[CozyStorage] Backup plan '${planId}' does not exist.`);
        const event = deepCloneAndFreeze({ id: generateId("backupevt"), planId, status, detail: detail || null, timestamp: nowIso() });
        backupHistory.push(event);
        recordAudit("update", "BackupPlan", planId, { status });
        return event;
    }
    function listBackupHistory(planId) {
        return Object.freeze(backupHistory.filter(e => !planId || e.planId === planId));
    }
    function getBackupStatus(planId) {
        const plan = backupPlans.get(planId);
        if (!plan) throw new Error(`[CozyStorage] Backup plan '${planId}' does not exist.`);
        const history = backupHistory.filter(e => e.planId === planId);
        return deepCloneAndFreeze({ planId, lastEvent: history[history.length - 1] || null });
    }

    // ============================================================
    // Restore Registry — Requests / History / Validation. Never restores
    // files directly — that's an adapter's job.
    // ============================================================

    const restoreRequests = createSimpleRegistry("RestoreRequest", ["source"]);
    const restoreHistory = [];

    function createRestoreRequest(id, source, detail) { return restoreRequests.register(id, { source, detail: detail || null, status: "pending" }); }
    function listRestoreRequests() { return restoreRequests.list(); }
    function validateRestoreRequest(id) {
        const request = restoreRequests.get(id);
        if (!request) throw new Error(`[CozyStorage] Restore request '${id}' does not exist.`);
        const valid = !!request.source;
        recordAudit("update", "RestoreRequest", id, { validated: valid });
        return valid;
    }
    function recordRestoreEvent(requestId, status, detail) {
        if (!restoreRequests.has(requestId)) throw new Error(`[CozyStorage] Restore request '${requestId}' does not exist.`);
        const event = deepCloneAndFreeze({ id: generateId("restoreevt"), requestId, status, detail: detail || null, timestamp: nowIso() });
        restoreHistory.push(event);
        recordAudit("restore", "RestoreRequest", requestId, { status });
        return event;
    }
    function listRestoreHistory(requestId) {
        return Object.freeze(restoreHistory.filter(e => !requestId || e.requestId === requestId));
    }

    // ============================================================
    // Import / Export / Sync — sync is always fully delegated to CozySync.
    // ============================================================

    function exportStorage(scope) {
        const payload = deepCloneAndFreeze({
            scope: scope || "Workspace",
            objects: Array.from(objects.values()),
            folders: Array.from(folders.values()),
            collections: Array.from(collections.values()),
            exportedAt: nowIso()
        });
        recordAudit("export", "Storage", scope || "Workspace", null);
        return payload;
    }

    function importStorage(data) {
        if (!data || typeof data !== "object") throw new TypeError("[CozyStorage] importStorage requires a payload object.");
        (data.folders || []).forEach(f => { if (!folders.has(f.id)) folders.set(f.id, Object.assign({}, f)); });
        (data.objects || []).forEach(o => { if (!objects.has(o.id)) { assertNoCredentialFields(o.metadata, "Object.metadata"); objects.set(o.id, Object.assign({}, o)); quota.objectCount++; quota.currentSize += o.size || 0; } });
        (data.collections || []).forEach(c => { if (!collections.has(c.id)) collections.set(c.id, Object.assign({}, c)); });
        recordAudit("import", "Storage", data.scope || "Workspace", null);
        return true;
    }

    function syncStorage(options) {
        return delegate("sync", "sync", options);
    }

    // ============================================================
    // Device Storage Registry — bookkeeping of reported device storage.
    // No hardware access.
    // ============================================================

    const deviceStorage = createSimpleRegistry("DeviceStorage", ["deviceType"]);
    function registerDeviceStorage(deviceId, deviceType, detail) { return deviceStorage.register(deviceId, Object.assign({ deviceType }, detail)); }
    function listDeviceStorage() { return deviceStorage.list(); }

    // ============================================================
    // Media Registry — derived breakdown of registered objects by category.
    // ============================================================

    function getMediaBreakdown() {
        const breakdown = {};
        for (const obj of objects.values()) {
            const category = obj.metadata.category || "custom";
            breakdown[category] = (breakdown[category] || 0) + 1;
        }
        return deepCloneAndFreeze(breakdown);
    }

    // ============================================================
    // Cache Registry — coordination only, no eviction algorithms.
    // ============================================================

    const cacheEntries = new Map();

    function registerCacheEntry(objectId, type) {
        _requireObject(objectId);
        cacheEntries.set(objectId, { objectId, type: type || "temporary", pinned: false, lastUsedAt: nowIso() });
        recordAudit("create", "CacheEntry", objectId, { type });
        return deepCloneAndFreeze(cacheEntries.get(objectId));
    }

    function listCacheEntries(type) {
        return Object.freeze(Array.from(cacheEntries.values()).filter(e => !type || e.type === type).map(e => deepCloneAndFreeze(e)));
    }

    function pinObject(objectId) {
        const entry = cacheEntries.get(objectId);
        if (!entry) throw new Error(`[CozyStorage] Object '${objectId}' has no cache entry to pin.`);
        entry.pinned = true;
        recordAudit("update", "CacheEntry", objectId, { pinned: true });
        return deepCloneAndFreeze(entry);
    }

    function unpinObject(objectId) {
        const entry = cacheEntries.get(objectId);
        if (!entry) throw new Error(`[CozyStorage] Object '${objectId}' has no cache entry to unpin.`);
        entry.pinned = false;
        recordAudit("update", "CacheEntry", objectId, { pinned: false });
        return deepCloneAndFreeze(entry);
    }

    function recordRecentlyUsed(objectId) {
        _requireObject(objectId);
        if (!cacheEntries.has(objectId)) registerCacheEntry(objectId, "temporary");
        cacheEntries.get(objectId).lastUsedAt = nowIso();
        return deepCloneAndFreeze(cacheEntries.get(objectId));
    }

    function listRecentlyUsed(limit) {
        return Object.freeze(
            Array.from(cacheEntries.values())
                .sort((a, b) => new Date(b.lastUsedAt) - new Date(a.lastUsedAt))
                .slice(0, limit || 20)
                .map(e => deepCloneAndFreeze(e))
        );
    }

    // ============================================================
    // Offline Queue — pending saves/deletes/sync/restore/export. Actual
    // processing happens later, via CozySync.
    // ============================================================

    const offlineQueue = new Map();

    function enqueuePending(type, payload) {
        const validTypes = ["save", "delete", "sync", "restore", "export"];
        if (!validTypes.includes(type)) throw new Error(`[CozyStorage] Unknown pending queue type '${type}'. Expected one of: ${validTypes.join(", ")}.`);
        const id = generateId("pending");
        const entry = { id, type, payload: deepCloneAndFreeze(payload), status: "pending", queuedAt: nowIso() };
        offlineQueue.set(id, entry);
        recordAudit("create", "OfflineQueue", id, { type });
        return deepCloneAndFreeze(entry);
    }

    function listPending(type) {
        return Object.freeze(Array.from(offlineQueue.values()).filter(e => !type || e.type === type).map(e => deepCloneAndFreeze(e)));
    }

    function markProcessed(id) {
        const entry = offlineQueue.get(id);
        if (!entry) throw new Error(`[CozyStorage] Pending queue entry '${id}' does not exist.`);
        entry.status = "processed";
        recordAudit("update", "OfflineQueue", id, { status: "processed" });
        return deepCloneAndFreeze(entry);
    }

    // ============================================================
    // Storage Health — current counts only. No predictions.
    // ============================================================

    function getHealth() {
        return deepCloneAndFreeze({
            objectCount: quota.objectCount,
            storageUsage: quota.currentSize,
            versionCount: quota.versionCount,
            snapshotCount: quota.snapshotCount,
            pendingQueueSize: Array.from(offlineQueue.values()).filter(e => e.status === "pending").length,
            integrityStatus: "ok"
        });
    }

    // ============================================================
    // Device Capability Registry — reported, not benchmarked.
    // ============================================================

    const deviceCapabilities = new Map();

    function registerDeviceCapability(deviceId, capabilities) {
        if (!deviceId || typeof deviceId !== "string") throw new TypeError("[CozyStorage] registerDeviceCapability requires a string deviceId.");
        const record = deepCloneAndFreeze(Object.assign({ deviceId, registeredAt: nowIso() }, capabilities));
        deviceCapabilities.set(deviceId, record);
        recordAudit("create", "DeviceCapability", deviceId, null);
        return record;
    }

    function getDeviceCapability(deviceId) {
        return deviceCapabilities.get(deviceId) || null;
    }

    function listDeviceCapabilities() {
        return Object.freeze(Array.from(deviceCapabilities.values()));
    }

    // ============================================================
    // Plugin Registry — bookkeeping only. The kernel never invokes plugin
    // logic directly (no execute/run method is exposed here, deliberately).
    // ============================================================

    const plugins = createSimpleRegistry("Plugin", ["category"]);
    function registerPlugin(id, category, detail) { return plugins.register(id, Object.assign({ category }, detail)); }
    function listPlugins() { return plugins.list(); }
    function getPlugin(id) { return plugins.get(id); }

    // ============================================================
    // Integration Registry (CLOSED) — a fixed, non-extensible list. Unlike
    // the Plugin Registry above, this is intentionally not open for
    // dynamic registration; it documents known first-party integrations.
    // ============================================================

    const KNOWN_INTEGRATIONS = Object.freeze([
        "OurCozy Live", "CozyIdentity", "CozyNetwork", "CozySync", "CozyTranslate",
        "CozySpeech", "CozyVision", "CozyMarketplace", "CozyAttendance", "CozyAnalytics",
        "CozySettings", "CozySecurity", "CozyBackup", "CozyRecovery"
    ]);

    function listIntegrations() { return KNOWN_INTEGRATIONS; }
    function isKnownIntegration(name) { return KNOWN_INTEGRATIONS.includes(name); }

    function getVersion() { return VERSION; }

    // ============================================================
    // Public API
    // ============================================================

    window.CozyOS.CozyStorage = Object.freeze({
        createStorageSpace, openStorage, closeStorage, lockStorage, unlockStorage,
        archiveStorageSpace, restoreStorageSpace, deleteStorageSpace, cloneStorageSpace,
        snapshotStorageSpace, getStorageSpace, listStorageSpaces,

        registerStorageType, listStorageTypes,

        registerObject, updateObject, removeObject, moveObject, copyObject,
        archiveObject, restoreObject, getObject, listObjects,

        createFolder, renameFolder, moveFolder, archiveFolder, restoreFolder,
        deleteFolder, listFolders,

        createCollection, addToCollection, removeFromCollection, getCollection, listCollections,

        createVersion, listVersions, restoreVersion, compareVersions,

        createSnapshot, restoreSnapshot, exportSnapshot, importSnapshot, listSnapshots,

        registerIndex, addToIndex, removeFromIndex, queryIndex, listIndexes,

        search,

        getQuota, setMaxSize,

        registerAdapter, hasAdapter,
        registerCompressionAdapter, requestCompress, requestDecompress,
        registerEncryptionAdapter, requestEncrypt, requestDecrypt,

        createBackupPlan, listBackupPlans, recordBackupEvent, listBackupHistory, getBackupStatus,

        createRestoreRequest, listRestoreRequests, validateRestoreRequest, recordRestoreEvent, listRestoreHistory,

        exportStorage, importStorage, syncStorage,

        registerDeviceStorage, listDeviceStorage,

        getMediaBreakdown,

        registerCacheEntry, listCacheEntries, pinObject, unpinObject, recordRecentlyUsed, listRecentlyUsed,

        enqueuePending, listPending, markProcessed,

        listAudit,

        getHealth,

        registerDeviceCapability, getDeviceCapability, listDeviceCapabilities,

        registerPlugin, listPlugins, getPlugin,

        listIntegrations, isKnownIntegration,

        getVersion
    });

})();
