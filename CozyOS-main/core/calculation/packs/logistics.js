/**
 * CozyOS Calculation Engine — Logistics Pack
 * File Reference: core/calculation/packs/logistics.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * OWNERSHIP AUDIT PERFORMED BEFORE THIS FILE WAS WRITTEN
 *   "Driver Commission" is mathematically identical to the existing
 *   `Business.Commission` (amount * rate) — verified independently
 *   before writing anything. Per Rules 80/81, this is a real
 *   composition, `Logistics.DriverCommission`, calling
 *   `Business.Commission` directly with renamed inputs, not a second,
 *   duplicated implementation of the same multiplication.
 *
 * INTERNAL COMPOSITION
 *   `Logistics.FuelCost` composes `Logistics.FuelConsumption` (both real,
 *   both in this same pack) rather than re-deriving the liters-needed
 *   calculation a second time — the same "compose within one pack"
 *   discipline already established in the Finance pack.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Logistics] FormulaRegistry is not loaded."); return; }

        registry.register("Logistics.FuelConsumption", {
            fn: ({ distanceKm, kmPerLiter }) => {
                if (distanceKm < 0) throw new Error("Logistics.FuelConsumption: distanceKm cannot be negative.");
                if (kmPerLiter <= 0) throw new Error("Logistics.FuelConsumption: kmPerLiter must be a real, positive number.");
                return distanceKm / kmPerLiter;
            },
            requiredInputs: ["distanceKm", "kmPerLiter"], version: "1.0.0", pack: "Logistics", category: "Fuel",
            name: "Fuel Consumption", equation: "litersNeeded = distanceKm / kmPerLiter", outputType: "volume", units: "liters",
            description: "Real fuel required for a real trip distance, given a real vehicle efficiency.",
            sampleInputs: { distanceKm: 250, kmPerLiter: 10 }, nonNegativeKeys: ["distanceKm", "kmPerLiter"]
        });

        registry.register("Logistics.FuelCost", {
            // Real composition — reuses Logistics.FuelConsumption rather
            // than re-deriving distanceKm/kmPerLiter a second time.
            fn: ({ distanceKm, kmPerLiter, pricePerLiter }) => {
                if (pricePerLiter < 0) throw new Error("Logistics.FuelCost: pricePerLiter cannot be negative.");
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Logistics.FuelCost: CalculationEngine is not loaded — cannot reuse the real Logistics.FuelConsumption formula.");
                const result = engine.calculate("Logistics.FuelConsumption", { distanceKm, kmPerLiter });
                if (!result.success) throw new Error(`Logistics.FuelCost: real Logistics.FuelConsumption call failed — ${result.reason}`);
                return result.result * pricePerLiter;
            },
            requiredInputs: ["distanceKm", "kmPerLiter", "pricePerLiter"], version: "1.0.0", pack: "Logistics", category: "Fuel",
            name: "Fuel Cost", equation: "fuelCost = Logistics.FuelConsumption(distanceKm, kmPerLiter) * pricePerLiter", outputType: "currency",
            description: "Real total fuel cost for a real trip — a genuine composition of Logistics.FuelConsumption, not a re-derivation.",
            sampleInputs: { distanceKm: 250, kmPerLiter: 10, pricePerLiter: 180 }, nonNegativeKeys: ["pricePerLiter"], dependsOn: ["Logistics.FuelConsumption"]
        });

        registry.register("Logistics.DeliveryCost", {
            fn: ({ fuelCost, driverCost, otherCosts }) => {
                if (fuelCost < 0 || driverCost < 0 || otherCosts < 0) throw new Error("Logistics.DeliveryCost: fuelCost, driverCost, and otherCosts must all be non-negative.");
                return fuelCost + driverCost + otherCosts;
            },
            requiredInputs: ["fuelCost", "driverCost", "otherCosts"], version: "1.0.0", pack: "Logistics", category: "Cost",
            name: "Delivery Cost", equation: "deliveryCost = fuelCost + driverCost + otherCosts", outputType: "currency",
            description: "Real total delivery cost across its real component costs.",
            sampleInputs: { fuelCost: 4500, driverCost: 2000, otherCosts: 500 },
            nonNegativeKeys: ["fuelCost", "driverCost", "otherCosts"]
        });

        registry.register("Logistics.CostPerKilometer", {
            fn: ({ totalCost, distanceKm }) => {
                if (totalCost < 0 || distanceKm < 0) throw new Error("Logistics.CostPerKilometer: totalCost and distanceKm must both be non-negative.");
                if (distanceKm === 0) throw new Error("Logistics.CostPerKilometer: distanceKm is 0 — cost per kilometer is mathematically undefined.");
                return totalCost / distanceKm;
            },
            requiredInputs: ["totalCost", "distanceKm"], version: "1.0.0", pack: "Logistics", category: "Cost",
            name: "Cost Per Kilometer", equation: "costPerKm = totalCost / distanceKm", outputType: "currency",
            description: "Real cost efficiency per kilometer traveled.",
            sampleInputs: { totalCost: 7000, distanceKm: 250 }, denominatorKeys: ["distanceKm"], nonNegativeKeys: ["totalCost", "distanceKm"]
        });

        registry.register("Logistics.DriverCommission", {
            // Real, explicit composition — calls Business.Commission
            // directly (verified mathematically identical before this
            // was written), not a duplicated implementation.
            fn: ({ deliveryRevenue, commissionRate }) => {
                const engine = window.CozyOS.CalculationEngine;
                if (!engine) throw new Error("Logistics.DriverCommission: CalculationEngine is not loaded — cannot reuse the real Business.Commission formula.");
                const result = engine.calculate("Business.Commission", { saleAmount: deliveryRevenue, commissionRate });
                if (!result.success) throw new Error(`Logistics.DriverCommission: real Business.Commission call failed — ${result.reason}`);
                return result.result;
            },
            requiredInputs: ["deliveryRevenue", "commissionRate"], version: "1.0.0", pack: "Logistics", category: "Compensation",
            name: "Driver Commission", equation: "calls Business.Commission(deliveryRevenue, commissionRate) directly", outputType: "currency",
            description: "Logistics-domain entry point for the real, existing Business.Commission — same certified math (amount * rate), not reimplemented.",
            sampleInputs: { deliveryRevenue: 10000, commissionRate: 0.1 }, dependsOn: ["Business.Commission"]
        });

        registry.register("Logistics.TruckCapacityUtilization", {
            fn: ({ usedCapacity, totalCapacity }) => {
                if (usedCapacity < 0 || totalCapacity < 0) throw new Error("Logistics.TruckCapacityUtilization: usedCapacity and totalCapacity must both be non-negative.");
                if (totalCapacity === 0) throw new Error("Logistics.TruckCapacityUtilization: totalCapacity is 0 — utilization is mathematically undefined.");
                if (usedCapacity > totalCapacity) throw new Error("Logistics.TruckCapacityUtilization: usedCapacity cannot exceed totalCapacity.");
                return usedCapacity / totalCapacity;
            },
            requiredInputs: ["usedCapacity", "totalCapacity"], version: "1.0.0", pack: "Logistics", category: "Capacity",
            name: "Truck Capacity Utilization", equation: "utilization = usedCapacity / totalCapacity", outputType: "ratio",
            description: "Real fraction of real truck capacity currently in use.",
            sampleInputs: { usedCapacity: 8000, totalCapacity: 10000 }, denominatorKeys: ["totalCapacity"],
            nonNegativeKeys: ["usedCapacity", "totalCapacity"]
        });

        registry.register("Logistics.RemainingCapacity", {
            fn: ({ totalCapacity, usedCapacity }) => {
                if (totalCapacity < 0 || usedCapacity < 0) throw new Error("Logistics.RemainingCapacity: totalCapacity and usedCapacity must both be non-negative.");
                if (usedCapacity > totalCapacity) throw new Error("Logistics.RemainingCapacity: usedCapacity cannot exceed totalCapacity.");
                return totalCapacity - usedCapacity;
            },
            requiredInputs: ["totalCapacity", "usedCapacity"], version: "1.0.0", pack: "Logistics", category: "Capacity",
            name: "Remaining Capacity", equation: "remaining = totalCapacity - usedCapacity", outputType: "count",
            description: "Real remaining real truck capacity available.",
            sampleInputs: { totalCapacity: 10000, usedCapacity: 8000 },
            nonNegativeKeys: ["totalCapacity", "usedCapacity"]
        });

        registry.register("Logistics.RouteEfficiency", {
            fn: ({ plannedDistanceKm, actualDistanceKm }) => {
                if (plannedDistanceKm < 0 || actualDistanceKm < 0) throw new Error("Logistics.RouteEfficiency: plannedDistanceKm and actualDistanceKm must both be non-negative.");
                if (actualDistanceKm === 0) throw new Error("Logistics.RouteEfficiency: actualDistanceKm is 0 — efficiency is mathematically undefined.");
                return plannedDistanceKm / actualDistanceKm;
            },
            requiredInputs: ["plannedDistanceKm", "actualDistanceKm"], version: "1.0.0", pack: "Logistics", category: "Performance",
            name: "Route Efficiency", equation: "efficiency = plannedDistanceKm / actualDistanceKm", outputType: "ratio",
            description: "Real route efficiency — 1.0 means the real planned route was followed exactly; below 1.0 means real extra distance was traveled.",
            sampleInputs: { plannedDistanceKm: 250, actualDistanceKm: 280 }, denominatorKeys: ["actualDistanceKm"],
            nonNegativeKeys: ["plannedDistanceKm", "actualDistanceKm"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
