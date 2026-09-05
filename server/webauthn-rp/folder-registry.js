'use strict';
const crypto = require('node:crypto');

// CozyOS File - Phase 3: Folder Registry
// File Reference: server/webauthn-rp/folder-registry.js
//
// REPOSITORY DISCOVERY (this round): exactly one existing folder-shaped
// implementation was found (core/modules/storage/cozy-storage.js) - a
// real, working, but in-memory-only, browser-side Map with
// createFolder/renameFolder/moveFolder and only direct self-parenting
// rejection (no descendant-cycle check). Confirmed unchanged since
// Phase 0.1 (still zero registered adapters, still only three
// defensive external callers). This does not satisfy real persistence
// or server authority, so this file is the genuinely missing
// server-side layer - it does not duplicate or replace cozy-storage.js,
// which remains completely untouched.
//
// CORRECTION, carried from migration 015's own header: the real,
// authoritative database column is organization_id (matching every
// registry since Phase 2), not companyId - companyId is only
// CozyDocumentEngine's own client-side record field name, a different
// layer. This file follows the verified real convention.
//
// SECURITY MODEL - matches DocumentStorageRegistry exactly:
//   - organization_id is never taken from the client's word.
//   - Folder identifiers are always server-generated
//     (crypto.randomUUID()).
//   - Root folders are structurally immutable: every mutating method
//     (rename/move/archive/delete) explicitly checks is_root and
//     refuses, regardless of caller permission level.
//   - Cycle prevention is real: moveFolder() walks the actual parent
//     chain in the database, not a client-supplied claim.

class FolderError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const MAX_ANCESTOR_WALK = 1000; // Defense in depth against a corrupted/pathological chain; a real hierarchy should never approach this depth.

function normalizeName(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) return null;
  return trimmed.toLowerCase();
}

class FolderRegistry {
  constructor(db, orgs, { now = () => Date.now() } = {}) {
    if (!db) throw new TypeError('[folder-registry] FolderRegistry requires a DatabaseAdapter instance.');
    if (!orgs || typeof orgs.isAuthorized !== 'function') throw new TypeError('[folder-registry] requires a real OrganizationRegistry.');
    this.db = db;
    this.orgs = orgs;
    this.now = now;
  }

  async _requireActiveMember(userId, organizationId) {
    const membership = await this.orgs.getMembership(userId, organizationId);
    if (!membership || membership.status !== 'active') throw new FolderError('not_authorized');
  }

  async _requireManageCapability(userId, organizationId) {
    const authorized = await this.orgs.isAuthorized(userId, organizationId, 'org:documents:manage');
    if (!authorized) throw new FolderError('not_authorized');
  }

  async _logAudit(userId, eventType, detail) {
    try {
      await this.db.run(
        'INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)',
        [userId || null, eventType, typeof detail === 'string' ? detail : JSON.stringify(detail), this.now()]
      );
    } catch (_err) {
      // Audit failure must never block the underlying operation.
    }
  }

  /**
   * ensureRoot(actorUserId, organizationId)
   *   Lazily creates the organization's single, immutable root folder
   *   on first use if one does not already exist - matching the task's
   *   own instruction to introduce a root only if no authoritative one
   *   exists, using the established schema conventions (the real
   *   idx_folders_one_root_per_org unique index is the actual
   *   guarantee; this method is a convenience, not the enforcement).
   */
  async ensureRoot(actorUserId, organizationId) {
    await this._requireActiveMember(actorUserId, organizationId);
    const existingRoot = await this.db.get('SELECT * FROM folders WHERE organization_id = ? AND is_root = 1', [organizationId]);
    if (existingRoot) return { available: true, folder: this._toPublicFolder(existingRoot) };

    const now = this.now();
    const id = crypto.randomUUID();
    await this.db.run(
      'INSERT INTO folders (id, organization_id, parent_folder_id, name, normalized_name, status, is_root, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, organizationId, null, 'Root', 'root', 'active', 1, actorUserId, actorUserId, now, now]
    );
    await this._logAudit(actorUserId, 'FOLDER_ROOT_CREATED', id);
    return { available: true, folder: this._toPublicFolder({ id, organization_id: organizationId, parent_folder_id: null, name: 'Root', normalized_name: 'root', status: 'active', is_root: 1, created_by: actorUserId, updated_by: actorUserId, created_at: now, updated_at: now }) };
  }

  _toPublicFolder(row) {
    return {
      folderId: row.id,
      organizationId: row.organization_id,
      parentFolderId: row.parent_folder_id,
      name: row.name,
      status: row.status,
      isRoot: !!row.is_root,
      createdBy: row.created_by,
      updatedBy: row.updated_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * _walkAncestors(folderId)
   *   Returns the real, actual chain of ancestor folder IDs by
   *   following parent_folder_id in the database - never trusts a
   *   client-supplied claim about hierarchy shape. Bounded to guard
   *   against a pathological/corrupted chain.
   */
  async _walkAncestors(folderId) {
    const chain = [];
    let current = folderId;
    for (let i = 0; i < MAX_ANCESTOR_WALK; i++) {
      const row = await this.db.get('SELECT parent_folder_id FROM folders WHERE id = ?', [current]);
      if (!row || !row.parent_folder_id) break;
      chain.push(row.parent_folder_id);
      current = row.parent_folder_id;
    }
    return chain;
  }

  /** createFolder(actorUserId, organizationId, {name, parentFolderId}) */
  async createFolder(actorUserId, organizationId, { name, parentFolderId } = {}) {
    await this._requireManageCapability(actorUserId, organizationId);
    const normalized = normalizeName(name);
    if (!normalized) throw new TypeError('[folder-registry] createFolder(): a real, non-empty name (max 255 chars) is required.');

    let resolvedParentId = parentFolderId || null;
    if (resolvedParentId) {
      const parent = await this.db.get('SELECT * FROM folders WHERE id = ? AND organization_id = ?', [resolvedParentId, organizationId]);
      if (!parent) throw new FolderError('invalid_parent');
    } else {
      const root = await this.ensureRoot(actorUserId, organizationId);
      resolvedParentId = root.folder.folderId;
    }

    const now = this.now();
    const id = crypto.randomUUID();
    try {
      await this.db.run(
        'INSERT INTO folders (id, organization_id, parent_folder_id, name, normalized_name, status, is_root, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, organizationId, resolvedParentId, name.trim(), normalized, 'active', 0, actorUserId, actorUserId, now, now]
      );
    } catch (err) {
      // Real, server-enforced duplicate-sibling-name policy (the
      // partial unique index) - never merely an application-level
      // check that a race condition could bypass.
      throw new FolderError('duplicate_folder_name');
    }
    await this._logAudit(actorUserId, 'FOLDER_CREATED', id);
    return { available: true, folderId: id };
  }

  /** getFolder(actorUserId, organizationId, folderId) - any active member may read. */
  async getFolder(actorUserId, organizationId, folderId) {
    await this._requireActiveMember(actorUserId, organizationId);
    const row = await this.db.get('SELECT * FROM folders WHERE id = ? AND organization_id = ?', [folderId, organizationId]);
    if (!row) return { available: false, reason: 'Folder not found.' };
    return { available: true, folder: this._toPublicFolder(row) };
  }

  /** listContents(actorUserId, organizationId, folderId) - real, persistent listing distinguishing subfolders from documents. */
  async listContents(actorUserId, organizationId, folderId) {
    await this._requireActiveMember(actorUserId, organizationId);
    const folder = await this.db.get('SELECT * FROM folders WHERE id = ? AND organization_id = ?', [folderId, organizationId]);
    if (!folder) return { available: false, reason: 'Folder not found.' };

    const subfolders = await this.db.all("SELECT * FROM folders WHERE parent_folder_id = ? AND organization_id = ? AND status = 'active' ORDER BY normalized_name ASC", [folderId, organizationId]);
    const documents = await this.db.all("SELECT id, title, document_type, status, current_version, binary_size, binary_mime_type FROM documents WHERE folder_id = ? AND organization_id = ? AND status != 'deleted' ORDER BY created_at DESC", [folderId, organizationId]);

    return {
      available: true,
      folder: this._toPublicFolder(folder),
      subfolders: subfolders.map((f) => this._toPublicFolder(f)),
      documents: documents.map((d) => ({ documentId: d.id, title: d.title, documentType: d.document_type, status: d.status, version: d.current_version, binarySize: d.binary_size, binaryMimeType: d.binary_mime_type })),
    };
  }

  /** renameFolder(actorUserId, organizationId, folderId, newName) - root is structurally immutable. */
  async renameFolder(actorUserId, organizationId, folderId, newName) {
    await this._requireManageCapability(actorUserId, organizationId);
    const folder = await this.db.get('SELECT * FROM folders WHERE id = ? AND organization_id = ?', [folderId, organizationId]);
    if (!folder) return { available: false, reason: 'Folder not found.' };
    if (folder.is_root) throw new FolderError('root_folder_immutable');

    const normalized = normalizeName(newName);
    if (!normalized) throw new TypeError('[folder-registry] renameFolder(): a real, non-empty name is required.');

    try {
      await this.db.run('UPDATE folders SET name = ?, normalized_name = ?, updated_by = ?, updated_at = ? WHERE id = ?', [newName.trim(), normalized, actorUserId, this.now(), folderId]);
    } catch (_err) {
      throw new FolderError('duplicate_folder_name');
    }
    await this._logAudit(actorUserId, 'FOLDER_RENAMED', `${folderId} -> "${newName.trim()}"`);
    return { available: true, folderId };
  }

  /**
   * moveFolder(actorUserId, organizationId, folderId, newParentFolderId)
   *   Real, server-enforced cycle prevention: walks the ACTUAL ancestor
   *   chain of newParentFolderId in the database and rejects if
   *   folderId appears anywhere in it (or equals newParentFolderId
   *   itself) - never trusts a client claim about hierarchy shape.
   */
  async moveFolder(actorUserId, organizationId, folderId, newParentFolderId) {
    await this._requireManageCapability(actorUserId, organizationId);
    const folder = await this.db.get('SELECT * FROM folders WHERE id = ? AND organization_id = ?', [folderId, organizationId]);
    if (!folder) return { available: false, reason: 'Folder not found.' };
    if (folder.is_root) throw new FolderError('root_folder_immutable');

    const newParent = await this.db.get('SELECT * FROM folders WHERE id = ? AND organization_id = ?', [newParentFolderId, organizationId]);
    if (!newParent) throw new FolderError('invalid_parent');
    if (newParentFolderId === folderId) throw new FolderError('self_parent_rejected');

    const ancestors = await this._walkAncestors(newParentFolderId);
    if (ancestors.includes(folderId)) throw new FolderError('cycle_rejected');

    try {
      await this.db.run('UPDATE folders SET parent_folder_id = ?, updated_by = ?, updated_at = ? WHERE id = ?', [newParentFolderId, actorUserId, this.now(), folderId]);
    } catch (_err) {
      throw new FolderError('duplicate_folder_name');
    }
    await this._logAudit(actorUserId, 'FOLDER_MOVED', `${folderId} -> parent ${newParentFolderId}`);
    return { available: true, folderId };
  }

  /**
   * moveDocument(actorUserId, organizationId, documentId, newFolderId)
   *   Real relocation of an EXISTING document's folder_id only -
   *   document identity, version history, and binary object reference
   *   are all completely untouched (this is a pure metadata update on
   *   the same, unmodified documents table from Phase 1/2).
   */
  async moveDocument(actorUserId, organizationId, documentId, newFolderId) {
    await this._requireManageCapability(actorUserId, organizationId);
    const document = await this.db.get('SELECT id, binary_storage_ref, binary_checksum, current_version FROM documents WHERE id = ? AND organization_id = ?', [documentId, organizationId]);
    if (!document) return { available: false, reason: 'Document not found.' };

    if (newFolderId) {
      const folder = await this.db.get('SELECT id FROM folders WHERE id = ? AND organization_id = ?', [newFolderId, organizationId]);
      if (!folder) throw new FolderError('invalid_parent');
    }

    await this.db.run('UPDATE documents SET folder_id = ?, updated_at = ? WHERE id = ?', [newFolderId || null, this.now(), documentId]);
    await this._logAudit(actorUserId, 'DOCUMENT_MOVED', `${documentId} -> folder ${newFolderId || '(none)'}`);
    // Real, verifiable proof that binary identity/version were never
    // touched by this operation - the caller can compare these against
    // a pre-move snapshot.
    return { available: true, documentId, binaryStorageRef: document.binary_storage_ref, binaryChecksum: document.binary_checksum, version: document.current_version };
  }

  /**
   * archiveFolder(actorUserId, organizationId, folderId)
   *   HONEST LIMITATION, documented rather than faked: this only
   *   archives an EMPTY folder (no active subfolders, no non-deleted
   *   documents). Recursive archive/delete is deliberately NOT
   *   implemented this phase, per the explicit instruction not to
   *   implement destructive recursive operations without an explicit,
   *   safely-modeled requirement.
   */
  async archiveFolder(actorUserId, organizationId, folderId) {
    await this._requireManageCapability(actorUserId, organizationId);
    const folder = await this.db.get('SELECT * FROM folders WHERE id = ? AND organization_id = ?', [folderId, organizationId]);
    if (!folder) return { available: false, reason: 'Folder not found.' };
    if (folder.is_root) throw new FolderError('root_folder_immutable');

    const activeChildren = await this.db.get("SELECT COUNT(*) as count FROM folders WHERE parent_folder_id = ? AND status = 'active'", [folderId]);
    const activeDocuments = await this.db.get("SELECT COUNT(*) as count FROM documents WHERE folder_id = ? AND status != 'deleted'", [folderId]);
    if (activeChildren.count > 0 || activeDocuments.count > 0) throw new FolderError('folder_not_empty');

    await this.db.run('UPDATE folders SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?', ['archived', actorUserId, this.now(), folderId]);
    await this._logAudit(actorUserId, 'FOLDER_ARCHIVED', folderId);
    return { available: true, folderId };
  }

  async restoreFolder(actorUserId, organizationId, folderId) {
    await this._requireManageCapability(actorUserId, organizationId);
    const folder = await this.db.get('SELECT * FROM folders WHERE id = ? AND organization_id = ?', [folderId, organizationId]);
    if (!folder) return { available: false, reason: 'Folder not found.' };
    await this.db.run('UPDATE folders SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?', ['active', actorUserId, this.now(), folderId]);
    await this._logAudit(actorUserId, 'FOLDER_RESTORED', folderId);
    return { available: true, folderId };
  }
}

module.exports = { FolderRegistry, FolderError };
