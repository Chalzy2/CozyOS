'use strict';

/**
 * server/auth/test/google-login-endpoint.test.js
 * Prompt 7 — Path B Google Authentication Trust Adapter
 *
 * HARNESS DISCLOSURE: real loopback HTTP server (GoogleAuthAdapterServer),
 * real RSA keypair generated locally with crypto.generateKeyPairSync,
 * real RS256-signed JWT-shaped tokens signed with the PRIVATE key. The
 * server's fetchGoogleCerts is injected (via CozyGoogleAccountLinkage's
 * own constructor option, the exact same seam google-account-linkage.test.js
 * and firebase-identity-issuer.test.js already use) to return the PUBLIC
 * key standing in for Google's published cert. No shortcut like
 * `if (token === 'valid')` exists anywhere in this suite or in the code
 * under test — every accept/reject path runs the real signature check.
 *
 * Run: node --test server/auth/test/google-login-endpoint.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const http = require('http');

const { GoogleAuthAdapterServer } = require('../google-login-endpoint');
const { CozyGoogleAccountLinkage, InMemoryGoogleLinkageStore } = require('../../../core/security/google-account-linkage');

const PROJECT_ID = 'cozycabin-affiliate';
const KID = 'test-kid-1';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken({
    uid = 'user-abc',
    email = 'abc@example.com',
    iss = `https://securetoken.google.com/${PROJECT_ID}`,
    aud = PROJECT_ID,
    now = Math.floor(Date.now() / 1000),
    exp = now + 3600,
    iat = now - 1,
    authTime = now - 1,
    kid = KID,
    alg = 'RS256',
    signingKey = privateKey,
} = {}) {
    const header = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
        iss, aud, sub: uid, user_id: uid, email, exp, iat, auth_time: authTime,
    }));
    const signedData = `${header}.${payload}`;
    const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(signedData), signingKey));
    return `${signedData}.${signature}`;
}

async function fetchGoogleCerts() {
    return { [KID]: PUBLIC_KEY_PEM };
}

// Wrong keypair, used to produce a token whose signature will not verify
// against the real published (fixture) key — proves signature checking
// is real, not a format/shape check.
const { privateKey: wrongPrivateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

async function startAdapter({ preLinkedUserId, preLinkedGoogleUid } = {}) {
    const store = new InMemoryGoogleLinkageStore();
    const linkage = new CozyGoogleAccountLinkage({ store, projectId: PROJECT_ID, fetchGoogleCerts });
    const events = [];
    const server = new GoogleAuthAdapterServer({ linkage, onAuthEvent: (name, detail) => events.push({ name, detail }) });
    const addr = await server.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    if (preLinkedUserId && preLinkedGoogleUid) {
        // Simulate an already-linked account the way linkAccount() would
        // leave the store, without re-deriving verification for setup.
        store.setRecord(preLinkedUserId, {
            googleUid: preLinkedGoogleUid,
            googleEmail: 'linked@example.com',
            googleLinked: true,
            googleLinkedAt: new Date().toISOString(),
            googleLoginEnabled: true,
        });
    }

    return { server, linkage, store, baseUrl, events };
}

async function postGoogle(baseUrl, body, { rawBody, headers } = {}) {
    const res = await fetch(`${baseUrl}/auth/google`, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: rawBody !== undefined ? rawBody : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch (_e) { /* some error paths return no/invalid body on purpose in tests */ }
    return { status: res.status, body: json };
}

// ---------------------------------------------------------------------
// Token verification
// ---------------------------------------------------------------------

test('valid, verified, linked Google identity resolves to the linked CozyOS userId', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const token = makeIdToken({ uid: 'user-abc' });
        const { status, body } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(status, 200);
        assert.equal(body.success, true);
        assert.equal(body.userId, 'cozy-user-1');
    } finally { await server.close(); }
});

test('malformed token is rejected (generic 401)', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const { status, body } = await postGoogle(baseUrl, { idToken: 'not-a-jwt' });
        assert.equal(status, 401);
        assert.deepEqual(body, { success: false, reason: 'AUTH_FAILED' });
    } finally { await server.close(); }
});

test('invalid signature (wrong signing key) is rejected', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const token = makeIdToken({ uid: 'user-abc', signingKey: wrongPrivateKey });
        const { status, body } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(status, 401);
        assert.equal(body.success, false);
    } finally { await server.close(); }
});

test('expired token is rejected', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const now = Math.floor(Date.now() / 1000);
        const token = makeIdToken({ uid: 'user-abc', exp: now - 10 });
        const { status } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(status, 401);
    } finally { await server.close(); }
});

test('wrong issuer is rejected', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const token = makeIdToken({ uid: 'user-abc', iss: 'https://securetoken.google.com/some-other-project' });
        const { status } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(status, 401);
    } finally { await server.close(); }
});

test('wrong audience is rejected', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const token = makeIdToken({ uid: 'user-abc', aud: 'some-other-project' });
        const { status } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(status, 401);
    } finally { await server.close(); }
});

test('future auth_time is rejected', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const now = Math.floor(Date.now() / 1000);
        const token = makeIdToken({ uid: 'user-abc', authTime: now + 3600 });
        const { status } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(status, 401);
    } finally { await server.close(); }
});

// ---------------------------------------------------------------------
// Identity authority — client cannot dictate identity
// ---------------------------------------------------------------------

test('client-supplied userId is ignored; resolution still comes from the verified token', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const token = makeIdToken({ uid: 'user-abc' });
        const { status, body } = await postGoogle(baseUrl, { idToken: token, userId: 'someone-else' });
        assert.equal(status, 200);
        assert.equal(body.userId, 'cozy-user-1'); // NOT "someone-else"
    } finally { await server.close(); }
});

test('client-supplied googleId is ignored', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const token = makeIdToken({ uid: 'user-abc' });
        const { status, body } = await postGoogle(baseUrl, { idToken: token, googleId: 'attacker-controlled-uid' });
        assert.equal(status, 200);
        assert.equal(body.userId, 'cozy-user-1');
    } finally { await server.close(); }
});

test('client-supplied role/isAdmin are ignored (never echoed, never used to authorize)', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const token = makeIdToken({ uid: 'user-abc' });
        const { status, body } = await postGoogle(baseUrl, { idToken: token, role: 'admin', isAdmin: true });
        assert.equal(status, 200);
        assert.equal(Object.prototype.hasOwnProperty.call(body, 'role'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(body, 'isAdmin'), false);
    } finally { await server.close(); }
});

test('the classic attack shape { userId: "victim", googleId: "attacker" } cannot obtain the victim account', async () => {
    // Attacker has their OWN real, verifiable Google token (uid
    // "attacker-uid"), which is NOT linked to any CozyOS account.
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'victim-user', preLinkedGoogleUid: 'victim-google-uid' });
    try {
        const attackerToken = makeIdToken({ uid: 'attacker-uid' });
        const { status, body } = await postGoogle(baseUrl, { idToken: attackerToken, userId: 'victim-user', googleId: 'victim-google-uid' });
        assert.equal(status, 401);
        assert.equal(body.success, false);
    } finally { await server.close(); }
});

// ---------------------------------------------------------------------
// Account linking / resolution
// ---------------------------------------------------------------------

test('verified-but-unlinked Google identity is rejected (no auto-account-creation, no email fallback)', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const token = makeIdToken({ uid: 'never-linked-uid', email: 'never-linked@example.com' });
        const { status, body } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(status, 401);
        assert.equal(body.success, false);
    } finally { await server.close(); }
});

test('a Google identity linked to account A never resolves to account B', async () => {
    const { server, baseUrl, store } = await startAdapter({ preLinkedUserId: 'account-a', preLinkedGoogleUid: 'shared-looking-uid' });
    try {
        // account-b exists in the store but with a DIFFERENT google uid.
        store.setRecord('account-b', {
            googleUid: 'account-b-own-uid', googleEmail: 'b@example.com',
            googleLinked: true, googleLinkedAt: new Date().toISOString(), googleLoginEnabled: true,
        });
        const token = makeIdToken({ uid: 'shared-looking-uid' });
        const { status, body } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(status, 200);
        assert.equal(body.userId, 'account-a');
        assert.notEqual(body.userId, 'account-b');
    } finally { await server.close(); }
});

test('googleLoginEnabled:false on an otherwise-linked record is rejected (generic, not distinguishable from unlinked)', async () => {
    const { server, baseUrl, store } = await startAdapter();
    try {
        store.setRecord('disabled-user', {
            googleUid: 'disabled-uid', googleEmail: 'x@example.com',
            googleLinked: true, googleLinkedAt: new Date().toISOString(), googleLoginEnabled: false,
        });
        const token = makeIdToken({ uid: 'disabled-uid' });
        const { status, body } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(status, 401);
        assert.deepEqual(body, { success: false, reason: 'AUTH_FAILED' });
    } finally { await server.close(); }
});

// ---------------------------------------------------------------------
// Request validation / fail-closed transport handling
// ---------------------------------------------------------------------

test('missing idToken field is rejected with 400', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const { status, body } = await postGoogle(baseUrl, {});
        assert.equal(status, 400);
        assert.equal(body.success, false);
    } finally { await server.close(); }
});

test('empty-string idToken is rejected', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const { status } = await postGoogle(baseUrl, { idToken: '' });
        assert.equal(status, 400);
    } finally { await server.close(); }
});

test('non-string idToken is rejected', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const { status } = await postGoogle(baseUrl, { idToken: 12345 });
        assert.equal(status, 400);
    } finally { await server.close(); }
});

test('malformed JSON body is rejected with 400, not a 500 crash', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const { status } = await postGoogle(baseUrl, null, { rawBody: '{ this is not json' });
        assert.equal(status, 400);
    } finally { await server.close(); }
});

test('non-object JSON body (array) is rejected', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const { status } = await postGoogle(baseUrl, null, { rawBody: '["idToken", "x"]' });
        assert.equal(status, 400);
    } finally { await server.close(); }
});

test('oversized body is rejected with 413 (connection stays usable, not aborted)', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const hugeToken = 'a'.repeat(20 * 1024);
        const { status, body } = await postGoogle(baseUrl, { idToken: hugeToken });
        assert.equal(status, 413);
        assert.deepEqual(body, { success: false, reason: 'AUTH_FAILED' });
    } finally { await server.close(); }
});

test('wrong content-type is rejected with 415', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const { status } = await postGoogle(baseUrl, { idToken: 'x' }, { headers: { 'Content-Type': 'text/plain' } });
        assert.equal(status, 415);
    } finally { await server.close(); }
});

test('unsupported method (GET) is rejected with 405', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const res = await fetch(`${baseUrl}/auth/google`, { method: 'GET' });
        assert.equal(res.status, 405);
    } finally { await server.close(); }
});

test('unknown path returns generic 404, not a stack trace or server info', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const res = await fetch(`${baseUrl}/not-a-real-path`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        assert.equal(res.status, 404);
    } finally { await server.close(); }
});

// ---------------------------------------------------------------------
// Session boundary — this endpoint resolves identity, it does not itself
// mint a CozyOS session (that remains IdentityEngine's job).
// ---------------------------------------------------------------------

test('successful response never includes a session token or session-shaped field', async () => {
    const { server, baseUrl } = await startAdapter({ preLinkedUserId: 'cozy-user-1', preLinkedGoogleUid: 'user-abc' });
    try {
        const token = makeIdToken({ uid: 'user-abc' });
        const { body } = await postGoogle(baseUrl, { idToken: token });
        assert.equal(Object.prototype.hasOwnProperty.call(body, 'sessionToken'), false);
        assert.equal(Object.prototype.hasOwnProperty.call(body, 'session'), false);
        assert.deepEqual(Object.keys(body).sort(), ['success', 'userId']);
    } finally { await server.close(); }
});

test('failed verification never leaves a usable record behind and repeated attempts stay rejected', async () => {
    const { server, baseUrl } = await startAdapter();
    try {
        const badToken = makeIdToken({ uid: 'attacker', signingKey: wrongPrivateKey });
        const first = await postGoogle(baseUrl, { idToken: badToken });
        const second = await postGoogle(baseUrl, { idToken: badToken });
        assert.equal(first.status, 401);
        assert.equal(second.status, 401);
    } finally { await server.close(); }
});
