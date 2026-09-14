'use strict';

/**
 * core/modules/ocr/tests/ocr-text-compare.js
 *
 * NEXT DEPENDENCY (this continuation, from M395) — narrowly-scoped OCR
 * ground-truth comparator. This file is test/comparison infrastructure
 * only. It does not touch the Tesseract engine, any .traineddata model,
 * any fixture image, ground-truth-manifest.json, cozy-ocr.js, or
 * plugins/tesseract-plugin.js.
 *
 * WHAT CHANGED FROM THE PRIOR CONVENTION
 *   Previously, every OCR test (smoke + browser) compared with a bare
 *   `recognizedText === groundTruth`. That is still step 1 here — exact
 *   match is tried first and, if it passes, no normalization is ever
 *   invoked or reported. Only on a raw mismatch does this file apply
 *   ONE additional, disclosed rule before giving up.
 *
 * THE ONE RULE ADOPTED: CJK_INTER_CHAR_WHITESPACE
 *   Tesseract's chi_sim recognizer treats each Han ideograph as its own
 *   word/bounding box on short single-line strings (already disclosed
 *   in HANDOFF.md's real Chromium run: groundTruth "早上好" recognized
 *   as "早 上 好" — an ASCII space inserted between each glyph).
 *   Simplified Chinese has no inter-character word-spacing at all, so a
 *   space that appears ONLY between two CJK codepoints carries no
 *   meaning — it is a segmentation artifact of the recognizer, not lost
 *   or invented content. This rule strips whitespace ONLY when it sits
 *   directly between two CJK codepoints on both sides. See
 *   ocr-text-compare.test.js for the boundary proof: any whitespace
 *   with a non-CJK character on either side is left completely alone.
 *
 * THE RULE EXPLICITLY NOT ADOPTED: NFC/NFD FOR YOR
 *   Tested explicitly (see AUDIT report / ocr-text-compare.test.js).
 *   The yor ground truth "Ẹ kú àárọ̀" ends in U+1ECD (ọ) + U+0300
 *   (combining grave). The disclosed real recognizer output is missing
 *   a codepoint outright (either the combining grave or the underdot,
 *   depending on which disclosed transcript is used — see AUDIT). NFC
 *   and NFD both normalize *representation* of the same abstract
 *   characters; they cannot manufacture a codepoint that was never
 *   produced. Both were tested and neither closes the gap. This file
 *   therefore applies NO normalization for yor — no NFC, no NFD, and
 *   absolutely no substitution/restoration of the missing underdot or
 *   tone mark. A yor mismatch is left as a genuine mismatch.
 *
 * USAGE
 *   compareOcrText(recognizedText, groundTruth) -> {
 *     matches: boolean,
 *     rule: 'EXACT' | 'CJK_INTER_CHAR_WHITESPACE' | null,
 *     normalizedRecognized: string,
 *     normalizedGroundTruth: string
 *   }
 */

// CJK Unified Ideographs (U+4E00-U+9FFF) + Extension A (U+3400-U+4DBF).
// Deliberately narrow: excludes CJK punctuation/symbols, fullwidth forms,
// and Hiragana/Katakana/Hangul — this rule is scoped to the disclosed
// chi_sim segmentation artifact, not a general CJK-text normalizer.
var CJK_RANGE = '\\u4E00-\\u9FFF\\u3400-\\u4DBF';
var CJK_INTER_CHAR_WS_RE = new RegExp('([' + CJK_RANGE + '])[ \\t]+(?=[' + CJK_RANGE + '])', 'gu');

function stripInterCJKWhitespace(str) {
  return str.replace(CJK_INTER_CHAR_WS_RE, '$1');
}

function compareOcrText(recognizedText, groundTruth) {
  if (recognizedText === groundTruth) {
    return {
      matches: true,
      rule: 'EXACT',
      normalizedRecognized: recognizedText,
      normalizedGroundTruth: groundTruth
    };
  }

  var normRecognized = stripInterCJKWhitespace(recognizedText);
  var normGroundTruth = stripInterCJKWhitespace(groundTruth);
  if (normRecognized === normGroundTruth) {
    return {
      matches: true,
      rule: 'CJK_INTER_CHAR_WHITESPACE',
      normalizedRecognized: normRecognized,
      normalizedGroundTruth: normGroundTruth
    };
  }

  // No further rules. In particular: no NFC/NFD collapsing is applied
  // here, by design — see file header. A genuine mismatch (e.g. yor)
  // is reported honestly as a mismatch, not silently passed.
  return {
    matches: false,
    rule: null,
    normalizedRecognized: recognizedText,
    normalizedGroundTruth: groundTruth
  };
}

// UMD-style export: CommonJS for node test files, window global for the
// plain-<script>-tag browser harness (matches how cozy-ocr.js itself is
// loaded in tesseract-vendor-dependency-browser-harness.html).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { compareOcrText: compareOcrText, stripInterCJKWhitespace: stripInterCJKWhitespace };
}
if (typeof window !== 'undefined') {
  window.CozyOCRTextCompare = { compareOcrText: compareOcrText, stripInterCJKWhitespace: stripInterCJKWhitespace };
}
