// ============================================================
//  core/firebase/firebase-firestore.js
//  CozyOS Canonical Firebase Platform — Firestore Primitives
//  Version: 1.0.0
//  Milestone: 146
//
//  OWNERSHIP
//    Owns: thin, real access to the Firestore SDK (getFirestore,
//    basic doc/collection read-write helpers). Nothing else.
//
//    Does NOT own: CozyOS's real sync/data-sync layer, which remains
//    core/modules/sync/cozy-sync.js — untouched by this milestone,
//    still the live, wired subsystem. This file is not a replacement
//    for it and is not called by it.
//
//  STATUS: Not wired into dashboard.html. Not called by cozy-sync.js
//    or anything else.
//
//  DEPENDS ON: core/firebase/firebase-config.js, core/firebase/firebase-app.js.
// ============================================================
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Firebase = window.CozyOS.Firebase || {};

    const FIRESTORE_VERSION = "1.0.0";

    if (window.CozyOS.Firebase.Firestore?.getVersion) {
        if (window.CozyOS.Firebase.Firestore.getVersion() !== FIRESTORE_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: Firebase.Firestore.");
        }
        return;
    }

    let dbInstance = null;
    let sdk = null;
    let readyResolve, readyReject;
    const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });

    async function boot() {
        const configService = window.CozyOS.Firebase && window.CozyOS.Firebase.Config;
        const appService = window.CozyOS.Firebase && window.CozyOS.Firebase.App;
        if (!configService || !appService) {
            readyReject(new Error("[Firebase.Firestore] firebase-config.js/firebase-app.js did not load first. Failing closed."));
            return;
        }
        try {
            const app = await appService.ready;
            sdk = await import(configService.sdkUrl("firebase-firestore.js"));
            dbInstance = sdk.getFirestore(app);
            readyResolve(dbInstance);
        } catch (err) {
            readyReject(err);
        }
    }

    window.CozyOS.Firebase.Firestore = Object.freeze({
        getVersion() { return FIRESTORE_VERSION; },
        ready,
        getDb() { return dbInstance; },
        isReady() { return dbInstance !== null; },

        async getDocument(collectionName, docId) {
            if (!dbInstance) return { available: false, reason: "Firestore is not ready. Failing closed." };
            try {
                const snap = await sdk.getDoc(sdk.doc(dbInstance, collectionName, docId));
                return snap.exists() ? { available: true, data: snap.data() } : { available: false, reason: "Document not found." };
            } catch (err) { return { available: false, reason: err.message || "Firestore read failed." }; }
        },
        async setDocument(collectionName, docId, data) {
            if (!dbInstance) return { available: false, reason: "Firestore is not ready. Failing closed." };
            try { await sdk.setDoc(sdk.doc(dbInstance, collectionName, docId), data); return { available: true }; }
            catch (err) { return { available: false, reason: err.message || "Firestore write failed." }; }
        }
    });

    boot();
})();
