-- CozyOS File Phase 3 - File/Folder Organization
--
-- REPOSITORY DISCOVERY THIS ROUND: exactly one existing folder-shaped
-- implementation was found repository-wide
-- (core/modules/storage/cozy-storage.js) - a real, working, but
-- in-memory-only, browser-side folder Map with createFolder/
-- renameFolder/moveFolder and basic self-parenting rejection. This was
-- already established in Phase 0.1 as an unused/planned coordinator
-- (zero registered adapters, only three defensive external callers,
-- confirmed unchanged since). It is not server-authoritative, has no
-- organization isolation concept, has no real durability, and its
-- cycle prevention only rejects direct self-parenting (not moving a
-- folder into one of its own descendants). This does not satisfy the
-- "real persistent organization" and "server authority" requirements,
-- so this migration introduces the genuinely missing server-side,
-- durable folder layer - it does not duplicate cozy-storage.js, which
-- remains completely untouched.
--
-- CORRECTION TO THE TASK'S OWN STATED PREMISE: the task instructs
-- "Do not invent organizationId if the document architecture uses
-- companyId... The existing Phase 1 schema established: companyId."
-- Direct inspection of the actual, real Phase 1 schema
-- (013_document_storage.sql) shows this is not accurate: the real,
-- authoritative database column is organization_id (matching every
-- other registry since Phase 2: organizations, billing, payments,
-- knowledge_records). companyId is only the field name used inside
-- CozyDocumentEngine's own client-side record (record_json content) -
-- a different, unrelated layer. This migration follows the real,
-- verified database convention (organization_id), not the task's
-- mistaken premise about it, per the task's own instruction to
-- "inspect existing conventions" rather than assume.
--
-- DESIGN DECISIONS made this round, documented as instructed since no
-- existing repository convention decided them:
--   1. Document-to-folder relationship: ONE parent folder per document
--      (documents.folder_id, nullable - NULL means not yet organized).
--      No existing evidence was found either way; a single-parent model
--      is the simpler, more conservative choice and matches how every
--      other hierarchical relationship in this schema (parent_folder_id
--      itself) already works. A future phase could introduce a
--      document-folder join table if multi-folder membership is
--      genuinely required later, without needing to redesign this.
--   2. Duplicate sibling name policy: DISALLOWED among ACTIVE folders
--      with the same normalized name under the same parent, within the
--      same organization. No existing repository convention was found;
--      this matches common, conservative file-system-like expectations
--      and is enforced by a real partial unique index, not just
--      application-level validation.
--   3. Root folder: exactly one per organization, immutable (its own
--      code-level guards, enforced in folder-registry.js, reject
--      rename/move/archive/delete on any row where is_root = 1).

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  parent_folder_id TEXT REFERENCES folders(id),
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  is_root INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_folders_org ON folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_folder_id);

-- Exactly one root folder per organization.
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_one_root_per_org ON folders(organization_id) WHERE is_root = 1;

-- No two ACTIVE sibling folders (same organization, same parent) may
-- share a normalized name. Archived/deleted folders are exempt,
-- matching the documented design decision above.
CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_unique_sibling_name ON folders(organization_id, parent_folder_id, normalized_name) WHERE status = 'active';

-- Document-to-folder relationship: single nullable parent, per the
-- documented design decision above. Reuses the existing, unmodified
-- documents table from Phase 1/2 - no new document table, no
-- duplicated document identity.
ALTER TABLE documents ADD COLUMN folder_id TEXT REFERENCES folders(id);
CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder_id);
