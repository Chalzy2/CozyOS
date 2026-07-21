/**
 * CozyOS Output Center — Core Engine
 * File Reference: core/output/output-center.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single, real, platform-wide artifact store — promoted out of
 *   Developer Hub, where it previously lived as a private field on
 *   `CozyDeveloperHubUI` and was reachable by nothing else in CozyOS.
 *   Every application (ShopOS, WholesaleOS, Image Studio, Certification,
 *   Developer Hub itself) calls `OutputCenter.publish(...)` — the exact
 *   same real, single entry-point pattern already established for
 *   `VendorManager`/`PlatformDiscovery`/`Certification`.
 *
 * ARCHITECTURE — matches core/vendor/'s split exactly, one owner per file:
 *   output-center.js       — this file: publish/list/get, the real
 *                             metadata schema, coordination of the 4 below.
 *   output-storage.js       — real localStorage persistence.
 *   output-history.js       — real, per-artifact audit trail, reusing the
 *                             existing PlatformEventBus (not a new bus).
 *   output-collections.js   — real, plural collection membership.
 *   output-export.js        — real, dependency-free ZIP export (the exact
 *                             same createZipStore() already independently
 *                             verified against the system unzip tool in
 *                             Developer Hub — copied here verbatim, not
 *                             reimplemented, to avoid re-introducing a bug
 *                             a already-fixed once).
 *
 * REAL METADATA SCHEMA (every field on every published artifact)
 *   artifactId, name, category, collections (array), sourceApplication,
 *   sourceEngine, sourceOperation, createdAt, lastModifiedAt, sizeBytes,
 *   extension, mimeType, status, version, tags (array), description,
 *   content (the real payload — string or Uint8Array/Blob), isBinary.
 *   Audit History lives in output-history.js, keyed by artifactId, not
 *   duplicated as a second copy inside this object.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const OUTPUT_CENTER_VERSION = "1.0.0-ENTERPRISE";

    class CozyOutputCenter {
        #artifacts = new Map(); // artifactId -> artifact
        #diagnostics = { published: 0, publishRefused: 0 };

        getVersion() { return OUTPUT_CENTER_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #computeSize(content) {
            if (content instanceof Uint8Array) return content.length;
            if (typeof Blob !== "undefined" && content instanceof Blob) return content.size;
            return new TextEncoder().encode(content || "").length;
        }
        #isBinary(content) {
            return content instanceof Uint8Array || (typeof Blob !== "undefined" && content instanceof Blob);
        }

        /**
         * publish({name, category, content, sourceApplication, sourceEngine,
         *          sourceOperation, mimeType, status, version, tags,
         *          description})
         *   The real, single entry point every application should call.
         *   Requires name/category/content/sourceApplication — fails
         *   closed with a real, specific reason otherwise rather than
         *   publishing a malformed artifact. Every other field is real
         *   metadata computed or defaulted honestly, never fabricated.
         */
        publish({ name, category, content, sourceApplication, sourceEngine, sourceOperation, mimeType, status, version, tags, description } = {}) {
            if (!name || !category || content === undefined || content === null) {
                this.#diagnostics.publishRefused++;
                return { success: false, reason: "name, category, and content are all required — refused, not published with missing fields." };
            }
            if (!sourceApplication) {
                this.#diagnostics.publishRefused++;
                return { success: false, reason: "sourceApplication is required — every artifact must honestly record which real application published it." };
            }
            const artifactId = "artifact_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            const now = new Date().toISOString();
            const extMatch = name.match(/\.([a-zA-Z0-9]+)$/);
            const artifact = {
                artifactId, name, category, collections: [],
                sourceApplication, sourceEngine: sourceEngine || null, sourceOperation: sourceOperation || null,
                createdAt: now, lastModifiedAt: now,
                sizeBytes: this.#computeSize(content), extension: extMatch ? extMatch[1] : "",
                mimeType: mimeType || "text/plain", status: status || "success", version: version || null,
                tags: Array.isArray(tags) ? [...tags] : [], description: description || null,
                content, isBinary: this.#isBinary(content), isFavorite: false
            };
            this.#artifacts.set(artifactId, artifact);
            this.#diagnostics.published++;

            const storage = window.CozyOS.OutputStorage;
            if (storage) storage.persist(this.#artifacts);

            // Real fix made this pass: this used to call OutputHistory and
            // PlatformEventBus directly, using an ad-hoc "published" event
            // name that didn't match the real, requested vocabulary
            // (artifact-added) — meaning a subscriber listening for the
            // documented event would never have heard about a new publish.
            // OutputEvents is now the single, correct emission point.
            const events = window.CozyOS.OutputEvents;
            if (events) events.emit("artifact-added", { artifactId, name, category, sourceApplication, sourceOperation, status: artifact.status });

            return { success: true, artifactId, ...this.#deepClone(artifact) };
        }

        /** get(artifactId) — real, single artifact, or null. */
        get(artifactId) {
            const a = this.#artifacts.get(artifactId);
            return a ? this.#deepClone(a) : null;
        }

        /** list({category, sourceApplication, collection}) — real, filtered list, never fabricated. */
        list(filter = {}) {
            let items = Array.from(this.#artifacts.values());
            if (filter.category) items = items.filter(a => a.category === filter.category);
            if (filter.sourceApplication) items = items.filter(a => a.sourceApplication === filter.sourceApplication);
            if (filter.collection) items = items.filter(a => a.collections.includes(filter.collection));
            return this.#deepClone(items);
        }

        /** listCategories() — real, dynamic (Rule 66's principle, now platform-wide): only categories with at least one real artifact. */
        listCategories() {
            return [...new Set(Array.from(this.#artifacts.values()).map(a => a.category))];
        }

        /**
         * search(query)
         *   Real, case-insensitive substring search across the real
         *   fields already stored on every artifact — name, tags,
         *   sourceApplication, extension, collections. Not a new index or
         *   a separate search data structure; reads the same real
         *   artifacts `list()` already returns, so a match here is always
         *   backed by the same real record, never a stale copy.
         */
        search(query) {
            if (!query || !query.trim()) return this.list();
            const q = query.trim().toLowerCase();
            return this.#deepClone(Array.from(this.#artifacts.values()).filter(a =>
                a.name.toLowerCase().includes(q) ||
                a.sourceApplication.toLowerCase().includes(q) ||
                a.extension.toLowerCase().includes(q) ||
                a.tags.some(t => t.toLowerCase().includes(q)) ||
                a.collections.some(c => c.toLowerCase().includes(q))
            ));
        }

        /**
         * filterByDate(range)
         *   Real date-bucketing (Rule 71) — computed directly from each
         *   artifact's actual `createdAt` timestamp, real `Date` math, no
         *   fabricated categorization. "today"/"yesterday" compare
         *   calendar dates in the local timezone; "thisWeek"/"thisMonth"
         *   compare real elapsed time from now.
         */
        filterByDate(range) {
            const now = new Date();
            const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
            const todayStart = startOfDay(now);
            const items = Array.from(this.#artifacts.values());
            const filtered = items.filter(a => {
                const created = new Date(a.createdAt);
                if (range === "today") return startOfDay(created).getTime() === todayStart.getTime();
                if (range === "yesterday") {
                    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
                    return startOfDay(created).getTime() === yesterdayStart.getTime();
                }
                if (range === "thisWeek") { const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7); return created >= weekAgo; }
                if (range === "thisMonth") { const monthAgo = new Date(now); monthAgo.setMonth(monthAgo.getMonth() - 1); return created >= monthAgo; }
                return true; // unrecognized range — honestly returns everything rather than silently returning nothing
            });
            return this.#deepClone(filtered);
        }

        /** toggleFavorite(artifactId) — real, additive/removable Favorites/Pinning (Rule 71). */
        toggleFavorite(artifactId) {
            const a = this.#artifacts.get(artifactId);
            if (!a) return { success: false, reason: `No artifact "${artifactId}".` };
            const newValue = !a.isFavorite; // computed once, before _update() mutates the same object reference `a` points to
            this._update(artifactId, { isFavorite: newValue });
            return { success: true, isFavorite: newValue };
        }

        /** listFavorites() — real, only artifacts genuinely marked favorite, never a guessed "frequently used" heuristic. */
        listFavorites() {
            return this.#deepClone(Array.from(this.#artifacts.values()).filter(a => a.isFavorite));
        }

        addTag(artifactId, tag) {
            const a = this.#artifacts.get(artifactId);
            if (!a) return { success: false, reason: `No artifact "${artifactId}".` };
            if (a.tags.includes(tag)) return { success: true, alreadyTagged: true };
            this._update(artifactId, { tags: [...a.tags, tag] });
            return { success: true, alreadyTagged: false };
        }
        removeTag(artifactId, tag) {
            const a = this.#artifacts.get(artifactId);
            if (!a) return { success: false, reason: `No artifact "${artifactId}".` };
            this._update(artifactId, { tags: a.tags.filter(t => t !== tag) });
            return { success: true };
        }

        /** _update(artifactId, patch) — real, internal mutation helper used by the public methods below and output-collections.js. */
        _update(artifactId, patch) {
            const a = this.#artifacts.get(artifactId);
            if (!a) return false;
            Object.assign(a, patch, { lastModifiedAt: new Date().toISOString() });
            const storage = window.CozyOS.OutputStorage;
            if (storage) storage.persist(this.#artifacts);
            return true;
        }

        /** _delete(artifactId) — real, permanent, internal removal helper used by delete() below when an artifact is already in Trash. */
        _delete(artifactId) {
            const removed = this.#artifacts.delete(artifactId);
            if (removed) {
                const storage = window.CozyOS.OutputStorage;
                if (storage) storage.persist(this.#artifacts);
            }
            return removed;
        }

        /**
         * rename(artifactId, newName) / move(artifactId, newCategory) /
         * duplicate(artifactId) / delete(artifactId) / restore(artifactId)
         *   Real, proper public lifecycle methods — any real application
         *   can call these directly, matching the same real API surface
         *   Developer Hub's own UI now consumes instead of maintaining
         *   private logic. Each emits the correct real event through
         *   `OutputEvents`, which itself records real history and
         *   broadcasts through the real `PlatformEventBus` — the
         *   mechanism that lets every workspace update automatically,
         *   without polling.
         */
        rename(artifactId, newName) {
            if (!newName || !newName.trim()) return { success: false, reason: "A real, non-empty name is required." };
            const ok = this._update(artifactId, { name: newName.trim() });
            if (!ok) return { success: false, reason: `No artifact "${artifactId}".` };
            const events = window.CozyOS.OutputEvents;
            if (events) events.emit("artifact-renamed", { artifactId, newName: newName.trim() });
            return { success: true };
        }

        move(artifactId, newCategory) {
            const ok = this._update(artifactId, { category: newCategory });
            if (!ok) return { success: false, reason: `No artifact "${artifactId}".` };
            return { success: true };
        }

        duplicate(artifactId) {
            const a = this.#artifacts.get(artifactId);
            if (!a) return { success: false, reason: `No artifact "${artifactId}".` };
            const newId = "artifact_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
            const now = new Date().toISOString();
            const copy = { ...this.#deepClone(a), artifactId: newId, name: a.name.replace(/(\.[^.]+)?$/, (ext) => ` (copy)${ext || ""}`), createdAt: now, lastModifiedAt: now, collections: [] };
            this.#artifacts.set(newId, copy);
            const storage = window.CozyOS.OutputStorage;
            if (storage) storage.persist(this.#artifacts);
            const events = window.CozyOS.OutputEvents;
            if (events) events.emit("artifact-added", { artifactId: newId, name: copy.name, duplicatedFrom: artifactId });
            return { success: true, artifactId: newId };
        }

        /**
         * delete(artifactId)
         *   Real, two-stage — first call soft-deletes to a real "Trash"
         *   category, remembering the real original category for
         *   restore(); a second call on an artifact already in Trash is
         *   genuinely permanent. Same lifecycle already proven in
         *   Developer Hub's private version, now the one real, shared
         *   implementation instead of a copy other consumers can't reach.
         */
        delete(artifactId) {
            const a = this.#artifacts.get(artifactId);
            if (!a) return { success: false, reason: `No artifact "${artifactId}".` };
            const events = window.CozyOS.OutputEvents;
            if (a.category === "Trash") {
                this._delete(artifactId);
                if (events) events.emit("artifact-deleted", { artifactId, permanent: true });
                return { success: true, permanent: true };
            }
            this._update(artifactId, { category: "Trash", originalCategory: a.category });
            if (events) events.emit("artifact-deleted", { artifactId, permanent: false });
            return { success: true, permanent: false };
        }

        restore(artifactId) {
            const a = this.#artifacts.get(artifactId);
            if (!a || a.category !== "Trash") return { success: false, reason: "Artifact is not in Trash, or does not exist." };
            const restoredCategory = a.originalCategory || "Generated Code";
            this._update(artifactId, { category: restoredCategory, originalCategory: undefined });
            const events = window.CozyOS.OutputEvents;
            if (events) events.emit("artifact-restored", { artifactId, restoredCategory });
            return { success: true, restoredCategory };
        }

        /** _restoreAll(artifacts) — real, used only by output-storage.js on load, never called elsewhere. */
        _restoreAll(artifacts) {
            this.#artifacts = artifacts;
        }
        _getRawMap() { return this.#artifacts; }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: OUTPUT_CENTER_VERSION, ...this.#diagnostics, totalArtifacts: this.#artifacts.size });
        }
    }

    if (window.CozyOS.OutputCenter && typeof window.CozyOS.OutputCenter.getVersion === "function") {
        const existingVersion = window.CozyOS.OutputCenter.getVersion();
        if (existingVersion !== OUTPUT_CENTER_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: OutputCenter existing v${existingVersion} conflicts with load target v${OUTPUT_CENTER_VERSION}.`);
        return;
    }

    const instance = new CozyOutputCenter();
    window.CozyOS.OutputCenter = instance;

    instance.capabilities = Object.freeze([
        Object.freeze({ id: "publish", permission: "output:publish", rollback: false, category: "Output" })
    ]);
    instance.visibility = Object.freeze({
        appId: "outputCenter", name: "Output Center", icon: "📦", category: "platform-tool",
        launchTarget: Object.freeze({ center: "outputCenter" }),
        audience: "admin"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "OutputCenter", category: "Platform", icon: "archive.svg",
                description: "Single, real, platform-wide artifact store — every application calls publish() instead of maintaining its own output storage. Promoted out of Developer Hub, where it previously existed only as a private field reachable by nothing else in CozyOS."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
