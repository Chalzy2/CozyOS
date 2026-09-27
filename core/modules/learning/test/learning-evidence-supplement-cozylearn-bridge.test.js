'use strict';

/**
 * core/modules/learning/test/learning-evidence-supplement-cozylearn-bridge.test.js
 * PHASE 5 — Continuous Learning & Knowledge Growth.
 *
 * Targets the new collectCozyLearnTaughtEvidence() bridge in
 * learning-evidence-supplement.js: a real, second, additive evidence
 * source composing window.CozyOS.CozyLearn.getTrustedTeachings() —
 * the SAME real store cozy-teach-flow.js's own answerFromTrustedTeaching()
 * already reads — now also reachable from SA-3's collectLearnedEvidence().
 *
 * Uses the real, unmodified, shared test stack (loadFullStackWithPlanner)
 * this directory's own CML/CML-6 test suites already use — no second
 * mock harness invented for this phase.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStackWithPlanner } = require('./_test-helpers');

test('collectCozyLearnTaughtEvidence() returns [] honestly when nothing has ever been taught for this term', () => {
    const { learningEvidenceSupplement } = loadFullStackWithPlanner();
    const evidence = learningEvidenceSupplement.collectCozyLearnTaughtEvidence('genuinely-untaught-term-xyz', 'actor-1');
    assert.deepEqual(evidence, []);
});

test('a real, promoted TRUSTED word-meaning teaching becomes a real, SA-1-valid VerifiedEvidence record', () => {
    const { learn, learningEvidenceSupplement, evidenceContract } = loadFullStackWithPlanner();
    const candidate = learn.createCandidate({
        observedForm: 'mahudhurio', subject: null, claim: 'attendance records for a church gathering',
        language: 'en', category: 'UNDERSTAND_CONCEPT', relationship: 'NEW_WORD', scope: 'GLOBAL', actorId: 'teacher-1',
        source: 'test', provenance: { capturedVia: 'test' },
    });
    learn.confirmCandidate(candidate.candidateId, { actorId: 'teacher-1' });
    const promoted = learn.promoteCandidate(candidate.candidateId, { actorId: 'teacher-1', validatedBy: 'teacher-1', scope: 'GLOBAL' });
    assert.equal(promoted.success, true);

    const evidence = learningEvidenceSupplement.collectCozyLearnTaughtEvidence('mahudhurio', 'any-actor');
    assert.equal(evidence.length, 1);
    const record = evidence[0];
    assert.equal(record.claim, 'attendance records for a church gathering');
    assert.equal(record.source.type, 'CozyLearn');
    assert.equal(record.verification.status, 'VERIFIED');
    // "PUBLIC" here means "already authorized for THIS requester" — see
    // collectCozyLearnTaughtEvidence()'s own header for why this is
    // accurate, not a privacy downgrade (the real access check already
    // happened inside getTrustedTeachings() before this evidence exists).
    assert.equal(record.sensitivity, 'PUBLIC');
    const validation = evidenceContract.validate(record);
    assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('multiple TRUSTED senses of the SAME term become MULTIPLE evidence records — never collapsed, never chosen among', () => {
    const { learn, learningEvidenceSupplement } = loadFullStackWithPlanner();
    function teachAndPromote(claim, actorId) {
        const c = learn.createCandidate({
            observedForm: 'kiti', subject: null, claim, language: 'en', category: 'UNDERSTAND_CONCEPT',
            relationship: 'NEW_WORD', scope: 'GLOBAL', actorId, source: 'test', provenance: { capturedVia: 'test' },
        });
        learn.confirmCandidate(c.candidateId, { actorId });
        return learn.promoteCandidate(c.candidateId, { actorId, validatedBy: actorId, scope: 'GLOBAL' });
    }
    teachAndPromote('a chair to sit on', 'teacher-a');
    teachAndPromote('a seat of authority or office', 'teacher-b');

    const evidence = learningEvidenceSupplement.collectCozyLearnTaughtEvidence('kiti', 'reader-1');
    assert.equal(evidence.length, 2);
    const claims = evidence.map((e) => e.claim).sort();
    assert.deepEqual(claims, ['a chair to sit on', 'a seat of authority or office'].sort());
});

test('a USER-scope teaching is only surfaced as evidence to its own teacher, never to a different actorId (privacy boundary preserved through the bridge)', () => {
    const { learn, learningEvidenceSupplement } = loadFullStackWithPlanner();
    const c = learn.createCandidate({
        observedForm: 'binadamu-wangu-private-term', subject: null, claim: 'a private family nickname meaning',
        language: 'en', category: 'UNDERSTAND_CONCEPT', relationship: 'NEW_WORD', scope: 'USER', actorId: 'owner-1',
        source: 'test', provenance: { capturedVia: 'test' },
    });
    learn.confirmCandidate(c.candidateId, { actorId: 'owner-1' });
    learn.promoteCandidate(c.candidateId, { actorId: 'owner-1', validatedBy: 'owner-1' });

    const ownEvidence = learningEvidenceSupplement.collectCozyLearnTaughtEvidence('binadamu-wangu-private-term', 'owner-1');
    assert.equal(ownEvidence.length, 1);
    // "PUBLIC" = already authorized for THIS requester (owner-1, whose
    // own actorId getTrustedTeachings() already matched) — see
    // collectCozyLearnTaughtEvidence()'s own header.
    assert.equal(ownEvidence[0].sensitivity, 'PUBLIC');

    const otherEvidence = learningEvidenceSupplement.collectCozyLearnTaughtEvidence('binadamu-wangu-private-term', 'someone-else');
    assert.deepEqual(otherEvidence, []);
});

test('collectLearnedEvidence() falls back to the CozyLearn bridge when the primary canonical-concept-registry path finds nothing', () => {
    const { learn, learningEvidenceSupplement } = loadFullStackWithPlanner();
    const c = learn.createCandidate({
        observedForm: 'fallback-only-term', subject: null, claim: 'a term ONLY known via CozyLearn, never via any multimodal observation',
        language: 'en', category: 'UNDERSTAND_CONCEPT', relationship: 'NEW_WORD', scope: 'GLOBAL', actorId: 'teacher-x',
        source: 'test', provenance: { capturedVia: 'test' },
    });
    learn.confirmCandidate(c.candidateId, { actorId: 'teacher-x' });
    learn.promoteCandidate(c.candidateId, { actorId: 'teacher-x', validatedBy: 'teacher-x', scope: 'GLOBAL' });

    const result = learningEvidenceSupplement.collectLearnedEvidence({ goal: 'UNDERSTAND_CONCEPT', entityValue: 'fallback-only-term', language: 'en', actorId: 'reader-x' });
    assert.equal(result.success, true);
    assert.equal(result.evidence.length, 1);
    assert.equal(result.evidence[0].claim, 'a term ONLY known via CozyLearn, never via any multimodal observation');
});

test('collectLearnedEvidence() never fabricates evidence when neither real source has anything for this entity', () => {
    const { learningEvidenceSupplement } = loadFullStackWithPlanner();
    const result = learningEvidenceSupplement.collectLearnedEvidence({ goal: 'UNDERSTAND_CONCEPT', entityValue: 'genuinely-unknown-term-abc', language: 'en', actorId: 'reader-1' });
    assert.equal(result.success, true);
    assert.deepEqual(result.evidence, []);
});
