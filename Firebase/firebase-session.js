// ============================================================
//  core/firebase/firebase-session.js
//  CozyOS Canonical Firebase Platform — Raw Auth-State Exposure
//  Version: 1.0.0
//  Milestone: 146
//
//  OWNERSHIP — READ THIS BEFORE TOUCHING THIS FILE
//    Owns: exposing the current raw Firebase user object and a
//    subscribe/unsubscribe helper. Nothing else.
//
//    Does NOT own: translating Firebase auth state into a CozyOS
//    session. core/modules/session/firebase-session-bridge.js
//    already owns that responsibility completely (it calls
//    CozyOS.Session.establishFromExternalAuth()/end() in response to
//    Firebase's onAuthStateChanged). This file is deliberately kept
//    dumber than that bridge: it never touches CozyOS.Session, never
//    calls AuthCoordinator, and never calls IdentityEngine. It exists
//    only because core/firebase/ is a self-contained platform layer
//    that should not require CozyOS.Session to import in order to
//    know "who is the current raw Firebase user" for platform-only
//    purposes (e.g. Storage upload attribution).
//
//    If a future integration milestone wires core/firebase/ into
//    dashboard.html, the EXISTING firebase-session-bridge.js is the
//    file that should subscribe via Firebase.Auth.onAuthStateChanged()
//    (from this platform's firebase-auth.js) and call CozyOS.Session —
//    not this file, and not a new bridge duplicating that logic.
//
//  STATUS: Not wired into dashboard.html. Not called by
//    firebase-session-bridge.js (that file still gets its own
//    Firebase Auth reference independently — unmodified this
//    milestone, per instruction not to touch dormant callers).
//
//  DEPENDS ON: core/firebase/firebase-auth.js.
// ============================================================
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Firebase = window.CozyOS.Firebase || {};

    const SESSION_VERSION = "1.0.0";

    if (window.CozyOS.Firebase.Session?.getVersion) {
        if (window.CozyOS.Firebase.Session.getVersion() !== SESSION_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: Firebase.Session.");
        }
        return;
    }

    let currentUser = null;
    let unsubscribeFromAuth = null;

    function boot() {
        const authService = window.CozyOS.Firebase && window.CozyOS.Firebase.Auth;
        if (!authService || typeof authService.onAuthStateChanged !== "function") return;
        authService.ready.then(() => {
            unsubscribeFromAuth = authService.onAuthStateChanged((user) => { currentUser = user || null; });
        }).catch(() => { /* Firebase.Auth failed to init — currentUser stays null. Fail closed. */ });
    }

    window.CozyOS.Firebase.Session = Object.freeze({
        getVersion() { return SESSION_VERSION; },
        /** Raw Firebase user object, or null. This is NOT a CozyOS session — see ownership note above. */
        getCurrentFirebaseUser() { return currentUser; },
        isSignedIntoFirebase() { return currentUser !== null; },
        /** For tests/teardown only. */
        _stopListening() { if (unsubscribeFromAuth) unsubscribeFromAuth(); }
    });

    boot();
})();
