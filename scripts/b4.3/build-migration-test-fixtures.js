#!/usr/bin/env node
'use strict';
/**
 * scripts/b4.3/build-migration-test-fixtures.js
 *
 * Run this from Termux, inside the checkpoint's repo root, with `npm ci`
 * already done (needs node:sqlite, which is built into Node 22+, so no
 * extra dependency for this script itself).
 *
 *   node scripts/b4.3/build-migration-test-fixtures.js
 *
 * Creates two disposable SQLite files in a fresh temp directory and
 * prints their paths:
 *
 *   1. <tmp>/clean.sqlite       — representative, fully-valid data
 *      across all 10 tables (2 users, a credential, a challenge, a
 *      session, a password reset token, a recovery code, a pending
 *      auth session, an organization, a membership, an audit event).
 *      Use this for the happy-path migration test.
 *
 *   2. <tmp>/broken-fk.sqlite   — identical to clean.sqlite, PLUS one
 *      extra credential row whose user_id points at a user that does
 *      NOT exist ('user-does-not-exist'). This file is built with
 *      SQLite's foreign-key enforcement deliberately (and temporarily)
 *      turned off for just that one insert, since node:sqlite enforces
 *      FKs by default. PostgreSQL's real schema WILL enforce this
 *      constraint regardless (per
 *      server/webauthn-rp/migrations/003_password_auth.sql's REFERENCES
 *      clause), so importing this file is expected to fail partway
 *      through the credentials table and should roll back completely.
 *      Use this for the rollback-on-injected-failure test — no code
 *      changes to migrate-sqlite-to-postgres.js needed to trigger a
 *      REAL Postgres-side failure.
 *
 * This script only ever writes to a fresh os.tmpdir() subdirectory. It
 * never touches any real/production SQLite file.
 */

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { openDb } = require(path.join(__dirname, '..', '..', 'server', 'webauthn-rp', 'db'));

function buildCleanFixture(sqlitePath) {
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

  return {
    counts: {
      users: 2, credentials: 1, challenges: 1, sessions: 1,
      password_reset_tokens: 1, mfa_recovery_codes: 1, pending_auth_sessions: 1,
      organizations: 1, organization_memberships: 1, audit_events: 1,
    },
  };
}

function addFkViolation(sqlitePath) {
  const db = openDb(sqlitePath);
  const now = Date.now();
  // node:sqlite (unlike the traditional sqlite3 library) enforces
  // foreign keys by default, so inserting a deliberately-invalid
  // user_id needs FK enforcement turned off for just this one insert.
  // This does not weaken the fixture's usefulness — PostgreSQL's real
  // schema (server/webauthn-rp/migrations/003_password_auth.sql) WILL
  // enforce this constraint regardless of what SQLite's pragma was set
  // to when the file was created, which is exactly the point: a real,
  // unmodified PostgreSQL constraint violation to prove rollback.
  db.exec('PRAGMA foreign_keys = OFF');
  db.prepare('INSERT INTO credentials (credential_id, user_id, public_key_jwk, algorithm, sign_count, created_at, last_used_at, revoked_at, nickname) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('cred-BROKEN', 'user-does-not-exist', '{"kty":"EC"}', 'ES256', 0, now, null, null, 'Deliberately broken FK');
  db.exec('PRAGMA foreign_keys = ON');
  db.close();
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozyos-b4.3-migration-fixtures-'));
const cleanPath = path.join(tmpDir, 'clean.sqlite');
const brokenPath = path.join(tmpDir, 'broken-fk.sqlite');

const { counts } = buildCleanFixture(cleanPath);
fs.copyFileSync(cleanPath, brokenPath);
addFkViolation(brokenPath);

console.log('Fixtures created:');
console.log(`  Clean (happy path):        ${cleanPath}`);
console.log(`  Broken FK (rollback test): ${brokenPath}`);
console.log('Expected row counts in the clean fixture:', JSON.stringify(counts));
console.log('');
console.log('Next steps (see docs/builder/knowledge/B4.3-MIGRATION-TERMUX-RUNBOOK.md for the full sequence).');
