'use strict';

/**
 * core/modules/intelligence/answer/tests/cozy-answer-security-boundary.test.js
 *
 * SA-8 Phase 3 — unit-level tests for window.CozyOS.AnswerSecurityBoundary
 * (core/modules/intelligence/answer/cozy-answer-security-boundary.js), the
 * permanent product/security rule that strips internal file paths,
 * filenames, function-call syntax, and internal architecture class-name
 * vocabulary from any text about to reach a user.
 *
 * Run with: node --test core/modules/intelligence/answer/tests/cozy-answer-security-boundary.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function load() {
    delete require.cache[require.resolve('../cozy-answer-security-boundary.js')];
    global.window = { CozyOS: {} };
    require('../cozy-answer-security-boundary.js');
    return global.window.CozyOS.AnswerSecurityBoundary;
}

test('registers window.CozyOS.AnswerSecurityBoundary', () => {
    const B = load();
    assert.ok(B);
    assert.equal(typeof B.sanitize, 'function');
    assert.equal(typeof B.detectLeaks, 'function');
});

test('strips a real repository-shaped file path from user-facing text', () => {
    const B = load();
    const text = 'This feature is real, see core/modules/intelligence/media/cozy-media-intelligence.js for details.';
    assert.ok(B.detectLeaks(text).length > 0);
    assert.ok(!B.sanitize(text).includes('.js'));
});

test('strips a bare filename with a code extension even without a path prefix', () => {
    const B = load();
    const text = 'The logic lives in churchOS-core.js today.';
    assert.ok(!B.sanitize(text).includes('churchOS-core.js'));
});

test('strips real function-call syntax (identifier immediately followed by empty parens)', () => {
    const B = load();
    const text = 'This works via searchByPersonReference() internally.';
    assert.ok(!B.sanitize(text).includes('searchByPersonReference()'));
});

test('strips internal architecture class-name vocabulary (Engine/Registry/Adapter/Provider/Coordinator/Contract/Realizer/Planner suffixes)', () => {
    const B = load();
    const suffixed = ['CognitiveCoordinator', 'OrganizationRegistry', 'VerifiedEvidenceAdapter', 'GeminiCloudProvider', 'SemanticAnswerPlanContract', 'LanguageRealizer', 'SemanticAnswerPlanner'];
    for (const word of suffixed) {
        const text = `This is powered by ${word} under the hood.`;
        assert.ok(!B.sanitize(text).includes(word), `expected ${word} to be stripped`);
    }
});

test('never strips real product names, even though some share capitalization patterns with internal identifiers', () => {
    const B = load();
    const text = 'ChurchOS, QuarryOS, ShopOS, InterestOS, and CozyOS itself are all real applications.';
    const out = B.sanitize(text);
    for (const name of ['ChurchOS', 'QuarryOS', 'ShopOS', 'InterestOS', 'CozyOS']) {
        assert.ok(out.includes(name), `expected ${name} to survive sanitization, got: ${out}`);
    }
});

test('never touches ordinary prose with no internal identifiers at all — output is unchanged', () => {
    const B = load();
    const text = 'ChurchOS exists to help churches organize their work and serve people better every day.';
    assert.equal(B.sanitize(text), text);
    assert.deepEqual(B.detectLeaks(text), []);
});

test('never mistakes an ordinary parenthetical aside for a function call — content or a leading space inside/before the parens is always safe', () => {
    const B = load();
    const text = 'This covers unlimited broadcast (SFU/CDN) and other planned work (see below).';
    assert.equal(B.sanitize(text), text);
    assert.deepEqual(B.detectLeaks(text), []);
});

test('the real, previously-observed leak sentence (ChurchOS "not yet connected" disclosure) is fully cleaned: zero leaks remain after sanitize()', () => {
    const B = load();
    const text = 'Kazi halisi na inayofanya kazi ya searchByPersonReference() katika core/modules/intelligence/media/cozy-media-intelligence.js ipo, lakini churchOS-core.js haina rejeleo lolote kwake.';
    const sanitized = B.sanitize(text);
    assert.deepEqual(B.detectLeaks(sanitized), [], 'sanitized output must itself be leak-free: ' + sanitized);
});

test('detectLeaks() is a pure read: calling it never mutates the input or returns a different result on repeated calls', () => {
    const B = load();
    const text = 'See cozy-media-intelligence.js and searchByPersonReference() for the real implementation.';
    const first = B.detectLeaks(text);
    const second = B.detectLeaks(text);
    assert.deepEqual(first, second);
});

test('sanitize() is idempotent: sanitizing already-sanitized text produces the same result (no double-redaction artifacts)', () => {
    const B = load();
    const text = 'Real evidence via cozy-media-intelligence.js and searchByPersonReference() and OrganizationRegistry.';
    const once = B.sanitize(text);
    const twice = B.sanitize(once);
    assert.equal(once, twice);
});

test('degrades honestly on non-string input: returns the input unchanged rather than throwing', () => {
    const B = load();
    assert.equal(B.sanitize(null), null);
    assert.equal(B.sanitize(undefined), undefined);
    assert.equal(B.sanitize(42), 42);
    assert.deepEqual(B.detectLeaks(null), []);
    assert.deepEqual(B.detectLeaks(42), []);
});

test('empty string input is returned unchanged, never throws', () => {
    const B = load();
    assert.equal(B.sanitize(''), '');
});

test('double-registration on the same window is a real no-op (Modules[] guard), matching this repository\'s own established convention', () => {
    delete require.cache[require.resolve('../cozy-answer-security-boundary.js')];
    global.window = { CozyOS: {} };
    require('../cozy-answer-security-boundary.js');
    const first = global.window.CozyOS.AnswerSecurityBoundary;
    assert.ok(first, 'first load must set the export');
    delete require.cache[require.resolve('../cozy-answer-security-boundary.js')];
    require('../cozy-answer-security-boundary.js'); // SAME global.window — not recreated
    assert.equal(global.window.CozyOS.AnswerSecurityBoundary, first, 'a second load onto the same window must not reassign the export');
});
