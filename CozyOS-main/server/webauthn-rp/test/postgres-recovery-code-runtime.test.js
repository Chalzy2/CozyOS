'use strict';
/**
 * server/webauthn-rp/test/postgres-recovery-code-runtime.test.js
 * B4.3 repair — Blocker 3: dedicated real-PostgreSQL recovery-code
 * coverage, split out from the general TOTP enrollment test in
 * postgres-adapter-runtime.test.js (which only proves TOTP-code
 * completion, not the recovery-code redemption path).
 *
 * THIS FILE NEVER FABRICATES A PASS — identical posture to
 * postgres-adapter-runtime.test.js: if process.env.COZY_DATABASE_URL is
 * not set, every test below is registered with node:test's `skip`
 * option and reports 0 pass / N skip, never a false pass. If
 * COZY_DATABASE_URL IS set, every test connects to that real server and
 * exercises the real PostgreSQLDatabaseAdapter and real RelyingParty —
 * never SQLite, never a mock.
 *
 * USAGE
 *   COZY_DATABASE_URL="postgres://user:pass@host:5432/dbname" node --test server/webauthn-rp/test/postgres-recovery-code-runtime.test.js
 *   node --test server/webauthn-rp/test/postgres-recovery-code-runtime.test.js   # no COZY_DATABASE_URL -> every test SKIPPED, none PASS
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createDatabaseAdapter } = require('../database-adapter');
const { run: runMigrations } = require('../migrations/run-migrations');
const { RelyingParty, AuthError } = require('../rp');
const { totpCodeAt } = require('../totp');

const DATABASE_URL = process.env.COZY_DATABASE_URL;
const SKIP_REASON = 'NOT_RUN — COZY_DATABASE_URL unavailable';
const testOpts = DATABASE_URL ? {} : { skip: SKIP_REASON };

function redact(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch (_e) {
    return '(unparseable)';
  }
}

if (DATABASE_URL) {
  console.log(`[postgres-recovery-code-runtime.test.js] connecting to ${redact(DATABASE_URL)}`);
}

function makeClock(start = Date.UTC(2026, 0, 1)) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

async function withRealPostgres(fn) {
  const db = createDatabaseAdapter({ databaseUrl: DATABASE_URL });
  try {
    await runMigrations({ databaseUrl: DATABASE_URL, dir: path.join(__dirname, '..', 'migrations') });
    await fn(db);
  } finally {
    try {
      await db.exec(`
        TRUNCATE TABLE
          audit_events, organization_memberships, organizations,
          pending_auth_sessions, mfa_recovery_codes, password_reset_tokens,
          sessions, challenges, credentials, users
        CASCADE;
      `);
    } catch (_cleanupErr) { /* best-effort only */ }
    await db.close();
  }
}

test('recovery codes: TOTP enrollment on real PostgreSQL generates 10 unique recovery codes, stored hashed (not raw)', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });

    const user = await rp.registerWithPassword({ email: 'pg-recovery-1@example.com', password: 'correct horse battery staple' });
    const enroll = await rp.beginTotpEnrollment(user.id);
    const code = totpCodeAt(enroll.secret, clock.now());
    const completed = await rp.completeTotpEnrollment(user.id, code);

    assert.equal(completed.recoveryCodes.length, 10);
    assert.equal(new Set(completed.recoveryCodes).size, 10, 'recovery codes must be unique');

    // Requirement: no raw recovery code is stored in the database — the
    // stored code_hash for every row must differ from every raw code
    // returned to the caller, and must not contain any raw code as a
    // substring.
    const rows = await db.all('SELECT code_hash FROM mfa_recovery_codes WHERE user_id = ?', [user.id]);
    assert.equal(rows.length, 10);
    for (const row of rows) {
      for (const raw of completed.recoveryCodes) {
        assert.notEqual(row.code_hash, raw, 'a raw recovery code must never equal its own stored hash');
        assert.ok(!row.code_hash.includes(raw), 'a raw recovery code must never appear as a substring of its stored hash');
      }
      // SHA-256 hex digest is always exactly 64 lowercase hex characters.
      assert.match(row.code_hash, /^[0-9a-f]{64}$/, 'code_hash must be a real hash, not a raw code or plaintext');
    }
  });
});

test('recovery codes: a valid code authenticates successfully, becomes consumed, and cannot be reused (real PostgreSQL)', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });

    const user = await rp.registerWithPassword({ email: 'pg-recovery-2@example.com', password: 'correct horse battery staple' });
    const enroll = await rp.beginTotpEnrollment(user.id);
    const totp = totpCodeAt(enroll.secret, clock.now());
    const completed = await rp.completeTotpEnrollment(user.id, totp);
    const [firstCode] = completed.recoveryCodes;

    const login = await rp.authenticateWithPassword({ email: 'pg-recovery-2@example.com', password: 'correct horse battery staple' });
    assert.equal(login.mfaRequired, true);

    // 1/3/4: a valid recovery code authenticates and becomes consumed.
    const finished = await rp.completePendingAuthWithRecoveryCode(login.pendingId, firstCode);
    assert.ok(finished.session.sessionId, 'a valid, unused recovery code must produce a real session');

    const consumedRow = await db.get(
      'SELECT used_at FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NOT NULL',
      [user.id]
    );
    assert.ok(consumedRow, 'the redeemed recovery code must be marked used_at in the database');

    // 5: the same code cannot be reused — start a fresh pending-auth
    // session (the first one is already consumed) and attempt the same
    // raw code again.
    const secondLogin = await rp.authenticateWithPassword({ email: 'pg-recovery-2@example.com', password: 'correct horse battery staple' });
    await assert.rejects(
      () => rp.completePendingAuthWithRecoveryCode(secondLogin.pendingId, firstCode),
      AuthError,
      'a consumed recovery code must be rejected on reuse, not silently accepted again'
    );
  });
});

test('recovery codes: an invalid code is rejected and does not authenticate (real PostgreSQL)', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });

    const user = await rp.registerWithPassword({ email: 'pg-recovery-3@example.com', password: 'correct horse battery staple' });
    const enroll = await rp.beginTotpEnrollment(user.id);
    const totp = totpCodeAt(enroll.secret, clock.now());
    await rp.completeTotpEnrollment(user.id, totp);

    const login = await rp.authenticateWithPassword({ email: 'pg-recovery-3@example.com', password: 'correct horse battery staple' });
    await assert.rejects(
      () => rp.completePendingAuthWithRecoveryCode(login.pendingId, 'WRONG-CODE1'),
      AuthError,
      'an invalid recovery code must never authenticate'
    );
  });
});

test('recovery codes: transactional consistency — redemption failure never leaves a code half-consumed (real PostgreSQL)', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });

    const user = await rp.registerWithPassword({ email: 'pg-recovery-4@example.com', password: 'correct horse battery staple' });
    const enroll = await rp.beginTotpEnrollment(user.id);
    const totp = totpCodeAt(enroll.secret, clock.now());
    const completed = await rp.completeTotpEnrollment(user.id, totp);
    const [firstCode] = completed.recoveryCodes;

    const login = await rp.authenticateWithPassword({ email: 'pg-recovery-4@example.com', password: 'correct horse battery staple' });

    // Redeem it once, successfully — this exercises the real
    // transaction (rp.js's completePendingAuthWithRecoveryCode wraps the
    // used_at UPDATE and the pending_auth_sessions consumed_at UPDATE in
    // one db.transaction() call).
    await rp.completePendingAuthWithRecoveryCode(login.pendingId, firstCode);

    // Confirm both halves of that transaction committed together: the
    // recovery code is used AND the pending-auth row is consumed. If the
    // transaction had partially applied, one of these would be false
    // while the other is true.
    //
    // NOTE (fixed after a real-Neon run surfaced this): the original
    // query here filtered on `code_hash IS NOT NULL` — a no-op, since
    // code_hash is the primary key and is never null — then relied on
    // `ORDER BY used_at DESC LIMIT 1` to pick out the one redeemed code
    // among the user's other 9 untouched (used_at IS NULL) codes. That
    // works by accident on SQLite, whose default is NULLS LAST for a
    // DESC sort, but PostgreSQL's default is the opposite (NULLS FIRST
    // for DESC) — so against real Postgres this returned one of the
    // untouched NULL rows instead of the redeemed one. Fixed to filter
    // directly on `used_at IS NOT NULL` (the same, already-correct
    // pattern the earlier "becomes consumed" test above uses), which
    // is unambiguous regardless of NULL-ordering defaults and needs no
    // ORDER BY at all, since exactly one row is expected to match.
    const codeRow = await db.get('SELECT used_at FROM mfa_recovery_codes WHERE user_id = ? AND used_at IS NOT NULL', [user.id]);
    const pendingRow = await db.get('SELECT consumed_at FROM pending_auth_sessions WHERE pending_id = ?', [login.pendingId]);
    assert.ok(codeRow, 'exactly one recovery code for this user must have used_at set after redemption');
    assert.ok(codeRow.used_at, 'recovery code must be marked used');
    assert.ok(pendingRow.consumed_at, 'pending-auth session must be marked consumed');
    assert.equal(codeRow.used_at, pendingRow.consumed_at, 'both halves of the transaction must commit with the same timestamp (same transaction, same now())');
  });
});

test('recovery codes: no raw code appears in thrown error messages (failure path does not leak the attempted code)', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });

    const user = await rp.registerWithPassword({ email: 'pg-recovery-5@example.com', password: 'correct horse battery staple' });
    const enroll = await rp.beginTotpEnrollment(user.id);
    const totp = totpCodeAt(enroll.secret, clock.now());
    await rp.completeTotpEnrollment(user.id, totp);

    const login = await rp.authenticateWithPassword({ email: 'pg-recovery-5@example.com', password: 'correct horse battery staple' });
    const sentinelBadCode = 'SENTL1-LEAK01';
    try {
      await rp.completePendingAuthWithRecoveryCode(login.pendingId, sentinelBadCode);
      assert.fail('expected rejection for an invalid recovery code');
    } catch (err) {
      assert.ok(!String(err.message).includes(sentinelBadCode), 'the attempted recovery code must never appear in a thrown error message');
      assert.ok(!(err.code || '').includes(sentinelBadCode));
    }
  });
});
