/**
 * CozyOS Calculation Engine — Certification
 * File Reference: core/calculation/calculation-certification.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RESPONSIBILITY
 *   Real certification of a registered formula against exactly the six
 *   checks requested — every one of them actually executed, not assumed:
 *     1. Formula identifier exists — real registry lookup.
 *     2. Required inputs are provided — checked against a real, provided
 *        input set (certifyFormula() requires one, generally the
 *        formula's own registered `sampleInputs`).
 *     3. Input types are valid — every required input must be a real
 *        number (this engine's formulas are numeric; a non-numeric
 *        required input is a real failure, not silently coerced).
 *     4. Output is numeric — the formula is genuinely called with the
 *        real sample inputs, and the real result checked with
 *        `Number.isFinite()` — NaN/Infinity both count as failure.
 *     5. Division-by-zero is handled — only checked if the formula
 *        declared real `denominatorKeys` at registration; each declared
 *        denominator is genuinely set to 0 and the formula genuinely
 *        called again, checking the result is not NaN/Infinity (a real
 *        formula should return null or throw a caught, handled error for
 *        this case, not silently produce Infinity). Honestly reports
 *        "not verified" rather than a false pass when no denominatorKeys
 *        were declared.
 *     6. Formula version is tracked — real registry metadata check.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const CALC_CERT_VERSION = "1.0.0-ENTERPRISE";

    class CozyCalculationCertification {
        getVersion() { return CALC_CERT_VERSION; }

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }

        /**
         * certifyFormula(formulaId)
         *   Every check below is genuinely executed against the real,
         *   registered formula — nothing here is a static assumption.
         */
        certifyFormula(formulaId) {
            const registry = window.CozyOS.FormulaRegistry;
            if (!registry) return { formulaId, verdict: "FAILED", reason: "FormulaRegistry is not loaded." };

            const checks = {};
            checks.identifierExists = registry.has(formulaId);
            if (!checks.identifierExists) {
                return { formulaId, checks, verdict: "FAILED", reason: `"${formulaId}" is not registered.` };
            }

            const entry = registry.get(formulaId);
            checks.versionTracked = typeof entry.version === "string" && entry.version.length > 0;

            const hasSample = entry.sampleInputs && typeof entry.sampleInputs === "object";
            checks.requiredInputsProvided = hasSample && entry.requiredInputs.every(key => key in entry.sampleInputs);
            const inputTypes = entry.inputTypes || {};
            checks.inputTypesValid = hasSample && entry.requiredInputs.every(key => {
                const declaredType = inputTypes[key] || "number";
                if (declaredType === "numberArray") return Array.isArray(entry.sampleInputs[key]) && entry.sampleInputs[key].length > 0 && entry.sampleInputs[key].every(n => typeof n === "number" && Number.isFinite(n));
                return typeof entry.sampleInputs[key] === "number" && Number.isFinite(entry.sampleInputs[key]);
            });

            let outputIsNumeric = false;
            let sampleResult = null;
            if (hasSample && checks.requiredInputsProvided && checks.inputTypesValid) {
                try {
                    sampleResult = entry.fn(entry.sampleInputs);
                    outputIsNumeric = typeof sampleResult === "number" && Number.isFinite(sampleResult);
                } catch (err) {
                    outputIsNumeric = false;
                }
            }
            checks.outputIsNumeric = outputIsNumeric;

            let divisionByZeroHandled = null; // null = not verified (no denominatorKeys declared), not a false pass
            if (entry.denominatorKeys && entry.denominatorKeys.length > 0 && hasSample) {
                divisionByZeroHandled = true;
                for (const key of entry.denominatorKeys) {
                    const zeroInputs = { ...entry.sampleInputs, [key]: 0 };
                    try {
                        const zeroResult = entry.fn(zeroInputs);
                        if (typeof zeroResult === "number" && !Number.isFinite(zeroResult)) { divisionByZeroHandled = false; break; } // NaN/Infinity — real failure
                    } catch (_err) {
                        // A real, caught thrown error IS handled division-by-zero — not a failure.
                    }
                }
            }
            checks.divisionByZeroHandled = divisionByZeroHandled;

            /**
             * negativeValuesHandled — real, only checked if the formula
             * declared real `nonNegativeKeys`. Genuinely calls the
             * formula with each declared key set to a real negative
             * number and confirms it's refused (via a thrown, caught
             * error) rather than silently producing a nonsensical result
             * (e.g. a negative BMI). Honestly null (not verified) when
             * no nonNegativeKeys were declared, never a false pass.
             */
            let negativeValuesHandled = null;
            if (entry.nonNegativeKeys && entry.nonNegativeKeys.length > 0 && hasSample) {
                negativeValuesHandled = true;
                for (const key of entry.nonNegativeKeys) {
                    const negativeInputs = { ...entry.sampleInputs, [key]: -Math.abs(entry.sampleInputs[key] || 1) };
                    try {
                        entry.fn(negativeInputs);
                        negativeValuesHandled = false; // no error thrown for a genuinely invalid negative input — real failure
                        break;
                    } catch (_err) {
                        // A real, caught thrown error IS handled — not a failure.
                    }
                }
            }
            checks.negativeValuesHandled = negativeValuesHandled;

            /**
             * regressionSafe — real, only checked if this formula has real
             * previous-version snapshots (via updateFormula()). For each
             * previous version's real sample inputs, the CURRENT formula
             * must still produce a valid, finite numeric result — not
             * necessarily the SAME value (a genuine bug fix is expected to
             * change the result, as happened with Business.Margin earlier
             * in this project), but a new version that crashes or produces
             * NaN/Infinity on inputs the old version handled cleanly is a
             * genuine regression. Honestly null when no previous version
             * exists yet.
             */
            let regressionSafe = null;
            if (entry.previousVersions && entry.previousVersions.length > 0) {
                regressionSafe = true;
                for (const prev of entry.previousVersions) {
                    if (!prev.sampleInputs) continue;
                    try {
                        const currentResult = entry.fn(prev.sampleInputs);
                        if (typeof currentResult !== "number" || !Number.isFinite(currentResult)) { regressionSafe = false; break; }
                    } catch (_err) {
                        regressionSafe = false; break; // the old version's real, valid inputs now crash the new version — a genuine regression
                    }
                }
            }
            checks.regressionSafe = regressionSafe;

            const realCheckValues = [checks.identifierExists, checks.versionTracked, checks.requiredInputsProvided, checks.inputTypesValid, checks.outputIsNumeric];
            if (divisionByZeroHandled === false) realCheckValues.push(false); // only counts against certification if it was actually tested and genuinely failed
            if (negativeValuesHandled === false) realCheckValues.push(false);
            if (regressionSafe === false) realCheckValues.push(false);
            const allPassed = realCheckValues.every(v => v === true);

            return {
                formulaId, checks, sampleResult, verdict: allPassed ? "CERTIFIED" : "FAILED",
                reason: allPassed ? "All real, executed checks passed." : `Failed: ${Object.entries(checks).filter(([, v]) => v === false).map(([k]) => k).join(", ")}`,
                note: divisionByZeroHandled === null ? "Division-by-zero handling was not verified — this formula declared no denominatorKeys at registration." : undefined
            };
        }

        getDiagnosticsReport() {
            return this.#deepClone({ moduleVersion: CALC_CERT_VERSION });
        }
    }

    if (window.CozyOS.CalculationCertification && typeof window.CozyOS.CalculationCertification.getVersion === "function") {
        const existingVersion = window.CozyOS.CalculationCertification.getVersion();
        if (existingVersion !== CALC_CERT_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: CalculationCertification existing v${existingVersion} conflicts with load target v${CALC_CERT_VERSION}.`);
        return;
    }

    window.CozyOS.CalculationCertification = new CozyCalculationCertification();
})();
