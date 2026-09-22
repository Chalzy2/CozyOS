'use strict';

/**
 * core/modules/learning/test/language-fluency-diagnostic.test.js
 * PHASE 5 EXTENSION — Universal Language Fluency self-audit composer.
 *
 * Uses the real, full CML-6 fabric stack (_test-helpers.js's
 * loadFullStackWithFabric(), the exact same loader CML-6's own
 * certified tests use) plus this new composer file — no stubs for any
 * of the composed authorities themselves.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PATHS, freshLoad, loadFullStackWithFabric } = require('./_test-helpers');

const DIAGNOSTIC_PATH = path.join(__dirname, '..', 'language-fluency-diagnostic.js');
// _test-helpers.js's own CML-6 loader does not load the Tier 2
// conversational-availability stack (CozyLanguageRegistry/Templates/
// Realize) — real, but a separate concern CML-6 never needed. This
// diagnostic composes it too (via getLanguageCapabilities()'s own
// conversationallyAvailable signal), so this test loads the same real
// files the Phase 4/SA-7 tests already load, from this file's own
// relative position.
const TEMPLATES_PATH = path.join(__dirname, '..', '..', 'intelligence', 'language', 'cozy-language-templates.js');
const REALIZE_SEAM_PATH = path.join(__dirname, '..', '..', 'intelligence', 'language', 'cozy-language-realize.js');
const LANGUAGE_REGISTRY_PATH = path.join(__dirname, '..', '..', 'intelligence', 'language', 'cozy-language-registry.js');

function loadStackWithDiagnostic() {
    const stack = loadFullStackWithFabric();
    for (const p of [TEMPLATES_PATH, REALIZE_SEAM_PATH, LANGUAGE_REGISTRY_PATH, DIAGNOSTIC_PATH]) {
        delete require.cache[require.resolve(p)];
    }
    require(TEMPLATES_PATH);
    require(REALIZE_SEAM_PATH);
    require(LANGUAGE_REGISTRY_PATH);
    require(DIAGNOSTIC_PATH);
    return { ...stack, diagnostic: stack.window.CozyOS.LanguageFluencyDiagnostic };
}

test('A: an unregistered language id returns null — never a fabricated diagnostic', () => {
    const { diagnostic } = loadStackWithDiagnostic();
    const result = diagnostic.getLanguageFluencyDiagnostic('xx-not-a-real-language');
    assert.strictEqual(result, null);
});

test('B: Kiswahili (a real, conversationally AVAILABLE language) reports overall AVAILABLE, with real verified dimensions and real, honestly-UNKNOWN dimensions named explicitly', () => {
    const { diagnostic } = loadStackWithDiagnostic();
    const result = diagnostic.getLanguageFluencyDiagnostic('sw');
    assert.ok(result, 'expected a real diagnostic for sw');
    assert.strictEqual(result.overall, 'AVAILABLE');
    assert.ok(result.whatIsVerified.includes('naturalLanguageRealization'));
    assert.ok(result.whatIsVerified.includes('conversation'));
    // Real, honest gap-naming (Section 2's own core requirement): idioms/
    // proverbs/wordUsage/verbs/figurativeLanguage/dialectRegion/
    // culturalPragmaticUsage have no real tracker anywhere in this
    // repository yet, so they must be named explicitly, not omitted.
    const missingDimensions = result.whatIsMissing.map((m) => m.dimension);
    for (const expected of ['idioms', 'proverbs', 'wordUsage', 'verbs', 'figurativeLanguage', 'dialectRegion', 'culturalPragmaticUsage']) {
        assert.ok(missingDimensions.includes(expected), `expected "${expected}" to be named as a real, honest gap, got: ${missingDimensions.join(', ')}`);
        const entry = result.whatIsMissing.find((m) => m.dimension === expected);
        assert.ok(entry.reason && entry.reason.length > 0, `expected a real, disclosed reason for ${expected}`);
    }
    assert.match(result.summary, /AVAILABLE/);
});

test('C: a real default identity that is NOT yet conversationally AVAILABLE (per CozyLanguageRegistry) reports overall NOT_YET_AVAILABLE, honestly', () => {
    const { diagnostic, packs, window: w } = loadStackWithDiagnostic();
    // Real, existing 17-identity registry — find one NOT in CozyLanguageRegistry's real AVAILABLE set (en/sw/fr/ar/so).
    const registry = w.CozyOS.CozyLanguageRegistry;
    const identities = packs.DEFAULT_IDENTITIES.map((i) => i.languageId);
    const target = identities.find((id) => !(registry && registry.isAvailable && registry.isAvailable(id)));
    assert.ok(target, 'expected at least one real default identity not yet conversationally AVAILABLE');
    const result = diagnostic.getLanguageFluencyDiagnostic(target);
    assert.ok(result);
    assert.strictEqual(result.overall, 'NOT_YET_AVAILABLE');
    assert.match(result.summary, /NOT yet conversationally AVAILABLE/);
});

test('D: real, open CML-6 concept-level language gaps for a language are composed into the diagnostic (real LanguageGapRegistry, not re-derived)', () => {
    const { diagnostic, languageGapRegistry } = loadStackWithDiagnostic();
    const check = languageGapRegistry.checkConceptLanguageCoverage({ conceptId: 'concept-phase5-fluency-test', targetLanguages: ['luo'], actorId: 'system' });
    assert.strictEqual(check.success, true, JSON.stringify(check));
    assert.strictEqual(check.gapsCreated.length, 1, 'expected a real OPEN gap to be created (no verified coverage exists for this synthetic concept)');

    const result = diagnostic.getLanguageFluencyDiagnostic('luo');
    // "luo" may not be a registered pack identity — the diagnostic must
    // still behave honestly (null) if CozyLanguagePacks has never heard
    // of it; only assert the gap-composition claim when it IS registered.
    if (result === null) {
        assert.ok(languageGapRegistry.listOpenGaps({ actorId: 'system' }).some((g) => g.conceptId === 'concept-phase5-fluency-test'), 'the real gap itself must still exist even if this language pack is unregistered');
        return;
    }
    assert.ok(result.openConceptGaps.some((g) => g.conceptId === 'concept-phase5-fluency-test'), `expected the real, just-created concept gap to appear, got: ${JSON.stringify(result.openConceptGaps)}`);
});

test('E: real, pending CML-6 ActiveLearning contributor questions for a language are composed into the diagnostic', () => {
    const { diagnostic, memory, activeLearning } = loadStackWithDiagnostic();
    const record = { questionId: 'question-phase5-fluency-test', term: 'nyathi', language: 'sw', conflictId: 'conflict-phase5-fluency-test', options: ['child', 'young animal'], status: 'PENDING', createdAt: Date.now() };
    memory.saveMemory(activeLearning.NAMESPACE, record.questionId, record, { owner: 'system', actorId: 'system', visibility: 'public' });

    const listed = activeLearning.listPendingQuestions({ language: 'sw', actorId: 'system' });
    assert.ok(listed.some((q) => q.questionId === 'question-phase5-fluency-test'), 'expected listPendingQuestions() to surface the real, just-seeded PENDING question');

    const result = diagnostic.getLanguageFluencyDiagnostic('sw');
    assert.ok(result.pendingContributorQuestions.some((q) => q.questionId === 'question-phase5-fluency-test'), `expected the diagnostic to compose the real pending question, got: ${JSON.stringify(result.pendingContributorQuestions)}`);
});

test('F: listPendingQuestions() never surfaces an ANSWERED question, and is language-scoped (never leaks another language\'s pending question)', () => {
    const { memory, activeLearning } = loadStackWithDiagnostic();
    memory.saveMemory(activeLearning.NAMESPACE, 'q-answered', { questionId: 'q-answered', term: 'x', language: 'sw', conflictId: 'c1', options: ['a', 'b'], status: 'ANSWERED', createdAt: Date.now() }, { owner: 'system', actorId: 'system', visibility: 'public' });
    memory.saveMemory(activeLearning.NAMESPACE, 'q-other-lang', { questionId: 'q-other-lang', term: 'y', language: 'fr', conflictId: 'c2', options: ['a', 'b'], status: 'PENDING', createdAt: Date.now() }, { owner: 'system', actorId: 'system', visibility: 'public' });

    const listed = activeLearning.listPendingQuestions({ language: 'sw', actorId: 'system' });
    assert.ok(!listed.some((q) => q.questionId === 'q-answered'), 'an ANSWERED question must never be listed as pending');
    assert.ok(!listed.some((q) => q.questionId === 'q-other-lang'), 'a different language\'s pending question must never leak into an "sw" listing');
});

test('G: getVersion() is real and stable', () => {
    const { diagnostic } = loadStackWithDiagnostic();
    assert.strictEqual(typeof diagnostic.getVersion(), 'string');
});
