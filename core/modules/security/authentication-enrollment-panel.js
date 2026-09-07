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
 *     - security-key (Passkey): AuthCoordinator.registerServerPasskey(),
 *       falling back to the legacy WebAuthnProvider.registerCredential()
 *       only when no server session exists for this identity.
 *     - otp (TOTP): AuthCoordinator.beginServerTotpEnrollment() +
 *       completeServerTotpEnrollment() (real two-step, server-confirmed
 *       enrollment — see pendingOtpEnrollments below), falling back to
 *       the legacy, client-only OtpProvider.enrollAccount() only when no
 *       server session exists. OtpProvider itself remains real and
 *       correct for its OTHER, legitimate role powering the separate
 *       Cozy-Authenticator application (third-party account codes) —
 *       this file only changed which authority ITS OWN "otp" factor
 *       card reaches.
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
    // Domain 2 (Security & Sign-in discovery) — real, real, in-memory-only
    // state for a TOTP enrollment that has a server-issued secret but has
    // not yet been confirmed with a code. Never persisted to
    // AuthEnrollmentStore (that would mark the factor "Enrolled" before
    // the server has actually verified anything — server/webauthn-rp/
    // rp.js's completeTotpEnrollment() is what really flips
    // totp_enabled=1). Cleared on confirm, cancel, or page reload
    // (acceptable: an abandoned enrollment attempt simply has to be
    // started again, same as the server's own 5-minute-scoped state
    // would eventually require anyway).
    const pendingOtpEnrollments = new Map(); // userId -> { secretBase32, otpauthUri }

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
            // Portion 2e: real, server-authoritative enrollment. Prefers
            // AuthCoordinator.registerServerPasskey() (core/modules/
            // identity/auth-coordinator.js) — the real browser
            // navigator.credentials.create() ceremony against the real
            // server/webauthn-rp RP (POST /webauthn/passkeys/enroll/begin
            // -> create() -> POST /webauthn/passkeys/enroll/complete) —
            // over the legacy client-side
            // WebAuthnProvider.registerCredential(), which never talked
            // to a real server verifier at all. Falls back to the legacy
            // path only if AuthCoordinator/registerServerPasskey isn't
            // loaded, so this file still degrades honestly rather than
            // throwing on an older page that hasn't picked up Portion 2e.
            //
            // DISCLOSED LIMIT: the server's enroll endpoints currently
            // require an authenticated platform-administrator session
            // (see auth-coordinator.js's registerServerPasskey() header).
            // For a non-admin signed-in user, the real server call below
            // will honestly fail with not_authenticated_admin — this
            // panel reports that reason rather than silently falling
            // back to the legacy (locally-fabricated) success path,
            // since a fabricated success would be worse than an honest
            // failure.
            factorName: "security-key", label: "Passkey (WebAuthn)",
            realEnroll: async (userId) => {
                const coordinator = window.CozyOS.AuthCoordinator;
                if (coordinator && typeof coordinator.registerServerPasskey === "function") {
                    const result = await coordinator.registerServerPasskey();
                    if (!result || result.available !== true) {
                        return { success: false, reason: (result && result.reason) || "Passkey registration failed." };
                    }
                    return { success: true, meta: { credentialId: result.credentialId, nickname: result.nickname, source: "server" } };
                }
                const provider = window.CozyOS.WebAuthnProvider;
                if (!provider || typeof provider.registerCredential !== "function") return { success: false, reason: "Neither AuthCoordinator.registerServerPasskey() nor the legacy WebAuthnProvider is loaded." };
                return provider.registerCredential(userId, { displayName: userId });
            },
        },
        {
            factorName: "otp", label: "Authenticator App (TOTP)",
            // Domain 2 (Security & Sign-in discovery): prefers the real,
            // server-authoritative AuthCoordinator.beginServerTotpEnrollment()/
            // completeServerTotpEnrollment() (POST /auth/mfa/totp/enroll/
            // begin|complete) — the same server the real login-time MFA
            // check (completeServerLoginWithOtp() -> POST /auth/mfa/verify)
            // already trusts — over the legacy, client-only OtpProvider,
            // which never talks to that server at all. Falls back to
            // OtpProvider only when the server honestly reports no
            // session exists (requiresAuth:true), same rule already
            // proven for Passkey above. NOTE: OtpProvider itself is not
            // retired by this — it remains the real, correct engine for
            // the separate Cozy-Authenticator application (a general
            // third-party-account code vault, unrelated to this
            // CozyOS-account factor); this enrollment card only changes
            // which authority THIS factor's Enroll button reaches.
            realEnroll: async (userId) => {
                const coordinator = window.CozyOS.AuthCoordinator;
                if (coordinator && typeof coordinator.beginServerTotpEnrollment === "function") {
                    const begin = await coordinator.beginServerTotpEnrollment();
                    if (begin && begin.available === true) {
                        // Real secret/otpauthUri now exist server-side; the
                        // actual 6-digit confirmation step is owned by the
                        // enrollment UI flow (verifyServerEnroll below),
                        // not this initial click — matches Passkey's own
                        // two-step (begin ceremony / relay result) shape
                        // as closely as TOTP's own two-step (show secret /
                        // confirm code) protocol allows.
                        return { success: true, meta: { secretBase32: begin.secretBase32, otpauthUri: begin.otpauthUri, source: "server", pendingVerification: true } };
                    }
                    if (!begin || !begin.requiresAuth) {
                        return { success: false, reason: (begin && begin.reason) || "Authenticator app setup failed." };
                    }
                    // requiresAuth:true -> no server session for this
                    // identity -> honest fallback below.
                }
                const provider = window.CozyOS.OtpProvider;
                if (!provider || typeof provider.enrollAccount !== "function") return { success: false, reason: "Neither AuthCoordinator.beginServerTotpEnrollment() nor the legacy OtpProvider is loaded." };
                const result = provider.enrollAccount({ issuer: "CozyOS", accountName: userId });
                if (!result.success) return result;
                return { success: true, meta: { accountId: result.accountId, source: "legacy" } };
            },
            // Real server-side confirmation step — submits the 6-digit
            // code to AuthCoordinator.completeServerTotpEnrollment(),
            // never verified locally. Only meaningful for the server
            // path above (meta.source === "server"); the legacy
            // OtpProvider path enrolls immediately (matches its
            // pre-existing, unchanged behavior).
            verifyServerEnroll: async (code) => {
                const coordinator = window.CozyOS.AuthCoordinator;
                if (!coordinator || typeof coordinator.completeServerTotpEnrollment !== "function") {
                    return { success: false, reason: "AuthCoordinator.completeServerTotpEnrollment() is not loaded." };
                }
                const result = await coordinator.completeServerTotpEnrollment(code);
                if (!result || result.available !== true) return { success: false, reason: (result && result.reason) || "Authenticator app confirmation failed." };
                return { success: true, meta: { recoveryCodes: result.recoveryCodes || null, source: "server" } };
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
        const pendingOtp = def.factorName === "otp" ? pendingOtpEnrollments.get(userId) : null;

        return {
            id: def.factorName, label: def.label, unavailable: false,
            registered: !!registryEntry,
            registryNote: registryEntry ? registryEntry.note : "Not registered with AuthFactorRegistry.",
            enrolled: !!record,
            enrollmentStatus: pendingOtp ? "Enrollment Pending — Confirm Code" : record ? (record.enabled ? "Enrolled — Enabled" : "Enrolled — Disabled") : "Not Enrolled",
            enrolledAt: record ? record.enrolledAt : null,
            lastUsedAt: record ? record.lastUsedAt : null,
            devices: record ? record.devices : [],
            enabled: record ? record.enabled : null,
            auditHistory,
            canEnroll: !record && !pendingOtp && typeof def.realEnroll === "function",
            pendingVerification: pendingOtp ? { secretBase32: pendingOtp.secretBase32, otpauthUri: pendingOtp.otpauthUri } : null,
            canConfirmPending: !!pendingOtp && typeof def.verifyServerEnroll === "function",
            enrollUnavailableReason: !record && !pendingOtp && typeof def.realEnroll !== "function"
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
        if (card.canConfirmPending) actions.push(`<button class="cozy-enroll-btn cozy-enroll-btn-danger" data-factor="${card.id}" data-action="cancel-pending">Cancel</button>`);
        if (card.enrolled) {
            actions.push(`<button class="cozy-enroll-btn" data-factor="${card.id}" data-action="${card.enabled ? "disable" : "enable"}">${card.enabled ? "Disable" : "Enable"}</button>`);
            actions.push(`<button class="cozy-enroll-btn cozy-enroll-btn-danger" data-factor="${card.id}" data-action="remove">Remove</button>`);
        }

        const pendingBlock = card.pendingVerification ? `
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Secret (manual entry)</span><span class="cozy-enroll-v">${escapeHtml(card.pendingVerification.secretBase32 || "—")}</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Setup URI</span><span class="cozy-enroll-v">${escapeHtml(card.pendingVerification.otpauthUri || "—")}</span></div>
            ${card.canConfirmPending ? `
            <div class="cozy-enroll-field">
                <span class="cozy-enroll-k">Confirm Code</span>
                <span class="cozy-enroll-v">
                    <input type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code" data-otp-code="${card.id}" class="cozy-enroll-otp-input" />
                    <button class="cozy-enroll-btn" data-factor="${card.id}" data-action="confirm">Confirm</button>
                </span>
            </div>` : ""}` : "";

        return `
        <div class="cozy-enroll-card">
            <h3>${escapeHtml(card.label)}</h3>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Enrollment Status</span><span class="cozy-enroll-v">${escapeHtml(card.enrollmentStatus)}</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Enrollment Date</span><span class="cozy-enroll-v">${escapeHtml(card.enrolledAt || "—")}</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Last Used</span><span class="cozy-enroll-v">${escapeHtml(card.lastUsedAt || "Never")}</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Associated Devices</span><span class="cozy-enroll-v">${renderDeviceList(card.devices)}</span></div>
            <div class="cozy-enroll-field"><span class="cozy-enroll-k">Audit History (recent)</span><span class="cozy-enroll-v">${renderAuditList(card.auditHistory)}</span></div>
            ${pendingBlock}
            ${card.enrollUnavailableReason ? `<div class="cozy-enroll-field"><span class="cozy-enroll-k">Enroll Unavailable</span><span class="cozy-enroll-v">${escapeHtml(card.enrollUnavailableReason)}</span></div>` : ""}
            <div class="cozy-enroll-actions">${actions.length ? actions.join("") : "<span class=\"cozy-enroll-muted\">No actions available.</span>"}</div>
        </div>`;
    }

    function renderAllCards() {
        return buildAllCards().map(renderEnrollmentCard).join("\n");
    }

    /**
     * doAction(factorName, action, extra)
     *   Real — routes to the composed engines. "enroll" calls the
     *   factor's own real registration method FIRST; AuthEnrollmentStore
     *   only ever records a real success, never a fabricated one.
     *   enable/disable/remove call AuthEnrollmentStore directly (it is
     *   already the real, single owner of that lifecycle).
     *
     *   Domain 2 addition — TOTP's real two-step ceremony (server issues
     *   a secret, then a separate, later request submits a code) cannot
     *   collapse into the same single "call realEnroll, then immediately
     *   AuthEnrollmentStore.enroll()" shape Passkey's one-shot ceremony
     *   uses. When realEnroll()'s result carries
     *   meta.pendingVerification, this stores the server-issued
     *   secret/URI in the in-memory pendingOtpEnrollments map and
     *   returns WITHOUT ever calling store.enroll() — the factor is not
     *   enrolled yet. Only "confirm" (after a real
     *   completeServerTotpEnrollment() success) calls store.enroll().
     *   "cancel-pending" discards the pending state without ever having
     *   told the store anything.
     */
    async function doAction(factorName, action, extra) {
        const userId = getCurrentUserId();
        const store = window.CozyOS.AuthEnrollmentStore;
        if (!userId || !store) return { success: false, reason: "No signed-in user or AuthEnrollmentStore not loaded." };

        if (action === "enroll") {
            const def = FACTOR_DEFS.find(d => d.factorName === factorName);
            if (!def || typeof def.realEnroll !== "function") return { success: false, reason: "No real enrollment method exists for this factor." };
            const real = await def.realEnroll(userId);
            if (!real.success) return real;
            if (real.meta && real.meta.pendingVerification) {
                // Real server secret exists, but nothing is enrolled yet —
                // never call store.enroll() here.
                pendingOtpEnrollments.set(userId, { secretBase32: real.meta.secretBase32, otpauthUri: real.meta.otpauthUri });
                return { success: true, pending: true, secretBase32: real.meta.secretBase32, otpauthUri: real.meta.otpauthUri };
            }
            return store.enroll(userId, factorName, { meta: real.meta || null });
        }
        if (action === "confirm") {
            const def = FACTOR_DEFS.find(d => d.factorName === factorName);
            const pending = pendingOtpEnrollments.get(userId);
            if (!pending) return { success: false, reason: "No pending enrollment to confirm." };
            if (!def || typeof def.verifyServerEnroll !== "function") return { success: false, reason: "No real confirmation method exists for this factor." };
            const result = await def.verifyServerEnroll(extra);
            if (!result.success) return result; // real server rejection (invalid code, expired, etc.) — pending state deliberately left intact so the person can retry without re-requesting a new secret
            pendingOtpEnrollments.delete(userId);
            return store.enroll(userId, factorName, { meta: result.meta || null });
        }
        if (action === "cancel-pending") {
            pendingOtpEnrollments.delete(userId);
            return { success: true };
        }
        if (action === "enable") return store.setEnabled(userId, factorName, true);
        if (action === "disable") return store.setEnabled(userId, factorName, false);
        if (action === "remove") {
            if (factorName === "otp") {
                const coordinator = window.CozyOS.AuthCoordinator;
                const record = store.getEnrollment(userId, "otp");
                // Only a factor actually enrolled through the real server
                // path has server-side state to disable — a legacy
                // (client-only) enrollment never called the server at
                // all, so there is nothing server-side to tell.
                if (record && record.meta && record.meta.source === "server" && coordinator && typeof coordinator.disableServerTotp === "function") {
                    const result = await coordinator.disableServerTotp();
                    if (result.available !== true) return { success: false, reason: result.reason || "Could not disable the authenticator app." };
                    return store.removeEnrollment(userId, factorName);
                }
            }
            return store.removeEnrollment(userId, factorName);
        }
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
        let extra;
        if (action === "confirm") {
            const input = rootEl.querySelector(`[data-otp-code="${factorName}"]`);
            extra = input ? input.value : "";
        }
        btn.disabled = true;
        await doAction(factorName, action, extra);
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
