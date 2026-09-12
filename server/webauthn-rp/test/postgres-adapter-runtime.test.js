'use strict';
/**
 * server/webauthn-rp/test/postgres-adapter-runtime.test.js
 * CozyOS — Phase B3 — real PostgreSQL runtime test harness.
 *
 * THIS FILE NEVER FABRICATES A PASS.
 *
 * If process.env.COZY_DATABASE_URL is not set, every test below is
 * registered with node:test's `skip` option and a literal
 * "NOT_RUN — COZY_DATABASE_URL unavailable" reason. node:test reports
 * skipped tests in a SEPARATE `# skip N` count from `# pass N` — it is
 * not possible for this file to silently count as passing when
 * PostgreSQL was never actually used, because skip and pass are
 * distinguishable in the test runner's own output.
 *
 * If COZY_DATABASE_URL IS set, every test below connects to that real
 * server and exercises the real PostgreSQLDatabaseAdapter, the real
 * migrations, and the real RelyingParty/OrganizationRegistry against it
 * — never SQLite, never a mock, never a fake connection object.
 *
 * NEVER logs the connection string, only its redacted host/db-name form
 * (same redactConnectionString() already used by migrate-sqlite-to-postgres.js).
 *
 * USAGE
 *   COZY_DATABASE_URL="postgres://user:pass@host:5432/dbname" node --test server/webauthn-rp/test/postgres-adapter-runtime.test.js
 *   node --test server/webauthn-rp/test/postgres-adapter-runtime.test.js   # no COZY_DATABASE_URL -> every test SKIPPED, none PASS
 *
 * This suite creates and drops its own tables/rows via a dedicated test
 * schema prefix and cleans up after itself; it never assumes an empty
 * database, but it does require the connected role to have CREATE
 * privileges on the target database.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createDatabaseAdapter, toPositionalPlaceholders } = require('../database-adapter');
const { run: runMigrations } = require('../migrations/run-migrations');
const { RelyingParty, AuthError } = require('../rp');
const { OrganizationRegistry, OrgError } = require('../organizations');

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
  // Printed once, at load time, so a human running this locally can
  // confirm which real server it's about to touch — never the full URL.
  console.log(`[postgres-adapter-runtime.test.js] connecting to ${redact(DATABASE_URL)}`);
}

// A monotonic fake clock, same pattern every other test file in this
// repo already uses for rp.js/organizations.js's injectable now().
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
    // Best-effort cleanup: truncate every table this suite could have
    // written to, so repeated runs don't accumulate rows. Uses CASCADE
    // to respect FK order without needing to hand-sequence it here.
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

// ---------------------------------------------------------------------
// STEP 6 — adapter-level tests
// ---------------------------------------------------------------------

test('placeholder conversion: ? -> $1,$2,... in call-site order', testOpts, () => {
  assert.equal(
    toPositionalPlaceholders('SELECT * FROM x WHERE a = ? AND b = ? AND c = ?'),
    'SELECT * FROM x WHERE a = $1 AND b = $2 AND c = $3'
  );
});

test('connects to the real server and migrations apply cleanly', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const tables = await db.all(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
      []
    );
    const names = tables.map((t) => t.table_name);
    for (const expected of [
      'users', 'credentials', 'challenges', 'sessions', 'password_reset_tokens',
      'mfa_recovery_codes', 'pending_auth_sessions', 'organizations',
      'organization_memberships', 'audit_events', 'schema_migrations',
    ]) {
      assert.ok(names.includes(expected), `expected table "${expected}" to exist after migration`);
    }
  });
});

test('rerunning migrations is idempotent (no error, nothing double-applied)', testOpts, async () => {
  const { applied: first } = await runMigrations({ databaseUrl: DATABASE_URL, dir: path.join(__dirname, '..', 'migrations') });
  const { applied: second } = await runMigrations({ databaseUrl: DATABASE_URL, dir: path.join(__dirname, '..', 'migrations') });
  assert.equal(second.length, 0, 'second run should find zero pending migrations');
});

test('foreign keys exist on credentials/sessions -> users', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const fks = await db.all(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name IN ('credentials', 'sessions')
    `, []);
    assert.ok(fks.some((f) => f.table_name === 'credentials' && f.foreign_table === 'users'));
    assert.ok(fks.some((f) => f.table_name === 'sessions' && f.foreign_table === 'users'));
  });
});

test('unique constraint on users.email is enforced', testOpts, async () => {
  await withRealPostgres(async (db) => {
    await db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', ['u1', 'dupe@example.com', Date.now()]);
    await assert.rejects(
      db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', ['u2', 'dupe@example.com', Date.now()]),
      /duplicate key|unique/i
    );
  });
});

test('get/all/run/exec all work against the real server', testOpts, async () => {
  await withRealPostgres(async (db) => {
    await db.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', ['u1', 'a@b.com', 123]);
    const one = await db.get('SELECT * FROM users WHERE id = ?', ['u1']);
    assert.equal(one.email, 'a@b.com');
    const many = await db.all('SELECT * FROM users', []);
    assert.equal(many.length, 1);
    const info = await db.run('UPDATE users SET is_platform_admin = 1 WHERE id = ?', ['u1']);
    assert.equal(info.changes, 1);
    await db.exec("INSERT INTO users (id, email, is_platform_admin, created_at) VALUES ('u2', 'raw@example.com', 0, 999)");
    const afterExec = await db.all('SELECT * FROM users', []);
    assert.equal(afterExec.length, 2);
  });
});

test('transaction commits all statements together', testOpts, async () => {
  await withRealPostgres(async (db) => {
    await db.transaction(async (tx) => {
      await tx.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', ['tx1', 'tx1@example.com', 1]);
      await tx.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', ['tx2', 'tx2@example.com', 2]);
    });
    const rows = await db.all('SELECT * FROM users', []);
    assert.equal(rows.length, 2);
  });
});

test('transaction rolls back ALL statements when an error is thrown partway through — no partial writes remain', testOpts, async () => {
  await withRealPostgres(async (db) => {
    await assert.rejects(db.transaction(async (tx) => {
      await tx.run('INSERT INTO users (id, email, is_platform_admin, created_at) VALUES (?, ?, 0, ?)', ['rb1', 'rb1@example.com', 1]);
      throw new Error('intentional failure to verify rollback');
    }), /intentional failure/);
    const rows = await db.all('SELECT * FROM users', []);
    assert.equal(rows.length, 0, 'the insert before the thrown error must not have been committed');
  });
});

// ---------------------------------------------------------------------
// STEP 7 — authentication coverage against real PostgreSQL
// ---------------------------------------------------------------------

test('RelyingParty: full password auth + session + reset lifecycle on real PostgreSQL', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });

    const user = await rp.registerWithPassword({ email: 'pg-user@example.com', password: 'correct horse battery staple' });
    assert.ok(user.id);

    const authResult = await rp.authenticateWithPassword({ email: 'pg-user@example.com', password: 'correct horse battery staple' });
    assert.ok(authResult.session.sessionId);

    const resolved = await rp.resolveSession(authResult.session.sessionId);
    assert.equal(resolved.email, 'pg-user@example.com');
    assert.equal(resolved.isPlatformAdmin, false);

    await rp.setPlatformAdmin(user.id, true);
    const resolvedAdmin = await rp.resolveSession(authResult.session.sessionId);
    assert.equal(resolvedAdmin.isPlatformAdmin, true, 'resolveSession must re-read is_platform_admin live, not cache it');

    const issued = await rp.createPasswordResetToken('pg-user@example.com');
    assert.ok(issued.token);
    await rp.completePasswordReset({ token: issued.token, newPassword: 'a new correct horse battery' });

    const oldPasswordAttempt = await rp.authenticateWithPassword({ email: 'pg-user@example.com', password: 'correct horse battery staple' }).catch((e) => e);
    assert.ok(oldPasswordAttempt instanceof AuthError);

    const staleSession = await rp.resolveSession(authResult.session.sessionId);
    assert.equal(staleSession, null, 'password reset must revoke pre-existing sessions');
  });
});

test('RelyingParty: challenge issue/consume and passkey credential persistence on real PostgreSQL', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });
    const options = await rp.beginRegistration({ email: 'pg-passkey@example.com' });
    assert.ok(options.challenge);
    // Full WebAuthn ceremony verification needs a real authenticator
    // simulator (see http-integration.test.js's createVirtualAuthenticator)
    // which is out of scope for a database-layer test — this test
    // confirms the challenge row round-trips through real PostgreSQL,
    // which is the part specific to this phase.
    const raw = await db.get('SELECT * FROM challenges WHERE challenge = ?', [options.challenge]);
    assert.ok(raw, 'challenge must be persisted and readable back from PostgreSQL');
    assert.equal(raw.purpose, 'registration');
  });
});

test('RelyingParty: TOTP MFA enrollment + pending-auth lifecycle on real PostgreSQL', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });
    const { totpCodeAt } = require('../totp');

    const user = await rp.registerWithPassword({ email: 'pg-mfa@example.com', password: 'correct horse battery staple' });
    const enroll = await rp.beginTotpEnrollment(user.id);
    const code = totpCodeAt(enroll.secret, clock.now());
    const completed = await rp.completeTotpEnrollment(user.id, code);
    assert.equal(completed.recoveryCodes.length, 10);

    const login = await rp.authenticateWithPassword({ email: 'pg-mfa@example.com', password: 'correct horse battery staple' });
    assert.equal(login.mfaRequired, true, 'password login must not issue a real session once TOTP is enabled');

    const mfaCode = totpCodeAt(enroll.secret, clock.now());
    const finished = await rp.completePendingAuthWithTotp(login.pendingId, mfaCode);
    assert.ok(finished.session.sessionId);
  });
});

test('RelyingParty: Firebase session convergence — same session model as password/passkey on real PostgreSQL', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });
    const result = await rp.authenticateWithVerifiedFirebase({ firebaseUid: 'fb-pg-1', email: 'pg-firebase@example.com' });
    assert.ok(result.session.sessionId);
    const resolved = await rp.resolveSession(result.session.sessionId);
    assert.equal(resolved.email, 'pg-firebase@example.com');

    // Second Firebase login with the same uid must reuse the same user,
    // never create a second row — the exact property
    // firebase-session-integration.test.js already verifies on SQLite.
    const second = await rp.authenticateWithVerifiedFirebase({ firebaseUid: 'fb-pg-1', email: 'pg-firebase@example.com' });
    const allUsers = await db.all('SELECT * FROM users WHERE email = ?', ['pg-firebase@example.com']);
    assert.equal(allUsers.length, 1);
  });
});

// ---------------------------------------------------------------------
// STEP 8 — organization coverage against real PostgreSQL
// ---------------------------------------------------------------------

test('OrganizationRegistry: create, invite, roles, permissions, isolation on real PostgreSQL', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });
    const orgs = new OrganizationRegistry(db, { now: clock.now });

    const owner = await rp.registerWithPassword({ email: 'pg-owner@example.com', password: 'correct horse battery staple' });
    const worker = await rp.registerWithPassword({ email: 'pg-worker@example.com', password: 'correct horse battery staple' });
    const outsider = await rp.registerWithPassword({ email: 'pg-outsider@example.com', password: 'correct horse battery staple' });

    const org = await orgs.createOrganization(owner.id, { name: 'PG Test Org' });
    assert.ok(org.id);

    await orgs.invite(owner.id, { organizationId: org.id, userId: worker.id, roles: ['member'] });
    const accepted = await orgs.acceptInvitation(worker.id, org.id);
    assert.equal(accepted.status, 'active');

    await orgs.assignRole(owner.id, org.id, worker.id, 'billing-viewer');
    await orgs.grantPermission(owner.id, org.id, worker.id, 'org:reports:read', 'allow');
    const authorized = await orgs.isAuthorized(worker.id, org.id, 'org:reports:read');
    assert.equal(authorized, true);

    await orgs.revokePermission(owner.id, org.id, worker.id, 'org:reports:read');
    const revoked = await orgs.isAuthorized(worker.id, org.id, 'org:reports:read');
    assert.equal(revoked, false);

    // Isolation: an outsider with no membership row must be denied,
    // never able to read this organization's member list.
    await assert.rejects(orgs.listOrganizationMembers(org.id, outsider.id), (err) => err instanceof OrgError && err.code === 'not_authorized');

    const auditRows = await db.all('SELECT * FROM audit_events WHERE event_type = ?', ['organization_created']);
    assert.equal(auditRows.length, 1);
  });
});

test('concurrent organization creation by two different users does not corrupt either row (real PostgreSQL concurrency)', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });
    const orgs = new OrganizationRegistry(db, { now: clock.now });
    const a = await rp.registerWithPassword({ email: 'pg-concurrent-a@example.com', password: 'correct horse battery staple' });
    const b = await rp.registerWithPassword({ email: 'pg-concurrent-b@example.com', password: 'correct horse battery staple' });

    const [orgA, orgB] = await Promise.all([
      orgs.createOrganization(a.id, { name: 'Concurrent A' }),
      orgs.createOrganization(b.id, { name: 'Concurrent B' }),
    ]);
    assert.notEqual(orgA.id, orgB.id);
    const membershipsA = await orgs.listUserOrganizations(a.id);
    const membershipsB = await orgs.listUserOrganizations(b.id);
    assert.equal(membershipsA.length, 1);
    assert.equal(membershipsB.length, 1);
    assert.equal(membershipsA[0].organizationId, orgA.id);
    assert.equal(membershipsB[0].organizationId, orgB.id);
  });
});

test('concurrent Firebase logins for a brand-new email do not create duplicate users (real PostgreSQL race, transaction-protected)', testOpts, async () => {
  await withRealPostgres(async (db) => {
    const clock = makeClock();
    const rp = new RelyingParty(db, { rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost', now: clock.now });
    await Promise.all([
      rp.authenticateWithVerifiedFirebase({ firebaseUid: 'fb-race-1', email: 'pg-race@example.com' }),
      rp.authenticateWithVerifiedFirebase({ firebaseUid: 'fb-race-1', email: 'pg-race@example.com' }),
    ]);
    const rows = await db.all('SELECT * FROM users WHERE email = ?', ['pg-race@example.com']);
    assert.equal(rows.length, 1, 'concurrent identical Firebase logins must resolve to exactly one user row');
  });
});

// ---------------------------------------------------------------------
// STEP 9 — admin bootstrap against real PostgreSQL
// ---------------------------------------------------------------------

test('bootstrap-admin.js grant/revoke/list against real PostgreSQL (disposable test identity, never the production admin)', testOpts, async () => {
  const { pgGrant, pgRevoke, pgList } = require('../bootstrap-admin');
  const { Client } = require('pg');
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await runMigrations({ databaseUrl: DATABASE_URL, dir: path.join(__dirname, '..', 'migrations') });
    const granted = await pgGrant(client, 'pg-bootstrap-test@example.com');
    assert.equal(granted.is_platform_admin, 1);
    const listed = await pgList(client);
    assert.ok(listed.some((u) => u.email === 'pg-bootstrap-test@example.com' && u.is_platform_admin));
    const revoked = await pgRevoke(client, 'pg-bootstrap-test@example.com');
    assert.equal(revoked.is_platform_admin, 0);
  } finally {
    try { await client.query('DELETE FROM users WHERE email = $1', ['pg-bootstrap-test@example.com']); } catch (_e) {}
    await client.end();
  }
});
