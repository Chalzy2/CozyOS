// ============================================================
//  core/firebase/firebase-firestore.js
//  CozyOS Canonical Firebase Platform — Firestore Primitives
//  Version: 1.1.0
//  Milestone: 146 (base), 362 Stage 1 (real-time listener addition)
//
//  OWNERSHIP
//    Owns: thin, real access to the Firestore SDK (getFirestore,
//    basic doc/collection read-write helpers, and now a real-time
//    listener). Nothing else.
//
//    Does NOT own: CozyOS's real sync/data-sync layer, which remains
//    core/modules/sync/cozy-sync.js — untouched by this milestone,
//    still the live, wired subsystem. This file is not a replacement
//    for it and is not called by it.
//
//  STATUS: Live-wired in dashboard.html since Milestone 216 (see that
//    milestone's report — this file's own original "not wired" note
//    predates that integration and is now stale as a historical
//    artifact of when this file was first written, not a current fact).
//
//  MILESTONE 362 STAGE 1 ADDITION
//    subscribeToDocument(collectionName, docId, callback) — real-time
//    listener via the same SDK's own onSnapshot() export, added for the
//    Living Direct Communication Engine's signaling bridge (needs to
//    react to a peer's SDP offer/answer immediately, not poll). getDoc/
//    setDoc/runTransaction above are unchanged, byte-identical.
//
//  DEPENDS ON: core/firebase/firebase-config.js, core/firebase/firebase-app.js.
// ============================================================
(function () {
    "use strict";
    window.CozyOS = window.CozyOS || {};
    window.CozyOS.Firebase = window.CozyOS.Firebase || {};

    const FIRESTORE_VERSION = "1.1.0";

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
        },

        /**
         * runTransaction(collectionName, docId, decisionFn) — Milestone 216
         * addition. Real, atomic read-then-write on a single document via
         * the Firestore SDK's own runTransaction(), so two devices racing
         * to claim the same document (e.g. "is there already a platform
         * administrator?") can't both win. decisionFn receives the
         * current document data (or null if it doesn't exist yet) and
         * must return either { abort: true, reason } to cancel with no
         * write, or { abort: false, next } to atomically write `next`.
         * Never a second transaction implementation elsewhere — this is
         * the one real primitive for that need in this platform layer.
         */
        async runTransaction(collectionName, docId, decisionFn) {
            if (!dbInstance) return { claimed: false, reason: "Firestore is not ready. Failing closed." };
            try {
                const written = await sdk.runTransaction(dbInstance, async (tx) => {
                    const ref = sdk.doc(dbInstance, collectionName, docId);
                    const snap = await tx.get(ref);
                    const current = snap.exists() ? snap.data() : null;
                    const decision = decisionFn(current);
                    if (!decision || decision.abort) {
                        throw new Error((decision && decision.reason) || "Transaction aborted by caller.");
                    }
                    tx.set(ref, decision.next);
                    return decision.next;
                });
                return { claimed: true, data: written };
            } catch (err) {
                return { claimed: false, reason: err.message || "Transaction failed." };
            }
        },

        /**
         * subscribeToDocument(collectionName, docId, callback) — Milestone
         * 362 (LDCE Stage 1) addition. Real-time listener, composing the
         * same dynamically-imported modular Firestore SDK's own
         * `onSnapshot()` export — not a second real-time mechanism, and
         * not a polling loop pretending to be one. `getDocument()`/
         * `setDocument()` above remain untouched; this is a pure addition
         * for callers (e.g. LDCE's signaling bridge) that need to react
         * the moment a peer writes an SDP offer/answer, rather than
         * polling. Returns a real unsubscribe function; callers own
         * calling it when done listening — this file never leaks a
         * dangling listener on its own.
         */
        subscribeToDocument(collectionName, docId, callback) {
            if (!dbInstance || !sdk || typeof sdk.onSnapshot !== "function") {
                return { available: false, reason: "Firestore is not ready, or this SDK build has no onSnapshot export. Failing closed.", unsubscribe: () => {} };
            }
            try {
                const ref = sdk.doc(dbInstance, collectionName, docId);
                const unsubscribe = sdk.onSnapshot(ref, (snap) => {
                    callback(snap.exists() ? { available: true, data: snap.data() } : { available: false, reason: "Document not found." });
                }, (err) => {
                    callback({ available: false, reason: err.message || "Firestore listener error." });
                });
                return { available: true, unsubscribe };
            } catch (err) {
                return { available: false, reason: err.message || "Could not attach a real Firestore listener.", unsubscribe: () => {} };
            }
        }
    });

    boot();
})();
