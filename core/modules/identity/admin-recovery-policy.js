/**
 * CozyOS Enterprise Framework — AdminRecoveryPolicy
 * File Reference: core/modules/identity/admin-recovery-policy.js
 * Layer: Core / Platform Coordinator — Identity & Access
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 176C
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Canonical Owner: trusted-device Administrator login, and admin
 *   session listing / forced sign-out for sessions that originate from
 *   that login path. Exactly the scope the prior stub declared — this
 *   milestone replaces the stub's fake denials with real behavior, it
 *   does not expand ownership.
 *
 *   Does NOT own — and never re-implements:
 *     ✗ Device trust, 30-day expiry, 10-minute idle-lock —
 *       TrustedDeviceManager's domain (core/security/trusted-device-
 *       manager.js). This file calls the real, already-registered
 *       "trusted-device" AuthFactorRegistry provider, which itself
 *       delegates to TrustedDeviceManager. Never re-checked here.
 *     ✗ Role verification — IdentityEngine's domain. This file calls
 *       IdentityEngine.isPlatformAdmin(userId), never reimplements a
 *       role check.
 *     ✗ Emergency Recovery Codes, Recovery Phrases, OTP, Recovery
 *       Questions, Recovery Keys, Security Keys — each already has a
 *       real, single, self-declared canonical owner
 *       (emergency-recovery-code-manager.js explicitly states "No
 *       other coordinator issues, stores, or consumes these codes";
 *       recovery-phrase-manager.js is the same pattern). This file
 *       does not call, wrap, or duplicate any of them. The
 *       Administrator Recovery Wizard (core/shell/cozy-admin-recovery-
 *       wizard.js) already independently orchestrates those methods
 *       for the password-reset flow, calling AuthFactorRegistry
 *       providers directly — by design, it does not route through
 *       this file, and this file does not route through it.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY ADMIN SESSIONS ARE TRACKED HERE, NOT IN SESSIONMANAGER
 * ═══════════════════════════════════════════════════════════════════════
 *   Verified before writing this file: core/security/session-manager.js
 *   only tracks sessions via IdentityEngine's private
 *   "identity:session-created" event, which fires exclusively from
 *   IdentityEngine.login() (the password path). A trusted-device login
 *   never calls IdentityEngine.login(), so SessionManager structurally
 *   cannot see it. This file's own header (both before and after this
 *   milestone) declares "admin session listing" as its canonical
 *   ownership — this is that real, previously-unfilled gap, not a
 *   duplicate of SessionManager's idle-timeout/device-binding/bulk-
 *   operation responsibilities, none of which are touched here.
 *
 * KNOWN, CARRIED-FORWARD GAP
 *   forceSignOutAllSessions(userId, exceptSessionId) accepts the
 *   documented optional second parameter, but its one live caller
 *   (core/modules/identity/auth-coordinator.js) has never passed it —
 *   confirmed by reading that file before this one was written. That
 *   caller's own header still documents this as a known limitation.
 *   Unchanged by this milestone.
 *
 * FAIL-CLOSED CONTRACT
 *   Every method fails closed with a real, stated reason on a missing
 *   dependency, an unrecognized user/device, or a failed verification.
 *   No fake authentication. No fabricated session. No new recovery
 *   method implemented here.
 */
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    const ADMIN_RECOVERY_POLICY_VERSION = "1.0.0-ENTERPRISE";

    class CozyAdminRecoveryPolicy {
        #sessions = new Map(); // sessionId -> { id, userId, deviceId, authMode, revoked, revokedReason, since }
        #history = [];

        #deepClone(v) {
            if (typeof structuredClone === "function") { try { return structuredClone(v); } catch (_e) { /* fall through */ } }
            try { return JSON.parse(JSON.stringify(v)); } catch (_e2) { return v; }
        }
        #logHistory(event, detail) {
            this.#history.push({ event, at: new Date().toISOString(), detail: this.#deepClone(detail) });
            if (this.#history.length > 200) this.#history.shift();
        }
        #emit(eventName, detail) {
            if (window.CozyOS.PlatformEventBus && typeof window.CozyOS.PlatformEventBus.emit === "function") {
                try { window.CozyOS.PlatformEventBus.emit(`adminrecovery:${eventName}`, detail); } catch (_err) { /* non-fatal */ }
            }
        }

        getVersion() { return ADMIN_RECOVERY_POLICY_VERSION; }
        getHistory() { return this.#deepClone(this.#history); }

        // ---- delegation accessors (never cached — always the live global) ----
        #identity() { return window.CozyOS.IdentityEngine || null; }
        #factorRegistry() { return window.CozyOS.AuthFactorRegistry || null; }
        #trustedDeviceManager() { return window.CozyOS.TrustedDeviceManager || null; }

        /**
         * attemptNormalLogin({ userId, deviceId })
         *   Real trusted-device Administrator login. Verifies the caller
         *   is a real platform administrator (IdentityEngine.isPlatformAdmin),
         *   then delegates the actual device-trust decision entirely to
         *   the already-real "trusted-device" AuthFactorRegistry provider
         *   (ownership + 30-day trust + 10-minute idle-lock, all owned
         *   and checked by TrustedDeviceManager). On success, records a
         *   real local admin-recovery session (this file's own declared
         *   ownership — see file header) and returns its id. Never
         *   grants on a missing dependency, an unrecognized device, or a
         *   failed factor check.
         */
        async attemptNormalLogin({ userId, deviceId } = {}) {
            if (!userId || !deviceId) return { granted: false, reason: "userId and deviceId are both required." };

            const identity = this.#identity();
            if (!identity || typeof identity.isPlatformAdmin !== "function") {
                return { granted: false, reason: "IdentityEngine is not loaded — cannot verify administrator role. Failing closed." };
            }
            if (!identity.isPlatformAdmin(userId)) {
                return { granted: false, reason: "This user is not a platform administrator." };
            }

            const registry = this.#factorRegistry();
            if (!registry || typeof registry.getProvider !== "function") {
                return { granted: false, reason: "AuthFactorRegistry is not loaded — cannot verify trusted device. Failing closed." };
            }
            const provider = registry.getProvider("trusted-device");
            if (!provider || typeof provider.verify !== "function") {
                return { granted: false, reason: "trusted-device factor provider is not registered. Failing closed." };
            }

            let result;
            try { result = await provider.verify({ userId, deviceId }); }
            catch (err) { return { granted: false, reason: `trusted-device verification threw: ${err.message}` }; }

            if (!result || !result.verified) {
                return { granted: false, reason: (result && result.reason) || "trusted-device verification failed." };
            }

            const tdm = this.#trustedDeviceManager();
            if (tdm && typeof tdm.touchDevice === "function") {
                try { tdm.touchDevice(deviceId); } catch (_err) { /* non-fatal — verification already succeeded */ }
            }

            const sessionId = `adminrec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            const session = {
                id: sessionId, userId, deviceId, authMode: "trusted-device",
                revoked: false, revokedReason: null, since: new Date().toISOString()
            };
            this.#sessions.set(sessionId, session);
            this.#logHistory("login-granted", { sessionId, userId, deviceId });
            this.#emit("login-granted", { sessionId, userId, deviceId });

            return { granted: true, mode: "trusted-device", session: { id: sessionId } };
        }

        /**
         * listAdminSessions(userId)
         *   Real listing of this file's own tracked admin-recovery
         *   sessions for a user. Never fabricates a session — an empty
         *   result genuinely means no trusted-device-originated session
         *   exists for that user.
         */
        listAdminSessions(userId) {
            return [...this.#sessions.values()]
                .filter(s => s.userId === userId)
                .map(s => this.#deepClone(s));
        }

        /**
         * forceSignOutAllSessions(userId, exceptSessionId)
         *   Real revoke of every tracked admin-recovery session for a
         *   user. exceptSessionId is accepted per the documented
         *   interface but, consistent with the caller's own disclosed
         *   gap (see file header), is only honored when explicitly
         *   passed — the one live caller today never passes it, so
         *   real-world behavior is unchanged by this milestone.
         */
        forceSignOutAllSessions(userId, exceptSessionId = null) {
            let revokedCount = 0;
            for (const session of this.#sessions.values()) {
                if (session.userId === userId && !session.revoked && session.id !== exceptSessionId) {
                    session.revoked = true;
                    session.revokedReason = "Forced sign-out by administrator.";
                    revokedCount++;
                }
            }
            this.#logHistory("forced-sign-out", { userId, exceptSessionId, revokedCount });
            this.#emit("forced-sign-out", { userId, exceptSessionId, revokedCount });
            return { success: true, revokedCount };
        }

        /**
         * getRecoveryMethodsHealth()
         *   Read-only presence + diagnostics relay for every canonical
         *   recovery-related component in the repository — not a new
         *   recovery flow, not a merge of their data. Each section
         *   reports { available: false, reason } rather than fabricating
         *   data when a dependency is absent.
         */
        getRecoveryMethodsHealth() {
            const section = (mod, name) => {
                if (!mod) return { available: false, reason: `${name} is not loaded.` };
                if (typeof mod.getDiagnosticsReport === "function") {
                    try { return { available: true, diagnostics: this.#deepClone(mod.getDiagnosticsReport()) }; }
                    catch (_err) { return { available: true, diagnostics: null, reason: `${name}.getDiagnosticsReport() threw.` }; }
                }
                return { available: true, diagnostics: null };
            };

            return {
                generatedAt: new Date().toISOString(),
                dependencies: {
                    TrustedDeviceManager: section(this.#trustedDeviceManager(), "TrustedDeviceManager"),
                    AuthFactorRegistry: section(this.#factorRegistry(), "AuthFactorRegistry"),
                    IdentityEngine: section(this.#identity(), "IdentityEngine"),
                    EmergencyRecoveryCodeManager: section(window.CozyOS.EmergencyRecoveryCodeManager || null, "EmergencyRecoveryCodeManager"),
                    RecoveryPhraseManager: section(window.CozyOS.RecoveryPhraseManager || null, "RecoveryPhraseManager"),
                    OtpProvider: section(window.CozyOS.OtpProvider || null, "OtpProvider")
                }
            };
        }

        getDiagnosticsReport() {
            return this.#deepClone({
                moduleVersion: ADMIN_RECOVERY_POLICY_VERSION,
                trackedSessions: this.#sessions.size,
                historyEntries: this.#history.length
            });
        }
    }

    if (window.CozyOS.AdminRecoveryPolicy && typeof window.CozyOS.AdminRecoveryPolicy.getVersion === "function") {
        const existingVersion = window.CozyOS.AdminRecoveryPolicy.getVersion();
        if (existingVersion !== ADMIN_RECOVERY_POLICY_VERSION) throw new Error(`[CozyOS] VERSION_CONFLICT: AdminRecoveryPolicy existing v${existingVersion} conflicts with load target v${ADMIN_RECOVERY_POLICY_VERSION}.`);
        return;
    }

    window.CozyOS.AdminRecoveryPolicy = new CozyAdminRecoveryPolicy();

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                name: "AdminRecoveryPolicy", category: "Platform", icon: "shield-check.svg",
                description: "Real trusted-device Administrator login and admin-recovery session listing/forced-sign-out — replacing the prior 0.0.1 stub. Delegates device trust entirely to the real AuthFactorRegistry \"trusted-device\" provider (TrustedDeviceManager-backed) and role checks to IdentityEngine.isPlatformAdmin(). Does not issue, store, or verify recovery codes, phrases, OTP, questions, or keys — each of those remains owned by its own canonical file."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
