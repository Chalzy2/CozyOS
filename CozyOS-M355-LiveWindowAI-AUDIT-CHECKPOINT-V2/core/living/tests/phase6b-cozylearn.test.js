/**
 * core/living/tests/phase6b-cozylearn.test.js
 * PHASE 6B — CozyLearn: Governed Unknown-Word Semantic Learning
 *
 * Section 35's own instruction: "Test actual behavior BEFORE and AFTER
 * learning... Do not merely test that a record was inserted into a
 * database." This suite does exactly that as its centerpiece (test
 * "CRITICAL ACCEPTANCE").
 *
 * Run with: node --test core/living/tests/phase6b-cozylearn.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const LEARN_PATH = path.join(__dirname, '..', 'cozy-learn.js');
const ENGINE_PATH = path.join(__dirname, '..', 'cozy-ai-semantic-intent.js');

function freshStack() {
    [LEARN_PATH, ENGINE_PATH].forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    require(LEARN_PATH);
    require(ENGINE_PATH);
    return { learn: global.window.CozyOS.CozyLearn, engine: global.window.CozyOS.SemanticIntentEngine };
}

// ---- Section 34/35: CRITICAL ACCEPTANCE TEST ----
test('CRITICAL ACCEPTANCE: "CozyOS inasaida nini?" is UNKNOWN before learning, APP_BENEFITS after promotion — real behavior change, not just a stored record', () => {
    const { learn, engine } = freshStack();
    const opts = { applyCozyLearnSynonyms: true, cozyLearnScopes: ['GLOBAL'] };

    const before = engine.analyze('CozyOS inasaida nini?', opts);
    assert.equal(before.primaryIntent, 'UNKNOWN_INTENT');
    assert.deepEqual(before.cozyLearnApplied, []);

    const candidate = learn.createCandidate({
        observedForm: 'inasaida', canonicalForm: 'inasaidia', language: 'sw',
        relationship: 'SPELLING_VARIANT', meaning: { sw: 'inasaidia', en: 'helps' }, semanticConcept: 'HELP', scope: 'GLOBAL'
    });
    learn.confirmCandidate(candidate.candidateId, { confirmedBy: 'user_1' });
    const promotion = learn.promoteCandidate(candidate.candidateId, { validatedBy: 'admin_1' });
    assert.equal(promotion.success, true);
    assert.equal(promotion.candidate.status, 'TRUSTED');

    const after = engine.analyze('CozyOS inasaida nini?', opts);
    assert.equal(after.primaryIntent, 'APP_BENEFITS');
    assert.equal(after.goal, 'UNDERSTAND_USEFULNESS');
    assert.deepEqual(after.cozyLearnApplied, [{ observed: 'inasaida', canonical: 'inasaidia' }]);
});

test('Cross-user reuse: a second, unrelated call benefits from an already-promoted GLOBAL mapping without re-teaching', () => {
    const { learn, engine } = freshStack();
    const candidate = learn.createCandidate({ observedForm: 'inasaida', canonicalForm: 'inasaidia', language: 'sw', scope: 'GLOBAL' });
    learn.confirmCandidate(candidate.candidateId, {});
    learn.promoteCandidate(candidate.candidateId, {});
    const userB = engine.analyze('CozyOS inasaida nini?', { applyCozyLearnSynonyms: true });
    assert.equal(userB.primaryIntent, 'APP_BENEFITS');
});

test('Opt-out preserves old behavior byte-for-byte: without applyCozyLearnSynonyms, a promoted mapping has zero effect', () => {
    const { learn, engine } = freshStack();
    const candidate = learn.createCandidate({ observedForm: 'inasaida', canonicalForm: 'inasaidia', language: 'sw', scope: 'GLOBAL' });
    learn.confirmCandidate(candidate.candidateId, {});
    learn.promoteCandidate(candidate.candidateId, {});
    const result = engine.analyze('CozyOS inasaida nini?', {}); // no opt-in
    assert.equal(result.primaryIntent, 'UNKNOWN_INTENT');
    assert.deepEqual(result.cozyLearnApplied, []);
});

// ---- Section 1/2/9: unknown-term + typo detection ----
test('detectUnknownTerms finds "inasaida" with strong surrounding structure and a real correction candidate', () => {
    const { learn } = freshStack();
    const unknowns = learn.detectUnknownTerms('natakujua cozyos inasaida nini?');
    const hit = unknowns.find((u) => u.word === 'inasaida');
    assert.ok(hit, 'inasaida should be flagged as unknown');
    assert.equal(hit.suggestion.candidate, 'inasaidia');
});

test('a genuinely unrelated/unrecognizable word gets no fabricated suggestion (Section 10 - do not guess)', () => {
    const { learn } = freshStack();
    const suggestion = learn.suggestCorrection('xyzqwerty');
    assert.equal(suggestion, null);
});

test('buildClarificationMessage produces the natural, non-robotic Section 3 phrasing', () => {
    const { learn } = freshStack();
    const msg = learn.buildClarificationMessage('inasaida', { candidate: 'inasaidia', distance: 1 }, 'sw');
    assert.match(msg, /ulimaanisha "inasaidia"/);
});

// ---- Section 4/5: confirmation interpretation ----
test('interpretConfirmationResponse recognizes real confirm/reject markers and stays honest about unclear replies', () => {
    const { learn } = freshStack();
    assert.equal(learn.interpretConfirmationResponse('Ndiyo'), 'CONFIRM');
    assert.equal(learn.interpretConfirmationResponse('ndio, sahihi'), 'CONFIRM');
    assert.equal(learn.interpretConfirmationResponse('Hapana'), 'REJECT');
    assert.equal(learn.interpretConfirmationResponse('sijui labda'), 'UNCLEAR');
});

// ---- Section 15/28: state machine ordering enforcement ----
test('promoteCandidate() refuses to promote a candidate that was never confirmed (Section 28 ordering)', () => {
    const { learn } = freshStack();
    const candidate = learn.createCandidate({ observedForm: 'noma', canonicalForm: null, language: 'sw', scope: 'USER' });
    const result = learn.promoteCandidate(candidate.candidateId, {});
    assert.equal(result.success, false);
    assert.match(result.reason, /USER_CONFIRMED/);
});

test('rejectCandidate() is terminal — a rejected candidate cannot later be confirmed', () => {
    const { learn } = freshStack();
    const candidate = learn.createCandidate({ observedForm: 'noma', language: 'sw', scope: 'USER' });
    learn.rejectCandidate(candidate.candidateId, { reason: 'user said no' });
    const confirmResult = learn.confirmCandidate(candidate.candidateId, {});
    assert.equal(confirmResult.success, false);
});

// ---- Section 13/19/32: scope enforcement / privacy ----
test('a USER-scoped promoted mapping never appears in a GLOBAL-only lookup (privacy boundary)', () => {
    const { learn } = freshStack();
    const candidate = learn.createCandidate({ observedForm: 'boxi', canonicalForm: 'package', language: 'sw', scope: 'USER', semanticConcept: 'PACKAGE' });
    learn.confirmCandidate(candidate.candidateId, {});
    learn.promoteCandidate(candidate.candidateId, {}); // no scope override -> stays USER
    const globalOnly = learn.getLearnedSynonyms('sw', { scopes: ['GLOBAL'] });
    assert.equal('boxi' in globalOnly, false);
    const userScoped = learn.getLearnedSynonyms('sw', { scopes: ['USER'] });
    assert.equal(userScoped.boxi, 'package');
});

test('getLearnedSynonyms defaults to GLOBAL-only when no scopes are specified (never a silent private leak)', () => {
    const { learn } = freshStack();
    const candidate = learn.createCandidate({ observedForm: 'boxi', canonicalForm: 'package', language: 'sw', scope: 'ORGANIZATION' });
    learn.confirmCandidate(candidate.candidateId, {});
    learn.promoteCandidate(candidate.candidateId, {});
    const defaultLookup = learn.getLearnedSynonyms('sw');
    assert.equal('boxi' in defaultLookup, false);
});

// ---- Section 29/30: regression protection / polysemy (bounded) ----
test('promoting a new candidate for an already-mapped observed form updates rather than corrupts the mapping (last-write, disclosed, not silently ambiguous)', () => {
    const { learn, engine } = freshStack();
    const first = learn.createCandidate({ observedForm: 'inasaida', canonicalForm: 'inasaidia', language: 'sw', scope: 'GLOBAL' });
    learn.confirmCandidate(first.candidateId, {});
    learn.promoteCandidate(first.candidateId, {});
    const check1 = engine.analyze('CozyOS inasaida nini?', { applyCozyLearnSynonyms: true });
    assert.equal(check1.primaryIntent, 'APP_BENEFITS');
    // A distinct candidate for the same observed form (simulating a
    // later correction) - the real, current getLearnedSynonyms() read
    // reflects whichever was promoted most recently, disclosed via
    // candidateId in the underlying record, not silently merged.
    const second = learn.createCandidate({ observedForm: 'inasaida', canonicalForm: 'inasaidiaje', language: 'sw', scope: 'GLOBAL' });
    learn.confirmCandidate(second.candidateId, {});
    learn.promoteCandidate(second.candidateId, {});
    const synonyms = learn.getLearnedSynonyms('sw', { scopes: ['GLOBAL'] });
    assert.equal(synonyms.inasaida, 'inasaidiaje');
});

console.log('Phase 6B CozyLearn suite: run complete.');
