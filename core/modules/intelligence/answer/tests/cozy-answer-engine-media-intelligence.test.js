/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-media-intelligence.test.js
 *
 * Universal CozyOS Voice — Application Integration Matrix, Media
 * Intelligence row. Real trace (VOICE-APPLICATION-INTEGRATION-AUDIT.md
 * §5.4) found window.CozyOS.CozyMediaIntelligence.answerMediaQuestion()
 * already produces real, disclosed, non-fabricated evidence but had
 * zero callers from the answer chain — only its own standalone
 * dashboard. These tests cover CozyAnswerEngine's own new composition
 * step: MEDIA_INTELLIGENCE_PATTERN gating, honest sentence
 * construction from only the real fields answerMediaQuestion() itself
 * returns, and honest fall-through when no real evidence exists.
 *
 * A small, honest fake of CozyMediaIntelligence is used (mirroring its
 * real, documented {status, answer, matchedType, matchedLanguage,
 * resultCount} shape) — the real search/keyword-matching logic inside
 * answerMediaQuestion() itself is exercised by
 * core/modules/intelligence/media/tests/cozy-media-intelligence.test.js,
 * not re-tested here; these tests are about CozyAnswerEngine's OWN
 * routing/gating/composition logic.
 *
 * Run with: node core/modules/intelligence/answer/tests/cozy-answer-engine-media-intelligence.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

const enginePath = path.join(__dirname, '..', 'cozy-answer-engine.js');

function freshEngine(cozyOSOverrides) {
    delete require.cache[require.resolve(enginePath)];
    const win = { CozyOS: Object.assign({}, cozyOSOverrides) };
    global.window = win;
    require(enginePath);
    return win.CozyOS.CozyAnswerEngine;
}

function makeFakeRouter() {
    return { resolve: async () => ({ matched: false }) };
}
function makeFakeAI() {
    return { getContext: async () => ({ success: true, found: false, results: [] }) };
}
function makeFakeMediaIntelligence(answerMediaQuestionImpl) {
    return { answerMediaQuestion: answerMediaQuestionImpl };
}

console.log('Media Intelligence evidence-source composition tests\n');

// --- A. A real "FOUND" result reaches the Live Window as MEDIA_INTELLIGENCE ---
test('"Show me the healing testimonies" with a FOUND result routes to MEDIA_INTELLIGENCE with an honest sentence', async () => {
    const calls = [];
    const mi = makeFakeMediaIntelligence((q) => {
        calls.push(q);
        return { status: 'OK', answer: 'FOUND', matchedType: 'HEALING', matchedLanguage: null, resultCount: 3 };
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyMediaIntelligence: mi });
    const result = await engine.answer('Do you have any healing testimonies?');
    assert.strictEqual(result.intent, 'MEDIA_INTELLIGENCE');
    assert.strictEqual(result.responseMode, 'FACT');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.strictEqual(calls.length, 1);
    assert.ok(result.answer.includes('3'));
    assert.ok(result.answer.toLowerCase().includes('healing'));
    assert.strictEqual(result.sources[0].authority, 'media-intelligence');
});

// --- B. matchedLanguage-only result is reported honestly (raw code, no invented display name) ---
test('a FOUND result with only matchedLanguage reports the raw language code, never a fabricated display name', async () => {
    const mi = makeFakeMediaIntelligence(() => ({ status: 'OK', answer: 'FOUND', matchedType: null, matchedLanguage: 'sw', resultCount: 1 }));
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyMediaIntelligence: mi });
    const result = await engine.answer('Any sermon recordings available?');
    assert.strictEqual(result.intent, 'MEDIA_INTELLIGENCE');
    assert.ok(result.answer.includes('"sw"'));
    assert.ok(result.answer.includes('1 result'));
    assert.ok(!result.answer.includes('Swahili'), 'must never guess a display name not actually returned by the real authority');
});

// --- C. "NOT_AVAILABLE" (no indexed evidence) falls through honestly, never fabricates a found result ---
test('answer:"NOT_AVAILABLE" falls through to the rest of the chain rather than claiming evidence exists', async () => {
    const mi = makeFakeMediaIntelligence(() => ({ status: 'OK', answer: 'NOT_AVAILABLE', matchedType: 'SERMON', matchedLanguage: null }));
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyMediaIntelligence: mi });
    const result = await engine.answer('Do you have any sermon recordings?');
    assert.notStrictEqual(result.intent, 'MEDIA_INTELLIGENCE');
});

// --- D. "UNKNOWN" (no recognizable type/language) also falls through honestly ---
test('answer:"UNKNOWN" falls through to the rest of the chain', async () => {
    const mi = makeFakeMediaIntelligence(() => ({ status: 'OK', answer: 'UNKNOWN' }));
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyMediaIntelligence: mi });
    const result = await engine.answer('Do you have any testimony recordings?');
    assert.notStrictEqual(result.intent, 'MEDIA_INTELLIGENCE');
});

// --- E. Narrow gate: ordinary platform questions never reach answerMediaQuestion() at all ---
test('an ordinary platform question ("What is CozyOS for?") never calls answerMediaQuestion() — the narrow gate excludes it', async () => {
    let called = false;
    const mi = makeFakeMediaIntelligence(() => { called = true; return { status: 'OK', answer: 'UNKNOWN' }; });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyMediaIntelligence: mi });
    await engine.answer('What is CozyOS for?');
    assert.strictEqual(called, false, 'MEDIA_INTELLIGENCE_PATTERN must not match ordinary platform questions');
});

// --- F. Documented risk: a RESEARCH_TYPES word this file's own comment
//        flags as ordinary English (e.g. "meeting"/"event"/"teaching")
//        must NOT alone trigger this path — the gate requires
//        unambiguous media-research vocabulary, not those generic words. ---
test('a question containing only a generic RESEARCH_TYPES word ("meeting") never calls answerMediaQuestion()', async () => {
    let called = false;
    const mi = makeFakeMediaIntelligence(() => { called = true; return { status: 'OK', answer: 'FOUND', resultCount: 99 }; });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyMediaIntelligence: mi });
    await engine.answer('When is our next meeting scheduled?');
    assert.strictEqual(called, false, 'a bare generic word must not hijack an unrelated question into a media-intelligence answer');
});

// --- G. Regression: CozyMediaIntelligence absent degrades honestly (no crash) ---
test('regression: when window.CozyOS.CozyMediaIntelligence is not loaded, a media-shaped question degrades honestly instead of throwing', async () => {
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI() });
    const result = await engine.answer('Do you have any healing testimonies?');
    assert.notStrictEqual(result.intent, 'MEDIA_INTELLIGENCE');
});

// --- H. A thrown error from answerMediaQuestion() degrades honestly (no crash) ---
test('regression: a throwing answerMediaQuestion() degrades honestly instead of propagating', async () => {
    const mi = makeFakeMediaIntelligence(() => { throw new Error('simulated failure'); });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyMediaIntelligence: mi });
    const result = await engine.answer('Do you have any healing testimonies?');
    assert.notStrictEqual(result.intent, 'MEDIA_INTELLIGENCE');
});

// --- I. Kiswahili-shaped question with English media vocabulary still composes (no language gate on the pattern itself) ---
test('a Kiswahili-language conversation asking about "sermon recordings" (English media noun) still composes MEDIA_INTELLIGENCE', async () => {
    const mi = makeFakeMediaIntelligence((q) => ({ status: 'OK', answer: 'FOUND', matchedType: 'SERMON', matchedLanguage: 'sw', resultCount: 2 }));
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI(), CozyMediaIntelligence: mi });
    const result = await engine.answer('Naomba sermon recordings za Kiswahili', { language: 'sw' });
    assert.strictEqual(result.intent, 'MEDIA_INTELLIGENCE');
    assert.ok(result.answer.includes('2'));
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
