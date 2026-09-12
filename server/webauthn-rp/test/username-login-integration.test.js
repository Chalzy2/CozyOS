'use strict';

/**
 * server/webauthn-rp/test/username-login-integration.test.js
 * CHALZYDASHBOARD-USERNAME-LOGIN — real HTTP integration tests.
 *
 * Proves, against the real server (server/webauthn-rp/server.js, real
 * SQLite DB, real POST /auth/login), that:
 *   - a username can be mapped to an existing server user ONLY via the
 *     trusted-operator bootstrap-admin.js CLI (never HTTP);
 *   - POST /auth/login accepts EITHER {username,password} or
 *     {email,password}, resolving to the SAME canonical server user and
 *     the SAME real password_hash verification — no second auth engine;
 *   - an unmapped/invalid username is rejected with the same
 *     invalid_credentials shape as an unknown email (no user-enumeration
 *     signal, no new failure mode);
 *   - is_platform_admin authorization is completely unaffected by which
 *     identifier was used to log in;
 *   - supplying both identifiers at once is rejected rather than
 *     silently picking one.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');
const { grant, setUsername } = require('../bootstrap-admin');
const { RelyingParty } = require('../rp');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`username-login-${name}`);
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

async function post(base, p, body) {
  const res = await fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: extractCookie(res) };
}

test('a trusted operator can map a username to an existing server user, and it never touches password_hash or is_platform_admin', async () => {
  await withServer('map-username', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'quinn@example.com', password: 'correct horse battery' });
    const before = await rp.db.get('SELECT * FROM users WHERE email = ?', ['quinn@example.com']);
    assert.equal(before.is_platform_admin, 0);

    const mapped = await setUsername(rp, 'quinn@example.com', 'Quinny');

    assert.equal(mapped.username, 'Quinny');
    assert.equal(mapped.password_hash, before.password_hash, 'password_hash must be completely untouched by set-username');
    assert.equal(mapped.is_platform_admin, 0, 'set-username must never grant admin');
  });
});

test('set-username on an email with no existing server user does nothing (never fabricates an account)', async () => {
  await withServer('map-nonexistent', async ({ rp }) => {
    const result = await setUsername(rp, 'nobody@example.com', 'GhostUser');
    assert.equal(result, null);
    const user = await rp.db.get('SELECT * FROM users WHERE email = ?', ['nobody@example.com']);
    assert.equal(user, undefined);
  });
});

test('POST /auth/login with the mapped username authenticates against the SAME real password_hash as the email path', async () => {
  await withServer('login-by-username', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'chalzcozy@example.com', password: 'the real admin password' });
    await setUsername(rp, 'chalzcozy@example.com', 'Chalzcozy');

    const byUsername = await post(base, '/auth/login', { username: 'Chalzcozy', password: 'the real admin password' });
    assert.equal(byUsername.status, 200, JSON.stringify(byUsername.json));
    assert.ok(byUsername.cookie);

    const byEmail = await post(base, '/auth/login', { email: 'chalzcozy@example.com', password: 'the real admin password' });
    assert.equal(byEmail.status, 200);
    assert.ok(byEmail.cookie);
  });
});

test('an unmapped username is rejected with the same generic authentication_failed shape as an unknown email (no enumeration signal)', async () => {
  await withServer('unknown-username', async ({ base }) => {
    // POST /auth/login deliberately collapses every AuthError (unknown
    // identifier, wrong password, disabled account, ...) to the SAME
    // generic 401 { ok:false, error:'authentication_failed' } — see its
    // own comment in server.js. Asserting that generic shape here IS the
    // anti-enumeration check: an unknown username must be indistinguishable
    // from any other login failure.
    const res = await post(base, '/auth/login', { username: 'NoSuchUser', password: 'whatever' });
    assert.equal(res.status, 401);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'authentication_failed');
  });
});

test('the correct username with the WRONG password is rejected with the same generic shape', async () => {
  await withServer('wrong-password', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'pat@example.com', password: 'correct horse battery' });
    await setUsername(rp, 'pat@example.com', 'PatUser');
    const res = await post(base, '/auth/login', { username: 'PatUser', password: 'wrong password' });
    assert.equal(res.status, 401);
    assert.equal(res.json.ok, false);
    assert.equal(res.json.error, 'authentication_failed');
  });
});

test('supplying both email AND username at once is rejected rather than silently picking one', async () => {
  await withServer('ambiguous', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'sam@example.com', password: 'correct horse battery' });
    await setUsername(rp, 'sam@example.com', 'SamUser');
    const res = await post(base, '/auth/login', { email: 'sam@example.com', username: 'SamUser', password: 'correct horse battery' });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'identifier_ambiguous');
  });
});

test('a username-mapped administrator (is_platform_admin via the existing grant() path) is recognized as admin after logging in by username', async () => {
  await withServer('username-admin', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'admin-user@example.com', password: 'the real admin password' });
    await grant(rp, 'admin-user@example.com'); // existing, unmodified admin-grant path
    await setUsername(rp, 'admin-user@example.com', 'RealAdmin');

    const login = await post(base, '/auth/login', { username: 'RealAdmin', password: 'the real admin password' });
    assert.equal(login.status, 200);
    assert.equal(login.json.isPlatformAdmin, true, 'is_platform_admin must be respected identically regardless of which identifier logged in');

    const session = await fetch(base + '/webauthn/session', { headers: { Cookie: login.cookie } });
    const sessionJson = await session.json();
    assert.equal(sessionJson.authenticated, true);
    assert.equal(sessionJson.isPlatformAdmin, true);
  });
});

test('a non-admin username-mapped user is NOT recognized as admin', async () => {
  await withServer('username-nonadmin', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'ordinary@example.com', password: 'correct horse battery' });
    await setUsername(rp, 'ordinary@example.com', 'OrdinaryUser');
    const login = await post(base, '/auth/login', { username: 'OrdinaryUser', password: 'correct horse battery' });
    assert.equal(login.status, 200);
    assert.equal(login.json.isPlatformAdmin, false);
  });
});

test('username uniqueness is enforced: mapping the same username to a second user is rejected', async () => {
  await withServer('duplicate-username', async ({ base, rp }) => {
    await post(base, '/auth/register', { email: 'first@example.com', password: 'correct horse battery' });
    await post(base, '/auth/register', { email: 'second@example.com', password: 'correct horse battery' });
    await setUsername(rp, 'first@example.com', 'SharedName');
    await assert.rejects(
      () => setUsername(rp, 'second@example.com', 'SharedName'),
      /username_already_taken/
    );
  });
});

test('a direct RelyingParty.authenticateWithPassword() call still requires exactly one identifier', async () => {
  await withServer('rp-direct', async ({ rp }) => {
    await assert.rejects(() => rp.authenticateWithPassword({ password: 'x' }), /identifier_required/);
  });
});
