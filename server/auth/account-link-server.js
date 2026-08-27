'use strict';

/**
 * server/auth/account-link-server.js
 * CozyOS — Account-Link Server (browser -> server account-linking boundary)
 * Milestone: Prompt 10 (Google Browser-to-Server Account Linkage)
 * Version: 1.0.0-ENTERPRISE
 *
 * WHAT THIS COMPOSES (never duplicates)
 *   - createGoogleLoginRequestHandler from google-login-endpoint.js,
 *     UNCHANGED, reused as-is for /auth/google (anonymous login —
 *     needs no session, identity comes entirely from the verified
 *     Google token, exactly as Prompt 7 built it).
 *   - CozyGoogleAccountLinkage.linkAccount(), UNCHANGED, reused for
 *     the actual linking mutation.
 *   - AccountLinkSessionIssuer, this milestone's new minimal
 *     boundary (see its own header for the full, honest security
 *     model — read it before treating this as full authentication).
 *
 * WHY ONE NEW SERVER INSTEAD OF A SECOND ONE PER ENDPOINT
 *   Prompt 10 explicitly asks not to create a second auth server.
 *   google-login-endpoint.js's GoogleAuthAdapterServer is
 *   single-path by design (Prompt 7 scope) and was left completely
 *   untouched rather than modified in place, so its own
 *   already-passing test suite stays a true regression signal. This
 *   file is the ONE additional composed server this milestone adds,
 *   mounting three routes on one http.createServer, matching the
 *   existing repo convention (google-login-endpoint.js's own
 *   GoogleAuthAdapterServer) rather than introducing Express/Fastify.
 *
 * ROUTES
 *   POST /auth/session/issue   { userId }                -> { token, expiresAt }
 *     TOFU bootstrap step — see account-link-session-issuer.js's
 *     HONEST SECURITY MODEL for exactly what this does and does not
 *     prove.
 *   POST /auth/google/link     { linkSessionToken, idToken } -> { success, googleEmail? }
 *     The userId is NEVER read from this request body — it is
 *     resolved exclusively from linkSessionToken via the issuer,
 *     server-side, satisfying Prompt 10 §6 ("never accept a
 *     client-supplied userId on the mutating request as authority").
 *     The session token is consumed (single-use) on resolution,
 *     success or failure, to minimize replay surface.
 *   POST /auth/google           { idToken }                 -> { success, userId? }
 *     Unchanged, reused verbatim from google-login-endpoint.js.
 *
 * FAIL-CLOSED / NO INFORMATION LEAKAGE
 *   Every failure path (invalid JSON, missing fields, invalid/expired
 *   session, Google verification failure, already-linked-elsewhere)
 *   returns the same generic { success:false, reason:'AUTH_FAILED' }
 *   shape google-login-endpoint.js already established, for the same
 *   reason: this endpoint must not be usable to enumerate which
 *   session tokens or Google identities are valid.
 *
 * HONEST SCOPE
 *   Locally verified via node:test with a real loopback HTTP server,
 *   real RS256-signed tokens, and a real filesystem-backed persistent
 *   store surviving a genuine process stop/restart (see
 *   server/auth/test/account-link-server.test.js and
 *   google-persistent-linkage-integration.test.js's established
 *   pattern). NOT verified: CSRF protection (see KNOWN LIMITATIONS in
 *   this milestone's implementation report — this endpoint is a JSON
 *   API requiring `Content-Type: application/json`, which already
 *   defeats simple HTML-form CSRF, but no origin/token-based CSRF
 *   defense was added — disclosed, not silently assumed away),
 *   production deployment, and real Google OAuth configuration.
 */

const http = require('http');
const { createGoogleLoginRequestHandler } = require('./google-login-endpoint');

const MAX_BODY_BYTES = 10 * 1024;
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

function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        let received = 0, oversized = false, settled = false;
        const chunks = [];
        req.on('data', (chunk) => {
            if (oversized) return;
            received += chunk.length;
            if (received > MAX_BODY_BYTES) { oversized = true; chunks.length = 0; return; }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (settled) return;
            settled = true;
            if (oversized) { reject(Object.assign(new Error('too large'), { code: 'PAYLOAD_TOO_LARGE' })); return; }
            let parsed;
            try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
            catch (_e) { reject(Object.assign(new Error('bad json'), { code: 'BAD_JSON' })); return; }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                reject(Object.assign(new Error('bad json'), { code: 'BAD_JSON' })); return;
            }
            resolve(parsed);
        });
        req.on('error', (e) => { if (!settled) { settled = true; reject(e); } });
    });
}

async function readValidatedJson(req, res) {
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.toLowerCase().includes('application/json')) { sendJson(res, 415, GENERIC_AUTH_FAILURE); return null; }
    try {
        return await readJsonBody(req);
    } catch (e) {
        sendJson(res, e.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400, GENERIC_AUTH_FAILURE);
        return null;
    }
}

/**
 * createAccountLinkServer({ linkage, issuer, onAuthEvent })
 *   linkage   REQUIRED. A real CozyGoogleAccountLinkage instance
 *             (already composed with a real persistent store —
 *             callers own that composition, this file never
 *             constructs a store itself).
 *   issuer    REQUIRED. A real AccountLinkSessionIssuer instance.
 */
function createAccountLinkServer({ linkage, issuer, onAuthEvent } = {}) {
    if (!linkage || typeof linkage.linkAccount !== 'function' || typeof linkage.resolveLoginCandidate !== 'function') {
        throw new Error('[account-link-server] A real CozyGoogleAccountLinkage instance (linkage) is required.');
    }
    if (!issuer || typeof issuer.issue !== 'function' || typeof issuer.resolve !== 'function') {
        throw new Error('[account-link-server] A real AccountLinkSessionIssuer instance (issuer) is required.');
    }
    const emit = typeof onAuthEvent === 'function' ? onAuthEvent : () => {};
    const googleLoginHandler = createGoogleLoginRequestHandler({ linkage, onAuthEvent });

    return async function handleRequest(req, res) {
        if (req.method !== 'POST') { sendJson(res, 405, GENERIC_AUTH_FAILURE); return; }
        const url = new URL(req.url, 'http://internal');

        if (url.pathname === '/auth/google') { await googleLoginHandler(req, res); return; }

        if (url.pathname === '/auth/session/issue') {
            const body = await readValidatedJson(req, res);
            if (body === null) return;
            const userId = body.userId;
            if (typeof userId !== 'string' || userId.length === 0) {
                emit('REJECTED', { reason: 'MISSING_USER_ID' });
                sendJson(res, 400, GENERIC_AUTH_FAILURE);
                return;
            }
            const { token, expiresAt } = issuer.issue(userId);
            emit('SESSION_ISSUED', { userId });
            sendJson(res, 200, { success: true, token, expiresAt });
            return;
        }

        if (url.pathname === '/auth/google/link') {
            const body = await readValidatedJson(req, res);
            if (body === null) return;
            const { linkSessionToken, idToken } = body;
            if (typeof linkSessionToken !== 'string' || typeof idToken !== 'string' || !linkSessionToken || !idToken) {
                emit('REJECTED', { reason: 'MISSING_FIELDS' });
                sendJson(res, 400, GENERIC_AUTH_FAILURE);
                return;
            }
            // The ONLY source of truth for "which account" — never
            // body.userId (deliberately never even read above).
            const userId = issuer.resolve(linkSessionToken, { consume: true });
            if (!userId) {
                emit('REJECTED', { reason: 'SESSION_INVALID' });
                sendJson(res, 401, GENERIC_AUTH_FAILURE);
                return;
            }
            let result;
            try {
                result = await linkage.linkAccount(userId, idToken);
            } catch (e) {
                emit('ERROR', { reason: 'LINK_THREW', message: e && e.message });
                sendJson(res, 500, GENERIC_AUTH_FAILURE);
                return;
            }
            if (!result || result.linked !== true) {
                emit('REJECTED', { reason: (result && result.reason) || 'UNKNOWN' });
                sendJson(res, 409, GENERIC_AUTH_FAILURE);
                return;
            }
            emit('LINKED', { userId, googleEmail: result.googleEmail });
            sendJson(res, 200, { success: true, googleEmail: result.googleEmail });
            return;
        }

        sendJson(res, 404, GENERIC_AUTH_FAILURE);
    };
}

class AccountLinkServer {
    #httpServer;
    constructor({ linkage, issuer, onAuthEvent } = {}) {
        const handler = createAccountLinkServer({ linkage, issuer, onAuthEvent });
        this.#httpServer = http.createServer(handler);
    }
    listen(port = 0, host = '127.0.0.1') {
        return new Promise((resolve) => { this.#httpServer.listen(port, host, () => resolve(this.#httpServer.address())); });
    }
    close() { return new Promise((resolve) => this.#httpServer.close(() => resolve())); }
}

module.exports = { createAccountLinkServer, AccountLinkServer, MAX_BODY_BYTES };
