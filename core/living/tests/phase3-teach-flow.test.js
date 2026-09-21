/**
 * core/living/tests/phase3-teach-flow.test.js
 * PHASE 3 — Teach Cozy / Governed Learning: CozyTeachFlow orchestrator.
 *
 * Proves the full, real conversational sequence: an explicit teaching
 * statement creates a CANDIDATE and asks for confirmation; "yes"
 * confirms+promotes to TRUSTED; "no" rejects; an unclear reply re-asks
 * without losing the pending candidate; a conflicting claim about a
 * real, documented CAPABILITY_UNAVAILABLE fact is never recorded at
 * all; and a later, unrelated question can be answered from a
 * previously TRUSTED taught claim.
 *
 * Run with: node --test core/living/tests/phase3-teach-flow.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const LEARN_PATH = path.join(__dirname, '..', 'cozy-learn.js');
const INTENT_PATH = path.join(__dirname, '..', 'cozy-teach-intent.js');
const FLOW_PATH = path.join(__dirname, '..', 'cozy-teach-flow.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(__dirname, '..', '..', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');

function freshStack(withKnowledge) {
    const paths = [LEARN_PATH, INTENT_PATH, FLOW_PATH];
    if (withKnowledge) paths.unshift(KNOWLEDGE_REGISTRY_PATH);
    paths.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    paths.forEach((p) => require(p));
    global.window.CozyOS.listApplications = () => ([
        { id: 'churchos', name: 'ChurchOS' },
        { id: 'shopos', name: 'ShopOS' }
    ]);
    return global.window.CozyOS.CozyTeachFlow;
}

// ---- A: full create -> confirm -> promote (TRUSTED) ----
test('A: an explicit teaching statement creates a candidate and asks for confirmation; "yes" promotes it to TRUSTED', () => {
    const flow = freshStack(false);
    const turn1 = flow.processTurn('I want to teach you that ShopOS ships orders same day', { actorId: 'user_A', language: 'en', teachConversationState: null });
    assert.equal(turn1.matched, true);
    assert.equal(turn1.evidence, 'CANDIDATE_PENDING');
    assert.match(turn1.content, /ShopOS ships orders same day/);
    assert.equal(typeof turn1.updatedConversationState.pendingCandidateId, 'string');

    const turn2 = flow.processTurn('yes', { actorId: 'user_A', language: 'en', teachConversationState: turn1.updatedConversationState });
    assert.equal(turn2.matched, true);
    assert.equal(turn2.evidence, 'TRUSTED');
    assert.equal(turn2.updatedConversationState, null);
});

// ---- B: "no" rejects, never promotes ----
test('B: a "no" reply rejects the candidate and clears pending state', () => {
    const flow = freshStack(false);
    const turn1 = flow.processTurn('I want to teach you that ShopOS ships orders same day', { actorId: 'user_A', language: 'en', teachConversationState: null });
    const turn2 = flow.processTurn('no', { actorId: 'user_A', language: 'en', teachConversationState: turn1.updatedConversationState });
    assert.equal(turn2.matched, true);
    assert.equal(turn2.evidence, 'REJECTED');
    assert.equal(turn2.updatedConversationState, null);

    // The rejected claim must never be answerable later.
    const answered = flow.answerFromTrustedTeaching('ShopOS', { actorId: 'user_A' });
    assert.equal(answered, null);
});

// ---- C: an unclear reply re-asks, never silently drops the pending candidate ----
test('C: an unclear reply keeps the SAME pending candidate and re-asks', () => {
    const flow = freshStack(false);
    const turn1 = flow.processTurn('I want to teach you that ShopOS ships orders same day', { actorId: 'user_A', language: 'en', teachConversationState: null });
    const turn2 = flow.processTurn('maybe idk', { actorId: 'user_A', language: 'en', teachConversationState: turn1.updatedConversationState });
    assert.equal(turn2.matched, true);
    assert.equal(turn2.evidence, 'CANDIDATE_PENDING');
    assert.deepEqual(turn2.updatedConversationState, turn1.updatedConversationState);

    const turn3 = flow.processTurn('yes', { actorId: 'user_A', language: 'en', teachConversationState: turn2.updatedConversationState });
    assert.equal(turn3.evidence, 'TRUSTED');
});

// ---- D: a genuinely unrelated turn is a true no-op ----
test('D: a message with no teaching intent and no pending candidate is matched:false', () => {
    const flow = freshStack(false);
    const r = flow.processTurn('What is ShopOS?', { actorId: 'user_A', language: 'en', teachConversationState: null });
    assert.equal(r.matched, false);
});

// ---- E: conflict with a real, documented CAPABILITY_UNAVAILABLE fact — never recorded ----
test('E: a claim conflicting with ChurchOS\'s real documented capability limit is disclosed, never turned into a candidate', () => {
    const flow = freshStack(true);
    const r = flow.processTurn('I want to teach you that ChurchOS supports unlimited one-to-many broadcast to all members', { actorId: 'user_A', language: 'en', teachConversationState: null });
    assert.equal(r.matched, true);
    assert.equal(r.evidence, 'CONFLICT_DETECTED');
    assert.equal(r.updatedConversationState, null);

    // Confirms nothing was actually recorded to be found later.
    const answered = flow.answerFromTrustedTeaching('ChurchOS', { actorId: 'user_A' });
    assert.equal(answered, null);
});

// ---- F: a generic claim with no resolvable subject still teaches (subject stays null) ----
test('F: a claim naming no known application still creates a candidate with subject null', () => {
    const flow = freshStack(false);
    const r = flow.processTurn('I want to teach you that our office closes at 5pm on Fridays', { actorId: 'user_A', language: 'en', teachConversationState: null });
    assert.equal(r.matched, true);
    assert.equal(r.evidence, 'CANDIDATE_PENDING');
});

// ---- G: EXISTING COZYAI USES APPROVED KNOWLEDGE — a later, different question is answered from the TRUSTED claim ----
test('G: after promotion, a later unrelated turn can retrieve the TRUSTED taught claim for the same actor', () => {
    const flow = freshStack(false);
    const turn1 = flow.processTurn('I want to teach you that ShopOS ships orders same day', { actorId: 'user_A', language: 'en', teachConversationState: null });
    flow.processTurn('yes', { actorId: 'user_A', language: 'en', teachConversationState: turn1.updatedConversationState });

    const answered = flow.answerFromTrustedTeaching('ShopOS', { actorId: 'user_A' });
    assert.notEqual(answered, null);
    assert.equal(answered.claim, 'ShopOS ships orders same day');
    assert.equal(answered.scope, 'USER');

    // A different user must not see it (privacy — see phase3-cozylearn-teaching.test.js's own suite C/D for the CozyLearn-level proof).
    const answeredOther = flow.answerFromTrustedTeaching('ShopOS', { actorId: 'user_B' });
    assert.equal(answeredOther, null);
});
