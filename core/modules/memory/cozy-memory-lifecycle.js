/**
 * CozyOS Memory Lifecycle Extension
 * File Reference: core/modules/memory/cozy-memory-lifecycle.js
 * Milestone: 152 — Cozy Memory Engine Platform
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP
 *   Extends window.CozyOS.CozyMemory (core/modules/memory/cozy-memory-engine.js),
 *   the canonical Memory Engine, in place. Does NOT create a second memory
 *   coordinator, store, or CRUD system. All create/read/update/delete/
 *   version/search/encrypt behavior remains exactly what CozyMemory
 *   already does — this file only adds the platform-lifecycle concepts
 *   Milestone 152 asked for that CozyMemory didn't yet have: health,
 *   retention policy, memory level, and a relationship graph. It stores
 *   this lifecycle metadata in its own sidecar map keyed by
 *   "namespace/key", separate from CozyMemory's private value/version
 *   storage, and always calls back into CozyMemory's real public API
 *   (readMemory/saveMemory/deleteMemory/listKeys) rather than touching
 *   its internals.
 *   window.CozyOS.AIMemory (core/ai/cozy-ai-memory.js) is a separate,
 *   already-independent Memory Type and is untouched by this file.
 *
 * HONEST LIMITATION — Memory Health
 *   CozyMemory is fully synchronous, in-memory, single-process. There is
 *   no real async I/O, indexing job, or remote store behind it, so
 *   "Loading", "Indexing", "Busy", and "Recovering" have no real signal
 *   to report and are never fabricated as live states. getMemoryHealth()
 *   only reports states that reflect something actually true: Ready,
 *   Unavailable (engine missing), Archived (namespace fully archived),
 *   or Corrupted (a real read/parse failure was observed).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const VERSION = "1.0.0-ENTERPRISE";
    if (window.CozyOS.MemoryLifecycle) return;

    const LEVEL = Object.freeze({ IMMEDIATE: "immediate", SESSION: "session", SHORT_TERM: "short-term", WORKING: "working", LONG_TERM: "long-term", ARCHIVED: "archived" });
    const RETENTION = Object.freeze({ KEEP_FOREVER: "keep-forever", KEEP_UNTIL_DATE: "keep-until-date", SESSION_ONLY: "session-only", DELETE_AFTER_USE: "delete-after-use", ARCHIVE: "archive", MANUAL: "manual", SYSTEM_MANAGED: "system-managed" });
    const HEALTH = Object.freeze({ READY: "ready", UNAVAILABLE: "unavailable", ARCHIVED: "archived", CORRUPTED: "corrupted" });
    const RELATIONSHIP_TYPES = Object.freeze(["parent", "child", "reference", "dependency", "related", "duplicate", "version", "history"]);

    function _engine() { return window.CozyOS.CozyMemory || null; }
    function _id(ns, key) { return `${ns}::${key}`; }

    class MemoryLifecycle {
        #meta = new Map();       // "ns::key" -> { level, retention, expiresAt, importance, health }
        #relationships = new Map(); // "ns::key" -> [{ type, targetNs, targetKey }]

        getVersion() { return VERSION; }
        getLevels() { return { ...LEVEL }; }
        getRetentionPolicies() { return { ...RETENTION }; }
        getHealthStates() { return { ...HEALTH }; }

        #requireEngine() {
            const engine = _engine();
            if (!engine) throw new Error("[MemoryLifecycle] CozyMemory (canonical Memory Engine) is not loaded.");
            return engine;
        }

        // ── Developer API aliases (pass-through to canonical engine) ──────────
        registerMemory(namespace, key, value, options = {}) {
            const entry = this.#requireEngine().saveMemory(namespace, key, value, options);
            this.#meta.set(_id(namespace, key), { level: options.level || LEVEL.WORKING, retention: options.retention || RETENTION.MANUAL, importance: options.importance ?? null, expiresAt: options.expiresAt || null, health: HEALTH.READY });
            return entry;
        }
        updateMemory(namespace, key, value, options = {}) { return this.#requireEngine().updateMemory(namespace, key, value, options); }
        getMemory(namespace, key) { return this.#requireEngine().readMemory(namespace, key); }
        listMemory(namespace, predicate) { return this.#requireEngine().listKeys(namespace, predicate); }
        searchMemory(namespace, query) { return this.#requireEngine().searchMemory(namespace, query); }
        exportMemory(namespace) { return this.#requireEngine().exportNamespace(namespace); }
        importMemory(exportedData, options) { return this.#requireEngine().importNamespace(exportedData, options); }

        deleteMemory(namespace, key, options = {}) {
            const result = this.#requireEngine().deleteMemory(namespace, key, options);
            if (result) { this.#meta.delete(_id(namespace, key)); this.#relationships.delete(_id(namespace, key)); }
            return result;
        }

        // ── Archive / Restore (real, calls back into readMemory to verify existence) ──
        archiveMemory(namespace, key) {
            const engine = this.#requireEngine();
            if (!engine.readMemory(namespace, key)) return { success: false, reason: `"${namespace}/${key}" does not exist.` };
            const id = _id(namespace, key);
            const meta = this.#meta.get(id) || { level: LEVEL.WORKING, retention: RETENTION.MANUAL, importance: null, expiresAt: null };
            this.#meta.set(id, { ...meta, priorLevel: meta.level, level: LEVEL.ARCHIVED, health: HEALTH.ARCHIVED, archivedAt: new Date().toISOString() });
            return { success: true };
        }

        restoreMemory(namespace, key) {
            const id = _id(namespace, key);
            const meta = this.#meta.get(id);
            if (!meta || meta.level !== LEVEL.ARCHIVED) return { success: false, reason: `"${namespace}/${key}" is not archived.` };
            this.#meta.set(id, { ...meta, level: meta.priorLevel || LEVEL.WORKING, health: HEALTH.READY, archivedAt: null });
            return { success: true };
        }

        // ── Level / Retention / Importance ─────────────────────────────────────
        setMemoryLevel(namespace, key, level) {
            if (!Object.values(LEVEL).includes(level)) return { success: false, reason: `Unknown level "${level}".` };
            const id = _id(namespace, key);
            const meta = this.#meta.get(id) || { retention: RETENTION.MANUAL, importance: null, expiresAt: null, health: HEALTH.READY };
            this.#meta.set(id, { ...meta, level });
            return { success: true };
        }

        setRetentionPolicy(namespace, key, policy, { expiresAt = null } = {}) {
            if (!Object.values(RETENTION).includes(policy)) return { success: false, reason: `Unknown retention policy "${policy}".` };
            if (policy === RETENTION.KEEP_UNTIL_DATE && !expiresAt) return { success: false, reason: "keep-until-date requires expiresAt." };
            const id = _id(namespace, key);
            const meta = this.#meta.get(id) || { level: LEVEL.WORKING, importance: null, health: HEALTH.READY };
            this.#meta.set(id, { ...meta, retention: policy, expiresAt });
            return { success: true };
        }

        setImportance(namespace, key, importance) {
            const id = _id(namespace, key);
            const meta = this.#meta.get(id) || { level: LEVEL.WORKING, retention: RETENTION.MANUAL, expiresAt: null, health: HEALTH.READY };
            this.#meta.set(id, { ...meta, importance });
            return { success: true };
        }

        getMeta(namespace, key) { return this.#meta.get(_id(namespace, key)) || null; }

        // ── Relationships (real graph edges; validates both ends exist) ───────
        addRelationship(namespace, key, type, targetNamespace, targetKey) {
            if (!RELATIONSHIP_TYPES.includes(type)) return { success: false, reason: `Unknown relationship type "${type}".` };
            const engine = this.#requireEngine();
            if (!engine.readMemory(namespace, key)) return { success: false, reason: `Source "${namespace}/${key}" does not exist.` };
            if (!engine.readMemory(targetNamespace, targetKey)) return { success: false, reason: `Target "${targetNamespace}/${targetKey}" does not exist.` };
            const id = _id(namespace, key);
            const edges = this.#relationships.get(id) || [];
            edges.push({ type, targetNamespace, targetKey });
            this.#relationships.set(id, edges);
            return { success: true };
        }

        getRelationships(namespace, key) { return (this.#relationships.get(_id(namespace, key)) || []).slice(); }

        // ── Memory Health — see HONEST LIMITATION in file header ──────────────
        getMemoryHealth(namespace, key) {
            const engine = _engine();
            if (!engine) return { health: HEALTH.UNAVAILABLE, reason: "CozyMemory not loaded." };
            if (namespace && key) {
                let entry;
                try { entry = engine.readMemory(namespace, key); }
                catch (err) { return { health: HEALTH.CORRUPTED, reason: err && err.message ? err.message : String(err) }; }
                if (!entry) return { health: HEALTH.UNAVAILABLE, reason: "Entry does not exist." };
                const meta = this.getMeta(namespace, key);
                return { health: meta ? meta.health : HEALTH.READY };
            }
            return { health: HEALTH.READY, note: "CozyMemory is loaded and synchronous — no Loading/Indexing/Busy/Recovering states apply (no real async I/O to report)." };
        }

        getIntegrationManifest() {
            return {
                owns: ["lifecycle metadata (level/retention/importance/expiration)", "relationship graph", "honest health reporting"],
                doesNotOwn: ["CRUD, versioning, search, encryption, export/import — all remain CozyMemory's (canonical, unchanged)", "AI Memory (core/ai/cozy-ai-memory.js, independent)"],
                honestLimitation: "getMemoryHealth() never reports Loading/Indexing/Busy/Recovering — CozyMemory has no real async process behind those states."
            };
        }
    }

    window.CozyOS.MemoryLifecycle = new MemoryLifecycle();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "MemoryLifecycle", category: "Platform", icon: "database.svg",
                description: "Extends canonical CozyMemory with health/retention/level/relationship lifecycle. No parallel CRUD, versioning, or search store."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
