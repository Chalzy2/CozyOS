/**
 * CozyOS — Language Directive Parser
 * File Reference: core/modules/intelligence/language/cozy-language-directive.js
 *
 * NEXT SMALL DEPENDENCY (continuing from M397) — recognizes an explicit
 * in-text language request such as "...in Kiswahili" / "...kwa Kiswahili"
 * and resolves the captured name down to a real registered language
 * code, purely by reading window.CozyOS.CozyLanguageRegistry.
 *
 * SCOPE — deliberately minimal:
 *   - Parsing only. Does NOT translate anything, does NOT speak
 *     anything, does NOT change how any existing intent composes its
 *     answer, and is not wired into cozyos-identity-faq-router.js or
 *     rule-based-conversational-provider.js yet — that wiring, and the
 *     translation/speech steps that would make it useful, are
 *     separate, later, protected increments.
 *   - No second language table. This file defines zero language
 *     names/codes of its own. Every name it can recognize
 *     ("Kiswahili", "French", "Français", "Zulu", "isiZulu", ...)
 *     comes from CozyLanguageRegistry.listLanguages() at call time —
 *     the exact same single source rule-based-conversational-
 *     provider.js's own (unrelated, unexported) TARGET_LANGUAGE_NAMES
 *     table and cozy-language-registry.js's DEFAULT_LANGUAGES/
 *     EXTENDED_LANGUAGES already are for everyone else. If a language
 *     is later renamed or added in the registry, this file needs no
 *     change.
 *   - An unrecognized name (e.g. "in Klingon") is reported honestly as
 *     not found — never guessed, never silently defaulted to English
 *     here (that disclosure decision belongs to whichever future
 *     caller actually acts on this result, e.g. via
 *     CozyLanguageRegistry.resolveLanguage()).
 *
 * CONSUMER CONTRACT
 *   window.CozyOS.CozyLanguageDirective.extractLanguageDirective(text)
 *   -> {
 *        hasDirective: boolean,   // true iff an "in X" / "kwa X" tail was found
 *        requestedPhrase: string|null,  // the raw captured phrase, lowercased
 *        code: string|null,       // matched CozyLanguageRegistry code, or null
 *        language: object|null    // the matched registry entry (copy), or null
 *      }
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-language-directive"]) return;

    const VERSION = "1.0.0";

    // English "in X" / Kiswahili "kwa X" trailing directive, 1-2 words,
    // optionally followed by end punctuation. Deliberately narrow: it
    // only looks at the END of the utterance, so it won't misfire on
    // unrelated mid-sentence uses of "in"/"kwa".
    const DIRECTIVE_RE = /\b(?:in|kwa)\s+([\p{L}][\p{L}'-]*(?:\s+[\p{L}][\p{L}'-]*)?)\s*[?.!]*\s*$/u;

    function _fold(s) {
        return String(s || "")
            .toLowerCase()
            .normalize("NFKD").replace(/[\u0300-\u036f]/g, "") // strip accents/diacritics
            .trim();
    }

    /**
     * _findRegisteredLanguage(phrase)
     *   Matches the captured phrase against CozyLanguageRegistry's own
     *   name/nativeName/code fields — nothing hardcoded here.
     */
    function _findRegisteredLanguage(phrase) {
        const registry = window.CozyOS && window.CozyOS.CozyLanguageRegistry;
        if (!registry || typeof registry.listLanguages !== "function") return null;
        const folded = _fold(phrase);
        if (!folded) return null;
        const all = registry.listLanguages({ includeExtended: true });
        for (const lang of all) {
            if (_fold(lang.name) === folded) return lang;
            if (_fold(lang.nativeName) === folded) return lang;
            if (_fold(lang.code) === folded) return lang;
        }
        return null;
    }

    function extractLanguageDirective(text) {
        const match = DIRECTIVE_RE.exec(String(text || ""));
        if (!match) {
            return { hasDirective: false, requestedPhrase: null, code: null, language: null };
        }
        const requestedPhrase = _fold(match[1]);
        const language = _findRegisteredLanguage(requestedPhrase);
        return {
            hasDirective: true,
            requestedPhrase,
            code: language ? language.code : null,
            language: language ? Object.assign({}, language) : null
        };
    }

    window.CozyOS.CozyLanguageDirective = Object.freeze({
        getVersion() { return VERSION; },
        extractLanguageDirective
    });

    window.CozyOS.Modules["cozy-language-directive"] = Object.freeze({
        version: VERSION,
        description: "Parses an explicit trailing '...in <language>' / '...kwa <language>' directive out of free text and resolves it to a registered CozyLanguageRegistry code by matching name/nativeName/code — no language names/codes of its own, no translation, no speech, not yet wired into any conversational routing."
    });
})();
