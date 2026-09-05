'use strict';

/**
 * server/webauthn-rp/test/bootstrap-admin-set-password.test.js
 *
 * Proves bootstrap-admin.js's `set-password` operator command:
 *   1. Resolves the EXISTING Administrator account by exact email —
 *      never creates a new user.
 *   2. Leaves is_platform_admin, username, firebase_uid, and every
 *      WebAuthn credential row completely untouched.
 *   3. Reuses the existing authoritative hashing mechanism (rp.setPassword
 *      / hashPassword / verifyPasswordHash from rp.js) — not a second,
 *      parallel hash path.
 *   4. Old password stops working; new password works, end-to-end
 *      through the real HTTP login route.
 *   5. No other account in the database is modified.
 *   6. Refuses to operate on an email that does not exist (never
 *      creates a user).
 *   7. The interactive password reader itself rejects a too-short
 *      password and a mismatched confirmation before anything is
 *      written to the database.
 *
 * The real hidden-input terminal reader (readHiddenLine) is
 * intentionally NOT exercised here — it needs a real TTY, which a test
 * sandbox doesn't have. setPassword()'s `readPassword` parameter exists
 * exactly so this suite can inject a scripted reader and still exercise
 * every other real code path (lookup, rp.setPassword, hashing, the
 * refuse-to-create guard) untouched.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');
const { grant, setUsername, setPassword, readNewPasswordInteractively } = require('../bootstrap-admin');
const { verifyPasswordHash } = require('../rp');

const ADMIN_EMAIL = 'chalzcozy@cozyos.org';
const OLD_PASSWORD = 'the original admin password';
const NEW_PASSWORD = 'the restored admin password 2026';
const ADMIN_USERNAME = 'Chalzcozy';

function freshDbPath(name) {
  return freshTmpDbPath(`bootstrap-set-password-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createServer({ dbPath, rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost' });
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

// Scripted reader standing in for the real interactive hidden-input
// terminal prompt — returns a fixed value for "readLine" regardless of
// the prompt text, exactly the shape setPassword()'s injectable
// `readPassword` parameter expects (a zero-argument function returning
// the new plaintext password).
function scriptedReader(password) {
  return async () => password;
}

test('set-password: restores an existing Administrator credential without touching anything else', async () => {
  await withServer('main', async ({ base, rp, db }) => {
    // --- Arrange: a real existing Administrator account -----------------
    await post(base, '/auth/register', { email: ADMIN_EMAIL, password: OLD_PASSWORD });
    await grant(rp, ADMIN_EMAIL);
    await setUsername(rp, ADMIN_EMAIL, ADMIN_USERNAME);

    // A second, ordinary account that must remain completely untouched.
    await post(base, '/auth/register', { email: 'ordinary-user@example.com', password: 'a normal password' });

    const before = await rp.db.get('SELECT * FROM users WHERE email = ?', [ADMIN_EMAIL]);
    const ordinaryBefore = await rp.db.get('SELECT * FROM users WHERE email = ?', ['ordinary-user@example.com']);

    // Sanity: old password authenticates before the reset (checked here,
    // before a WebAuthn credential exists, so this call exercises the
    // plain single-factor path rather than the MFA-pending path below).
    const loginBefore = await post(base, '/auth/login', { email: ADMIN_EMAIL, password: OLD_PASSWORD });
    assert.equal(loginBefore.status, 200, 'sanity: old password works before the reset');
    assert.equal(loginBefore.json.isPlatformAdmin, true);

    // A pre-existing enrolled WebAuthn credential that must survive the
    // password reset byte-identical. Enrolling it also means every login
    // from this point on is gated behind MFA (a real registered factor) —
    // exactly the multi-factor Administrator account this command must be
    // safe to run against.
    await db.run(
      'INSERT INTO credentials (credential_id, user_id, public_key_jwk, algorithm, sign_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['cred-preexisting-1', before.id, '{"kty":"EC"}', 'ES256', 0, Date.now()]
    );
    const credBefore = await db.get('SELECT * FROM credentials WHERE credential_id = ?', ['cred-preexisting-1']);

    // --- Act: run the operator command -----------------------------------
    const updated = await setPassword(rp, ADMIN_EMAIL, scriptedReader(NEW_PASSWORD));

    // ===================================================================
    // PROOF: command succeeded against the existing account
    // ===================================================================
    assert.ok(updated, 'set-password must succeed against the existing account');

    // ===================================================================
    // PROOF 1: same user ID — no new account created
    // ===================================================================
    assert.equal(updated.id, before.id, 'same account row, not a new one');
    const allWithThatEmail = await db.all('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]);
    assert.equal(allWithThatEmail.length, 1, 'exactly one account exists for this email');

    // ===================================================================
    // PROOF 2: admin status unchanged
    // ===================================================================
    assert.equal(updated.is_platform_admin, 1, 'is_platform_admin unchanged (still admin)');
    assert.equal(updated.is_platform_admin, before.is_platform_admin);

    // ===================================================================
    // PROOF 3: username Chalzcozy unchanged
    // ===================================================================
    assert.equal(updated.username, ADMIN_USERNAME, 'username unchanged');
    assert.equal(updated.username, before.username);

    // Firebase identity untouched (both null here, but asserted explicitly
    // per spec — this command must never touch that column).
    assert.equal(updated.firebase_uid, before.firebase_uid, 'firebase_uid unchanged');

    // ===================================================================
    // PROOF 4: new password works
    // ===================================================================
    assert.notEqual(updated.password_hash, before.password_hash, 'password_hash actually changed');
    assert.ok(verifyPasswordHash(NEW_PASSWORD, updated.password_hash), 'new password verifies against the stored hash (reused authoritative verify mechanism)');
    // End-to-end through the real login route: a WebAuthn credential is
    // now enrolled, so a correct password advances to the MFA-pending
    // stage (status 200, mfaRequired:true) rather than issuing a session
    // directly — that is still full proof the new password itself was
    // accepted by rp.authenticateWithPassword()'s real verify step.
    const loginAfterNew = await post(base, '/auth/login', { email: ADMIN_EMAIL, password: NEW_PASSWORD });
    assert.equal(loginAfterNew.status, 200, 'new password authenticates end-to-end through the real login route');
    assert.equal(loginAfterNew.json.mfaRequired, true, 'password step accepted, proceeding to the real MFA gate');

    // ===================================================================
    // PROOF 5: old password fails
    // ===================================================================
    assert.equal(verifyPasswordHash(OLD_PASSWORD, updated.password_hash), false, 'old password no longer verifies');
    const loginAfterOld = await post(base, '/auth/login', { email: ADMIN_EMAIL, password: OLD_PASSWORD });
    assert.equal(loginAfterOld.status, 401, 'old password rejected end-to-end through the real login route');

    // ===================================================================
    // PROOF 6: no other account was modified
    // ===================================================================
    const ordinaryAfter = await rp.db.get('SELECT * FROM users WHERE email = ?', ['ordinary-user@example.com']);
    assert.deepEqual(ordinaryAfter, ordinaryBefore, 'the ordinary account is byte-identical after the operator command');

    // Existing enrolled WebAuthn credential is untouched.
    const credAfter = await db.get('SELECT * FROM credentials WHERE credential_id = ?', ['cred-preexisting-1']);
    assert.deepEqual(credAfter, credBefore, 'existing enrolled WebAuthn credential is completely untouched');
  });
});

test('set-password: refuses to create a user for an email that does not exist', async () => {
  await withServer('no-such-user', async ({ rp, db }) => {
    const result = await setPassword(rp, 'never-registered@example.com', scriptedReader(NEW_PASSWORD));
    assert.equal(result, null, 'must return null rather than creating an account');
    const rows = await db.all('SELECT id FROM users WHERE email = ?', ['never-registered@example.com']);
    assert.equal(rows.length, 0, 'no user row was created for the unknown email');
  });
});

test('set-password: readNewPasswordInteractively rejects too-short passwords before any write', async () => {
  await assert.rejects(
    () => readNewPasswordInteractively(async () => 'short'),
    /password_too_short/,
  );
});

test('set-password: readNewPasswordInteractively rejects a mismatched confirmation before any write', async () => {
  let call = 0;
  const mismatched = async () => {
    call += 1;
    return call === 1 ? 'a sufficiently long password' : 'a different sufficiently long password';
  };
  await assert.rejects(() => readNewPasswordInteractively(mismatched), /passwords_do_not_match/);
});
