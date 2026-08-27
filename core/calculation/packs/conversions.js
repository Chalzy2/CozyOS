/**
 * CozyOS Calculation Engine — Conversions Pack
 * File Reference: core/calculation/packs/conversions.js
 * Layer: Core / Platform Foundation — Shared Platform Service
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS PACK, CHOSEN FROM THE REMAINING EIGHTEEN
 *   Of the packs not yet built, Conversions was chosen first because it
 *   is genuinely foundational rather than domain-specific — Construction
 *   (concrete volume), Agriculture (water requirement), Transport
 *   (distance/fuel), and Manufacturing (material consumption) will all
 *   eventually need real unit conversions, and building this pack first
 *   means those future packs can reuse it through the shared engine
 *   rather than each re-deriving the same standard constants.
 *
 * EVERY CONSTANT VERIFIED AGAINST STANDARD REFERENCE VALUES
 *   Each conversion factor below is a standard, published constant
 *   (km-to-miles, kg-to-lbs, Celsius-Fahrenheit, liters-to-gallons) —
 *   verified independently before this file was finalized, the same
 *   discipline already applied to the Business pack's formulas.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};

    function register() {
        const registry = window.CozyOS.FormulaRegistry;
        if (!registry) { console.warn("[CozyOS.Conversions] FormulaRegistry is not loaded."); return; }

        registry.register("Conversions.KmToMiles", {
            fn: ({ km }) => km * 0.621371,
            requiredInputs: ["km"], version: "1.0.0", pack: "Conversions", category: "Distance",
            name: "Kilometers to Miles", equation: "miles = km * 0.621371", outputType: "distance", units: "miles",
            description: "Converts kilometers to miles using the standard conversion factor.",
            sampleInputs: { km: 1 }
        });

        registry.register("Conversions.MilesToKm", {
            fn: ({ miles }) => miles / 0.621371,
            requiredInputs: ["miles"], version: "1.0.0", pack: "Conversions", category: "Distance",
            name: "Miles to Kilometers", equation: "km = miles / 0.621371", outputType: "distance", units: "km",
            description: "Converts miles to kilometers using the standard conversion factor.",
            sampleInputs: { miles: 1 }
        });

        registry.register("Conversions.KgToLbs", {
            fn: ({ kg }) => {
                if (kg < 0) throw new Error("Conversions.KgToLbs: a real weight cannot be negative.");
                return kg * 2.20462;
            },
            requiredInputs: ["kg"], version: "1.0.0", pack: "Conversions", category: "Weight",
            name: "Kilograms to Pounds", equation: "lbs = kg * 2.20462", outputType: "weight", units: "lbs",
            description: "Converts kilograms to pounds using the standard conversion factor. Throws a real error for a negative weight rather than returning a nonsensical negative result.",
            sampleInputs: { kg: 1 }, nonNegativeKeys: ["kg"]
        });

        registry.register("Conversions.LbsToKg", {
            fn: ({ lbs }) => {
                if (lbs < 0) throw new Error("Conversions.LbsToKg: a real weight cannot be negative.");
                return lbs / 2.20462;
            },
            requiredInputs: ["lbs"], version: "1.0.0", pack: "Conversions", category: "Weight",
            name: "Pounds to Kilograms", equation: "kg = lbs / 2.20462", outputType: "weight", units: "kg",
            description: "Converts pounds to kilograms using the standard conversion factor. Throws a real error for a negative weight.",
            sampleInputs: { lbs: 1 }, nonNegativeKeys: ["lbs"]
        });

        registry.register("Conversions.CelsiusToFahrenheit", {
            fn: ({ celsius }) => celsius * 9 / 5 + 32,
            requiredInputs: ["celsius"], version: "1.0.0", pack: "Conversions", category: "Temperature",
            name: "Celsius to Fahrenheit", equation: "F = C * 9/5 + 32", outputType: "temperature", units: "°F",
            description: "Converts Celsius to Fahrenheit. No non-negative constraint — negative temperatures are real and valid.",
            sampleInputs: { celsius: 20 }
        });

        registry.register("Conversions.FahrenheitToCelsius", {
            fn: ({ fahrenheit }) => (fahrenheit - 32) * 5 / 9,
            requiredInputs: ["fahrenheit"], version: "1.0.0", pack: "Conversions", category: "Temperature",
            name: "Fahrenheit to Celsius", equation: "C = (F - 32) * 5/9", outputType: "temperature", units: "°C",
            description: "Converts Fahrenheit to Celsius. No non-negative constraint — negative temperatures are real and valid.",
            sampleInputs: { fahrenheit: 68 }
        });

        registry.register("Conversions.LitersToGallons", {
            fn: ({ liters }) => {
                if (liters < 0) throw new Error("Conversions.LitersToGallons: a real volume cannot be negative.");
                return liters * 0.264172;
            },
            requiredInputs: ["liters"], version: "1.0.0", pack: "Conversions", category: "Volume",
            name: "Liters to Gallons (US)", equation: "gallons = liters * 0.264172", outputType: "volume", units: "gal (US)",
            description: "Converts liters to US gallons using the standard conversion factor. Throws a real error for a negative volume.",
            sampleInputs: { liters: 1 }, nonNegativeKeys: ["liters"]
        });

        registry.register("Conversions.GallonsToLiters", {
            fn: ({ gallons }) => {
                if (gallons < 0) throw new Error("Conversions.GallonsToLiters: a real volume cannot be negative.");
                return gallons / 0.264172;
            },
            requiredInputs: ["gallons"], version: "1.0.0", pack: "Conversions", category: "Volume",
            name: "Gallons (US) to Liters", equation: "liters = gallons / 0.264172", outputType: "volume", units: "L",
            description: "Converts US gallons to liters using the standard conversion factor. Throws a real error for a negative volume.",
            sampleInputs: { gallons: 1 }, nonNegativeKeys: ["gallons"]
        });
    }

    if (window.CozyOS.FormulaRegistry) register();
    else document.addEventListener("DOMContentLoaded", register);
})();
