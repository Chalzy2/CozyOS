/**
 * CozyOS — Next-Step Suggestion Contract
 * File Reference: core/modules/intelligence/semantic-answer/contracts/next-step-suggestion-contract.js
 *
 * WHAT THIS IS
 *   The data contract for Live Next-Step Intelligence — a real,
 *   validated shape a NextStepEngine.suggest() candidate must have
 *   before it may reach the Live Window UI. Follows this directory's
 *   own existing contract convention (see verified-evidence-contract.js:
 *   SCHEMA_VERSION + validate() + create() + a frozen enum export, no
 *   framework, no class hierarchy).
 *
 * THE CONTRACT
 *   nextStepEngine.suggest({ input, answer, intent, goal, context,
 *                            application, availableActions, permissions })
 *     -> { suggestions: [Suggestion, ...] }   // 0-3 items typically
 *
 *   Suggestion = {
 *     schemaVersion, id, type, labelKey, label, action, confidence,
 *     destructive, reason?
 *   }
 *   - id           real, non-empty, unique within one suggest() result.
 *   - type         one of SUGGESTION_TYPES below.
 *   - labelKey      the canonical template key this label was realized
 *                   from (core/modules/intelligence/language/
 *                   cozy-language-templates.js), so a caller can
 *                   re-realize it in a different language without
 *                   re-running suggest(). Required for every type
 *                   except CLARIFICATION, which may carry a labelKey of
 *                   its own too (clarification options are real
 *                   templates as well, never inline English).
 *   - label        the ALREADY-REALIZED display string for the caller's
 *                   requested language (see CozyLanguageRealize) — what
 *                   the UI actually renders. Required, real, non-empty.
 *   - action       { actionId, payload } — actionId must name a REAL
 *                   action registered with
 *                   window.CozyOS.NextStepActionRegistry (see that
 *                   file). A suggestion with no real actionId
 *                   destination must never be constructed — see
 *                   NextStepEngine's own header for how this is
 *                   enforced structurally (candidates only ever come
 *                   from the caller's own real availableActions list).
 *   - confidence   INTERNAL ONLY. One of CONFIDENCE below (the SAME
 *                  HIGH/MEDIUM/LOW/UNKNOWN taxonomy this repository's
 *                  own VerifiedEvidenceContract already uses for
 *                  internal confidence — not a new scale). Never
 *                  rendered to an end user by any file in this
 *                  directory; a UI that wants to surface it would need
 *                  its own explicit, disclosed decision to do so, which
 *                  none of this feature's files make.
 *   - destructive  real boolean, copied from the action registry entry
 *                  — never guessed by the engine itself.
 *   - reason       optional, short internal-facing note on WHY this was
 *                  suggested (e.g. "matched goal: perform_action;
 *                  keyword: 'employee'"), for diagnostics/tests only.
 *
 * RANKING / FALLBACK RULES (documented here so they are one real,
 * shared, testable place — see cozy-next-step-engine.js's rankAndCap()):
 *   1. Sort candidates by confidence descending (HIGH > MEDIUM > LOW).
 *   2. Tie-break by `directness` (a small integer the engine assigns per
 *      rule — lower is more direct/on-goal), ascending.
 *   3. Cap at MAX_SUGGESTIONS (3).
 *   4. Zero real candidates -> return []. NEVER fabricate a suggestion
 *      to fill the list.
 *   5. An application with no registered actions at all -> [], not an
 *      error — a missing action registry entry is an honest, disclosed
 *      gap (see NextStepActionRegistry's own header), not a failure.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const SCHEMA_VERSION = "cozy.next-step-suggestion.v1";
    const MODULE_VERSION = "1.0.0";
    if (window.CozyOS.Modules["next-step-suggestion-contract"]) return;

    const SUGGESTION_TYPES = Object.freeze(["NAVIGATION", "CREATION", "SEARCH", "ANALYSIS", "CONTINUATION", "CLARIFICATION"]);
    const SUGGESTION_TYPES_SET = new Set(SUGGESTION_TYPES);

    // Same taxonomy VerifiedEvidenceContract.CONFIDENCE already uses
    // (HIGH/MEDIUM/LOW/UNKNOWN) — duplicated here as a plain literal
    // rather than a runtime cross-file read, because this contract must
    // validate correctly even when semantic-answer/contracts files load
    // in a different order or in isolation (e.g. this file's own unit
    // tests) — never a second, competing scale.
    const CONFIDENCE = Object.freeze(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
    const CONFIDENCE_SET = new Set(CONFIDENCE);

    const MAX_SUGGESTIONS = 3;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    function validate(suggestion) {
        const errors = [];
        if (!isPlainObject(suggestion)) return { valid: false, errors: ["suggestion must be a real object."] };

        if (suggestion.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}", got ${JSON.stringify(suggestion.schemaVersion)}.`);
        if (!isNonEmptyString(suggestion.id)) errors.push("id must be a real, non-empty string.");
        if (!isNonEmptyString(suggestion.type) || !SUGGESTION_TYPES_SET.has(suggestion.type)) errors.push(`type must be one of ${SUGGESTION_TYPES.join("/")}. Got ${JSON.stringify(suggestion.type)}.`);
        if (!isNonEmptyString(suggestion.label)) errors.push("label must be a real, non-empty, already-realized display string.");
        if (suggestion.labelKey !== undefined && !isNonEmptyString(suggestion.labelKey)) errors.push("labelKey, when present, must be a real, non-empty string.");

        if (!isPlainObject(suggestion.action)) {
            errors.push("action must be a real object ({actionId, payload?}).");
        } else if (!isNonEmptyString(suggestion.action.actionId)) {
            errors.push("action.actionId must be a real, non-empty string naming an action registered with NextStepActionRegistry.");
        }

        if (!isNonEmptyString(suggestion.confidence) || !CONFIDENCE_SET.has(suggestion.confidence)) errors.push(`confidence must be one of ${CONFIDENCE.join("/")}. Got ${JSON.stringify(suggestion.confidence)}.`);
        if (typeof suggestion.destructive !== "boolean") errors.push("destructive must be a real boolean.");
        if (suggestion.reason !== undefined && !isNonEmptyString(suggestion.reason)) errors.push("reason, when present, must be a real, non-empty string.");

        return { valid: errors.length === 0, errors };
    }

    function create(fields = {}) {
        const suggestion = Object.assign({ schemaVersion: SCHEMA_VERSION }, fields);
        const result = validate(suggestion);
        return result.valid ? { success: true, suggestion } : { success: false, errors: result.errors };
    }

    function validateResult(result) {
        if (!isPlainObject(result) || !Array.isArray(result.suggestions)) {
            return { valid: false, errors: ["result must be a real object with a `suggestions` array."] };
        }
        if (result.suggestions.length > MAX_SUGGESTIONS) {
            return { valid: false, errors: [`suggestions must be capped at ${MAX_SUGGESTIONS}, got ${result.suggestions.length}.`] };
        }
        const ids = new Set();
        const errors = [];
        for (const s of result.suggestions) {
            const v = validate(s);
            if (!v.valid) errors.push(...v.errors);
            if (isNonEmptyString(s && s.id)) {
                if (ids.has(s.id)) errors.push(`Duplicate suggestion id "${s.id}" in one result.`);
                ids.add(s.id);
            }
        }
        return { valid: errors.length === 0, errors };
    }

    const NextStepSuggestionContract = Object.freeze({
        SCHEMA_VERSION, SUGGESTION_TYPES, CONFIDENCE, MAX_SUGGESTIONS,
        validate, create, validateResult, getVersion: () => MODULE_VERSION
    });
    window.CozyOS.NextStepSuggestionContract = NextStepSuggestionContract;
    window.CozyOS.Modules["next-step-suggestion-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "Live Next-Step Intelligence — data contract for a next-step Suggestion ({id,type,label,action:{actionId,payload},confidence,destructive}) and validateResult() for the 0-3-item suggest() return shape. Structural validation only; no ranking/action logic (see cozy-next-step-engine.js / cozy-next-step-action-registry.js)."
    });

    if (typeof module !== "undefined" && module.exports) module.exports = NextStepSuggestionContract;
})();
