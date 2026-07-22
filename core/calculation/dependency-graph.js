/**
 * CozyOS Formula Dependency Engine — Graph
 * File Reference: core/calculation/dependency-graph.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real graph construction and traversal, reading exclusively from the
 *   real, explicit `dependsOn` metadata every formula registration
 *   already carries — this file never parses JavaScript source and never
 *   infers a relationship that wasn't explicitly declared.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DEP_GRAPH_VERSION = "1.0.0-ENTERPRISE";

    class CozyDependencyGraph {
        getVersion() { return DEP_GRAPH_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        #buildAdjacency() {
            const registry = window.CozyOS.FormulaRegistry;
            const forward = new Map();
            const reverse = new Map();
            if (!registry) return { forward, reverse };
            for (const entry of registry.list()) {
                forward.set(entry.formulaId, entry.dependsOn || []);
                if (!reverse.has(entry.formulaId)) reverse.set(entry.formulaId, []);
                for (const dep of entry.dependsOn || []) {
                    if (!reverse.has(dep)) reverse.set(dep, []);
                    reverse.get(dep).push(entry.formulaId);
                }
            }
            return { forward, reverse };
        }

        getChildren(formulaId) {
            const { forward } = this.#buildAdjacency();
            return this.#deepClone(forward.get(formulaId) || []);
        }

        getParents(formulaId) {
            const { reverse } = this.#buildAdjacency();
            return this.#deepClone(reverse.get(formulaId) || []);
        }

        getDescendants(formulaId) {
            const { forward } = this.#buildAdjacency();
            const visited = new Set();
            const walk = (id) => {
                for (const child of forward.get(id) || []) {
                    if (!visited.has(child)) { visited.add(child); walk(child); }
                }
            };
            walk(formulaId);
            return this.#deepClone([...visited]);
        }

        getAncestors(formulaId) {
            const { reverse } = this.#buildAdjacency();
            const visited = new Set();
            const walk = (id) => {
                for (const parent of reverse.get(id) || []) {
                    if (!visited.has(parent)) { visited.add(parent); walk(parent); }
                }
            };
            walk(formulaId);
            return this.#deepClone([...visited]);
        }

        getDepth(formulaId) {
            const { forward } = this.#buildAdjacency();
            const walk = (id, seen) => {
                const children = forward.get(id) || [];
                if (children.length === 0) return 0;
                return 1 + Math.max(...children.filter(c => !seen.has(c)).map(c => walk(c, new Set([...seen, c]))), 0);
            };
            return walk(formulaId, new Set([formulaId]));
        }

        getTree(formulaId) {
            return {
                formulaId,
                parents: this.getParents(formulaId),
                children: this.getChildren(formulaId),
                ancestors: this.getAncestors(formulaId),
                descendants: this.getDescendants(formulaId),
                depth: this.getDepth(formulaId)
            };
        }

        getDiagnosticsReport() {
            return { moduleVersion: DEP_GRAPH_VERSION };
        }
    }

    if (window.CozyOS.DependencyGraph && typeof window.CozyOS.DependencyGraph.getVersion === "function") {
        const existingVersion = window.CozyOS.DependencyGraph.getVersion();
        if (existingVersion !== DEP_GRAPH_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: DependencyGraph existing v${existingVersion} conflicts with load target v${DEP_GRAPH_VERSION}.`);
        return;
    }

    window.CozyOS.DependencyGraph = new CozyDependencyGraph();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "DependencyGraph", category: "Platform", icon: "share-2.svg",
                description: "Real graph construction/traversal over the explicit dependsOn metadata in FormulaRegistry — parents, children, ancestors, descendants, depth. Rebuilt fresh from live registry state on every call, never cached or stale."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
