/**
 * CozyOS Calculation Engine — Inventory Pack
 * File Reference: core/calculation/packs/inventory.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * DOMAIN, NOT APPLICATION — THE ARCHITECTURE THIS FILE FOLLOWS
 *   This is `Inventory.WeightedAverageCost`/`Inventory.FIFOValuation`/etc.
 *   — shared by ShopOS, WholesaleOS, RetailOS, HawkerOS, and any future
 *   warehouse module, exactly as specified. There is no
 *   `ShopOS.StockValuation` or `Wholesale.StockValuation` — one real
 *   formula, one source of truth, called by every application that needs
 *   it through the shared `CalculationEngine`.
 *
 * FIFO/LIFO — WHY THESE USE TWO PARALLEL ARRAYS, NOT A NEW INPUT TYPE
 *   A real inventory ledger is a list of purchase lots (quantity + unit
 *   cost per lot). Rather than extending the engine with a third,
 *   more complex "array of objects" input type, these formulas reuse the
 *   existing `numberArray` type twice — `quantities` and `unitCosts`, in
 *   matching chronological order (oldest lot first) — the same pattern
 *   already proven by `Statistics.WeightedScore`'s parallel `scores`/
 *   `weights` arrays. This keeps the engine's real input-type surface
 *   small rather than growing it for every new pack's convenience.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Inventory] FormulaRegistry is not loaded."); return; }

        registry.register("Inventory.WeightedAverageCost", {
            fn: ({ quantities, unitCosts }) => {
                if (quantities.length !== unitCosts.length) throw new Error("Inventory.WeightedAverageCost: quantities and unitCosts must be real arrays of the same length.");
                const totalQty = quantities.reduce((a, b) => a + b, 0);
                if (totalQty === 0) throw new Error("Inventory.WeightedAverageCost: total quantity is 0 — average cost is mathematically undefined.");
                const totalCost = quantities.reduce((sum, q, i) => sum + q * unitCosts[i], 0);
                return totalCost / totalQty;
            },
            requiredInputs: ["quantities", "unitCosts"], inputTypes: { quantities: "numberArray", unitCosts: "numberArray" },
            version: "1.0.0", pack: "Inventory", category: "Valuation", name: "Weighted Average Cost",
            equation: "WAC = sum(quantity_i * unitCost_i) / sum(quantity_i)", outputType: "currency",
            description: "Weighted average cost across real inventory lots.",
            sampleInputs: { quantities: [100, 150, 80], unitCosts: [10, 12, 15] }
        });

        registry.register("Inventory.FIFOValuation", {
            // Consumes the OLDEST real lots first (index 0 first) — the
            // real, standard First-In-First-Out costing method.
            fn: ({ quantities, unitCosts, quantityToValue }) => {
                if (quantities.length !== unitCosts.length) throw new Error("Inventory.FIFOValuation: quantities and unitCosts must be real arrays of the same length.");
                if (quantityToValue < 0) throw new Error("Inventory.FIFOValuation: quantityToValue cannot be negative.");
                let remaining = quantityToValue, total = 0;
                for (let i = 0; i < quantities.length && remaining > 0; i++) {
                    const used = Math.min(quantities[i], remaining);
                    total += used * unitCosts[i];
                    remaining -= used;
                }
                if (remaining > 0) throw new Error(`Inventory.FIFOValuation: requested quantityToValue exceeds real total available stock by ${remaining} units.`);
                return total;
            },
            requiredInputs: ["quantities", "unitCosts", "quantityToValue"], inputTypes: { quantities: "numberArray", unitCosts: "numberArray" },
            version: "1.0.0", pack: "Inventory", category: "Valuation", name: "FIFO Valuation",
            equation: "Consume oldest lots first until quantityToValue is met", outputType: "currency",
            description: "First-In-First-Out inventory valuation. Lots must be supplied in real chronological order, oldest first.",
            sampleInputs: { quantities: [100, 150, 80], unitCosts: [10, 12, 15], quantityToValue: 200 },
            nonNegativeKeys: ["quantityToValue"]
        });

        registry.register("Inventory.LIFOValuation", {
            // Consumes the NEWEST real lots first (last index first) — the
            // real, standard Last-In-First-Out costing method.
            fn: ({ quantities, unitCosts, quantityToValue }) => {
                if (quantities.length !== unitCosts.length) throw new Error("Inventory.LIFOValuation: quantities and unitCosts must be real arrays of the same length.");
                if (quantityToValue < 0) throw new Error("Inventory.LIFOValuation: quantityToValue cannot be negative.");
                let remaining = quantityToValue, total = 0;
                for (let i = quantities.length - 1; i >= 0 && remaining > 0; i--) {
                    const used = Math.min(quantities[i], remaining);
                    total += used * unitCosts[i];
                    remaining -= used;
                }
                if (remaining > 0) throw new Error(`Inventory.LIFOValuation: requested quantityToValue exceeds real total available stock by ${remaining} units.`);
                return total;
            },
            requiredInputs: ["quantities", "unitCosts", "quantityToValue"], inputTypes: { quantities: "numberArray", unitCosts: "numberArray" },
            version: "1.0.0", pack: "Inventory", category: "Valuation", name: "LIFO Valuation",
            equation: "Consume newest lots first until quantityToValue is met", outputType: "currency",
            description: "Last-In-First-Out inventory valuation. Lots must be supplied in real chronological order, oldest first (this formula reads from the end).",
            sampleInputs: { quantities: [100, 150, 80], unitCosts: [10, 12, 15], quantityToValue: 200 },
            nonNegativeKeys: ["quantityToValue"]
        });

        registry.register("Inventory.EOQ", {
            // Standard Economic Order Quantity formula.
            fn: ({ annualDemand, orderingCostPerOrder, holdingCostPerUnit }) => {
                if (annualDemand < 0 || orderingCostPerOrder < 0 || holdingCostPerUnit < 0) throw new Error("Inventory.EOQ: annualDemand, orderingCostPerOrder, and holdingCostPerUnit must all be non-negative — a negative value under the square root is not a real order quantity.");
                if (holdingCostPerUnit === 0) throw new Error("Inventory.EOQ: holdingCostPerUnit is 0 — EOQ is mathematically undefined.");
                return Math.sqrt((2 * annualDemand * orderingCostPerOrder) / holdingCostPerUnit);
            },
            requiredInputs: ["annualDemand", "orderingCostPerOrder", "holdingCostPerUnit"], version: "1.0.0", pack: "Inventory", category: "Ordering",
            name: "Economic Order Quantity", equation: "EOQ = sqrt(2 * D * S / H)", outputType: "count", units: "units",
            description: "Economic Order Quantity — the real, standard order-size formula minimizing ordering plus holding cost. Throws a real error for any negative input rather than silently returning NaN from the square root.",
            sampleInputs: { annualDemand: 1000, orderingCostPerOrder: 50, holdingCostPerUnit: 2 },
            denominatorKeys: ["holdingCostPerUnit"], nonNegativeKeys: ["annualDemand", "orderingCostPerOrder", "holdingCostPerUnit"]
        });

        registry.register("Inventory.ReorderLevel", {
            fn: ({ averageDailyUsage, leadTimeDays, safetyStock }) => averageDailyUsage * leadTimeDays + safetyStock,
            requiredInputs: ["averageDailyUsage", "leadTimeDays", "safetyStock"], version: "1.0.0", pack: "Inventory", category: "Ordering",
            name: "Reorder Level", equation: "reorderLevel = averageDailyUsage * leadTimeDays + safetyStock", outputType: "count", units: "units",
            description: "Stock level at which a new order should be placed.",
            sampleInputs: { averageDailyUsage: 20, leadTimeDays: 5, safetyStock: 30 }
        });

        registry.register("Inventory.SafetyStock", {
            fn: ({ maxDailyUsage, averageDailyUsage, leadTimeDays }) => {
                if (maxDailyUsage < averageDailyUsage) throw new Error("Inventory.SafetyStock: maxDailyUsage cannot be less than averageDailyUsage — a real maximum cannot be below the real average.");
                return (maxDailyUsage - averageDailyUsage) * leadTimeDays;
            },
            requiredInputs: ["maxDailyUsage", "averageDailyUsage", "leadTimeDays"], version: "1.0.0", pack: "Inventory", category: "Ordering",
            name: "Safety Stock", equation: "safetyStock = (maxDailyUsage - averageDailyUsage) * leadTimeDays", outputType: "count", units: "units",
            description: "Buffer stock to cover real demand variability during lead time.",
            sampleInputs: { maxDailyUsage: 30, averageDailyUsage: 20, leadTimeDays: 5 }
        });

        registry.register("Inventory.StockTurnover", {
            fn: ({ costOfGoodsSold, averageInventoryValue }) => {
                if (averageInventoryValue === 0) throw new Error("Inventory.StockTurnover: averageInventoryValue is 0 — turnover is mathematically undefined.");
                return costOfGoodsSold / averageInventoryValue;
            },
            requiredInputs: ["costOfGoodsSold", "averageInventoryValue"], version: "1.0.0", pack: "Inventory", category: "Performance",
            name: "Stock Turnover Ratio", equation: "turnover = COGS / averageInventoryValue", outputType: "ratio",
            description: "How many times inventory is sold and replaced over a real period.",
            sampleInputs: { costOfGoodsSold: 50000, averageInventoryValue: 10000 }, denominatorKeys: ["averageInventoryValue"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
