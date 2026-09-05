/**
 * core/modules/media/dedup/cozy-media-cleanup.js
 * RP-035 COS-MEDIA-DEDUPE-001 — Media Recovery / Trash / Deletion Engine
 *
 * ARCHITECTURAL RULE (non-negotiable, per RP-035 spec)
 *   This file is deliberately a SEPARATE engine from
 *   cozy-media-deduplication.js. That file only ever produces read-only
 *   "candidate" audit records — it never deletes anything. This file is
 *   the only place in COS-MEDIA-DEDUPE-001 that can move media to trash
 *   or permanently delete it, and every path through it requires an
 *   explicit owner decision:
 *
 *     Candidate (from the detection engine)
 *           v
 *     Owner policy / confirmation   <- this file's gate, always enforced
 *           v
 *     Recovery trash (soft, reversible)
 *           v
 *     Permanent deletion (always requires human confirmation, never
 *                          automatic, regardless of policy)
 *
 * LOCKED RULE (Charles, this milestone)
 *   "CozyOS must never delete a file merely because an AI thinks it is a
 *   duplicate." Exact duplicates are deterministic (byte-identical, not
 *   an AI judgment) and MAY be auto-trashed, but only if the owner has
 *   explicitly enabled that in policy — off by default. Near-duplicates
 *   are a similarity score, not certainty, and ALWAYS require a human
 *   confirmedBy on every trash action, with no policy override.
 *   Permanent deletion always requires confirmedBy, with no exceptions
 *   and no policy override — trash is the only reversible bridge.
 *
 * OWNERSHIP
 *   Composes core/modules/media/cozy-media.js (window.CozyOS.CozyMedia)
 *   archiveMedia()/restoreMedia()/deleteMedia() where CozyMedia already
 *   knows about the mediaId — does not reimplement media storage. Falls
 *   back to this engine's own trash ledger when CozyMedia has no record
 *   of the id (e.g. a raw filesystem/SD-card scan target that was never
 *   registered with CozyMedia), so cleanup still works standalone.
 */
'use strict';

(function () {
  window.CozyOS = window.CozyOS || {};

  const VERSION = '1.0.1-COS-MEDIA-DEDUPE-001';

  // Canonical audit vocabulary (locked, matches
  // cozy-media-deduplication.js — see that file's header):
  //   states:  CLEANUP_CANDIDATE | TRASHED | RESTORED | PERMANENTLY_DELETED
  //   reason for any owner-confirmed action: USER_CONFIRMED_DELETE

  let _ownerPolicy = Object.freeze({
    autoCleanupEnabled: false,
    autoCleanupScope: 'NONE', // 'NONE' | 'EXACT_ONLY' — near-duplicates are never in scope, ever
  });

  let _trash = new Map(); // mediaId -> { trashedAt, reason, auditId, sourceRecoveryLocation }
  let _audit = [];

  function _now() { return Date.now(); }
  function _genId(prefix) { return `${prefix}_${_now()}_${Math.random().toString(36).slice(2, 10)}`; }
  function _deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.getOwnPropertyNames(value).forEach((key) => _deepFreeze(value[key]));
      Object.freeze(value);
    }
    return value;
  }
  function _recordAudit(entry) {
    const record = _deepFreeze(Object.assign({ auditId: _genId('cleanup_audit'), timestamp: _now() }, entry));
    _audit.push(record);
    return record;
  }

  function setOwnerPolicy(policy) {
    const scope = policy && policy.autoCleanupScope === 'EXACT_ONLY' ? 'EXACT_ONLY' : 'NONE';
    const enabled = !!(policy && policy.autoCleanupEnabled === true) && scope === 'EXACT_ONLY';
    _ownerPolicy = Object.freeze({ autoCleanupEnabled: enabled, autoCleanupScope: scope });
    _recordAudit({ mediaId: null, decision: 'POLICY_UPDATED', reason: JSON.stringify(_ownerPolicy), recoveryLocation: null, recoveryStatus: 'NOT_APPLICABLE' });
    return _ownerPolicy;
  }
  function getOwnerPolicy() { return _ownerPolicy; }

  /**
   * evaluateCandidate(candidate)
   *   candidate: an audit record produced by
   *   CozyMediaDeduplication.scanMedia() (decision: 'DETECTED_DUPLICATE'
   *   with reason 'EXACT_SHA256_MATCH' | 'NEAR_DUPLICATE_DHASH_CANDIDATE',
   *   or decision 'PROTECTED_MEDIA').
   *   Returns whether a trash action is allowed right now, and whether
   *   it still requires an explicit human confirmedBy.
   *   Never returns allowed:true for a near-duplicate without
   *   confirmedBy already present — there is no policy that bypasses
   *   that. PROTECTED_MEDIA is never allowed here, under any
   *   confirmation or policy — an owner must unprotect the item through
   *   a separate, explicit action before it can enter this workflow at
   *   all.
   */
  function evaluateCandidate(candidate, opts) {
    const confirmedBy = opts && opts.confirmedBy;
    if (!candidate || typeof candidate !== 'object') {
      return { allowed: false, requiresConfirmation: true, reason: 'NO_CANDIDATE_PROVIDED' };
    }
    if (candidate.decision === 'PROTECTED_MEDIA') {
      return { allowed: false, requiresConfirmation: false, reason: 'PROTECTED_MEDIA_CANNOT_BE_CLEANED' };
    }
    if (candidate.decision === 'DETECTED_DUPLICATE' && candidate.reason === 'EXACT_SHA256_MATCH') {
      if (confirmedBy) return { allowed: true, requiresConfirmation: false, reason: 'USER_CONFIRMED_DELETE' };
      if (_ownerPolicy.autoCleanupEnabled && _ownerPolicy.autoCleanupScope === 'EXACT_ONLY') {
        return { allowed: true, requiresConfirmation: false, reason: 'OWNER_POLICY_AUTO_CLEANUP_EXACT' };
      }
      return { allowed: false, requiresConfirmation: true, reason: 'EXACT_DUPLICATE_AWAITING_CONFIRMATION_OR_POLICY' };
    }
    if (candidate.decision === 'DETECTED_DUPLICATE' && candidate.reason === 'NEAR_DUPLICATE_DHASH_CANDIDATE') {
      if (confirmedBy) return { allowed: true, requiresConfirmation: false, reason: 'USER_CONFIRMED_DELETE' };
      return { allowed: false, requiresConfirmation: true, reason: 'NEAR_DUPLICATE_ALWAYS_REQUIRES_CONFIRMATION' };
    }
    return { allowed: false, requiresConfirmation: true, reason: `UNSUPPORTED_CANDIDATE_TYPE:${candidate.decision}:${candidate.reason}` };
  }

  /**
   * moveToTrash({ mediaId, candidate, confirmedBy, reason })
   *   Soft delete only. Never permanently removes bytes. Keeps enough
   *   metadata (candidate's audit record, timestamp) to restore.
   */
  function moveToTrash({ mediaId, candidate, confirmedBy, reason } = {}) {
    if (!mediaId) return _recordAudit({ mediaId: null, decision: 'ERROR', reason: 'MISSING_MEDIA_ID', recoveryLocation: null, recoveryStatus: 'NOT_APPLICABLE' });

    const evaluation = candidate ? evaluateCandidate(candidate, { confirmedBy }) : { allowed: !!confirmedBy, requiresConfirmation: !confirmedBy, reason: confirmedBy ? 'USER_CONFIRMED_DELETE' : 'CONFIRMATION_REQUIRED_NO_CANDIDATE' };

    if (!evaluation.allowed) {
      return _recordAudit({
        mediaId, decision: 'TRASH_BLOCKED', reason: evaluation.reason,
        recoveryLocation: null, recoveryStatus: 'NOT_APPLICABLE',
      });
    }

    // A safe-to-clean duplicate is recorded as its own auditable step
    // (CLEANUP_CANDIDATE) before anything actually moves — this is the
    // "duplicate confirmed as safe candidate" checkpoint, distinct from
    // the trash action itself, so the audit trail shows the decision
    // and the action as two separate, ordered events.
    _recordAudit({
      mediaId, decision: 'CLEANUP_CANDIDATE', reason: evaluation.reason,
      recoveryLocation: null, recoveryStatus: 'NOT_APPLICABLE',
    });

    const recoveryLocation = `trash://${mediaId}`;
    _trash.set(mediaId, {
      trashedAt: _now(),
      reason: reason || evaluation.reason,
      auditId: candidate && candidate.auditId || null,
      sourceRecoveryLocation: recoveryLocation,
      confirmedBy: confirmedBy || null,
    });

    // Best-effort CozyMedia composition — soft-delete via its own
    // archiveMedia() when it knows this id; standalone trash ledger
    // above is authoritative either way.
    const CM = window.CozyOS.CozyMedia;
    if (CM && typeof CM.hasMedia === 'function' && CM.hasMedia(mediaId) && typeof CM.archiveMedia === 'function') {
      try { CM.archiveMedia(mediaId); } catch (_err) { /* trash ledger above is still authoritative */ }
    }

    return _recordAudit({
      mediaId, decision: 'TRASHED', reason: evaluation.reason,
      recoveryLocation, recoveryStatus: 'TRASHED', confirmedBy: confirmedBy || null,
    });
  }

  function restoreFromTrash(mediaId) {
    if (!_trash.has(mediaId)) {
      return _recordAudit({ mediaId, decision: 'RESTORE_BLOCKED', reason: 'NOT_IN_TRASH', recoveryLocation: null, recoveryStatus: 'NOT_APPLICABLE' });
    }
    _trash.delete(mediaId);
    const CM = window.CozyOS.CozyMedia;
    if (CM && typeof CM.hasMedia === 'function' && CM.hasMedia(mediaId) && typeof CM.restoreMedia === 'function') {
      try { CM.restoreMedia(mediaId); } catch (_err) { /* ledger above already reflects restore */ }
    }
    return _recordAudit({ mediaId, decision: 'RESTORED', reason: 'OWNER_RESTORE', recoveryLocation: null, recoveryStatus: 'RESTORED' });
  }

  function listTrash() {
    return Object.freeze(Array.from(_trash.entries()).map(([mediaId, v]) => Object.freeze({ mediaId, ...v })));
  }
  function isInTrash(mediaId) { return _trash.has(mediaId); }

  /**
   * permanentDelete(mediaId, { confirmedBy })
   *   Always requires confirmedBy, no exceptions, no policy override.
   *   Always requires the item to already be in trash — permanent
   *   deletion is never a direct action from detection.
   */
  function permanentDelete(mediaId, opts) {
    const confirmedBy = opts && opts.confirmedBy;
    if (!confirmedBy) {
      return _recordAudit({ mediaId, decision: 'DELETE_BLOCKED', reason: 'CONFIRMATION_REQUIRED', recoveryLocation: null, recoveryStatus: isInTrash(mediaId) ? 'TRASHED' : 'NOT_APPLICABLE' });
    }
    if (!_trash.has(mediaId)) {
      return _recordAudit({ mediaId, decision: 'DELETE_BLOCKED', reason: 'MUST_BE_TRASHED_FIRST', recoveryLocation: null, recoveryStatus: 'NOT_APPLICABLE' });
    }
    _trash.delete(mediaId);
    const CM = window.CozyOS.CozyMedia;
    if (CM && typeof CM.hasMedia === 'function' && CM.hasMedia(mediaId) && typeof CM.deleteMedia === 'function') {
      try { CM.deleteMedia(mediaId); } catch (_err) { /* ledger above already reflects deletion */ }
    }
    // reason is the canonical, fixed vocabulary string; confirmedBy is
    // its own audit field so the confirming identity is never buried
    // inside a free-text reason (a later audit query can filter/group
    // on reason without string-parsing an identity out of it).
    return _recordAudit({
      mediaId, decision: 'PERMANENTLY_DELETED', reason: 'USER_CONFIRMED_DELETE',
      confirmedBy, recoveryLocation: null, recoveryStatus: 'DELETED',
    });
  }

  function getAuditTrail(filters) {
    let entries = _audit.slice();
    if (filters && filters.mediaId) entries = entries.filter((e) => e.mediaId === filters.mediaId);
    if (filters && filters.decision) entries = entries.filter((e) => e.decision === filters.decision);
    return Object.freeze(entries);
  }
  function getAuditCount() { return _audit.length; }

  function getVersionInfo() { return VERSION; }

  function _resetForTests() {
    _ownerPolicy = Object.freeze({ autoCleanupEnabled: false, autoCleanupScope: 'NONE' });
    _trash = new Map();
    _audit = [];
  }

  window.CozyOS.CozyMediaCleanup = Object.freeze({
    setOwnerPolicy,
    getOwnerPolicy,
    evaluateCandidate,
    moveToTrash,
    restoreFromTrash,
    listTrash,
    isInTrash,
    permanentDelete,
    getAuditTrail,
    getAuditCount,
    getVersion: getVersionInfo,
    _resetForTests,
  });
})();
