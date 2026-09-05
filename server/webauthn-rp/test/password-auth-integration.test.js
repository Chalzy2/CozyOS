'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server');
const { MockEmailProvider, MockSMSProvider } = require('../delivery-provider');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-pw-${name}`);
}

async function withServer(name, opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const dbPath = freshDbPath(name);
  let clock = opts.startTime || Date.now();
  const now = opts.controllableClock ? (() => clock) : undefined;
  const emailProvider = opts.emailProvider || new MockEmailProvider();
  const smsProvider = opts.smsProvider || new MockSMSProvider();
  const server = createServer({
    dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN,
    now,
    emailProvider,
    smsProvider,
    forgotPasswordRateLimit: opts.forgotPasswordRateLimit,
    loginRateLimit: opts.loginRateLimit,
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  const advanceClock = (ms) => { clock += ms; };
  try {
    await fn({ server, base, rp: server.rp, db: server.db, emailProvider, smsProvider, advanceClock });
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

function extractResetToken(sentEmail) {
  const url = new URL(sentEmail.text.match(/https?:\/\/\S+/)[0]);
  return url.searchParams.get('token');
}

// ---------- Password: registration + login ----------

test('password registration then valid login succeeds and issues a session', async () => {
  await withServer('reg-login', async ({ base }) => {
    const reg = await post(base, '/auth/register', { email: 'alice@example.com', password: 'correct horse battery' });
    assert.equal(reg.status, 200);
    assert.equal(reg.json.ok, true);

    const login = await post(base, '/auth/login', { email: 'alice@example.com', password: 'correct horse battery' });
    assert.equal(login.status, 200);
    assert.equal(login.json.ok, true);
    assert.ok(login.cookie, 'session cookie should be set');

    const session = await get(base, '/webauthn/session', login.cookie);
    assert.equal(session.status, 200);
    assert.equal(session.json.authenticated, true);
    assert.equal(session.json.email, 'alice@example.com');
  });
});

test('password too short is rejected at registration', async () => {
  await withServer('short-pw', async ({ base }) => {
    const reg = await post(base, '/auth/register', { email: 'bob@example.com', password: 'short' });
    assert.equal(reg.status, 400);
    assert.equal(reg.json.error, 'password_too_short');
  });
});

test('wrong password is rejected with a generic error', async () => {
  await withServer('wrong-pw', async ({ base }) => {
    await post(base, '/auth/register', { email: 'carol@example.com', password: 'correct horse battery' });
    const login = await post(base, '/auth/login', { email: 'carol@example.com', password: 'incorrect' });
    assert.equal(login.status, 401);
    assert.equal(login.json.error, 'authentication_failed');
    assert.equal(login.cookie, null);
  });
});

test('login for a nonexistent account returns the same generic error as wrong password', async () => {
  await withServer('nonexistent-pw', async ({ base }) => {
    const login = await post(base, '/auth/login', { email: 'nobody@example.com', password: 'whatever12' });
    assert.equal(login.status, 401);
    assert.equal(login.json.error, 'authentication_failed');
  });
});

test('disabled account cannot log in even with the correct password', async () => {
  await withServer('disabled-pw', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'dave@example.com', password: 'correct horse battery' });
    const user = await rp.getOrCreateUser('dave@example.com');
    await rp.setAccountDisabled(user.id, true);

    const login = await post(base, '/auth/login', { email: 'dave@example.com', password: 'correct horse battery' });
    assert.equal(login.status, 401);
    assert.equal(login.json.error, 'authentication_failed');
  });
});

test('logout invalidates the session server-side; session check fails afterward', async () => {
  await withServer('logout-pw', async ({ base }) => {
    await post(base, '/auth/register', { email: 'erin@example.com', password: 'correct horse battery' });
    const login = await post(base, '/auth/login', { email: 'erin@example.com', password: 'correct horse battery' });
    const cookie = login.cookie;

    let session = await get(base, '/webauthn/session', cookie);
    assert.equal(session.json.authenticated, true);

    const logout = await post(base, '/webauthn/logout', {}, cookie);
    assert.equal(logout.status, 200);

    session = await get(base, '/webauthn/session', cookie);
    assert.equal(session.status, 401);
    assert.equal(session.json.authenticated, false);
  });
});

test('login is rate-limited per IP after the configured max attempts', async () => {
  await withServer('rate-limit-login', { loginRateLimit: { windowMs: 60_000, max: 3 } }, async ({ base }) => {
    await post(base, '/auth/register', { email: 'frank@example.com', password: 'correct horse battery' });
    for (let i = 0; i < 3; i++) {
      const r = await post(base, '/auth/login', { email: 'frank@example.com', password: 'wrong' });
      assert.equal(r.status, 401);
    }
    const limited = await post(base, '/auth/login', { email: 'frank@example.com', password: 'correct horse battery' });
    assert.equal(limited.status, 429);
    assert.equal(limited.json.error, 'rate_limited');
  });
});

// ---------- Password recovery ----------

test('forgot-password sends a reset email and reset completes the lifecycle', async () => {
  await withServer('forgot-reset', async ({ base, emailProvider }) => {
    await post(base, '/auth/register', { email: 'grace@example.com', password: 'original password 1' });

    const forgot = await post(base, '/auth/password/forgot', { email: 'grace@example.com' });
    assert.equal(forgot.status, 200);
    assert.match(forgot.json.message, /If that account is eligible/);
    assert.equal(emailProvider.sent.length, 1);

    const token = extractResetToken(emailProvider.sent[0]);
    const reset = await post(base, '/auth/password/reset', { token, newPassword: 'new password two' });
    assert.equal(reset.status, 200);
    assert.equal(reset.json.ok, true);

    const oldLogin = await post(base, '/auth/login', { email: 'grace@example.com', password: 'original password 1' });
    assert.equal(oldLogin.status, 401);

    const newLogin = await post(base, '/auth/login', { email: 'grace@example.com', password: 'new password two' });
    assert.equal(newLogin.status, 200);
  });
});

test('forgot-password for a nonexistent account returns the identical generic response and sends no email', async () => {
  await withServer('forgot-nonexistent', async ({ base, emailProvider }) => {
    const forgot = await post(base, '/auth/password/forgot', { email: 'ghost@example.com' });
    assert.equal(forgot.status, 200);
    assert.match(forgot.json.message, /If that account is eligible/);
    assert.equal(emailProvider.sent.length, 0);
  });
});

test('reset token rejects an invalid/unknown token', async () => {
  await withServer('reset-invalid', async ({ base }) => {
    const reset = await post(base, '/auth/password/reset', { token: 'not-a-real-token', newPassword: 'abcdefgh12' });
    assert.equal(reset.status, 400);
    assert.equal(reset.json.error, 'invalid_reset_token');
  });
});

test('reset token expires after its TTL (controllable clock)', async () => {
  await withServer('reset-expired', { controllableClock: true }, async ({ base, emailProvider, advanceClock }) => {
    await post(base, '/auth/register', { email: 'henry@example.com', password: 'original password 1' });
    await post(base, '/auth/password/forgot', { email: 'henry@example.com' });
    const token = extractResetToken(emailProvider.sent[0]);

    advanceClock(31 * 60 * 1000); // past the 30-minute TTL

    const reset = await post(base, '/auth/password/reset', { token, newPassword: 'new password two' });
    assert.equal(reset.status, 400);
    assert.equal(reset.json.error, 'reset_token_expired');
  });
});

test('reset token is single-use: replaying it after a successful reset fails', async () => {
  await withServer('reset-replay', async ({ base, emailProvider }) => {
    await post(base, '/auth/register', { email: 'iris@example.com', password: 'original password 1' });
    await post(base, '/auth/password/forgot', { email: 'iris@example.com' });
    const token = extractResetToken(emailProvider.sent[0]);

    const first = await post(base, '/auth/password/reset', { token, newPassword: 'new password two' });
    assert.equal(first.status, 200);

    const replay = await post(base, '/auth/password/reset', { token, newPassword: 'yet another pw' });
    assert.equal(replay.status, 400);
    assert.equal(replay.json.error, 'reset_token_already_used');
  });
});

test('regenerating a reset token invalidates the earlier outstanding token', async () => {
  await withServer('reset-regenerate', async ({ base, emailProvider }) => {
    await post(base, '/auth/register', { email: 'jack@example.com', password: 'original password 1' });

    await post(base, '/auth/password/forgot', { email: 'jack@example.com' });
    const firstToken = extractResetToken(emailProvider.sent[0]);

    await post(base, '/auth/password/forgot', { email: 'jack@example.com' });
    const secondToken = extractResetToken(emailProvider.sent[1]);

    assert.notEqual(firstToken, secondToken);

    const useFirst = await post(base, '/auth/password/reset', { token: firstToken, newPassword: 'irrelevant12' });
    assert.equal(useFirst.status, 400);
    assert.equal(useFirst.json.error, 'reset_token_already_used');

    const useSecond = await post(base, '/auth/password/reset', { token: secondToken, newPassword: 'new password two' });
    assert.equal(useSecond.status, 200);
  });
});

test('a successful password reset revokes existing sessions for that account', async () => {
  await withServer('reset-revokes-sessions', async ({ base, emailProvider }) => {
    await post(base, '/auth/register', { email: 'kelly@example.com', password: 'original password 1' });
    const login = await post(base, '/auth/login', { email: 'kelly@example.com', password: 'original password 1' });
    const cookie = login.cookie;

    let session = await get(base, '/webauthn/session', cookie);
    assert.equal(session.json.authenticated, true);

    await post(base, '/auth/password/forgot', { email: 'kelly@example.com' });
    const token = extractResetToken(emailProvider.sent[0]);
    await post(base, '/auth/password/reset', { token, newPassword: 'new password two' });

    session = await get(base, '/webauthn/session', cookie);
    assert.equal(session.status, 401);
    assert.equal(session.json.authenticated, false);
  });
});

test('forgot-password is rate-limited per IP', async () => {
  await withServer('rate-limit-forgot', { forgotPasswordRateLimit: { windowMs: 60_000, max: 2 } }, async ({ base }) => {
    await post(base, '/auth/register', { email: 'liam@example.com', password: 'original password 1' });
    for (let i = 0; i < 2; i++) {
      const r = await post(base, '/auth/password/forgot', { email: 'liam@example.com' });
      assert.equal(r.status, 200);
    }
    const limited = await post(base, '/auth/password/forgot', { email: 'liam@example.com' });
    assert.equal(limited.status, 429);
    assert.equal(limited.json.error, 'rate_limited');
  });
});

test('new password below minimum length is rejected on reset', async () => {
  await withServer('reset-short-pw', async ({ base, emailProvider }) => {
    await post(base, '/auth/register', { email: 'mona@example.com', password: 'original password 1' });
    await post(base, '/auth/password/forgot', { email: 'mona@example.com' });
    const token = extractResetToken(emailProvider.sent[0]);
    const reset = await post(base, '/auth/password/reset', { token, newPassword: 'short' });
    assert.equal(reset.status, 400);
    assert.equal(reset.json.error, 'password_too_short');
  });
});

// ---------- delivery provider failure / unavailability ----------

test('delivery provider failure still returns the generic success response (no enumeration signal)', async () => {
  const failingProvider = new MockEmailProvider({ failNext: true });
  await withServer('provider-failure', { emailProvider: failingProvider }, async ({ base }) => {
    await post(base, '/auth/register', { email: 'nina@example.com', password: 'original password 1' });
    const forgot = await post(base, '/auth/password/forgot', { email: 'nina@example.com' });
    assert.equal(forgot.status, 200);
    assert.match(forgot.json.message, /If that account is eligible/);
    // No successful send was recorded since the provider failed.
    assert.equal(failingProvider.sent.length, 0);
  });
});

test('provider status endpoint reflects unconfigured vs mock-configured providers honestly', async () => {
  await withServer('provider-status-unconfigured', async ({ base }) => {
    const status = await get(base, '/auth/providers/status');
    assert.equal(status.status, 200);
    assert.equal(status.json.email.configured, true); // MockEmailProvider is the withServer default
    assert.equal(status.json.sms.configured, true);
  });
});

// ---------- No fake/silent delivery guarantee ----------

test('forgot-password never logs or returns the raw reset token on the wire', async () => {
  await withServer('no-token-leak', async ({ base }) => {
    await post(base, '/auth/register', { email: 'oscar@example.com', password: 'original password 1' });
    const forgot = await post(base, '/auth/password/forgot', { email: 'oscar@example.com' });
    const serialized = JSON.stringify(forgot.json);
    assert.doesNotMatch(serialized, /token/i);
  });
});

// ---------- Administrator authority via the password login path ----------
// M-ADMIN-AUTH-RESTORE: login.html's administrator form was switched
// from the Firebase-only path to this real, server-authoritative one
// (see docs/builder/knowledge/ADMIN-AUTHENTICATION-ARCHITECTURE-CORRECTION.md
// and the follow-up minimal-fix report). This is the one scenario that
// fix now depends on and that no existing test covered: a platform
// admin authenticating via POST /auth/login must receive a real,
// server-derived isPlatformAdmin:true — never a client-supplied claim
// — and a session that the chalzydashboard gate actually honors.

test('a platform admin authenticating via POST /auth/login receives server-derived isPlatformAdmin:true, and that session is honored by the chalzydashboard gate', async () => {
  await withServer('admin-password-login', async ({ base, rp }) => {
    const reg = await post(base, '/auth/register', { email: 'admin@example.com', password: 'correct horse battery' });
    assert.equal(reg.status, 200);
    // Grant admin authority the same real way bootstrap-admin.js does —
    // flip the server-side bit directly, never via any client request.
    const user = await rp.getOrCreateUser('admin@example.com');
    await rp.setPlatformAdmin(user.id, true);

    const login = await post(base, '/auth/login', { email: 'admin@example.com', password: 'correct horse battery' });
    assert.equal(login.status, 200);
    assert.equal(login.json.ok, true);
    assert.equal(login.json.isPlatformAdmin, true, 'the server must derive admin authority from its own trusted state, not accept it from the client');
    assert.ok(login.cookie, 'a real session cookie must be issued');

    const gate = await get(base, '/webauthn/session', login.cookie);
    assert.equal(gate.status, 200);
    assert.equal(gate.json.isPlatformAdmin, true, 'the chalzydashboard gate (which reads this same endpoint) must see the real admin authority for this session');
  });
});

test('an ordinary user authenticating via POST /auth/login never receives isPlatformAdmin:true, and cannot claim it via a forged request body', async () => {
  await withServer('non-admin-password-login', async ({ base }) => {
    await post(base, '/auth/register', { email: 'regular@example.com', password: 'correct horse battery' });
    // A client cannot request admin authority — the field is not even
    // read from the request body; POST /auth/login only ever accepts
    // email and password.
    const login = await post(base, '/auth/login', { email: 'regular@example.com', password: 'correct horse battery', isPlatformAdmin: true });
    assert.equal(login.status, 200);
    assert.equal(login.json.isPlatformAdmin, false, 'a forged isPlatformAdmin field in the request body must have zero effect');

    const gate = await get(base, '/webauthn/session', login.cookie);
    assert.equal(gate.json.isPlatformAdmin, false);
  });
});
