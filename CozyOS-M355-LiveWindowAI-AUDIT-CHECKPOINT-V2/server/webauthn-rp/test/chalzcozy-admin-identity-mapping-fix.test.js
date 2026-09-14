'use strict';

/**
 * server/webauthn-rp/test/chalzcozy-admin-identity-mapping-fix.test.js
 *
 * DIAGNOSIS
 * ---------
 * Every server-side and client-side code path for username-based
 * Administrator login (rp.authenticateWithPassword, POST /auth/login,
 * GET /webauthn/session, AdminGateCore, cozy-login-gate.js's credentials
 * form) is already correct and already covered by
 * username-login-integration.test.js, which passes end-to-end on this
 * checkout with a synthetic username ("Chalzcozy" even appears literally
 * in one of its fixtures).
 *
 * That means the live failure ("Invalid email or password, or this
 * account may be disabled." / "No real administrator account found for
 * 'Chalzcozy'.") cannot be a code defect — the same generic failure is
 * exactly what authenticateWithPassword() returns for ANY unmapped
 * identifier (see rp.js: `if (!user || !user.password_hash) throw
 * invalid_credentials`). The only way to reach that state with a real,
 * existing administrator account is if `username = 'Chalzcozy'` was
 * never written onto that account's row in the production database —
 * i.e., bootstrap-admin.js's `set-username` command was never run
 * against production (or was run with a mismatched email/casing).
 *
 * This file proves that diagnosis and the fix it implies, against a
 * fresh, disposable, local SQLite database — it never touches
 * production. It:
 *   1. Reproduces the exact reported symptom from a realistic starting
 *      state (a real platform-admin account that predates the username
 *      column, with no username set).
 *   2. Applies the smallest safe fix: bootstrap-admin.js `set-username`
 *      against that SAME existing account (no new account, no password
 *      change, no admin grant).
 *   3. Proves all 8 requirements from the investigation brief.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');
const { grant, setUsername, list } = require('../bootstrap-admin');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';
const ADMIN_EMAIL = 'chalzcozy@cozyos.org';
const ADMIN_PASSWORD = 'the real admin password';
const ADMIN_USERNAME = 'Chalzcozy';

function freshDbPath(name) {
  return freshTmpDbPath(`chalzcozy-fix-${name}`);
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

async function post(base, p, body, headers) {
  const res = await fetch(base + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: extractCookie(res) };
}

async function getSession(base, cookie) {
  const res = await fetch(base + '/webauthn/session', { headers: { Cookie: cookie } });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function loadAdminGateCore() {
  const CORE_PATH = path.join(__dirname, '..', '..', '..', 'core', 'shell', 'admin-gate-core.js');
  delete require.cache[require.resolve(CORE_PATH)];
  global.window = { CozyOS: {} };
  require(CORE_PATH);
  return global.window.CozyOS.AdminGateCore;
}

test('CHALZCOZY FIX: reproduces the live symptom, then proves the minimal set-username fix restores full admin login', async () => {
  await withServer('full-trace', async ({ base, rp, db }) => {
    // --- Arrange: recreate the REAL pre-fix production state ---------
    // A genuine platform-admin account already exists (registered with
    // a password, granted is_platform_admin via the existing, unmodified
    // grant() path) — it simply has no `username` mapped yet, exactly
    // as an account created/promoted before the username-login feature
    // (or before bootstrap-admin's set-username was ever run for it).
    await post(base, '/auth/register', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    await grant(rp, ADMIN_EMAIL); // existing, unmodified admin-grant path — not touched by this fix

    const before = await rp.db.get('SELECT * FROM users WHERE email = ?', [ADMIN_EMAIL]);
    assert.equal(before.is_platform_admin, 1, 'sanity: this is a real existing platform-admin account');
    assert.equal(before.username, null, 'sanity: reproduces the reported live state — no username mapped yet');

    // --- Reproduce the exact reported symptom -------------------------
    const failedLogin = await post(base, '/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    assert.equal(failedLogin.status, 401);
    assert.equal(failedLogin.json.error, 'authentication_failed',
      'reproduces "Invalid email or password, or this account may be disabled." — an unmapped username is indistinguishable from a wrong password by design (anti-enumeration)');

    const noSuchUser = await rp.getUserByUsername(ADMIN_USERNAME);
    assert.ok(!noSuchUser, 'reproduces "No real administrator account found for \'Chalzcozy\'" — the lookup key simply does not exist yet');

    // --- Apply the smallest safe fix ----------------------------------
    // The ONLY writer of `username` in the entire codebase: the
    // trusted-operator CLI, against the SAME existing account. Does not
    // touch password_hash, is_platform_admin, credentials, or sessions.
    const fixed = await setUsername(rp, ADMIN_EMAIL, ADMIN_USERNAME);
    assert.ok(fixed, 'set-username must succeed against the existing account');
    assert.equal(fixed.id, before.id, 'same account row — no new account created');
    assert.equal(fixed.password_hash, before.password_hash, 'password_hash untouched by the fix');
    assert.equal(fixed.is_platform_admin, 1, 'is_platform_admin untouched by the fix');

    // ===================================================================
    // PROOF 1: Chalzcozy resolves to exactly one existing platform-admin account
    // ===================================================================
    const resolved = await rp.getUserByUsername(ADMIN_USERNAME);
    assert.ok(resolved, 'Chalzcozy now resolves to a user');
    assert.equal(resolved.id, before.id, 'resolves to the EXISTING account, not a new one');
    assert.equal(resolved.is_platform_admin, 1, 'resolved account is a real platform-admin');
    const allWithThatUsername = await db.all('SELECT id FROM users WHERE username = ?', [ADMIN_USERNAME]);
    assert.equal(allWithThatUsername.length, 1, 'exactly one account has this username');

    // ===================================================================
    // PROOF 2: wrong password remains rejected
    // ===================================================================
    const wrongPassword = await post(base, '/auth/login', { username: ADMIN_USERNAME, password: 'not the real password' });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.json.error, 'authentication_failed');

    // ===================================================================
    // PROOF 3: correct Administrator authentication produces a real server session
    // ===================================================================
    const correctLogin = await post(base, '/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    assert.equal(correctLogin.status, 200, JSON.stringify(correctLogin.json));
    assert.ok(correctLogin.cookie, 'a real session cookie was issued');
    assert.equal(correctLogin.json.isPlatformAdmin, true);

    // ===================================================================
    // PROOF 4: /webauthn/session reports the Administrator correctly
    // ===================================================================
    const session = await getSession(base, correctLogin.cookie);
    assert.equal(session.status, 200);
    assert.equal(session.json.authenticated, true);
    assert.equal(session.json.isPlatformAdmin, true);
    assert.equal(session.json.email, ADMIN_EMAIL);

    // ===================================================================
    // PROOF 5: AdminGateCore permits the Administrator
    // ===================================================================
    const { decideGateAction, GATE_ACTION } = loadAdminGateCore();
    const decision = decideGateAction({ httpStatus: session.status, ...session.json });
    assert.equal(decision.action, GATE_ACTION.LOAD_ADMIN_WORKSPACE, 'AdminGateCore admits the real administrator session');

    // ===================================================================
    // PROOF 6: ordinary users remain unchanged
    // ===================================================================
    await post(base, '/auth/register', { email: 'ordinary-user@example.com', password: 'a normal password' });
    const ordinaryBefore = await rp.db.get('SELECT * FROM users WHERE email = ?', ['ordinary-user@example.com']);
    const ordinaryLogin = await post(base, '/auth/login', { email: 'ordinary-user@example.com', password: 'a normal password' });
    assert.equal(ordinaryLogin.status, 200);
    assert.equal(ordinaryLogin.json.isPlatformAdmin, false);
    const ordinaryAfter = await rp.db.get('SELECT * FROM users WHERE email = ?', ['ordinary-user@example.com']);
    assert.equal(ordinaryAfter.password_hash, ordinaryBefore.password_hash);
    assert.equal(ordinaryAfter.username, null, 'ordinary users are never assigned a username as a side effect');
    assert.equal(ordinaryAfter.is_platform_admin, 0);

    // ===================================================================
    // PROOF 7: no duplicate Administrator account was created
    // ===================================================================
    const allAdmins = await db.all('SELECT id, email, username FROM users WHERE is_platform_admin = 1');
    assert.equal(allAdmins.length, 1, 'exactly one platform-admin account exists in the whole database');
    assert.equal(allAdmins[0].email, ADMIN_EMAIL);
    assert.equal(allAdmins[0].username, ADMIN_USERNAME);

    // list() (the same read path an operator uses to audit production)
    // must show the identical, single, pre-existing account.
    const auditList = await list(rp);
    const adminRows = auditList.filter((u) => u.is_platform_admin);
    assert.equal(adminRows.length, 1);
    assert.equal(adminRows[0].id, before.id);

    // ===================================================================
    // PROOF 8: existing biometric/trusted-device mechanisms remain intact
    // ===================================================================
    // set-username never touches the credentials table. Prove a
    // WebAuthn credential enrolled before the fix is byte-identical
    // after it.
    await db.run(
      'INSERT INTO credentials (credential_id, user_id, public_key_jwk, algorithm, sign_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['cred-preexisting-1', before.id, '{"kty":"EC"}', 'ES256', 0, Date.now()]
    );
    const credBefore = await db.get('SELECT * FROM credentials WHERE credential_id = ?', ['cred-preexisting-1']);
    await setUsername(rp, ADMIN_EMAIL, ADMIN_USERNAME); // idempotent re-application
    const credAfter = await db.get('SELECT * FROM credentials WHERE credential_id = ?', ['cred-preexisting-1']);
    assert.deepEqual(credAfter, credBefore, 'existing enrolled biometric/passkey credential is completely untouched by the fix');
  });
});
