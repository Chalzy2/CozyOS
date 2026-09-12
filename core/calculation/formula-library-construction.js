/**
 * CozyOS Living Calculation Engine — Construction Formula Pack
 * core/calculation/formula-library-construction.js
 *
 * OWNERSHIP: composes the existing, real FormulaRegistry.register()
 * (same exact schema as formula-library.js's Business pack, confirmed
 * by reading it before writing this file) - never a second
 * calculation engine or registry.
 *
 * HONEST SCOPE: uses standard, well-established construction-industry
 * ratios (the 1:2:4 cement:sand:ballast mix by volume is a widely
 * published general-purpose concrete mix ratio, not invented here).
 * These are estimation formulas for planning purposes - real
 * construction projects should always be verified by a qualified
 * engineer/quantity surveyor for the specific job, soil conditions,
 * and local building code, exactly matching this vision's own
 * "specialist review recommended" principle for engineering domains.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.FormulaLibrary] FormulaRegistry is not loaded — Construction pack not registered."); return; }

        // Standard 1:2:4 cement:sand:ballast mix by volume - a widely
        // published general concrete mix ratio (not project-specific
        // engineering advice).
        registry.register("Construction.CementBagsForConcrete", {
            fn: ({ concreteVolumeM3 }) => {
                if (concreteVolumeM3 < 0) throw new Error("Construction.CementBagsForConcrete: concreteVolumeM3 must be non-negative.");
                // Standard estimate: ~6.3 bags of 50kg cement per m³ of 1:2:4 mix concrete (published construction industry figure).
                return Math.ceil(concreteVolumeM3 * 6.3);
            },
            requiredInputs: ["concreteVolumeM3"], version: "1.0.0", pack: "Construction",
            description: "Estimated 50kg cement bags needed for a given volume of standard 1:2:4 mix concrete. A planning estimate, not a substitute for a qualified quantity surveyor's take-off.",
            sampleInputs: { concreteVolumeM3: 10 }, nonNegativeKeys: ["concreteVolumeM3"]
        });

        registry.register("Construction.SandVolumeForConcrete", {
            fn: ({ concreteVolumeM3 }) => {
                if (concreteVolumeM3 < 0) throw new Error("Construction.SandVolumeForConcrete: concreteVolumeM3 must be non-negative.");
                // 1:2:4 ratio - sand is 2 parts of 7 total parts.
                return concreteVolumeM3 * (2 / 7) * 1.5; // 1.5 factor accounts for standard bulking/wastage allowance
            },
            requiredInputs: ["concreteVolumeM3"], version: "1.0.0", pack: "Construction",
            description: "Estimated sand volume (m³) for standard 1:2:4 mix concrete, including a standard wastage allowance.",
            sampleInputs: { concreteVolumeM3: 10 }, nonNegativeKeys: ["concreteVolumeM3"]
        });

        registry.register("Construction.BallastVolumeForConcrete", {
            fn: ({ concreteVolumeM3 }) => {
                if (concreteVolumeM3 < 0) throw new Error("Construction.BallastVolumeForConcrete: concreteVolumeM3 must be non-negative.");
                // 1:2:4 ratio - ballast/aggregate is 4 parts of 7 total parts.
                return concreteVolumeM3 * (4 / 7) * 1.5;
            },
            requiredInputs: ["concreteVolumeM3"], version: "1.0.0", pack: "Construction",
            description: "Estimated ballast/aggregate volume (m³) for standard 1:2:4 mix concrete, including a standard wastage allowance.",
            sampleInputs: { concreteVolumeM3: 10 }, nonNegativeKeys: ["concreteVolumeM3"]
        });

        registry.register("Construction.BrickCountForWall", {
            fn: ({ wallAreaM2, brickLengthM = 0.2, brickHeightM = 0.1 }) => {
                if (wallAreaM2 < 0 || brickLengthM <= 0 || brickHeightM <= 0) throw new Error("Construction.BrickCountForWall: all dimensions must be positive.");
                const brickFaceArea = brickLengthM * brickHeightM;
                return Math.ceil((wallAreaM2 / brickFaceArea) * 1.05);
            },
            requiredInputs: ["wallAreaM2"], version: "1.0.0", pack: "Construction",
            description: "Estimated standard brick count for a wall area, given brick face dimensions (defaults: 0.2m x 0.1m), including 5% wastage.",
            sampleInputs: { wallAreaM2: 20, brickLengthM: 0.2, brickHeightM: 0.1 }, nonNegativeKeys: ["wallAreaM2", "brickLengthM", "brickHeightM"]
        });

        registry.register("Construction.FloorArea", {
            fn: ({ lengthM, widthM }) => {
                if (lengthM < 0 || widthM < 0) throw new Error("Construction.FloorArea: lengthM and widthM must both be non-negative.");
                return lengthM * widthM;
            },
            requiredInputs: ["lengthM", "widthM"], version: "1.0.0", pack: "Construction",
            description: "Real, direct floor area calculation (length x width) for a rectangular room.",
            sampleInputs: { lengthM: 5, widthM: 4 }, nonNegativeKeys: ["lengthM", "widthM"]
        });

        registry.register("Construction.ExcavationVolume", {
            fn: ({ lengthM, widthM, depthM }) => {
                if (lengthM < 0 || widthM < 0 || depthM < 0) throw new Error("Construction.ExcavationVolume: all dimensions must be non-negative.");
                return lengthM * widthM * depthM;
            },
            requiredInputs: ["lengthM", "widthM", "depthM"], version: "1.0.0", pack: "Construction",
            description: "Real, direct excavation volume calculation (length x width x depth) for a rectangular trench/pit.",
            sampleInputs: { lengthM: 10, widthM: 1, depthM: 1.5 }, nonNegativeKeys: ["lengthM", "widthM", "depthM"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
})();
