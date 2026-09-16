-- CozyOS File Phase 5 — Personal Document Ownership
--
-- REPOSITORY DISCOVERY (this round, "Document Ownership Foundation"):
-- documents.organization_id was NOT NULL (013_document_storage.sql).
-- Every real document query/write (server/webauthn-rp/document-
-- storage.js) is organization-scoped via OrganizationRegistry
-- membership/authorization checks. Personal (non-organization) users
-- are a real, first-class identity concept at the auth layer (users,
-- sessions, credentials tables are all user_id-scoped with no
-- organization requirement), but had no document-ownership path at
-- all — not merely "supported but awkward," genuinely absent from the
-- schema. Traced org membership (organization_memberships), the
-- documents/document_versions tables, and every route/query before
-- writing this migration — see DocumentStorageRegistry's own new
-- Personal* methods for the additive (never replacing) implementation
-- this migration enables. A real precedent for a NULLABLE
-- organization_id column already exists in this same schema
-- (crypto_destinations.organization_id, 010_crypto_payments.sql) —
-- this migration follows that same real, established pattern rather
-- than inventing a new one.
--
-- DESIGN: organization_id becomes nullable; a new user_id column is
-- added as the personal-document owner. Exactly one of the two must be
-- set per row (CHECK constraint) — a document is either organization-
-- owned (existing behavior, completely unchanged) or personally
-- owned by exactly one real user, never both, never neither, and
-- never a fabricated "personal organization."
--
-- SQLite has no ALTER COLUMN to drop a NOT NULL constraint, so this is
-- a real table rebuild (create new table, copy every existing row
-- unchanged with user_id NULL, drop old table, rename) — not a
-- destructive migration; every existing organization document's data
-- is preserved exactly, including current_version, all foreign keys,
-- and every index. document_versions is untouched entirely (it was
-- never organization-scoped in the first place — only document_id).

CREATE TABLE IF NOT EXISTS documents_new (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  user_id TEXT REFERENCES users(id),
  document_type TEXT NOT NULL DEFAULT 'unknown',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'verified', 'approved', 'rejected', 'archived', 'deleted', 'exported')),
  title TEXT,
  raw_text TEXT,
  checksum TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  record_json TEXT NOT NULL,
  binary_storage_ref TEXT,
  binary_size BIGINT,
  binary_mime_type TEXT,
  binary_checksum TEXT,
  binary_original_filename TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  CHECK ((organization_id IS NOT NULL AND user_id IS NULL) OR (organization_id IS NULL AND user_id IS NOT NULL))
);

INSERT INTO documents_new SELECT
  id, organization_id, NULL, document_type, category, status, title, raw_text, checksum, tags, record_json,
  binary_storage_ref, binary_size, binary_mime_type, binary_checksum, binary_original_filename,
  current_version, created_by, created_at, updated_at
FROM documents;

DROP TABLE documents;
ALTER TABLE documents_new RENAME TO documents;

CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_org_status ON documents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_org_type ON documents(organization_id, document_type);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_status ON documents(user_id, status);
