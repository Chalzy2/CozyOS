'use strict';

/**
 * server/webauthn-rp/test/firebase-session-integration.test.js
 * Session-unification milestone — /webauthn/firebase/session
 *
 * Separate file from http-integration.test.js on purpose: that file is
 * the existing, already-passing 17-test baseline for the WebAuthn-only
 * flow and is left untouched here. This file has its own small local
 * HTTP helpers (deliberately duplicated rather than importing private
 * helpers from the other test file) and covers exactly the new surface:
 * Firebase-token-in, cozy_admin_session-cookie-out, and the single-
 * identity linking rules in rp.js's resolveOrCreateUserForFirebase().
 *
 * Same offline-RSA harness as firebase-verify.test.js — a locally
 * generated keypair signs real RS256 tokens; fetchGoogleCerts is
 * injected so no network call to Google is ever made.
 *
 * Run: node --test server/webauthn-rp/test/firebase-session-integration.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createServer, SESSION_COOKIE } = require('../server');
const { createVirtualAuthenticator } = require('./virtual-authenticator');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';
const PROJECT_ID = 'cozycabin-affiliate';
const KID = 'test-kid-1';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_KEY_PEM = publicKey.export({ type: 'spki', format: 'pem' });

async function fetchGoogleCerts() {
  return { [KID]: PUBLIC_KEY_PEM };
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeIdToken({
  uid,
  email,
  emailVerified = true,
  now = Math.floor(Date.now() / 1000),
} = {}) {
  const header = b64url(JSON.stringify({ alg: 'RS256', kid: KID, typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: uid,
    user_id: uid,
    email,
    email_verified: emailVerified,
    exp: now + 3600,
    iat: now - 1,
    auth_time: now - 1,
  }));
  const signedData = `${header}.${payload}`;
  const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(signedData), privateKey));
  return `${signedData}.${signature}`;
}

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-firebase-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createServer({
    dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN,
    firebaseProjectId: PROJECT_ID, fetchGoogleCerts,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, rp: server.rp, db: server.db });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
}

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  return setCookie.split(';')[0];
}

async function post(base, path_, body, cookie) {
  const res = await fetch(base + path_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, res };
}

async function get(base, path_, cookie) {
  const res = await fetch(base + path_, { headers: cookie ? { Cookie: cookie } : {} });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, res };
}

test('a verified Firebase ID token issues the same cozy_admin_session cookie the WebAuthn flow uses', async () => {
  await withServer('basic', async ({ base }) => {
    const token = makeIdToken({ uid: 'fb-uid-1', email: 'person@example.com' });
    const { status, json, res } = await post(base, '/webauthn/firebase/session', { idToken: token });
    assert.equal(status, 200);
    assert.equal(json.ok, true);
    assert.equal(json.isPlatformAdmin, false);
    const cookie = extractCookie(res);
    assert.ok(cookie.startsWith(`${SESSION_COOKIE}=`));

    const session = await get(base, '/webauthn/session', cookie);
    assert.equal(session.status, 200);
    assert.equal(session.json.authenticated, true);
    assert.equal(session.json.email, 'person@example.com');
  });
});

test('an invalid/forged Firebase token is rejected generically and issues no cookie', async () => {
  await withServer('forged', async ({ base }) => {
    const { status, json, res } = await post(base, '/webauthn/firebase/session', { idToken: 'not-a-real-token' });
    assert.equal(status, 401);
    assert.equal(json.authenticated, false);
    assert.equal(json.reason, 'auth_failed');
    assert.equal(res.headers.get('set-cookie'), null);
  });
});

test('missing idToken is rejected without calling verification at all', async () => {
  await withServer('missing', async ({ base }) => {
    const { status, json } = await post(base, '/webauthn/firebase/session', {});
    assert.equal(status, 400);
    assert.equal(json.reason, 'missing_id_token');
  });
});

test('the same Firebase uid logging in twice resolves to the same CozyOS user (no duplicate accounts)', async () => {
  await withServer('same-uid-twice', async ({ base, rp }) => {
    const token1 = makeIdToken({ uid: 'fb-uid-2', email: 'repeat@example.com' });
    const first = await post(base, '/webauthn/firebase/session', { idToken: token1 });
    assert.equal(first.status, 200);

    const token2 = makeIdToken({ uid: 'fb-uid-2', email: 'repeat@example.com' });
    const second = await post(base, '/webauthn/firebase/session', { idToken: token2 });
    assert.equal(second.status, 200);

    const users = await rp.db.all('SELECT * FROM users WHERE email = ?', ['repeat@example.com']);
    assert.equal(users.length, 1, 'must not create a second CozyOS account for the same Firebase identity');
  });
});

test('a user who already has a WebAuthn passkey account gets Firebase LINKED to it, not duplicated', async () => {
  await withServer('link-existing', async ({ base, rp }) => {
    // 1. Register a passkey the ordinary WebAuthn way first.
    const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/register/begin', { email: 'linked@example.com' });
    assert.equal(begin.status, 200);
    const attestation = auth.register(begin.json.challenge);
    const complete = await post(base, '/webauthn/register/complete', {
      email: 'linked@example.com',
      clientDataJSON: attestation.clientDataJSON,
      attestationObject: attestation.attestationObjectB64,
    });
    assert.equal(complete.status, 200);

    const beforeLink = await rp.db.get('SELECT * FROM users WHERE email = ?', ['linked@example.com']);
    assert.ok(beforeLink);
    assert.equal(beforeLink.firebase_uid, null);

    // 2. Now the SAME person signs in with Firebase using the same email.
    const token = makeIdToken({ uid: 'fb-uid-linked', email: 'linked@example.com' });
    const firebaseLogin = await post(base, '/webauthn/firebase/session', { idToken: token });
    assert.equal(firebaseLogin.status, 200);

    const allUsers = await rp.db.all('SELECT * FROM users WHERE email = ?', ['linked@example.com']);
    assert.equal(allUsers.length, 1, 'must link onto the existing passkey account, not create a second one');
    assert.equal(allUsers[0].id, beforeLink.id);
    assert.equal(allUsers[0].firebase_uid, 'fb-uid-linked');
  });
});

test('a CozyOS account already linked to a different Firebase identity refuses to be re-linked', async () => {
  await withServer('conflict', async ({ base }) => {
    const tokenA = makeIdToken({ uid: 'fb-uid-owner', email: 'contested@example.com' });
    const first = await post(base, '/webauthn/firebase/session', { idToken: tokenA });
    assert.equal(first.status, 200);

    const tokenB = makeIdToken({ uid: 'fb-uid-intruder', email: 'contested@example.com' });
    const second = await post(base, '/webauthn/firebase/session', { idToken: tokenB });
    assert.equal(second.status, 400);
    assert.equal(second.json.error, 'firebase_link_conflict');
  });
});

test('an administrator granted via the bootstrap CLI is recognized through the Firebase login path', async () => {
  await withServer('admin-via-firebase', async ({ base, rp }) => {
    const user = await rp.getOrCreateUser('boss@example.com');
    await rp.setPlatformAdmin(user.id, true);

    const token = makeIdToken({ uid: 'fb-uid-boss', email: 'boss@example.com' });
    const login = await post(base, '/webauthn/firebase/session', { idToken: token });
    assert.equal(login.status, 200);
    assert.equal(login.json.isPlatformAdmin, true);

    const cookie = extractCookie(login.res);
    const authz = await get(base, '/webauthn/authorize/admin', cookie);
    assert.equal(authz.status, 200);
    assert.equal(authz.json.authorized, true);
  });
});

test('an ordinary Firebase-authenticated user is denied administrator authorization', async () => {
  await withServer('non-admin-via-firebase', async ({ base }) => {
    const token = makeIdToken({ uid: 'fb-uid-normal', email: 'normal@example.com' });
    const login = await post(base, '/webauthn/firebase/session', { idToken: token });
    assert.equal(login.status, 200);
    assert.equal(login.json.isPlatformAdmin, false);

    const cookie = extractCookie(login.res);
    const authz = await get(base, '/webauthn/authorize/admin', cookie);
    assert.equal(authz.status, 403);
    assert.equal(authz.json.authorized, false);
  });
});

test('logout revokes a Firebase-issued session exactly like a WebAuthn-issued one', async () => {
  await withServer('logout', async ({ base }) => {
    const token = makeIdToken({ uid: 'fb-uid-logout', email: 'logout@example.com' });
    const login = await post(base, '/webauthn/firebase/session', { idToken: token });
    const cookie = extractCookie(login.res);

    const before = await get(base, '/webauthn/session', cookie);
    assert.equal(before.json.authenticated, true);

    const logout = await post(base, '/webauthn/logout', {}, cookie);
    assert.equal(logout.status, 200);

    const after = await get(base, '/webauthn/session', cookie);
    assert.equal(after.status, 401);
  });
});

test('without a configured firebaseProjectId, the route fails closed instead of accepting tokens', async () => {
  const dbPath = freshDbPath('unconfigured');
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const token = makeIdToken({ uid: 'fb-uid-x', email: 'x@example.com' });
    const { status, json } = await post(base, '/webauthn/firebase/session', { idToken: token });
    assert.equal(status, 501);
    assert.equal(json.reason, 'firebase_not_configured');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
});
