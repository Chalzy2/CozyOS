/**
 * CozyAI — Language Identity Contract
 * File Reference: core/modules/intelligence/language/language-identity-contract.js
 * Part of: UNIVERSAL LANGUAGE DETECTION & PROPAGATION SEAM (per
 * UNIVERSAL-LANGUAGE-SEAM-DESIGN-PROPOSAL.md §3, authorized for
 * implementation).
 *
 * WHAT THIS IS
 *   The one, authoritative real-object shape a resolved language
 *   identity takes anywhere in this repository — `cozy.language-
 *   identity.v1`. Same discipline as every other SA-1-style contract
 *   (`VerifiedEvidenceContract`, `SemanticAnswerPlanContract`): pure
 *   shape/validation, no detection logic, no behavior of its own.
 *   `cozy-language-identifier.js` is the one real producer of a valid
 *   object matching this shape; every consumer (rule-based-
 *   conversational-provider.js, SemanticIntentEngine, SemanticAnswerPlanner,
 *   CozyAnswerEngine, ContinuousLearningFabric) reads it, never
 *   re-derives its own competing shape.
 *
 * WHY A NEW CONTRACT, NOT A NEW FIELD ON AN EXISTING ONE
 *   `SemanticAnswerPlanContract`'s own `plan.language` field is a plain
 *   string (`"sw"`) — correct and untouched by this file. This contract
 *   is the RICHER, upstream object that PRODUCES that string
 *   (`identity.languageId`) plus the diagnostic provenance
 *   (source/confidence/conflict) no single string can carry. Every
 *   existing bare-string `language` parameter throughout this
 *   repository keeps working unmodified — this is purely additive.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE
 *   `languageId` must be `"UNKNOWN"` whenever `source === "UNRESOLVED"`.
 *   It is structurally invalid for a real identity object to claim a
 *   real language code while its own source says nothing was actually
 *   resolved — this is the direct fix for the "silently default to
 *   en" pattern found independently in three places this design's own
 *   audit traced (`detectLanguageHeuristic()`, `SemanticIntentEngine
 *   .detectLanguages()`, `CozyLanguageRegistry.resolveLanguage()`).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const SCHEMA_VERSION = "cozy.language-identity.v1";
    const MODULE_VERSION = "1.0.0-uls1";
    if (window.CozyOS.Modules["language-identity-contract"]) return;

    // Priority order, highest first — the one authority rule (design §3).
    const SOURCE = Object.freeze([
        "EXPLICIT_USER_SELECTION", "CONVERSATION_CARRYOVER", "MARKER_MATCH",
        "MORPHOLOGICAL_MATCH", "STATISTICAL_MATCH", "COUNTRY_SUGGESTION", "UNRESOLVED",
    ]);
    const SOURCE_SET = new Set(SOURCE);

    // Same HIGH/MEDIUM/LOW/UNKNOWN vocabulary VerifiedEvidenceContract
    // already established — reused, not reinvented.
    const CONFIDENCE = Object.freeze(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
    const CONFIDENCE_SET = new Set(CONFIDENCE);

    const MODALITY = Object.freeze(["text", "voice", "image-ocr"]);
    const MODALITY_SET = new Set(MODALITY);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    /**
     * validate(identity)
     *   Real, structural validation only — never re-detects, never
     *   consults CozyLanguageRegistry (that belongs to the identifier,
     *   not this contract). The UNKNOWN/UNRESOLVED coupling below is
     *   this file's one real, load-bearing invariant.
     */
    function validate(identity) {
        const errors = [];
        if (!isPlainObject(identity)) return { valid: false, errors: ["identity must be a real object."] };

        if (identity.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}", got ${JSON.stringify(identity.schemaVersion)}.`);
        if (!isNonEmptyString(identity.languageId)) errors.push("languageId must be a real, non-empty string (a real language code, or the literal string \"UNKNOWN\").");
        if (!isNonEmptyString(identity.source) || !SOURCE_SET.has(identity.source)) errors.push(`source must be one of ${SOURCE.join("/")}. Got ${JSON.stringify(identity.source)}.`);
        if (!isNonEmptyString(identity.confidence) || !CONFIDENCE_SET.has(identity.confidence)) errors.push(`confidence must be one of ${CONFIDENCE.join("/")}. Got ${JSON.stringify(identity.confidence)}.`);
        if (!isNonEmptyString(identity.modality) || !MODALITY_SET.has(identity.modality)) errors.push(`modality must be one of ${MODALITY.join("/")}. Got ${JSON.stringify(identity.modality)}.`);

        // THE ONE RULE — see file header.
        if (identity.source === "UNRESOLVED" && identity.languageId !== "UNKNOWN") {
            errors.push(`source is "UNRESOLVED" but languageId is ${JSON.stringify(identity.languageId)} — an unresolved identity must honestly report languageId:"UNKNOWN", never a guessed real language code.`);
        }
        if (identity.languageId === "UNKNOWN" && identity.source !== "UNRESOLVED") {
            errors.push(`languageId is "UNKNOWN" but source is ${JSON.stringify(identity.source)} — a real source must never be reported alongside an UNKNOWN languageId (that combination is contradictory: something matched, but nothing was returned).`);
        }
        if (identity.languageId === "UNKNOWN" && identity.confidence !== "UNKNOWN") {
            errors.push(`languageId is "UNKNOWN" but confidence is ${JSON.stringify(identity.confidence)} — an unresolved identity must report confidence:"UNKNOWN" too.`);
        }

        // Optional fields — validated only if present, never required.
        if (identity.dialectRegion !== undefined && identity.dialectRegion !== null && !isNonEmptyString(identity.dialectRegion)) {
            errors.push("dialectRegion, when present, must be null or a real, non-empty string.");
        }
        if (identity.detectedLanguages !== undefined) {
            if (!Array.isArray(identity.detectedLanguages) || identity.detectedLanguages.some((l) => !isNonEmptyString(l))) {
                errors.push("detectedLanguages, when present, must be an array of real, non-empty language-code strings.");
            }
        }
        if (identity.mixedLanguage !== undefined && typeof identity.mixedLanguage !== "boolean") {
            errors.push("mixedLanguage, when present, must be a real boolean.");
        }
        if (identity.conflict !== undefined && identity.conflict !== null) {
            if (!isPlainObject(identity.conflict) || !isNonEmptyString(identity.conflict.explicitSaid) || !isNonEmptyString(identity.conflict.detectedSaid)) {
                errors.push("conflict, when present and non-null, must be a real object {explicitSaid, detectedSaid}, both real non-empty strings.");
            }
        }

        return { valid: errors.length === 0, errors };
    }

    /** create(fields) — same convenience-constructor convention as every other SA-1-style contract. */
    function create(fields = {}) {
        const identity = Object.assign({ schemaVersion: SCHEMA_VERSION }, fields);
        const result = validate(identity);
        return result.valid ? { success: true, identity } : { success: false, errors: result.errors };
    }

    /**
     * unresolved(modality)
     *   Real, disclosed convenience constructor for the one honest
     *   "nothing matched" shape — every layer of the identifier (and
     *   any caller that needs a safe default) should use this rather
     *   than hand-building the UNKNOWN/UNRESOLVED combination inline.
     */
    function unresolved(modality = "text") {
        // Defensive: a caller passing a modality string outside this
        // contract's own MODALITY enum (e.g. a DIFFERENT vocabulary
        // like MultimodalObservationCore's "TEXT"/"AUDIO"/"VISUAL" —
        // confirmed as a real bug this exact guard fixes: continuous-
        // learning-fabric.js's IDENTIFY LANGUAGE stage passed
        // observation.modality straight through) must never silently
        // corrupt the one honest "nothing matched" shape into a
        // schema-only fragment. Falls back to "text" rather than
        // propagating create()'s validation failure.
        const safeModality = MODALITY_SET.has(modality) ? modality : "text";
        return create({
            languageId: "UNKNOWN", source: "UNRESOLVED", confidence: "UNKNOWN",
            modality: safeModality, dialectRegion: null, detectedLanguages: [], mixedLanguage: false, conflict: null,
        }).identity;
    }

    const LanguageIdentityContract = Object.freeze({
        SCHEMA_VERSION, SOURCE, CONFIDENCE, MODALITY,
        validate, create, unresolved, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.LanguageIdentityContract = LanguageIdentityContract;
    window.CozyOS.Modules["language-identity-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "Universal Language Seam — cozy.language-identity.v1 contract/validator. Defines the one authoritative shape a resolved language identity takes (languageId/source/confidence/dialectRegion/detectedLanguages/mixedLanguage/conflict), and enforces the one rule that an UNRESOLVED source must always report languageId:\"UNKNOWN\", never a guessed real language code. No detection logic — see cozy-language-identifier.js. No production behavior change on its own; nothing yet consumes it."
    });
})();
