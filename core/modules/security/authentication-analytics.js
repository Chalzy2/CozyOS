/**
 * CozyOS Authentication Analytics
 * File Reference: core/modules/security/authentication-analytics.js
 * Layer: Data / Analytics Engine
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 360 (Authentication Factor Management & Secure Enrollment) — Stage 4
 *
 * OWNERSHIP
 *   Pure computation over data that already exists in AuthEnrollmentStore
 *   and RecoveryPhraseManager. Owns no storage of its own — every metric
 *   is derived, on demand, from listEnrolledUsers()/listEnrollments()/
 *   getAuditLog()/getDiagnosticsReport() and hasPhrase(). Nothing is
 *   cached, nothing is invented. If a metric can't be computed from real
 *   data, it is returned as null/"Unavailable", never estimated.
 *
 * ADDITIVE, NOT A MODIFICATION (Rule 6 / Rule 17)
 *   Composes AuthEnrollmentStore (M358), RecoveryPhraseManager
 *   (pre-M356, frozen) from the outside. Does not edit any Stage 2/3
 *   panel or the frozen store/providers. Own registry key
 *   (window.CozyOS.Modules["authentication-analytics"]). No DOM — this
 *   is the data layer; security-insights-panel.js is the display layer.
 *
 * SECURITY HEALTH SCORE — METHODOLOGY (disclosed, not hidden)
 *   A simple, transparent 0–100 score computed only from real per-user
 *   data already available:
 *     +40 if at least one factor beyond the baseline login is enrolled
 *          and enabled (any of security-key/otp/trusted-device)
 *     +20 more if 2+ such factors are enrolled and enabled
 *     +20 if a recovery phrase exists for the user (RecoveryPhraseManager.hasPhrase)
 *     +20 if at least one enabled factor has lastUsedAt within the last
 *          30 days (i.e. actually in active use, not just enrolled)
 *   This is a heuristic, disclosed as such in the panel — not a claim of
 *   any external security standard.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["authentication-analytics"] && window.CozyOS.Modules["authentication-analytics"].version) return;

    const FACTOR_NAMES = ["security-key", "otp", "trusted-device"];
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

    function daysAgo(iso) {
        if (!iso) return null;
        const t = Date.parse(iso);
        if (Number.isNaN(t)) return null;
        return (Date.now() - t) / (24 * 60 * 60 * 1000);
    }

    /**
     * getUserAnalytics(userId) — real, per-user. Returns null fields
     * (never fabricated numbers) wherever the underlying store has no
     * data for that field.
     */
    function getUserAnalytics(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        if (!store || !userId) {
            return { available: false, reason: !store ? "AuthEnrollmentStore is not loaded." : "No user identity." };
        }

        const enrollments = typeof store.listEnrollments === "function" ? store.listEnrollments(userId) : [];
        const byFactor = new Map(enrollments.map(r => [r.factorName, r]));
        const enabledCount = enrollments.filter(r => r.enabled).length;
        const disabledCount = enrollments.length - enabledCount;

        const recentlyUsed = enrollments.filter(r => r.enabled && r.lastUsedAt && daysAgo(r.lastUsedAt) !== null && daysAgo(r.lastUsedAt) <= 30);
        const deviceTotal = enrollments.reduce((sum, r) => sum + (Array.isArray(r.devices) ? r.devices.length : 0), 0);

        const recoveryMgr = window.CozyOS.RecoveryPhraseManager;
        const hasRecovery = recoveryMgr && typeof recoveryMgr.hasPhrase === "function" ? recoveryMgr.hasPhrase(userId) : null;

        // Health score — see file header for disclosed methodology.
        let score = 0;
        if (enabledCount >= 1) score += 40;
        if (enabledCount >= 2) score += 20;
        if (hasRecovery === true) score += 20;
        if (recentlyUsed.length > 0) score += 20;

        return {
            available: true,
            userId,
            enrolledFactors: enrollments.map(r => r.factorName),
            enabledCount, disabledCount,
            deviceTotal,
            recentlyUsedCount: recentlyUsed.length,
            recoveryAvailable: hasRecovery === null ? "Unavailable" : hasRecovery,
            perFactorLastUsed: FACTOR_NAMES.reduce((acc, name) => {
                const r = byFactor.get(name);
                acc[name] = r && r.lastUsedAt ? r.lastUsedAt : null;
                return acc;
            }, {}),
            securityHealthScore: enrollments.length === 0 && hasRecovery === false ? null : score,
        };
    }

    /**
     * getSystemAnalytics() — real, aggregate across all users, sourced
     * from AuthEnrollmentStore.getDiagnosticsReport() plus a light
     * per-factor tally over listEnrolledUsers(). No parallel counters.
     */
    function getSystemAnalytics() {
        const store = window.CozyOS.AuthEnrollmentStore;
        if (!store) return { available: false, reason: "AuthEnrollmentStore is not loaded." };

        const diagnostics = typeof store.getDiagnosticsReport === "function" ? store.getDiagnosticsReport() : null;
        const users = typeof store.listEnrolledUsers === "function" ? store.listEnrolledUsers() : [];

        const usageByFactor = FACTOR_NAMES.reduce((acc, name) => { acc[name] = { enrolled: 0, enabled: 0 }; return acc; }, {});
        for (const userId of users) {
            const enrollments = typeof store.listEnrollments === "function" ? store.listEnrollments(userId) : [];
            for (const r of enrollments) {
                if (!usageByFactor[r.factorName]) continue;
                usageByFactor[r.factorName].enrolled++;
                if (r.enabled) usageByFactor[r.factorName].enabled++;
            }
        }

        return { available: true, diagnostics, usageByFactor, userCount: users.length };
    }

    window.CozyOS.Modules["authentication-analytics"] = {
        version: MODULE_VERSION,
        getUserAnalytics, getSystemAnalytics,
        getVersion() { return MODULE_VERSION; }
    };
})();
