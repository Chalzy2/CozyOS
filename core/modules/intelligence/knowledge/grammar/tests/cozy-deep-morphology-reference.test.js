'use strict';

/**
 * core/modules/intelligence/knowledge/grammar/tests/cozy-deep-morphology-reference.test.js
 * EXECUTED via `node --test` this session.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..', '..');
const REF_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'grammar', 'cozy-deep-morphology-reference.js');
const STRUCTURAL_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language-packs', 'cozy-kiswahili-structural-analysis.js');
const LEXICON_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-lexicon-en-sw.js');

function freshStack() {
    delete require.cache[require.resolve(REF_PATH)];
    global.window = {};
    require(REF_PATH);
    return global.window.CozyOS;
}

test('A1: exposes the 3 advanced tense markers and 3 clause-marker categories from the supplied spec', () => {
    const CozyOS = freshStack();
    const ref = CozyOS.CozyDeepMorphologyReference;
    assert.equal(ref.advancedVerbTenseMarkers.counterfactualConditional, '-ange-');
    assert.equal(ref.clauseMarkers.counterfactualStarters.length, 3);
    assert.equal(ref.clauseMarkers.consequentialMarkers.length, 4);
    assert.equal(ref.clauseMarkers.temporalConnectors.length, 4);
});

test('B1: containsClauseMarker finds a counterfactual starter in a novel sentence', () => {
    const CozyOS = freshStack();
    const m = CozyOS.CozyDeepMorphologyReference.containsClauseMarker(
        'Kama ningekuwa na muda, ningesoma zaidi.',
        'counterfactualStarters'
    );
    assert.equal(m, 'kama');
});

test('B2: containsClauseMarker finds a temporal connector', () => {
    const CozyOS = freshStack();
    const m = CozyOS.CozyDeepMorphologyReference.containsClauseMarker(
        'Nitakupigia simu baada ya mkutano.',
        'temporalConnectors'
    );
    assert.equal(m, 'baada ya');
});

test('B3: honest null for an unrelated sentence', () => {
    const CozyOS = freshStack();
    const m = CozyOS.CozyDeepMorphologyReference.containsClauseMarker(
        'Ninataka chai ya tangawizi.',
        'counterfactualStarters'
    );
    assert.equal(m, null);
});

test('B4: honest null for an unknown category name (no crash)', () => {
    const CozyOS = freshStack();
    const m = CozyOS.CozyDeepMorphologyReference.containsClauseMarker('Kama ningekuwa...', 'notARealCategory');
    assert.equal(m, null);
});

test('C1: this file does NOT define a decomposeVerb-style function (disclosure: reference data only)', () => {
    const CozyOS = freshStack();
    assert.equal(typeof CozyOS.CozyDeepMorphologyReference.decomposeVerb, 'undefined');
    assert.equal(typeof CozyOS.CozyDeepMorphologyReference.parseSentence, 'undefined');
});

test('D1: the existing structural-analysis engine is untouched and still loads independently', () => {
    delete require.cache[require.resolve(STRUCTURAL_PATH)];
    delete require.cache[require.resolve(LEXICON_PATH)];
    global.window = {};
    require(LEXICON_PATH);
    require(STRUCTURAL_PATH);
    assert.ok(global.window.CozyOS.CozyKiswahiliStructuralAnalysis, 'structural analysis module should still register itself exactly as before');
});

test('E1: loading the grammar reference layer does not touch the 473-record lexicon', () => {
    delete require.cache[require.resolve(LEXICON_PATH)];
    global.window = {};
    require(LEXICON_PATH);
    const before = global.window.CozyOS.CozyLexiconEnSw.getRecordCount();
    require(REF_PATH);
    const after = global.window.CozyOS.CozyLexiconEnSw.getRecordCount();
    assert.equal(before, 473);
    assert.equal(after, 473);
});
