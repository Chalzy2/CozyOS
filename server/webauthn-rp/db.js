'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

// Idempotent column migration: node:sqlite has no "ADD COLUMN IF NOT
// EXISTS", so we check PRAGMA table_info first, same idempotency
// guarantee the CREATE TABLE IF NOT EXISTS statements below already give
// every fresh-vs-existing DB file. Safe to run against either a brand
// new database (created moments ago by the CREATE TABLE below) or an
// existing pre-Firebase-unification database file.
function migrateAddFirebaseUid(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const hasColumn = cols.some((c) => c.name === 'firebase_uid');
  if (!hasColumn) {
    db.exec('ALTER TABLE users ADD COLUMN firebase_uid TEXT');
  }
  // Partial unique index: many users will have firebase_uid = NULL
  // (WebAuthn-only accounts that have never linked a Firebase login),
  // and SQLite's UNIQUE treats every NULL as distinct, so this only
  // actually constrains rows that DO have a firebase_uid set — exactly
  // the "one CozyOS user per Firebase identity" guarantee required.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL');
}

function openDb(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      is_platform_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS credentials (
      credential_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      public_key_jwk TEXT NOT NULL,
      algorithm TEXT NOT NULL,
      sign_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER,
      revoked_at INTEGER,
      nickname TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      challenge TEXT PRIMARY KEY,
      user_id TEXT,
      purpose TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      event_type TEXT NOT NULL,
      detail TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  migrateAddFirebaseUid(db);
  migrateAddPasswordAuth(db);
  migrateAddTotpMfa(db);
  migrateAddOrganizations(db);
  return db;
}

// Same idempotent-migration pattern as migrateAddFirebaseUid above: safe to
// run against a brand-new DB (just created by the CREATE TABLE above) or an
// existing pre-password-auth database file.
function migrateAddPasswordAuth(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const hasPasswordHash = cols.some((c) => c.name === 'password_hash');
  if (!hasPasswordHash) {
    db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
  }
  const hasDisabledAt = cols.some((c) => c.name === 'disabled_at');
  if (!hasDisabledAt) {
    db.exec('ALTER TABLE users ADD COLUMN disabled_at INTEGER');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// Phase C §4 — real server-side MFA storage. Same idempotent-migration
// pattern as the two migrations above. Adds:
//   - users.totp_secret / totp_enabled / totp_enrolled_at: server-side
//     TOTP enrollment state. totp_secret is written at enroll-begin time
//     but totp_enabled stays 0 (and is NOT treated as "MFA required" by
//     authenticateWithPassword) until enroll-complete verifies a real
//     code — see rp.js completeTotpEnrollment().
//   - mfa_recovery_codes: hashed, single-use recovery codes, same
//     posture as password_reset_tokens (never stored in plaintext).
//   - pending_auth_sessions: the real "password_verified_pending_mfa"
//     state required by Phase C §4. A row here is deliberately NOT a
//     `sessions` row — resolveSession()/currentSession() never reads
//     this table, so a pending id can never authorize /webauthn/session,
//     admin routes, or any protected resource no matter what a modified
//     client sends. It carries its own short TTL and its own bounded
//     attempt counter, independent of the real session TTL.
function migrateAddTotpMfa(db) {
  const cols = db.prepare('PRAGMA table_info(users)').all();
  if (!cols.some((c) => c.name === 'totp_secret')) {
    db.exec('ALTER TABLE users ADD COLUMN totp_secret TEXT');
  }
  if (!cols.some((c) => c.name === 'totp_enabled')) {
    db.exec('ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.some((c) => c.name === 'totp_enrolled_at')) {
    db.exec('ALTER TABLE users ADD COLUMN totp_enrolled_at INTEGER');
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
      code_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS pending_auth_sessions (
      pending_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at INTEGER,
      cancelled_at INTEGER,
      locked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// Server-backed organization + membership foundation (Milestone A).
// Same idempotent-migration pattern as the migrations above. Mirrors the
// existing client-side core/organization/organization-membership.js data
// shape (memberKey = organizationId+userId, one row per pair reused across
// status transitions, roles/applications/permissions as arrays) so the
// server model is a faithful, verifiable backing for what the browser
// already displays — not a second, divergent authority.
function migrateAddOrganizations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS organization_memberships (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      roles TEXT NOT NULL DEFAULT '[]',
      applications TEXT NOT NULL DEFAULT '[]',
      permissions TEXT NOT NULL DEFAULT '[]',
      invited_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      responded_at INTEGER,
      expires_at INTEGER,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- One real membership row per (organization, user) pair, reused across
    -- status transitions — matches the client's memberKey() precedent.
    -- Prevents a duplicate "invited" row from ever being created for a
    -- user who already has a non-terminal membership in that organization.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_pair
      ON organization_memberships(organization_id, user_id);
  `);
}

module.exports = { openDb };
