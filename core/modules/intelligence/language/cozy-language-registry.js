/**
 * CozyOS — Language Registry
 * File Reference: core/modules/intelligence/language/cozy-language-registry.js
 * Repair: RP-027 — CozyOS Conversational Knowledge + Multilingual
 *         Response Expansion
 *
 * OWNERSHIP
 *   New, additive, standalone file. Does not modify
 *   rule-based-conversational-provider.js's own module (that file reads
 *   this registry as a consumer, at call time), core/config.js, or any
 *   other locked file. No prior owner for a language-selection registry
 *   exists anywhere in this repository (confirmed by repository-wide
 *   search for "LanguageRegistry"/"resolveLanguage" before writing this
 *   file) — this is a real new capability, not a duplicate.
 *
 * SCOPE (Rule: never mark a language AVAILABLE without verified
 * templates)
 *   This file is a pure registry/selector. It does NOT itself contain
 *   response text — core/modules/intelligence/language/cozy-language-
 *   templates.js (loaded separately) owns the actual verified template
 *   strings. This file only tracks: which language codes exist, which
 *   state each is in (AVAILABLE / PARTIAL / NOT_READY), and how to
 *   resolve a requested/manual/country-suggested language down to one
 *   that is actually AVAILABLE — so a caller can never accidentally
 *   present an unverified language as if it were fully supported.
 *
 * FIVE DEFAULT LANGUAGES (RP-027 §8) — AVAILABLE only because
 * cozy-language-templates.js actually carries verified templates for
 * every RP-027 intent in all five (re-verified by this repair's own
 * test suite, not assumed from this file alone):
 *   English (en), Kiswahili (sw), French (fr), Arabic (ar), Somali (so)
 *
 * SIX EXTENDED LANGUAGES (RP-027 §9) — registered and selectable, but
 * held at NOT_READY this pass: no verified response templates exist
 * yet for any of them (an honest, disclosed gap — see HANDOFF.md's
 * RP-027 entry — never silently upgraded to AVAILABLE just because the
 * code/name exists here):
 *   Luo (luo), Kikuyu (ki), Kikamba (kam), Zulu (zu), Luganda (lg),
 *   Igbo (ig)
 *
 * COUNTRY/LOCALE SUGGESTION (RP-027 §10) — suggestFromCountry() is
 * advisory only. It never permanently locks the language: manual
 * selection always takes precedence, and resolveLanguage() re-computes
 * fresh on every call rather than caching a session-wide choice.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-language-registry"]) return;

    const VERSION = "1.0.0";

    // State values: "AVAILABLE" (verified templates for every RP-027
    // intent), "PARTIAL" (verified templates for SOME intents only —
    // reserved for future use, unused by any language this pass),
    // "NOT_READY" (registered/selectable, but no verified templates).
    const DEFAULT_LANGUAGES = Object.freeze([
        Object.freeze({ code: "en", name: "English", nativeName: "English", state: "AVAILABLE" }),
        Object.freeze({ code: "sw", name: "Kiswahili", nativeName: "Kiswahili", state: "AVAILABLE" }),
        Object.freeze({ code: "fr", name: "French", nativeName: "Français", state: "AVAILABLE" }),
        Object.freeze({ code: "ar", name: "Arabic", nativeName: "العربية", state: "AVAILABLE" }),
        Object.freeze({ code: "so", name: "Somali", nativeName: "Soomaali", state: "AVAILABLE" })
    ]);

    const EXTENDED_LANGUAGES = Object.freeze([
        Object.freeze({ code: "luo", name: "Luo", nativeName: "Dholuo", state: "NOT_READY" }),
        Object.freeze({ code: "ki", name: "Kikuyu", nativeName: "Gĩkũyũ", state: "NOT_READY" }),
        Object.freeze({ code: "kam", name: "Kikamba", nativeName: "Kikamba", state: "NOT_READY" }),
        Object.freeze({ code: "zu", name: "Zulu", nativeName: "isiZulu", state: "NOT_READY" }),
        Object.freeze({ code: "lg", name: "Luganda", nativeName: "Luganda", state: "NOT_READY" }),
        Object.freeze({ code: "ig", name: "Igbo", nativeName: "Igbo", state: "NOT_READY" })
    ]);

    const ALL_LANGUAGES = Object.freeze(DEFAULT_LANGUAGES.concat(EXTENDED_LANGUAGES));

    // PHASE 4 — Universal Language Capability. Two small, real,
    // additive mutable structures — the first real mutators this file
    // has ever had (its own header previously disclosed none existed:
    // "this file has no mutator ... never calls one"). Neither touches
    // the frozen static tables above.
    //   registeredExtensions: newly REGISTERED languages not among the
    //     11 static entries above (Phase 4's own "register" step).
    //   stateOverrides: real, audited promotions to AVAILABLE for ANY
    //     language (static or newly-registered) — set ONLY by
    //     promoteToAvailable() below, and ONLY after that function
    //     consults the real, existing Rule 82 gate
    //     (window.CozyOS.CozyKnowledgeReview.evaluateRule82Gate,
    //     cozy-knowledge-review.js) and receives promotion:"ELIGIBLE".
    //     This file never marks a language AVAILABLE on its own
    //     judgment — see that function's own comment.
    const registeredExtensions = new Map();
    const stateOverrides = new Map();

    function baseEntry(code) {
        const normalized = String(code || "").trim().toLowerCase();
        return ALL_LANGUAGES.find((l) => l.code === normalized) || registeredExtensions.get(normalized) || null;
    }

    /**
     * registerLanguage({ code, name, nativeName })
     *   PHASE 4 — the "register" step of "register -> validate ->
     *   VERIFIED + AVAILABLE". Real, disclosed, additive: rejects a
     *   code already present among the 11 static entries or already
     *   registered (never silently overwrites an existing language's
     *   identity). Starts at "NOT_READY" — the exact same honest
     *   initial state EXTENDED_LANGUAGES above already uses for a
     *   registered-but-unverified language; only promoteToAvailable()
     *   below can ever change that, and only via the real gate.
     */
    function registerLanguage(entry) {
        const e = entry || {};
        const code = String(e.code || "").trim().toLowerCase();
        if (!code) return { success: false, reason: "A real language code is required." };
        if (baseEntry(code)) return { success: false, reason: `"${code}" is already registered.` };
        const record = Object.freeze({ code, name: e.name || code, nativeName: e.nativeName || e.name || code, state: "NOT_READY" });
        registeredExtensions.set(code, record);
        return { success: true, language: record };
    }

    /**
     * promoteToAvailable(code, attestation)
     *   PHASE 4 — the ONLY function in this file that can ever set a
     *   language's effective state to "AVAILABLE". Composes the real,
     *   existing Rule 82 gate read-only (never re-derives its own
     *   promotion judgment) and records the override ONLY when that
     *   gate itself reports promotion:"ELIGIBLE". `attestation` is the
     *   same caller-supplied, never-inferred object
     *   evaluateRule82Gate() already documents
     *   ({resourcesAttestedBy, runtimeAttestedBy, testEvidence,
     *   requiredKeys}) — this function adds no attestation fields of
     *   its own and performs no verification of its own beyond what
     *   the gate itself already checks.
     */
    function promoteToAvailable(code, attestation) {
        const normalized = String(code || "").trim().toLowerCase();
        const existing = baseEntry(normalized);
        if (!existing) return { success: false, reason: `"${normalized}" is not registered.`, gate: null };
        const c = window.CozyOS && window.CozyOS.CozyKnowledgeReview;
        if (!c || typeof c.evaluateRule82Gate !== "function") {
            return { success: false, reason: "The Rule 82 gate (CozyKnowledgeReview.evaluateRule82Gate) is not loaded — cannot honestly evaluate promotion.", gate: null };
        }
        const gate = c.evaluateRule82Gate(normalized, attestation);
        if (!gate || gate.promotion !== "ELIGIBLE") {
            return { success: false, reason: "NOT_ELIGIBLE — Rule 82 gate did not report ELIGIBLE.", gate };
        }
        stateOverrides.set(normalized, {
            state: "AVAILABLE",
            promotedAt: new Date().toISOString(),
            promotedBy: (attestation && attestation.resourcesAttestedBy) || null,
            gate
        });
        return { success: true, gate };
    }

    // Safest-available fallback order (RP-027 §12 example: "I can
    // answer it in English or Kiswahili"). English first because it is
    // the one language every RP-026 regression test already depends on.
    const FALLBACK_ORDER = Object.freeze(["en", "sw", "fr", "ar", "so"]);

    // Advisory country -> suggested default language map (RP-027 §10).
    // Deliberately small and honest: only countries with a reasonably
    // confident single suggestion among the five default languages are
    // listed. Never treated as authoritative — see resolveLanguage().
    const LOCALE_SUGGESTIONS = Object.freeze({
        KE: "sw", TZ: "sw", UG: "sw", RW: "sw", BI: "sw", CD: "sw",
        FR: "fr", SN: "fr", CI: "fr", ML: "fr", BF: "fr", NE: "fr", TG: "fr", BJ: "fr", GA: "fr", CM: "fr",
        SO: "so", DJ: "so",
        SA: "ar", EG: "ar", AE: "ar", QA: "ar", KW: "ar", SD: "ar", MA: "ar", DZ: "ar", TN: "ar", LY: "ar", IQ: "ar", JO: "ar", LB: "ar", YE: "ar", OM: "ar", BH: "ar",
        US: "en", GB: "en", NG: "en", ZA: "en"
    });

    /**
     * getLanguage(code) — PHASE 4: now also resolves a newly
     * registerLanguage()'d code (not only the 11 static entries), and
     * applies a real promoteToAvailable() override's state on top when
     * one exists. A language never previously registered or promoted
     * behaves byte-identically to before this phase.
     */
    function getLanguage(code) {
        if (!code) return null;
        const normalized = String(code).trim().toLowerCase();
        const base = baseEntry(normalized);
        if (!base) return null;
        const override = stateOverrides.get(normalized);
        return override ? Object.assign({}, base, { state: override.state, promotedAt: override.promotedAt, promotedBy: override.promotedBy }) : base;
    }

    function listLanguages(options = {}) {
        const includeExtended = options.includeExtended !== false;
        const staticList = includeExtended ? ALL_LANGUAGES : DEFAULT_LANGUAGES;
        const withExtensions = staticList.concat(includeExtended ? Array.from(registeredExtensions.values()) : []);
        return withExtensions.map((l) => getLanguage(l.code) || Object.assign({}, l));
    }

    function isAvailable(code) {
        const lang = getLanguage(code);
        return !!(lang && lang.state === "AVAILABLE");
    }

    /**
     * suggestFromCountry(countryCode)
     *   Real, static, disclosed lookup table — never a live geolocation
     *   call, never a guess dressed up as detection. Returns null for
     *   any country not in the table (honest "no suggestion" rather
     *   than a fabricated default).
     */
    function suggestFromCountry(countryCode) {
        if (!countryCode) return null;
        return LOCALE_SUGGESTIONS[String(countryCode).trim().toUpperCase()] || null;
    }

    /**
     * resolveLanguage({requested, manual, country})
     *   Precedence, per RP-027 §10: manual explicit selection > a
     *   directly requested code > country/locale suggestion > "en".
     *   Country NEVER permanently locks the language — it is only
     *   consulted when neither manual nor requested is supplied, and
     *   every call re-resolves fresh (no session-wide cached lock
     *   lives in this registry).
     *
     *   Returns:
     *     { code, preferred, fallback, reason }
     *   where `code` is always an AVAILABLE language (safe to hand to
     *   the template layer), `preferred` is what was actually asked
     *   for (possibly not yet AVAILABLE), and `fallback` is true when
     *   `code !== preferred` — the caller (composeReply) uses this to
     *   honestly disclose the fallback per RP-027 §12, never silently.
     */
    function resolveLanguage(options = {}) {
        const manual = options.manual ? String(options.manual).trim().toLowerCase() : null;
        const requested = options.requested ? String(options.requested).trim().toLowerCase() : null;
        const country = options.country || null;

        const preferred = manual || requested || suggestFromCountry(country) || "en";

        if (isAvailable(preferred)) {
            return { code: preferred, preferred, fallback: false, reason: null };
        }

        const knownButNotReady = !!getLanguage(preferred);
        for (const code of FALLBACK_ORDER) {
            if (isAvailable(code)) {
                return {
                    code,
                    preferred,
                    fallback: true,
                    reason: knownButNotReady
                        ? `"${preferred}" is registered but not yet AVAILABLE (no verified templates yet).`
                        : `"${preferred}" is not a recognized CozyOS language code.`
                };
            }
        }
        // Structurally unreachable (English is always AVAILABLE above),
        // kept only as an honest last-resort rather than throwing.
        return { code: "en", preferred, fallback: true, reason: "No AVAILABLE language could be resolved; defaulted to English." };
    }

    window.CozyOS.CozyLanguageRegistry = Object.freeze({
        getVersion() { return VERSION; },
        DEFAULT_LANGUAGES,
        EXTENDED_LANGUAGES,
        ALL_LANGUAGES,
        getLanguage,
        listLanguages,
        isAvailable,
        suggestFromCountry,
        resolveLanguage,
        registerLanguage,
        promoteToAvailable
    });

    window.CozyOS.Modules["cozy-language-registry"] = Object.freeze({
        version: VERSION,
        description: "RP-027 — Language registry. 5 default languages (en/sw/fr/ar/so) registered AVAILABLE; 6 extended languages (luo/ki/kam/zu/lg/ig) registered and selectable but held at NOT_READY (no verified templates this pass — an honest, disclosed limitation, not a bug). resolveLanguage() implements manual > requested > country-suggestion > English precedence, always returns an AVAILABLE code, and reports fallback:true/reason whenever the resolved code differs from what was actually requested, so callers disclose the fallback (RP-027 §12) rather than silently substituting language."
    });
})();
