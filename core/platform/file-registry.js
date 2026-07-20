/**
 * CozyOS File Registry
 * File Reference: core/platform/file-registry.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single store of per-file metadata records — what Discovery finds,
 *   this holds. Nothing here decides discovery, health, usage, or
 *   dependency logic itself (Rule 1 — Single Responsibility); those stay in
 *   cozy-discovery.js, health-engine.js, usage-engine.js, and
 *   dependency-engine.js respectively. This is storage + query only.
 *
 * CONSUMERS
 *   Diagnostics Center, Module Manager, Application Center, Certification
 *   Center, Dependency Viewer, Enterprise Search, Developer Hub — all read
 *   through list()/get()/query() instead of maintaining their own file
 *   inventories.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const FILE_REGISTRY_VERSION = "1.0.0-ENTERPRISE";

    class CozyFileRegistry {
        #records = new Map(); // path -> frozen record
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = { replacements: 0, lookupsServed: 0, queriesServed: 0 };

        getVersion() { return FILE_REGISTRY_VERSION; }

        on(e, h) { if (typeof e !== "string" || !e.trim()) throw new TypeError("[FileRegistry] on(): eventName required."); if (typeof h !== "function") throw new TypeError("[FileRegistry] on(): handler required."); if (!this.#listeners.has(e)) this.#listeners.set(e, new Set()); this.#listeners.get(e).add(h); return () => this.off(e, h); }
        off(e, h) { const s = this.#listeners.get(e); if (!s) return false; const w = this.#onceWrapped.get(h); const r = s.delete(h) || (w ? s.delete(w) : false); if (s.size === 0) this.#listeners.delete(e); return r; }
        once(e, h) { const w = (p) => { this.off(e, h); this.#onceWrapped.delete(h); h(p); }; this.#onceWrapped.set(h, w); this.on(e, w); }
        emit(e, p) { const s = this.#listeners.get(e); if (!s || s.size === 0) return false; for (const fn of Array.from(s)) { try { fn(p); } catch (_e) { /* isolated */ } } return true; }

        /**
         * replaceAll(records)
         *   Discovery's write path — a full scan replaces the whole set
         *   atomically (no stale entries left from files that were removed
         *   between scans). Individual patches use upsert() instead.
         */
        replaceAll(records) {
            this.#records.clear();
            for (const r of records) this.#records.set(r.path, Object.freeze({ ...r }));
            this.#diagnostics.replacements++;
            this.emit("registry:replaced", { count: this.#records.size });
            return this.#records.size;
        }

        upsert(record) {
            if (!record || typeof record.path !== "string" || !record.path.trim()) {
                throw new TypeError("[FileRegistry] upsert(): record.path is required.");
            }
            const isUpdate = this.#records.has(record.path);
            this.#records.set(record.path, Object.freeze({ ...record }));
            this.emit(isUpdate ? "file:updated" : "file:added", { path: record.path });
            return this.#records.get(record.path);
        }

        remove(pathKey) {
            const removed = this.#records.delete(pathKey);
            if (removed) this.emit("file:removed", { path: pathKey });
            return removed;
        }

        get(pathKey) {
            this.#diagnostics.lookupsServed++;
            return this.#records.get(pathKey) || null;
        }

        list() {
            this.#diagnostics.lookupsServed++;
            return Array.from(this.#records.values());
        }

        /**
         * query({ category, application, loaded, certified, extension })
         *   Simple AND-filter over the record set — enough for Module
         *   Manager / Search / Certification Center without each of them
         *   re-implementing filtering.
         */
        query(filter = {}) {
            this.#diagnostics.queriesServed++;
            return this.list().filter(r =>
                (filter.category === undefined || r.category === filter.category) &&
                (filter.application === undefined || r.application === filter.application) &&
                (filter.loaded === undefined || r.loaded === filter.loaded) &&
                (filter.certified === undefined || r.certified === filter.certified) &&
                (filter.extension === undefined || r.type === filter.extension)
            );
        }

        /** search(term) — case-insensitive match on path/name/exports, feeds Enterprise Search. */
        search(term) {
            const needle = String(term || "").toLowerCase();
            if (!needle) return [];
            return this.list().filter(r =>
                r.path.toLowerCase().includes(needle) ||
                r.name.toLowerCase().includes(needle) ||
                (r.exports || []).some(e => e.toLowerCase().includes(needle))
            );
        }

        size() { return this.#records.size; }
        getDiagnosticsReport() { return { ...this.#diagnostics, totalFiles: this.#records.size }; }
    }

    if (window.CozyOS.FileRegistry && typeof window.CozyOS.FileRegistry.getVersion === "function") {
        const existingVersion = window.CozyOS.FileRegistry.getVersion();
        if (existingVersion !== FILE_REGISTRY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: FileRegistry existing v${existingVersion} conflicts with load target v${FILE_REGISTRY_VERSION}.`);
        return;
    }

    window.CozyOS.FileRegistry = new CozyFileRegistry();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "FileRegistry", category: "Platform", icon: "database",
                description: "Normalized store of per-file metadata populated by Discovery; query surface for Diagnostics, Module Manager, Certification Center, Dependency Viewer, and Search."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
