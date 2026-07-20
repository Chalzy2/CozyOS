/**
 * CozyOS Dependency Engine
 * File Reference: core/platform/dependency-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.1.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Builds a dependency graph from window.CozyOS.FileRegistry. For a file
 *   with a Level 3 manifest (record.declaredDependencies !== null), those
 *   self-declared ids are authoritative and used directly — no guessing
 *   needed. For a file with no manifest, this falls back to the best-effort
 *   static graph built from Discovery's regex-extracted `imports`. Single
 *   Responsibility (Rule 1): Discovery finds files, File Registry stores
 *   them, ManifestRegistry stores self-declarations, this engine only
 *   interprets what's already there.
 *
 * HONEST LIMITATION (fallback path only)
 *   Import edges come from discovery-scan.js's regex extraction, not a real
 *   module resolver — dynamic imports, non-relative bare specifiers, and
 *   unusual syntax are not captured. getDependents()/getDependencies() mark
 *   `bestEffort: true` on the fallback path so callers know the difference
 *   from a manifest-backed (`bestEffort: false`) result.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const DEPENDENCY_ENGINE_VERSION = "1.1.0-ENTERPRISE";

    class CozyDependencyEngine {
        getVersion() { return DEPENDENCY_ENGINE_VERSION; }

        #registry() {
            const reg = window.CozyOS.FileRegistry;
            if (!reg) throw new Error("[DependencyEngine] FileRegistry is not loaded — nothing to build a graph from.");
            return reg;
        }

        #resolveRelative(fromPath, importSpecifier) {
            if (!importSpecifier.startsWith(".")) return null; // can't resolve bare/external specifiers honestly
            const fromDir = fromPath.split("/").slice(0, -1);
            for (const part of importSpecifier.split("/")) {
                if (part === ".") continue;
                else if (part === "..") fromDir.pop();
                else fromDir.push(part);
            }
            return fromDir.join("/").replace(/\.js$/, "");
        }

        /** getDependencies(path) — manifest-declared (authoritative) if the file has one, else best-effort regex resolution. */
        getDependencies(pathKey) {
            const reg = this.#registry();
            const record = reg.get(pathKey);
            if (!record) return { path: pathKey, dependencies: [], bestEffort: true };

            if (record.declaredDependencies !== null) {
                // Level 3: manifest ids resolved back to file paths via ManifestRegistry
                // + FileRegistry's own manifestId field — authoritative, not a guess.
                const manifestReg = window.CozyOS.ManifestRegistry;
                const byManifestId = new Map(reg.list().filter(r => r.manifestId).map(r => [r.manifestId, r.path]));
                const dependencies = record.declaredDependencies.map(id => byManifestId.get(id)).filter(Boolean);
                return { path: pathKey, dependencies, bestEffort: false, source: "manifest" };
            }

            const known = new Set(reg.list().map(r => r.path));
            const deps = (record.imports || [])
                .map(imp => this.#resolveRelative(pathKey, imp))
                .filter(Boolean)
                .map(resolved => (known.has(resolved) ? resolved : (known.has(resolved + ".js") ? resolved + ".js" : null)))
                .filter(Boolean);
            return { path: pathKey, dependencies: Array.from(new Set(deps)), bestEffort: true, source: "regex-scan" };
        }

        /** getDependents(path) — files whose imports resolve TO this file ("Used By"). */
        getDependents(pathKey) {
            const reg = this.#registry();
            const dependents = [];
            for (const record of reg.list()) {
                const { dependencies } = this.getDependencies(record.path);
                if (dependencies.includes(pathKey)) dependents.push(record.path);
            }
            return { path: pathKey, dependents, bestEffort: true };
        }

        /** getChain(path) — one hop of dependents for a Dependency Viewer render (caller composes multi-hop chains). */
        getChain(pathKey, depth = 3) {
            const visited = new Set();
            const build = (p, remaining) => {
                if (remaining <= 0 || visited.has(p)) return { path: p, dependents: [] };
                visited.add(p);
                const { dependents } = this.getDependents(p);
                return { path: p, dependents: dependents.map(d => build(d, remaining - 1)) };
            };
            return { ...build(pathKey, depth), bestEffort: true };
        }

        /** detectCircular() — DFS cycle detection over the best-effort resolved graph. */
        detectCircular() {
            const reg = this.#registry();
            const graph = new Map();
            for (const record of reg.list()) graph.set(record.path, this.getDependencies(record.path).dependencies);

            const cycles = [];
            const visiting = new Set();
            const visited = new Set();
            const stack = [];

            const dfs = (node) => {
                if (visiting.has(node)) {
                    const cycleStart = stack.indexOf(node);
                    cycles.push(stack.slice(cycleStart).concat(node));
                    return;
                }
                if (visited.has(node)) return;
                visiting.add(node);
                stack.push(node);
                for (const dep of graph.get(node) || []) dfs(dep);
                stack.pop();
                visiting.delete(node);
                visited.add(node);
            };

            for (const node of graph.keys()) dfs(node);
            return { cycles, bestEffort: true };
        }

        /** detectMissingDependencies() — relative imports that don't resolve to any known file. */
        detectMissingDependencies() {
            const reg = this.#registry();
            const known = new Set(reg.list().map(r => r.path));
            const missing = [];
            for (const record of reg.list()) {
                for (const imp of record.imports || []) {
                    if (!imp.startsWith(".")) continue;
                    const resolved = this.#resolveRelative(record.path, imp);
                    if (resolved && !known.has(resolved) && !known.has(resolved + ".js")) {
                        missing.push({ path: record.path, dependency: imp });
                    }
                }
            }
            return { missing, bestEffort: true };
        }
    }

    if (window.CozyOS.DependencyEngine && typeof window.CozyOS.DependencyEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.DependencyEngine.getVersion();
        if (existingVersion !== DEPENDENCY_ENGINE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: DependencyEngine existing v${existingVersion} conflicts with load target v${DEPENDENCY_ENGINE_VERSION}.`);
        return;
    }

    window.CozyOS.DependencyEngine = new CozyDependencyEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "DependencyEngine", category: "Platform", icon: "share-2",
                description: "Best-effort static dependency graph built from File Registry's discovered imports — powers the Dependency Viewer and circular/missing-dependency diagnostics."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
