/**
 * core/modules/learning/test/multimodal-observation-core.test.js
 * Run with: node --test core/modules/learning/test/multimodal-observation-core.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE_PATH = path.join(__dirname, '..', 'multimodal-observation-core.js');

function load() {
    delete require.cache[require.resolve(CORE_PATH)];
    global.window = { CozyOS: {} };
    require(CORE_PATH);
    return global.window.CozyOS.MultimodalObservationCore;
}

const { computeTextSimilarity, buildObservation, decideLearningAction, ACTION } = load();

// --- computeTextSimilarity ---

test('identical phrases (after normalization) score 1.0', () => {
    assert.equal(computeTextSimilarity('Buenos días', 'buenos días'), 1);
    assert.equal(computeTextSimilarity('Buenos días!', 'buenos dias'.replace('dias', 'días')), 1);
});

test('near-identical phrases (small real transcription difference) score high but not necessarily 1.0', () => {
    const sim = computeTextSimilarity('buenos dias', 'buenos dia');
    assert.ok(sim > 0.6, `expected high similarity for a one-character difference, got ${sim}`);
    assert.ok(sim < 1, 'a genuine (even small) difference must not be scored as identical');
});

test('completely unrelated phrases score low', () => {
    const sim = computeTextSimilarity('buenos dias', 'the weather today');
    assert.ok(sim < 0.3, `expected low similarity for unrelated phrases, got ${sim}`);
});

test('empty vs non-empty scores 0; empty vs empty scores 1', () => {
    assert.equal(computeTextSimilarity('', 'hello'), 0);
    assert.equal(computeTextSimilarity('hello', ''), 0);
    assert.equal(computeTextSimilarity('', ''), 1);
    assert.equal(computeTextSimilarity(undefined, undefined), 1);
});

test('word-order difference still scores meaningfully via token overlap', () => {
    const sim = computeTextSimilarity('good morning', 'morning good');
    assert.ok(sim >= 0.5, `expected reordering to still score reasonably, got ${sim}`);
});

// --- buildObservation ---

test('buildObservation with both visual and audio computes a real cross-modal match', () => {
    const obs = buildObservation({
        userId: 'user-1',
        visual: { text: 'Buenos días', confidence: 0.9, source: 'camera' },
        audio: { transcript: 'buenos dias', language: 'es', confidence: 0.85, source: 'microphone' },
        context: { application: 'lesson-app', topic: 'greetings' },
        now: () => 12345,
        idGenerator: () => 'fixed-id',
    });
    assert.equal(obs.observationId, 'fixed-id');
    assert.equal(obs.timestamp, 12345);
    assert.equal(obs.userId, 'user-1');
    // "Buenos días" (accented) vs "buenos dias" (no accent) is a real,
    // common OCR-vs-speech-recognition disagreement mode; diacritic
    // folding means this scores as an exact match.
    assert.equal(obs.matching.visualAudioMatch, 1);
    assert.ok(obs.matching.combinedConfidence > 0.9);
    assert.equal(obs.verification.status, 'unverified');
    assert.equal(obs.learning.status, 'observation');
});

test('buildObservation with only visual (no audio) never fabricates a cross-modal match', () => {
    const obs = buildObservation({ userId: 'user-1', visual: { text: 'Buenos días', confidence: 0.9 } });
    assert.equal(obs.matching.visualAudioMatch, null);
    assert.equal(obs.matching.combinedConfidence, 0.9, 'single-modality confidence must be used as-is, not averaged with a fabricated value');
});

test('buildObservation with neither visual nor audio produces a null combined confidence, never a fabricated number', () => {
    const obs = buildObservation({ userId: 'user-1', context: { application: 'x' } });
    assert.equal(obs.visual, null);
    assert.equal(obs.audio, null);
    assert.equal(obs.matching.visualAudioMatch, null);
    assert.equal(obs.matching.combinedConfidence, null);
});

test('buildObservation preserves context separately for otherwise-identical text (e.g. "bank" finance vs river)', () => {
    const finance = buildObservation({ userId: 'u1', visual: { text: 'bank', confidence: 1 }, context: { topic: 'finance' } });
    const river = buildObservation({ userId: 'u1', visual: { text: 'bank', confidence: 1 }, context: { topic: 'river' } });
    assert.notEqual(finance.context.topic, river.context.topic);
    assert.notDeepEqual(finance.context, river.context);
});

test('buildObservation never invents translation data it was not given', () => {
    const obs = buildObservation({ userId: 'u1', visual: { text: 'x' } });
    assert.equal(obs.translation, null);
});

// --- decideLearningAction ---

test('high combined confidence -> REVIEW_REQUIRED (never auto-LEARN_CONFIRMED on its own)', () => {
    const obs = buildObservation({
        userId: 'u1',
        visual: { text: 'buenos dias', confidence: 0.95 },
        audio: { transcript: 'buenos dias', confidence: 0.95 },
    });
    const decision = decideLearningAction(obs);
    assert.equal(decision.action, ACTION.REVIEW_REQUIRED);
});

test('low combined confidence -> IGNORE_LOW_CONFIDENCE', () => {
    const obs = buildObservation({
        userId: 'u1',
        visual: { text: 'completely different text here', confidence: 0.9 },
        audio: { transcript: 'nothing alike at all', confidence: 0.9 },
    });
    const decision = decideLearningAction(obs);
    assert.equal(decision.action, ACTION.IGNORE_LOW_CONFIDENCE);
});

test('missing/null combined confidence -> REVIEW_REQUIRED, never auto-ignored and never auto-learned', () => {
    const obs = buildObservation({ userId: 'u1' });
    const decision = decideLearningAction(obs);
    assert.equal(decision.action, ACTION.REVIEW_REQUIRED);
    assert.equal(decision.reason, 'insufficient_data_for_automatic_decision');
});

test('this module never returns LEARN_CONFIRMED from decideLearningAction under any input — that status is reserved for an explicit user action recorded elsewhere', () => {
    const fixtures = [
        buildObservation({ userId: 'u1', visual: { text: 'a', confidence: 1 }, audio: { transcript: 'a', confidence: 1 } }),
        buildObservation({ userId: 'u1' }),
        buildObservation({ userId: 'u1', visual: { text: 'x' }, audio: { transcript: 'completely unrelated y' } }),
    ];
    for (const obs of fixtures) {
        assert.notEqual(decideLearningAction(obs).action, ACTION.LEARN_CONFIRMED);
    }
});

test('custom ignoreBelow threshold is honored', () => {
    const obs = buildObservation({ userId: 'u1', visual: { text: 'x', confidence: 0.5 } });
    assert.equal(decideLearningAction(obs, { ignoreBelow: 0.6 }).action, ACTION.IGNORE_LOW_CONFIDENCE);
    assert.equal(decideLearningAction(obs, { ignoreBelow: 0.4 }).action, ACTION.REVIEW_REQUIRED);
});

test('module is frozen / no accidental mutation surface', () => {
    const mod = load();
    assert.ok(Object.isFrozen(mod));
    assert.ok(Object.isFrozen(mod.ACTION));
});
