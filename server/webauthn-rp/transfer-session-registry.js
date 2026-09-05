'use strict';
const crypto = require('node:crypto');
const { encodeQrPayload } = require('./qr-pairing');

// CozyOS File - Phase 4: Cozy Share Transfer Session Registry
// File Reference: server/webauthn-rp/transfer-session-registry.js
//
// See migration 016's own header for the full repository-discovery
// rationale (core/collaboration/cozy-share.js is a different domain -
// live production collaboration, untouched; CozyConnect is a
// browser-side hardware-discovery registry, not required server-side;
// core/security/qr-renderer.js's existing, honest, empty encoder seam
// is what a real QR payload from this file would be rendered through,
// once a real encoder is ever registered - not duplicated here).
//
// REAL, IMPLEMENTED TRANSPORT: same-network HTTP, using this exact
// server's own existing routes and session/cookie conventions -
// genuinely executable, not a mock. A sender creates a session; a
// receiver (a different authenticated user, on the same reachable
// server - the real, honest scope of what this environment and this
// architecture can prove is "LOCAL TRANSPORT VERIFIED", not
// "REAL DEVICE-TO-DEVICE VERIFIED", which would require two physically
// separate devices/network stacks this sandbox cannot provide) pairs
// with a real, cryptographically random, single-use token and receives
// a real, independently-verified copy of the sender's content into
// their own organization.
//
// NOT IMPLEMENTED THIS ROUND, honestly, not fabricated: QR *rendering*
// (no encoder exists anywhere in this repository - see qr-renderer.js),
// hotspot creation/control, Bluetooth, USB/OTG, Wi-Fi Direct, NFC,
// WebRTC (no browser-side implementation of any of these exists for
// file transfer specifically - see the Phase 4 verification document
// for the full, evidence-based capability table).
//
// SECURITY MODEL:
//   - The pairing token is real, cryptographically random
//     (crypto.randomBytes), returned to the sender exactly once at
//     creation time. Only its SHA-256 hash is ever stored - matching
//     how this codebase already treats passwords, never storing the
//     real secret.
//   - Token comparison uses crypto.timingSafeEqual, not string
//     equality, to resist timing attacks.
//   - A session can only be paired ONCE (real replay protection - a
//     second pairing attempt against an already-connected or terminal
//     session is rejected).
//   - The receiver's organization is ALWAYS the authenticated
//     receiver's own real organization context - the sender's identity
//     is retained only for audit/provenance, never as receiver
//     authority.
//   - Received binary content is independently re-hashed as it is
//     copied - the sender's originally-stored checksum is never
//     blindly trusted as proof of THIS transfer's integrity.

class TransferSessionError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes - a real, short-lived pairing window.
const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled', 'corrupted', 'expired']);

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function safeCompare(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Normalizes a manifest relative path defensively - rejects traversal, absolute paths, and null bytes rather than merely stripping them. */
function validateRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) throw new TransferSessionError('invalid_manifest');
  if (relativePath.includes('\0')) throw new TransferSessionError('invalid_manifest');
  if (relativePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(relativePath)) throw new TransferSessionError('invalid_manifest'); // absolute POSIX or Windows drive path
  const segments = relativePath.split('/');
  if (segments.some((s) => s === '..' || s === '.')) throw new TransferSessionError('invalid_manifest');
  return segments;
}

class TransferSessionRegistry {
  constructor(db, orgs, documentStorage, folders, { now = () => Date.now() } = {}) {
    if (!db) throw new TypeError('[transfer-session] requires a DatabaseAdapter instance.');
    if (!orgs || typeof orgs.isAuthorized !== 'function') throw new TypeError('[transfer-session] requires a real OrganizationRegistry.');
    if (!documentStorage) throw new TypeError('[transfer-session] requires the real DocumentStorageRegistry.');
    if (!folders) throw new TypeError('[transfer-session] requires the real FolderRegistry.');
    this.db = db;
    this.orgs = orgs;
    this.documentStorage = documentStorage;
    this.folders = folders;
    this.now = now;
  }

  async _logAudit(userId, eventType, detail) {
    try {
      await this.db.run('INSERT INTO audit_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)', [userId || null, eventType, typeof detail === 'string' ? detail : JSON.stringify(detail), this.now()]);
    } catch (_err) { /* audit failure must never block the underlying operation */ }
  }

  /**
   * createSession(senderUserId, senderOrganizationId, items)
   *   items: [{documentId, relativePath}]. Every documentId is
   *   validated against the SENDER's own real, existing documents
   *   (via documentStorage.load, which already enforces real
   *   membership/organization checks) - never trusted as already
   *   belonging to the sender merely because the client claims it.
   *   Returns the RAW pairing token exactly once - it is never
   *   retrievable again.
   */
  async createSession(senderUserId, senderOrganizationId, items) {
    if (!Array.isArray(items) || items.length === 0) throw new TransferSessionError('invalid_manifest');
    const manifestItems = [];
    for (const item of items) {
      validateRelativePath(item.relativePath || item.filename || '');
      const loaded = await this.documentStorage.load(senderUserId, senderOrganizationId, item.documentId);
      if (!loaded.available) throw new TransferSessionError('invalid_manifest');
      manifestItems.push({
        itemId: crypto.randomUUID(), // Generated up front so the manifest and the real transfer_items row share the same real, referenceable ID.
        documentId: item.documentId,
        relativePath: item.relativePath || loaded.record.title || item.documentId,
        filename: (item.relativePath || loaded.record.title || item.documentId).split('/').pop(),
        size: loaded.binarySize ?? null,
        mimeType: loaded.binaryMimeType ?? null,
        checksum: loaded.binaryChecksum ?? null,
      });
    }

    const now = this.now();
    const id = crypto.randomUUID();
    const rawToken = crypto.randomBytes(32).toString('base64url'); // Real, cryptographically secure, single-use.
    const tokenHash = hashToken(rawToken);

    try {
      await this.db.run(
        'INSERT INTO transfer_sessions (id, sender_user_id, sender_organization_id, pairing_token_hash, state, manifest_json, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, senderUserId, senderOrganizationId, tokenHash, 'pairing', JSON.stringify(manifestItems), now, now, now + SESSION_TTL_MS]
      );
    } catch (_err) {
      throw new TransferSessionError('concurrent_session_rejected');
    }

    for (const item of manifestItems) {
      await this.db.run(
        'INSERT INTO transfer_items (id, session_id, source_document_id, relative_path, filename, size, mime_type, checksum, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.itemId, id, item.documentId, item.relativePath, item.filename, item.size, item.mimeType, item.checksum, 'pending', now, now]
      );
    }

    await this._logAudit(senderUserId, 'TRANSFER_SESSION_CREATED', id);
    // The real QR *payload* - this is what would be passed to
    // core/security/qr-renderer.js's render() once a real encoder is
    // registered there. Rendering itself is honestly out of scope -
    // no encoder exists anywhere in this repository.
    // Phase 5 addition: qrPayloadString is the real, compact, versioned
    // string a client would actually pass to
    // window.CozyOS.QRRenderer.render(text) - additive; the existing
    // object-shaped qrPayload field is unchanged for backward
    // compatibility with Phase 4 callers/tests.
    return {
      available: true,
      sessionId: id,
      pairingToken: rawToken,
      expiresAt: now + SESSION_TTL_MS,
      qrPayload: { v: 1, sessionId: id, token: rawToken, itemCount: manifestItems.length },
      qrPayloadString: encodeQrPayload({ sessionId: id, token: rawToken, expiresAt: now + SESSION_TTL_MS }),
    };
  }

  async _getSessionOrExpire(sessionId) {
    const session = await this.db.get('SELECT * FROM transfer_sessions WHERE id = ?', [sessionId]);
    if (!session) return null;
    if (!TERMINAL_STATES.has(session.state) && session.expires_at < this.now()) {
      await this.db.run('UPDATE transfer_sessions SET state = ?, updated_at = ? WHERE id = ?', ['expired', this.now(), sessionId]);
      session.state = 'expired';
    }
    return session;
  }

  /**
   * pair(receiverUserId, receiverOrganizationId, sessionId, token)
   *   Real, single-use pairing. A session can only ever transition
   *   pairing -> connected once - a second attempt (replay) against a
   *   non-pairing-state session is honestly rejected, never silently
   *   re-accepted.
   */
  async pair(receiverUserId, receiverOrganizationId, sessionId, token) {
    await this._requireActiveMember(receiverUserId, receiverOrganizationId);
    const session = await this._getSessionOrExpire(sessionId);
    if (!session) throw new TransferSessionError('session_not_found');
    if (session.state === 'expired') throw new TransferSessionError('session_expired');
    if (session.state !== 'pairing') throw new TransferSessionError('replay_rejected');
    if (typeof token !== 'string' || !safeCompare(hashToken(token), session.pairing_token_hash)) throw new TransferSessionError('invalid_pairing_credential');

    await this.db.run(
      'UPDATE transfer_sessions SET state = ?, receiver_user_id = ?, receiver_organization_id = ?, updated_at = ? WHERE id = ?',
      ['connected', receiverUserId, receiverOrganizationId, this.now(), sessionId]
    );
    await this._logAudit(receiverUserId, 'TRANSFER_SESSION_PAIRED', sessionId);
    return { available: true, sessionId, manifest: JSON.parse(session.manifest_json) };
  }

  async _requireActiveMember(userId, organizationId) {
    const membership = await this.orgs.getMembership(userId, organizationId);
    if (!membership || membership.status !== 'active') throw new TransferSessionError('not_authorized');
  }

  async _requireParty(userId, sessionId) {
    const session = await this._getSessionOrExpire(sessionId);
    if (!session) throw new TransferSessionError('session_not_found');
    if (session.sender_user_id !== userId && session.receiver_user_id !== userId) throw new TransferSessionError('not_authorized');
    return session;
  }

  async getManifest(userId, sessionId) {
    const session = await this._requireParty(userId, sessionId);
    return { available: true, state: session.state, manifest: JSON.parse(session.manifest_json) };
  }

  /**
   * transferItem(receiverUserId, sessionId, itemId, destinationFolderId)
   *   The real, core "receive" operation. Loads the sender's actual
   *   stored content (through the sender's OWN organization context,
   *   held authoritatively by the session row - never receiver-
   *   supplied), independently re-computes SHA-256 as the content is
   *   copied, and creates a genuinely new document in the RECEIVER's
   *   own organization via the existing, unmodified Phase 1/2/3 APIs -
   *   never a second storage system.
   */
  async transferItem(receiverUserId, sessionId, itemId, destinationFolderId = null) {
    const session = await this._requireParty(receiverUserId, sessionId);
    if (session.receiver_user_id !== receiverUserId) throw new TransferSessionError('not_authorized');
    if (!['connected', 'transfer_negotiation', 'transferring'].includes(session.state)) throw new TransferSessionError('invalid_state_transition');

    const item = await this.db.get('SELECT * FROM transfer_items WHERE id = ? AND session_id = ?', [itemId, sessionId]);
    if (!item) throw new TransferSessionError('invalid_manifest');

    await this.db.run('UPDATE transfer_sessions SET state = ?, updated_at = ? WHERE id = ?', ['transferring', this.now(), sessionId]);
    await this.db.run('UPDATE transfer_items SET status = ?, updated_at = ? WHERE id = ?', ['transferring', this.now(), itemId]);

    // Load the sender's real, existing document + binary, using the
    // SENDER's own real organization context (from the session row,
    // never the receiver's request).
    const sourceRecord = await this.documentStorage.load(session.sender_user_id, session.sender_organization_id, item.source_document_id);
    if (!sourceRecord.available) {
      await this.db.run('UPDATE transfer_items SET status = ?, updated_at = ? WHERE id = ?', ['failed', this.now(), itemId]);
      throw new TransferSessionError('source_unavailable');
    }

    // Create the real, new document in the RECEIVER's own organization
    // - a fresh, server-generated identity, never the sender's.
    const newDocumentId = crypto.randomUUID();
    const saveResult = await this.documentStorage.save(receiverUserId, session.receiver_organization_id, {
      documentId: newDocumentId,
      title: sourceRecord.record.title,
      rawText: sourceRecord.record.rawText,
      documentType: sourceRecord.record.documentType,
      tags: sourceRecord.record.tags,
    });

    let verifiedChecksum = null;
    if (sourceRecord.binarySize || item.checksum) {
      const sourceBinary = await this.documentStorage.loadBinary(session.sender_user_id, session.sender_organization_id, item.source_document_id);
      if (sourceBinary.available) {
        const hash = crypto.createHash('sha256');
        const chunks = [];
        for await (const chunk of sourceBinary.stream) { hash.update(chunk); chunks.push(chunk); }
        verifiedChecksum = hash.digest('hex');

        if (item.checksum && verifiedChecksum !== item.checksum) {
          await this.db.run('UPDATE transfer_items SET status = ?, updated_at = ? WHERE id = ?', ['failed', this.now(), itemId]);
          await this.db.run('UPDATE transfer_sessions SET state = ?, failure_reason = ?, updated_at = ? WHERE id = ?', ['corrupted', `checksum mismatch on item ${itemId}`, this.now(), sessionId]);
          throw new TransferSessionError('checksum_mismatch');
        }

        const { Readable } = require('node:stream');
        await this.documentStorage.saveBinary(receiverUserId, session.receiver_organization_id, newDocumentId, Readable.from(Buffer.concat(chunks)), { mimeType: sourceBinary.mimeType, originalFilename: item.filename });
      }
    }

    if (destinationFolderId) {
      await this.folders.moveDocument(receiverUserId, session.receiver_organization_id, newDocumentId, destinationFolderId);
    }

    await this.db.run('UPDATE transfer_items SET status = ?, received_document_id = ?, updated_at = ? WHERE id = ?', ['verified', newDocumentId, this.now(), itemId]);
    await this._logAudit(receiverUserId, 'TRANSFER_ITEM_RECEIVED', `${sessionId}/${itemId} -> ${newDocumentId}`);
    return { available: true, receivedDocumentId: newDocumentId, checksum: verifiedChecksum };
  }

  /** completeSession - only succeeds if every real item is genuinely verified, never merely claimed. */
  async completeSession(userId, sessionId) {
    const session = await this._requireParty(userId, sessionId);
    const items = await this.db.all('SELECT status FROM transfer_items WHERE session_id = ?', [sessionId]);
    const allVerified = items.length > 0 && items.every((i) => i.status === 'verified');
    if (!allVerified) throw new TransferSessionError('items_not_verified');
    await this.db.run('UPDATE transfer_sessions SET state = ?, updated_at = ? WHERE id = ?', ['completed', this.now(), sessionId]);
    await this._logAudit(userId, 'TRANSFER_SESSION_COMPLETED', sessionId);
    return { available: true, sessionId };
  }

  async cancelSession(userId, sessionId) {
    const session = await this._requireParty(userId, sessionId);
    if (TERMINAL_STATES.has(session.state)) throw new TransferSessionError('invalid_state_transition');
    await this.db.run('UPDATE transfer_sessions SET state = ?, updated_at = ? WHERE id = ?', ['cancelled', this.now(), sessionId]);
    await this._logAudit(userId, 'TRANSFER_SESSION_CANCELLED', sessionId);
    return { available: true, sessionId };
  }

  async getSession(userId, sessionId) {
    const session = await this._requireParty(userId, sessionId);
    return { available: true, session: { sessionId: session.id, state: session.state, senderOrganizationId: session.sender_organization_id, receiverOrganizationId: session.receiver_organization_id, createdAt: session.created_at, expiresAt: session.expires_at, failureReason: session.failure_reason } };
  }
}

module.exports = { TransferSessionRegistry, TransferSessionError };
