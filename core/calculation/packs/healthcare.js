/**
 * CozyOS Calculation Engine — Healthcare Pack (Phase 1)
 * File Reference: core/calculation/packs/healthcare.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * HONEST SCOPE
 *   Only BMI and BMR (Mifflin-St Jeor equation, the standard, widely-used
 *   formula) are implemented this pass. Medicine Dosage, IV Flow Rate,
 *   Pregnancy Weeks, Growth Charts, and Risk Scores all carry real
 *   clinical-safety weight — getting a dosage or flow-rate formula wrong
 *   is a genuinely different order of consequence than a business margin
 *   formula, and none of them are implemented here rather than risk a
 *   real, clinically-significant error. BMI/BMR are single, universally
 *   standard equations with no real clinical judgment involved, which is
 *   why they were chosen for this pass and the others were not.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Healthcare] FormulaRegistry is not loaded."); return; }

        registry.register("Healthcare.BMI", {
            fn: ({ weightKg, heightM }) => {
                if (heightM === 0) throw new Error("Healthcare.BMI: heightM is 0 — BMI is mathematically undefined.");
                return weightKg / (heightM * heightM);
            },
            requiredInputs: ["weightKg", "heightM"], version: "1.0.0", pack: "Healthcare",
            description: "Body Mass Index — weight(kg) / height(m)^2.",
            sampleInputs: { weightKg: 70, heightM: 1.75 }, denominatorKeys: ["heightM"]
        });

        registry.register("Healthcare.BMR", {
            // Mifflin-St Jeor equation — the standard, widely-used BMR formula.
            // sex: 1 for male, 0 for female (a real, explicit numeric flag, not a string enum, to keep this formula's inputs uniformly numeric).
            fn: ({ weightKg, heightCm, age, sex }) => {
                const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
                return sex === 1 ? base + 5 : base - 161;
            },
            requiredInputs: ["weightKg", "heightCm", "age", "sex"], version: "1.0.0", pack: "Healthcare",
            description: "Basal Metabolic Rate (Mifflin-St Jeor equation). sex: 1 = male, 0 = female.",
            sampleInputs: { weightKg: 70, heightCm: 175, age: 30, sex: 1 }
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
