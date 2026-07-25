// ============================================================
//  core/firebase/firebase-config.js
//  CozyOS Canonical Firebase Platform — Configuration
//  Version: 1.0.0
//  Milestone: 146
//
//  OWNERSHIP
//    Owns: the ONE canonical Firebase project configuration object
//    for CozyOS. Nothing else.
//
//  STATUS: Not wired into dashboard.html or any running page.
//    Creating this file does not change runtime behavior.
//
//  KNOWN DUPLICATION (flagged, not fixed, in this milestone)
//    Firebase/firebase.js already contains a live copy of these same
//    values ("Cozycabin Shared Firebase Config", project
//    cozycabin-affiliate). That file is itself dormant in this repo
//    (its own listed consumers — cozy-id.js, cozy-items.js,
//    cozy-wallet.js, cozy-leads.js, cozy-contacts.js, cozy-chat.js —
//    do not exist anywhere in this codebase). This file is copied
//    from the same real project, not fabricated. A future Firebase
//    Runtime Integration milestone must retire Firebase/firebase.js
//    in favor of this file as the single source — not run both.
// ============================================================
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Firebase = window.CozyOS.Firebase || {};

    const FIREBASE_CONFIG_VERSION = "1.0.0";

    /** The one canonical config object. Same real project as Firebase/firebase.js. */
    const firebaseConfig = Object.freeze({
        apiKey: "AIzaSyDToZQ-f31ZA2RmPWNKZ4DTtVjyj-toMW0",
        authDomain: "cozycabin-affiliate.firebaseapp.com",
        projectId: "cozycabin-affiliate",
        storageBucket: "cozycabin-affiliate.firebasestorage.app",
        messagingSenderId: "765281276271",
        appId: "1:765281276271:web:1368fb340b1fb68a01189a",
        measurementId: "G-NFYX4TH0H7"
    });

    /** Canonical SDK version pin. Firebase/firebase.js uses 10.7.1; core/sync.js
     *  (dormant, bypasses the bridge) uses a mismatched 10.0.0. This platform
     *  standardizes on 10.7.1 — the version the real, working config already uses. */
    const SDK_VERSION = "10.7.1";
    const SDK_BASE_URL = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

    window.CozyOS.Firebase.Config = Object.freeze({
        getVersion() { return FIREBASE_CONFIG_VERSION; },
        getConfig() { return firebaseConfig; },
        getSdkVersion() { return SDK_VERSION; },
        getSdkBaseUrl() { return SDK_BASE_URL; },
        sdkUrl(moduleName) { return `${SDK_BASE_URL}/${moduleName}`; }
    });
})();
