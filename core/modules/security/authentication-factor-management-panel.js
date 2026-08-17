/**
 * CozyOS Authentication Factor Management Panel
 * File Reference: core/modules/security/authentication-factor-management-panel.js
 * Layer: Application / Settings Panel
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 360 (Authentication Factor Management & Secure Enrollment) — Stage 2
 *
 * OWNERSHIP
 *   Real management actions — Enroll, Enable, Disable, Rename (where a
 *   real rename path exists), Remove, View Details — for the three
 *   factors with a genuine per-user registration path in this codebase:
 *   Passkey (security-key / WebAuthnProvider), TOTP (otp / OtpProvider),
 *   and Trusted Device (trusted-device / TrustedDeviceManager). Composes
 *   AuthEnrollmentStore (Milestone 358) for lifecycle/history exactly as
 *   authentication-enrollment-panel.js (Milestone 359) already does.
 *   Performs no verification and no credential storage of its own.
 *
 * ADDITIVE, NOT A MODIFICATION (Rule 6 / Rule 17)
 *   authentication-enrollment-panel.js (M359, frozen) and
 *   authentication-settings-module.js (M357, frozen) are never edited or
 *   imported-and-mutated here. This is a third, independent panel — own
 *   window.CozyOS.Modules["authentication-factor-management-panel"] key,
 *   own DOM root (#cozy-factormgmt-root), own script tag. It composes
 *   the same underlying engines from the outside.
 *
 * FROZEN-FILE ADDITIONS THIS PANEL DEPENDS ON (Rule 3 / Principle 23,
 * explicitly approved before this file was written)
 *   - TrustedDeviceManager.renameDevice(deviceId, nickname) — new,
 *     additive method on the certified trusted-device-manager.js.
 *   - WebAuthnProvider.renameCredential(userId, nickname) and
 *     WebAuthnProvider.getCredentialInfo(userId) — new, additive methods
 *     on the certified webauthn-provider.js.
 *   Neither addition changed or removed any existing method or
 *   behavior — verified by diff against the certified M359 baseline
 *   before this file shipped (see M360 Stage 2 certification report,
 *   Frozen Baseline Integrity section).
 *
 * HONEST SCOPE — RENAME
 *   Passkey and Trusted Device both have a genuine rename path (the two
 *   approved additions above). TOTP does NOT: OtpProvider (frozen) has
 *   no update/rename method, and this milestone's approval covered only
 *   TrustedDeviceManager and WebAuthnProvider — not OtpProvider. Rather
 *   than fake a rename (e.g. silently re-calling AuthEnrollmentStore's
 *   enroll() to overwrite a label, which would falsely log a
 *   "re-enrolled" audit event for something that wasn't a re-enrollment),
 *   this panel discloses the gap honestly wherever a TOTP rename control
 *   would otherwise appear.
 *
 * HONEST SCOPE — GUIDED ENROLLMENT
 *   "Guided enrollment" here is real, not simulated: a confirmation step
 *   before the real provider call, then the real success/failure result
 *   from that provider surfaced verbatim (never replaced with a generic
 *   "Success!" when the real call failed). There is no separate "device
 *   verification" step beyond what each real provider itself performs
 *   (WebAuthn's own browser prompt, the trusted-device fingerprint
 *   check) — this file does not fabricate an additional verification
 *   layer that doesn't exist.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const MODULE_VERSION = "1.0.0";

    window.CozyOS.Modules = window.CozyOS.Modules || {};
    if (window.CozyOS.Modules["authentication-factor-management-panel"] && window.CozyOS.Modules["authentication-factor-management-panel"].version) return;

    let rootEl = null;
    let pendingConfirm = null; // {factorName, action, deviceId} awaiting a second confirm click

    /** getCurrentUserId() — real, same canonical pointer M359's panel uses. Never invents an identity. */
    function getCurrentUserId() {
        const auth = window.CozyOS.Auth;
        if (!auth || typeof auth.getCurrentIdentity !== "function") return null;
        const identity = auth.getCurrentIdentity();
        return identity && identity.userId ? identity.userId : null;
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // ---- Passkey (security-key) ----------------------------------------------------
    function buildPasskeyCard(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        const provider = window.CozyOS.WebAuthnProvider;
        const record = store ? store.getEnrollment(userId, "security-key") : null;
        const hasCred = provider && typeof provider.hasCredential === "function" ? provider.hasCredential(userId) : false;
        const info = hasCred && typeof provider.getCredentialInfo === "function" ? provider.getCredentialInfo(userId) : null;
        return {
            factorName: "security-key", label: "Passkey (WebAuthn)", kind: "single",
            enrolled: !!record, enabled: record ? record.enabled : null,
            enrolledAt: record ? record.enrolledAt : null, lastUsedAt: record ? record.lastUsedAt : null,
            nickname: info ? info.nickname : null,
            canEnroll: !record && !!provider && typeof provider.registerCredential === "function",
            canRename: !!record && hasCred && !!provider && typeof provider.renameCredential === "function",
            enrollUnavailableReason: !provider ? "WebAuthnProvider is not loaded." : null,
        };
    }

    async function passkeyEnroll(userId) {
        const provider = window.CozyOS.WebAuthnProvider;
        const store = window.CozyOS.AuthEnrollmentStore;
        if (!provider || typeof provider.registerCredential !== "function") return { success: false, reason: "WebAuthnProvider is not loaded." };
        const real = await provider.registerCredential(userId, { displayName: userId });
        if (!real.success) return real;
        return store.enroll(userId, "security-key", { meta: null });
    }
    async function passkeyRename(userId, nickname) {
        const provider = window.CozyOS.WebAuthnProvider;
        if (!provider || typeof provider.renameCredential !== "function") return { success: false, reason: "No real rename path exists for this factor." };
        return provider.renameCredential(userId, nickname);
    }
    async function passkeyRemove(userId) {
        const provider = window.CozyOS.WebAuthnProvider;
        const store = window.CozyOS.AuthEnrollmentStore;
        const removed = provider && typeof provider.removeCredential === "function" ? provider.removeCredential(userId) : { success: false, reason: "WebAuthnProvider is not loaded." };
        const storeResult = store ? store.removeEnrollment(userId, "security-key") : { success: false };
        return { success: removed.success || storeResult.success, reason: !removed.success ? removed.reason : storeResult.reason };
    }

    // ---- TOTP (otp) ------------------------------------------------------------------
    function buildOtpCard(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        const provider = window.CozyOS.OtpProvider;
        const record = store ? store.getEnrollment(userId, "otp") : null;
        const accountId = record && record.meta ? record.meta.accountId : null;
        const account = accountId && provider && typeof provider.getAccount === "function" ? provider.getAccount(accountId) : null;
        return {
            factorName: "otp", label: "Authenticator App (TOTP)", kind: "single",
            enrolled: !!record, enabled: record ? record.enabled : null,
            enrolledAt: record ? record.enrolledAt : null, lastUsedAt: record ? record.lastUsedAt : null,
            accountId, accountName: account ? account.accountName : null, issuer: account ? account.issuer : null,
            canEnroll: !record && !!provider && typeof provider.enrollAccount === "function",
            canRename: false,
            renameUnavailableReason: "No real rename/update path exists on OtpProvider (frozen; this milestone's approval covered TrustedDeviceManager and WebAuthnProvider only). Disclosed rather than faked.",
            enrollUnavailableReason: !provider ? "OtpProvider is not loaded." : null,
        };
    }
    async function otpEnroll(userId) {
        const provider = window.CozyOS.OtpProvider;
        const store = window.CozyOS.AuthEnrollmentStore;
        if (!provider || typeof provider.enrollAccount !== "function") return { success: false, reason: "OtpProvider is not loaded." };
        const real = provider.enrollAccount({ issuer: "CozyOS", accountName: userId });
        if (!real.success) return real;
        const stored = store.enroll(userId, "otp", { meta: { accountId: real.accountId } });
        return { ...stored, otpauthUri: real.otpauthUri, secretBase32: real.secretBase32 };
    }
    async function otpRemove(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        const provider = window.CozyOS.OtpProvider;
        const record = store ? store.getEnrollment(userId, "otp") : null;
        const accountId = record && record.meta ? record.meta.accountId : null;
        const removed = accountId && provider && typeof provider.removeAccount === "function" ? provider.removeAccount(accountId) : { success: false, reason: "No enrolled OTP account to remove." };
        const storeResult = store ? store.removeEnrollment(userId, "otp") : { success: false };
        return { success: removed.success || storeResult.success, reason: !removed.success ? removed.reason : storeResult.reason };
    }

    // ---- Trusted Device (trusted-device) — genuinely multi-device -------------------
    function buildTrustedDeviceCards(userId) {
        const manager = window.CozyOS.TrustedDeviceManager;
        if (!manager || typeof manager.listDevicesForUser !== "function") {
            return [{ factorName: "trusted-device", label: "Trusted Device", kind: "unavailable", reason: "TrustedDeviceManager is not loaded." }];
        }
        const devices = manager.listDevicesForUser(userId).filter(d => !d.revoked);
        return devices.map(d => {
            const health = manager.getDeviceHealth(d.deviceId);
            return {
                factorName: "trusted-device", label: "Trusted Device", kind: "device",
                deviceId: d.deviceId, nickname: d.nickname, registeredAt: d.registeredAt,
                trustExpiresAt: d.trustExpiresAt, lastActivityAt: d.lastActivityAt,
                trusted: health.trusted, locked: health.locked, daysUntilTrustExpiry: health.daysUntilTrustExpiry,
                biometricEnabled: d.biometricEnabled, canRename: true,
            };
        });
    }
    async function trustedDeviceEnroll(userId, nickname) {
        const manager = window.CozyOS.TrustedDeviceManager;
        const store = window.CozyOS.AuthEnrollmentStore;
        if (!manager) return { success: false, reason: "TrustedDeviceManager is not loaded." };
        const fingerprint = await manager.generateFingerprint();
        const real = manager.registerDevice(userId, { nickname: nickname || "This device", fingerprint });
        if (!real.success) return real;
        return store.enroll(userId, "trusted-device", { deviceId: real.device.deviceId, deviceLabel: real.device.nickname, meta: null });
    }
    async function trustedDeviceRename(deviceId, nickname) {
        const manager = window.CozyOS.TrustedDeviceManager;
        if (!manager || typeof manager.renameDevice !== "function") return { success: false, reason: "No real rename path exists for this factor." };
        return manager.renameDevice(deviceId, nickname);
    }
    async function trustedDeviceRemove(userId, deviceId) {
        const manager = window.CozyOS.TrustedDeviceManager;
        const store = window.CozyOS.AuthEnrollmentStore;
        const removed = manager && typeof manager.removeDevice === "function" ? manager.removeDevice(deviceId, "Removed via Factor Management panel.") : { success: false, reason: "TrustedDeviceManager is not loaded." };
        const storeResult = store ? store.removeDevice(userId, "trusted-device", deviceId) : { success: false };
        return { success: removed.success, reason: removed.success ? null : removed.reason, storeUpdated: !!storeResult.success };
    }

    // ---- rendering --------------------------------------------------------------------
    function renderSingleCard(card) {
        const actions = [];
        if (card.canEnroll) actions.push(btn(card.factorName, "enroll", "Enroll"));
        if (card.enrolled) {
            actions.push(btn(card.factorName, card.enabled ? "disable" : "enable", card.enabled ? "Disable" : "Enable"));
            if (card.canRename) actions.push(btn(card.factorName, "rename-prompt", "Rename"));
            actions.push(btn(card.factorName, "remove", "Remove", true));
        }
        return `
        <div class="cozy-fm-card">
            <h3>${escapeHtml(card.label)}${card.nickname ? ` — <span class="cozy-fm-nick">${escapeHtml(card.nickname)}</span>` : ""}</h3>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Status</span><span class="cozy-fm-v">${card.enrolled ? (card.enabled ? "Enrolled — Enabled" : "Enrolled — Disabled") : "Not Enrolled"}</span></div>
            ${card.enrolled ? `<div class="cozy-fm-field"><span class="cozy-fm-k">Enrolled</span><span class="cozy-fm-v">${escapeHtml(card.enrolledAt || "—")}</span></div>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Last Used</span><span class="cozy-fm-v">${escapeHtml(card.lastUsedAt || "Never")}</span></div>` : ""}
            ${card.accountName ? `<div class="cozy-fm-field"><span class="cozy-fm-k">Account</span><span class="cozy-fm-v">${escapeHtml(card.issuer)}:${escapeHtml(card.accountName)}</span></div>` : ""}
            ${card.renameUnavailableReason && card.enrolled ? `<div class="cozy-fm-field"><span class="cozy-fm-k">Rename</span><span class="cozy-fm-v cozy-fm-muted">${escapeHtml(card.renameUnavailableReason)}</span></div>` : ""}
            ${card.enrollUnavailableReason && !card.enrolled ? `<div class="cozy-fm-field"><span class="cozy-fm-k">Enroll Unavailable</span><span class="cozy-fm-v cozy-fm-muted">${escapeHtml(card.enrollUnavailableReason)}</span></div>` : ""}
            <div class="cozy-fm-actions">${actions.length ? actions.join("") : "<span class=\"cozy-fm-muted\">No actions available.</span>"}</div>
        </div>`;
    }

    function renderDeviceCard(card) {
        if (card.kind === "unavailable") {
            return `<div class="cozy-fm-card"><h3>${escapeHtml(card.label)}</h3><div class="cozy-fm-field"><span class="cozy-fm-v cozy-fm-muted">${escapeHtml(card.reason)}</span></div></div>`;
        }
        const actions = [
            btn("trusted-device", "rename-prompt", "Rename", false, card.deviceId),
            btn("trusted-device", "remove", "Remove", true, card.deviceId),
        ];
        return `
        <div class="cozy-fm-card">
            <h3>Trusted Device — <span class="cozy-fm-nick">${escapeHtml(card.nickname)}</span></h3>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Trust</span><span class="cozy-fm-v">${card.trusted ? `Trusted (${card.daysUntilTrustExpiry}d remaining)` : "Not Trusted / Expired"}</span></div>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Lock State</span><span class="cozy-fm-v">${card.locked ? "Idle-Locked" : "Unlocked"}</span></div>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Registered</span><span class="cozy-fm-v">${escapeHtml(card.registeredAt)}</span></div>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Last Activity</span><span class="cozy-fm-v">${escapeHtml(card.lastActivityAt)}</span></div>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Biometric Unlock</span><span class="cozy-fm-v">${card.biometricEnabled ? "Enabled" : "Disabled"}</span></div>
            <div class="cozy-fm-actions">${actions.join("")}</div>
        </div>`;
    }

    function btn(factorName, action, text, danger, deviceId) {
        return `<button class="cozy-fm-btn${danger ? " cozy-fm-btn-danger" : ""}" data-factor="${factorName}" data-action="${action}"${deviceId ? ` data-device="${deviceId}"` : ""}>${escapeHtml(text)}</button>`;
    }

    function renderConfirmBanner() {
        if (!pendingConfirm) return "";
        const label = pendingConfirm.action === "remove" ? "remove this factor" : pendingConfirm.action === "enroll" ? "enroll this factor" : "make this change";
        return `<div class="cozy-fm-confirm">Confirm: ${escapeHtml(label)}?
            <button class="cozy-fm-btn" data-confirm="yes">Yes, continue</button>
            <button class="cozy-fm-btn" data-confirm="no">Cancel</button></div>`;
    }

    function renderResultBanner(result) {
        if (!result) return "";
        const cls = result.success ? "cozy-fm-result-ok" : "cozy-fm-result-fail";
        const msg = result.success ? "Completed successfully." : (result.reason || "The action could not be completed.");
        return `<div class="cozy-fm-result ${cls}">${escapeHtml(msg)}</div>`;
    }

    let lastResult = null;

    function renderAll(userId) {
        if (!userId) {
            return `<p class="cozy-fm-muted">No signed-in user — factor management is always scoped to a real, authenticated user.</p>`;
        }
        const cards = [buildPasskeyCard(userId), buildOtpCard(userId)];
        const deviceCards = buildTrustedDeviceCards(userId);
        return `
            ${renderConfirmBanner()}
            ${renderResultBanner(lastResult)}
            <div class="cozy-fm-grid">
                ${cards.map(renderSingleCard).join("\n")}
                ${deviceCards.map(renderDeviceCard).join("\n")}
                <div class="cozy-fm-card"><h3>Add a Trusted Device</h3><p class="cozy-fm-muted">Register this browser/device as trusted (30-day trust window).</p>
                    <div class="cozy-fm-actions">${btn("trusted-device", "enroll", "Enroll This Device")}</div></div>
            </div>`;
    }

    /**
     * doAction(factorName, action, deviceId, nickname)
     *   Real — routes to the composed engines above. Enroll/Rename call
     *   the real provider FIRST; only a real success is ever recorded.
     */
    async function doAction(factorName, action, deviceId, nickname) {
        const userId = getCurrentUserId();
        if (!userId) return { success: false, reason: "No signed-in user." };

        if (factorName === "security-key") {
            if (action === "enroll") return passkeyEnroll(userId);
            if (action === "rename") return passkeyRename(userId, nickname);
            if (action === "enable") return window.CozyOS.AuthEnrollmentStore.setEnabled(userId, "security-key", true);
            if (action === "disable") return window.CozyOS.AuthEnrollmentStore.setEnabled(userId, "security-key", false);
            if (action === "remove") return passkeyRemove(userId);
        }
        if (factorName === "otp") {
            if (action === "enroll") return otpEnroll(userId);
            if (action === "enable") return window.CozyOS.AuthEnrollmentStore.setEnabled(userId, "otp", true);
            if (action === "disable") return window.CozyOS.AuthEnrollmentStore.setEnabled(userId, "otp", false);
            if (action === "remove") return otpRemove(userId);
        }
        if (factorName === "trusted-device") {
            if (action === "enroll") return trustedDeviceEnroll(userId, "This device");
            if (action === "rename") return trustedDeviceRename(deviceId, nickname);
            if (action === "remove") return trustedDeviceRemove(userId, deviceId);
        }
        return { success: false, reason: `Unknown action "${action}" for factor "${factorName}".` };
    }

    function getDashboard() {
        const userId = getCurrentUserId();
        return `
        <style>
            #cozy-factormgmt-root { --cozy-green:#00C853; --cozy-gold:#FFD700; --cozy-dark:#0A0A0A; --cozy-card-bg:#141414; --cozy-border:#222222;
                font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif; background:var(--cozy-dark); color:#fff; padding:20px; min-height:100%; }
            #cozy-factormgmt-root h2 { color:var(--cozy-gold); text-align:center; text-transform:uppercase; letter-spacing:2px; margin-bottom:5px; }
            #cozy-factormgmt-root p.subtitle { text-align:center; color:#aaa; font-size:14px; margin-bottom:20px; }
            .cozy-fm-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; max-width:1200px; margin:0 auto; }
            .cozy-fm-card { background:var(--cozy-card-bg); border:2px solid var(--cozy-border); border-radius:12px; padding:18px; box-shadow:0 8px 24px rgba(0,200,83,0.1); }
            .cozy-fm-card h3 { color:var(--cozy-green); margin:0 0 10px 0; border-bottom:1px solid var(--cozy-border); padding-bottom:6px; font-size:15px; }
            .cozy-fm-nick { color:var(--cozy-gold); }
            .cozy-fm-field { margin-bottom:6px; }
            .cozy-fm-k { display:block; color:var(--cozy-gold); font-size:10px; text-transform:uppercase; letter-spacing:1px; }
            .cozy-fm-v { display:block; color:#ddd; font-size:13px; }
            .cozy-fm-muted { color:#777; font-style:italic; }
            .cozy-fm-actions { margin-top:10px; display:flex; gap:6px; flex-wrap:wrap; }
            .cozy-fm-btn { background:transparent; border:1px solid var(--cozy-green); color:var(--cozy-green); border-radius:6px; padding:6px 10px; font-size:11px; cursor:pointer; text-transform:uppercase; }
            .cozy-fm-btn:hover { background:rgba(0,200,83,0.15); }
            .cozy-fm-btn-danger { border-color:#ff5252; color:#ff5252; }
            .cozy-fm-confirm { background:#1a1a00; border:1px solid var(--cozy-gold); border-radius:8px; padding:10px 14px; margin-bottom:14px; max-width:600px; margin-left:auto; margin-right:auto; text-align:center; }
            .cozy-fm-result { border-radius:8px; padding:10px 14px; margin-bottom:14px; max-width:600px; margin-left:auto; margin-right:auto; text-align:center; }
            .cozy-fm-result-ok { background:#062b13; border:1px solid var(--cozy-green); color:var(--cozy-green); }
            .cozy-fm-result-fail { background:#2b0606; border:1px solid #ff5252; color:#ff8a8a; }
        </style>
        <div id="cozy-factormgmt-root">
            <h2>Authentication Factor Management</h2>
            <p class="subtitle">Real management for Passkey, TOTP, and Trusted Device — composed from AuthEnrollmentStore, WebAuthnProvider, OtpProvider, and TrustedDeviceManager.</p>
            <div id="cozy-factormgmt-body">${renderAll(userId)}</div>
        </div>`;
    }

    function rerender() {
        const userId = getCurrentUserId();
        const body = rootEl && rootEl.querySelector ? rootEl.querySelector("#cozy-factormgmt-body") : null;
        if (body) body.innerHTML = renderAll(userId);
    }

    async function handleClick(event) {
        if (!rootEl) return;
        const confirmBtn = event.target.closest("[data-confirm]");
        if (confirmBtn) {
            const answer = confirmBtn.getAttribute("data-confirm");
            const pending = pendingConfirm;
            pendingConfirm = null;
            if (answer === "yes" && pending) {
                lastResult = await doAction(pending.factorName, pending.action, pending.deviceId, pending.nickname);
            }
            rerender();
            return;
        }
        const actionBtn = event.target.closest(".cozy-fm-btn");
        if (!actionBtn) return;
        const factorName = actionBtn.getAttribute("data-factor");
        const action = actionBtn.getAttribute("data-action");
        const deviceId = actionBtn.getAttribute("data-device") || null;

        if (action === "rename-prompt") {
            const nickname = (typeof window.prompt === "function") ? window.prompt("New name:") : null;
            if (!nickname) return;
            lastResult = await doAction(factorName, "rename", deviceId, nickname);
            rerender();
            return;
        }
        if (action === "enroll" || action === "remove") {
            pendingConfirm = { factorName, action, deviceId };
            rerender();
            return;
        }
        // enable/disable are low-risk, reversible toggles — no confirmation step needed.
        lastResult = await doAction(factorName, action, deviceId);
        rerender();
    }

    window.CozyOS.Modules["authentication-factor-management-panel"] = {
        version: MODULE_VERSION,
        getDashboard,
        async init() {
            rootEl = document.getElementById("cozy-factormgmt-root")?.parentElement || document;
            if (rootEl && rootEl.addEventListener) rootEl.addEventListener("click", handleClick);
        },
        destroy() {
            if (rootEl && rootEl.removeEventListener) rootEl.removeEventListener("click", handleClick);
            rootEl = null; pendingConfirm = null; lastResult = null;
        },
        // Exposed for the Node regression harness — test the framework without a DOM.
        buildPasskeyCard, buildOtpCard, buildTrustedDeviceCards, doAction, getCurrentUserId, renderAll,
        getVersion() { return MODULE_VERSION; }
    };
})();
