-- CozyOS WebAuthn RP — PostgreSQL migration 001
-- Faithful translation of the CREATE TABLE block in server/webauthn-rp/db.js
-- (openDb()'s initial schema, before any of the three idempotent
-- migrateAdd*() functions run). No redesign: same tables, same columns,
-- same nullability, same foreign keys, in the same dependency order.
--
-- SQLite -> PostgreSQL notes for this file specifically:
--   - INTEGER PRIMARY KEY AUTOINCREMENT (audit_events.id) -> BIGSERIAL.
--     SQLite's AUTOINCREMENT guarantees monotonic non-reuse; BIGSERIAL
--     (backed by a sequence) gives the same guarantee.
--   - "INTEGER" used as a millisecond-epoch timestamp column throughout
--     this codebase (created_at, expires_at, etc.) -> BIGINT. Postgres
--     INTEGER is 32-bit and would overflow real millisecond epoch values
--     well before year 2038's 32-bit second boundary even arrives, since
--     these are milliseconds, not seconds.
--   - SQLite has no native BOOLEAN; is_platform_admin/totp_enabled are
--     "INTEGER NOT NULL DEFAULT 0" in db.js and the application code
--     reads/writes them as 0/1 (see rp.js: `isAdmin ? 1 : 0`). Kept as
--     INTEGER here, not translated to a real BOOLEAN, specifically so
--     the existing 0/1 application code needs zero changes when it is
--     eventually pointed at this schema.
--   - SQLite's implicit ROWID-based TEXT PRIMARY KEY behaves like a real
--     PRIMARY KEY constraint in Postgres with no special handling needed.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  is_platform_admin INTEGER NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS credentials (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  public_key_jwk TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  sign_count INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  last_used_at BIGINT,
  revoked_at BIGINT,
  nickname TEXT
);

CREATE TABLE IF NOT EXISTS challenges (
  challenge TEXT PRIMARY KEY,
  user_id TEXT,
  purpose TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  revoked_at BIGINT
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL,
  detail TEXT,
  created_at BIGINT NOT NULL
);
