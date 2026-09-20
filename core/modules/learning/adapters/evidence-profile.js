/**
 * CozyAI — Evidence Profile (Repeated-Evidence Intelligence)
 * File Reference: core/modules/learning/adapters/evidence-profile.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-6 Continuous
 * Authorized Observation & Repeated-Evidence Learning Fabric.
 *
 * WHAT THIS IS
 *   "If CozyAI encounters the same expression repeatedly, do not merely
 *   count occurrences. Build an evidence profile." This file is that
 *   profile — a real, disclosed, composed record answering: is this the
 *   same expression, same language, same/compatible context, an
 *   independent source, or possibly a different sense — for a given
 *   (term, language) pair. It never decides truth and never promotes
 *   anything; it is a triage/signal layer consumed by conflict-
 *   detection.js, learning-gap-discovery.js, learning-priority.js, and
 *   continuous-learning-fabric.js.
 *
 * NOT A SECOND GOVERNANCE AUTHORITY
 *   CozyLanguageAcquisitionPipeline's own VALIDATION_TIERS (independent-
 *   contributor counting toward CANDIDATE/EMERGING/STRONG/VALIDATED) and
 *   CozyLearn's own confirmations remain the ONE real authority for
 *   whether evidence is strong enough to promote — this file never
 *   recomputes or overrides that. Its own "independent contributor
 *   count" is a lighter-weight, disclosed triage signal only (never fed
 *   back into ObservationLifecycle's promotion decisions), used purely
 *   to help the fabric decide priority/whether to ask a clarifying
 *   question (active-learning.js) — see file header of that file too.
 *
 * PERSISTENCE
 *   Composes window.CozyOS.CozyMemory under its own dedicated namespace
 *   ("learning-evidence-profiles") — no new store.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml6";
    const NAMESPACE = "learning-evidence-profiles";
    if (window.CozyOS.Modules["evidence-profile"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function normalize(v) { return isNonEmptyString(v) ? v.trim().toLowerCase() : null; }

    function memoryOrNull() {
        const memory = window.CozyOS.CozyMemory;
        return memory && typeof memory.saveMemory === "function" ? memory : null;
    }

    function profileKey(term, language) { return `profile:${normalize(language) || "unknown"}:${normalize(term)}`; }

    /** getProfile(term, language, actorId) — real read; returns a fresh, empty profile shape when none exists yet (never null, so callers never null-check). */
    function getProfile(term, language, actorId = "system") {
        const memory = memoryOrNull();
        const empty = () => ({
            term: normalize(term), language: normalize(language),
            occurrences: [], independentContributors: [], independentSourceTypes: [], contexts: [],
            meanings: {}, updatedAt: null,
        });
        if (!memory || !isNonEmptyString(term)) return empty();
        const entry = memory.readMemory(NAMESPACE, profileKey(term, language), actorId);
        return (entry && entry.value) ? entry.value : empty();
    }

    /**
     * recordOccurrence({ term, language, observation, meaning, contributorId, contextLabel, actorId })
     *   Real, composed, additive-only (never deletes a prior occurrence
     *   or meaning). Returns the updated profile plus real, honest
     *   diagnostic flags: isNewContributor, isNewSourceType, isNewContext,
     *   possibleConflict (more than one distinct, non-empty meaning has
     *   now been observed for this exact term+language).
     */
    function recordOccurrence({ term, language, observation, meaning = null, contributorId = null, contextLabel = null, actorId = "system" } = {}) {
        const memory = memoryOrNull();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        if (!isNonEmptyString(term)) return { success: false, reason: "A real, non-empty term is required." };

        const profile = getProfile(term, language, actorId);
        const isNewContributor = !!contributorId && !profile.independentContributors.includes(contributorId);
        const sourceType = observation && observation.sourceType || null;
        const isNewSourceType = !!sourceType && !profile.independentSourceTypes.includes(sourceType);
        const normalizedContext = normalize(contextLabel);
        const isNewContext = !!normalizedContext && !profile.contexts.includes(normalizedContext);
        const normalizedMeaning = normalize(meaning) || "(unspecified)";

        profile.occurrences.push({
            observationId: observation ? observation.observationId : null,
            modality: observation ? observation.modality : null,
            sourceType, contextLabel: normalizedContext, contributorId, meaning: normalizedMeaning,
            occurredAt: Date.now(),
        });
        if (isNewContributor) profile.independentContributors.push(contributorId);
        if (isNewSourceType) profile.independentSourceTypes.push(sourceType);
        if (isNewContext) profile.contexts.push(normalizedContext);
        profile.meanings[normalizedMeaning] = profile.meanings[normalizedMeaning] || { count: 0, observationIds: [] };
        profile.meanings[normalizedMeaning].count += 1;
        if (observation && observation.observationId) profile.meanings[normalizedMeaning].observationIds.push(observation.observationId);
        profile.updatedAt = Date.now();

        memory.saveMemory(NAMESPACE, profileKey(term, language), profile, { owner: actorId, actorId, visibility: "public" });

        const distinctMeanings = Object.keys(profile.meanings).filter((m) => m !== "(unspecified)");
        return {
            success: true, profile,
            isNewContributor, isNewSourceType, isNewContext,
            possibleConflict: distinctMeanings.length > 1,
        };
    }

    const EvidenceProfile = Object.freeze({
        NAMESPACE, getProfile, recordOccurrence, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.EvidenceProfile = EvidenceProfile;
    window.CozyOS.Modules["evidence-profile"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — repeated-evidence profile per (term, language): occurrence history, independent-contributor/source/context tracking, and possible-conflict signal. A disclosed triage layer only — never a second governance/promotion authority (that remains CozyLanguageAcquisitionPipeline/CozyLearn's own job, unmodified). Composes CozyMemory under its own dedicated namespace. Not <script>-included by any page."
    });
})();
