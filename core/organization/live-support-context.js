/**
 * CozyOS — Live Support Context (hand-off state only)
 * File Reference: core/organization/live-support-context.js
 *
 * WHAT THIS IS
 *   A tiny, explicit, disclosed hand-off variable — the SAME category as
 *   window.CozyOS.Session (identity hand-off) or living-worship-
 *   player.js's own private #serviceId (session hand-off, read via its
 *   disclosed getDiagnosticsReport()). It creates NO new authority, NO
 *   new AI/context system, and performs NO authorization of its own —
 *   it only remembers, for the current page, which real liveSessionId
 *   and supportScope a CozyOS platform administrator most recently
 *   chose to inspect (set by organization-support-panel.js's own
 *   "Inspect via Live Window" action on one of their real, active
 *   OrganizationSupport grants), so cozy-living-assistant.js's Living
 *   Window can read it and pass it through the existing
 *   CozyAnswerEngine.answer() -> CozyAI.getContext() chain unchanged.
 *
 * WHY THIS EXISTS
 *   getContext()'s own real, independent authorization (platform-admin +
 *   a live, correctly-scoped OrganizationSupport grant — see cozy-ai.js's
 *   own header) is the actual security boundary; this file supplies
 *   nothing but the "which session, which scope" the admin is currently
 *   looking at. A stale/wrong/cleared value here can only ever cause
 *   getContext() to compose LESS (or none) of the live-support-
 *   diagnostics result — it can never widen access, since getContext()
 *   re-verifies the real grant itself on every single call.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    if (window.CozyOS.LiveSupportContext) return;

    let current = null;

    window.CozyOS.LiveSupportContext = {
        getVersion() { return "1.0.0"; },
        /** set({liveSessionId, supportScope, orgId, grantId}) — real, explicit. A malformed/incomplete value clears the context rather than storing something getContext() could not use anyway. */
        set(ctx) {
            current = (ctx && typeof ctx.liveSessionId === "string" && ctx.liveSessionId.trim() && typeof ctx.supportScope === "string" && ctx.supportScope.trim())
                ? { liveSessionId: ctx.liveSessionId, supportScope: ctx.supportScope, orgId: ctx.orgId || null, grantId: ctx.grantId || null }
                : null;
        },
        get() { return current ? { ...current } : null; },
        clear() { current = null; },
    };
})();
