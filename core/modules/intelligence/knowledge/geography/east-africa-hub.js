/**
 * core/modules/intelligence/knowledge/geography/east-africa-hub.js
 * CozyOS — Kiswahili Geographical Semantic Intelligence — Phase 1
 *
 * NEW, ADDITIVE FILE. East Africa / wider Indian Ocean relationship
 * layer: the countries explicitly named in the project plan, each
 * with capital, ISO-ish common name, and (disclosed, non-exhaustive)
 * bordering countries. This is the layer that lets the geography
 * index answer "country/origin" and "country/destination" style
 * relationship questions once a Kenya county or Tanzania region has
 * already resolved to a country.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["geo-east-africa-hub"]) return;

    const VERSION = "1.0.0-geo-phase1";

    function nation(name, capital, opts) {
        opts = opts || {};
        return Object.freeze({
            id: name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
            name: name,
            type: "country",
            capital: capital,
            region: "East Africa",
            languageNames: Object.freeze({ sw: opts.sw || name, en: name }),
            aliases: Object.freeze((opts.aliases || []).map((a) => a.toLowerCase())),
            metadata: Object.freeze({
                island: !!opts.island,
                borderingCountries: Object.freeze(opts.borders || [])
            })
        });
    }

    // The 13 countries explicitly named in the project plan. Disclosed:
    // "borders" lists are a non-exhaustive, commonly-cited subset, not
    // a verified exhaustive boundary survey.
    const EAST_AFRICA_COUNTRIES = Object.freeze([
        nation("Kenya", "Nairobi", { sw: "Kenya", borders: ["Tanzania", "Uganda", "South Sudan", "Ethiopia", "Somalia"] }),
        nation("Tanzania", "Dodoma", { aliases: ["tz"], borders: ["Kenya", "Uganda", "Rwanda", "Burundi", "Democratic Republic of the Congo", "Zambia", "Malawi", "Mozambique"] }),
        nation("Uganda", "Kampala", { borders: ["Kenya", "Tanzania", "Rwanda", "South Sudan", "Democratic Republic of the Congo"] }),
        nation("Rwanda", "Kigali", { borders: ["Uganda", "Tanzania", "Burundi", "Democratic Republic of the Congo"] }),
        nation("Burundi", "Gitega", { aliases: ["bujumbura"], borders: ["Rwanda", "Tanzania", "Democratic Republic of the Congo"] }),
        nation("South Sudan", "Juba", { aliases: ["south-sudan"], borders: ["Kenya", "Uganda", "Ethiopia", "Sudan", "Democratic Republic of the Congo", "Central African Republic"] }),
        nation("Ethiopia", "Addis Ababa", { borders: ["Kenya", "South Sudan", "Somalia", "Djibouti", "Eritrea", "Sudan"] }),
        nation("Somalia", "Mogadishu", { borders: ["Kenya", "Ethiopia", "Djibouti"] }),
        nation("Djibouti", "Djibouti City", { borders: ["Ethiopia", "Somalia", "Eritrea"] }),
        nation("Comoros", "Moroni", { island: true }),
        nation("Seychelles", "Victoria", { island: true }),
        nation("Mauritius", "Port Louis", { island: true }),
        nation("Madagascar", "Antananarivo", { island: true })
    ]);

    function getCountry(nameOrAlias) {
        if (typeof nameOrAlias !== "string") return null;
        const key = nameOrAlias.trim().toLowerCase();
        for (const c of EAST_AFRICA_COUNTRIES) {
            if (c.name.toLowerCase() === key) return c;
            if (c.capital.toLowerCase() === key) return c;
            if (c.aliases.indexOf(key) !== -1) return c;
        }
        return null;
    }

    const api = Object.freeze({
        VERSION,
        countries: EAST_AFRICA_COUNTRIES,
        count: EAST_AFRICA_COUNTRIES.length,
        getCountry
    });

    w.CozyOS.GeoEastAfricaHub = api;
    w.CozyOS.Modules["geo-east-africa-hub"] = Object.freeze({
        version: VERSION,
        description: "New, additive structured data: the 13 East African / western Indian Ocean countries named in the project plan, each with capital and a disclosed, non-exhaustive bordering-country list. Does not modify any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
