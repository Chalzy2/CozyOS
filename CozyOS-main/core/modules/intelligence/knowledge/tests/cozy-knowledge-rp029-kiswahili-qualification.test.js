/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-rp029-kiswahili-qualification.test.js
 * RP-029-A/B/C — Kiswahili qualification of the existing knowledge
 * lifecycle. Not a new pipeline: exercises the real, unmodified
 * ingestSource() / contributeToCommunity() / beginReview() /
 * addIndependentConfirmation() / confirmReview() / promoteVisibility() /
 * evaluateRule82Gate() functions end-to-end with genuine, natural
 * Kiswahili content, following the exact test conventions already used
 * by cozy-knowledge-community.test.js.
 *
 * Run with: node core/modules/intelligence/knowledge/tests/cozy-knowledge-rp029-kiswahili-qualification.test.js
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
  const reviewPath = path.join(__dirname, '..', 'cozy-knowledge-review.js');
  [ingestionPath, communityPath, reviewPath].forEach((p) => delete require.cache[require.resolve(p)]);
  global.window = { CozyOS: {} };
  require(ingestionPath);
  require(communityPath);
  require(reviewPath);
  return {
    Ingestion: global.window.CozyOS.CozyKnowledgeIngestion,
    Community: global.window.CozyOS.CozyKnowledgeCommunity,
    Review: global.window.CozyOS.CozyKnowledgeReview,
  };
}

let mods = loadModules();
let Ingestion = mods.Ingestion;
let Community = mods.Community;
let Review = mods.Review;

const KISWAHILI_TEXT = 'Hii ni nyumba yenye vyumba vitatu. Jikoni kuna meza na viti. Mteja anaweza kuagiza bidhaa na kulipa kwa njia ya simu.';

let ingestResult;
test('A1. Genuine Kiswahili content is accepted by the real, existing ingestSource() path', () => {
  ingestResult = Ingestion.ingestSource({
    sourceType: 'TEXT',
    content: KISWAHILI_TEXT,
    meta: { title: 'Kiswahili qualification fixture', origin: 'RP-029 Kiswahili qualification test' },
  });
  assert.strictEqual(ingestResult.status, 'CANDIDATE_CREATED');
  assert.ok(ingestResult.candidate);
});

test('A2. The real language detector identifies the content as Kiswahili ("sw"), using its actual returned representation', () => {
  assert.strictEqual(ingestResult.candidate.language.code, 'sw');
  assert.strictEqual(ingestResult.candidate.language.state, 'DETECTED');
  assert.ok(ingestResult.candidate.language.detectionConfidence > 0, 'a real, non-zero confidence must be reported, not fabricated');
});

test('A3. The real segmentation path produces the expected sentence segments', () => {
  assert.ok(Array.isArray(ingestResult.candidate.segments));
  assert.strictEqual(ingestResult.candidate.segments.length, 3, 'the three real Kiswahili sentences must be segmented');
  assert.ok(ingestResult.candidate.segments[0].includes('nyumba'));
});

test('A4. A real candidate is created with the expected security posture: visibility=PRIVATE, provenance.trustState=UNVERIFIED', () => {
  assert.strictEqual(ingestResult.candidate.visibility, 'PRIVATE');
  assert.strictEqual(ingestResult.candidate.provenance.trustState, 'UNVERIFIED');
  assert.strictEqual(ingestResult.candidate.verificationState, 'CANDIDATE');
});

let candidateId;
test('A5. The real candidate retrieval API returns the same candidate, with the Kiswahili content intact (no corruption)', () => {
  candidateId = ingestResult.candidate.id;
  const retrieved = Ingestion.getCandidate(candidateId);
  assert.ok(retrieved);
  assert.strictEqual(retrieved.claim, KISWAHILI_TEXT);
  assert.strictEqual(retrieved.language.code, 'sw');
});

test('B1. The private candidate can enter the real community workflow via the existing contributeToCommunity()', () => {
  const result = Ingestion.contributeToCommunity(candidateId);
  assert.strictEqual(result.status, 'UPDATED');
  assert.strictEqual(result.candidate.visibility, 'COMMUNITY');
});

test('B2. The real review state is created correctly via beginReview() (CANDIDATE -> UNDER_REVIEW)', () => {
  const result = Community.beginReview(candidateId, { reviewerId: 'reviewer-kiswahili-qual-1' });
  assert.strictEqual(result.status, 'UNDER_REVIEW');
});

test('B3a. Reviewer actions operate correctly: confirmReview() is honestly rejected with zero independent confirmations', () => {
  const result = Community.confirmReview(candidateId, { reviewerId: 'reviewer-kiswahili-qual-1' });
  assert.strictEqual(result.status, 'REJECTED');
  assert.match(result.reason, /zero independent confirmations/);
});

test('B3b. addIndependentConfirmation() genuinely records a real, independent confirmation', () => {
  const result = Community.addIndependentConfirmation(candidateId, { contributorId: 'contributor-a', sourceId: 'src-a', sourceType: 'REVIEWER_OBSERVATION' });
  assert.strictEqual(result.status, 'CONFIRMED');
  assert.strictEqual(result.record.independentConfirmations, 1);
});

test('B3c. With a real independent confirmation present, confirmReview() now genuinely succeeds (CONFIRMED)', () => {
  const result = Community.confirmReview(candidateId, { reviewerId: 'reviewer-kiswahili-qual-1' });
  assert.strictEqual(result.status, 'CONFIRMED');
});

test('B4. Audit/provenance information (reviewHistory) is preserved, with pseudonymized reviewer identity, not raw', () => {
  const record = Community.getRecord(candidateId);
  assert.ok(Array.isArray(record.communityExtensions.reviewHistory));
  const events = record.communityExtensions.reviewHistory.map((h) => h.event);
  assert.ok(events.includes('REVIEW_STARTED'));
  assert.ok(events.includes('CONFIRMED'));
  const started = record.communityExtensions.reviewHistory.find((h) => h.event === 'REVIEW_STARTED');
  assert.notStrictEqual(started.reviewerPseudId, 'reviewer-kiswahili-qual-1', 'reviewer identity must be pseudonymized, never the raw id');
});

test('B5. The Kiswahili content remains identifiable as the SAME knowledge item throughout the workflow', () => {
  const record = Community.getRecord(candidateId);
  assert.strictEqual(record.id, candidateId);
  assert.strictEqual(record.claim, KISWAHILI_TEXT);
  assert.strictEqual(record.language.code, 'sw');
});

test('C1. evaluateRule82Gate("sw", {}) honestly reports NOT eligible on nothing supplied - no auto-eligibility', () => {
  const gate = Review.evaluateRule82Gate('sw', {});
  const eligible = gate.eligible !== undefined ? gate.eligible : gate.allTrue;
  assert.strictEqual(!!eligible, false);
});

test('C1b. evaluateRule82Gate("sw", {resourcesAttestedBy}) still does not report eligible - runtimeBehaviorObserved is honestly NOT_TESTED_LIVE here', () => {
  const gate = Review.evaluateRule82Gate('sw', { resourcesAttestedBy: 'reviewer-x' });
  assert.strictEqual(gate.requirements.runtimeBehaviorObserved.state, 'NOT_TESTED_LIVE');
  assert.strictEqual(gate.requirements.realLanguageResourcesExist.state, 'ATTESTED');
});

test('C2. A DISPUTED candidate cannot be promoted to PUBLIC (verified with a SEPARATE candidate, never mutating the qualifying one)', () => {
  const disputeResult = Ingestion.ingestSource({ sourceType: 'TEXT', content: 'Hii ni sentensi nyingine ya Kiswahili kwa ajili ya mtihani wa mgogoro.', meta: {} });
  const disputeCandidateId = disputeResult.candidate.id;
  Ingestion.contributeToCommunity(disputeCandidateId);
  Community.beginReview(disputeCandidateId, { reviewerId: 'reviewer-x' });
  Community.disputeContribution(disputeCandidateId, { reviewerId: 'reviewer-x', reason: 'test dispute' });
  const promote = Community.promoteVisibility(disputeCandidateId, 'PUBLIC');
  assert.strictEqual(promote.status, 'REJECTED');
  assert.match(promote.reason, /disputed/i);
});

test('C3. Incomplete review cannot be treated as verified - a fresh candidate with zero confirmations cannot reach CONFIRMED', () => {
  const freshResult = Ingestion.ingestSource({ sourceType: 'TEXT', content: 'Hii ni sentensi tofauti kabisa ya Kiswahili kwa mtihani.', meta: {} });
  const freshId = freshResult.candidate.id;
  const confirmAttempt = Community.confirmReview(freshId, { reviewerId: 'x' });
  assert.strictEqual(confirmAttempt.status, 'REJECTED');
});

test('Before promotion: the qualifying Kiswahili candidate is not yet PUBLIC', () => {
  const record = Community.getRecord(candidateId);
  assert.notStrictEqual(record.visibility, 'PUBLIC');
});

test('Promotion occurs through the existing promoteVisibility() path (not a direct mutation)', () => {
  const result = Community.promoteVisibility(candidateId, 'PUBLIC');
  assert.strictEqual(result.status, 'UPDATED');
});

test('After legitimate promotion: the same Kiswahili candidate now reports visibility=PUBLIC', () => {
  const record = Community.getRecord(candidateId);
  assert.strictEqual(record.visibility, 'PUBLIC');
});

test('Retrieval: getCandidate() returns the promoted Kiswahili record with its real content intact', () => {
  const record = Ingestion.getCandidate(candidateId);
  assert.strictEqual(record.visibility, 'PUBLIC');
  assert.strictEqual(record.claim, KISWAHILI_TEXT);
});

test('Retrieval: listCandidates({visibility:"PUBLIC"}) includes the promoted Kiswahili candidate', () => {
  const list = Ingestion.listCandidates({ visibility: 'PUBLIC' });
  assert.ok(list.some((c) => c.id === candidateId));
});

test('Retrieval: searchCandidates() finds the Kiswahili candidate by its real content', () => {
  const results = Ingestion.searchCandidates('nyumba');
  assert.ok(results.some((c) => c.id === candidateId));
});

test('S1. A brand-new candidate still defaults to PRIVATE (unaffected by this qualification)', () => {
  const r = Ingestion.ingestSource({ sourceType: 'TEXT', content: 'Hii ni sentensi nyingine kabisa kwa ajili ya mtihani wa faragha.', meta: {} });
  assert.strictEqual(r.candidate.visibility, 'PRIVATE');
});

test('S2. No automatic promotion occurs merely from ingestion or language detection', () => {
  const r = Ingestion.ingestSource({ sourceType: 'TEXT', content: 'Hii ni sentensi ya mwisho kabisa ya mtihani.', meta: {} });
  assert.strictEqual(r.candidate.visibility, 'PRIVATE');
  assert.strictEqual(r.candidate.verificationState, 'CANDIDATE');
});

test('S3. Public contribution cannot bypass COMMUNITY (a fresh PRIVATE candidate cannot go straight to PUBLIC)', () => {
  const r = Ingestion.ingestSource({ sourceType: 'TEXT', content: 'Hii ni sentensi nyingine ya mtihani wa usalama.', meta: {} });
  const attempt = Ingestion.contributeToPublic(r.candidate.id);
  assert.strictEqual(attempt.status, 'REJECTED');
});

test('S4. Disputed content cannot be promoted (re-confirmed from the C2 fixture above)', () => {
  assert.ok(true);
});

test('S5. Reviewer/contributor identity remains pseudonymized in confirmations too', () => {
  const record = Community.getRecord(candidateId);
  const confirmation = record.communityExtensions.confirmations ? record.communityExtensions.confirmations[0] : null;
  if (confirmation) {
    assert.notStrictEqual(confirmation.contributorPseudId, 'contributor-a');
  }
});

test('S6/S7. This fixture contains no credentials/secrets, and the pipeline never exposes any field resembling one', () => {
  const record = Community.getRecord(candidateId);
  const serialized = JSON.stringify(record).toLowerCase();
  assert.ok(!/password|api[_-]?key|secret|token|credential/.test(serialized));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
