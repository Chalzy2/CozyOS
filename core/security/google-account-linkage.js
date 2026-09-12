'use strict';

/**
 * core/security/google-account-linkage.js
 * CozyOS — Google Account Linkage (the missing Google authenticator)
 * Milestone: Prompt 7 — "Google authenticator dependency"
 * Version: 1.0.0-ENTERPRISE
 *
 * WHY THIS FILE EXISTS (repo search performed first)
 *   Searched the whole tree for: google, google-auth, firebase, OAuth,
 *   signInWithGoogle, authenticator, factor-provider, registerBackend.
 *   Result: TWO real pieces already exist, and NEITHER is duplicated
 *   here —
 *     1. core/security/google-account-provider.js — the browser-side
 *        factor-provider coordinator (built on factor-provider-base.js).
 *        It already has a real registerBackend(verifyFn) hook; it just
 *        has never had a real verifyFn plugged in ("no real OAuth
 *        round-trip is implemented" — its own header).
 *     2. server/live-relay/firebase-identity-issuer.js —
 *        verifyFirebaseIdToken(idToken, {projectId, fetchGoogleCerts}),
 *        a REAL, already-tested, cryptographic RS256 verifier against
 *        Google's own published public certs. It was built for the
 *        live-relay identity-assertion seam, not for CozyOS account
 *        login — but the verification logic itself is exactly what a
 *        Google login factor needs, and Firebase/firebase-config.js
 *        already carries this repo's one real Firebase project id
 *        ("cozycabin-affiliate").
 *   The genuinely missing piece was never "verify a Google ID token" —
 *   that already existed. The missing piece was the account-linkage
 *   boundary: turning an already-verified Google identity into durable
 *   CozyOS account state, and resolving a verified identity back to a
 *   CozyOS account at login time. That is this file's only job — the
 *   exact same shape of gap phone-account-linkage.js closed for phone,
 *   built the same way (a small store-adapter-based module, not a
 *   second identity engine).
 *
 * WHAT THIS FILE DOES NOT DO
 *   - Does not re-implement JWT/RS256 verification, certificate
 *     fetching, or any cryptography — 100% delegated to
 *     verifyFirebaseIdToken(). This file cannot mark a Google identity
 *     verified; only a real signature check can.
 *   - Does not create a second Google engine, a second Firebase client,
 *     or a second OAuth flow.
 *   - Does not link accounts by email-matching alone (Prompt 7 §5) —
 *     linkAccount() always requires an already-authenticated CozyOS
 *     userId (the caller's own real session), never an anonymous
 *     "log me in as whoever owns this email" path.
 *   - Does not touch IdentityEngine's private #users map — composes it
 *     through the same getRecord/setRecord/find-by-key adapter shape
 *     phone-account-linkage.js already established.
 *
 * ACCOUNT-TAKEOVER GUARDS
 *   - linkAccount() rejects (fail-closed, no enumeration) when the
 *     verified Google uid is already linked to a DIFFERENT CozyOS
 *     account — never silently re-links or merges accounts.
 *   - resolveLoginCandidate() (the login-time path) never falls back to
 *     email matching when a verified-but-unlinked Google identity is
 *     presented — it returns NO_LINKED_ACCOUNT, full stop.
 *   - The email claim is only ever read from a token AFTER
 *     verifyFirebaseIdToken() has already returned verified:true for
 *     that exact token — extractEmailFromVerifiedToken() re-verifies
 *     nothing; it decodes an already-trusted payload.
 *
 * WHY THIS IS A SERVER-SIDE MODULE, NOT UMD/browser
 *   Google ID token signature verification requires Google's private
 *   signing keys never being involved and Google's PUBLIC certs being
 *   fetched over a real HTTPS boundary and checked with Node's `crypto`
 *   — exactly what firebase-identity-issuer.js already does, and exactly
 *   why that file is plain Node too (no `window` usage anywhere in it).
 *   This file composes it the same way. The browser-side half of this
 *   integration (calling Firebase Auth's real signInWithGoogle() to
 *   obtain an ID token, then POSTing it to a server endpoint that calls
 *   this file) is NOT built this slice — see HONEST SCOPE.
 *
 * HONEST SCOPE
 *   LINKAGE / LOOKUP LOGIC: locally verified against the REAL
 *     verifyFirebaseIdToken() (genuine RSA keypair, genuine RS256
 *     signature, injected fetchGoogleCerts standing in for Google's
 *     endpoint — see google-account-linkage.test.js) — not synthetic
 *     stand-ins for the crypto itself.
 *   SERVER HTTP ENDPOINT: NOT built this slice. No server framework
 *     exists in this repo's main application (only the standalone
 *     live-relay signaling server has one) — wiring an actual
 *     HTTP route that receives the browser's ID token is next-slice
 *     work, not fabricated here.
 *   BROWSER WIRING (Firebase signInWithGoogle() -> POST -> here ->
 *     GoogleAccountProvider.registerBackend()): NOT exercised — no
 *     browser/DOM exists in this sandbox. login.html/Settings-Security
 *     are UNTOUCHED this slice.
 *   IDENTITYENGINE SESSION CREATION: real,
 *     see identity-engine.js#loginWithVerifiedGoogle(), mirroring the
 *     existing loginWithVerifiedPasskey() precedent exactly.
 */
const { verifyFirebaseIdToken } = require('../../server/live-relay/firebase-identity-issuer');

const GOOGLE_LINKAGE_VERSION = '1.0.0-ENTERPRISE';

function b64urlDecode(str) {
    str = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64');
}

/**
 * extractEmailFromVerifiedToken(idToken)
 *   Decode-ONLY. Never used to establish trust by itself — callers must
 *   only invoke this after verifyFirebaseIdToken() has already returned
 *   verified:true for this exact token, so the signature covering this
 *   payload (including the email claim) has already been cryptographically
 *   checked. This function performs no verification of its own.
 */
function extractEmailFromVerifiedToken(idToken) {
    try {
        const parts = String(idToken).split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
        return typeof payload.email === 'string' ? payload.email : null;
    } catch (_e) {
        return null;
    }
}

function emptyRecord() {
    return { googleUid: null, googleEmail: null, googleLinked: false, googleLinkedAt: null, googleLoginEnabled: false };
}

/**
 * InMemoryGoogleLinkageStore — minimal reference adapter, same role as
 * phone-account-linkage.js's InMemoryPhoneLinkageStore. A real caller
 * (IdentityEngine's own composition) should supply a store backed by
 * its real account records instead.
 */
class InMemoryGoogleLinkageStore {
    #records = new Map(); // userId -> record

    getRecord(userId) { return this.#records.has(userId) ? { ...this.#records.get(userId) } : null; }
    setRecord(userId, record) { this.#records.set(userId, { ...record }); }
    findUserIdByGoogleUid(uid) {
        for (const [userId, record] of this.#records.entries()) {
            if (record.googleLinked && record.googleUid === uid) return userId;
        }
        return null;
    }
}

class CozyGoogleAccountLinkage {
    #store;
    #projectId;
    #verify;
    #fetchGoogleCerts;

    constructor({ store, projectId, verify, fetchGoogleCerts } = {}) {
        if (!store || typeof store.getRecord !== 'function' || typeof store.setRecord !== 'function' || typeof store.findUserIdByGoogleUid !== 'function') {
            throw new Error('[GoogleAccountLinkage] A real store adapter (getRecord/setRecord/findUserIdByGoogleUid) is required.');
        }
        if (!projectId) throw new Error('[GoogleAccountLinkage] projectId is required.');
        this.#store = store;
        this.#projectId = projectId;
        this.#verify = verify || verifyFirebaseIdToken; // real by default; injectable only for tests
        this.#fetchGoogleCerts = fetchGoogleCerts || null;
    }

    getVersion() { return GOOGLE_LINKAGE_VERSION; }

    #verifyOpts() {
        const opts = { projectId: this.#projectId };
        if (this.#fetchGoogleCerts) opts.fetchGoogleCerts = this.#fetchGoogleCerts;
        return opts;
    }

    /**
     * linkAccount(userId, idToken)
     *   Real. Requires an already-authenticated userId — this is an
     *   account-linking action performed by a signed-in user connecting
     *   Google to their EXISTING account, never an anonymous flow and
     *   never an automatic match-by-email (Prompt 7 §5). Only a real,
     *   signature-verified ID token can ever set googleLinked:true.
     */
    async linkAccount(userId, idToken) {
        if (!userId) return { linked: false, reason: 'AUTH_REQUIRED' };
        const result = await this.#verify(idToken, this.#verifyOpts());
        if (!result || result.verified !== true) return { linked: false, reason: 'GOOGLE_VERIFICATION_FAILED' };

        const existingOwner = this.#store.findUserIdByGoogleUid(result.uid);
        if (existingOwner && existingOwner !== userId) {
            // Real account-takeover guard (Prompt 7 §5) — this Google
            // identity is already linked to a DIFFERENT CozyOS account.
            // Fail closed; never silently re-link or merge accounts.
            return { linked: false, reason: 'GOOGLE_ALREADY_LINKED' };
        }

        const record = {
            googleUid: result.uid,
            googleEmail: extractEmailFromVerifiedToken(idToken),
            googleLinked: true,
            googleLinkedAt: new Date().toISOString(),
            googleLoginEnabled: true
        };
        this.#store.setRecord(userId, record);
        return { linked: true, googleUid: record.googleUid, googleEmail: record.googleEmail };
    }

    /** getGoogleState(userId) — real, current state; never fabricates a linked flag the store doesn't actually hold. */
    getGoogleState(userId) {
        if (!userId) return emptyRecord();
        return this.#store.getRecord(userId) || emptyRecord();
    }

    /** unlinkAccount(userId) — real; resets all derived flags so a stale link can never linger as a usable login factor. */
    unlinkAccount(userId) {
        if (!userId) return { success: false, reason: 'AUTH_REQUIRED' };
        this.#store.setRecord(userId, emptyRecord());
        return { success: true };
    }

    /** isGoogleLoginUsable(userId) — real; true only when a real, verified link exists AND login is enabled for it. */
    isGoogleLoginUsable(userId) {
        const state = this.getGoogleState(userId);
        return !!(state.googleLinked && state.googleLoginEnabled);
    }

    /**
     * resolveLoginCandidate(idToken)
     *   Real login-time entry point. Verifies the token (real signature
     *   check — never trusts a client-declared uid/email/verified flag),
     *   then looks up which CozyOS account (if any) has that Google
     *   identity linked. Never creates an account and never falls back
     *   to email matching — an unlinked-but-cryptographically-valid
     *   Google identity returns NO_LINKED_ACCOUNT, not a login.
     */
    async resolveLoginCandidate(idToken) {
        const result = await this.#verify(idToken, this.#verifyOpts());
        if (!result || result.verified !== true) return { available: false, reason: 'GOOGLE_VERIFICATION_FAILED' };
        const userId = this.#store.findUserIdByGoogleUid(result.uid);
        if (!userId) return { available: false, reason: 'NO_LINKED_ACCOUNT' };
        if (!this.isGoogleLoginUsable(userId)) return { available: false, reason: 'GOOGLE_LOGIN_DISABLED' };
        return { available: true, userId };
    }

    getDiagnosticsReport() {
        return { moduleVersion: GOOGLE_LINKAGE_VERSION, projectId: this.#projectId };
    }
}

module.exports = {
    CozyGoogleAccountLinkage,
    InMemoryGoogleLinkageStore,
    GOOGLE_LINKAGE_VERSION,
    extractEmailFromVerifiedToken
};
