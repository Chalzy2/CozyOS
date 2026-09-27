/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-clarification-intelligence.test.js
 *
 * SA-8 Phase 1 (Clarification Intelligence) regression coverage.
 *
 * Universal CozyOS Voice / Universal Language directive, Section 16:
 * "Never respond with 'Bado sina jibu la kanuni.' Instead determine
 * what is missing." Real trace found window.CozyOS.SemanticIntentEngine
 * (core/living/cozy-ai-semantic-intent.js) already builds a real,
 * honest clarifying question for the "competing_goals" ambiguity case
 * (buildClarificationQuestion()) and that rule-based-conversational-provider.js
 * already surfaces it — but cozy-answer-engine.js's own final,
 * context-less fallback never consulted it, always returning the
 * generic "I don't have verified information..." text instead.
 *
 * These tests load the REAL, unmodified cozy-ai-semantic-intent.js (not
 * a fake) — the actual ambiguity detection is what this fix must
 * surface correctly — and stub only CozyIdentityFAQRouter/CozyAI so the
 * assertions are about CozyAnswerEngine's OWN new routing logic, not a
 * reimplementation of the semantic engine.
 *
 * Run with: node core/modules/intelligence/answer/tests/cozy-answer-engine-clarification-intelligence.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

const enginePath = path.join(__dirname, '..', 'cozy-answer-engine.js');
const semanticIntentPath = path.join(__dirname, '..', '..', '..', '..', 'living', 'cozy-ai-semantic-intent.js');

function freshEngine(cozyOSOverrides) {
    delete require.cache[require.resolve(enginePath)];
    delete require.cache[require.resolve(semanticIntentPath)];
    const win = { CozyOS: Object.assign({}, cozyOSOverrides) };
    global.window = win;
    require(semanticIntentPath); // real, unmodified engine
    require(enginePath);
    return win.CozyOS.CozyAnswerEngine;
}

function makeFakeRouter() {
    return { resolve: async () => ({ matched: false }) };
}
function makeFakeAINoContext() {
    return { getContext: async () => ({ success: true, found: false, results: [] }) };
}

console.log('SA-8 Phase 1 — Clarification Intelligence tests\n');

// --- A. A genuinely competing-goals question gets a real, constructed clarifying question, never the generic fallback ---
test('a competing-goals question ("Nataka kununua CozyOS, inasaidia aje?") returns a real clarifying question, not the generic "no verified information" text', async () => {
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAINoContext() });
    const result = await engine.answer('Nataka kununua CozyOS, inasaidia aje?', { language: 'sw' });
    assert.strictEqual(result.intent, 'CLARIFICATION_NEEDED');
    assert.strictEqual(result.evidenceState, 'INSUFFICIENT_DATA');
    assert.ok(!result.answer.includes("I don't have verified information"), 'must not fall back to the generic no-evidence text when a real clarifying question exists');
    assert.ok(result.answer.length > 0);
    assert.strictEqual(result.sources[0].authority, 'semantic-intent-clarification');
});

// --- B. The clarifying question text is the SAME real text SemanticIntentEngine itself would build, never a paraphrase ---
test('the returned clarifying question matches window.CozyOS.SemanticIntentEngine.analyze()\'s own real output exactly', async () => {
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAINoContext() });
    const directResult = global.window.CozyOS.SemanticIntentEngine.analyze('Nataka kununua CozyOS, inasaidia aje?', {});
    const result = await engine.answer('Nataka kununua CozyOS, inasaidia aje?', { language: 'sw' });
    assert.ok(directResult.clarification && directResult.clarification.question, 'the real engine must genuinely produce a clarification question for this input, or this test proves nothing');
    assert.strictEqual(result.answer, directResult.clarification.question);
});

// --- C. An ordinary, unambiguous question is completely unaffected (no over-triggering) ---
test('an ordinary, unambiguous question never triggers CLARIFICATION_NEEDED', async () => {
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAINoContext() });
    const result = await engine.answer('What is the weather today');
    assert.notStrictEqual(result.intent, 'CLARIFICATION_NEEDED');
});

// --- D. Regression: SemanticIntentEngine absent degrades honestly to the pre-existing generic fallback, never throws ---
test('regression: when window.CozyOS.SemanticIntentEngine is not loaded, the pre-existing generic fallback still works, no crash', async () => {
    delete require.cache[require.resolve(enginePath)];
    const win = { CozyOS: { CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAINoContext() } };
    global.window = win;
    require(enginePath); // cozy-ai-semantic-intent.js deliberately NOT required here
    const result = await win.CozyOS.CozyAnswerEngine.answer('Nataka kununua CozyOS, inasaidia aje?');
    assert.notStrictEqual(result.intent, 'CLARIFICATION_NEEDED');
    assert.ok(result.answer.includes("I don't have verified information"));
});

// --- E. Regression: a throwing SemanticIntentEngine.analyze() degrades honestly instead of propagating ---
test('regression: a throwing SemanticIntentEngine.analyze() degrades to the generic fallback instead of crashing the whole answer', async () => {
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAINoContext() });
    global.window.CozyOS.SemanticIntentEngine = { analyze: () => { throw new Error('simulated failure'); } };
    const result = await engine.answer('Nataka kununua CozyOS, inasaidia aje?');
    assert.notStrictEqual(result.intent, 'CLARIFICATION_NEEDED');
    assert.ok(result.answer.includes("I don't have verified information"));
});

// --- F. When real context/evidence DOES exist, this new step is never reached (ctxResults.length > 0 short-circuits it) ---
test('when CozyAI.getContext() finds real results, the clarification step is never consulted at all', async () => {
    const engine = freshEngine({
        CozyIdentityFAQRouter: makeFakeRouter(),
        CozyAI: { getContext: async () => ({ success: true, found: true, results: [{ content: 'Real answer content.', getter: null }] }) }
    });
    const result = await engine.answer('Nataka kununua CozyOS, inasaidia aje?');
    assert.notStrictEqual(result.intent, 'CLARIFICATION_NEEDED');
});

async function main() {
    for (const { name, fn } of pending) {
        try {
            await fn();
            console.log(`  ✓ ${name}`);
            passed++;
        } catch (err) {
            console.log(`  ✗ ${name}`);
            console.log(`      ${err.message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main();
