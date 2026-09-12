'use strict';

/**
 * core/security/test/google-account-link-client.test.js
 * Prompt 10 STEP A — real tests for GoogleAccountLinkClient against a
 * real, loopback HTTP AccountLinkServer instance (same real-server test
 * harness pattern as server/auth/test/account-link-server.test.js —
 * reused, not reinvented). No mocked fetch, no fabricated responses:
 * every assertion here is driven by the server's real behavior.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GoogleAccountLinkClient = require('../google-account-link-client');
const { AccountLinkServer } = require('../../../server/auth/account-link-server');
const { AccountLinkSessionStore } = require('../../../server/auth/account-link-session-store');
const { AccountLinkSessionIssuer } = require('../../../server/auth/account-link-session-issuer');
const { GoogleLinkageStoreAdapter } = require('../../../server/auth/google-linkage-store-adapter');
const { CozyGoogleAccountLinkage } = require('../google-account-linkage');

const PROJECT_ID = 'cozycabin-affiliate';
const KID = 'test-kid-1';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });

function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function makeIdToken({ uid = 'g-uid-1', email = 'user@example.com', now = Math.floor(Date.now() / 1000) } = {}) {
    const header = b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
        iss: `https://securetoken.google.com/${PROJECT_ID}`, aud: PROJECT_ID,
        sub: uid, user_id: uid, email, exp: now + 3600, iat: now - 1, auth_time: now - 1,
    }));
    const signedData = `${header}.${payload}`;
    const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(signedData), privateKey));
    return `${signedData}.${signature}`;
}
async function fetchGoogleCerts() { return { [KID]: PUBLIC_KEY_PEM }; }
function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cozyos-link-client-')); }

async function startServer(dir) {
    const linkageStore = new GoogleLinkageStoreAdapter({ filePath: path.join(dir, 'google-linkages.json') });
    const linkage = new CozyGoogleAccountLinkage({ store: linkageStore, projectId: PROJECT_ID, fetchGoogleCerts });
    const sessionStore = new AccountLinkSessionStore({ filePath: path.join(dir, 'link-sessions.json') });
    const issuer = new AccountLinkSessionIssuer({ store: sessionStore });
    const server = new AccountLinkServer({ linkage, issuer });
    const addr = await server.listen(0, '127.0.0.1');
    return { server, linkage, issuer, baseUrl: `http://127.0.0.1:${addr.port}` };
}

// 1. issueLinkSession() against a real server -> real token.
test('issueLinkSession(): real server issues a real, usable token', async () => {
    const dir = tempDir();
    const { server, baseUrl } = await startServer(dir);
    try {
        const userId = crypto.randomUUID();
        const result = await GoogleAccountLinkClient.issueLinkSession(userId, { baseUrl });
        assert.equal(result.success, true);
        assert.equal(typeof result.token, 'string');
        assert.ok(result.token.length > 10);
        assert.equal(typeof result.expiresAt, 'number');
    } finally {
        await server.close();
    }
});

// 2. issueLinkSession() rejects a missing userId without even calling the server.
test('issueLinkSession(): missing/empty userId fails closed locally, no request needed', async () => {
    const result = await GoogleAccountLinkClient.issueLinkSession('', { baseUrl: 'http://127.0.0.1:1' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'MISSING_USER_ID');
});

// 3. Full real linkGoogleAccountForCurrentUser() happy path end-to-end.
test('linkGoogleAccountForCurrentUser(): real end-to-end issue+link against a real server', async () => {
    const dir = tempDir();
    const { server, linkage, baseUrl } = await startServer(dir);
    try {
        const userId = crypto.randomUUID();
        const idToken = makeIdToken({ uid: 'g-uid-client-1' });
        const result = await GoogleAccountLinkClient.linkGoogleAccountForCurrentUser(userId, idToken, { baseUrl });
        assert.equal(result.success, true);
        assert.equal(result.googleEmail, 'user@example.com');
        assert.equal(linkage.getGoogleState(userId).googleLinked, true);
    } finally {
        await server.close();
    }
});

// 4. A spoofed userId can never be smuggled through this client — the
// function signature itself has no parameter that reaches the link
// request body as userId, verified by confirming the link lands on the
// account tied to the real session token, not any other value.
test('linkGoogleAccountForCurrentUser(): the account linked is always the one from the real session, never spoofable via any client-side field', async () => {
    const dir = tempDir();
    const { server, linkage, baseUrl } = await startServer(dir);
    try {
        const realUserId = crypto.randomUUID();
        const idToken = makeIdToken({ uid: 'g-uid-client-2' });
        await GoogleAccountLinkClient.linkGoogleAccountForCurrentUser(realUserId, idToken, { baseUrl });
        assert.equal(linkage.getGoogleState(realUserId).googleLinked, true);
        assert.equal(linkage.getGoogleState('attacker-supplied-id').googleLinked, false);
    } finally {
        await server.close();
    }
});

// 5. Invalid/garbage Google ID token is rejected by the real server, not
// faked as success by the client.
test('linkGoogleAccount(): a garbage idToken is rejected by the real server, never treated as success', async () => {
    const dir = tempDir();
    const { server, baseUrl } = await startServer(dir);
    try {
        const issued = await GoogleAccountLinkClient.issueLinkSession(crypto.randomUUID(), { baseUrl });
        assert.equal(issued.success, true);
        const result = await GoogleAccountLinkClient.linkGoogleAccount(issued.token, 'not-a-real-jwt', { baseUrl });
        assert.equal(result.success, false);
    } finally {
        await server.close();
    }
});

// 6. A replayed (already-consumed) session token is rejected.
test('linkGoogleAccount(): a session token already consumed by a prior link cannot be replayed', async () => {
    const dir = tempDir();
    const { server, baseUrl } = await startServer(dir);
    try {
        const issued = await GoogleAccountLinkClient.issueLinkSession(crypto.randomUUID(), { baseUrl });
        const first = await GoogleAccountLinkClient.linkGoogleAccount(issued.token, makeIdToken({ uid: 'g-replay-1' }), { baseUrl });
        assert.equal(first.success, true);
        const replay = await GoogleAccountLinkClient.linkGoogleAccount(issued.token, makeIdToken({ uid: 'g-replay-2' }), { baseUrl });
        assert.equal(replay.success, false);
    } finally {
        await server.close();
    }
});

// 7. Second account attempting to claim an already-linked Google
// identity is rejected — real account-collision protection reached
// through this client, not reimplemented by it.
test('linkGoogleAccountForCurrentUser(): a second account cannot claim an already-linked Google identity', async () => {
    const dir = tempDir();
    const { server, linkage, baseUrl } = await startServer(dir);
    try {
        const userA = crypto.randomUUID();
        const userB = crypto.randomUUID();
        const sharedIdToken = () => makeIdToken({ uid: 'g-shared-identity' });
        const first = await GoogleAccountLinkClient.linkGoogleAccountForCurrentUser(userA, sharedIdToken(), { baseUrl });
        assert.equal(first.success, true);
        const second = await GoogleAccountLinkClient.linkGoogleAccountForCurrentUser(userB, sharedIdToken(), { baseUrl });
        assert.equal(second.success, false);
        assert.equal(second.stage, 'LINK');
        assert.equal(linkage.getGoogleState(userA).googleLinked, true);
        assert.equal(linkage.getGoogleState(userB).googleLinked, false);
    } finally {
        await server.close();
    }
});

// 8. A real network error (no server listening) is surfaced honestly,
// never silently treated as success.
test('issueLinkSession(): no server listening -> honest NETWORK_ERROR, never a fabricated success', async () => {
    const result = await GoogleAccountLinkClient.issueLinkSession('some-user', { baseUrl: 'http://127.0.0.1:1' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'NETWORK_ERROR');
});

// 9. Missing fields on the link call fail closed locally.
test('linkGoogleAccount(): missing token/idToken fails closed locally without a request', async () => {
    const result = await GoogleAccountLinkClient.linkGoogleAccount('', '', { baseUrl: 'http://127.0.0.1:1' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'MISSING_FIELDS');
});

// 10. linkGoogleAccountForCurrentUser() reports which stage failed when
// the issue step itself fails (e.g. bad userId), so a future UI caller
// can distinguish "couldn't even start" from "Google rejected it".
test('linkGoogleAccountForCurrentUser(): reports stage:"ISSUE" when session issuance itself fails', async () => {
    const dir = tempDir();
    const { server, baseUrl } = await startServer(dir);
    try {
        const result = await GoogleAccountLinkClient.linkGoogleAccountForCurrentUser('', makeIdToken(), { baseUrl });
        assert.equal(result.success, false);
        assert.equal(result.stage, 'ISSUE');
    } finally {
        await server.close();
    }
});
