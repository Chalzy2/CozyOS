/**
 * CozyOS Calculation Engine — Accounting Pack
 * File Reference: core/calculation/packs/accounting.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * DOMAIN BOUNDARY — WHY THIS IS SEPARATE FROM BUSINESS
 *   Business (already built) answers "is this performing well" — margin,
 *   ROI, break-even. Accounting answers "what do the real financial
 *   records say" — depreciation, trial balance, cash flow, liquidity
 *   ratios. Same distinction the requester drew explicitly this pass;
 *   `Business.Profit` and any future `Accounting` formula never
 *   duplicate one another even where they touch related numbers.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Accounting] FormulaRegistry is not loaded."); return; }

        registry.register("Accounting.StraightLineDepreciation", {
            fn: ({ cost, salvageValue, usefulLifeYears }) => {
                if (cost < 0 || salvageValue < 0) throw new Error("Accounting.StraightLineDepreciation: cost and salvageValue must both be non-negative.");
                if (usefulLifeYears <= 0) throw new Error("Accounting.StraightLineDepreciation: usefulLifeYears must be a real, positive number.");
                if (salvageValue > cost) throw new Error("Accounting.StraightLineDepreciation: salvageValue cannot exceed the real original cost.");
                return (cost - salvageValue) / usefulLifeYears;
            },
            requiredInputs: ["cost", "salvageValue", "usefulLifeYears"], version: "1.0.0", pack: "Accounting", category: "Depreciation",
            name: "Straight-Line Depreciation", equation: "depreciation = (cost - salvageValue) / usefulLifeYears", outputType: "currency",
            description: "Real, standard straight-line depreciation — equal expense each year over the asset's useful life.",
            sampleInputs: { cost: 50000, salvageValue: 5000, usefulLifeYears: 9 },
            nonNegativeKeys: ["cost", "salvageValue", "usefulLifeYears"]
        });

        registry.register("Accounting.DecliningBalanceDepreciation", {
            fn: ({ bookValueAtStartOfYear, depreciationRate }) => {
                if (bookValueAtStartOfYear < 0) throw new Error("Accounting.DecliningBalanceDepreciation: bookValueAtStartOfYear cannot be negative.");
                if (depreciationRate < 0 || depreciationRate > 1) throw new Error("Accounting.DecliningBalanceDepreciation: depreciationRate must be a real value between 0 and 1.");
                return bookValueAtStartOfYear * depreciationRate;
            },
            requiredInputs: ["bookValueAtStartOfYear", "depreciationRate"], version: "1.0.0", pack: "Accounting", category: "Depreciation",
            name: "Declining Balance Depreciation", equation: "depreciation = bookValueAtStartOfYear * depreciationRate", outputType: "currency",
            description: "One real year's depreciation expense under the declining-balance method — apply repeatedly, using the prior year's ending book value, for successive years.",
            sampleInputs: { bookValueAtStartOfYear: 50000, depreciationRate: 0.2 },
            nonNegativeKeys: ["bookValueAtStartOfYear"]
        });

        registry.register("Accounting.TrialBalanceDifference", {
            // A real, meaningful numeric result: 0 means genuinely
            // balanced; any non-zero value is the real, exact discrepancy
            // an accountant needs to find, not just a true/false flag.
            fn: ({ debits, credits }) => debits.reduce((a, b) => a + b, 0) - credits.reduce((a, b) => a + b, 0),
            requiredInputs: ["debits", "credits"], inputTypes: { debits: "numberArray", credits: "numberArray" },
            version: "1.0.0", pack: "Accounting", category: "Ledger",
            name: "Trial Balance Difference", equation: "difference = sum(debits) - sum(credits)", outputType: "currency",
            description: "Real difference between total debits and total credits — 0 means a genuinely balanced trial balance; any other value is the real discrepancy to investigate.",
            sampleInputs: { debits: [1000, 2000, 1500], credits: [1500, 2000, 1000] }
        });

        registry.register("Accounting.CurrentRatio", {
            fn: ({ currentAssets, currentLiabilities }) => {
                if (currentAssets < 0 || currentLiabilities < 0) throw new Error("Accounting.CurrentRatio: currentAssets and currentLiabilities must both be non-negative.");
                if (currentLiabilities === 0) throw new Error("Accounting.CurrentRatio: currentLiabilities is 0 — the ratio is mathematically undefined.");
                return currentAssets / currentLiabilities;
            },
            requiredInputs: ["currentAssets", "currentLiabilities"], version: "1.0.0", pack: "Accounting", category: "Liquidity",
            name: "Current Ratio", equation: "ratio = currentAssets / currentLiabilities", outputType: "ratio",
            description: "Real liquidity measure — ability to cover short-term obligations with short-term assets.",
            sampleInputs: { currentAssets: 80000, currentLiabilities: 40000 }, denominatorKeys: ["currentLiabilities"],
            nonNegativeKeys: ["currentAssets", "currentLiabilities"]
        });

        registry.register("Accounting.CashFlow", {
            fn: ({ cashInflows, cashOutflows }) => {
                if (cashInflows < 0 || cashOutflows < 0) throw new Error("Accounting.CashFlow: cashInflows and cashOutflows must both be non-negative — a negative NET cash flow is valid and expected as this formula's real output, but a negative individual inflow/outflow figure is not.");
                return cashInflows - cashOutflows;
            },
            requiredInputs: ["cashInflows", "cashOutflows"], version: "1.0.0", pack: "Accounting", category: "CashFlow",
            name: "Net Cash Flow", equation: "netCashFlow = cashInflows - cashOutflows", outputType: "currency",
            description: "Real net cash flow over a period — a negative RESULT correctly represents genuine negative cash flow, not an error; the individual cashInflows/cashOutflows inputs themselves must be non-negative.",
            sampleInputs: { cashInflows: 120000, cashOutflows: 95000 },
            nonNegativeKeys: ["cashInflows", "cashOutflows"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
