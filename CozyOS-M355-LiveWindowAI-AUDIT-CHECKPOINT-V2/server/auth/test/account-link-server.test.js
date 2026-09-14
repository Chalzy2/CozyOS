'use strict';

/**
 * server/auth/test/account-link-server.test.js
 * Prompt 10 — real end-to-end HTTP test of the full browser->server
 * account-linking boundary, matching this milestone's §23/§29
 * acceptance scenario exactly: real HTTP server, real RS256 tokens,
 * real filesystem persistence, real process stop/restart.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { AccountLinkServer } = require('../account-link-server');
const { AccountLinkSessionStore } = require('../account-link-session-store');
const { AccountLinkSessionIssuer } = require('../account-link-session-issuer');
const { GoogleLinkageStoreAdapter } = require('../google-linkage-store-adapter');
const { CozyGoogleAccountLinkage } = require('../../../core/security/google-account-linkage');

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

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'cozyos-account-link-')); }

async function startServer(dir) {
    const linkageStore = new GoogleLinkageStoreAdapter({ filePath: path.join(dir, 'google-linkages.json') });
    const linkage = new CozyGoogleAccountLinkage({ store: linkageStore, projectId: PROJECT_ID, fetchGoogleCerts });
    const sessionStore = new AccountLinkSessionStore({ filePath: path.join(dir, 'link-sessions.json') });
    const issuer = new AccountLinkSessionIssuer({ store: sessionStore });
    const server = new AccountLinkServer({ linkage, issuer });
    const addr = await server.listen(0, '127.0.0.1');
    return { server, linkage, linkageStore, issuer, baseUrl: `http://127.0.0.1:${addr.port}` };
}

async function post(baseUrl, pathName, body) {
    const res = await fetch(`${baseUrl}${pathName}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
}

test('REAL ACCEPTANCE SCENARIO (§29): account A links, restarts, logs in, resolves correctly; account B is rejected', async () => {
    const dir = tempDir();

    // --- Server run 1 ---
    const run1 = await startServer(dir);

    // "USER A logs into CozyOS using an existing approved factor" is a
    // browser-local event this file cannot exercise directly (no
    // browser in this sandbox) — represented here by the browser
    // already knowing its own real, unguessable local userId, exactly
    // as identity-engine.js's #generateId() produces one.
    const userAId = crypto.randomUUID();

    // Settings -> Security -> Link Google: browser first asks the
    // server for a link session bound to its own already-known local id.
    const issueRes = await post(run1.baseUrl, '/auth/session/issue', { userId: userAId });
    assert.equal(issueRes.status, 200);
    assert.ok(issueRes.body.token);

    // Google authentication happens, browser gets a real Google ID token,
    // then calls the link endpoint. Deliberately including a spoofed
    // userId in the body to prove it is ignored (Prompt 10 §6).
    const linkRes = await post(run1.baseUrl, '/auth/google/link', {
        linkSessionToken: issueRes.body.token,
        idToken: makeIdToken({ uid: 'g-uid-real-A' }),
        userId: 'attacker-supplied-id', // must be ignored entirely
    });
    assert.equal(linkRes.status, 200);
    assert.equal(linkRes.body.success, true);

    // Confirm the link landed on the REAL account (from the session),
    // never the spoofed body field.
    assert.equal(run1.linkage.getGoogleState(userAId).googleLinked, true);
    assert.equal(run1.linkage.getGoogleState('attacker-supplied-id').googleLinked, false);

    // Session token is single-use — a replay must fail.
    const replay = await post(run1.baseUrl, '/auth/google/link', { linkSessionToken: issueRes.body.token, idToken: makeIdToken({ uid: 'g-uid-real-A' }) });
    assert.equal(replay.status, 401);

    // Logout + Google login (anonymous path, reused verbatim from Prompt 7).
    const loginRes = await post(run1.baseUrl, '/auth/google', { idToken: makeIdToken({ uid: 'g-uid-real-A' }) });
    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.userId, userAId);

    await run1.server.close();

    // --- Real server restart, same directory/files ---
    const run2 = await startServer(dir);
    try {
        const loginAfterRestart = await post(run2.baseUrl, '/auth/google', { idToken: makeIdToken({ uid: 'g-uid-real-A' }) });
        assert.equal(loginAfterRestart.status, 200);
        assert.equal(loginAfterRestart.body.userId, userAId, 'must resolve to the same account after a real restart');

        // USER B attempts to claim USER A's already-linked Google identity.
        const userBId = crypto.randomUUID();
        const issueB = await post(run2.baseUrl, '/auth/session/issue', { userId: userBId });
        const linkB = await post(run2.baseUrl, '/auth/google/link', { linkSessionToken: issueB.body.token, idToken: makeIdToken({ uid: 'g-uid-real-A' }) });
        assert.equal(linkB.status, 409);
        assert.equal(linkB.body.success, false);
        assert.equal(run2.linkage.getGoogleState(userBId).googleLinked, false);
        // Owner unchanged.
        assert.equal(run2.linkage.getGoogleState(userAId).googleLinked, true);
    } finally {
        await run2.server.close();
    }
});

test('missing/garbage session token is rejected, never falls back to trusting a body-supplied userId', async () => {
    const dir = tempDir();
    const { server, baseUrl } = await startServer(dir);
    try {
        const res = await post(baseUrl, '/auth/google/link', { linkSessionToken: 'not-a-real-token', idToken: makeIdToken(), userId: 'someone' });
        assert.equal(res.status, 401);
        assert.equal(res.body.success, false);
    } finally {
        await server.close();
    }
});

test('session issue requires a real userId field', async () => {
    const dir = tempDir();
    const { server, baseUrl } = await startServer(dir);
    try {
        const res = await post(baseUrl, '/auth/session/issue', {});
        assert.equal(res.status, 400);
    } finally {
        await server.close();
    }
});

test('unknown route returns generic 404, no information leakage', async () => {
    const dir = tempDir();
    const { server, baseUrl } = await startServer(dir);
    try {
        const res = await post(baseUrl, '/auth/nonexistent', {});
        assert.equal(res.status, 404);
        assert.deepEqual(res.body, { success: false, reason: 'AUTH_FAILED' });
    } finally {
        await server.close();
    }
});
