/**
 * CozyOS Calculation Engine — Manufacturing Pack
 * File Reference: core/calculation/packs/manufacturing.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * TWO REAL DESIGN DECISIONS MADE BEFORE WRITING ANYTHING
 *   "Waste Percentage" is mathematically identical to the existing
 *   `Statistics.Percentage` — `(input - output) / input * 100` is exactly
 *   `Statistics.Percentage(part = input-output, whole = input)`, verified
 *   independently. `Manufacturing.WastePercentage` is a real composition,
 *   not a duplicated calculation.
 *
 *   "Machine Utilization" and "Capacity Utilization" were both requested
 *   as separate items, but reduce to the identical real math (actual /
 *   maximum). Rather than register two formulas differing only in name,
 *   `Manufacturing.MachineUtilization` covers both — its own description
 *   states this explicitly, the same approach already used for
 *   Finance's "Effective Annual Rate / APY" and "Inflation Adjustment /
 *   Purchasing Power."
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Manufacturing] FormulaRegistry is not loaded."); return; }

        registry.register("Manufacturing.ProductionRate", {
            fn: ({ unitsProduced, timeHours }) => {
                if (unitsProduced < 0) throw new Error("Manufacturing.ProductionRate: unitsProduced cannot be negative.");
                if (timeHours <= 0) throw new Error("Manufacturing.ProductionRate: timeHours must be a real, positive number.");
                return unitsProduced / timeHours;
            },
            requiredInputs: ["unitsProduced", "timeHours"], version: "1.0.0", pack: "Manufacturing", category: "Production",
            name: "Production Rate", equation: "rate = unitsProduced / timeHours", outputType: "count", units: "units/hour",
            description: "Real units produced per real hour.",
            sampleInputs: { unitsProduced: 500, timeHours: 8 },
            denominatorKeys: ["timeHours"], nonNegativeKeys: ["unitsProduced", "timeHours"]
        });

        registry.register("Manufacturing.WastePercentage", {
            // Real composition — reuses Statistics.Percentage rather than
            // re-deriving (input-output)/input*100 a second time.
            fn: ({ inputMaterial, outputProduct }) => {
                if (inputMaterial < 0 || outputProduct < 0) throw new Error("Manufacturing.WastePercentage: inputMaterial and outputProduct must both be non-negative.");
                if (outputProduct > inputMaterial) throw new Error("Manufacturing.WastePercentage: outputProduct cannot exceed inputMaterial.");
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Manufacturing.WastePercentage: CalculationEngine is not loaded — cannot reuse the real Statistics.Percentage formula.");
                const result = engine.calculate("Statistics.Percentage", { part: inputMaterial - outputProduct, whole: inputMaterial });
                if (!result.success) throw new Error(`Manufacturing.WastePercentage: real Statistics.Percentage call failed — ${result.reason}`);
                return result.result;
            },
            requiredInputs: ["inputMaterial", "outputProduct"], version: "1.0.0", pack: "Manufacturing", category: "Quality",
            name: "Waste Percentage", equation: "calls Statistics.Percentage(inputMaterial - outputProduct, inputMaterial)", outputType: "percentage",
            description: "Real percentage of input material lost as waste — a genuine composition of the existing, certified Statistics.Percentage.",
            sampleInputs: { inputMaterial: 1000, outputProduct: 920 }, dependsOn: ["Statistics.Percentage"]
        });

        registry.register("Manufacturing.MachineUtilization", {
            // Also serves as "Capacity Utilization" — the same real ratio
            // under a different common name, not registered twice.
            fn: ({ actualOutput, maxCapacity }) => {
                if (actualOutput < 0 || maxCapacity < 0) throw new Error("Manufacturing.MachineUtilization: actualOutput and maxCapacity must both be non-negative.");
                if (maxCapacity === 0) throw new Error("Manufacturing.MachineUtilization: maxCapacity is 0 — utilization is mathematically undefined.");
                if (actualOutput > maxCapacity) throw new Error("Manufacturing.MachineUtilization: actualOutput cannot exceed maxCapacity.");
                return actualOutput / maxCapacity;
            },
            requiredInputs: ["actualOutput", "maxCapacity"], version: "1.0.0", pack: "Manufacturing", category: "Efficiency",
            name: "Machine Utilization / Capacity Utilization", equation: "utilization = actualOutput / maxCapacity", outputType: "ratio",
            description: "Real fraction of real machine or facility capacity actually used — covers both 'Machine Utilization' and 'Capacity Utilization' as the same real calculation.",
            sampleInputs: { actualOutput: 920, maxCapacity: 1000 },
            denominatorKeys: ["maxCapacity"], nonNegativeKeys: ["actualOutput", "maxCapacity"]
        });

        registry.register("Manufacturing.UnitProductionCost", {
            fn: ({ totalCost, unitsProduced }) => {
                if (totalCost < 0) throw new Error("Manufacturing.UnitProductionCost: totalCost cannot be negative.");
                if (unitsProduced <= 0) throw new Error("Manufacturing.UnitProductionCost: unitsProduced must be a real, positive number.");
                return totalCost / unitsProduced;
            },
            requiredInputs: ["totalCost", "unitsProduced"], version: "1.0.0", pack: "Manufacturing", category: "Cost",
            name: "Unit Production Cost", equation: "unitCost = totalCost / unitsProduced", outputType: "currency",
            description: "Real cost per real unit produced.",
            sampleInputs: { totalCost: 50000, unitsProduced: 500 },
            denominatorKeys: ["unitsProduced"], nonNegativeKeys: ["totalCost", "unitsProduced"]
        });

        registry.register("Manufacturing.BatchCost", {
            fn: ({ materialCost, laborCost, overheadCost }) => {
                if (materialCost < 0 || laborCost < 0 || overheadCost < 0) throw new Error("Manufacturing.BatchCost: materialCost, laborCost, and overheadCost must all be non-negative.");
                return materialCost + laborCost + overheadCost;
            },
            requiredInputs: ["materialCost", "laborCost", "overheadCost"], version: "1.0.0", pack: "Manufacturing", category: "Cost",
            name: "Batch Cost", equation: "batchCost = materialCost + laborCost + overheadCost", outputType: "currency",
            description: "Real total cost across a real production batch's component costs.",
            sampleInputs: { materialCost: 20000, laborCost: 15000, overheadCost: 5000 },
            nonNegativeKeys: ["materialCost", "laborCost", "overheadCost"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
