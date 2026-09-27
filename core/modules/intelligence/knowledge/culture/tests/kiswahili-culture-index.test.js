'use strict';

/**
 * core/modules/intelligence/knowledge/culture/tests/kiswahili-culture-index.test.js
 * Regression + generalization coverage for the new, additive Kiswahili
 * proverbs/idioms culture layer. All tests below were EXECUTED via
 * `node --test` in this session.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');
const PROVERBS_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'culture', 'kiswahili-proverbs.js');
const IDIOMS_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'culture', 'kiswahili-idioms.js');
const INDEX_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'culture', 'kiswahili-culture-index.js');
const LEXICON_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-lexicon-en-sw.js');

function freshStack() {
    const files = [PROVERBS_PATH, IDIOMS_PATH, INDEX_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = {};
    files.forEach((p) => require(p));
    return global.window.CozyOS;
}

test('A1: proverb coverage is exactly 10 (disclosed starter set)', () => {
    const CozyOS = freshStack();
    assert.equal(CozyOS.CozyKiswahiliProverbs.count, 10);
});

test('A2: idiom coverage is exactly 9 (disclosed starter set)', () => {
    const CozyOS = freshStack();
    assert.equal(CozyOS.CozyKiswahiliIdioms.count, 9);
});

test('A3: getCounts() matches sub-module counts exactly', () => {
    const CozyOS = freshStack();
    const counts = CozyOS.CozyKiswahiliCulture.getCounts();
    assert.equal(counts.proverbs, 10);
    assert.equal(counts.idioms, 9);
});

test('B1: exact proverb lookup by expression', () => {
    const CozyOS = freshStack();
    const p = CozyOS.CozyKiswahiliProverbs.findByExpression('Penye nia pana njia');
    assert.equal(p.englishExplanation, "Where there's a will, there's a way.");
});

test('B2: exact idiom lookup by expression', () => {
    const CozyOS = freshStack();
    const i = CozyOS.CozyKiswahiliIdioms.findByExpression('Shika ukuta');
    assert.equal(i.englishMeaning, 'To be flabbergasted.');
});

test('C1: recognizeExpression finds a proverb embedded in a full novel sentence', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyKiswahiliCulture.recognizeExpression(
        'Rafiki yangu ananitania kuwa mimi ni mtu wa haraka, lakini namkumbusha kwamba haraka haraka haina baraka.'
    );
    assert.ok(result);
    assert.equal(result.type, 'proverb');
    assert.equal(result.record.expression, 'Haraka haraka haina baraka');
});

test('C2: recognizeExpression finds an idiom embedded in a full novel sentence', () => {
    // Note: recognition here relies on the idiom's exact words
    // ("shika ukuta") occurring as a substring — Kiswahili subject/
    // tense prefixes fuse onto the verb without a space ("ali" +
    // "shika" -> "alishika"), so a prefixed-but-otherwise-unchanged
    // form is still found. A vowel-changed inflection (e.g. the
    // subjunctive "nishike") would NOT be found — see this module's
    // own disclosed substring-only limitation.
    const CozyOS = freshStack();
    const result = CozyOS.CozyKiswahiliCulture.recognizeExpression(
        'Bei ile mpya ilipotangazwa, alishika ukuta kabisa!'
    );
    assert.ok(result);
    assert.equal(result.type, 'idiom');
    assert.equal(result.record.expression, 'Shika ukuta');
});

test('C2b: a vowel-changed inflection of the same idiom is honestly NOT recognized (disclosed limitation)', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyKiswahiliCulture.recognizeExpression(
        'Ilibidi nishike ukuta niliposikia bei hiyo.'
    );
    assert.equal(result, null);
});

test('C3: case- and whitespace-insensitive recognition', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyKiswahiliCulture.recognizeExpression('HARAKA   HARAKA HAINA BARAKA');
    assert.ok(result);
    assert.equal(result.record.id, CozyOS.CozyKiswahiliProverbs.findByExpression('Haraka haraka haina baraka').id);
});

test('D1: honest null when no known proverb/idiom is present (not fabricated)', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyKiswahiliCulture.recognizeExpression('Ninataka kufungua akaunti yangu leo.');
    assert.equal(result, null);
});

test('D2: an ordinary English sentence returns null (no false positive)', () => {
    const CozyOS = freshStack();
    const result = CozyOS.CozyKiswahiliCulture.recognizeExpression('Please help me open my dashboard.');
    assert.equal(result, null);
});

test('E1: longest-expression-first — a fully-contained shorter idiom does not shadow a more specific match', () => {
    // "Kula njama" and "Kula chumvi nyingi" both start with "Kula"; a
    // sentence containing the longer, more specific idiom must return
    // THAT idiom, not a shorter accidental partial.
    const CozyOS = freshStack();
    const result = CozyOS.CozyKiswahiliCulture.recognizeExpression('Mzee huyu amekula chumvi nyingi; sikiliza ushauri wake.');
    assert.equal(result.record.expression, 'Kula chumvi nyingi');
});

test('F1: loading the culture layer does not touch the 473-record lexicon', () => {
    const files = [LEXICON_PATH, PROVERBS_PATH, IDIOMS_PATH, INDEX_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = {};
    require(LEXICON_PATH);
    const before = global.window.CozyOS.CozyLexiconEnSw.getRecordCount();
    require(PROVERBS_PATH);
    require(IDIOMS_PATH);
    require(INDEX_PATH);
    const after = global.window.CozyOS.CozyLexiconEnSw.getRecordCount();
    assert.equal(before, 473);
    assert.equal(after, 473);
});
