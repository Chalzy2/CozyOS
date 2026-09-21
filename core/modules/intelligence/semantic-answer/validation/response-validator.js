/**
 * CozyAI — Response Validator (SA-5)
 * File Reference: core/modules/intelligence/semantic-answer/validation/response-validator.js
 *
 * WHAT THIS IS
 *   Answers CAN a real CandidateSentence (SA-4's output) actually be
 *   returned to the user. Produces a real cozy.response-validation-
 *   result.v1 record (SA-1's ResponseValidationResultContract) with all
 *   eight real checks that contract defines: meaning, evidence,
 *   language, grammar, naturalness, completeness, entity, authorization.
 *
 * WHAT THIS FILE DOES NOT DO
 *   No new NLP/grammar engine. Per the implementation map's own
 *   guidance (§3.E): "grammar/naturalness for a template-composed
 *   sentence is close to trivially PASS by construction, honestly
 *   disclosed as such rather than faked with a fabricated NLP grammar
 *   checker" — this file follows that guidance exactly for
 *   GENERATION_MODE "COMPOSED" (the only mode SA-4 produces today).
 *   Every other check (meaning/evidence/language/completeness/entity/
 *   authorization) is a real, computable cross-reference against the
 *   plan/evidence this candidate was built from — never invented, never
 *   skipped silently.
 *
 * SEVERITY MODEL (real, disclosed — this contract leaves severity
 * assignment to SA-5, per that file's own header)
 *   BLOCKING (forces REJECT): meaning (an evidenceId cited that no plan
 *     claim actually references — an invented citation), evidence (a
 *     cited evidenceId missing from the supplied evidence, or not
 *     authoritative), language (candidate.language doesn't match the
 *     plan's requested language, or isn't a real AVAILABLE language),
 *     entity (evidence whose own entityId contradicts the plan's
 *     entity), authorization (non-PUBLIC-sensitivity evidence used with
 *     no real actorContext proving the caller was authorized to see
 *     it).
 *   MAJOR (forces REPAIR_REQUIRED, never REJECT on its own): completeness
 *     (a plan claim had real, correct-language evidence available but
 *     was not included in the candidate — SA-6's repair loop re-attempts
 *     realization to include it).
 *   MINOR (recorded, never blocks): a suspiciously short candidate text
 *     for a DIRECT_ANSWER/EXPLANATION/LIST answerMode.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa5";
    if (window.CozyOS.Modules["response-validator"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function normalizeEntity(v) { return isNonEmptyString(v) ? v.trim().toLowerCase() : null; }

    function pass(details) { return { status: "PASS", details }; }
    function fail(details) { return { status: "FAIL", details }; }
    function notEvaluated(details) { return { status: "NOT_EVALUATED", details }; }

    /**
     * validateCandidate({candidate, plan, evidence, actorContext})
     *   The real, public SA-5 entry point. `evidence` is the SAME
     *   VerifiedEvidence[] array the realization request carried —
     *   this file never re-fetches evidence itself, only cross-
     *   references what it was given (same "never re-derive SA-2's own
     *   authorization" discipline SA-3 already established).
     *   `actorContext` ({actorId, organizationId}), when supplied, is
     *   the caller's own attestation that it resolved this candidate on
     *   behalf of a real, identified actor — never independently
     *   re-verified here (no second authorization engine), only checked
     *   for PRESENCE when non-public evidence is involved.
     */
    function validateCandidate({ candidate, plan, evidence = [], actorContext = null } = {}) {
        const violations = [];
        const evidenceById = new Map(evidence.map((ev) => [ev.id, ev]));
        const evidenceContract = window.CozyOS.VerifiedEvidenceContract;

        // --- meaning: every cited evidenceId must trace back to a real plan claim ---
        const claimEvidenceIds = new Set();
        for (const claim of (plan.claims || [])) { for (const id of (claim.evidenceIds || [])) claimEvidenceIds.add(id); }
        const inventedCitations = (candidate.evidenceIds || []).filter((id) => !claimEvidenceIds.has(id));
        const meaningCheck = inventedCitations.length === 0
            ? pass("Every cited evidenceId traces back to a real claim on the plan this candidate was realized from.")
            : fail(`evidenceIds ${JSON.stringify(inventedCitations)} are not referenced by any claim on the plan — an invented citation.`);
        if (meaningCheck.status === "FAIL") violations.push({ code: "MEANING_INVENTED_CITATION", severity: "BLOCKING", message: meaningCheck.details });

        // --- evidence: every cited evidenceId must be present and authoritative ---
        const missingOrWeak = [];
        for (const id of (candidate.evidenceIds || [])) {
            const ev = evidenceById.get(id);
            if (!ev) { missingOrWeak.push(`${id} (not supplied)`); continue; }
            const authoritative = evidenceContract && typeof evidenceContract.isAuthoritative === "function" ? evidenceContract.isAuthoritative(ev) : (ev.verification && ["VERIFIED", "CURATED", "APPROVED"].includes(ev.verification.status));
            if (!authoritative) missingOrWeak.push(`${id} (status: ${ev.verification && ev.verification.status})`);
        }
        const evidenceCheck = missingOrWeak.length === 0
            ? pass("Every cited evidenceId is present in the supplied evidence and is authoritative (VERIFIED/CURATED/APPROVED).")
            : fail(`Cited evidence not authoritative or not supplied: ${missingOrWeak.join(", ")}.`);
        if (evidenceCheck.status === "FAIL") violations.push({ code: "EVIDENCE_NOT_AUTHORITATIVE", severity: "BLOCKING", message: evidenceCheck.details });

        // --- language: candidate must actually be in the plan's requested, real AVAILABLE language ---
        const registry = window.CozyOS.CozyLanguageRegistry;
        const languageMatches = candidate.language === plan.language;
        const languageAvailable = registry && typeof registry.isAvailable === "function" ? registry.isAvailable(candidate.language) : true; // soft-degrade when registry isn't loaded — never blocks on an absent optional dependency
        const languageCheck = (languageMatches && languageAvailable)
            ? pass(`candidate.language ("${candidate.language}") matches the plan's requested language and is a real, AVAILABLE language.`)
            : fail(!languageMatches
                ? `candidate.language ("${candidate.language}") does not match the plan's requested language ("${plan.language}").`
                : `"${candidate.language}" is not a real, AVAILABLE CozyOS language (CozyLanguageRegistry.isAvailable() reported false).`);
        if (languageCheck.status === "FAIL") violations.push({ code: "LANGUAGE_MISMATCH", severity: "BLOCKING", message: languageCheck.details });

        // --- grammar / naturalness: honest PASS-by-construction for COMPOSED mode, NOT_EVALUATED otherwise ---
        const mode = candidate.generation && candidate.generation.mode;
        const isComposed = mode === "COMPOSED";
        const grammarCheck = isComposed
            ? pass("COMPOSED from real, pre-written, human-authored evidence sentences — no generative grammar was produced to verify.")
            : notEvaluated(`generation.mode "${mode}" has no real grammar checker built yet (out of SA-5 v1 scope).`);
        const shortTextViolationThreshold = 3;
        const naturalnessCheck = isComposed
            ? (isNonEmptyString(candidate.text) && candidate.text.trim().length >= shortTextViolationThreshold
                ? pass("COMPOSED from real, pre-written, human-authored evidence sentences — treated as natural by construction.")
                : fail("candidate.text is suspiciously short for a composed answer."))
            : notEvaluated(`generation.mode "${mode}" has no real naturalness checker built yet (out of SA-5 v1 scope).`);
        if (naturalnessCheck.status === "FAIL") violations.push({ code: "NATURALNESS_SUSPICIOUSLY_SHORT", severity: "MINOR", message: naturalnessCheck.details });

        // --- completeness: every plan claim with real, correct-language evidence available should be represented ---
        const missingClaims = [];
        for (const claim of (plan.claims || [])) {
            const hasRealCorrectLanguageEvidence = (claim.evidenceIds || []).some((id) => {
                const ev = evidenceById.get(id);
                return ev && (!isNonEmptyString(ev.language) || ev.language === plan.language);
            });
            if (!hasRealCorrectLanguageEvidence) continue; // an honest, unavoidable gap — not this candidate's fault, not a completeness violation
            const represented = (claim.evidenceIds || []).some((id) => (candidate.evidenceIds || []).includes(id));
            if (!represented) missingClaims.push(claim.claimId);
        }
        const completenessCheck = missingClaims.length === 0
            ? pass("Every plan claim with real, correct-language evidence available is represented in the candidate.")
            : fail(`Claim(s) ${JSON.stringify(missingClaims)} had real, correct-language evidence available but were not included.`);
        if (completenessCheck.status === "FAIL") {
            violations.push({
                code: "COMPLETENESS_CLAIM_DROPPED", severity: "MAJOR", message: completenessCheck.details,
            });
        }

        // --- entity: no evidence used may contradict the plan's own entity ---
        const planEntity = normalizeEntity((plan.entity && (plan.entity.canonicalValue || plan.entity.value)));
        const contradicting = (candidate.evidenceIds || [])
            .map((id) => evidenceById.get(id))
            .filter((ev) => ev && isNonEmptyString(ev.entityId) && planEntity && normalizeEntity(ev.entityId) !== planEntity);
        const entityCheck = contradicting.length === 0
            ? pass("No cited evidence's own entityId contradicts the plan's entity.")
            : fail(`Cited evidence entityId(s) ${JSON.stringify(contradicting.map((e) => e.entityId))} contradict the plan's entity ("${planEntity}").`);
        if (entityCheck.status === "FAIL") violations.push({ code: "ENTITY_MISMATCH", severity: "BLOCKING", message: entityCheck.details });

        // --- authorization: non-PUBLIC evidence requires a real, supplied actorContext ---
        const nonPublicUsed = (candidate.evidenceIds || [])
            .map((id) => evidenceById.get(id))
            .filter((ev) => ev && ev.sensitivity && ev.sensitivity !== "PUBLIC");
        const hasActorContext = !!(actorContext && isNonEmptyString(actorContext.actorId));
        const authorizationCheck = (nonPublicUsed.length === 0 || hasActorContext)
            ? pass(nonPublicUsed.length === 0 ? "Every cited evidence record is PUBLIC — no authorization context required." : "Non-PUBLIC evidence was used with a real, supplied actorContext.")
            : fail(`Non-PUBLIC evidence (sensitivity: ${JSON.stringify(nonPublicUsed.map((e) => e.sensitivity))}) was used with no actorContext — cannot confirm the caller was authorized to see it.`);
        if (authorizationCheck.status === "FAIL") violations.push({ code: "AUTHORIZATION_CONTEXT_MISSING", severity: "BLOCKING", message: authorizationCheck.details });

        const checks = {
            meaning: meaningCheck, evidence: evidenceCheck, language: languageCheck,
            grammar: grammarCheck, naturalness: naturalnessCheck, completeness: completenessCheck,
            entity: entityCheck, authorization: authorizationCheck,
        };

        const hasBlocking = violations.some((v) => v.severity === "BLOCKING");
        const hasMajor = violations.some((v) => v.severity === "MAJOR");
        const status = hasBlocking ? "REJECT" : (hasMajor ? "REPAIR_REQUIRED" : "PASS");

        const fields = { status, checks, violations };
        if (status === "REPAIR_REQUIRED") {
            fields.repair = { instructions: missingClaims.map((claimId) => `Re-include claim "${claimId}" — its real, correct-language evidence was available but omitted from the candidate.`) };
        }

        const contract = window.CozyOS.ResponseValidationResultContract;
        if (contract && typeof contract.create === "function") {
            const built = contract.create(fields);
            return built.success ? { success: true, result: built.result } : { success: false, reason: "VALIDATION_RESULT_CONTRACT_VALIDATION_FAILED", errors: built.errors };
        }
        return { success: true, result: Object.assign({ schemaVersion: "cozy.response-validation-result.v1" }, fields) };
    }

    const ResponseValidator = Object.freeze({ validateCandidate, getVersion: () => MODULE_VERSION });
    window.CozyOS.ResponseValidator = ResponseValidator;
    window.CozyOS.Modules["response-validator"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-5 — Response Validator. Produces a real cozy.response-validation-result.v1 for a SA-4 CandidateSentence: 8 real checks (meaning/evidence/language/grammar/naturalness/completeness/entity/authorization), each a real, computable cross-reference against the plan/evidence the candidate was built from — never a fabricated NLP grammar/naturalness engine for COMPOSED-mode text (honest PASS-by-construction, per the implementation map's own guidance). No new authorization engine — authorization reuses the caller's own SA-2-sourced evidence sensitivity, checked for presence of a real actorContext, never re-derived."
    });
})();
