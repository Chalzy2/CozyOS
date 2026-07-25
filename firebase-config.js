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
//  STATUS: Not wired into dashboard.html. No login flow is
//    implemented by this file — it only exposes the raw SDK calls a
//    future integration milestone would use.
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
