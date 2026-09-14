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
    let pendingConfirm = null;
    // Domain 2 (Security & Sign-in discovery) — real, in-memory-only
    // pending state for a TOTP enrollment that has a server-issued
    // secret but has not yet been confirmed with a code. See
    // authentication-enrollment-panel.js's own pendingOtpEnrollments for
    // the identical rationale — never persisted, never marks the factor
    // enrolled until a real completeServerTotpEnrollment() success.
    const pendingOtpEnrollments = new Map(); // userId -> { secretBase32, otpauthUri }

    /**
     * getCurrentUserId() — real, same canonical pointer M359's panel uses.
     * Never invents an identity.
     *
     * ORDINARY-USER FIX: CozyOS.Auth (core/security/cozy-auth.js) only
     * ever populates #currentAdministrator for Platform-Administrator or
     * Developer sessions — it explicitly rejects and never records an
     * ordinary user's sign-in (see that file's own #handleSessionStarted
     * fail-closed branch). Calling only Auth.getCurrentIdentity() here
     * would therefore report "no signed-in user" for every real,
     * legitimately authenticated ordinary user, even though this same
     * panel is now mounted on the ordinary-user dashboard. Falls back to
     * CozyOS.Session.current() — the real, auth-provider-agnostic
     * session snapshot every sign-in path (native or Firebase) already
     * establishes, per that engine's own header ("Deliberately unaware
     * of any specific auth provider") — never a second/parallel session
     * store. Admin/developer behavior is unchanged: Auth is still tried
     * first and still wins whenever it has resolved an identity.
     */
    function getCurrentUserId() {
        const auth = window.CozyOS.Auth;
        if (auth && typeof auth.getCurrentIdentity === "function") {
            const identity = auth.getCurrentIdentity();
            if (identity && identity.userId) return identity.userId;
        }
        const session = window.CozyOS.Session;
        if (session && typeof session.current === "function") {
            const snapshot = session.current();
            if (snapshot && snapshot.uid) return snapshot.uid;
        }
        return null;
    }

    function escapeHtml(s) {
        return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // ---- Passkey (security-key) ----------------------------------------------------
    // Domain-1 fix (Security & Sign-in discovery, Phase 1A): this panel
    // previously called ONLY the legacy client-side
    // WebAuthnProvider.registerCredential() here, which never talks to
    // the real server RP (server/webauthn-rp/rp.js). That let an
    // administrator "enroll" a passkey that AuthEnrollmentStore reported
    // as enrolled/enabled while the real server-authoritative login path
    // (AuthCoordinator.loginWithServerPasskey(), the one login.html
    // actually calls) would never recognize it — a duplicate-authority /
    // security-theater gap matching the one authentication-
    // enrollment-panel.js (M359) already closed for its own Enroll
    // button. This brings passkeyEnroll() to the same, already-tested
    // pattern: prefer AuthCoordinator.registerServerPasskey() (real
    // navigator.credentials.create() ceremony against the real server
    // RP), and fall back to the legacy provider only if the coordinator
    // truly isn't loaded, so this panel still degrades honestly on an
    // older page rather than throwing. No new engine, no new storage —
    // reuses the exact server enroll endpoints
    // (POST /webauthn/passkeys/enroll/begin|complete), which the server
    // itself gates on "any authenticated session", not admin-only, so
    // this fix does not change who is *allowed* to enroll — it changes
    // which authority the enrollment actually reaches.
    function buildPasskeyCard(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        const provider = window.CozyOS.WebAuthnProvider;
        const coordinator = window.CozyOS.AuthCoordinator;
        const hasServerPath = !!coordinator && typeof coordinator.registerServerPasskey === "function";
        const record = store ? store.getEnrollment(userId, "security-key") : null;
        const hasCred = provider && typeof provider.hasCredential === "function" ? provider.hasCredential(userId) : false;
        const info = hasCred && typeof provider.getCredentialInfo === "function" ? provider.getCredentialInfo(userId) : null;
        return {
            factorName: "security-key", label: "Passkey (WebAuthn)", kind: "single",
            enrolled: !!record, enabled: record ? record.enabled : null,
            enrolledAt: record ? record.enrolledAt : null, lastUsedAt: record ? record.lastUsedAt : null,
            nickname: info ? info.nickname : null,
            canEnroll: !record && (hasServerPath || (!!provider && typeof provider.registerCredential === "function")),
            canRename: !!record && hasCred && !!provider && typeof provider.renameCredential === "function",
            enrollUnavailableReason: (!hasServerPath && !provider) ? "Neither AuthCoordinator.registerServerPasskey() nor the legacy WebAuthnProvider is loaded." : null,
        };
    }

    async function passkeyEnroll(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        const coordinator = window.CozyOS.AuthCoordinator;
        if (coordinator && typeof coordinator.registerServerPasskey === "function") {
            const result = await coordinator.registerServerPasskey();
            if (!result || result.available !== true) {
                return { success: false, reason: (result && result.reason) || "Passkey registration failed." };
            }
            return store.enroll(userId, "security-key", { meta: { credentialId: result.credentialId, nickname: result.nickname, source: "server" } });
        }
        const provider = window.CozyOS.WebAuthnProvider;
        if (!provider || typeof provider.registerCredential !== "function") return { success: false, reason: "Neither AuthCoordinator.registerServerPasskey() nor the legacy WebAuthnProvider is loaded." };
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
        const pending = pendingOtpEnrollments.get(userId);
        return {
            factorName: "otp", label: "Authenticator App (TOTP)", kind: "single",
            enrolled: !!record, enabled: record ? record.enabled : null,
            enrolledAt: record ? record.enrolledAt : null, lastUsedAt: record ? record.lastUsedAt : null,
            accountId, accountName: account ? account.accountName : null, issuer: account ? account.issuer : null,
            canEnroll: !record && !pending,
            pendingVerification: pending ? { secretBase32: pending.secretBase32, otpauthUri: pending.otpauthUri } : null,
            canRename: false,
            renameUnavailableReason: "No real rename/update path exists on OtpProvider (frozen; this milestone's approval covered TrustedDeviceManager and WebAuthnProvider only). Disclosed rather than faked.",
            enrollUnavailableReason: (!record && !pending) ? null : null,
        };
    }
    // Domain 2 (Security & Sign-in discovery) — real, two-step,
    // server-authoritative TOTP enrollment. Prefers
    // AuthCoordinator.beginServerTotpEnrollment() (the same server real
    // login-time MFA already trusts) over the legacy, client-only
    // OtpProvider, which never talks to that server at all. Falls back
    // to OtpProvider only when the server honestly reports no session
    // exists (requiresAuth:true) — same rule as passkeyEnroll() above.
    // Unlike Passkey's one-shot ceremony, a real server success here
    // does NOT enroll immediately: it stashes the server-issued secret
    // in pendingOtpEnrollments and returns pending:true. Only
    // otpConfirm() below, after a real completeServerTotpEnrollment()
    // success, calls AuthEnrollmentStore.enroll().
    async function otpEnroll(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        const coordinator = window.CozyOS.AuthCoordinator;
        if (coordinator && typeof coordinator.beginServerTotpEnrollment === "function") {
            const begin = await coordinator.beginServerTotpEnrollment();
            if (begin && begin.available === true) {
                pendingOtpEnrollments.set(userId, { secretBase32: begin.secretBase32, otpauthUri: begin.otpauthUri });
                return { success: true, pending: true, secretBase32: begin.secretBase32, otpauthUri: begin.otpauthUri };
            }
            if (!begin || !begin.requiresAuth) {
                return { success: false, reason: (begin && begin.reason) || "Authenticator app setup failed." };
            }
            // requiresAuth:true -> no server session for this identity -> honest fallback below.
        }
        const provider = window.CozyOS.OtpProvider;
        if (!provider || typeof provider.enrollAccount !== "function") return { success: false, reason: "Neither AuthCoordinator.beginServerTotpEnrollment() nor the legacy OtpProvider is loaded." };
        const real = provider.enrollAccount({ issuer: "CozyOS", accountName: userId });
        if (!real.success) return real;
        const stored = store.enroll(userId, "otp", { meta: { accountId: real.accountId, source: "legacy" } });
        return { ...stored, otpauthUri: real.otpauthUri, secretBase32: real.secretBase32 };
    }
    /**
     * otpConfirm(userId, code)
     *   Real server confirmation — submits the code to
     *   AuthCoordinator.completeServerTotpEnrollment(), never verified
     *   locally. Only a real server success calls
     *   AuthEnrollmentStore.enroll(); a real rejection (invalid code,
     *   expired, etc.) is relayed honestly and the pending secret is
     *   deliberately kept so the person can retry without a brand-new
     *   secret.
     */
    async function otpConfirm(userId, code) {
        const store = window.CozyOS.AuthEnrollmentStore;
        const coordinator = window.CozyOS.AuthCoordinator;
        const pending = pendingOtpEnrollments.get(userId);
        if (!pending) return { success: false, reason: "No pending authenticator app setup to confirm." };
        if (!coordinator || typeof coordinator.completeServerTotpEnrollment !== "function") return { success: false, reason: "AuthCoordinator.completeServerTotpEnrollment() is not loaded." };
        const result = await coordinator.completeServerTotpEnrollment(code);
        if (!result || result.available !== true) return { success: false, reason: (result && result.reason) || "Authenticator app confirmation failed." };
        pendingOtpEnrollments.delete(userId);
        return store.enroll(userId, "otp", { meta: { recoveryCodes: result.recoveryCodes || null, source: "server" } });
    }
    function otpCancelPending(userId) {
        pendingOtpEnrollments.delete(userId);
        return { success: true };
    }
    async function otpRemove(userId) {
        const store = window.CozyOS.AuthEnrollmentStore;
        const provider = window.CozyOS.OtpProvider;
        const record = store ? store.getEnrollment(userId, "otp") : null;
        // A server-sourced enrollment has real server-side state
        // (totp_enabled=1) that only the server can honestly clear —
        // never just delete the local record and call it "disabled".
        if (record && record.meta && record.meta.source === "server") {
            const coordinator = window.CozyOS.AuthCoordinator;
            if (!coordinator || typeof coordinator.disableServerTotp !== "function") return { success: false, reason: "AuthCoordinator.disableServerTotp() is not loaded." };
            const result = await coordinator.disableServerTotp();
            if (result.available !== true) return { success: false, reason: result.reason || "Could not disable the authenticator app." };
            const storeResult = store.removeEnrollment(userId, "otp");
            return { success: storeResult.success, reason: storeResult.success ? null : storeResult.reason };
        }
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
        if (card.pendingVerification) {
            actions.push(btn(card.factorName, "confirm", "Confirm Code"));
            actions.push(btn(card.factorName, "cancel-pending", "Cancel", true));
        }
        if (card.enrolled) {
            actions.push(btn(card.factorName, card.enabled ? "disable" : "enable", card.enabled ? "Disable" : "Enable"));
            if (card.canRename) actions.push(btn(card.factorName, "rename-prompt", "Rename"));
            actions.push(btn(card.factorName, "remove", "Remove", true));
        }
        return `
        <div class="cozy-fm-card">
            <h3>${escapeHtml(card.label)}${card.nickname ? ` — <span class="cozy-fm-nick">${escapeHtml(card.nickname)}</span>` : ""}</h3>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Status</span><span class="cozy-fm-v">${card.pendingVerification ? "Enrollment Pending — Confirm Code" : card.enrolled ? (card.enabled ? "Enrolled — Enabled" : "Enrolled — Disabled") : "Not Enrolled"}</span></div>
            ${card.enrolled ? `<div class="cozy-fm-field"><span class="cozy-fm-k">Enrolled</span><span class="cozy-fm-v">${escapeHtml(card.enrolledAt || "—")}</span></div>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Last Used</span><span class="cozy-fm-v">${escapeHtml(card.lastUsedAt || "Never")}</span></div>` : ""}
            ${card.pendingVerification ? `<div class="cozy-fm-field"><span class="cozy-fm-k">Secret (manual entry)</span><span class="cozy-fm-v">${escapeHtml(card.pendingVerification.secretBase32 || "—")}</span></div>
            <div class="cozy-fm-field"><span class="cozy-fm-k">Setup URI</span><span class="cozy-fm-v">${escapeHtml(card.pendingVerification.otpauthUri || "—")}</span></div>` : ""}
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
    async function doAction(factorName, action, deviceId, nickname, code) {
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
            if (action === "confirm") return otpConfirm(userId, code);
            if (action === "cancel-pending") return otpCancelPending(userId);
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
        if (action === "confirm") {
            const code = (typeof window.prompt === "function") ? window.prompt("Enter the 6-digit code from your authenticator app:") : null;
            if (!code) return;
            lastResult = await doAction(factorName, "confirm", deviceId, null, code);
            rerender();
            return;
        }
        if (action === "cancel-pending") {
            lastResult = await doAction(factorName, "cancel-pending");
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
