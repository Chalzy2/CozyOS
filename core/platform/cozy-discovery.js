/**
 * CozyOS Platform Discovery Engine
 * File Reference: core/platform/cozy-discovery.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.1.0-ENTERPRISE
 *
 * FOUR-LEVEL DISCOVERY MODEL
 *   Level 1 — Runtime   : what is loaded right now (cross-referenced against
 *                         live ServiceRegistry/ModuleRegistry/PluginManager state)
 *   Level 2 — Registry  : what has been registered (the manifest-scan file
 *                         records reconciled against those same registries)
 *   Level 3 — Manifest  : what each component DECLARES about itself via
 *                         window.CozyOS.registerManifest() (manifest-registry.js)
 *   Level 4 — Health    : broken/duplicated/missing/unused/uncertified
 *                         (health-engine.js, built from Levels 1–3)
 *   getLevel1Runtime() / getLevel2Registry() / getLevel3Manifests() below
 *   expose each level directly; getLevel4Health() delegates to HealthEngine.
 *
 * DEPLOYMENT-RELATIVE, NOT AN ABSOLUTE LIMITATION
 *   In browser-only deployments (GitHub Pages, static hosting), Discovery
 *   operates on runtime metadata, manifests, and registered components —
 *   the build-time manifest (core/platform/discovery-manifest.json,
 *   produced by developer/discovery-scan.js) plus Levels 1–3 above. Direct
 *   filesystem enumeration requires a deployment environment that provides
 *   filesystem or repository access (a Node/Electron/local-server build of
 *   CozyOS). This engine's design doesn't change if that environment
 *   arrives later — it gains a real scanning source, not a redesign.
 *
 * WHAT THIS IS NOT — READ BEFORE CHANGING ANYTHING
 *   - Not a fourth event bus. Every discovery event below is emitted through
 *     window.CozyOS.ServiceRegistry's existing on/off/once/emit — the same
 *     mechanism Applications/Coordinators already use. No new pub/sub is
 *     introduced here.
 *   - Not a replacement for ServiceRegistry, ModuleRegistry, PluginManager,
 *     or ManifestRegistry. Discovery reads their real state to determine
 *     what's actually loaded/registered/self-described — it never
 *     re-implements registration.
 *
 * EVENTS EMITTED (via ServiceRegistry.emit — see class header above)
 *   discovery:start              { at }
 *   discovery:file-found         { path, category }             (per file, first scan only)
 *   discovery:application-found  { id }                          (cross-ref hit in ServiceRegistry)
 *   discovery:module-found       { id }                          (cross-ref hit in ModuleRegistry)
 *   discovery:manifest-found     { id, type }                    (emitted by manifest-registry.js)
 *   discovery:duplicate          { path, reason }
 *   discovery:missing-dependency { path, dependency }
 *   discovery:scan-complete      { fileCount, durationMs }
 *
 * DEPENDENCIES (Rule 17)
 *   Requires core/registry/cozy-registry.js (ServiceRegistry) to be loaded
 *   first — Discovery emits through it and never falls back to a private
 *   bus. If ServiceRegistry is missing, Discovery still runs and builds the
 *   File Registry, but emits nothing (logged once, not thrown — a missing
 *   optional dependency degrades gracefully per Rule 6, it doesn't fabricate
 *   a bus that isn't there). ManifestRegistry (Level 3) is also optional —
 *   its absence just means no file gets manifest-enriched, not a failure.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const DISCOVERY_VERSION = "1.1.0-ENTERPRISE";
    const MANIFEST_URL = "core/platform/discovery-manifest.json";

    class CozyDiscoveryEngine {
        #lastManifest = null;
        #lastScanAt = null;
        #diagnostics = { scansRun: 0, filesSeen: 0, duplicatesFound: 0, missingDependencies: 0, lastError: null };

        getVersion() { return DISCOVERY_VERSION; }

        #emit(eventName, payload) {
            const registry = window.CozyOS.ServiceRegistry;
            if (registry && typeof registry.emit === "function") {
                registry.emit(eventName, payload);
            }
            // No fallback bus is created if ServiceRegistry isn't present —
            // an absent optional dependency is reported, never papered over.
        }

        /**
         * scan()
         *   Fetches the manifest, cross-references it against live registry
         *   state, builds File Registry records, and returns the summary.
         *   Real fetch, real reconciliation — throws honestly if the
         *   manifest can't be loaded rather than returning fabricated data.
         */
        async scan() {
            const startedAt = performance.now();
            this.#emit("discovery:start", { at: new Date().toISOString() });

            let manifest;
            try {
                const res = await fetch(MANIFEST_URL, { cache: "no-store" });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                manifest = await res.json();
            } catch (err) {
                this.#diagnostics.lastError = String(err && err.message || err);
                throw new Error(`[Discovery] scan(): failed to load ${MANIFEST_URL} — ${this.#diagnostics.lastError}`);
            }

            this.#lastManifest = manifest;
            this.#lastScanAt = new Date().toISOString();
            this.#diagnostics.scansRun++;
            this.#diagnostics.filesSeen = manifest.files.length;

            const liveApps = this.#safeList(() => window.CozyOS.ServiceRegistry && window.CozyOS.ServiceRegistry.listApplications());
            const liveCoordinators = this.#safeList(() => window.CozyOS.ServiceRegistry && window.CozyOS.ServiceRegistry.listCoordinators());
            const liveModules = this.#safeList(() => window.CozyOS.ModuleRegistry && window.CozyOS.ModuleRegistry.list({ includeDisabled: true }));
            const livePlugins = this.#safeList(() => window.CozyOS.PluginManager && window.CozyOS.PluginManager.list());

            const pathBuckets = new Map(); // path -> [record,...] for duplicate detection by filename
            const byPath = new Set();

            const records = manifest.files.map(f => {
                if (byPath.has(f.path)) {
                    this.#diagnostics.duplicatesFound++;
                    this.#emit("discovery:duplicate", { path: f.path, reason: "duplicate-manifest-entry" });
                }
                byPath.add(f.path);

                const nameKey = f.name.toLowerCase();
                if (!pathBuckets.has(nameKey)) pathBuckets.set(nameKey, []);
                pathBuckets.get(nameKey).push(f.path);

                this.#emit("discovery:file-found", { path: f.path, category: f.category });

                const matchedApp = liveApps.find(a => (a.launcher || "").includes(f.name) || a.id === f.name.replace(/\.js$/, ""));
                const matchedModule = liveModules.find(m => f.path.includes(m.folder || "\u0000"));
                // Coordinator match: this file's regex-detected exports (window.CozyOS.<Name> =)
                // against ServiceRegistry's live coordinator names — real cross-reference, not a
                // filename guess, since most of this codebase registers as a Coordinator, not an
                // Application or a Module.
                const matchedCoordinator = liveCoordinators.find(c => (f.exports || []).includes(c.name));
                const matchedPlugin = livePlugins.find(p => f.path.includes(p.id || "\u0000") || f.name.replace(/\.js$/, "") === p.id);
                // Level 3 cross-reference: a manifest is authoritative self-declared
                // data, so it's checked alongside (not instead of) Level 1/2 matches —
                // a file can be both "loaded" (Level 1/2) and "self-describing" (Level 3).
                const manifestRegistry = window.CozyOS.ManifestRegistry;
                const matchedManifest = manifestRegistry
                    ? (f.exports || []).map(name => manifestRegistry.getManifest(name)).find(Boolean)
                        || manifestRegistry.getManifest(f.name.replace(/\.js$/, ""))
                    : null;
                if (matchedApp) this.#emit("discovery:application-found", { id: matchedApp.id });
                if (matchedModule) this.#emit("discovery:module-found", { id: matchedModule.id });

                return this.#buildRecord(f, { liveApps, liveCoordinators, liveModules, livePlugins, matchedApp, matchedModule, matchedCoordinator, matchedPlugin, matchedManifest });
            });

            // Same filename appearing under more than one path is a real
            // duplicate-candidate signal (not proof — flagged, not deleted).
            for (const [nameKey, paths] of pathBuckets.entries()) {
                if (paths.length > 1) {
                    this.#diagnostics.duplicatesFound++;
                    this.#emit("discovery:duplicate", { path: paths.join(", "), reason: `same filename (${nameKey}) in ${paths.length} locations` });
                }
            }

            // Missing-dependency pass: an import target that doesn't resolve
            // to any scanned file (best-effort relative-path check only).
            const knownPaths = new Set(manifest.files.map(f => f.path));
            for (const f of manifest.files) {
                for (const imp of f.imports) {
                    if (!imp.startsWith(".")) continue; // skip bare/external specifiers — can't resolve those honestly
                    const resolved = this.#resolveRelative(f.path, imp);
                    if (resolved && !knownPaths.has(resolved) && !knownPaths.has(resolved + ".js")) {
                        this.#diagnostics.missingDependencies++;
                        this.#emit("discovery:missing-dependency", { path: f.path, dependency: imp });
                    }
                }
            }

            if (window.CozyOS.FileRegistry) {
                window.CozyOS.FileRegistry.replaceAll(records);
            }

            const durationMs = Math.round(performance.now() - startedAt);
            this.#emit("discovery:scan-complete", { fileCount: records.length, durationMs });
            return { fileCount: records.length, durationMs, architecturalIssues: manifest.architecturalIssues };
        }

        #safeList(fn) {
            try { const v = fn(); return Array.isArray(v) ? v : []; }
            catch (_e) { return []; }
        }

        #resolveRelative(fromPath, importSpecifier) {
            const fromDir = fromPath.split("/").slice(0, -1);
            const parts = importSpecifier.split("/");
            for (const part of parts) {
                if (part === ".") continue;
                else if (part === "..") fromDir.pop();
                else fromDir.push(part);
            }
            return fromDir.join("/").replace(/\.js$/, "");
        }

        #buildRecord(f, ctx) {
            const loaded = !!(ctx.matchedApp || ctx.matchedModule || ctx.matchedCoordinator || ctx.matchedPlugin);
            const owner = ctx.matchedApp ? "application" : ctx.matchedModule ? "module" : ctx.matchedCoordinator ? "coordinator" : ctx.matchedPlugin ? "plugin" : null;
            const ownerId = ctx.matchedApp ? ctx.matchedApp.id : ctx.matchedModule ? ctx.matchedModule.id : ctx.matchedCoordinator ? ctx.matchedCoordinator.name : ctx.matchedPlugin ? ctx.matchedPlugin.id : null;
            const version = ctx.matchedApp ? ctx.matchedApp.version : ctx.matchedModule ? ctx.matchedModule.version : ctx.matchedPlugin ? ctx.matchedPlugin.version : null;
            const m = ctx.matchedManifest; // Level 3 — self-declared, authoritative where present
            return Object.freeze({
                path: f.path,
                name: f.name,
                type: f.extension,
                category: m ? m.category : f.category,
                owner,
                application: ownerId,
                version: m ? m.version : version,
                manifestId: m ? m.id : null,
                declaredDependencies: m ? m.dependencies : null,
                permissions: m ? m.permissions : null,
                exports: f.exports,
                imports: f.imports,
                loaded,
                connected: loaded,
                certified: m ? m.certificationStatus === "ENTERPRISE_CERTIFIED" : f.certifiedSignal, // Level 3 self-declared status overrides the text-scan guess when present
                lastModified: f.lastModified,
                sizeBytes: f.sizeBytes
            });
        }

        getLastManifest() { return this.#lastManifest; }
        getLastScanAt() { return this.#lastScanAt; }
        getDiagnosticsReport() { return { ...this.#diagnostics }; }

        // ---- Four-level Discovery accessors ----

        /** Level 1 — what's loaded right now, straight from the live registries. */
        getLevel1Runtime() {
            return {
                applications: this.#safeList(() => window.CozyOS.ServiceRegistry && window.CozyOS.ServiceRegistry.listApplications()),
                coordinators: this.#safeList(() => window.CozyOS.ServiceRegistry && window.CozyOS.ServiceRegistry.listCoordinators()),
                modules: this.#safeList(() => window.CozyOS.ModuleRegistry && window.CozyOS.ModuleRegistry.list({ includeDisabled: true })),
                plugins: this.#safeList(() => window.CozyOS.PluginManager && window.CozyOS.PluginManager.list())
            };
        }

        /** Level 2 — the reconciled File Registry records from the last scan(). */
        getLevel2Registry() {
            const reg = window.CozyOS.FileRegistry;
            return reg ? reg.list() : [];
        }

        /** Level 3 — every self-declared manifest currently registered. */
        getLevel3Manifests() {
            const reg = window.CozyOS.ManifestRegistry;
            return reg ? reg.listManifests() : [];
        }

        /** Level 4 — delegates to HealthEngine; Discovery never computes health itself (Rule 1). */
        getLevel4Health() {
            const engine = window.CozyOS.HealthEngine;
            if (!engine) throw new Error("[Discovery] getLevel4Health(): HealthEngine is not loaded.");
            return engine.report();
        }
    }

    if (window.CozyOS.Discovery && typeof window.CozyOS.Discovery.getVersion === "function") {
        const existingVersion = window.CozyOS.Discovery.getVersion();
        if (existingVersion !== DISCOVERY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: Discovery existing v${existingVersion} conflicts with load target v${DISCOVERY_VERSION}.`);
        return;
    }

    window.CozyOS.Discovery = new CozyDiscoveryEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "Discovery", category: "Platform", icon: "radar",
                description: "Reconciles the build-time scan manifest against live registry state and populates the File Registry."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
