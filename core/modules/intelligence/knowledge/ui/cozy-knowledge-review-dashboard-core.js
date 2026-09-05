/**
 * CozyOS — Community Review Dashboard: Pure Logic Layer (no DOM)
 * File Reference: core/modules/intelligence/knowledge/ui/cozy-knowledge-review-dashboard-core.js
 * Repair: RP-029-C Phase 2 (Review Dashboard UI)
 *
 * OWNERSHIP
 *   New, additive, standalone file. Composes real, frozen public APIs
 *   only — never duplicates their logic:
 *     window.CozyOS.CozyKnowledgeCommunity  (RP-029-B)
 *     window.CozyOS.CozyKnowledgeReview     (RP-029-C Phase 1)
 *     window.CozyOS.AuthCoordinator         (existing CozyOS identity
 *                                             stack — getCurrentIdentity())
 *   None of cozy-knowledge-ingestion.js, cozy-knowledge-community.js,
 *   cozy-knowledge-review.js, cozy-language-registry.js, or
 *   cozy-language-templates.js is modified by this file.
 *
 * WHY THIS IS SPLIT FROM THE DOM LAYER
 *   cozy-knowledge-review-dashboard-ui.js (same directory) owns all
 *   rendering/event-wiring. This file owns everything that can be
 *   tested without a browser: filtering/sorting, authorization
 *   decisions, and the one genuinely new piece of business logic this
 *   phase adds — a Rule-82-gated PUBLIC-promotion wrapper (see
 *   dashboardPromote below). Splitting them lets the logic be covered
 *   by real, fast Node tests, with only true DOM interaction left to
 *   the slower, real-browser test (spec §18).
 *
 * AUTHORIZATION (spec §16 / §21)
 *   Does not invent a second authentication system. Reads the real,
 *   existing window.CozyOS.AuthCoordinator.getCurrentIdentity() when
 *   present. If it is not loaded, resolveRole() honestly reports
 *   AUTHORIZATION_BACKEND_UNAVAILABLE rather than silently defaulting
 *   anyone to a privileged role.
 *
 *   Disclosed, honest limitation: the existing CozyOS auth stack (as
 *   found in this repository) only distinguishes "platform-admin" from
 *   any other authenticated user — it has no "reviewer" role of its
 *   own. This file cannot fabricate one. A REVIEWER designation is
 *   therefore accepted only as an explicit, caller-supplied allowlist
 *   (config.reviewerUserIds) at init time — never inferred, never a
 *   new persistent role stored anywhere. This is recorded as a known
 *   limitation in this pass's documentation, not hidden here.
 *
 * RULE 82 (spec §7/§8)
 *   dashboardPromote() is the only place in this phase that decides
 *   whether a promotion attempt is allowed to reach RP-029-C Phase 1's
 *   real promote(). For target === "PUBLIC", it first calls Phase 1's
 *   real evaluateRule82Gate(languageCode, attestation) and refuses —
 *   without ever calling promote() — unless the gate reports
 *   "ELIGIBLE". This is enforced here, in logic, not merely by a
 *   disabled button in the UI layer (spec §7: "Do not merely hide the
 *   button"). For target === "COMMUNITY", Rule 82 (language runtime
 *   availability) does not apply — that gate is unrelated to
 *   community-visibility promotion (see Phase 1's own header for why);
 *   RP-029-B's own DISPUTED guard still applies unchanged.
 */
(function (root) {
    "use strict";

    function community() {
        return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeCommunity) || null;
    }
    function review() {
        return (root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeReview) || null;
    }
    function authCoordinator() {
        return (root.window && root.window.CozyOS && root.window.CozyOS.AuthCoordinator) || null;
    }

    const ROLES = Object.freeze(["ANONYMOUS", "COMMUNITY", "REVIEWER", "ADMIN"]);

    // -----------------------------------------------------------------
    // 1. AUTHORIZATION
    // -----------------------------------------------------------------

    /**
     * resolveRole(config)
     *   config.reviewerUserIds: optional array — see header disclosure.
     */
    function resolveRole(config) {
        const cfg = config || {};
        const auth = authCoordinator();
        if (!auth || typeof auth.getCurrentIdentity !== "function") {
            return { role: "ANONYMOUS", userId: null, authBackend: "AUTHORIZATION_BACKEND_UNAVAILABLE" };
        }
        let identity = null;
        try { identity = auth.getCurrentIdentity(); } catch (_err) { identity = null; }
        if (!identity || !identity.userId) {
            return { role: "ANONYMOUS", userId: null, authBackend: "VERIFIED" };
        }
        const roles = identity.roles || [];
        if (roles.indexOf("platform-admin") !== -1) {
            return { role: "ADMIN", userId: identity.userId, authBackend: "VERIFIED" };
        }
        if (Array.isArray(cfg.reviewerUserIds) && cfg.reviewerUserIds.indexOf(identity.userId) !== -1) {
            return { role: "REVIEWER", userId: identity.userId, authBackend: "VERIFIED", note: "REVIEWER is this dashboard's own allowlist designation, not a role the base auth system defines (see file header)." };
        }
        return { role: "COMMUNITY", userId: identity.userId, authBackend: "VERIFIED" };
    }

    const PERMISSIONS = {
        // action -> minimum-role rank (ANONYMOUS=0, COMMUNITY=1, REVIEWER=2, ADMIN=3)
        confirm: 1,
        partialConfirm: 1,
        challenge: 1,
        requestClarification: 1,
        reject: 2,
        finalizeReview: 2,
        promoteCommunity: 2,
        promotePublic: 3
    };
    const RANK = { ANONYMOUS: 0, COMMUNITY: 1, REVIEWER: 2, ADMIN: 3 };

    function isAuthorized(role, action) {
        const required = PERMISSIONS[action];
        if (required === undefined) return false;
        return (RANK[role] || 0) >= required;
    }

    // -----------------------------------------------------------------
    // 2. SEARCH / FILTER / SORT — pure functions over real records only
    //    (records themselves always come from CozyKnowledgeCommunity's
    //    real listCommunityRecords()/getRecord() — never invented here)
    // -----------------------------------------------------------------

    function searchAndFilter(records, opts) {
        const o = opts || {};
        let out = records.slice();

        if (o.query) {
            const q = String(o.query).toLowerCase();
            out = out.filter((r) =>
                (r.claim && r.claim.toLowerCase().includes(q)) ||
                (r.communityExtensions && r.communityExtensions.translation && String(r.communityExtensions.translation).toLowerCase().includes(q)) ||
                (r.meaning && String(r.meaning).toLowerCase().includes(q))
            );
        }
        if (o.language) out = out.filter((r) => r.language && r.language.code === o.language);
        if (o.dialect) out = out.filter((r) => (r.communityExtensions && r.communityExtensions.variant) === o.dialect);
        if (o.reviewState) out = out.filter((r) => r.communityExtensions && r.communityExtensions.reviewState === o.reviewState);
        if (o.disputedOnly) out = out.filter((r) => r.communityExtensions && r.communityExtensions.reviewState === "DISPUTED");
        if (o.minConfidence !== undefined && o.minConfidence !== null) {
            out = out.filter((r) => (r.independentConfirmations || 0) >= o.minConfidence);
        }

        const sort = o.sort || "newest";
        out.sort((a, b) => {
            if (sort === "newest") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            if (sort === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
            if (sort === "mostConfirmed") return (b.independentConfirmations || 0) - (a.independentConfirmations || 0);
            return 0;
        });
        return out;
    }

    // -----------------------------------------------------------------
    // 3. AUTHORIZED ACTION WRAPPERS — every one checks isAuthorized()
    //    first and returns UNAUTHORIZED without ever calling Phase 1's
    //    real functions if the check fails (spec §16: "never trust UI
    //    authorization").
    // -----------------------------------------------------------------

    function guardedAction(action, roleInfo, fn) {
        if (roleInfo.authBackend === "AUTHORIZATION_BACKEND_UNAVAILABLE") {
            return { status: "AUTHORIZATION_BACKEND_UNAVAILABLE" };
        }
        if (!isAuthorized(roleInfo.role, action)) {
            return { status: "UNAUTHORIZED", role: roleInfo.role, action };
        }
        const r = review();
        if (!r) return { status: "REJECTED", reason: "RP-029-C Phase 1 review module is not loaded." };
        return fn(r);
    }

    function dashboardConfirm(candidateId, roleInfo, input) {
        return guardedAction("confirm", roleInfo, (r) => r.confirm(candidateId, Object.assign({ reviewerId: roleInfo.userId }, input, {
            finalizeReview: !!(input && input.finalizeReview) && isAuthorized(roleInfo.role, "finalizeReview")
        })));
    }

    function dashboardPartialConfirm(candidateId, roleInfo, input) {
        return guardedAction("partialConfirm", roleInfo, (r) => r.partialConfirm(candidateId, Object.assign({ reviewerId: roleInfo.userId }, input)));
    }

    function dashboardChallenge(candidateId, roleInfo, input) {
        return guardedAction("challenge", roleInfo, (r) => r.challenge(candidateId, Object.assign({ reviewerId: roleInfo.userId }, input)));
    }

    function dashboardRequestClarification(candidateId, roleInfo, input) {
        return guardedAction("requestClarification", roleInfo, (r) => r.requestClarification(candidateId, Object.assign({ reviewerId: roleInfo.userId }, input)));
    }

    function dashboardReject(candidateId, roleInfo, input) {
        return guardedAction("reject", roleInfo, (r) => r.reject(candidateId, Object.assign({ reviewerId: roleInfo.userId }, input)));
    }

    /**
     * dashboardPromote(candidateId, target, roleInfo, input)
     *   target: "COMMUNITY" | "PUBLIC"
     *   input.languageCode required for target === "PUBLIC" (falls back
     *   to the record's own language if omitted).
     *   input.rule82Attestation: optional, passed straight through to
     *   evaluateRule82Gate() — never fabricated here.
     */
    function dashboardPromote(candidateId, target, roleInfo, input) {
        const action = target === "PUBLIC" ? "promotePublic" : "promoteCommunity";
        return guardedAction(action, roleInfo, (r) => {
            if (target !== "PUBLIC") {
                return r.promote(candidateId, target, Object.assign({ reviewerId: roleInfo.userId }, input));
            }
            const opts = input || {};
            const rec = community() ? community().getRecord(candidateId) : null;
            const languageCode = opts.languageCode || (rec && rec.language ? rec.language.code : null);
            if (!languageCode) {
                return { status: "REJECTED", reason: "No languageCode available to evaluate the Rule 82 gate." };
            }
            const gate = r.evaluateRule82Gate(languageCode, opts.rule82Attestation);
            if (gate.promotion !== "ELIGIBLE") {
                // Refused BEFORE calling Phase 1's real promote() at all —
                // the gate is enforced here in logic, not by hiding a
                // button (spec §7).
                return { status: "BLOCKED_BY_RULE82", reason: gate.reason, rule82Gate: gate };
            }
            return r.promote(candidateId, "PUBLIC", Object.assign({ reviewerId: roleInfo.userId, languageCode }, opts));
        });
    }

    // -----------------------------------------------------------------
    const api = {
        ROLES,
        resolveRole,
        isAuthorized,
        searchAndFilter,
        dashboardConfirm,
        dashboardPartialConfirm,
        dashboardChallenge,
        dashboardRequestClarification,
        dashboardReject,
        dashboardPromote
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        root.window.CozyOS.CozyKnowledgeReviewDashboardCore = Object.freeze(api);
        root.window.CozyOS.Modules["cozy-knowledge-review-dashboard-core"] = Object.freeze({
            version: "1.0.0",
            description: "RP-029-C Phase 2 — Dashboard pure-logic layer. Composes RP-029-B/Phase 1's real APIs and the existing CozyOS AuthCoordinator; adds authorization-guarded action wrappers and a Rule-82-gated PUBLIC-promotion wrapper that refuses before calling promote() at all when the gate is not ELIGIBLE. Reports AUTHORIZATION_BACKEND_UNAVAILABLE honestly when AuthCoordinator is absent, rather than defaulting anyone to a privileged role."
        });
    }
})(typeof window !== "undefined" ? { window } : { window: undefined });
