/**
 * core/modules/intelligence/language-packs/cozy-language-knowledge-model.js
 * RP-035 Phase 1 — Translation / Correction / Conflict Data Model
 *
 * OWNERSHIP
 *   New, additive, standalone file. Does not modify
 *   cozy-language-pack-registry.js, cozy-knowledge-community.js, or
 *   cozy-knowledge-review.js.
 *
 * SCOPE
 *   The audit (Phase 0) found real word/phrase storage (submitExpression
 *   in cozy-language-pack-registry.js) and a real community/review
 *   pipeline (cozy-knowledge-community.js / cozy-knowledge-review.js),
 *   but no dedicated schema for:
 *     - a translation RELATIONSHIP between two expression records in
 *       different languages (as opposed to a string glued onto a word)
 *     - a CORRECTION that preserves the original rather than overwriting it
 *     - a CONFLICT between two disagreeing candidates/records
 *   This file adds exactly those three record types. It does not
 *   duplicate expression storage, provenance, evidence banding, or the
 *   review/promotion pipeline — it composes the existing engines by
 *   reading their real public APIs at call time.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 *   - Does not invent a confidence number. New records start at
 *     confidence: "UNKNOWN" unless the caller supplies real evidence.
 *   - Does not auto-resolve a conflict. reconcileConflict-style
 *     decisions require an explicit resolver.
 *   - Does not create a second review/promotion system. Teaching
 *     submissions are composed through cozy-knowledge-community.js's
 *     real submitContribution() when it is present; if it is not
 *     loaded, this file reports CAPABILITY_UNAVAILABLE rather than
 *     silently building its own review logic.
 */
(function (root) {
    "use strict";
    const w = root.window || root;
    w.CozyOS = w.CozyOS || {};
    w.CozyOS.Modules = w.CozyOS.Modules || {};
    if (w.CozyOS.Modules["cozy-language-knowledge-model"]) return;

    const VERSION = "1.0.0";

    function packRegistry() {
        return w.CozyOS && w.CozyOS.CozyLanguagePacks ? w.CozyOS.CozyLanguagePacks : null;
    }
    function teachRouting() {
        return w.CozyOS && w.CozyOS.CozyTeachCozyAIRouting ? w.CozyOS.CozyTeachCozyAIRouting : null;
    }

    function nowISO() { return new Date().toISOString(); }

    // -----------------------------------------------------------------
    // 1. VALIDATION STATES (shared vocabulary, mirrors the mission's
    //    REGISTERED/NOT_READY/... style: explicit, never silently
    //    promoted by this file)
    // -----------------------------------------------------------------
    const RELATIONSHIP_VALIDATION_STATES = Object.freeze([
        "PROPOSED", "UNDER_REVIEW", "VALIDATED", "DISPUTED", "REJECTED"
    ]);
    const CORRECTION_VALIDATION_STATES = Object.freeze([
        "PROPOSED", "CONFIRMED", "REJECTED"
    ]);
    const CONFLICT_STATUSES = Object.freeze([
        "CONFLICT_OPEN", "CONFLICT_UNRESOLVED", "CONFLICT_RESOLVED"
    ]);

    // -----------------------------------------------------------------
    // 2. IN-MEMORY STORES (a real persistent backend can be swapped in
    //    per-store via bindBackend(); see cozy-language-pack-
    //    persistence.js, which already provides a compatible adapter
    //    for the "translation_memory" and "learning_progress" stores)
    // -----------------------------------------------------------------
    let nextTranslationId = 1;
    let nextCorrectionId = 1;
    let nextConflictId = 1;
    const translations = new Map();
    const corrections = new Map();
    const conflicts = new Map();

    let backends = { translations: null, correctionsAndConflicts: null };

    function bindBackends({ translationBackend, eventBackend } = {}) {
        backends.translations = translationBackend || null;
        backends.correctionsAndConflicts = eventBackend || null;
    }

    async function persist(kind, key, value) {
        const backend = kind === "translation" ? backends.translations : backends.correctionsAndConflicts;
        if (backend && typeof backend.set === "function") {
            try { await backend.set(key, value); } catch (_err) { /* honest no-op: in-memory copy remains authoritative */ }
        }
    }

    // -----------------------------------------------------------------
    // 3. TRANSLATION RELATIONSHIP
    //    Never assumes reversibility: en->sw and sw->en are separate
    //    relationship records, even when they reference the same pair
    //    of expression records.
    // -----------------------------------------------------------------
    function createTranslationRelationship(input) {
        const inp = input || {};
        const required = ["sourceLanguage", "sourceEntryId", "targetLanguage", "targetEntryId"];
        for (const field of required) {
            if (!inp[field]) return { status: "REJECTED", reason: `MISSING_FIELD_${field.toUpperCase()}` };
        }

        const registry = packRegistry();
        if (registry) {
            if (!registry.getPack(inp.sourceLanguage)) return { status: "REJECTED", reason: "UNKNOWN_SOURCE_LANGUAGE" };
            if (!registry.getPack(inp.targetLanguage)) return { status: "REJECTED", reason: "UNKNOWN_TARGET_LANGUAGE" };
        }

        const id = `tr_${nextTranslationId++}`;
        const record = {
            id,
            sourceLanguage: String(inp.sourceLanguage).toLowerCase(),
            sourceEntryId: inp.sourceEntryId,
            targetLanguage: String(inp.targetLanguage).toLowerCase(),
            targetEntryId: inp.targetEntryId,
            meaning: inp.meaning || null,
            context: inp.context || null,
            confidence: inp.confidence != null ? inp.confidence : "UNKNOWN",
            provenance: {
                sourceType: inp.sourceType || "MANUAL",
                contributorId: inp.contributorId || null,
                createdAt: nowISO()
            },
            validationState: "PROPOSED",
            createdBy: inp.contributorId || null,
            createdAt: nowISO(),
            updatedAt: nowISO(),
            version: 1
        };
        translations.set(id, record);
        persist("translation", id, record);
        return { status: "CREATED", id, record: clone(record) };
    }

    function getTranslationRelationship(id) {
        const r = translations.get(id);
        return r ? clone(r) : null;
    }

    function listTranslationRelationships(filter) {
        const f = filter || {};
        return Array.from(translations.values())
            .filter((r) => !f.sourceLanguage || r.sourceLanguage === f.sourceLanguage)
            .filter((r) => !f.targetLanguage || r.targetLanguage === f.targetLanguage)
            .map(clone);
    }

    function setTranslationValidationState(id, state, reviewerId) {
        if (!RELATIONSHIP_VALIDATION_STATES.includes(state)) {
            return { status: "REJECTED", reason: "UNKNOWN_VALIDATION_STATE" };
        }
        const r = translations.get(id);
        if (!r) return { status: "REJECTED", reason: "NOT_FOUND" };
        r.validationState = state;
        r.updatedAt = nowISO();
        r.version += 1;
        r.lastReviewedBy = reviewerId || null;
        persist("translation", id, r);
        return { status: "UPDATED", record: clone(r) };
    }

    // -----------------------------------------------------------------
    // 4. CORRECTION RECORD
    //    Never overwrites the original. The original stays retrievable
    //    forever through this record's originalValue field.
    // -----------------------------------------------------------------
    function createCorrection(input) {
        const inp = input || {};
        if (!inp.targetRecordId || !inp.targetRecordType) {
            return { status: "REJECTED", reason: "MISSING_TARGET_RECORD" };
        }
        if (inp.originalValue === undefined || inp.correctedValue === undefined) {
            return { status: "REJECTED", reason: "MISSING_VALUES" };
        }
        const id = `corr_${nextCorrectionId++}`;
        const record = {
            id,
            targetRecordId: inp.targetRecordId,
            targetRecordType: inp.targetRecordType, // "EXPRESSION" | "TRANSLATION_RELATIONSHIP"
            originalValue: inp.originalValue,
            correctedValue: inp.correctedValue,
            correctedBy: inp.correctedBy || null,
            reason: inp.reason || null,
            timestamp: nowISO(),
            confidenceBefore: inp.confidenceBefore != null ? inp.confidenceBefore : "UNKNOWN",
            confidenceAfter: inp.confidenceAfter != null ? inp.confidenceAfter : "UNKNOWN",
            validationState: "PROPOSED",
            history: [{ event: "CORRECTION_PROPOSED", at: nowISO(), by: inp.correctedBy || null }]
        };
        corrections.set(id, record);
        persist("correctionOrConflict", id, record);
        return { status: "CREATED", id, record: clone(record) };
    }

    function reviewCorrection(id, decision, reviewerId, reasonNote) {
        if (!CORRECTION_VALIDATION_STATES.includes(decision)) {
            return { status: "REJECTED", reason: "UNKNOWN_DECISION" };
        }
        const r = corrections.get(id);
        if (!r) return { status: "REJECTED", reason: "NOT_FOUND" };
        r.validationState = decision;
        r.history.push({ event: `CORRECTION_${decision}`, at: nowISO(), by: reviewerId || null, note: reasonNote || null });
        persist("correctionOrConflict", id, r);
        return { status: "UPDATED", record: clone(r) };
    }

    function getCorrection(id) {
        const r = corrections.get(id);
        return r ? clone(r) : null;
    }

    function listCorrections(filter) {
        const f = filter || {};
        return Array.from(corrections.values())
            .filter((r) => !f.targetRecordId || r.targetRecordId === f.targetRecordId)
            .filter((r) => !f.validationState || r.validationState === f.validationState)
            .map(clone);
    }

    // -----------------------------------------------------------------
    // 5. CONFLICT RECORD
    //    Two candidates disagreeing never auto-resolves. resolveConflict
    //    requires an explicit resolver and is the ONLY way status
    //    leaves CONFLICT_OPEN/CONFLICT_UNRESOLVED.
    // -----------------------------------------------------------------
    function openConflict(input) {
        const inp = input || {};
        if (!inp.languageId || !inp.candidateA || !inp.candidateB) {
            return { status: "REJECTED", reason: "MISSING_CANDIDATES" };
        }
        const id = `conf_${nextConflictId++}`;
        const record = {
            id,
            languageId: String(inp.languageId).toLowerCase(),
            meaningContext: inp.meaningContext || null,
            candidateA: inp.candidateA,
            candidateB: inp.candidateB,
            status: "CONFLICT_OPEN",
            evidence: inp.evidence || [],
            resolution: null,
            createdAt: nowISO(),
            updatedAt: nowISO()
        };
        conflicts.set(id, record);
        persist("correctionOrConflict", id, record);
        return { status: "CREATED", id, record: clone(record) };
    }

    function markConflictUnresolved(id, note) {
        const r = conflicts.get(id);
        if (!r) return { status: "REJECTED", reason: "NOT_FOUND" };
        r.status = "CONFLICT_UNRESOLVED";
        r.updatedAt = nowISO();
        if (note) r.evidence.push({ note, at: nowISO() });
        persist("correctionOrConflict", id, r);
        return { status: "UPDATED", record: clone(r) };
    }

    function resolveConflict(id, resolution) {
        const res = resolution || {};
        if (!res.resolvedBy || !res.resolvedValue) {
            return { status: "REJECTED", reason: "RESOLUTION_REQUIRES_RESOLVER_AND_VALUE" };
        }
        const r = conflicts.get(id);
        if (!r) return { status: "REJECTED", reason: "NOT_FOUND" };
        r.status = "CONFLICT_RESOLVED";
        r.resolution = {
            resolvedBy: res.resolvedBy,
            resolvedValue: res.resolvedValue,
            timestamp: nowISO(),
            reason: res.reason || null
        };
        r.updatedAt = nowISO();
        persist("correctionOrConflict", id, r);
        return { status: "UPDATED", record: clone(r) };
    }

    function getConflict(id) {
        const r = conflicts.get(id);
        return r ? clone(r) : null;
    }

    function listConflicts(filter) {
        const f = filter || {};
        return Array.from(conflicts.values())
            .filter((r) => !f.languageId || r.languageId === f.languageId)
            .filter((r) => !f.status || r.status === f.status)
            .map(clone);
    }

    // -----------------------------------------------------------------
    // 6. TEACHING SUBMISSION COMPOSER (RP-035 Phase 2 reconciliation)
    //    RP-035 Phase 2's ownership audit found that RP-031
    //    (cozy-teach-cozyai-routing-core.js) is the repository's real,
    //    already-wired, already-safety-gated single teaching entry
    //    point: it validates, runs the mandatory safety gate, submits
    //    through cozy-knowledge-contribution-core.js's draft lifecycle,
    //    AND routes accepted submissions into this canonical 17-language
    //    pack registry (submitExpression) so taught knowledge actually
    //    becomes pack knowledge. Calling cozy-knowledge-community.js's
    //    submitContribution() directly (Phase 1's original behavior)
    //    bypassed that safety gate and never reached a language pack at
    //    all — a second, thinner teaching path with weaker guarantees
    //    than the real one. Phase 2 closes that gap: submitTeaching()
    //    now composes RP-031's real, safety-gated
    //    submitTeachingContribution() exclusively. It never falls back
    //    to a direct community-engine call — if RP-031 is not loaded,
    //    this reports CAPABILITY_UNAVAILABLE honestly rather than using
    //    a weaker path.
    // -----------------------------------------------------------------
    function submitTeaching(input) {
        const t = teachRouting();
        if (!t || typeof t.submitTeachingContribution !== "function") {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "cozy-teach-cozyai-routing-core.js (RP-031) not loaded" };
        }
        return t.submitTeachingContribution(input);
    }

    function clone(o) { return JSON.parse(JSON.stringify(o)); }

    const api = Object.freeze({
        VERSION,
        RELATIONSHIP_VALIDATION_STATES,
        CORRECTION_VALIDATION_STATES,
        CONFLICT_STATUSES,
        bindBackends,
        createTranslationRelationship,
        getTranslationRelationship,
        listTranslationRelationships,
        setTranslationValidationState,
        createCorrection,
        reviewCorrection,
        getCorrection,
        listCorrections,
        openConflict,
        markConflictUnresolved,
        resolveConflict,
        getConflict,
        listConflicts,
        submitTeaching
    });

    w.CozyOS.CozyLanguageKnowledgeModel = api;
    w.CozyOS.Modules["cozy-language-knowledge-model"] = Object.freeze({
        version: VERSION,
        api,
        description: "RP-035 Phase 1/2 — Adds TranslationRelationship, CorrectionRecord, and ConflictRecord schemas supporting the canonical 17-language pack registry. No confidence numbers invented; new records start at 'UNKNOWN'. Corrections never overwrite originals. Conflicts never auto-resolve. In-memory by default; a persistent backend can be bound via bindBackends() using the adapters cozy-language-pack-persistence.js already provides for the translation_memory/learning_progress stores. Phase 2: submitTeaching() composes RP-031's real, safety-gated cozy-teach-cozyai-routing-core.js exclusively — it is no longer a second, weaker teaching entry point that bypassed the safety gate and the language-pack registry; RP-031 remains the single teaching entry point in this repository."
    });
})(typeof window !== "undefined" ? { window: window } : { window: (global.window = global.window || {}) });
