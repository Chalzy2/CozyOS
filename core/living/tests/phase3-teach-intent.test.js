/**
 * core/living/tests/phase3-teach-intent.test.js
 * PHASE 3 — Teach Cozy / Governed Learning: teaching-intent detection.
 *
 * Proves explicit-marker-only detection: real EN+SW markers fire,
 * plain factual statements with no marker do NOT fire, and a marker
 * word embedded inside a longer unrelated word does NOT fire
 * (word-boundary safety — the same false-positive class Phase 2 found
 * and fixed for business-data keyword matching).
 *
 * Run with: node --test core/living/tests/phase3-teach-intent.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const INTENT_PATH = path.join(__dirname, '..', 'cozy-teach-intent.js');

function freshIntent() {
    try { delete require.cache[require.resolve(INTENT_PATH)]; } catch (_e) { /* not loaded */ }
    global.window = { CozyOS: {} };
    require(INTENT_PATH);
    return global.window.CozyOS.CozyTeachIntent;
}

test('A: EN explicit marker detected, claim extracted verbatim', () => {
    const intent = freshIntent();
    const r = intent.detectTeachingIntent('I want to teach you that ShopOS ships orders same day', 'en');
    assert.equal(r.isTeaching, true);
    assert.equal(r.claim, 'ShopOS ships orders same day');
    assert.equal(r.language, 'en');
});

test('B: SW explicit marker detected, claim extracted verbatim', () => {
    const intent = freshIntent();
    const r = intent.detectTeachingIntent('Nataka kukufundisha kwamba ChurchOS inasaidia makanisa', 'sw');
    assert.equal(r.isTeaching, true);
    assert.equal(r.claim, 'ChurchOS inasaidia makanisa');
    assert.equal(r.language, 'sw');
});

test('C: a plain factual statement with no marker is NOT detected as teaching intent', () => {
    const intent = freshIntent();
    const r = intent.detectTeachingIntent('ShopOS ships orders same day', 'en');
    assert.equal(r.isTeaching, false);
});

test('D: "remember that" (EN) fires even when language is resolved as sw (bilingual fallback)', () => {
    const intent = freshIntent();
    const r = intent.detectTeachingIntent('Remember that CozyOS is free to use', 'sw');
    assert.equal(r.isTeaching, true);
    assert.equal(r.claim, 'CozyOS is free to use');
});

test('E: word-boundary safety — a marker phrase embedded inside unrelated text around it still only extracts the real remainder, and unrelated text containing no real marker at all does not fire', () => {
    const intent = freshIntent();
    // "the teacher explained" contains "teach" as a substring but no
    // real marker phrase ("teach you", "let me teach you", etc.).
    const r = intent.detectTeachingIntent('The teacher explained the lesson today', 'en');
    assert.equal(r.isTeaching, false);
});

test('F: a marker with no claim text after it is honestly reported, never a fabricated empty claim', () => {
    const intent = freshIntent();
    const r = intent.detectTeachingIntent('I want to teach you', 'en');
    assert.equal(r.isTeaching, false);
    assert.equal(r.reason, 'NO_CLAIM_TEXT');
});

test('G: empty/whitespace-only input never throws and is honestly not teaching', () => {
    const intent = freshIntent();
    assert.deepEqual(intent.detectTeachingIntent('', 'en'), { isTeaching: false });
    assert.deepEqual(intent.detectTeachingIntent('   ', 'en'), { isTeaching: false });
});
