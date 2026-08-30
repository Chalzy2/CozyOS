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
    const COORDINATOR_VERSION = "1.7.0-ENTERPRISE"; // Portion 2e: registerServerPasskey() — the real, server-authoritative Passkey ENROLLMENT ceremony (POST /webauthn/passkeys/enroll/begin -> navigator.credentials.create() -> POST /webauthn/passkeys/enroll/complete; the real server RP is the sole verification authority, never the legacy client-side WebAuthnProvider.registerCredential() path the enrollment panel's FACTOR_DEFS still calls). Disclosed limit found during inspection, not introduced here: both enroll endpoints remain gated to an authenticated platform-administrator session server-side (server/webauthn-rp/server.js) — this method forwards that server verdict honestly rather than bypassing it. Additive only; the enrollment panel is not rewired to call this method as a *default* path in this portion (see Portion 2e checkpoint for the exact opt-in wiring). Portion 2b: loginWithServerPasskey() — the real, server-authoritative Passkey ceremony the Portion 2 audit found missing (POST /webauthn/authenticate/begin -> navigator.credentials.get() -> POST /webauthn/authenticate/complete; the real server RP is the sole verification authority, never the old client-side WebAuthnProvider.verify()/IdentityEngine.loginWithVerifiedPasskey() path loginWithPasskey() below still uses). Additive only — login.html's Passkey button is not rewired yet; that is the next, separate portion. Milestone 375: loginWithPasskey() — connects the real, existing WebAuthnProvider to login.html for ordinary (non-admin) users, distinct from loginWithBiometrics()/loginWithTrustedDevice() which remain the Platform-Administrator-only AdminRecoveryPolicy path. Prompt 9A: getLoginDecision() — composes AuthFactorSnapshot + LoginDecisionEngine into the real, previously-missing factor-snapshot-drives-login-decision connection; verifies/duplicates nothing itself. Prompt 10 continuation: requestPhoneLoginChallenge()/loginWithPhone() — the disclosed "next primary target": composes the already-real PhoneAccountLinkage/CozyPhoneChallengeService/IdentityEngine.loginWithVerifiedPhone() into an actual browser-reachable phone login path; duplicates none of them. Prompt 10 continuation (phone browser-wiring verification): restoreSession() now guards on the existing session.isSignedIn() signal before restoring — fixes a real pre-existing race where login.html's restoreExistingSession() IIFE and this file's own internal tryRestore() retry loop could each independently call restoreSession() and duplicate session.establishFromIdentity() immediately after a fresh login (any method, not phone-specific); found via the new Phone browser-wiring test suite exercising real wall-clock timing, not introduced by the Phone work itself.
    const STORAGE_KEY = "cozyos.authCoordinator.session";

    // ---- base64url helpers (Portion 2b, loginWithServerPasskey() only) ----
    // Deliberately a fresh, local copy rather than reusing
    // core/security/webauthn-provider.js's toB64url()/fromB64url() — this
    // method must not depend on the old client-authoritative provider
    // being loaded at all. Same byte-for-byte logic.
    function toB64url(bytes) {
        let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
        return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    function fromB64url(str) {
        const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

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
            logouts: 0,
            // Phase C §5-8 — real server-authoritative password login,
            // tracked separately from the legacy credentialLogin*
            // counters above (which remain IdentityEngine's own
            // client-side path, still used by completeLoginWithOtp() /
            // the legacy OTP flow — see loginWithServerPassword()'s own
            // header for why both paths currently coexist).
            serverLoginAttempts: 0, serverLoginSuccesses: 0, serverLoginFailures: 0,
            mfaGateEngaged: 0,
            // Portion 2b — real server-authoritative Passkey ceremony,
            // tracked separately from credentialLogin* above (the old
            // client-side WebAuthnProvider path loginWithPasskey() still
            // uses) so the two are never conflated in getDiagnosticsReport().
            serverPasskeyLoginAttempts: 0, serverPasskeyLoginSuccesses: 0, serverPasskeyLoginFailures: 0,
            // Portion 2e — real server-authoritative Passkey enrollment
            // (registerServerPasskey()), tracked separately from
            // serverPasskeyLogin* above (a different ceremony/endpoint
            // pair: /webauthn/passkeys/enroll/begin+complete, not
            // /webauthn/authenticate/*) and from the legacy client-side
            // WebAuthnProvider.registerCredential() path the enrollment
            // panel's FACTOR_DEFS still calls, so none of the three are
            // ever conflated in getDiagnosticsReport().
            serverPasskeyRegistrationAttempts: 0, serverPasskeyRegistrationSuccesses: 0, serverPasskeyRegistrationFailures: 0
        };

        // Phase C §4 — no client-side pending-challenge map anymore.
        // The server itself is now the sole holder of pending-MFA state
        // (pending_auth_sessions — see server/webauthn-rp/rp.js). This
        // coordinator only ever carries the opaque pendingId string the
        // server hands back; it never mints, stores, or interprets any
        // challenge material client-side. Superseded the previous
        // #pendingServerOtpChallenges map (and its bridge to the legacy
        // client-side OtpProvider store), which existed only because the
        // server previously had no MFA concept of its own — see
        // CHECKPOINT-PHASE-C-PASSWORD-LOGIN-SLICE.md "disclosed security
        // limitation" for the gap this closes.

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
         * loginWithServerPassword(email, password, {rememberMe})
         *   Phase C §3-4 — real server-authoritative password login,
         *   now with real server-side MFA. Calls POST /auth/login
         *   (server/webauthn-rp), NOT IdentityEngine.login() above —
         *   that remains a fully separate, legacy, client-side-only
         *   credential store (its own password hash, its own users
         *   map, its own OTP gate; see identity-engine.js's
         *   #hashPassword()/#users). The server is the sole authority
         *   on password correctness AND on whether a second factor is
         *   required, and issues the real HttpOnly cozy_admin_session
         *   cookie only once authentication is fully complete — which
         *   this coordinator never reads or writes directly, only
         *   fetch()'s credentials:"include" carries it.
         *
         *   Returns one of:
         *     { available:false, code:"validation_error", reason }
         *     { available:false, code:"invalid_credentials", reason }
         *       — deliberately generic; the server itself does not
         *         distinguish "wrong password" from "disabled account"
         *         on the wire (anti-enumeration, see server.js POST
         *         /auth/login) and this method preserves that rather
         *         than inventing a distinction the server won't make.
         *     { available:false, code:"rate_limited", reason }
         *     { available:false, code:"server_unavailable", reason }
         *     { available:true, requiresOtp:true, pendingId }
         *       — the server has verified the password but requires a
         *         second factor. NO session cookie exists yet at this
         *         point; the account is not signed in. See
         *         completeServerLoginWithOtp()/abortPendingServerLogin().
         *     { available:true, source:"server", email, isPlatformAdmin }
         *
         *   This closes the gap disclosed in
         *   CHECKPOINT-PHASE-C-PASSWORD-LOGIN-SLICE.md: the server now
         *   has a genuine password_verified_pending_mfa state
         *   (server/webauthn-rp/rp.js createPendingAuthSession()) and
         *   never issues cozy_admin_session until that state is
         *   resolved by a verified second factor. Accounts enrolled
         *   only in the legacy client-side OtpProvider store (never
         *   migrated to server-side TOTP via
         *   POST /auth/mfa/totp/enroll/begin|complete) are NOT covered
         *   by this — see KNOWN LIMITATIONS in this phase's checkpoint.
         */
        async loginWithServerPassword(email, password, { rememberMe = true } = {}) {
            this.#diagnostics.serverLoginAttempts++;
            if (typeof fetch !== "function") {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "client_error", reason: "This browser does not support the required network APIs." };
            }

            let response;
            try {
                response = await fetch("/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ email, password }),
                });
            } catch (_err) {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "server_unavailable", reason: "Sign-in is temporarily unavailable. Please check your connection and try again." };
            }

            let body = null;
            try { body = await response.json(); } catch (_err) { body = null; }

            if (response.status === 429) {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "rate_limited", reason: "Too many sign-in attempts. Please wait a moment and try again." };
            }
            if (response.status === 400) {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "validation_error", reason: "Enter both an email and a password." };
            }
            if (!response.ok || !body || body.ok !== true) {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "invalid_credentials", reason: "Invalid email or password, or this account may be disabled." };
            }

            if (body.mfaRequired) {
                this.#diagnostics.mfaGateEngaged++;
                // rememberMe is remembered locally only to thread through
                // to #finishServerLogin() after a successful
                // completeServerLoginWithOtp() call — it is never sent to
                // or trusted from the server, which has no concept of it.
                return { available: true, requiresOtp: true, pendingId: body.pendingId, rememberMe: !!rememberMe };
            }

            this.#diagnostics.serverLoginSuccesses++;
            return this.#finishServerLogin({ email, isPlatformAdmin: !!body.isPlatformAdmin, rememberMe: !!rememberMe });
        }

        /**
         * loginWithServerFirebase(email, password) — C15.
         *
         * WHY THIS EXISTS
         * -----------------
         * The existing administrator account was created in Firebase
         * Authentication, but login.html previously offered no way to
         * sign in with it at all — no Firebase reference existed
         * anywhere in that file. This method is the missing link,
         * built by composing three pieces that ALL already existed and
         * were already correct, none of them written for this fix:
         *   1. window.CozyOS.Firebase.Auth.signInWithEmailAndPassword()
         *      (Firebase/firebase-auth.js) — real, thin SDK passthrough,
         *      already used elsewhere (dashboard.html).
         *   2. POST /webauthn/firebase/session (server.js) — already
         *      verifies the real Firebase ID token server-side
         *      (firebase-verify.js) and already bridges into the exact
         *      same session system password/passkey use
         *      (rp.authenticateWithVerifiedFirebase() ->
         *      resolveOrCreateUserForFirebase(), same cozy_admin_session
         *      cookie via the same sessionCookieHeader()). Already
         *      covered by 10 passing tests in
         *      firebase-session-integration.test.js, including the
         *      exact "administrator granted via the bootstrap CLI is
         *      recognized through the Firebase login path" case.
         *   3. #finishServerLogin() (below) — the SAME private method
         *      loginWithServerPassword()/loginWithServerPasskey() call,
         *      uid set to email (not the Firebase uid) so the existing
         *      C14B IdentityEngine resolver (getUser()/
         *      findUserIdForRecovery() in index.html's resolveAuthState())
         *      works completely unchanged — no fourth identity system,
         *      no new lookup table.
         *
         * WHAT THIS DELIBERATELY DOES NOT DO
         * -------------------------------------
         * Does NOT use core/modules/session/firebase-session-bridge.js
         * or PlatformIdentity.checkAdminExists() — that is a separate,
         * Firestore-based, LOCAL-ONLY admin determination, entirely
         * disconnected from the server's SQLite is_platform_admin
         * column. Wiring that in here would create exactly the
         * "fourth identity system" this milestone was told not to
         * invent, and would let a Firestore document grant admin
         * authority the real server-side gate never agreed to. This
         * method only ever trusts isPlatformAdmin as returned by the
         * server's own /webauthn/firebase/session response.
         *
         * PROVISIONING HONESTY
         * -----------------------
         * resolveOrCreateUserForFirebase() (rp.js) will find-or-create a
         * SQLite users row for this email, but a BRAND NEW row is
         * always created with is_platform_admin=0 (hardcoded — see
         * rp.js). This method cannot and does not grant admin status;
         * it only lets an already-is_platform_admin=1 account actually
         * reach a real session. If the live row for this email does
         * not yet have that bit set, this method will correctly return
         * isPlatformAdmin:false — that is the honest, fail-closed
         * result, not a bug in this method.
         */
        async loginWithServerFirebase(email, password) {
            this.#diagnostics.serverLoginAttempts++;
            const firebaseAuth = typeof window !== "undefined" && window.CozyOS && window.CozyOS.Firebase && window.CozyOS.Firebase.Auth;
            if (!firebaseAuth || typeof firebaseAuth.signInWithEmailAndPassword !== "function") {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "firebase_unavailable", reason: "Administrator sign-in is not available in this browser session." };
            }

            const signInResult = await firebaseAuth.signInWithEmailAndPassword(email, password);
            if (!signInResult.available || !signInResult.user) {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "invalid_credentials", reason: "Invalid administrator email or password." };
            }

            let idToken;
            try {
                idToken = await signInResult.user.getIdToken();
            } catch (_err) {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "client_error", reason: "Could not obtain a Firebase identity token." };
            }

            if (typeof fetch !== "function") {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "client_error", reason: "This browser does not support the required network APIs." };
            }

            let response;
            try {
                response = await fetch("/webauthn/firebase/session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ idToken }),
                });
            } catch (_err) {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "server_unavailable", reason: "Sign-in is temporarily unavailable. Please check your connection and try again." };
            }

            let body = null;
            try { body = await response.json(); } catch (_err) { body = null; }

            if (!response.ok || !body || body.ok !== true) {
                this.#diagnostics.serverLoginFailures++;
                return { available: false, code: "invalid_credentials", reason: "The server could not verify this administrator's identity." };
            }

            this.#diagnostics.serverLoginSuccesses++;
            // Real, honest result: isPlatformAdmin here is exactly what
            // the server's own SQLite is_platform_admin column says for
            // this account right now — not assumed, not upgraded.
            return this.#finishServerLogin({ email, isPlatformAdmin: !!body.isPlatformAdmin, rememberMe: true });
        }

        /**
         * #finishServerLogin(...) — real session establishment shared
         * by both the no-MFA and post-MFA success paths. Composes the
         * exact same CozyOS.Session.establishFromExternalAuth() bridge
         * loginWithTrustedDevice()/loginWithBiometrics() and the
         * Firebase session bridge already use for external auth — this
         * coordinator never re-implements Session's own logic. uid is
         * the account's email (the server's own real identifier column
         * — see db.js: `email TEXT UNIQUE NOT NULL`, no username
         * column exists server-side).
         */
        #finishServerLogin({ email, isPlatformAdmin, rememberMe }) {
            const session = this.#session();
            if (session) {
                try {
                    session.establishFromExternalAuth({
                        uid: email,
                        roles: isPlatformAdmin ? ["platform-admin"] : [],
                        profile: { email, authMode: "server-password" },
                    });
                } catch (err) {
                    this.#diagnostics.serverLoginFailures++;
                    return { available: false, code: "client_error", reason: `Session establishment failed: ${err.message}` };
                }
            }
            this.#persistPointer({ source: "server", email, since: new Date().toISOString() }, !!rememberMe);
            return { available: true, source: "server", email, isPlatformAdmin: !!isPlatformAdmin };
        }

        /**
         * completeServerLoginWithOtp(pendingId, code, {rememberMe, method, email})
         *   Phase C §4 — verifies the second factor against the real
         *   server-side pending-auth state via POST /auth/mfa/verify.
         *   `method` is "totp" (default) or "recovery". The server
         *   itself enforces the attempt cap, expiry, and cancellation
         *   state (server/webauthn-rp/rp.js pending_auth_sessions) —
         *   this method does not re-implement any of that locally, it
         *   only relays the server's decision. Only on a real 200 does
         *   the server set the session cookie; this method calls
         *   #finishServerLogin() only after that has already happened.
         *
         *   `email` MUST be supplied by the caller (the same value
         *   typed into the original login form) — POST /auth/mfa/verify
         *   intentionally returns only isPlatformAdmin, not email, so
         *   this coordinator has no other way to know which account's
         *   session was just established for the CozyOS.Session bridge.
         */
        async completeServerLoginWithOtp(pendingId, code, { rememberMe, method, email } = {}) {
            if (!pendingId) return { available: false, code: "invalid_challenge", reason: "Invalid or already-used authentication challenge. Please sign in again." };
            if (typeof fetch !== "function") {
                return { available: false, code: "client_error", reason: "This browser does not support the required network APIs." };
            }

            let response;
            try {
                response = await fetch("/auth/mfa/verify", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ pendingId, code, method: method || "totp" }),
                });
            } catch (_err) {
                return { available: false, code: "server_unavailable", reason: "Verification is temporarily unavailable. Please check your connection and try again." };
            }

            let body = null;
            try { body = await response.json(); } catch (_err) { body = null; }

            if (response.status === 429) {
                return { available: false, code: "rate_limited", reason: "Too many attempts. Please wait a moment and try again." };
            }
            if (!response.ok || !body || body.ok !== true) {
                const errCode = (body && body.error) || "invalid_mfa_code";
                const reasons = {
                    invalid_mfa_code: "Invalid authentication code.",
                    mfa_attempts_exceeded: "Too many failed attempts. Please sign in again.",
                    mfa_session_expired: "This authentication attempt has expired. Please sign in again.",
                    mfa_session_cancelled: "This authentication attempt was cancelled. Please sign in again.",
                    mfa_session_invalid: "Invalid or already-used authentication challenge. Please sign in again.",
                };
                return { available: false, code: errCode, reason: reasons[errCode] || "Invalid authentication code." };
            }

            this.#diagnostics.serverLoginSuccesses++;
            const result = this.#finishServerLogin({ email, isPlatformAdmin: !!body.isPlatformAdmin, rememberMe: !!rememberMe });
            return { ...result, usedRecoveryCode: (method === "recovery") };
        }

        /**
         * abortPendingServerLogin(pendingId)
         *   Phase C §4 — cancels a pending (password-verified,
         *   MFA-not-yet-completed) login via the real
         *   POST /auth/mfa/cancel. Unlike the previous slice, there is
         *   no cozy_admin_session cookie to revoke here at all: the
         *   server never sets one until MFA actually succeeds, so
         *   cancelling only ever tears down server-side pending state
         *   that could never have authorized anything in the first
         *   place. keepalive:true so the request survives a caller that
         *   navigates away in the same tick (matching the existing
         *   logout() callers' posture below).
         */
        async abortPendingServerLogin(pendingId) {
            if (typeof fetch !== "function") return { revoked: false, reason: "fetch unavailable" };
            try {
                await fetch("/auth/mfa/cancel", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    keepalive: true,
                    body: JSON.stringify({ pendingId }),
                });
                return { revoked: true };
            } catch (err) {
                return { revoked: false, reason: err.message };
            }
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
         * getLoginDecision(username, { context = "login" })
         *   Prompt 9A — the real, previously-missing connection:
         *   ACCOUNT -> FACTOR SNAPSHOT -> POLICY/DECISION -> PERMITTED
         *   FACTOR. Composes IdentityEngine's real, non-secret account
         *   lookups (getUserIdByUsername/getFactorSnapshotContext/
         *   isPlatformAdmin), core/security/auth-factor-snapshot.js's
         *   buildFactorSnapshot() (itself composed from the real
         *   WebAuthnProvider/PhoneAccountLinkage/GoogleAccountLinkage/
         *   TrustedDeviceManager/AuthFactorRegistry engines — whichever
         *   of those are actually loaded on the current page; a missing
         *   one degrades its factor to unavailable, it never throws),
         *   and core/security/login-decision-engine.js's real
         *   getLoginDecision(). This method verifies no factor itself,
         *   duplicates no existing engine, and never lets a client-
         *   supplied boolean influence the result — every value in the
         *   returned decision ultimately traces back to a real engine
         *   call.
         *
         *   This method ONLY answers "which factor should this account
         *   be offered, and in what order" — invoking the actually-
         *   chosen provider (loginWithPasskey()/loginWithCredentials()/
         *   loginWithVerifiedGoogle()/completeLoginWithOtp(), all
         *   already real and unchanged by this method) remains the
         *   caller's job, same as before this method existed. No UI on
         *   this page calls this yet (Prompt 9A §12 — decision engine
         *   wiring only; UI wiring is a later slice).
         *
         *   An unresolved username returns the exact same generic,
         *   non-enumerating shape loginWithPasskey() already uses
         *   ("Invalid username or password") — this method must never
         *   become a new way to probe which usernames exist. A resolved
         *   account that is inactive/locked still reaches
         *   LoginDecisionEngine's own real "Account is not active."
         *   reason, matching login()'s existing, already-disclosed
         *   locked-account behavior elsewhere on this page.
         */
        getLoginDecision(username, { context = "login" } = {}) {
            const rejected = (reason) => ({ status: "REJECTED", reason, primaryFactor: null, usableFactors: [], fallbackAvailable: false, recoveryAvailable: false, userId: null });

            const identity = this.#identity();
            if (!identity || typeof identity.getUserIdByUsername !== "function" || typeof identity.getFactorSnapshotContext !== "function") {
                return rejected("IdentityEngine is not loaded — cannot build a login decision. Failing closed.");
            }
            const snapshotBuilder = window.CozyOS && window.CozyOS.AuthFactorSnapshot;
            const decisionEngine = window.CozyOS && window.CozyOS.LoginDecisionEngine;
            if (!snapshotBuilder || typeof snapshotBuilder.buildFactorSnapshot !== "function" || !decisionEngine || typeof decisionEngine.getLoginDecision !== "function") {
                return rejected("AuthFactorSnapshot/LoginDecisionEngine are not loaded — failing closed.");
            }

            const resolved = typeof username === "string" && username ? identity.getUserIdByUsername(username) : null;
            if (!resolved) return rejected("Invalid username or password.");

            const userContext = identity.getFactorSnapshotContext(resolved.userId);
            if (!userContext) return rejected("Invalid username or password.");

            const isPlatformAdmin = typeof identity.isPlatformAdmin === "function" ? identity.isPlatformAdmin(resolved.userId) : false;

            const { account, factors } = snapshotBuilder.buildFactorSnapshot({
                userId: resolved.userId,
                user: userContext,
                context,
                webauthnProvider: window.CozyOS && window.CozyOS.WebAuthnProvider,
                phoneLinkage: window.CozyOS && window.CozyOS.PhoneAccountLinkage,
                googleLinkage: window.CozyOS && window.CozyOS.GoogleAccountLinkage,
                trustedDeviceManager: window.CozyOS && window.CozyOS.TrustedDeviceManager,
                factorRegistry: window.CozyOS && window.CozyOS.AuthFactorRegistry,
                isPlatformAdmin
            });

            const decision = decisionEngine.getLoginDecision({ account, factors, context });
            return { ...decision, userId: resolved.userId };
        }

        /**
         * loginWithPasskey(username)
         *   Milestone 375 — real, ordinary-user Passkey sign-in. Distinct
         *   from loginWithTrustedDevice()/loginWithBiometrics() below,
         *   which are the Platform-Administrator-only AdminRecoveryPolicy
         *   path (hardcode roles:["platform-admin"] — genuinely wrong for
         *   a normal user). This method instead: (1) resolves username ->
         *   userId via IdentityEngine.getUserIdByUsername() (non-secret,
         *   same public input already on the login form), (2) fails
         *   closed with an honest, device/enrollment-specific reason if
         *   WebAuthn isn't supported on this browser or no credential is
         *   registered for this user — never a generic error, (3) calls
         *   the real WebAuthnProvider.verify(userId) (genuine
         *   navigator.credentials.get() + ECDSA assertion check — this
         *   coordinator performs zero cryptographic verification itself),
         *   and only on a real verified:true composes the exact same real
         *   session establishment + Remember Me pointer persistence every
         *   other login path here already uses.
         */
        async loginWithPasskey(username, { rememberMe = true } = {}) {
            this.#diagnostics.credentialLoginAttempts++;
            const webauthn = window.CozyOS && window.CozyOS.WebAuthnProvider;
            if (!webauthn) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: "WebAuthnProvider is not loaded — cannot authenticate. Failing closed." }; }
            if (typeof webauthn.isSupported === "function" && !webauthn.isSupported()) {
                return { available: false, reason: "Passkey sign-in is not available on this device/browser.", deviceUnavailable: true };
            }

            const identity = this.#identity();
            if (!identity || typeof identity.getUserIdByUsername !== "function") { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: "IdentityEngine is not loaded — cannot authenticate. Failing closed." }; }
            const resolved = identity.getUserIdByUsername(username);
            if (!resolved) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: "Invalid username or password." }; } // same generic message as loginWithCredentials — never discloses whether a username exists

            if (typeof webauthn.hasCredential === "function" && !webauthn.hasCredential(resolved.userId)) {
                return { available: false, reason: "No passkey is set up for this account yet. Set one up in Settings → Security.", requiresSetup: true };
            }

            const assertion = await webauthn.verify(resolved.userId);
            if (!assertion.verified) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: assertion.reason || "Passkey verification failed." }; }

            if (typeof identity.loginWithVerifiedPasskey !== "function") { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: "IdentityEngine does not support passkey session establishment yet. Failing closed." }; }
            const result = identity.loginWithVerifiedPasskey(resolved.userId);
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
         * loginWithServerPasskey(email, {rememberMe})
         *   Portion 2b — real, server-authoritative Passkey sign-in.
         *   Closes the gap the Portion 2 audit found: loginWithPasskey()
         *   above calls the client-side WebAuthnProvider.verify() +
         *   IdentityEngine.loginWithVerifiedPasskey(), which is this
         *   static platform's own relying party and verifier — the real
         *   server-side WebAuthn RP (server/webauthn-rp/rp.js, previously
         *   exercised only by its own test suite via a virtual
         *   authenticator) never saw the assertion. This method performs
         *   the real browser WebAuthn ceremony against that real RP:
         *     POST /webauthn/authenticate/begin    -> real challenge/options
         *     navigator.credentials.get(...)       -> real platform assertion
         *     POST /webauthn/authenticate/complete -> server verifies and
         *       is the SOLE authority; only a real 200 has already set the
         *       real HttpOnly cozy_admin_session cookie (fetch's
         *       credentials:"include" carries it, same as
         *       loginWithServerPassword() above — this coordinator never
         *       reads or writes that cookie itself).
         *
         *   Deliberately does NOT call WebAuthnProvider.verify() or
         *   IdentityEngine.loginWithVerifiedPasskey() — those establish
         *   the old client-authoritative identity session, which is not
         *   acceptable as the final authentication authority here. No
         *   local signature verification happens in this method; the
         *   server's response is the only thing trusted. The assertion's
         *   signature is relayed to the server exactly as the platform
         *   authenticator produced it (ASN.1 DER) — matching what
         *   server/webauthn-rp/authenticator-data.js's verifySignature()
         *   already expects (Node crypto.verify()'s default DER
         *   encoding), same as the existing virtual-authenticator test
         *   double already produces. No re-encoding is invented here.
         *
         *   `email` (not username) because the real server has no
         *   username column (see loginWithServerPassword()'s own header)
         *   and POST /webauthn/authenticate/begin resolves credentials by
         *   email.
         *
         *   Returns one of:
         *     { available:false, code:"validation_error", reason }
         *     { available:false, code:"webauthn_unavailable", reason, deviceUnavailable:true }
         *     { available:false, code:"server_unavailable", reason }
         *     { available:false, code:"challenge_request_failed", reason }
         *     { available:false, code:"no_passkeys_registered", reason, requiresSetup:true }
         *     { available:false, code:"user_cancelled", reason }
         *     { available:false, code:"webauthn_ceremony_failed", reason }
         *     { available:false, code:"no_assertion", reason }
         *     { available:false, code:<server AuthError code>, reason }
         *       — e.g. unknown_credential, credential_revoked,
         *         invalid_signature, sign_count_did_not_increase,
         *         rp_id_hash_mismatch, challenge_expired — relayed from
         *         the server's own AuthError.code, never reinterpreted or
         *         upgraded to a success locally.
         *     { available:true, source:"server", email, isPlatformAdmin }
         *
         *   Portion 2b scope: the coordinator method only. login.html's
         *   Passkey button still calls the old loginWithPasskey() above —
         *   wiring it to this method is the next, separate portion.
         */
        async loginWithServerPasskey(email, { rememberMe = true } = {}) {
            this.#diagnostics.serverPasskeyLoginAttempts++;
            if (!email || typeof email !== "string") {
                this.#diagnostics.serverPasskeyLoginFailures++;
                return { available: false, code: "validation_error", reason: "An email is required to begin passkey sign-in." };
            }
            if (typeof fetch !== "function") {
                this.#diagnostics.serverPasskeyLoginFailures++;
                return { available: false, code: "client_error", reason: "This browser does not support the required network APIs." };
            }
            if (typeof navigator === "undefined" || !navigator.credentials || typeof navigator.credentials.get !== "function") {
                this.#diagnostics.serverPasskeyLoginFailures++;
                return { available: false, code: "webauthn_unavailable", reason: "Passkey sign-in is not available on this device/browser.", deviceUnavailable: true };
            }

            // ---- begin: real challenge/options from the real RP ----
            let beginResponse;
            try {
                beginResponse = await fetch("/webauthn/authenticate/begin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ email }),
                });
            } catch (_err) {
                this.#diagnostics.serverPasskeyLoginFailures++;
                return { available: false, code: "server_unavailable", reason: "Sign-in is temporarily unavailable. Please check your connection and try again." };
            }
            let beginBody = null;
            try { beginBody = await beginResponse.json(); } catch (_err) { beginBody = null; }
            if (!beginResponse.ok || !beginBody || typeof beginBody.challenge !== "string") {
                this.#diagnostics.serverPasskeyLoginFailures++;
                return { available: false, code: "challenge_request_failed", reason: "Could not start passkey sign-in. Please try again." };
            }
            if (!Array.isArray(beginBody.allowCredentials) || beginBody.allowCredentials.length === 0) {
                this.#diagnostics.serverPasskeyLoginFailures++;
                return { available: false, code: "no_passkeys_registered", reason: "No passkey is set up for this account yet.", requiresSetup: true };
            }

            // ---- real browser ceremony ----
            let assertion;
            try {
                assertion = await navigator.credentials.get({
                    publicKey: {
                        challenge: fromB64url(beginBody.challenge),
                        rpId: beginBody.rpId,
                        allowCredentials: beginBody.allowCredentials.map((c) => ({ type: "public-key", id: fromB64url(c.id) })),
                        userVerification: "required",
                        timeout: 60000,
                    },
                });
            } catch (err) {
                this.#diagnostics.serverPasskeyLoginFailures++;
                const cancelled = err && (err.name === "NotAllowedError" || err.name === "AbortError");
                return {
                    available: false,
                    code: cancelled ? "user_cancelled" : "webauthn_ceremony_failed",
                    reason: cancelled ? "Passkey sign-in was cancelled." : `Real WebAuthn assertion failed: ${err.message}`,
                };
            }
            if (!assertion || !assertion.response) {
                this.#diagnostics.serverPasskeyLoginFailures++;
                return { available: false, code: "no_assertion", reason: "No real assertion was returned by the browser." };
            }

            // ---- serialize the real assertion into the server's contract ----
            const completeBody = {
                credentialId: toB64url(new Uint8Array(assertion.rawId)),
                clientDataJSON: toB64url(new Uint8Array(assertion.response.clientDataJSON)),
                authenticatorData: toB64url(new Uint8Array(assertion.response.authenticatorData)),
                signature: toB64url(new Uint8Array(assertion.response.signature)),
            };

            // ---- complete: server is the sole verification authority ----
            let completeResponse;
            try {
                completeResponse = await fetch("/webauthn/authenticate/complete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(completeBody),
                });
            } catch (_err) {
                this.#diagnostics.serverPasskeyLoginFailures++;
                return { available: false, code: "server_unavailable", reason: "Sign-in is temporarily unavailable. Please check your connection and try again." };
            }
            let completeJson = null;
            try { completeJson = await completeResponse.json(); } catch (_err) { completeJson = null; }

            if (!completeResponse.ok || !completeJson || completeJson.ok !== true) {
                this.#diagnostics.serverPasskeyLoginFailures++;
                const errCode = (completeJson && completeJson.error) || "authentication_failed";
                const reasons = {
                    unknown_credential: "This passkey is not recognized.",
                    credential_revoked: "This passkey has been revoked.",
                    invalid_signature: "Passkey verification failed.",
                    sign_count_did_not_increase: "This passkey could not be verified as genuine. Please try again or use another sign-in method.",
                    rp_id_hash_mismatch: "This passkey was not issued for this site.",
                    user_not_present: "Passkey verification failed.",
                    challenge_expired: "This passkey sign-in attempt expired. Please try again.",
                    missing_challenge: "This passkey sign-in attempt is invalid. Please try again.",
                    malformed_client_data: "This passkey sign-in attempt is invalid. Please try again.",
                    unexpected_ceremony_type: "This passkey sign-in attempt is invalid. Please try again.",
                    origin_mismatch: "This passkey sign-in attempt is invalid. Please try again.",
                };
                return { available: false, code: errCode, reason: reasons[errCode] || "Passkey verification failed." };
            }

            // Only a real, server-confirmed 200 reaches here — the
            // cozy_admin_session cookie has already been set by the
            // server's own Set-Cookie header at this point.
            this.#diagnostics.serverPasskeyLoginSuccesses++;
            return this.#finishServerLogin({ email, isPlatformAdmin: !!completeJson.isPlatformAdmin, rememberMe: !!rememberMe });
        }

        /**
         * registerServerPasskey(nickname)
         *   Portion 2e — real, server-authoritative Passkey ENROLLMENT for
         *   an already-authenticated session. Closes the gap the Portion
         *   2e inspection found: the enrollment panel's FACTOR_DEFS
         *   ("security-key") still only calls the legacy client-side
         *   WebAuthnProvider.registerCredential(), never the real server
         *   RP (server/webauthn-rp/rp.js) that loginWithServerPasskey()
         *   above already authenticates against. This performs the real
         *   browser WebAuthn ceremony against that same real RP:
         *     POST /webauthn/passkeys/enroll/begin    -> real server
         *       challenge + RP/user info + excludeCredentials
         *     navigator.credentials.create()          -> real browser
         *       WebAuthn attestation ceremony (never stubbed, never
         *       client-simulated)
         *     POST /webauthn/passkeys/enroll/complete -> real server
         *       verification (rp.completeRegistration()) and credential
         *       persistence; the server's 200 is the ONLY thing that can
         *       make this method report success
         *   Deliberately does NOT call WebAuthnProvider.registerCredential()
         *   or AuthEnrollmentStore.enroll() itself — this method only
         *   performs the real ceremony and reports the server's real
         *   verdict; recording that success into AuthEnrollmentStore (as
         *   the enrollment panel's doAction("enroll") already does for
         *   every factor) is the caller's job, same separation of
         *   concerns loginWithServerPasskey() keeps from session
         *   establishment.
         *
         *   DISCLOSED ARCHITECTURAL LIMIT (found during inspection, not
         *   introduced here): server/webauthn-rp/server.js currently
         *   gates BOTH enrollment endpoints on
         *   `session.isPlatformAdmin` — enrolling an additional passkey
         *   is only wired for an authenticated platform-administrator
         *   session, not yet for ordinary authenticated users. This
         *   method does not bypass, relax, or duplicate that
         *   authorization check; it simply forwards the server's own
         *   401 `not_authenticated_admin` honestly (available:false)
         *   when called from a non-admin or unauthenticated session,
         *   exactly as it forwards every other server-authoritative
         *   error code below. Extending self-service passkey enrollment
         *   to non-admin accounts would require a genuine server-side
         *   authorization change and is out of scope for Portion 2e —
         *   see the Portion 2e checkpoint's LIMITATIONS section.
         *
         *   Returns one of:
         *     { available:false, code:"webauthn_unavailable", reason, deviceUnavailable:true }
         *     { available:false, code:"not_authenticated_admin", reason, requiresAuth:true }
         *     { available:false, code:"user_cancelled"|"webauthn_ceremony_failed", reason }
         *     { available:false, code:<server AuthError code>, reason }
         *     { available:true, code:"registered", credentialId, nickname }
         *
         *   Portion 2e scope: the coordinator method only. Wiring an
         *   actual "Add Passkey" button (e.g. the enrollment panel's
         *   security-key card) to this method, and recording the result
         *   into AuthEnrollmentStore, is covered by this same portion's
         *   UI step — see CHECKPOINT-PHASE-C-PORTION2E for the exact
         *   file wired.
         */
        async registerServerPasskey(nickname) {
            this.#diagnostics.serverPasskeyRegistrationAttempts++;
            if (typeof fetch !== "function") {
                this.#diagnostics.serverPasskeyRegistrationFailures++;
                return { available: false, code: "client_error", reason: "This browser does not support the required network APIs." };
            }
            if (typeof navigator === "undefined" || !navigator.credentials || typeof navigator.credentials.create !== "function") {
                this.#diagnostics.serverPasskeyRegistrationFailures++;
                return { available: false, code: "webauthn_unavailable", reason: "Passkey registration is not available on this device/browser.", deviceUnavailable: true };
            }

            // ---- begin: real challenge/options from the real RP ----
            // Deliberately no request body — the server resolves the
            // account to enroll against from the real session cookie
            // (session.email), never from a client-supplied email, so a
            // caller cannot register a passkey onto an account other than
            // the one it is actually signed in as.
            let beginResponse;
            try {
                beginResponse = await fetch("/webauthn/passkeys/enroll/begin", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({}),
                });
            } catch (_err) {
                this.#diagnostics.serverPasskeyRegistrationFailures++;
                return { available: false, code: "server_unavailable", reason: "Passkey registration is temporarily unavailable. Please check your connection and try again." };
            }
            let beginBody = null;
            try { beginBody = await beginResponse.json(); } catch (_err) { beginBody = null; }
            if (!beginResponse.ok) {
                this.#diagnostics.serverPasskeyRegistrationFailures++;
                const errCode = (beginBody && beginBody.error) || "registration_start_failed";
                if (errCode === "not_authenticated_admin" || errCode === "not_authenticated") {
                    return { available: false, code: errCode, reason: "You must be signed in with an authorized account to register a passkey.", requiresAuth: true };
                }
                return { available: false, code: errCode, reason: "Could not start passkey registration. Please try again." };
            }
            if (!beginBody || typeof beginBody.challenge !== "string" || !beginBody.user || typeof beginBody.user.id !== "string") {
                this.#diagnostics.serverPasskeyRegistrationFailures++;
                return { available: false, code: "malformed_server_response", reason: "Could not start passkey registration. Please try again." };
            }

            // ---- real browser ceremony ----
            let credential;
            try {
                credential = await navigator.credentials.create({
                    publicKey: {
                        challenge: fromB64url(beginBody.challenge),
                        rp: beginBody.rp,
                        user: {
                            id: fromB64url(beginBody.user.id),
                            name: beginBody.user.name,
                            displayName: beginBody.user.displayName,
                        },
                        pubKeyCredParams: Array.isArray(beginBody.pubKeyCredParams) ? beginBody.pubKeyCredParams : [{ type: "public-key", alg: -7 }],
                        excludeCredentials: Array.isArray(beginBody.excludeCredentials)
                            ? beginBody.excludeCredentials.map((c) => ({ type: "public-key", id: fromB64url(c.id) }))
                            : [],
                        authenticatorSelection: { userVerification: "required" },
                        timeout: 60000,
                    },
                });
            } catch (err) {
                this.#diagnostics.serverPasskeyRegistrationFailures++;
                const cancelled = err && (err.name === "NotAllowedError" || err.name === "AbortError");
                return {
                    available: false,
                    code: cancelled ? "user_cancelled" : "webauthn_ceremony_failed",
                    reason: cancelled ? "Passkey registration was cancelled." : `Real WebAuthn registration failed: ${err.message}`,
                };
            }
            if (!credential || !credential.response) {
                this.#diagnostics.serverPasskeyRegistrationFailures++;
                return { available: false, code: "no_credential", reason: "No real credential was returned by the browser." };
            }

            // ---- serialize the real credential into the server's contract ----
            const completeBody = {
                clientDataJSON: toB64url(new Uint8Array(credential.response.clientDataJSON)),
                attestationObject: toB64url(new Uint8Array(credential.response.attestationObject)),
                nickname: nickname || null,
            };

            // ---- complete: server is the sole verification authority ----
            let completeResponse;
            try {
                completeResponse = await fetch("/webauthn/passkeys/enroll/complete", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(completeBody),
                });
            } catch (_err) {
                this.#diagnostics.serverPasskeyRegistrationFailures++;
                return { available: false, code: "server_unavailable", reason: "Passkey registration is temporarily unavailable. Please check your connection and try again." };
            }
            let completeJson = null;
            try { completeJson = await completeResponse.json(); } catch (_err) { completeJson = null; }

            if (!completeResponse.ok || !completeJson || completeJson.ok !== true) {
                this.#diagnostics.serverPasskeyRegistrationFailures++;
                const errCode = (completeJson && completeJson.error) || "registration_failed";
                const reasons = {
                    not_authenticated_admin: "You must be signed in with an authorized account to register a passkey.",
                    not_authenticated: "You must be signed in to register a passkey.",
                    rp_id_hash_mismatch: "This passkey was not created for this site.",
                    user_not_present: "Passkey registration could not be verified.",
                    missing_attested_credential_data: "This browser/authenticator did not return the required credential data.",
                    credential_already_registered: "This passkey is already registered.",
                    unknown_challenge: "This passkey registration attempt is invalid. Please try again.",
                    challenge_purpose_mismatch: "This passkey registration attempt is invalid. Please try again.",
                    challenge_already_used: "This passkey registration attempt has already been used. Please try again.",
                    challenge_expired: "This passkey registration attempt expired. Please try again.",
                };
                return {
                    available: false,
                    code: errCode,
                    reason: reasons[errCode] || "Passkey registration failed.",
                    requiresAuth: errCode === "not_authenticated_admin" || errCode === "not_authenticated",
                };
            }

            // Only a real, server-confirmed 200 reaches here — the
            // credential has already been verified and persisted by the
            // real server (rp.completeRegistration()) at this point.
            this.#diagnostics.serverPasskeyRegistrationSuccesses++;
            return { available: true, code: "registered", credentialId: completeJson.credentialId, nickname: nickname || null };
        }

        /**
         * requestPhoneLoginChallenge(username)
         *   Prompt 10 continuation — real, additive. First half of the
         *   phone browser-login connection identified as the next
         *   buildable seam (existing PhoneProvider/PhoneAccountLinkage/
         *   DeliveryBackendRegistry composed, nothing duplicated).
         *   Resolves username -> userId, requires that account's phone
         *   to already be genuinely verified+enrolled AND a real SMS
         *   backend to actually be configured
         *   (PhoneAccountLinkage.isPhoneLoginUsable() — never "verified"
         *   alone), then dispatches a real challenge to the account's
         *   OWN stored, already-verified phone number via the existing
         *   CozyPhoneChallengeService (never a phone number supplied by
         *   the caller/browser — this is a login flow, not a linking
         *   flow, so the number is never client-controlled). Returns the
         *   same enumeration-safe generic shape phone-provider.js/
         *   phone-account-linkage.js already use either way.
         */
        async requestPhoneLoginChallenge(username) {
            const GENERIC = { status: "CHALLENGE_REQUESTED", message: "If phone sign-in is available for this account, a verification code has been sent." };
            const identity = this.#identity();
            const phoneLinkage = window.CozyOS && window.CozyOS.PhoneAccountLinkage;
            const challengeService = window.CozyOS && window.CozyOS.PhoneChallengeService;
            if (!identity || typeof identity.getUserIdByUsername !== "function" || !phoneLinkage || !challengeService) {
                return { available: false, reason: "Phone sign-in services are not loaded — cannot authenticate. Failing closed." };
            }
            const resolved = typeof username === "string" && username ? identity.getUserIdByUsername(username) : null;
            if (!resolved) return { available: true, ...GENERIC }; // same non-enumerating shape regardless of match

            if (!phoneLinkage.isPhoneLoginUsable(resolved.userId)) {
                // Honest, account-scoped reason (this is a follow-up
                // action on a username the person just typed, not a
                // cold enumeration probe) — matches loginWithPasskey()'s
                // own "requiresSetup" precedent for an unusable factor.
                return { available: false, reason: "Phone sign-in is not set up or not usable for this account yet.", requiresSetup: true };
            }
            const state = phoneLinkage.getPhoneState(resolved.userId);
            const result = await challengeService.requestPhoneChallenge(state.phoneNumber);
            return { available: true, ...result, userId: resolved.userId };
        }

        /**
         * loginWithPhone(username, code, {rememberMe})
         *   Prompt 10 continuation — real, additive. Second half of the
         *   phone browser-login connection. Re-checks
         *   isPhoneLoginUsable() (never trusts that the earlier
         *   requestPhoneLoginChallenge() call is still valid — state can
         *   change between the two steps, e.g. the SMS backend or the
         *   linkage being revoked), then verifies the code through the
         *   exact same CozyPhoneChallengeService.verifyPhoneChallenge()
         *   the recovery/linking flows already use (no re-implemented
         *   verification here), and only on a real verified:true composes
         *   IdentityEngine.loginWithVerifiedPhone() into the same real
         *   session establishment + Remember Me pointer persistence every
         *   other login path in this file already uses.
         */
        async loginWithPhone(username, code, { rememberMe = true } = {}) {
            this.#diagnostics.credentialLoginAttempts++;
            const identity = this.#identity();
            const phoneLinkage = window.CozyOS && window.CozyOS.PhoneAccountLinkage;
            const challengeService = window.CozyOS && window.CozyOS.PhoneChallengeService;
            if (!identity || typeof identity.getUserIdByUsername !== "function" || !phoneLinkage || !challengeService) {
                this.#diagnostics.credentialLoginFailures++;
                return { available: false, reason: "Phone sign-in services are not loaded — cannot authenticate. Failing closed." };
            }
            const resolved = identity.getUserIdByUsername(username);
            if (!resolved) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: "Invalid username or password." }; } // same generic message as every other login path — never discloses whether a username exists

            if (!phoneLinkage.isPhoneLoginUsable(resolved.userId)) {
                this.#diagnostics.credentialLoginFailures++;
                return { available: false, reason: "Phone sign-in is not set up or not usable for this account yet.", requiresSetup: true };
            }

            const state = phoneLinkage.getPhoneState(resolved.userId);
            const verification = await challengeService.verifyPhoneChallenge(state.phoneNumber, code);
            if (!verification.verified) { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: verification.state === "LOCKED" ? "Too many attempts. Request a new code." : "Invalid or expired code." }; }

            if (typeof identity.loginWithVerifiedPhone !== "function") { this.#diagnostics.credentialLoginFailures++; return { available: false, reason: "IdentityEngine does not support phone session establishment yet. Failing closed." }; }
            const result = identity.loginWithVerifiedPhone(resolved.userId);
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

            /**
             * Prompt 10 continuation — real, isolated fix for a genuine
             * pre-existing race: login.html's own restoreExistingSession()
             * IIFE and this file's own internal auto-restore tryRestore()
             * loop (both real, both intentional, see their own headers)
             * can each independently reach this exact method. Neither
             * caller previously checked whether a session had ALREADY
             * been established (e.g. by a real, just-completed
             * loginWithPasskey()/loginWithPhone()/loginWithCredentials()
             * call) before this ran — so a still-pending restore attempt
             * could call session.establishFromIdentity() a second time
             * for the same, already-signed-in user immediately after a
             * fresh login. Guards on the exact real signal
             * isAuthenticated() itself already trusts
             * (session.isSignedIn()) rather than introducing any new
             * state — a session that already reports itself signed in
             * has nothing left for a restore to legitimately do.
             */
            const alreadySignedInSession = this.#session();
            if (alreadySignedInSession && typeof alreadySignedInSession.isSignedIn === "function" && alreadySignedInSession.isSignedIn()) {
                return { restored: false, reason: "A session is already active — restore skipped to avoid a duplicate session establishment." };
            }

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

            if (pointer.source === "server") {
                // Phase C — re-validates against the real server truth
                // (GET /webauthn/session) rather than trusting the
                // local pointer's own contents; a locally-persisted
                // {email} is a non-secret UI convenience only, never
                // itself sufficient to re-establish a session.
                const session = this.#session();
                if (!session) { this.#diagnostics.restoreFailures++; return { restored: false, reason: "Session not loaded yet." }; }
                if (typeof fetch !== "function") { this.#diagnostics.restoreFailures++; return { restored: false, reason: "fetch unavailable" }; }
                let response;
                try {
                    response = await fetch("/webauthn/session", { credentials: "include" });
                } catch (_err) {
                    this.#diagnostics.restoreFailures++;
                    return { restored: false, reason: "Could not reach the server to verify the session." };
                }
                let body = null;
                try { body = await response.json(); } catch (_err) { body = null; }
                if (response.status !== 200 || !body || body.authenticated !== true) {
                    this.#persistPointer(null);
                    this.#diagnostics.restoreFailures++;
                    return { restored: false, reason: "Server session no longer valid." };
                }
                try {
                    session.establishFromExternalAuth({
                        uid: body.email || pointer.email,
                        roles: body.isPlatformAdmin ? ["platform-admin"] : [],
                        profile: { email: body.email || pointer.email, authMode: "server-password", restored: true },
                    });
                } catch (err) {
                    this.#persistPointer(null);
                    this.#diagnostics.restoreFailures++;
                    return { restored: false, reason: err.message };
                }
                this.#diagnostics.restoreSuccesses++;
                return { restored: true, source: "server", email: body.email || pointer.email };
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
            } else if (pointer && pointer.source === "server") {
                // Phase C — real revoke of the server-issued
                // cozy_admin_session cookie via the same route
                // abortPendingServerLogin() uses. Not awaited (logout()
                // itself stays synchronous, matching both existing real
                // callers below which navigate away in the same tick)
                // but keepalive:true means the browser still sends it.
                if (typeof fetch === "function") {
                    fetch("/webauthn/logout", { method: "POST", credentials: "include", keepalive: true }).catch(() => {});
                }
            }
            if (session) session.end();
            this.#persistPointer(null);
            this.#diagnostics.logouts++;
            return true;
        }

        /**
         * getCurrentIdentity() — RP-019 real-phone fix: previously
         * delegated ONLY to CozyOS.Auth.getCurrentAdministrator() (an
         * admin-only engine that is not even loaded on index.html/
         * login.html, confirmed by repository-wide search), while
         * isAuthenticated() below correctly checks the real, general-
         * purpose CozySessionService first. That mismatch meant any
         * genuinely signed-in non-admin user (isAuthenticated() true via
         * session.isSignedIn()) still got userId === null from this
         * method, since the session path was never consulted here -
         * the verified, direct cause of the real-phone "No userId
         * supplied — a per-user visibility list requires a real,
         * authenticated user" dashboard message appearing for a visibly
         * signed-in account. CozySessionService's real session.current()
         * (already loaded, already public, already carries .uid) is now
         * checked first and mapped to the same {userId, ...} shape every
         * existing caller of this method already expects. CozyOS.Auth
         * is kept as the exact same admin fallback as before when no
         * regular session is active - no caller-visible shape change, no
         * behavior change for the admin path.
         */
        getCurrentIdentity() {
            const session = this.#session();
            if (session && typeof session.current === "function") {
                const current = session.current();
                if (current && current.uid) {
                    return { userId: current.uid, source: current.source, roles: current.roles ? [...current.roles] : [], sessionId: current.sessionId || null };
                }
            }
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
