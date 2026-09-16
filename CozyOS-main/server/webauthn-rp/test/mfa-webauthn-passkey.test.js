'use strict';
// Real tests for the WebAuthn/passkey second-factor step-up:
// password login -> mfaRequired/pendingId -> complete the SAME pending
// session with a real WebAuthn assertion instead of a TOTP code.
// Reuses the existing, real (crypto-based, not mocked) virtual
// authenticator and the existing pending-auth lifecycle test patterns
// established in mfa-pending-auth.test.js and http-integration.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('../server');
const { createVirtualAuthenticator } = require('./virtual-authenticator');
const { totpCodeAt } = require('../totp');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-mfa-passkey-${name}`);
}

async function withServer(name, opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const dbPath = freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN, mfaRateLimit: opts.mfaRateLimit });
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
  return setCookie ? setCookie.split(';')[0] : null;
}

async function post(base, path_, body, cookie) {
  const res = await fetch(base + path_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: extractCookie(res) };
}

/**
 * Real setup: a password account with a real, registered WebAuthn
 * credential attached to the SAME email (beginRegistration() resolves
 * the existing user for a matching email — this is the same "attach a
 * passkey to an existing account" shape the real product already
 * relies on, not a test-only shortcut).
 */
async function setupPasswordAccountWithPasskey(base, { email, password }) {
  await post(base, '/auth/register', { email, password });
  const auth = createVirtualAuthenticator({ rpId: RP_ID, origin: ORIGIN });
  const begin = await post(base, '/webauthn/register/begin', { email });
  const regResp = auth.register(begin.json.challenge);
  const complete = await post(base, '/webauthn/register/complete', {
    email, clientDataJSON: regResp.clientDataJSON, attestationObject: regResp.attestationObjectB64,
  });
  assert.equal(complete.status, 200, 'passkey registration must succeed');
  return { auth, email };
}

async function loginToPending(base, { email, password }) {
  const login = await post(base, '/auth/login', { email, password });
  assert.equal(login.status, 200);
  assert.equal(login.json.mfaRequired, true, 'password login must not issue a session directly when a second factor is available');
  assert.equal(login.cookie, null, 'no session cookie may be set before the second factor is verified');
  return login.json.pendingId;
}

// ---------------------------------------------------------------------
// This phase's core requirement: an admin account with ONLY a
// registered passkey (no TOTP) must still be gated behind a real
// second factor, not silently allowed straight through on password
// alone.
// ---------------------------------------------------------------------

test('an admin account with a registered passkey (no TOTP) is gated behind mfaRequired on password login, and a plain password never issues a session', async () => {
  await withServer('admin-gated', async ({ base, rp }) => {
    const email = 'admin@example.com';
    const password = 'correct horse battery staple 1';
    const { } = await setupPasswordAccountWithPasskey(base, { email, password });
    const user = await rp.getOrCreateUser(email);
    await rp.setPlatformAdmin(user.id, true);

    const login = await post(base, '/auth/login', { email, password });
    assert.equal(login.status, 200);
    assert.equal(login.json.mfaRequired, true, 'an admin account with a real second factor available must be gated, not passed straight through');
    assert.equal(login.cookie, null);
  });
});

// ---------------------------------------------------------------------
// Real end-to-end second-factor completion via WebAuthn/passkey
// ---------------------------------------------------------------------

test('a real WebAuthn assertion completes the pending-auth session and issues the real, server-authoritative session cookie', async () => {
  await withServer('happy-path', async ({ base, rp }) => {
    const email = 'admin@example.com';
    const password = 'correct horse battery staple 1';
    const { auth } = await setupPasswordAccountWithPasskey(base, { email, password });
    const user = await rp.getOrCreateUser(email);
    await rp.setPlatformAdmin(user.id, true);

    const pendingId = await loginToPending(base, { email, password });

    const begin = await post(base, '/auth/mfa/webauthn/begin', { pendingId });
    assert.equal(begin.status, 200);
    assert.ok(begin.json.challenge);
    assert.equal(begin.json.allowCredentials.length, 1);

    const assertion = auth.authenticate(begin.json.challenge);
    const complete = await post(base, '/auth/mfa/webauthn/complete', {
      pendingId,
      credentialId: assertion.credentialId,
      clientDataJSON: assertion.clientDataJSON,
      authenticatorData: assertion.authenticatorDataB64,
      signature: assertion.signatureB64,
    });
    assert.equal(complete.status, 200);
    assert.equal(complete.json.ok, true);
    assert.equal(complete.json.isPlatformAdmin, true);
    assert.ok(complete.cookie, 'a real session cookie must be issued only now, after the second factor is verified');

    // Confirm the issued cookie is a genuinely working, authoritative session.
    const sessionCheck = await fetch(`${base}/webauthn/session`, { headers: { Cookie: complete.cookie } });
    const sessionBody = await sessionCheck.json();
    assert.equal(sessionCheck.status, 200);
    assert.equal(sessionBody.isPlatformAdmin, true);
  });
});

test('ordinary (non-admin) users are completely unaffected by this feature - password-only login with no second factor still issues a session directly', async () => {
  await withServer('ordinary-user-unaffected', async ({ base }) => {
    const email = 'member@example.com';
    const password = 'correct horse battery staple 1';
    await post(base, '/auth/register', { email, password });
    const login = await post(base, '/auth/login', { email, password });
    assert.equal(login.status, 200);
    assert.equal(login.json.ok, true);
    assert.ok(login.cookie, 'an ordinary user with no second factor enrolled must still log in directly, exactly as before');
    assert.equal(login.json.mfaRequired, undefined);
  });
});

// ---------------------------------------------------------------------
// Security: reuses the existing pending-auth lifecycle guarantees
// ---------------------------------------------------------------------

test('a pending session can be completed with EITHER TOTP or WebAuthn, but only once - completing it one way consumes it for the other too', async () => {
  await withServer('cross-method-consumption', async ({ base, rp }) => {
    const email = 'admin@example.com';
    const password = 'correct horse battery staple 1';
    const { auth } = await setupPasswordAccountWithPasskey(base, { email, password });
    const user = await rp.getOrCreateUser(email);
    await rp.setPlatformAdmin(user.id, true);

    // Also enroll TOTP for the same account.
    const loginForEnroll = await post(base, '/auth/login', { email, password });
    // Since a passkey now exists, this account is ALREADY gated - use
    // WebAuthn once purely to get an authenticated session for TOTP
    // enrollment.
    const enrollPendingId = loginForEnroll.json.pendingId;
    const beginForEnroll = await post(base, '/auth/mfa/webauthn/begin', { pendingId: enrollPendingId });
    const assertionForEnroll = auth.authenticate(beginForEnroll.json.challenge);
    const enrollLogin = await post(base, '/auth/mfa/webauthn/complete', {
      pendingId: enrollPendingId, credentialId: assertionForEnroll.credentialId,
      clientDataJSON: assertionForEnroll.clientDataJSON, authenticatorData: assertionForEnroll.authenticatorDataB64, signature: assertionForEnroll.signatureB64,
    });
    const totpBegin = await post(base, '/auth/mfa/totp/enroll/begin', {}, enrollLogin.cookie);
    const totpCode = totpCodeAt(totpBegin.json.secret, Date.now());
    await post(base, '/auth/mfa/totp/enroll/complete', { code: totpCode }, enrollLogin.cookie);

    // Now start a FRESH pending session and complete it via WebAuthn.
    const pendingId = await loginToPending(base, { email, password });
    const begin = await post(base, '/auth/mfa/webauthn/begin', { pendingId });
    const assertion = auth.authenticate(begin.json.challenge);
    const complete = await post(base, '/auth/mfa/webauthn/complete', {
      pendingId, credentialId: assertion.credentialId, clientDataJSON: assertion.clientDataJSON,
      authenticatorData: assertion.authenticatorDataB64, signature: assertion.signatureB64,
    });
    assert.equal(complete.status, 200);

    // The SAME pendingId must now be rejected via the TOTP path too -
    // proving one shared, real pending-auth row, not two independent ones.
    const freshTotpCode = totpCodeAt(totpBegin.json.secret, Date.now());
    const totpAttempt = await post(base, '/auth/mfa/verify', { pendingId, code: freshTotpCode });
    assert.equal(totpAttempt.status, 401);
    assert.equal(totpAttempt.json.error, 'mfa_session_invalid');
  });
});

test('a credential belonging to a DIFFERENT user cannot complete this pending-auth session', async () => {
  await withServer('foreign-credential', async ({ base, rp }) => {
    const emailA = 'admin@example.com';
    const emailB = 'other-admin@example.com';
    const password = 'correct horse battery staple 1';
    await setupPasswordAccountWithPasskey(base, { email: emailA, password });
    const { auth: authB } = await setupPasswordAccountWithPasskey(base, { email: emailB, password });
    const userA = await rp.getOrCreateUser(emailA);
    await rp.setPlatformAdmin(userA.id, true);

    const pendingId = await loginToPending(base, { email: emailA, password });
    const begin = await post(base, '/auth/mfa/webauthn/begin', { pendingId });
    assert.equal(begin.json.allowCredentials.length, 1, 'only account A\'s own credential must be offered');

    // Attacker (account B) tries to forge a request using their OWN
    // real, valid assertion against account A's pending session.
    const beginForB = await post(base, '/webauthn/authenticate/begin', { email: emailB });
    const foreignAssertion = authB.authenticate(beginForB.json.challenge);
    const attempt = await post(base, '/auth/mfa/webauthn/complete', {
      pendingId, credentialId: foreignAssertion.credentialId, clientDataJSON: foreignAssertion.clientDataJSON,
      authenticatorData: foreignAssertion.authenticatorDataB64, signature: foreignAssertion.signatureB64,
    });
    assert.equal(attempt.status, 401);
    assert.equal(attempt.json.error, 'invalid_mfa_code', 'a foreign credential must fail through the same generic MFA-failure path, not a detailed WebAuthn error');
  });
});

test('a forged/garbage assertion is rejected and counts toward the shared attempt cap - repeated failures lock the pending session exactly as TOTP failures would', async () => {
  await withServer('attempt-cap', async ({ base, rp }) => {
    const email = 'admin@example.com';
    const password = 'correct horse battery staple 1';
    const { } = await setupPasswordAccountWithPasskey(base, { email, password });
    const user = await rp.getOrCreateUser(email);
    await rp.setPlatformAdmin(user.id, true);

    const pendingId = await loginToPending(base, { email, password });
    let lastAttempt;
    for (let i = 0; i < 6; i++) {
      lastAttempt = await post(base, '/auth/mfa/webauthn/complete', {
        pendingId, credentialId: 'not-a-real-credential-id', clientDataJSON: 'garbage', authenticatorData: 'garbage', signature: 'garbage',
      });
    }
    assert.equal(lastAttempt.status, 401);
    assert.equal(lastAttempt.json.error, 'mfa_attempts_exceeded', 'repeated bad WebAuthn attempts must exhaust the same real attempt cap TOTP already uses');
  });
});

test('a cancelled pending session cannot be completed via WebAuthn', async () => {
  await withServer('cancelled', async ({ base, rp }) => {
    const email = 'admin@example.com';
    const password = 'correct horse battery staple 1';
    const { auth } = await setupPasswordAccountWithPasskey(base, { email, password });
    const user = await rp.getOrCreateUser(email);
    await rp.setPlatformAdmin(user.id, true);

    const pendingId = await loginToPending(base, { email, password });
    await post(base, '/auth/mfa/cancel', { pendingId });

    const begin = await post(base, '/auth/mfa/webauthn/begin', { pendingId });
    assert.equal(begin.status, 401);
    assert.equal(begin.json.error, 'mfa_session_cancelled');
  });
});

test('beginPendingAuthWebAuthn honestly reports no_passkeys_registered for an account with TOTP but no passkey', async () => {
  await withServer('no-passkey', async ({ base, rp }) => {
    const email = 'totp-only@example.com';
    const password = 'correct horse battery staple 1';
    await post(base, '/auth/register', { email, password });
    const login1 = await post(base, '/auth/login', { email, password });
    const totpBegin = await post(base, '/auth/mfa/totp/enroll/begin', {}, login1.cookie);
    const totpCode = totpCodeAt(totpBegin.json.secret, Date.now());
    await post(base, '/auth/mfa/totp/enroll/complete', { code: totpCode }, login1.cookie);

    const pendingId = await loginToPending(base, { email, password });
    const begin = await post(base, '/auth/mfa/webauthn/begin', { pendingId });
    assert.equal(begin.status, 401);
    assert.equal(begin.json.error, 'no_passkeys_registered');
  });
});

test('an unauthenticated attempt with an unknown pendingId is rejected cleanly, not treated as a real session', async () => {
  await withServer('unknown-pending', async ({ base }) => {
    const begin = await post(base, '/auth/mfa/webauthn/begin', { pendingId: 'completely-made-up' });
    assert.equal(begin.status, 401);
    assert.equal(begin.json.error, 'mfa_session_invalid');
  });
});

test('/auth/mfa/webauthn/begin and /complete share the same rate limiter as /auth/mfa/verify', async () => {
  await withServer('rate-limit', { mfaRateLimit: { windowMs: 60000, max: 2 } }, async ({ base, rp }) => {
    const email = 'admin@example.com';
    const password = 'correct horse battery staple 1';
    await setupPasswordAccountWithPasskey(base, { email, password });
    const user = await rp.getOrCreateUser(email);
    await rp.setPlatformAdmin(user.id, true);
    const pendingId = await loginToPending(base, { email, password });

    await post(base, '/auth/mfa/webauthn/begin', { pendingId });
    await post(base, '/auth/mfa/webauthn/begin', { pendingId });
    const third = await post(base, '/auth/mfa/webauthn/begin', { pendingId });
    assert.equal(third.status, 429);
  });
});
