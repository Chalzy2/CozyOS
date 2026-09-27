/**
 * core/living/cozy-teach-word-intent.js
 * PHASE 5 — Continuous Learning & Knowledge Growth: word/phrase-meaning
 * teaching-claim classification.
 *
 * WHAT THIS FILE IS
 *   A real, narrow, disclosed classifier — the SAME "small disclosed
 *   marker table, not a fabricated NLP model" discipline as this
 *   directory's own cozy-teach-intent.js — that recognizes when a
 *   CLAIM already identified as teaching intent (by CozyTeachIntent,
 *   unchanged) is specifically teaching the MEANING of a word/phrase
 *   ("mahudhurio means attendance", "kwa jamii yangu, neno hili lina
 *   maana ya X") rather than a flat fact about a known application
 *   (CozyTeachFlow's pre-existing TAUGHT_FACT path, unchanged). This is
 *   a SECOND, separate classification stage layered on cozy-teach-
 *   intent.js's own output — it does not replace, duplicate, or
 *   re-implement teaching-intent detection itself.
 *
 * WHY EXPLICIT-MARKER ONLY
 *   No general "is this claim defining a word" classifier exists
 *   honestly anywhere in this repository. A small, disclosed EN/SW
 *   marker list — the same "means"/"maana ya" vocabulary a real teacher
 *   naturally uses — is the honest, non-fabricated alternative. A claim
 *   with no such marker is correctly NOT detected as word-meaning
 *   teaching; cozy-teach-flow.js's existing TAUGHT_FACT path handles it
 *   exactly as before this file existed.
 *
 * MATCHING DISCIPLINE
 *   Word/phrase-boundary matching, never a bare substring. Ordered so a
 *   longer, more specific marker is tried before a shorter one it could
 *   be a substring of (same convention as cozy-teach-intent.js).
 */
(function (root) {
    "use strict";

    // Ordered longest/most-specific first. "in my community, this word
    // means X" (with no named term at all — "this word" is a deictic
    // reference this file honestly cannot resolve to an actual term
    // without conversation context) is deliberately NOT a pattern here
    // — under-detecting a genuinely ambiguous case rather than
    // fabricating which word is meant.
    const PATTERNS_EN = [
        /^in my community,?\s+["']?([\w'-]+)["']?\s+means\s+(.+)$/i,
        /^the word\s+["']?([\w'-]+)["']?\s+means\s+(.+)$/i,
        /^["']?([\w'-]+(?:[\s-][\w'-]+){0,3})["']?\s+means\s+(.+)$/i,
        /^["']?([\w'-]+(?:[\s-][\w'-]+){0,3})["']?\s+refers to\s+(.+)$/i,
    ];
    const PATTERNS_SW = [
        /^kwa jamii yangu,?\s+neno\s+["']?([\w'-]+)["']?\s+lina maana ya\s+(.+)$/i,
        /^kwa jamii yangu,?\s+["']?([\w'-]+)["']?\s+ina maana ya\s+(.+)$/i,
        /^["']?([\w'-]+(?:[\s-][\w'-]+){0,3})["']?\s+maana yake ni\s+(.+)$/i,
        /^["']?([\w'-]+(?:[\s-][\w'-]+){0,3})["']?\s+ina maana ya\s+(.+)$/i,
        /^["']?([\w'-]+(?:[\s-][\w'-]+){0,3})["']?\s+ina maana\s+(.+)$/i,
    ];

    function tryPatterns(text, patterns) {
        for (const re of patterns) {
            const m = text.match(re);
            if (m && m[1] && m[2]) {
                return { term: m[1].trim(), meaning: m[2].trim() };
            }
        }
        return null;
    }

    /**
     * detectWordMeaningClaim(claim, language)
     *   `claim` is the raw claim text already extracted by
     *   CozyTeachIntent.detectTeachingIntent() (the text AFTER the
     *   "teach you that"/"kumbuka kwamba" marker) — never the whole
     *   original message. Returns { isWordMeaning: false } (honest
     *   default) or { isWordMeaning: true, term, meaning, language }.
     *   Both language's pattern lists are always tried (same bilingual-
     *   fallback discipline as CozyTeachIntent — a resolved `language`
     *   is a per-turn best-effort signal, not a hard guarantee), the
     *   resolved language's own list first.
     */
    function detectWordMeaningClaim(claim, language) {
        const raw = typeof claim === "string" ? claim.trim() : "";
        if (!raw) return { isWordMeaning: false };
        const primary = language === "sw" ? PATTERNS_SW : PATTERNS_EN;
        const secondary = language === "sw" ? PATTERNS_EN : PATTERNS_SW;

        let found = tryPatterns(raw, primary);
        let matchedLanguage = language === "sw" ? "sw" : "en";
        if (!found) {
            found = tryPatterns(raw, secondary);
            matchedLanguage = matchedLanguage === "sw" ? "en" : "sw";
        }
        if (!found || !found.term || !found.meaning) return { isWordMeaning: false };

        return {
            isWordMeaning: true,
            term: found.term,
            meaning: found.meaning,
            language: matchedLanguage
        };
    }

    const api = Object.freeze({ detectWordMeaningClaim });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyTeachWordIntent = api;
        root.window.CozyOS.Modules["cozy-teach-word-intent"] = Object.freeze({
            version: "1.0.0",
            description: "PHASE 5 — Continuous Learning & Knowledge Growth: explicit word/phrase-meaning teaching-claim classification (EN+SW, word-boundary-safe), layered on CozyTeachIntent's own claim extraction. Pure, stateless, no side effects. Only recognizes a small, disclosed list of explicit 'X means Y' / 'X maana yake ni Y' phrasings — never a general definition classifier."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
