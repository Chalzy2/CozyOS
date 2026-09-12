-- CozyOS File - Phase 1: Durable Document Storage
--
-- REPOSITORY DISCOVERY, this round (full accounting in
-- docs/builder/knowledge/COZYOS-FILE-PHASE0-DISCOVERY-REPORT.md and
-- COZYOS-FILE-PHASE0.1-STORAGE-OWNERSHIP-TRACE.md): a real, existing
-- client-side pipeline (CozyOCR -> CozyDocumentEngine -> Document
-- Understanding) already produces Standard Document Records, and
-- CozyDocumentEngine already calls a registered storage provider
-- (core/modules/documents/cozy-document-storage-provider.js) through a
-- real, fixed five-method interface (save/load/delete/archive/restore).
-- That provider is a genuine, working reference implementation, but is
-- explicitly, honestly in-memory only - not durable across a reload.
-- Two candidate storage coordinators (core/storage.js,
-- core/modules/storage/cozy-storage.js) were traced and found to be
-- browser-only and, in cozy-storage.js's case, unused (zero registered
-- adapters anywhere) - neither is a server-side, organization-scoped,
-- durable metadata store. This schema reuses the exact proven
-- server-side pattern (OrganizationRegistry.isAuthorized(),
-- audit_events, versioned history) every registry since Phase 2 has
-- used, rather than inventing a different trust model.
--
-- SCOPE OF THIS MIGRATION: durable persistence for the EXISTING
-- record-based contract only (structured Standard Document Records -
-- title/rawText/tags/metadata), matching what CozyDocumentEngine
-- already produces and passes to save(). This does NOT implement a new
-- large-binary/file-upload capability - DocumentEngine does not
-- currently produce or pass raw file bytes to its storage provider at
-- all (confirmed by direct inspection of cozy-document-engine.js and
-- cozy-document-storage-provider.js this round); that is explicitly a
-- later phase (master prompt Phase 4: Upload/download/streaming).
-- record_json is the source of truth for the full, arbitrary-shaped
-- record; the extracted columns below exist purely for real, indexed
-- filtering/search performance, mirroring the pattern already used by
-- knowledge_records (facts/metadata JSON alongside real indexed
-- columns).
--
-- binary_storage_ref is included now, left NULL/unused, specifically so
-- a future phase can add real binary-object storage (once an object-
-- storage backend actually exists - confirmed ABSENT in Phase 0.1)
-- without a further schema migration for that column - this satisfies
-- the master prompt's own instruction to separate document metadata
-- from large binary content architecturally, without fabricating binary
-- storage that does not yet exist.
--
-- Field naming: companyId (not organizationId) is used throughout to
-- match CozyDocumentEngine's own existing record field exactly
-- (confirmed by direct inspection this round) - organization_id below
-- is the real, server-authoritative isolation column and is the
-- correct server-side name for the same real-world organization concept
-- DocumentEngine's own client-side records call companyId.

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  document_type TEXT NOT NULL DEFAULT 'unknown',
  category TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'verified', 'approved', 'rejected', 'archived', 'deleted', 'exported')),
  title TEXT,
  raw_text TEXT,
  checksum TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  record_json TEXT NOT NULL,
  binary_storage_ref TEXT,
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT REFERENCES users(id),
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_org ON documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_documents_org_status ON documents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_documents_org_type ON documents(organization_id, document_type);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  checksum TEXT,
  changed_by TEXT REFERENCES users(id),
  change_summary TEXT,
  changed_at BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_versions_unique ON document_versions(document_id, version);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id);
