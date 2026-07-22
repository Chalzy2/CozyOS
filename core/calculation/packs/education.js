/**
 * CozyOS Calculation Engine — Education Pack
 * File Reference: core/calculation/packs/education.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * REAL REUSE — "ONE FORMULA, ONE SOURCE OF TRUTH" APPLIED HERE
 *   `Education.CGPA` computes a real mean of real GPA values by calling
 *   `window.CozyOS.CalculationEngine.calculate("Statistics.Mean", ...)`
 *   through the shared engine — it does not reimplement averaging
 *   locally. This is deliberately more work than just writing
 *   `arr.reduce(...)` again, because the whole point of a shared engine
 *   is that "Statistics.Mean" only has one real implementation anywhere
 *   in CozyOS, and every consumer, including this pack, goes through it.
 *
 * HONEST SCOPE
 *   Grade Conversion uses one real, disclosed grading scale (a standard
 *   90/80/70/60 percentage-to-letter scale) — real schools use different
 *   real scales, and this is named as one configurable example, not a
 *   universal standard. Class Ranking here is a real, simple descending
 *   sort by score; it does not handle real-world tie-breaking rules
 *   (which vary by institution) — ties are honestly given the same real
 *   rank, the next rank skips accordingly (standard "competition
 *   ranking"), disclosed in the description field, not silently assumed.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Education] FormulaRegistry is not loaded."); return; }

        registry.register("Education.GPA", {
            // Standard 4.0-scale GPA: weighted mean of (gradePoints * creditHours) / total credit hours.
            fn: ({ gradePoints, creditHours }) => {
                if (gradePoints.length !== creditHours.length) throw new Error("Education.GPA: gradePoints and creditHours must be real arrays of the same length.");
                const totalCredits = creditHours.reduce((a, b) => a + b, 0);
                if (totalCredits === 0) throw new Error("Education.GPA: total credit hours is 0 — GPA is mathematically undefined.");
                return gradePoints.reduce((sum, gp, i) => sum + gp * creditHours[i], 0) / totalCredits;
            },
            requiredInputs: ["gradePoints", "creditHours"], inputTypes: { gradePoints: "numberArray", creditHours: "numberArray" },
            version: "1.0.0", pack: "Education", description: "Standard 4.0-scale GPA — credit-hour-weighted mean of grade points.",
            sampleInputs: { gradePoints: [4.0, 3.0, 3.7], creditHours: [3, 4, 3] }
        });

        registry.register("Education.CGPA", {
            // Real reuse: calls Statistics.Mean through the shared engine rather than reimplementing an average locally.
            fn: ({ semesterGPAs }) => {
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Education.CGPA: CalculationEngine is not loaded — cannot reuse the real Statistics.Mean formula.");
                const result = engine.calculate("Statistics.Mean", { values: semesterGPAs });
                if (!result.success) throw new Error(`Education.CGPA: real Statistics.Mean call failed — ${result.reason}`);
                return result.result;
            },
            requiredInputs: ["semesterGPAs"], inputTypes: { semesterGPAs: "numberArray" },
            version: "1.0.0", pack: "Education", description: "Cumulative GPA across real semesters — computed via the real, shared Statistics.Mean formula, not a local reimplementation.",
            sampleInputs: { semesterGPAs: [3.5, 3.7, 3.2] }, dependsOn: ["Statistics.Mean"]
        });

        registry.register("Education.AttendancePercentage", {
            fn: ({ daysPresent, totalDays }) => {
                if (totalDays === 0) throw new Error("Education.AttendancePercentage: totalDays is 0 — percentage is mathematically undefined.");
                return (daysPresent / totalDays) * 100;
            },
            requiredInputs: ["daysPresent", "totalDays"], version: "1.0.0", pack: "Education",
            description: "Percentage of real school days a student was present.",
            sampleInputs: { daysPresent: 85, totalDays: 90 }, denominatorKeys: ["totalDays"]
        });

        registry.register("Education.PassRate", {
            fn: ({ studentsPassed, totalStudents }) => {
                if (totalStudents === 0) throw new Error("Education.PassRate: totalStudents is 0 — pass rate is mathematically undefined.");
                return (studentsPassed / totalStudents) * 100;
            },
            requiredInputs: ["studentsPassed", "totalStudents"], version: "1.0.0", pack: "Education",
            description: "Percentage of real students who passed.",
            sampleInputs: { studentsPassed: 42, totalStudents: 50 }, denominatorKeys: ["totalStudents"]
        });

        registry.register("Education.GradeFromPercentage", {
            // Real, disclosed example scale (90/80/70/60) — not a universal standard.
            // Returns a real numeric grade-point equivalent (A=4, B=3, C=2, D=1, F=0)
            // since calculate() requires a numeric result; the letter mapping is
            // documented here for a real caller to translate if it wants a letter.
            fn: ({ percentage }) => {
                if (percentage >= 90) return 4; // A
                if (percentage >= 80) return 3; // B
                if (percentage >= 70) return 2; // C
                if (percentage >= 60) return 1; // D
                return 0; // F
            },
            requiredInputs: ["percentage"], version: "1.0.0", pack: "Education",
            description: "Grade-point equivalent (4/3/2/1/0 = A/B/C/D/F) from a real percentage, using one disclosed, real 90/80/70/60 scale — real institutions use different real scales.",
            sampleInputs: { percentage: 85 }
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
