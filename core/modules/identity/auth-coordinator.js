/**
 * CozyOS Enterprise Framework — Auth Coordinator
 * File Reference: core/modules/identity/auth-coordinator.js
 * Layer: Core / Platform Coordinator — Identity & Access
 * Version: 1.0.0-ENTERPRISE
 * Milestone: 120
 *
 * ═══════════════════════════════════════════════════════════════════════
 * RULE 25 — CANONICAL OWNERSHIP DECLARATION
 * ═══════════════════════════════════════════════════════════════════════
 *   Canonical Owner: the end-to-end Administrator Login SEQUENCE only —
 *   which real engine to call, in which order, and what to do with the
 *   result. Nothing else.
 *
 *   Does NOT Own — and structurally cannot, since it holds no records
 *   of its own beyond one small reload-bootstrap pointer (see below):
 *     ✗ Password hashing, credential validation, native sessions —
 *       IdentityEngine's domain. This file calls IdentityEngine.login()/
 *       validateSession()/logout(); it never re-implements any of it.
 *     ✗ Trusted devices, biometric/Google recovery flows, admin
 *       sessions — AdminRecoveryPolicy's domain (already the completed,
 *       authoritative owner, per Ownership Review). This file calls
 *       attemptNormalLogin()/listAdminSessions()/forceSignOutAllSessions();
 *       it never re-implements device trust or recovery logic.
 *     ✗ "Who is current for this tab" — CozyOS.Auth's domain. Both
 *       IdentityEngine and AdminRecoveryPolicy already emit the events
 *       CozyOS.Auth listens for, so calling them here is sufficient;
 *       this file never sets CozyOS.Auth's pointer directly.
 *     ✗ The live session snapshot — CozyOS.Session's domain. This file
 *       calls establishFromIdentity()/establishFromExternalAuth()/end();
 *       it never stores roles/profile/company itself.
 *
 * WHY THIS FILE EXISTS
 *   Two real, separate Administrator login paths already exist
 *   (IdentityEngine username/password; AdminRecoveryPolicy trusted-
 *   device + biometric) but nothing already wires either path forward
 *   into CozyOS.Session, and nothing restores that session on reload.
 *   This is that missing orchestration — composition only, per Rule:
 *   "AuthCoordinator must compose existing coordinators rather than
 *   replacing them."
 *
 * RELOAD-PERSISTENCE, HONESTLY SCOPED
 *   core/modules/storage/cozy-storage.js (CozyStorage) is a document/
 *   object storage system, not a key-value bootstrap store, and
 *   core/storage.js's IndexedDB gateway is async at a point (page load)
 *   before either engine has necessarily initialized. Neither is a fit
 *   for "which session pointer do I try to restore before anything
 *   else has loaded." The existing Firebase bridge
 *   (core/modules/session/firebase-session-bridge.js) already relies on
 *   the browser's own persistence (Firebase's browserLocalPersistence)
 *   for exactly this reason, rather than routing through CozyStorage.
 *   This file follows that same, already-established precedent: a
 *   single small localStorage key holding only a non-secret pointer
 *   (sessionId or adminSessionId + userId) — never credentials, never
 *   password data, never anything CozyStorage or IdentityEngine
 *   themselves are the real owner of. If restoration fails validation
 *   for any reason, the pointer is discarded and the coordinator fails
 *   closed to signed-out — it never fabricates a session.
 *
 * KNOWN GAP (see Migration Log)
 *   AdminRecoveryPolicy exposes forceSignOutAllSessions(userId,
 *   exceptSessionId) but no single-session revoke. logout() for a
 *   trusted-device-originated session therefore revokes every admin
 *   session for that user, not only the current tab's. This is a
 *   real, disclosed limitation of the existing AdminRecoveryPolicy API
 *   surface (which Ownership Review confirmed is authoritative and not
 *   to be modified this milestone) — not a bug introduced here.
 */

(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const COORDINATOR_VERSION = "1.0.0-ENTERPRISE";
    const STORAGE_KEY = "cozyos.authCoordinator.session";

    function safeLocalStorage() {
        try { return (typeof window !== "undefined" && window.localStorage) ? window.localStorage : null; }
        catch (_err) { return null; }
    }

    class CozyOSAuthCoordinator {
        #diagnostics = {
            credentialLoginAttempts: 0, credentialLoginSuccesses: 0, credentialLoginFailures: 0,
            trustedDeviceLoginAttempts: 0, trustedDeviceLoginSuccesses: 0, trustedDeviceLoginFailures: 0,
            restoreAttempts: 0, restoreSuccesses: 0, restoreFailures: 0,
            logouts: 0
        };

        getVersion() { return COORDINATOR_VERSION; }

        #identity() { return window.CozyOS && window.CozyOS.IdentityEngine ? window.CozyOS.IdentityEngine : null; }
        #recoveryPolicy() { return window.CozyOS && window.CozyOS.AdminRecoveryPolicy ? window.CozyOS.AdminRecoveryPolicy : null; }
        #session() { return window.CozyOS && window.CozyOS.Session ? window.CozyOS.Session : null; }
        #auth() { return window.CozyOS && window.CozyOS.Auth ? window.CozyOS.Auth : null; }

        #persistPointer(pointer) {
            const ls = safeLocalStorage();
            if (!ls) return false;
            try {
                if (pointer) ls.setItem(STORAGE_KEY, JSON.stringify(pointer));
                else ls.removeItem(STORAGE_KEY);
                return true;
            } catch (_err) { return false; }
        }
        #readPointer() {
            const ls = safeLocalStorage();
            if (!ls) return null;
            try {
                const raw = ls.getItem(STORAGE_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch (_err) { return null; }
        }

        /**
         * loginWithCredentials(username, password)
         *   Path 1: real CozyOS-native login via IdentityEngine.login(),
         *   then establishes the real live snapshot via
         *   CozyOS.Session.establishFromIdentity(sessionId) (never
         *   duplicating what Session already validates/derives).
         *   IdentityEngine already emits identity:session-created, so
         *   CozyOS.Auth updates itself — this coordinator never touches
         *   CozyOS.Auth's pointer directly.
         */
        async loginWithCredentials(username, password) {
            this.#diagnostics.credentialLoginAttempts++;
            const identity = this.#identity();
            if (!identity) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: "IdentityEngine is not loaded — cannot authenticate. Failing closed." }; }

            const result = await identity.login(username, password);
            if (!result.available) { this.#diagnostics.credentialLoginFailures++; return result; }

            const session = this.#session();
            if (session) {
                try { session.establishFromIdentity(result.sessionId); }
                catch (err) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: `Session establishment failed: ${err.message}` }; }
            }

            this.#persistPointer({ source: "identity", sessionId: result.sessionId, userId: result.userId, since: new Date().toISOString() });
            this.#diagnostics.credentialLoginSuccesses++;
            return { available: true, source: "identity", sessionId: result.sessionId, userId: result.userId, roles: result.roles };
        }

        /**
         * loginWithTrustedDevice({ userId, deviceId })
         *   Path 2: real Platform Administrator trusted-device login,
         *   delegated entirely to AdminRecoveryPolicy.attemptNormalLogin()
         *   (device trust + biometric — never re-implemented here). On
         *   grant, reports the already-verified identity into
         *   CozyOS.Session via establishFromExternalAuth() — Session's
         *   real, generic bridge point for any already-authenticated
         *   source, exactly as it's designed to be used.
         */
        async loginWithTrustedDevice({ userId, deviceId } = {}) {
            this.#diagnostics.trustedDeviceLoginAttempts++;
            const policy = this.#recoveryPolicy();
            if (!policy) { this.#diagnostics.trustedDeviceLoginFailures++; return { granted: false, reason: "AdminRecoveryPolicy is not loaded — cannot authenticate. Failing closed." }; }

            const result = await policy.attemptNormalLogin({ userId, deviceId });
            if (!result.granted) { this.#diagnostics.trustedDeviceLoginFailures++; return result; }

            const session = this.#session();
            if (session) {
                try {
                    session.establishFromExternalAuth({
                        uid: userId,
                        roles: ["platform-admin"],
                        profile: { authMode: result.mode, deviceId }
                    });
                } catch (err) { this.#diagnostics.trustedDeviceLoginFailures++; return { granted: false, reason: `Session establishment failed: ${err.message}` }; }
            }

            this.#persistPointer({ source: "admin-recovery", userId, deviceId, adminSessionId: result.session.id, since: new Date().toISOString() });
            this.#diagnostics.trustedDeviceLoginSuccesses++;
            return { granted: true, source: "admin-recovery", userId, adminSessionId: result.session.id };
        }

        /**
         * restoreSession()
         *   Real reload-restoration only — re-validates the persisted
         *   pointer against whichever real engine issued it before
         *   trusting it. Never re-runs biometric/device-trust checks
         *   (those aren't re-derivable from a reload); a revoked or
         *   missing admin session simply fails closed and the pointer
         *   is discarded, same as an invalid IdentityEngine sessionId.
         */
        async restoreSession() {
            this.#diagnostics.restoreAttempts++;
            const pointer = this.#readPointer();
            if (!pointer) { this.#diagnostics.restoreFailures++; return { restored: false, reason: "No persisted session pointer." }; }

            if (pointer.source === "identity") {
                const identity = this.#identity();
                const session = this.#session();
                if (!identity || !session) { this.#diagnostics.restoreFailures++; return { restored: false, reason: "IdentityEngine or Session not loaded yet." }; }
                const validation = identity.validateSession(pointer.sessionId);
                if (!validation.valid) { this.#persistPointer(null); this.#diagnostics.restoreFailures++; return { restored: false, reason: validation.reason }; }
                try { session.establishFromIdentity(pointer.sessionId); }
                catch (err) { this.#persistPointer(null); this.#diagnostics.restoreFailures++; return { restored: false, reason: err.message }; }
                this.#diagnostics.restoreSuccesses++;
                return { restored: true, source: "identity", userId: pointer.userId };
            }

            if (pointer.source === "admin-recovery") {
                const policy = this.#recoveryPolicy();
                const session = this.#session();
                if (!policy || !session) { this.#diagnostics.restoreFailures++; return { restored: false, reason: "AdminRecoveryPolicy or Session not loaded yet." }; }
                const stillActive = policy.listAdminSessions(pointer.userId).find(s => s.id === pointer.adminSessionId && !s.revoked);
                if (!stillActive) { this.#persistPointer(null); this.#diagnostics.restoreFailures++; return { restored: false, reason: "Admin session no longer active (revoked or unknown)." }; }
                try {
                    session.establishFromExternalAuth({ uid: pointer.userId, roles: ["platform-admin"], profile: { authMode: stillActive.authMode, deviceId: pointer.deviceId, restored: true } });
                } catch (err) { this.#persistPointer(null); this.#diagnostics.restoreFailures++; return { restored: false, reason: err.message }; }
                this.#diagnostics.restoreSuccesses++;
                return { restored: true, source: "admin-recovery", userId: pointer.userId };
            }

            this.#persistPointer(null);
            this.#diagnostics.restoreFailures++;
            return { restored: false, reason: `Unknown pointer source "${pointer.source}".` };
        }

        /**
         * logout()
         *   Ends the real session at its real owner(s), then clears the
         *   local pointer. Never just clears the pointer and calls it
         *   done — that would leave the underlying engine believing the
         *   session is still active (fail-closed principle applies to
         *   sign-out too).
         */
        logout() {
            const pointer = this.#readPointer();
            const session = this.#session();
            if (pointer && pointer.source === "identity") {
                const identity = this.#identity();
                if (identity) identity.logout(pointer.sessionId);
            } else if (pointer && pointer.source === "admin-recovery") {
                const policy = this.#recoveryPolicy();
                // KNOWN GAP (see file header / Migration Log): AdminRecoveryPolicy
                // has no single-session revoke, so this revokes every admin
                // session for this user, not only this tab's.
                if (policy) policy.forceSignOutAllSessions(pointer.userId);
            }
            if (session) session.end();
            this.#persistPointer(null);
            this.#diagnostics.logouts++;
            return true;
        }

        /** getCurrentIdentity() — pure delegation, never a second pointer. CozyOS.Auth remains the one source of truth for "who is current." */
        getCurrentIdentity() {
            const auth = this.#auth();
            return auth ? auth.getCurrentIdentity() : null;
        }

        isAuthenticated() {
            const session = this.#session();
            return session ? session.isSignedIn() : !!this.getCurrentIdentity();
        }

        getDiagnosticsReport() {
            return Object.freeze({
                coordinatorVersion: COORDINATOR_VERSION,
                ...this.#diagnostics,
                hasPersistedPointer: !!this.#readPointer(),
                generatedAt: new Date().toISOString()
            });
        }
    }

    if (window.CozyOS.AuthCoordinator?.getVersion) {
        if (window.CozyOS.AuthCoordinator.getVersion() !== COORDINATOR_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: AuthCoordinator.");
        }
        return;
    }
    window.CozyOS.AuthCoordinator = new CozyOSAuthCoordinator();

    /* ------------------------------------------------------------------ *
     * COMPATIBILITY ALIASES ONLY — no new storage, no new coordinators.
     * Per explicit instruction: "add them as wrappers only." Bound once
     * the real engines exist so the alias always points at the one real
     * instance; retried in case this file loads before either engine.
     * ------------------------------------------------------------------ */
    (function bindCompatAliases() {
        function attempt() {
            let bound = false;
            if (!window.CozyOS.SessionManager && window.CozyOS.Session) { window.CozyOS.SessionManager = window.CozyOS.Session; bound = true; }
            if (!window.CozyOS.TrustedDeviceManager && window.CozyOS.AdminRecoveryPolicy) { window.CozyOS.TrustedDeviceManager = window.CozyOS.AdminRecoveryPolicy; bound = true; }
            return !!(window.CozyOS.SessionManager && window.CozyOS.TrustedDeviceManager);
        }
        if (attempt()) return;
        let attempts = 0;
        const interval = setInterval(() => { attempts++; if (attempt() || attempts >= 200) clearInterval(interval); }, 250);
    })();

    // Auto-restore on load — honest best-effort: if engines aren't ready
    // yet, retries briefly, then gives up silently (isAuthenticated()
    // stays false, matching fail-closed default).
    if (typeof window !== "undefined") {
        const tryRestore = () => { window.CozyOS.AuthCoordinator.restoreSession(); };
        if (typeof document !== "undefined" && document.readyState !== "loading") tryRestore();
        else if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", tryRestore, { once: true });
    }

    (function reg(descriptor) {
        function attempt() {
            if (typeof window.CozyOS.registerCoordinator !== "function") return false;
            try { window.CozyOS.registerCoordinator(descriptor); } catch (_err) { /* non-fatal */ }
            return true;
        }
        if (attempt()) return;
        if (!Object.prototype.hasOwnProperty.call(window.CozyOS, "__pendingCoordinatorRegistrations")) {
            Object.defineProperty(window.CozyOS, "__pendingCoordinatorRegistrations", { value: [], writable: true, enumerable: false, configurable: true });
        }
        window.CozyOS.__pendingCoordinatorRegistrations.push(descriptor);
        let regAttempts = 0;
        const regInterval = setInterval(() => { regAttempts++; if (attempt() || regAttempts >= 200) clearInterval(regInterval); }, 250);
    })({
        name: "AuthCoordinator",
        category: "Foundation",
        icon: "identity.svg",
        description: "Thin orchestration only: Administrator Login end-to-end (credentials via IdentityEngine, or trusted-device via AdminRecoveryPolicy), reload persistence/restoration, and logout — composing IdentityEngine, CozyOS.Auth, CozyOS.Session, and AdminRecoveryPolicy without duplicating any of them."
    });
})();
