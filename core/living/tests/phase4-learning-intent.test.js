'use strict';
/**
 * core/living/tests/phase4-learning-intent.test.js
 * PHASE 4 — Universal Language Capability: learning-intent detection.
 * Run with: node --test core/living/tests/phase4-learning-intent.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const INTENT_PATH = path.join(__dirname, '..', 'cozy-learning-intent.js');

function freshIntent() {
    try { delete require.cache[require.resolve(INTENT_PATH)]; } catch (_e) { /* not loaded */ }
    global.window = { CozyOS: {} };
    require(INTENT_PATH);
    return global.window.CozyOS.CozyLearningIntent;
}

test('A: EN explicit marker detected', () => {
    const intent = freshIntent();
    const r = intent.detectLearningIntent('I want to learn Kikuyu', 'en');
    assert.equal(r.isLearning, true);
    assert.equal(r.targetLanguageText, 'Kikuyu');
});

test('B: SW explicit marker detected', () => {
    const intent = freshIntent();
    const r = intent.detectLearningIntent('Nataka kujifunza Kikuyu', 'sw');
    assert.equal(r.isLearning, true);
    assert.equal(r.targetLanguageText, 'Kikuyu');
});

test('C: a plain statement with no marker is not detected', () => {
    const intent = freshIntent();
    const r = intent.detectLearningIntent('Kikuyu is a language', 'en');
    assert.equal(r.isLearning, false);
});

test('D: a marker with no target text is honestly reported, never fabricated', () => {
    const intent = freshIntent();
    const r = intent.detectLearningIntent('I want to learn', 'en');
    assert.equal(r.isLearning, false);
    assert.equal(r.reason, 'NO_TARGET_LANGUAGE');
});
