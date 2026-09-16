// ============================================================
//  core/firebase/firebase-bootstrap.js
//  CozyOS Canonical Firebase Platform — Bootstrap Orchestrator
//  Version: 1.0.0
//  Milestone: 146
//
//  OWNERSHIP
//    Owns: waiting for the whole core/firebase/ platform layer
//    (Config → App → Auth/Firestore/Storage → Provider) to finish
//    initializing, and reporting one combined readiness signal.
//    Nothing else. Establishes no CozyOS session, mounts no UI,
//    performs no login.
//
//  THIS IS THE FUTURE INTEGRATION HOOK POINT
//    A future Firebase Runtime Integration milestone is expected to
//    be the first thing that actually <script>-tags this whole
//    directory into dashboard.html, then awaits
//    window.CozyOS.Firebase.ready before doing anything else. Until
//    that milestone, nothing loads this file and it has zero runtime
//    effect.
//
//  LOAD ORDER REQUIRED (this file assumes it is last):
//    firebase-config.js, firebase-app.js, firebase-auth.js,
//    firebase-firestore.js, firebase-storage.js, firebase-provider.js,
//    firebase-session.js, then this file.
// ============================================================
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Firebase = window.CozyOS.Firebase || {};

    const BOOTSTRAP_VERSION = "1.0.0";

    if (window.CozyOS.Firebase.getVersion) {
        if (window.CozyOS.Firebase.getVersion() !== BOOTSTRAP_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: Firebase.Bootstrap.");
        }
        return;
    }

    const required = ["Config", "App", "Auth", "Firestore", "Storage", "Provider", "Session"];
    const missing = required.filter((name) => !window.CozyOS.Firebase[name]);

    const ready = missing.length > 0
        ? Promise.reject(new Error(`[Firebase.Bootstrap] Missing required module(s) before this file loaded: ${missing.join(", ")}. Failing closed.`))
        : Promise.allSettled([
            window.CozyOS.Firebase.App.ready,
            window.CozyOS.Firebase.Auth.ready,
            window.CozyOS.Firebase.Firestore.ready,
            window.CozyOS.Firebase.Storage.ready
        ]).then((results) => {
            const failed = results.filter((r) => r.status === "rejected");
            if (failed.length > 0) {
                throw new Error(`[Firebase.Bootstrap] ${failed.length} of 4 platform module(s) failed to initialize. See Firebase.Provider.getStatus() for detail. Failing closed — no partial success is reported as success.`);
            }
            return true;
        });

    window.CozyOS.Firebase.getVersion = () => BOOTSTRAP_VERSION;
    window.CozyOS.Firebase.ready = ready;
})();
