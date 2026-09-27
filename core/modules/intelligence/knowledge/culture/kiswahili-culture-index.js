/**
 * core/modules/intelligence/knowledge/culture/kiswahili-culture-index.js
 * CozyOS — Kiswahili Semantic Knowledge Layer — Culture Index
 *
 * NEW, ADDITIVE FILE. Aggregates kiswahili-proverbs.js and
 * kiswahili-idioms.js (both must already be loaded) and provides
 * `recognizeExpression(text)`: real substring recognition of a known
 * proverb/idiom occurring anywhere inside a longer sentence — e.g.
 * detecting "haraka haraka haina baraka" inside "Usikimbie; haraka
 * haraka haina baraka." DISCLOSURE: recognition is exact-phrase
 * substring matching (case-insensitive, whitespace-normalized), not a
 * fuzzy/morphological matcher — a proverb quoted with different word
 * order or inflected words will not be recognized (documented as a
 * known limitation in the handoff).
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["kiswahili-culture-index"]) return;

    const VERSION = "1.0.0-culture-phase1";

    function normalize(s) {
        return s.toLowerCase().replace(/\s+/g, " ").trim();
    }

    function getMods() {
        return {
            proverbs: w.CozyOS.CozyKiswahiliProverbs || null,
            idioms: w.CozyOS.CozyKiswahiliIdioms || null
        };
    }

    /**
     * recognizeExpression(text)
     *   Returns the FIRST known proverb/idiom whose exact expression
     *   text occurs as a substring of the input (longest-expression-
     *   first, so a fully-contained shorter idiom inside a longer
     *   proverb never shadows the more specific match). Returns null,
     *   honestly, when nothing is recognized — never invents a
     *   proverb/idiom that wasn't actually present in the text.
     */
    function recognizeExpression(text) {
        if (typeof text !== "string" || !text.trim()) return null;
        const haystack = normalize(text);
        const mods = getMods();
        const candidates = [];
        if (mods.proverbs) {
            for (const p of mods.proverbs.proverbs) candidates.push({ type: "proverb", record: p });
        }
        if (mods.idioms) {
            for (const i of mods.idioms.idioms) candidates.push({ type: "idiom", record: i });
        }
        candidates.sort((a, b) => b.record.expression.length - a.record.expression.length);
        for (const c of candidates) {
            if (haystack.indexOf(normalize(c.record.expression)) !== -1) {
                return Object.freeze({ type: c.type, record: c.record });
            }
        }
        return null;
    }

    function getCounts() {
        const mods = getMods();
        return Object.freeze({
            proverbs: mods.proverbs ? mods.proverbs.count : 0,
            idioms: mods.idioms ? mods.idioms.count : 0
        });
    }

    const api = Object.freeze({
        VERSION,
        recognizeExpression,
        getCounts
    });

    w.CozyOS.CozyKiswahiliCulture = api;
    w.CozyOS.Modules["kiswahili-culture-index"] = Object.freeze({
        version: VERSION,
        description: "New, additive aggregator: exact-phrase (case/whitespace-normalized) recognition of a known Kiswahili proverb/idiom occurring inside free text, composing kiswahili-proverbs.js and kiswahili-idioms.js read-only. Disclosed limitation: substring matching only, no fuzzy/morphological variant recognition. Does not modify any existing file."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
