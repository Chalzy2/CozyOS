'use strict';

/**
 * Test suite for core/modules/media/dedup/cozy-media-cleanup.js
 * (RP-035 COS-MEDIA-DEDUPE-001 — IMPLEMENTED phase).
 *
 * HARNESS DISCLOSURE: real, unmodified production code under test. No
 * CozyMedia registration is loaded in these tests — this file
 * specifically verifies the engine's standalone trash ledger works
 * correctly even when CozyMedia has no record of the mediaId, per its
 * own documented fallback behavior.
 *
 * Run with: node --test core/modules/media/dedup/test/cozy-media-cleanup.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function freshEngine() {
  const modPath = require.resolve('../cozy-media-cleanup.js');
  delete require.cache[modPath];
  global.window = { CozyOS: {} };
  require(modPath);
  return global.window.CozyOS.CozyMediaCleanup;
}

function exactCandidate(mediaId) {
  return { auditId: 'a1', mediaId, decision: 'DETECTED_DUPLICATE', reason: 'EXACT_SHA256_MATCH' };
}
function nearCandidate(mediaId) {
  return { auditId: 'a2', mediaId, decision: 'DETECTED_DUPLICATE', reason: 'NEAR_DUPLICATE_DHASH_CANDIDATE' };
}
function protectedCandidate(mediaId) {
  return { auditId: 'a3', mediaId, decision: 'PROTECTED_MEDIA', reason: 'OWNER_MARKED_PROTECTED' };
}

test('default policy: exact-duplicate candidate is blocked without confirmation and without policy opt-in', () => {
  const C = freshEngine();
  const r = C.moveToTrash({ mediaId: 'm1', candidate: exactCandidate('m1') });
  assert.equal(r.decision, 'TRASH_BLOCKED');
  assert.equal(C.isInTrash('m1'), false);
});

test('exact-duplicate candidate with explicit human confirmation is trashed', () => {
  const C = freshEngine();
  const r = C.moveToTrash({ mediaId: 'm1', candidate: exactCandidate('m1'), confirmedBy: 'charles' });
  assert.equal(r.decision, 'TRASHED');
  assert.equal(r.reason, 'USER_CONFIRMED_DELETE');
  assert.equal(r.confirmedBy, 'charles');
  assert.equal(C.isInTrash('m1'), true);
  assert.equal(r.recoveryStatus, 'TRASHED');
});

test('a safe-to-clean candidate is recorded as its own CLEANUP_CANDIDATE audit step before the TRASHED action', () => {
  const C = freshEngine();
  C.moveToTrash({ mediaId: 'm1b', candidate: exactCandidate('m1b'), confirmedBy: 'charles' });
  const trail = C.getAuditTrail({ mediaId: 'm1b' });
  const decisions = trail.map((e) => e.decision);
  assert.ok(decisions.includes('CLEANUP_CANDIDATE'));
  assert.ok(decisions.includes('TRASHED'));
  assert.ok(decisions.indexOf('CLEANUP_CANDIDATE') < decisions.indexOf('TRASHED'));
});

test('PROTECTED_MEDIA can never be trashed, with or without confirmation, with or without policy', () => {
  const C = freshEngine();
  C.setOwnerPolicy({ autoCleanupEnabled: true, autoCleanupScope: 'EXACT_ONLY' });
  const blocked = C.moveToTrash({ mediaId: 'p1', candidate: protectedCandidate('p1') });
  assert.equal(blocked.decision, 'TRASH_BLOCKED');
  const stillBlocked = C.moveToTrash({ mediaId: 'p1', candidate: protectedCandidate('p1'), confirmedBy: 'charles' });
  assert.equal(stillBlocked.decision, 'TRASH_BLOCKED');
  assert.equal(stillBlocked.reason, 'PROTECTED_MEDIA_CANNOT_BE_CLEANED');
  assert.equal(C.isInTrash('p1'), false);
});

test('near-duplicate candidate is NEVER auto-trashed even with autoCleanupEnabled policy on', () => {
  const C = freshEngine();
  C.setOwnerPolicy({ autoCleanupEnabled: true, autoCleanupScope: 'EXACT_ONLY' });
  const r = C.moveToTrash({ mediaId: 'm2', candidate: nearCandidate('m2') });
  assert.equal(r.decision, 'TRASH_BLOCKED');
  assert.equal(C.isInTrash('m2'), false);
});

test('near-duplicate candidate requires explicit human confirmation, policy cannot substitute for it', () => {
  const C = freshEngine();
  C.setOwnerPolicy({ autoCleanupEnabled: true, autoCleanupScope: 'EXACT_ONLY' });
  const r = C.moveToTrash({ mediaId: 'm2', candidate: nearCandidate('m2'), confirmedBy: 'charles' });
  assert.equal(r.decision, 'TRASHED');
});

test('owner policy auto-cleanup, once explicitly enabled, allows exact-duplicate auto-trash without a per-item confirmation', () => {
  const C = freshEngine();
  C.setOwnerPolicy({ autoCleanupEnabled: true, autoCleanupScope: 'EXACT_ONLY' });
  const r = C.moveToTrash({ mediaId: 'm3', candidate: exactCandidate('m3') });
  assert.equal(r.decision, 'TRASHED');
  assert.equal(r.reason, 'OWNER_POLICY_AUTO_CLEANUP_EXACT');
});

test('policy is off by default (never auto-enabled)', () => {
  const C = freshEngine();
  const policy = C.getOwnerPolicy();
  assert.equal(policy.autoCleanupEnabled, false);
  assert.equal(policy.autoCleanupScope, 'NONE');
});

test('restore from trash works and is reflected in listTrash/isInTrash', () => {
  const C = freshEngine();
  C.moveToTrash({ mediaId: 'm4', candidate: exactCandidate('m4'), confirmedBy: 'charles' });
  assert.equal(C.isInTrash('m4'), true);
  const r = C.restoreFromTrash('m4');
  assert.equal(r.decision, 'RESTORED');
  assert.equal(C.isInTrash('m4'), false);
});

test('restoring something not in trash is honestly blocked, not silently accepted', () => {
  const C = freshEngine();
  const r = C.restoreFromTrash('never-trashed');
  assert.equal(r.decision, 'RESTORE_BLOCKED');
  assert.equal(r.reason, 'NOT_IN_TRASH');
});

test('permanent deletion always requires confirmedBy, even for an exact duplicate already in trash', () => {
  const C = freshEngine();
  C.moveToTrash({ mediaId: 'm5', candidate: exactCandidate('m5'), confirmedBy: 'charles' });
  const r = C.permanentDelete('m5');
  assert.equal(r.decision, 'DELETE_BLOCKED');
  assert.equal(r.reason, 'CONFIRMATION_REQUIRED');
});

test('permanent deletion requires the item to already be in trash — cannot skip straight from candidate to delete', () => {
  const C = freshEngine();
  const r = C.permanentDelete('never-trashed', { confirmedBy: 'charles' });
  assert.equal(r.decision, 'DELETE_BLOCKED');
  assert.equal(r.reason, 'MUST_BE_TRASHED_FIRST');
});

test('permanent deletion succeeds only after trash + explicit confirmation, and records who confirmed it', () => {
  const C = freshEngine();
  C.moveToTrash({ mediaId: 'm6', candidate: exactCandidate('m6'), confirmedBy: 'charles' });
  const r = C.permanentDelete('m6', { confirmedBy: 'charles' });
  assert.equal(r.decision, 'PERMANENTLY_DELETED');
  assert.equal(r.reason, 'USER_CONFIRMED_DELETE');
  assert.equal(r.confirmedBy, 'charles');
  assert.equal(C.isInTrash('m6'), false);
});

test('audit trail records every decision with recovery location/status', () => {
  const C = freshEngine();
  C.moveToTrash({ mediaId: 'm7', candidate: exactCandidate('m7'), confirmedBy: 'charles' });
  const trail = C.getAuditTrail({ mediaId: 'm7' });
  assert.ok(trail.length >= 1);
  const trashed = trail.find((e) => e.decision === 'TRASHED');
  assert.ok(trashed);
  assert.equal(trashed.recoveryStatus, 'TRASHED');
  assert.match(trashed.recoveryLocation, /^trash:\/\//);
});
