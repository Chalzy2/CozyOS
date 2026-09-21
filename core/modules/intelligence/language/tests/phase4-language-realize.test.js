/**
 * core/modules/intelligence/language/tests/phase4-language-realize.test.js
 * PHASE 4 — Universal Language Capability: realization seam + the
 * new register/promote mutator on CozyLanguageRegistry, composed
 * through the real, existing Rule 82 gate (cozy-knowledge-review.js).
 *
 * Run with: node --test core/modules/intelligence/language/tests/phase4-language-realize.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const TEMPLATES_PATH = path.join(__dirname, '..', 'cozy-language-templates.js');
const REGISTRY_PATH = path.join(__dirname, '..', 'cozy-language-registry.js');
const REALIZE_PATH = path.join(__dirname, '..', 'cozy-language-realize.js');
const REVIEW_PATH = path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-review.js');

function freshStack(paths) {
    paths.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    paths.forEach((p) => require(p));
    return global.window.CozyOS;
}

// ---- A: realize() composes the real template table honestly ----
test('A: realize() returns the real committed English/Kiswahili template text, and null when the module is not loaded', () => {
    const cozy = freshStack([TEMPLATES_PATH, REALIZE_PATH]);
    const en = cozy.CozyLanguageRealize.realize('greeting-morning', 'en');
    const sw = cozy.CozyLanguageRealize.realize('greeting-morning', 'sw');
    assert.equal(typeof en, 'string');
    assert.equal(typeof sw, 'string');
    assert.notEqual(en, sw);

    const noModule = freshStack([REALIZE_PATH]); // templates NOT loaded
    assert.equal(noModule.CozyLanguageRealize.realize('greeting-morning', 'en'), null);
});

// ---- B: realize() invokes a function-valued template entry with real params ----
test('B: realize() calls a parameterized template entry and returns real interpolated text', () => {
    const cozy = freshStack([TEMPLATES_PATH, REALIZE_PATH]);
    // language-request:confirmed is a real, existing function-valued
    // entry taking (name) — confirmed by direct read of
    // cozy-language-templates.js.
    const en = cozy.CozyLanguageRealize.realize('language-request:confirmed', 'en', 'Luo');
    const sw = cozy.CozyLanguageRealize.realize('language-request:confirmed', 'sw', 'Luo');
    assert.equal(en, 'Yes — I can speak Luo.');
    assert.equal(sw, 'Ndiyo — ninaweza kuzungumza Luo.');
});

// ---- C: registerLanguage() + promoteToAvailable() — the real, new mutator ----
test('C: a newly registered language cannot be promoted without a real, disclosed attestation and complete template coverage', () => {
    const cozy = freshStack([TEMPLATES_PATH, REGISTRY_PATH, REVIEW_PATH]);
    const reg = cozy.CozyLanguageRegistry.registerLanguage({ code: 'zz-test', name: 'Test Language', nativeName: 'Test' });
    assert.equal(reg.success, true);
    assert.equal(cozy.CozyLanguageRegistry.isAvailable('zz-test'), false);

    // No attestation at all — must fail, never silently promote.
    const blocked = cozy.CozyLanguageRegistry.promoteToAvailable('zz-test', {});
    assert.equal(blocked.success, false);
    assert.equal(blocked.gate.promotion, 'LOCKED');
    assert.equal(cozy.CozyLanguageRegistry.isAvailable('zz-test'), false);
});

test('D: a real, disclosed attestation + a genuinely scoped, fully-covered required-key set reaches ELIGIBLE and promotes the language', () => {
    const cozy = freshStack([TEMPLATES_PATH, REGISTRY_PATH, REVIEW_PATH]);
    cozy.CozyLanguageRegistry.registerLanguage({ code: 'zz-test', name: 'Test Language', nativeName: 'Test' });

    // The real CozyLanguageTemplates.TEMPLATES table is Object.freeze()'d
    // (by design — see that file's own header) and cannot be mutated,
    // even for a test. cozy-knowledge-review.js's own templatesMod()
    // composes window.CozyOS.CozyLanguageTemplates fresh at call time
    // (lazy, disclosed composition — same pattern this repository uses
    // throughout), so this test substitutes a small, honest, test-only
    // stand-in for THAT other module — never for the promotion logic
    // under test (checkTemplatesComplete/evaluateRule82Gate/
    // promoteToAvailable), which all run for real, unmodified.
    global.window.CozyOS.CozyLanguageTemplates = {
        TEMPLATES: { 'greeting-morning': { en: 'Good morning.', 'zz-test': 'Test-language greeting.' } },
        getTemplate(key, lang) { const e = this.TEMPLATES[key]; return e ? (e[lang] || e.en || null) : null; }
    };

    const attestation = {
        resourcesAttestedBy: 'phase4-test-fixture',
        runtimeAttestedBy: 'phase4-test-fixture (real-browser suite, see cozy-language-realize.test.js)',
        testEvidence: { file: 'phase4-language-realize.test.js', passed: 1, total: 1, ranAt: new Date().toISOString() },
        requiredKeys: ['greeting-morning']
    };
    const result = cozy.CozyLanguageRegistry.promoteToAvailable('zz-test', attestation);
    assert.equal(result.success, true);
    assert.equal(result.gate.promotion, 'ELIGIBLE');
    assert.equal(cozy.CozyLanguageRegistry.isAvailable('zz-test'), true);
    assert.equal(cozy.CozyLanguageRegistry.getLanguage('zz-test').state, 'AVAILABLE');
});

// ---- E: byte-identical behavior for every real, pre-existing language (no requiredKeys/runtimeAttestedBy supplied) ----
test('E: omitting the new Phase 4 attestation fields reproduces the gate\'s exact prior behavior for a real language (still LOCKED, still requires all keys)', () => {
    const cozy = freshStack([TEMPLATES_PATH, REGISTRY_PATH, REVIEW_PATH]);
    const gate = cozy.CozyKnowledgeReview.evaluateRule82Gate('luo', { resourcesAttestedBy: 'someone' });
    assert.equal(gate.promotion, 'LOCKED'); // luo genuinely has zero template coverage — must not be ELIGIBLE
    assert.equal(gate.requirements.templatesWrittenAndCommitted.detail.scoped, false);
    assert.equal(gate.requirements.runtimeBehaviorObserved.state, 'NOT_TESTED_LIVE'); // no runtimeAttestedBy supplied
});

// ---- F: registerLanguage() never overwrites an existing language's identity ----
test('F: registerLanguage() rejects a code that already exists among the 11 static entries', () => {
    const cozy = freshStack([TEMPLATES_PATH, REGISTRY_PATH, REVIEW_PATH]);
    const result = cozy.CozyLanguageRegistry.registerLanguage({ code: 'sw', name: 'Impersonator' });
    assert.equal(result.success, false);
    assert.equal(cozy.CozyLanguageRegistry.getLanguage('sw').name, 'Kiswahili'); // unchanged
});
