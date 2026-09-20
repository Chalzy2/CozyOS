/**
 * CozyOS — Dashboard Profile Language Contract
 * File Reference: core/shell/dashboard-profile-language-contract.js
 * Milestone: Profile Phase 2A-1 — Language Registry Contract
 *
 * CLASSIFICATION: COMPOSED, new, READ-ONLY pure logic. No DOM, no
 * storage, no network, no UI. It owns NO language data: every id,
 * display name, native name and BCP-47 tag it returns is read, at call
 * time, from the existing CozyOS language registry. It only defines the
 * exact shape a profile stores and how a stored id resolves back to
 * display metadata. Same "-core/-contract" convention as
 * dashboard-profile-core.js / dashboard-navigation-core.js.
 *
 * WHICH REGISTRY IS THE SINGLE SOURCE OF TRUTH — AND WHY
 *   The repository has FOUR places that carry language identifiers
 *   (audited by core/shell/tests/profile-language-registry-audit.js):
 *     Tier 1  window.CozyOS.CozyLanguagePacks   (language-packs/cozy-language-pack-registry.js)
 *             17 default identities + any registered optional packs.
 *             Its own header names it the IDENTITY authority ("Tier 1
 *             (identity) -> THIS registry"). Fields: languageId, name,
 *             nativeName, iso, flag.
 *     Tier 2  window.CozyOS.CozyLanguageRegistry (intelligence/language/cozy-language-registry.js)
 *             11 languages; the chat/response-template SELECTOR (a
 *             "different, narrower concern" per Tier 1's header).
 *     UI      window.CozyOS.LanguageEngine       (language/language-engine.js)
 *             UI-string translation + Intl locale; 20 entries.
 *     Speech  window.CozyOS.CozySpeech           (speech/cozy-speech.js)
 *             recognition/voice registry; 43 entries; different ids for
 *             six languages (ha->hau, yo->yor, ki->kik, zu->zul,
 *             am->amh, ig->ibo).
 *   A profile records WHO a person is linguistically — identity — so
 *   this contract resolves against Tier 1. The others are consumers
 *   with narrower jobs and are neither read nor modified here.
 *
 * WHAT THE REGISTRY DOES AND DOES NOT PROVIDE (confirmed, not assumed)
 *   id            YES  Tier 1 `languageId` (lower-case: en sw fr ar so ru zh ha yo luo ki kam zu am ln ig hi)
 *   display name  YES  `name`
 *   native name   YES  `nativeName`
 *   BCP-47 tag    PARTIAL  Tier 1 `iso` holds a bare BCP-47 language
 *                 subtag for 14 of 17; it is null for luo, ki, kam. This
 *                 contract reports the registry's value as `bcp47` and
 *                 null where the registry has none — it does NOT infer or
 *                 fill one in. (Region-qualified tags such as sw-KE
 *                 belong to Speech/LanguageEngine, not profile identity.)
 *   aliases       NO   No registry has an alias/search-name field. So
 *                 `searchNames` here is DERIVED at read time from fields
 *                 the registry already holds (name, the parts of a
 *                 "A / B" name, nativeName, id, iso) and is never stored.
 *                 No alias table is created.
 *
 * WHAT A PROFILE STORES: canonical registry ids only.
 *   { motherLanguages: [id, ...], languagesKnown: [id, ...] }
 *   Never a name, native name or tag — those are looked up from the
 *   registry when displayed, so a registry correction reaches every
 *   profile with nothing to migrate.
 *
 * WHAT THIS DOES NOT DO (deliberately out of this mini-phase)
 *   No normalization pipeline / dedupe / mother-language invariant
 *   (Phase 2A-2). No UI. No Live Window. No Teach CozyAI. No claim
 *   that CozyAI can understand a language: the descriptor carries no
 *   readiness/availability state, because a person knowing a language
 *   says nothing about whether a language pack is AVAILABLE (Rule 82
 *   is owned by the pack registry).
 *
 * FAILS CLOSED: if Tier 1 is not loaded, every call reports
 * REGISTRY_UNAVAILABLE and returns no languages — never a built-in
 * fallback list. NOTE for the UI phase: dashboard.html and index.html
 * do not currently load cozy-language-pack-registry.js; it must be
 * added there (it has no required dependencies) before a picker can
 * work.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";
    const REGISTRY_GLOBAL = "CozyLanguagePacks";
    const MAX_ID_LENGTH = 32;

    const PROFILE_LANGUAGE_FIELDS = Object.freeze(["motherLanguages", "languagesKnown"]);
    const REASONS = Object.freeze({
        REGISTRY_UNAVAILABLE: "REGISTRY_UNAVAILABLE",
        INVALID_ID: "INVALID_ID",
        UNKNOWN_LANGUAGE_ID: "UNKNOWN_LANGUAGE_ID"
    });

    function ambientCozyOS() {
        if (typeof window !== "undefined" && window && window.CozyOS) return window.CozyOS;
        return (root && root.window && root.window.CozyOS) || null;
    }

    function getRegistry(options) {
        const injected = options && options.registry;
        const reg = injected || (ambientCozyOS() || {})[REGISTRY_GLOBAL];
        return reg && typeof reg.listPacks === "function" ? reg : null;
    }

    const fold = (s) => String(s === null || s === undefined ? "" : s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

    /** Names a person might type, derived only from fields the registry already holds. */
    function deriveSearchNames(identity) {
        const raw = [identity.name, ...String(identity.name).split("/"), identity.nativeName, identity.languageId, identity.iso];
        const seen = new Set();
        const out = [];
        for (const item of raw) {
            if (typeof item !== "string") continue;
            const text = item.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
            const key = fold(text);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            out.push(text);
        }
        return out;
    }

    function toDescriptor(pack) {
        const identity = pack && pack.identity;
        if (!identity || typeof identity.languageId !== "string" || !identity.languageId || typeof identity.name !== "string" || !identity.name) return null;
        return Object.freeze({
            id: identity.languageId,
            name: identity.name,
            nativeName: typeof identity.nativeName === "string" && identity.nativeName ? identity.nativeName : identity.name,
            bcp47: typeof identity.iso === "string" && identity.iso ? identity.iso : null,
            searchNames: Object.freeze(deriveSearchNames(identity)),
            origin: pack.origin === "OPTIONAL" ? "OPTIONAL" : "DEFAULT",
            source: REGISTRY_GLOBAL
        });
    }

    /** Reads the live registry every call (optional packs can be added at runtime). Malformed entries are skipped, never repaired. */
    function readDescriptors(registry) {
        let packs;
        try { packs = registry.listPacks(); } catch (_err) { return null; }
        if (!Array.isArray(packs)) return null;
        return packs.map(toDescriptor).filter(Boolean);
    }

    /** canonicalizeLanguageId(input) -> string | null. Syntax only: trim + lower-case a bounded token of letters, digits, '-' and '_'. Does not consult the registry. */
    function canonicalizeLanguageId(input) {
        if (typeof input !== "string") return null;
        const id = input.trim().toLowerCase();
        if (!id || id.length > MAX_ID_LENGTH || !/^[a-z0-9][a-z0-9_-]*$/.test(id)) return null;
        return id;
    }

    /** resolveLanguageId(input, {registry?}) -> { ok:true, language } | { ok:false, reason }. IDs only — a name like "Kiswahili" is not an id. */
    function resolveLanguageId(input, options) {
        const id = canonicalizeLanguageId(input);
        if (!id) return { ok: false, reason: REASONS.INVALID_ID };
        const registry = getRegistry(options);
        if (!registry) return { ok: false, reason: REASONS.REGISTRY_UNAVAILABLE };
        const all = readDescriptors(registry);
        if (!all) return { ok: false, reason: REASONS.REGISTRY_UNAVAILABLE };
        const language = all.find((d) => d.id === id);
        return language ? { ok: true, language } : { ok: false, reason: REASONS.UNKNOWN_LANGUAGE_ID };
    }

    function getLanguage(input, options) {
        const r = resolveLanguageId(input, options);
        return r.ok ? r.language : null;
    }

    function isKnownLanguageId(input, options) { return resolveLanguageId(input, options).ok; }

    /** listLanguages({registry?}) -> { ok, languages } in registry order (default packs first, then optional). */
    function listLanguages(options) {
        const registry = getRegistry(options);
        const all = registry ? readDescriptors(registry) : null;
        return all ? { ok: true, languages: all } : { ok: false, reason: REASONS.REGISTRY_UNAVAILABLE, languages: [] };
    }

    /**
     * searchLanguages(query, {registry?}) -> { ok, languages }
     * Accent- and case-insensitive over the derived search names
     * ("gikuyu" finds Kikuyu / Gĩkũyũ). Ranking: exact, then prefix,
     * then substring; ties keep registry order. Blank query -> all.
     */
    function searchLanguages(query, options) {
        const listed = listLanguages(options);
        if (!listed.ok) return listed;
        const q = fold(query);
        if (!q) return listed;
        const scored = [];
        listed.languages.forEach((lang, index) => {
            let best = 9;
            for (const n of lang.searchNames) {
                const f = fold(n);
                if (f === q) { best = Math.min(best, 0); }
                else if (f.startsWith(q)) { best = Math.min(best, 1); }
                else if (f.includes(q)) { best = Math.min(best, 2); }
            }
            if (best < 9) scored.push({ lang, best, index });
        });
        scored.sort((a, b) => a.best - b.best || a.index - b.index);
        return { ok: true, languages: scored.map((s) => s.lang) };
    }

    /** emptyLanguageProfile() -> a fresh { motherLanguages: [], languagesKnown: [] } (never a shared object). */
    function emptyLanguageProfile() {
        return { motherLanguages: [], languagesKnown: [] };
    }

    /** describeContract() — the contract in machine-readable form (used by tests and the handoff). */
    function describeContract() {
        return Object.freeze({
            version: VERSION,
            registry: `window.CozyOS.${REGISTRY_GLOBAL}`,
            profileFields: PROFILE_LANGUAGE_FIELDS,
            storedValue: "canonical registry language id (lower-case string) — nothing else",
            derivedAtReadTime: Object.freeze(["name", "nativeName", "bcp47", "searchNames", "origin"]),
            bcp47Note: "registry `iso` value, or null where the registry has none; never inferred",
            aliasNote: "no registry alias field exists; searchNames are derived, never stored"
        });
    }

    const api = {
        getVersion() { return VERSION; },
        PROFILE_LANGUAGE_FIELDS,
        REASONS,
        MAX_ID_LENGTH,
        canonicalizeLanguageId,
        resolveLanguageId,
        getLanguage,
        isKnownLanguageId,
        listLanguages,
        searchLanguages,
        emptyLanguageProfile,
        describeContract
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root && root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        if (!root.window.CozyOS.Modules["dashboard-profile-language-contract"]) {
            root.window.CozyOS.DashboardProfileLanguageContract = api;
            root.window.CozyOS.Modules["dashboard-profile-language-contract"] = Object.freeze({
                version: VERSION,
                description: "Profile Phase 2A-1 — read-only contract between a user profile and the existing CozyOS language registry (CozyLanguagePacks): canonical ids stored, display metadata always resolved from the registry. Owns no language data."
            });
        }
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
