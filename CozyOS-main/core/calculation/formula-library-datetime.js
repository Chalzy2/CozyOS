/**
 * CozyOS Living Calculation Engine — DateTime Formula Pack
 * core/calculation/formula-library-datetime.js
 *
 * OWNERSHIP: composes the existing, real FormulaRegistry.register()
 * (same exact schema as formula-library.js/formula-library-
 * construction.js, confirmed by reading them before writing this file)
 * — never a second calculation engine or registry.
 *
 * SCOPE (InterestOS Phase 2, Dependency #3): the ONE real, justified
 * need identified — Goals already has a real targetDate field, and
 * directives already have a real reminderAt timestamp; "days until a
 * target date" is directly useful for both. Every other date/time
 * variant (adding a duration to a date, days between two arbitrary
 * dates unrelated to a goal/reminder) is not exercised by any real,
 * existing InterestOS feature — deliberately not built here, to avoid
 * inventing capability beyond justified need. DaysBetween is the one
 * primitive that already covers "days until X": callers pass
 * (nowEpochMs, targetEpochMs).
 *
 * DETERMINISM: CalculationEngine.calculate()'s own input-type
 * validation only supports "number"/"numberArray" (no date/string
 * type — confirmed by reading calculation-engine.js), so both
 * timestamps are real epoch-millisecond numbers, explicitly supplied
 * by the caller — this formula never calls Date.now() internally,
 * so the same inputs always produce the same output.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.FormulaLibrary] FormulaRegistry is not loaded — DateTime pack not registered."); return; }

        registry.register("DateTime.DaysBetween", {
            fn: ({ startEpochMs, endEpochMs }) => {
                if (!Number.isFinite(startEpochMs) || !Number.isFinite(endEpochMs)) {
                    throw new Error("DateTime.DaysBetween: startEpochMs and endEpochMs must be real, finite epoch-millisecond timestamps.");
                }
                return Math.round((endEpochMs - startEpochMs) / 86400000);
            },
            requiredInputs: ["startEpochMs", "endEpochMs"], version: "1.0.0", pack: "DateTime",
            description: "Whole days between two real epoch-millisecond timestamps (endEpochMs - startEpochMs, rounded). Pass (nowEpochMs, targetEpochMs) to get \"days until a target date\" — negative if the target is already in the past.",
            sampleInputs: { startEpochMs: 1704067200000, endEpochMs: 1704240000000 } // 2 real, fixed timestamps 2 days apart — deterministic sample output
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
})();
