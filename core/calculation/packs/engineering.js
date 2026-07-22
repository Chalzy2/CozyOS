/**
 * CozyOS Calculation Engine — Engineering Pack
 * File Reference: core/calculation/packs/engineering.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * "Mechanical Efficiency" is mathematically identical to the existing
 *   `Statistics.Percentage` — `(output / input) * 100` — verified
 *   independently before writing anything.
 *   `Engineering.MechanicalEfficiency` is a real composition, not a
 *   duplicated calculation.
 *
 * OHM'S LAW FORMULAS ARE GENUINELY DISTINCT FROM ONE ANOTHER
 *   V = IR, I = V/R, and R = V/I solve for three different real physical
 *   quantities from the same real relationship — each is registered
 *   separately since each is the correct formula when a different pair
 *   of quantities is known, not three copies of the same math.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Engineering] FormulaRegistry is not loaded."); return; }

        registry.register("Engineering.OhmsLawVoltage", {
            fn: ({ currentA, resistanceOhms }) => {
                if (currentA < 0 || resistanceOhms < 0) throw new Error("Engineering.OhmsLawVoltage: currentA and resistanceOhms must both be non-negative.");
                return currentA * resistanceOhms;
            },
            requiredInputs: ["currentA", "resistanceOhms"], version: "1.0.0", pack: "Engineering", category: "Electrical",
            name: "Ohm's Law — Voltage", equation: "V = I * R", outputType: "voltage", units: "V",
            description: "Real voltage from real current and resistance (Ohm's Law).",
            sampleInputs: { currentA: 2, resistanceOhms: 10 }, nonNegativeKeys: ["currentA", "resistanceOhms"]
        });

        registry.register("Engineering.OhmsLawCurrent", {
            fn: ({ voltageV, resistanceOhms }) => {
                if (voltageV < 0 || resistanceOhms < 0) throw new Error("Engineering.OhmsLawCurrent: voltageV and resistanceOhms must both be non-negative.");
                if (resistanceOhms === 0) throw new Error("Engineering.OhmsLawCurrent: resistanceOhms is 0 — current is mathematically undefined (a real short circuit, not a valid input here).");
                return voltageV / resistanceOhms;
            },
            requiredInputs: ["voltageV", "resistanceOhms"], version: "1.0.0", pack: "Engineering", category: "Electrical",
            name: "Ohm's Law — Current", equation: "I = V / R", outputType: "current", units: "A",
            description: "Real current from real voltage and resistance (Ohm's Law).",
            sampleInputs: { voltageV: 20, resistanceOhms: 10 },
            denominatorKeys: ["resistanceOhms"], nonNegativeKeys: ["voltageV", "resistanceOhms"]
        });

        registry.register("Engineering.OhmsLawResistance", {
            fn: ({ voltageV, currentA }) => {
                if (voltageV < 0 || currentA < 0) throw new Error("Engineering.OhmsLawResistance: voltageV and currentA must both be non-negative.");
                if (currentA === 0) throw new Error("Engineering.OhmsLawResistance: currentA is 0 — resistance is mathematically undefined.");
                return voltageV / currentA;
            },
            requiredInputs: ["voltageV", "currentA"], version: "1.0.0", pack: "Engineering", category: "Electrical",
            name: "Ohm's Law — Resistance", equation: "R = V / I", outputType: "resistance", units: "Ω",
            description: "Real resistance from real voltage and current (Ohm's Law).",
            sampleInputs: { voltageV: 20, currentA: 2 },
            denominatorKeys: ["currentA"], nonNegativeKeys: ["voltageV", "currentA"]
        });

        registry.register("Engineering.ElectricalPower", {
            fn: ({ voltageV, currentA }) => {
                if (voltageV < 0 || currentA < 0) throw new Error("Engineering.ElectricalPower: voltageV and currentA must both be non-negative.");
                return voltageV * currentA;
            },
            requiredInputs: ["voltageV", "currentA"], version: "1.0.0", pack: "Engineering", category: "Electrical",
            name: "Electrical Power", equation: "P = V * I", outputType: "power", units: "W",
            description: "Real electrical power from real voltage and current.",
            sampleInputs: { voltageV: 20, currentA: 2 }, nonNegativeKeys: ["voltageV", "currentA"]
        });

        registry.register("Engineering.EnergyConsumption", {
            fn: ({ powerW, hours }) => {
                if (powerW < 0 || hours < 0) throw new Error("Engineering.EnergyConsumption: powerW and hours must both be non-negative.");
                return (powerW * hours) / 1000;
            },
            requiredInputs: ["powerW", "hours"], version: "1.0.0", pack: "Engineering", category: "Electrical",
            name: "Energy Consumption", equation: "energy(kWh) = (powerW * hours) / 1000", outputType: "energy", units: "kWh",
            description: "Real energy consumed over real time, in kWh.",
            sampleInputs: { powerW: 1500, hours: 4 }, nonNegativeKeys: ["powerW", "hours"]
        });

        registry.register("Engineering.VoltageDrop", {
            fn: ({ currentA, wireResistanceOhms }) => {
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Engineering.VoltageDrop: CalculationEngine is not loaded — cannot reuse the real Engineering.OhmsLawVoltage formula.");
                const result = engine.calculate("Engineering.OhmsLawVoltage", { currentA, resistanceOhms: wireResistanceOhms });
                if (!result.success) throw new Error(`Engineering.VoltageDrop: real Engineering.OhmsLawVoltage call failed — ${result.reason}`);
                return result.result;
            },
            requiredInputs: ["currentA", "wireResistanceOhms"], version: "1.0.0", pack: "Engineering", category: "Electrical",
            name: "Voltage Drop", equation: "calls Engineering.OhmsLawVoltage(currentA, wireResistanceOhms)", outputType: "voltage", units: "V",
            description: "Real voltage drop across a real wire's resistance — a genuine composition of Engineering.OhmsLawVoltage, not a reimplementation.",
            sampleInputs: { currentA: 2, wireResistanceOhms: 0.5 }, dependsOn: ["Engineering.OhmsLawVoltage"]
        });

        registry.register("Engineering.MechanicalEfficiency", {
            fn: ({ outputEnergy, inputEnergy }) => {
                if (outputEnergy < 0 || inputEnergy < 0) throw new Error("Engineering.MechanicalEfficiency: outputEnergy and inputEnergy must both be non-negative.");
                if (outputEnergy > inputEnergy) throw new Error("Engineering.MechanicalEfficiency: outputEnergy cannot exceed inputEnergy (a real machine cannot output more than it takes in).");
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Engineering.MechanicalEfficiency: CalculationEngine is not loaded — cannot reuse the real Statistics.Percentage formula.");
                const result = engine.calculate("Statistics.Percentage", { part: outputEnergy, whole: inputEnergy });
                if (!result.success) throw new Error(`Engineering.MechanicalEfficiency: real Statistics.Percentage call failed — ${result.reason}`);
                return result.result;
            },
            requiredInputs: ["outputEnergy", "inputEnergy"], version: "1.0.0", pack: "Engineering", category: "Mechanical",
            name: "Mechanical Efficiency", equation: "calls Statistics.Percentage(outputEnergy, inputEnergy)", outputType: "percentage",
            description: "Real mechanical efficiency — a genuine composition of the existing, certified Statistics.Percentage.",
            sampleInputs: { outputEnergy: 800, inputEnergy: 1000 }, dependsOn: ["Statistics.Percentage"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
