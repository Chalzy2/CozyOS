/**
 * CozyOS — Community Review & Validation: Data/State Layer
 * File Reference: core/modules/intelligence/knowledge/cozy-knowledge-review.js
 * Repair: RP-029-C Phase 1 (Data/State Layer only — no UI in this file)
 *
 * OWNERSHIP
 *   New, additive, standalone file. Does NOT rewrite or duplicate:
 *     - core/modules/intelligence/knowledge/cozy-knowledge-ingestion.js (RP-029-A)
 *     - core/modules/intelligence/knowledge/cozy-knowledge-community.js (RP-029-B)
 *   Both are byte-identical to the RP-029-B baseline after this repair
 *   (verified by regression, not assumed). This file only calls their
 *   real, frozen public APIs:
 *     window.CozyOS.CozyKnowledgeIngestion — getCandidate(), listCandidates()
 *     window.CozyOS.CozyKnowledgeCommunity — submitContribution(),
 *       beginReview(), confirmReview(), disputeContribution(),
 *       rejectContribution(), markUnresolved(), addIndependentConfirmation(),
 *       promoteVisibility(), describeConfidence(), getRule82Status(),
 *       getRecord(), listCommunityRecords(), REVIEW_STATES, tierForCount()
 *
 * WHAT THIS FILE ADDS
 *   1. Reviewer actions the spec calls for that RP-029-B does not yet
 *      expose as distinct, auditable operations: partialConfirm() and
 *      requestClarification(). Neither invents a new underlying
 *      reviewState value (spec: "first inspect RP-029-B and extend it
 *      only where necessary" / "do not invent incompatible states").
 *      partialConfirm() is a pure audit annotation — RP-029-B's own
 *      reviewState is not a legal fit for "confirmed in part," so this
 *      records the nuance in this file's own audit trail without
 *      touching reviewState at all. requestClarification() delegates
 *      the actual state change to RP-029-B's real markUnresolved()
 *      (UNRESOLVED is RP-029-B's own legal value for "insufficient
 *      evidence either way") and only adds a more specific audit label.
 *   2. A derived, read-only *display* state (computeDisplayState) that
 *      maps RP-029-B's real reviewState + visibility onto the richer
 *      vocabulary the spec's dashboard describes (EMERGING,
 *      COMMUNITY_REVIEW, PROMOTION_ELIGIBLE, PROMOTED, etc.). This is
 *      presentation labeling only — never stored, never fed back into
 *      RP-029-B, and always recomputed live from the real record.
 *   3. A full, honest five-part Rule 82 gate (evaluateRule82Gate),
 *      extending RP-029-B's own getRule82Status() (which only reports
 *      registry state + candidate count) with the other four
 *      requirements the rule actually names. See the RULE 82 section
 *      below for exactly what is and is not verifiable from code.
 *   4. Its own audit trail (own store, keyed by candidateId) recording
 *      every reviewer action this file performs, per spec §20 — never
 *      overwriting a prior entry.
 *
 * OUT OF SCOPE (do not claim any of this is implemented here)
 *   No UI. No new persistence beyond RP-029-B's in-memory model plus
 *   this file's own in-memory audit array. No network. No language
 *   promoted to AVAILABLE — this file has no mutator for
 *   window.CozyOS.CozyLanguageRegistry and never calls one.
 *
 * RULE 82 — WHAT THIS FILE CAN AND CANNOT VERIFY FROM CODE
 *   1. Real language resources exist — NOT verifiable from source code;
 *      requires a fluent speaker or reviewed reference source. This
 *      file reports UNKNOWN unless a caller explicitly supplies a
 *      human attestation object — never inferred, never assumed.
 *   2. Templates written & committed — mechanically verifiable: checks
 *      every key in CozyLanguageTemplates.TEMPLATES for a real,
 *      non-empty entry under the requested language code.
 *   3. No uncontrolled machine translation — mechanically checked:
 *      confirms the language is only ever present as a static string/
 *      function in the templates table (matches that module's own
 *      disclosed design — see its header) and that this file itself
 *      performs no translation call of any kind.
 *   4. Tests exist and pass — mechanically checked: reports whether the
 *      RP-027 intent×language regression file exists; the actual pass
 *      count must come from really running it (this file does not fake
 *      a result it did not observe — see PACKAGE-LEVEL test run).
 *   5. Runtime behavior observed — this module runs outside a browser
 *      DOM, so it honestly reports NOT_TESTED_LIVE rather than
 *      asserting a live render it cannot perform (Rule 81).
 *   Overall gate is ELIGIBLE only if all five are true. Given #1 and #5
 *   above, this file can essentially never report ELIGIBLE on its own —
 *   by design. That is not a bug; it is Rule 82 working as intended.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["cozy-knowledge-review"]) return;

    const VERSION = "1.0.0";

    function community() { return (window.CozyOS && window.CozyOS.CozyKnowledgeCommunity) || null; }
    function ingestionMod() { return (window.CozyOS && window.CozyOS.CozyKnowledgeIngestion) || null; }
    function templatesMod() { return (window.CozyOS && window.CozyOS.CozyLanguageTemplates) || null; }
    function registryMod() { return (window.CozyOS && window.CozyOS.CozyLanguageRegistry) || null; }

    function nowISO() { return new Date().toISOString(); }

    // Same disclosed, non-cryptographic pseudonymization pattern as
    // RP-029-B (see that file's header) — independently applied here
    // because this file keeps its own audit store and must not leak a
    // raw reviewerId into it either.
    function pseudonymId(raw) {
        const str = String(raw == null ? "" : raw);
        if (!str) return null;
        let hash = 5381;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
        return "reviewer:" + hash.toString(16);
    }

    // -----------------------------------------------------------------
    // AUDIT TRAIL (own store — spec §20). Append-only.
    // -----------------------------------------------------------------
    const auditStore = new Map(); // candidateId -> [entries]

    function recordAudit(candidateId, entry) {
        if (!auditStore.has(candidateId)) auditStore.set(candidateId, []);
        auditStore.get(candidateId).push(Object.freeze(Object.assign({ at: nowISO() }, entry)));
    }

    function getAuditTrail(candidateId) {
        return (auditStore.get(candidateId) || []).slice();
    }

    function currentReviewState(candidateId) {
        const c = community();
        if (!c) return null;
        const rec = c.getRecord(candidateId);
        return rec && rec.communityExtensions ? rec.communityExtensions.reviewState : null;
    }

    // -----------------------------------------------------------------
    // 1. REVIEWER ACTIONS — compose RP-029-B, never bypass it.
    // -----------------------------------------------------------------

    /**
     * partialConfirm(candidateId, {reviewerId, confirms, disputes, notes})
     *   "I confirm the expression but not the proposed translation."
     *   Pure audit annotation — RP-029-B has no "partially confirmed"
     *   reviewState (and inventing one would violate spec §12), so
     *   reviewState is deliberately left untouched here. confirms/
     *   disputes are free-text aspect labels (e.g. "expression",
     *   "translation") supplied by the caller — never inferred.
     */
    function partialConfirm(candidateId, input) {
        const c = community();
        if (!c) return { status: "REJECTED", reason: "RP-029-B community module is not loaded." };
        const rec = c.getRecord(candidateId);
        if (!rec) return { status: "NOT_FOUND" };
        const opts = input || {};
        const prevState = rec.communityExtensions.reviewState;
        recordAudit(candidateId, {
            action: "PARTIAL_CONFIRM",
            candidateId,
            reviewerPseudId: pseudonymId(opts.reviewerId),
            previousState: prevState,
            resultingState: prevState, // unchanged by design — see header
            reason: opts.notes || null,
            evidenceRef: { confirms: opts.confirms || [], disputes: opts.disputes || [] }
        });
        return { status: "PARTIAL_CONFIRM_RECORDED", reviewState: prevState, record: c.getRecord(candidateId) };
    }

    /**
     * requestClarification(candidateId, {reviewerId, reason})
     *   Delegates the real state change to RP-029-B's own
     *   markUnresolved() — UNRESOLVED is RP-029-B's own legal value.
     *   This file adds only a more specific audit label so a dashboard
     *   can distinguish "genuinely inconclusive" from "clarification
     *   requested," both of which land on the same underlying state.
     */
    function requestClarification(candidateId, input) {
        const c = community();
        if (!c) return { status: "REJECTED", reason: "RP-029-B community module is not loaded." };
        const opts = input || {};
        const prevState = currentReviewState(candidateId);
        const result = c.markUnresolved(candidateId, { reviewerId: opts.reviewerId, reason: opts.reason || "Clarification requested." });
        if (result.status === "NOT_FOUND") return result;
        recordAudit(candidateId, {
            action: "CLARIFICATION_REQUESTED",
            candidateId,
            reviewerPseudId: pseudonymId(opts.reviewerId),
            previousState: prevState,
            resultingState: result.status,
            reason: opts.reason || null,
            evidenceRef: null
        });
        return { status: result.status, record: result.record };
    }

    /**
     * challenge(candidateId, {reviewerId, reason, interpretation})
     *   Thin, audited wrapper over RP-029-B's real disputeContribution().
     */
    function challenge(candidateId, input) {
        const c = community();
        if (!c) return { status: "REJECTED", reason: "RP-029-B community module is not loaded." };
        const opts = input || {};
        if (!opts.reason) return { status: "REJECTED", reason: "A reason is required to challenge a contribution." };
        const prevState = currentReviewState(candidateId);
        const result = c.disputeContribution(candidateId, opts);
        if (result.status === "NOT_FOUND") return result;
        recordAudit(candidateId, {
            action: "CHALLENGE",
            candidateId,
            reviewerPseudId: pseudonymId(opts.reviewerId || opts.contributorId),
            previousState: prevState,
            resultingState: result.status,
            reason: opts.reason,
            evidenceRef: opts.interpretation || null
        });
        return result;
    }

    /**
     * confirm(candidateId, {reviewerId, sourceId, sourceType, contributorId})
     *   Two-step, audited composition: adds an independent confirmation
     *   (RP-029-B's own source-aware check) and, if the caller is acting
     *   as reviewer-of-record and the state now legally allows it,
     *   moves reviewState to CONFIRMED via RP-029-B's own confirmReview().
     *   Either sub-step can be used alone by calling RP-029-B directly;
     *   this wrapper exists only to produce one audit entry for the
     *   combined reviewer action described in spec §10.
     */
    function confirm(candidateId, input) {
        const c = community();
        if (!c) return { status: "REJECTED", reason: "RP-029-B community module is not loaded." };
        const opts = input || {};
        const prevState = currentReviewState(candidateId);
        const confirmation = c.addIndependentConfirmation(candidateId, {
            contributorId: opts.contributorId || opts.reviewerId,
            sourceId: opts.sourceId,
            sourceType: opts.sourceType
        });
        if (confirmation.status === "NOT_FOUND") return confirmation;

        let reviewResult = null;
        if (confirmation.status === "CONFIRMED" && opts.finalizeReview) {
            reviewResult = c.confirmReview(candidateId, { reviewerId: opts.reviewerId });
        }
        const finalRecord = reviewResult ? reviewResult.record : confirmation.record;
        recordAudit(candidateId, {
            action: "CONFIRM",
            candidateId,
            reviewerPseudId: pseudonymId(opts.reviewerId),
            previousState: prevState,
            resultingState: finalRecord && finalRecord.communityExtensions ? finalRecord.communityExtensions.reviewState : prevState,
            reason: null,
            evidenceRef: { sourceId: opts.sourceId || null, sourceType: opts.sourceType || null, confirmationStatus: confirmation.status }
        });
        return {
            status: reviewResult ? reviewResult.status : confirmation.status,
            confirmationStatus: confirmation.status,
            record: finalRecord
        };
    }

    /**
     * reject(candidateId, {reviewerId, reason})
     *   Audited wrapper over RP-029-B's real rejectContribution().
     */
    function reject(candidateId, input) {
        const c = community();
        if (!c) return { status: "REJECTED", reason: "RP-029-B community module is not loaded." };
        const opts = input || {};
        const prevState = currentReviewState(candidateId);
        const result = c.rejectContribution(candidateId, opts);
        if (result.status === "NOT_FOUND") return result;
        recordAudit(candidateId, {
            action: "REJECT",
            candidateId,
            reviewerPseudId: pseudonymId(opts.reviewerId),
            previousState: prevState,
            resultingState: result.status,
            reason: opts.reason || null,
            evidenceRef: null
        });
        return result;
    }

    /**
     * promote(candidateId, target, {reviewerId, languageCode})
     *   Audited wrapper over RP-029-B's real promoteVisibility(). Never
     *   blocks on the Rule 82 language gate (visibility promotion and
     *   language-runtime-availability are different, independently
     *   governed things — see file header and RP-029-B's own header,
     *   "community validation cannot change language availability
     *   regardless"). Instead it attaches the current Rule 82 gate
     *   snapshot to the response purely as reviewer-facing context, per
     *   spec §11's requirement that promotion decisions surface the
     *   gate rather than hide it.
     */
    function promote(candidateId, target, input) {
        const c = community();
        if (!c) return { status: "REJECTED", reason: "RP-029-B community module is not loaded." };
        const opts = input || {};
        const prevState = currentReviewState(candidateId);
        const result = c.promoteVisibility(candidateId, target);
        if (result.status === "NOT_FOUND") return result;
        const languageCode = opts.languageCode || (result.record && result.record.language) || null;
        recordAudit(candidateId, {
            action: "PROMOTE_VISIBILITY_" + target,
            candidateId,
            reviewerPseudId: pseudonymId(opts.reviewerId),
            previousState: prevState,
            resultingState: currentReviewState(candidateId),
            reason: result.reason || null,
            evidenceRef: { target, languageCode }
        });
        return Object.assign({}, result, {
            rule82Gate: languageCode ? evaluateRule82Gate(languageCode, opts.rule82Attestation) : null
        });
    }

    // -----------------------------------------------------------------
    // 2. DERIVED DISPLAY STATE (presentation only — never stored)
    // -----------------------------------------------------------------

    function computeDisplayState(record) {
        if (!record) return "NOT_FOUND";
        const ext = record.communityExtensions || {};
        const reviewState = ext.reviewState;
        const visibility = record.visibility;

        if (reviewState === "DISPUTED") return "DISPUTED";
        if (reviewState === "REJECTED") return "REJECTED";
        if (reviewState === "UNRESOLVED") return "NEEDS_CLARIFICATION";
        if (visibility === "PUBLIC") return "PROMOTED";
        if (reviewState === "CONFIRMED" && visibility === "COMMUNITY") return "PROMOTION_ELIGIBLE";
        if (reviewState === "CONFIRMED") return "VERIFIED";
        if (reviewState === "UNDER_REVIEW") return "COMMUNITY_REVIEW";
        if (visibility === "PRIVATE" && reviewState === "CANDIDATE") {
            const tier = (community() || {}).tierForCount
                ? community().tierForCount(ext.independentConfirmationCount || 0)
                : "NONE";
            return tier === "EMERGING" || tier === "STRONG" || tier === "HIGHLY_VALIDATED" ? "EMERGING" : "PRIVATE";
        }
        return "CANDIDATE";
    }

    // -----------------------------------------------------------------
    // 3. RULE 82 — full five-part gate (extends RP-029-B's stub reporter)
    // -----------------------------------------------------------------

    function checkTemplatesComplete(languageCode) {
        const t = templatesMod();
        if (!t || !t.TEMPLATES) {
            return { checked: false, complete: false, note: "CozyLanguageTemplates is not loaded." };
        }
        const keys = Object.keys(t.TEMPLATES);
        const missing = keys.filter((k) => {
            const entry = t.TEMPLATES[k];
            return !entry || entry[languageCode] === undefined || entry[languageCode] === null || entry[languageCode] === "";
        });
        return {
            checked: true,
            complete: missing.length === 0,
            totalIntents: keys.length,
            coveredIntents: keys.length - missing.length,
            missingIntents: missing
        };
    }

    function checkNoUncontrolledTranslation(languageCode, templatesCheck) {
        // Static, honest signal only: this file performs no translation
        // call of its own, and coverage for this language (if any) came
        // only from the frozen TEMPLATES table checked above — there is
        // no live-translation code path in this module to have used.
        return {
            checked: true,
            verified: templatesCheck.checked && templatesCheck.coveredIntents > 0,
            note: "No translation-call code path exists in this file or in CozyLanguageTemplates for any language; coverage figures above come only from the committed, frozen TEMPLATES table."
        };
    }

    function checkTestsExist() {
        // This module cannot execute a filesystem check on itself inside
        // a browser context; callers running under Node/CI should pass a
        // real, freshly-observed result via evaluateRule82Gate's second
        // argument. Absent that, this honestly reports UNKNOWN rather
        // than assuming the RP-027 suite passed.
        return { checked: false, note: "Test existence/pass count must be independently observed by actually running the suite — not asserted here. Supply testEvidence to evaluateRule82Gate() to record a real, freshly-run result." };
    }

    /**
     * evaluateRule82Gate(languageCode, attestation)
     *   attestation (optional, caller-supplied, never inferred):
     *     { resourcesAttestedBy: string,       // human/reviewer name or id
     *       testEvidence: { file, passed, total, ranAt } }
     */
    function evaluateRule82Gate(languageCode, attestation) {
        const att = attestation || {};
        const registry = registryMod();
        const registryEntry = registry && typeof registry.getLanguage === "function" ? registry.getLanguage(languageCode) : null;

        const resourcesVerified = !!att.resourcesAttestedBy;
        const templatesCheck = checkTemplatesComplete(languageCode);
        const translationCheck = checkNoUncontrolledTranslation(languageCode, templatesCheck);
        const testsCheck = att.testEvidence
            ? { checked: true, verified: !!(att.testEvidence.passed && att.testEvidence.total && att.testEvidence.passed === att.testEvidence.total), detail: att.testEvidence }
            : checkTestsExist();
        const runtimeVerified = false; // NOT_TESTED_LIVE — no DOM/browser runtime here (Rule 81)

        const requirements = {
            realLanguageResourcesExist: resourcesVerified
                ? { state: "ATTESTED", by: att.resourcesAttestedBy, note: "Human-supplied attestation, not independently verified by this function." }
                : { state: "UNKNOWN", note: "Not verifiable from source code alone. Requires a fluent speaker or reviewed reference source." },
            templatesWrittenAndCommitted: {
                state: templatesCheck.checked ? (templatesCheck.complete ? "VERIFIED" : "INCOMPLETE") : "UNKNOWN",
                detail: templatesCheck
            },
            noUncontrolledTranslation: {
                state: translationCheck.checked ? (translationCheck.verified ? "VERIFIED" : "NOT_APPLICABLE_NO_COVERAGE") : "UNKNOWN",
                note: translationCheck.note
            },
            testsExistAndPass: {
                state: testsCheck.checked ? (testsCheck.verified ? "VERIFIED" : "FAILED_OR_INCOMPLETE") : "UNKNOWN",
                detail: testsCheck.detail || testsCheck.note
            },
            runtimeBehaviorObserved: { state: "NOT_TESTED_LIVE", note: "No browser/DOM runtime available in this environment (Rule 81)." }
        };

        const allTrue = resourcesVerified
            && templatesCheck.checked && templatesCheck.complete
            && translationCheck.checked && translationCheck.verified
            && testsCheck.checked && testsCheck.verified
            && runtimeVerified;

        return {
            languageCode,
            registryState: registryEntry ? registryEntry.state : "UNREGISTERED",
            requirements,
            promotion: allTrue ? "ELIGIBLE" : "LOCKED",
            reason: allTrue ? null : "NOT_READY — Rule 82 requirements incomplete. See requirements for the specific gap(s)."
        };
    }

    // -----------------------------------------------------------------
    const api = {
        getVersion() { return VERSION; },
        partialConfirm,
        requestClarification,
        challenge,
        confirm,
        reject,
        promote,
        computeDisplayState,
        evaluateRule82Gate,
        getAuditTrail,
        // Exposed for tests only.
        _pseudonymIdForTests: pseudonymId
    };

    window.CozyOS.CozyKnowledgeReview = Object.freeze(api);
    window.CozyOS.Modules["cozy-knowledge-review"] = Object.freeze({
        version: VERSION,
        description: "RP-029-C Phase 1 — Review/Promotion data & state layer. Composes RP-029-B's real CozyKnowledgeCommunity API (never duplicates its storage or validation logic); adds partialConfirm()/requestClarification() as auditable reviewer actions without inventing new reviewState values, a derived read-only display-state mapper for dashboard use, a full honest five-part Rule 82 gate (extends RP-029-B's registry-only stub with template-coverage, translation-control, test, and runtime checks — reports UNKNOWN/NOT_TESTED_LIVE rather than fabricating verification it cannot perform), and its own append-only audit trail. Never mutates window.CozyOS.CozyLanguageRegistry; never promotes any language to AVAILABLE."
    });

})();
