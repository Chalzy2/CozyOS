'use strict';

/**
 * server/webauthn-rp/test/firebase-verify.test.js
 * Session-unification milestone — Firebase ID Token Verification
 *
 * HARNESS DISCLOSURE: no network access. A real RSA keypair is generated
 * locally with Node's own crypto.generateKeyPairSync, and a real RS256-
 * signed JWT-shaped token is built and signed with the PRIVATE key,
 * exactly as Google's token service would. fetchGoogleCerts is injected
 * to return the PUBLIC key standing in for Google's published cert for
 * that key id. The verification code under test never knows the
 * difference — it is the exact same crypto.verify() call it would run
 * against a real Google cert in production. Only the source of the
 * public key is swapped for testability; the signature math is real.
 *
 * Run: node --test server/webauthn-rp/test/firebase-verify.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyFirebaseIdToken } = require('../firebase-verify');

const PROJECT_ID = 'cozycabin-affiliate';
const KID = 'test-kid-1';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });

const { privateKey: otherPrivateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken({
  uid = 'firebase-uid-abc',
  email = 'person@example.com',
  emailVerified = true,
  iss = `https://securetoken.google.com/${PROJECT_ID}`,
  aud = PROJECT_ID,
  now = Math.floor(Date.now() / 1000),
  exp = now + 3600,
  iat = now - 1,
  authTime = now - 1,
  kid = KID,
  alg = 'RS256',
  signingKey = privateKey,
  includeEmail = true,
} = {}) {
  const header = b64url(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const payload = {
    iss, aud, sub: uid, user_id: uid, exp, iat, auth_time: authTime,
  };
  if (includeEmail) {
    payload.email = email;
    payload.email_verified = emailVerified;
  }
  const encodedPayload = b64url(JSON.stringify(payload));
  const signedData = `${header}.${encodedPayload}`;
  const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(signedData), signingKey));
  return `${signedData}.${signature}`;
}

async function fetchGoogleCerts() {
  return { [KID]: PUBLIC_KEY_PEM };
}

test('a genuinely signed, well-formed ID token verifies and yields uid + email', async () => {
  const token = makeIdToken({ uid: 'user-abc', email: 'admin@example.com' });
  const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
  assert.equal(result.verified, true);
  assert.equal(result.uid, 'user-abc');
  assert.equal(result.email, 'admin@example.com');
});

test('rejects a token signed with a key that does not match any known kid', async () => {
  const token = makeIdToken({ signingKey: otherPrivateKey });
  const result = await verifyFirebaseIdToken(token, {
    projectId: PROJECT_ID,
    fetchGoogleCerts: async () => ({ [KID]: PUBLIC_KEY_PEM }), // real cert, wrong signing key used above
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'invalid_signature');
});

test('rejects a token whose kid is not present in the current key set', async () => {
  const token = makeIdToken({ kid: 'unknown-kid' });
  const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'unrecognized_key_id');
});

test('rejects a non-RS256 algorithm header', async () => {
  const token = makeIdToken({ alg: 'none' });
  const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'unsupported_algorithm');
});

test('rejects an expired token', async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = makeIdToken({ now, exp: now - 10, iat: now - 100, authTime: now - 100 });
  const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'id_token_expired');
});

test('rejects an unexpected issuer', async () => {
  const token = makeIdToken({ iss: 'https://securetoken.google.com/some-other-project' });
  const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'unexpected_issuer');
});

test('rejects an unexpected audience', async () => {
  const token = makeIdToken({ aud: 'some-other-project' });
  const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'unexpected_audience');
});

test('rejects a token with no email claim (cannot be linked to a CozyOS account)', async () => {
  const token = makeIdToken({ includeEmail: false });
  const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'missing_email');
});

test('rejects a token with an unverified email', async () => {
  const token = makeIdToken({ emailVerified: false });
  const result = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, fetchGoogleCerts });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'email_not_verified');
});

test('rejects a malformed token (not three dot-separated parts)', async () => {
  const result = await verifyFirebaseIdToken('not-a-jwt', { projectId: PROJECT_ID, fetchGoogleCerts });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'malformed_id_token');
});

test('projectId is a required option', async () => {
  await assert.rejects(
    () => verifyFirebaseIdToken(makeIdToken(), { fetchGoogleCerts }),
    /projectId is required/,
  );
});
