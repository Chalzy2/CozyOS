/**
 * CozyOS Calculation Engine — Construction Pack
 * File Reference: core/calculation/packs/construction.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * CementBags/SandVolume use real, standard per-cubic-meter rates
 * (cementBagsPerCubicMeter, sandRatio) as caller-supplied inputs rather
 * than a single hardcoded mix ratio — different real construction
 * standards use different real ratios, and this pack does not assume
 * one specific mix is universal.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Construction] FormulaRegistry is not loaded."); return; }

        registry.register("Construction.ConcreteVolume", {
            fn: ({ lengthM, widthM, heightM }) => {
                if (lengthM < 0 || widthM < 0 || heightM < 0) throw new Error("Construction.ConcreteVolume: lengthM, widthM, and heightM must all be non-negative.");
                return lengthM * widthM * heightM;
            },
            requiredInputs: ["lengthM", "widthM", "heightM"], version: "1.0.0", pack: "Construction", category: "Concrete",
            name: "Concrete Volume", equation: "volume = lengthM * widthM * heightM", outputType: "volume", units: "m³",
            description: "Real concrete volume needed for a real slab or foundation.",
            sampleInputs: { lengthM: 5, widthM: 4, heightM: 0.15 }, nonNegativeKeys: ["lengthM", "widthM", "heightM"]
        });

        registry.register("Construction.CementBags", {
            fn: ({ concreteVolumeM3, cementBagsPerCubicMeter }) => {
                if (concreteVolumeM3 < 0 || cementBagsPerCubicMeter < 0) throw new Error("Construction.CementBags: concreteVolumeM3 and cementBagsPerCubicMeter must both be non-negative.");
                return concreteVolumeM3 * cementBagsPerCubicMeter;
            },
            requiredInputs: ["concreteVolumeM3", "cementBagsPerCubicMeter"], version: "1.0.0", pack: "Construction", category: "Concrete",
            name: "Cement Bags", equation: "bags = concreteVolumeM3 * cementBagsPerCubicMeter", outputType: "count", units: "bags",
            description: "Real cement bags needed for a real concrete volume, at a real, caller-supplied bags-per-cubic-meter rate (different mix ratios use different real rates).",
            sampleInputs: { concreteVolumeM3: 3, cementBagsPerCubicMeter: 7 },
            nonNegativeKeys: ["concreteVolumeM3", "cementBagsPerCubicMeter"]
        });

        registry.register("Construction.SandVolume", {
            fn: ({ concreteVolumeM3, sandRatio }) => {
                if (concreteVolumeM3 < 0 || sandRatio < 0) throw new Error("Construction.SandVolume: concreteVolumeM3 and sandRatio must both be non-negative.");
                return concreteVolumeM3 * sandRatio;
            },
            requiredInputs: ["concreteVolumeM3", "sandRatio"], version: "1.0.0", pack: "Construction", category: "Concrete",
            name: "Sand Volume", equation: "sandVolume = concreteVolumeM3 * sandRatio", outputType: "volume", units: "m³",
            description: "Real sand volume needed for a real concrete volume, at a real, caller-supplied mix ratio.",
            sampleInputs: { concreteVolumeM3: 3, sandRatio: 0.42 },
            nonNegativeKeys: ["concreteVolumeM3", "sandRatio"]
        });

        registry.register("Construction.WallArea", {
            fn: ({ lengthM, heightM }) => {
                if (lengthM < 0 || heightM < 0) throw new Error("Construction.WallArea: lengthM and heightM must both be non-negative.");
                return lengthM * heightM;
            },
            requiredInputs: ["lengthM", "heightM"], version: "1.0.0", pack: "Construction", category: "Walls",
            name: "Wall Area", equation: "area = lengthM * heightM", outputType: "area", units: "m²",
            description: "Real wall area for a real wall segment.",
            sampleInputs: { lengthM: 10, heightM: 3 }, nonNegativeKeys: ["lengthM", "heightM"]
        });

        registry.register("Construction.BrickCount", {
            // Real composition — reuses Construction.WallArea rather than
            // re-deriving length * height a second time.
            fn: ({ lengthM, heightM, bricksPerSquareMeter }) => {
                if (bricksPerSquareMeter < 0) throw new Error("Construction.BrickCount: bricksPerSquareMeter cannot be negative.");
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Construction.BrickCount: CalculationEngine is not loaded — cannot reuse the real Construction.WallArea formula.");
                const result = engine.calculate("Construction.WallArea", { lengthM, heightM });
                if (!result.success) throw new Error(`Construction.BrickCount: real Construction.WallArea call failed — ${result.reason}`);
                return result.result * bricksPerSquareMeter;
            },
            requiredInputs: ["lengthM", "heightM", "bricksPerSquareMeter"], version: "1.0.0", pack: "Construction", category: "Walls",
            name: "Brick Count", equation: "bricks = Construction.WallArea(lengthM, heightM) * bricksPerSquareMeter", outputType: "count", units: "bricks",
            description: "Real brick count needed for a real wall — a genuine composition of Construction.WallArea.",
            sampleInputs: { lengthM: 10, heightM: 3, bricksPerSquareMeter: 50 }, dependsOn: ["Construction.WallArea"],
            nonNegativeKeys: ["bricksPerSquareMeter"]
        });

        registry.register("Construction.PaintQuantity", {
            fn: ({ wallAreaM2, coveragePerLiterM2 }) => {
                if (wallAreaM2 < 0) throw new Error("Construction.PaintQuantity: wallAreaM2 cannot be negative.");
                if (coveragePerLiterM2 <= 0) throw new Error("Construction.PaintQuantity: coveragePerLiterM2 must be a real, positive number.");
                return wallAreaM2 / coveragePerLiterM2;
            },
            requiredInputs: ["wallAreaM2", "coveragePerLiterM2"], version: "1.0.0", pack: "Construction", category: "Finishing",
            name: "Paint Quantity", equation: "liters = wallAreaM2 / coveragePerLiterM2", outputType: "volume", units: "liters",
            description: "Real paint quantity needed for a real wall area, given a real paint's coverage rate.",
            sampleInputs: { wallAreaM2: 30, coveragePerLiterM2: 10 },
            denominatorKeys: ["coveragePerLiterM2"], nonNegativeKeys: ["wallAreaM2", "coveragePerLiterM2"]
        });

        registry.register("Construction.MaterialCost", {
            fn: ({ cementCost, sandCost, brickCost }) => {
                if (cementCost < 0 || sandCost < 0 || brickCost < 0) throw new Error("Construction.MaterialCost: cementCost, sandCost, and brickCost must all be non-negative.");
                return cementCost + sandCost + brickCost;
            },
            requiredInputs: ["cementCost", "sandCost", "brickCost"], version: "1.0.0", pack: "Construction", category: "Cost",
            name: "Material Cost Estimate", equation: "totalCost = cementCost + sandCost + brickCost", outputType: "currency",
            description: "Real total material cost across its real component costs.",
            sampleInputs: { cementCost: 5000, sandCost: 2000, brickCost: 8000 },
            nonNegativeKeys: ["cementCost", "sandCost", "brickCost"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
