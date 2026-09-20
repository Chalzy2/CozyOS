/**
 * CozyAI — Verified Evidence Contract (SA-1)
 * File Reference: core/modules/intelligence/semantic-answer/contracts/verified-evidence-contract.js
 *
 * WHAT THIS IS
 *   Contract B. Answers WHAT facts CozyAI is actually allowed to say.
 *   A VerifiedEvidence record is MEANING — a real, sourced, verification-
 *   stated claim — never wording chosen for a specific target language.
 *   See SEMANTIC-ANSWER-CONSTRUCTION-IMPLEMENTATION-MAP.md for the full
 *   audit of the real authorities this contract will wrap in SA-2
 *   (CozyKnowledge, APPLICATION_HUMAN_PURPOSE_DATA, CozyMemory,
 *   CozyLearn, CozyKnowledgeCommunity).
 *
 * SA-1 SCOPE — CONTRACTS AND FIXTURES ONLY
 *   This file defines and validates the shape only. It does NOT read
 *   CozyKnowledge, CozyMemory, or any other real authority (that is
 *   SA-2's evidence facade). No production behavior change.
 *
 * VERIFICATION STATUS — real, disclosed, six real states (spec §3.B)
 *   VERIFIED/CURATED/APPROVED are all states a realizer may treat as
 *   usable factual material (with different trust weight); UNVERIFIED/
 *   CONFLICTED/DEPRECATED must never be presented as an authoritative
 *   factual assertion by a candidate sentence (Contract E's own
 *   `evidence` check exists to enforce this at validation time).
 *
 * SENSITIVITY — a real, disclosed superset of two genuinely separate,
 * already-existing authorization systems this repo has (see the
 * implementation map §4): CozyMemory's own client-side visibility
 * values ("private"/"public"/"organisation") and the real, server-side
 * server/webauthn-rp/knowledge-registry.js VISIBILITIES
 * (PUBLIC/USER/ORGANIZATION/ADMIN/SYSTEM/SECRET). This contract's
 * SENSITIVITY enum is the union, normalized to uppercase, so SA-2's
 * evidence facade can map either real source's value onto exactly one
 * of these without inventing a narrower or wider classification than
 * either source already has. CozyKnowledge facts (today, no sensitivity
 * field of their own) default to PUBLIC in SA-2 — an accurate label,
 * not a new restriction.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const SCHEMA_VERSION = "cozy.verified-evidence.v1";
    const MODULE_VERSION = "1.0.0-sa1";
    if (window.CozyOS.Modules["verified-evidence-contract"]) return;

    const VERIFICATION_STATUS = Object.freeze(["VERIFIED", "CURATED", "APPROVED", "UNVERIFIED", "CONFLICTED", "DEPRECATED"]);
    const VERIFICATION_STATUS_SET = new Set(VERIFICATION_STATUS);

    // No numeric score, matching this repo's own existing confidence
    // convention (SemanticIntentEngine's confidence{...} fields are
    // HIGH/MEDIUM/LOW only, per the implementation map's audit) — plus
    // UNKNOWN for a source that genuinely carries no real confidence
    // signal (honest, never a fabricated guess).
    const CONFIDENCE = Object.freeze(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);
    const CONFIDENCE_SET = new Set(CONFIDENCE);

    const SENSITIVITY = Object.freeze(["PUBLIC", "ORGANIZATION", "PRIVATE", "ADMIN", "SYSTEM", "SECRET"]);
    const SENSITIVITY_SET = new Set(SENSITIVITY);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    /**
     * validate(evidence)
     *   Real, structural validation only. `source.type` is intentionally
     *   an open, non-empty string (not a closed enum) — SA-2 is what
     *   decides the real, disclosed set of source types it actually
     *   produces (e.g. "CozyKnowledge"/"CozyMemory"/"LivingMemory"); this
     *   contract does not prematurely narrow that before SA-2 exists.
     */
    function validate(evidence) {
        const errors = [];
        if (!isPlainObject(evidence)) return { valid: false, errors: ["evidence must be a real object."] };

        if (evidence.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}", got ${JSON.stringify(evidence.schemaVersion)}.`);
        if (!isNonEmptyString(evidence.id)) errors.push("id must be a real, non-empty string.");
        if (!isNonEmptyString(evidence.claim)) errors.push("claim must be a real, non-empty string (the factual meaning this evidence supports).");

        if (!isPlainObject(evidence.source)) {
            errors.push("source must be a real object ({type, id, path?}).");
        } else {
            if (!isNonEmptyString(evidence.source.type)) errors.push("source.type must be a real, non-empty string.");
            if (!isNonEmptyString(evidence.source.id)) errors.push("source.id must be a real, non-empty string.");
            if (evidence.source.path !== undefined && !isNonEmptyString(evidence.source.path)) errors.push("source.path, when present, must be a real, non-empty string.");
        }

        if (!isPlainObject(evidence.verification)) {
            errors.push("verification must be a real object ({status, confidence, verifiedAt?}).");
        } else {
            if (!isNonEmptyString(evidence.verification.status) || !VERIFICATION_STATUS_SET.has(evidence.verification.status)) errors.push(`verification.status must be one of ${VERIFICATION_STATUS.join("/")}. Got ${JSON.stringify(evidence.verification.status)}.`);
            if (!isNonEmptyString(evidence.verification.confidence) || !CONFIDENCE_SET.has(evidence.verification.confidence)) errors.push(`verification.confidence must be one of ${CONFIDENCE.join("/")}. Got ${JSON.stringify(evidence.verification.confidence)}.`);
            if (evidence.verification.verifiedAt !== undefined && !isNonEmptyString(evidence.verification.verifiedAt)) errors.push("verification.verifiedAt, when present, must be a real, non-empty ISO timestamp string.");
        }

        if (!isNonEmptyString(evidence.sensitivity) || !SENSITIVITY_SET.has(evidence.sensitivity)) errors.push(`sensitivity must be one of ${SENSITIVITY.join("/")}. Got ${JSON.stringify(evidence.sensitivity)}.`);

        // Optional fields — validated only if present, never required.
        if (evidence.language !== undefined && !isNonEmptyString(evidence.language)) errors.push("language, when present, must be a real, non-empty languageId string.");
        if (evidence.entityId !== undefined && !isNonEmptyString(evidence.entityId)) errors.push("entityId, when present, must be a real, non-empty string.");
        if (evidence.provenance !== undefined && !isNonEmptyString(evidence.provenance)) errors.push("provenance, when present, must be a real, non-empty string.");

        return { valid: errors.length === 0, errors };
    }

    /** create(fields) — same convenience-constructor convention as SemanticAnswerPlanContract.create(). */
    function create(fields = {}) {
        const evidence = Object.assign({ schemaVersion: SCHEMA_VERSION }, fields);
        const result = validate(evidence);
        return result.valid ? { success: true, evidence } : { success: false, errors: result.errors };
    }

    /** isAuthoritative(evidence) — real, disclosed helper: only these three statuses may ever back a factual assertion in a candidate sentence. Never mutates, never re-verifies — reads the already-set status only. */
    function isAuthoritative(evidence) {
        return !!evidence && (evidence.verification && (evidence.verification.status === "VERIFIED" || evidence.verification.status === "CURATED" || evidence.verification.status === "APPROVED"));
    }

    const VerifiedEvidenceContract = Object.freeze({
        SCHEMA_VERSION, VERIFICATION_STATUS, CONFIDENCE, SENSITIVITY,
        validate, create, isAuthoritative, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.VerifiedEvidenceContract = VerifiedEvidenceContract;
    window.CozyOS.Modules["verified-evidence-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-1 — Verified Evidence contract/validator. Defines WHAT facts CozyAI may say (claim+source+verification status+sensitivity). No production behavior change; reads no real knowledge/memory authority yet (see SA-2)."
    });
})();
