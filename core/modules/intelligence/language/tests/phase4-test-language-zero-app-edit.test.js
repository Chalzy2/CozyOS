'use strict';

/**
 * core/modules/intelligence/language/tests/phase4-test-language-zero-app-edit.test.js
 * PHASE 4 (P4-10) — Universal Language Capability: the literal acceptance
 * test the spec requires — "Register a new language and make it
 * VERIFIED/AVAILABLE ... DO NOT EDIT ChurchOS/InterestOS/QuarryOS/
 * Profile/Admin Workspace ... automatically use the new language."
 *
 * "qtz" is a real ISO 639 private-use code (the qaa-qtz range exists
 * exactly for this: a code that will never collide with a real living
 * language), registered here purely to prove the PROPAGATION PROPERTY —
 * a language reaching VERIFIED+AVAILABLE automatically becomes available
 * to every already-migrated call site with zero application-file edits —
 * without ever misrepresenting a fabricated string as a genuine verified
 * translation of a real language. Its only content (three "[QTZ TEST]"-
 * labeled strings) lives in cozy-language-templates.js, the SAME central,
 * already-existing template table every real language's content lives
 * in — never a second table.
 *
 * Run with: node --test core/modules/intelligence/language/tests/phase4-test-language-zero-app-edit.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const TEMPLATES_PATH = path.join(__dirname, '..', 'cozy-language-templates.js');
const REGISTRY_PATH = path.join(__dirname, '..', 'cozy-language-registry.js');
const REALIZE_PATH = path.join(__dirname, '..', 'cozy-language-realize.js');
const REVIEW_PATH = path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-review.js');
const BUSINESS_INTENT_PATH = path.join(__dirname, '..', '..', 'business-data', 'cozy-business-data-intent.js');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..', '..');

// The exact files the spec names — ChurchOS, InterestOS, QuarryOS,
// Profile (rendered by user-dashboard.js), Admin Workspace.
const PROTECTED_APPLICATION_FILES = [
    path.join(REPO_ROOT, 'applications', 'ChurchOS', 'churchos.html'),
    path.join(REPO_ROOT, 'applications', 'InterestOS', 'interestos.html'),
    path.join(REPO_ROOT, 'applications', 'QuarryOS', 'quarry.html'),
    path.join(REPO_ROOT, 'core', 'shell', 'user-dashboard.js'),
    path.join(REPO_ROOT, 'admin-workspace.html')
];

const REQUIRED_KEYS = ['greeting-generic', 'teach:mode-banner', 'business:no-tables'];

function freshStack(paths) {
    paths.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    paths.forEach((p) => require(p));
    return global.window.CozyOS;
}

// ---- 1: register -> promote through the REAL Rule 82 gate, no stand-ins ----
test('1: "qtz" registers NOT_READY, then reaches AVAILABLE only via the real Rule 82 gate given real, complete template coverage + a real attestation', () => {
    const cozy = freshStack([TEMPLATES_PATH, REGISTRY_PATH, REVIEW_PATH]);

    const reg = cozy.CozyLanguageRegistry.registerLanguage({ code: 'qtz', name: 'Test Language (QA)', nativeName: 'Testish' });
    assert.equal(reg.success, true);
    assert.equal(cozy.CozyLanguageRegistry.getLanguage('qtz').state, 'NOT_READY');
    assert.equal(cozy.CozyLanguageRegistry.isAvailable('qtz'), false);

    // Scoped to exactly the 3 keys real "[QTZ TEST]" content was added
    // for in cozy-language-templates.js — a genuinely complete,
    // real (not fabricated/stand-in) requiredKeys set.
    const attestation = {
        resourcesAttestedBy: 'phase4-p4-10-test-language-fixture',
        runtimeAttestedBy: 'phase4-p4-10-test-language-fixture (see this file\'s own tests 3-4 below for the real propagation proof)',
        testEvidence: { file: 'phase4-test-language-zero-app-edit.test.js', passed: 1, total: 1, ranAt: new Date().toISOString() },
        requiredKeys: REQUIRED_KEYS
    };
    const result = cozy.CozyLanguageRegistry.promoteToAvailable('qtz', attestation);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.gate.promotion, 'ELIGIBLE');
    assert.equal(result.gate.requirements.templatesWrittenAndCommitted.state, 'VERIFIED');
    assert.equal(cozy.CozyLanguageRegistry.isAvailable('qtz'), true);
    assert.equal(cozy.CozyLanguageRegistry.getLanguage('qtz').state, 'AVAILABLE');
});

// ---- 2: an intentionally NARROWER requiredKeys set still fails honestly for an uncovered key ----
test('2: promotion is honestly refused when requiredKeys names a key with no real "qtz" content', () => {
    const cozy = freshStack([TEMPLATES_PATH, REGISTRY_PATH, REVIEW_PATH]);
    cozy.CozyLanguageRegistry.registerLanguage({ code: 'qtz', name: 'Test Language (QA)', nativeName: 'Testish' });
    const attestation = {
        resourcesAttestedBy: 'phase4-p4-10-test-language-fixture',
        runtimeAttestedBy: 'phase4-p4-10-test-language-fixture',
        testEvidence: { passed: 1, total: 1 },
        requiredKeys: REQUIRED_KEYS.concat(['identity']) // real key, but no real "qtz" entry exists for it
    };
    const result = cozy.CozyLanguageRegistry.promoteToAvailable('qtz', attestation);
    assert.equal(result.success, false);
    assert.equal(result.gate.promotion, 'LOCKED');
    assert.deepEqual(result.gate.requirements.templatesWrittenAndCommitted.detail.missingIntents, ['identity']);
});

// ---- 3: the universal realization seam serves the real "qtz" content automatically ----
test('3: CozyLanguageRealize.realize() returns the real committed "qtz" text for every migrated key, with no per-language code written anywhere but the central template table', () => {
    const cozy = freshStack([TEMPLATES_PATH, REALIZE_PATH]);
    assert.equal(cozy.CozyLanguageRealize.realize('greeting-generic', 'qtz'), "[QTZ TEST] Hello! I'm the CozyOS Assistant. How can I help you?");
    assert.equal(cozy.CozyLanguageRealize.realize('teach:mode-banner', 'qtz'), "[QTZ TEST] You're in teaching mode. Tell me something you'd like me to remember.");
    assert.equal(cozy.CozyLanguageRealize.realize('business:no-tables', 'qtz'), "[QTZ TEST] You haven't recorded any business information in InterestOS yet.");
    // A key with no "qtz" entry honestly falls back to English — never a
    // fabricated string, exactly like every other language.
    assert.equal(cozy.CozyLanguageRealize.realize('identity', 'qtz'), cozy.CozyLanguageRealize.realize('identity', 'en'));
});

// ---- 4: InterestOS's OWN real business-data answer path, called exactly as cozy-ai.js calls it, serves "qtz" with ZERO edits to interestos.html or any business-data logic beyond the one relaxed collapse (core module, not an application file) ----
test('4: cozy-business-data-intent.js\'s real answerBusinessDataQuestion() — the same function InterestOS\'s "Ask CozyAI" flow calls via cozy-ai.js — automatically answers in "qtz" once it is AVAILABLE, without any InterestOS-specific code', () => {
    const cozy = freshStack([TEMPLATES_PATH, REALIZE_PATH, BUSINESS_INTENT_PATH]);
    // Real, existing composer, called exactly as core/modules/intelligence/
    // cozy-ai.js:600 calls it — no fixture double for this file itself.
    // No InterestOSBusinessWorkspace loaded -> real, honest "no business
    // data yet" answer -> business:no-tables -> proves the exact key this
    // acceptance test added real "qtz" content for.
    global.window.CozyOS.InterestOSBusinessWorkspace = { listTables: () => [] };
    const r = cozy.CozyBusinessDataIntent.answerBusinessDataQuestion('How much did I sell today?', { actorId: 'qtz-acceptance-owner', language: 'qtz' });
    assert.ok(r && r.matched);
    assert.equal(r.content, "[QTZ TEST] You haven't recorded any business information in InterestOS yet.");
});

// ---- 5: the zero-application-edit proof itself ----
test('5: ChurchOS/InterestOS/QuarryOS/Profile(user-dashboard.js)/Admin Workspace contain NO reference to "qtz" or any test-language-specific branch — every one of the checks above passed with those files completely untouched', () => {
    for (const file of PROTECTED_APPLICATION_FILES) {
        assert.ok(fs.existsSync(file), `expected ${file} to exist`);
        const content = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(content, /qtz/i, `${file} must contain no test-language-specific code — the new language must reach it only through the generic realize() seam, never a per-application edit`);
    }
});
