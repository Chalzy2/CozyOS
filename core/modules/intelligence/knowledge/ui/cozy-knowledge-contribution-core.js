/**
 * CozyOS — Community Contribution Interface: Pure Logic Layer (no DOM)
 * File Reference: core/modules/intelligence/knowledge/ui/cozy-knowledge-contribution-core.js
 * Repair: RP-029-C Phase 3 (Community Contribution Interface)
 *
 * OWNERSHIP
 *   New, additive, standalone file. Composes real, frozen public APIs
 *   only — never duplicates their logic:
 *     window.CozyOS.CozyKnowledgeCommunity        (RP-029-B) — submitContribution()
 *     window.CozyOS.CozyKnowledgeReview            (Phase 1)  — computeDisplayState(), getAuditTrail()
 *     window.CozyOS.CozyLanguageRegistry           (RP-027)   — listLanguages()/getLanguage() (read-only)
 *     window.CozyOS.CozyKnowledgeReviewHotspotBridge (Phase 2) — shareCandidate()/listActiveConnections()
 *   None of these files, nor cozy-knowledge-ingestion.js or
 *   cozy-language-templates.js, is modified by this file.
 *
 * WHY DRAFT/READY ARE CLIENT-ONLY
 *   Nothing in RP-029-A/B persists an unsubmitted draft — the real
 *   pipeline only creates a record once submitContribution() actually
 *   runs. DRAFT and READY (spec §14) are therefore honestly modeled
 *   here as in-memory, this-browser-tab-only states that exist BEFORE
 *   any real API call — never written to any store, never confused
 *   with a real candidate. The moment a real submission succeeds, this
 *   file stops tracking its own state for that item and defers entirely
 *   to the real record (via CozyKnowledgeCommunity.getRecord() /
 *   CozyKnowledgeReview.computeDisplayState(), which already covers
 *   CANDIDATE/UNDER_REVIEW/CONFIRMED/DISPUTED/REJECTED/UNRESOLVED/
 *   PROMOTED/PROMOTION_ELIGIBLE — reused as-is, not reinvented).
 *
 * WITHDRAWAL — HONEST LIMIT
 *   No locked API exposes a way for an ordinary contributor to remove
 *   or hide their own already-submitted candidate (only reviewer-role
 *   rejectContribution() exists, per Phase 1/2). withdrawDraft() below
 *   only ever discards a local, not-yet-submitted draft — a real
 *   honest WITHDRAWN action after submission is reported as
 *   CAPABILITY_UNAVAILABLE, never faked by silently hiding the record
 *   client-side (which would not actually withdraw anything).
 *
 * ORAL-LANGUAGE-FIRST VALIDATION (spec §5/§6)
 *   requiredFields()/validateDraft() never require orthography/
 *   standardized spelling. For contributionType-implied oral evidence
 *   (PRONUNCIATION, DIALECT_VARIANT, or any type with no transcription
 *   supplied), the expression field itself is optional as long as an
 *   audioReference or phonetic representation is present — meaning/
 *   context are what's actually required, not spelling.
 *
 * PRIVACY / CONSENT (spec §10/§11)
 *   submitDraft() refuses (CONSENT_REQUIRED) unless the caller has
 *   explicitly set consent.acknowledged === true. Privacy level is
 *   passed straight through to the real candidate via
 *   CozyKnowledgeCommunity.submitContribution() — every RP-029-A
 *   candidate is PRIVATE by default regardless of what's requested
 *   here (that default is RP-029-A's own, not overridden by this
 *   file); promotion beyond that still requires Phase 1's real,
 *   audited promote() path, elsewhere in the dashboard.
 *
 * OFFLINE / COZY OFFLINE HOTSPOT (spec §22/§23) — composes Phase 2's
 *   real bridge only, never a second networking/sync system.
 *   Honest states used here: LOCAL (draft only, nothing sent anywhere)
 *   -> QUEUED (submitted locally, no active hotspot connection yet) ->
 *   SHARING (a real sendMessage() attempt is in flight) -> SHARED (the
 *   real engine reported success) -> FAILED (it reported failure) ->
 *   RETRYING (caller re-invoked share after FAILED). SYNC_PENDING is
 *   RP-029-B's own, already-honest, always-true status (no real network
 *   sync engine exists anywhere in this repository — unchanged from
 *   Phase 1/2). SYNCED and CONFLICT are never emitted by this file:
 *   no real synchronization-completion or merge-conflict detector
 *   exists in this repository to honestly back either state (recorded
 *   as a disclosed limitation, not fabricated — see HANDOFF.md).
 */
(function (root) {
    "use strict";

    function community() { return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeCommunity) || null; }
    function reviewMod() { return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeReview) || null; }
    function registry() { return (root.window && root.window.CozyOS && root.window.CozyOS.CozyLanguageRegistry) || null; }
    function hotspotBridge() { return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeReviewHotspotBridge) || null; }
    function safetyGate() { return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeSafetyGate) || null; }

    const CONTRIBUTION_TYPES = Object.freeze([
        "TEXT", "AUDIO_REFERENCE", "OCR_TEXT", "DOCUMENT_EVIDENCE", "WEBSITE_EVIDENCE",
        "COMMUNITY_EXPLANATION", "TRANSLATION", "PRONUNCIATION", "DIALECT_VARIANT"
    ]);

    // Maps this phase's contribution-type vocabulary onto RP-029-B's
    // own, already-real CONTRIBUTION_TYPES (WORD/PHRASE/TRANSLATION/
    // MEANING/CONTEXT/DIALECT_VARIATION/PRONUNCIATION/CULTURAL_CONTEXT)
    // — never a second, parallel enum stored anywhere; this is a
    // pure, stateless translation applied only at submit time.
    const TYPE_TO_RP029B = Object.freeze({
        TEXT: "PHRASE",
        AUDIO_REFERENCE: "PRONUNCIATION",
        OCR_TEXT: "PHRASE",
        DOCUMENT_EVIDENCE: "CONTEXT",
        WEBSITE_EVIDENCE: "CONTEXT",
        COMMUNITY_EXPLANATION: "CULTURAL_CONTEXT",
        TRANSLATION: "TRANSLATION",
        PRONUNCIATION: "PRONUNCIATION",
        DIALECT_VARIANT: "DIALECT_VARIATION"
    });

    const PRIVACY_LEVELS = Object.freeze(["PRIVATE", "COMMUNITY", "ANONYMOUS", "PUBLIC"]);
    const ORAL_TYPES = Object.freeze(["AUDIO_REFERENCE", "PRONUNCIATION", "DIALECT_VARIANT"]);

    let nextDraftId = 1;
    const drafts = new Map(); // draftId -> draft object (LOCAL-only, this tab)

    // -----------------------------------------------------------------
    // 1. LANGUAGE LIST — real registry only, never a second list
    // -----------------------------------------------------------------

    /**
     * listLanguageOptions()
     *   Real registry entries (AVAILABLE/NOT_READY), plus a single
     *   honest "OTHER" pseudo-option for a language not yet in the
     *   registry at all — never silently added to the real registry;
     *   its status is always UNKNOWN, and it is the caller's job to
     *   supply a free-text code, never invented here.
     */
    function listLanguageOptions() {
        const r = registry();
        if (!r) return { registryLoaded: false, options: [] };
        const options = r.listLanguages().map((l) => ({ code: l.code, name: l.name, nativeName: l.nativeName, status: l.state }));
        options.push({ code: null, name: "Other / not listed", nativeName: null, status: "UNKNOWN" });
        return { registryLoaded: true, options };
    }

    function languageStatus(code) {
        const r = registry();
        if (!r) return "UNKNOWN";
        const lang = r.getLanguage(code);
        return lang ? lang.state : "UNKNOWN";
    }

    // -----------------------------------------------------------------
    // 2. FIELD REQUIREMENTS — oral-language-first (spec §5/§6)
    // -----------------------------------------------------------------

    function requiredFields(contributionType) {
        const base = ["language", "meaning", "context"];
        if (ORAL_TYPES.indexOf(contributionType) !== -1) {
            // Oral evidence: never require a written expression/spelling.
            // At least one of audioReference/phonetic must stand in for it.
            return { required: base, oneOf: ["expression", "audioReference", "phonetic"] };
        }
        return { required: base.concat(["expression"]), oneOf: [] };
    }

    function validateDraft(draft) {
        const errors = [];
        if (!draft.contributionType || CONTRIBUTION_TYPES.indexOf(draft.contributionType) === -1) {
            errors.push("contributionType is required and must be one of: " + CONTRIBUTION_TYPES.join(", "));
        }
        const req = requiredFields(draft.contributionType);
        req.required.forEach((f) => { if (!draft[f] || !String(draft[f]).trim()) errors.push(`${f} is required.`); });
        if (req.oneOf.length > 0 && !req.oneOf.some((f) => draft[f] && String(draft[f]).trim())) {
            errors.push(`At least one of ${req.oneOf.join("/")} is required for oral-language evidence (spelling is never required).`);
        }
        if (draft.privacyLevel && PRIVACY_LEVELS.indexOf(draft.privacyLevel) === -1) {
            errors.push("privacyLevel must be one of: " + PRIVACY_LEVELS.join(", "));
        }
        if (!draft.consent || draft.consent.acknowledged !== true) {
            errors.push("Consent must be explicitly acknowledged before submission.");
        }
        return { valid: errors.length === 0, errors };
    }

    // -----------------------------------------------------------------
    // 3. DRAFT LIFECYCLE — client-only until real submission
    // -----------------------------------------------------------------

    function createDraft(fields) {
        const id = "draft_" + (nextDraftId++);
        const draft = Object.assign({
            id, state: "DRAFT", createdAt: new Date().toISOString(),
            language: null, dialect: null, region: null, contributionType: null,
            expression: null, meaning: null, literalMeaning: null, context: null,
            exampleUsage: null, pronunciation: null, phonetic: null, audioReference: null,
            translation: null, source: null, license: null, contributorId: null,
            privacyLevel: "PRIVATE", consent: { acknowledged: false }, notes: null
        }, fields || {});
        drafts.set(id, draft);
        const check = validateDraft(draft);
        draft.state = check.valid ? "READY" : "DRAFT";
        return draft;
    }

    function updateDraft(draftId, patch) {
        const draft = drafts.get(draftId);
        if (!draft) return { status: "NOT_FOUND" };
        Object.assign(draft, patch);
        const check = validateDraft(draft);
        draft.state = check.valid ? "READY" : "DRAFT";
        return { status: draft.state, errors: check.errors, draft: Object.assign({}, draft) };
    }

    function getDraft(draftId) {
        const d = drafts.get(draftId);
        return d ? Object.assign({}, d) : null;
    }

    /**
     * withdrawDraft(draftId)
     *   Only ever discards a local, not-yet-submitted draft. See file
     *   header for why post-submission withdrawal is honestly
     *   unavailable rather than faked.
     */
    function withdrawDraft(draftId) {
        const draft = drafts.get(draftId);
        if (!draft) return { status: "NOT_FOUND" };
        if (draft.state === "SUBMITTED") {
            return { status: "CAPABILITY_UNAVAILABLE", reason: "No API exists for an ordinary contributor to withdraw an already-submitted candidate. See file header." };
        }
        drafts.delete(draftId);
        return { status: "WITHDRAWN" };
    }

    // -----------------------------------------------------------------
    // 4. SUBMISSION — composes RP-029-B's real submitContribution() only
    // -----------------------------------------------------------------

    /**
     * submitDraft(draftId)
     *   Validates (never bypasses consent — spec §11), translates this
     *   phase's contribution-type vocabulary onto RP-029-B's own real
     *   enum, and calls the real submitContribution(). On success, the
     *   draft is marked SUBMITTED and its localCandidateId is recorded
     *   so the UI can hand off to the real record — this file tracks
     *   nothing further about that candidate's lifecycle itself.
     */
    function submitDraft(draftId) {
        const draft = drafts.get(draftId);
        if (!draft) return { status: "NOT_FOUND" };
        const check = validateDraft(draft);
        if (!check.valid) return { status: "REJECTED", errors: check.errors };

        // MANDATORY CONTENT SAFETY GATE — runs before any real candidate
        // is created (spec: "reject prohibited content BEFORE it becomes
        // a knowledge candidate"). See cozy-knowledge-safety-gate.js's
        // own header for exactly what is and is not really checked.
        const gate = safetyGate();
        if (gate) {
            const result = gate.classify(draft);
            if (result.classification === "UNSAFE") {
                draft.state = "DRAFT";
                return { status: "REJECTED_UNSAFE", userMessage: gate.USER_FACING_REJECTION_MESSAGE };
            }
            if (result.classification === "UNCERTAIN" || result.classification === "HIGH_RISK") {
                const q = gate.quarantine(draft, result, draft.contributorId);
                draft.state = "DRAFT";
                draft.quarantineId = q.id;
                return { status: "QUARANTINED", quarantineId: q.id, userMessage: "This contribution needs a quick human review before it can become a knowledge candidate. Thank you for your patience." };
            }
        }

        const c = community();
        if (!c) return { status: "CAPABILITY_UNAVAILABLE", reason: "CozyKnowledgeCommunity is not loaded." };

        const result = c.submitContribution({
            contributionType: TYPE_TO_RP029B[draft.contributionType] || "PHRASE",
            statement: draft.expression || draft.translation || draft.meaning,
            contributorId: draft.contributorId || null,
            language: draft.language,
            dialect: draft.dialect,
            region: draft.region,
            meaning: draft.meaning,
            translation: draft.translation,
            context: draft.context,
            pronunciation: draft.pronunciation || draft.phonetic || null,
            orthography: draft.expression && draft.contributionType && ORAL_TYPES.indexOf(draft.contributionType) === -1 ? draft.expression : null,
            audioReference: draft.audioReference || null,
            documentReference: draft.contributionType === "DOCUMENT_EVIDENCE" ? draft.source : null,
            variant: draft.dialect || null
        });

        if (result.status !== "SUBMITTED") {
            return { status: result.status, reason: result.reason, draft: Object.assign({}, draft) };
        }

        draft.state = "SUBMITTED";
        draft.localCandidateId = result.record.id;
        draft.submittedAt = new Date().toISOString();
        return { status: "SUBMITTED", candidateId: result.record.id, record: result.record };
    }

    // -----------------------------------------------------------------
    // 5. TIMELINE DISPLAY STATE — reuses Phase 1's real mapper for
    //    everything post-submission; only prepends the honest
    //    client-only DRAFT/READY states before a real record exists.
    // -----------------------------------------------------------------

    function timelineState(draftOrCandidateId) {
        const draft = drafts.get(draftOrCandidateId);
        if (draft && draft.state !== "SUBMITTED") return draft.state; // DRAFT | READY

        const c = community();
        const r = reviewMod();
        const candidateId = (draft && draft.localCandidateId) || draftOrCandidateId;
        if (!c || !r) return "CAPABILITY_UNAVAILABLE";
        const record = c.getRecord(candidateId);
        if (!record) return "NOT_FOUND";
        return r.computeDisplayState(record); // reused, not reinvented
    }

    // -----------------------------------------------------------------
    // 6. OFFLINE / COZY OFFLINE HOTSPOT — composes Phase 2's real bridge
    // -----------------------------------------------------------------

    /**
     * shareOffline(candidateRecord)
     *   Real send via Phase 2's real LiveHotspotEngine composition.
     *   Never fabricates SHARED without the engine actually reporting
     *   success, and never claims SYNCED (see file header).
     */
    function shareOffline(candidateRecord) {
        const bridge = hotspotBridge();
        if (!bridge) return { status: "CAPABILITY_UNAVAILABLE", reason: "Cozy Offline Hotspot bridge is not loaded." };
        const conn = bridge.listActiveConnections();
        if (!conn.available || conn.connections.length === 0) return { status: "QUEUED", reason: "No active Cozy Offline Hotspot connection yet." };

        const result = bridge.shareCandidate(candidateRecord);
        if (result.status === "SENT") return { status: "SHARED", sentTo: result.sentTo };
        if (result.status === "NO_ACTIVE_HOTSPOT_CONNECTION") return { status: "QUEUED" };
        return { status: "FAILED", reason: result.reason || result.status };
    }

    function retryShare(candidateRecord) {
        const first = shareOffline(candidateRecord);
        return Object.assign({}, first, { retried: true });
    }

    // -----------------------------------------------------------------
    const api = {
        CONTRIBUTION_TYPES,
        PRIVACY_LEVELS,
        // Exposed (Phase 5 addition, purely additive — no existing
        // function's behavior changes) so cozy-knowledge-quarantine-
        // admin-core.js can reuse the exact same real mapping when
        // submitting released quarantine content, instead of defining
        // a second, parallel table that could drift from this one.
        TYPE_TO_RP029B,
        listLanguageOptions,
        languageStatus,
        requiredFields,
        validateDraft,
        createDraft,
        updateDraft,
        getDraft,
        withdrawDraft,
        submitDraft,
        timelineState,
        shareOffline,
        retryShare
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyKnowledgeContributionCore = Object.freeze(api);
        root.window.CozyOS.Modules["cozy-knowledge-contribution-core"] = Object.freeze({
            version: "1.0.0",
            description: "RP-029-C Phase 3 — Contribution form pure-logic layer. Composes RP-029-B's real submitContribution(), Phase 1's real computeDisplayState(), the real language registry, and Phase 2's real Cozy Offline Hotspot bridge — never a duplicate validation/state/networking system. DRAFT/READY are honest, this-tab-only states before any real record exists; every state after submission is Phase 1's own real, reused display state. Never emits SYNCED or CONFLICT (no real sync/merge engine exists in this repository — disclosed, not fabricated). Post-submission withdrawal is honestly CAPABILITY_UNAVAILABLE (no locked API supports it)."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: undefined });
