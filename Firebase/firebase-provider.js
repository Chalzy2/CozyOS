// ============================================================
//  core/firebase/firebase-provider.js
//  CozyOS Canonical Firebase Platform — Capability Provider
//  Version: 1.0.0
//  Milestone: 146
//
//  OWNERSHIP
//    Owns: reporting what the Firebase platform layer has actually
//    initialized (config/app/auth/firestore/storage), for any future
//    consumer (e.g. AuthFactorRegistry) that wants to ask "is Firebase
//    available as an auth/data option" without importing every module
//    itself. Nothing else. Registers no auth factor, makes no
//    authentication decision — pure status reporting.
//
//  "ONE CANONICAL FIREBASE PROVIDER" (per milestone instruction)
//    This file is that one provider. No other file in core/firebase/
//    or elsewhere registers a second Firebase provider.
//
//  STATUS: Not wired into dashboard.html or AuthFactorRegistry.
//
//  DEPENDS ON: all other core/firebase/*.js files (reads their
//  isReady()/getVersion(), does not require them to succeed).
// ============================================================
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Firebase = window.CozyOS.Firebase || {};

    const PROVIDER_VERSION = "1.0.0";

    if (window.CozyOS.Firebase.Provider?.getVersion) {
        if (window.CozyOS.Firebase.Provider.getVersion() !== PROVIDER_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: Firebase.Provider.");
        }
        return;
    }

    function moduleStatus(name) {
        const mod = window.CozyOS.Firebase && window.CozyOS.Firebase[name];
        if (!mod) return { loaded: false, ready: false };
        return { loaded: true, ready: typeof mod.isReady === "function" ? mod.isReady() : false };
    }

    window.CozyOS.Firebase.Provider = Object.freeze({
        getVersion() { return PROVIDER_VERSION; },

        /** Real, live status — never fabricated. Reflects exactly what has loaded/initialized at call time. */
        getStatus() {
            return {
                config: moduleStatus("Config"),
                app: moduleStatus("App"),
                auth: moduleStatus("Auth"),
                firestore: moduleStatus("Firestore"),
                storage: moduleStatus("Storage")
            };
        },
        isFullyReady() {
            const s = this.getStatus();
            return s.config.loaded && s.app.ready && s.auth.ready && s.firestore.ready && s.storage.ready;
        }
    });
})();
