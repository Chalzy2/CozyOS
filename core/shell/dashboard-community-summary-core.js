/**
 * CozyOS — Dashboard Community Summary Core
 * File Reference: core/shell/dashboard-community-summary-core.js
 * Milestone: Dashboard Prompt 2 (Community Real User Surface)
 *
 * CLASSIFICATION: COMPOSED, new, pure logic (no DOM), Node-testable —
 * same "-core.js" convention as dashboard-navigation-core.js and
 * core/modules/intelligence/knowledge/ui/cozy-knowledge-review-dashboard-core.js.
 *
 * WHY THIS FILE EXISTS
 *   Prompt 2 §6 requires the Community surface to show real, truthful
 *   state buckets (Pending Review / Community Verified / Needs
 *   Correction / Rejected / Learned Knowledge) instead of a raw list of
 *   internal reviewState values. The real per-record state authority is
 *   window.CozyOS.CozyKnowledgeReview.computeDisplayState(record) (RP-
 *   029-C Phase 1) — this file does not reimplement that logic, it only
 *   maps its existing, real output values onto the five UI-facing
 *   buckets named in the spec. If computeDisplayState is not loaded,
 *   this file falls back to the raw communityExtensions.reviewState
 *   values already on the record (also real, just less refined) rather
 *   than fabricating anything.
 *
 * "MY CONTRIBUTIONS" — HONEST LIMIT (Prompt 2 §6)
 *   window.CozyOS.CozyKnowledgeCommunity.listCommunityRecords() never
 *   exposes a caller's raw contributorId — it is intentionally
 *   pseudonymized before the record leaves that engine (see that
 *   file's own PRIVACY FIX comment). CozyKnowledgeReview /
 *   CozyKnowledgeCommunity's public API exposes no
 *   "records submitted by this exact userId" query. Recomputing the
 *   pseudonym client-side would mean reusing an export explicitly
 *   marked "for tests only" in production — this file refuses to do
 *   that. summarizeCommunityRecords() therefore always reports
 *   myContributions as { available: false, reason: ... } — a genuine,
 *   disclosed capability gap, not a fabricated empty list.
 *
 * "LEARNED KNOWLEDGE" (Prompt 2 §6)
 *   Mapped from computeDisplayState() === "PROMOTED" — the real
 *   pipeline's own signal that a record's visibility is PUBLIC (i.e.
 *   promoted out of private/community-only review). Nothing here
 *   claims this record is already in use by Cozy AI — no such
 *   consumption path is confirmed to exist in this repository.
 */
(function (root) {
    "use strict";

    function review() {
        return (root && root.window && root.window.CozyOS && root.window.CozyOS.CozyKnowledgeReview) || null;
    }

    const VERSION = "1.0.0";

    /** Real CozyKnowledgeReview.computeDisplayState() outputs, mapped to the five honest UI buckets Prompt 2 §6 asks for. */
    const DISPLAY_STATE_TO_BUCKET = Object.freeze({
        CANDIDATE: "pendingReview",
        PRIVATE: "pendingReview",
        EMERGING: "pendingReview",
        COMMUNITY_REVIEW: "pendingReview",
        VERIFIED: "communityVerified",
        PROMOTION_ELIGIBLE: "communityVerified",
        DISPUTED: "needsCorrection",
        NEEDS_CLARIFICATION: "needsCorrection",
        REJECTED: "rejected",
        PROMOTED: "learnedKnowledge"
    });

    /** Raw communityExtensions.reviewState fallback, used only if CozyKnowledgeReview isn't loaded — still real data, just less refined than computeDisplayState(). */
    const RAW_STATE_TO_BUCKET = Object.freeze({
        CANDIDATE: "pendingReview",
        UNDER_REVIEW: "pendingReview",
        CONFIRMED: "communityVerified",
        DISPUTED: "needsCorrection",
        REJECTED: "rejected",
        UNRESOLVED: "needsCorrection"
    });

    const BUCKET_LABELS = Object.freeze({
        pendingReview: "Pending Review",
        communityVerified: "Community Verified",
        needsCorrection: "Needs Correction",
        rejected: "Rejected",
        learnedKnowledge: "Learned Knowledge"
    });

    function bucketFor(record) {
        const reviewMod = review();
        if (reviewMod && typeof reviewMod.computeDisplayState === "function") {
            try {
                const displayState = reviewMod.computeDisplayState(record);
                if (DISPLAY_STATE_TO_BUCKET[displayState]) {
                    return { bucket: DISPLAY_STATE_TO_BUCKET[displayState], displayState, source: "CozyKnowledgeReview" };
                }
            } catch (_err) { /* fall through to raw state */ }
        }
        const raw = record && record.communityExtensions && record.communityExtensions.reviewState;
        return { bucket: RAW_STATE_TO_BUCKET[raw] || "pendingReview", displayState: raw || "CANDIDATE", source: "rawReviewState" };
    }

    /**
     * summarizeCommunityRecords(records)
     *   records: the real array returned by
     *   CozyKnowledgeCommunity.listCommunityRecords() (or [] if that
     *   engine is not loaded — callers are responsible for that check,
     *   same convention as DashboardNavigationCore.buildAIContext()).
     *
     *   Returns { buckets: { pendingReview:[...], ... }, counts: {...},
     *   labels: {...}, myContributions: { available:false, reason },
     *   totalRecords }. Every array only ever contains real records
     *   from the input; nothing is invented here.
     */
    function summarizeCommunityRecords(records) {
        const list = Array.isArray(records) ? records : [];
        const buckets = { pendingReview: [], communityVerified: [], needsCorrection: [], rejected: [], learnedKnowledge: [] };

        for (const record of list) {
            const { bucket, displayState, source } = bucketFor(record);
            buckets[bucket].push(Object.assign({}, record, { _displayState: displayState, _displayStateSource: source }));
        }

        const counts = {};
        Object.keys(buckets).forEach((key) => { counts[key] = buckets[key].length; });

        return {
            buckets,
            counts,
            labels: Object.assign({}, BUCKET_LABELS),
            totalRecords: list.length,
            myContributions: {
                available: false,
                reason: "CozyOS does not yet expose a way to filter community records by your exact account without de-pseudonymizing contributor identity, which this dashboard refuses to do. This is a genuine capability gap, not a hidden feature."
            }
        };
    }

    const api = {
        getVersion() { return VERSION; },
        BUCKET_LABELS,
        bucketFor,
        summarizeCommunityRecords
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root && root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        if (!root.window.CozyOS.Modules["dashboard-community-summary-core"]) {
            root.window.CozyOS.DashboardCommunitySummaryCore = api;
            root.window.CozyOS.Modules["dashboard-community-summary-core"] = Object.freeze({
                version: VERSION,
                description: "Dashboard Prompt 2 — groups real CozyKnowledgeCommunity records into honest UI buckets (Pending Review/Community Verified/Needs Correction/Rejected/Learned Knowledge) via the real, existing CozyKnowledgeReview.computeDisplayState(). No new review engine, no fabricated 'My Contributions' data — that capability gap is disclosed, not hidden."
            });
        }
    }
})(typeof globalThis !== "undefined" ? globalThis : this);
