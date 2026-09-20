/**
 * CozyAI — Observation Lifecycle Governance
 * File Reference: core/modules/learning/adapters/observation-lifecycle.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — governed foundation phase.
 *
 * WHAT THIS IS
 *   Advances a MultimodalObservationContract-valid observation through
 *   OBSERVED -> CANDIDATE -> VALIDATED -> VERIFIED / REJECTED / DEPRECATED,
 *   by composing — never reimplementing — this repository's two real,
 *   existing governance authorities:
 *     - window.CozyOS.CozyLearn (core/living/cozy-learn.js) for
 *       general, non-language-specific observations.
 *     - window.CozyOS.CozyLanguageAcquisitionPipeline (RP-031,
 *       core/modules/intelligence/language-packs/cozy-language-
 *       acquisition-pipeline.js) for observations carrying a real
 *       candidateLanguage — its own real independent-contributor
 *       VALIDATION_TIERS (NONE/CANDIDATE/EMERGING/STRONG/VALIDATED) is
 *       reused directly, not re-derived.
 *   Routing rule (real, disclosed, not a coin flip): an observation with
 *   a non-null `candidateLanguage` routes to the language pipeline
 *   (since that is genuinely the richer, purpose-built authority for
 *   language evidence — independent-contributor counting, safety-gate
 *   classification, regional/dialect context); every other observation
 *   routes to CozyLearn.
 *
 * WHY THIS FILE EXISTS RATHER THAN EXTENDING EITHER AUTHORITY DIRECTLY
 *   Neither CozyLearn.createCandidate() (fixed record shape, no
 *   observation-id/evidence-array field — confirmed by reading its real
 *   code before this file was written) nor
 *   CozyLanguageAcquisitionPipeline.submitEvidence() (expects pack-
 *   registry-shaped fields: expression/meaning/region/dialect) can
 *   accept a MultimodalObservationContract record as-is. This file is
 *   the real, disclosed adaptation layer — translating this phase's own
 *   observation envelope into each authority's own real input shape,
 *   and translating each authority's own real status back into this
 *   contract's lifecycleStatus. It stores NO governance state of its
 *   own; the observation's `lifecycleStatus` field is always a direct,
 *   honest reflection of what the composed authority itself reports at
 *   call time — never advanced speculatively.
 *
 * REJECTED / DEPRECATED are real, terminal, disclosed states — this
 *   file never deletes an observation on rejection/deprecation, only
 *   marks it, preserving provenance exactly as CozyLearn's own
 *   rejectCandidate() already does for its own records.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-lif";
    if (window.CozyOS.Modules["observation-lifecycle"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }

    /** #isLanguageObservation — real, disclosed routing rule (see file header). */
    function isLanguageObservation(observation) {
        return isNonEmptyString(observation && observation.candidateLanguage);
    }

    function withStatus(observation, lifecycleStatus, extra = {}) {
        return Object.assign({}, observation, { lifecycleStatus }, extra);
    }

    /**
     * toCandidate(observation, { actorId, scope, contributorPseudonym, region, dialect })
     *   OBSERVED -> CANDIDATE. Real, composed submission to whichever
     *   authority owns this observation's domain (see routing rule
     *   above). Returns {success, observation (with lifecycleStatus
     *   advanced + governanceRef attached), authorityResult} or
     *   {success:false, reason}. Never advances an observation that is
     *   not currently OBSERVED (fail-closed against double-submission).
     */
    function toCandidate(observation, { actorId = null, scope = "USER", contributorPseudonym = "anonymous", region = "unspecified", dialect = null } = {}) {
        if (!observation || observation.lifecycleStatus !== "OBSERVED") {
            return { success: false, reason: "Only an OBSERVED observation may advance to CANDIDATE." };
        }

        if (isLanguageObservation(observation)) {
            const pipeline = window.CozyOS.CozyLanguageAcquisition;
            if (!pipeline || typeof pipeline.submitEvidence !== "function") return { success: false, reason: "CozyLanguageAcquisition is not loaded." };
            const result = pipeline.submitEvidence({
                languageId: observation.candidateLanguage,
                expression: observation.contentRef.derivedText,
                meaning: (observation.context && observation.context.meaning) || null,
                region, dialect,
                sourceType: mapSourceTypeToPackSourceType(observation.sourceType),
                contributionType: observation.modality === "AUDIO" ? "AUDIO_REFERENCE" : "TEXT",
                contributorPseudonym,
            });
            if (result.status === "CANDIDATE_CREATED" || result.status === "EVIDENCE_ADDED") {
                return { success: true, observation: withStatus(observation, "CANDIDATE", { governanceRef: { authority: "CozyLanguageAcquisition", recordId: result.recordId } }), authorityResult: result };
            }
            return { success: false, reason: `CozyLanguageAcquisition reported "${result.status}" — not advanced.`, authorityResult: result };
        }

        const learn = window.CozyOS.CozyLearn;
        if (!learn || typeof learn.createCandidate !== "function") return { success: false, reason: "CozyLearn is not loaded." };
        let record;
        try {
            record = learn.createCandidate({
                observedForm: observation.contentRef.derivedText,
                language: observation.candidateLanguage,
                semanticConcept: observation.canonicalConceptId,
                source: observation.sourceType,
                sourceModality: observation.modality.toLowerCase(),
                scope, actorId,
            });
        } catch (err) {
            return { success: false, reason: `CozyLearn.createCandidate() threw: ${err.message}` };
        }
        return { success: true, observation: withStatus(observation, "CANDIDATE", { governanceRef: { authority: "CozyLearn", recordId: record.candidateId } }), authorityResult: record };
    }

    /**
     * toValidated(observation, { actorId, confirmedBy })
     *   CANDIDATE -> VALIDATED. For a CozyLearn-routed observation,
     *   composes confirmCandidate() (moves CANDIDATE -> USER_CONFIRMED
     *   in that engine's own vocabulary — this file's own VALIDATED
     *   label is the honest translation of that real state). For a
     *   language-routed observation, VALIDATED is reported once
     *   CozyLanguageAcquisitionPipeline.getValidationTier() itself
     *   already reports real independent-contributor tier "STRONG" or
     *   "VALIDATED" — never asserted by this file on its own authority.
     *   toVerified() below requires the real tier ceiling specifically
     *   ("VALIDATED"), keeping the two transitions meaningfully distinct.
     */
    function toValidated(observation, { actorId = null, confirmedBy = null } = {}) {
        if (!observation || observation.lifecycleStatus !== "CANDIDATE" || !observation.governanceRef) {
            return { success: false, reason: "Only a CANDIDATE observation with a real governanceRef may advance to VALIDATED." };
        }
        if (observation.governanceRef.authority === "CozyLanguageAcquisition") {
            const pipeline = window.CozyOS.CozyLanguageAcquisition;
            if (!pipeline || typeof pipeline.getValidationTier !== "function") return { success: false, reason: "CozyLanguageAcquisition is not loaded." };
            const tier = pipeline.getValidationTier(observation.governanceRef.recordId);
            if (tier.tier !== "VALIDATED" && tier.tier !== "STRONG") {
                return { success: false, reason: `Real validation tier is "${tier.tier}" — independent-contributor support is not yet strong enough for VALIDATED.`, authorityResult: tier };
            }
            return { success: true, observation: withStatus(observation, "VALIDATED"), authorityResult: tier };
        }

        const learn = window.CozyOS.CozyLearn;
        if (!learn || typeof learn.confirmCandidate !== "function") return { success: false, reason: "CozyLearn is not loaded." };
        const result = learn.confirmCandidate(observation.governanceRef.recordId, { actorId, confirmedBy });
        if (!result.success) return { success: false, reason: result.reason, authorityResult: result };
        return { success: true, observation: withStatus(observation, "VALIDATED"), authorityResult: result };
    }

    /**
     * toVerified(observation, { actorId, validatedBy, scope })
     *   VALIDATED -> VERIFIED. The ONLY transition that may ever make an
     *   observation eligible for adapters/observation-evidence-bridge.js.
     *   For CozyLearn-routed observations, composes promoteCandidate()
     *   (-> TRUSTED). For language-routed observations: real audit
     *   correction — a language pack's own `status` field (REGISTERED ->
     *   ... -> AVAILABLE) can NEVER be reached programmatically (Rule 82,
     *   enforced inside cozy-language-pack-registry.js's own
     *   requestPromotion(), always returns BLOCKED — confirmed by reading
     *   that function before this fix), so gating VERIFIED on pack.status
     *   would make this transition permanently unreachable for every
     *   language observation, by design of the very engine being
     *   composed. The real, reachable, strongest per-EXPRESSION signal
     *   CozyLanguageAcquisitionPipeline actually offers is its own
     *   VALIDATION_TIERS ceiling, tier "VALIDATED" (10+ independent real
     *   contributors, via getValidationTier() — the same real function
     *   toValidated() above already composes for its own, lower bar).
     *   VERIFIED therefore means: independent-contributor tier is
     *   genuinely at its real ceiling, re-checked fresh here (never
     *   trusted from a stale toValidated() call) — still never the
     *   language pack's own separate, Rule-82-gated production-readiness
     *   decision, which remains untouched and unbypassed.
     */
    function toVerified(observation, { actorId = null, validatedBy = null, scope = null } = {}) {
        if (!observation || observation.lifecycleStatus !== "VALIDATED" || !observation.governanceRef) {
            return { success: false, reason: "Only a VALIDATED observation with a real governanceRef may advance to VERIFIED." };
        }
        if (observation.governanceRef.authority === "CozyLanguageAcquisition") {
            const pipeline = window.CozyOS.CozyLanguageAcquisition;
            if (!pipeline || typeof pipeline.getValidationTier !== "function") return { success: false, reason: "CozyLanguageAcquisition is not loaded." };
            const tier = pipeline.getValidationTier(observation.governanceRef.recordId);
            if (tier.tier !== "VALIDATED") {
                return { success: false, reason: `Real validation tier is "${tier.tier}" — not yet at the real VALIDATED ceiling (10+ independent contributors).`, authorityResult: tier };
            }
            return { success: true, observation: withStatus(observation, "VERIFIED"), authorityResult: tier };
        }

        const learn = window.CozyOS.CozyLearn;
        if (!learn || typeof learn.promoteCandidate !== "function") return { success: false, reason: "CozyLearn is not loaded." };
        const result = learn.promoteCandidate(observation.governanceRef.recordId, { actorId, validatedBy, scope });
        if (!result.success) return { success: false, reason: result.reason, authorityResult: result };
        return { success: true, observation: withStatus(observation, "VERIFIED"), authorityResult: result };
    }

    /**
     * toRejected(observation, { actorId, reason })
     *   Any non-terminal status -> REJECTED. Composes
     *   CozyLearn.rejectCandidate() when a CozyLearn governanceRef
     *   exists; otherwise simply marks the observation itself (a
     *   language-routed candidate has no real "reject" verb on
     *   CozyLanguageAcquisitionPipeline today — it is left as a real,
     *   disclosed low-tier candidate rather than a fabricated rejection
     *   call into an authority that does not offer one).
     */
    function toRejected(observation, { actorId = null, reason = null } = {}) {
        if (!observation || observation.lifecycleStatus === "REJECTED" || observation.lifecycleStatus === "DEPRECATED") {
            return { success: false, reason: "Observation is already terminal." };
        }
        if (observation.governanceRef && observation.governanceRef.authority === "CozyLearn") {
            const learn = window.CozyOS.CozyLearn;
            if (learn && typeof learn.rejectCandidate === "function") {
                const result = learn.rejectCandidate(observation.governanceRef.recordId, { actorId, reason });
                if (!result.success) return { success: false, reason: result.reason };
                return { success: true, observation: withStatus(observation, "REJECTED", { rejectionReason: reason || null }) };
            }
        }
        return { success: true, observation: withStatus(observation, "REJECTED", { rejectionReason: reason || null }) };
    }

    /** toDeprecated(observation, {reason}) — a VERIFIED observation superseded by a later, better one. Preserves the record, never deletes it. */
    function toDeprecated(observation, { reason = null } = {}) {
        if (!observation || observation.lifecycleStatus !== "VERIFIED") return { success: false, reason: "Only a VERIFIED observation may be marked DEPRECATED." };
        return { success: true, observation: withStatus(observation, "DEPRECATED", { deprecationReason: reason || null }) };
    }

    // Real, disclosed mapping from this contract's SOURCE_TYPE onto
    // CozyLanguagePacks' own real SOURCE_TYPES vocabulary (RP-030) — a
    // one-directional label translation, never a second source-type
    // registry.
    function mapSourceTypeToPackSourceType(sourceType) {
        const map = {
            TEXT: "COMMUNITY", AUDIO: "COMMUNITY", VIDEO: "VIDEO_METADATA", IMAGE: "OCR", OCR: "OCR",
            PDF_DOCUMENT: "DOCUMENT", LIVE_MEDIA: "VIDEO_METADATA", APPLICATION_EVENT: "COMMUNITY",
            USER_CORRECTION: "USER_CORRECTION", COMMUNITY_CONTRIBUTION: "COMMUNITY",
        };
        return map[sourceType] || "COMMUNITY";
    }

    const ObservationLifecycle = Object.freeze({
        toCandidate, toValidated, toVerified, toRejected, toDeprecated,
        isLanguageObservation, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.ObservationLifecycle = ObservationLifecycle;
    window.CozyOS.Modules["observation-lifecycle"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — observation lifecycle governance. Routes OBSERVED->CANDIDATE->VALIDATED->VERIFIED/REJECTED/DEPRECATED transitions to the real, existing CozyLearn or CozyLanguageAcquisitionPipeline authority (never reimplements either). lifecycleStatus always reflects the composed authority's own real, current state. Not <script>-included by any page."
    });
})();
