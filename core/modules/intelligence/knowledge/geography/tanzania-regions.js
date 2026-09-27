/**
 * core/modules/intelligence/knowledge/geography/tanzania-regions.js
 * CozyOS — Kiswahili Geographical Semantic Intelligence — Phase 1
 *
 * NEW, ADDITIVE FILE. Structured record set for all 31 administrative
 * regions (mikoa) of Tanzania, including the 5 Zanzibar regions
 * (Mjini Magharibi, Kaskazini Unguja, Kusini Unguja, Kaskazini Pemba,
 * Kusini Pemba). DISCLOSURE: coverage is region + regional capital
 * only — this file does NOT claim district- or ward-level coverage.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["geo-tanzania-regions"]) return;

    const VERSION = "1.0.0-geo-phase1";

    function region(name, capital, opts) {
        opts = opts || {};
        return Object.freeze({
            id: name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
            name: name,
            type: "region",
            country: "Tanzania",
            zone: opts.zone || null,
            capital: capital,
            languageNames: Object.freeze({ sw: opts.sw || (name + " Mkoa"), en: name + " Region" }),
            aliases: Object.freeze((opts.aliases || []).map((a) => a.toLowerCase())),
            metadata: Object.freeze({
                isZanzibar: !!opts.zanzibar,
                island: !!opts.island
            })
        });
    }

    // 31 regions. `zone` uses the commonly-referenced statistical
    // zones (Northern, Coastal, Lake, Central, Southern Highlands,
    // Western, Zanzibar) for relationship queries; disclosed as a
    // simplification, not an official constitutional grouping.
    const TANZANIA_REGIONS = Object.freeze([
        region("Arusha", "Arusha", { zone: "Northern" }),
        region("Kilimanjaro", "Moshi", { zone: "Northern" }),
        region("Manyara", "Babati", { zone: "Northern" }),
        region("Tanga", "Tanga", { zone: "Northern" }),
        region("Dar es Salaam", "Dar es Salaam", { zone: "Coastal", aliases: ["dar", "dar-es-salaam"] }),
        region("Pwani", "Kibaha", { zone: "Coastal", aliases: ["coast", "pwani region"] }),
        region("Lindi", "Lindi", { zone: "Coastal" }),
        region("Mtwara", "Mtwara", { zone: "Coastal" }),
        region("Dodoma", "Dodoma", { zone: "Central", aliases: ["capital"] }),
        region("Singida", "Singida", { zone: "Central" }),
        region("Tabora", "Tabora", { zone: "Central" }),
        region("Geita", "Geita", { zone: "Lake" }),
        region("Kagera", "Bukoba", { zone: "Lake" }),
        region("Mara", "Musoma", { zone: "Lake" }),
        region("Mwanza", "Mwanza", { zone: "Lake" }),
        region("Shinyanga", "Shinyanga", { zone: "Lake" }),
        region("Simiyu", "Bariadi", { zone: "Lake" }),
        region("Kigoma", "Kigoma", { zone: "Western" }),
        region("Katavi", "Mpanda", { zone: "Western" }),
        region("Rukwa", "Sumbawanga", { zone: "Western" }),
        region("Iringa", "Iringa", { zone: "Southern Highlands" }),
        region("Mbeya", "Mbeya", { zone: "Southern Highlands" }),
        region("Njombe", "Njombe", { zone: "Southern Highlands" }),
        region("Ruvuma", "Songea", { zone: "Southern Highlands" }),
        region("Songwe", "Vwawa", { zone: "Southern Highlands" }),
        region("Morogoro", "Morogoro", { zone: "Southern Highlands" }),
        region("Mjini Magharibi", "Zanzibar City", { zone: "Zanzibar", zanzibar: true, island: true, aliases: ["zanzibar urban west", "unguja mjini"] }),
        region("Kaskazini Unguja", "Mkokotoni", { zone: "Zanzibar", zanzibar: true, island: true, aliases: ["unguja north", "zanzibar north"] }),
        region("Kusini Unguja", "Koani", { zone: "Zanzibar", zanzibar: true, island: true, aliases: ["unguja south", "zanzibar south"] }),
        region("Kaskazini Pemba", "Wete", { zone: "Zanzibar", zanzibar: true, island: true, aliases: ["pemba north"] }),
        region("Kusini Pemba", "Chake Chake", { zone: "Zanzibar", zanzibar: true, island: true, aliases: ["pemba south", "chake-chake"] })
    ]);

    function getRegion(nameOrAlias) {
        if (typeof nameOrAlias !== "string") return null;
        const key = nameOrAlias.trim().toLowerCase();
        for (const r of TANZANIA_REGIONS) {
            if (r.name.toLowerCase() === key) return r;
            if (r.capital.toLowerCase() === key) return r;
            if (r.aliases.indexOf(key) !== -1) return r;
        }
        return null;
    }

    const api = Object.freeze({
        VERSION,
        COUNTRY: "Tanzania",
        regions: TANZANIA_REGIONS,
        count: TANZANIA_REGIONS.length,
        getRegion
    });

    w.CozyOS.GeoTanzaniaRegions = api;
    w.CozyOS.Modules["geo-tanzania-regions"] = Object.freeze({
        version: VERSION,
        description: "New, additive structured data: all 31 Tanzania regions (mainland + Zanzibar's 5), each with regional capital and a disclosed, simplified statistical zone. Does not modify any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
