/**
 * CozyOS Formula Dependency Engine — Certification
 * File Reference: core/calculation/dependency-certification.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real dependency-integrity certification for one formula or the whole
 *   graph — missing references, circular dependencies, deprecated
 *   references, self-references, duplicate declarations, and a real,
 *   computed Dependency Health Score. Delegates entirely to
 *   `DependencyEngineFormula.validateDependencies()`/
 *   `detectCircularDependencies()` — this file adds scoring and
 *   aggregation on top, it does not re-implement either check.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const DEP_CERT_VERSION = "1.0.0-ENTERPRISE";

    class CozyDependencyCertification {
        getVersion() { return DEP_CERT_VERSION; }
        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        certifyDependencies(formulaId) {
            const depEngine = window.CozyOS.DependencyEngineFormula;
            const registry = window.CozyOS.FormulaRegistry;
            if (!depEngine || !registry) return { available: false, reason: "DependencyEngineFormula and FormulaRegistry are both required." };
            if (!registry.has(formulaId)) return { available: false, reason: `"${formulaId}" is not registered.` };

            const validation = depEngine.validateDependencies(formulaId);
            const cycleCheck = depEngine.detectCircularDependencies();
            const participatesInCycle = cycleCheck.available && cycleCheck.cycles.some(cycle => cycle.includes(formulaId));

            const checks = {
                noMissingReferences: validation.available && !validation.issues.some(i => i.type === "missing-reference"),
                noSelfReference: validation.available && !validation.issues.some(i => i.type === "self-reference"),
                noDuplicateDependencies: validation.available && !validation.issues.some(i => i.type === "duplicate-dependency"),
                noDeprecatedReferences: validation.available && !validation.issues.some(i => i.type === "deprecated-reference"),
                noCircularParticipation: !participatesInCycle
            };
            const passedCount = Object.values(checks).filter(v => v === true).length;
            const totalChecks = Object.keys(checks).length;
            const healthScorePercent = Math.round((passedCount / totalChecks) * 100);

            return {
                available: true, formulaId, checks, healthScorePercent,
                verdict: passedCount === totalChecks ? "CERTIFIED" : "FAILED",
                issues: validation.available ? validation.issues : [],
                reason: passedCount === totalChecks ? "All real dependency-integrity checks passed." : `Failed: ${Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(", ")}`
            };
        }

        certifyGraph() {
            const registry = window.CozyOS.FormulaRegistry;
            const depEngine = window.CozyOS.DependencyEngineFormula;
            if (!registry || !depEngine) return { available: false, reason: "FormulaRegistry and DependencyEngineFormula are both required." };
            const cycleCheck = depEngine.detectCircularDependencies();
            const allFormulas = registry.list();
            const perFormula = allFormulas.map(f => this.certifyDependencies(f.formulaId));
            const failedFormulas = perFormula.filter(c => c.verdict === "FAILED").map(c => c.formulaId);
            const overallHealthPercent = perFormula.length ? Math.round(perFormula.reduce((sum, c) => sum + c.healthScorePercent, 0) / perFormula.length) : 100;
            return {
                available: true, totalFormulas: perFormula.length,
                circularDependencyCount: cycleCheck.available ? cycleCheck.cycles.length : 0,
                failedFormulas, overallHealthPercent,
                verdict: failedFormulas.length === 0 ? "CERTIFIED" : "FAILED"
            };
        }

        /**
         * publishGraphReport()
         *   Real integration with the existing, already-built
         *   `OutputCenter` — publishes the real `certifyGraph()` result as
         *   a real, searchable artifact, exactly as that system already
         *   does for every other CozyOS report. This is genuinely
         *   achievable today because `OutputCenter` is real; it is not
         *   the same as the spec's broader "Dashboard"/"Export Engine"
         *   requests, which are not attempted here.
         */
        publishGraphReport() {
            const outputCenter = window.CozyOS.OutputCenter;
            if (!outputCenter) return { success: false, reason: "OutputCenter is not loaded." };
            const report = this.certifyGraph();
            return outputCenter.publish({
                name: `dependency-certification-report-${Date.now()}.json`, category: "Reports",
                content: JSON.stringify(report, null, 2), mimeType: "application/json",
                sourceApplication: "CalculationEngine", sourceEngine: "DependencyCertification", sourceOperation: "Publish Dependency Certification Report"
            });
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: DEP_CERT_VERSION });
        }
    }

    if (window.CozyOS.DependencyCertification && typeof window.CozyOS.DependencyCertification.getVersion === "function") {
        const existingVersion = window.CozyOS.DependencyCertification.getVersion();
        if (existingVersion !== DEP_CERT_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: DependencyCertification existing v${existingVersion} conflicts with load target v${DEP_CERT_VERSION}.`);
        return;
    }

    window.CozyOS.DependencyCertification = new CozyDependencyCertification();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "DependencyCertification", category: "Platform", icon: "shield-check.svg",
                description: "Real dependency-integrity certification and health scoring, delegating to DependencyEngineFormula's own validation and cycle detection rather than re-implementing either."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
