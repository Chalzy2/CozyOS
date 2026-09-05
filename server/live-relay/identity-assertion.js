/**
 * server/live-relay/identity-assertion.js
 * CozyOS — Live Distribution — Upstream Identity Assertion
 * Milestone: STEP 4D-B Phase 6 (Authenticated Identity Bridge)
 *
 * REAL SCOPE DISCLOSURE
 *   PROBLEM THIS FIXES (found during Phase 5 continuation, not invented):
 *   Both HTTP endpoints in live-distribution-signaling-server.js
 *   (`POST /session/:id/token/:requesterId` and
 *   `POST /session/:id/register-host/:hostUserId`) took the caller's
 *   identity directly from the URL path with NO verification. Their own
 *   header comments already disclosed the assumption — "requesterId here
 *   is the ALREADY-authenticated caller's id from whatever upstream auth/
 *   identity layer fronts this endpoint" — but no such layer existed
 *   anywhere in this repository. Any caller could mint a token or
 *   register a host for ANY userId simply by putting it in the URL.
 *   That is a real, exploitable identity-spoofing gap, not a
 *   hypothetical one.
 *
 *   WHY THIS FILE DOES NOT "SOLVE" IDENTITY END TO END
 *   core/modules/identity/identity-engine.js's own header states its
 *   honest scope plainly: "LOCAL identity verification (like a
 *   single-machine app), not networked multi-party authentication — no
 *   server, no real [cross-process verification]." There is no existing
 *   server-side component anywhere in this repository that can take a
 *   browser-side IdentityEngine session and hand this Node process a
 *   verifiable claim of "this request really is user X." Building that
 *   whole bridge (e.g. a real IdentityEngine-issued, server-verifiable
 *   credential, or a Firebase Admin ID-token verification path) is a
 *   genuinely separate, larger dependency this patch does not fabricate.
 *
 *   WHAT THIS FILE ACTUALLY IS
 *   The smallest real, justified piece: a signed, verifiable, short-lived
 *   "identity assertion" token PAIR (sign/verify) that a genuine future
 *   upstream identity authority can issue, and this server can verify,
 *   using the EXACT SAME already-tested HMAC sign/verify primitive
 *   session-token.js already implements for participation tokens
 *   (composition, not duplication — Rule 2). It intentionally reuses a
 *   SEPARATE secret from the participation-token secret, because the two
 *   have different trust domains and lifetimes: an identity assertion
 *   proves "who you are" for a moment, before any session/role exists;
 *   a participation token proves "what you may do in this session,"
 *   after role resolution.
 *
 *   TRUST BOUNDARY (same shape as SessionAuthority's own, one level up)
 *   `signAssertion()` must NEVER be called from browser code and its
 *   secret must NEVER reach a client — exactly the same rule
 *   session-authority.js's own header already establishes for
 *   participation-token signing, applied one layer earlier. Until a real
 *   upstream identity authority exists to call it, this pair exists as
 *   real, tested, ready infrastructure — not as a claim that identity is
 *   fully wired end to end.
 */
'use strict';

const sessionToken = require('./session-token');

// session-token.js's payload contract requires {sessionId, role, sub}.
// An identity assertion has neither a session nor a role — these fixed
// sentinel values exist ONLY so the already-tested primitive's shape is
// satisfied; verifyAssertion() rejects any token that doesn't carry them,
// so a real participation token can never be replayed as an identity
// assertion (or vice versa).
const ASSERTION_SESSION = '_identity-assertion';
const ASSERTION_ROLE = '_identity-assertion';

/**
 * signAssertion(userId, secret, ttlSeconds) — mints a short-lived,
 * signed claim of "this is userId." Callable ONLY by a genuine upstream
 * identity authority holding `secret` server-side. Default TTL is
 * intentionally short (5 minutes): an identity assertion is meant to be
 * exchanged immediately for a session-scoped participation token, not
 * held or reused.
 */
function signAssertion(userId, secret, ttlSeconds = 300) {
    if (!userId) throw new TypeError('[identity-assertion] userId is required.');
    return sessionToken.sign({ sessionId: ASSERTION_SESSION, role: ASSERTION_ROLE, sub: userId }, secret, ttlSeconds);
}

/**
 * verifyAssertion(token, secret) -> { verified: boolean, userId?, reason? }
 * Real signature + expiry check (delegated to session-token.js's own
 * tested verify()), plus a purpose check so a token minted for a
 * different purpose (e.g. a real SessionAuthority participation token)
 * is never accepted here as an identity assertion.
 */
function verifyAssertion(token, secret) {
    const result = sessionToken.verify(token, secret);
    if (!result.valid) return { verified: false, reason: result.reason };
    if (result.payload.sessionId !== ASSERTION_SESSION || result.payload.role !== ASSERTION_ROLE) {
        return { verified: false, reason: 'Not an identity-assertion token.' };
    }
    if (!result.payload.sub) return { verified: false, reason: 'Assertion token missing subject.' };
    return { verified: true, userId: result.payload.sub };
}

/** extractBearer(req) — real header parse, no fabrication of a missing header. */
function extractBearer(req) {
    const header = req && req.headers && req.headers['authorization'];
    if (!header || typeof header !== 'string') return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match ? match[1] : null;
}

/**
 * createDefaultIdentityVerifier(secret) -> function(req)
 * Real, ready-to-use verifyIdentity implementation for
 * LiveDistributionSignalingServer's new opts.verifyIdentity seam (see
 * that file). Returns { verified:false, reason } when no bearer token is
 * present at all — fails closed, never assumes.
 */
function createDefaultIdentityVerifier(secret) {
    if (!secret) throw new TypeError('[identity-assertion] createDefaultIdentityVerifier requires a secret.');
    return function verifyIdentity(req) {
        const token = extractBearer(req);
        if (!token) return { verified: false, reason: 'Missing Authorization: Bearer <identity-assertion-token> header.' };
        return verifyAssertion(token, secret);
    };
}

module.exports = {
    signAssertion,
    verifyAssertion,
    extractBearer,
    createDefaultIdentityVerifier,
    ASSERTION_SESSION,
    ASSERTION_ROLE,
};
