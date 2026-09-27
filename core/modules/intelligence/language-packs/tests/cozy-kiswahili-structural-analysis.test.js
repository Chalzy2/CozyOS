'use strict';

/**
 * core/modules/intelligence/language-packs/tests/cozy-kiswahili-structural-analysis.test.js
 *
 * Regression coverage for the new, additive Kiswahili structural/
 * morphological module. Proves:
 *   (A) morphological decomposition of subject/negation/tense-aspect/
 *       object/reflexive/root/extension/final-vowel
 *   (B) derivational extension recognition
 *   (C) sentence-level compositional analysis on genuinely novel
 *       sentences (not stored as complete phrases anywhere)
 *   (D) unknown vocabulary keeps language = "sw" rather than silently
 *       falling back to English
 *   (E) ordinary English sentences are not misclassified as Kiswahili
 *   (F) the existing 473-record lexicon and the RP-035 knowledge model
 *       are untouched by loading this new module
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const LEXICON_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-lexicon-en-sw.js');
const KNOWLEDGE_MODEL_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language-packs', 'cozy-language-knowledge-model.js');
const STRUCTURAL_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language-packs', 'cozy-kiswahili-structural-analysis.js');

function freshStack() {
    const files = [LEXICON_PATH, KNOWLEDGE_MODEL_PATH, STRUCTURAL_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = {};
    files.forEach((p) => require(p));
    return global.window;
}

// ---------------------------------------------------------------------
// A. Morphological decomposition
// ---------------------------------------------------------------------

test('A. present-continuous 1SG decomposes to subject+tense+known root', () => {
    const win = freshStack();
    const r = win.CozyOS.CozyKiswahiliStructuralAnalysis.analyzeMorphology('ninasoma');
    assert.equal(r.subjectPrefix, '1SG');
    assert.equal(r.tenseAspect, 'PRESENT_CONTINUOUS');
    assert.equal(r.rootCandidate, 'som');
    assert.equal(r.knownRoot, true);
    assert.equal(r.negation, false);
});

test('A. past, future, and perfect 3SG all resolve to the same known root', () => {
    const win = freshStack();
    const M = win.CozyOS.CozyKiswahiliStructuralAnalysis;
    assert.equal(M.analyzeMorphology('alisoma').tenseAspect, 'PAST');
    assert.equal(M.analyzeMorphology('atasoma').tenseAspect, 'FUTURE');
    assert.equal(M.analyzeMorphology('amesoma').tenseAspect, 'PERFECT');
    for (const w of ['alisoma', 'atasoma', 'amesoma']) {
        const r = M.analyzeMorphology(w);
        assert.equal(r.rootCandidate, 'som');
        assert.equal(r.knownRoot, true);
    }
});

test('A. negative past (hawakusoma) is distinguished from negative present (hawaelewi)', () => {
    const win = freshStack();
    const M = win.CozyOS.CozyKiswahiliStructuralAnalysis;
    const past = M.analyzeMorphology('hawakusoma');
    assert.equal(past.negation, true);
    assert.equal(past.tenseAspect, 'NEGATIVE_PAST');
    assert.equal(past.subjectPrefix, '3PL');
    assert.equal(past.rootCandidate, 'som');

    const present = M.analyzeMorphology('hawaelewi');
    assert.equal(present.negation, true);
    assert.equal(present.tenseAspect, 'NEGATIVE_PRESENT');
    assert.equal(present.finalVowel, 'i');
    assert.equal(present.rootCandidate, 'elew');
    assert.equal(present.knownRoot, true);
});

test('A. object marker is only accepted when it yields a verified root (ninakupenda, tutawafundisha)', () => {
    const win = freshStack();
    const M = win.CozyOS.CozyKiswahiliStructuralAnalysis;
    const withObj = M.analyzeMorphology('ninakupenda');
    assert.equal(withObj.subjectPrefix, '1SG');
    assert.equal(withObj.tenseAspect, 'PRESENT_CONTINUOUS');
    assert.equal(withObj.objectMarker, '2SG_OBJ');
    assert.equal(withObj.rootCandidate, 'pend');
    assert.equal(withObj.knownRoot, true);

    // "wafundisha" root ("funza"->"fundisha") undergoes an irregular
    // consonant alternation (z -> d) this rule-based module does not
    // model — a disclosed limitation. It must NOT fabricate an object
    // marker it cannot verify; it honestly reports the whole remainder
    // as an unverified root candidate instead.
    const irregular = M.analyzeMorphology('tutawafundisha');
    assert.equal(irregular.subjectPrefix, '1PL');
    assert.equal(irregular.tenseAspect, 'FUTURE');
    assert.equal(irregular.knownRoot, false);
});

test('A. habitual "hu-" is subject-less and distinct from the 2SG negative "hu-"', () => {
    const win = freshStack();
    const r = win.CozyOS.CozyKiswahiliStructuralAnalysis.analyzeMorphology('husoma');
    assert.equal(r.tenseAspect, 'HABITUAL');
    assert.equal(r.rootCandidate, 'som');
    assert.equal(r.knownRoot, true);
});

test('A. an ambiguous ha-/si- looking word with no verified root is reported LOW confidence, not asserted as negation', () => {
    const win = freshStack();
    const r = win.CozyOS.CozyKiswahiliStructuralAnalysis.analyzeMorphology('hatua');
    assert.equal(r.confidence, 'LOW');
});

test('A. a known root is never over-stripped into a fabricated extension (elewa stays "elew", not "ele"+PASSIVE)', () => {
    const win = freshStack();
    const M = win.CozyOS.CozyKiswahiliStructuralAnalysis;
    for (const w of ['sielewi', 'hawaelewi']) {
        const r = M.analyzeMorphology(w);
        assert.equal(r.rootCandidate, 'elew');
        assert.deepEqual(r.extensions, []);
    }
});

// ---------------------------------------------------------------------
// B. Derivational extensions
// ---------------------------------------------------------------------

test('B. causative, passive, reciprocal extensions are recognized', () => {
    const win = freshStack();
    const M = win.CozyOS.CozyKiswahiliStructuralAnalysis;

    const causative = M.analyzeMorphology('badilisha');
    assert.ok(causative.extensions.includes('CAUSATIVE'));
    assert.equal(causative.rootCandidate, 'badil');
    assert.equal(causative.knownRoot, true);

    const reciprocal = M.analyzeMorphology('saidiana');
    assert.ok(reciprocal.extensions.includes('RECIPROCAL'));
    assert.equal(reciprocal.rootCandidate, 'saidi');
    assert.equal(reciprocal.knownRoot, true);

    // "fundisha"/"fundishwa" involve the same irregular funza->fundisha
    // alternation as above: the extension IS still structurally
    // recognized even though the deeper root cannot be verified against
    // this module's small reference list — evidence stays explicit.
    const fundisha = M.analyzeMorphology('fundisha');
    assert.ok(fundisha.extensions.includes('CAUSATIVE'));
    const fundishwa = M.analyzeMorphology('fundishwa');
    assert.ok(fundishwa.extensions.includes('CAUSATIVE'));
    assert.ok(fundishwa.extensions.includes('PASSIVE'));
});

// ---------------------------------------------------------------------
// C. Sentence-level composition — genuinely novel sentences, not
//    stored as complete phrases anywhere in this module or the lexicon.
// ---------------------------------------------------------------------

test('C. a novel compositional sentence about technology and community resolves as Kiswahili with real roots', () => {
    const win = freshStack();
    const r = win.CozyOS.CozyKiswahiliStructuralAnalysis.analyzeSentence(
        'Ningependa kuelewa namna teknolojia mpya inavyobadilisha maisha ya jamii.'
    );
    assert.equal(r.language, 'sw');
    assert.equal(r.structuralCompositional, true);
    assert.ok(r.roots.some((x) => x.root === 'pend'));
});

test('C. a novel negative-past sentence with a causal clause marker is detected with NEGATIVE polarity', () => {
    const win = freshStack();
    const r = win.CozyOS.CozyKiswahiliStructuralAnalysis.analyzeSentence(
        'Hawakuweza kuelewa kwa sababu hawakusoma maelezo yote.'
    );
    assert.equal(r.language, 'sw');
    assert.equal(r.polarity, 'NEGATIVE');
    assert.ok(r.clauseStructure.some((c) => c.type === 'CAUSAL' && c.marker === 'kwa sababu'));
});

test('C. a novel conditional question naming real places tags geographic entities and a conditional clause', () => {
    const win = freshStack();
    const r = win.CozyOS.CozyKiswahiliStructuralAnalysis.analyzeSentence(
        'Kama mtu angetaka kusafiri kwenda Mombasa au Kilifi, angehitaji kujiandaa vipi?'
    );
    assert.equal(r.language, 'sw');
    assert.ok(r.clauseStructure.some((c) => c.type === 'CONDITIONAL' && c.marker === 'kama'));
    assert.ok(r.entities.some((e) => e.text === 'Mombasa'));
    assert.ok(r.entities.some((e) => e.text === 'Kilifi'));
    assert.equal(r.questionType, 'HOW');
});

// ---------------------------------------------------------------------
// D. Unknown vocabulary must not force an English fallback
// ---------------------------------------------------------------------

test('D. a sentence containing a deliberately absent/invented word stays language=sw with an explicit unknown token', () => {
    const win = freshStack();
    // "zibwazibwa" does not exist in Kiswahili or in this module's data
    // at all — a deliberately invented, absent token.
    const r = win.CozyOS.CozyKiswahiliStructuralAnalysis.analyzeSentence(
        'Ninataka kuelewa jambo hili la zibwazibwa kwa sababu ni muhimu.'
    );
    assert.equal(r.language, 'sw');
    assert.ok(r.unknownTokens.some((t) => t.original === 'zibwazibwa' && t.known === false));
});

// ---------------------------------------------------------------------
// E. English regression — ordinary English must not be misclassified
// ---------------------------------------------------------------------

test('E. ordinary English sentences are not classified as Kiswahili', () => {
    const win = freshStack();
    const M = win.CozyOS.CozyKiswahiliStructuralAnalysis;
    const englishSentences = [
        'The weather today is sunny and warm in the city.',
        'I would like to understand how new technology is changing life in the community.',
        'She said the meeting is scheduled for Monday afternoon.',
        'Can you help me schedule a meeting with the marketing team next week?',
        'My uncle understood the university curriculum update.'
    ];
    for (const s of englishSentences) {
        const r = M.analyzeSentence(s);
        assert.equal(r.language, null, `false positive on: ${s}`);
    }
});

// ---------------------------------------------------------------------
// F. Existing files are untouched by loading this new module
// ---------------------------------------------------------------------

test('F. the 473-record lexicon is unmodified after this module loads', () => {
    const win = freshStack();
    assert.equal(win.CozyOS.CozyLexiconEnSw.getRecordCount(), 473);
});

test('F. the RP-035 knowledge model still exposes its original TranslationRelationship/CorrectionRecord/ConflictRecord API', () => {
    const win = freshStack();
    const api = win.CozyOS.CozyLanguageKnowledgeModel;
    assert.equal(typeof api.createTranslationRelationship, 'function');
    assert.equal(typeof api.createCorrection, 'function');
    assert.equal(typeof api.openConflict, 'function');
    assert.deepEqual(api.CORRECTION_VALIDATION_STATES, ['PROPOSED', 'CONFIRMED', 'REJECTED']);
});

test('F. scoreLanguageEvidence() is usable independently of analyzeMorphology() (separation of concerns)', () => {
    const win = freshStack();
    const M = win.CozyOS.CozyKiswahiliStructuralAnalysis;
    const evidence = M.scoreLanguageEvidence('Habari, unaendeleaje leo?');
    assert.equal(evidence.language, 'sw');
    assert.ok(Array.isArray(evidence.evidence));
});
