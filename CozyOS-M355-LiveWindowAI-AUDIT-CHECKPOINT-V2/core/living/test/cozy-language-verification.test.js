/**
 * core/living/test/cozy-language-verification.test.js
 * Run with: node --test core/living/test/cozy-language-verification.test.js
 *
 * No dedicated test file previously existed for this engine (confirmed
 * by search before writing this one). Given this checkpoint is the
 * first to modify the file, this suite both proves backward
 * compatibility for the pre-existing behavior and covers the new
 * CP16B additions (language field, publishedAt, getObservationTimeline).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ENGINE_PATH = path.join(__dirname, '..', 'cozy-language-verification.js');

function fakeMemory() {
    const store = new Map();
    return {
        saveMemory(namespace, key, value) { store.set(`${namespace}/${key}`, value); return { success: true }; },
        readMemory(namespace, key) { return store.has(`${namespace}/${key}`) ? { value: store.get(`${namespace}/${key}`) } : null; },
        _store: store,
    };
}

function freshEngine() {
    delete require.cache[require.resolve(ENGINE_PATH)];
    global.window = { CozyOS: { CozyMemory: fakeMemory() } };
    require(ENGINE_PATH);
    return global.window.CozyOS.LivingLanguageVerification;
}

// --- backward compatibility: existing (pre-CP16B) call shape still works identically ---

test('submitObservation() with the pre-existing call shape (no language) still works exactly as before', () => {
    const engine = freshEngine();
    const result = engine.submitObservation('asante', 'Thank you', { region: 'Nairobi', submittedBy: 'user-1' });
    assert.equal(result.success, true);
    assert.equal(result.totalObservations, 1);
});

test('required-field validation (termId, meaning, region, submittedBy) is unchanged', () => {
    const engine = freshEngine();
    assert.equal(engine.submitObservation(null, 'x', { region: 'r', submittedBy: 'u' }).success, false);
    assert.equal(engine.submitObservation('t', null, { region: 'r', submittedBy: 'u' }).success, false);
    assert.equal(engine.submitObservation('t', 'm', { submittedBy: 'u' }).success, false);
    assert.equal(engine.submitObservation('t', 'm', { region: 'r' }).success, false);
});

test('pre-existing deduplication (same contributor, meaning, region, context) is unchanged when language is never used', () => {
    const engine = freshEngine();
    engine.submitObservation('bank', 'financial institution', { region: 'Nairobi', context: 'finance', submittedBy: 'user-1' });
    const dup = engine.submitObservation('bank', 'financial institution', { region: 'Nairobi', context: 'finance', submittedBy: 'user-1' });
    assert.equal(dup.success, false);
    assert.match(dup.reason, /already submitted/);
});

test('pre-existing context separation ("bank" finance vs river) is unchanged', () => {
    const engine = freshEngine();
    engine.submitObservation('bank', 'financial institution', { region: 'Nairobi', context: 'finance', submittedBy: 'user-1' });
    engine.submitObservation('bank', 'river bank', { region: 'Nairobi', context: 'river', submittedBy: 'user-1' });
    const financeConf = engine.getConfidence('bank', 'financial institution', 'finance');
    const riverConf = engine.getConfidence('bank', 'river bank', 'river');
    assert.equal(financeConf.totalObservations, 1);
    assert.equal(riverConf.totalObservations, 1);
});

test('pre-existing confidence tiers (Single Source / Local Agreement / Regional Agreement) are unchanged', () => {
    const engine = freshEngine();
    engine.submitObservation('jambo', 'hello', { region: 'r1', submittedBy: 'u1' });
    assert.equal(engine.getConfidence('jambo', 'hello').level, 1);
    engine.submitObservation('jambo', 'hello', { region: 'r2', submittedBy: 'u2' });
    engine.submitObservation('jambo', 'hello', { region: 'r3', submittedBy: 'u3' });
    assert.equal(engine.getConfidence('jambo', 'hello').level, 2);
});

test('pre-existing updateRecommendation() rejects without a real approver, unchanged', () => {
    const engine = freshEngine();
    engine.submitObservation('jambo', 'hello', { region: 'r1', submittedBy: 'u1' });
    const result = engine.updateRecommendation('jambo', 'hello', {});
    assert.equal(result.success, false);
});

// --- CP16B: language field ---

test('submitObservation() accepts an optional real language code and stores it', () => {
    const engine = freshEngine();
    const result = engine.submitObservation('asante', 'Thank you', { region: 'Nairobi', submittedBy: 'user-1', language: 'sw' });
    assert.equal(result.success, true);
    const stored = global.window.CozyOS.CozyMemory.readMemory('language-verification', 'asante:observations').value;
    assert.equal(stored[0].language, 'sw');
});

test('submitObservation() defaults language to null when not supplied — never fabricates a language', () => {
    const engine = freshEngine();
    engine.submitObservation('asante', 'Thank you', { region: 'Nairobi', submittedBy: 'user-1' });
    const stored = global.window.CozyOS.CozyMemory.readMemory('language-verification', 'asante:observations').value;
    assert.equal(stored[0].language, null);
});

test('deduplication now also considers language — the SAME word submitted under two different real languages is not treated as a duplicate', () => {
    const engine = freshEngine();
    const first = engine.submitObservation('bank', 'edge of a river', { region: 'r1', submittedBy: 'u1', language: 'en' });
    const second = engine.submitObservation('bank', 'edge of a river', { region: 'r1', submittedBy: 'u1', language: 'sw' });
    assert.equal(first.success, true);
    assert.equal(second.success, true, 'a different real language must not be silently treated as the same duplicate submission');
});

test('deduplication behavior for two old-style (no language) submissions is unchanged — both null, still a duplicate', () => {
    const engine = freshEngine();
    engine.submitObservation('bank', 'financial institution', { region: 'r1', submittedBy: 'u1' });
    const dup = engine.submitObservation('bank', 'financial institution', { region: 'r1', submittedBy: 'u1' });
    assert.equal(dup.success, false);
});

// --- CP16B: publishedAt ---

test('updateRecommendation() records a real publishedAt timestamp alongside the pre-existing updatedAt field', () => {
    const engine = freshEngine();
    global.window.CozyOS.IdentityEngine = { isPlatformAdmin: () => true };
    engine.submitObservation('jambo', 'hello', { region: 'r1', submittedBy: 'u1' });
    const result = engine.updateRecommendation('jambo', 'hello', { approvedBy: 'admin-1' });
    assert.equal(result.success, true);
    const stored = global.window.CozyOS.CozyMemory.readMemory('language-verification', 'jambo:recommended').value;
    assert.ok(stored.publishedAt, 'publishedAt must be a real timestamp');
    assert.equal(stored.updatedAt, stored.publishedAt, 'both fields represent the same real event, not two different timestamps');
});

// --- CP16B: getObservationTimeline() ---

test('getObservationTimeline() returns real learnedAt timestamps for every real observation', () => {
    const engine = freshEngine();
    engine.submitObservation('jambo', 'hello', { region: 'r1', submittedBy: 'u1' });
    engine.submitObservation('jambo', 'hello', { region: 'r2', submittedBy: 'u2' });
    const timeline = engine.getObservationTimeline('jambo');
    assert.equal(timeline.available, true);
    assert.equal(timeline.learnedAt.length, 2);
    assert.equal(timeline.publishedAt, null, 'no recommendation has been published yet');
});

test('getObservationTimeline() includes the real publishedAt once a recommendation is explicitly approved', () => {
    const engine = freshEngine();
    global.window.CozyOS.IdentityEngine = { isPlatformAdmin: () => true };
    engine.submitObservation('jambo', 'hello', { region: 'r1', submittedBy: 'u1' });
    engine.updateRecommendation('jambo', 'hello', { approvedBy: 'admin-1' });
    const timeline = engine.getObservationTimeline('jambo');
    assert.ok(timeline.publishedAt);
});

test('getObservationTimeline() never fabricates verifiedAt/receivedAt/availableAt fields — they are genuinely omitted, not null placeholders', () => {
    const engine = freshEngine();
    engine.submitObservation('jambo', 'hello', { region: 'r1', submittedBy: 'u1' });
    const timeline = engine.getObservationTimeline('jambo');
    assert.equal('verifiedAt' in timeline, false);
    assert.equal('receivedAt' in timeline, false);
    assert.equal('availableAt' in timeline, false);
});

test('getObservationTimeline() honestly reports unavailable when CozyMemory is not loaded', () => {
    delete require.cache[require.resolve(ENGINE_PATH)];
    global.window = { CozyOS: {} };
    require(ENGINE_PATH);
    const engine = global.window.CozyOS.LivingLanguageVerification;
    const timeline = engine.getObservationTimeline('jambo');
    assert.equal(timeline.available, false);
});

test('getObservationTimeline() for a term with no real observations returns an empty (not fabricated) list', () => {
    const engine = freshEngine();
    const timeline = engine.getObservationTimeline('never-submitted-term');
    assert.equal(timeline.available, true);
    assert.deepEqual(timeline.learnedAt, []);
    assert.equal(timeline.publishedAt, null);
});
