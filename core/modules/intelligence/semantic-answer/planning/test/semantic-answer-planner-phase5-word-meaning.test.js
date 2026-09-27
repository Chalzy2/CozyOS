'use strict';

/**
 * core/modules/intelligence/semantic-answer/planning/test/semantic-answer-planner-phase5-word-meaning.test.js
 * PHASE 5 — Continuous Learning & Knowledge Growth.
 *
 * Targets the new UNDERSTAND_CONCEPT goal in semantic-answer-planner.js: a
 * question that names no known application at all ("what does X
 * mean?") must still resolve to a real, evidence-backed plan when X is
 * a genuinely TRUSTED, taught term — via extractWordMeaningTerm()
 * (bypasses application-entity resolution entirely) and
 * LearningEvidenceSupplement's new CozyLearn bridge (see the sibling
 * suite in core/modules/learning/test/).
 *
 * Uses the real, unmodified, shared test stack this directory's own
 * SA-3/CML suites already use.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadFullStackWithPlanner } = require('../../../../learning/test/_test-helpers');

function teachWordAndPromote(learn, term, meaning, opts) {
    const o = opts || {};
    const c = learn.createCandidate({
        observedForm: term, subject: null, claim: meaning, language: o.language || 'en',
        category: 'UNDERSTAND_CONCEPT', relationship: 'NEW_WORD', scope: o.scope || 'GLOBAL',
        actorId: o.actorId || 'teacher-1', source: 'test', provenance: { capturedVia: 'test' },
    });
    learn.confirmCandidate(c.candidateId, { actorId: o.actorId || 'teacher-1' });
    return learn.promoteCandidate(c.candidateId, { actorId: o.actorId || 'teacher-1', validatedBy: o.actorId || 'teacher-1', scope: o.scope || 'GLOBAL' });
}

test('extractWordMeaningTerm() pulls the real term out of "what does X mean" / "maana ya X" without fabricating one when nothing matches', () => {
    const { planner } = loadFullStackWithPlanner();
    assert.equal(planner.extractWordMeaningTerm('what does mahudhurio mean?', 'en'), 'mahudhurio');
    assert.equal(planner.extractWordMeaningTerm('maana ya mahudhurio ni nini?', 'sw'), 'mahudhurio');
    assert.equal(planner.extractWordMeaningTerm('define mahudhurio', 'en'), 'mahudhurio');
    assert.equal(planner.extractWordMeaningTerm('ChurchOS helps with attendance', 'en'), null);
});

test('a genuinely novel taught word is answerable end-to-end: teach -> planAnswer("what does X mean?") -> real VERIFIED evidence, no known application involved', () => {
    const { learn, planner } = loadFullStackWithPlanner();
    const promoted = teachWordAndPromote(learn, 'mzalendo-wa-jamii-test', 'a genuine, dedicated community volunteer', { language: 'en' });
    assert.equal(promoted.success, true);

    const result = planner.planAnswer({ text: 'What does mzalendo-wa-jamii-test mean?', actorId: 'reader-1' });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.plan.goal, 'UNDERSTAND_CONCEPT');
    assert.equal(result.plan.entity.type, 'taught-term');
    assert.equal(result.plan.entity.value, 'mzalendo-wa-jamii-test');
    assert.equal(result.diagnostics.learnedSupplementUsed, true);
    assert.ok(result.plan.claims.some((c) => c.text === 'a genuine, dedicated community volunteer'));
});

test('a Kiswahili "maana ya X ni nini" question retrieves the SAME taught meaning regardless of the language the question is asked in', () => {
    const { learn, planner } = loadFullStackWithPlanner();
    teachWordAndPromote(learn, 'mradi-jamii-test', 'a genuine community development project', { language: 'en' });

    const result = planner.planAnswer({ text: 'maana ya mradi-jamii-test ni nini?', actorId: 'reader-2' });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.plan.goal, 'UNDERSTAND_CONCEPT');
    assert.ok(result.plan.claims.some((c) => c.text === 'a genuine community development project'));
});

test('a genuinely never-taught term honestly returns NO_EVIDENCE_AVAILABLE — never a fabricated definition', () => {
    const { planner } = loadFullStackWithPlanner();
    const result = planner.planAnswer({ text: 'what does zyxwvutestword mean?', actorId: 'reader-3' });
    assert.equal(result.success, false);
    assert.equal(result.reason, 'NO_EVIDENCE_AVAILABLE');
    assert.equal(result.goal, 'UNDERSTAND_CONCEPT');
});

test('a real, known application question (e.g. "what does ChurchOS do?") is completely unaffected by the new UNDERSTAND_CONCEPT goal — still resolves via the primary application-identity path', () => {
    const { planner } = loadFullStackWithPlanner();
    const result = planner.planAnswer({ text: 'What does ChurchOS do?', actorId: 'reader-4' });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.notEqual(result.plan.goal, 'UNDERSTAND_CONCEPT');
    assert.equal(result.plan.entity.type, 'application');
    assert.equal(result.plan.entity.value, 'ChurchOS');
});

test('USER-scope taught word meaning is only answerable for its own teacher via planAnswer(), never for a different actorId', () => {
    const { learn, planner } = loadFullStackWithPlanner();
    teachWordAndPromote(learn, 'kumbukumbu-yangu-binafsi-test', 'a private personal memory term', { language: 'en', scope: 'USER', actorId: 'owner-9' });

    const ownResult = planner.planAnswer({ text: 'what does kumbukumbu-yangu-binafsi-test mean?', actorId: 'owner-9' });
    assert.equal(ownResult.success, true, JSON.stringify(ownResult));

    const otherResult = planner.planAnswer({ text: 'what does kumbukumbu-yangu-binafsi-test mean?', actorId: 'stranger-1' });
    assert.equal(otherResult.success, false);
    assert.equal(otherResult.reason, 'NO_EVIDENCE_AVAILABLE');
});
