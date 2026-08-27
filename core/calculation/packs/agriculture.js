/**
 * CozyOS Calculation Engine — Agriculture Pack
 * File Reference: core/calculation/packs/agriculture.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   "Farm Profit" is mathematically identical to the existing
 *   `Business.Profit` (revenue - cost) — verified before writing
 *   anything. `Agriculture.FarmProfit` is a real composition calling
 *   `Business.Profit` directly, not a duplicated subtraction.
 *
 * A LESSON FROM THE LOGISTICS MILESTONE, APPLIED EXPLICITLY HERE
 *   `Logistics.CostPerKilometer` declared a real `nonNegativeKeys` entry
 *   but its guard only checked `=== 0`, missing `< 0` — caught by
 *   certification, not by inspection. Every guard in this file explicitly
 *   checks `< 0` wherever `nonNegativeKeys` is declared, as its own
 *   separate condition from any `=== 0` division check, rather than
 *   assuming one check covers both cases.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Agriculture] FormulaRegistry is not loaded."); return; }

        registry.register("Agriculture.SeedRequirement", {
            fn: ({ areaAcres, seedRatePerAcre }) => {
                if (areaAcres < 0 || seedRatePerAcre < 0) throw new Error("Agriculture.SeedRequirement: areaAcres and seedRatePerAcre must both be non-negative.");
                return areaAcres * seedRatePerAcre;
            },
            requiredInputs: ["areaAcres", "seedRatePerAcre"], version: "1.0.0", pack: "Agriculture", category: "Planting",
            name: "Seed Requirement", equation: "seedsNeeded = areaAcres * seedRatePerAcre", outputType: "weight", units: "kg",
            description: "Real seed quantity needed for a real planted area.",
            sampleInputs: { areaAcres: 10, seedRatePerAcre: 25 }, nonNegativeKeys: ["areaAcres", "seedRatePerAcre"]
        });

        registry.register("Agriculture.FertilizerRequirement", {
            fn: ({ areaAcres, fertilizerRatePerAcre }) => {
                if (areaAcres < 0 || fertilizerRatePerAcre < 0) throw new Error("Agriculture.FertilizerRequirement: areaAcres and fertilizerRatePerAcre must both be non-negative.");
                return areaAcres * fertilizerRatePerAcre;
            },
            requiredInputs: ["areaAcres", "fertilizerRatePerAcre"], version: "1.0.0", pack: "Agriculture", category: "Planting",
            name: "Fertilizer Requirement", equation: "fertilizerNeeded = areaAcres * fertilizerRatePerAcre", outputType: "weight", units: "kg",
            description: "Real fertilizer quantity needed for a real planted area.",
            sampleInputs: { areaAcres: 10, fertilizerRatePerAcre: 50 }, nonNegativeKeys: ["areaAcres", "fertilizerRatePerAcre"]
        });

        registry.register("Agriculture.YieldEstimate", {
            fn: ({ areaAcres, yieldPerAcre }) => {
                if (areaAcres < 0 || yieldPerAcre < 0) throw new Error("Agriculture.YieldEstimate: areaAcres and yieldPerAcre must both be non-negative.");
                return areaAcres * yieldPerAcre;
            },
            requiredInputs: ["areaAcres", "yieldPerAcre"], version: "1.0.0", pack: "Agriculture", category: "Harvest",
            name: "Yield Estimate", equation: "estimatedYield = areaAcres * yieldPerAcre", outputType: "weight", units: "kg",
            description: "Real estimated total yield for a real planted area, given a real expected yield rate per acre.",
            sampleInputs: { areaAcres: 10, yieldPerAcre: 1200 }, nonNegativeKeys: ["areaAcres", "yieldPerAcre"]
        });

        registry.register("Agriculture.HarvestProjection", {
            // Real composition — reuses Agriculture.YieldEstimate and
            // applies a real, additional quality/loss factor rather than
            // re-deriving area * yieldPerAcre a second time.
            fn: ({ areaAcres, yieldPerAcre, expectedLossRate }) => {
                if (expectedLossRate < 0 || expectedLossRate > 1) throw new Error("Agriculture.HarvestProjection: expectedLossRate must be a real value between 0 and 1.");
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Agriculture.HarvestProjection: CalculationEngine is not loaded — cannot reuse the real Agriculture.YieldEstimate formula.");
                const result = engine.calculate("Agriculture.YieldEstimate", { areaAcres, yieldPerAcre });
                if (!result.success) throw new Error(`Agriculture.HarvestProjection: real Agriculture.YieldEstimate call failed — ${result.reason}`);
                return result.result * (1 - expectedLossRate);
            },
            requiredInputs: ["areaAcres", "yieldPerAcre", "expectedLossRate"], version: "1.0.0", pack: "Agriculture", category: "Harvest",
            name: "Harvest Projection", equation: "projection = Agriculture.YieldEstimate(areaAcres, yieldPerAcre) * (1 - expectedLossRate)", outputType: "weight", units: "kg",
            description: "Real projected harvest after a real, expected loss rate (pests, weather, spoilage) — a genuine composition of Agriculture.YieldEstimate.",
            sampleInputs: { areaAcres: 10, yieldPerAcre: 1200, expectedLossRate: 0.1 }, dependsOn: ["Agriculture.YieldEstimate"]
        });

        registry.register("Agriculture.FeedConsumption", {
            fn: ({ numberOfAnimals, feedPerAnimalKg, days }) => {
                if (numberOfAnimals < 0 || feedPerAnimalKg < 0 || days < 0) throw new Error("Agriculture.FeedConsumption: numberOfAnimals, feedPerAnimalKg, and days must all be non-negative.");
                return numberOfAnimals * feedPerAnimalKg * days;
            },
            requiredInputs: ["numberOfAnimals", "feedPerAnimalKg", "days"], version: "1.0.0", pack: "Agriculture", category: "Livestock",
            name: "Feed Consumption", equation: "totalFeed = numberOfAnimals * feedPerAnimalKg * days", outputType: "weight", units: "kg",
            description: "Real total feed required for a real herd over a real number of days.",
            sampleInputs: { numberOfAnimals: 50, feedPerAnimalKg: 3, days: 30 },
            nonNegativeKeys: ["numberOfAnimals", "feedPerAnimalKg", "days"]
        });

        registry.register("Agriculture.FarmProfit", {
            // Real, explicit composition — calls Business.Profit directly
            // (verified mathematically identical before this was written).
            fn: ({ revenue, cost }) => {
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Agriculture.FarmProfit: CalculationEngine is not loaded — cannot reuse the real Business.Profit formula.");
                const result = engine.calculate("Business.Profit", { revenue, cost });
                if (!result.success) throw new Error(`Agriculture.FarmProfit: real Business.Profit call failed — ${result.reason}`);
                return result.result;
            },
            requiredInputs: ["revenue", "cost"], version: "1.0.0", pack: "Agriculture", category: "Finance",
            name: "Farm Profit", equation: "calls Business.Profit(revenue, cost) directly", outputType: "currency",
            description: "Agriculture-domain entry point for the real, existing Business.Profit — same certified math, not reimplemented.",
            sampleInputs: { revenue: 500000, cost: 350000 }, dependsOn: ["Business.Profit"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
