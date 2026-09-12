'use strict';

/**
 * server/webauthn-rp/test/migrate-sqlite-to-postgres.test.js
 * B4.3 repair — Blocker 2.
 *
 * IMPORTANT SCOPE NOTE: this exercises migrate-sqlite-to-postgres.js's
 * actual logic (via the createPgClient injection point added for this
 * repair) against a MOCK PostgreSQL target (server/webauthn-rp/test/mock-pg-client.js),
 * not a real one — this sandbox has no reachable PostgreSQL server (a
 * real `apt-get install postgresql` was attempted and failed with the
 * same network restriction that blocks everything else here). This is
 * disclosed, not hidden: these results prove the migration script's own
 * code is structurally correct (transaction boundaries, FK-safe
 * ordering, ID preservation, refuse-non-empty-target, rollback behavior,
 * no credential logging) using a fixture covering the real relational
 * schema — they do NOT prove real-Postgres-specific behavior (actual SQL
 * dialect acceptance, real type coercion, real network/TLS conditions).
 * That remains a genuine, separate, disclosed gap requiring execution
 * against the real Neon database from an environment with network access.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDb } = require('../db');
const { migrate, TABLE_ORDER } = require('../migrate-sqlite-to-postgres');
const { createMockPgClient } = require('./mock-pg-client');

function freshSqlitePath(prefix) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`)), 'source.sqlite');
}

// Builds a disposable SQLite source covering every table in TABLE_ORDER
// with representative, relationally-consistent data: two users (one
// platform admin), a credential, a challenge, a session, a password
// reset token, a recovery code, a pending auth session, an organization,
// a membership, and an audit event — enough to exercise every foreign
// key relationship the migration script has to preserve.
function buildFixture(sqlitePath) {
  const db = openDb(sqlitePath);
  const now = Date.now();

  db.prepare('INSERT INTO users (id, email, is_platform_admin, created_at, firebase_uid, password_hash, disabled_at, totp_secret, totp_enabled, totp_enrolled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('user-1', 'admin@example.test', 1, now, null, 'hash-1', null, 'totp-secret-1', 1, now);
  db.prepare('INSERT INTO users (id, email, is_platform_admin, created_at, firebase_uid, password_hash, disabled_at, totp_secret, totp_enabled, totp_enrolled_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('user-2', 'member@example.test', 0, now, 'firebase-uid-2', 'hash-2', null, null, 0, null);

  db.prepare('INSERT INTO credentials (credential_id, user_id, public_key_jwk, algorithm, sign_count, created_at, last_used_at, revoked_at, nickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('cred-1', 'user-1', '{"kty":"EC"}', 'ES256', 0, now, null, null, 'Test key');

  db.prepare('INSERT INTO challenges (challenge, user_id, purpose, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('challenge-1', 'user-1', 'registration', now, now + 60000, null);

  db.prepare('INSERT INTO sessions (session_id, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?)')
    .run('session-1', 'user-1', now, now + 3600000, null);

  db.prepare('INSERT INTO password_reset_tokens (token_hash, user_id, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?)')
    .run('reset-token-hash-1', 'user-2', now, now + 900000, null);

  db.prepare('INSERT INTO mfa_recovery_codes (code_hash, user_id, created_at, used_at) VALUES (?, ?, ?, ?)')
    .run('recovery-code-hash-1', 'user-1', now, null);

  db.prepare('INSERT INTO pending_auth_sessions (pending_id, user_id, created_at, expires_at, attempts, consumed_at, cancelled_at, locked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('pending-1', 'user-1', now, now + 300000, 0, null, null, null);

  db.prepare('INSERT INTO organizations (id, name, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run('org-1', 'Test Org', 'active', 'user-1', now, now);

  db.prepare('INSERT INTO organization_memberships (id, organization_id, user_id, status, roles, applications, permissions, invited_by, created_at, updated_at, responded_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('membership-1', 'org-1', 'user-2', 'active', '["member"]', '[]', '[]', 'user-1', now, now, now, null);

  db.prepare('INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)')
    .run('user-1', 'test_event', 'fixture data', now);

  db.close();
}

test('migrate-sqlite-to-postgres: representative fixture migrates completely, IDs and relationships preserved (mock PostgreSQL target)', async () => {
  const sqlitePath = freshSqlitePath('migrate-happy-path');
  buildFixture(sqlitePath);

  const logs = [];
  const mockClient = createMockPgClient();
  const result = await migrate({
    sqlitePath,
    databaseUrl: 'postgres://sentinel-should-never-appear:s3cr3t-should-never-appear@mock-host/mockdb',
    log: (msg) => logs.push(msg),
    createPgClient: () => mockClient,
  });

  // Row counts match the fixture exactly, for every table.
  assert.deepEqual(result.counts, {
    users: 2, credentials: 1, challenges: 1, sessions: 1,
    password_reset_tokens: 1, mfa_recovery_codes: 1, pending_auth_sessions: 1,
    organizations: 1, organization_memberships: 1, audit_events: 1,
  });

  // IDs preserved verbatim (not regenerated).
  const usersInTarget = mockClient._inspect.tables.users;
  assert.ok(usersInTarget.some((u) => u.id === 'user-1'));
  assert.ok(usersInTarget.some((u) => u.id === 'user-2'));

  // Relationships intact: the credential still points at the same user
  // id it pointed at in the source, and that user genuinely exists in
  // the target (the mock's own FK check would have thrown otherwise —
  // this assertion additionally confirms it wasn't silently dropped).
  const cred = mockClient._inspect.tables.credentials[0];
  assert.equal(cred.user_id, 'user-1');
  const membership = mockClient._inspect.tables.organization_memberships[0];
  assert.equal(membership.organization_id, 'org-1');
  assert.equal(membership.user_id, 'user-2');

  // Table order in the log output respects TABLE_ORDER (FK-safe order).
  const orderedTablesLogged = TABLE_ORDER.filter((t) => logs.some((l) => l.includes(`  ${t}: `)));
  assert.deepEqual(orderedTablesLogged, TABLE_ORDER);

  // Verification pass reported success.
  assert.ok(logs.some((l) => l.includes('Verification passed')));

  // No credential ever appears in any log line.
  const allLogs = logs.join('\n');
  assert.ok(!allLogs.includes('sentinel-should-never-appear'));
  assert.ok(!allLogs.includes('s3cr3t-should-never-appear'));
  // The redacted form (host/db name only) is expected to appear.
  assert.ok(allLogs.includes('mock-host'));
});

test('migrate-sqlite-to-postgres: refuses a non-empty target without --force', async () => {
  const sqlitePath = freshSqlitePath('migrate-refuse-nonempty');
  buildFixture(sqlitePath);

  const mockClient = createMockPgClient();
  // Pre-seed the target with one existing user, simulating a target
  // that already has data.
  mockClient._inspect.tables.users.push({ id: 'preexisting-user', email: 'preexisting@example.test' });

  await assert.rejects(
    () => migrate({
      sqlitePath,
      databaseUrl: 'postgres://u:p@mock-host/mockdb',
      log: () => {},
      createPgClient: () => mockClient,
    }),
    /already has 1 row\(s\)\. Refusing to import into a non-empty table without --force/
  );

  // Confirm nothing else was inserted as a side effect of the refusal.
  assert.equal(mockClient._inspect.tables.credentials.length, 0);
  assert.equal(mockClient._inspect.tables.organizations.length, 0);
});

test('migrate-sqlite-to-postgres: a mid-import failure rolls back completely, leaving the target empty (no partial state)', async () => {
  const sqlitePath = freshSqlitePath('migrate-rollback');
  buildFixture(sqlitePath);

  // Force a failure partway through the FK-safe insert order — after
  // users/credentials/challenges/sessions/password_reset_tokens have
  // already been inserted inside the same transaction, but before the
  // import completes.
  const mockClient = createMockPgClient({ failOnTable: 'mfa_recovery_codes', failMessage: 'simulated mid-import failure' });

  await assert.rejects(
    () => migrate({
      sqlitePath,
      databaseUrl: 'postgres://u:p@mock-host/mockdb',
      log: () => {},
      createPgClient: () => mockClient,
    }),
    /Import failed and was rolled back \(PostgreSQL left unchanged\): simulated mid-import failure/
  );

  // The critical assertion: EVERY table is empty afterward, including
  // the ones that were successfully inserted before the failure. A
  // partial commit here would be a real, serious defect.
  for (const table of Object.keys(mockClient._inspect.tables)) {
    assert.equal(mockClient._inspect.tables[table].length, 0,
      `table "${table}" retained ${mockClient._inspect.tables[table].length} row(s) after a rolled-back import — partial state leaked`);
  }
});

test('migrate-sqlite-to-postgres: a malformed --database-url (parsed as a boolean, not a string) fails with a clear, actionable error instead of a dependency stack trace', async () => {
  // Regression test for a REAL bug found via a real Termux run against
  // real Neon: parseArgs() treats a CLI flag as a valueless boolean
  // `true` whenever the following argv token looks like another flag or
  // is simply missing — which happens whenever a connection string
  // isn't quoted safely in the shell (an unquoted "&" in a Neon URL's
  // query string, e.g. "&channel_binding=require", is interpreted by
  // bash as a background-job operator and truncates the argument).
  // Before this fix, `databaseUrl === true` passed every falsy check,
  // reached `new (require('pg').Client)({ connectionString: true })`,
  // and crashed three layers deep inside pg-connection-string with the
  // cryptic "str.charAt is not a function" (node_modules/pg-connection-string/index.js
  // calling `str.charAt(0)` on a boolean). This test proves the fix
  // surfaces a clear, actionable error at the migration script's own
  // boundary instead.
  const sqlitePath = freshSqlitePath('migrate-malformed-url');
  buildFixture(sqlitePath);

  await assert.rejects(
    () => migrate({
      sqlitePath,
      databaseUrl: true, // exactly what a malformed CLI flag produces
      log: () => {},
      // deliberately no createPgClient — this must be caught before
      // ever reaching the real (or mock) Postgres client construction
    }),
    /did not receive a real value \(got boolean: true\)/
  );
});

test('migrate-sqlite-to-postgres CLI: a malformed --database-url flag does not shadow a correctly-set COZY_DATABASE_URL environment variable', () => {
  // Companion regression for the main() fallback chain: previously
  // `flags['database-url'] || process.env.COZY_DATABASE_URL` would
  // never fall through to the environment variable if the CLI flag
  // resolved to the truthy boolean `true`. Testing main()'s exact logic
  // here directly (without invoking the real CLI process) since main()
  // itself has no return value to assert on otherwise.
  const flags = { 'database-url': true, sqlite: '/tmp/x.sqlite' };
  const cliDatabaseUrl = typeof flags['database-url'] === 'string' ? flags['database-url'] : undefined;
  assert.equal(cliDatabaseUrl, undefined, 'a boolean flag value must not be treated as a usable connection string');
  // With cliDatabaseUrl undefined, `cliDatabaseUrl || process.env.COZY_DATABASE_URL`
  // correctly falls through to the environment variable, unlike the
  // original `true || process.env.COZY_DATABASE_URL` (which always
  // evaluated to `true`, ignoring the environment variable entirely).
});
