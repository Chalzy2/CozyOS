'use strict';

/**
 * core/security/test/google-account-linkage.test.js
 * Prompt 7 — Google authenticator dependency
 *
 * HARNESS DISCLOSURE: no network access. Exactly the same real-RSA
 * technique server/live-relay/test/firebase-identity-issuer.test.js
 * already uses — a genuine RSA keypair signs a genuine RS256 ID token,
 * `fetchGoogleCerts` is injected to stand in for Google's published
 * cert endpoint. The verification code under test (verifyFirebaseIdToken,
 * imported transitively) never knows the difference — same real
 * crypto.verify() call production uses. Only the public-key source is
 * swapped for testability.
 *
 * Run: node --test core/security/test/google-account-linkage.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
    CozyGoogleAccountLinkage,
    InMemoryGoogleLinkageStore,
    extractEmailFromVerifiedToken
} = require('../google-account-linkage');

const PROJECT_ID = 'cozycabin-affiliate';
const KID = 'test-kid-1';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken({
    uid = 'google-uid-abc',
    email = 'person@example.com',
    iss = `https://securetoken.google.com/${PROJECT_ID}`,
    aud = PROJECT_ID,
    now = Math.floor(Date.now() / 1000),
    exp = now + 3600,
    iat = now - 1,
    authTime = now - 1,
    kid = KID,
    signingKey = privateKey,
} = {}) {
    const header = b64url(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' }));
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

function makeLinkage() {
    return new CozyGoogleAccountLinkage({
        store: new InMemoryGoogleLinkageStore(),
        projectId: PROJECT_ID,
        fetchGoogleCerts,
    });
}

// ---------------------------------------------------------------------
// linkAccount()
// ---------------------------------------------------------------------

test('linkAccount: a genuinely signed token links the account for real', async () => {
    const linkage = makeLinkage();
    const token = makeIdToken({ uid: 'uid-1', email: 'a@example.com' });
    const result = await linkage.linkAccount('user-1', token);
    assert.equal(result.linked, true);
    assert.equal(result.googleUid, 'uid-1');
    assert.equal(result.googleEmail, 'a@example.com');
    const state = linkage.getGoogleState('user-1');
    assert.equal(state.googleLinked, true);
    assert.equal(state.googleLoginEnabled, true);
});

test('linkAccount: fails closed with no userId (never links anonymously)', async () => {
    const linkage = makeLinkage();
    const token = makeIdToken();
    const result = await linkage.linkAccount(undefined, token);
    assert.equal(result.linked, false);
    assert.equal(result.reason, 'AUTH_REQUIRED');
});

test('linkAccount: a forged/tampered token never links (real signature check)', async () => {
    const linkage = makeLinkage();
    const token = makeIdToken({ uid: 'uid-2' });
    const [header, payload, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    decoded.sub = 'someone-else';
    decoded.user_id = 'someone-else';
    const forgedPayload = b64url(JSON.stringify(decoded));
    const forgedToken = `${header}.${forgedPayload}.${sig}`;
    const result = await linkage.linkAccount('user-1', forgedToken);
    assert.equal(result.linked, false);
    assert.equal(result.reason, 'GOOGLE_VERIFICATION_FAILED');
});

test('linkAccount: an expired token never links', async () => {
    const linkage = makeLinkage();
    const now = Math.floor(Date.now() / 1000);
    const token = makeIdToken({ now, exp: now - 10, iat: now - 3600, authTime: now - 3600 });
    const result = await linkage.linkAccount('user-1', token);
    assert.equal(result.linked, false);
    assert.equal(result.reason, 'GOOGLE_VERIFICATION_FAILED');
});

test('linkAccount: cross-account reuse of an already-linked Google identity is rejected (fail closed)', async () => {
    const linkage = makeLinkage();
    const token = makeIdToken({ uid: 'uid-shared' });
    const first = await linkage.linkAccount('user-A', token);
    assert.equal(first.linked, true);

    const secondToken = makeIdToken({ uid: 'uid-shared' }); // same uid, different account attempting to claim it
    const second = await linkage.linkAccount('user-B', secondToken);
    assert.equal(second.linked, false);
    assert.equal(second.reason, 'GOOGLE_ALREADY_LINKED');
    // user-B must not have been silently linked to anything
    assert.equal(linkage.getGoogleState('user-B').googleLinked, false);
});

test('linkAccount: the SAME account re-linking the SAME Google identity is allowed (not a takeover)', async () => {
    const linkage = makeLinkage();
    const token1 = makeIdToken({ uid: 'uid-same-owner' });
    const r1 = await linkage.linkAccount('user-1', token1);
    assert.equal(r1.linked, true);
    const token2 = makeIdToken({ uid: 'uid-same-owner' });
    const r2 = await linkage.linkAccount('user-1', token2);
    assert.equal(r2.linked, true);
});

// ---------------------------------------------------------------------
// client cannot self-declare verified
// ---------------------------------------------------------------------

test('security: a client cannot declare itself Google-verified by shape alone — only a real signature check links', async () => {
    const linkage = makeLinkage();
    const fakeClientClaim = { verified: true, uid: 'attacker-uid', email: 'attacker@example.com' };
    // The real API only ever accepts an idToken string, never a
    // pre-built claim object, so a caller attempting to pass a claimed
    // "verified" object directly is passed through #verify() as an
    // idToken (a non-JWT string/object) and must fail closed.
    const result = await linkage.linkAccount('user-1', fakeClientClaim);
    assert.equal(result.linked, false);
    assert.equal(result.reason, 'GOOGLE_VERIFICATION_FAILED');
});

// ---------------------------------------------------------------------
// resolveLoginCandidate() — the login-time path
// ---------------------------------------------------------------------

test('resolveLoginCandidate: a verified but unlinked Google identity is NOT a login (no email-matching fallback)', async () => {
    const linkage = makeLinkage();
    const token = makeIdToken({ uid: 'uid-never-linked' });
    const result = await linkage.resolveLoginCandidate(token);
    assert.equal(result.available, false);
    assert.equal(result.reason, 'NO_LINKED_ACCOUNT');
});

test('resolveLoginCandidate: a linked, real identity resolves to the correct account', async () => {
    const linkage = makeLinkage();
    const token = makeIdToken({ uid: 'uid-linked-1' });
    await linkage.linkAccount('real-user-42', token);
    const loginToken = makeIdToken({ uid: 'uid-linked-1' });
    const result = await linkage.resolveLoginCandidate(loginToken);
    assert.equal(result.available, true);
    assert.equal(result.userId, 'real-user-42');
});

test('resolveLoginCandidate: an invalid/forged token never resolves to any account', async () => {
    const linkage = makeLinkage();
    const token = makeIdToken({ uid: 'uid-linked-2' });
    await linkage.linkAccount('real-user-7', token);
    const result = await linkage.resolveLoginCandidate('not-a-real-token');
    assert.equal(result.available, false);
    assert.equal(result.reason, 'GOOGLE_VERIFICATION_FAILED');
});

test('resolveLoginCandidate: unlinking disables login even though the Google identity itself is still valid', async () => {
    const linkage = makeLinkage();
    const token = makeIdToken({ uid: 'uid-linked-3' });
    await linkage.linkAccount('real-user-9', token);
    linkage.unlinkAccount('real-user-9');
    const loginToken = makeIdToken({ uid: 'uid-linked-3' });
    const result = await linkage.resolveLoginCandidate(loginToken);
    assert.equal(result.available, false);
    assert.equal(result.reason, 'NO_LINKED_ACCOUNT');
});

// ---------------------------------------------------------------------
// extractEmailFromVerifiedToken() — decode-only, never a trust source
// ---------------------------------------------------------------------

test('extractEmailFromVerifiedToken: reads the email claim from a well-formed token', () => {
    const token = makeIdToken({ email: 'someone@example.com' });
    assert.equal(extractEmailFromVerifiedToken(token), 'someone@example.com');
});

test('extractEmailFromVerifiedToken: returns null for a malformed token rather than throwing', () => {
    assert.equal(extractEmailFromVerifiedToken('not-a-jwt'), null);
    assert.equal(extractEmailFromVerifiedToken(''), null);
    assert.equal(extractEmailFromVerifiedToken(undefined), null);
});

// ---------------------------------------------------------------------
// construction fail-closed checks
// ---------------------------------------------------------------------

test('constructor: throws without a real store adapter', () => {
    assert.throws(() => new CozyGoogleAccountLinkage({ projectId: PROJECT_ID }));
});

test('constructor: throws without a projectId', () => {
    assert.throws(() => new CozyGoogleAccountLinkage({ store: new InMemoryGoogleLinkageStore() }));
});
