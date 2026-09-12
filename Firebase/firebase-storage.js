// ============================================================
//  core/firebase/firebase-storage.js
//  CozyOS Canonical Firebase Platform — Storage Primitives
//  Version: 1.0.0
//  Milestone: 146
//
//  OWNERSHIP
//    Owns: thin, real access to Firebase Storage (getStorage,
//    upload/getDownloadURL helpers). Nothing else.
//
//  NEW CAPABILITY, HONESTLY LABELED
//    Neither Firebase/firebase.js nor core/sync.js ever imported
//    Storage. This is genuinely new surface, not a migration of
//    anything that previously worked. No code anywhere calls it yet.
//
//  STATUS: Not wired into dashboard.html. Not called by anything.
//
//  DEPENDS ON: core/firebase/firebase-config.js, core/firebase/firebase-app.js.
// ============================================================
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Firebase = window.CozyOS.Firebase || {};

    const STORAGE_VERSION = "1.0.0";

    if (window.CozyOS.Firebase.Storage?.getVersion) {
        if (window.CozyOS.Firebase.Storage.getVersion() !== STORAGE_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: Firebase.Storage.");
        }
        return;
    }

    let storageInstance = null;
    let sdk = null;
    let readyResolve, readyReject;
    const ready = new Promise((res, rej) => { readyResolve = res; readyReject = rej; });

    async function boot() {
        const configService = window.CozyOS.Firebase && window.CozyOS.Firebase.Config;
        const appService = window.CozyOS.Firebase && window.CozyOS.Firebase.App;
        if (!configService || !appService) {
            readyReject(new Error("[Firebase.Storage] firebase-config.js/firebase-app.js did not load first. Failing closed."));
            return;
        }
        try {
            const app = await appService.ready;
            sdk = await import(configService.sdkUrl("firebase-storage.js"));
            storageInstance = sdk.getStorage(app);
            readyResolve(storageInstance);
        } catch (err) {
            readyReject(err);
        }
    }

    window.CozyOS.Firebase.Storage = Object.freeze({
        getVersion() { return STORAGE_VERSION; },
        ready,
        getStorageInstance() { return storageInstance; },
        isReady() { return storageInstance !== null; },

        async uploadFile(path, file) {
            if (!storageInstance) return { available: false, reason: "Storage is not ready. Failing closed." };
            try {
                const fileRef = sdk.ref(storageInstance, path);
                await sdk.uploadBytes(fileRef, file);
                const url = await sdk.getDownloadURL(fileRef);
                return { available: true, url };
            } catch (err) { return { available: false, reason: err.message || "Storage upload failed." }; }
        }
    });

    boot();
})();
