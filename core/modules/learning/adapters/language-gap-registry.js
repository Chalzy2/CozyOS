/**
 * CozyAI — Language Gap Registry
 * File Reference: core/modules/learning/adapters/language-gap-registry.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-6.
 *
 * WHAT THIS IS
 *   Concept-level language-gap tracking: "When CozyAI understands a
 *   concept in one language but cannot adequately understand or express
 *   it in another supported language, record a LANGUAGE_GAP candidate."
 *   Composes the existing, real CanonicalConceptRegistry (attachments
 *   per concept+language) and ObservationStore (to confirm an
 *   attachment's backing observation is genuinely lifecycleStatus ===
 *   "VERIFIED", never merely CANDIDATE/OBSERVED). Never fabricates a
 *   translation and never invents an expression for the missing
 *   language — it only records the honest fact that evidence is needed.
 *
 * DIFFERENT FROM semantic-answer-planner.js's detectLanguageGap()
 *   SA-3's own detectLanguageGap() is a real, PER-ANSWER, in-the-moment
 *   signal (does real evidence exist in this exact requested language
 *   for this exact goal, right now) — unmodified here, still the single
 *   authority for that per-turn decision. This file is a persistent,
 *   CONCEPT-level tracking layer above it: "across every language this
 *   concept should eventually cover, which ones still lack verified
 *   evidence" — a real, different, additive question, backed by its own
 *   dedicated CozyMemory namespace, never duplicating or overriding the
 *   planner's own per-turn logic.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml6";
    const NAMESPACE = "learning-language-gaps";
    if (window.CozyOS.Modules["language-gap-registry"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function normalize(v) { return isNonEmptyString(v) ? v.trim().toLowerCase() : null; }
    function memoryOrNull() {
        const memory = window.CozyOS.CozyMemory;
        return memory && typeof memory.saveMemory === "function" ? memory : null;
    }
    function gapKey(conceptId, language) { return `gap:${conceptId}:${normalize(language)}`; }

    /**
     * hasVerifiedCoverage(conceptId, language, actorId)
     *   Real. True only when at least one real attachment for this
     *   concept+language is backed by a real, currently VERIFIED
     *   observation (re-checked fresh via ObservationStore — never
     *   trusted from a stale flag).
     */
    function hasVerifiedCoverage(conceptId, language, actorId) {
        const registry = window.CozyOS.CanonicalConceptRegistry;
        const store = window.CozyOS.ObservationStore;
        if (!registry || !store) return false;
        const listed = registry.listAttachments(conceptId, { actorId });
        if (!listed.success) return false;
        return (listed.attachments || [])
            .filter((a) => a.language === normalize(language))
            .some((a) => (a.observationIds || []).some((id) => {
                const obs = store.getObservation(id, { actorId });
                return obs && obs.lifecycleStatus === "VERIFIED";
            }));
    }

    /**
     * checkConceptLanguageCoverage({ conceptId, targetLanguages, actorId })
     *   For every language in targetLanguages, checks real verified
     *   coverage and upserts (never duplicates) an OPEN LANGUAGE_GAP
     *   record for any language still lacking it. A language that
     *   already has coverage never gets a gap record created; an
     *   existing OPEN gap for a now-covered language is auto-closed here
     *   (real, honest re-check — never left stale).
     */
    function checkConceptLanguageCoverage({ conceptId, targetLanguages = [], actorId = "system" } = {}) {
        const memory = memoryOrNull();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        if (!isNonEmptyString(conceptId)) return { success: false, reason: "A real, non-empty conceptId is required." };

        const coverage = {};
        const gapsCreated = [];
        const gapsClosed = [];
        for (const language of targetLanguages) {
            const covered = hasVerifiedCoverage(conceptId, language, actorId);
            coverage[normalize(language)] = { verified: covered };
            const existing = memory.readMemory(NAMESPACE, gapKey(conceptId, language), actorId);
            const existingGap = existing && existing.value;
            if (covered) {
                if (existingGap && existingGap.status === "OPEN") {
                    existingGap.status = "CLOSED";
                    existingGap.closedAt = Date.now();
                    memory.saveMemory(NAMESPACE, gapKey(conceptId, language), existingGap, { owner: actorId, actorId, visibility: "public" });
                    gapsClosed.push(existingGap);
                }
                continue;
            }
            if (existingGap && existingGap.status === "OPEN") continue; // already open, no duplicate
            const gap = {
                gapId: `langgap_${conceptId}_${normalize(language)}`,
                conceptId, language: normalize(language),
                status: "OPEN", evidenceNeeded: true, createdAt: Date.now(),
            };
            memory.saveMemory(NAMESPACE, gapKey(conceptId, language), gap, { owner: actorId, actorId, visibility: "public" });
            gapsCreated.push(gap);
        }
        return { success: true, coverage, gapsCreated, gapsClosed };
    }

    function listOpenGaps({ actorId = "system" } = {}) {
        const memory = memoryOrNull();
        if (!memory || typeof memory.listKeys !== "function") return [];
        const entries = memory.listKeys(NAMESPACE, (e) => e.value && e.value.status === "OPEN", actorId) || [];
        return entries.map((e) => e.value).filter(Boolean);
    }

    const LanguageGapRegistry = Object.freeze({
        NAMESPACE, checkConceptLanguageCoverage, listOpenGaps, hasVerifiedCoverage, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.LanguageGapRegistry = LanguageGapRegistry;
    window.CozyOS.Modules["language-gap-registry"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — concept-level LANGUAGE_GAP tracking across target languages, backed by real VERIFIED-observation coverage checks (CanonicalConceptRegistry + ObservationStore). Never fabricates a missing translation. Distinct from, and additive to, SemanticAnswerPlanner's own per-turn detectLanguageGap(). Not <script>-included by any page."
    });
})();
