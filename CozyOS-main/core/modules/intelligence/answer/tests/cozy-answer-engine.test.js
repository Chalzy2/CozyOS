/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine.test.js
 * Micro-Milestone H — AnswerEngine composition tests.
 *
 * These tests stub CozyIdentityFAQRouter / CozyAI / CozyKnowledge with
 * small, honest fakes that mirror their REAL documented return shapes
 * (read from the actual source files before writing this suite), so
 * the AnswerEngine's own composition/labeling logic is what's under
 * test — not a reimplementation of those authorities.
 *
 * Run with: node core/modules/intelligence/answer/tests/cozy-answer-engine.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
const pending = [];

// test() just registers name+fn; actual (sequential, awaited) execution
// happens in main() at the bottom of this file.
function test(name, fn) { pending.push({ name, fn }); }

const enginePath = path.join(__dirname, '..', 'cozy-answer-engine.js');

function freshEngine(cozyOSOverrides) {
    delete require.cache[require.resolve(enginePath)];
    const win = { CozyOS: Object.assign({}, cozyOSOverrides) };
    global.window = win;
    require(enginePath);
    return win.CozyOS.CozyAnswerEngine;
}

// --- Fakes mirroring the REAL router/CozyAI/CozyKnowledge shapes ---

function makeFakeRouter(overrides) {
    return Object.assign({
        detectIntent: () => null,
        resolve: async () => ({ matched: false })
    }, overrides);
}

function makeFakeAI(overrides) {
    return Object.assign({
        getContext: async () => ({ success: true, found: false, results: [] })
    }, overrides);
}

console.log('Micro-Milestone H \u2014 AnswerEngine tests\n');

// 1. Identity answer
test('identity question: delegates to CozyIdentityFAQRouter, VERIFIED', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_FOUNDER', confidence: 1, language: 'en',
            answer: 'CozyOS was founded by Charles Owuor.',
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const ai = makeFakeAI();
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: ai });
    const result = await engine.answer('Who founded CozyOS?');
    assert.strictEqual(result.intent, 'COZYOS_FOUNDER');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.strictEqual(result.responseMode, 'FACT');
    assert.ok(result.answer.includes('Charles Owuor'));
});

// 2. Origin answer -> WHY_REASONING
test('origin question: maps COZYOS_ORIGIN to WHY_REASONING responseMode', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_ORIGIN', confidence: 1, language: 'en',
            answer: 'CozyOS began from real offline-access challenges.',
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: makeFakeAI() });
    const result = await engine.answer('Why was CozyOS started?');
    assert.strictEqual(result.responseMode, 'WHY_REASONING');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
});

// 3. Vision answer
test('vision question: FACT responseMode, VERIFIED', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_VISION', confidence: 1, language: 'en',
            answer: 'To preserve African languages through technology.',
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: makeFakeAI() });
    const result = await engine.answer("What is CozyOS's vision?");
    assert.strictEqual(result.responseMode, 'FACT');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
});

// 4. Inspiration (routes to origin builder in the real router; simulate same shape)
test('inspiration question: reuses origin-shaped FAQ answer, not a new authority', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_ORIGIN', confidence: 0.8, language: 'en',
            answer: 'Door-to-door sales experience inspired CozyOS.',
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: makeFakeAI() });
    const result = await engine.answer('What inspired CozyOS?');
    assert.ok(result.answer.includes('Door-to-door'));
    assert.strictEqual(result.evidenceState, 'VERIFIED');
});

// 5. Comparison / differentiation
test('comparison question: COZYOS_DIFFERENTIATION maps to COMPARISON responseMode', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_DIFFERENTIATION', confidence: 1, language: 'en',
            answer: 'CozyOS is built offline-first and multilingual.',
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: makeFakeAI() });
    const result = await engine.answer('Why is CozyOS different from other platforms?');
    assert.strictEqual(result.responseMode, 'COMPARISON');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
});

// 6. Application answer (no FAQ match, context has listApplicationsFact)
test('application question: synthesizes from knowledge-registry context, FACT/EXPLANATION', async () => {
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'listApplicationsFact', evidence: 'VERIFIED', content: undefined }
            ]
        })
    });
    const knowledge = {
        listApplicationsFact: () => ({ evidence: 'VERIFIED', applications: ['ShopOS', 'MpesaOS', 'QuarryOS'], source: 'window.CozyOS.ServiceRegistry' })
    };
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: ai, CozyKnowledge: knowledge });
    const result = await engine.answer('What applications does CozyOS have?');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.strictEqual(result.intent, 'APPLICATION');
    assert.ok(result.answer.includes('ShopOS'));
});

// 7. Architecture / technical answer (providers)
test('technical question: synthesizes provider health context, VERIFIED', async () => {
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'listProvidersFact', evidence: 'VERIFIED', content: undefined }
            ]
        })
    });
    const knowledge = {
        listProvidersFact: () => ({ evidence: 'VERIFIED', entries: ['gemini: ONLINE', 'rule-based: ONLINE'], source: 'window.CozyOS.ProviderManager' })
    };
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: ai, CozyKnowledge: knowledge });
    const result = await engine.answer('How does the CozyOS provider system work technically?');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.strictEqual(result.intent, 'TECHNICAL');
    assert.ok(result.answer.includes('ONLINE'));
});

// 8. Why/reasoning general (no FAQ match, memory + knowledge context)
test('general why question: WHY_REASONING when question is why-shaped and context found', async () => {
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'cozy-memory', provenance: 'window.CozyOS.CozyMemory', namespace: 'architecture-decisions', key: 'offline-first', content: 'Offline-first was chosen because rural connectivity is unreliable.' }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: ai });
    const result = await engine.answer('Why was the offline-first architecture decision made?');
    assert.strictEqual(result.responseMode, 'WHY_REASONING');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.strictEqual(result.reasoningUsed, true);
});

// 9. Insufficient evidence
test('insufficient evidence: no FAQ match and empty context -> INSUFFICIENT_DATA', async () => {
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI() });
    const result = await engine.answer('What is the CozyOS stock ticker symbol?');
    assert.strictEqual(result.evidenceState, 'INSUFFICIENT_DATA');
    assert.strictEqual(result.responseMode, 'INSUFFICIENT_EVIDENCE');
    assert.deepStrictEqual(result.sources, []);
});

// 10. Private-story protection
test('private-story protection: engine has no FounderStory reference at all', () => {
    const src = fs.readFileSync(enginePath, 'utf8');
    assert.ok(!/window\.CozyOS\.FounderStory/.test(src), 'AnswerEngine source must never reference window.CozyOS.FounderStory directly.');
});

test('private-story protection: a disclosed non-public FAQ result (isReal:false) still degrades to INSUFFICIENT_DATA, never exposed as verified', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: false,
            intentId: 'COZYOS_NAME_MEANING', confidence: 1, language: 'en',
            answer: "That's not documented anywhere in CozyOS yet.",
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: makeFakeAI() });
    const result = await engine.answer('What does the name CozyOS mean?');
    assert.strictEqual(result.evidenceState, 'INSUFFICIENT_DATA');
    assert.strictEqual(result.responseMode, 'INSUFFICIENT_EVIDENCE');
});

// 11. Provenance preservation
test('provenance preservation: sources carry authority + provenance from the composed authority', async () => {
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'cozy-memory', provenance: 'window.CozyOS.CozyMemory', namespace: 'decisions', key: 'k1', content: 'A real recorded decision.' }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: ai });
    const result = await engine.answer('What decision was made about caching?');
    assert.strictEqual(result.sources.length, 1);
    assert.strictEqual(result.sources[0].authority, 'cozy-memory');
    assert.strictEqual(result.sources[0].provenance, 'window.CozyOS.CozyMemory');
    assert.strictEqual(result.contextUsed.length, 1);
});

// 12. Multi-intent answer
test('multi-intent question: identity FAQ answer combined with distinct applications context', async () => {
    const router = makeFakeRouter({
        resolve: async () => ({
            matched: true, success: true, isReal: true,
            intentId: 'COZYOS_FOUNDER', confidence: 1, language: 'en',
            answer: 'CozyOS was founded by Charles Owuor.',
            source: 'DeveloperIdentity (public profile)'
        })
    });
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'knowledge-registry', provenance: 'window.CozyOS.CozyKnowledge', getter: 'listApplicationsFact', evidence: 'VERIFIED', content: undefined }
            ]
        })
    });
    const knowledge = {
        listApplicationsFact: () => ({ evidence: 'VERIFIED', applications: ['ShopOS', 'MpesaOS'], source: 'window.CozyOS.ServiceRegistry' })
    };
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: ai, CozyKnowledge: knowledge });
    const result = await engine.answer('Who founded CozyOS and what applications does it have?');
    assert.ok(Array.isArray(result.intent));
    assert.strictEqual(result.intent[0], 'COZYOS_FOUNDER');
    assert.strictEqual(result.intent[1], 'APPLICATION');
    assert.ok(result.answer.includes('ShopOS'));
    assert.strictEqual(result.reasoningUsed, true);
});

// 13. Existing FAQ-router compatibility (unmatched -> falls through cleanly)
test('FAQ-router compatibility: an unmatched question falls through to context path without error', async () => {
    const router = makeFakeRouter({ resolve: async () => ({ matched: false }) });
    const ai = makeFakeAI({
        getContext: async () => ({
            success: true, found: true, results: [
                { authority: 'cozy-memory', provenance: 'window.CozyOS.CozyMemory', namespace: 'notes', key: 'k', content: 'A real note.' }
            ]
        })
    });
    const engine = freshEngine({ CozyIdentityFAQRouter: router, CozyAI: ai });
    const result = await engine.answer('Tell me something about CozyOS notes.');
    assert.strictEqual(result.evidenceState, 'VERIFIED');
    assert.ok(result.answer.includes('A real note.'));
});

// 14. Unknown question / no authorities loaded at all
test('unavailable: neither CozyIdentityFAQRouter nor CozyAI loaded -> UNAVAILABLE', async () => {
    const engine = freshEngine({});
    const result = await engine.answer('What is CozyOS?');
    assert.strictEqual(result.evidenceState, 'UNAVAILABLE');
});

test('invalid input: empty question is rejected honestly', async () => {
    const engine = freshEngine({ CozyIdentityFAQRouter: makeFakeRouter(), CozyAI: makeFakeAI() });
    const result = await engine.answer('   ');
    assert.strictEqual(result.intent, 'INVALID_INPUT');
    assert.strictEqual(result.evidenceState, 'INSUFFICIENT_DATA');
});

async function main() {
    for (const { name, fn } of pending) {
        try {
            await fn();
            console.log(`  \u2713 ${name}`);
            passed++;
        } catch (err) {
            console.log(`  \u2717 ${name}`);
            console.log(`      ${err.message}`);
            failed++;
        }
    }
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

main();
