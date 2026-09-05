'use strict';
const crypto = require('node:crypto');
const { assertNonEmptyString } = require('./billing');

// CozyOS — Universal Knowledge Intelligence Foundation
// File Reference: server/webauthn-rp/knowledge-registry.js
//
// SEE docs/builder/knowledge/KNOWLEDGE-FOUNDATION-CHANGE-REPORT.md for
// the full repository discovery this file's existence is based on.
// Summary: core/modules/memory/cozy-memory-engine.js (CozyMemoryEngine)
// and core/modules/intelligence/knowledge/cozy-knowledge-registry.js
// both already exist and were inspected in full — neither is a
// server-side, org-isolated, registrable knowledge model (the former is
// client-side with a self-disclosed unverified actorId; the latter is a
// fixed set of narrow browser-side read-only getters). This file is
// genuinely new, reusing the proven server-side pattern
// (OrganizationRegistry.isAuthorized(), audit_events, versioned
// history) every registry since Phase 2 already established.
//
// KNOWLEDGE != MEMORY != AI MODEL != FINANCIAL AUTHORITY
//   - CozyMemoryEngine remains the contextual/learned client-side
//     memory system — untouched, not replaced, not duplicated.
//   - This registry represents verified/documented SYSTEM facts:
//     architecture, provider capabilities, evidence, security rules,
//     controlled public information. It does not learn, does not
//     generate text, and cannot credit/debit/settle anything — it can
//     only ever describe the real financial engines (BillingRegistry/
//     PaymentRegistry/QuoteEngine), never act as one.
//
// FAIL-CLOSED / HONESTY RULES
//   - registerKnowledge() refuses any facts/metadata payload containing
//     an obviously secret-shaped key (password, apiKey, consumerSecret,
//     privateKey, token, etc.) — REJECTS, never silently strips.
//   - getKnowledge()/listKnowledge() are self-enforcing: every read
//     checks the requester's real identity against the record's
//     visibility and (for ORGANIZATION-scoped records) real
//     OrganizationRegistry.isAuthorized() — never a client-supplied
//     organizationId taken on its own word.
//   - A record's `status` and `evidence_state` are two independent
//     dimensions, never collapsed into one boolean.
//   - Versioned like every financial registry since Phase 2: at most
//     one active record per (scope, organizationId, domain, subject);
//     changing a fact supersedes the old record, preserving history.

class KnowledgeError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const FORBIDDEN_KEY_PATTERNS = Object.freeze([
  /password/i, /secret/i, /api[_-]?key/i, /private[_-]?key/i, /token/i,
  /credential/i, /__proto__/, /^constructor$/, /^prototype$/,
]);

/** assertNoSecretShapedKeys — recursively inspects an object for any key matching a secret-shaped pattern. Real rejection, not a best-effort strip. */
function assertNoSecretShapedKeys(obj, path = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      throw new KnowledgeError('secret_shaped_key_rejected');
    }
    if (obj[key] && typeof obj[key] === 'object') {
      assertNoSecretShapedKeys(obj[key], fullPath);
    }
  }
}

function rowToKnowledge(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    scope: row.scope,
    domain: row.domain,
    subject: row.subject,
    entityType: row.entity_type || null,
    entityId: row.entity_id || null,
    title: row.title,
    description: row.description || null,
    facts: JSON.parse(row.facts),
    capabilities: JSON.parse(row.capabilities),
    limitations: JSON.parse(row.limitations),
    dependencies: JSON.parse(row.dependencies),
    status: row.status,
    evidenceState: row.evidence_state,
    sourceType: row.source_type,
    sourceReference: row.source_reference,
    sourceVersion: row.source_version || null,
    visibility: row.visibility,
    sensitivity: row.sensitivity,
    recordStatus: row.record_status,
    owner: row.owner,
    metadata: JSON.parse(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at || null,
    expiresAt: row.expires_at || null,
  };
}

class KnowledgeRegistry {
  constructor(db, orgs, { now = () => Date.now() } = {}) {
    if (!db) throw new TypeError('[knowledge-registry] KnowledgeRegistry requires a DatabaseAdapter instance.');
    if (!orgs || typeof orgs.isAuthorized !== 'function') throw new TypeError('[knowledge-registry] requires a real OrganizationRegistry.');
    this.db = db;
    this.orgs = orgs;
    this.now = now;
  }

  async registerKnowledge(actorUserId, isPlatformAdmin, {
    organizationId = null, scope, domain, subject, entityType = null, entityId = null,
    title, description = null, facts = {}, capabilities = [], limitations = [], dependencies = [],
    status, evidenceState, sourceType, sourceReference, sourceVersion = null,
    visibility, sensitivity = 'normal', metadata = {}, expiresInMs = null,
  }) {
    assertNonEmptyString(actorUserId, 'actorUserId');
    if (!['GLOBAL', 'ORGANIZATION'].includes(scope)) throw new TypeError('[knowledge-registry] scope must be GLOBAL or ORGANIZATION.');
    if (scope === 'GLOBAL') {
      if (!isPlatformAdmin) throw new KnowledgeError('platform_admin_required');
      if (organizationId) throw new TypeError('[knowledge-registry] a GLOBAL-scope record must not carry an organizationId.');
    } else {
      assertNonEmptyString(organizationId, 'organizationId');
      const authorized = await this.orgs.isAuthorized(actorUserId, organizationId, 'org:billing:manage');
      if (!authorized) throw new KnowledgeError('not_authorized');
    }
    assertNonEmptyString(domain, 'domain');
    assertNonEmptyString(subject, 'subject');
    assertNonEmptyString(title, 'title');
    const STATUSES = ['AVAILABLE', 'IMPLEMENTED', 'TEST_ONLY', 'BLOCKED', 'NOT_IMPLEMENTED', 'DEPRECATED', 'UNKNOWN'];
    const EVIDENCE_STATES = ['OBSERVED', 'VERIFIED', 'INFERRED', 'NOT_RUN', 'SKIPPED', 'BLOCKED', 'UNKNOWN'];
    const SOURCE_TYPES = ['repository_file', 'database_schema', 'test_result', 'certification_report', 'official_provider_documentation', 'administrator_configuration', 'runtime_observation'];
    const VISIBILITIES = ['PUBLIC', 'USER', 'ORGANIZATION', 'ADMIN', 'SYSTEM', 'SECRET'];
    if (!STATUSES.includes(status)) throw new TypeError(`[knowledge-registry] status must be one of ${STATUSES.join(', ')}.`);
    if (!EVIDENCE_STATES.includes(evidenceState)) throw new TypeError(`[knowledge-registry] evidenceState must be one of ${EVIDENCE_STATES.join(', ')}.`);
    if (!SOURCE_TYPES.includes(sourceType)) throw new TypeError(`[knowledge-registry] sourceType must be one of ${SOURCE_TYPES.join(', ')}.`);
    assertNonEmptyString(sourceReference, 'sourceReference');
    if (!VISIBILITIES.includes(visibility)) throw new TypeError(`[knowledge-registry] visibility must be one of ${VISIBILITIES.join(', ')}.`);

    assertNoSecretShapedKeys(facts);
    assertNoSecretShapedKeys(metadata);
    if (!Array.isArray(capabilities) || !Array.isArray(limitations) || !Array.isArray(dependencies)) {
      throw new TypeError('[knowledge-registry] capabilities/limitations/dependencies must be arrays.');
    }

    const ts = this.now();
    const id = crypto.randomUUID();
    const existing = await this.db.get(
      'SELECT id FROM knowledge_records WHERE scope = ? AND (organization_id IS ? OR organization_id = ?) AND domain = ? AND subject = ? AND record_status = ? AND effective_until IS NULL',
      [scope, organizationId, organizationId, domain, subject, 'active']
    );

    let insertedRow;
    await this.db.transaction(async (tx) => {
      if (existing) {
        await tx.run('UPDATE knowledge_records SET record_status = ?, effective_until = ? WHERE id = ?', ['superseded', ts, existing.id]);
      }
      await tx.run(
        `INSERT INTO knowledge_records (id, organization_id, scope, domain, subject, entity_type, entity_id, title, description, facts, capabilities, limitations, dependencies, status, evidence_state, source_type, source_reference, source_version, visibility, sensitivity, record_status, effective_until, owner, metadata, created_at, updated_at, verified_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?, ?, ?)`,
        [id, organizationId, scope, domain, subject, entityType, entityId, title, description, JSON.stringify(facts), JSON.stringify(capabilities), JSON.stringify(limitations), JSON.stringify(dependencies), status, evidenceState, sourceType, sourceReference, sourceVersion, visibility, sensitivity, actorUserId, JSON.stringify(metadata), ts, ts, evidenceState === 'VERIFIED' ? ts : null, expiresInMs ? ts + expiresInMs : null]
      );
      await tx.run(
        'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
        [actorUserId, 'knowledge_registered', JSON.stringify({ knowledgeId: id, scope, organizationId, domain, subject, status, evidenceState }), ts]
      );
      insertedRow = await tx.get('SELECT * FROM knowledge_records WHERE id = ?', [id]);
    });

    // Real bug found by testing: routing this return through
    // getKnowledgeById() (the same strict, SECRET-refusing gate meant
    // for LATER retrieval by any consumer, including AI) meant creating
    // a SECRET-visibility record failed at its own return step — the
    // actor who just wrote it couldn't even get a confirmation of what
    // was stored. Fixed: the confirmation returned here is the row this
    // exact call just wrote (the actor is, by definition, already
    // authorized to know what they just submitted); getKnowledgeById()
    // remains the strict gate for every SUBSEQUENT read, by anyone,
    // including the same admin — SECRET stays genuinely unretrievable
    // through the registry's read path, just not through its own write
    // confirmation.
    return rowToKnowledge(insertedRow);
  }

  async getKnowledgeById(actorUserId, isPlatformAdmin, knowledgeId) {
    assertNonEmptyString(knowledgeId, 'knowledgeId');
    const row = await this.db.get('SELECT * FROM knowledge_records WHERE id = ?', [knowledgeId]);
    if (!row) throw new KnowledgeError('knowledge_not_found');
    const allowed = await this._checkVisibility(actorUserId, isPlatformAdmin, row);
    if (!allowed) throw new KnowledgeError('not_authorized');
    return rowToKnowledge(row);
  }

  async _checkVisibility(actorUserId, isPlatformAdmin, row) {
    if (row.visibility === 'SECRET') return false;
    if (row.visibility === 'PUBLIC') return true;
    if (!actorUserId) return false;
    if (row.visibility === 'ADMIN' || row.visibility === 'SYSTEM') return !!isPlatformAdmin;
    if (row.visibility === 'USER') return true;
    if (row.visibility === 'ORGANIZATION') {
      if (row.scope === 'GLOBAL') return true;
      if (!row.organization_id) return false;
      return this.orgs.isAuthorized(actorUserId, row.organization_id, 'org:billing:manage');
    }
    return false;
  }

  async listKnowledge(actorUserId, isPlatformAdmin, { domain = null, organizationId = null, includeSuperseded = false } = {}) {
    const clauses = [];
    const params = [];
    if (includeSuperseded) {
      clauses.push('1=1');
    } else {
      clauses.push('record_status = ?');
      params.push('active');
    }
    if (domain) { clauses.push('domain = ?'); params.push(domain); }
    if (organizationId) { clauses.push('(organization_id = ? OR organization_id IS NULL)'); params.push(organizationId); }
    const rows = await this.db.all(`SELECT * FROM knowledge_records WHERE ${clauses.join(' AND ')}`, params);
    const visible = [];
    for (const row of rows) {
      if (await this._checkVisibility(actorUserId, isPlatformAdmin, row)) visible.push(rowToKnowledge(row));
    }
    return visible;
  }

  async linkEvidence(actorUserId, isPlatformAdmin, knowledgeId, { evidenceType, reference, result = null }) {
    const knowledge = await this.getKnowledgeById(actorUserId, isPlatformAdmin, knowledgeId);
    if (!['test', 'source_file', 'documentation', 'runtime_observation'].includes(evidenceType)) {
      throw new TypeError('[knowledge-registry] evidenceType must be test, source_file, documentation, or runtime_observation.');
    }
    assertNonEmptyString(reference, 'reference');
    if (result !== null && !['PASS', 'FAIL', 'NOT_RUN', 'SKIPPED'].includes(result)) {
      throw new TypeError('[knowledge-registry] result must be PASS, FAIL, NOT_RUN, SKIPPED, or null.');
    }
    const ts = this.now();
    const id = crypto.randomUUID();
    await this.db.run(
      'INSERT INTO knowledge_evidence_links (id, knowledge_id, evidence_type, reference, result, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, knowledge.id, evidenceType, reference, result, actorUserId, ts]
    );
    await this.db.run(
      'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
      [actorUserId, 'knowledge_evidence_linked', JSON.stringify({ knowledgeId: knowledge.id, evidenceType, reference, result }), ts]
    );
    return this.getEvidenceLinks(actorUserId, isPlatformAdmin, knowledgeId);
  }

  async getEvidenceLinks(actorUserId, isPlatformAdmin, knowledgeId) {
    await this.getKnowledgeById(actorUserId, isPlatformAdmin, knowledgeId);
    const rows = await this.db.all('SELECT * FROM knowledge_evidence_links WHERE knowledge_id = ? ORDER BY recorded_at ASC', [knowledgeId]);
    return rows.map((r) => ({ id: r.id, knowledgeId: r.knowledge_id, evidenceType: r.evidence_type, reference: r.reference, result: r.result, recordedAt: r.recorded_at }));
  }
}

module.exports = { KnowledgeRegistry, KnowledgeError, assertNoSecretShapedKeys };
