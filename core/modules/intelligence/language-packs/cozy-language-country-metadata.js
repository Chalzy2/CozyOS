/**
 * CozyOS — Language Country & Flag Metadata (RP-035 Phase 1 correction)
 * File Reference: core/modules/intelligence/language-packs/cozy-language-country-metadata.js
 *
 * Presentation-only metadata layer on top of RP-030's real
 * geography.countries evidence. A static ISO-3166 name/flag lookup —
 * never a source of language identification, never a claim about a
 * person's nationality or current location. If a country code has no
 * entry here, metadata is UNKNOWN — never a fabricated flag.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    function cozyOS() { return root.window.CozyOS; }
    function registry() { const c = cozyOS(); return (c && c.CozyLanguagePacks) || null; }

    const ISO_COUNTRY_TABLE = Object.freeze({
        KE: { name: "Kenya", flag: "\uD83C\uDDF0\uD83C\uDDEA" },
        TZ: { name: "Tanzania", flag: "\uD83C\uDDF9\uD83C\uDDFF" },
        UG: { name: "Uganda", flag: "\uD83C\uDDFA\uD83C\uDDEC" },
        NG: { name: "Nigeria", flag: "\uD83C\uDDF3\uD83C\uDDEC" },
        ZA: { name: "South Africa", flag: "\uD83C\uDDFF\uD83C\uDDE6" },
        SO: { name: "Somalia", flag: "\uD83C\uDDF8\uD83C\uDDF4" },
        FR: { name: "France", flag: "\uD83C\uDDEB\uD83C\uDDF7" },
        US: { name: "United States", flag: "\uD83C\uDDFA\uD83C\uDDF8" },
        GB: { name: "United Kingdom", flag: "\uD83C\uDDEC\uD83C\uDDE7" },
        CN: { name: "China", flag: "\uD83C\uDDE8\uD83C\uDDF3" },
        RU: { name: "Russia", flag: "\uD83C\uDDF7\uD83C\uDDFA" },
        EG: { name: "Egypt", flag: "\uD83C\uDDEA\uD83C\uDDEC" }
    });

    // SECURITY: this table and every function below is presentation
    // metadata only. Nothing here infers, stores, or exposes a
    // person's nationality or current location — it describes where a
    // LANGUAGE has recorded evidence of use, per RP-030's existing
    // "country is evidence, not proof" rule (see registerRegionalContext).

    function getCountryMetadata(isoCode) {
        const code = String(isoCode || "").toUpperCase();
        const entry = ISO_COUNTRY_TABLE[code];
        return entry
            ? { code, name: entry.name, flag: entry.flag }
            : { code: code || null, name: "UNKNOWN", flag: null };
    }

    function listCountriesForLanguage(languageId) {
        const reg = registry();
        if (!reg) return { status: "CAPABILITY_UNAVAILABLE", countries: [] };
        const pack = reg.getPack(languageId);
        if (!pack) return { status: "UNREGISTERED_LANGUAGE", countries: [] };
        return {
            status: "OK",
            note: "Presentation metadata only — not identity or location evidence.",
            countries: pack.geography.countries.map(getCountryMetadata)
        };
    }

    const api = Object.freeze({
        VERSION,
        getCountryMetadata,
        listCountriesForLanguage
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.Modules["cozy-language-country-metadata"] = Object.freeze({ version: VERSION, api });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
