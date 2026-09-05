-- Faithful translation of migrateAddFirebaseUid() in server/webauthn-rp/db.js.
--
-- SQLite's UNIQUE index treats every NULL as distinct from every other
-- NULL, which is exactly ANSI SQL / Postgres's own behavior for UNIQUE
-- indexes too — so this partial index needs zero semantic change:
-- WebAuthn-only accounts (firebase_uid IS NULL) are still never
-- constrained against each other, and any row that DOES have a
-- firebase_uid set is still uniquely constrained on it.

ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid
  ON users(firebase_uid) WHERE firebase_uid IS NOT NULL;
