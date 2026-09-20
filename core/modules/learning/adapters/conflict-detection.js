/**
 * CozyAI — Conflict Detection
 * File Reference: core/modules/learning/adapters/conflict-detection.js
 * Part of: COZYAI CONTINUOUS MULTIMODAL LEARNING — CML-6.
 *
 * WHAT THIS IS
 *   "If evidence conflicts: DO NOT choose silently. Record CONFLICT."
 *   Composes evidence-profile.js's own real, disclosed meanings map (see
 *   that file — never re-derived here) to detect when the SAME
 *   term+language now carries more than one distinct, non-empty
 *   meaning, and persists a structured, real CONFLICT record. This file
 *   never resolves a conflict on its own — resolveConflict() always
 *   requires an explicit human decision and an interpretation drawn from
 *   a real, closed vocabulary (POLYSEMY/DIALECT_DIFFERENCE/
 *   DOMAIN_DIFFERENCE/BAD_EVIDENCE/SPELLING_CONFUSION).
 *
 * NOT A SECOND CORRECTION/CONCEPT STORE
 *   A resolved POLYSEMY conflict does not itself edit canonical-concept
 *   attachments — that remains adapters/learning-correlation.js's own
 *   job (which already keeps distinct meanings as distinct attachments
 *   under the same concept — see that file's own "SAME SPELLING,
 *   DIFFERENT MEANING" section). This file only tracks that a conflict
 *   was noticed and how a human ultimately explained it.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    const MODULE_VERSION = "1.0.0-cml6";
    const NAMESPACE = "learning-conflicts";
    const INTERPRETATIONS = Object.freeze(["POLYSEMY", "DIALECT_DIFFERENCE", "DOMAIN_DIFFERENCE", "BAD_EVIDENCE", "SPELLING_CONFUSION"]);
    if (window.CozyOS.Modules["conflict-detection"]) return;

    function isNonEmptyString(v) { return typeof v === "string" && v.trim().length > 0; }
    function normalize(v) { return isNonEmptyString(v) ? v.trim().toLowerCase() : null; }
    function memoryOrNull() {
        const memory = window.CozyOS.CozyMemory;
        return memory && typeof memory.saveMemory === "function" ? memory : null;
    }
    function conflictKey(term, language) { return `conflict:${normalize(language) || "unknown"}:${normalize(term)}`; }

    /** getConflict(term, language, actorId) — real read; null when no conflict has ever been recorded for this term+language. */
    function getConflict(term, language, actorId = "system") {
        const memory = memoryOrNull();
        if (!memory) return null;
        const entry = memory.readMemory(NAMESPACE, conflictKey(term, language), actorId);
        return (entry && entry.value) ? entry.value : null;
    }

    /**
     * checkAndRecordConflict({ term, language, profile, actorId })
     *   profile: the real, current evidence-profile.js record (its own
     *   meanings map is the sole source — this file never independently
     *   re-derives meaning divergence). Idempotent: one real conflict
     *   record per (term, language), whose `entries` array grows as new
     *   distinct meanings are observed. Returns {conflict:null} when the
     *   profile carries at most one distinct meaning (no conflict).
     */
    function checkAndRecordConflict({ term, language, profile, actorId = "system" } = {}) {
        const memory = memoryOrNull();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        if (!profile || !profile.meanings) return { success: false, reason: "A real evidence-profile.js profile is required." };

        const distinctMeanings = Object.keys(profile.meanings).filter((m) => m !== "(unspecified)");
        if (distinctMeanings.length < 2) return { success: true, conflict: null };

        const existing = getConflict(term, language, actorId);
        const entries = distinctMeanings.map((meaning) => ({
            meaning, evidenceIds: (profile.meanings[meaning].observationIds || []).slice(),
        }));
        const record = existing || {
            conflictId: `conflict_${normalize(language) || "unknown"}_${normalize(term)}_${Date.now()}`,
            term: normalize(term), language: normalize(language),
            status: "OPEN", interpretation: null, resolution: null,
            createdAt: Date.now(),
        };
        record.entries = entries;
        record.updatedAt = Date.now();
        if (existing && existing.status === "RESOLVED") {
            // New, still-distinct meanings kept appearing after a
            // resolution — real, honest reopen rather than silently
            // hiding fresh divergence behind a stale resolution.
            record.status = "OPEN";
        }

        memory.saveMemory(NAMESPACE, conflictKey(term, language), record, { owner: actorId, actorId, visibility: "public" });
        return { success: true, conflict: record, isNew: !existing };
    }

    /**
     * resolveConflict(conflictId term/language, { resolvedBy, interpretation, note })
     *   Explicit-only. Requires a real resolvedBy and an interpretation
     *   from the closed INTERPRETATIONS vocabulary. Never deletes the
     *   conflict's entries — resolution is recorded alongside them, not
     *   in place of them, so the original divergent evidence stays
     *   inspectable.
     */
    function resolveConflict(term, language, { resolvedBy, interpretation, note = null, actorId = "system" } = {}) {
        const memory = memoryOrNull();
        if (!memory) return { success: false, reason: "CozyMemory is not loaded." };
        if (!isNonEmptyString(resolvedBy)) return { success: false, reason: "A real resolvedBy is required." };
        if (!INTERPRETATIONS.includes(interpretation)) return { success: false, reason: `interpretation must be one of ${INTERPRETATIONS.join("/")}.` };
        const record = getConflict(term, language, actorId);
        if (!record) return { success: false, reason: "No conflict recorded for this term/language." };
        record.status = "RESOLVED";
        record.interpretation = interpretation;
        record.resolution = { resolvedBy, note, resolvedAt: Date.now() };
        record.updatedAt = Date.now();
        memory.saveMemory(NAMESPACE, conflictKey(term, language), record, { owner: actorId, actorId, visibility: "public" });
        return { success: true, conflict: record };
    }

    const ConflictDetection = Object.freeze({
        NAMESPACE, INTERPRETATIONS, getConflict, checkAndRecordConflict, resolveConflict, getVersion: () => MODULE_VERSION,
    });
    window.CozyOS.ConflictDetection = ConflictDetection;
    window.CozyOS.Modules["conflict-detection"] = Object.freeze({
        version: MODULE_VERSION,
        description: "CozyAI Continuous Multimodal Learning — structured, persisted CONFLICT records when the same term+language carries more than one distinct meaning (per evidence-profile.js). Never auto-resolves; resolveConflict() requires an explicit resolver and a closed interpretation vocabulary. Composes CozyMemory under its own dedicated namespace. Not <script>-included by any page."
    });
})();
