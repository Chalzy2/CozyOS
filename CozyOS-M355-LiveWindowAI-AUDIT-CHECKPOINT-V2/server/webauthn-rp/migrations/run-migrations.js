#!/usr/bin/env node
'use strict';
/**
 * server/webauthn-rp/migrations/run-migrations.js
 * CozyOS — PostgreSQL schema migration runner (Phase B1).
 *
 * STATUS: written against the documented `pg` client API, NOT executed
 * against a real PostgreSQL server in this environment (no network
 * access, no local PostgreSQL install available here — verified before
 * writing this file). Do not treat this as verified until it has
 * actually been run against a real Postgres instance and that run is
 * reported.
 *
 * WHAT THIS DOES
 *   Applies every 0NN_*.sql file in this directory, in filename order,
 *   exactly once, tracked in a schema_migrations table. Safe to run
 *   repeatedly — already-applied files are skipped.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *   - Does not touch SQLite at all.
 *   - Does not get wired into server startup. This is a manual,
 *     explicit operator action (`node server/webauthn-rp/migrations/run-migrations.js`),
 *     same posture as bootstrap-admin.js and for the same reason:
 *     schema changes must be a deliberate one-time action, not an
 *     unconditional thing that happens on every deploy/restart.
 *
 * USAGE
 *   node server/webauthn-rp/migrations/run-migrations.js --database-url "$COZY_DATABASE_URL"
 *
 * REQUIRES
 *   the `pg` package (not yet installed anywhere in this repository —
 *   see Phase B1 report, "NEW DEPENDENCIES"). This file will throw a
 *   clear "Cannot find module 'pg'" error until that dependency is
 *   actually added.
 */

const fs = require('node:fs');
const path = require('node:path');

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

function listMigrationFiles() {
  return fs.readdirSync(__dirname)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort(); // zero-padded numeric prefixes sort correctly as plain strings
}

async function run({ databaseUrl, dir = __dirname } = {}) {
  if (!databaseUrl) {
    throw new Error('run-migrations: --database-url (or COZY_DATABASE_URL) is required. Refusing to guess a connection target.');
  }
  // Deliberately required at call time, not at module load time, so this
  // file can still be `require()`d (e.g. by a future test) in an
  // environment where `pg` is not installed, without throwing merely
  // from being imported.
  const { Client } = require('pg');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  const applied = [];
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    const { rows: already } = await client.query('SELECT version FROM schema_migrations');
    const appliedSet = new Set(already.map((r) => r.version));

    const files = fs.readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed and was rolled back: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
  return { applied };
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const databaseUrl = flags['database-url'] || process.env.COZY_DATABASE_URL;
  try {
    const { applied } = await run({ databaseUrl });
    if (applied.length === 0) {
      console.log('No pending migrations. Schema is up to date.');
    } else {
      console.log(`Applied ${applied.length} migration(s):`);
      for (const f of applied) console.log(`  - ${f}`);
    }
  } catch (err) {
    console.error(`run-migrations: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { run, listMigrationFiles, parseArgs };

if (require.main === module) {
  main();
}
