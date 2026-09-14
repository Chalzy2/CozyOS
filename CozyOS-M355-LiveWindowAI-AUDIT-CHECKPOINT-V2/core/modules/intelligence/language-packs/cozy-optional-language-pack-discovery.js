/**
 * CozyOS — Optional Language Pack Discovery (RP-035 Phase 1 correction)
 * File Reference: core/modules/intelligence/language-packs/cozy-optional-language-pack-discovery.js
 *
 * Composes RP-030 (cozy-language-pack-registry.js) and RP-031
 * (cozy-language-acquisition-pipeline.js). Does NOT create a second
 * language registry: every registered pack, default or optional,
 * lives in RP-030's own single `packs` Map. This file only adds a
 * governed path for a NEW (non-default) language identity to enter
 * that same registry as a container — never AVAILABLE, never
 * promoted. Rule 82 is untouched: no promote/forceAvailable/
 * approvePack/setStatus("AVAILABLE") exists here or anywhere this
 * file calls into.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    function cozyOS() { return root.window.CozyOS; }
    function registry() { const c = cozyOS(); return (c && c.CozyLanguagePacks) || null; }
    function acquisition() { const c = cozyOS(); return (c && c.Modules && c.Modules["cozy-language-acquisition-pipeline"] && c.Modules["cozy-language-acquisition-pipeline"].api) || null; }

    // Small static catalog of languages CozyOS could discover as
    // optional — not registered by default, not fabricated as
    // available. Discovery of a catalog entry != installation.
    const OPTIONAL_CATALOG = Object.freeze([
        { languageId: "lg", name: "Luganda", nativeName: "Luganda", iso: "lg" }
    ]);

    function catalogEntry(languageId) {
        return OPTIONAL_CATALOG.find((c) => c.languageId === String(languageId || "").toLowerCase()) || null;
    }

    function discoverOptionalPacks() {
        const reg = registry();
        if (!reg) return { status: "CAPABILITY_UNAVAILABLE", packs: [] };
        return {
            status: "OK",
            packs: OPTIONAL_CATALOG.map((c) => {
                const existing = reg.getPack(c.languageId);
                return {
                    languageId: c.languageId,
                    name: c.name,
                    installState: existing ? "INSTALLED" : "DISCOVERABLE"
                };
            })
        };
    }

    function getInstalledOptionalPacks() {
        const reg = registry();
        if (!reg) return { status: "CAPABILITY_UNAVAILABLE", packs: [] };
        return { status: "OK", packs: reg.listOptionalPacks() };
    }

    // Registration/routing availability only — NOT Rule 82 promotion.
    function getAvailableLanguagePacks() {
        const reg = registry();
        if (!reg) return { status: "CAPABILITY_UNAVAILABLE", packs: [] };
        return {
            status: "OK",
            note: "Registered-for-routing list only. Rule 82 AVAILABLE state is a separate, unaffected concern.",
            packs: reg.listPacks()
        };
    }

    function getPackMetadata(languageId) {
        const reg = registry();
        if (!reg) return null;
        const pack = reg.getPack(languageId);
        if (pack) return pack;
        const cat = catalogEntry(languageId);
        return cat ? { identity: cat, status: "NOT_REGISTERED", origin: "OPTIONAL_CATALOG" } : null;
    }

    // Discovery -> metadata validation -> acquisition request ->
    // registry registration. Never returns AVAILABLE; Rule 82 gate is
    // consulted read-only for an honest status, never bypassed.
    function requestOptionalPack(languageId, fields) {
        const id = String(languageId || "").toLowerCase();
        const reg = registry();
        if (!reg) return { status: "CAPABILITY_UNAVAILABLE" };

        const existing = reg.getPack(id);
        if (existing) return { status: "ALREADY_REGISTERED", pack: existing };

        const cat = catalogEntry(id);
        if (!cat) return { status: "UNSUPPORTED_LANGUAGE" };

        const result = reg.registerOptionalPack(cat);
        if (!result.ok) return { status: "BLOCKED", reason: result.reason };

        const acq = acquisition();
        let acquisitionResult = { status: "CAPABILITY_UNAVAILABLE" };
        if (acq && fields && typeof acq.submitEvidence === "function") {
            acquisitionResult = acq.submitEvidence(Object.assign({}, fields, { languageId: id }));
        }

        const gate = reg.requestPromotion(id); // always BLOCKED — Rule 82 untouched

        return { status: "DISCOVERY_REGISTERED", pack: result.pack, acquisitionResult, rule82Gate: gate };
    }

    const api = Object.freeze({
        VERSION,
        OPTIONAL_CATALOG,
        discoverOptionalPacks,
        getInstalledOptionalPacks,
        getAvailableLanguagePacks,
        getPackMetadata,
        requestOptionalPack
    });

    root.window.CozyOS = root.window.CozyOS || {};
    root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
    root.window.CozyOS.Modules["cozy-optional-language-pack-discovery"] = Object.freeze({ version: VERSION, api });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
