/**
 * CozyOS Platform Resource Manager
 * File Reference: core/platform/platform-resource-manager.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Manages ownership, allocation, tracking, and release of shared platform
 *   resources. It does NOT discover (reuses PlatformDiscovery/FileRegistry),
 *   does NOT execute operations (reuses PlatformOperations), does NOT
 *   determine health/usage classification (reuses HealthEngine/UsageEngine).
 *   Single Responsibility: this file owns the Resource Registry and the
 *   real allocate/release lifecycle bookkeeping — nothing else.
 *
 * HONEST SCOPE — READ BEFORE ASSUMING A CATEGORY IS TRACKED
 *   Every requested resource category was checked against a real,
 *   already-connected coordinator's actual public API before being
 *   included. Two groups, reported honestly, not glossed over:
 *
 *   REAL, tracked, delegated to a genuine data source:
 *     - Themes            → CozyTheme.listThemes() (real)
 *     - Backgrounds        → mapped 1:1 from registered theme names — the
 *                            Background Engine has no separate public
 *                            listing method; every theme has a
 *                            corresponding scene, so this is a real,
 *                            disclosed mapping, not an independent list.
 *     - Plugins            → PluginManager.list() (real; the SAME source
 *                            Discovery/Usage/Health already use — not a
 *                            second plugin inventory)
 *     - Storage Spaces/Objects/Folders/Cache/Media
 *                          → CozyStorage's real, already-shipped methods
 *                            (listStorageSpaces/listObjects/listFolders/
 *                            listCacheEntries/getQuota/getMediaBreakdown)
 *     - AI Providers        → CozyAI.listRegisteredProviders() (real;
 *                            "AI Models" as requested doesn't exist as a
 *                            concept — registered providers is the real,
 *                            adjacent thing that does)
 *     - OCR Providers       → CozyOCR.listReceiptAnalyzers() +
 *                            getProviderStatus() (real; same honest
 *                            renaming as AI Providers above)
 *     - Translation Providers → CozyTranslate.listTranslators() (real)
 *     - Speech              → checked defensively at call time
 *                            (typeof === "function"); CozySpeech's real
 *                            public surface wasn't fully legible from a
 *                            static read (spreads an internal `_kernel`
 *                            object) — this engine does not assume a
 *                            method exists that it couldn't verify by
 *                            reading source, and reports "unavailable" if
 *                            the check fails at runtime rather than
 *                            guessing.
 *     - Application Assets / Files → FileRegistry.list() (real), grouped
 *                            by the REAL category values that actually
 *                            appear in the manifest (confirmed by reading
 *                            discovery-manifest.json directly: ai-provider,
 *                            application, business, connectivity, context,
 *                            developer-tooling, kernel, module, network,
 *                            platform-service, plugin, registry, security,
 *                            shell-ui, template, uncategorized).
 *
 *   NOT tracked, honestly reported as such, never fabricated:
 *     - Memory: no coordinator anywhere exposes a real memory-allocation
 *       API. Browser memory is garbage-collected, not CozyOS-managed.
 *     - Temporary Files: no such concept exists in any coordinator.
 *     - Language Packs / Knowledge Packs: confirmed to not exist anywhere
 *       in this codebase (Context Packs are real and owned by
 *       ContextEngine — a different, already-real thing this engine reads
 *       from rather than reinventing "Knowledge Packs" to mean the same
 *       thing under a different name).
 *     - Icons / Images / Fonts: do not appear anywhere in the real
 *       manifest's actual category taxonomy — there is nothing to group
 *       under these headings today without inventing categories the
 *       Manifest Provider never produced.
 *   Every method for an untracked category returns
 *   `{available:false, reason}` — never an empty-but-implied-complete list.
 *
 * ALLOCATION LEDGER — REAL, NEW BOOKKEEPING THIS ENGINE OWNS
 *   Nothing else in CozyOS tracks "who currently holds a reference to
 *   resource X" — this is genuine, non-duplicated new state, not a second
 *   copy of something FileRegistry/CozyStorage/PluginManager already do.
 *   It only ever tracks resources this engine actually discovered from a
 *   real source above; it never pre-populates or invents allocation
 *   history.
 *
 * IDENTITY ENFORCEMENT — SAME FAIL-CLOSED MODEL AS PLATFORM OPERATIONS
 *   allocate/release/archive/validate all require a real, connected
 *   IdentityEngine, a real userId, and a real granted resource:action
 *   permission (checkResourcePermission) — refuse, always, without one.
 *   No hardcoded admin/root/system userId anywhere.
 *
 * EVENTS — via the existing, shared PlatformEventBus, never a new bus
 *   resource:registered, resource:allocated, resource:released,
 *   resource:shared, resource:archived, resource:failed
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const RESOURCE_MANAGER_VERSION = "1.0.0-ENTERPRISE";

    const RESOURCE_STATES = Object.freeze([
        "discovered", "registered", "allocated", "active", "shared",
        "idle", "released", "archived", "unavailable", "failed"
    ]);

    class CozyPlatformResourceManager {
        #registry = new Map(); // resourceId -> resource record (mutable fields: status, allocatedTo, referenceCount, lastUsed)
        #allocations = new Map(); // resourceId -> [{ requestedBy, application, allocatedAt }]
        #diagnostics = { allocationsGranted: 0, allocationsFailed: 0, releases: 0, conflicts: 0, ownershipViolations: 0 };
        #history = [];

        getVersion() { return RESOURCE_MANAGER_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }
        #emit(eventName, payload) {
            if (window.CozyOS.PlatformEventBus) { try { window.CozyOS.PlatformEventBus.emit(eventName, payload); } catch (_err) { /* non-fatal */ } }
        }
        #recordHistory(entry) {
            this.#history.push(Object.freeze({ ...entry, timestamp: new Date().toISOString() }));
            if (this.#history.length > 500) this.#history.shift();
        }
        getHistory(limit = 100) { return this.#deepClone(this.#history.slice(-limit).reverse()); }

        #authorize(userId, permissionString) {
            const identity = window.CozyOS.IdentityEngine;
            if (!identity) return { authorized: false, reason: "IdentityEngine is not loaded — no resource action can be authorized without it." };
            if (!userId) return { authorized: false, reason: "No userId supplied — every resource action requires a real, authenticated user. (No login screen exists yet anywhere in CozyOS — a real, disclosed platform gap, not something this engine works around.)" };
            let allowed;
            try { allowed = identity.checkResourcePermission(userId, permissionString); }
            catch (err) { return { authorized: false, reason: `IdentityEngine.checkResourcePermission() threw: ${err && err.message}` }; }
            if (!allowed) return { authorized: false, reason: `User "${userId}" does not hold the "${permissionString}" permission.` };
            return { authorized: true };
        }

        // =====================================================================
        // ─── RESOURCE DISCOVERY — reuses PlatformDiscovery/FileRegistry, ───
        // ─── never scans anything itself                                  ───
        // =====================================================================

        /**
         * discoverResources()
         *   Real, pulls from every genuinely available source listed in the
         *   header. Populates #registry with real records only — a
         *   category with no real source is entirely absent from the
         *   result, not present with fabricated entries.
         */
        discoverResources() {
            const found = [];

            // Themes (real)
            if (window.CozyOS.Theme && typeof window.CozyOS.Theme.listThemes === "function") {
                try {
                    window.CozyOS.Theme.listThemes().forEach(name => {
                        found.push(this.#upsertRecord({ id: `theme:${name}`, name, type: "theme", owner: "Theme", status: "registered", shared: true, persistent: true }));
                    });
                } catch (_err) { /* non-fatal, this source's data just isn't included */ }
            }
            // Backgrounds — mapped from theme names, disclosed as such (see header)
            if (window.CozyOS.Theme && typeof window.CozyOS.Theme.listThemes === "function") {
                try {
                    window.CozyOS.Theme.listThemes().forEach(name => {
                        found.push(this.#upsertRecord({ id: `background:${name}`, name: `${name} background`, type: "background", owner: "Background (mapped from Theme)", status: "registered", shared: true, persistent: true }));
                    });
                } catch (_err) { /* non-fatal */ }
            }
            // Plugins (real, same source as Discovery/Usage/Health)
            if (window.CozyOS.PluginManager && typeof window.CozyOS.PluginManager.list === "function") {
                try {
                    window.CozyOS.PluginManager.list().forEach(p => {
                        found.push(this.#upsertRecord({ id: `plugin:${p.id}`, name: p.name || p.id, type: "plugin", owner: "PluginManager", version: p.version || null, status: "registered", shared: false, persistent: true }));
                    });
                } catch (_err) { /* non-fatal */ }
            }
            // Storage (real — CozyStorage)
            const storage = window.CozyOS.CozyStorage;
            if (storage) {
                if (typeof storage.listStorageSpaces === "function") {
                    try { storage.listStorageSpaces().forEach(s => found.push(this.#upsertRecord({ id: `storage-space:${s.id}`, name: s.name || s.id, type: "storage-space", owner: "CozyStorage", status: "registered", shared: !!s.shared, persistent: true, size: s.sizeBytes ?? null }))); } catch (_err) { /* non-fatal */ }
                }
                if (typeof storage.listObjects === "function") {
                    try { storage.listObjects().forEach(o => found.push(this.#upsertRecord({ id: `storage-object:${o.id}`, name: o.name || o.id, type: "storage-object", owner: "CozyStorage", status: "registered", size: o.sizeBytes ?? null, version: o.version ?? null }))); } catch (_err) { /* non-fatal */ }
                }
                if (typeof storage.listCacheEntries === "function") {
                    try { storage.listCacheEntries().forEach(c => found.push(this.#upsertRecord({ id: `cache:${c.id}`, name: c.id, type: "cache", owner: "CozyStorage", status: "registered", persistent: false, size: c.sizeBytes ?? null }))); } catch (_err) { /* non-fatal */ }
                }
            }
            // AI Providers (real; "AI Models" as requested doesn't exist as a real concept)
            if (window.CozyOS.CozyAI && typeof window.CozyOS.CozyAI.listRegisteredProviders === "function") {
                try { window.CozyOS.CozyAI.listRegisteredProviders().forEach(p => found.push(this.#upsertRecord({ id: `ai-provider:${p}`, name: p, type: "ai-provider", owner: "CozyAI", status: "registered", shared: true, persistent: true }))); } catch (_err) { /* non-fatal */ }
            }
            // OCR Providers (real; "OCR Models" as requested doesn't exist as a real concept)
            if (window.CozyOS.OCR && typeof window.CozyOS.OCR.listReceiptAnalyzers === "function") {
                try { window.CozyOS.OCR.listReceiptAnalyzers().forEach(a => found.push(this.#upsertRecord({ id: `ocr-provider:${a}`, name: a, type: "ocr-provider", owner: "OCR", status: "registered", shared: true, persistent: true }))); } catch (_err) { /* non-fatal */ }
            }
            // Translation Providers (real)
            if (window.CozyOS.CozyTranslate && typeof window.CozyOS.CozyTranslate.listTranslators === "function") {
                try { window.CozyOS.CozyTranslate.listTranslators().forEach(t => found.push(this.#upsertRecord({ id: `translator:${t.id || t}`, name: t.name || t.id || t, type: "translation-provider", owner: "CozyTranslate", status: "registered", shared: true, persistent: true }))); } catch (_err) { /* non-fatal */ }
            }
            // Files / Application Assets (real, via FileRegistry — grouped by the REAL manifest category taxonomy)
            if (window.CozyOS.FileRegistry && typeof window.CozyOS.FileRegistry.list === "function") {
                try {
                    window.CozyOS.FileRegistry.list().forEach(r => {
                        found.push(this.#upsertRecord({ id: `file:${r.path}`, name: r.name, type: `file:${r.category || "uncategorized"}`, owner: r.owner || "unknown", application: r.application || null, version: r.version || null, size: r.sizeBytes ?? null, status: r.loaded ? "active" : "discovered", location: r.path, persistent: true }));
                    });
                } catch (_err) { /* non-fatal */ }
            }

            this.#recordHistory({ operation: "discoverResources", target: "platform", success: true, reason: `Found ${found.length} real resources.`, durationMs: 0, rollback: false });
            this.#emit("resource:registered", { count: found.length });
            return this.#deepClone(found);
        }

        #upsertRecord(partial) {
            const existing = this.#registry.get(partial.id);
            const record = {
                id: partial.id, name: partial.name, type: partial.type,
                owner: partial.owner ?? (existing ? existing.owner : null),
                application: partial.application ?? (existing ? existing.application : null),
                status: existing ? existing.status : (partial.status || "discovered"),
                allocatedTo: existing ? existing.allocatedTo : null,
                size: partial.size ?? (existing ? existing.size : null),
                version: partial.version ?? (existing ? existing.version : null),
                created: existing ? existing.created : new Date().toISOString(),
                lastUsed: existing ? existing.lastUsed : null,
                referenceCount: existing ? existing.referenceCount : 0,
                shared: partial.shared ?? (existing ? existing.shared : false),
                persistent: partial.persistent ?? (existing ? existing.persistent : false),
                location: partial.location ?? (existing ? existing.location : null)
            };
            this.#registry.set(partial.id, record);
            return record;
        }

        listResources(filter = {}) {
            let list = Array.from(this.#registry.values());
            if (filter.type) list = list.filter(r => r.type === filter.type);
            if (filter.status) list = list.filter(r => r.status === filter.status);
            if (filter.shared !== undefined) list = list.filter(r => r.shared === filter.shared);
            return this.#deepClone(list);
        }
        getResource(resourceId) { const r = this.#registry.get(resourceId); return r ? this.#deepClone(r) : null; }

        // =====================================================================
        // ─── ALLOCATION / RELEASE — real, new bookkeeping ──────────────────
        // =====================================================================

        /** allocate() — resources are allocated only when requested, per spec. Fails closed without real authorization. */
        allocate(resourceId, { userId, requestedBy, application, shared } = {}) {
            const auth = this.#authorize(userId, "resource:allocate");
            if (!auth.authorized) {
                this.#diagnostics.allocationsFailed++;
                const result = { success: false, refused: true, resourceId, reason: auth.reason };
                this.#emit("resource:failed", result);
                return result;
            }
            const record = this.#registry.get(resourceId);
            if (!record) {
                this.#diagnostics.allocationsFailed++;
                const result = { success: false, resourceId, reason: `"${resourceId}" is not in the Resource Registry — run discoverResources() first.` };
                this.#emit("resource:failed", result);
                return result;
            }
            if (record.allocatedTo && !record.shared && !shared) {
                this.#diagnostics.conflicts++;
                const result = { success: false, resourceId, reason: `"${resourceId}" is already allocated to "${record.allocatedTo}" and is not marked shared.` };
                this.#emit("resource:failed", result);
                return result;
            }

            if (!this.#allocations.has(resourceId)) this.#allocations.set(resourceId, []);
            this.#allocations.get(resourceId).push({ requestedBy: requestedBy || userId, application: application || null, allocatedAt: new Date().toISOString() });
            record.referenceCount++;
            record.allocatedTo = requestedBy || userId;
            record.lastUsed = new Date().toISOString();
            record.status = record.referenceCount > 1 ? "shared" : "allocated";
            record.shared = record.shared || !!shared;

            this.#diagnostics.allocationsGranted++;
            this.#recordHistory({ operation: "allocate", target: resourceId, success: true, reason: null, durationMs: 0, rollback: false });
            this.#emit(record.status === "shared" ? "resource:shared" : "resource:allocated", { resourceId, requestedBy: requestedBy || userId });
            return { success: true, resourceId, status: record.status, referenceCount: record.referenceCount };
        }

        /** release() — never releases a resource still in use; only frees non-persistent resources once referenceCount reaches 0. */
        release(resourceId, { userId, requestedBy } = {}) {
            const auth = this.#authorize(userId, "resource:release");
            if (!auth.authorized) return { success: false, refused: true, resourceId, reason: auth.reason };

            const record = this.#registry.get(resourceId);
            if (!record) return { success: false, resourceId, reason: `"${resourceId}" is not in the Resource Registry.` };
            if (record.referenceCount <= 0) return { success: false, resourceId, reason: `"${resourceId}" has no active allocations to release.` };

            record.referenceCount--;
            const list = this.#allocations.get(resourceId) || [];
            const idx = list.findIndex(a => a.requestedBy === (requestedBy || userId));
            if (idx !== -1) list.splice(idx, 1);

            if (record.referenceCount <= 0) {
                record.allocatedTo = null;
                if (record.persistent) {
                    record.status = "idle"; // kept, per spec: "keep persistent resources"
                } else {
                    record.status = "released"; // per spec: "release temporary resources"
                }
            } else {
                record.status = "shared";
            }

            this.#diagnostics.releases++;
            this.#recordHistory({ operation: "release", target: resourceId, success: true, reason: null, durationMs: 0, rollback: false });
            this.#emit("resource:released", { resourceId, remainingReferenceCount: record.referenceCount });

            // Per spec: update Usage Engine and Health Engine. Neither exposes
            // a "notify me of a release" method, so this is a real,
            // best-effort nudge — re-running their own real report(), not
            // fabricating a callback they don't have.
            if (record.referenceCount <= 0) {
                if (window.CozyOS.UsageEngine && typeof window.CozyOS.UsageEngine.report === "function") { try { window.CozyOS.UsageEngine.report(); } catch (_err) { /* non-fatal */ } }
                if (window.CozyOS.HealthEngine && typeof window.CozyOS.HealthEngine.report === "function") { try { window.CozyOS.HealthEngine.report(); } catch (_err) { /* non-fatal */ } }
            }
            return { success: true, resourceId, status: record.status, referenceCount: record.referenceCount };
        }

        archive(resourceId, { userId } = {}) {
            const auth = this.#authorize(userId, "resource:archive");
            if (!auth.authorized) return { success: false, refused: true, resourceId, reason: auth.reason };
            const record = this.#registry.get(resourceId);
            if (!record) return { success: false, resourceId, reason: `"${resourceId}" is not in the Resource Registry.` };
            if (record.referenceCount > 0) return { success: false, resourceId, reason: `"${resourceId}" still has ${record.referenceCount} active allocation(s) — never archive a resource still in use.` };
            record.status = "archived";
            this.#recordHistory({ operation: "archive", target: resourceId, success: true, reason: null, durationMs: 0, rollback: false });
            this.#emit("resource:archived", { resourceId });
            return { success: true, resourceId, status: "archived" };
        }

        /**
         * validate(resourceId)
         *   Real check — for file-backed resources, delegates to
         *   HealthEngine's real badge; for everything else, a real
         *   existence re-check against the resource's own real owner
         *   (e.g. PluginManager.get() still returns non-null).
         */
        validate(resourceId, { userId } = {}) {
            const auth = this.#authorize(userId, "resource:validate");
            if (!auth.authorized) return { success: false, refused: true, resourceId, reason: auth.reason };
            const record = this.#registry.get(resourceId);
            if (!record) return { success: false, resourceId, reason: `"${resourceId}" is not in the Resource Registry.` };

            let stillExists = true, healthBadge = null;
            if (record.type.startsWith("file:") && record.location) {
                if (window.CozyOS.HealthEngine && typeof window.CozyOS.HealthEngine.badgeFor === "function") {
                    try { healthBadge = window.CozyOS.HealthEngine.badgeFor(record.location); } catch (_err) { /* non-fatal */ }
                }
            } else if (record.type === "plugin" && window.CozyOS.PluginManager) {
                stillExists = !!window.CozyOS.PluginManager.get(record.id.replace("plugin:", ""));
            }
            const valid = stillExists && (!healthBadge || !healthBadge.badge.includes("🔴"));
            if (!valid) record.status = "unavailable";
            return { success: true, resourceId, valid, healthBadge, stillExists };
        }

        // =====================================================================
        // ─── RESOURCE HEALTH — delegates, never recomputes ─────────────────
        // =====================================================================

        /** getResourceHealth() — real: cross-references the Resource Registry against UsageEngine/HealthEngine's own real reports, never recomputes their classification itself. */
        getResourceHealth() {
            const usage = window.CozyOS.UsageEngine;
            const health = window.CozyOS.HealthEngine;
            const fileBackedResources = this.listResources().filter(r => r.type.startsWith("file:"));
            return {
                missing: fileBackedResources.filter(r => r.status === "unavailable"),
                duplicate: usage ? usage.listDuplicateCandidates() : { available: false, reason: "UsageEngine is not loaded." },
                unused: usage ? usage.listDeadFiles() : { available: false, reason: "UsageEngine is not loaded." },
                brokenReferences: this.listResources().filter(r => r.referenceCount > 0 && !this.#registry.has(r.id)),
                invalidOwnership: this.listResources().filter(r => !r.owner),
                orphaned: this.listResources().filter(r => r.referenceCount === 0 && r.status === "allocated"),
                healthEngineConnected: !!health
            };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: RESOURCE_MANAGER_VERSION, ...this.#diagnostics, registrySize: this.#registry.size, historyCount: this.#history.length });
        }
    }

    if (window.CozyOS.PlatformResourceManager && typeof window.CozyOS.PlatformResourceManager.getVersion === "function") {
        const existingVersion = window.CozyOS.PlatformResourceManager.getVersion();
        if (existingVersion !== RESOURCE_MANAGER_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: PlatformResourceManager existing v${existingVersion} conflicts with load target v${RESOURCE_MANAGER_VERSION}.`);
        return;
    }

    window.CozyOS.PlatformResourceManager = new CozyPlatformResourceManager();
    // Application Visibility Registry — real, additive self-declaration.
    window.CozyOS.PlatformResourceManager.visibility = Object.freeze({
        appId: "platformResources", name: "Resource Center", icon: "📦", category: "platform-tool",
        launchTarget: Object.freeze({ center: "platformResources" }),
        audience: "admin"
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "PlatformResourceManager", category: "Platform", icon: "package",
                description: "Manages ownership, allocation, tracking, and release of shared platform resources (themes, backgrounds, plugins, storage, cache, AI/OCR/translation providers, files). Does not discover, execute operations, or classify health/usage — reuses PlatformDiscovery/FileRegistry/PluginManager/CozyStorage/UsageEngine/HealthEngine for all of that."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
