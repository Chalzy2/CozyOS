/**
 * CozyOS — Quarantine + Admin Safety Review: Pure Logic Layer (no DOM)
 * File Reference: core/modules/intelligence/knowledge/ui/cozy-knowledge-quarantine-admin-core.js
 * Repair: RP-029-C Phase 5 (Quarantine + Admin Safety Review)
 *
 * OWNERSHIP
 *   New, additive, standalone file. Composes real, frozen public APIs
 *   only — owns no quarantine CONTENT storage of its own (that remains
 *   Phase 4's cozy-knowledge-safety-gate.js, the single source of
 *   truth for quarantined content — this file only layers a review
 *   state machine + audit trail on top, exactly the same architectural
 *   pattern Phase 1 used for RP-029-B's candidates):
 *     window.CozyOS.CozyKnowledgeSafetyGate            (Phase 4/5) — listQuarantined()/getQuarantineEntry()/releaseFromQuarantine()
 *     window.CozyOS.CozyKnowledgeCommunity              (RP-029-B)  — submitContribution() (real candidate creation on release)
 *     window.CozyOS.CozyKnowledgeContributionCore       (Phase 3)   — TYPE_TO_RP029B (reused mapping, never duplicated)
 *     window.CozyOS.CozyKnowledgeReviewDashboardCore    (Phase 2)   — resolveRole() (real, existing authorization backend)
 *   None of these files is modified by THIS file. (cozy-knowledge-
 *   safety-gate.js and cozy-knowledge-contribution-core.js DID each
 *   receive a small, disclosed, additive change this pass — see
 *   HANDOFF.md — but that change lives in those files' own history,
 *   not here.)
 *
 * REVIEW STATE MACHINE
 *   QUARANTINED -> UNDER_REVIEW -> RELEASED | REJECTED | ESCALATED
 *   beginReview() is optional — release()/reject()/escalate() may be
 *   called directly from QUARANTINED (auto-passing through
 *   UNDER_REVIEW) for reviewer convenience, but any action attempted
 *   on an entry already in a terminal state (RELEASED/REJECTED/
 *   ESCALATED) is refused as INVALID_TRANSITION — states are never
 *   silently overwritten.
 *
 * RELEASE ≠ CORRECTNESS, RELEASE ≠ RULE 82
 *   release() creates a real candidate via
 *   CozyKnowledgeCommunity.submitContribution() — the exact same real
 *   function Phase 3's contribution form calls, reusing Phase 3's own
 *   real TYPE_TO_RP029B mapping rather than a second one. The
 *   resulting candidate is RP-029-A's own PRIVATE-by-default,
 *   UNVERIFIED record — it still requires independent confirmation,
 *   community review, and (separately, always) Rule 82 before any
 *   language-availability or public-promotion decision. This file has
 *   no mutator for window.CozyOS.CozyLanguageRegistry and never calls
 *   one — release can never promote a language, by construction.
 *
 * REJECTION — MINIMAL RETENTION
 *   reject() calls the real gate's REJECT decision (which deletes the
 *   entry's content from the gate's own store — see that file) and
 *   this layer's own audit event for a rejection deliberately omits
 *   the submitted field content, keeping only quarantineId/candidateId
 *   (null)/action/actor/timestamp/reason/previousState/newState — per
 *   spec: "record only the minimum necessary audit information; do
 *   not retain prohibited media merely for convenience."
 *
 * ESCALATION — HONEST LIMIT
 *   escalate() calls the real gate's ESCALATE decision, which keeps
 *   the entry (unlike reject) because specialized review needs the
 *   material preserved. No specialized detection/review backend exists
 *   anywhere in this repository (disclosed, not fabricated) —
 *   escalation here means "held, unreleased, unrejected, flagged for a
 *   process this repository does not implement," never a claim that
 *   specialized review actually happened.
 *
 * AUTHORIZATION
 *   Composes Phase 2's real resolveRole() for role resolution (same
 *   AuthCoordinator-backed, honestly-degrading logic — no second auth
 *   backend). Defines its OWN local permission matrix for quarantine
 *   actions (release/reject/escalate require REVIEWER+; inspect is
 *   allowed for REVIEWER+ only — quarantined content is not shown to
 *   COMMUNITY/ANONYMOUS at all) — Phase 2's dashboard-core PERMISSIONS
 *   object is private to that file and does not cover this domain;
 *   this mirrors how Phase 2 itself defined its own matrix rather than
 *   inventing a shared one that doesn't exist. "REVIEWER" remains
 *   exactly what Phase 2 already disclosed it to be: a dashboard-local
 *   allowlist, not a real base-system role.
 */
(function (root) {
    "use strict";

    function gate() { return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeSafetyGate) || null; }
    function community() { return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeCommunity) || null; }
    function contributionCore() { return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeContributionCore) || null; }
    function dashboardCore() { return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeReviewDashboardCore) || null; }

    function nowISO() { return new Date().toISOString(); }

    // Same disclosed, non-cryptographic pseudonymization pattern used
    // throughout this repository (see Phase 1/2 headers) — applied
    // independently here since this file keeps its own audit store.
    function pseudonymId(raw) {
        const str = String(raw == null ? "" : raw);
        if (!str) return null;
        let hash = 5381;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
        return "reviewer:" + hash.toString(16);
    }

    // -----------------------------------------------------------------
    // AUTHORIZATION — own local matrix, composes Phase 2's real resolveRole()
    // -----------------------------------------------------------------

    const RANK = { ANONYMOUS: 0, COMMUNITY: 1, REVIEWER: 2, ADMIN: 3 };
    const QUARANTINE_PERMISSIONS = { inspect: 2, beginReview: 2, release: 2, reject: 2, escalate: 2 };

    function resolveRole(config) {
        const dc = dashboardCore();
        if (!dc) return { role: "ANONYMOUS", userId: null, authBackend: "AUTHORIZATION_BACKEND_UNAVAILABLE" };
        return dc.resolveRole(config);
    }

    function isAuthorized(role, action) {
        const required = QUARANTINE_PERMISSIONS[action];
        if (required === undefined) return false;
        return (RANK[role] || 0) >= required;
    }

    function guarded(action, roleInfo, fn) {
        if (roleInfo.authBackend === "AUTHORIZATION_BACKEND_UNAVAILABLE") return { status: "AUTHORIZATION_BACKEND_UNAVAILABLE" };
        if (!isAuthorized(roleInfo.role, action)) return { status: "UNAUTHORIZED", role: roleInfo.role, action };
        return fn();
    }

    // -----------------------------------------------------------------
    // REVIEW STATE — own side-table keyed by quarantineId, exactly the
    // same "extend, don't shadow" pattern Phase 1 used on top of
    // RP-029-A candidates.
    // -----------------------------------------------------------------

    const reviewState = new Map(); // quarantineId -> "QUARANTINED"|"UNDER_REVIEW"|"RELEASED"|"REJECTED"|"ESCALATED"
    const auditTrail = new Map();  // quarantineId -> [event,...]
    let nextEventId = 1;

    function currentState(quarantineId) {
        return reviewState.get(quarantineId) || (gate() && gate().getQuarantineEntry(quarantineId) ? "QUARANTINED" : null);
    }

    function recordEvent(quarantineId, action, actor, reason, previousState, newState, extra) {
        if (!auditTrail.has(quarantineId)) auditTrail.set(quarantineId, []);
        auditTrail.get(quarantineId).push(Object.freeze(Object.assign({
            eventId: "qevt_" + (nextEventId++),
            quarantineId, action, actor: pseudonymId(actor),
            timestamp: nowISO(), reason: reason || null, previousState, newState
        }, extra || {})));
    }

    function getAuditTrail(quarantineId) {
        return (auditTrail.get(quarantineId) || []).slice();
    }

    const TERMINAL_STATES = ["RELEASED", "REJECTED", "ESCALATED"];

    // -----------------------------------------------------------------
    // LISTING / INSPECTION
    // -----------------------------------------------------------------

    function listQuarantine(roleInfo, filters) {
        return guarded("inspect", roleInfo, () => {
            const g = gate();
            if (!g) return { status: "CAPABILITY_UNAVAILABLE", items: [] };
            const f = filters || {};
            const items = g.listQuarantined()
                .filter((e) => !f.language || e.language === f.language)
                .filter((e) => !f.classification || e.classification === f.classification)
                .map((e) => Object.assign({}, e, { reviewState: currentState(e.id) || "QUARANTINED" }));
            return { status: "OK", items };
        });
    }

    function inspect(quarantineId, roleInfo) {
        return guarded("inspect", roleInfo, () => {
            const g = gate();
            if (!g) return { status: "CAPABILITY_UNAVAILABLE" };
            const entry = g.getQuarantineEntry(quarantineId);
            if (!entry) return { status: "NOT_FOUND" };
            return {
                status: "OK",
                entry: Object.assign({}, entry, { reviewState: currentState(quarantineId) || "QUARANTINED" }),
                auditTrail: getAuditTrail(quarantineId)
            };
        });
    }

    // -----------------------------------------------------------------
    // STATE TRANSITIONS
    // -----------------------------------------------------------------

    function beginReview(quarantineId, roleInfo, opts) {
        return guarded("beginReview", roleInfo, () => {
            const g = gate();
            if (!g || !g.getQuarantineEntry(quarantineId)) return { status: "NOT_FOUND" };
            const prev = currentState(quarantineId) || "QUARANTINED";
            if (TERMINAL_STATES.indexOf(prev) !== -1) return { status: "INVALID_TRANSITION", from: prev };
            reviewState.set(quarantineId, "UNDER_REVIEW");
            recordEvent(quarantineId, "REVIEW_STARTED", (opts || {}).reviewerId, null, prev, "UNDER_REVIEW");
            return { status: "UNDER_REVIEW" };
        });
    }

    /**
     * release(quarantineId, roleInfo, opts)
     *   Real: calls the gate's real APPROVE decision, then submits the
     *   returned fields as a real RP-029-A/B candidate via the exact
     *   same CozyKnowledgeCommunity.submitContribution() every other
     *   submission path uses. Never bypasses Rule 82 — the resulting
     *   candidate is ordinary, unpromoted, PRIVATE, UNVERIFIED.
     */
    function release(quarantineId, roleInfo, opts) {
        return guarded("release", roleInfo, () => {
            const g = gate();
            const c = community();
            const cc = contributionCore();
            if (!g || !c || !cc) return { status: "CAPABILITY_UNAVAILABLE" };
            const prev = currentState(quarantineId) || "QUARANTINED";
            if (TERMINAL_STATES.indexOf(prev) !== -1) return { status: "INVALID_TRANSITION", from: prev };

            const result = g.releaseFromQuarantine(quarantineId, "APPROVE", (opts || {}).reviewerId);
            if (result.status === "NOT_FOUND") return result;
            if (result.status === "ALREADY_REVIEWED") return { status: "INVALID_TRANSITION", from: prev, reason: "Already reviewed at the safety-gate layer." };

            const fields = result.fields;
            const submission = c.submitContribution({
                contributionType: cc.TYPE_TO_RP029B[fields.contributionType] || "PHRASE",
                statement: fields.expression || fields.statement || fields.translation || fields.meaning,
                contributorId: (fields.evidence && fields.evidence[0] && fields.evidence[0].contributorId) || fields.contributorId || null,
                language: fields.language,
                dialect: fields.dialect,
                region: fields.region,
                meaning: fields.meaning,
                translation: fields.translation,
                context: fields.context,
                pronunciation: fields.pronunciation || fields.phonetic || null,
                variant: fields.dialect || null
            });

            reviewState.set(quarantineId, "RELEASED");
            recordEvent(quarantineId, "RELEASED", (opts || {}).reviewerId, (opts || {}).reason, prev, "RELEASED",
                { resultingCandidateId: submission.status === "SUBMITTED" ? submission.record.id : null, submissionStatus: submission.status });

            return {
                status: "RELEASED",
                candidateId: submission.status === "SUBMITTED" ? submission.record.id : null,
                submissionStatus: submission.status,
                note: "Released from quarantine — this only clears the safety review. Community validation, provenance, and Rule 82 still govern this candidate exactly like any other."
            };
        });
    }

    /**
     * reject(quarantineId, roleInfo, opts)
     *   Real: calls the gate's real REJECT decision (deletes the
     *   content there). This layer's own audit event intentionally
     *   omits field content — see file header.
     */
    function reject(quarantineId, roleInfo, opts) {
        return guarded("reject", roleInfo, () => {
            const g = gate();
            if (!g) return { status: "CAPABILITY_UNAVAILABLE" };
            const prev = currentState(quarantineId) || "QUARANTINED";
            if (TERMINAL_STATES.indexOf(prev) !== -1) return { status: "INVALID_TRANSITION", from: prev };
            if (!opts || !opts.reason) return { status: "REJECTED_REQUEST", reason: "A reason is required to reject quarantined content." };

            const result = g.releaseFromQuarantine(quarantineId, "REJECT", opts.reviewerId);
            if (result.status === "NOT_FOUND") return result;
            if (result.status === "ALREADY_REVIEWED") return { status: "INVALID_TRANSITION", from: prev };

            reviewState.set(quarantineId, "REJECTED");
            recordEvent(quarantineId, "REJECTED", opts.reviewerId, opts.reason, prev, "REJECTED");
            return { status: "REJECTED" };
        });
    }

    /**
     * escalate(quarantineId, roleInfo, opts)
     *   Real: calls the gate's real ESCALATE decision (entry retained,
     *   not deleted — see file header on the honest limit here).
     */
    function escalate(quarantineId, roleInfo, opts) {
        return guarded("escalate", roleInfo, () => {
            const g = gate();
            if (!g) return { status: "CAPABILITY_UNAVAILABLE" };
            const prev = currentState(quarantineId) || "QUARANTINED";
            if (TERMINAL_STATES.indexOf(prev) !== -1) return { status: "INVALID_TRANSITION", from: prev };

            const result = g.releaseFromQuarantine(quarantineId, "ESCALATE", (opts || {}).reviewerId);
            if (result.status === "NOT_FOUND") return result;
            if (result.status === "ALREADY_REVIEWED") return { status: "INVALID_TRANSITION", from: prev };

            reviewState.set(quarantineId, "ESCALATED");
            recordEvent(quarantineId, "ESCALATED", (opts || {}).reviewerId, (opts || {}).reason, prev, "ESCALATED");
            return { status: "ESCALATED", note: "Held for specialized review. No specialized detection/review backend exists in this repository — this status does not claim that review has occurred." };
        });
    }

    // -----------------------------------------------------------------
    // ANALYTICS — real counts over the real, current quarantine list
    // only. Never a "most used/requested" claim (spec: distinguish
    // MOST SUBMITTED from MOST VALIDATED/REQUESTED/USED — this file has
    // real data only for what's currently quarantined).
    // -----------------------------------------------------------------

    function analytics(roleInfo) {
        return guarded("inspect", roleInfo, () => {
            const g = gate();
            if (!g) return { status: "CAPABILITY_UNAVAILABLE" };
            const items = g.listQuarantined();
            const byState = { QUARANTINED: 0, UNDER_REVIEW: 0 };
            const byClassification = {};
            const byLanguage = {};
            items.forEach((e) => {
                const st = currentState(e.id) || "QUARANTINED";
                if (TERMINAL_STATES.indexOf(st) === -1) byState[st] = (byState[st] || 0) + 1;
                byClassification[e.classification] = (byClassification[e.classification] || 0) + 1;
                const lang = e.language || "UNKNOWN";
                byLanguage[lang] = (byLanguage[lang] || 0) + 1;
            });
            return { status: "OK", totalQuarantined: items.length, byState, byClassification, byLanguage, note: "Counts reflect current, real quarantine-store contents only — not historical release/reject/escalate totals (this file's audit trail has those per-item, not yet aggregated here)." };
        });
    }

    // -----------------------------------------------------------------
    const api = {
        resolveRole,
        isAuthorized,
        listQuarantine,
        inspect,
        beginReview,
        release,
        reject,
        escalate,
        analytics,
        getAuditTrail
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyKnowledgeQuarantineAdmin = Object.freeze(api);
        root.window.CozyOS.Modules["cozy-knowledge-quarantine-admin-core"] = Object.freeze({
            version: "1.0.0",
            description: "RP-029-C Phase 5 — Quarantine + Admin Safety Review pure-logic layer. Composes Phase 4's real safety-gate quarantine store (owns no content storage of its own), RP-029-B's real submitContribution() for release, Phase 3's real contribution-type mapping, and Phase 2's real resolveRole() for authorization — no duplicated storage/validation/auth logic. State machine QUARANTINED->UNDER_REVIEW->RELEASED|REJECTED|ESCALATED, own append-only pseudonymized audit trail, real analytics over current quarantine contents only. Release never bypasses Rule 82 — the resulting candidate is ordinary and unpromoted. Escalation is honestly disclosed as 'held, not specially reviewed' since no specialized backend exists here."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: undefined });
