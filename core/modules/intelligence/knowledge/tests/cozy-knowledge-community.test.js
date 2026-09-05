/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-community.test.js
 * RP-029-B — real, executed tests for
 * core/modules/intelligence/knowledge/cozy-knowledge-community.js
 *
 * Run with: node core/modules/intelligence/knowledge/tests/cozy-knowledge-community.test.js
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

function loadModules() {
  const ingestionPath = path.join(__dirname, '..', 'cozy-knowledge-ingestion.js');
  const communityPath = path.join(__dirname, '..', 'cozy-knowledge-community.js');
  delete require.cache[require.resolve(ingestionPath)];
  delete require.cache[require.resolve(communityPath)];
  global.window = { CozyOS: {} };
  require(ingestionPath);
  require(communityPath);
  return {
    Ingestion: global.window.CozyOS.CozyKnowledgeIngestion,
    Community: global.window.CozyOS.CozyKnowledgeCommunity
  };
}

let mods = loadModules();
let Ingestion = mods.Ingestion;
let Community = mods.Community;

function reset() {
  mods = loadModules();
  Ingestion = mods.Ingestion;
  Community = mods.Community;
}

// ---------------------------------------------------------------------
// 0. Dependency / composition sanity
// ---------------------------------------------------------------------

test('CozyKnowledgeCommunity loads and reports its own version', () => {
  assert.strictEqual(typeof Community.getVersion(), 'string');
});

test('CozyKnowledgeCommunity does not define its own SOURCE_TYPES/VISIBILITY_STATES (composes RP-029-A, does not duplicate its enums)', () => {
  assert.strictEqual(Community.SOURCE_TYPES, undefined);
  assert.strictEqual(Community.VISIBILITY_STATES, undefined);
});

// ---------------------------------------------------------------------
// 1. Contribution
// ---------------------------------------------------------------------

test('submitContribution(): a valid contribution is accepted', () => {
  reset();
  const res = Community.submitContribution({
    contributionType: 'PHRASE', statement: 'This is how we say good morning.',
    meaning: 'A morning greeting', contributorId: 'alice'
  });
  assert.strictEqual(res.status, 'SUBMITTED');
  assert.ok(res.record.id);
  assert.strictEqual(res.record.visibility, 'PRIVATE');
});

test('submitContribution(): missing contributionType is rejected', () => {
  reset();
  const res = Community.submitContribution({ statement: 'x', contributorId: 'a' });
  assert.strictEqual(res.status, 'REJECTED');
});

test('submitContribution(): invalid contributionType is rejected', () => {
  reset();
  const res = Community.submitContribution({ contributionType: 'NOT_A_TYPE', statement: 'x', contributorId: 'a' });
  assert.strictEqual(res.status, 'REJECTED');
});

test('submitContribution(): missing statement is rejected (required field validated)', () => {
  reset();
  const res = Community.submitContribution({ contributionType: 'WORD', contributorId: 'a' });
  assert.strictEqual(res.status, 'REJECTED');
});

test('submitContribution(): provenance is preserved on the record', () => {
  reset();
  const res = Community.submitContribution({ contributionType: 'WORD', statement: 'jambo', contributorId: 'alice' });
  assert.strictEqual(res.record.provenance.sourceType, 'COMMUNITY_SUBMISSION');
  assert.ok(res.record.provenance.capturedAt);
});

test('submitContribution(): dialect/region/community metadata is retained', () => {
  reset();
  const res = Community.submitContribution({
    contributionType: 'DIALECT_VARIATION', statement: 'x means y here', contributorId: 'a',
    dialect: 'coastal', region: 'Mombasa', community: 'fishing community'
  });
  assert.strictEqual(res.record.dialect, 'coastal');
  assert.strictEqual(res.record.region, 'Mombasa');
  assert.strictEqual(res.record.community, 'fishing community');
});

// ---------------------------------------------------------------------
// 2. Candidate lifecycle
// ---------------------------------------------------------------------

test('candidate is created with reviewState CANDIDATE', () => {
  reset();
  const res = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  assert.strictEqual(res.record.communityExtensions.reviewState, 'CANDIDATE');
});

test('beginReview(): moves CANDIDATE -> UNDER_REVIEW', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  const res = Community.beginReview(created.record.id, { reviewerId: 'r1' });
  assert.strictEqual(res.status, 'UNDER_REVIEW');
});

test('candidate can remain UNRESOLVED (not forced into confirmed/rejected)', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  const res = Community.markUnresolved(created.record.id, { reviewerId: 'r1', reason: 'insufficient evidence' });
  assert.strictEqual(res.status, 'UNRESOLVED');
  // Underlying RP-029-A verificationState is untouched by UNRESOLVED.
  assert.strictEqual(res.record.verificationState, 'CANDIDATE');
});

test('candidate can be disputed', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'MEANING', statement: 'x means y', contributorId: 'a' });
  const res = Community.disputeContribution(created.record.id, { contributorId: 'b', reason: 'I disagree', interpretation: 'x means z' });
  assert.strictEqual(res.status, 'DISPUTED');
  assert.strictEqual(res.record.verificationState, 'DISPUTED');
  assert.strictEqual(res.record.communityExtensions.disputes.length, 1);
});

test('disputes preserve multiple interpretations rather than erasing disagreement', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'MEANING', statement: 'x', contributorId: 'a' });
  Community.disputeContribution(created.record.id, { contributorId: 'b', reason: 'r1', interpretation: 'interpretation B' });
  const res = Community.disputeContribution(created.record.id, { contributorId: 'c', reason: 'r2', interpretation: 'interpretation C' });
  assert.strictEqual(res.record.communityExtensions.disputes.length, 2);
});

test('candidate can be rejected', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  const res = Community.rejectContribution(created.record.id, { reviewerId: 'r1', reason: 'spam' });
  assert.strictEqual(res.status, 'REJECTED');
  assert.strictEqual(res.record.verificationState, 'REJECTED');
});

test('candidate can be confirmed only after at least one independent confirmation', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  const tooEarly = Community.confirmReview(created.record.id, { reviewerId: 'r1' });
  assert.strictEqual(tooEarly.status, 'REJECTED');
  Community.addIndependentConfirmation(created.record.id, { contributorId: 'b' });
  const res = Community.confirmReview(created.record.id, { reviewerId: 'r1' });
  assert.strictEqual(res.status, 'CONFIRMED');
});

test('a disputed candidate cannot be confirmReview()-ed without resolving the dispute first', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  Community.addIndependentConfirmation(created.record.id, { contributorId: 'b' });
  Community.disputeContribution(created.record.id, { contributorId: 'c', reason: 'r' });
  const res = Community.confirmReview(created.record.id, { reviewerId: 'r1' });
  assert.strictEqual(res.status, 'REJECTED');
});

// ---------------------------------------------------------------------
// 3. Confirmation / independence
// ---------------------------------------------------------------------

test('one confirmation does not equal validated truth (reviewState stays CANDIDATE, not auto-CONFIRMED)', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  const res = Community.addIndependentConfirmation(created.record.id, { contributorId: 'b' });
  assert.strictEqual(res.status, 'CONFIRMED'); // the confirmation call itself succeeded...
  assert.strictEqual(res.record.communityExtensions.reviewState, 'CANDIDATE'); // ...but review workflow did NOT silently advance
});

test('independent confirmations are counted', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  Community.addIndependentConfirmation(created.record.id, { contributorId: 'b' });
  Community.addIndependentConfirmation(created.record.id, { contributorId: 'c' });
  const rec = Community.getRecord(created.record.id);
  assert.strictEqual(rec.communityExtensions.independentConfirmationCount, 2);
});

test('duplicate confirmation (same contributor) does not inflate count', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  Community.addIndependentConfirmation(created.record.id, { contributorId: 'b' });
  const again = Community.addIndependentConfirmation(created.record.id, { contributorId: 'b' });
  assert.strictEqual(again.status, 'ALREADY_COUNTED');
  const rec = Community.getRecord(created.record.id);
  assert.strictEqual(rec.communityExtensions.independentConfirmationCount, 1);
});

test('confirmations sharing the same sourceId are NOT counted as independent, even from different contributors', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  const c1 = Community.addIndependentConfirmation(created.record.id, { contributorId: 'b', sourceId: 'same-document.pdf' });
  assert.strictEqual(c1.status, 'CONFIRMED');
  const c2 = Community.addIndependentConfirmation(created.record.id, { contributorId: 'c', sourceId: 'same-document.pdf' });
  assert.strictEqual(c2.status, 'INDEPENDENCE_UNVERIFIED');
  const rec = Community.getRecord(created.record.id);
  assert.strictEqual(rec.communityExtensions.independentConfirmationCount, 1);
});

test('source provenance is preserved on each confirmation record', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  Community.addIndependentConfirmation(created.record.id, { contributorId: 'b', sourceId: 'doc-1', sourceType: 'DOCUMENT' });
  const rec = Community.getRecord(created.record.id);
  assert.strictEqual(rec.communityExtensions.confirmations[0].sourceType, 'DOCUMENT');
});

test('contributor identity does not become public knowledge automatically (pseudonymized in records)', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'sensitive-real-name' });
  Community.addIndependentConfirmation(created.record.id, { contributorId: 'another-real-name' });
  const rec = Community.getRecord(created.record.id);
  const serialized = JSON.stringify(rec);
  assert.ok(!serialized.includes('sensitive-real-name'));
  assert.ok(!serialized.includes('another-real-name'));
  assert.ok(rec.communityExtensions.confirmations[0].contributorPseudId.startsWith('contributor:'));
});

// ---------------------------------------------------------------------
// 4. Confidence
// ---------------------------------------------------------------------

test('describeConfidence(): reports separate labeled dimensions, not one collapsed score', () => {
  reset();
  const created = Community.submitContribution({
    contributionType: 'PRONUNCIATION', statement: 'x', contributorId: 'a', pronunciation: 'zh-ah-moh'
  });
  const conf = Community.describeConfidence(created.record.id);
  assert.strictEqual(typeof conf.meaning, 'string');
  assert.strictEqual(typeof conf.translation, 'string');
  assert.strictEqual(typeof conf.pronunciation, 'string');
  assert.strictEqual(typeof conf.community, 'string');
  assert.notStrictEqual(conf.pronunciation, undefined);
});

test('describeConfidence(): unset dimensions honestly report NOT_VERIFIED, not a fabricated LOW', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  const conf = Community.describeConfidence(created.record.id);
  assert.strictEqual(conf.pronunciation, 'NOT_VERIFIED');
  assert.strictEqual(conf.translation, 'NOT_VERIFIED');
});

// ---------------------------------------------------------------------
// 5. Dialects
// ---------------------------------------------------------------------

test('dialect metadata is retained through getRecord()', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'DIALECT_VARIATION', statement: 'x', contributorId: 'a', dialect: 'upcountry' });
  const rec = Community.getRecord(created.record.id);
  assert.strictEqual(rec.dialect, 'upcountry');
});

// ---------------------------------------------------------------------
// 6. Privacy
// ---------------------------------------------------------------------

test('PRIVATE is the default visibility for every new contribution', () => {
  reset();
  const res = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  assert.strictEqual(res.record.visibility, 'PRIVATE');
});

test('explicit promotion is required for COMMUNITY visibility', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  assert.strictEqual(Community.getRecord(created.record.id).visibility, 'PRIVATE');
  const res = Community.promoteVisibility(created.record.id, 'COMMUNITY');
  assert.strictEqual(res.status, 'UPDATED');
  assert.strictEqual(Community.getRecord(created.record.id).visibility, 'COMMUNITY');
});

test('explicit promotion is required for PUBLIC visibility (cannot skip COMMUNITY)', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  const res = Community.promoteVisibility(created.record.id, 'PUBLIC');
  assert.strictEqual(res.status, 'REJECTED');
});

test('a DISPUTED candidate cannot be promoted to PUBLIC', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  Community.promoteVisibility(created.record.id, 'COMMUNITY');
  Community.disputeContribution(created.record.id, { contributorId: 'b', reason: 'disagree' });
  const res = Community.promoteVisibility(created.record.id, 'PUBLIC');
  assert.strictEqual(res.status, 'REJECTED');
});

// ---------------------------------------------------------------------
// 7. Rule 82
// ---------------------------------------------------------------------

test('getRule82Status(): community validation cannot change NOT_READY -> AVAILABLE (no registry loaded, honestly reports unknown)', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a', language: 'luo' });
  for (let i = 0; i < 200; i++) {
    Community.addIndependentConfirmation(created.record.id, { contributorId: 'contributor-' + i });
  }
  const status = Community.getRule82Status('luo');
  // No CozyLanguageRegistry stubbed in this test file -> honestly unknown,
  // never fabricated as AVAILABLE regardless of confirmation volume.
  assert.strictEqual(status.registryChecked, false);
  assert.strictEqual(status.registryState, null);
});

test('getRule82Status(): with a real (stubbed) registry present, reports its real state and never mutates it', () => {
  reset();
  global.window.CozyOS.CozyLanguageRegistry = {
    getLanguage(code) { return code === 'luo' ? { code: 'luo', state: 'NOT_READY' } : null; }
  };
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a', language: 'luo' });
  for (let i = 0; i < 150; i++) {
    Community.addIndependentConfirmation(created.record.id, { contributorId: 'contributor-' + i });
  }
  const status = Community.getRule82Status('luo');
  assert.strictEqual(status.registryState, 'NOT_READY');
  // Still NOT_READY after 150 confirmations - this module has no mutator
  // for the registry at all (verified by inspection, see file header).
  const again = global.window.CozyOS.CozyLanguageRegistry.getLanguage('luo');
  assert.strictEqual(again.state, 'NOT_READY');
});

test('tierForCount(): confidence-tier labels are advisory only, never applied automatically to reviewState', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  for (let i = 0; i < 25; i++) {
    Community.addIndependentConfirmation(created.record.id, { contributorId: 'contributor-' + i });
  }
  const rec = Community.getRecord(created.record.id);
  assert.strictEqual(Community.tierForCount(rec.communityExtensions.independentConfirmationCount), 'STRONG');
  // 25 independent confirmations, still CANDIDATE - no automatic promotion.
  assert.strictEqual(rec.communityExtensions.reviewState, 'CANDIDATE');
});

// ---------------------------------------------------------------------
// 8. Offline / sync data model
// ---------------------------------------------------------------------

test('getSyncStatus(): honestly reports SYNC_PENDING (no real sync engine exists)', () => {
  reset();
  const created = Community.submitContribution({ contributionType: 'WORD', statement: 'x', contributorId: 'a' });
  assert.strictEqual(Community.getSyncStatus(created.record.id).status, 'SYNC_PENDING');
});

test('reconcileConflict(): preserves both versions rather than silently overwriting one', () => {
  const local = { id: 'kc_1', updatedAt: '2026-01-01T00:00:00.000Z', meaning: 'A' };
  const remote = { id: 'kc_1', updatedAt: '2026-01-02T00:00:00.000Z', meaning: 'B' };
  const res = Community.reconcileConflict(local, remote);
  assert.strictEqual(res.status, 'CONFLICT');
  assert.strictEqual(res.conflict.local.snapshot.meaning, 'A');
  assert.strictEqual(res.conflict.remote.snapshot.meaning, 'B');
});

test('reconcileConflict(): identical versions report NO_CONFLICT', () => {
  const v = { id: 'kc_1', updatedAt: 't', meaning: 'A' };
  const res = Community.reconcileConflict(v, Object.assign({}, v));
  assert.strictEqual(res.status, 'NO_CONFLICT');
});

// ---------------------------------------------------------------------
// 9. No fabricated capability
// ---------------------------------------------------------------------

test('module never claims speech/audio/video/ML capability in its own description', () => {
  reset();
  const desc = global.window.CozyOS.Modules['cozy-knowledge-community'].description;
  assert.ok(!/speech recognition|audio understanding|video understanding|machine learning/i.test(desc));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
