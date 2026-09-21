/**
 * CozyAI — Repair Loop (SA-6)
 * File Reference: core/modules/intelligence/semantic-answer/repair/repair-loop.js
 *
 * WHAT THIS IS
 *   The bounded "candidate is provisional until it passes validation"
 *   loop the spec requires: realize (SA-4) -> validate (SA-5) -> if
 *   REPAIR_REQUIRED, repair/reconstruct -> validate again -> only then
 *   return. Composes SA-4/SA-5 exclusively — no new realization logic,
 *   no new validation logic, no second AI.
 *
 * REPAIR STRATEGY — real, disclosed, narrow
 *   The only REPAIR_REQUIRED case SA-5 ever produces today is
 *   COMPLETENESS_CLAIM_DROPPED (a claim had real, correct-language
 *   evidence available but the candidate didn't include it). SA-4's own
 *   realizer already includes every claim it has matching evidence for
 *   by construction — so the real, honest repair action is: re-invoke
 *   the SAME realizer against the SAME request (same real plan, same
 *   real evidence — never different, never freshly invented content),
 *   tagging the result GENERATION_MODE "REPAIRED" rather than
 *   "COMPOSED" so the provenance trail honestly shows this was a
 *   second attempt. This is deliberately narrow: it is the correct,
 *   real fix for today's one real repairable violation class, not a
 *   general-purpose "keep guessing until it passes" loop — if a repair
 *   attempt still fails validation, this file gives up honestly (see
 *   maxAttempts below) rather than trying arbitrary alternate
 *   strategies that were never asked for.
 *
 * BOUNDED, NEVER INFINITE
 *   maxAttempts defaults to 3 (1 initial + 2 repair attempts). Every
 *   attempt is counted and returned in diagnostics. A REJECT (BLOCKING
 *   violation) never enters the repair loop at all — SA-5's own
 *   severity model already says a BLOCKING violation is not
 *   repairable by re-attempting realization from the same evidence
 *   (e.g. an invented citation, wrong language, wrong entity, missing
 *   authorization) — those are real defects in the request itself, not
 *   something a repair pass can fix, and are returned immediately,
 *   honestly, as REJECTED.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa6";
    if (window.CozyOS.Modules["repair-loop"]) return;

    const DEFAULT_MAX_ATTEMPTS = 3;

    function rebuildAsRepaired(candidate, attempt) {
        const contract = window.CozyOS.CandidateSentenceContract;
        const fields = Object.assign({}, candidate, {
            generation: Object.assign({}, candidate.generation, { mode: "REPAIRED", attempt }),
        });
        if (contract && typeof contract.create === "function") {
            const built = contract.create(fields);
            return built.success ? built.candidate : candidate; // honest degrade — never blocks the loop over a re-tagging failure
        }
        return fields;
    }

    /**
     * realizeValidated(request, {actorContext, maxAttempts})
     *   The real, public SA-6 entry point. Returns the FINAL outcome —
     *   never an intermediate/provisional candidate. Never throws.
     *
     *   Success: {success:true, candidate, validation, attempts}
     *   Failure: {success:false, reason, attempts, ...diagnostics} where
     *     reason is one of "REALIZATION_FAILED" (SA-4 itself could not
     *     produce a candidate — e.g. NO_REALIZABLE_EVIDENCE_IN_LANGUAGE;
     *     the real realizer error is carried through, never repackaged
     *     as a repair failure), "REJECTED" (SA-5 found a BLOCKING
     *     violation — not repairable), or
     *     "MAX_REPAIR_ATTEMPTS_EXCEEDED" (genuinely tried, genuinely
     *     still REPAIR_REQUIRED after every attempt — an honest give-up,
     *     never a fabricated PASS).
     */
    function realizeValidated({ request, actorContext = null, maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
        const realizer = window.CozyOS.LanguageRealizer;
        const validator = window.CozyOS.ResponseValidator;
        if (!realizer || typeof realizer.realizeCandidateSentence !== "function") {
            return { success: false, reason: "LANGUAGE_REALIZER_NOT_LOADED", attempts: 0 };
        }
        if (!validator || typeof validator.validateCandidate !== "function") {
            return { success: false, reason: "RESPONSE_VALIDATOR_NOT_LOADED", attempts: 0 };
        }

        let attempt = 1;
        let lastValidationResult = null;
        let lastCandidate = null;

        while (attempt <= maxAttempts) {
            const realized = realizer.realizeCandidateSentence(request, { attempt });
            if (!realized.success) {
                return { success: false, reason: "REALIZATION_FAILED", attempts: attempt, realizationError: realized };
            }

            const candidate = attempt === 1 ? realized.candidate : rebuildAsRepaired(realized.candidate, attempt);
            const validated = validator.validateCandidate({ candidate, plan: request.semanticPlan, evidence: request.evidence, actorContext });
            if (!validated.success) {
                return { success: false, reason: "VALIDATION_FAILED", attempts: attempt, validationError: validated };
            }

            lastValidationResult = validated.result;
            lastCandidate = candidate;

            if (validated.result.status === "PASS") {
                return { success: true, candidate, validation: validated.result, attempts: attempt };
            }
            if (validated.result.status === "REJECT") {
                return { success: false, reason: "REJECTED", attempts: attempt, validation: validated.result, candidate };
            }
            // REPAIR_REQUIRED — real, disclosed re-attempt (see this
            // file's own header). Loop continues; the request itself
            // (same real plan, same real evidence) never changes.
            attempt++;
        }

        return {
            success: false, reason: "MAX_REPAIR_ATTEMPTS_EXCEEDED", attempts: maxAttempts,
            lastValidation: lastValidationResult, lastCandidate,
        };
    }

    const RepairLoop = Object.freeze({ realizeValidated, getVersion: () => MODULE_VERSION });
    window.CozyOS.RepairLoop = RepairLoop;
    window.CozyOS.Modules["repair-loop"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-6 — Repair Loop. Composes SA-4 (LanguageRealizer) + SA-5 (ResponseValidator) into one bounded realize->validate->repair->validate cycle (default max 3 attempts). A REJECT (BLOCKING violation) never enters the loop — those are real request defects, not repairable by re-realizing the same evidence. A REPAIR_REQUIRED (MAJOR violation, e.g. a claim with real evidence dropped) re-invokes the SAME realizer against the SAME request, tagged GENERATION_MODE REPAIRED. Never fabricates a PASS — genuinely exhausting all attempts returns an honest MAX_REPAIR_ATTEMPTS_EXCEEDED failure. No new AI, no new realization/validation logic of its own."
    });
})();
