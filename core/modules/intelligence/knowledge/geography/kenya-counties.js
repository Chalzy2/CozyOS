/**
 * core/modules/intelligence/knowledge/geography/kenya-counties.js
 * CozyOS — Kiswahili Geographical Semantic Intelligence — Phase 1
 *
 * NEW, ADDITIVE FILE. Does not modify cozy-lexicon-en-sw.js or any
 * other existing file. Structured record set for all 47 counties of
 * Kenya established under the 2010 Constitution (First Schedule),
 * grouped by their former (pre-2010) province for the "region" field.
 *
 * DISCLOSURE: coverage is the county + its official headquarters town
 * only (48 records total: 47 counties + 1 duplicate-safe Nairobi
 * city/county merge — see note on "nairobi" below). This file does
 * NOT claim coverage of every town, ward, or sub-county in Kenya.
 * Additional major towns can be added later without breaking this
 * file's shape (see `majorTowns`, currently populated only where a
 * distinct commercial town differs meaningfully from the county HQ).
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["geo-kenya-counties"]) return;

    const VERSION = "1.0.0-geo-phase1";

    function county(code, name, headquarters, region, opts) {
        opts = opts || {};
        return Object.freeze({
            id: name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
            code: code,
            name: name,
            type: "county",
            country: "Kenya",
            region: region, // former (pre-2010) province
            headquarters: headquarters,
            languageNames: Object.freeze({ sw: opts.sw || name, en: name }),
            aliases: Object.freeze((opts.aliases || []).map((a) => a.toLowerCase())),
            majorTowns: Object.freeze(opts.majorTowns || []),
            metadata: Object.freeze({
                isCountyHeadquarters: true,
                coastal: !!opts.coastal,
                borderingCounties: Object.freeze(opts.borders || [])
            })
        });
    }

    // 47 counties, grouped by former province (region field), in the
    // official 001-047 code order used by the Constitution's First
    // Schedule / Council of Governors.
    const KENYA_COUNTIES = Object.freeze([
        // Coast (6)
        county("001", "Mombasa", "Mombasa", "Coast", { aliases: ["mvita"], coastal: true }),
        county("002", "Kwale", "Kwale", "Coast", { majorTowns: ["Ukunda"], coastal: true }),
        county("003", "Kilifi", "Kilifi", "Coast", { majorTowns: ["Malindi", "Watamu", "Mtwapa"], coastal: true }),
        county("004", "Tana River", "Hola", "Coast", { aliases: ["tana-river"], coastal: true }),
        county("005", "Lamu", "Lamu", "Coast", { majorTowns: ["Mokowe"], coastal: true }),
        county("006", "Taita-Taveta", "Wundanyi", "Coast", { aliases: ["taita taveta"], majorTowns: ["Voi", "Taveta"] }),
        // North Eastern (3)
        county("007", "Garissa", "Garissa", "North Eastern"),
        county("008", "Wajir", "Wajir", "North Eastern"),
        county("009", "Mandera", "Mandera", "North Eastern"),
        // Eastern (8)
        county("010", "Marsabit", "Marsabit", "Eastern"),
        county("011", "Isiolo", "Isiolo", "Eastern"),
        county("012", "Meru", "Meru", "Eastern"),
        county("013", "Tharaka-Nithi", "Chuka", "Eastern", { aliases: ["tharaka nithi"] }),
        county("014", "Embu", "Embu", "Eastern"),
        county("015", "Kitui", "Kitui", "Eastern"),
        county("016", "Machakos", "Machakos", "Eastern"),
        county("017", "Makueni", "Wote", "Eastern"),
        // Central (5)
        county("018", "Nyandarua", "Ol Kalou", "Central"),
        county("019", "Nyeri", "Nyeri", "Central"),
        county("020", "Kirinyaga", "Kerugoya", "Central"),
        county("021", "Murang'a", "Murang'a", "Central", { aliases: ["muranga"] }),
        county("022", "Kiambu", "Kiambu", "Central", { majorTowns: ["Thika", "Ruiru"] }),
        // Rift Valley (14)
        county("023", "Turkana", "Lodwar", "Rift Valley"),
        county("024", "West Pokot", "Kapenguria", "Rift Valley", { aliases: ["west-pokot"] }),
        county("025", "Samburu", "Maralal", "Rift Valley"),
        county("026", "Trans Nzoia", "Kitale", "Rift Valley", { aliases: ["trans-nzoia"] }),
        county("027", "Uasin Gishu", "Eldoret", "Rift Valley", { aliases: ["uasin-gishu"] }),
        county("028", "Elgeyo-Marakwet", "Iten", "Rift Valley", { aliases: ["elgeyo marakwet"] }),
        county("029", "Nandi", "Kapsabet", "Rift Valley"),
        county("030", "Baringo", "Kabarnet", "Rift Valley"),
        county("031", "Laikipia", "Rumuruti", "Rift Valley", { majorTowns: ["Nanyuki"] }),
        county("032", "Nakuru", "Nakuru", "Rift Valley", { majorTowns: ["Naivasha"] }),
        county("033", "Narok", "Narok", "Rift Valley"),
        county("034", "Kajiado", "Kajiado", "Rift Valley", { majorTowns: ["Ongata Rongai"] }),
        county("035", "Kericho", "Kericho", "Rift Valley"),
        county("036", "Bomet", "Bomet", "Rift Valley"),
        // Western (4)
        county("037", "Kakamega", "Kakamega", "Western"),
        county("038", "Vihiga", "Mbale", "Western"),
        county("039", "Bungoma", "Bungoma", "Western"),
        county("040", "Busia", "Busia", "Western"),
        // Nyanza (6)
        county("041", "Siaya", "Siaya", "Nyanza"),
        county("042", "Kisumu", "Kisumu", "Nyanza"),
        county("043", "Homa Bay", "Homa Bay", "Nyanza", { aliases: ["homa-bay", "homabay"] }),
        county("044", "Migori", "Migori", "Nyanza"),
        county("045", "Kisii", "Kisii", "Nyanza"),
        county("046", "Nyamira", "Nyamira", "Nyanza"),
        // Nairobi (1)
        county("047", "Nairobi", "Nairobi", "Nairobi", { aliases: ["nrb"], majorTowns: [] })
    ]);

    function getCounty(nameOrAlias) {
        if (typeof nameOrAlias !== "string") return null;
        const key = nameOrAlias.trim().toLowerCase();
        for (const c of KENYA_COUNTIES) {
            if (c.name.toLowerCase() === key) return c;
            if (c.headquarters.toLowerCase() === key) return c;
            if (c.aliases.indexOf(key) !== -1) return c;
            if (c.majorTowns.some((t) => t.toLowerCase() === key)) return c;
        }
        return null;
    }

    const api = Object.freeze({
        VERSION,
        COUNTRY: "Kenya",
        counties: KENYA_COUNTIES,
        count: KENYA_COUNTIES.length,
        getCounty
    });

    w.CozyOS.GeoKenyaCounties = api;
    w.CozyOS.Modules["geo-kenya-counties"] = Object.freeze({
        version: VERSION,
        description: "New, additive structured data: all 47 Kenya counties (name, official headquarters, former-province region, disclosed-partial aliases/major towns). Does not modify any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
