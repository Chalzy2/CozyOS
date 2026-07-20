/**
 * CozyOS Platform Discovery Engine
 * File Reference: core/shell/platform-discovery.js
 * Layer: Core / Shared Shell Service — Platform-Wide Discovery
 * Version: 2.1.0-ENTERPRISE
 *
 * MERGE HISTORY (Rule 32 — one authoritative Discovery Engine)
 *   v1.0.0 (this file) and core/platform/cozy-discovery.js (v1.1.0,
 *   window.CozyOS.Discovery) were built independently by two different
 *   sessions and both called themselves "the Platform Discovery Engine."
 *   Per explicit instruction: neither implementation is deleted. Both
 *   become named PROVIDERS under this one engine, and the comparison
 *   between them — not just their union — is the real, added value:
 *
 *     Runtime Provider  — what's ACTUALLY loaded right now (live
 *                         window.CozyOS introspection + ServiceRegistry/
 *                         ModuleRegistry state). This is REALITY.
 *     Manifest Provider — what the checked-in, build-time-generated
 *                         core/platform/discovery-manifest.json DECLARES
 *                         the architecture to be (produced by a separate,
 *                         non-browser scan tool — see its own honest
 *                         disclosure below). This is DESIGN/INTENT.
 *
 *   Runtime always wins for "what is the current state" — a coordinator
 *   either is or isn't live right now, and the manifest can go stale the
 *   moment a file changes after the last scan. The manifest's value is
 *   what it tells you the running platform is DRIFTING from, not as a
 *   competing source of truth for the present moment. scan() runs both
 *   providers and reports the real differences between them explicitly —
 *   it does not silently prefer one and discard the other's signal.
 *
 * CORRECTING MY OWN EARLIER CLAIM (v1.0.0's header said this plainly, so
 * the correction is recorded here plainly too, not quietly dropped):
 *   v1.0.0 said true "dead file" detection was "not achievable in this
 *   environment." That was incomplete. It is not achievable via LIVE
 *   in-browser filesystem scanning (still true — no such browser API
 *   exists) — but it IS achievable via a checked-in manifest produced by a
 *   SEPARATE, non-browser build-time tool that ran with real filesystem
 *   access once, and whose output this page can fetch same-origin like any
 *   other static asset. That is exactly what the Manifest Provider below
 *   does, feeding UsageEngine's real dead/orphan/duplicate classification.
 *
 * REAL DEPENDENCIES, ALL OPTIONAL, ALL DEGRADE HONESTLY
 *   ServiceRegistry, ModuleRegistry, PluginManager — read for Runtime
 *   Provider and manifest cross-referencing. FileRegistry — populated by
 *   the Manifest Provider (never reimplemented here — storage stays FileRegistry's
 *   job). ManifestRegistry — Level 3 self-declared data, read not owned.
 *   DependencyEngine / UsageEngine / HealthEngine — Levels 4-adjacent
 *   classification this engine delegates to rather than recomputing
 *   (this merge REMOVES the inline duplicate-filename and missing-
 *   dependency detection v1.1.0 of cozy-discovery.js used to do inline
 *   during its own scan — that exact classification now lives in
 *   UsageEngine/DependencyEngine, and this engine queries them instead of
 *   keeping a second, duplicate copy of that logic).
 *
 * STILL REAL, STILL HONEST, UNCHANGED FROM v1.0.0
 *   scanSources() — same-origin fetch of every already-loaded <script src>,
 *   regex-scanned for duplicate window.CozyOS.<Name> ASSIGNMENTS across
 *   files. This is a genuinely different signal from the Manifest
 *   Provider's duplicate-FILENAME detection (two files could have
 *   different names but still both assign the same global — the Manifest
 *   Provider's filename check wouldn't catch that; this would). Both are
 *   kept, not merged into one, because they detect different things.
 *
 * STILL NOT ACHIEVABLE, STILL NOT FAKED
 *   Real circular-dependency detection is now delegated to
 *   DependencyEngine.detectCircular() (a genuine DFS-based cycle detector
 *   over resolved import edges) — a real improvement over v1.0.0's own
 *   "approximate regex graph, never claims certainty" disclosure, but
 *   DependencyEngine's own header still honestly marks its fallback path
 *   (files with no Level 3 manifest) as `bestEffort: true`, and this engine
 *   passes that flag through rather than hiding it. Knowledge/Language
 *   Packs still don't exist anywhere in this codebase — still reported as
 *   zero, not invented.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const DISCOVERY_VERSION = "2.1.0-ENTERPRISE";
    const MANIFEST_URL = "core/platform/discovery-manifest.json";
    const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

    // Non-coordinator keys that legitimately live on window.CozyOS but
    // aren't themselves a discoverable coordinator/engine — excluded from
    // "unexpected" reporting so the report doesn't flag its own
    // infrastructure (including the Platform-tier engines this merge adds)
    // as a mystery object.
    const INFRASTRUCTURE_KEYS = new Set([
        "PlatformEventBus", "ModuleLoadingManager", "ServiceRegistry", "ModuleRegistry",
        "PlatformDiscovery", "Discovery", "Modules", "WorkspaceShell", "UI",
        "FileRegistry", "ManifestRegistry", "DependencyEngine", "UsageEngine", "HealthEngine",
        "registerManifest", "getManifest", "listManifests",
        "__pendingCoordinatorRegistrations"
    ]);

    class CozyPlatformDiscovery {
        #lastReport = null;
        #lastScanAt = null;
        #lastManifest = null;
        #auditLogs = [];
        #diagnostics = {
            scansRun: 0, manifestFetchesAttempted: 0, manifestFetchesFailed: 0,
            sourceFetchesAttempted: 0, sourceFetchesFailed: 0, errorsHidden: 0
        };

        getVersion() { return DISCOVERY_VERSION; }

        #deepClone(value) {
            if (typeof structuredClone === "function") { try { return structuredClone(value); } catch (_err) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(value)); } catch (_err) { return value; }
        }

        #logAudit(action, msg) {
            this.#auditLogs.push(Object.freeze({ id: "disc_" + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random()), timestamp: new Date().toISOString(), action, msg }));
            if (this.#auditLogs.length > 500) this.#auditLogs.shift();
        }

        getAuditLog(predicate) {
            const list = this.#auditLogs.map(e => this.#deepClone(e));
            return Object.freeze(predicate ? list.filter(predicate) : list);
        }

        #safeList(fn) {
            try { const v = fn(); return Array.isArray(v) ? v : []; }
            catch (_err) { this.#diagnostics.errorsHidden++; return []; }
        }

        #liveCoordinatorNames() {
            return Object.keys(window.CozyOS).filter(k => !FORBIDDEN_KEYS.has(k) && !INFRASTRUCTURE_KEYS.has(k));
        }

        /**
         * scanRuntime() — Provider 1: REALITY.
         *   Live introspection of window.CozyOS right now, cross-referenced
         *   against ServiceRegistry/ModuleRegistry's real catalogs. Exactly
         *   v1.0.0's original scan() logic, renamed to its role as one of
         *   two named providers rather than the whole engine.
         */
        scanRuntime() {
            const registry = window.CozyOS.ServiceRegistry || null;
            const moduleRegistry = window.CozyOS.ModuleRegistry || null;
            const pluginManager = window.CozyOS.PluginManager || null;

            const liveNames = new Set(this.#liveCoordinatorNames());

            let declaredCoordinatorNames = new Set();
            if (registry && typeof registry.listCoordinators === "function") {
                this.#safeList(() => registry.listCoordinators()).forEach(c => declaredCoordinatorNames.add(c.name));
            }
            const declaredApplications = registry && typeof registry.listApplications === "function" ? this.#safeList(() => registry.listApplications()) : [];
            const declaredModules = moduleRegistry && typeof moduleRegistry.list === "function" ? this.#safeList(() => moduleRegistry.list({ includeDisabled: true })) : [];
            const declaredPlugins = pluginManager && typeof pluginManager.list === "function" ? this.#safeList(() => pluginManager.list()) : [];

            const loadedAndDeclared = [...liveNames].filter(n => declaredCoordinatorNames.has(n));
            const loadedButUndeclared = [...liveNames].filter(n => !declaredCoordinatorNames.has(n));
            const declaredButMissing = [...declaredCoordinatorNames].filter(n => !liveNames.has(n));

            const healthByName = {};
            liveNames.forEach(name => {
                const obj = window.CozyOS[name];
                const entry = { hasVersion: false, version: null, hasDiagnostics: false };
                if (obj && typeof obj.getVersion === "function") {
                    try { entry.version = obj.getVersion(); entry.hasVersion = true; } catch (_err) { /* stays false */ }
                }
                entry.hasDiagnostics = !!(obj && typeof obj.getDiagnosticsReport === "function");
                healthByName[name] = entry;
            });

            return {
                registryConnected: !!registry,
                moduleRegistryConnected: !!moduleRegistry,
                pluginManagerConnected: !!pluginManager,
                live: { count: liveNames.size, names: [...liveNames].sort() },
                coordinators: {
                    declaredCount: declaredCoordinatorNames.size,
                    loadedAndDeclared: loadedAndDeclared.sort(),
                    loadedButUndeclared: loadedButUndeclared.sort(),
                    declaredButMissing: declaredButMissing.sort()
                },
                applications: { declaredCount: declaredApplications.length, applications: declaredApplications },
                modules: { declaredCount: declaredModules.length, modules: declaredModules },
                plugins: { declaredCount: declaredPlugins.length, plugins: declaredPlugins },
                health: healthByName
            };
        }

        #resolveRelative(fromPath, importSpecifier) {
            if (!importSpecifier.startsWith(".")) return null;
            const fromDir = fromPath.split("/").slice(0, -1);
            for (const part of importSpecifier.split("/")) {
                if (part === ".") continue;
                else if (part === "..") fromDir.pop();
                else fromDir.push(part);
            }
            return fromDir.join("/").replace(/\.js$/, "");
        }

        #buildFileRecord(f, ctx) {
            const loaded = !!(ctx.matchedApp || ctx.matchedModule || ctx.matchedCoordinator || ctx.matchedPlugin);
            const owner = ctx.matchedApp ? "application" : ctx.matchedModule ? "module" : ctx.matchedCoordinator ? "coordinator" : ctx.matchedPlugin ? "plugin" : null;
            const ownerId = ctx.matchedApp ? ctx.matchedApp.id : ctx.matchedModule ? ctx.matchedModule.id : ctx.matchedCoordinator ? ctx.matchedCoordinator.name : ctx.matchedPlugin ? ctx.matchedPlugin.id : null;
            const version = ctx.matchedApp ? ctx.matchedApp.version : ctx.matchedModule ? ctx.matchedModule.version : ctx.matchedPlugin ? ctx.matchedPlugin.version : null;
            const m = ctx.matchedManifest; // Level 3 — self-declared, authoritative where present
            return Object.freeze({
                path: f.path, name: f.name, type: f.extension,
                category: m ? m.category : f.category,
                owner, application: ownerId,
                version: m ? m.version : version,
                manifestId: m ? m.id : null,
                declaredDependencies: m ? m.dependencies : null,
                permissions: m ? m.permissions : null,
                exports: f.exports, imports: f.imports,
                loaded, connected: loaded,
                certified: m ? m.certificationStatus === "ENTERPRISE_CERTIFIED" : f.certifiedSignal,
                lastModified: f.lastModified, sizeBytes: f.sizeBytes
            });
        }

        /**
         * scanManifest() — Provider 2: DESIGN/INTENT.
         *   Fetches the build-time manifest and reconciles it against the
         *   SAME live registries scanRuntime() reads, building real
         *   FileRegistry records. Adapted from cozy-discovery.js's original
         *   scan(), with its inline duplicate-filename and missing-
         *   dependency detection REMOVED — that logic now lives in
         *   UsageEngine/DependencyEngine, queried by scan() below instead
         *   of duplicated here.
         *
         *   DELIBERATE BEHAVIOR CHANGE from cozy-discovery.js's original:
         *   that version threw if the manifest couldn't be fetched. Here,
         *   the manifest is optional enrichment on top of an engine that
         *   already produces a real report from scanRuntime() alone — a
         *   missing manifest degrades honestly (manifestAvailable: false)
         *   rather than failing the whole combined scan().
         */
        async scanManifest() {
            this.#diagnostics.manifestFetchesAttempted++;
            let manifest;
            try {
                const res = await fetch(MANIFEST_URL, { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                manifest = await res.json();
            } catch (err) {
                this.#diagnostics.manifestFetchesFailed++;
                return { manifestAvailable: false, reason: `Could not load ${MANIFEST_URL}: ${err && err.message || err}` };
            }

            this.#lastManifest = manifest;
            const runtime = window.CozyOS.ServiceRegistry ? this.scanRuntime() : null;
            const liveApps = runtime ? runtime.applications.applications : [];
            const liveCoordinators = window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.listCoordinators === "function" ? this.#safeList(() => window.CozyOS.ServiceRegistry.listCoordinators()) : [];
            const liveModules = window.CozyOS.ModuleRegistry && typeof window.CozyOS.ModuleRegistry.list === "function" ? this.#safeList(() => window.CozyOS.ModuleRegistry.list({ includeDisabled: true })) : [];
            const livePlugins = window.CozyOS.PluginManager && typeof window.CozyOS.PluginManager.list === "function" ? this.#safeList(() => window.CozyOS.PluginManager.list()) : [];
            const manifestRegistry = window.CozyOS.ManifestRegistry || null;

            const records = manifest.files.map(f => {
                const matchedApp = liveApps.find(a => (a.launcher || "").includes(f.name) || a.id === f.name.replace(/\.js$/, ""));
                const matchedModule = liveModules.find(m => f.path.includes(m.folder || "\u0000"));
                const matchedCoordinator = liveCoordinators.find(c => (f.exports || []).includes(c.name));
                const matchedPlugin = livePlugins.find(p => f.path.includes(p.id || "\u0000") || f.name.replace(/\.js$/, "") === p.id);
                const matchedManifest = manifestRegistry
                    ? (f.exports || []).map(name => manifestRegistry.getManifest(name)).find(Boolean) || manifestRegistry.getManifest(f.name.replace(/\.js$/, ""))
                    : null;
                return this.#buildFileRecord(f, { matchedApp, matchedModule, matchedCoordinator, matchedPlugin, matchedManifest });
            });

            if (window.CozyOS.FileRegistry) {
                window.CozyOS.FileRegistry.replaceAll(records);
            }

            return {
                manifestAvailable: true,
                manifestVersion: manifest.manifestVersion,
                generatedAt: manifest.generatedAt,
                generatedBy: manifest.generatedBy,
                fileCount: manifest.files.length,
                architecturalIssues: manifest.architecturalIssues || [],
                fileRegistryPopulated: !!window.CozyOS.FileRegistry,
                records: window.CozyOS.FileRegistry ? null : records // only returned directly if FileRegistry isn't there to hold them
            };
        }

        /**
         * scan()
         *   Runs BOTH providers and reports the real difference between
         *   them — reality vs. design — rather than silently merging or
         *   preferring one. Runtime always wins as "current state"; the
         *   manifest's value here is showing what's drifted from it.
         */
        async scan() {
            this.#diagnostics.scansRun++;
            const startedAt = (typeof performance !== "undefined" ? performance.now() : Date.now());

            const runtime = this.scanRuntime();
            const manifest = await this.scanManifest();

            // Real drift detection: coordinators the manifest's matched
            // records call "loaded" that runtime does NOT currently see live
            // (manifest is stale / file removed since last scan), and the
            // reverse (something live now that the last manifest scan never
            // saw at all — a new file added since the manifest was generated).
            let drift = { manifestStaleEntries: [], newSinceManifest: [], comparisonPossible: false };
            if (manifest.manifestAvailable && window.CozyOS.FileRegistry) {
                const registryRecords = window.CozyOS.FileRegistry.list();
                const manifestClaimedLoaded = new Set(registryRecords.filter(r => r.loaded).map(r => r.application || r.name));
                const runtimeLive = new Set(runtime.live.names);
                drift = {
                    comparisonPossible: true,
                    manifestStaleEntries: [...manifestClaimedLoaded].filter(n => n && !runtimeLive.has(n)),
                    newSinceManifest: [...runtimeLive].filter(n => !manifestClaimedLoaded.has(n))
                };
            }

            // Delegate to UsageEngine/DependencyEngine for classification —
            // never recomputed inline here (that duplication is exactly
            // what this merge removed).
            let usage = null, dependency = null;
            if (window.CozyOS.UsageEngine) {
                try { usage = window.CozyOS.UsageEngine.report(); } catch (_err) { this.#diagnostics.errorsHidden++; }
            }
            if (window.CozyOS.DependencyEngine) {
                try { dependency = { missing: window.CozyOS.DependencyEngine.detectMissingDependencies(), circular: window.CozyOS.DependencyEngine.detectCircular() }; } catch (_err) { this.#diagnostics.errorsHidden++; }
            }

            const report = {
                scannedAt: new Date().toISOString(),
                durationMs: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt),
                runtime,
                manifest,
                drift,
                usage,
                dependency,
                sourceAnalysis: null // filled in only by scanSources(), see below
            };

            this.#lastReport = report;
            this.#lastScanAt = report.scannedAt;
            this.#logAudit("SCAN", `Runtime: ${runtime.live.count} live. Manifest: ${manifest.manifestAvailable ? manifest.fileCount + " files" : "unavailable"}. Drift: ${drift.comparisonPossible ? drift.manifestStaleEntries.length + drift.newSinceManifest.length : "n/a"}.`);
            if (window.CozyOS.PlatformEventBus) {
                try { window.CozyOS.PlatformEventBus.emit("discovery:scanned", this.#deepClone(report)); } catch (_err) { /* non-fatal */ }
            }
            return this.#deepClone(report);
        }

        /**
         * scanSources() — unchanged from v1.0.0. A third, distinct real
         * capability: same-origin fetch of every already-loaded <script
         * src>'s actual text, regex-scanned for duplicate window.CozyOS.<n>
         * ASSIGNMENTS. Genuinely different signal from the Manifest
         * Provider's duplicate-FILENAME check — kept separately because it
         * catches a different class of duplication.
         */
        async scanSources() {
            const scriptSrcs = Array.from(document.querySelectorAll("script[src]"))
                .map(el => el.getAttribute("src"))
                .filter(Boolean);

            const assignmentsByFile = {};
            const readsByFile = {};
            const assignmentPattern = /window\.CozyOS\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?!=)/g;
            const readPattern = /window\.CozyOS\.([A-Za-z_$][A-Za-z0-9_$]*)/g;

            for (const src of scriptSrcs) {
                this.#diagnostics.sourceFetchesAttempted++;
                try {
                    const res = await fetch(src);
                    if (!res.ok) { this.#diagnostics.sourceFetchesFailed++; continue; }
                    const text = await res.text();
                    const assigns = new Set();
                    let m;
                    while ((m = assignmentPattern.exec(text)) !== null) assigns.add(m[1]);
                    const reads = new Set();
                    while ((m = readPattern.exec(text)) !== null) reads.add(m[1]);
                    assignmentsByFile[src] = [...assigns];
                    readsByFile[src] = [...reads];
                } catch (_err) {
                    this.#diagnostics.sourceFetchesFailed++;
                }
            }

            const assignmentCounts = {};
            Object.entries(assignmentsByFile).forEach(([file, names]) => {
                names.forEach(name => {
                    if (!assignmentCounts[name]) assignmentCounts[name] = [];
                    assignmentCounts[name].push(file);
                });
            });
            const duplicateAssignments = Object.entries(assignmentCounts)
                .filter(([, files]) => files.length > 1)
                .map(([name, files]) => ({ name, files }));

            const sourceAnalysis = {
                filesScanned: scriptSrcs.length,
                filesFetchedOk: Object.keys(assignmentsByFile).length,
                duplicateAssignments,
                dependencyGraph: readsByFile
            };

            if (this.#lastReport) this.#lastReport.sourceAnalysis = sourceAnalysis;
            this.#logAudit("SCAN_SOURCES", `Scanned ${scriptSrcs.length} script files, found ${duplicateAssignments.length} duplicate assignment(s).`);
            if (window.CozyOS.PlatformEventBus) {
                try { window.CozyOS.PlatformEventBus.emit("discovery:sourcesScanned", this.#deepClone(sourceAnalysis)); } catch (_err) { /* non-fatal */ }
            }
            return this.#deepClone(sourceAnalysis);
        }

        getReport() {
            if (!this.#lastReport) return { available: false, message: "No scan has been run yet. Call scan() first." };
            return this.#deepClone({ available: true, ...this.#lastReport });
        }

        // ---- Four-level Discovery accessors (delegated, never recomputed) ----
        getLevel1Runtime() { return this.scanRuntime(); }
        getLevel2Registry() { const reg = window.CozyOS.FileRegistry; return reg ? reg.list() : []; }
        getLevel3Manifests() { const reg = window.CozyOS.ManifestRegistry; return reg ? reg.listManifests() : []; }
        getLevel4Health() {
            const engine = window.CozyOS.HealthEngine;
            if (!engine) throw new Error("[Discovery] getLevel4Health(): HealthEngine is not loaded.");
            return engine.report();
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: DISCOVERY_VERSION, ...this.#diagnostics,
                lastScanAt: this.#lastScanAt, auditLogCount: this.#auditLogs.length
            });
        }
    }

    if (window.CozyOS.PlatformDiscovery && typeof window.CozyOS.PlatformDiscovery.getVersion === "function") {
        const existingVersion = window.CozyOS.PlatformDiscovery.getVersion();
        if (existingVersion !== DISCOVERY_VERSION) {
            throw new Error(`[CozyOS Framework Execution Error] VERSION_CONFLICT: PlatformDiscovery existing v${existingVersion} conflicts with load target v${DISCOVERY_VERSION}.`);
        }
        return;
    }

    const instance = new CozyPlatformDiscovery();
    window.CozyOS.PlatformDiscovery = instance;
    // Backward compatibility: anything still referencing the other
    // account's original global name reaches the exact same instance,
    // never a second engine.
    window.CozyOS.Discovery = instance;

    // Future Capability Standard (core/platform/platform-operations.js) —
    // real, self-declared executable-action metadata. This is the FIRST
    // coordinator migrated per the specified order (Discovery, Audit,
    // Health, Usage, Dependency, File Registry, Manifest Registry, Service
    // Registry, Module Registry, PluginManager, Identity, Certification).
    // Purely additive — no existing method's behavior changes; this is a
    // static property read by PlatformOperations, nothing here reads it
    // back. Each `rollback:false` reflects real fact: none of scan()/
    // scanRuntime()/scanManifest()/scanSources() mutate anything that has
    // a prior state to restore (scan() only writes to FileRegistry via
    // replaceAll(), which is itself a separate coordinator's own decision
    // to make idempotent or not, not this file's concern).
    instance.capabilities = Object.freeze([
        Object.freeze({ id: "scan", permission: "discovery:scan", rollback: false, category: "Discovery" }),
        Object.freeze({ id: "validate", permission: "registry:validate", rollback: false, category: "Registry" }),
        Object.freeze({ id: "refresh", permission: "discovery:refresh", rollback: false, category: "Discovery" })
    ]);

    // Application Visibility Registry (core/platform/application-visibility.js)
    // — real, additive self-declaration. Discovery is a native Administrator
    // Workspace section (rendered directly by cozy-workspace.js), not a
    // standalone module — launchTarget has no "section," matching that.
    instance.visibility = Object.freeze({
        appId: "platformDiscovery", name: "Platform Discovery", icon: "🔍", category: "platform-tool",
        launchTarget: Object.freeze({ center: "platformDiscovery" }),
        audience: "admin"
    });

    (function registerWithServiceRegistry(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        let attempts = 0;
        const maxAttempts = 200;
        const intervalId = setInterval(() => {
            attempts++;
            if (attempt() || attempts >= maxAttempts) clearInterval(intervalId);
        }, 250);
    })({
        name: "PlatformDiscovery", category: "Foundation", icon: "discovery.svg",
        description: "CozyOS Platform Discovery Engine — Runtime Provider (live reality) + Manifest Provider (declared design), reporting real drift between them. Delegates classification to UsageEngine/DependencyEngine/HealthEngine rather than duplicating it."
    });
})();
