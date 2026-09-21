/**
 * core/living/tests/phase3-cozylearn-teaching.test.js
 * PHASE 3 — Teach Cozy / Governed Learning: CozyLearn schema extension.
 *
 * Proves: (a) createCandidate()'s new additive fields (subject/claim/
 * category/provenance/conflictsWith) never break a caller that omits
 * them — the Phase 6B tests above this file must still pass byte-for-
 * byte; (b) getTrustedTeachings()'s USER-scope actorId isolation is a
 * real, enforced fail-closed boundary, not a label; (c) checkConflict()
 * correctly flags the literal ChurchOS CAPABILITY_UNAVAILABLE test case
 * and correctly does NOT flag an unrelated or already-agreeing claim.
 *
 * Run with: node --test core/living/tests/phase3-cozylearn-teaching.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const LEARN_PATH = path.join(__dirname, '..', 'cozy-learn.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');

function freshStack(withKnowledge) {
    const paths = withKnowledge ? [KNOWLEDGE_REGISTRY_PATH, LEARN_PATH] : [LEARN_PATH];
    paths.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    paths.forEach((p) => require(p));
    return global.window.CozyOS.CozyLearn;
}

// ---- A: byte-identical behavior for pre-Phase-3 callers ----
test('A: a candidate created with no Phase 3 fields still round-trips through confirm/promote exactly as before', () => {
    const learn = freshStack(false);
    const candidate = learn.createCandidate({ observedForm: 'inasaida', canonicalForm: 'inasaidia', language: 'sw', scope: 'GLOBAL' });
    assert.equal(candidate.subject, null);
    assert.equal(candidate.claim, null);
    assert.equal(candidate.category, null);
    assert.equal(candidate.provenance, null);
    assert.equal(candidate.conflictsWith, null);
    learn.confirmCandidate(candidate.candidateId, {});
    const promotion = learn.promoteCandidate(candidate.candidateId, {});
    assert.equal(promotion.success, true);
    assert.equal(promotion.candidate.status, 'TRUSTED');
});

// ---- B: Phase 3 fields are stored and provenance.actorId is real ----
test('B: a candidate created with subject/claim/provenance stores them, and registerTrustedTeaching captures the real actorId', () => {
    const learn = freshStack(false);
    const candidate = learn.createCandidate({
        observedForm: 'ShopOS', subject: 'ShopOS', claim: 'ShopOS ships orders same day.',
        language: 'en', category: 'TAUGHT_FACT', scope: 'USER', actorId: 'user_A',
        provenance: { capturedVia: 'live-window-teach' }
    });
    assert.equal(candidate.subject, 'ShopOS');
    assert.equal(candidate.claim, 'ShopOS ships orders same day.');
    assert.equal(candidate.provenance.actorId, 'user_A');
    assert.equal(candidate.provenance.capturedVia, 'live-window-teach');

    learn.confirmCandidate(candidate.candidateId, { actorId: 'user_A', confirmedBy: 'user_A' });
    const promotion = learn.promoteCandidate(candidate.candidateId, { actorId: 'user_A', validatedBy: 'user_A', scope: 'USER' });
    assert.equal(promotion.success, true);

    const seenByOwner = learn.getTrustedTeachings('ShopOS', { scopes: ['USER'], actorId: 'user_A' });
    assert.equal(seenByOwner.length, 1);
    assert.equal(seenByOwner[0].claim, 'ShopOS ships orders same day.');
});

// ---- C: USER-scope privacy — cross-user leakage is fail-closed ----
test('C: a second user cannot see the first user\'s USER-scoped taught fact', () => {
    const learn = freshStack(false);
    const candidate = learn.createCandidate({
        observedForm: 'ShopOS', subject: 'ShopOS', claim: 'ShopOS ships orders same day.',
        language: 'en', category: 'TAUGHT_FACT', scope: 'USER', actorId: 'user_A',
        provenance: { capturedVia: 'live-window-teach' }
    });
    learn.confirmCandidate(candidate.candidateId, { actorId: 'user_A' });
    learn.promoteCandidate(candidate.candidateId, { actorId: 'user_A', scope: 'USER' });

    const seenByOtherUser = learn.getTrustedTeachings('ShopOS', { scopes: ['USER'], actorId: 'user_B' });
    assert.deepEqual(seenByOtherUser, []);

    const seenByNoActor = learn.getTrustedTeachings('ShopOS', { scopes: ['USER'] });
    assert.deepEqual(seenByNoActor, []);

    const seenByDefaultScope = learn.getTrustedTeachings('ShopOS', { actorId: 'user_A' }); // no scopes -> defaults to GLOBAL only
    assert.deepEqual(seenByDefaultScope, []);
});

// ---- D: two different users teaching the SAME subject at USER scope never collide ----
test('D: two users teaching the same subject at USER scope each see only their own claim', () => {
    const learn = freshStack(false);
    const a = learn.createCandidate({ observedForm: 'QuarryOS', subject: 'QuarryOS', claim: 'QuarryOS tracks truck loads.', language: 'en', scope: 'USER', actorId: 'user_A', provenance: { capturedVia: 'x' } });
    learn.confirmCandidate(a.candidateId, { actorId: 'user_A' });
    learn.promoteCandidate(a.candidateId, { actorId: 'user_A', scope: 'USER' });

    const b = learn.createCandidate({ observedForm: 'QuarryOS', subject: 'QuarryOS', claim: 'QuarryOS also tracks fuel usage.', language: 'en', scope: 'USER', actorId: 'user_B', provenance: { capturedVia: 'x' } });
    learn.confirmCandidate(b.candidateId, { actorId: 'user_B' });
    learn.promoteCandidate(b.candidateId, { actorId: 'user_B', scope: 'USER' });

    const seenByA = learn.getTrustedTeachings('QuarryOS', { scopes: ['USER'], actorId: 'user_A' });
    const seenByB = learn.getTrustedTeachings('QuarryOS', { scopes: ['USER'], actorId: 'user_B' });
    assert.equal(seenByA.length, 1);
    assert.equal(seenByA[0].claim, 'QuarryOS tracks truck loads.');
    assert.equal(seenByB.length, 1);
    assert.equal(seenByB[0].claim, 'QuarryOS also tracks fuel usage.');
});

// ---- E: checkConflict() — real ChurchOS CAPABILITY_UNAVAILABLE test case ----
test('E: checkConflict flags a claim contradicting ChurchOS\'s real, documented CAPABILITY_UNAVAILABLE broadcast fact', () => {
    const learn = freshStack(true);
    const knowledge = global.window.CozyOS.CozyKnowledge;
    // Sanity: the real fact must actually contain the marker this test relies on.
    const fact = knowledge.getApplicationDetailedInfoFact('ChurchOS', 'en');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.answer, /CAPABILITY_UNAVAILABLE/);

    const conflict = learn.checkConflict({ subject: 'ChurchOS', claim: 'ChurchOS supports unlimited one-to-many broadcast to all members.', language: 'en' });
    assert.equal(conflict.conflict, true);
    assert.equal(typeof conflict.existingFact, 'string');
});

test('E2: checkConflict does NOT flag a claim that already agrees the capability is unavailable', () => {
    const learn = freshStack(true);
    const conflict = learn.checkConflict({ subject: 'ChurchOS', claim: 'ChurchOS does not support unlimited broadcast yet.', language: 'en' });
    assert.equal(conflict.conflict, false);
});

test('E3: checkConflict does NOT flag an unrelated claim about a real subject', () => {
    const learn = freshStack(true);
    const conflict = learn.checkConflict({ subject: 'ChurchOS', claim: 'ChurchOS has a nice logo.', language: 'en' });
    assert.equal(conflict.conflict, false);
    assert.equal(conflict.reason, 'NO_MARKER_MATCH');
});

test('E4: checkConflict honestly no-ops for an unknown subject (no existing fact to conflict with)', () => {
    const learn = freshStack(true);
    const conflict = learn.checkConflict({ subject: 'NotARealApplication', claim: 'NotARealApplication does everything.', language: 'en' });
    assert.equal(conflict.conflict, false);
    assert.equal(conflict.reason, 'NO_EXISTING_FACT');
});

test('E5: checkConflict degrades honestly (never throws) when CozyKnowledge is not loaded', () => {
    const learn = freshStack(false);
    const conflict = learn.checkConflict({ subject: 'ChurchOS', claim: 'anything', language: 'en' });
    assert.equal(conflict.conflict, false);
    assert.equal(conflict.reason, 'NO_EXISTING_FACT');
});
