/**
 * CozyOS Authentication Enrollment Panel
 * File Reference: core/modules/security/authentication-enrollment-panel.js
 * Layer: Application / Settings Panel
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 359 (Authentication Enrollment UI Enhancement)
 *
 * OWNERSHIP
 *   Owns ONE thing: rendering real, per-user enrollment cards — status,
 *   enrollment date, last-used date, associated devices, enabled/
 *   disabled state, recent audit history, and enrollment actions
 *   (Enroll where a real registration flow exists, Enable, Disable,
 *   Remove) — composed entirely from core/security/
 *   authentication-enrollment-store.js (Milestone 358) and each real
 *   provider's own registration method, where one exists. This file
 *   performs no verification, no policy evaluation, and no credential
 *   storage of its own.
 *
 * ADDITIVE, NOT A MODIFICATION
 *   core/modules/security/authentication-settings-module.js (Milestone
 *   357, frozen per Rule 16) is never edited or imported-and-mutated
 *   here. This is a second, independent panel that composes the same
 *   underlying engines from the outside — registered under its own
 *   window.CozyOS.Modules["authentication-enrollment-panel"] key, its
 *   own DOM root, and its own script tag. Scope Isolation (Rule 17):
 *   this file owns enrollment-facing UI only, never the Principle-12
 *   factor-health cards M357 already owns.
 *
 * HONEST ENROLL SEMANTICS
 *   "Enroll" only appears where a real, callable registration method
 *   already exists on the underlying provider:
 *     - security-key (Passkey): WebAuthnProvider.registerCredential()
 *     - otp (TOTP): OtpProvider.enrollAccount()
 *   For fingerprint / face / voice / google-account, no per-user
 *   enrollment method exists anywhere in this codebase — those
 *   providers only expose registerBackend() (registering a
 *   verification backend for the whole app, not a per-user credential).
 *   This panel discloses that gap rather than fabricating an Enroll
 *   button that would call nothing real. AuthEnrollmentStore.enroll()
 *   is only ever called *after* a real underlying registration
 *   succeeds (or, for factors with no real registration path, never
 *   called from this UI at all) — this file never marks a factor
 *   enrolled without a real success from the factor's own provider.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["authentication-enrollment-panel"] && window.CozyOS.Modules["authentication-enrollment-panel"].version) return;

    let rootEl = null;

    /** getCurrentUserId() — real, composes CozyOS.Auth's own canonical "who is signed in" pointer. Never invents a user identity. */
    function getCurrentUserId() {
        const auth = window.CozyOS.Auth;
        if (!auth || typeof auth.getCurrentIdentity !== "function") return null;
        const identity = auth.getCurrentIdentity();
        return identity && identity.userId ? identity.userId : null;
    }

    /**
     * FACTOR_DEFS — the real, fixed set of factors this panel displays,
     * each naming the exact registry factorName AuthEnrollmentStore
     * validates against, plus (where one exists) the real enrollment
     * method to call before ever touching AuthEnrollmentStore.enroll().
     */
    const FACTOR_DEFS = [
        {
            factorName: "security-key", label: "Passkey (WebAuthn)",
            realEnroll: async (userId) => {
                const provider = window.CozyOS.WebAuthnProvider;
                if (!provider || typeof provider.registerCredential !== "function") return { success: false, reason: "WebAuthnProvider is not loaded." };
                return provider.registerCredential(userId, { displayName: userId });
            },
        },
        {
            factorName: "otp", label: "Authenticator App (TOTP)",
            realEnroll: async (userId) => {
                const provider = window.CozyOS.OtpProvider;
                if (!provider || typeof provider.enrollAccount !== "function") return { success: false, reason: "OtpProvider is not loaded." };
                const result = provider.enrollAccount({ issuer: "CozyOS", accountName: userId });
                if (!result.success) return result;
                // accountId is a real, non-secret identifier (not the
                // secretBase32 itself) — safe enrollment metadata.
                return { success: true, meta: { accountId: result.accountId } };
            },
        },
        { factorName: "fingerprint", label: "Fingerprint", realEnroll: null },
        { factorName: "face", label: "Face Authentication", realEnroll: null },
        { factorName: "voice", label: "Voice Authentication", realEnroll: null },
        { factorName: "google-account", label: "Google Login", realEnroll: null },
    ];

    /**
     * buildEnrollmentCard(def, userId)
     *   Real — composes AuthFactorRegistry (is this a real, registered
     *   factor at all) and AuthEnrollmentStore (does this user have a
     *   real enrollment record) into one display-ready object. Never
     *   fabricates a field neither API actually returns.
     */
    function buildEnrollmentCard(def, userId) {
        const registry = window.CozyOS.AuthFactorRegistry;
        const store = window.CozyOS.AuthEnrollmentStore;

        if (!store) {
            return { id: def.factorName, label: def.label, unavailable: true, reason: "AuthEnrollmentStore is not loaded." };
        }
        if (!userId) {
            return { id: def.factorName, label: def.label, unavailable: true, reason: "No signed-in user (CozyOS.Auth.getCurrentIdentity() returned null) — enrollment is always scoped to a real, authenticated user." };
        }

        const registryEntry = registry && typeof registry.getProvider === "function" ? registry.getProvider(def.factorName) : null;
        const record = store.getEnrollment(userId, def.factorName);
        const auditHistory = store.getAuditLog({ userId, factorName: def.factorName }).slice(-5).reverse();

        return {
            id: def.factorName, label: def.label, unavailable: false,
            registered: !!registryEntry,
            registryNote: registryEntry ? registryEntry.note : "Not registered with AuthFactorRegistry.",
            enrolled: !!record,
            enrollmentStatus: record ? (record.enabled ? "Enrolled — Enabled" : "Enrolled — Disabled") : "Not Enrolled",
            enrolledAt: record ? record.enrolledAt : null,
            lastUsedAt: record ? record.lastUsedAt : null,
            devices: record ? record.devices : [],
            enabled: record ? record.enabled : null,
            auditHistory,
            canEnroll: !record && typeof def.realEnroll === "function",
            enrollUnavailableReason: !record && typeof def.realEnroll !== "function"
                ? `No real per-user enrollment method exists yet for "${def.label}" — this factor's provider only exposes registerBackend() (a whole-app verification backend), not a per-user credential registration. Disclosed, not fabricated.`
                : null,
        };
    }

    function buildAllCards() {
        const userId = getCurrentUserId();
        return FACTOR_DEFS.map(def => buildEnrollmentCard(def, userId));
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function renderDeviceList(devices) {
        if (!devices || devices.length === 0) return "<span class=\"cozy-enroll-muted\">No devices associated.</span>";
        return `<ul class="cozy-enroll-devicelist">${devices.map(d =>
            `<li>${escapeHtml(d.label)} — added ${escapeHtml(d.addedAt)}${d.lastUsedAt ? `, last used ${escapeHtml(d.lastUsedAt)}` : ""}</li>`
        ).join("")}</ul>`;
    }

    function renderAuditList(entries) {
        if (!entries || entries.length === 0) return "<span class=\"cozy-enroll-muted\">No audit history yet.</span>";
        return `<ul class="cozy-enroll-auditlist">${entries.map(e =>
            `<li>${escapeHtml(e.action)} — ${escapeHtml(e.at)}</li>`
        ).join("")}</ul>`;
    }

    /**
     * renderEnrollmentCard(card) — same card built whether unavailable,
     * not-enrolled, or enrolled; only the fields/actions differ.
     */
    function renderEnrollmentCard(card) {
        if (card.unavailable) {
            return `
        <div class="cozy-enroll-card">
            <h3>${escapeHtml(card.label)}</h3>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Status</span><span class="cozy-enroll-v">Unavailable</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Reason</span><span class="cozy-enroll-v">${escapeHtml(card.reason)}</span></div>
        </div>`;
        }

        const actions = [];
        if (card.canEnroll) actions.push(`<button class="cozy-enroll-btn" data-factor="${card.id}" data-action="enroll">Enroll</button>`);
        if (card.enrolled) {
            actions.push(`<button class="cozy-enroll-btn" data-factor="${card.id}" data-action="${card.enabled ? "disable" : "enable"}">${card.enabled ? "Disable" : "Enable"}</button>`);
            actions.push(`<button class="cozy-enroll-btn cozy-enroll-btn-danger" data-factor="${card.id}" data-action="remove">Remove</button>`);
        }

        return `
        <div class="cozy-enroll-card">
            <h3>${escapeHtml(card.label)}</h3>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Enrollment Status</span><span class="cozy-enroll-v">${escapeHtml(card.enrollmentStatus)}</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Enrollment Date</span><span class="cozy-enroll-v">${escapeHtml(card.enrolledAt || "—")}</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Last Used</span><span class="cozy-enroll-v">${escapeHtml(card.lastUsedAt || "Never")}</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Associated Devices</span><span class="cozy-enroll-v">${renderDeviceList(card.devices)}</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Audit History (recent)</span><span class="cozy-enroll-v">${renderAuditList(card.auditHistory)}</span></div>
            ${card.enrollUnavailableReason ? `<div class="cozy-enroll-field"><span class="cozy-enroll-k">Enroll Unavailable</span><span class="cozy-enroll-v">${escapeHtml(card.enrollUnavailableReason)}</span></div>` : ""}
            <div class="cozy-enroll-actions">${actions.length ? actions.join("") : "<span class=\"cozy-enroll-muted\">No actions available.</span>"}</div>
        </div>`;
    }

    function renderAllCards() {
        return buildAllCards().map(renderEnrollmentCard).join("\n");
    }

    /**
     * doAction(factorName, action)
     *   Real — routes to the composed engines. "enroll" calls the
     *   factor's own real registration method FIRST; AuthEnrollmentStore
     *   only ever records a real success, never a fabricated one.
     *   enable/disable/remove call AuthEnrollmentStore directly (it is
     *   already the real, single owner of that lifecycle).
     */
    async function doAction(factorName, action) {
        const userId = getCurrentUserId();
        const store = window.CozyOS.AuthEnrollmentStore;
        if (!userId || !store) return { success: false, reason: "No signed-in user or AuthEnrollmentStore not loaded." };

        if (action === "enroll") {
            const def = FACTOR_DEFS.find(d => d.factorName === factorName);
            if (!def || typeof def.realEnroll !== "function") return { success: false, reason: "No real enrollment method exists for this factor." };
            const real = await def.realEnroll(userId);
            if (!real.success) return real;
            return store.enroll(userId, factorName, { meta: real.meta || null });
        }
        if (action === "enable") return store.setEnabled(userId, factorName, true);
        if (action === "disable") return store.setEnabled(userId, factorName, false);
        if (action === "remove") return store.removeEnrollment(userId, factorName);
        return { success: false, reason: `Unknown action "${action}".` };
    }

    function getDashboard() {
        return `
        <style>
            #cozy-enrollpanel-root {
                --cozy-green: #00C853; --cozy-gold: #FFD700; --cozy-dark: #0A0A0A;
                --cozy-card-bg: #141414; --cozy-border: #222222;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: var(--cozy-dark); color: #ffffff; padding: 20px; min-height: 100%;
            }
            #cozy-enrollpanel-root h2 { color: var(--cozy-gold); text-align: center; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 5px; }
            #cozy-enrollpanel-root p.subtitle { text-align: center; color: #aaaaaa; font-size: 14px; margin-bottom: 25px; }
            #cozy-enrollpanel-root .cozy-enroll-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px; max-width: 1200px; margin: 0 auto; }
            #cozy-enrollpanel-root .cozy-enroll-card {
                background: var(--cozy-card-bg); border: 2px solid var(--cozy-border); border-radius: 12px;
                padding: 20px; box-shadow: 0 10px 30px rgba(0, 200, 83, 0.1); animation: cozyEnrollFadeIn 0.6s ease-in-out;
            }
            #cozy-enrollpanel-root .cozy-enroll-card h3 { color: var(--cozy-green); margin: 0 0 12px 0; border-bottom: 1px solid var(--cozy-border); padding-bottom: 8px; }
            #cozy-enrollpanel-root .cozy-enroll-field { margin-bottom: 8px; }
            #cozy-enrollpanel-root .cozy-enroll-k { display: block; color: var(--cozy-gold); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
            #cozy-enrollpanel-root .cozy-enroll-v { display: block; color: #dddddd; font-size: 13px; line-height: 1.5; }
            #cozy-enrollpanel-root .cozy-enroll-muted { color: #777777; font-style: italic; }
            #cozy-enrollpanel-root .cozy-enroll-devicelist, #cozy-enrollpanel-root .cozy-enroll-auditlist { margin: 4px 0 0 0; padding-left: 16px; }
            #cozy-enrollpanel-root .cozy-enroll-actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
            #cozy-enrollpanel-root .cozy-enroll-btn {
                background: transparent; border: 1px solid var(--cozy-green); color: var(--cozy-green);
                border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; text-transform: uppercase; letter-spacing: 1px;
            }
            #cozy-enrollpanel-root .cozy-enroll-btn:hover { background: rgba(0, 200, 83, 0.15); }
            #cozy-enrollpanel-root .cozy-enroll-btn-danger { border-color: #ff5252; color: #ff5252; }
            #cozy-enrollpanel-root .cozy-enroll-btn-danger:hover { background: rgba(255, 82, 82, 0.15); }
            @keyframes cozyEnrollFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        </style>
        <div id="cozy-enrollpanel-root">
            <h2>Authentication Enrollment</h2>
            <p class="subtitle">Real, per-user enrollment records — composed from AuthEnrollmentStore (Milestone 358).</p>
            <div class="cozy-enroll-grid" id="cozy-enrollpanel-grid">
                ${renderAllCards()}
            </div>
        </div>`;
    }

    async function handleGridClick(event) {
        const btn = event.target.closest(".cozy-enroll-btn");
        if (!btn || !rootEl) return;
        const factorName = btn.getAttribute("data-factor");
        const action = btn.getAttribute("data-action");
        btn.disabled = true;
        await doAction(factorName, action);
        const grid = rootEl.querySelector("#cozy-enrollpanel-grid");
        if (grid) grid.innerHTML = renderAllCards();
    }

    window.CozyOS.Modules["authentication-enrollment-panel"] = {
        version: MODULE_VERSION,
        getDashboard,
        async init() {
            rootEl = document.getElementById("cozy-enrollpanel-root")?.parentElement || document;
            if (rootEl && rootEl.addEventListener) rootEl.addEventListener("click", handleGridClick);
        },
        destroy() {
            if (rootEl && rootEl.removeEventListener) rootEl.removeEventListener("click", handleGridClick);
            rootEl = null;
        },
        // Exposed for the Node regression harness to test the framework without a DOM.
        buildEnrollmentCard, buildAllCards, renderEnrollmentCard, renderAllCards, doAction, getCurrentUserId, FACTOR_DEFS,
        getVersion() { return MODULE_VERSION; }
    };
})();
