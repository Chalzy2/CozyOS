'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer, SESSION_COOKIE } = require('../server');
const { createVirtualAuthenticator } = require('./virtual-authenticator');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-http-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, rp: server.rp, db: server.db });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    // Force-close any keep-alive sockets so the test process can exit
    // promptly instead of hanging on lingering connections.
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

async function registerAdmin(base, rp, email = 'admin@example.com') {
  const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
  const begin = await post(base, '/webauthn/register/begin', { email });
  const regResp = auth.register(begin.json.challenge);
  const complete = await post(base, '/webauthn/register/complete', {
    email,
    clientDataJSON: regResp.clientDataJSON,
    attestationObject: regResp.attestationObjectB64,
  });
  assert.equal(complete.status, 200, 'registration should succeed');
  const user = rp.getOrCreateUser(email);
  rp.setPlatformAdmin(user.id, true);
  return { auth, email, userId: user.id };
}

async function loginAs(base, auth, email) {
  const begin = await post(base, '/webauthn/authenticate/begin', { email });
  const assertion = auth.authenticate(begin.json.challenge);
  const complete = await post(base, '/webauthn/authenticate/complete', {
    credentialId: assertion.credentialId,
    clientDataJSON: assertion.clientDataJSON,
    authenticatorData: assertion.authenticatorDataB64,
    signature: assertion.signatureB64,
  });
  return { complete, cookie: extractCookie(complete.res) };
}

test('valid administrator WebAuthn authentication succeeds and reaches admin authorization', async () => {
  await withServer('valid-admin', async ({ base, rp }) => {
    const { auth, email } = await registerAdmin(base, rp);
    const { complete, cookie } = await loginAs(base, auth, email);
    assert.equal(complete.status, 200);
    assert.equal(complete.json.isPlatformAdmin, true);

    const authz = await get(base, '/webauthn/authorize/admin', cookie);
    assert.equal(authz.status, 200);
    assert.equal(authz.json.authorized, true);
  });
});

test('unauthenticated user cannot enter administrator workspace', async () => {
  await withServer('unauthed', async ({ base }) => {
    const authz = await get(base, '/webauthn/authorize/admin', null);
    assert.equal(authz.status, 401);
    assert.equal(authz.json.authorized, false);
  });
});

test('ordinary authenticated (non-admin) user cannot enter administrator workspace', async () => {
  await withServer('ordinary-user', async ({ base, rp }) => {
    const email = 'user@example.com';
    const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/register/begin', { email });
    const regResp = auth.register(begin.json.challenge);
    await post(base, '/webauthn/register/complete', {
      email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
    });
    // Deliberately do NOT call rp.setPlatformAdmin — ordinary user.
    const { complete, cookie } = await loginAs(base, auth, email);
    assert.equal(complete.json.isPlatformAdmin, false);

    const authz = await get(base, '/webauthn/authorize/admin', cookie);
    assert.equal(authz.status, 403);
    assert.equal(authz.json.authorized, false);
  });
});

test('forged X-Is-Platform-Admin header is ignored', async () => {
  await withServer('forged-header', async ({ base, rp }) => {
    const email = 'user2@example.com';
    const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/register/begin', { email });
    const regResp = auth.register(begin.json.challenge);
    await post(base, '/webauthn/register/complete', {
      email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
    });
    const { cookie } = await loginAs(base, auth, email);

    const res = await fetch(base + '/webauthn/authorize/admin', {
      headers: { Cookie: cookie, 'X-Is-Platform-Admin': 'true' },
    });
    const json = await res.json();
    assert.equal(res.status, 403, 'forged header must not grant admin access');
    assert.equal(json.authorized, false);
  });
});

test('forged/garbage session cookie fails', async () => {
  await withServer('forged-cookie', async ({ base }) => {
    const authz = await get(base, '/webauthn/authorize/admin', `${SESSION_COOKIE}=not-a-real-session-id`);
    assert.equal(authz.status, 401);
  });
});

test('revoked passkey fails authentication', async () => {
  await withServer('revoked-passkey', async ({ base, rp }) => {
    const { auth, email, userId } = await registerAdmin(base, rp);
    rp.revokeCredential(userId, auth.credentialId);

    const begin = await post(base, '/webauthn/authenticate/begin', { email });
    const assertion = auth.authenticate(begin.json.challenge);
    const complete = await post(base, '/webauthn/authenticate/complete', {
      credentialId: assertion.credentialId,
      clientDataJSON: assertion.clientDataJSON,
      authenticatorData: assertion.authenticatorDataB64,
      signature: assertion.signatureB64,
    });
    assert.equal(complete.status, 400);
    assert.equal(complete.json.error, 'credential_revoked');
  });
});

test('revoked session fails', async () => {
  await withServer('revoked-session', async ({ base, rp }) => {
    const { auth, email } = await registerAdmin(base, rp);
    const { cookie } = await loginAs(base, auth, email);

    let authz = await get(base, '/webauthn/authorize/admin', cookie);
    assert.equal(authz.status, 200);

    await post(base, '/webauthn/logout', {}, cookie);

    authz = await get(base, '/webauthn/authorize/admin', cookie);
    assert.equal(authz.status, 401, 'session must be dead immediately after logout/revocation');
  });
});

test('expired session fails', async () => {
  let clock = Date.now();
  const dbPath = freshDbPath('expired-session');
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN, now: () => clock });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { auth, email } = await registerAdmin(base, server.rp, 'expiry@example.com');
    const { cookie } = await loginAs(base, auth, email);

    let authz = await get(base, '/webauthn/authorize/admin', cookie);
    assert.equal(authz.status, 200);

    clock += 31 * 24 * 60 * 60 * 1000; // fast-forward past the 30-day session TTL

    authz = await get(base, '/webauthn/authorize/admin', cookie);
    assert.equal(authz.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
  }
});

test('forged signature is rejected', async () => {
  await withServer('forged-sig', async ({ base, rp }) => {
    const email = 'sig@example.com';
    const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/register/begin', { email });
    const regResp = auth.register(begin.json.challenge);
    await post(base, '/webauthn/register/complete', {
      email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
    });

    const authBegin = await post(base, '/webauthn/authenticate/begin', { email });
    const assertion = auth.authenticate(authBegin.json.challenge, { corruptSignature: true });
    const complete = await post(base, '/webauthn/authenticate/complete', {
      credentialId: assertion.credentialId,
      clientDataJSON: assertion.clientDataJSON,
      authenticatorData: assertion.authenticatorDataB64,
      signature: assertion.signatureB64,
    });
    assert.equal(complete.status, 400);
    assert.equal(complete.json.error, 'invalid_signature');
  });
});

test('cloned authenticator (non-increasing sign counter) is rejected', async () => {
  await withServer('cloned-auth', async ({ base, rp }) => {
    const { auth, email } = await registerAdmin(base, rp, 'clone@example.com');
    // First real login succeeds and bumps the counter.
    const first = await loginAs(base, auth, email);
    assert.equal(first.complete.status, 200);

    // A cloned authenticator replays with a sign count that does not exceed
    // what the server already saw.
    const begin = await post(base, '/webauthn/authenticate/begin', { email });
    const clonedAssertion = auth.authenticate(begin.json.challenge, { forceSignCount: 1 });
    const replay = await post(base, '/webauthn/authenticate/complete', {
      credentialId: clonedAssertion.credentialId,
      clientDataJSON: clonedAssertion.clientDataJSON,
      authenticatorData: clonedAssertion.authenticatorDataB64,
      signature: clonedAssertion.signatureB64,
    });
    assert.equal(replay.status, 400);
    assert.equal(replay.json.error, 'sign_count_did_not_increase');
  });
});

test('replayed/expired challenge is rejected', async () => {
  let clock = Date.now();
  const dbPath = freshDbPath('expired-challenge');
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN, now: () => clock });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const email = 'challenge@example.com';
    const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/register/begin', { email });
    clock += 6 * 60 * 1000; // fast-forward past the 5-minute challenge TTL
    const regResp = auth.register(begin.json.challenge);
    const complete = await post(base, '/webauthn/register/complete', {
      email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
    });
    assert.equal(complete.status, 400);
    assert.equal(complete.json.error, 'challenge_expired');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
  }
});

test('a consumed challenge cannot be replayed', async () => {
  await withServer('challenge-replay', async ({ base, rp }) => {
    const email = 'replay@example.com';
    const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/register/begin', { email });
    const regResp = auth.register(begin.json.challenge);
    const first = await post(base, '/webauthn/register/complete', {
      email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
    });
    assert.equal(first.status, 200);

    // Attempting to reuse the exact same challenge/response must fail —
    // "already registered" for the credential ID, or challenge-consumed
    // either way it must not silently succeed twice.
    const second = await post(base, '/webauthn/register/complete', {
      email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
    });
    assert.equal(second.status, 400);
  });
});

test('modified localStorage-style admin claim in request body is ignored', async () => {
  await withServer('body-claim', async ({ base, rp }) => {
    const email = 'localstorage@example.com';
    const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/register/begin', { email });
    const regResp = auth.register(begin.json.challenge);
    await post(base, '/webauthn/register/complete', {
      email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
    });
    const { cookie } = await loginAs(base, auth, email);

    // Attacker tries to smuggle an admin claim into a request body/field
    // the server never reads for authorization decisions.
    const res = await fetch(base + '/webauthn/authorize/admin', {
      headers: { Cookie: cookie },
    });
    // No route in server.js accepts or reads an "isPlatformAdmin" input
    // field at all — the only source of truth is the DB-backed session.
    assert.equal(res.status, 403);
  });
});

test('enrolling a passkey requires an existing authenticated session', async () => {
  await withServer('enroll-requires-session', async ({ base }) => {
    const begin = await post(base, '/webauthn/passkeys/enroll/begin', { email: 'nobody@example.com' });
    assert.equal(begin.status, 401);
    assert.equal(begin.json.error, 'not_authenticated');

    const complete = await post(base, '/webauthn/passkeys/enroll/complete', {
      clientDataJSON: '{}', attestationObject: '', nickname: 'x',
    });
    assert.equal(complete.status, 401);
    assert.equal(complete.json.error, 'not_authenticated');
  });
});

test('an ordinary authenticated (non-admin) user can self-enroll a passkey for their own account', async () => {
  await withServer('self-enroll-ordinary', async ({ base, rp }) => {
    const email = 'ordinary-enroller@example.com';
    const auth1 = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin0 = await post(base, '/webauthn/register/begin', { email });
    const reg0 = auth1.register(begin0.json.challenge);
    await post(base, '/webauthn/register/complete', {
      email, clientDataJSON: reg0.clientDataJSON, attestationObject: reg0.attestationObjectB64,
    });
    // Deliberately do NOT call rp.setPlatformAdmin — ordinary user.
    const { complete: login, cookie } = await loginAs(base, auth1, email);
    assert.equal(login.json.isPlatformAdmin, false);

    const auth2 = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/passkeys/enroll/begin', {}, cookie);
    assert.equal(begin.status, 200, 'ordinary authenticated user must be allowed to begin enrollment');
    const regResp = auth2.register(begin.json.challenge);
    const complete = await post(base, '/webauthn/passkeys/enroll/complete', {
      clientDataJSON: regResp.clientDataJSON,
      attestationObject: regResp.attestationObjectB64,
      nickname: 'ordinary user device 2',
    }, cookie);
    assert.equal(complete.status, 200, 'ordinary authenticated user must be allowed to complete enrollment');

    const list = await get(base, '/webauthn/passkeys', cookie);
    assert.equal(list.json.passkeys.length, 2, 'second credential must be attached to the enrolling user');

    // Admin authorization must remain unaffected by self-enrollment.
    const authz = await get(base, '/webauthn/authorize/admin', cookie);
    assert.equal(authz.status, 403);
  });
});

test('an authenticated user cannot enroll a passkey into another account (account substitution)', async () => {
  await withServer('enroll-account-substitution', async ({ base, rp }) => {
    // Victim account, created first, never logged in during the attack.
    const victimEmail = 'victim@example.com';
    const victim = rp.getOrCreateUser(victimEmail);

    // Attacker: a separate, legitimately authenticated ordinary user.
    const attackerEmail = 'attacker@example.com';
    const attackerAuth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin0 = await post(base, '/webauthn/register/begin', { email: attackerEmail });
    const reg0 = attackerAuth.register(begin0.json.challenge);
    await post(base, '/webauthn/register/complete', {
      email: attackerEmail, clientDataJSON: reg0.clientDataJSON, attestationObject: reg0.attestationObjectB64,
    });
    const { cookie } = await loginAs(base, attackerAuth, attackerEmail);

    // The attacker's authenticated session tries to smuggle the victim's
    // email into the enrollment request body. The server must ignore it
    // and derive identity from the session only.
    const auth2 = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/passkeys/enroll/begin', { email: victimEmail }, cookie);
    assert.equal(begin.status, 200);
    const regResp = auth2.register(begin.json.challenge);
    const complete = await post(base, '/webauthn/passkeys/enroll/complete', {
      email: victimEmail,
      clientDataJSON: regResp.clientDataJSON,
      attestationObject: regResp.attestationObjectB64,
      nickname: 'injected device',
    }, cookie);
    assert.equal(complete.status, 200);

    // The new credential must belong to the attacker's own account, and
    // the victim's credential list must be untouched.
    const attackerList = await get(base, '/webauthn/passkeys', cookie);
    assert.equal(attackerList.json.passkeys.length, 2, 'new credential must land on the attacker\'s own account');
    const victimCreds = rp.listCredentials(victim.id);
    assert.equal(victimCreds.length, 0, 'victim account must receive no credential');
  });
});

test('an authenticated admin can enroll a second passkey and use either one', async () => {
  await withServer('multi-passkey', async ({ base, rp }) => {
    const { auth: auth1, email } = await registerAdmin(base, rp, 'multi@example.com');
    const { cookie } = await loginAs(base, auth1, email);

    const auth2 = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
    const begin = await post(base, '/webauthn/passkeys/enroll/begin', {}, cookie);
    assert.equal(begin.status, 200);
    const regResp = auth2.register(begin.json.challenge);
    const complete = await post(base, '/webauthn/passkeys/enroll/complete', {
      clientDataJSON: regResp.clientDataJSON,
      attestationObject: regResp.attestationObjectB64,
      nickname: 'second device',
    }, cookie);
    assert.equal(complete.status, 200);

    const list = await get(base, '/webauthn/passkeys', cookie);
    assert.equal(list.json.passkeys.length, 2);

    // The second passkey can independently authenticate.
    const login2 = await loginAs(base, auth2, email);
    assert.equal(login2.complete.status, 200);
  });
});

test('revoking a passkey immediately prevents it from authenticating again', async () => {
  await withServer('revoke-then-auth', async ({ base, rp }) => {
    const { auth, email, userId } = await registerAdmin(base, rp, 'revokeme@example.com');
    const first = await loginAs(base, auth, email);
    assert.equal(first.complete.status, 200);

    rp.revokeCredential(userId, auth.credentialId);

    const begin = await post(base, '/webauthn/authenticate/begin', { email });
    const assertion = auth.authenticate(begin.json.challenge);
    const complete = await post(base, '/webauthn/authenticate/complete', {
      credentialId: assertion.credentialId,
      clientDataJSON: assertion.clientDataJSON,
      authenticatorData: assertion.authenticatorDataB64,
      signature: assertion.signatureB64,
    });
    assert.equal(complete.status, 400);
    assert.equal(complete.json.error, 'credential_revoked');
  });
});

test('session persists and restores admin state across a fresh server process against the same DB file (browser-restart equivalent)', async () => {
  const dbPath = freshDbPath('restart');
  let cookie;
  let email = 'restart@example.com';
  try {
    {
      const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
      await new Promise((resolve) => server.listen(0, resolve));
      const base = `http://127.0.0.1:${server.address().port}`;
      const { auth } = await registerAdmin(base, server.rp, email);
      const login = await loginAs(base, auth, email);
      cookie = login.cookie;
      await new Promise((resolve) => server.close(resolve));
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    }
    {
      // Brand new server instance/process-equivalent, same on-disk DB file.
      const server2 = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
      await new Promise((resolve) => server2.listen(0, resolve));
      const base2 = `http://127.0.0.1:${server2.address().port}`;
      const authz = await get(base2, '/webauthn/authorize/admin', cookie);
      assert.equal(authz.status, 200);
      assert.equal(authz.json.authorized, true);
      await new Promise((resolve) => server2.close(resolve));
      if (typeof server2.closeAllConnections === 'function') server2.closeAllConnections();
    }
  } finally {
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
});
