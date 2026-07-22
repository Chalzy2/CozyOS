/**
 * CozyOS Formula Dependency Engine — Core
 * File Reference: core/calculation/dependency-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single, real entry point for understanding how formulas relate
 *   to each other. This engine does not perform calculations —
 *   `CalculationEngine` already owns that — it owns dependency
 *   discovery, circular-dependency detection, regression-impact
 *   analysis, and unused-formula reporting, all read from the real,
 *   explicit `dependsOn` metadata via `DependencyGraph`.
 *
 * CIRCULAR-DEPENDENCY DETECTION REUSES THE PROVEN ALGORITHM
 *   The same DFS cycle-detection shape already built and verified twice
 *   in this project (`DependencyEngine.detectCircular()` for file
 *   dependencies, `OrganizationHierarchy.detectCircularReporting()` for
 *   reporting lines) is applied here a third time, to the formula-call
 *   graph — not a fourth, separately-derived implementation.
 *
 * NAMING NOTE
 *   Registered as `window.CozyOS.DependencyEngineFormula`, not
 *   `DependencyEngine`, to avoid a real naming collision with the
 *   existing, unrelated file-dependency `DependencyEngine`
 *   (`core/platform/dependency-engine.js`) already in this project —
 *   same responsibility shape, a different real domain.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DEP_ENGINE_VERSION = "1.0.0-ENTERPRISE";

    class CozyFormulaDependencyEngine {
        getVersion() { return DEP_ENGINE_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        detectCircularDependencies() {
            const registry = window.CozyOS.FormulaRegistry;
            if (!registry) return { available: false, reason: "FormulaRegistry is not loaded." };
            const graph = new Map();
            for (const entry of registry.list()) graph.set(entry.formulaId, entry.dependsOn || []);

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
            return { available: true, cycles, bestEffort: true };
        }

        validateDependencies(formulaId) {
            const registry = window.CozyOS.FormulaRegistry;
            if (!registry) return { available: false, reason: "FormulaRegistry is not loaded." };
            if (!registry.has(formulaId)) return { available: false, reason: `"${formulaId}" is not registered.` };
            const entry = registry.get(formulaId);
            const dependsOn = entry.dependsOn || [];
            const issues = [];

            if (dependsOn.includes(formulaId)) issues.push({ type: "self-reference", detail: `"${formulaId}" declares a dependency on itself.` });

            const seen = new Set();
            for (const dep of dependsOn) {
                if (seen.has(dep)) issues.push({ type: "duplicate-dependency", detail: `"${dep}" is declared more than once.` });
                seen.add(dep);
                if (!registry.has(dep)) { issues.push({ type: "missing-reference", detail: `"${dep}" is not a real, registered formula.` }); continue; }
                const depEntry = registry.get(dep);
                if (depEntry.deprecated && !depEntry.replacedBy) issues.push({ type: "deprecated-reference", detail: `"${dep}" is deprecated with no real replacement declared.` });
            }
            return { available: true, valid: issues.length === 0, issues };
        }

        getRegressionImpact(formulaId) {
            const graph = window.CozyOS.DependencyGraph;
            const registry = window.CozyOS.FormulaRegistry;
            if (!graph || !registry) return { available: false, reason: "DependencyGraph and FormulaRegistry are both required." };
            const affectedFormulas = graph.getAncestors(formulaId);
            const affectedPacks = new Set();
            for (const id of affectedFormulas) {
                const entry = registry.get(id);
                if (entry) affectedPacks.add(entry.pack);
            }
            return { available: true, formulaId, affectedFormulas, affectedPacks: [...affectedPacks] };
        }

        listUnusedFormulas() {
            const registry = window.CozyOS.FormulaRegistry;
            const graph = window.CozyOS.DependencyGraph;
            if (!registry || !graph) return { available: false, reason: "FormulaRegistry and DependencyGraph are both required." };
            const unused = registry.list().filter(entry => graph.getParents(entry.formulaId).length === 0).map(e => e.formulaId);
            return { available: true, unusedByOtherFormulas: unused, note: "This only reflects formula-to-formula usage — it cannot see whether an application calls a formula directly." };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: DEP_ENGINE_VERSION });
        }
    }

    if (window.CozyOS.DependencyEngineFormula && typeof window.CozyOS.DependencyEngineFormula.getVersion === "function") {
        const existingVersion = window.CozyOS.DependencyEngineFormula.getVersion();
        if (existingVersion !== DEP_ENGINE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: DependencyEngineFormula existing v${existingVersion} conflicts with load target v${DEP_ENGINE_VERSION}.`);
        return;
    }

    window.CozyOS.DependencyEngineFormula = new CozyFormulaDependencyEngine();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "DependencyEngineFormula", category: "Platform", icon: "share-2.svg",
                description: "Real formula dependency understanding — circular detection (reusing the same proven DFS algorithm as the file-dependency and organization-hierarchy engines), regression impact analysis, unused-formula detection. Reads only explicit dependsOn metadata, never parses source."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
