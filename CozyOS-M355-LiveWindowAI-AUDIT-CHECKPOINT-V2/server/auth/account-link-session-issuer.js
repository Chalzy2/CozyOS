'use strict';

/**
 * server/auth/account-link-session-issuer.js
 * CozyOS — Account-Link Session Issuer
 * Milestone: Prompt 10 (Browser -> Server Account Linkage boundary)
 * Version: 1.0.0-ENTERPRISE
 *
 * HONEST SECURITY MODEL — READ THIS BEFORE RELYING ON THIS FILE
 *   This is deliberately NOT full server-side authentication of a
 *   CozyOS account (this repo has none — CozyOS accounts are entirely
 *   browser-local, protected by the user's local passkey/password;
 *   nothing about them has ever been server-verifiable, confirmed by
 *   repo-wide search this milestone). What this file actually
 *   provides is narrower and is stated precisely:
 *
 *   issue(userId) mints a random, unguessable (32-byte,
 *   crypto.randomBytes) bearer token and durably associates it with
 *   whatever userId string was presented, for a short TTL. The
 *   PROOF that the caller is genuinely that account rests entirely on
 *   userId itself being unguessable — and it is: identity-engine.js's
 *   #generateId() (confirmed by direct inspection this milestone)
 *   builds every account id from crypto.randomUUID(), never from the
 *   user-chosen login username. Presenting that internal id is
 *   already equivalent, in practice, to proving local control of that
 *   account's browser storage — the same implicit trust boundary this
 *   entire local-first app already rests on (anyone with read access
 *   to a user's IndexedDB already fully controls that account,
 *   independent of anything in this file).
 *
 *   What THIS FILE adds on top of that baseline: (1) the resulting
 *   session token, once issued, is what every subsequent mutating
 *   request must present — the userId itself is never re-read from
 *   any subsequent request body as authority (closes Prompt 10 §6's
 *   "never accept a client-supplied userId on the mutating request"
 *   requirement); (2) the token is short-lived and single-use for the
 *   actual link mutation (consumed via the store's delete(), reducing
 *   replay window to one successful use or TTL expiry, whichever is
 *   first); (3) only a hash of the token is ever persisted (see
 *   account-link-session-store.js).
 *
 *   WHAT THIS FILE DOES NOT PROVIDE: protection against a party that
 *   has obtained a user's internal account id through some other
 *   means (e.g. a compromised browser, a leaked export). A stronger
 *   design would bind session issuance to a genuine local
 *   cryptographic proof (e.g. a WebAuthn assertion verified against a
 *   public key the server has previously been given) — no such
 *   public-key registration exists anywhere in this repo today, and
 *   building it is a real, separate architecture decision, disclosed
 *   as a known limitation rather than silently built here.
 */

const crypto = require('crypto');

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes — short-lived by design

class AccountLinkSessionIssuer {
    #store;
    #ttlMs;

    constructor({ store, ttlMs = DEFAULT_TTL_MS } = {}) {
        if (!store || typeof store.put !== 'function' || typeof store.get !== 'function' || typeof store.delete !== 'function') {
            throw new Error('[AccountLinkSessionIssuer] A real store (put/get/delete) is required.');
        }
        this.#store = store;
        this.#ttlMs = ttlMs;
    }

    getVersion() { return '1.0.0-ENTERPRISE'; }

    /**
     * issue(userId) — real. Mints a fresh, unguessable token, persists
     * only its hash (never the raw value) bound to the presented
     * userId, and returns the raw token exactly once — the caller
     * (the browser, immediately after minting) is the only party that
     * will ever see it in plaintext.
     */
    issue(userId) {
        if (!userId || typeof userId !== 'string') {
            throw new Error('[AccountLinkSessionIssuer] A real userId string is required.');
        }
        const rawToken = crypto.randomBytes(32).toString('base64url');
        const tokenHash = this.#store.constructor.hashToken
            ? this.#store.constructor.hashToken(rawToken)
            : crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
        const now = Date.now();
        const expiresAt = now + this.#ttlMs;
        this.#store.put(tokenHash, { userId, createdAt: now, expiresAt });
        return { token: rawToken, expiresAt };
    }

    /**
     * resolve(rawToken, { consume = false } = {}) -> userId | null
     *   Real, fail-closed lookup. Returns null (never throws) for any
     *   missing, unknown, or expired token — callers must treat null
     *   as SESSION_INVALID, a generic external failure, exactly like
     *   this repo's existing Google-verification failure convention
     *   (never leaking which specific reason it failed for).
     *   consume:true deletes the token after a successful resolve —
     *   used for the actual link mutation so a captured token cannot
     *   be replayed for a second link attempt.
     */
    resolve(rawToken, { consume = false } = {}) {
        if (!rawToken || typeof rawToken !== 'string') return null;
        const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
        const record = this.#store.get(tokenHash);
        if (!record) return null;
        if (!record.expiresAt || record.expiresAt <= Date.now()) {
            this.#store.delete(tokenHash); // real cleanup of an expired token on touch
            return null;
        }
        if (consume) this.#store.delete(tokenHash);
        return record.userId;
    }
}

module.exports = { AccountLinkSessionIssuer, DEFAULT_TTL_MS };
