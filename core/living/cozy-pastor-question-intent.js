/**
 * core/living/cozy-pastor-question-intent.js
 * PHASE 4 — ENHANCED COZY BOUNDARY (Live Session Privacy): explicit
 * "send this to the pastor/moderator" intent detection. Same discipline
 * as cozy-teach-intent.js/cozy-learning-intent.js: a real, narrow,
 * disclosed classifier recognizing a small list of explicit EN/SW marker
 * phrases — never a general intent classifier, never a second AI. This
 * is deliberately explicit-marker-only: an ordinary question asked of
 * Cozy during a live session stays a private, ordinary Cozy conversation
 * (never automatically forwarded to a pastor/moderator) — only a message
 * that explicitly names this workflow triggers it, per the spec's own
 * required separation: "A participant question intended for the pastor/
 * moderator must use a separate explicit workflow."
 */
(function (root) {
    "use strict";

    function findMarker(lowerText, markers) {
        for (const marker of markers) {
            const re = new RegExp(`\\b${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
            const match = lowerText.match(re);
            if (match) return { marker, index: match.index, length: match[0].length };
        }
        return null;
    }

    const PASTOR_MARKERS_EN = ["send this to the pastor", "send to the pastor", "ask the pastor", "send this to the moderator", "send to the moderator", "ask the moderator"];
    const PASTOR_MARKERS_SW = ["tuma hili kwa mchungaji", "tuma kwa mchungaji", "uliza mchungaji", "tuma hili kwa msimamizi", "tuma kwa msimamizi", "uliza msimamizi"];

    /**
     * detectPastorQuestionIntent(text, language)
     *   Returns { isPastorQuestion: false } when no explicit marker
     *   matched. Otherwise { isPastorQuestion: true, questionText,
     *   matchedMarker, language } — questionText is whatever real text
     *   remains after the marker (or, if the marker leaves nothing real
     *   behind, the WHOLE original message — e.g. "Ask the pastor: what
     *   time is baptism class?" vs. a bare "Ask the pastor" meaning "send
     *   what I just said"). This file only classifies; it never submits
     *   anything itself (see cozy-pastor-question-flow.js).
     */
    function detectPastorQuestionIntent(text, language) {
        const raw = typeof text === "string" ? text.trim() : "";
        if (!raw) return { isPastorQuestion: false };
        const lower = raw.toLowerCase();
        const markers = language === "sw" ? PASTOR_MARKERS_SW : PASTOR_MARKERS_EN;
        const otherMarkers = language === "sw" ? PASTOR_MARKERS_EN : PASTOR_MARKERS_SW;

        let found = findMarker(lower, markers);
        let matchedLanguage = language === "sw" ? "sw" : "en";
        if (!found) {
            found = findMarker(lower, otherMarkers);
            matchedLanguage = matchedLanguage === "sw" ? "en" : "sw";
        }
        if (!found) return { isPastorQuestion: false };

        const remainder = raw.slice(found.index + found.length).replace(/^[\s,:\-]+/, "").trim();
        const questionText = remainder || raw;
        return { isPastorQuestion: true, questionText, matchedMarker: found.marker, language: matchedLanguage };
    }

    const api = Object.freeze({ detectPastorQuestionIntent });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyPastorQuestionIntent = api;
        root.window.CozyOS.Modules["cozy-pastor-question-intent"] = Object.freeze({
            version: "1.0.0",
            description: "PHASE 4 — ENHANCED COZY BOUNDARY: explicit pastor/moderator-question marker detection (EN+SW, word-boundary-safe). Pure, stateless, no side effects."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
