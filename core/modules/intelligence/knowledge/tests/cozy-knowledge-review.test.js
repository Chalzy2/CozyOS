/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-review.test.js
 * RP-029-C Phase 1 — real, executed tests for
 * core/modules/intelligence/knowledge/cozy-knowledge-review.js
 *
 * Run with: node core/modules/intelligence/knowledge/tests/cozy-knowledge-review.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

function loadModules(withLanguage) {
  const ingestionPath = path.join(__dirname, '..', 'cozy-knowledge-ingestion.js');
  const communityPath = path.join(__dirname, '..', 'cozy-knowledge-community.js');
  const reviewPath = path.join(__dirname, '..', 'cozy-knowledge-review.js');
  const templatesPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-templates.js');
  const registryPath = path.join(__dirname, '..', '..', 'language', 'cozy-language-registry.js');
  [ingestionPath, communityPath, reviewPath, templatesPath, registryPath].forEach((p) => {
    delete require.cache[require.resolve(p)];
  });
  global.window = { CozyOS: {} };
  require(ingestionPath);
  require(communityPath);
  if (withLanguage) {
    require(templatesPath);
    require(registryPath);
  }
  require(reviewPath);
  return {
    Ingestion: global.window.CozyOS.CozyKnowledgeIngestion,
    Community: global.window.CozyOS.CozyKnowledgeCommunity,
    Review: global.window.CozyOS.CozyKnowledgeReview
  };
}

let mods = loadModules(true);
let Ingestion = mods.Ingestion;
let Community = mods.Community;
let Review = mods.Review;

function reset(withLanguage) {
  mods = loadModules(withLanguage === undefined ? true : withLanguage);
  Ingestion = mods.Ingestion;
  Community = mods.Community;
  Review = mods.Review;
}

function makeCandidate(overrides) {
  const opts = Object.assign({
    contributionType: 'PHRASE',
    statement: 'test expression ' + Math.random(),
    contributorId: 'contributorA',
    language: 'luo',
    meaning: 'a test meaning'
  }, overrides || {});
  const result = Community.submitContribution(opts);
  assert.strictEqual(result.status, 'SUBMITTED', 'setup: contribution must submit cleanly');
  return result.record.id;
}

// ---------------------------------------------------------------------
// 0. Dependency / composition sanity
// ---------------------------------------------------------------------

test('CozyKnowledgeReview loads and reports its own version', () => {
  assert.strictEqual(typeof Review.getVersion(), 'string');
});

test('fails honestly (REJECTED) if RP-029-B community module is missing', () => {
  global.window = { CozyOS: {} };
  delete require.cache[require.resolve(path.join(__dirname, '..', 'cozy-knowledge-review.js'))];
  require(path.join(__dirname, '..', 'cozy-knowledge-review.js'));
  const StandaloneReview = global.window.CozyOS.CozyKnowledgeReview;
  const result = StandaloneReview.challenge('anything', { reason: 'x' });
  assert.strictEqual(result.status, 'REJECTED');
  reset();
});

// ---------------------------------------------------------------------
// 1. partialConfirm — audit-only, never mutates reviewState
// ---------------------------------------------------------------------

test('partialConfirm() records an audit entry without changing reviewState', () => {
  const id = makeCandidate();
  const before = Community.getRecord(id).communityExtensions.reviewState;
  const result = Review.partialConfirm(id, { reviewerId: 'reviewerA', confirms: ['expression'], disputes: ['translation'], notes: 'expression is right, translation is off' });
  assert.strictEqual(result.status, 'PARTIAL_CONFIRM_RECORDED');
  const after = Community.getRecord(id).communityExtensions.reviewState;
  assert.strictEqual(after, before, 'reviewState must be untouched by a partial confirm');
});

test('partialConfirm() on an unknown candidate reports NOT_FOUND', () => {
  const result = Review.partialConfirm('does-not-exist', { reviewerId: 'r' });
  assert.strictEqual(result.status, 'NOT_FOUND');
});

// ---------------------------------------------------------------------
// 2. requestClarification — delegates real state change to RP-029-B
// ---------------------------------------------------------------------

test('requestClarification() moves reviewState to UNRESOLVED via RP-029-B', () => {
  const id = makeCandidate();
  const result = Review.requestClarification(id, { reviewerId: 'reviewerA', reason: 'Need more community input on dialect.' });
  assert.strictEqual(result.status, 'UNRESOLVED');
  assert.strictEqual(Community.getRecord(id).communityExtensions.reviewState, 'UNRESOLVED');
});

test('requestClarification() audit entry is labeled distinctly from generic UNRESOLVED', () => {
  const id = makeCandidate();
  Review.requestClarification(id, { reviewerId: 'reviewerA', reason: 'clarify dialect' });
  const trail = Review.getAuditTrail(id);
  const entry = trail.find((e) => e.action === 'CLARIFICATION_REQUESTED');
  assert.ok(entry, 'expected a CLARIFICATION_REQUESTED audit entry');
  assert.strictEqual(entry.resultingState, 'UNRESOLVED');
});

// ---------------------------------------------------------------------
// 3. challenge — wraps disputeContribution
// ---------------------------------------------------------------------

test('challenge() moves reviewState to DISPUTED and requires a reason', () => {
  const id = makeCandidate();
  const rejected = Review.challenge(id, { reviewerId: 'reviewerA' });
  assert.strictEqual(rejected.status, 'REJECTED', 'must require a reason');
  const result = Review.challenge(id, { reviewerId: 'reviewerA', reason: 'Meaning disputed by another speaker.' });
  assert.strictEqual(result.status, 'DISPUTED');
});

// ---------------------------------------------------------------------
// 4. confirm — composes addIndependentConfirmation + optional confirmReview
// ---------------------------------------------------------------------

test('confirm() adds an independent confirmation without forcing reviewState to CONFIRMED', () => {
  const id = makeCandidate();
  const result = Review.confirm(id, { reviewerId: 'reviewerB', contributorId: 'contributorB', sourceId: 'src-1', sourceType: 'COMMUNITY_CONFIRMATION' });
  assert.strictEqual(result.confirmationStatus, 'CONFIRMED');
  assert.strictEqual(Community.getRecord(id).communityExtensions.reviewState, 'CANDIDATE', 'reviewState only changes when finalizeReview is explicitly requested');
});

test('confirm() with finalizeReview:true moves reviewState to CONFIRMED', () => {
  const id = makeCandidate();
  const result = Review.confirm(id, { reviewerId: 'reviewerB', contributorId: 'contributorB', sourceId: 'src-1', finalizeReview: true });
  assert.strictEqual(result.status, 'CONFIRMED');
});

test('confirm() on a same-source second confirmation is honestly not independent', () => {
  const id = makeCandidate();
  Review.confirm(id, { reviewerId: 'r1', contributorId: 'contributorB', sourceId: 'shared-doc' });
  const second = Review.confirm(id, { reviewerId: 'r2', contributorId: 'contributorC', sourceId: 'shared-doc' });
  assert.strictEqual(second.confirmationStatus, 'INDEPENDENCE_UNVERIFIED');
});

// ---------------------------------------------------------------------
// 5. reject
// ---------------------------------------------------------------------

test('reject() requires a reason and moves reviewState to REJECTED', () => {
  const id = makeCandidate();
  const missing = Review.reject(id, { reviewerId: 'reviewerA' });
  assert.strictEqual(missing.status, 'REJECTED');
  const withReason = Review.reject(id, { reviewerId: 'reviewerA', reason: 'Not a real expression in this language.' });
  assert.strictEqual(withReason.status, 'REJECTED');
  assert.strictEqual(Community.getRecord(id).communityExtensions.reviewState, 'REJECTED');
});

// ---------------------------------------------------------------------
// 6. promote — never blocks on Rule 82, always attaches gate snapshot
// ---------------------------------------------------------------------

test('promote() to COMMUNITY succeeds and attaches a Rule 82 gate snapshot', () => {
  const id = makeCandidate({ language: 'luo' });
  const result = Review.promote(id, 'COMMUNITY', { reviewerId: 'reviewerA', languageCode: 'luo' });
  assert.strictEqual(result.status, 'UPDATED');
  assert.ok(result.rule82Gate, 'expected an attached rule82Gate snapshot');
  assert.strictEqual(result.rule82Gate.languageCode, 'luo');
});

test('promote() to PUBLIC is still blocked while DISPUTED, per RP-029-B (not bypassed here)', () => {
  const id = makeCandidate();
  Review.challenge(id, { reviewerId: 'reviewerA', reason: 'disputed' });
  const result = Review.promote(id, 'PUBLIC', { reviewerId: 'reviewerA' });
  assert.strictEqual(result.status, 'REJECTED');
});

// ---------------------------------------------------------------------
// 7. computeDisplayState — presentation-only mapping
// ---------------------------------------------------------------------

test('computeDisplayState(): fresh private candidate with zero confirmations (tier NONE) is PRIVATE', () => {
  const id = makeCandidate();
  assert.strictEqual(Review.computeDisplayState(Community.getRecord(id)), 'PRIVATE');
});

test('computeDisplayState(): private candidate that reaches tier CANDIDATE (1+ confirmations) still reads PRIVATE, not EMERGING', () => {
  const id = makeCandidate();
  Review.confirm(id, { reviewerId: 'r', contributorId: 'c1', sourceId: 's1' });
  assert.strictEqual(Review.computeDisplayState(Community.getRecord(id)), 'PRIVATE');
});

test('computeDisplayState(): UNDER_REVIEW maps to COMMUNITY_REVIEW', () => {
  const id = makeCandidate();
  Community.beginReview(id, { reviewerId: 'r' });
  assert.strictEqual(Review.computeDisplayState(Community.getRecord(id)), 'COMMUNITY_REVIEW');
});

test('computeDisplayState(): DISPUTED maps to DISPUTED', () => {
  const id = makeCandidate();
  Review.challenge(id, { reviewerId: 'r', reason: 'x' });
  assert.strictEqual(Review.computeDisplayState(Community.getRecord(id)), 'DISPUTED');
});

test('computeDisplayState(): UNRESOLVED maps to NEEDS_CLARIFICATION', () => {
  const id = makeCandidate();
  Review.requestClarification(id, { reviewerId: 'r', reason: 'x' });
  assert.strictEqual(Review.computeDisplayState(Community.getRecord(id)), 'NEEDS_CLARIFICATION');
});

test('computeDisplayState(): PUBLIC visibility maps to PROMOTED regardless of reviewState', () => {
  const id = makeCandidate();
  Review.confirm(id, { reviewerId: 'r', contributorId: 'c', sourceId: 's1', finalizeReview: true });
  Review.promote(id, 'COMMUNITY', { reviewerId: 'r' });
  Review.promote(id, 'PUBLIC', { reviewerId: 'r' });
  assert.strictEqual(Review.computeDisplayState(Community.getRecord(id)), 'PROMOTED');
});

test('computeDisplayState(): CONFIRMED + COMMUNITY visibility maps to PROMOTION_ELIGIBLE', () => {
  const id = makeCandidate();
  Review.confirm(id, { reviewerId: 'r', contributorId: 'c', sourceId: 's1', finalizeReview: true });
  Review.promote(id, 'COMMUNITY', { reviewerId: 'r' });
  assert.strictEqual(Review.computeDisplayState(Community.getRecord(id)), 'PROMOTION_ELIGIBLE');
});

// ---------------------------------------------------------------------
// 8. Rule 82 — full five-part gate, never fabricated
// ---------------------------------------------------------------------

test('evaluateRule82Gate(): a fully-covered default language reports templates VERIFIED but overall LOCKED (no attestation/tests/runtime supplied)', () => {
  const gate = Review.evaluateRule82Gate('en');
  assert.strictEqual(gate.requirements.templatesWrittenAndCommitted.state, 'VERIFIED');
  assert.strictEqual(gate.requirements.realLanguageResourcesExist.state, 'UNKNOWN');
  assert.strictEqual(gate.requirements.runtimeBehaviorObserved.state, 'NOT_TESTED_LIVE');
  assert.strictEqual(gate.promotion, 'LOCKED');
});

test('evaluateRule82Gate(): an extended language with no templates reports INCOMPLETE and LOCKED', () => {
  const gate = Review.evaluateRule82Gate('luo');
  assert.strictEqual(gate.requirements.templatesWrittenAndCommitted.state, 'INCOMPLETE');
  assert.strictEqual(gate.promotion, 'LOCKED');
});

test('evaluateRule82Gate(): never reports ELIGIBLE even with a resource attestation alone', () => {
  const gate = Review.evaluateRule82Gate('en', { resourcesAttestedBy: 'Jane, fluent speaker' });
  assert.strictEqual(gate.requirements.realLanguageResourcesExist.state, 'ATTESTED');
  assert.strictEqual(gate.promotion, 'LOCKED', 'runtime is never testable here, so gate can never self-report ELIGIBLE');
});

test('evaluateRule82Gate(): supplying real testEvidence is reflected honestly, not assumed', () => {
  const passing = Review.evaluateRule82Gate('en', { testEvidence: { file: 'rule-based-conversational-provider-rp027.test.js', passed: 40, total: 40, ranAt: new Date().toISOString() } });
  assert.strictEqual(passing.requirements.testsExistAndPass.state, 'VERIFIED');
  const failing = Review.evaluateRule82Gate('en', { testEvidence: { file: 'x', passed: 3, total: 5, ranAt: new Date().toISOString() } });
  assert.strictEqual(failing.requirements.testsExistAndPass.state, 'FAILED_OR_INCOMPLETE');
});

test('evaluateRule82Gate(): degrades honestly (UNKNOWN template state) when language modules are absent', () => {
  reset(false);
  const gate = Review.evaluateRule82Gate('en');
  assert.strictEqual(gate.requirements.templatesWrittenAndCommitted.state, 'UNKNOWN');
  reset(true);
});

test('module never fabricates promotion: no code path sets registryState to AVAILABLE', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'cozy-knowledge-review.js'), 'utf8');
  assert.ok(!/AVAILABLE"\s*[:=]/.test(src.replace(/registryEntry\.state/g, '')), 'no literal AVAILABLE assignment should exist in this file');
  assert.ok(!/setLanguage|registry\.set|registry\.update/.test(src), 'no registry mutator call should exist in this file');
});

// ---------------------------------------------------------------------
// 9. Audit trail
// ---------------------------------------------------------------------

test('getAuditTrail(): every entry carries the required fields (spec §20)', () => {
  const id = makeCandidate();
  Review.partialConfirm(id, { reviewerId: 'r', notes: 'n' });
  Review.challenge(id, { reviewerId: 'r', reason: 'x' });
  const trail = Review.getAuditTrail(id);
  assert.ok(trail.length >= 2);
  trail.forEach((entry) => {
    ['action', 'candidateId', 'reviewerPseudId', 'at', 'previousState', 'resultingState'].forEach((field) => {
      assert.ok(Object.prototype.hasOwnProperty.call(entry, field), `missing audit field: ${field}`);
    });
  });
});

test('getAuditTrail(): reviewerId is pseudonymized, never raw, in the trail', () => {
  const id = makeCandidate();
  Review.partialConfirm(id, { reviewerId: 'raw-reviewer-name', notes: 'n' });
  const trail = Review.getAuditTrail(id);
  const raw = JSON.stringify(trail);
  assert.ok(!raw.includes('raw-reviewer-name'));
});

test('getAuditTrail(): entries are append-only (never mutated/removed by a later action)', () => {
  const id = makeCandidate();
  Review.partialConfirm(id, { reviewerId: 'r', notes: 'first' });
  const firstLen = Review.getAuditTrail(id).length;
  Review.partialConfirm(id, { reviewerId: 'r', notes: 'second' });
  const secondLen = Review.getAuditTrail(id).length;
  assert.strictEqual(secondLen, firstLen + 1);
  assert.strictEqual(Review.getAuditTrail(id)[0].reason, 'first');
});

test('getAuditTrail(): returns a copy, not the live internal array', () => {
  const id = makeCandidate();
  Review.partialConfirm(id, { reviewerId: 'r', notes: 'n' });
  const trail = Review.getAuditTrail(id);
  trail.push({ fake: true });
  assert.strictEqual(Review.getAuditTrail(id).length, 1);
});

// ---------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
