// ============================================================
//  Firebase Session Bridge
//  File Reference: core/modules/session/firebase-session-bridge.js
//  Version: 1.0.0
//
//  The one, real, optional file in this platform that knows about
//  Firebase Auth. Session Service itself (cozy-session-service.js)
//  is deliberately unaware of Firebase or any other specific auth
//  provider — this bridge is what translates Firebase's real
//  onAuthStateChanged into Session Service's generic
//  establishFromExternalAuth()/end() calls.
//
//  WHY THIS IS SEPARATE FROM SESSION SERVICE ITSELF
//  ------------------------------------------------------------
//  Rule 3 (Engines Own Their Domain): Session Service owns *session
//  state*. Which specific external system authenticated someone is
//  a different concern — today it's Firebase; tomorrow it could be
//  a different provider, or the CozyOS-native IdentityEngine could
//  become primary. Keeping this translation in its own file means
//  swapping or removing the auth provider never touches Session
//  Service's own code.
//
//  REAL, HONEST BEHAVIOR
//  ------------------------------------------------------------
//  On a genuine Firebase sign-in, this bridge reads the real user's
//  Firestore profile (from the existing "cozyUsers" collection —
//  the same one cozy-id.js already writes to) and reports it to
//  Session Service. It never fabricates a cozyId/profile if the
//  Firestore document doesn't exist — it reports what's real.
//
//  MILESTONE 220 — REAL BUG FIX (broken import removed)
//  ------------------------------------------------------------
//  This file previously did `import("../../../firebase.js")` — a
//  file that does not exist anywhere in this repository. Wiring
//  this bridge into dashboard.html (Milestone 132a) turned that
//  from a dormant defect into a live one: onAuthStateChanged would
//  never fire because getFirebase() rejected on every load.
//
//  Real fix: this bridge now composes the SAME canonical Firebase
//  layer core/firebase/* that dashboard.html already loads and that
//  platform-identity-bridge.js already composes the same way —
//  window.CozyOS.Firebase.Auth (Milestone 146/216b) and
//  window.CozyOS.Firebase.Firestore (Milestone 146/216). No second
//  Firebase App instance, no second SDK import, no second Firestore
//  handle — getAuthInstance()/getDocument() are the only calls made
//  here, both already real and already used elsewhere in this
//  platform. This is still the ONLY file that translates Firebase
//  auth state into Session Service's generic
//  establishFromExternalAuth()/end() calls — not duplicated.
// ============================================================

(function () {
    "use strict";

    async function startBridge() {
        const session = window.CozyOS && window.CozyOS.Session;
        if (!session) { console.error("[FirebaseSessionBridge] Session Service is not connected — cannot bridge Firebase auth state."); return; }

        const authService = window.CozyOS && window.CozyOS.Firebase && window.CozyOS.Firebase.Auth;
        const firestoreService = window.CozyOS && window.CozyOS.Firebase && window.CozyOS.Firebase.Firestore;
        if (!authService || !firestoreService) {
            console.error("[FirebaseSessionBridge] core/firebase/firebase-auth.js and/or core/firebase/firebase-firestore.js did not load first — cannot bridge Firebase auth state. Failing closed.");
            return;
        }

        // Real wait, never assumed: both composed services expose a real
        // `ready` promise (Milestone 146) that resolves only once the
        // actual Firebase SDK has initialized. If either rejects (offline,
        // bad config, blocked network), this bridge honestly stays
        // inactive rather than throwing on a null instance.
        try {
            await authService.ready;
            await firestoreService.ready;
        } catch (err) {
            console.error("[FirebaseSessionBridge] Firebase Auth/Firestore failed to initialize — bridge inactive.", err && err.message);
            return;
        }

        authService.onAuthStateChanged(async (user) => {
            if (!user) {
                session.end();
                return;
            }
            let profileData = null;
            const doc = await firestoreService.getDocument("cozyUsers", user.uid);
            if (doc.available) profileData = doc.data;
            // Real, honest degradation: a Firestore read failure or a
            // genuinely-missing profile document both fall through here —
            // still report the real, authenticated uid, just without the
            // extended profile, rather than blocking sign-in entirely on
            // a read that didn't succeed or hasn't been created yet.

            let roles = Array.isArray(profileData?.roles) ? profileData.roles.slice() : [];
            // Milestone 220b — real fix: cozyUsers/{uid}.roles and the
            // platform/state doc platform-identity-bridge.js writes at
            // claim time are two different Firestore documents. Without
            // this, a real platform administrator who claimed the slot
            // but never separately got roles written onto their cozyUsers
            // profile would sign in via Firebase and be reported with an
            // empty roles array — honestly correct per that one document,
            // but not what "is this the platform administrator" actually
            // means. This composes the existing, already-real
            // PlatformIdentity.checkAdminExists() (never a second
            // Firestore read implementation) and only adds the role if
            // the platform itself confirms this exact uid holds the slot.
            const platformIdentity = window.CozyOS.PlatformIdentity;
            if (platformIdentity && typeof platformIdentity.checkAdminExists === "function") {
                try {
                    const platformResult = await platformIdentity.checkAdminExists();
                    if (platformResult.determined && platformResult.adminExists && platformResult.adminUserId === user.uid && !roles.includes("platform-admin")) {
                        roles.push("platform-admin");
                    }
                } catch (err) {
                    console.warn("[FirebaseSessionBridge] PlatformIdentity check failed — roles reflect only the cozyUsers profile document.", err && err.message);
                }
            }

            session.establishFromExternalAuth({
                uid: user.uid,
                cozyId: profileData?.cozyId || null,
                profile: profileData ? { name: profileData.name, email: profileData.email, phone: profileData.phone } : null,
                roles,
                companyId: profileData?.companyId || null,
            });
        });
    }

    if (typeof window !== "undefined") {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startBridge);
        else startBridge();
    }
})();
