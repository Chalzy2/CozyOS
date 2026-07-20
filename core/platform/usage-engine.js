/**
 * CozyOS Usage Engine
 * File Reference: core/platform/usage-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Answers "is this file actually used?" — not just "does it exist?" —
 *   using File Registry's `loaded` flag (real: set by Discovery cross-
 *   referencing live ServiceRegistry/ModuleRegistry state) and Dependency
 *   Engine's best-effort `dependents` (static import graph). Single
 *   Responsibility: this file classifies, it does not scan or store.
 *
 * CLASSIFICATION (matches the requested Live Usage Engine examples exactly)
 *   used              — loaded === true AND has at least one dependent
 *   loaded-orphan      — loaded === true but zero static dependents found
 *                        (e.g. entry files, or dependents Discovery's regex
 *                        scan missed — see Dependency Engine's limitation)
 *   dead               — loaded === false AND zero static dependents
 *   duplicate-candidate — loaded === true AND shares its filename with
 *                         another file in the registry (signal, not proof)
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const USAGE_ENGINE_VERSION = "1.0.0-ENTERPRISE";

    class CozyUsageEngine {
        getVersion() { return USAGE_ENGINE_VERSION; }

        #deps() {
            const engine = window.CozyOS.DependencyEngine;
            if (!engine) throw new Error("[UsageEngine] DependencyEngine is not loaded.");
            return engine;
        }

        #registry() {
            const reg = window.CozyOS.FileRegistry;
            if (!reg) throw new Error("[UsageEngine] FileRegistry is not loaded.");
            return reg;
        }

        /** classify(path) — single-file classification, matches the spec's worked examples. */
        classify(pathKey) {
            const reg = this.#registry();
            const record = reg.get(pathKey);
            if (!record) return null;

            const { dependents } = this.#deps().getDependents(pathKey);
            const nameCollisions = reg.list().filter(r => r.name === record.name && r.path !== record.path);

            let status;
            if (record.loaded && nameCollisions.length > 0) status = "duplicate-candidate";
            else if (record.loaded && dependents.length > 0) status = "used";
            else if (record.loaded && dependents.length === 0) status = "loaded-orphan";
            else status = "dead";

            return {
                path: pathKey,
                loaded: record.loaded,
                referencedCount: dependents.length,
                usedBy: dependents,
                duplicateOf: nameCollisions.map(r => r.path),
                status,
                bestEffort: true
            };
        }

        /** report() — classifies every file in the registry; backs the Platform Registry page's summary counts. */
        report() {
            const reg = this.#registry();
            const results = reg.list().map(r => this.classify(r.path));
            const summary = { used: 0, "loaded-orphan": 0, dead: 0, "duplicate-candidate": 0 };
            for (const r of results) summary[r.status] = (summary[r.status] || 0) + 1;
            return { total: results.length, summary, files: results, bestEffort: true };
        }

        listDeadFiles() { return this.report().files.filter(f => f.status === "dead"); }
        listDuplicateCandidates() { return this.report().files.filter(f => f.status === "duplicate-candidate"); }
        listLoadedOrphans() { return this.report().files.filter(f => f.status === "loaded-orphan"); }
    }

    if (window.CozyOS.UsageEngine && typeof window.CozyOS.UsageEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.UsageEngine.getVersion();
        if (existingVersion !== USAGE_ENGINE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: UsageEngine existing v${existingVersion} conflicts with load target v${USAGE_ENGINE_VERSION}.`);
        return;
    }

    window.CozyOS.UsageEngine = new CozyUsageEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "UsageEngine", category: "Platform", icon: "activity",
                description: "Classifies each discovered file as used, loaded-orphan, dead, or duplicate-candidate from File Registry + Dependency Engine data."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
