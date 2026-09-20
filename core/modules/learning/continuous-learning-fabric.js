/**
 * CozyAI — Continuous Learning Fabric
 * File Reference: core/modules/learning/continuous-learning-fabric.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-6, Continuous
 * Authorized Observation & Repeated-Evidence Learning Fabric.
 *
 * WHAT THIS IS
 *   The single, event-driven entry point tying together every real,
 *   existing piece this and the prior CML phases already built —
 *   NEVER a second AI, a second learning engine, or a second governance
 *   authority. This file is pure composition/orchestration:
 *
 *     observeEvent()          -> MultimodalObservationAdapter.fromX()
 *                                 (thin router only, chosen by the
 *                                 caller's own `kind`)
 *                              -> CozySense.registerObservation()
 *                                 (the repository's real, existing
 *                                 observation bus — see "EVENT BUS" below)
 *                              -> EvidenceProfile.recordOccurrence()
 *                              -> LearningCorrelation.correlateObservation()
 *                                 (only when a concept is already known
 *                                 or explicitly supplied — never guesses
 *                                 a brand-new concept identity)
 *                              -> ConflictDetection.checkAndRecordConflict()
 *                              -> LearningGapDiscovery.discoverUnknownWordGap()
 *                              -> ActiveLearning.evaluateAmbiguity()
 *                                 (+ createClarificationQuestion() only
 *                                 when the caller opts in AND the gate
 *                                 passes)
 *                              -> LearningPriority.computePriority()
 *
 *     advanceToCandidate/Validated/Verified()
 *                              -> ObservationLifecycle (unchanged)
 *
 *     bridgeToEvidence()       -> ObservationEvidenceBridge (unchanged)
 *
 *     generateRegression()/verifyImprovement()
 *                              -> RegressionGenerator (unchanged)
 *
 *     checkLanguageGaps()      -> LanguageGapRegistry (unchanged)
 *
 *   Nothing above is reimplemented here — every step is one real,
 *   already-tested composition call. This file adds only: routing,
 *   event-driven dedup/bounding (see PERFORMANCE), and returning one
 *   coherent trace object per call so a future UI/Live Window
 *   integration has a single surface instead of eight separate imports.
 *
 * EVENT BUS — reuse, not reinvent
 *   window.CozyOS.CozySense (core/modules/sense/cozy-sense.js) is this
 *   repository's real, existing, general-purpose observation bus
 *   ("ROUTING, NOT INTERPRETATION" — confirmed by reading that file's
 *   own header before writing this one). Its own OBSERVATION_TYPES enum
 *   is a small, fixed, generic vocabulary (detected/updated/changed/...)
 *   — not the phase brief's own richer "learning.observed" /
 *   "learning.candidateCreated" naming. This file honestly maps every
 *   phase-brief event name into CozySense's real `observationType`
 *   ("detected" for a new observation, "updated" for a state
 *   transition) and carries the richer name in `metadata.eventName`
 *   instead of inventing a second event bus to get free-form names.
 *   publishToSense() is optional (requires a caller-registered sensorId,
 *   matching MultimodalObservationAdapter's own existing, unmodified
 *   publishToSense() discipline) — observeEvent() never requires it.
 *
 * SECURITY — claims vs. authority (phase brief §38)
 *   learningScope on an observation is always a REQUESTED scope, never
 *   itself a grant. Nothing in this file (or any file it composes) can
 *   move an observation to VERIFIED — that remains exclusively
 *   ObservationLifecycle's own real governance chain (CozyLearn /
 *   CozyLanguageAcquisitionPipeline), reached only via explicit,
 *   separate advanceToCandidate()/advanceToValidated()/advanceToVerified()
 *   calls this file merely forwards. A client passing
 *   learningScope:"VERIFIED_GLOBAL" on observeEvent() only ever labels
 *   its own OBSERVED record's requested scope — it can never itself
 *   cause a promotion.
 *
 * PERFORMANCE (phase brief §36)
 *   Deduplication is a short, real, in-memory, bounded window
 *   (DEDUP_WINDOW_MS) keyed on (kind, language, actorId, term/text) —
 *   it exists only to stop an accidental flood of identical calls in
 *   the same instant from each spawning a new observation; it never
 *   suppresses genuinely repeated evidence over time (the whole point
 *   of §7 Repeated-Evidence Intelligence) since the window is short and
 *   evidence-profile.js's own occurrence history is untouched by it.
 *   The tracked-event set itself is capped at MAX_TRACKED_EVENTS with
 *   real FIFO eviction — it can never grow unbounded. All work here is
 *   synchronous, in-memory, or a single CozyMemory call — no network,
 *   no polling loop — so it never blocks the Live Window's own call
 *   stack unless a caller chooses to await it inline.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml6";
    const DEDUP_WINDOW_MS = 5000;
    const MAX_TRACKED_EVENTS = 500;
    // Fixed system identity that owns every SHARED, cross-contributor
    // aggregate record this fabric maintains (evidence profiles,
    // conflicts, gaps) — see the long comment inside observeEvent()
    // below for why a per-event caller's own actorId cannot be used here.
    const SYSTEM_ACTOR = "system";
    if (window.CozyOS.Modules["continuous-learning-fabric"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function normalize(v) { return isNonEmptyString(v) ? v.trim().toLowerCase() : ""; }

    // ---- bounded, in-memory, non-persistent dedup window (see header) ----
    let recentEventOrder = [];
    const recentEventMap = new Map();

    function eventHash(input) {
        const term = input.term || input.text || input.eventText || input.correctedText || input.derivedText || "";
        // meaning is part of the identity of "is this a duplicate call":
        // the same contributor submitting the same term with a
        // DIFFERENT meaning in quick succession is genuine new evidence
        // (see evidence-profile.js's own possibleConflict signal), never
        // a duplicate to be silently collapsed.
        const meaning = input.meaning || "";
        return `${input.kind}|${normalize(input.candidateLanguage)}|${input.actorId || ""}|${normalize(term)}|${normalize(meaning)}`;
    }
    function isDuplicate(hash) {
        const last = recentEventMap.get(hash);
        return last !== undefined && (Date.now() - last) < DEDUP_WINDOW_MS;
    }
    function trackEvent(hash) {
        if (!recentEventMap.has(hash)) {
            recentEventOrder.push(hash);
            if (recentEventOrder.length > MAX_TRACKED_EVENTS) {
                const evicted = recentEventOrder.shift();
                recentEventMap.delete(evicted);
            }
        }
        recentEventMap.set(hash, Date.now());
    }
    function getQueueStats() { return { trackedEvents: recentEventOrder.length, maxTrackedEvents: MAX_TRACKED_EVENTS }; }

    /** buildObservation(input) — thin router onto MultimodalObservationAdapter's real functions. Never reimplements any of them. */
    function buildObservation(input) {
        const adapter = window.CozyOS.MultimodalObservationAdapter;
        if (!adapter) return { success: false, reason: "MultimodalObservationAdapter is not loaded." };
        const common = {
            candidateLanguage: input.candidateLanguage || null, sessionId: input.sessionId, application: input.application,
            actorId: input.actorId || null, context: input.context || null, consent: input.consent,
            learningScope: input.learningScope || "PERSONAL",
        };
        switch (input.kind) {
            case "TEXT": return adapter.fromText(Object.assign({ text: input.text || input.term }, common));
            case "OCR": return adapter.fromOCR(input.ocrResult, common);
            case "AUDIO": return adapter.fromAudioTranscript(input.transcriptResult, common);
            case "DOCUMENT": return adapter.fromDocument(Object.assign({ extractedText: input.extractedText, documentRef: input.documentRef }, common));
            case "LIVE_MEDIA": return adapter.fromLiveMedia(Object.assign({ visual: input.visual, audio: input.audio, segmentWindowMs: input.segmentWindowMs }, common));
            case "APPLICATION_EVENT": return adapter.fromApplicationEvent(Object.assign({ eventText: input.eventText || input.text, eventType: input.eventType }, common));
            case "USER_CORRECTION": return adapter.fromUserCorrection(Object.assign({ priorText: input.priorText, correctedText: input.correctedText }, common));
            case "COMMUNITY_CONTRIBUTION": return adapter.fromCommunityContribution(Object.assign({ term: input.term, meaning: input.meaning }, common));
            default: return { success: false, reason: `Unknown observation kind "${input.kind}".` };
        }
    }

    function termFromObservation(input, observation) {
        return input.term || (observation && observation.contentRef && observation.contentRef.derivedText) || null;
    }

    /**
     * observeEvent(input)
     *   input.kind selects which real MultimodalObservationAdapter
     *   function to compose (see buildObservation()). Optional fields:
     *     meaning            — used for EvidenceProfile/conflict tracking
     *     contextLabel       — used for EvidenceProfile context diversity
     *     contributorId      — used for EvidenceProfile independence
     *     conceptId + domain — when supplied, correlates into that
     *                          concept via the real, unmodified
     *                          LearningCorrelation; when omitted, this
     *                          file looks for an EXISTING attachment by
     *                          term+language only (never fabricates a
     *                          brand-new concept identity on its own)
     *     sensorId           — optional CozySense publication
     *     enableActiveLearning + utilityThreshold — opt-in clarification
     *                          question generation (default OFF, so this
     *                          never interrupts a caller that didn't ask)
     *   Returns one coherent trace object; every field mirrors the real,
     *   composed result it came from — nothing here is synthesized.
     */
    function observeEvent(input = {}) {
        if (!input || !isNonEmptyString(input.kind)) return { success: false, reason: "input.kind is required." };

        const hash = eventHash(input);
        if (isDuplicate(hash)) {
            trackEvent(hash);
            return { success: true, deduplicated: true, reason: "An identical observation was just processed within the dedup window." };
        }

        const built = buildObservation(input);
        if (!built.success) return built;
        trackEvent(hash);
        const observation = built.observation;

        const sense = window.CozyOS.CozySense;
        if (input.sensorId && sense && sense.sensorExists && sense.sensorExists(input.sensorId)) {
            sense.registerObservation({
                sensorId: input.sensorId, sourceEngine: "ContinuousLearningFabric", observationType: "detected",
                metadata: { eventName: "learning.observed", sourceType: observation.sourceType, modality: observation.modality },
                data: observation,
            });
        }

        // NOTE on actorId vs. contributorId below: EvidenceProfile /
        // ConflictDetection / LearningGapDiscovery / LanguageGapRegistry
        // all persist ONE SHARED, cross-contributor aggregate record per
        // (term, language) — CozyMemory's own real authorization model
        // only lets a record's original owner/actorId modify it again
        // (confirmed by direct error during integration testing before
        // this fix). A shared aggregate record can therefore never be
        // owned by the per-event caller's own actorId — it is always
        // written under this fabric's fixed SYSTEM_ACTOR, exactly like
        // canonical-concept-registry.js's own attachments already are
        // (see that file/learning-correlation.js, both always called
        // with actorId:"system" for the same reason). The real,
        // per-user identity is never discarded — it is still recorded
        // INSIDE the value as `contributorId` on every occurrence, which
        // is what EvidenceProfile's own independent-contributor tracking
        // actually reads.
        const term = termFromObservation(input, observation);
        let profileResult = null, correlationResult = null, conflictResult = null, gapResult = null, activeLearningQuestion = null;

        const profiles = window.CozyOS.EvidenceProfile;
        if (profiles && isNonEmptyString(term)) {
            profileResult = profiles.recordOccurrence({
                term, language: input.candidateLanguage, observation, meaning: input.meaning,
                contributorId: input.contributorId || input.actorId || null, contextLabel: input.contextLabel, actorId: SYSTEM_ACTOR,
            });
        }

        const correlation = window.CozyOS.LearningCorrelation;
        const supplement = window.CozyOS.LearningEvidenceSupplement;
        if (correlation && isNonEmptyString(term)) {
            let conceptId = input.conceptId || null;
            if (!conceptId && supplement) {
                const existingMatches = supplement.findMatchingAttachments(term, input.candidateLanguage, SYSTEM_ACTOR);
                if (existingMatches.length > 0) conceptId = existingMatches[0].conceptId;
            }
            if (conceptId) {
                correlationResult = correlation.correlateObservation({
                    conceptId, domain: input.domain || "general", observation,
                    relationshipType: input.relationshipType || "PRIMARY_TERM", meaning: input.meaning, actorId: SYSTEM_ACTOR,
                });
            }
        }

        const conflicts = window.CozyOS.ConflictDetection;
        if (conflicts && profileResult && profileResult.success) {
            conflictResult = conflicts.checkAndRecordConflict({ term, language: input.candidateLanguage, profile: profileResult.profile, actorId: SYSTEM_ACTOR });
        }

        const gapDiscovery = window.CozyOS.LearningGapDiscovery;
        if (gapDiscovery && isNonEmptyString(term) && !(correlationResult && correlationResult.success)) {
            gapResult = gapDiscovery.discoverUnknownWordGap({ term, language: input.candidateLanguage, actorId: SYSTEM_ACTOR });
        }

        const activeLearning = window.CozyOS.ActiveLearning;
        if (input.enableActiveLearning && activeLearning && conflictResult && conflictResult.conflict) {
            const gate = activeLearning.evaluateAmbiguity({ conflict: conflictResult.conflict, profile: profileResult && profileResult.profile, utilityThreshold: input.utilityThreshold });
            if (gate.shouldAsk) {
                const options = (conflictResult.conflict.entries || []).map((e) => e.meaning);
                const questionResult = activeLearning.createClarificationQuestion({ conflict: conflictResult.conflict, profile: profileResult && profileResult.profile, options, utilityThreshold: input.utilityThreshold, actorId: input.actorId || "system" });
                if (questionResult.success) activeLearningQuestion = questionResult.question;
            }
        }

        const priorityEngine = window.CozyOS.LearningPriority;
        const priority = priorityEngine ? priorityEngine.computePriority({
            isCorrectionRepeated: input.kind === "USER_CORRECTION" && !!(gapResult && gapResult.gap),
            isUnknownWordRepeated: !!(gapResult && gapResult.gap),
            isContradiction: !!(conflictResult && conflictResult.conflict && conflictResult.conflict.status === "OPEN"),
            independentContributors: profileResult ? profileResult.profile.independentContributors.length : 0,
            contexts: profileResult ? profileResult.profile.contexts.length : 0,
            languageGap: false,
            semanticImportance: input.semanticImportance || 0,
            verificationQuality: input.verificationQuality || 0,
        }) : null;

        return {
            success: true, deduplicated: false, observation,
            profile: profileResult, correlation: correlationResult, conflict: conflictResult,
            gap: gapResult, activeLearningQuestion, priority,
        };
    }

    // ---- thin governance/evidence/regression delegates (see header) ----
    function advanceToCandidate(observation, opts) { return window.CozyOS.ObservationLifecycle.toCandidate(observation, opts); }
    function advanceToValidated(observation, opts) { return window.CozyOS.ObservationLifecycle.toValidated(observation, opts); }
    function advanceToVerified(observation, opts) { return window.CozyOS.ObservationLifecycle.toVerified(observation, opts); }
    function bridgeToEvidence(observation, opts) { return window.CozyOS.ObservationEvidenceBridge.toVerifiedEvidence(observation, opts); }
    function generateRegression(observation, opts) { return window.CozyOS.RegressionGenerator.generateFromVerifiedObservation(observation, opts); }
    function verifyImprovement(opts) { return window.CozyOS.RegressionGenerator.verifyNoRegression(opts); }
    function checkLanguageGaps(opts) { return window.CozyOS.LanguageGapRegistry.checkConceptLanguageCoverage(opts); }

    const ContinuousLearningFabric = Object.freeze({
        observeEvent, advanceToCandidate, advanceToValidated, advanceToVerified,
        bridgeToEvidence, generateRegression, verifyImprovement, checkLanguageGaps,
        getQueueStats, DEDUP_WINDOW_MS, MAX_TRACKED_EVENTS, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.ContinuousLearningFabric = ContinuousLearningFabric;
    window.CozyOS.Modules["continuous-learning-fabric"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — the single, event-driven orchestration entry point composing MultimodalObservationAdapter, CozySense (real existing event bus), EvidenceProfile, LearningCorrelation, ConflictDetection, LearningGapDiscovery, ActiveLearning, LearningPriority, ObservationLifecycle, ObservationEvidenceBridge, and RegressionGenerator. Reimplements none of them. Bounded, short-window dedup only (never suppresses genuine repeated evidence over time). Not <script>-included by any page."
    });
})();
