/**
 * core/living/tests/cozy-living-assistant-reply.test.js
 *
 * RP-024 regression test — "restore honest conversational UI".
 *
 * Requires the REAL, unmodified core/living/cozy-living-assistant.js
 * (via the Node-safe `module.exports` guard added for this fix — see
 * that file's RP-024 header note) rather than duplicating its logic
 * here, so this test actually exercises the shipped code, not a copy
 * of it. Requiring the file does not touch window/document: the file's
 * DOM-mounting IIFE is guarded to run only when both exist (see
 * `if (typeof window !== "undefined" && typeof document !== "undefined")`
 * near the top of that file), so this test needs no DOM/jsdom stub.
 *
 * Run with: node core/living/tests/cozy-living-assistant-reply.test.js
 */

'use strict';

const assert = require('assert');
const { resolveConversationalReply, NO_CONVERSATIONAL_ENGINE_FALLBACK } =
    require('../cozy-living-assistant.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.stack}`);
        failed++;
    }
}

// ---------------------------------------------------------------------
// Real shapes, taken directly from the actual pipeline code (not
// invented for this test):
//   - core/modules/intelligence/cozy-intelligence-provider.js's
//     "living-composition-adapter" evidence/diagnostic summary text.
//   - core/modules/cognitive/cognitive-coordinator.js's run()/
//     runFromImage() result shape:
//     {interpretation, thinking, reasoning, intelligence,
//      recalledMemories, policyResult, diagnostics} — no .text/.reply/
//     .answer field anywhere on it.
// ---------------------------------------------------------------------

function evidenceDiagnosticIntelligenceResult(evidenceText) {
    return {
        interpretation: null,
        thinking: null,
        reasoning: null,
        intelligence: {
            success: true,
            isReal: true,
            insights: [{
                type: 'summary',
                text: `Received 1 real evidence source totaling ${evidenceText.length} characters for category "custom".`
            }],
            confidence: 0.3
        },
        recalledMemories: [],
        policyResult: null,
        diagnostics: { stages: {} }
    };
}

test('Input "Hello" (evidence-diagnostic result) must NOT surface the evidence-summary text', () => {
    const pipelineResult = evidenceDiagnosticIntelligenceResult('Hello');
    const reply = resolveConversationalReply(pipelineResult);
    assert.strictEqual(reply, null, 'resolveConversationalReply() must not treat intelligence.insights as an answer');
    assert.ok(
        !JSON.stringify(reply).includes('real evidence source'),
        'the resolved reply must never contain the evidence-diagnostic string'
    );
});

test('Input "Can you help?" (evidence-diagnostic result) must NOT expose the evidence-analysis diagnostic', () => {
    const pipelineResult = evidenceDiagnosticIntelligenceResult('Can you help?');
    const reply = resolveConversationalReply(pipelineResult);
    assert.strictEqual(reply, null);
    assert.ok(!JSON.stringify(reply).includes('isReal'));
    assert.ok(!JSON.stringify(reply).includes('characters for category'));
});

test('A genuine conversational field (.text) IS rendered', () => {
    const reply = resolveConversationalReply({ text: 'Sure, what do you need help with?' });
    assert.strictEqual(reply, 'Sure, what do you need help with?');
});

test('A genuine conversational field (.reply) IS rendered', () => {
    const reply = resolveConversationalReply({ reply: 'Happy to help.' });
    assert.strictEqual(reply, 'Happy to help.');
});

test('A genuine conversational field (.answer) IS rendered', () => {
    const reply = resolveConversationalReply({ answer: 'Here is the answer.' });
    assert.strictEqual(reply, 'Here is the answer.');
});

test('An empty/whitespace-only .text is treated as absent, not rendered', () => {
    const reply = resolveConversationalReply({ text: '   ' });
    assert.strictEqual(reply, null);
});

test('A real CognitiveCoordinator.run()-shaped result (no genuine field at all) resolves to null', () => {
    const pipelineResult = {
        interpretation: { available: true, isReal: false },
        thinking: { success: true, isReal: false },
        reasoning: { success: true, isReal: false },
        intelligence: evidenceDiagnosticIntelligenceResult('test').intelligence,
        recalledMemories: [],
        policyResult: [],
        diagnostics: { stages: {} }
    };
    assert.strictEqual(resolveConversationalReply(pipelineResult), null);
});

test('When no genuine response is supplied, the honest fallback string is defined and non-empty', () => {
    assert.strictEqual(typeof NO_CONVERSATIONAL_ENGINE_FALLBACK, 'string');
    assert.ok(NO_CONVERSATIONAL_ENGINE_FALLBACK.trim().length > 0);
    // The fallback itself must never mention pipeline internals either.
    assert.ok(!/evidence|isReal|insight/i.test(NO_CONVERSATIONAL_ENGINE_FALLBACK));
});

test('Simulated #send()/#sendImage() selection logic: diagnostic-only result -> fallback is what gets rendered', () => {
    const pipelineResult = evidenceDiagnosticIntelligenceResult('Hello');
    const replyText = resolveConversationalReply(pipelineResult) || NO_CONVERSATIONAL_ENGINE_FALLBACK;
    assert.strictEqual(replyText, NO_CONVERSATIONAL_ENGINE_FALLBACK);
});

test('Simulated #send()/#sendImage() selection logic: genuine result -> genuine text is what gets rendered', () => {
    const pipelineResult = { text: 'Real answer.', intelligence: evidenceDiagnosticIntelligenceResult('x').intelligence };
    const replyText = resolveConversationalReply(pipelineResult) || NO_CONVERSATIONAL_ENGINE_FALLBACK;
    assert.strictEqual(replyText, 'Real answer.');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
