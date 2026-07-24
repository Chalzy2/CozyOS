// ============================================================
//  core/firebase/firebase-app.js
//  CozyOS Canonical Firebase Platform — App Instance
//  Version: 1.0.0
//  Milestone: 146
//
//  OWNERSHIP
//    Owns: the ONE canonical Firebase App instance for CozyOS
//    (initializeApp()). Nothing else may call initializeApp().
//
//  STATUS: Not wired into dashboard.html or any running page. This
//    file has zero runtime effect until something actually loads it
//    with a <script> tag — which no page does yet.
//
//  KNOWN DUPLICATION (flagged, not fixed, in this milestone)
//    Firebase/firebase.js already calls initializeApp() once, for the
//    same real project. That call is real but currently orphaned (its
//    only importer, core/sync.js, is itself unloaded by any HTML). A
//    future Firebase Runtime Integration milestone must retire that
//    initializeApp() call in favor of this one — never run both at
//    once, or CozyOS would have two live Firebase App instances for
//    the same project, which the SDK itself does not cleanly support
//    under the default app name.
//
//  DEPENDS ON: core/firebase/firebase-config.js (must load first).
// ============================================================
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Firebase = window.CozyOS.Firebase || {};

    const APP_VERSION = "1.0.0";

    if (window.CozyOS.Firebase.App?.getVersion) {
        if (window.CozyOS.Firebase.App.getVersion() !== APP_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: Firebase.App.");
        }
        return;
    }

    let appInstance = null;
    let readyResolve, readyReject;
    const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });

    async function boot() {
        const configService = window.CozyOS.Firebase && window.CozyOS.Firebase.Config;
        if (!configService) {
            const err = new Error("[Firebase.App] core/firebase/firebase-config.js did not load first. Failing closed — no app initialized.");
            readyReject(err);
            return;
        }
        try {
            const { initializeApp } = await import(configService.sdkUrl("firebase-app.js"));
            appInstance = initializeApp(configService.getConfig());
            readyResolve(appInstance);
        } catch (err) {
            // Fail closed: never fabricate a working app instance.
            readyReject(err);
        }
    }

    window.CozyOS.Firebase.App = Object.freeze({
        getVersion() { return APP_VERSION; },
        /** Resolves with the real Firebase App instance, or rejects — never fabricates success. */
        ready,
        /** Synchronous accessor. Returns null until `ready` has resolved. */
        getApp() { return appInstance; },
        isReady() { return appInstance !== null; }
    });

    boot();
})();
