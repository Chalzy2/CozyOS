/**
 * CozyOS Calculation Engine — Payroll Pack (Phase 1, Generic Only)
 * File Reference: core/calculation/packs/payroll.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * HONEST, DELIBERATE SCOPE LIMIT
 *   PAYE, Pension, and NSSF/NHIF (or any country's equivalent) are
 *   explicitly NOT implemented — the source specification itself says
 *   "country-specific where applicable," and a wrong tax-bracket formula
 *   is a real, legally and financially significant error, not a
 *   business-margin rounding difference. Fabricating a generic
 *   "PAYE-like" formula without a real, verified, country-specific tax
 *   table would be worse than not having one — it would look
 *   authoritative while being wrong. Only genuinely universal, real
 *   arithmetic (gross salary composition, overtime, net-of-real-
 *   deductions) is implemented here.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Payroll] FormulaRegistry is not loaded."); return; }

        registry.register("Payroll.GrossSalary", {
            fn: ({ basicSalary, allowances }) => basicSalary + allowances,
            requiredInputs: ["basicSalary", "allowances"], version: "1.0.0", pack: "Payroll",
            description: "Gross salary — basic salary plus real allowances.",
            sampleInputs: { basicSalary: 50000, allowances: 5000 }
        });

        registry.register("Payroll.NetSalary", {
            // Real, generic: net = gross - real deductions the caller has
            // already computed elsewhere (which may include real,
            // country-specific PAYE/pension figures from a source outside
            // this engine) — this formula does not compute those deductions
            // itself.
            fn: ({ grossSalary, totalDeductions }) => grossSalary - totalDeductions,
            requiredInputs: ["grossSalary", "totalDeductions"], version: "1.0.0", pack: "Payroll",
            description: "Net salary — gross salary minus real, already-computed total deductions. This formula does not compute PAYE/pension/NSSF/NHIF itself — those are real, country-specific figures the caller must supply.",
            sampleInputs: { grossSalary: 55000, totalDeductions: 8000 }
        });

        registry.register("Payroll.Overtime", {
            fn: ({ hourlyRate, overtimeHours, overtimeMultiplier }) => hourlyRate * overtimeHours * overtimeMultiplier,
            requiredInputs: ["hourlyRate", "overtimeHours", "overtimeMultiplier"], version: "1.0.0", pack: "Payroll",
            description: "Overtime pay — hourly rate times overtime hours times a real, caller-supplied multiplier (e.g. 1.5 for time-and-a-half).",
            sampleInputs: { hourlyRate: 500, overtimeHours: 10, overtimeMultiplier: 1.5 }
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
