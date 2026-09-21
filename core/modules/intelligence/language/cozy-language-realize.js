/**
 * core/modules/intelligence/language/cozy-language-realize.js
 * PHASE 4 — Universal Language Capability: the language-REALIZATION seam.
 *
 * WHAT THIS FILE IS
 *   The ONE generic function every "which language do I say this text
 *   in" call site should use, replacing the repository's own
 *   independently-repeated `language === "sw" ? <Swahili> : <English>`
 *   pattern (found at ~24 sites across ~10 files during the Phase 4
 *   audit). This file adds NO new AI, NO new registry, NO new template
 *   store, NO new language database — it is a thin composition over two
 *   real, already-existing, already-tested modules:
 *
 *     - window.CozyOS.CozyLanguageTemplates.getTemplate(key, lang)
 *       (RP-027) — the real, frozen, per-language string/sentence-frame
 *       table. Its own `entry[lang] || entry.en` behavior is already the
 *       correct honest-fallback discipline; this file does not
 *       reimplement it, only calls it.
 *     - window.CozyOS.CozyLanguageRegistry (RP-027) — read-only, to know
 *       whether a language is genuinely AVAILABLE before treating a
 *       result as "real" rather than a fallback.
 *
 * WHY A NEW FILE INSTEAD OF EDITING cozy-language-templates.js DIRECTLY
 *   getTemplate() already does the right per-string lookup; what was
 *   missing was ONE shared place for callers to (a) invoke a
 *   function-valued template entry with real parameters (existing
 *   entries are sometimes plain strings, sometimes
 *   `(param1, param2) => "..."` sentence frames — every call site
 *   previously had to know which), and (b) degrade honestly to `null`
 *   (never a fabricated string) when the templates module isn't loaded
 *   at all, so a caller can fall back to its own prior behavior without
 *   this file ever guessing.
 *
 * PROPAGATION PROPERTY THIS FILE EXISTS TO CREATE
 *   Once a caller uses `realize(key, language, ...params)` instead of
 *   its own hardcoded ternary, that caller's output automatically
 *   improves the moment real template content for a NEW language is
 *   added to CozyLanguageTemplates's TEMPLATES table — no code change
 *   at the call site, ever again, for that key.
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }
    function templates() {
        const c = cozyOS();
        return c && c.CozyLanguageTemplates ? c.CozyLanguageTemplates : null;
    }
    function registry() {
        const c = cozyOS();
        return c && c.CozyLanguageRegistry ? c.CozyLanguageRegistry : null;
    }

    /**
     * realize(key, language, ...params)
     *   Returns the real, committed template string for `key` in
     *   `language` (or CozyLanguageTemplates's own honest English
     *   fallback when that specific language entry doesn't exist yet),
     *   or `null` when the templates module isn't loaded at all, or the
     *   key itself has no entry anywhere - NEVER a fabricated string.
     *   Callers that need byte-identical behavior when this returns
     *   null keep their own prior hardcoded text as their own fallback
     *   (see cozy-teach-flow.js/cozy-living-assistant.js/cozy-learn.js's
     *   own comments at each real call site) - this file never
     *   pretends a missing template is a real one.
     */
    function realize(key, language, ...params) {
        const t = templates();
        if (!t || typeof t.getTemplate !== "function") return null;
        const lang = typeof language === "string" && language.trim() ? language.trim().toLowerCase() : "en";
        const entry = t.getTemplate(key, lang);
        if (entry === null || entry === undefined) return null;
        if (typeof entry === "function") {
            try { return entry(...params); } catch (_err) { return null; }
        }
        return entry;
    }

    /**
     * isRealizedInLanguage(key, language)
     *   Honest disclosure helper: true only when a REAL, committed
     *   entry exists for this exact language (not merely the English
     *   fallback) - lets a caller disclose "answered in your language"
     *   vs. "answered in English because your language isn't ready yet"
     *   without duplicating CozyLanguageTemplates's own lookup logic.
     */
    function isRealizedInLanguage(key, language) {
        const t = templates();
        if (!t || !t.TEMPLATES) return false;
        const entry = t.TEMPLATES[key];
        if (!entry) return false;
        const lang = typeof language === "string" ? language.trim().toLowerCase() : "";
        return entry[lang] !== undefined && entry[lang] !== null && entry[lang] !== "";
    }

    /**
     * isLanguageAvailable(language)
     *   Composes CozyLanguageRegistry.isAvailable() read-only - never a
     *   second availability concept.
     */
    function isLanguageAvailable(language) {
        const r = registry();
        return !!(r && typeof r.isAvailable === "function" && r.isAvailable(language));
    }

    const api = Object.freeze({ realize, isRealizedInLanguage, isLanguageAvailable });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyLanguageRealize = api;
        root.window.CozyOS.Modules["cozy-language-realize"] = Object.freeze({
            version: "1.0.0",
            description: "PHASE 4 — Universal Language Capability: the generic language-realization seam. Composes the real, existing CozyLanguageTemplates.getTemplate()/CozyLanguageRegistry — no new registry, no new template store, no new AI. Replaces the repository's own repeated language===\"sw\" ternary pattern with one call site callers can reuse; a call site that stops hardcoding automatically gains any future language the moment real template content exists for it."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
