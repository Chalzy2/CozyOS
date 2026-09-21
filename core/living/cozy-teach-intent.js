/**
 * core/living/cozy-teach-intent.js
 * PHASE 3 — Teach Cozy / Governed Learning: explicit teaching-intent detection.
 *
 * WHAT THIS FILE IS
 *   A real, narrow, disclosed classifier that recognizes when a Live
 *   Window message is an EXPLICIT statement of intent to teach CozyAI
 *   something ("I want to teach you that...", "Nataka kukufundisha
 *   kwamba...", "Remember that...", "Kumbuka kwamba..."), and extracts
 *   the claim text that follows the marker. This is deliberately a
 *   pure, stateless function with no side effects - it does not create,
 *   confirm, or promote anything (see cozy-teach-flow.js for the
 *   orchestration that does).
 *
 * WHY EXPLICIT-MARKER ONLY
 *   A general "is this sentence a fact worth learning" classifier does
 *   not exist honestly anywhere in this repository. Rather than
 *   fabricate one, this file only recognizes a small, disclosed list of
 *   EN/SW phrases that unambiguously signal teaching intent — the same
 *   "small disclosed keyword table, not a new paradigm" discipline
 *   cozy-business-data-intent.js's own header already documents. A
 *   normal factual statement with no such marker ("CozyOS costs a lot")
 *   is correctly NOT detected as teaching intent — it is answered (or
 *   not) by the existing chain exactly as before this phase.
 *
 * MATCHING DISCIPLINE
 *   Word/phrase-boundary matching only (\bphrase\b), never a plain
 *   substring — the same fix Phase 2 applied after finding a real false
 *   positive ("inafaida" wrongly substring-matching "faida"). A marker
 *   embedded inside a longer, unrelated word never fires here either.
 *
 * NO NEW LANGUAGE ENGINE
 *   `language` is always passed in by the caller (the same
 *   result.result.language signal cozy-living-assistant.js already
 *   resolves per turn and threads everywhere else) — this file performs
 *   no language detection of its own.
 */
(function (root) {
    "use strict";

    function cozyOS() {
        return (root && root.window && root.window.CozyOS) || (typeof window !== "undefined" ? window.CozyOS : null);
    }

    // Ordered so a longer, more specific marker is tried before a
    // shorter one that could be a substring of it (e.g. "teach you"
    // before "teach").
    const TEACH_MARKERS_EN = [
        "i want to teach you that",
        "i want to teach you",
        "let me teach you that",
        "let me teach you",
        "i'd like to teach you",
        "you should know that",
        "remember that",
        "please remember that"
    ];
    const TEACH_MARKERS_SW = [
        "nataka kukufundisha kwamba",
        "nataka kukufundisha",
        "ningependa kukufundisha",
        "unapaswa kujua kwamba",
        "kumbuka kwamba",
        "tafadhali kumbuka kwamba"
    ];

    function findMarker(lowerText, markers) {
        for (const marker of markers) {
            const re = new RegExp(`\\b${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
            const match = lowerText.match(re);
            if (match) return { marker, index: match.index, length: match[0].length };
        }
        return null;
    }

    /**
     * detectTeachingIntent(text, language)
     *   Returns { isTeaching: false } when no explicit marker matched
     *   (the honest, default "do not guess" case), or
     *   { isTeaching: true, claim, matchedMarker, language } when one
     *   did. `claim` is the raw remainder of the sentence after the
     *   marker, trimmed — never fabricated, never summarized.
     */
    function detectTeachingIntent(text, language) {
        const raw = typeof text === "string" ? text.trim() : "";
        if (!raw) return { isTeaching: false };
        const lower = raw.toLowerCase();
        const markers = language === "sw" ? TEACH_MARKERS_SW : TEACH_MARKERS_EN;
        // Honest bilingual fallback: a caller's resolved `language` is a
        // per-turn best-effort signal (see rule-based-conversational-
        // provider.js), not a hard guarantee the user typed in that
        // language only - so both marker lists are always tried, the
        // resolved language's own list first.
        const otherMarkers = language === "sw" ? TEACH_MARKERS_EN : TEACH_MARKERS_SW;

        let found = findMarker(lower, markers);
        let matchedLanguage = language === "sw" ? "sw" : "en";
        if (!found) {
            found = findMarker(lower, otherMarkers);
            matchedLanguage = matchedLanguage === "sw" ? "en" : "sw";
        }
        if (!found) return { isTeaching: false };

        const claim = raw.slice(found.index + found.length).replace(/^[\s,:\-]+/, "").trim();
        if (!claim) return { isTeaching: false, reason: "NO_CLAIM_TEXT" };

        return {
            isTeaching: true,
            claim,
            matchedMarker: found.marker,
            language: matchedLanguage
        };
    }

    const api = Object.freeze({ detectTeachingIntent });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyTeachIntent = api;
        root.window.CozyOS.Modules["cozy-teach-intent"] = Object.freeze({
            version: "1.0.0",
            description: "PHASE 3 — Teach Cozy / Governed Learning: explicit teaching-intent marker detection (EN+SW, word-boundary-safe). Pure, stateless, no side effects. Only recognizes a small, disclosed list of explicit teaching phrases — never a general fact classifier."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
