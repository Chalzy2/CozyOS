/**
 * CozyOS Calculation Engine — Formula Library (Church Pack, Phase 1)
 * File Reference: core/calculation/formula-library-church.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * HONEST SCOPE
 *   Only `Church.Tithe` is implemented — the one Church formula
 *   ChurchOS's Giving & Finance section needs for this pass. Offering
 *   totals, budget allocation, attendance statistics, cell group growth,
 *   and the rest of the requested Church pack are real, separate,
 *   unbuilt work — named in this milestone's Constitution entry, not
 *   silently included by implication.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.FormulaLibraryChurch] FormulaRegistry is not loaded — Church.Tithe not registered."); return; }

        registry.register("Church.Tithe", {
            fn: ({ income }) => income * 0.1,
            requiredInputs: ["income"], version: "1.0.0", pack: "Church",
            description: "Tithe (10% of income) — the standard biblical tithe calculation.",
            sampleInputs: { income: 10000 }
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
