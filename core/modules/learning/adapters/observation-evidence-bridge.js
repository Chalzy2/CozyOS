/**
 * CozyAI — Observation-to-VerifiedEvidence Bridge
 * File Reference: core/modules/learning/adapters/observation-evidence-bridge.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — governed foundation phase.
 *
 * WHAT THIS IS
 *   The single, disclosed point where a governed observation becomes
 *   available to the rest of CozyAI's real cognitive pipeline
 *   (CognitiveCoordinator -> SemanticIntentEngine -> SemanticAnswerPlanner
 *   -> VerifiedEvidence -> Live Window), per this phase's own
 *   "COZYAI INTEGRATION" requirement: "do not bypass the existing
 *   cognitive pipeline." Composes SA-1's real, existing, frozen
 *   window.CozyOS.VerifiedEvidenceContract.create() directly — this
 *   file adds NO method to SA-2's own verified-evidence-adapter.js (a
 *   certified, frozen file per the SA-3B directive) and modifies
 *   nothing in core/modules/intelligence/semantic-answer/. SA-1's own
 *   contract deliberately keeps `source.type` an OPEN string for
 *   exactly this reason (confirmed by reading that file's own header
 *   before writing this one: "SA-2 is what decides the real, disclosed
 *   set of source types it actually produces — this contract does not
 *   prematurely narrow that"). This bridge uses "LANGUAGE_FOUNDATION" —
 *   a source-type label SA-2's own header already named as a considered-
 *   but-not-yet-implemented future evidence source ("no real evidence
 *   source of either kind exists yet... left honestly absent") — this
 *   phase is exactly that real source, finally implemented, without
 *   touching SA-2's own frozen file.
 *
 * ONLY VERIFIED OBSERVATIONS MAY BECOME EVIDENCE
 *   toVerifiedEvidence() refuses any observation whose lifecycleStatus
 *   is not literally "VERIFIED" (adapters/observation-lifecycle.js's
 *   own real, composed governance decision — never this file's own
 *   judgment). This is the direct enforcement of "do not promote
 *   observation directly to verified knowledge."
 *
 * VERIFICATION STATUS — deliberately CURATED, not SA-1's "VERIFIED"
 *   SA-1's own VerifiedEvidenceContract.VERIFICATION_STATUS enum has a
 *   "VERIFIED" value too, but that value is reserved (see SA-2's own
 *   real, disclosed convention) for platform-authored/committed facts
 *   (CozyKnowledge). A multimodal observation — however thoroughly
 *   governed by CozyLearn/CozyLanguageAcquisitionPipeline — is real,
 *   human/community-curated knowledge, not platform-committed data.
 *   This bridge maps our lifecycle's "VERIFIED" onto SA-1's "CURATED"
 *   status (real, human-saved, trusted, but not authored-by-the-
 *   platform-itself) — the exact same honest distinction SA-2's own
 *   cozy-memory-adapter.js already makes for CozyMemory-backed
 *   evidence. Never inflated.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-lif";
    const SOURCE_TYPE = "LANGUAGE_FOUNDATION";
    if (window.CozyOS.Modules["observation-evidence-bridge"]) return;

    // Real, disclosed mapping from this contract's LEARNING_SCOPE onto
    // SA-1's own SENSITIVITY enum — never a second sensitivity taxonomy.
    function sensitivityForScope(learningScope) {
        if (learningScope === "PERSONAL") return "PRIVATE";
        return "PUBLIC"; // COMMUNITY_CANDIDATE / VERIFIED_GLOBAL — community-facing, sensitivity is about visibility, not trust tier
    }

    /**
     * toVerifiedEvidence(observation, {confidence})
     *   observation: a real MultimodalObservationContract record whose
     *   lifecycleStatus is "VERIFIED" (see adapters/observation-
     *   lifecycle.js's toVerified()). confidence: HIGH/MEDIUM/LOW —
     *   this file never invents a number; caller supplies it (typically
     *   derived from the real governance authorityResult, e.g. a
     *   CozyLanguageAcquisitionPipeline tier or CozyLearn's own
     *   confirmations count) or it defaults to "MEDIUM" (governed, but
     *   this bridge itself has no independent basis for HIGH/LOW).
     */
    function toVerifiedEvidence(observation, { confidence = "MEDIUM" } = {}) {
        if (!observation || observation.lifecycleStatus !== "VERIFIED") {
            return { success: false, reason: "NOT_VERIFIED", errors: ["Only an observation whose real, governed lifecycleStatus is VERIFIED may become VerifiedEvidence."] };
        }
        const evidenceContract = window.CozyOS.VerifiedEvidenceContract;
        if (!evidenceContract || typeof evidenceContract.create !== "function") {
            return { success: false, reason: "VerifiedEvidenceContract is not loaded." };
        }
        const built = evidenceContract.create({
            id: `multimodal-observation:${observation.observationId}`,
            claim: observation.contentRef.derivedText,
            source: { type: SOURCE_TYPE, id: observation.observationId, path: observation.canonicalConceptId ? `canonical-concept:${observation.canonicalConceptId}` : undefined },
            verification: { status: "CURATED", confidence },
            sensitivity: sensitivityForScope(observation.learningScope),
            language: observation.candidateLanguage || undefined,
            entityId: observation.canonicalConceptId || undefined,
            provenance: `multimodal-observation-adapter:${observation.sourceType}:${observation.provenance.application}`,
        });
        if (!built.success) return { success: false, reason: "CONTRACT_VALIDATION_FAILED", errors: built.errors };
        return { success: true, evidence: built.evidence };
    }

    const ObservationEvidenceBridge = Object.freeze({
        SOURCE_TYPE, toVerifiedEvidence, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.ObservationEvidenceBridge = ObservationEvidenceBridge;
    window.CozyOS.Modules["observation-evidence-bridge"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — bridges a real, governed, VERIFIED observation into a real, SA-1-contract-valid VerifiedEvidence record (source.type=\"LANGUAGE_FOUNDATION\", verification.status=\"CURATED\"). Refuses any non-VERIFIED observation. Composes VerifiedEvidenceContract.create() directly; does not modify SA-1/SA-2 files. Not <script>-included by any page."
    });
})();
