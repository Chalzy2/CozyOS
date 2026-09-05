-- Faithful translation of migrateAddTotpMfa() in server/webauthn-rp/db.js.
--
-- pending_auth_sessions is intentionally a separate table from `sessions`
-- (see original SQLite comment, preserved below) — that boundary is a
-- security property, not an implementation detail, and must not be
-- collapsed or merged during this migration.
--
-- A pending_auth_sessions row is deliberately NOT a `sessions` row:
-- resolveSession()/currentSession() never read this table, so a pending
-- id can never authorize /webauthn/session, admin routes, or any
-- protected resource no matter what a modified client sends. It carries
-- its own short TTL and its own bounded attempt counter, independent of
-- the real session TTL.

ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enrolled_at BIGINT;

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  used_at BIGINT
);

CREATE TABLE IF NOT EXISTS pending_auth_sessions (
  pending_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at BIGINT,
  cancelled_at BIGINT,
  locked_at BIGINT
);
