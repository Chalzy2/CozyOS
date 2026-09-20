/**
 * CozyAI — Response Validation Result Contract (SA-1)
 * File Reference: core/modules/intelligence/semantic-answer/contracts/response-validation-result-contract.js
 *
 * WHAT THIS IS
 *   Contract E. Answers CAN a given CandidateSentence actually be
 *   returned to the user. SA-1 defines and validates the shape only —
 *   it builds no real validator (SA-5) or repair engine (SA-6).
 *
 * CHECKS — eight, real, disclosed (spec §3.E's own list of seven —
 * meaning/evidence/language/grammar/naturalness/completeness/entity —
 * plus the eighth check spec §7 "Validation and Repair" independently
 * requires: "Scope/authorization — does it remain within evidence
 * sensitivity and actor permissions?". Both sections describe the same
 * real validator; this contract carries the union of what both
 * sections actually require, not just §3.E's shorter list.
 *
 * STATUS — PASS/REPAIR_REQUIRED/REJECT (spec §3.E). Real, disclosed
 * severity levels for a violation (not specified verbatim by the spec,
 * so defined here explicitly): BLOCKING violations force REJECT; MAJOR
 * violations force REPAIR_REQUIRED; MINOR violations may still PASS
 * with the violation recorded for visibility. SA-5 is what actually
 * assigns real severities to real violations — this file only defines
 * the closed set.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const SCHEMA_VERSION = "cozy.response-validation-result.v1";
    const MODULE_VERSION = "1.0.0-sa1";
    if (window.CozyOS.Modules["response-validation-result-contract"]) return;

    const STATUS = Object.freeze(["PASS", "REPAIR_REQUIRED", "REJECT"]);
    const STATUS_SET = new Set(STATUS);

    const CHECK_NAMES = Object.freeze(["meaning", "evidence", "language", "grammar", "naturalness", "completeness", "entity", "authorization"]);

    const CHECK_STATUS = Object.freeze(["PASS", "FAIL", "NOT_EVALUATED"]);
    const CHECK_STATUS_SET = new Set(CHECK_STATUS);

    const VIOLATION_SEVERITY = Object.freeze(["BLOCKING", "MAJOR", "MINOR"]);
    const VIOLATION_SEVERITY_SET = new Set(VIOLATION_SEVERITY);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    function validateCheck(check, path, errors) {
        if (!isPlainObject(check)) { errors.push(`${path} must be a real object ({status, confidence?, details?}).`); return; }
        if (!isNonEmptyString(check.status) || !CHECK_STATUS_SET.has(check.status)) errors.push(`${path}.status must be one of ${CHECK_STATUS.join("/")}. Got ${JSON.stringify(check.status)}.`);
        if (check.confidence !== undefined && !isNonEmptyString(check.confidence)) errors.push(`${path}.confidence, when present, must be a real, non-empty string.`);
        if (check.details !== undefined && !isNonEmptyString(check.details)) errors.push(`${path}.details, when present, must be a real, non-empty string.`);
    }

    function validate(result) {
        const errors = [];
        if (!isPlainObject(result)) return { valid: false, errors: ["result must be a real object."] };

        if (result.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}", got ${JSON.stringify(result.schemaVersion)}.`);
        if (!isNonEmptyString(result.status) || !STATUS_SET.has(result.status)) errors.push(`status must be one of ${STATUS.join("/")}. Got ${JSON.stringify(result.status)}.`);

        if (!isPlainObject(result.checks)) {
            errors.push(`checks must be a real object with all of: ${CHECK_NAMES.join(", ")}.`);
        } else {
            for (const name of CHECK_NAMES) validateCheck(result.checks[name], `checks.${name}`, errors);
        }

        if (!Array.isArray(result.violations)) {
            errors.push("violations must be a real array (may be empty).");
        } else {
            result.violations.forEach((v, i) => {
                if (!isPlainObject(v)) { errors.push(`violations[${i}] must be a real object.`); return; }
                if (!isNonEmptyString(v.code)) errors.push(`violations[${i}].code must be a real, non-empty string.`);
                if (!isNonEmptyString(v.severity) || !VIOLATION_SEVERITY_SET.has(v.severity)) errors.push(`violations[${i}].severity must be one of ${VIOLATION_SEVERITY.join("/")}. Got ${JSON.stringify(v.severity)}.`);
                if (!isNonEmptyString(v.message)) errors.push(`violations[${i}].message must be a real, non-empty string.`);
            });
        }

        // Real cross-field consistency: a status must be backed by its
        // own real evidence (a BLOCKING violation forces REJECT, etc.)
        // — never an unexplained status.
        if (Array.isArray(result.violations) && isNonEmptyString(result.status)) {
            const hasBlocking = result.violations.some((v) => v.severity === "BLOCKING");
            const hasMajor = result.violations.some((v) => v.severity === "MAJOR");
            if (result.status === "REJECT" && !hasBlocking) errors.push('status "REJECT" requires at least one violation with severity "BLOCKING".');
            if (result.status === "PASS" && (hasBlocking || hasMajor)) errors.push('status "PASS" is inconsistent with a recorded BLOCKING or MAJOR violation.');
        }

        if (result.repair !== undefined) {
            if (!isPlainObject(result.repair)) {
                errors.push("repair, when present, must be a real object ({instructions}).");
            } else if (!Array.isArray(result.repair.instructions) || result.repair.instructions.length === 0 || result.repair.instructions.some((s) => !isNonEmptyString(s))) {
                errors.push("repair.instructions, when repair is present, must be a real, non-empty array of non-empty instruction strings.");
            }
        }
        if (result.status === "REPAIR_REQUIRED" && result.repair === undefined) errors.push('status "REPAIR_REQUIRED" requires a real repair object with explicit instructions for the realizer.');

        return { valid: errors.length === 0, errors };
    }

    function create(fields = {}) {
        const result = Object.assign({ schemaVersion: SCHEMA_VERSION }, fields);
        const validation = validate(result);
        return validation.valid ? { success: true, result } : { success: false, errors: validation.errors };
    }

    const ResponseValidationResultContract = Object.freeze({
        SCHEMA_VERSION, STATUS, CHECK_NAMES, CHECK_STATUS, VIOLATION_SEVERITY,
        validate, create, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.ResponseValidationResultContract = ResponseValidationResultContract;
    window.CozyOS.Modules["response-validation-result-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-1 — Response Validation Result contract/validator. Defines CAN a candidate be returned (8 real checks incl. authorization, PASS/REPAIR_REQUIRED/REJECT, violations, bounded repair instructions). No production behavior change; builds no real validator (see SA-5/SA-6)."
    });
})();
