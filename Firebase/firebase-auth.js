// ============================================================
//  core/firebase/firebase-auth.js
//  CozyOS Canonical Firebase Platform — Auth Primitives
//  Version: 1.0.0
//  Milestone: 146
//
//  OWNERSHIP
//    Owns: thin, real access to the Firebase Auth SDK (getAuth,
//    sign-in/out primitives, raw onAuthStateChanged). Nothing else.
//
//    Does NOT own: translating Firebase auth state into a CozyOS
//    session. That responsibility belongs solely to the existing
//    core/modules/session/firebase-session-bridge.js — not
//    duplicated here, not moved here. Does NOT own CozyOS identities
//    (IdentityEngine) or CozyOS authentication orchestration
//    (AuthCoordinator) — untouched by this milestone.
//
//  STATUS (Milestone 132a / 220): Wired into dashboard.html, loaded
//    after firebase-app.js. core/modules/session/firebase-session-bridge.js
//    now consumes getAuthInstance()/onAuthStateChanged() from this
//    file directly (Milestone 220 fix — that bridge previously
//    imported a nonexistent "../../../firebase.js"). This file still
//    implements no login flow itself and still does not decide who
//    is logged into CozyOS — it only exposes the raw SDK calls the
//    bridge and cozy-login-gate.js's registration mirror (below) use.
//
//  DEPENDS ON: core/firebase/firebase-config.js, core/firebase/firebase-app.js.
// ============================================================
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Firebase = window.CozyOS.Firebase || {};

    const AUTH_VERSION = "1.0.0";

    if (window.CozyOS.Firebase.Auth?.getVersion) {
        if (window.CozyOS.Firebase.Auth.getVersion() !== AUTH_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: Firebase.Auth.");
        }
        return;
    }

    let authInstance = null;
    let sdk = null;
    let readyResolve, readyReject;
    const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });

    async function boot() {
        const configService = window.CozyOS.Firebase && window.CozyOS.Firebase.Config;
        const appService = window.CozyOS.Firebase && window.CozyOS.Firebase.App;
        if (!configService || !appService) {
            readyReject(new Error("[Firebase.Auth] firebase-config.js/firebase-app.js did not load first. Failing closed."));
            return;
        }
        try {
            const app = await appService.ready;
            sdk = await import(configService.sdkUrl("firebase-auth.js"));
            authInstance = sdk.getAuth(app);
            readyResolve(authInstance);
        } catch (err) {
            readyReject(err);
        }
    }

    window.CozyOS.Firebase.Auth = Object.freeze({
        getVersion() { return AUTH_VERSION; },
        ready,
        getAuthInstance() { return authInstance; },
        isReady() { return authInstance !== null; },

        /** Real, thin passthroughs. No CozyOS session is established by any of these — that is firebase-session-bridge.js's job, not this file's. */
        async signInWithEmailAndPassword(email, password) {
            if (!authInstance) return { available: false, reason: "Firebase Auth is not ready. Failing closed." };
            try {
                const cred = await sdk.signInWithEmailAndPassword(authInstance, email, password);
                return { available: true, user: cred.user };
            } catch (err) {
                return { available: false, reason: err.message || "Firebase sign-in failed." };
            }
        },
        /**
         * createUserWithEmailAndPassword(email, password) — Milestone 220
         * Task 3. Same thin-passthrough style as signInWithEmailAndPassword
         * above; still creates or touches no CozyOS identity record and
         * logs no one into CozyOS. Intended caller: cozy-login-gate.js,
         * as a best-effort mirror AFTER IdentityEngine.register() has
         * already succeeded, never before and never as a second source
         * of truth for who a user is.
         */
        async createUserWithEmailAndPassword(email, password) {
            if (!authInstance) return { available: false, reason: "Firebase Auth is not ready. Failing closed." };
            try {
                const cred = await sdk.createUserWithEmailAndPassword(authInstance, email, password);
                return { available: true, user: cred.user };
            } catch (err) {
                return { available: false, reason: err.message || "Firebase account creation failed." };
            }
        },
        async signOut() {
            if (!authInstance) return { available: false, reason: "Firebase Auth is not ready. Failing closed." };
            try { await sdk.signOut(authInstance); return { available: true }; }
            catch (err) { return { available: false, reason: err.message || "Firebase sign-out failed." }; }
        },
        /** Raw subscription — the caller (a future bridge) decides what to do with each user. */
        onAuthStateChanged(callback) {
            if (!authInstance || !sdk) return () => {};
            return sdk.onAuthStateChanged(authInstance, callback);
        }
    });

    boot();
})();
