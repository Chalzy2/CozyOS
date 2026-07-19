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
//  This is a classic (non-ES-module) script, matching the real
//  Shell's injectScript() constraint already verified during the
//  Personal Vault migration (Platform Architecture Decision #2) —
//  it uses dynamic import() for firebase.js internally.
// ============================================================

(function () {
    "use strict";

    async function getFirebase() {
        return import("../../../firebase.js");
    }

    async function startBridge() {
        const session = window.CozyOS && window.CozyOS.Session;
        if (!session) { console.error("[FirebaseSessionBridge] Session Service is not connected — cannot bridge Firebase auth state."); return; }

        const { auth, db, doc, getDoc, onAuthStateChanged } = await getFirebase();

        onAuthStateChanged(auth, async (user) => {
            if (!user) {
                session.end();
                return;
            }
            let profileData = null;
            try {
                const snap = await getDoc(doc(db, "cozyUsers", user.uid));
                if (snap.exists()) profileData = snap.data();
            } catch (_err) {
                // Real, honest degradation: Firestore read failed (offline,
                // permissions, etc.) — still report the real, authenticated
                // uid, just without the extended profile, rather than
                // blocking sign-in entirely on a read that didn't succeed.
            }

            session.establishFromExternalAuth({
                uid: user.uid,
                cozyId: profileData?.cozyId || null,
                profile: profileData ? { name: profileData.name, email: profileData.email, phone: profileData.phone } : null,
                roles: profileData?.roles || [],
                companyId: profileData?.companyId || null,
            });
        });
    }

    if (typeof window !== "undefined") {
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startBridge);
        else startBridge();
    }
})();
