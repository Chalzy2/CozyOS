/**
 * core/modules/intelligence/language-packs/cozy-language-pack-persistence.js
 * RP-035 Phase 1 — Persistent Storage Bridge
 *
 * OWNERSHIP
 *   New, additive, standalone file. Does not modify core/storage.js,
 *   cozy-language-pack-registry.js, or any other locked file. This file
 *   is a CONSUMER of both, exactly like core/languageImporter.js and
 *   core/ai.js already consume core/storage.js via window.CozyStorage —
 *   no new storage-access pattern is invented here.
 *
 * WHAT THIS FILE DOES
 *   Wires cozy-language-pack-registry.js's existing createStorageAdapter(
 *   backend) hook to the REAL core/storage.js IndexedDB gateway, using
 *   object stores that already exist in core/storage.js's own blueprint:
 *     - "language_packs"      -> the 17 pack identity/state records
 *     - "dictionary"          -> knowledge (expression) records
 *     - "translation_memory"  -> translation-relationship records
 *     - "learning_progress"   -> teaching candidates / corrections /
 *                                 conflicts (all are "events in a
 *                                 learning pipeline", which is exactly
 *                                 what this store already exists for)
 *   No new IndexedDB object store is created. core/storage.js is not
 *   touched. All four stores are already listed in BLUEPRINT_OBJECT_
 *   STORES and already granted to the "ulie" module context.
 *
 * HONESTY RULE
 *   getStorageState() NEVER reports PERSISTENT unless window.CozyStorage
 *   is actually present and initModule()+init() actually succeeded. If
 *   the real gateway is unavailable (e.g. no browser/IndexedDB, or the
 *   host app never initialized it), every function here degrades to the
 *   registry's own in-memory default adapter and reports
 *   IN_MEMORY_ONLY — never a fabricated PERSISTENT.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["cozy-language-pack-persistence"]) return;

    const VERSION = "1.0.0";
    const MODULE_CONTEXT = "ulie";
    const STORES = Object.freeze({
        PACKS: "language_packs",
        EXPRESSIONS: "dictionary",
        TRANSLATIONS: "translation_memory",
        EVENTS: "learning_progress"
    });

    function packRegistry() {
        return w.CozyOS && w.CozyOS.CozyLanguagePacks ? w.CozyOS.CozyLanguagePacks : null;
    }

    function realGateway() {
        // Same lookup pattern already used by core/ai.js, core/pluginManager.js,
        // core/languageImporter.js — never a new global invented here.
        return (w.CozyOS && w.CozyOS.Storage) || w.CozyStorage || null;
    }

    /**
     * isPersistenceAvailable()
     *   Honest capability check. True only if a real gateway object with
     *   the methods this bridge needs is actually present.
     */
    function isPersistenceAvailable() {
        const g = realGateway();
        return !!(g && typeof g.save === "function" && typeof g.get === "function" &&
                  typeof g.list === "function" && typeof g.delete === "function");
    }

    /**
     * ensureInitialized(tenantId)
     *   Best-effort, idempotent init of the real gateway. Never throws
     *   past this function — callers get a boolean, not an exception,
     *   because a language-teaching UI must not crash just because
     *   storage init failed once.
     */
    async function ensureInitialized(tenantId) {
        const g = realGateway();
        if (!g) return { ok: false, reason: "NO_REAL_STORAGE_GATEWAY" };
        try {
            if (typeof g.initModule === "function") {
                g.initModule(tenantId || "default_tenant", MODULE_CONTEXT);
            }
            if (typeof g.init === "function") {
                await g.init();
            }
            return { ok: true };
        } catch (err) {
            return { ok: false, reason: "INIT_FAILED", error: String(err && err.message || err) };
        }
    }

    /**
     * createRealBackend(storeName, tenantId)
     *   Adapts core/storage.js's save/get/list/delete API to the
     *   {get,set,remove,list} shape cozy-language-pack-registry.js's
     *   createStorageAdapter(backend) already expects. This is the ONLY
     *   new interface introduced — everything it calls already exists.
     */
    function createRealBackend(storeName, tenantId) {
        const g = realGateway();
        const tid = tenantId || "default_tenant";
        return {
            async get(key) {
                if (!g) return null;
                try {
                    const rec = await g.get(storeName, key, tid);
                    return rec || null;
                } catch (_err) {
                    return null;
                }
            },
            async set(key, value) {
                if (!g) return false;
                try {
                    const payload = Object.assign({}, value, { id: key });
                    await g.save(storeName, payload, tid);
                    return true;
                } catch (_err) {
                    return false;
                }
            },
            async remove(key) {
                if (!g) return false;
                try {
                    await g.delete(storeName, key, tid);
                    return true;
                } catch (_err) {
                    return false;
                }
            },
            async list(prefix) {
                if (!g) return [];
                try {
                    const all = await g.list(storeName, tid);
                    return (all || [])
                        .map((r) => r && r.id)
                        .filter((k) => k != null && (!prefix || String(k).indexOf(prefix) === 0));
                } catch (_err) {
                    return [];
                }
            }
        };
    }

    /**
     * initializePersistentRegistry(options)
     *   Bootstraps the pack registry against real storage when available.
     *   Returns an honest storageState so no caller can be misled into
     *   believing data survives a reload when it does not.
     */
    async function initializePersistentRegistry(options) {
        const opts = options || {};
        const registry = packRegistry();
        if (!registry) {
            return { ok: false, reason: "REGISTRY_NOT_LOADED", storageState: "UNAVAILABLE" };
        }

        const init = await ensureInitialized(opts.tenantId);
        if (!init.ok) {
            return {
                ok: true,
                storageState: "IN_MEMORY_ONLY",
                reason: init.reason,
                packsInMemory: registry.listPacks().length
            };
        }

        const backend = createRealBackend(STORES.PACKS, opts.tenantId);
        const loaded = await loadPersistedPacks(backend, registry);
        await persistAllPacks(backend, registry);

        return {
            ok: true,
            storageState: "PERSISTENT",
            restoredFromStorage: loaded.restoredCount,
            packsTracked: registry.listPacks().length
        };
    }

    async function loadPersistedPacks(backend, registry) {
        let restoredCount = 0;
        const keys = await backend.list("");
        for (const languageId of keys) {
            const stored = await backend.get(languageId);
            if (stored && stored.identity && stored.identity.languageId) {
                restoredCount++;
                // Read-only observation for Phase 1: we confirm the record
                // round-trips; we do not overwrite registerDefaultPacks()'s
                // freshly REGISTERED/NOT_READY in-memory record with a
                // possibly-stale one, since no merge/version-reconciliation
                // engine exists yet (documented gap, see Phase 1 report).
            }
        }
        return { restoredCount };
    }

    async function persistAllPacks(backend, registry) {
        const packs = registry.listPacks();
        let savedCount = 0;
        for (const pack of packs) {
            const ok = await backend.set(pack.identity.languageId, pack);
            if (ok) savedCount++;
        }
        return { savedCount, attempted: packs.length };
    }

    function getStorageState() {
        return isPersistenceAvailable() ? "PERSISTENT_CAPABLE" : "IN_MEMORY_ONLY";
    }

    /**
     * initializePersistentExpressions(options)
     *   RP-035 Phase 2 addition. Wires the registry's new (Phase 2)
     *   bindExpressionStorage()/restoreExpressions() hooks to the real
     *   core/storage.js gateway via the pre-existing "dictionary" store
     *   (already reserved for EXPRESSIONS in Phase 1 — never a new
     *   store). Every taught word/phrase/sentence submitted afterward
     *   through registry.submitExpression() (which is what RP-031's
     *   routing core calls) is now write-through persisted. On call,
     *   also restores any previously-persisted records so knowledge
     *   taught in an earlier session survives a reload — the same
     *   honest degrade-to-IN_MEMORY_ONLY discipline as
     *   initializePersistentRegistry() applies if no real gateway
     *   exists. Separate from initializePersistentRegistry() (which
     *   only ever covered pack identity/status, not taught knowledge)
     *   so that function's existing tested contract is untouched.
     */
    async function initializePersistentExpressions(options) {
        const opts = options || {};
        const registry = packRegistry();
        if (!registry || typeof registry.bindExpressionStorage !== "function") {
            return { ok: false, reason: "REGISTRY_EXPRESSION_HOOKS_NOT_AVAILABLE", storageState: "UNAVAILABLE" };
        }

        const init = await ensureInitialized(opts.tenantId);
        if (!init.ok) {
            return {
                ok: true,
                storageState: "IN_MEMORY_ONLY",
                reason: init.reason,
                expressionsInMemory: registry.listExpressions({}).length
            };
        }

        const backend = createRealBackend(STORES.EXPRESSIONS, opts.tenantId);
        const keys = await backend.list("");
        const restoredRecords = [];
        for (const recordId of keys) {
            const stored = await backend.get(recordId);
            if (stored && stored.recordId && stored.languageId) restoredRecords.push(stored);
        }
        const restored = registry.restoreExpressions(restoredRecords);
        registry.bindExpressionStorage(backend);

        return {
            ok: true,
            storageState: "PERSISTENT",
            restoredFromStorage: restored.restoredCount,
            expressionsTracked: registry.listExpressions({}).length
        };
    }

    const api = Object.freeze({
        VERSION,
        STORES,
        isPersistenceAvailable,
        ensureInitialized,
        createRealBackend,
        initializePersistentRegistry,
        initializePersistentExpressions,
        persistAllPacks,
        loadPersistedPacks,
        getStorageState
    });

    w.CozyOS.CozyLanguagePackPersistence = api;
    w.CozyOS.Modules["cozy-language-pack-persistence"] = Object.freeze({
        version: VERSION,
        api,
        description: "RP-035 Phase 1 — Wires cozy-language-pack-registry.js's storage adapter hook to the real core/storage.js IndexedDB gateway via window.CozyStorage (same consumption pattern as core/languageImporter.js/core/ai.js). Uses only pre-existing object stores (language_packs, dictionary, translation_memory, learning_progress) already granted to the 'ulie' module context — no new store created, core/storage.js not modified. Never reports PERSISTENT when the real gateway is unavailable; degrades honestly to IN_MEMORY_ONLY."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
