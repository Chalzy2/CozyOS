'use strict';

/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-domain4a-routing-fix.test.js
 *
 * Domain 4A (AI Integration discovery) — real-stack integration proof.
 * Loads the ACTUAL, unmodified production composition:
 *   CozyIdentityFAQRouter -> CozyAI.getContext() -> CozyAnswerEngine
 * (same real files/technique as cozy-answer-engine-integration.test.js)
 * and proves the four required Domain 4A questions resolve exactly as
 * the discovery report specifies: founder and origin correctly
 * separated and VERIFIED from their real canonical source
 * (DeveloperIdentity.answerWhoCreatedYou()/answerWhyCreated() — never
 * duplicated here), and the two genuine knowledge gaps (a plain
 * definition, and an applications list) honestly report
 * INSUFFICIENT_DATA rather than a fabricated or wrong-topic answer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const ROUTER_PATH = path.join(ROOT, 'core', 'modules', 'knowledge', 'cozyos-identity-faq-router.js');
const KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const COZY_AI_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'cozy-ai.js');
const ANSWER_ENGINE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'answer', 'cozy-answer-engine.js');

function freshRealStack() {
    [ROUTER_PATH, KNOWLEDGE_PATH, COZY_AI_PATH, ANSWER_ENGINE_PATH].forEach((p) => {
        delete require.cache[require.resolve(p)];
    });

    // Same minimal, realistic DeveloperIdentity leaf stub already
    // established in cozy-answer-engine-integration.test.js — this file
    // introduces no new/duplicate answer content of its own.
    const DeveloperIdentity = Object.freeze({
        answerWhoCreatedYou: () => ({ known: true, answer: 'CozyOS and CozyAI were founded by Charles Owuor.' }),
        answerWhyCreated: () => ({ known: true, answer: 'CozyOS started from real offline-access and language-access problems Charles saw firsthand.' }),
        getOfficialName: () => 'Charles Owuor',
        getKnownAs: () => ['Charles'],
        getCountry: () => 'Kenya',
        getRoles: () => ['Founder', 'Engineer'],
        getMission: () => ['work offline-first where possible', 'support many languages', 'be community-led'],
        getVision: () => 'To help preserve African languages and knowledge through technology.',
        getCorePhilosophy: () => ({ statement: 'AI should not just teach people — people should teach AI.' }),
        getDesignPrinciples: () => ['strengthen communities', 'preserve culture', 'respect every language'],
        getLongTermGoal: () => 'To build one of the largest community-led archives of African knowledge.',
        getCommunityInitiative: () => ({ summary: 'Anyone can contribute.', teachCozyAIExamples: ['10 words', 'a proverb'], note: 'Small contributions add up.' })
    });

    const win = { CozyOS: { DeveloperIdentity } };
    global.window = win;

    require(ROUTER_PATH);
    require(KNOWLEDGE_PATH);
    require(COZY_AI_PATH);
    require(ANSWER_ENGINE_PATH);

    return win.CozyOS.CozyAnswerEngine;
}

test('REAL STACK: "Who founded CozyOS?" -> COZYOS_FOUNDER, VERIFIED, from the real canonical source', async () => {
    const engine = freshRealStack();
    const result = await engine.answer('Who founded CozyOS?');
    assert.equal(result.intent, 'COZYOS_FOUNDER');
    assert.equal(result.evidenceState, 'VERIFIED');
    assert.ok(result.answer.includes('Charles Owuor'));
});

test('REAL STACK: "What was CozyOS started for?" -> COZYOS_ORIGIN, VERIFIED (the original reported bug, fixed)', async () => {
    const engine = freshRealStack();
    const result = await engine.answer('What was CozyOS started for?');
    assert.equal(result.intent, 'COZYOS_ORIGIN');
    assert.equal(result.evidenceState, 'VERIFIED');
    assert.ok(result.answer.includes('offline-access'));
    // Founder and origin must remain distinct answers, never conflated.
    assert.ok(!result.answer.includes('Charles Owuor'));
});

test('REAL STACK: "What is CozyOS?" -> honest INSUFFICIENT_DATA (no canonical definition fact exists yet)', async () => {
    const engine = freshRealStack();
    const result = await engine.answer('What is CozyOS?');
    assert.equal(result.evidenceState, 'INSUFFICIENT_DATA');
    assert.notEqual(result.intent, 'COZYOS_FOUNDER');
    assert.notEqual(result.intent, 'COZYOS_ORIGIN');
});

test('REAL STACK: "What applications are part of CozyOS?" -> honest INSUFFICIENT_DATA (Domain 4I scope, not this router)', async () => {
    const engine = freshRealStack();
    const result = await engine.answer('What applications are part of CozyOS?');
    assert.equal(result.evidenceState, 'INSUFFICIENT_DATA');
    assert.notEqual(result.intent, 'COZYOS_FOUNDER');
});
