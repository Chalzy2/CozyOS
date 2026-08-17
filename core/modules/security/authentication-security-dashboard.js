/**
 * CozyOS Authentication Security Dashboard
 * File Reference: core/modules/security/authentication-security-dashboard.js
 * Layer: Application / Settings Panel
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 360 (Authentication Factor Management & Secure Enrollment) — Stage 3
 *
 * OWNERSHIP
 *   Read-only, at-a-glance security overview for the current user: which
 *   factors are enrolled, enabled/disabled, when each was last used, and
 *   real aggregate diagnostics from AuthEnrollmentStore.
 *   getDiagnosticsReport(). Performs no enrollment/verification actions
 *   itself — this is a dashboard, not a management surface (that's
 *   authentication-factor-management-panel.js, M360 Stage 2).
 *
 * ADDITIVE, NOT A MODIFICATION (Rule 6 / Rule 17)
 *   Composes AuthEnrollmentStore (M358), WebAuthnProvider, OtpProvider,
 *   TrustedDeviceManager (all frozen) from the outside. Does not edit
 *   authentication-settings-module.js (M357), authentication-enrollment-
 *   panel.js (M359), or authentication-factor-management-panel.js (M360
 *   Stage 2). Own registry key (window.CozyOS.Modules["authentication-
 *   security-dashboard"]), own DOM root (#cozy-secdash-root), own script
 *   tag.
 *
 * NO NEW ENGINES
 *   Every number shown is read directly from AuthEnrollmentStore's real
 *   methods (getDiagnosticsReport, listEnrollments, getEnrollment) or
 *   the real providers (hasCredential/isEnrolled where available). No
 *   parallel counters, no invented metrics.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["authentication-security-dashboard"] && window.CozyOS.Modules["authentication-security-dashboard"].version) return;

    let rootEl = null;

    /** getCurrentUserId() — same canonical pointer M360 Stage 2's panel uses. Never invents an identity. */
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
    function factorLabel(name) { return FACTOR_LABELS[name] || name || "Unknown factor"; }

    /**
     * getOverview(userId) — real. Combines the user's real enrollment
     * records with the store's real aggregate diagnostics. Nothing here
     * is computed beyond what the store already returns; per-factor
     * "enrolled" state comes straight from listEnrollments().
     */
    function getOverview(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        if (!store) return { available: false, reason: "AuthEnrollmentStore is not loaded." };
        if (!userId) return { available: false, reason: "No current user identity." };

        const enrollments = typeof store.listEnrollments === "function" ? store.listEnrollments(userId) : [];
        const byFactor = new Map(enrollments.map(r => [r.factorName, r]));
        const factors = ["security-key", "otp", "trusted-device"].map(name => {
            const record = byFactor.get(name) || null;
            return {
                factorName: name,
                label: factorLabel(name),
                enrolled: !!record,
                enabled: record ? record.enabled : null,
                lastUsedAt: record ? record.lastUsedAt : null,
                deviceCount: record && Array.isArray(record.devices) ? record.devices.length : 0,
            };
        });

        const diagnostics = typeof store.getDiagnosticsReport === "function" ? store.getDiagnosticsReport() : null;
        return { available: true, factors, diagnostics };
    }

    function renderFactorRow(f) {
        const status = !f.enrolled ? "Not enrolled" : (f.enabled ? "Enabled" : "Disabled");
        const lastUsed = f.enrolled ? (f.lastUsedAt ? escapeHtml(f.lastUsedAt) : "Unavailable — never used") : "Unavailable";
        const devices = f.enrolled ? (f.deviceCount > 0 ? `${f.deviceCount} device(s)` : "Unavailable — no associated device") : "Unavailable";
        return `<tr>
            <td>${escapeHtml(f.label)}</td>
            <td>${escapeHtml(status)}</td>
            <td>${lastUsed}</td>
            <td>${devices}</td>
        </tr>`;
    }

    function renderDiagnostics(diag) {
        if (!diag) return `<div class="cozy-sd-empty">Diagnostics unavailable.</div>`;
        return `<div class="cozy-sd-diagnostics">
            <div>Users with enrollments: ${diag.usersWithEnrollments}</div>
            <div>Total enrollments (all users): ${diag.totalEnrollments}</div>
            <div>Enabled enrollments (all users): ${diag.enabledEnrollments}</div>
            <div>Audit entries recorded: ${diag.auditEntries}</div>
            <div>Persistence available: ${diag.persistenceAvailable ? "Yes" : "No"}</div>
        </div>`;
    }

    /** renderAll() — real render, honest "Unavailable"/"Not enrolled" states, no fabricated rows. */
    function renderAll() {
        if (!rootEl) return;
        const userId = getCurrentUserId();
        const overview = getOverview(userId);

        if (!overview.available) {
            rootEl.innerHTML = `<div class="cozy-sd-unavailable">Security dashboard unavailable: ${escapeHtml(overview.reason)}</div>`;
            return;
        }

        rootEl.innerHTML = `<div id="cozy-secdash-root">
            <section class="cozy-sd-section">
                <h3>Your Authentication Factors</h3>
                <table class="cozy-sd-factor-table">
                    <thead><tr><th>Factor</th><th>Status</th><th>Last used</th><th>Devices</th></tr></thead>
                    <tbody>${overview.factors.map(renderFactorRow).join("")}</tbody>
                </table>
            </section>
            <section class="cozy-sd-section">
                <h3>System Diagnostics (Real, from AuthEnrollmentStore)</h3>
                ${renderDiagnostics(overview.diagnostics)}
            </section>
        </div>`;
    }

    window.CozyOS.Modules["authentication-security-dashboard"] = {
        version: MODULE_VERSION,
        async init() {
            rootEl = document.getElementById("cozy-secdash-root")?.parentElement || document.body;
            renderAll();
        },
        destroy() { rootEl = null; },
        // Exposed for the Node regression harness — test the framework without a DOM.
        getOverview, getCurrentUserId, renderAll,
        getVersion() { return MODULE_VERSION; }
    };
})();
