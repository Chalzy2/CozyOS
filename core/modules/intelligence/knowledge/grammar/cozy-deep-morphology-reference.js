/**
 * core/modules/intelligence/knowledge/grammar/cozy-deep-morphology-reference.js
 * CozyOS — Kiswahili Deep Morphology & Compositional Grammar — Reference Data
 *
 * NEW, ADDITIVE FILE. This is a REFERENCE DATA table only — advanced
 * tense/clause-marker strings for counterfactual, conditional, and
 * temporal constructions (e.g. "-ange-", "kama", "wakati") — plus a
 * documented decomposition step order.
 *
 * HONESTY DISCLOSURE — IMPORTANT:
 *  - This file does NOT implement a parser. It does not decompose any
 *    verb, detect any clause, or analyze any sentence. It exports
 *    constants and a step-name list only.
 *  - It deliberately does NOT touch, wrap, or duplicate the existing
 *    morphological decomposition engine in cozy-kiswahili-structural-
 *    analysis.js (whose real decomposeVerb()-style pipeline already
 *    performs: extract_subject_prefix, detect_negation_marker,
 *    extract_tense_aspect, extract_object_marker, isolate_verbal_root,
 *    identify_derivational_extensions, resolve_final_vowel,
 *    map_semantic_family — the exact step list requested in this
 *    session's supplied "compositionalParsingRules"). Per the
 *    project's own architectural rule ("DO NOT create another
 *    semantic engine"), wiring counterfactual/conditional detection
 *    INTO that existing engine is a real, non-trivial change to a
 *    tested file and is left as the explicit next continuation step
 *    below, not silently done here.
 *  - `stepOrder` is included for documentation/consistency-checking
 *    purposes (e.g. a future test can assert the existing engine's
 *    real step order still matches this list), not as a second
 *    implementation of those steps.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["cozy-deep-morphology-reference"]) return;

    const VERSION = "1.0.0-grammar-reference-phase1";

    const ADVANCED_VERB_TENSE_MARKERS = Object.freeze({
        counterfactualConditional: "-ange-", // e.g. angetaka, ningekuwa
        potentialSubjunctive: "-ki-",        // e.g. nikija
        habitualPast: "-nge-/-kuwa-"
    });

    const CLAUSE_MARKERS = Object.freeze({
        counterfactualStarters: Object.freeze(["kama", "laiti", "nadra"]),
        consequentialMarkers: Object.freeze(["ange", "ninge", "vinge", "zinge"]),
        temporalConnectors: Object.freeze(["wakati", "kabla ya", "baada ya", "wakati ambapo"])
    });

    // Documents the existing structural-analysis engine's real step
    // order (see file-level disclosure above) — not a second pipeline.
    const REFERENCE_DECOMPOSITION_STEP_ORDER = Object.freeze([
        "extract_subject_prefix",
        "detect_negation_marker",
        "extract_tense_aspect",
        "extract_object_marker",
        "isolate_verbal_root",
        "identify_derivational_extensions",
        "resolve_final_vowel",
        "map_semantic_family"
    ]);

    /**
     * containsClauseMarker(text, category)
     *   The ONE piece of real, executable logic in this file: a plain
     *   substring check of `text` against one named category of
     *   CLAUSE_MARKERS above. Returns the matched marker string, or
     *   null. This is intentionally trivial — real counterfactual
     *   clause PARSING (subject/consequent extraction, tense
     *   agreement) is explicitly out of scope for this file; see the
     *   disclosure above.
     */
    function containsClauseMarker(text, category) {
        if (typeof text !== "string" || !text.trim()) return null;
        const markers = CLAUSE_MARKERS[category];
        if (!Array.isArray(markers)) return null;
        const haystack = text.toLowerCase();
        for (const m of markers) {
            if (haystack.indexOf(m.toLowerCase()) !== -1) return m;
        }
        return null;
    }

    const api = Object.freeze({
        VERSION,
        advancedVerbTenseMarkers: ADVANCED_VERB_TENSE_MARKERS,
        clauseMarkers: CLAUSE_MARKERS,
        referenceDecompositionStepOrder: REFERENCE_DECOMPOSITION_STEP_ORDER,
        containsClauseMarker
    });

    w.CozyOS.CozyDeepMorphologyReference = api;
    w.CozyOS.Modules["cozy-deep-morphology-reference"] = Object.freeze({
        version: VERSION,
        description: "New, additive REFERENCE DATA ONLY: advanced tense markers, counterfactual/conditional/temporal clause-marker word lists, and a documentation copy of the existing structural-analysis engine's real step order. Provides one trivial substring-check helper (containsClauseMarker). Does NOT parse sentences, does NOT duplicate or wrap cozy-kiswahili-structural-analysis.js, and does NOT modify any existing file. Wiring this data into that engine is an explicit next-continuation step, not done here."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
