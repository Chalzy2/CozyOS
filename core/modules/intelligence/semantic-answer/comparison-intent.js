/**
 * CozyOS — Comparison Intent (shared)
 * File Reference: core/modules/intelligence/semantic-answer/comparison-intent.js
 * Part of: UNIVERSAL LANGUAGE SEAM — Semantic Generalization Gap Fix
 * (GAP 1 — Comparison Intent).
 *
 * WHAT THIS IS
 *   The ONE, shared, two-entity comparison-intent detector every real
 *   answer path composes — never a second comparison implementation per
 *   caller. Detects the MEANING "the user wants X and Y compared,"
 *   extracts the two application-name candidates, and leaves everything
 *   else (whether those names are real registered applications, and the
 *   actual comparison content) to the SAME real, existing, unmodified
 *   `CozyKnowledge.compareApplicationsFact(keyA, keyB, lang)` — this file
 *   adds no knowledge, no ranking, no new authority.
 *
 * WHY THIS FILE EXISTS (root cause, not a guess)
 *   Before this file, exactly ONE real comparison detector existed —
 *   inline inside rule-based-conversational-provider.js's own
 *   "app-comparison" intent pattern/case (§680-1590 there), reachable
 *   ONLY through that file's own composeReply()/think() path. Real,
 *   live-traced defect (NOVEL-KISWAHILI-SEMANTIC-CONSTRUCTION-TEST-
 *   REPORT.md §4): CozyAnswerEngine.answer() — the path cozy-living-
 *   assistant.js's #send() actually tries FIRST for every real Live
 *   Window turn — has its OWN, separate, single-entity
 *   `getContext()`/`application-knowledge` fallback that returns a
 *   VERIFIED (but wrong-question) answer about only the FIRST named
 *   application before rule-based-conversational-provider.js's own
 *   comparison detector is ever reached (that provider's reply is only
 *   consulted as a fallback when CozyAnswerEngine's own answer isn't
 *   usable — see cozy-living-assistant.js's own #send() comment). So the
 *   already-built, already-tested comparison mechanism was real but
 *   effectively unreachable from the one path real users actually go
 *   through. The fix extracted the ORIGINAL, narrower pattern into this
 *   ONE shared module (both files now compose it — no duplicated regex
 *   text) and broadened it to a genuine MEANING family, then wired
 *   CozyAnswerEngine.answer() to check it EARLY, before the single-
 *   entity application-knowledge path can short-circuit with the wrong
 *   answer.
 *
 * BROADENING, NOT HARDCODING
 *   Every pattern below matches a real, closed KISWAHILI/ENGLISH
 *   grammatical family ("kati ya X na Y" / "between X and Y" / "X
 *   inatofautianaje na Y" / "how are X and Y different" / "X vs Y" /
 *   etc.) — never one specific test sentence. A caller mentioning two
 *   real application names inside any of these real comparison framings
 *   is recognized; a completely different, never-anticipated comparison
 *   phrasing this list doesn't cover is honestly NOT recognized (returns
 *   null) — same "closed, disclosed vocabulary, never invented per-
 *   sentence" discipline this repository's own SemanticIntentEngine
 *   documents for every other intent.
 *
 * NEVER A RANKING/WINNER
 *   This file only detects intent + extracts two name candidates. The
 *   actual comparison content comes exclusively from
 *   CozyKnowledge.compareApplicationsFact(), which (read directly before
 *   writing this file) already, explicitly states each application's own
 *   real purpose/capabilities side by side and disclaims "not an
 *   unsupported 'better' claim" — this file adds nothing that could
 *   introduce a ranking bias.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const VERSION = "1.0.0";
    if (window.CozyOS.Modules["comparison-intent"]) return;

    // Real, disclosed, closed pattern family. Each alternative carries
    // its own two capture groups (entity A, entity B); detectComparison()
    // below scans every group pair and returns the first non-empty one,
    // exactly mirroring the existing (pre-this-file) inline pattern's own
    // "first non-empty capture group wins" convention in
    // rule-based-conversational-provider.js.
    const NAME = "[a-z][\\w' -]{1,30}?";
    const PATTERNS = Object.freeze([
        // Kiswahili — "kati ya X na Y" is itself the real comparison
        // signal (literally "between X and Y"); deliberately NOT
        // anchored to any specific suffix ("ni nini"/"tofauti"/"ipi"/
        // "gani") so every real suffix variation the user can phrase is
        // reached through this one broad, meaning-level pattern.
        new RegExp(`\\bkati\\s+ya\\s+(${NAME})\\s+na\\s+(${NAME})\\b`, "i"),
        // Kiswahili — "X na Y zina(to)?fautianaje" / "X na Y zina tofauti gani"
        new RegExp(`\\b(${NAME})\\s+na\\s+(${NAME})\\s+zina(?:to)?fautianaje\\b`, "i"),
        new RegExp(`\\b(${NAME})\\s+na\\s+(${NAME})\\s+zina\\s+tofauti\\s+gani\\b`, "i"),
        // Kiswahili — singular, reversed order: "X inatofautianaje na Y"
        new RegExp(`\\b(${NAME})\\s+ina(?:to)?fautianaje\\s+na\\s+(${NAME})\\b`, "i"),
        // Kiswahili — "tofauti kati ya X na Y ni nini" (kept from the
        // original inline pattern for exact backward compatibility)
        new RegExp(`\\btofauti\\s+kati\\s+ya\\s+(${NAME})\\s+na\\s+(${NAME})\\s+ni\\s+nini\\b`, "i"),
        // English — "between X and Y" is itself the real comparison
        // signal, same broad-prefix discipline as "kati ya" above —
        // reaches "which is different between X and Y", "between X and
        // Y, which one...", "what is the difference between X and Y",
        // etc. through one pattern rather than one per suffix.
        new RegExp(`\\bbetween\\s+(${NAME})\\s+and\\s+(${NAME})\\b`, "i"),
        // English — "how are/is X and Y different"
        new RegExp(`\\bhow\\s+(?:are|is)\\s+(${NAME})\\s+and\\s+(${NAME})\\s+different\\b`, "i"),
        // English/generic — "X vs Y" / "X versus Y"
        new RegExp(`\\b(${NAME})\\s+(?:vs\\.?|versus)\\s+(${NAME})\\b`, "i"),
    ]);

    /**
     * detectComparisonIntent(text)
     *   Returns { entityAName, entityBName, matchedPattern } (raw,
     *   unverified candidate strings — same trim-only normalization the
     *   original inline detector used) on the FIRST real pattern that
     *   matches, or null when no real comparison framing is present.
     *   Scans every pattern (not just the first) so the caller
     *   deterministically gets the same result regardless of which
     *   grammatical family the user happened to use.
     */
    function detectComparisonIntent(text) {
        if (typeof text !== "string" || !text.trim()) return null;
        for (const pattern of PATTERNS) {
            const match = pattern.exec(text);
            if (match && match[1] && match[2]) {
                return {
                    entityAName: match[1].trim(),
                    entityBName: match[2].trim(),
                    matchedPattern: pattern.source,
                };
            }
        }
        return null;
    }

    /** normalizeApplicationKey(rawName) — same trim/lowercase/strip-non-alnum normalization compareApplicationsFact()'s own callers already use (never a new key scheme). */
    function normalizeApplicationKey(rawName) {
        return typeof rawName === "string" ? rawName.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    }

    const ComparisonIntent = Object.freeze({
        detectComparisonIntent, normalizeApplicationKey, getVersion: () => VERSION,
    });
    window.CozyOS.ComparisonIntent = ComparisonIntent;
    window.CozyOS.Modules["comparison-intent"] = Object.freeze({
        version: VERSION,
        description: "UNIVERSAL LANGUAGE SEAM — shared, closed-vocabulary comparison-intent detector (Kiswahili + English + code-switched 'kati ya X na Y'/'between X and Y' framings), extracting two real application-name candidates. Composed by cozy-answer-engine.js (checked early, before the single-entity application-knowledge path can short-circuit) and rule-based-conversational-provider.js (its own prior inline pattern replaced with a call here, eliminating the duplicate regex). Never verifies the names itself and never ranks/recommends — CozyKnowledge.compareApplicationsFact() remains the sole comparison-content authority."
    });
})();
