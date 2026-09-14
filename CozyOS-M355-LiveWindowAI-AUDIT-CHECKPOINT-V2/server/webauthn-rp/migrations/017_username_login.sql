-- Faithful translation of migrateAddUsername() in server/webauthn-rp/db.js.
--
-- CHALZYDASHBOARD-USERNAME-LOGIN: adds an optional, operator-assigned
-- `username` lookup key to the SAME real `users` table. It is not a
-- second identity system — a row's canonical identity remains its
-- `id`/`email`; `username` only resolves to that same row before the
-- existing password-verification path runs. Never writable by any
-- HTTP-reachable endpoint — only by the trusted-operator
-- bootstrap-admin.js CLI (`set-username`), same posture as
-- is_platform_admin itself.
--
-- Same NULL-is-distinct partial-unique-index reasoning as
-- 002_firebase_uid.sql: most rows will have no username at all, and
-- only rows that DO have one are constrained unique against each other.

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
  ON users(username) WHERE username IS NOT NULL;
