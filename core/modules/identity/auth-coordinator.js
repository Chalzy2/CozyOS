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
    const COORDINATOR_VERSION = "1.2.0-ENTERPRISE"; // Milestone 352: loginWithBiometrics()
    const STORAGE_KEY = "cozyos.authCoordinator.session";

    function safeLocalStorage() {
        try { return (typeof window !== "undefined" && window.localStorage) ? window.localStorage : null; }
        catch (_err) { return null; }
    }
    function safeSessionStorage() {
        try { return (typeof window !== "undefined" && window.sessionStorage) ? window.sessionStorage : null; }
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

        /**
         * Remember Me (Milestone 125a): rememberMe=true persists to
         * localStorage (survives browser restart, prior default
         * behavior, unchanged). rememberMe=false persists to
         * sessionStorage only (cleared when the tab/browser closes).
         * Clearing always clears both, so stale pointers never linger
         * in the storage that wasn't actively used.
         */
        #persistPointer(pointer, rememberMe = true) {
            const ls = safeLocalStorage(); const ss = safeSessionStorage();
            try {
                if (pointer) {
                    if (rememberMe) { if (ls) ls.setItem(STORAGE_KEY, JSON.stringify(pointer)); if (ss) ss.removeItem(STORAGE_KEY); }
                    else { if (ss) ss.setItem(STORAGE_KEY, JSON.stringify(pointer)); if (ls) ls.removeItem(STORAGE_KEY); }
                } else {
                    if (ls) ls.removeItem(STORAGE_KEY);
                    if (ss) ss.removeItem(STORAGE_KEY);
                }
                return true;
            } catch (_err) { return false; }
        }
        // Real bug fix (M387.5c, RP-015): tags which storage the pointer
        // actually came from (_rememberMe), so a later re-persist (see
        // restoreSession()'s trusted-pointer fallback) can preserve the
        // user's real original choice instead of silently defaulting to
        // rememberMe=true on every page load/navigation.
        #readPointer() {
            const ls = safeLocalStorage(); const ss = safeSessionStorage();
            try {
                const rawLocal = ls ? ls.getItem(STORAGE_KEY) : null;
                if (rawLocal) { const p = JSON.parse(rawLocal); p._rememberMe = true; return p; }
                const rawSession = ss ? ss.getItem(STORAGE_KEY) : null;
                if (rawSession) { const p = JSON.parse(rawSession); p._rememberMe = false; return p; }
                return null;
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
        async loginWithCredentials(username, password, { rememberMe = true } = {}) {
            this.#diagnostics.credentialLoginAttempts++;
            const identity = this.#identity();
            if (!identity) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: "IdentityEngine is not loaded — cannot authenticate. Failing closed." }; }

            const result = await identity.login(username, password);
            if (!result.available) { this.#diagnostics.credentialLoginFailures++; return result; }

            // M373 — real MFA gate pass-through: IdentityEngine.login()
            // now returns requiresOtp:true instead of a sessionId when
            // the user has an enrolled OTP account. No session exists
            // yet - this coordinator does NOT attempt establishFromIdentity()
            // (there is no real sessionId to establish from) and instead
            // returns the pending state directly to the caller, which
            // must call completeLoginWithOtp() below with a real code.
            if (result.requiresOtp) {
                return { available: true, requiresOtp: true, challengeToken: result.challengeToken, pendingAccountId: result.pendingAccountId, rememberMe: !!rememberMe };
            }

            const session = this.#session();
            if (session) {
                try { session.establishFromIdentity(result.sessionId); }
                catch (err) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: `Session establishment failed: ${err.message}` }; }
            }

            this.#persistPointer({ source: "identity", sessionId: result.sessionId, userId: result.userId, since: new Date().toISOString() }, !!rememberMe);
            this.#diagnostics.credentialLoginSuccesses++;
            return { available: true, source: "identity", sessionId: result.sessionId, userId: result.userId, roles: result.roles };
        }

        /**
         * completeLoginWithOtp(challengeToken, code, {rememberMe})
         *   M373.1 — real second step, now bound to a signed, short-lived
         *   challenge token (not a bare userId), composing IdentityEngine's
         *   own completeLoginWithOtp() (real TOTP + recovery-code
         *   verification, real challenge validation) and only THEN doing
         *   the exact same real session establishment + Remember Me
         *   pointer persistence loginWithCredentials() already does above.
         */
        async completeLoginWithOtp(challengeToken, code, { rememberMe = true } = {}) {
            this.#diagnostics.credentialLoginAttempts++;
            const identity = this.#identity();
            if (!identity || typeof identity.completeLoginWithOtp !== "function") { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: "IdentityEngine is not loaded — cannot verify the second factor. Failing closed." }; }

            const result = await identity.completeLoginWithOtp(challengeToken, code);
            if (!result.available) { this.#diagnostics.credentialLoginFailures++; return result; }

            const session = this.#session();
            if (session) {
                try { session.establishFromIdentity(result.sessionId); }
                catch (err) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: `Session establishment failed: ${err.message}` }; }
            }

            this.#persistPointer({ source: "identity", sessionId: result.sessionId, userId: result.userId, since: new Date().toISOString() }, !!rememberMe);
            this.#diagnostics.credentialLoginSuccesses++;
            return { available: true, source: "identity", sessionId: result.sessionId, userId: result.userId, roles: result.roles };
        }

        /**
         * getLoginHistory(username) — real passthrough to IdentityEngine's
         * existing audit log (no separate history store). Filters to
         * login-relevant actions for the given username only.
         */
        getLoginHistory(username) {
            const identity = this.#identity();
            if (!identity) return { available: false, reason: "IdentityEngine is not loaded.", entries: [] };
            const actions = new Set(["LOGIN_SUCCESS", "LOGIN_FAILED", "LOGIN_BLOCKED_LOCKED", "ACCOUNT_LOCKED", "LOGOUT", "PASSWORD_CHANGED", "PASSWORD_RESET"]);
            const entries = identity.getAuditLog(e => actions.has(e.action) && e.msg === username);
            return { available: true, entries };
        }

        /**
         * changePassword(username, oldPassword, newPassword) — thin
         * passthrough. IdentityEngine owns verification/hashing; this
         * coordinator never re-implements it.
         */
        async changePassword(username, oldPassword, newPassword) {
            const identity = this.#identity();
            if (!identity) return { available: false, reason: "IdentityEngine is not loaded — cannot change password. Failing closed." };
            return identity.changePassword(username, oldPassword, newPassword);
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
         * loginWithBiometrics({ userId, deviceId })
         *   Milestone 352 — real Biometric Sign-In path. Same shape as
         *   loginWithTrustedDevice() immediately above (same session
         *   establishment, same pointer persistence), but delegates to
         *   AdminRecoveryPolicy.attemptBiometricLogin() — which itself
         *   composes the already-real "trusted-device" AND "security-key"
         *   AuthFactorRegistry providers. This coordinator still never
         *   re-implements device trust or WebAuthn verification; it only
         *   sequences the already-verified result into CozyOS.Session,
         *   exactly as its one declared job is.
         */
        async loginWithBiometrics({ userId, deviceId } = {}) {
            this.#diagnostics.trustedDeviceLoginAttempts++;
            const policy = this.#recoveryPolicy();
            if (!policy || typeof policy.attemptBiometricLogin !== "function") {
                this.#diagnostics.trustedDeviceLoginFailures++;
                return { granted: false, reason: "AdminRecoveryPolicy is not loaded or does not support biometric login yet. Failing closed." };
            }

            const result = await policy.attemptBiometricLogin({ userId, deviceId });
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
                let validation = identity.validateSession(pointer.sessionId);
                if (!validation.valid && validation.reason === "Session not found." && typeof identity.restoreSessionForTrustedPointer === "function") {
                    // Milestone 203, real verified gap fix: IdentityEngine's
                    // #sessions is in-memory only and never survives a real
                    // page reload, unlike this real, persisted pointer. A
                    // missing session here does not mean the pointer is
                    // stale — it means the browser genuinely reloaded.
                    // Mint a fresh, real session for the still-valid user
                    // rather than forcing a full re-login.
                    const restoreResult = identity.restoreSessionForTrustedPointer(pointer.userId);
                    if (restoreResult.available) {
                        this.#persistPointer({ source: "identity", sessionId: restoreResult.sessionId, userId: restoreResult.userId, since: new Date().toISOString() }, pointer._rememberMe !== false);
                        try { session.establishFromIdentity(restoreResult.sessionId); }
                        catch (err) { this.#persistPointer(null); this.#diagnostics.restoreFailures++; return { restored: false, reason: err.message }; }
                        this.#diagnostics.restoreSuccesses++;
                        return { restored: true, source: "identity", userId: restoreResult.userId };
                    }
                }
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
            // Milestone 200D: real, verified root cause of the silent
            // login failure — CozyOS.Auth's actual real method is
            // getCurrentAdministrator(), not getCurrentIdentity(). This
            // was a genuine method-name mismatch, confirmed by executing
            // the real code and reading the actual thrown error.
            return auth ? auth.getCurrentAdministrator() : null;
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
     * MILESTONE 176A — COMPATIBILITY-ALIAS BLOCK REMOVED
     * ------------------------------------------------------------------ *
     * A prior "bind once the real engines exist" fallback used to live
     * here, aliasing window.CozyOS.SessionManager -> window.CozyOS.Session
     * and window.CozyOS.TrustedDeviceManager -> window.CozyOS.AdminRecoveryPolicy
     * whenever the real SessionManager/TrustedDeviceManager weren't yet
     * registered at the moment this file executed.
     *
     * Gate 1 of Milestone 176 traced a real, confirmed conflict this
     * caused: core/security/session-manager.js was never loaded by
     * dashboard.html at all, and core/security/trusted-device-manager.js
     * loads after this file — so the fallback always won first, aliasing
     * both globals to the wrong real objects (window.CozyOS.Session, a
     * different file with a different API; and AdminRecoveryPolicy, an
     * explicitly self-declared stub). trusted-device-manager.js's own
     * version guard then read the stub's getVersion() ("0.0.1-STUB") and
     * threw VERSION_CONFLICT on load, so the real CozyTrustedDeviceManager
     * was never constructed. window.CozyOS.SessionManager stayed aliased
     * to CozyOS.Session permanently, since nothing else was checking or
     * correcting it once bound.
     *
     * Both dependencies now have real, canonical, loaded implementations
     * on this page (core/security/session-manager.js — added this
     * milestone — and core/security/trusted-device-manager.js, already
     * present). A same-page guessing fallback for either is therefore
     * obsolete, and removing it — rather than reordering scripts around
     * it — closes the conflict permanently regardless of any future
     * script-order change on this page.
     * ------------------------------------------------------------------ */

    // Auto-restore on load — real, bounded retry: if IdentityEngine or
    // Session aren't ready yet, retries every 200ms up to 15 times (3s
    // total) before giving up silently (isAuthenticated() stays false,
    // matching fail-closed default). M372 — real fix: this comment
    // previously claimed this exact retry behavior already existed,
    // but the code only ever called tryRestore() once - confirmed by
    // reading it before this was written. Genuine defense-in-depth on
    // top of this same milestone's real root-cause fix (the missing
    // cozy-session-service.js script tag on login.html/index.html).
    //
    // Real bug fix (M387.5c, RP-014): this used to call restoreSession()
    // the moment `identity`/`session` merely EXISTED as objects — both are
    // assigned synchronously near-instantly on script load, well before
    // IdentityEngine.restorePersistedUsers() (which reads real users back
    // from IndexedDB) has actually finished. On a real page reload that
    // race meant restoreSession() ran against an empty #users map, its
    // trusted-pointer fallback correctly reported "no such user," and its
    // otherwise-correct stale-pointer cleanup then deleted a genuinely
    // valid "Remember Me" pointer — confirmed via a live runtime tracer,
    // see RP-014 in docs/builder/knowledge/repair-history-registry.md.
    // Fix: once both objects exist, also await identity.ready (the same
    // promise IdentityEngine itself exposes at module load,
    // IdentityEngine.ready = IdentityEngine.restorePersistedUsers())
    // before calling restoreSession() — same real signal, not a new one.
    if (typeof window !== "undefined") {
        let restoreAttempts = 0;
        const tryRestore = async () => {
            const identity = window.CozyOS && window.CozyOS.IdentityEngine;
            const session = window.CozyOS && window.CozyOS.Session;
            if ((!identity || !session) && restoreAttempts < 15) {
                restoreAttempts++;
                setTimeout(tryRestore, 200);
                return;
            }
            if (identity && identity.ready && typeof identity.ready.then === "function") {
                try { await identity.ready; } catch (_err) { /* honest no-op — restoreSession() below still fails closed if users truly never loaded */ }
            }
            window.CozyOS.AuthCoordinator.restoreSession();
        };
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
    })({ sourcePath: "core/modules/identity/auth-coordinator.js",
        name: "AuthCoordinator",
        category: "Foundation",
        icon: "identity.svg",
        description: "Thin orchestration only: Administrator Login end-to-end (credentials via IdentityEngine, or trusted-device via AdminRecoveryPolicy), reload persistence/restoration, and logout — composing IdentityEngine, CozyOS.Auth, CozyOS.Session, and AdminRecoveryPolicy without duplicating any of them."
    });
})();
