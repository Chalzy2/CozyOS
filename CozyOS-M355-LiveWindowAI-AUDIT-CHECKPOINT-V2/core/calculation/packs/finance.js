/**
 * CozyOS Calculation Engine — Finance Pack
 * File Reference: core/calculation/packs/finance.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * RULE 80 + RULE 81 BOTH APPLIED — READ BEFORE ASSUMING A FORMULA IS
 * MISSING
 *   `Business.SimpleInterest`, `Business.CompoundInterest`,
 *   `Business.LoanRepayment`, and `Business.CurrencyConversion` are NOT
 *   duplicated here (Rule 80). Where this pack's real, Finance-domain
 *   entry points are mathematically identical to calling one of those
 *   directly, they are implemented as genuine compositions —
 *   `Finance.FutureValue` calls `CalculationEngine.calculate
 *   ("Business.CompoundInterest", ...)` through the shared engine and
 *   adds back the principal, rather than reimplementing
 *   `Math.pow(1+rate, periods)` a second time. This equivalence was
 *   verified independently before writing the composition (see this
 *   milestone's Constitution entry). `Finance.LoanAnalysis`,
 *   `Finance.InvestmentGrowth`, and `Finance.CurrencyPortfolioValue` are
 *   real, explicit compositions calling `Business.LoanRepayment`/
 *   `Business.CompoundInterest`/`Business.CurrencyConversion` directly,
 *   exactly as specified (Rule 81).
 *
 * HONEST, DELIBERATE OMISSION — IRR
 *   Internal Rate of Return requires iterative numerical root-finding
 *   (Newton-Raphson or bisection) with real risk of non-convergence or
 *   selecting the wrong root for cash-flow patterns with multiple sign
 *   changes. The request itself said "only if you have a robust
 *   implementation" — a fragile IRR silently returning a plausible-
 *   looking wrong answer for a real investment decision is worse than no
 *   IRR at all, so it is not implemented this pass.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Finance] FormulaRegistry is not loaded."); return; }

        // ---- Time Value of Money ----

        registry.register("Finance.DiscountFactor", {
            fn: ({ rate, periods }) => {
                if (periods < 0) throw new Error("Finance.DiscountFactor: periods cannot be negative.");
                const factor = Math.pow(1 + rate, periods);
                if (factor === 0) throw new Error("Finance.DiscountFactor: (1 + rate)^periods is 0 — discount factor is mathematically undefined.");
                return 1 / factor;
            },
            requiredInputs: ["rate", "periods"], version: "1.0.0", pack: "Finance", category: "TimeValueOfMoney",
            name: "Discount Factor", equation: "discountFactor = 1 / (1 + rate)^periods", outputType: "ratio",
            description: "Real discount factor for a given rate and number of periods — the building block Present Value and NPV both use.",
            sampleInputs: { rate: 0.08, periods: 5 }, nonNegativeKeys: ["periods"]
        });

        registry.register("Finance.PresentValue", {
            fn: ({ futureValue, rate, periods }) => {
                if (futureValue < 0) throw new Error("Finance.PresentValue: futureValue cannot be negative.");
                if (periods < 0) throw new Error("Finance.PresentValue: periods cannot be negative.");
                const factor = Math.pow(1 + rate, periods);
                if (factor === 0) throw new Error("Finance.PresentValue: (1 + rate)^periods is 0 — present value is mathematically undefined.");
                return futureValue / factor;
            },
            requiredInputs: ["futureValue", "rate", "periods"], version: "1.0.0", pack: "Finance", category: "TimeValueOfMoney",
            name: "Present Value", equation: "PV = futureValue / (1 + rate)^periods", outputType: "currency",
            description: "Present value of a real, single future lump-sum amount, discounted at a real rate.",
            sampleInputs: { futureValue: 14693.280768000006, rate: 0.08, periods: 5 },
            nonNegativeKeys: ["futureValue", "periods"]
        });

        registry.register("Finance.FutureValue", {
            fn: ({ presentValue, rate, periods }) => {
                if (presentValue < 0) throw new Error("Finance.FutureValue: presentValue cannot be negative.");
                if (periods < 0) throw new Error("Finance.FutureValue: periods cannot be negative.");
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Finance.FutureValue: CalculationEngine is not loaded — cannot reuse the real Business.CompoundInterest formula.");
                const result = engine.calculate("Business.CompoundInterest", { principal: presentValue, rate, periodsPerYear: 1, years: periods });
                if (!result.success) throw new Error(`Finance.FutureValue: real Business.CompoundInterest call failed — ${result.reason}`);
                return presentValue + result.result;
            },
            requiredInputs: ["presentValue", "rate", "periods"], version: "1.0.0", pack: "Finance", category: "TimeValueOfMoney",
            name: "Future Value", equation: "FV = presentValue + Business.CompoundInterest(presentValue, rate, 1, periods)", outputType: "currency",
            description: "Future value of a real, single lump-sum amount — a genuine composition of the existing, certified Business.CompoundInterest, not a reimplementation.",
            sampleInputs: { presentValue: 10000, rate: 0.08, periods: 5 }, dependsOn: ["Business.CompoundInterest"],
            nonNegativeKeys: ["presentValue", "periods"]
        });

        registry.register("Finance.NPV", {
            fn: ({ cashFlows, rate, initialInvestment }) => {
                if (initialInvestment < 0) throw new Error("Finance.NPV: initialInvestment cannot be negative.");
                let npv = -initialInvestment;
                for (let t = 0; t < cashFlows.length; t++) npv += cashFlows[t] / Math.pow(1 + rate, t + 1);
                return npv;
            },
            requiredInputs: ["cashFlows", "rate", "initialInvestment"], inputTypes: { cashFlows: "numberArray" },
            version: "1.0.0", pack: "Finance", category: "TimeValueOfMoney",
            name: "Net Present Value", equation: "NPV = -initialInvestment + sum(cashFlow_t / (1+rate)^t)", outputType: "currency",
            description: "Real Net Present Value across a real series of future cash flows (index 0 = period 1). A negative result correctly represents a genuinely unprofitable real investment.",
            sampleInputs: { cashFlows: [3000, 4000, 5000], rate: 0.1, initialInvestment: 10000 },
            nonNegativeKeys: ["initialInvestment"]
        });

        // ---- Loans ----

        registry.register("Finance.RemainingLoanBalance", {
            fn: ({ principal, ratePerPeriod, totalPeriods, paymentsMade }) => {
                if (principal < 0 || ratePerPeriod < 0 || totalPeriods <= 0 || paymentsMade < 0) throw new Error("Finance.RemainingLoanBalance: principal, ratePerPeriod, totalPeriods, and paymentsMade must all be non-negative, and totalPeriods must be positive.");
                if (paymentsMade > totalPeriods) throw new Error("Finance.RemainingLoanBalance: paymentsMade cannot exceed totalPeriods.");
                if (ratePerPeriod === 0) return principal * (1 - paymentsMade / totalPeriods);
                const factorTotal = Math.pow(1 + ratePerPeriod, totalPeriods);
                const factorMade = Math.pow(1 + ratePerPeriod, paymentsMade);
                return principal * (factorTotal - factorMade) / (factorTotal - 1);
            },
            requiredInputs: ["principal", "ratePerPeriod", "totalPeriods", "paymentsMade"], version: "1.0.0", pack: "Finance", category: "Loans",
            name: "Remaining Loan Balance", equation: "balance = principal * ((1+r)^n - (1+r)^p) / ((1+r)^n - 1)", outputType: "currency",
            description: "Real remaining balance on an amortized loan after a real number of payments already made — genuinely new math, distinct from Business.LoanRepayment (which computes the payment amount, not the remaining balance). Correctly handles a real 0% interest rate as a special case.",
            sampleInputs: { principal: 100000, ratePerPeriod: 0.01, totalPeriods: 12, paymentsMade: 5 }
        });

        registry.register("Finance.TotalInterestPaid", {
            fn: ({ paymentAmount, numberOfPayments, principal }) => {
                if (paymentAmount < 0 || numberOfPayments < 0 || principal < 0) throw new Error("Finance.TotalInterestPaid: paymentAmount, numberOfPayments, and principal must all be non-negative.");
                return (paymentAmount * numberOfPayments) - principal;
            },
            requiredInputs: ["paymentAmount", "numberOfPayments", "principal"], version: "1.0.0", pack: "Finance", category: "Loans",
            name: "Total Interest Paid", equation: "totalInterest = (paymentAmount * numberOfPayments) - principal", outputType: "currency",
            description: "Real total interest paid across a loan's full real repayment schedule. Pair with Finance.LoanAnalysis (which calls Business.LoanRepayment) to get paymentAmount.",
            sampleInputs: { paymentAmount: 8884.878867834166, numberOfPayments: 12, principal: 100000 },
            nonNegativeKeys: ["paymentAmount", "numberOfPayments", "principal"]
        });

        registry.register("Finance.LoanToValueRatio", {
            fn: ({ loanAmount, assetValue }) => {
                if (loanAmount < 0 || assetValue < 0) throw new Error("Finance.LoanToValueRatio: loanAmount and assetValue must both be non-negative.");
                if (assetValue === 0) throw new Error("Finance.LoanToValueRatio: assetValue is 0 — the ratio is mathematically undefined.");
                return loanAmount / assetValue;
            },
            requiredInputs: ["loanAmount", "assetValue"], version: "1.0.0", pack: "Finance", category: "Loans",
            name: "Loan-to-Value Ratio", equation: "LTV = loanAmount / assetValue", outputType: "ratio",
            description: "Real ratio of a loan amount to the real value of the asset securing it.",
            sampleInputs: { loanAmount: 80000, assetValue: 100000 }, denominatorKeys: ["assetValue"],
            nonNegativeKeys: ["loanAmount", "assetValue"]
        });

        registry.register("Finance.LoanAnalysis", {
            fn: ({ principal, ratePerPeriod, numberOfPeriods }) => {
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Finance.LoanAnalysis: CalculationEngine is not loaded — cannot reuse the real Business.LoanRepayment formula.");
                const result = engine.calculate("Business.LoanRepayment", { principal, ratePerPeriod, numberOfPeriods });
                if (!result.success) throw new Error(`Finance.LoanAnalysis: real Business.LoanRepayment call failed — ${result.reason}`);
                return result.result;
            },
            requiredInputs: ["principal", "ratePerPeriod", "numberOfPeriods"], version: "1.0.0", pack: "Finance", category: "Loans",
            name: "Loan Analysis (Payment)", equation: "calls Business.LoanRepayment directly", outputType: "currency",
            description: "Finance-domain entry point for the real, existing Business.LoanRepayment — same certified math, not reimplemented, exposed here for discoverability alongside Finance's other loan formulas.",
            sampleInputs: { principal: 100000, ratePerPeriod: 0.01, numberOfPeriods: 12 }, dependsOn: ["Business.LoanRepayment"]
        });

        // ---- Savings ----

        registry.register("Finance.PeriodicSavings", {
            fn: ({ paymentPerPeriod, rate, periods }) => {
                if (paymentPerPeriod < 0) throw new Error("Finance.PeriodicSavings: paymentPerPeriod cannot be negative.");
                if (periods < 0) throw new Error("Finance.PeriodicSavings: periods cannot be negative.");
                if (rate === 0) return paymentPerPeriod * periods;
                return paymentPerPeriod * ((Math.pow(1 + rate, periods) - 1) / rate);
            },
            requiredInputs: ["paymentPerPeriod", "rate", "periods"], version: "1.0.0", pack: "Finance", category: "Savings",
            name: "Periodic Savings (Future Value of a Series)", equation: "FV = payment * (((1+rate)^periods - 1) / rate)", outputType: "currency",
            description: "Future value of a real, regular series of deposits. Correctly handles a real 0% rate as a special case.",
            sampleInputs: { paymentPerPeriod: 500, rate: 0.05, periods: 10 },
            nonNegativeKeys: ["paymentPerPeriod", "periods"]
        });

        registry.register("Finance.SavingsGoalProjection", {
            fn: ({ goalAmount, rate, periods }) => {
                if (goalAmount < 0) throw new Error("Finance.SavingsGoalProjection: goalAmount cannot be negative.");
                if (periods <= 0) throw new Error("Finance.SavingsGoalProjection: periods must be a real, positive number.");
                if (rate === 0) return goalAmount / periods;
                const factor = Math.pow(1 + rate, periods) - 1;
                if (factor === 0) throw new Error("Finance.SavingsGoalProjection: (1+rate)^periods - 1 is 0 — required payment is mathematically undefined.");
                return goalAmount * rate / factor;
            },
            requiredInputs: ["goalAmount", "rate", "periods"], version: "1.0.0", pack: "Finance", category: "Savings",
            name: "Savings Goal Projection (Required Payment)", equation: "payment = goalAmount * rate / ((1+rate)^periods - 1)", outputType: "currency",
            description: "Real periodic payment required to reach a real savings goal — the mathematical inverse of Finance.PeriodicSavings.",
            sampleInputs: { goalAmount: 10000, rate: 0.05, periods: 10 },
            nonNegativeKeys: ["goalAmount"]
        });

        registry.register("Finance.RetirementSavingsProjection", {
            fn: ({ currentSavings, monthlyContribution, rate, periods }) => {
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Finance.RetirementSavingsProjection: CalculationEngine is not loaded.");
                const lumpSumResult = engine.calculate("Finance.FutureValue", { presentValue: currentSavings, rate, periods });
                if (!lumpSumResult.success) throw new Error(`Finance.RetirementSavingsProjection: Finance.FutureValue call failed — ${lumpSumResult.reason}`);
                const seriesResult = engine.calculate("Finance.PeriodicSavings", { paymentPerPeriod: monthlyContribution, rate, periods });
                if (!seriesResult.success) throw new Error(`Finance.RetirementSavingsProjection: Finance.PeriodicSavings call failed — ${seriesResult.reason}`);
                return lumpSumResult.result + seriesResult.result;
            },
            requiredInputs: ["currentSavings", "monthlyContribution", "rate", "periods"], version: "1.0.0", pack: "Finance", category: "Savings",
            name: "Retirement Savings Projection", equation: "projection = Finance.FutureValue(currentSavings) + Finance.PeriodicSavings(contribution)", outputType: "currency",
            description: "Real projected retirement savings — a composition of the existing Finance.FutureValue and Finance.PeriodicSavings, not a third, separately-derived formula.",
            sampleInputs: { currentSavings: 20000, monthlyContribution: 500, rate: 0.05, periods: 10 }, dependsOn: ["Finance.FutureValue", "Finance.PeriodicSavings"]
        });

        // ---- Investment ----

        registry.register("Finance.PortfolioReturn", {
            fn: ({ returns, weights }) => {
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Finance.PortfolioReturn: CalculationEngine is not loaded — cannot reuse the real Statistics.WeightedScore formula.");
                const result = engine.calculate("Statistics.WeightedScore", { scores: returns, weights });
                if (!result.success) throw new Error(`Finance.PortfolioReturn: real Statistics.WeightedScore call failed — ${result.reason}`);
                return result.result;
            },
            requiredInputs: ["returns", "weights"], inputTypes: { returns: "numberArray", weights: "numberArray" },
            version: "1.0.0", pack: "Finance", category: "Investment",
            name: "Portfolio Return", equation: "calls Statistics.WeightedScore(returns, weights)", outputType: "percentage",
            description: "Real weighted portfolio return across multiple real holdings — a genuine composition of the existing, certified Statistics.WeightedScore.",
            sampleInputs: { returns: [0.08, 0.12, -0.02], weights: [0.5, 0.3, 0.2] }, dependsOn: ["Statistics.WeightedScore"]
        });

        registry.register("Finance.AnnualizedReturn", {
            fn: ({ totalReturn, years }) => {
                if (totalReturn <= -1) throw new Error("Finance.AnnualizedReturn: totalReturn cannot be -100% or lower (a total loss cannot be annualized this way).");
                if (years <= 0) throw new Error("Finance.AnnualizedReturn: years must be a real, positive number.");
                return Math.pow(1 + totalReturn, 1 / years) - 1;
            },
            requiredInputs: ["totalReturn", "years"], version: "1.0.0", pack: "Finance", category: "Investment",
            name: "Annualized Return", equation: "annualized = (1 + totalReturn)^(1/years) - 1", outputType: "percentage",
            description: "Real compound annual growth rate equivalent to a real total return achieved over a real number of years.",
            sampleInputs: { totalReturn: 0.5, years: 3 }, nonNegativeKeys: ["years"]
        });

        registry.register("Finance.InvestmentGrowth", {
            fn: ({ principal, rate, periodsPerYear, years }) => {
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Finance.InvestmentGrowth: CalculationEngine is not loaded — cannot reuse the real Business.CompoundInterest formula.");
                const result = engine.calculate("Business.CompoundInterest", { principal, rate, periodsPerYear, years });
                if (!result.success) throw new Error(`Finance.InvestmentGrowth: real Business.CompoundInterest call failed — ${result.reason}`);
                return result.result;
            },
            requiredInputs: ["principal", "rate", "periodsPerYear", "years"], version: "1.0.0", pack: "Finance", category: "Investment",
            name: "Investment Growth", equation: "calls Business.CompoundInterest directly", outputType: "currency",
            description: "Finance-domain entry point for the real, existing Business.CompoundInterest — same certified math, not reimplemented.",
            sampleInputs: { principal: 10000, rate: 0.1, periodsPerYear: 12, years: 2 }, dependsOn: ["Business.CompoundInterest"]
        });

        // ---- Inflation ----

        registry.register("Finance.InflationAdjustment", {
            fn: ({ nominalValue, inflationRate, years }) => {
                if (nominalValue < 0) throw new Error("Finance.InflationAdjustment: nominalValue cannot be negative.");
                if (years < 0) throw new Error("Finance.InflationAdjustment: years cannot be negative.");
                const factor = Math.pow(1 + inflationRate, years);
                if (factor === 0) throw new Error("Finance.InflationAdjustment: (1 + inflationRate)^years is 0 — result is mathematically undefined.");
                return nominalValue / factor;
            },
            requiredInputs: ["nominalValue", "inflationRate", "years"], version: "1.0.0", pack: "Finance", category: "Inflation",
            name: "Inflation Adjustment / Purchasing Power", equation: "realValue = nominalValue / (1 + inflationRate)^years", outputType: "currency",
            description: "Real, inflation-adjusted value of a nominal amount — the same calculation as 'Purchasing Power', not duplicated as a second formula.",
            sampleInputs: { nominalValue: 100000, inflationRate: 0.05, years: 3 },
            nonNegativeKeys: ["nominalValue", "years"]
        });

        registry.register("Finance.RealRateOfReturn", {
            fn: ({ nominalRate, inflationRate }) => {
                const factor = 1 + inflationRate;
                if (factor === 0) throw new Error("Finance.RealRateOfReturn: (1 + inflationRate) is 0 — real rate of return is mathematically undefined.");
                return (1 + nominalRate) / factor - 1;
            },
            requiredInputs: ["nominalRate", "inflationRate"], version: "1.0.0", pack: "Finance", category: "Inflation",
            name: "Real Rate of Return", equation: "realRate = (1 + nominalRate) / (1 + inflationRate) - 1", outputType: "percentage",
            description: "Real rate of return after accounting for inflation (the Fisher equation) — genuinely distinct from Finance.InflationAdjustment, which adjusts an amount rather than a rate.",
            sampleInputs: { nominalRate: 0.08, inflationRate: 0.03 }, denominatorKeys: ["inflationRate"]
        });

        // ---- Currency ----

        registry.register("Finance.CurrencyPortfolioValue", {
            fn: ({ amounts, exchangeRates }) => {
                if (amounts.length !== exchangeRates.length) throw new Error("Finance.CurrencyPortfolioValue: amounts and exchangeRates must be real arrays of the same length.");
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Finance.CurrencyPortfolioValue: CalculationEngine is not loaded — cannot reuse the real Business.CurrencyConversion formula.");
                let total = 0;
                for (let i = 0; i < amounts.length; i++) {
                    const result = engine.calculate("Business.CurrencyConversion", { amount: amounts[i], exchangeRate: exchangeRates[i] });
                    if (!result.success) throw new Error(`Finance.CurrencyPortfolioValue: real Business.CurrencyConversion call failed for holding ${i} — ${result.reason}`);
                    total += result.result;
                }
                return total;
            },
            requiredInputs: ["amounts", "exchangeRates"], inputTypes: { amounts: "numberArray", exchangeRates: "numberArray" },
            version: "1.0.0", pack: "Finance", category: "Currency",
            name: "Currency Portfolio Value", equation: "sum of Business.CurrencyConversion(amount_i, exchangeRate_i) for every real holding", outputType: "currency",
            description: "Total real portfolio value across multiple real currency holdings, converted to one target currency — a genuine composition of the existing, certified Business.CurrencyConversion, called once per holding.",
            sampleInputs: { amounts: [1000, 500], exchangeRates: [129.5, 0.85] }, dependsOn: ["Business.CurrencyConversion"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
