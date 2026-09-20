/**
 * CozyAI — Automatic Learning Gap Discovery
 * File Reference: core/modules/learning/adapters/learning-gap-discovery.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-6.
 *
 * WHAT THIS IS
 *   "CML-6 should detect useful learning opportunities automatically."
 *   This file recognizes the real, disclosed patterns the phase brief
 *   names and turns each into a structured, persisted LEARNING_GAP
 *   record — never an invented answer. It adds NO new understanding
 *   logic of its own: every pattern below composes an existing, real
 *   signal (evidence-profile.js's occurrence history, correction-
 *   learning.js's own correction list, language-gap-registry.js's
 *   concept coverage, gap-detection.js's real planner-backed semantic
 *   signal).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml6";
    const NAMESPACE = "learning-gaps";
    const GAP_TYPES = Object.freeze(["UNKNOWN_WORD_REPEATED", "REPEATED_CORRECTION", "CONCEPT_MISSING_EXPRESSION", "SEMANTIC_CAPABILITY_GAP"]);
    if (window.CozyOS.Modules["learning-gap-discovery"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function memoryOrNull() {
        const memory = window.CozyOS.CozyMemory;
        return memory && typeof memory.saveMemory === "function" ? memory : null;
    }

    function upsertGap(gapId, record, actorId) {
        const memory = memoryOrNull();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        const existing = memory.readMemory(NAMESPACE, gapId, actorId);
        if (existing && existing.value && existing.value.status === "OPEN") {
            return { success: true, gap: existing.value, isNew: false };
        }
        memory.saveMemory(NAMESPACE, gapId, record, { owner: actorId, actorId, visibility: "public" });
        return { success: true, gap: record, isNew: true };
    }

    /** discoverUnknownWordGap({term, language, threshold, actorId}) — real, composes evidence-profile.js + learning-evidence-supplement.js's own attachment lookup (never a second matching engine). */
    function discoverUnknownWordGap({ term, language, threshold = 3, actorId = "system" } = {}) {
        const profiles = window.CozyOS.EvidenceProfile;
        const supplement = window.CozyOS.LearningEvidenceSupplement;
        if (!profiles || !supplement) return { success: false, reason: "EvidenceProfile/LearningEvidenceSupplement are not both loaded." };
        if (!isNonEmptyString(term)) return { success: false, reason: "A real, non-empty term is required." };
        const profile = profiles.getProfile(term, language, actorId);
        if (profile.occurrences.length < threshold) return { success: true, gap: null };
        const matches = supplement.findMatchingAttachments(term, language, actorId);
        if (matches.length > 0) return { success: true, gap: null }; // already has a canonical concept attachment
        const gapId = `gap_unknownword_${(language || "unknown")}_${term.trim().toLowerCase()}`;
        return upsertGap(gapId, {
            gapId, type: "UNKNOWN_WORD_REPEATED", term, language, occurrences: profile.occurrences.length,
            status: "OPEN", createdAt: Date.now(),
        }, actorId);
    }

    /** discoverRepeatedCorrectionGap({targetRecordId, threshold, actorId}) — real, composes correction-learning.js's own listCorrectionsFor(). */
    function discoverRepeatedCorrectionGap({ targetRecordId, threshold = 2, actorId = "system" } = {}) {
        const correctionLearning = window.CozyOS.CorrectionLearning;
        if (!correctionLearning) return { success: false, reason: "CorrectionLearning is not loaded." };
        if (!isNonEmptyString(targetRecordId)) return { success: false, reason: "A real, non-empty targetRecordId is required." };
        const corrections = correctionLearning.listCorrectionsFor(targetRecordId);
        if (corrections.length < threshold) return { success: true, gap: null };
        const gapId = `gap_repeatedcorrection_${targetRecordId}`;
        return upsertGap(gapId, {
            gapId, type: "REPEATED_CORRECTION", targetRecordId, count: corrections.length,
            status: "OPEN", createdAt: Date.now(),
        }, actorId);
    }

    /** discoverConceptMissingExpressionGap({conceptId, targetLanguages, actorId}) — real, thin delegation to language-gap-registry.js (never a second concept-coverage checker). */
    function discoverConceptMissingExpressionGap({ conceptId, targetLanguages = [], actorId = "system" } = {}) {
        const registry = window.CozyOS.LanguageGapRegistry;
        if (!registry) return { success: false, reason: "LanguageGapRegistry is not loaded." };
        const result = registry.checkConceptLanguageCoverage({ conceptId, targetLanguages, actorId });
        return { success: result.success, gaps: result.gapsCreated || [] };
    }

    /** discoverSemanticCapabilityGap({text, requestedLanguage, entityHint, actorId}) — real, thin delegation to gap-detection.js (which itself only composes the real, unmodified SemanticAnswerPlanner). */
    function discoverSemanticCapabilityGap({ text, requestedLanguage = null, entityHint = null, actorId = "system" } = {}) {
        const gapDetection = window.CozyOS.GapDetection;
        if (!gapDetection) return { success: false, reason: "GapDetection is not loaded." };
        const result = gapDetection.detectGap({ text, requestedLanguage, entityHint, actorId });
        if (!result.success || !result.gapDetected) return { success: true, gap: null };
        const gapId = `gap_semantic_${(text || "").trim().toLowerCase().slice(0, 60)}`;
        return upsertGap(gapId, {
            gapId, type: "SEMANTIC_CAPABILITY_GAP", text, requestedLanguage,
            cognitiveStatus: result.cognitiveStatus, status: "OPEN", createdAt: Date.now(),
        }, actorId);
    }

    function listOpenGaps({ actorId = "system" } = {}) {
        const memory = memoryOrNull();
        if (!memory || typeof memory.listKeys !== "function") return [];
        const entries = memory.listKeys(NAMESPACE, (e) => e.value && e.value.status === "OPEN", actorId) || [];
        return entries.map((e) => e.value).filter(Boolean);
    }

    const LearningGapDiscovery = Object.freeze({
        NAMESPACE, GAP_TYPES,
        discoverUnknownWordGap, discoverRepeatedCorrectionGap, discoverConceptMissingExpressionGap, discoverSemanticCapabilityGap,
        listOpenGaps, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.LearningGapDiscovery = LearningGapDiscovery;
    window.CozyOS.Modules["learning-gap-discovery"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — automatic LEARNING_GAP discovery (unknown word repeated / repeated correction / concept missing expression / semantic capability gap), composing only existing, real signals (EvidenceProfile, CorrectionLearning, LanguageGapRegistry, GapDetection). Never invents a missing answer. Not <script>-included by any page."
    });
})();
