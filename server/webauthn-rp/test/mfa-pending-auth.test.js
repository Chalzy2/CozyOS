'use strict';
// Phase C §4/§25 — real tests for the server-side pending-MFA
// architecture: TOTP enrollment, the password_verified_pending_mfa
// state, recovery codes, attempt exhaustion, cancellation, and the
// single most important property of this whole slice — a pending id
// can never be used as if it were a real session.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server');
const { totpCodeAt } = require('../totp');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-mfa-${name}`);
}

async function withServer(name, opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const dbPath = freshDbPath(name);
  let clock = opts.startTime || Date.now();
  const now = () => clock;
  const server = createServer({
    dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN,
    now,
    loginRateLimit: opts.loginRateLimit,
    mfaRateLimit: opts.mfaRateLimit,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const advanceClock = (ms) => { clock += ms; };
  try {
    await fn({ server, base, rp: server.rp, db: server.db, advanceClock, getNow: () => clock });
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
  return { status: res.status, json, cookie: extractCookie(res) };
}

async function get(base, path_, cookie) {
  const res = await fetch(base + path_, { headers: cookie ? { Cookie: cookie } : {} });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// Registers a password account and fully enrolls TOTP for it, returning
// the raw secret (for generating live codes in assertions) and the
// authenticated cookie used to perform enrollment (discarded by callers
// that want to test a *fresh* login afterwards).
async function registerAndEnrollTotp(base, { email, password, getNow }) {
  await post(base, '/auth/register', { email, password });
  const login1 = await post(base, '/auth/login', { email, password });
  assert.equal(login1.status, 200);
  const sessionCookie = login1.cookie;

  const begin = await post(base, '/auth/mfa/totp/enroll/begin', {}, sessionCookie);
  assert.equal(begin.status, 200);
  assert.ok(begin.json.secret);

  const code = totpCodeAt(begin.json.secret, getNow());
  const complete = await post(base, '/auth/mfa/totp/enroll/complete', { code }, sessionCookie);
  assert.equal(complete.status, 200);
  assert.equal(complete.json.recoveryCodes.length, 10);

  return { secret: begin.json.secret, recoveryCodes: complete.json.recoveryCodes, sessionCookie };
}

test('MFA: password login for a TOTP-enrolled account returns mfaRequired + pendingId, no session cookie', async () => {
  await withServer('gate', {}, async ({ base, getNow }) => {
    const { } = await registerAndEnrollTotp(base, { email: 'a@example.com', password: 'correct horse battery', getNow });
    const login2 = await post(base, '/auth/login', { email: 'a@example.com', password: 'correct horse battery' });
    assert.equal(login2.status, 200);
    assert.equal(login2.json.mfaRequired, true);
    assert.ok(login2.json.pendingId);
    assert.equal(login2.cookie, null, 'no cozy_admin_session cookie must be set while MFA is pending');
  });
});

test('MFA: a pending id cannot authorize /webauthn/session or admin routes', async () => {
  await withServer('no-priv', {}, async ({ base, getNow }) => {
    await registerAndEnrollTotp(base, { email: 'b@example.com', password: 'correct horse battery', getNow });
    const login2 = await post(base, '/auth/login', { email: 'b@example.com', password: 'correct horse battery' });
    const { pendingId } = login2.json;

    // The pending id is never a cookie, so there is nothing for a
    // cooperating browser to send — but a modified client might try
    // sending it as the session cookie value directly. Confirm that
    // fails too: resolveSession() only ever looks up the `sessions`
    // table, which this pendingId was never inserted into.
    const asForgedCookie = `cozy_admin_session=${pendingId}`;
    const sessionCheck = await get(base, '/webauthn/session', asForgedCookie);
    assert.equal(sessionCheck.status, 401);
    const adminCheck = await get(base, '/webauthn/authorize/admin', asForgedCookie);
    assert.equal(adminCheck.status, 401);
  });
});

test('MFA: correct TOTP code completes login and sets the real session cookie', async () => {
  await withServer('totp-ok', {}, async ({ base, getNow }) => {
    const { secret } = await registerAndEnrollTotp(base, { email: 'c@example.com', password: 'correct horse battery', getNow });
    const login2 = await post(base, '/auth/login', { email: 'c@example.com', password: 'correct horse battery' });
    const { pendingId } = login2.json;

    const code = totpCodeAt(secret, getNow());
    const verify = await post(base, '/auth/mfa/verify', { pendingId, code });
    assert.equal(verify.status, 200);
    assert.equal(verify.json.ok, true);
    assert.ok(verify.cookie, 'real session cookie must be set only after MFA succeeds');

    const sessionCheck = await get(base, '/webauthn/session', verify.cookie);
    assert.equal(sessionCheck.status, 200);
    assert.equal(sessionCheck.json.authenticated, true);
  });
});

test('MFA: wrong TOTP code fails and does not create a session', async () => {
  await withServer('totp-bad', {}, async ({ base, getNow }) => {
    await registerAndEnrollTotp(base, { email: 'd@example.com', password: 'correct horse battery', getNow });
    const login2 = await post(base, '/auth/login', { email: 'd@example.com', password: 'correct horse battery' });
    const { pendingId } = login2.json;

    const verify = await post(base, '/auth/mfa/verify', { pendingId, code: '000000' });
    assert.equal(verify.status, 401);
    assert.equal(verify.json.error, 'invalid_mfa_code');
    assert.equal(verify.cookie, null);
  });
});

test('MFA: excessive failed attempts locks the pending session even with the correct code afterward', async () => {
  await withServer('totp-lockout', {}, async ({ base, getNow }) => {
    const { secret } = await registerAndEnrollTotp(base, { email: 'e@example.com', password: 'correct horse battery', getNow });
    const login2 = await post(base, '/auth/login', { email: 'e@example.com', password: 'correct horse battery' });
    const { pendingId } = login2.json;

    let last;
    for (let i = 0; i < 5; i++) {
      last = await post(base, '/auth/mfa/verify', { pendingId, code: '000000' });
    }
    assert.equal(last.status, 401);
    assert.equal(last.json.error, 'mfa_attempts_exceeded');

    // Even the genuinely correct code no longer works once locked.
    const code = totpCodeAt(secret, getNow());
    const afterLock = await post(base, '/auth/mfa/verify', { pendingId, code });
    assert.equal(afterLock.status, 401);
    assert.equal(afterLock.json.error, 'mfa_attempts_exceeded');
  });
});

test('MFA: cancelling a pending login invalidates it', async () => {
  await withServer('totp-cancel', {}, async ({ base, getNow }) => {
    const { secret } = await registerAndEnrollTotp(base, { email: 'f@example.com', password: 'correct horse battery', getNow });
    const login2 = await post(base, '/auth/login', { email: 'f@example.com', password: 'correct horse battery' });
    const { pendingId } = login2.json;

    const cancel = await post(base, '/auth/mfa/cancel', { pendingId });
    assert.equal(cancel.status, 200);

    const code = totpCodeAt(secret, getNow());
    const verify = await post(base, '/auth/mfa/verify', { pendingId, code });
    assert.equal(verify.status, 401);
    assert.equal(verify.json.error, 'mfa_session_cancelled');
  });
});

test('MFA: an expired pending session cannot be completed', async () => {
  await withServer('totp-expired', {}, async ({ base, getNow, advanceClock }) => {
    const { secret } = await registerAndEnrollTotp(base, { email: 'g@example.com', password: 'correct horse battery', getNow });
    const login2 = await post(base, '/auth/login', { email: 'g@example.com', password: 'correct horse battery' });
    const { pendingId } = login2.json;

    const code = totpCodeAt(secret, getNow());
    advanceClock(6 * 60 * 1000); // past the 5-minute pending-auth TTL
    const verify = await post(base, '/auth/mfa/verify', { pendingId, code });
    assert.equal(verify.status, 401);
    assert.equal(verify.json.error, 'mfa_session_expired');
  });
});

test('MFA: a recovery code completes login exactly once', async () => {
  await withServer('recovery', {}, async ({ base, getNow }) => {
    const { recoveryCodes } = await registerAndEnrollTotp(base, { email: 'h@example.com', password: 'correct horse battery', getNow });
    const code = recoveryCodes[0];

    const login2 = await post(base, '/auth/login', { email: 'h@example.com', password: 'correct horse battery' });
    const verify = await post(base, '/auth/mfa/verify', { pendingId: login2.json.pendingId, code, method: 'recovery' });
    assert.equal(verify.status, 200);
    assert.ok(verify.cookie);

    // Same code cannot be reused on a fresh login attempt.
    const login3 = await post(base, '/auth/login', { email: 'h@example.com', password: 'correct horse battery' });
    const verify2 = await post(base, '/auth/mfa/verify', { pendingId: login3.json.pendingId, code, method: 'recovery' });
    assert.equal(verify2.status, 401);
    assert.equal(verify2.json.error, 'invalid_mfa_code');
  });
});

test('MFA: an unconfirmed enrollment (begin but never complete) does not require MFA at login', async () => {
  await withServer('unconfirmed', {}, async ({ base }) => {
    await post(base, '/auth/register', { email: 'i@example.com', password: 'correct horse battery' });
    const login1 = await post(base, '/auth/login', { email: 'i@example.com', password: 'correct horse battery' });
    await post(base, '/auth/mfa/totp/enroll/begin', {}, login1.cookie);
    // Never calls enroll/complete.

    const login2 = await post(base, '/auth/login', { email: 'i@example.com', password: 'correct horse battery' });
    assert.equal(login2.status, 200);
    assert.equal(login2.json.mfaRequired, undefined);
    assert.ok(login2.cookie, 'an unconfirmed secret must not gate login');
  });
});

test('MFA: enroll/complete rejects a wrong confirmation code and does not enable MFA', async () => {
  await withServer('enroll-bad-code', {}, async ({ base }) => {
    await post(base, '/auth/register', { email: 'j@example.com', password: 'correct horse battery' });
    const login1 = await post(base, '/auth/login', { email: 'j@example.com', password: 'correct horse battery' });
    await post(base, '/auth/mfa/totp/enroll/begin', {}, login1.cookie);
    const complete = await post(base, '/auth/mfa/totp/enroll/complete', { code: '000000' }, login1.cookie);
    assert.equal(complete.status, 400);
    assert.equal(complete.json.error, 'invalid_mfa_code');

    const login2 = await post(base, '/auth/login', { email: 'j@example.com', password: 'correct horse battery' });
    assert.equal(login2.json.mfaRequired, undefined, 'MFA must stay off after a failed confirmation');
  });
});

test('MFA: enrollment routes require an authenticated session, not a bare userId/email', async () => {
  await withServer('enroll-auth-required', {}, async ({ base }) => {
    const begin = await post(base, '/auth/mfa/totp/enroll/begin', {});
    assert.equal(begin.status, 401);
    const complete = await post(base, '/auth/mfa/totp/enroll/complete', { code: '123456' });
    assert.equal(complete.status, 401);
  });
});

test('MFA: disabling TOTP removes the login gate and its recovery codes', async () => {
  await withServer('disable', {}, async ({ base, getNow }) => {
    const { recoveryCodes, sessionCookie } = await registerAndEnrollTotp(base, { email: 'k@example.com', password: 'correct horse battery', getNow });
    const disable = await post(base, '/auth/mfa/totp/disable', {}, sessionCookie);
    assert.equal(disable.status, 200);

    const login2 = await post(base, '/auth/login', { email: 'k@example.com', password: 'correct horse battery' });
    assert.equal(login2.json.mfaRequired, undefined);
    assert.ok(login2.cookie);

    // Re-enrolling issues an entirely new recovery-code set; the old
    // codes must not still work against the new enrollment.
    const begin2 = await post(base, '/auth/mfa/totp/enroll/begin', {}, login2.cookie);
    const { totpCodeAt: _unused } = {};
    const freshCode = totpCodeAt(begin2.json.secret, getNow());
    await post(base, '/auth/mfa/totp/enroll/complete', { code: freshCode }, login2.cookie);
    const login3 = await post(base, '/auth/login', { email: 'k@example.com', password: 'correct horse battery' });
    const verifyOldCode = await post(base, '/auth/mfa/verify', { pendingId: login3.json.pendingId, code: recoveryCodes[1], method: 'recovery' });
    assert.equal(verifyOldCode.status, 401);
  });
});

test('MFA: verify endpoint is rate-limited per IP independent of the login limiter', async () => {
  await withServer('mfa-rate-limit', { mfaRateLimit: { windowMs: 60_000, max: 2 } }, async ({ base, getNow }) => {
    await registerAndEnrollTotp(base, { email: 'l@example.com', password: 'correct horse battery', getNow });
    const login2 = await post(base, '/auth/login', { email: 'l@example.com', password: 'correct horse battery' });
    const { pendingId } = login2.json;

    await post(base, '/auth/mfa/verify', { pendingId, code: '000000' });
    await post(base, '/auth/mfa/verify', { pendingId, code: '000000' });
    const third = await post(base, '/auth/mfa/verify', { pendingId, code: '000000' });
    assert.equal(third.status, 429);
  });
});
