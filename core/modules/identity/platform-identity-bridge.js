/**
 * CozyOS — Platform Identity Bridge
 * File Reference: core/modules/identity/platform-identity-bridge.js
 * Layer: Core / Platform Service — Identity & Access
 * Version: 1.0.0-ENTERPRISE-M216
 *
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS — MILESTONE 216 FINDING
 * ═══════════════════════════════════════════════════════════════════════
 *   Investigation for M216 found cozy-login-gate.js decided whether to
 *   show "Create Administrator" using IdentityEngine.listUsers().length,
 *   which is restored from IndexedDB (identity-storage.js) — storage
 *   scoped to ONE browser origin/profile. A second browser, device, or
 *   private window always has an empty IndexedDB, so it wrongly
 *   concluded no administrator exists and offered to create a second
 *   one. Administrator existence must be a PLATFORM property, not a
 *   browser property.
 *
 *   The task brief that requested this fix assumed a working backend
 *   already existed to compose. On investigation, the only real
 *   candidate — core/firebase/* (Firebase/firebase-config.js,
 *   firebase-app.js, firebase-firestore.js) — was, in its own header
 *   comments, explicitly disclosed as "Not wired into dashboard.html or
 *   any running page... zero runtime effect." Nothing loaded it. This
 *   file is the first real consumer that wires it live, exactly the
 *   "future Firebase Runtime Integration milestone" those files were
 *   already anticipating in their own comments.
 *
 * CANONICAL OWNERSHIP
 *   Owns: ONE fact — "does a CozyOS platform administrator already
 *   exist, and who are they" — as a cross-device Firestore-backed
 *   record, plus the atomic claim of that slot. Nothing else.
 *
 *   Does NOT own — and never re-implements:
 *     ✗ Credentials, password hashing, sessions, login — still 100%
 *       IdentityEngine (core/modules/identity/identity-engine.js).
 *     ✗ Raw Firestore/App/Config access — composes the existing
 *       core/firebase/* files exactly as built; adds no second
 *       Firebase App instance, no second SDK import.
 *     ✗ Login sequencing/UI — cozy-login-gate.js still owns that; this
 *       file only answers one yes/no/unknown question for it.
 *
 * ============================================================
 * HONEST, LOAD-BEARING LIMITATIONS — READ BEFORE TRUSTING THIS FILE
 * ============================================================
 *   1. REQUIRES FIRESTORE SECURITY RULES TO BE DEPLOYED MANUALLY.
 *      This file cannot deploy Firestore security rules from this
 *      environment (no console/CLI/network access here). Without real
 *      rules restricting writes to the "platform/state" document, any
 *      visitor could overwrite platform admin ownership from the
 *      browser console. The required rule is documented in this
 *      milestone's report — deploy it in the Firebase Console before
 *      relying on this file in production.
 *
 *   2. THIS SOLVES *WHICH SCREEN IS SHOWN* — NOT YET CROSS-DEVICE
 *      SIGN-IN. Even once checkAdminExists() correctly reports "yes"
 *      on a brand-new browser, that browser still has no local copy of
 *      the administrator's password hash (IdentityEngine's credential
 *      store is still IndexedDB, unchanged and untouched by this
 *      file). So a second device will correctly stop offering "Create
 *      Administrator" and correctly offer "Sign In" instead — but the
 *      administrator's password will not yet actually work there.
 *      Making credentials themselves portable across devices requires
 *      a real Firebase Authentication integration (a distinct, larger,
 *      not-yet-scoped task — see IdentityEngine's own disclosed
 *      registerIdentityProvider() extension point). Disclosed here
 *      rather than implied to be solved.
 *
 *   3. UNVERIFIED BY EXECUTION. Written to the real, documented
 *      Firestore SDK contract (getDoc/setDoc/runTransaction exactly as
 *      core/firebase/firebase-firestore.js already uses them) but this
 *      sandbox has no network egress and no real browser — it has not
 *      been run against a live Firestore project. Requires real
 *      browser + backend verification before certifying as fully
 *      working.
 */
(function () {
    "use strict";

    window.CozyOS = window.CozyOS || {};
    const BRIDGE_VERSION = "1.0.0-ENTERPRISE-M216";
    const COLLECTION = "platform";
    const DOC_ID = "state";

    if (window.CozyOS.PlatformIdentity?.getVersion) {
        if (window.CozyOS.PlatformIdentity.getVersion() !== BRIDGE_VERSION) {
            throw new Error("[CozyOS Framework Execution Error] VERSION_CONFLICT: PlatformIdentity.");
        }
        return;
    }

    /** isAvailable() — real check that the composed Firebase layer is actually loaded, never assumed. */
    function isAvailable() {
        return !!(window.CozyOS.Firebase && window.CozyOS.Firebase.Firestore && typeof window.CozyOS.Firebase.Firestore.getDocument === "function");
    }

    /**
     * checkAdminExists()
     *   Returns { determined, adminExists, adminUserId, adminUsername, reason }.
     *   `determined: false` means "could not ask the platform" (Firebase
     *   not loaded, offline, Firestore rules rejecting the read, etc.) —
     *   callers MUST treat undetermined as "unknown", never as "no admin",
     *   or a temporarily-offline second device would wrongly get offered
     *   Create Administrator again, recreating the exact bug this fixes.
     */
    async function checkAdminExists() {
        if (!isAvailable()) {
            return { determined: false, adminExists: null, reason: "core/firebase/firebase-firestore.js is not loaded — cannot ask the platform." };
        }
        const firestore = window.CozyOS.Firebase.Firestore;
        try {
            await firestore.ready;
        } catch (err) {
            return { determined: false, adminExists: null, reason: `Firestore failed to initialize: ${err && err.message}` };
        }
        const result = await firestore.getDocument(COLLECTION, DOC_ID);
        if (!result.available) {
            // A genuinely missing document is real information — it means
            // no administrator has ever claimed the platform. Anything
            // else (offline, permission-denied, etc.) is undetermined.
            if (result.reason === "Document not found.") {
                return { determined: true, adminExists: false, reason: "No platform state document yet — genuine first run." };
            }
            return { determined: false, adminExists: null, reason: result.reason };
        }
        const data = result.data || {};
        return { determined: true, adminExists: !!data.adminExists, adminUserId: data.adminUserId || null, adminUsername: data.adminUsername || null, claimedAt: data.claimedAt || null };
    }

    /**
     * claimAdministratorSlot({ userId, username })
     *   Atomic claim via Firestore's real transaction primitive
     *   (firebase-firestore.js's runTransaction, M216 addition) — the
     *   platform-level enforcement of "there must only ever be one
     *   administrator", closing the race where two devices both pass a
     *   local isBootstrap check at nearly the same moment.
     */
    async function claimAdministratorSlot({ userId, username } = {}) {
        if (!userId || !username) throw new TypeError("[PlatformIdentity] claimAdministratorSlot(): userId and username are required.");
        if (!isAvailable()) return { claimed: false, reason: "core/firebase/firebase-firestore.js is not loaded — cannot claim platform administrator." };
        const firestore = window.CozyOS.Firebase.Firestore;
        try { await firestore.ready; } catch (err) { return { claimed: false, reason: `Firestore failed to initialize: ${err && err.message}` }; }
        if (typeof firestore.runTransaction !== "function") return { claimed: false, reason: "Firestore transaction primitive is not available." };
        return firestore.runTransaction(COLLECTION, DOC_ID, (current) => {
            if (current && current.adminExists) {
                return { abort: true, reason: `Administrator already claimed by "${current.adminUsername || current.adminUserId}".` };
            }
            return { abort: false, next: { adminExists: true, adminUserId: userId, adminUsername: username, claimedAt: new Date().toISOString() } };
        });
    }

    window.CozyOS.PlatformIdentity = Object.freeze({
        getVersion() { return BRIDGE_VERSION; },
        isAvailable,
        checkAdminExists,
        claimAdministratorSlot
    });

    if (window.CozyOS.ServiceRegistry && typeof window.CozyOS.ServiceRegistry.registerCoordinator === "function") {
        try {
            window.CozyOS.ServiceRegistry.registerCoordinator({
                sourcePath: "core/modules/identity/platform-identity-bridge.js",
                name: "PlatformIdentity", category: "Platform", icon: "identity.svg",
                description: "Real, cross-device answer to 'does this platform already have an administrator', backed by Firestore (composes core/firebase/*). Does not store credentials or sessions — IdentityEngine remains the sole authority for those. Requires Firestore security rules to be deployed; requires real browser/backend verification."
            });
        } catch (_err) { /* non-fatal */ }
    }
})();
