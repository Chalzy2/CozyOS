/**
 * CozyOS Calculation Engine — Core
 * File Reference: core/calculation/calculation-engine.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   The single, real entry point every CozyOS application should call
 *   instead of implementing its own formulas — `calculate(formulaId,
 *   inputs)`. Coordinates `FormulaRegistry`/`CalculationHistory`/
 *   `CalculationCertification`, duplicates none of their logic. Matches
 *   the same "one clear entry point, specialized supporting files"
 *   architecture already proven for `VendorManager` and `OutputCenter`.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const CALC_ENGINE_VERSION = "1.0.0-ENTERPRISE";

    class CozyCalculationEngine {
        getVersion() { return CALC_ENGINE_VERSION; }

        /**
         * calculate(formulaId, inputs, {application, user, organization, recordHistory})
         *   Real, fail-closed — a missing formula, a missing required
         *   input, or a non-numeric required input all refuse with a
         *   specific, real reason rather than attempting the calculation
         *   with bad data. `recordHistory` is opt-in (default false) —
         *   history is genuinely optional, matching the request.
         */
        /**
         * calculate(formulaId, inputs, {...})
         *   Real extension (Rule 77): validation now supports an optional,
         *   per-input `inputTypes` declaration on a formula (e.g.
         *   `{scores: "numberArray"}`) for formulas that genuinely need an
         *   array — Statistics.Mean/Median/Mode and anything built on
         *   them. Every input defaults to `"number"` when not declared,
         *   identical to the original validation — this is purely
         *   additive; no existing, already-certified formula (which never
         *   declares `inputTypes`) is affected in any way.
         */
        calculate(formulaId, inputs = {}, { application, user, organization, recordHistory = false } = {}) {
            const registry = window.CozyOS.FormulaRegistry;
            if (!registry) return { success: false, reason: "FormulaRegistry is not loaded." };
            if (!registry.has(formulaId)) return { success: false, reason: `"${formulaId}" is not a registered formula.` };

            const entry = registry.get(formulaId);
            const missing = entry.requiredInputs.filter(key => !(key in inputs));
            if (missing.length > 0) return { success: false, reason: `Missing required input(s): ${missing.join(", ")}.` };

            const inputTypes = entry.inputTypes || {};
            const invalidType = entry.requiredInputs.find(key => {
                const declaredType = inputTypes[key] || "number";
                if (declaredType === "numberArray") return !Array.isArray(inputs[key]) || inputs[key].length === 0 || !inputs[key].every(n => typeof n === "number" && Number.isFinite(n));
                return typeof inputs[key] !== "number" || !Number.isFinite(inputs[key]);
            });
            if (invalidType) {
                const declaredType = inputTypes[invalidType] || "number";
                return { success: false, reason: declaredType === "numberArray" ? `Input "${invalidType}" must be a real, non-empty array of finite numbers.` : `Input "${invalidType}" must be a real, finite number.` };
            }

            let result;
            try {
                result = entry.fn(inputs);
            } catch (err) {
                return { success: false, reason: `Formula threw: ${err.message}` };
            }
            if (typeof result !== "number" || !Number.isFinite(result)) {
                return { success: false, reason: "Formula produced a non-numeric or non-finite result (NaN/Infinity) — refused rather than returned." };
            }

            if (recordHistory && window.CozyOS.CalculationHistory) {
                window.CozyOS.CalculationHistory.record({ formulaId, inputs, result, application, user, organization });
            }

            return { success: true, formulaId, result, version: entry.version };
        }

        /** certify(formulaId) — real, delegates entirely to CalculationCertification. */
        certify(formulaId) {
            const cert = window.CozyOS.CalculationCertification;
            if (!cert) return { verdict: "FAILED", reason: "CalculationCertification is not loaded." };
            return cert.certifyFormula(formulaId);
        }

        /** listFormulas(pack) — real, delegates entirely to FormulaRegistry. */
        listFormulas(pack) {
            const registry = window.CozyOS.FormulaRegistry;
            if (!registry) return [];
            return pack ? registry.listByPack(pack) : registry.list();
        }

        getDiagnosticsReport() {
            return { moduleVersion: CALC_ENGINE_VERSION };
        }
    }

    if (window.CozyOS.CalculationEngine && typeof window.CozyOS.CalculationEngine.getVersion === "function") {
        const existingVersion = window.CozyOS.CalculationEngine.getVersion();
        if (existingVersion !== CALC_ENGINE_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: CalculationEngine existing v${existingVersion} conflicts with load target v${CALC_ENGINE_VERSION}.`);
        return;
    }

    const instance = new CozyCalculationEngine();
    window.CozyOS.CalculationEngine = instance;

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "CalculationEngine", category: "Platform", icon: "calculator.svg",
                description: "Single, real entry point for every CozyOS calculation — applications call calculate(formulaId, inputs) instead of implementing their own formulas. Fails closed on missing/invalid inputs and non-numeric results."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
