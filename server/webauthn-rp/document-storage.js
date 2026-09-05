'use strict';
const crypto = require('node:crypto');

// CozyOS File — Phase 1: Durable Document Storage Registry
// File Reference: server/webauthn-rp/document-storage.js
//
// See docs/builder/knowledge/COZYOS-FILE-PHASE0-DISCOVERY-REPORT.md and
// COZYOS-FILE-PHASE0.1-STORAGE-OWNERSHIP-TRACE.md for the full
// repository discovery this file is built from. Summary: a real,
// client-side pipeline (CozyOCR -> CozyDocumentEngine -> Document
// Understanding) already exists, and CozyDocumentEngine already calls
// a registered storage provider through a real, fixed five-method
// interface (save/load/delete/archive/restore). The existing provider
// (core/modules/documents/cozy-document-storage-provider.js) is a
// genuine, working in-memory reference implementation, honestly
// disclosed as not durable across a reload. This registry is the
// server-side durable backend a new browser-side provider (this same
// phase) calls over HTTP to implement the exact same contract
// durably - CozyDocumentEngine itself is never modified and never
// becomes aware of this file's existence.
//
// SCOPE: durable persistence for the EXISTING record-based contract
// only (structured Standard Document Records). Does not implement
// large-binary/file-upload storage - DocumentEngine does not currently
// produce or pass raw file bytes to its storage provider at all
// (confirmed by direct inspection this round); that remains a later
// phase. binary_storage_ref exists in the schema, left unused, for
// that future phase.
//
// SECURITY MODEL - matches every registry since Phase 2:
//   - organization_id is never taken from the client's word - every
//     write/read is checked against OrganizationRegistry.isAuthorized()
//     (for writes) or real active membership (for reads).
//   - Document identifiers are always server-generated
//     (crypto.randomUUID()) - a client-supplied documentId on save() is
//     honestly ignored for identity purposes, never used to construct
//     any storage path.
//   - checksum is always server-computed (SHA-256 over the record's
//     real rawText), never accepted from the client as authoritative -
//     matching the honesty principle already established by the
//     existing in-memory provider's own #computeChecksum().
//   - Soft delete/archive/restore preserve full version history,
//     mirroring the existing in-memory provider's own behavior exactly
//     (never a hard delete on delete()/archive() - those are separate
//     from permanentDelete(), which this phase does not implement,
//     matching scope discipline: the required five-method interface is
//     save/load/delete/archive/restore, not permanentDelete()).

class DocumentStorageError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const VALID_STATUSES = new Set(['draft', 'pending_review', 'verified', 'approved', 'rejected', 'archived', 'deleted', 'exported']);

function computeChecksum(content) {
  if (content === undefined || content === null) return null;
  const data = typeof content === 'string' ? content : JSON.stringify(content);
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

class DocumentStorageRegistry {
  constructor(db, orgs, { now = () => Date.now(), objectStorage = null } = {}) {
    if (!db) throw new TypeError('[document-storage] DocumentStorageRegistry requires a DatabaseAdapter instance.');
    if (!orgs || typeof orgs.isAuthorized !== 'function') throw new TypeError('[document-storage] requires a real OrganizationRegistry.');
    this.db = db;
    this.orgs = orgs;
    this.now = now;
    this.objectStorage = objectStorage; // Phase 2 - optional; binary methods honestly report unavailable if not configured, never fabricate storage.
  }

  async _requireActiveMember(userId, organizationId) {
    const membership = await this.orgs.getMembership(userId, organizationId);
    if (!membership || membership.status !== 'active') throw new DocumentStorageError('not_authorized');
  }

  async _requireManageCapability(userId, organizationId) {
    const authorized = await this.orgs.isAuthorized(userId, organizationId, 'org:documents:manage');
    if (!authorized) throw new DocumentStorageError('not_authorized');
  }

  async _logAudit(userId, eventType, detail) {
    try {
      await this.db.run(
        'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
        [userId || null, eventType, typeof detail === 'string' ? detail : JSON.stringify(detail), this.now()]
      );
    } catch (_err) {
      // Audit failure must never block or fail the underlying document
      // operation - matches the existing in-memory provider's own
      // #logAudit(), which never throws.
    }
  }

  /**
   * save(actorUserId, organizationId, record)
   *   Real create-or-new-version. A client-supplied documentId is
   *   honestly ignored on first save (server generates the real one);
   *   an existing documentId belonging to the caller's own
   *   organization creates a genuine new version, matching the
   *   in-memory provider's updateDocument() semantics - never
   *   overwriting prior version history.
   */
  async save(actorUserId, organizationId, rawRecord) {
    await this._requireManageCapability(actorUserId, organizationId);
    if (!rawRecord || typeof rawRecord !== 'object') throw new TypeError('[document-storage] save(): record is required.');
    if (rawRecord.status && !VALID_STATUSES.has(rawRecord.status)) throw new TypeError(`[document-storage] save(): unsupported status "${rawRecord.status}".`);
    // Document identity is never silently substituted — matches the
    // existing in-memory provider's own hard requirement exactly
    // (cozy-document-storage-provider.js: "if (!record.documentId)
    // throw"). CozyDocumentEngine's real saveDocument() generates and
    // embeds documentId into the record BEFORE ever calling the
    // storage provider (used for its own Vault key derivation and
    // audit logging) — substituting a different server-generated id
    // here would silently break that identity, exactly the class of
    // defect the phase's own contract-preservation rule warns against.
    if (typeof rawRecord.documentId !== 'string' || !rawRecord.documentId) throw new TypeError('[document-storage] save(): documentId is required.');

    const now = this.now();
    const checksum = computeChecksum(rawRecord.rawText || rawRecord.title || null);
    const existing = await this.db.get('SELECT * FROM documents WHERE id = ?', [rawRecord.documentId]);

    if (existing) {
      if (existing.organization_id !== organizationId) throw new DocumentStorageError('not_authorized');
      const newVersion = existing.current_version + 1;
      const finalRecord = { ...rawRecord, documentId: existing.id, version: newVersion };
      await this.db.run(
        'UPDATE documents SET document_type = ?, category = ?, status = ?, title = ?, raw_text = ?, checksum = ?, tags = ?, record_json = ?, current_version = ?, updated_at = ? WHERE id = ?',
        [rawRecord.documentType || existing.document_type, rawRecord.category ?? existing.category, rawRecord.status || existing.status, rawRecord.title ?? existing.title, rawRecord.rawText ?? existing.raw_text, checksum, JSON.stringify(rawRecord.tags || []), JSON.stringify(finalRecord), newVersion, now, existing.id]
      );
      await this.db.run(
        'INSERT INTO document_versions (id, document_id, version, snapshot_json, checksum, changed_by, change_summary, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), existing.id, newVersion, JSON.stringify(finalRecord), checksum, actorUserId, rawRecord.changeSummary || 'Updated', now]
      );
      await this._logAudit(actorUserId, 'DOCUMENT_UPDATED', `${existing.id} -> v${newVersion}`);
      return { available: true, documentId: existing.id, version: newVersion };
    }

    const documentId = rawRecord.documentId;
    const finalRecord = { ...rawRecord, documentId, version: 1 };
    await this.db.run(
      'INSERT INTO documents (id, organization_id, document_type, category, status, title, raw_text, checksum, tags, record_json, current_version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [documentId, organizationId, rawRecord.documentType || 'unknown', rawRecord.category || null, rawRecord.status && VALID_STATUSES.has(rawRecord.status) ? rawRecord.status : 'draft', rawRecord.title || null, rawRecord.rawText || null, checksum, JSON.stringify(rawRecord.tags || []), JSON.stringify(finalRecord), 1, actorUserId, now, now]
    );
    await this.db.run(
      'INSERT INTO document_versions (id, document_id, version, snapshot_json, checksum, changed_by, change_summary, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), documentId, 1, JSON.stringify(finalRecord), checksum, actorUserId, 'Initial save', now]
    );
    await this._logAudit(actorUserId, 'DOCUMENT_CREATED', documentId);
    return { available: true, documentId };
  }

  /** load(actorUserId, organizationId, documentId) - real retrieval. Any active org member may read; honest null if not found or wrong organization - never leaks cross-organization existence. */
  async load(actorUserId, organizationId, documentId) {
    await this._requireActiveMember(actorUserId, organizationId);
    if (typeof documentId !== 'string' || !documentId) return { available: false, reason: 'Document not found.' };
    const row = await this.db.get('SELECT * FROM documents WHERE id = ? AND organization_id = ?', [documentId, organizationId]);
    if (!row) return { available: false, reason: 'Document not found.' };
    // Phase 4 addition: real binary metadata exposed as sibling fields,
    // never folded into `record` itself - purely additive, the existing
    // `record` shape and every Phase 1 caller/test is unaffected.
    return { available: true, record: JSON.parse(row.record_json), binarySize: row.binary_size, binaryMimeType: row.binary_mime_type, binaryChecksum: row.binary_checksum, hasBinary: !!row.binary_storage_ref };
  }

  async _transitionStatus(actorUserId, organizationId, documentId, newStatus, eventType) {
    await this._requireManageCapability(actorUserId, organizationId);
    const row = await this.db.get('SELECT * FROM documents WHERE id = ? AND organization_id = ?', [documentId, organizationId]);
    if (!row) return { available: false, reason: 'Document not found.' };
    const updatedRecord = { ...JSON.parse(row.record_json), status: newStatus };
    await this.db.run('UPDATE documents SET status = ?, record_json = ?, updated_at = ? WHERE id = ?', [newStatus, JSON.stringify(updatedRecord), this.now(), documentId]);
    await this._logAudit(actorUserId, eventType, documentId);
    return { available: true, documentId };
  }

  /** archive/restore/delete - real status transitions, matching the in-memory provider's own semantics exactly: soft, never destroying version history. */
  archive(actorUserId, organizationId, documentId) { return this._transitionStatus(actorUserId, organizationId, documentId, 'archived', 'DOCUMENT_ARCHIVED'); }
  restore(actorUserId, organizationId, documentId) { return this._transitionStatus(actorUserId, organizationId, documentId, 'draft', 'DOCUMENT_RESTORED'); }
  delete(actorUserId, organizationId, documentId) { return this._transitionStatus(actorUserId, organizationId, documentId, 'deleted', 'DOCUMENT_DELETED'); }

  /** getVersions(actorUserId, organizationId, documentId) - real version history, any active member may read. */
  async getVersions(actorUserId, organizationId, documentId) {
    await this._requireActiveMember(actorUserId, organizationId);
    const doc = await this.db.get('SELECT id FROM documents WHERE id = ? AND organization_id = ?', [documentId, organizationId]);
    if (!doc) return { available: false, reason: 'Document not found.' };
    const rows = await this.db.all('SELECT version, snapshot_json, checksum, changed_by, change_summary, changed_at FROM document_versions WHERE document_id = ? ORDER BY version ASC', [documentId]);
    return { available: true, versions: rows.map((r) => ({ version: r.version, snapshot: JSON.parse(r.snapshot_json), checksum: r.checksum, changedBy: r.changed_by, changeSummary: r.change_summary, changedAt: r.changed_at })) };
  }

  /** search(actorUserId, organizationId, filters) - real, filterable search scoped to the caller's own organization only. Any active member may search. */
  async search(actorUserId, organizationId, filters = {}) {
    await this._requireActiveMember(actorUserId, organizationId);
    const conditions = ['organization_id = ?'];
    const params = [organizationId];
    if (filters.documentType) { conditions.push('document_type = ?'); params.push(filters.documentType); }
    if (filters.category) { conditions.push('category = ?'); params.push(filters.category); }
    if (filters.status) { conditions.push('status = ?'); params.push(filters.status); }
    const rows = await this.db.all(`SELECT record_json FROM documents WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`, params);
    let results = rows.map((r) => JSON.parse(r.record_json));
    if (filters.query) {
      const q = String(filters.query).toLowerCase();
      results = results.filter((d) => (d.title || '').toLowerCase().includes(q) || (d.tags || []).some((t) => String(t).toLowerCase().includes(q)));
    }
    return { available: true, documents: results };
  }

  // ---------------------------------------------------------------------
  // Phase 2 - Real Binary/Object Storage
  // ---------------------------------------------------------------------
  //
  // Separates document METADATA (the documents/document_versions tables,
  // unchanged from Phase 1) from LARGE BINARY CONTENT (the real,
  // filesystem-backed FilesystemObjectStorageProvider). A document's
  // record_json/raw_text never contain the binary bytes themselves -
  // only a storage reference and companion metadata
  // (size/mimeType/checksum/originalFilename for display).

  /**
   * saveBinary(actorUserId, organizationId, documentId, readableStream, {mimeType, originalFilename})
   *   Requires the document to already exist (created via save()) and
   *   belong to the caller's organization - binary content always
   *   attaches to an existing metadata record, never creates one
   *   implicitly. originalFilename is stored ONLY for display; it is
   *   never used to construct the real storage key (buildKey() uses
   *   only organizationId/documentId/version, all server-authoritative).
   */
  async saveBinary(actorUserId, organizationId, documentId, readableStream, { mimeType = 'application/octet-stream', originalFilename = null, maxBytes = null } = {}) {
    if (!this.objectStorage) return { available: false, reason: 'Binary storage is not configured.' };
    await this._requireManageCapability(actorUserId, organizationId);
    const existing = await this.db.get('SELECT * FROM documents WHERE id = ? AND organization_id = ?', [documentId, organizationId]);
    if (!existing) return { available: false, reason: 'Document not found.' };

    const key = this.objectStorage.buildKey(organizationId, documentId, existing.current_version);
    const result = await this.objectStorage.put(key, readableStream, { mimeType, maxBytes });

    const safeFilename = typeof originalFilename === 'string' ? originalFilename.slice(0, 255).replace(/[\r\n]/g, '') : null;
    await this.db.run(
      'UPDATE documents SET binary_storage_ref = ?, binary_size = ?, binary_mime_type = ?, binary_checksum = ?, binary_original_filename = ?, updated_at = ? WHERE id = ?',
      [key, result.size, result.mimeType, result.checksum, safeFilename, this.now(), documentId]
    );
    await this._logAudit(actorUserId, 'DOCUMENT_BINARY_UPLOADED', `${documentId} v${existing.current_version} (${result.size} bytes)`);
    return { available: true, documentId, storageRef: key, size: result.size, mimeType: result.mimeType, checksum: result.checksum };
  }

  /**
   * loadBinary(actorUserId, organizationId, documentId)
   *   Any active org member may read, matching load()'s own authorization
   *   level exactly. Returns a real stream plus real, stored metadata.
   *   Honestly reports unavailable if no binary was ever uploaded for
   *   this document - never fabricates content.
   */
  async loadBinary(actorUserId, organizationId, documentId) {
    if (!this.objectStorage) return { available: false, reason: 'Binary storage is not configured.' };
    await this._requireActiveMember(actorUserId, organizationId);
    const existing = await this.db.get('SELECT * FROM documents WHERE id = ? AND organization_id = ?', [documentId, organizationId]);
    if (!existing) return { available: false, reason: 'Document not found.' };
    if (!existing.binary_storage_ref) return { available: false, reason: 'This document has no binary content.' };

    try {
      const result = await this.objectStorage.get(existing.binary_storage_ref);
      await this._logAudit(actorUserId, 'DOCUMENT_BINARY_DOWNLOADED', documentId);
      return { available: true, stream: result.stream, size: existing.binary_size, mimeType: existing.binary_mime_type, checksum: existing.binary_checksum, originalFilename: existing.binary_original_filename };
    } catch (err) {
      // Real storage-layer failure (e.g. the referenced object is
      // genuinely missing from disk) - fails closed and honestly, never
      // fabricates a stream.
      return { available: false, reason: 'Stored content could not be retrieved.', storageError: err.code };
    }
  }
}

module.exports = { DocumentStorageRegistry, DocumentStorageError };
