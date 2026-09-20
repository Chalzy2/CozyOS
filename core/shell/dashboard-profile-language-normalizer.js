/**
 * CozyOS — Dashboard Profile Language Normalizer
 * File Reference: core/shell/dashboard-profile-language-normalizer.js
 * Milestone: Profile Phase 2A-2 — Profile Schema & Normalization
 *
 * CLASSIFICATION: COMPOSED, new, pure logic. No DOM, no storage, no
 * network, no UI. It owns no language data and does no id checking of
 * its own: every id is judged by the 2A-1 contract
 * (core/shell/dashboard-profile-language-contract.js), which reads the
 * one existing authority, window.CozyOS.CozyLanguagePacks. The 2A-1
 * contract file is unchanged by this phase.
 *
 * THE GUARANTEES (what a successful result means)
 *   1. canonical ids only        — every id is the registry's own id
 *   2. valid registry ids only   — nothing unresolved passes through
 *   3. no duplicates             — first occurrence wins
 *   4. empty values dropped, invalid values REJECTED AND REPORTED
 *   5. motherLanguages ⊆ languagesKnown
 *   Never a silent drop: any value that is not empty and not a valid
 *   id appears in `rejected` and makes `ok` false.
 *
 * PIPELINE (per field, then across fields)
 *   input -> array-normalize -> drop empty values -> canonicalize ->
 *   validate against registry -> dedupe -> [both fields done] ->
 *   add every mother language missing from languagesKnown ->
 *   { motherLanguages, languagesKnown }
 *
 * RESULT SHAPE (both functions)
 *   { ok, profile, rejected, partial, reason? }
 *   ok        true only when nothing was rejected and the registry (when
 *             it was needed) was available.
 *   profile   the normalized value — or NULL whenever ok is false
 *             (fail closed: a caller that ignores `ok` cannot persist a
 *             half-validated profile by accident).
 *   rejected  [{ field, index, value, reason }] — reason is the
 *             contract's INVALID_ID / UNKNOWN_LANGUAGE_ID, or
 *             INVALID_FIELD_TYPE / TOO_MANY_VALUES. `value` is a bounded
 *             string description, never a live reference.
 *   partial   when values were rejected: the valid remainder, already
 *             normalized, so a UI can show what was understood. Never to
 *             be persisted. null in every other case.
 *   reason    REJECTED_VALUES | REGISTRY_UNAVAILABLE | CONTRACT_UNAVAILABLE | INVALID_INPUT
 *
 * ORDERING IS STABLE AND INPUT-DRIVEN (never registry order, never sorted)
 *   motherLanguages: first-occurrence order of the input.
 *   languagesKnown:  first-occurrence order of the input's known list,
 *                    then any mother language it lacked, in mother
 *                    order. normalize(normalize(x)) equals normalize(x).
 *
 * INPUT RULES
 *   missing / null field -> []. A single string is one value ("sw" ->
 *   ["sw"]); it is never split on commas (that would be guessing).
 *   Any other non-array field type is rejected (INVALID_FIELD_TYPE). A
 *   whole profile of null/undefined is an old profile with no language
 *   fields -> two empty lists. A profile that is not an object is
 *   INVALID_INPUT. More than MAX_INPUT_VALUES values in one field is
 *   rejected before any work is done (a defensive bound).
 *
 * FAILS CLOSED: if there is at least one non-empty value to validate
 * and the registry is unavailable, the result is REGISTRY_UNAVAILABLE
 * with no profile. With nothing to validate (old profile / empty
 * lists) there is nothing the registry could contradict, so the empty
 * result is returned as-is — this is deliberate: a page that has not
 * loaded the registry yet can still read a profile that has no
 * languages, and no id is ever passed through unvalidated.
 *
 * WHAT THIS DOES NOT DO: no UI, no persistence (IdentityEngine's
 * updateProfile() whitelist is unchanged and never called here), no
 * languagePreference access (that interface-language setting is never
 * read, derived or altered — withNormalizedLanguages() copies it through
 * verbatim), no aliases, no BCP-47 values (output holds ids only), no
 * Luganda/Speech-id reconciliation, no Live Window / Teach CozyAI /
 * CozyLearn / TTS / STT involvement.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";
    const MAX_INPUT_VALUES = 256;
    const MAX_DESCRIBED_LENGTH = 64;
    const FIELDS = Object.freeze(["motherLanguages", "languagesKnown"]);

    const REASONS = Object.freeze({
        REJECTED_VALUES: "REJECTED_VALUES",
        REGISTRY_UNAVAILABLE: "REGISTRY_UNAVAILABLE",
        CONTRACT_UNAVAILABLE: "CONTRACT_UNAVAILABLE",
        INVALID_INPUT: "INVALID_INPUT",
        INVALID_FIELD_TYPE: "INVALID_FIELD_TYPE",
        TOO_MANY_VALUES: "TOO_MANY_VALUES"
    });

    function findContract(options) {
        if (options && options.contract) return options.contract;
        if (typeof window !== "undefined" && window && window.CozyOS && window.CozyOS.DashboardProfileLanguageContract) return window.CozyOS.DashboardProfileLanguageContract;
        if (root && root.window && root.window.CozyOS && root.window.CozyOS.DashboardProfileLanguageContract) return root.window.CozyOS.DashboardProfileLanguageContract;
        return null;
    }

    const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

    /** Empty means "nothing was entered": null, undefined, or a blank string. Anything else is a value to be judged. */
    const isEmptyValue = (v) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

    /** A bounded, string-only description so `rejected` never hands back a live object reference. */
    function describe(v) {
        let text;
        if (typeof v === "string") text = v;
        else if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") text = String(v);
        else if (typeof v === "symbol") text = "[symbol]";
        else text = Array.isArray(v) ? "[array]" : "[" + typeof v + "]";
        return text.length > MAX_DESCRIBED_LENGTH ? text.slice(0, MAX_DESCRIBED_LENGTH) + "…" : text;
    }

    function failed(reason, extra) {
        return Object.assign({ ok: false, profile: null, rejected: [], partial: null, reason }, extra || {});
    }

    /**
     * normalizeLanguageProfile(input, { registry?, contract? })
     *   input: any profile-like object; only motherLanguages and
     *   languagesKnown are read. Returns the result shape documented above.
     */
    function normalizeLanguageProfile(input, options) {
        const contract = findContract(options);
        if (!contract || typeof contract.canonicalizeLanguageId !== "function" || typeof contract.listLanguages !== "function") {
            return failed(REASONS.CONTRACT_UNAVAILABLE);
        }
        if (input !== null && input !== undefined && !isPlainObject(input)) return failed(REASONS.INVALID_INPUT);
        const source = input || {};

        const rejected = [];
        let index = null; // id -> registry language; built lazily, only if there is something to validate
        let unavailable = false;

        function getIndex() {
            if (index) return index;
            const listed = contract.listLanguages(options && options.registry ? { registry: options.registry } : undefined);
            if (!listed || listed.ok !== true || !Array.isArray(listed.languages)) { unavailable = true; return null; }
            index = new Map(listed.languages.map((l) => [l.id, l]));
            return index;
        }

        function collect(field) {
            const raw = source[field];
            let values;
            if (raw === null || raw === undefined) values = [];
            else if (Array.isArray(raw)) values = raw;
            else if (typeof raw === "string") values = [raw];
            else { rejected.push({ field, index: null, value: describe(raw), reason: REASONS.INVALID_FIELD_TYPE }); return []; }
            if (values.length > MAX_INPUT_VALUES) { rejected.push({ field, index: null, value: `${values.length} values`, reason: REASONS.TOO_MANY_VALUES }); return []; }

            const ids = [];
            const seen = new Set();
            for (let i = 0; i < values.length; i++) {
                const item = values[i];
                if (isEmptyValue(item)) continue;
                const canonical = contract.canonicalizeLanguageId(item);
                if (canonical === null) { rejected.push({ field, index: i, value: describe(item), reason: "INVALID_ID" }); continue; }
                const idx = getIndex();
                if (!idx) return ids; // registry unavailable -> the whole call fails closed below
                const language = idx.get(canonical);
                if (!language) { rejected.push({ field, index: i, value: describe(item), reason: "UNKNOWN_LANGUAGE_ID" }); continue; }
                if (!seen.has(language.id)) { seen.add(language.id); ids.push(language.id); }
            }
            return ids;
        }

        const mother = collect("motherLanguages");
        if (unavailable) return failed(REASONS.REGISTRY_UNAVAILABLE);
        const known = collect("languagesKnown");
        if (unavailable) return failed(REASONS.REGISTRY_UNAVAILABLE);

        const knownSet = new Set(known);
        for (const id of mother) { if (!knownSet.has(id)) { knownSet.add(id); known.push(id); } }
        const normalized = { motherLanguages: mother, languagesKnown: known };

        if (rejected.length) return { ok: false, profile: null, rejected, partial: normalized, reason: REASONS.REJECTED_VALUES };
        return { ok: true, profile: normalized, rejected: [], partial: null };
    }

    /**
     * withNormalizedLanguages(profile, options)
     *   Same guarantees, but returns the WHOLE profile: a shallow copy of
     *   the input with only motherLanguages/languagesKnown replaced.
     *   Every other field — languagePreference included — is copied
     *   through untouched (never read, validated or derived), and the
     *   input object is never mutated. Own keys are copied with
     *   defineProperty so a hostile "__proto__" key cannot change the
     *   copy's prototype.
     */
    function withNormalizedLanguages(profile, options) {
        const result = normalizeLanguageProfile(profile, options);
        const wrap = (languages) => {
            if (!languages) return null;
            const out = {};
            for (const key of Object.keys(profile || {})) {
                if (key === FIELDS[0] || key === FIELDS[1]) continue;
                Object.defineProperty(out, key, { value: profile[key], enumerable: true, writable: true, configurable: true });
            }
            out.motherLanguages = languages.motherLanguages;
            out.languagesKnown = languages.languagesKnown;
            return out;
        };
        return Object.assign({}, result, { profile: wrap(result.profile), partial: wrap(result.partial) });
    }

    const api = {
        getVersion() { return VERSION; },
        FIELDS,
        REASONS,
        MAX_INPUT_VALUES,
        normalizeLanguageProfile,
        withNormalizedLanguages
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root && root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        if (!root.window.CozyOS.Modules["dashboard-profile-language-normalizer"]) {
            root.window.CozyOS.DashboardProfileLanguageNormalizer = api;
            root.window.CozyOS.Modules["dashboard-profile-language-normalizer"] = Object.freeze({
                version: VERSION,
                description: "Profile Phase 2A-2 — pure normalizer for a profile's motherLanguages/languagesKnown: canonical registry ids only, duplicates removed, invalid values rejected and reported, motherLanguages ⊆ languagesKnown, fails closed when the language registry is unavailable. Consumes the 2A-1 contract; owns no language data; no UI, no persistence."
            });
        }
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
