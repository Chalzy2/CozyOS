/**
 * CozyOS Authentication Enrollment History
 * File Reference: core/modules/security/authentication-enrollment-history.js
 * Layer: Application / Settings Panel
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 360 (Authentication Factor Management & Secure Enrollment) — Stage 3
 *
 * OWNERSHIP
 *   Read-only display of a user's real enrollment/audit history, sourced
 *   entirely from AuthEnrollmentStore.getAuditLog() and
 *   AuthEnrollmentStore.listEnrollments(). No writes, no new storage, no
 *   new audit mechanism — this module renders what the frozen store
 *   already records. If the store has no history, this shows an honest
 *   "No enrollment history yet" state rather than fabricating rows.
 *
 * ADDITIVE, NOT A MODIFICATION (Rule 6 / Rule 17)
 *   Composes AuthEnrollmentStore (M358) from the outside. Does not edit
 *   authentication-enrollment-panel.js (M359, frozen),
 *   authentication-settings-module.js (M357, frozen), or
 *   authentication-factor-management-panel.js (M360 Stage 2, frozen).
 *   Own registry key (window.CozyOS.Modules["authentication-enrollment-
 *   history"]), own DOM root (#cozy-enrollhistory-root), own script tag.
 *
 * NO NEW ENGINES
 *   No parallel audit log, no parallel enrollment record. Every field
 *   shown maps directly to a real field already returned by
 *   AuthEnrollmentStore's public methods (see below).
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["authentication-enrollment-history"] && window.CozyOS.Modules["authentication-enrollment-history"].version) return;

    let rootEl = null;

    /** getCurrentUserId() — same canonical pointer the M360 Stage 2 panel uses. Never invents an identity. */
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
     * getHistory(userId) — real. Pulls the store's actual audit trail and
     * enrollment records; does not compute or infer anything the store
     * doesn't already track. Returns { available, entries, enrollments }.
     */
    function getHistory(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        if (!store) return { available: false, reason: "AuthEnrollmentStore is not loaded.", entries: [], enrollments: [] };
        if (!userId) return { available: false, reason: "No current user identity.", entries: [], enrollments: [] };

        const entries = typeof store.getAuditLog === "function" ? store.getAuditLog({ userId }) : [];
        const enrollments = typeof store.listEnrollments === "function" ? store.listEnrollments(userId) : [];
        // Sort newest first — audit log is append-only in the store, so this is a display-only ordering, not a mutation.
        entries.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));
        return { available: true, entries, enrollments };
    }

    function renderAuditRow(entry) {
        const ts = entry.timestamp ? escapeHtml(entry.timestamp) : "Unavailable";
        const action = escapeHtml(entry.action || "unknown");
        const factor = escapeHtml(factorLabel(entry.factorName));
        const device = entry.detail && entry.detail.deviceId ? escapeHtml(entry.detail.deviceId) : "Unavailable";
        return `<tr><td>${ts}</td><td>${factor}</td><td>${action}</td><td>${device}</td></tr>`;
    }

    function renderEnrollmentSummary(record) {
        const label = escapeHtml(factorLabel(record.factorName));
        const status = record.enabled ? "Enabled" : "Disabled";
        const lastUsed = record.lastUsedAt ? escapeHtml(record.lastUsedAt) : "Unavailable — never used";
        const devices = Array.isArray(record.devices) && record.devices.length
            ? record.devices.map(d => escapeHtml(d.label || d.deviceId)).join(", ")
            : "Unavailable — no associated device";
        return `<div class="cozy-eh-summary-card">
            <div class="cozy-eh-summary-title">${label}</div>
            <div>Status: ${status}</div>
            <div>Last used: ${lastUsed}</div>
            <div>Device association: ${devices}</div>
            <div>Enrolled: ${record.enrolledAt ? escapeHtml(record.enrolledAt) : "Unavailable"}</div>
        </div>`;
    }

    /** renderAll() — real render, honest "Unavailable"/empty states, no fabricated rows. */
    function renderAll() {
        if (!rootEl) return;
        const userId = getCurrentUserId();
        const { available, reason, entries, enrollments } = getHistory(userId);

        if (!available) {
            rootEl.innerHTML = `<div class="cozy-eh-unavailable">Enrollment history unavailable: ${escapeHtml(reason)}</div>`;
            return;
        }

        const summaryHtml = enrollments.length
            ? enrollments.map(renderEnrollmentSummary).join("")
            : `<div class="cozy-eh-empty">No enrollments yet.</div>`;

        const auditHtml = entries.length
            ? `<table class="cozy-eh-audit-table"><thead><tr><th>Time</th><th>Factor</th><th>Action</th><th>Device</th></tr></thead><tbody>${entries.map(renderAuditRow).join("")}</tbody></table>`
            : `<div class="cozy-eh-empty">No enrollment history yet.</div>`;

        rootEl.innerHTML = `<div id="cozy-enrollhistory-root">
            <section class="cozy-eh-section"><h3>Enrollment Summary</h3>${summaryHtml}</section>
            <section class="cozy-eh-section"><h3>Enrollment &amp; Usage History</h3>${auditHtml}</section>
        </div>`;
    }

    window.CozyOS.Modules["authentication-enrollment-history"] = {
        version: MODULE_VERSION,
        async init() {
            rootEl = document.getElementById("cozy-enrollhistory-root")?.parentElement || document.body;
            renderAll();
        },
        destroy() { rootEl = null; },
        // Exposed for the Node regression harness — test the framework without a DOM.
        getHistory, getCurrentUserId, renderAll,
        getVersion() { return MODULE_VERSION; }
    };
})();
