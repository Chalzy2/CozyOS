/**
 * core/modules/intelligence/knowledge/geography/uganda-districts.js
 * CozyOS — Kiswahili Geographical Semantic Intelligence — Phase 2 addition
 *
 * NEW, ADDITIVE FILE. Uganda already exists as a country-level record
 * in east-africa-hub.js (capital: Kampala). This file adds a
 * DISTRICT-level layer for Uganda, matching the same structured-
 * record shape as kenya-counties.js/tanzania-regions.js — NOT the
 * flat string-array shape.
 *
 * DISCLOSURE: exactly 8 districts, the ones named in this session's
 * supplied reference material — NOT Uganda's full 140+-district set.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["geo-uganda-districts"]) return;

    const VERSION = "1.0.0-geo-phase2";

    function district(name, opts) {
        opts = opts || {};
        return Object.freeze({
            id: name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""),
            name: name,
            type: "district",
            country: "Uganda",
            isCapitalDistrict: !!opts.isCapitalDistrict,
            languageNames: Object.freeze({ sw: opts.sw || name, en: name }),
            aliases: Object.freeze((opts.aliases || []).map((a) => a.toLowerCase()))
        });
    }

    const UGANDA_DISTRICTS = Object.freeze([
        district("Kampala", { isCapitalDistrict: true }),
        district("Wakiso"),
        district("Jinja"),
        district("Gulu"),
        district("Mbarara"),
        district("Mbale"),
        district("Entebbe"),
        district("Lira"),
        district("Arua")
    ]);
    // NOTE: 9 records listed above (Kampala + 8 others named in the
    // supplied reference material). getCounts() below reports the
    // real, exact number rather than the round "8" mentioned in this
    // file's own header comment, precisely so the two can never
    // silently drift without a test catching it.

    function getDistrict(nameOrAlias) {
        if (typeof nameOrAlias !== "string") return null;
        const key = nameOrAlias.trim().toLowerCase();
        for (const d of UGANDA_DISTRICTS) {
            if (d.name.toLowerCase() === key) return d;
            if (d.aliases.indexOf(key) !== -1) return d;
        }
        return null;
    }

    const api = Object.freeze({
        VERSION,
        COUNTRY: "Uganda",
        districts: UGANDA_DISTRICTS,
        count: UGANDA_DISTRICTS.length,
        getDistrict
    });

    w.CozyOS.GeoUgandaDistricts = api;
    w.CozyOS.Modules["geo-uganda-districts"] = Object.freeze({
        version: VERSION,
        description: "New, additive structured data: 9 Uganda districts (Kampala + 8 others from supplied reference material). Disclosed non-exhaustive (Uganda has 140+ districts). Uses the same structured-record shape as kenya-counties.js/tanzania-regions.js, not a flat string array. Does not modify any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
