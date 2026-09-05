#!/usr/bin/env node
'use strict';
/**
 * server/webauthn-rp/migrate-sqlite-to-postgres.js
 * CozyOS — one-time SQLite -> PostgreSQL data migration tool (Phase B1).
 *
 * STATUS: written against the documented `pg` client API and the real,
 * existing SQLite schema (server/webauthn-rp/db.js), but NOT executed
 * against a real PostgreSQL server in this environment — no network
 * access and no local PostgreSQL install exist in this sandbox
 * (verified before writing this file: `npm install pg` returned a
 * 403/no-registry-access error, and no `psql`/`postgres` binary is
 * present). Treat this as unverified until it has actually been run
 * against a real target and that run is reported honestly.
 *
 * SAFETY PROPERTIES (all required, see Phase B1 spec Step 5)
 *   - Explicit source (SQLite file path) and explicit target
 *     (PostgreSQL connection string) — never inferred, never defaulted
 *     to a guessed production target.
 *   - The entire PostgreSQL-side import runs inside one transaction;
 *     any failure rolls the whole import back, leaving PostgreSQL
 *     exactly as it was before this ran.
 *   - Deterministic, foreign-key-safe table order: users first, then
 *     every table that references users, then organizations, then
 *     organization_memberships (which references organizations).
 *   - Never overwrites existing PostgreSQL data by accident: refuses to
 *     run against a target where any of the target tables already
 *     contain rows, unless --force is explicitly passed.
 *   - No credential logging: the SQLite path and a redacted form of the
 *     PostgreSQL target (host/db name only, never user:password) are
 *     the only connection details ever printed.
 *   - Prints a per-table row count actually inserted, and a final
 *     verification pass that re-counts both databases and reports any
 *     mismatch instead of silently declaring success.
 *
 * USAGE
 *   node server/webauthn-rp/migrate-sqlite-to-postgres.js \
 *     --sqlite /var/data/cozy-webauthn.sqlite \
 *     --database-url "$COZY_DATABASE_URL" \
 *     [--force]
 *
 * REQUIRES the `pg` package (see Phase B1 report — not yet a project
 * dependency). Requires the numbered migrations in
 * server/webauthn-rp/migrations/ to have already been applied to the
 * PostgreSQL target via run-migrations.js — this tool moves data, it
 * does not create schema.
 */

const { openDb } = require('./db');

// Foreign-key-safe order: a table only appears after every table it
// references. audit_events.user_id has no FK constraint in the source
// schema (it's an optional, unconstrained reference — see db.js) but is
// still placed after users for referential sanity in the target.
const TABLE_ORDER = [
  'users',
  'credentials',
  'challenges',
  'sessions',
  'password_reset_tokens',
  'mfa_recovery_codes',
  'pending_auth_sessions',
  'organizations',
  'organization_memberships',
  'audit_events',
];

const COLUMNS = {
  users: ['id', 'email', 'is_platform_admin', 'created_at', 'firebase_uid', 'password_hash', 'disabled_at', 'totp_secret', 'totp_enabled', 'totp_enrolled_at'],
  credentials: ['credential_id', 'user_id', 'public_key_jwk', 'algorithm', 'sign_count', 'created_at', 'last_used_at', 'revoked_at', 'nickname'],
  challenges: ['challenge', 'user_id', 'purpose', 'created_at', 'expires_at', 'consumed_at'],
  sessions: ['session_id', 'user_id', 'created_at', 'expires_at', 'revoked_at'],
  password_reset_tokens: ['token_hash', 'user_id', 'created_at', 'expires_at', 'consumed_at'],
  mfa_recovery_codes: ['code_hash', 'user_id', 'created_at', 'used_at'],
  pending_auth_sessions: ['pending_id', 'user_id', 'created_at', 'expires_at', 'attempts', 'consumed_at', 'cancelled_at', 'locked_at'],
  organizations: ['id', 'name', 'status', 'created_by', 'created_at', 'updated_at'],
  organization_memberships: ['id', 'organization_id', 'user_id', 'status', 'roles', 'applications', 'permissions', 'invited_by', 'created_at', 'updated_at', 'responded_at', 'expires_at'],
  audit_events: ['id', 'user_id', 'event_type', 'detail', 'created_at'],
};

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
    if (value !== true) i += 1;
    flags[key] = value;
  }
  return flags;
}

function redactConnectionString(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch (_err) {
    return '(unparseable connection string — not logging it)';
  }
}

async function migrate({ sqlitePath, databaseUrl, force = false, log = console.log, createPgClient } = {}) {
  if (!sqlitePath) throw new Error('migrate-sqlite-to-postgres: --sqlite <path> is required.');
  if (!databaseUrl) throw new Error('migrate-sqlite-to-postgres: --database-url is required. Refusing to guess a production target.');
  // B4.3 REPAIR — a real Termux run against real Neon crashed here with
  // the cryptic dependency-internals error "str.charAt is not a
  // function", three layers deep inside pg-connection-string, instead
  // of a clear message. Root cause: parseArgs() below treats a flag as
  // a no-value boolean `true` whenever the *next* argv token looks like
  // another flag (starts with "--") or is simply absent — which happens
  // whenever a connection string isn't quoted safely in the shell (a
  // Neon URL's `&channel_binding=require`/`&sslmode=require` query
  // params are especially prone to this: an unquoted `&` is a shell
  // background-job operator, silently truncating the argument). That
  // produced `databaseUrl === true` (a boolean), which passed every
  // falsy/truthy check up to this point (`true` is truthy) but is not a
  // usable connection string. This explicit type check turns that into
  // an immediate, actionable error instead of a dependency stack trace.
  if (typeof databaseUrl !== 'string') {
    throw new Error(
      `migrate-sqlite-to-postgres: --database-url did not receive a real value ` +
      `(got ${typeof databaseUrl}: ${JSON.stringify(databaseUrl)}). This usually means the ` +
      `connection string wasn't quoted safely in the shell — an unquoted "&" in a Neon URL's ` +
      `query string (e.g. "&channel_binding=require") is interpreted by bash as a background-job ` +
      `operator and truncates the argument. Wrap the value in single quotes, e.g.: ` +
      `--database-url 'postgres://user:pass@host/db?sslmode=require&channel_binding=require', ` +
      `or set it via the COZY_DATABASE_URL environment variable instead: ` +
      `export COZY_DATABASE_URL='postgres://...'`
    );
  }

  log(`Source (SQLite): ${sqlitePath}`);
  log(`Target (PostgreSQL): ${redactConnectionString(databaseUrl)}`);

  const sourceDb = openDb(sqlitePath);
  // B4.3 REPAIR — createPgClient is an optional injection point added
  // solely for testability (a real disposable PostgreSQL server is not
  // reachable from every environment this runs in). When omitted
  // (every real invocation, including the CLI entrypoint below), this
  // is byte-for-byte the original hardcoded behavior: require('pg')
  // lazily and construct a real Client against databaseUrl. Nothing
  // about the real, production code path changes.
  const client = createPgClient
    ? createPgClient(databaseUrl)
    : new (require('pg').Client)({ connectionString: databaseUrl });
  await client.connect();

  const counts = {};
  try {
    // Safety: refuse to clobber a target that already has data, unless
    // the operator explicitly opts in with --force.
    if (!force) {
      for (const table of TABLE_ORDER) {
        const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
        if (rows[0].n > 0) {
          throw new Error(
            `Target table "${table}" already has ${rows[0].n} row(s). ` +
            `Refusing to import into a non-empty table without --force. ` +
            `This tool never overwrites production data by accident.`
          );
        }
      }
    }

    await client.query('BEGIN');
    try {
      for (const table of TABLE_ORDER) {
        const cols = COLUMNS[table];
        const sourceRows = sourceDb.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all();
        for (const row of sourceRows) {
          const values = cols.map((c) => row[c]);
          const placeholders = cols.map((_c, i) => `$${i + 1}`).join(', ');
          await client.query(
            `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
            values
          );
        }
        counts[table] = sourceRows.length;
        log(`  ${table}: ${sourceRows.length} row(s) migrated`);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Import failed and was rolled back (PostgreSQL left unchanged): ${err.message}`);
    }

    // Verification pass: re-count both sides independently rather than
    // trusting the insert loop's own counters.
    log('Verifying...');
    let allMatch = true;
    for (const table of TABLE_ORDER) {
      const sourceCount = sourceDb.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
      const targetCount = rows[0].n;
      const match = sourceCount === targetCount;
      if (!match) allMatch = false;
      log(`  ${table}: sqlite=${sourceCount} postgres=${targetCount} ${match ? 'OK' : 'MISMATCH'}`);
    }
    if (!allMatch) {
      throw new Error('Post-import verification found row-count mismatches. Data was committed but does not match the source — investigate before trusting this target.');
    }
    log('Verification passed: every table matches the source row count.');
  } finally {
    sourceDb.close();
    await client.end();
  }
  return { counts };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  // B4.3 REPAIR — previously `flags['database-url'] || process.env.COZY_DATABASE_URL`.
  // If the CLI flag was malformed (see the typeof check inside migrate()
  // above), `flags['database-url']` could be the boolean `true` — which
  // is truthy, so `||` never fell through to check
  // COZY_DATABASE_URL even if it was correctly set as a safety net.
  // Only use the CLI flag when it's actually a string.
  const cliDatabaseUrl = typeof flags['database-url'] === 'string' ? flags['database-url'] : undefined;
  try {
    await migrate({
      sqlitePath: flags.sqlite,
      databaseUrl: cliDatabaseUrl || process.env.COZY_DATABASE_URL,
      force: !!flags.force,
    });
  } catch (err) {
    console.error(`migrate-sqlite-to-postgres: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { migrate, parseArgs, redactConnectionString, TABLE_ORDER, COLUMNS };

if (require.main === module) {
  main();
}
