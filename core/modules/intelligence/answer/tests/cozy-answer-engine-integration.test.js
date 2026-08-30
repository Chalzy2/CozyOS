/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-integration.test.js
 * Micro-Milestone H — REAL integration test.
 *
 * Unlike cozy-answer-engine.test.js (which stubs the composed
 * authorities to isolate the AnswerEngine's own logic), this file
 * loads the ACTUAL, unmodified:
 *   - core/modules/knowledge/cozyos-identity-faq-router.js
 *   - core/modules/intelligence/cozy-ai.js  (getContext)
 *   - core/modules/intelligence/knowledge/cozy-knowledge-registry.js
 *   - core/modules/intelligence/answer/cozy-answer-engine.js
 * and only stubs the lowest-level leaf (DeveloperIdentity's data
 * methods) that those real files themselves depend on — proving the
 * real question -> real router/getContext -> real AnswerEngine chain
 * actually works end to end, not just against fakes.
 *
 * Run with: node core/modules/intelligence/answer/tests/cozy-answer-engine-integration.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const ROUTER_PATH = path.join(ROOT, 'core', 'modules', 'knowledge', 'cozyos-identity-faq-router.js');
const KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const COZY_AI_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'cozy-ai.js');
const ANSWER_ENGINE_PATH = path.join(__dirname, '..', 'cozy-answer-engine.js');

function freshRealStack() {
    [ROUTER_PATH, KNOWLEDGE_PATH, COZY_AI_PATH, ANSWER_ENGINE_PATH].forEach((p) => {
        delete require.cache[require.resolve(p)];
    });

    // Minimal, realistic leaf stub — only DeveloperIdentity, the one
    // real dependency the router's own header documents it reads.
    // Every method here mirrors the REAL method names/shapes the
    // router calls (confirmed by reading cozyos-identity-faq-router.js
    // and cozyai-identity.js before writing this).
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

    require(ROUTER_PATH);      // registers window.CozyOS.CozyIdentityFAQRouter (REAL)
    require(KNOWLEDGE_PATH);   // registers window.CozyOS.CozyKnowledge (REAL)
    require(COZY_AI_PATH);     // registers window.CozyOS.CozyAI (REAL, incl. getContext)
    require(ANSWER_ENGINE_PATH); // registers window.CozyOS.CozyAnswerEngine

    return win.CozyOS.CozyAnswerEngine;
}

console.log('Micro-Milestone H \u2014 REAL integration tests (real router + real getContext)\n');

test('REAL: "Who founded CozyOS?" resolves through the real identity FAQ router', async () => {
    const engine = freshRealStack();
    const result = await engine.answer('Who founded CozyOS?');
    assert.strictEqual(result.intent, 'COZYOS_FOUNDER');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.ok(result.answer.includes('Charles Owuor'));
    assert.strictEqual(result.sources[0].authority, 'identity-faq-router');
});

test('REAL: "What is CozyOS\'s vision?" resolves through the real router, FACT mode', async () => {
    const engine = freshRealStack();
    const result = await engine.answer("What is CozyOS's vision?");
    assert.strictEqual(result.intent, 'COZYOS_VISION');
    assert.strictEqual(result.responseMode, 'FACT');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.ok(result.answer.toLowerCase().includes('african languages'));
});

test('REAL: "Why is CozyOS different from other operating systems?" -> COMPARISON via real router', async () => {
    const engine = freshRealStack();
    const result = await engine.answer('Why is CozyOS different from other operating systems?');
    assert.strictEqual(result.intent, 'COZYOS_DIFFERENTIATION');
    assert.strictEqual(result.responseMode, 'COMPARISON');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
});

test('REAL: an unmatched, unrelated question falls through the real router into real getContext with no crash', async () => {
    const engine = freshRealStack();
    const result = await engine.answer('What is the weather in Nairobi today?');
    assert.strictEqual(result.evidenceState, 'INSUFFICIENT_DATA');
    assert.strictEqual(result.responseMode, 'INSUFFICIENT_EVIDENCE');
});

test('REAL: name-meaning question is an honest disclosed gap (isReal:false in the real router), not fabricated', async () => {
    const engine = freshRealStack();
    const result = await engine.answer('What does the name CozyOS mean?');
    assert.strictEqual(result.intent, 'COZYOS_NAME_MEANING');
    assert.strictEqual(result.evidenceState, 'INSUFFICIENT_DATA');
    assert.ok(/not documented/i.test(result.answer));
});

async function main() {
    for (const { name, fn } of pending) {
        try {
            await fn();
            console.log(`  \u2713 ${name}`);
            passed++;
        } catch (err) {
            console.log(`  \u2717 ${name}`);
            console.log(`      ${err.stack || err.message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main();
