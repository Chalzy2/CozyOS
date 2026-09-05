-- CozyOS Universal Knowledge Intelligence Foundation.
--
-- REPOSITORY DISCOVERY, this round (full accounting in the change
-- report): core/modules/memory/cozy-memory-engine.js ("CozyMemoryEngine")
-- already exists — real namespaced CRUD, version history, a visibility
-- check — but is CLIENT-SIDE and its own header honestly discloses "the
-- caller's actorId is taken on its word." core/modules/intelligence/
-- knowledge/cozy-knowledge-registry.js already exists — real, honest
-- evidence labeling, but a fixed, narrow set of read-only browser-side
-- getters with no organization-scoping and no registration API.
-- core/modules/builder/evidence-engine.js already exists — reads
-- docs/builder/knowledge/*.md heading counts via browser fetch() for
-- one narrow question. None can serve as a server-side, org-isolated,
-- registrable knowledge foundation — confirmed by evidence, not
-- assumed. This schema reuses the proven server-side pattern
-- (OrganizationRegistry.isAuthorized(), audit_events, versioned
-- history) already established since Phase 2, rather than a different
-- trust model.
--
-- Deliberately TWO tables, not three: no separate "relationships" table
-- this round — a record's dependencies/facts JSON already expresses
-- what's actually been needed so far.

CREATE TABLE IF NOT EXISTS knowledge_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id),
  scope TEXT NOT NULL CHECK (scope IN ('GLOBAL', 'ORGANIZATION')),
  domain TEXT NOT NULL,
  subject TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  facts TEXT NOT NULL DEFAULT '{}',
  capabilities TEXT NOT NULL DEFAULT '[]',
  limitations TEXT NOT NULL DEFAULT '[]',
  dependencies TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('AVAILABLE', 'IMPLEMENTED', 'TEST_ONLY', 'BLOCKED', 'NOT_IMPLEMENTED', 'DEPRECATED', 'UNKNOWN')),
  evidence_state TEXT NOT NULL CHECK (evidence_state IN ('OBSERVED', 'VERIFIED', 'INFERRED', 'NOT_RUN', 'SKIPPED', 'BLOCKED', 'UNKNOWN')),
  source_type TEXT NOT NULL CHECK (source_type IN ('repository_file', 'database_schema', 'test_result', 'certification_report', 'official_provider_documentation', 'administrator_configuration', 'runtime_observation')),
  source_reference TEXT NOT NULL,
  source_version TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('PUBLIC', 'USER', 'ORGANIZATION', 'ADMIN', 'SYSTEM', 'SECRET')),
  sensitivity TEXT NOT NULL DEFAULT 'normal' CHECK (sensitivity IN ('normal', 'sensitive')),
  record_status TEXT NOT NULL DEFAULT 'active' CHECK (record_status IN ('active', 'superseded')),
  effective_until BIGINT,
  owner TEXT NOT NULL REFERENCES users(id),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  verified_at BIGINT,
  expires_at BIGINT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_records_current
  ON knowledge_records(scope, organization_id, domain, subject)
  WHERE record_status = 'active' AND effective_until IS NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_records_org ON knowledge_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_records_domain ON knowledge_records(domain);

CREATE TABLE IF NOT EXISTS knowledge_evidence_links (
  id TEXT PRIMARY KEY,
  knowledge_id TEXT NOT NULL REFERENCES knowledge_records(id),
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('test', 'source_file', 'documentation', 'runtime_observation')),
  reference TEXT NOT NULL,
  result TEXT CHECK (result IN ('PASS', 'FAIL', 'NOT_RUN', 'SKIPPED')),
  recorded_by TEXT NOT NULL REFERENCES users(id),
  recorded_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_evidence_links_knowledge ON knowledge_evidence_links(knowledge_id);
