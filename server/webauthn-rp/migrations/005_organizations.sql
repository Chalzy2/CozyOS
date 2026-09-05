-- Faithful translation of migrateAddOrganizations() in server/webauthn-rp/db.js.
-- Mirrors the existing client-side core/organization/organization-membership.js
-- data shape (memberKey = organizationId+userId, one row per pair reused
-- across status transitions, roles/applications/permissions as arrays) —
-- this is a faithful, verifiable backing for what the browser already
-- displays, not a second, divergent authority. Do not redesign this
-- shape during migration.

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,
  roles TEXT NOT NULL DEFAULT '[]',
  applications TEXT NOT NULL DEFAULT '[]',
  permissions TEXT NOT NULL DEFAULT '[]',
  invited_by TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  responded_at BIGINT,
  expires_at BIGINT
);

-- One real membership row per (organization, user) pair, reused across
-- status transitions — matches the client's memberKey() precedent.
-- Prevents a duplicate "invited" row from ever being created for a user
-- who already has a non-terminal membership in that organization.
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_membership_pair
  ON organization_memberships(organization_id, user_id);
