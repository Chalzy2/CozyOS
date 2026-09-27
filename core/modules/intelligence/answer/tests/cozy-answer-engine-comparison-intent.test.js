/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-comparison-intent.test.js
 *
 * GAP 1 (Comparison Intent) regression coverage.
 *
 * Root cause this guards against (see comparison-intent.js's own
 * header for the full trace): a genuine two-application comparison
 * question was previously answered as if it were a single-application
 * question about only the FIRST-named application, because nothing in
 * CozyAnswerEngine.answer() checked for two-entity comparison intent
 * ahead of the FAQ-router / single-entity application-knowledge path.
 *
 * These tests load the REAL, unmodified comparison-intent.js detector
 * (not a fake) — the actual MEANING-level detection is what a "route
 * to the existing comparison capability" fix must get right — and
 * stub only CozyKnowledge.compareApplicationsFact() with a small,
 * honest fake mirroring its real documented {evidence, answer} shape,
 * so the assertions are about CozyAnswerEngine's OWN routing/gating
 * logic, not a reimplementation of the knowledge registry.
 *
 * Run with: node core/modules/intelligence/answer/tests/cozy-answer-engine-comparison-intent.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

const enginePath = path.join(__dirname, '..', 'cozy-answer-engine.js');
const comparisonIntentPath = path.join(__dirname, '..', '..', 'semantic-answer', 'comparison-intent.js');

function freshEngine(cozyOSOverrides) {
    delete require.cache[require.resolve(enginePath)];
    delete require.cache[require.resolve(comparisonIntentPath)];
    const win = { CozyOS: Object.assign({}, cozyOSOverrides) };
    global.window = win;
    require(comparisonIntentPath); // real, unmodified detector
    require(enginePath);
    return win.CozyOS.CozyAnswerEngine;
}

function makeFakeRouter() {
    return { resolve: async () => ({ matched: false }) };
}
function makeFakeAI() {
    return { getContext: async () => ({ success: true, found: false, results: [] }) };
}
function makeFakeKnowledge(compareApplicationsFactImpl) {
    return { compareApplicationsFact: compareApplicationsFactImpl };
}

console.log('GAP 1 — Comparison Intent tests\n');

// --- A. Kiswahili "kati ya X na Y" reaches the real comparison path ---
test('Kiswahili "Kati ya ChurchOS na ShopOS, tofauti yao ni nini?" routes to APP_COMPARISON with both entities', async () => {
    const calls = [];
    const knowledge = makeFakeKnowledge((a, b, lang) => {
        calls.push({ a, b, lang });
        return { evidence: 'VERIFIED', answer: 'Real side-by-side comparison text.' };
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyKnowledge: knowledge });
    const result = await engine.answer('Kati ya ChurchOS na ShopOS, tofauti yao ni nini?', { language: 'sw' });
    assert.strictEqual(result.intent, 'APP_COMPARISON');
    assert.strictEqual(result.responseMode, 'COMPARISON');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].a.toLowerCase(), 'churchos');
    assert.strictEqual(calls[0].b.toLowerCase(), 'shopos');
    assert.ok(result.answer.includes('Real side-by-side comparison text.'));
});

// --- B. Kiswahili "X na Y zinatofautianaje" variant ---
test('Kiswahili "ChurchOS na QuarryOS zinatofautianaje?" is also recognized', async () => {
    const calls = [];
    const knowledge = makeFakeKnowledge((a, b) => { calls.push({ a, b }); return { evidence: 'VERIFIED', answer: 'ok' }; });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyKnowledge: knowledge });
    const result = await engine.answer('ChurchOS na QuarryOS zinatofautianaje?', { language: 'sw' });
    assert.strictEqual(result.intent, 'APP_COMPARISON');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].a.toLowerCase(), 'churchos');
    assert.strictEqual(calls[0].b.toLowerCase(), 'quarryos');
});

// --- C. Kiswahili "Ni tofauti gani kati ya X na Y" ---
test('Kiswahili "Ni tofauti gani kati ya ShopOS na QuarryOS?" is recognized', async () => {
    const calls = [];
    const knowledge = makeFakeKnowledge((a, b) => { calls.push({ a, b }); return { evidence: 'VERIFIED', answer: 'ok' }; });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyKnowledge: knowledge });
    const result = await engine.answer('Ni tofauti gani kati ya ShopOS na QuarryOS?', { language: 'sw' });
    assert.strictEqual(result.intent, 'APP_COMPARISON');
    assert.strictEqual(calls.length, 1);
});

// --- D. English "How are X and Y different?" ---
test('English "How are ChurchOS and ShopOS different?" routes to APP_COMPARISON', async () => {
    const calls = [];
    const knowledge = makeFakeKnowledge((a, b) => { calls.push({ a, b }); return { evidence: 'VERIFIED', answer: 'ok' }; });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyKnowledge: knowledge });
    const result = await engine.answer('How are ChurchOS and ShopOS different?', { language: 'en' });
    assert.strictEqual(result.intent, 'APP_COMPARISON');
    assert.strictEqual(calls[0].a.toLowerCase(), 'churchos');
    assert.strictEqual(calls[0].b.toLowerCase(), 'shopos');
});

// --- E. English "What is the difference between X and Y?" ---
test('English "What is the difference between QuarryOS and ChurchOS?" routes to APP_COMPARISON', async () => {
    const calls = [];
    const knowledge = makeFakeKnowledge((a, b) => { calls.push({ a, b }); return { evidence: 'VERIFIED', answer: 'ok' }; });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyKnowledge: knowledge });
    const result = await engine.answer('What is the difference between QuarryOS and ChurchOS?', { language: 'en' });
    assert.strictEqual(result.intent, 'APP_COMPARISON');
    assert.strictEqual(calls[0].a.toLowerCase(), 'quarryos');
    assert.strictEqual(calls[0].b.toLowerCase(), 'churchos');
});

// --- F. Code-switched "Kati ya X na Y, which one handles what?" ---
test('Code-switched "Kati ya ChurchOS na ShopOS, which one handles what?" is recognized via the Kiswahili framing', async () => {
    const calls = [];
    const knowledge = makeFakeKnowledge((a, b) => { calls.push({ a, b }); return { evidence: 'VERIFIED', answer: 'ok' }; });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyKnowledge: knowledge });
    const result = await engine.answer('Kati ya ChurchOS na ShopOS, which one handles what?', { language: 'sw' });
    assert.strictEqual(result.intent, 'APP_COMPARISON');
    assert.strictEqual(calls.length, 1);
});

// --- G. Never fabricates: unresolved application name falls through honestly ---
test('a comparison question naming an unrecognized application falls through, never fabricates', async () => {
    const knowledge = makeFakeKnowledge(() => ({ evidence: 'NOT_FOUND', answer: null }));
    const router = { resolve: async () => ({ matched: false }) };
    const ai = { getContext: async () => ({ success: true, found: false, results: [] }) };
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: ai, CozyKnowledge: knowledge });
    const result = await engine.answer('What is the difference between Nonexistentapp and ShopOS?', { language: 'en' });
    assert.notStrictEqual(result.intent, 'APP_COMPARISON');
    assert.notStrictEqual(result.evidenceState, 'VERIFIED');
});

// --- H. Never introduces a ranking/winner: the composed answer is exactly what compareApplicationsFact returned ---
test('CozyAnswerEngine never adds its own ranking language on top of compareApplicationsFact()\'s answer', async () => {
    const factAnswer = 'ChurchOS supports churches. ShopOS supports retail shops. Neither is claimed to be better.';
    const knowledge = makeFakeKnowledge(() => ({ evidence: 'VERIFIED', answer: factAnswer }));
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyKnowledge: knowledge });
    const result = await engine.answer('ChurchOS vs ShopOS', { language: 'en' });
    assert.strictEqual(result.answer, factAnswer);
});

// --- I. Regression: a non-comparison identity question is unaffected ---
test('regression: a plain identity question with no comparison framing still reaches the FAQ router unchanged', async () => {
    const router = {
        resolve: async () => ({
            matched: true, success: true, isReal: true, intentId: 'COZYOS_FOUNDER',
            confidence: 1, language: 'en', answer: 'CozyOS was founded by Charles Owuor.',
            source: 'DeveloperIdentity (public profile)'
        })
    };
    const knowledge = makeFakeKnowledge(() => { throw new Error('compareApplicationsFact should never be called for a non-comparison question'); });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: makeFakeAI(), CozyKnowledge: knowledge });
    const result = await engine.answer('Who founded CozyOS?');
    assert.strictEqual(result.intent, 'COZYOS_FOUNDER');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
});

// --- J. Regression: comparison-intent module absent degrades honestly (no crash) ---
test('regression: when window.CozyOS.ComparisonIntent is not loaded, answer() degrades honestly instead of throwing', async () => {
    delete require.cache[require.resolve(enginePath)];
    const win = { CozyOS: { CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI() } };
    global.window = win;
    require(enginePath); // comparison-intent.js deliberately NOT required here
    const result = await win.CozyOS.CozyAnswerEngine.answer('Kati ya ChurchOS na ShopOS, tofauti yao ni nini?', { language: 'sw' });
    assert.notStrictEqual(result.intent, 'APP_COMPARISON');
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
