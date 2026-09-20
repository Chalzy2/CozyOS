/**
 * CozyAI — Multimodal Observation Contract
 * File Reference: core/modules/learning/contracts/multimodal-observation-contract.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — governed foundation phase.
 *
 * WHAT THIS IS
 *   A versioned, structural contract (`cozy.ai.multimodal-observation.v1`),
 *   same convention as SA-1's contracts (schemaVersion + validate() +
 *   create()). Defines the shape a real observation — from text, audio,
 *   video, OCR, a PDF/document, authorized in-app live media, an
 *   application event, a user correction, or a community contribution —
 *   must have to be tracked by the governed learning layer.
 *
 * REPOSITORY REALITY CHECK THIS FILE IS BUILT ON (confirmed by direct
 * reading before this file was written, not assumed)
 *   core/modules/learning/multimodal-observation-core.js already
 *   implements the real cross-modal (visual vs audio) text-similarity
 *   matching and a `LearningObservation` structure
 *   ({observationId, userId, timestamp, visual, audio, context,
 *   translation, matching:{visualAudioMatch, combinedConfidence},
 *   verification:{status,evidence}, learning:{status,version}}). This
 *   contract does NOT reimplement that matching logic — see
 *   adapters/observation-adapter.js, which composes
 *   MultimodalObservationCore.buildObservation()/decideLearningAction()
 *   directly and wraps their real output in this contract's envelope.
 *   This file only adds the governance fields that engine's own
 *   `LearningObservation` shape does not carry: a closed source-type
 *   taxonomy, explicit consent/authorization state (fail-closed —
 *   see validate() below), a learning-governance scope, and the
 *   OBSERVED/CANDIDATE/VALIDATED/VERIFIED/REJECTED/DEPRECATED lifecycle
 *   this phase's own spec requires. `evidenceState` below is a direct,
 *   disclosed mirror of that engine's own `matching` shape — not a
 *   competing definition of confidence.
 *
 * LANGUAGE — never hard-coded to two languages
 *   `candidateLanguage` is a plain, open languageId string (e.g. "sw",
 *   "en") — this file does not define, validate against, or duplicate a
 *   language list. The canonical language authority remains
 *   window.CozyOS.CozyLanguagePacks (RP-030, core/modules/intelligence/
 *   language-packs/cozy-language-pack-registry.js) — real, existing,
 *   unmodified by this phase. sw/en are simply the first two priority
 *   languages actually exercised by this phase's own fixtures/tests, not
 *   an architectural limit.
 *
 * CONSENT IS FAIL-CLOSED, STRUCTURALLY
 *   validate() REJECTS the whole observation if consent.authorized is
 *   not literally `true` — an unauthorized observation cannot even
 *   construct successfully via create(). This is the contract-level
 *   enforcement point for "do not silently capture arbitrary device/
 *   system audio," "do not silently record nearby people," and the
 *   Live-TV-unauthorized-session requirement — every adapter that builds
 *   an observation (adapters/observation-adapter.js) must obtain and
 *   pass a real consent object; none can bypass this by omission.
 *
 * NO RAW MEDIA, STRUCTURALLY
 *   `contentRef` never carries a raw-media field. validate() explicitly
 *   rejects `contentRef.rawAudio`/`rawVideo`/`rawImage`/`rawMedia` if
 *   present — only `derivedText` (already-extracted text/transcript/OCR
 *   result) and a disclosed `mediaRetentionPolicy` may describe the
 *   underlying capture. This directly implements "do not persist raw
 *   audio/video merely because it was observed."
 *
 * LIFECYCLE — distinguishes real governance stages, never auto-promotes
 *   OBSERVED: freshly built, not yet submitted to any governance authority.
 *   CANDIDATE: submitted to CozyLearn.createCandidate() or
 *     CozyLanguagePacks.submitExpression() (via
 *     adapters/observation-lifecycle.js) — real, tracked, not yet trusted.
 *   VALIDATED: the underlying real authority reports independent-
 *     contributor or multi-source support (e.g. CozyLanguageAcquisition-
 *     Pipeline's VALIDATED tier, or CozyLearn's USER_CONFIRMED status) —
 *     still not global truth.
 *   VERIFIED: the underlying real authority's own promotion path
 *     (CozyLearn.promoteCandidate() -> TRUSTED, or the language-pack
 *     registry's own AVAILABLE pack state) has genuinely fired. Only
 *     VERIFIED observations may ever become VerifiedEvidence (see
 *     adapters/observation-evidence-bridge.js).
 *   REJECTED / DEPRECATED: real, terminal, disclosed states — a
 *     rejected or superseded observation is preserved, never deleted,
 *     for provenance.
 *   This contract's own validate() only checks the STATUS is one of
 *   these six; the actual transition governance (what real authority
 *   must agree before a transition is allowed) lives in
 *   adapters/observation-lifecycle.js, composing CozyLearn/
 *   CozyLanguageAcquisitionPipeline — never reimplemented here.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const SCHEMA_VERSION = "cozy.ai.multimodal-observation.v1";
    const MODULE_VERSION = "1.0.0-lif";
    if (window.CozyOS.Modules["multimodal-observation-contract"]) return;

    const SOURCE_TYPE = Object.freeze([
        "TEXT", "AUDIO", "VIDEO", "IMAGE", "OCR", "PDF_DOCUMENT",
        "LIVE_MEDIA", "APPLICATION_EVENT", "USER_CORRECTION", "COMMUNITY_CONTRIBUTION",
    ]);
    const SOURCE_TYPE_SET = new Set(SOURCE_TYPE);

    const MODALITY = Object.freeze(["TEXT", "AUDIO", "VISUAL", "MULTIMODAL"]);
    const MODALITY_SET = new Set(MODALITY);

    // Real, disclosed mapping onto this repository's two existing governance
    // authorities (see adapters/observation-lifecycle.js): PERSONAL ~
    // CozyLearn SCOPES.USER/SESSION; COMMUNITY_CANDIDATE ~ CozyLearn
    // SCOPES.COMMUNITY / CozyLanguageAcquisitionPipeline CANDIDATE-EMERGING-
    // STRONG tiers; VERIFIED_GLOBAL ~ CozyLearn SCOPES.GLOBAL+TRUSTED /
    // CozyLanguageAcquisitionPipeline VALIDATED tier. This enum is this
    // contract's OWN, coarser governance-stage label — never a duplicate
    // registry of either authority's own finer-grained scope/tier values.
    const LEARNING_SCOPE = Object.freeze(["PERSONAL", "COMMUNITY_CANDIDATE", "VERIFIED_GLOBAL"]);
    const LEARNING_SCOPE_SET = new Set(LEARNING_SCOPE);

    const LIFECYCLE_STATUS = Object.freeze(["OBSERVED", "CANDIDATE", "VALIDATED", "VERIFIED", "REJECTED", "DEPRECATED"]);
    const LIFECYCLE_STATUS_SET = new Set(LIFECYCLE_STATUS);

    const CONSENT_SCOPE = Object.freeze(["SELF", "SESSION_PARTICIPANTS", "PUBLIC_MEDIA"]);
    const CONSENT_SCOPE_SET = new Set(CONSENT_SCOPE);

    const RAW_MEDIA_FORBIDDEN_KEYS = Object.freeze(["rawAudio", "rawVideo", "rawImage", "rawMedia", "audioBlob", "videoBlob", "imageBlob"]);
    const MEDIA_RETENTION_POLICY = Object.freeze(["NOT_RETAINED", "SESSION_ONLY", "USER_AUTHORIZED_RETENTION"]);
    const MEDIA_RETENTION_POLICY_SET = new Set(MEDIA_RETENTION_POLICY);

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    /**
     * validate(observation)
     *   Real, structural validation. Two rules are load-bearing and
     *   intentionally block construction (not just flag a warning):
     *   consent.authorized must be literally true, and contentRef must
     *   never carry a raw-media key. Every other field is a plain shape
     *   check, matching SA-1's own contract discipline.
     */
    function validate(observation) {
        const errors = [];
        if (!isPlainObject(observation)) return { valid: false, errors: ["observation must be a real object."] };

        if (observation.schemaVersion !== SCHEMA_VERSION) errors.push(`schemaVersion must be "${SCHEMA_VERSION}", got ${JSON.stringify(observation.schemaVersion)}.`);
        if (!isNonEmptyString(observation.observationId)) errors.push("observationId must be a real, non-empty string.");
        if (!isNonEmptyString(observation.sourceType) || !SOURCE_TYPE_SET.has(observation.sourceType)) errors.push(`sourceType must be one of ${SOURCE_TYPE.join("/")}. Got ${JSON.stringify(observation.sourceType)}.`);
        if (!isNonEmptyString(observation.modality) || !MODALITY_SET.has(observation.modality)) errors.push(`modality must be one of ${MODALITY.join("/")}. Got ${JSON.stringify(observation.modality)}.`);
        if (!isNonEmptyString(observation.lifecycleStatus) || !LIFECYCLE_STATUS_SET.has(observation.lifecycleStatus)) errors.push(`lifecycleStatus must be one of ${LIFECYCLE_STATUS.join("/")}. Got ${JSON.stringify(observation.lifecycleStatus)}.`);
        if (!isNonEmptyString(observation.learningScope) || !LEARNING_SCOPE_SET.has(observation.learningScope)) errors.push(`learningScope must be one of ${LEARNING_SCOPE.join("/")}. Got ${JSON.stringify(observation.learningScope)}.`);

        // candidateLanguage: deliberately open — see file header. Optional
        // (a pure visual/logo observation may have no language at all).
        if (observation.candidateLanguage !== undefined && observation.candidateLanguage !== null && !isNonEmptyString(observation.candidateLanguage)) {
            errors.push("candidateLanguage, when present, must be a real, non-empty languageId string.");
        }

        if (!isPlainObject(observation.provenance)) {
            errors.push("provenance must be a real object ({sessionId, application, actorId?}).");
        } else {
            if (!isNonEmptyString(observation.provenance.sessionId)) errors.push("provenance.sessionId must be a real, non-empty string.");
            if (!isNonEmptyString(observation.provenance.application)) errors.push("provenance.application must be a real, non-empty string.");
        }

        if (!isPlainObject(observation.timestamps)) {
            errors.push("timestamps must be a real object ({observedAt, ingestedAt}).");
        } else {
            if (typeof observation.timestamps.observedAt !== "number") errors.push("timestamps.observedAt must be a real number (epoch ms).");
            if (typeof observation.timestamps.ingestedAt !== "number") errors.push("timestamps.ingestedAt must be a real number (epoch ms).");
        }

        if (!isPlainObject(observation.contentRef)) {
            errors.push("contentRef must be a real object ({derivedText, mediaRetentionPolicy}) — never raw media.");
        } else {
            if (!isNonEmptyString(observation.contentRef.derivedText)) errors.push("contentRef.derivedText must be a real, non-empty string — the already-derived text/transcript/OCR result, never raw media.");
            if (!isNonEmptyString(observation.contentRef.mediaRetentionPolicy) || !MEDIA_RETENTION_POLICY_SET.has(observation.contentRef.mediaRetentionPolicy)) {
                errors.push(`contentRef.mediaRetentionPolicy must be one of ${MEDIA_RETENTION_POLICY.join("/")}. Got ${JSON.stringify(observation.contentRef.mediaRetentionPolicy)}.`);
            }
            for (const forbidden of RAW_MEDIA_FORBIDDEN_KEYS) {
                if (forbidden in observation.contentRef) errors.push(`contentRef must never carry a raw-media key ("${forbidden}" found) — only derived text may be persisted.`);
            }
        }

        if (!isPlainObject(observation.consent)) {
            errors.push("consent must be a real object ({authorized, scope, grantedBy}).");
        } else {
            if (observation.consent.authorized !== true) errors.push("consent.authorized must be literally true — an unauthorized observation must never be constructed (fail-closed).");
            if (!isNonEmptyString(observation.consent.scope) || !CONSENT_SCOPE_SET.has(observation.consent.scope)) errors.push(`consent.scope must be one of ${CONSENT_SCOPE.join("/")}. Got ${JSON.stringify(observation.consent.scope)}.`);
            if (observation.consent.grantedBy !== null && !isNonEmptyString(observation.consent.grantedBy)) errors.push("consent.grantedBy must be a real, non-empty actorId string, or explicitly null.");
        }

        if (observation.evidenceState !== undefined && !isPlainObject(observation.evidenceState)) errors.push("evidenceState, when present, must be a real object.");
        if (observation.context !== undefined && observation.context !== null && !isPlainObject(observation.context)) errors.push("context, when present, must be a real object or null.");
        if (observation.canonicalConceptId !== undefined && observation.canonicalConceptId !== null && !isNonEmptyString(observation.canonicalConceptId)) errors.push("canonicalConceptId, when present, must be a real, non-empty string or null.");

        return { valid: errors.length === 0, errors };
    }

    /** create(fields) — same convenience-constructor convention as SA-1's contracts. */
    function create(fields = {}) {
        const observation = Object.assign({ schemaVersion: SCHEMA_VERSION }, fields);
        const result = validate(observation);
        return result.valid ? { success: true, observation } : { success: false, errors: result.errors };
    }

    const MultimodalObservationContract = Object.freeze({
        SCHEMA_VERSION, SOURCE_TYPE, MODALITY, LEARNING_SCOPE, LIFECYCLE_STATUS, CONSENT_SCOPE, MEDIA_RETENTION_POLICY,
        validate, create, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.MultimodalObservationContract = MultimodalObservationContract;
    window.CozyOS.Modules["multimodal-observation-contract"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — governed observation contract (cozy.ai.multimodal-observation.v1). Structural validation only: fail-closed consent, no-raw-media enforcement, closed lifecycle/scope/source-type enums. Does not capture media, does not perform OCR/speech/matching itself (see adapters/observation-adapter.js, which composes the real, existing MultimodalObservationCore). Not <script>-included by any page."
    });
})();
