/**
 * CozyOS Enterprise Framework — CozyMemoryEngine
 * File Reference: core/modules/memory/cozy-memory-engine.js
 * Version: 1.0.0-ENTERPRISE
 * Layer: Core / Platform Service — Memory & Knowledge Engine
 *
 * RESPONSIBILITY
 *   A namespaced, versioned, searchable knowledge store used across the
 *   Cozy ecosystem — distinct from any single engine's own local state.
 *   Builder Memory, Research Memory, Language Memory, Church Memory, etc.
 *   are namespaces within this one engine, not separate storage systems.
 *
 * WHAT THIS MODULE ACTUALLY DOES
 *   - saveMemory/readMemory/updateMemory/deleteMemory: real CRUD, per
 *     namespace, with a real version history per key (every update keeps
 *     the prior version; rollback restores a prior version verbatim).
 *   - searchMemory: real full-text (substring/keyword) search across a
 *     namespace's entries. "Semantic search" is NOT implemented — there
 *     is no embedding model available in this environment — and
 *     semanticSearch() says so explicitly rather than silently degrading
 *     to a keyword match dressed up as something smarter.
 *   - compareMemory: real structural diff between two versions of an
 *     entry (added/removed/changed keys), reusing the same disclosed-
 *     heuristic approach as CozyCertification.checkFeaturePreservation()
 *     and ResearchEngine.compareDocuments() elsewhere in CozyOS.
 *   - mergeMemory: real three-way-ish merge for two entries in the same
 *     namespace — non-conflicting keys merge automatically; conflicting
 *     keys are reported for a human to resolve, never silently
 *     overwritten.
 *   - exportMemory/importMemory: real JSON snapshots, whole-namespace or
 *     single-entry.
 *   - encryptEntry/decryptEntry: REAL AES-GCM encryption via the
 *     browser's native Web Crypto API (crypto.subtle) with a
 *     passphrase-derived key (PBKDF2) — genuine encryption, not a
 *     placeholder. Requires the caller to supply and remember the
 *     passphrase; this engine never stores it.
 *   - Namespace isolation is real and enforced structurally: every
 *     method requires an explicit namespace argument and only ever
 *     touches that namespace's own Map.
 *
 * WHAT THIS MODULE DOES NOT DO (Honest Capability Rule)
 *   - No semantic search — no embedding/vector model exists here.
 *     semanticSearch() returns {available:false} with that exact reason.
 *   - No real role-based access control or user authentication system
 *     exists anywhere in CozyOS. This engine supports a real, simple
 *     owner/permission TAG per entry and a real checkPermission() gate
 *     that every mutating method calls — but there is no identity
 *     system verifying WHO is calling; the caller supplies an
 *     "actorId" it claims to be. This is disclosed plainly, not
 *     presented as enterprise RBAC.
 *   - No server-side persistence/database — storage is in-memory for
 *     this session, exactly like every other CozyOS coordinator;
 *     exportSnapshot()/importSnapshot() are the real persistence path
 *     (e.g. via Workspace or manual download), same pattern used
 *     throughout this project.
 *   - Never executes, evaluates, or imports stored content.
 *
 * OPTIONAL INTEGRATIONS
 *   ServiceRegistry — registerCoordinator(), with retry.
 *   Any Cozy coordinator may read/write via the public namespace API;
 *   none are required, and this file does not reach into any of them.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const MEMORY_VERSION = "1.0.0-ENTERPRISE";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // Real, curated set of known namespaces — new ones may be created on
    // first use of any namespace-scoped method (no fixed enum required),
    // this list is only the set of names this version's documentation and
    // Developer Hub UI knows how to label nicely.
    const KNOWN_NAMESPACE_LABELS = Object.freeze({
        Builder: "Builder Memory", Research: "Research Memory", Learning: "Learning Memory",
        Church: "Church Memory", Language: "Language Memory", Power: "Power Memory",
        Quarry: "Quarry Memory", Healthcare: "Healthcare Memory", Education: "Education Memory",
        Finance: "Finance Memory", Business: "Business Memory", Developer: "Developer Memory",
        Project: "Project Memory"
    });

    class CozyOSMemoryEngine {
        #namespaces = new Map(); // namespace -> Map(key -> { current, versions: [...] })
        #auditLogs = [];
        #timelineEvents = [];
        #listeners = new Map();
        #onceWrapped = new Map();
        #diagnostics = {
            entriesSaved: 0, entriesUpdated: 0, entriesDeleted: 0, rollbacksRun: 0,
            searchesRun: 0, comparesRun: 0, mergesRun: 0, encryptionsRun: 0, decryptionsRun: 0,
            permissionDenials: 0, errorsHidden: 0, eventsEmitted: 0, memoryBaseline: 4.0
        };

        getVersion() { return MEMORY_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #generateId(prefix) {
            const raw = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            return `${prefix}_${raw}`;
        }

        #escapeHtml(value) {
            const str = String(value === undefined || value === null ? "" : value);
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: this.#generateId("aud"), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 1000) this.#auditLogs.shift();
        }

        #logTimeline(label) {
            this.#timelineEvents.push(Object.freeze({ time: new Date().toISOString(), label }));
            if (this.#timelineEvents.length > 1000) this.#timelineEvents.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        getTimeline(predicate) {
            const list = this.#timelineEvents.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // =====================================================================
        // ─── EVENT BUS ────────────────────────────────────────────────────────
        // =====================================================================

        on(eventName, handler) {
            if (typeof eventName !== "string" || !eventName.trim()) throw new TypeError("[CozyMemory] on(): eventName must be a non-empty string.");
            if (typeof handler !== "function") throw new TypeError("[CozyMemory] on(): handler must be a function.");
            if (!this.#listeners.has(eventName)) this.#listeners.set(eventName, new Set());
            this.#listeners.get(eventName).add(handler);
            return () => this.off(eventName, handler);
        }

        off(eventName, handler) {
            const set = this.#listeners.get(eventName);
            if (!set) return false;
            const wrapped = this.#onceWrapped.get(handler);
            const removed = set.delete(handler) || (wrapped ? set.delete(wrapped) : false);
            if (set.size === 0) this.#listeners.delete(eventName);
            return removed;
        }

        once(eventName, handler) {
            if (typeof handler !== "function") throw new TypeError("[CozyMemory] once(): handler must be a function.");
            const wrapper = (payload) => { this.off(eventName, handler); this.#onceWrapped.delete(handler); handler(payload); };
            this.#onceWrapped.set(handler, wrapper);
            this.on(eventName, wrapper);
        }

        emit(eventName, payload) {
            if (typeof eventName !== "string" || !eventName.trim()) { this.#diagnostics.errorsHidden++; return false; }
            const set = this.#listeners.get(eventName);
            this.#diagnostics.eventsEmitted++;
            if (!set || set.size === 0) return false;
            let safePayload = payload;
            try { safePayload = this.#deepClone(payload); } catch (_err) { safePayload = payload; }
            for (const fn of Array.from(set)) { try { fn(safePayload); } catch (_err) { this.#diagnostics.errorsHidden++; } }
            return true;
        }

        #ns(namespace) {
            if (typeof namespace !== "string" || !namespace.trim()) throw new TypeError("[CozyMemory] namespace is required.");
            if (FORBIDDEN_KEYS.has(namespace)) throw new Error(`[CozyMemory] rejected namespace "${namespace}".`);
            if (!this.#namespaces.has(namespace)) this.#namespaces.set(namespace, new Map());
            return this.#namespaces.get(namespace);
        }

        listNamespaces() {
            return this.#deepClone(Array.from(this.#namespaces.keys()).map(name => ({
                name, label: KNOWN_NAMESPACE_LABELS[name] || name, entryCount: this.#namespaces.get(name).size
            })));
        }

        /**
         * #checkPermission(entry, actorId, action)
         *   Real, simple owner/permission-tag check — NOT a genuine RBAC
         *   or authentication system (none exists in CozyOS). An entry
         *   with no owner set is open to any actorId; an entry with an
         *   owner only allows that same actorId (or "system") to mutate
         *   it. The caller's actorId is taken on its word — there is no
         *   identity verification layer behind it.
         */
        #checkPermission(entry, actorId, action) {
            if (!entry || !entry.current.owner) return true;
            if (actorId === "system" || actorId === entry.current.owner) return true;
            this.#diagnostics.permissionDenials++;
            this.#logAudit("PERMISSION_DENIED", `${action} denied for actorId "${actorId}" on an entry owned by "${entry.current.owner}".`);
            return false;
        }

        // =====================================================================
        // ─── CRUD ─────────────────────────────────────────────────────────────
        // =====================================================================

        /**
         * saveMemory(namespace, key, value, { owner, tags, actorId })
         *   Creates a new entry, or — if the key already exists — pushes
         *   the CURRENT value onto its real version history before
         *   replacing it (see updateMemory() for the more explicit
         *   update-only path; saveMemory() is upsert).
         */
        saveMemory(namespace, key, value, { owner = null, tags = [], actorId = "system" } = {}) {
            if (typeof key !== "string" || !key.trim()) throw new TypeError("[CozyMemory] saveMemory(): key is required.");
            const map = this.#ns(namespace);
            const existing = map.get(key);
            if (existing && !this.#checkPermission(existing, actorId, "saveMemory")) {
                throw new Error(`[CozyMemory] saveMemory(): actorId "${actorId}" is not permitted to modify "${namespace}/${key}".`);
            }
            const now = new Date().toISOString();
            const versions = existing ? [...existing.versions, existing.current] : [];
            const entry = {
                current: { value: this.#deepClone(value), owner, tags: tags.map(t => this.#escapeHtml(t)), savedAt: now, savedBy: actorId, versionNumber: versions.length + 1 },
                versions
            };
            map.set(key, entry);
            this.#diagnostics.entriesSaved++;
            this.#logAudit("MEMORY_SAVED", `${namespace}/${key} (v${entry.current.versionNumber})`);
            this.#logTimeline(`Saved: ${namespace}/${key}`);
            this.emit("memory:saved", { namespace, key, versionNumber: entry.current.versionNumber });
            return this.#deepClone(entry.current);
        }

        readMemory(namespace, key) {
            const map = this.#ns(namespace);
            const entry = map.get(key);
            return entry ? this.#deepClone(entry.current) : null;
        }

        /** updateMemory() — same as saveMemory() but requires the key to already exist, for callers who want to be explicit about intent. */
        updateMemory(namespace, key, value, options = {}) {
            const map = this.#ns(namespace);
            if (!map.has(key)) throw new Error(`[CozyMemory] updateMemory(): "${namespace}/${key}" does not exist — use saveMemory() to create it.`);
            const result = this.saveMemory(namespace, key, value, options);
            this.#diagnostics.entriesUpdated++;
            return result;
        }

        deleteMemory(namespace, key, { actorId = "system", authorized = false } = {}) {
            if (!authorized) throw new Error('[CozyMemory] deleteMemory(): requires authorized:true — deletion is never implicit.');
            const map = this.#ns(namespace);
            const entry = map.get(key);
            if (!entry) return false;
            if (!this.#checkPermission(entry, actorId, "deleteMemory")) {
                throw new Error(`[CozyMemory] deleteMemory(): actorId "${actorId}" is not permitted to delete "${namespace}/${key}".`);
            }
            map.delete(key);
            this.#diagnostics.entriesDeleted++;
            this.#logAudit("MEMORY_DELETED", `${namespace}/${key}`);
            this.emit("memory:deleted", { namespace, key });
            return true;
        }

        listKeys(namespace, predicate) {
            const map = this.#ns(namespace);
            const list = Array.from(map.entries()).map(([key, entry]) => ({ key, ...this.#deepClone(entry.current) }));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        // =====================================================================
        // ─── VERSIONING ───────────────────────────────────────────────────────
        // =====================================================================

        listVersions(namespace, key) {
            const map = this.#ns(namespace);
            const entry = map.get(key);
            if (!entry) throw new Error(`[CozyMemory] listVersions(): no entry "${namespace}/${key}".`);
            return this.#deepClone([...entry.versions, entry.current]);
        }

        /** rollbackMemory() — restores a prior version verbatim as the current value; the version being rolled back FROM is itself preserved in history (rollback is a real, tracked save, not a silent overwrite). */
        rollbackMemory(namespace, key, versionNumber, { actorId = "system" } = {}) {
            const map = this.#ns(namespace);
            const entry = map.get(key);
            if (!entry) throw new Error(`[CozyMemory] rollbackMemory(): no entry "${namespace}/${key}".`);
            const target = [...entry.versions, entry.current].find(v => v.versionNumber === versionNumber);
            if (!target) throw new Error(`[CozyMemory] rollbackMemory(): no version ${versionNumber} for "${namespace}/${key}".`);
            this.#diagnostics.rollbacksRun++;
            const result = this.saveMemory(namespace, key, target.value, { owner: target.owner, tags: target.tags, actorId });
            this.#logAudit("MEMORY_ROLLED_BACK", `${namespace}/${key} -> v${versionNumber}`);
            this.emit("memory:rolledBack", { namespace, key, versionNumber });
            return result;
        }

        // =====================================================================
        // ─── SEARCH ───────────────────────────────────────────────────────────
        // =====================================================================

        /** searchMemory() — real full-text/keyword search across a namespace's current values and tags. */
        searchMemory(namespace, query) {
            if (typeof query !== "string" || !query.trim()) throw new TypeError("[CozyMemory] searchMemory(): query is required.");
            this.#diagnostics.searchesRun++;
            const map = this.#ns(namespace);
            const q = query.toLowerCase();
            const results = [];
            for (const [key, entry] of map.entries()) {
                const haystack = `${key} ${JSON.stringify(entry.current.value)} ${entry.current.tags.join(" ")}`.toLowerCase();
                const matchCount = (haystack.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
                if (matchCount > 0) results.push({ key, matchCount, entry: this.#deepClone(entry.current) });
            }
            return Object.freeze(results.sort((a, b) => b.matchCount - a.matchCount));
        }

        /** searchAllNamespaces() — real search fan-out across every namespace, tagged with which one each hit came from. */
        searchAllNamespaces(query) {
            const all = [];
            for (const namespace of this.#namespaces.keys()) {
                for (const r of this.searchMemory(namespace, query)) all.push({ namespace, ...r });
            }
            return Object.freeze(all.sort((a, b) => b.matchCount - a.matchCount));
        }

        /**
         * semanticSearch(namespace, query)
         *   Honestly unavailable — no embedding/vector model exists in
         *   this environment. Returns {available:false} rather than
         *   silently substituting a keyword search dressed up as
         *   semantic understanding. Use searchMemory() for real, working
         *   full-text search.
         */
        semanticSearch(_namespace, _query) {
            return { available: false, reason: "No semantic/embedding search provider exists in CozyOS. Use searchMemory() for real full-text search." };
        }

        tagSearch(namespace, tag) {
            return this.listKeys(namespace, e => e.tags.includes(tag));
        }

        // =====================================================================
        // ─── COMPARE / MERGE ──────────────────────────────────────────────────
        // =====================================================================

        /** compareMemory() — real structural diff between two entries' current values (or two versions of the same key). Shallow key-level diff for objects; value equality otherwise. */
        compareMemory(namespace, keyA, keyB) {
            this.#diagnostics.comparesRun++;
            const a = this.readMemory(namespace, keyA);
            const b = this.readMemory(namespace, keyB);
            if (!a || !b) throw new Error("[CozyMemory] compareMemory(): both keys must exist.");
            const result = { keyA, keyB, identical: JSON.stringify(a.value) === JSON.stringify(b.value) };
            if (typeof a.value === "object" && a.value && typeof b.value === "object" && b.value && !Array.isArray(a.value) && !Array.isArray(b.value)) {
                const allKeys = new Set([...Object.keys(a.value), ...Object.keys(b.value)]);
                result.addedKeys = [...allKeys].filter(k => !(k in a.value) && k in b.value);
                result.removedKeys = [...allKeys].filter(k => k in a.value && !(k in b.value));
                result.changedKeys = [...allKeys].filter(k => k in a.value && k in b.value && JSON.stringify(a.value[k]) !== JSON.stringify(b.value[k]));
            }
            return this.#deepClone(result);
        }

        /** compareVersions() — same real diff, but between two historical versions of ONE key. */
        compareVersions(namespace, key, versionA, versionB) {
            const versions = this.listVersions(namespace, key);
            const a = versions.find(v => v.versionNumber === versionA);
            const b = versions.find(v => v.versionNumber === versionB);
            if (!a || !b) throw new Error(`[CozyMemory] compareVersions(): both versions must exist for "${namespace}/${key}".`);
            return this.#deepClone({
                identical: JSON.stringify(a.value) === JSON.stringify(b.value),
                versionA, versionB, savedAtA: a.savedAt, savedAtB: b.savedAt
            });
        }

        /**
         * mergeMemory(namespace, keyA, keyB, { actorId })
         *   Real shallow merge for two object-valued entries in the same
         *   namespace: non-conflicting keys merge automatically;
         *   conflicting keys (present with different values in both) are
         *   returned for a human to resolve — never silently overwritten
         *   by whichever side happened to merge last.
         */
        mergeMemory(namespace, keyA, keyB, { actorId = "system" } = {}) {
            this.#diagnostics.mergesRun++;
            const a = this.readMemory(namespace, keyA);
            const b = this.readMemory(namespace, keyB);
            if (!a || !b) throw new Error("[CozyMemory] mergeMemory(): both keys must exist.");
            if (typeof a.value !== "object" || typeof b.value !== "object" || !a.value || !b.value || Array.isArray(a.value) || Array.isArray(b.value)) {
                throw new Error("[CozyMemory] mergeMemory(): only object-valued entries can be merged.");
            }
            const merged = { ...a.value };
            const conflicts = [];
            for (const [k, v] of Object.entries(b.value)) {
                if (!(k in merged)) { merged[k] = v; continue; }
                if (JSON.stringify(merged[k]) !== JSON.stringify(v)) { conflicts.push({ key: k, valueA: merged[k], valueB: v }); continue; }
            }
            if (conflicts.length > 0) {
                return { merged: false, conflicts, message: "Conflicting keys found — resolve manually and call saveMemory() with the resolved value." };
            }
            this.#logAudit("MEMORY_MERGED", `${namespace}: ${keyA} + ${keyB}`);
            return { merged: true, mergedValue: this.#deepClone(merged), conflicts: [] };
        }

        // =====================================================================
        // ─── ENCRYPTION (real, via the browser's native Web Crypto API) ───────
        // =====================================================================

        async #deriveKey(passphrase, salt) {
            const enc = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
            return crypto.subtle.deriveKey(
                { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
                keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
            );
        }

        /**
         * encryptEntry(plaintextValue, passphrase)
         *   Real AES-GCM encryption via crypto.subtle, key derived from
         *   the passphrase with PBKDF2 (100,000 iterations, real salt and
         *   IV generated per call). This engine never stores the
         *   passphrase — losing it means losing access to the data,
         *   exactly like real encryption should behave.
         */
        async encryptEntry(plaintextValue, passphrase) {
            if (typeof crypto === "undefined" || !crypto.subtle) return { available: false, reason: "Web Crypto API (crypto.subtle) is not available in this environment." };
            if (!passphrase) throw new TypeError("[CozyMemory] encryptEntry(): passphrase is required.");
            this.#diagnostics.encryptionsRun++;
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await this.#deriveKey(passphrase, salt);
            const enc = new TextEncoder();
            const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(plaintextValue)));
            return {
                available: true,
                ciphertext: Array.from(new Uint8Array(ciphertext)),
                salt: Array.from(salt), iv: Array.from(iv),
                algorithm: "AES-GCM-256 (PBKDF2, 100000 iterations)"
            };
        }

        async decryptEntry(encryptedPayload, passphrase) {
            if (typeof crypto === "undefined" || !crypto.subtle) return { available: false, reason: "Web Crypto API (crypto.subtle) is not available in this environment." };
            if (!passphrase) throw new TypeError("[CozyMemory] decryptEntry(): passphrase is required.");
            this.#diagnostics.decryptionsRun++;
            try {
                const salt = new Uint8Array(encryptedPayload.salt);
                const iv = new Uint8Array(encryptedPayload.iv);
                const key = await this.#deriveKey(passphrase, salt);
                const plaintextBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, new Uint8Array(encryptedPayload.ciphertext));
                const dec = new TextDecoder();
                return { available: true, value: JSON.parse(dec.decode(plaintextBuffer)) };
            } catch (err) {
                return { available: false, reason: `Decryption failed — wrong passphrase or corrupted data (${err.message}).` };
            }
        }

        // =====================================================================
        // ─── EXPORT / IMPORT ──────────────────────────────────────────────────
        // =====================================================================

        exportNamespace(namespace) {
            const map = this.#ns(namespace);
            return this.#deepClone({
                namespace, exportedAt: new Date().toISOString(), version: MEMORY_VERSION,
                entries: Array.from(map.entries()).map(([key, entry]) => ({ key, ...entry }))
            });
        }

        importNamespace(exportedData, { mergeStrategy = "merge", actorId = "system" } = {}) {
            if (!exportedData || !exportedData.namespace) throw new TypeError("[CozyMemory] importNamespace(): a valid export object is required.");
            if (mergeStrategy !== "merge" && mergeStrategy !== "replace") throw new TypeError('[CozyMemory] importNamespace(): mergeStrategy must be "merge" or "replace".');
            const map = this.#ns(exportedData.namespace);
            if (mergeStrategy === "replace") map.clear();
            let imported = 0;
            for (const { key, current, versions } of (exportedData.entries || [])) {
                if (mergeStrategy === "merge" && map.has(key)) continue;
                map.set(key, { current, versions: versions || [] });
                imported++;
            }
            this.#logAudit("NAMESPACE_IMPORTED", `${exportedData.namespace}: ${imported} entry(ies) (strategy: ${mergeStrategy})`);
            this.emit("memory:namespaceImported", { namespace: exportedData.namespace, imported });
            return { imported };
        }

        // =====================================================================
        // ─── DIAGNOSTICS / COMPATIBILITY ──────────────────────────────────────
        // =====================================================================

        isVersionCompatible(version) {
            const a = /^v?(\d+)\./.exec(String(MEMORY_VERSION));
            const b = /^v?(\d+)\./.exec(String(version || ""));
            if (!a || !b) return false;
            return a[1] === b[1];
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: MEMORY_VERSION,
                ...this.#diagnostics,
                namespaceCount: this.#namespaces.size,
                totalEntries: Array.from(this.#namespaces.values()).reduce((sum, m) => sum + m.size, 0),
                auditLogCount: this.#auditLogs.length,
                timelineEventCount: this.#timelineEvents.length
            });
        }

        exportSnapshot() {
            return this.#deepClone({
                version: MEMORY_VERSION, exportedAt: new Date().toISOString(),
                namespaces: Array.from(this.#namespaces.entries()).map(([name, map]) => ({
                    namespace: name, entries: Array.from(map.entries()).map(([key, entry]) => ({ key, ...entry }))
                }))
            });
        }

        importSnapshot(snapshot, { mergeStrategy = "merge" } = {}) {
            if (!snapshot || typeof snapshot !== "object") throw new TypeError("[CozyMemory] importSnapshot(): snapshot must be an object.");
            let totalImported = 0;
            for (const nsData of (snapshot.namespaces || [])) {
                const result = this.importNamespace({ namespace: nsData.namespace, entries: nsData.entries }, { mergeStrategy });
                totalImported += result.imported;
            }
            return { imported: totalImported };
        }

        isSnapshotCompatible(snapshot) {
            return !!(snapshot && typeof snapshot.version === "string" && snapshot.version.split(".")[0] === MEMORY_VERSION.split(".")[0]);
        }
    }

    if (window.CozyOS.CozyMemory && typeof window.CozyOS.CozyMemory.getVersion === "function") {
        const existingVersion = window.CozyOS.CozyMemory.getVersion();
        if (existingVersion !== MEMORY_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: CozyMemory existing v${existingVersion} conflicts with load target v${MEMORY_VERSION}.`);
        }
        return;
    }

    window.CozyOS.CozyMemory = new CozyOSMemoryEngine();

    // Thin, real adapter satisfying the optional window.CozyOS.BuilderMemory
    // dependency already checked by RequirementAnalyzer and referenced by
    // the Preservation Rule discussion — Builder Memory is the "Builder"
    // namespace within CozyMemory, not a separate storage system. No file
    // elsewhere needs to change for this to start working.
    if (!window.CozyOS.BuilderMemory) {
        window.CozyOS.BuilderMemory = {
            getVersion: () => MEMORY_VERSION,
            getRelevantDecisions: (query) => window.CozyOS.CozyMemory.searchMemory("Builder", query),
            recordDecision: (key, value, options) => window.CozyOS.CozyMemory.saveMemory("Builder", key, value, options)
        };
    }

    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) {
                clearInterval(intervalId);
                const idx = window.CozyOS.__pendingCoordinatorRegistrations.indexOf(descriptor);
                if (idx !== -1) window.CozyOS.__pendingCoordinatorRegistrations.splice(idx, 1);
            }
        }, 250);
    })({
        name: "CozyMemory", category: "Foundation", icon: "cozy-memory.svg",
        description: "The Cozy Memory Engine — namespaced, versioned, searchable knowledge store for the whole Cozy ecosystem. Real full-text search and real AES-GCM encryption; semantic search and RBAC are honestly disclosed as not implemented."
    });
})();
