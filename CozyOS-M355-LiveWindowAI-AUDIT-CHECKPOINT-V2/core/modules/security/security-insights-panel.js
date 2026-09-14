/**
 * CozyOS Security Insights Panel
 * File Reference: core/modules/security/security-insights-panel.js
 * Layer: Application / Settings Panel
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 360 (Authentication Factor Management & Secure Enrollment) — Stage 4
 *
 * OWNERSHIP
 *   Pure display layer over authentication-analytics.js. Computes
 *   nothing itself — every number rendered here comes straight from
 *   getUserAnalytics()/getSystemAnalytics(). Read-only: no enrollment,
 *   verification, or settings actions live here.
 *
 * ADDITIVE, NOT A MODIFICATION (Rule 6 / Rule 17)
 *   Does not edit authentication-security-dashboard.js or
 *   authentication-enrollment-history.js (M360 Stage 3) or any earlier
 *   panel. Own registry key (window.CozyOS.Modules["security-insights-
 *   panel"]), own DOM root (#cozy-secinsights-root), own script tag.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["security-insights-panel"] && window.CozyOS.Modules["security-insights-panel"].version) return;

    let rootEl = null;

    function getCurrentUserId() {
        const auth = window.CozyOS.Auth;
        if (!auth || typeof auth.getCurrentIdentity !== "function") return null;
        const identity = auth.getCurrentIdentity();
        return identity && identity.userId ? identity.userId : null;
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    const FACTOR_LABELS = { "security-key": "Passkey (WebAuthn)", "otp": "Authenticator App (TOTP)", "trusted-device": "Trusted Device" };
    function factorLabel(name) { return FACTOR_LABELS[name] || name; }

    function renderUserSection(a) {
        if (!a.available) return `<div class="cozy-si-unavailable">Your analytics unavailable: ${escapeHtml(a.reason)}</div>`;
        const score = a.securityHealthScore === null ? "Unavailable" : `${a.securityHealthScore} / 100`;
        const recovery = a.recoveryAvailable === "Unavailable" ? "Unavailable" : (a.recoveryAvailable ? "Available" : "Not set up");
        const lastUsedRows = Object.entries(a.perFactorLastUsed)
            .map(([name, ts]) => `<tr><td>${escapeHtml(factorLabel(name))}</td><td>${ts ? escapeHtml(ts) : "Unavailable"}</td></tr>`).join("");

        return `<section class="cozy-si-section">
            <h3>Your Security Insights</h3>
            <div>Security Health Score: <strong>${score}</strong> <span class="cozy-si-note">(heuristic — see notes)</span></div>
            <div>Enabled factors: ${a.enabledCount} · Disabled: ${a.disabledCount}</div>
            <div>Associated devices: ${a.deviceTotal}</div>
            <div>Factors used in last 30 days: ${a.recentlyUsedCount}</div>
            <div>Recovery method: ${recovery}</div>
            <table class="cozy-si-table"><thead><tr><th>Factor</th><th>Last used</th></tr></thead><tbody>${lastUsedRows}</tbody></table>
        </section>`;
    }

    function renderSystemSection(s) {
        if (!s.available) return `<div class="cozy-si-unavailable">System analytics unavailable: ${escapeHtml(s.reason)}</div>`;
        const rows = Object.entries(s.usageByFactor)
            .map(([name, v]) => `<tr><td>${escapeHtml(factorLabel(name))}</td><td>${v.enrolled}</td><td>${v.enabled}</td></tr>`).join("");
        const diag = s.diagnostics || {};
        return `<section class="cozy-si-section">
            <h3>System-Wide Authentication Usage</h3>
            <div>Users with enrollments: ${diag.usersWithEnrollments != null ? diag.usersWithEnrollments : "Unavailable"}</div>
            <div>Total enrollments: ${diag.totalEnrollments != null ? diag.totalEnrollments : "Unavailable"}</div>
            <div>Enabled enrollments: ${diag.enabledEnrollments != null ? diag.enabledEnrollments : "Unavailable"}</div>
            <table class="cozy-si-table"><thead><tr><th>Factor</th><th>Enrolled</th><th>Enabled</th></tr></thead><tbody>${rows}</tbody></table>
        </section>`;
    }

    function renderAll() {
        if (!rootEl) return;
        const analytics = window.CozyOS.Modules["authentication-analytics"];
        if (!analytics) {
            rootEl.innerHTML = `<div class="cozy-si-unavailable">Security insights unavailable: authentication-analytics.js is not loaded.</div>`;
            return;
        }
        const userId = getCurrentUserId();
        const userAnalytics = analytics.getUserAnalytics(userId);
        const systemAnalytics = analytics.getSystemAnalytics();

        rootEl.innerHTML = `<div id="cozy-secinsights-root">
            ${renderUserSection(userAnalytics)}
            ${renderSystemSection(systemAnalytics)}
            <p class="cozy-si-note">Security Health Score is a disclosed heuristic computed from your own enrollment/usage/recovery data — not a certified security rating.</p>
        </div>`;
    }

    window.CozyOS.Modules["security-insights-panel"] = {
        version: MODULE_VERSION,
        async init() {
            rootEl = document.getElementById("cozy-secinsights-root")?.parentElement || document.body;
            renderAll();
        },
        destroy() { rootEl = null; },
        renderAll, getCurrentUserId,
        getVersion() { return MODULE_VERSION; }
    };
})();
