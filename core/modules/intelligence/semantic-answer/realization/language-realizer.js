/**
 * CozyAI — Language Realizer (SA-4)
 * File Reference: core/modules/intelligence/semantic-answer/realization/language-realizer.js
 *
 * WHAT THIS IS
 *   The "Cozy Construction Sentence" realizer: turns a validated
 *   cozy.language-realization-request.v1 (SA-1's LanguageRealizationRequestContract
 *   — a real SemanticAnswerPlan + real VerifiedEvidence, both already
 *   built by SA-2/SA-3) into a real cozy.candidate-sentence.v1
 *   (CandidateSentenceContract). This is the file the whole SA-1..SA-3
 *   foundation was built for and that never existed until now (confirmed
 *   absent by direct repo search before writing this file).
 *
 * THE NON-NEGOTIABLE RULE THIS FILE EXISTS TO SATISFY
 *   useOnlyEvidence=true (LanguageRealizationRequestContract's own fixed
 *   constraint) means: construct the target-language sentence FROM the
 *   plan's claims + their real evidence — never select one pre-written
 *   `*Sw`/`*En` string as "the answer" for a (goal, language) pair, and
 *   never generate English first and translate second. Concretely:
 *
 *     - Each claim's TEXT comes from evidence.claim, ALREADY real,
 *       committed content in the target language (e.g. a real
 *       `humanBenefitsSw` array item — a human-authored Kiswahili
 *       sentence, never a translation of the English sibling produced
 *       at answer time).
 *     - This file's own contribution is COMPOSITION: selecting which
 *       claims to include (all of the plan's claims, in order),
 *       introducing them naturally when there is more than one (a
 *       fixed, disclosed, per-goal, per-language INTRO sentence — see
 *       "semantic-answer:intro:*" in cozy-language-templates.js,
 *       composed via the EXISTING Phase 4 universal realization seam,
 *       window.CozyOS.CozyLanguageRealize — never a second template
 *       store), and joining them into one coherent CandidateSentence.
 *       GENERATION_MODE is therefore "COMPOSED" (join/template already-
 *       VERIFIED evidence text) — the real, disclosed SA-4 starting
 *       point per the implementation map, never "MODEL_GENERATED"
 *       (that is explicitly SA-8 scope, not built here).
 *     - If a claim's own evidence is NOT actually in the requested
 *       language (should not happen given SA-3 already filters evidence
 *       by requested language before building a plan, but checked here
 *       too — defense in depth, never trusted blindly), that claim is
 *       honestly dropped rather than silently included in the wrong
 *       language. If EVERY claim's evidence turns out to be in the
 *       wrong language, this file returns a real, disclosed failure
 *       (NO_REALIZABLE_EVIDENCE_IN_LANGUAGE) — never a fabricated
 *       sentence, never an English fallback dressed as Kiswahili.
 *
 * WHAT THIS FILE DOES NOT DO
 *   No new AI, no new template store, no machine translation, no
 *   second Live Window. It composes exactly two existing things: SA-1's
 *   contracts (structure/validation) and Phase 4's CozyLanguageRealize
 *   seam (the intro-sentence lookup only — never the claim content
 *   itself, which always comes from real evidence). It does not decide
 *   goal/entity/claims (SA-3's job) and does not decide whether a
 *   candidate is good enough to show a user (SA-5's job).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-sa4";
    if (window.CozyOS.Modules["language-realizer"]) return;

    let nextPlanIdSeq = 1;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /**
     * generatePlanId(plan) — CandidateSentence.sourcePlanId must
     * reference the plan it was realized from, but SA-1's
     * SemanticAnswerPlanContract deliberately carries no `id` field of
     * its own (a plan is a value, not a stored entity — see that
     * contract's own header). This synthesizes a real, disclosed,
     * human-readable reference tag from the plan's own real fields
     * (goal + entity + a monotonic sequence, never a random/opaque id)
     * — good enough to trace a candidate back to what produced it in
     * diagnostics/logs, never treated as a stored, durable identifier.
     */
    function generatePlanId(plan) {
        const entityPart = (plan.entity && isNonEmptyString(plan.entity.value)) ? plan.entity.value : "unknown-entity";
        return `plan:${plan.goal}:${entityPart}:${nextPlanIdSeq++}`;
    }

    function realizeSeam() {
        const c = window.CozyOS;
        return c && c.CozyLanguageRealize;
    }

    /** introFor(goal, language) — real, disclosed, composed via the existing Phase 4 seam. null when no intro exists for this goal (e.g. DEFINITION with a single claim needs none) or the seam/key isn't available — callers must degrade honestly, never fabricate an intro. */
    function introFor(goal, language) {
        const seam = realizeSeam();
        if (!seam) return null;
        return seam.realize(`semantic-answer:intro:${goal}`, language) || null;
    }

    /**
     * composeClaims(pieces, goal, language)
     *   Real COMPOSED-mode construction: a single claim is returned
     *   verbatim (it is already a real, complete, human-authored
     *   sentence in the target language — adding an intro would only
     *   dilute it). Multiple claims get a real, disclosed per-goal intro
     *   (see introFor()) followed by each claim sentence, joined with a
     *   period — never a fabricated grammatical merge, only real,
     *   already-verified sentences placed next to each other honestly.
     */
    function composeClaims(pieces, goal, language) {
        if (pieces.length === 1) return pieces[0];
        const intro = introFor(goal, language);
        const body = pieces.map((p) => p.trim().replace(/\.+$/, "")).join(". ") + ".";
        return intro ? `${intro} ${body}` : body;
    }

    /**
     * realizeCandidateSentence(request, {attempt})
     *   The real, public SA-4 entry point. `request` must already be a
     *   real cozy.language-realization-request.v1 object (built via
     *   LanguageRealizationRequestContract.create({language, semanticPlan,
     *   evidence}) by the caller — this file never builds its own
     *   request; SA-7 is responsible for that composition). Re-validates
     *   defensively (never trusts a caller-supplied shape blindly) before
     *   doing any real work. Never throws.
     */
    function realizeCandidateSentence(request, options = {}) {
        const reqContract = window.CozyOS.LanguageRealizationRequestContract;
        if (reqContract && typeof reqContract.validate === "function") {
            const v = reqContract.validate(request);
            if (!v.valid) return { success: false, reason: "INVALID_REALIZATION_REQUEST", errors: v.errors };
        } else if (!request || typeof request !== "object") {
            return { success: false, reason: "INVALID_REALIZATION_REQUEST", errors: ["request must be a real object."] };
        }

        const plan = request.semanticPlan;
        const language = request.language.languageId;
        const attempt = (Number.isInteger(options.attempt) && options.attempt > 0) ? options.attempt : 1;

        const evidenceById = new Map();
        for (const ev of request.evidence || []) { if (ev && ev.id) evidenceById.set(ev.id, ev); }

        // Zero-claim plans (CLARIFICATION/UNKNOWN — SA-1's own only
        // allowed zero-claim goals). No evidence to construct from by
        // definition; compose an honest, real, already-existing
        // disclosure via the seam rather than inventing new copy here.
        if (!Array.isArray(plan.claims) || plan.claims.length === 0) {
            const seam = realizeSeam();
            const clarificationQuestion = plan.conversationContext && isNonEmptyString(plan.conversationContext.clarificationQuestion)
                ? plan.conversationContext.clarificationQuestion : null;
            const text = clarificationQuestion
                || (seam && seam.realize(plan.goal === "CLARIFICATION" ? "unsupported-clarify" : "unsupported", language))
                || (seam && seam.realize("unsupported", language));
            if (!isNonEmptyString(text)) return { success: false, reason: "NO_REALIZABLE_CONTENT", errors: ["No clarification question and the realize seam is not loaded."] };
            const built = buildCandidate({ text, language, plan, evidenceIds: [], attempt });
            return built;
        }

        const pieces = [];
        const usedEvidenceIds = [];
        for (const claim of plan.claims) {
            const ev = (claim.evidenceIds || []).map((id) => evidenceById.get(id)).find(Boolean);
            if (!ev) continue; // honest skip — no matching evidence record was supplied for this claim
            if (isNonEmptyString(ev.language) && ev.language !== language) continue; // honest skip — defense in depth, see file header
            if (!isNonEmptyString(ev.claim)) continue;
            pieces.push(ev.claim);
            usedEvidenceIds.push(ev.id);
        }

        if (pieces.length === 0) {
            const seam = realizeSeam();
            const fallback = seam && seam.realize("semantic-answer:no-realizable-evidence", language);
            return {
                success: false, reason: "NO_REALIZABLE_EVIDENCE_IN_LANGUAGE",
                honestFallbackText: fallback || null,
            };
        }

        const text = composeClaims(pieces, plan.goal, language);
        return buildCandidate({ text, language, plan, evidenceIds: usedEvidenceIds, attempt });
    }

    function buildCandidate({ text, language, plan, evidenceIds, attempt }) {
        const contract = window.CozyOS.CandidateSentenceContract;
        const fields = {
            text, language,
            sourcePlanId: generatePlanId(plan),
            evidenceIds,
            generation: { mode: "COMPOSED", provider: "language-realizer", attempt },
        };
        if (contract && typeof contract.create === "function") {
            const built = contract.create(fields);
            return built.success ? { success: true, candidate: built.candidate } : { success: false, reason: "CANDIDATE_CONTRACT_VALIDATION_FAILED", errors: built.errors };
        }
        return { success: true, candidate: Object.assign({ schemaVersion: "cozy.candidate-sentence.v1" }, fields) };
    }

    const LanguageRealizer = Object.freeze({
        realizeCandidateSentence, introFor, composeClaims, generatePlanId,
        getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.LanguageRealizer = LanguageRealizer;
    window.CozyOS.Modules["language-realizer"] = Object.freeze({
        version: MODULE_VERSION,
        description: "SA-4 — Language Realizer (\"Cozy Construction Sentence\" realization). Constructs a real cozy.candidate-sentence.v1 directly in the target language from a validated LanguageRealizationRequest's real claims + real, already-target-language VerifiedEvidence — never English-generated-then-translated, never a stored-answer lookup. Composes SA-1's contracts and Phase 4's CozyLanguageRealize seam (intro sentences only, never claim content) — no new AI, no new template store, no machine translation. GENERATION_MODE is always COMPOSED (join already-VERIFIED evidence text); MODEL_GENERATED realization is explicitly out of scope (SA-8)."
    });
})();
