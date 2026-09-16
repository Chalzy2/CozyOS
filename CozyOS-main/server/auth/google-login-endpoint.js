'use strict';

/**
 * server/auth/google-login-endpoint.js
 * CozyOS — Google Authentication Trust Adapter
 * Milestone: Prompt 7 — Path B (minimal Google authentication trust adapter)
 *
 * REAL SCOPE DISCLOSURE
 *   THE GAP THIS CLOSES
 *   Repo-wide search (Prompt 7 MID-2 -> Google-MID-1) confirmed: the only
 *   real HTTP server in this repository is
 *   server/live-relay/live-distribution-signaling-server.js, and that
 *   server belongs to a SEPARATE trust domain (live-streaming session
 *   tokens). login.html makes zero fetch() calls to any server endpoint.
 *   There was no general-purpose server boundary connecting the already-
 *   real Google/Firebase verification (firebase-identity-issuer.js) and
 *   account-linkage logic (core/security/google-account-linkage.js) to a
 *   network caller. This file is that boundary, and nothing else.
 *
 *   WHAT THIS FILE COMPOSES (never duplicates)
 *     - core/security/google-account-linkage.js's CozyGoogleAccountLinkage
 *       -- already performs real RS256 verification (via
 *       firebase-identity-issuer.js) AND already-tested account-linkage
 *       resolution (resolveLoginCandidate). This file does not
 *       re-implement any of that; it only exposes it over HTTP.
 *
 *   WHAT THIS FILE DOES NOT DO
 *     - Does not verify tokens itself (delegates 100% to
 *       CozyGoogleAccountLinkage -> verifyFirebaseIdToken).
 *     - Does not read userId/googleId/role/isAdmin/email/etc. from the
 *       request body as authoritative. The ONLY input trusted is the
 *       raw idToken string; every identity fact is derived from its
 *       cryptographically verified payload.
 *     - Does not create a CozyOS session itself. It returns a resolved
 *       userId (or a generic failure) to the caller; session creation
 *       remains IdentityEngine.loginWithVerifiedGoogle(userId)'s job,
 *       exactly as identity-engine.js's own header already establishes
 *       for the browser-local session model this repo uses (see
 *       identity-assertion.js's own disclosed scope: this repo's
 *       identity system is LOCAL, not networked multi-party auth).
 *     - Does not touch or repurpose live-distribution-signaling-server.js.
 *     - Does not introduce Express/Fastify/etc. Uses Node's built-in
 *       http, same primitive live-distribution-signaling-server.js
 *       already uses in this repo.
 *
 *   TRUST BOUNDARY / FAIL-CLOSED BEHAVIOR
 *     Every non-2xx path returns a GENERIC failure body
 *     ({ success:false, reason:'AUTH_FAILED' }) regardless of WHY
 *     verification/resolution failed internally (bad signature, unknown
 *     account, disabled login, etc.) so the endpoint cannot be used to
 *     enumerate which Google identities are linked to CozyOS accounts.
 *     The internal, specific reason is available only via the optional
 *     onAuthEvent(...) hook, for server-side logging — never sent to
 *     the client.
 *
 *   HONEST SCOPE
 *     SERVER CODE: locally verified (see google-login-endpoint.test.js —
 *       real loopback HTTP server, real RSA keypair, real RS256 JWT).
 *     DEPLOYMENT: NOT verified. BROWSER WIRING: NOT built this slice —
 *       login.html is untouched. INTERNET / PRODUCTION GOOGLE OAUTH:
 *       NOT verified.
 */

const http = require('http');
const { CozyGoogleAccountLinkage } = require('../../core/security/google-account-linkage');

const MAX_BODY_BYTES = 10 * 1024; // generous ceiling for a single-field JSON body; fails closed above this
const GENERIC_AUTH_FAILURE = { success: false, reason: 'AUTH_FAILED' };

function sendJson(res, statusCode, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': 'no-store',
    });
    res.end(body);
}

/**
 * readJsonBody(req) -> Promise<object>
 * Fails closed on: oversized body, invalid JSON, non-object payload.
 * Does not trust Content-Length alone (also enforces a hard byte cap
 * while streaming, so a caller cannot lie about Content-Length).
 */
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let received = 0;
        let oversized = false;
        let settled = false;
        const chunks = [];
        req.on('data', (chunk) => {
            if (oversized) return; // already over the cap; stop buffering, but let the stream drain so the response can still be written
            received += chunk.length;
            if (received > MAX_BODY_BYTES) {
                oversized = true;
                chunks.length = 0; // release what we'd buffered; we're rejecting regardless of content
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (settled) return;
            settled = true;
            if (oversized) {
                reject(Object.assign(new Error('Request body too large.'), { code: 'PAYLOAD_TOO_LARGE' }));
                return;
            }
            let parsed;
            try {
                parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            } catch (_e) {
                reject(Object.assign(new Error('Malformed JSON body.'), { code: 'BAD_JSON' }));
                return;
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                reject(Object.assign(new Error('Request body must be a JSON object.'), { code: 'BAD_JSON' }));
                return;
            }
            resolve(parsed);
        });
        req.on('error', (e) => {
            if (settled) return;
            settled = true;
            reject(e);
        });
    });
}

/**
 * createGoogleLoginRequestHandler({ linkage, onAuthEvent })
 *   linkage       REQUIRED. A real CozyGoogleAccountLinkage instance
 *                 (already composes the real verifier + a real store —
 *                 see google-account-linkage.js). Never constructed by
 *                 this file; callers own their own store/projectId.
 *   onAuthEvent   OPTIONAL. (eventName, detail) => void, for server-side
 *                 logging only. Never influences the HTTP response.
 *
 * Returns a (req, res) handler suitable for http.createServer or for
 * mounting inside a larger router, matching the request/response
 * pattern already established by live-distribution-signaling-server.js.
 */
function createGoogleLoginRequestHandler({ linkage, onAuthEvent } = {}) {
    if (!linkage || typeof linkage.resolveLoginCandidate !== 'function') {
        throw new Error('[google-login-endpoint] A real CozyGoogleAccountLinkage instance (linkage) is required.');
    }
    const emit = typeof onAuthEvent === 'function' ? onAuthEvent : () => {};

    return async function handleGoogleLoginRequest(req, res) {
        if (req.method !== 'POST') {
            emit('REJECTED', { reason: 'METHOD_NOT_ALLOWED', method: req.method });
            sendJson(res, 405, GENERIC_AUTH_FAILURE);
            return;
        }

        const contentType = String(req.headers['content-type'] || '');
        if (!contentType.toLowerCase().includes('application/json')) {
            emit('REJECTED', { reason: 'UNSUPPORTED_CONTENT_TYPE', contentType });
            sendJson(res, 415, GENERIC_AUTH_FAILURE);
            return;
        }

        let body;
        try {
            body = await readJsonBody(req);
        } catch (e) {
            const status = e.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
            emit('REJECTED', { reason: e.code || 'BAD_JSON' });
            sendJson(res, status, GENERIC_AUTH_FAILURE);
            return;
        }

        // The ONLY field ever read from the client body. Any other
        // fields (userId, googleId, role, isAdmin, email, ...) present
        // in `body` are deliberately never accessed anywhere below —
        // identity is derived exclusively from the verified idToken.
        const idToken = body.idToken;
        if (typeof idToken !== 'string' || idToken.length === 0) {
            emit('REJECTED', { reason: 'MISSING_ID_TOKEN' });
            sendJson(res, 400, GENERIC_AUTH_FAILURE);
            return;
        }

        let result;
        try {
            result = await linkage.resolveLoginCandidate(idToken);
        } catch (e) {
            emit('ERROR', { reason: 'RESOLVE_THREW', message: e && e.message });
            sendJson(res, 500, GENERIC_AUTH_FAILURE);
            return;
        }

        if (!result || result.available !== true || !result.userId) {
            // Deliberately generic: collapses GOOGLE_VERIFICATION_FAILED,
            // NO_LINKED_ACCOUNT, and GOOGLE_LOGIN_DISABLED into one
            // external response so this endpoint cannot be used to
            // enumerate which Google identities exist/are linked.
            emit('REJECTED', { reason: (result && result.reason) || 'UNKNOWN' });
            sendJson(res, 401, GENERIC_AUTH_FAILURE);
            return;
        }

        emit('SUCCESS', { userId: result.userId });
        sendJson(res, 200, { success: true, userId: result.userId });
    };
}

/**
 * GoogleAuthAdapterServer — thin http.createServer wrapper, isolated
 * from live-distribution-signaling-server.js entirely (separate
 * process/port, separate trust domain, per Prompt 7 Path B §4). Only
 * exists so this adapter can be started/stopped the same way tests
 * already start/stop the live-relay server (server.listen()/close()).
 */
class GoogleAuthAdapterServer {
    #httpServer;

    constructor({ linkage, onAuthEvent, path = '/auth/google' } = {}) {
        const handleGoogleLoginRequest = createGoogleLoginRequestHandler({ linkage, onAuthEvent });
        this.#httpServer = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://internal');
            if (url.pathname !== path) {
                sendJson(res, 404, GENERIC_AUTH_FAILURE);
                return;
            }
            handleGoogleLoginRequest(req, res);
        });
    }

    listen(port = 0, host = '127.0.0.1') {
        return new Promise((resolve) => {
            this.#httpServer.listen(port, host, () => resolve(this.#httpServer.address()));
        });
    }

    close() {
        return new Promise((resolve) => this.#httpServer.close(() => resolve()));
    }
}

module.exports = {
    createGoogleLoginRequestHandler,
    GoogleAuthAdapterServer,
    MAX_BODY_BYTES,
};
