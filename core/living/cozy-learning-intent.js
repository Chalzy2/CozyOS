/**
 * core/living/cozy-learning-intent.js
 * PHASE 4 — Universal Language Capability: explicit learning-intent
 * detection ("I want to learn Kikuyu"). Same discipline as
 * cozy-teach-intent.js (Phase 3): a real, narrow, disclosed classifier
 * recognizing a small list of explicit EN/SW marker phrases — never a
 * general intent classifier, never a second language engine.
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

    const LEARN_MARKERS_EN = ["i want to learn", "i'd like to learn", "help me learn", "teach me", "i want to study"];
    const LEARN_MARKERS_SW = ["nataka kujifunza", "ningependa kujifunza", "nisaidie kujifunza", "nifundishe"];

    /**
     * detectLearningIntent(text, language)
     *   Returns { isLearning: false } when no explicit marker matched,
     *   or { isLearning: true, targetLanguage, matchedMarker } when one
     *   did. `targetLanguage` is the raw remainder after the marker
     *   (e.g. "Kikuyu") — a real, disclosed heuristic name match against
     *   the caller-supplied language list happens in the composing
     *   orchestrator (cozy-learning-flow.js), never here.
     */
    function detectLearningIntent(text, language) {
        const raw = typeof text === "string" ? text.trim() : "";
        if (!raw) return { isLearning: false };
        const lower = raw.toLowerCase();
        const markers = language === "sw" ? LEARN_MARKERS_SW : LEARN_MARKERS_EN;
        const otherMarkers = language === "sw" ? LEARN_MARKERS_EN : LEARN_MARKERS_SW;

        let found = findMarker(lower, markers);
        let matchedLanguage = language === "sw" ? "sw" : "en";
        if (!found) {
            found = findMarker(lower, otherMarkers);
            matchedLanguage = matchedLanguage === "sw" ? "en" : "sw";
        }
        if (!found) return { isLearning: false };

        const target = raw.slice(found.index + found.length).replace(/^[\s,:\-]+/, "").trim();
        if (!target) return { isLearning: false, reason: "NO_TARGET_LANGUAGE" };

        return { isLearning: true, targetLanguageText: target, matchedMarker: found.marker, language: matchedLanguage };
    }

    const api = Object.freeze({ detectLearningIntent });

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyLearningIntent = api;
        root.window.CozyOS.Modules["cozy-learning-intent"] = Object.freeze({
            version: "1.0.0",
            description: "PHASE 4 — Universal Language Capability: explicit learning-intent marker detection (EN+SW, word-boundary-safe). Pure, stateless, no side effects."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: (typeof global !== "undefined" ? (global.window = global.window || {}) : {}) });
