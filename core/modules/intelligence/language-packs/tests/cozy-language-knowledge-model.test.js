/**
 * core/modules/intelligence/language-packs/tests/cozy-language-knowledge-model.test.js
 * RP-035 Phase 1 — real, executed tests for cozy-language-knowledge-model.js
 * Run with: node core/modules/intelligence/language-packs/tests/cozy-language-knowledge-model.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.stack || err.message}`); failed++; }
}

function loadFresh(fakeWindow) {
    const registryPath = path.join(__dirname, '..', 'cozy-language-pack-registry.js');
    const modelPath = path.join(__dirname, '..', 'cozy-language-knowledge-model.js');
    delete require.cache[require.resolve(registryPath)];
    delete require.cache[require.resolve(modelPath)];
    global.window = fakeWindow;
    require(registryPath);
    require(modelPath);
    return fakeWindow.CozyOS.CozyLanguageKnowledgeModel;
}

console.log('cozy-language-knowledge-model.js — Phase 1 tests\n');

test('translation relationship is created with confidence UNKNOWN by default (no fabricated number)', () => {
    const model = loadFresh({});
    const result = model.createTranslationRelationship({
        sourceLanguage: 'en', sourceEntryId: 'expr_1',
        targetLanguage: 'sw', targetEntryId: 'expr_2'
    });
    assert.strictEqual(result.status, 'CREATED');
    assert.strictEqual(result.record.confidence, 'UNKNOWN');
    assert.strictEqual(result.record.validationState, 'PROPOSED');
});

test('translation direction is not assumed reversible — en->sw and sw->en are distinct records', () => {
    const model = loadFresh({});
    const forward = model.createTranslationRelationship({
        sourceLanguage: 'en', sourceEntryId: 'e1', targetLanguage: 'sw', targetEntryId: 's1'
    });
    const backward = model.createTranslationRelationship({
        sourceLanguage: 'sw', sourceEntryId: 's1', targetLanguage: 'en', targetEntryId: 'e1'
    });
    assert.notStrictEqual(forward.id, backward.id);
    assert.strictEqual(model.listTranslationRelationships({ sourceLanguage: 'en' }).length, 1);
    assert.strictEqual(model.listTranslationRelationships({ sourceLanguage: 'sw' }).length, 1);
});

test('unknown language is rejected safely when the registry is loaded', () => {
    const model = loadFresh({});
    const result = model.createTranslationRelationship({
        sourceLanguage: 'xx', sourceEntryId: 'e1', targetLanguage: 'sw', targetEntryId: 's1'
    });
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.reason, 'UNKNOWN_SOURCE_LANGUAGE');
});

test('malformed translation relationship (missing fields) is rejected, not silently defaulted', () => {
    const model = loadFresh({});
    const result = model.createTranslationRelationship({ sourceLanguage: 'en' });
    assert.strictEqual(result.status, 'REJECTED');
    assert.ok(result.reason.startsWith('MISSING_FIELD_'));
});

test('translation validation state transitions are explicit, not auto-promoted', () => {
    const model = loadFresh({});
    const created = model.createTranslationRelationship({
        sourceLanguage: 'en', sourceEntryId: 'e1', targetLanguage: 'sw', targetEntryId: 's1'
    });
    assert.strictEqual(model.getTranslationRelationship(created.id).validationState, 'PROPOSED');
    const updated = model.setTranslationValidationState(created.id, 'VALIDATED', 'reviewer_1');
    assert.strictEqual(updated.record.validationState, 'VALIDATED');
    assert.strictEqual(updated.record.lastReviewedBy, 'reviewer_1');
    const bad = model.setTranslationValidationState(created.id, 'MADE_UP_STATE', 'reviewer_1');
    assert.strictEqual(bad.status, 'REJECTED');
});

test('correction preserves the original value rather than overwriting it', () => {
    const model = loadFresh({});
    const result = model.createCorrection({
        targetRecordId: 'expr_9', targetRecordType: 'EXPRESSION',
        originalValue: 'anakuna', correctedValue: 'anakuja',
        correctedBy: 'user_charles', reason: 'wrong verb form'
    });
    assert.strictEqual(result.status, 'CREATED');
    assert.strictEqual(result.record.originalValue, 'anakuna');
    assert.strictEqual(result.record.correctedValue, 'anakuja');
    assert.strictEqual(result.record.validationState, 'PROPOSED');
    assert.strictEqual(result.record.history.length, 1);
});

test('correction history is append-only across review actions', () => {
    const model = loadFresh({});
    const created = model.createCorrection({
        targetRecordId: 'expr_9', targetRecordType: 'EXPRESSION',
        originalValue: 'anakuna', correctedValue: 'anakuja'
    });
    model.reviewCorrection(created.id, 'CONFIRMED', 'reviewer_2', 'verified with native speaker');
    const record = model.getCorrection(created.id);
    assert.strictEqual(record.validationState, 'CONFIRMED');
    assert.strictEqual(record.history.length, 2);
    assert.strictEqual(record.history[0].event, 'CORRECTION_PROPOSED');
    assert.strictEqual(record.history[1].event, 'CORRECTION_CONFIRMED');
});

test('malformed correction (missing target) is rejected', () => {
    const model = loadFresh({});
    const result = model.createCorrection({ originalValue: 'a', correctedValue: 'b' });
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.reason, 'MISSING_TARGET_RECORD');
});

test('conflict between two candidates opens as CONFLICT_OPEN and never auto-resolves', () => {
    const model = loadFresh({});
    const result = model.openConflict({
        languageId: 'sw',
        meaningContext: 'she is coming',
        candidateA: { contributorId: 'user_a', value: 'anakuja' },
        candidateB: { contributorId: 'user_b', value: 'anakuja tu' }
    });
    assert.strictEqual(result.status, 'CREATED');
    assert.strictEqual(result.record.status, 'CONFLICT_OPEN');
    assert.strictEqual(result.record.resolution, null);
});

test('conflict can be marked CONFLICT_UNRESOLVED rather than forced to pick a winner', () => {
    const model = loadFresh({});
    const opened = model.openConflict({
        languageId: 'sw', candidateA: { value: 'a' }, candidateB: { value: 'b' }
    });
    const updated = model.markConflictUnresolved(opened.id, 'no native speaker available yet');
    assert.strictEqual(updated.record.status, 'CONFLICT_UNRESOLVED');
});

test('resolving a conflict requires an explicit resolver and value', () => {
    const model = loadFresh({});
    const opened = model.openConflict({
        languageId: 'sw', candidateA: { value: 'a' }, candidateB: { value: 'b' }
    });
    const badResolve = model.resolveConflict(opened.id, {});
    assert.strictEqual(badResolve.status, 'REJECTED');
    const goodResolve = model.resolveConflict(opened.id, {
        resolvedBy: 'reviewer_3', resolvedValue: 'a', reason: 'confirmed by two native speakers'
    });
    assert.strictEqual(goodResolve.record.status, 'CONFLICT_RESOLVED');
    assert.strictEqual(goodResolve.record.resolution.resolvedBy, 'reviewer_3');
});

test('malformed conflict (missing candidates) is rejected', () => {
    const model = loadFresh({});
    const result = model.openConflict({ languageId: 'sw' });
    assert.strictEqual(result.status, 'REJECTED');
    assert.strictEqual(result.reason, 'MISSING_CANDIDATES');
});

test('submitTeaching honestly reports CAPABILITY_UNAVAILABLE when RP-031 routing is not loaded', () => {
    const model = loadFresh({}); // no cozy-teach-cozyai-routing-core.js loaded in this fake window
    const result = model.submitTeaching({ languageId: 'sw', term: 'marafiki' });
    assert.strictEqual(result.status, 'CAPABILITY_UNAVAILABLE');
    assert.match(result.reason, /RP-031/);
});

test('submitTeaching composes RP-031\'s real safety-gated routing core, never a direct community-engine bypass', () => {
    const fakeWindow = {};
    // Minimal fake standing in for the real cozy-teach-cozyai-routing-core.js
    // public API shape, to prove composition (not duplication, and not a
    // bypass of the safety gate it internally enforces) without needing
    // that file's full dependency chain in this unit test.
    global.window = fakeWindow;
    fakeWindow.CozyOS = fakeWindow.CozyOS || {};
    fakeWindow.CozyOS.CozyTeachCozyAIRouting = {
        submitTeachingContribution(input) { return { status: 'SUBMITTED', receivedBy: 'REAL_RP031_ROUTING_CORE', input }; }
    };
    // A stray CozyKnowledgeCommunity is also present, proving submitTeaching
    // does NOT call it directly even though it could.
    fakeWindow.CozyOS.CozyKnowledgeCommunity = {
        submitContribution() { throw new Error('submitTeaching must never call the community engine directly (bypasses the RP-031 safety gate).'); }
    };
    const model = loadFresh(fakeWindow);
    const result = model.submitTeaching({ languageId: 'sw', term: 'marafiki' });
    assert.strictEqual(result.status, 'SUBMITTED');
    assert.strictEqual(result.receivedBy, 'REAL_RP031_ROUTING_CORE');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
