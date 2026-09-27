/**
 * core/modules/intelligence/knowledge/geography/continental-framework.js
 * CozyOS — Kiswahili Geographical Semantic Intelligence — Phase 1
 *
 * NEW, ADDITIVE FILE. Establishes the ARCHITECTURE for eventual
 * continental (all-Africa) coverage, per the project plan. This file
 * is explicitly NOT a complete African geographical database — see
 * DISCLOSURE below and the exact counts returned by `getCounts()`.
 *
 * DISCLOSURE (exact, do not round up):
 *  - Major rivers/basins implemented: 4 (Nile, Congo, Zambezi, Niger)
 *  - Major mountains/ranges implemented: 4 (Kilimanjaro, Mount Kenya,
 *    Atlas, Ruwenzori)
 *  - Major lakes implemented: 3 (Victoria, Tanganyika, Nyasa/Malawi)
 *  - Additional African countries implemented beyond the 13 already
 *    covered by east-africa-hub.js: 10 (a starter set spanning North,
 *    West, Central and Southern Africa, chosen for name-recognition
 *    breadth, NOT an exhaustive 54/55-country list).
 * No African city, feature, or country outside these exact counts is
 * claimed to be covered by this file.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["geo-continental-framework"]) return;

    const VERSION = "1.0.0-geo-phase1";

    function feature(name, type, opts) {
        opts = opts || {};
        return Object.freeze({
            id: name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
            name: name,
            type: type, // river | mountain | lake
            countries: Object.freeze(opts.countries || []),
            languageNames: Object.freeze({ sw: opts.sw || name, en: name }),
            aliases: Object.freeze((opts.aliases || []).map((a) => a.toLowerCase()))
        });
    }

    function country(name, capital, opts) {
        opts = opts || {};
        return Object.freeze({
            id: name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
            name: name,
            type: "country",
            capital: capital,
            region: opts.region || "Africa",
            languageNames: Object.freeze({ sw: opts.sw || name, en: name }),
            aliases: Object.freeze((opts.aliases || []).map((a) => a.toLowerCase()))
        });
    }

    const RIVERS = Object.freeze([
        feature("Nile", "river", { sw: "Mto Nile", countries: ["Egypt", "Sudan", "South Sudan", "Ethiopia", "Uganda"], aliases: ["mto nile", "nile river"] }),
        feature("Congo", "river", { sw: "Mto Kongo", countries: ["Democratic Republic of the Congo", "Republic of the Congo"], aliases: ["mto kongo", "congo river"] }),
        feature("Zambezi", "river", { sw: "Mto Zambezi", countries: ["Zambia", "Zimbabwe", "Mozambique"], aliases: ["mto zambezi"] }),
        feature("Niger", "river", { sw: "Mto Niger", countries: ["Nigeria", "Niger", "Mali", "Guinea"], aliases: ["mto niger"] })
    ]);

    const MOUNTAINS = Object.freeze([
        feature("Kilimanjaro", "mountain", { sw: "Mlima Kilimanjaro", countries: ["Tanzania"], aliases: ["mlima kilimanjaro", "mount kilimanjaro"] }),
        feature("Mount Kenya", "mountain", { sw: "Mlima Kenya", countries: ["Kenya"], aliases: ["mlima kenya", "mt kenya"] }),
        feature("Atlas", "mountain", { sw: "Milima ya Atlas", countries: ["Morocco", "Algeria", "Tunisia"], aliases: ["atlas mountains", "milima ya atlas"] }),
        feature("Ruwenzori", "mountain", { sw: "Milima ya Ruwenzori", countries: ["Uganda", "Democratic Republic of the Congo"], aliases: ["rwenzori", "milima ya ruwenzori"] })
    ]);

    const LAKES = Object.freeze([
        feature("Victoria", "lake", { sw: "Ziwa Victoria", countries: ["Kenya", "Tanzania", "Uganda"], aliases: ["ziwa victoria", "lake victoria"] }),
        feature("Tanganyika", "lake", { sw: "Ziwa Tanganyika", countries: ["Tanzania", "Democratic Republic of the Congo", "Burundi", "Zambia"], aliases: ["ziwa tanganyika", "lake tanganyika"] }),
        feature("Nyasa", "lake", { sw: "Ziwa Nyasa", countries: ["Malawi", "Tanzania", "Mozambique"], aliases: ["ziwa nyasa", "lake malawi", "lake nyasa"] })
    ]);

    // Starter set only — see file-level DISCLOSURE above.
    const ADDITIONAL_AFRICAN_COUNTRIES = Object.freeze([
        country("Egypt", "Cairo", { region: "North Africa" }),
        country("Morocco", "Rabat", { region: "North Africa" }),
        country("Algeria", "Algiers", { region: "North Africa" }),
        country("Nigeria", "Abuja", { region: "West Africa" }),
        country("Ghana", "Accra", { region: "West Africa" }),
        country("Senegal", "Dakar", { region: "West Africa" }),
        country("Democratic Republic of the Congo", "Kinshasa", { region: "Central Africa", aliases: ["drc", "congo-kinshasa"] }),
        country("South Africa", "Pretoria", { region: "Southern Africa", aliases: ["rsa"] }),
        country("Zambia", "Lusaka", { region: "Southern Africa" }),
        country("Zimbabwe", "Harare", { region: "Southern Africa" })
    ]);

    function findFeature(nameOrAlias) {
        if (typeof nameOrAlias !== "string") return null;
        const key = nameOrAlias.trim().toLowerCase();
        for (const list of [RIVERS, MOUNTAINS, LAKES]) {
            for (const f of list) {
                if (f.name.toLowerCase() === key || f.aliases.indexOf(key) !== -1) return f;
            }
        }
        return null;
    }

    function findCountry(nameOrAlias) {
        if (typeof nameOrAlias !== "string") return null;
        const key = nameOrAlias.trim().toLowerCase();
        for (const c of ADDITIONAL_AFRICAN_COUNTRIES) {
            if (c.name.toLowerCase() === key || c.capital.toLowerCase() === key || c.aliases.indexOf(key) !== -1) return c;
        }
        return null;
    }

    const api = Object.freeze({
        VERSION,
        rivers: RIVERS,
        mountains: MOUNTAINS,
        lakes: LAKES,
        additionalCountries: ADDITIONAL_AFRICAN_COUNTRIES,
        getCounts: () => Object.freeze({
            rivers: RIVERS.length,
            mountains: MOUNTAINS.length,
            lakes: LAKES.length,
            additionalCountries: ADDITIONAL_AFRICAN_COUNTRIES.length
        }),
        findFeature,
        findCountry
    });

    w.CozyOS.GeoContinentalFramework = api;
    w.CozyOS.Modules["geo-continental-framework"] = Object.freeze({
        version: VERSION,
        description: "New, additive architecture-only pan-African layer: 4 rivers, 4 mountains, 3 lakes, and a disclosed 10-country starter set beyond East Africa. Explicitly NOT a complete African geographical database. Does not modify any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
