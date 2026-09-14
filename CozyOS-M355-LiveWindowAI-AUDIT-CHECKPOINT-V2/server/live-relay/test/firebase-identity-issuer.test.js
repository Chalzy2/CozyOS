'use strict';

/**
 * server/live-relay/test/firebase-identity-issuer.test.js
 * STEP 4D-B Phase 6 Patch #3 — Trusted Identity Issuer
 *
 * HARNESS DISCLOSURE: no network access. A real RSA keypair is generated
 * locally with Node's own crypto.generateKeyPairSync, and a real RS256-
 * signed JWT-shaped token is built and signed with the PRIVATE key,
 * exactly as Google's token service would. `fetchGoogleCerts` is
 * injected to return the PUBLIC key standing in for Google's published
 * cert for that key id. The verification code under test never knows
 * the difference — it is the exact same crypto.verify() call it would
 * run against a real Google cert in production. Only the source of the
 * public key is swapped for testability; the signature math is real.
 *
 * Run: node --test server/live-relay/test/firebase-identity-issuer.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
    verifyFirebaseIdToken,
    issueIdentityAssertionFromFirebase,
} = require('../firebase-identity-issuer');
const { verifyAssertion } = require('../identity-assertion');

const PROJECT_ID = 'cozycabin-affiliate';
const IDENTITY_SECRET = 'test-identity-secret-do-not-use-in-production';
const KID = 'test-kid-1';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken({
    uid = 'user-abc',
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
        iss, aud, sub: uid, user_id: uid, exp, iat, auth_time: authTime,
    }));
    const signedData = `${header}.${payload}`;
    const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(signedData), signingKey));
    return `${signedData}.${signature}`;
}

async function fetchGoogleCerts() {
    return { [KID]: PUBLIC_KEY_PEM };
}

test('valid identity: a genuinely signed, well-formed ID token verifies and issues an assertion', async () => {
    const token = makeIdToken({ uid: 'user-abc' });
    const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, true);
    assert.equal(result.uid, 'user-abc');

    const issued = await issueIdentityAssertionFromFirebase(token, {
        projectId: PROJECT_ID, fetchGoogleCerts, identitySecret: IDENTITY_SECRET,
    });
    assert.equal(issued.success, true);
    assert.equal(issued.uid, 'user-abc');
    const assertionCheck = verifyAssertion(issued.assertionToken, IDENTITY_SECRET);
    assert.equal(assertionCheck.verified, true);
    assert.equal(assertionCheck.userId, 'user-abc');
});

test('invalid identity: wrong issuer is rejected', async () => {
    const token = makeIdToken({ iss: 'https://securetoken.google.com/some-other-project' });
    const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, false);
});

test('invalid identity: wrong audience is rejected', async () => {
    const token = makeIdToken({ aud: 'some-other-project' });
    const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, false);
});

test('missing credentials: no token at all is rejected', async () => {
    const result = await verifyFirebaseIdToken(undefined, { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, false);
    assert.match(result.reason, /Missing ID token/);
});

test('missing credentials: empty string token is rejected', async () => {
    const result = await verifyFirebaseIdToken('', { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, false);
});

test('spoofed requester id: a caller cannot claim a different uid by editing the payload without re-signing', async () => {
    const token = makeIdToken({ uid: 'user-abc' });
    const [header, payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    decoded.sub = 'someone-else';
    decoded.user_id = 'someone-else';
    const forgedPayload = b64url(JSON.stringify(decoded));
    const forgedToken = `${header}.${forgedPayload}.${sig}`;
    const result = await verifyFirebaseIdToken(forgedToken, { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, false);
    assert.match(result.reason, /Signature verification failed/);
});

test('assertion purpose isolation: a signed identity assertion cannot be forged by signing an ID token for the same secret space', async () => {
    // The identity-assertion secret and the Firebase project trust are
    // different trust domains; issueIdentityAssertionFromFirebase() is
    // the only path that can mint a real assertion, and it requires a
    // real verified Firebase ID token first.
    const badResult = await issueIdentityAssertionFromFirebase('not-a-real-token', {
        projectId: PROJECT_ID, fetchGoogleCerts, identitySecret: IDENTITY_SECRET,
    });
    assert.equal(badResult.success, false);
    assert.equal(badResult.assertionToken, undefined);
});

test('expired identity credential: an expired ID token is rejected', async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = makeIdToken({ now, exp: now - 10, iat: now - 3600, authTime: now - 3600 });
    const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts, now });
    assert.equal(result.verified, false);
    assert.match(result.reason, /expired/);
});

test('tampered identity credential: modified payload with stale signature is rejected', async () => {
    const token = makeIdToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
    const [header, payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    decoded.exp = decoded.exp + 999999; // attempt to extend expiry without re-signing
    const tamperedPayload = b64url(JSON.stringify(decoded));
    const tamperedToken = `${header}.${tamperedPayload}.${sig}`;
    const result = await verifyFirebaseIdToken(tamperedToken, { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, false);
    assert.match(result.reason, /Signature verification failed/);
});

test('tampered identity credential: unknown key id is rejected (cannot swap in an attacker-controlled key)', async () => {
    const attackerKeys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const token = makeIdToken({ signingKey: attackerKeys.privateKey, kid: 'attacker-kid' });
    const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, false);
    assert.match(result.reason, /key id not recognized/);
});

test('unsupported algorithm (e.g. alg:none) is rejected outright', async () => {
    const header = b64url(JSON.stringify({ alg: 'none', kid: KID, typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
        iss: `https://securetoken.google.com/${PROJECT_ID}`, aud: PROJECT_ID, sub: 'user-abc',
        exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) - 1,
        auth_time: Math.floor(Date.now() / 1000) - 1,
    }));
    const noneToken = `${header}.${payload}.`;
    const result = await verifyFirebaseIdToken(noneToken, { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, false);
    assert.match(result.reason, /Unsupported algorithm/);
});

test('malformed token (not three dot-separated parts) is rejected', async () => {
    const result = await verifyFirebaseIdToken('not-a-jwt', { projectId: PROJECT_ID, fetchGoogleCerts });
    assert.equal(result.verified, false);
    assert.match(result.reason, /Malformed/);
});
