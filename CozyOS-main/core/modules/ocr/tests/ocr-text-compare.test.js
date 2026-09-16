'use strict';

/**
 * core/modules/ocr/tests/ocr-text-compare.test.js
 *
 * NEXT DEPENDENCY (M395 continuation) — focused, node-only tests for
 * ocr-text-compare.js. No browser, no Tesseract, no vendor files, no
 * fixture images touched. Pure string-in/string-out proofs for:
 *
 *   (A) the CHI_SIM rule fixes the exact disclosed failure
 *   (B) the CHI_SIM rule CANNOT hide meaningful whitespace in ordinary
 *       non-CJK text (the specific proof Requirement 3 asks for)
 *   (C) the CHI_SIM rule does not fire across a CJK/non-CJK boundary
 *   (D) the YOR case: NFC and NFD are tested explicitly and BOTH fail
 *       to equalize recognized vs. ground truth — for both disclosed
 *       transcripts of the real run (see AUDIT) — so yor is proven to
 *       correctly remain OCR-RECOGNITION-FAILED, with no underdot/tone
 *       mark restored or substituted anywhere in this file.
 */

const assert = require('assert');
const { compareOcrText, stripInterCJKWhitespace } = require('./ocr-text-compare');

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    pass++;
  } catch (err) {
    console.log(`  \u2717 ${name} — ${err.message}`);
    fail++;
  }
}

console.log('=== ocr-text-compare focused tests ===\n');

console.log('-- (A) CHI_SIM: disclosed real failure is fixed --');

test('chi_sim disclosed failure (spaces between all 3 Han glyphs) now matches', () => {
  const groundTruth = '\u65e9\u4e0a\u597d'; // 早上好
  const recognized = '\u65e9 \u4e0a \u597d'; // 早 上 好 (disclosed real Tesseract output)
  const result = compareOcrText(recognized, groundTruth);
  assert.strictEqual(result.matches, true);
  assert.strictEqual(result.rule, 'CJK_INTER_CHAR_WHITESPACE');
});

test('chi_sim exact match (no spaces) still matches via EXACT, not the CJK rule', () => {
  const groundTruth = '\u65e9\u4e0a\u597d';
  const result = compareOcrText(groundTruth, groundTruth);
  assert.strictEqual(result.matches, true);
  assert.strictEqual(result.rule, 'EXACT');
});

console.log('\n-- (B) Proof: cannot hide meaningful whitespace in ordinary non-CJK text --');

test('English word-boundary space is preserved — dropping it is still a mismatch', () => {
  // "Cozy OS" vs "CozyOS" — if the rule were too broad, collapsing this
  // space would wrongly turn a real OCR word-merge bug into a false PASS.
  const result = compareOcrText('CozyOS', 'Cozy OS');
  assert.strictEqual(result.matches, false);
});

test('French sentence with meaningful spaces (fra fixture) is untouched — no CJK codepoints present', () => {
  const groundTruth = 'Bonjour, comment allez-vous ?';
  assert.strictEqual(stripInterCJKWhitespace(groundTruth), groundTruth);
  // A recognizer that dropped a real space is still correctly a mismatch.
  const recognized = 'Bonjour,comment allez-vous ?';
  const result = compareOcrText(recognized, groundTruth);
  assert.strictEqual(result.matches, false);
});

test('Cyrillic (rus fixture) with meaningful space is untouched — no CJK codepoints present', () => {
  const groundTruth = '\u0414\u043e\u0431\u0440\u043e\u0435 \u0443\u0442\u0440\u043e'; // Доброе утро
  assert.strictEqual(stripInterCJKWhitespace(groundTruth), groundTruth);
});

test('Arabic (ara fixture) with meaningful space is untouched — no CJK codepoints present', () => {
  const groundTruth = '\u0635\u0628\u0627\u062d \u0627\u0644\u062e\u064a\u0631'; // صباح الخير
  assert.strictEqual(stripInterCJKWhitespace(groundTruth), groundTruth);
});

test('Devanagari (hin fixture) with meaningful spaces is untouched — no CJK codepoints present', () => {
  const groundTruth = '\u0928\u092e\u0938\u094d\u0924\u0947 \u0906\u092a \u0915\u0948\u0938\u0947 \u0939\u0948\u0902';
  assert.strictEqual(stripInterCJKWhitespace(groundTruth), groundTruth);
});

console.log('\n-- (C) Proof: rule never fires across a CJK / non-CJK boundary --');

test('space between a CJK char and a Latin char is NOT stripped (CJK-then-Latin)', () => {
  const input = '\u597d hello'; // 好 hello
  assert.strictEqual(stripInterCJKWhitespace(input), input);
});

test('space between a Latin char and a CJK char is NOT stripped (Latin-then-CJK)', () => {
  const input = 'hello \u597d';
  assert.strictEqual(stripInterCJKWhitespace(input), input);
});

test('mixed string: only the CJK-CJK gap collapses, the CJK-Latin gap is preserved', () => {
  const input = '\u65e9\u4e0a \u597d test'; // 早上 好 test
  assert.strictEqual(stripInterCJKWhitespace(input), '\u65e9\u4e0a\u597d test');
});

test('a lone space surrounded by digits/punctuation (no CJK at all) is never touched', () => {
  const input = 'Room 42 - B';
  assert.strictEqual(stripInterCJKWhitespace(input), input);
});

console.log('\n-- (D) YOR: NFC/NFD tested explicitly, both fail — correctly stays FAILED --');

// Ground truth per fixtures/ground-truth-manifest.json: "Ẹ kú àárọ̀"
// = U+1EB8, U+20, U+6B, U+FA, U+20, U+E0, U+E1, U+72, U+1ECD, U+0300
const YOR_GROUND_TRUTH = '\u1eb8 k\u00fa \u00e0\u00e1r\u1ecd\u0300';

// Two disclosed transcripts exist for the real recognized output (see
// AUDIT — this file does not silently pick one over the other, it
// proves the decision is the same either way):
//   - HANDOFF.md's own recorded real-run table: ends in U+00F2 (ò),
//     i.e. the underdot is missing entirely, only the grave survived.
//   - this task's prompt text: ends in U+1ECD (ọ) with no combining
//     grave, i.e. the grave is missing, the underdot survived.
const YOR_RECOGNIZED_HANDOFF_RECORD = '\u1eb8 k\u00fa \u00e0\u00e1r\u00f2';
const YOR_RECOGNIZED_PROMPT_TEXT = '\u1eb8 k\u00fa \u00e0\u00e1r\u1ecd';

for (const [label, recognized] of [
  ['HANDOFF.md-recorded transcript (àárò, U+00F2)', YOR_RECOGNIZED_HANDOFF_RECORD],
  ['prompt-stated transcript (àárọ, U+1ECD)', YOR_RECOGNIZED_PROMPT_TEXT]
]) {
  test(`yor [${label}]: raw exact match fails (expected, disclosed)`, () => {
    assert.notStrictEqual(recognized, YOR_GROUND_TRUTH);
  });

  test(`yor [${label}]: NFC normalization does NOT equalize recognized and ground truth`, () => {
    assert.notStrictEqual(recognized.normalize('NFC'), YOR_GROUND_TRUTH.normalize('NFC'));
  });

  test(`yor [${label}]: NFD normalization does NOT equalize recognized and ground truth`, () => {
    assert.notStrictEqual(recognized.normalize('NFD'), YOR_GROUND_TRUTH.normalize('NFD'));
  });

  test(`yor [${label}]: compareOcrText() honestly reports matches:false, rule:null (no fabricated pass)`, () => {
    const result = compareOcrText(recognized, YOR_GROUND_TRUTH);
    assert.strictEqual(result.matches, false);
    assert.strictEqual(result.rule, null);
  });
}

test('yor: this file never constructs or substitutes the missing underdot/tone-mark codepoint into a passing comparison', () => {
  // Explicit negative proof: even the CJK whitespace rule is a no-op on
  // yor input (no CJK codepoints present), so no unintended rule can
  // accidentally paper over the missing diacritic.
  assert.strictEqual(stripInterCJKWhitespace(YOR_RECOGNIZED_HANDOFF_RECORD), YOR_RECOGNIZED_HANDOFF_RECORD);
  assert.strictEqual(stripInterCJKWhitespace(YOR_RECOGNIZED_PROMPT_TEXT), YOR_RECOGNIZED_PROMPT_TEXT);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
