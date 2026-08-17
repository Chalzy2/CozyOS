/**
 * =============================================================================
 * CozyOS Language Detection Engine — Reference Lexical/Script Provider
 * File: core/engines/media/language/provider-lexical.js
 * =============================================================================
 *
 * NOT A REAL ACOUSTIC LANGUAGE-ID MODEL (Rule 6 — Honest Engineering).
 *
 * This runtime has no acoustic language-identification model (no trained
 * classifier, no audio-feature pipeline). Per the Engine 2 Compose report's
 * Implementation Contract item 4 ("Must return an honest isReal/confidence
 * envelope — no fabricated detection result"), this reference provider does
 * NOT guess a language from raw/opaque audio bytes it cannot analyze — that
 * would be fabrication, not detection.
 *
 * What it does instead, honestly:
 *
 *   1. If the caller happens to also have text already associated with the
 *      segment (e.g. a prior partial transcript, a caption, or any other
 *      already-known text — never produced by this engine itself, since
 *      this engine does not do STT, per cozy-translate.js's boundary and
 *      this engine's own Compose §5/§9), this provider runs REAL, executed
 *      checks against that text:
 *        a. Unicode script classification (e.g. Ethiopic block -> Amharic)
 *           — deterministic, computed against actual code points.
 *        b. A small, curated reference lexicon of common short function
 *           words per language, scored by real (non-fabricated) overlap
 *           against the supplied text.
 *   2. If no text is available — the ordinary case, since `sourceAudioRef`
 *      is opaque raw audio per cozy-live.js's own contract — this provider
 *      returns an honest empty envelope (`isReal:false`, `languageCode:null`)
 *      rather than inventing a guess. Matches Engine 1's
 *      `provider-inmemory.js` precedent exactly: real computation where
 *      real computation is possible, honest "unknown" where it is not.
 *
 * COVERAGE IS DELIBERATELY PARTIAL AND DISCLOSED
 * ------------------------------------------------------------------------
 * A confident, curated reference lexicon exists this pass only for the
 * languages listed in REFERENCE_LEXICON below (a subset of
 * speech-translation-adapter.js's own SEED_LANGUAGES list). For any other
 * candidate language code, this provider does not fabricate a lexicon —
 * `getCapabilities().lexiconLanguages` honestly lists only what is real.
 *
 * A production deployment swaps this provider for a real acoustic
 * language-ID model without changing LanguageDetectionEngine's own
 * interface — the same provider-swap pattern used by every other Media
 * Engine sub-engine (see media-decode-engine.js's own header).
 * =============================================================================
 */

'use strict';

// Real, deterministic Unicode block check — not a guess.
const ETHIOPIC_BLOCK = { start: 0x1200, end: 0x137f };

/** Real, computed script classification against actual code points. */
function classifyScript(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return { script: 'unknown', ethiopicRatio: 0 };
  }
  let ethiopicCount = 0;
  let letterCount = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    // Only count characters that are plausibly "letters" for the ratio
    // denominator (rough, real check: skip whitespace/punctuation/digits).
    if (/[\s.,!?;:"'0-9()\-]/.test(ch)) continue;
    letterCount++;
    if (code >= ETHIOPIC_BLOCK.start && code <= ETHIOPIC_BLOCK.end) ethiopicCount++;
  }
  const ethiopicRatio = letterCount > 0 ? ethiopicCount / letterCount : 0;
  return {
    script: ethiopicRatio > 0.5 ? 'ethiopic' : letterCount > 0 ? 'latin-or-other' : 'unknown',
    ethiopicRatio
  };
}

/**
 * Small, curated reference set of common short function/stop words per
 * language. Deliberately partial (§ file header) — only languages this
 * provider can honestly claim real coverage for are listed. Sourced from
 * general, well-established linguistic knowledge (closed-class function
 * words), not copied from any single copyrighted text.
 */
const REFERENCE_LEXICON = Object.freeze({
  en: ['the', 'and', 'is', 'of', 'to', 'in', 'that', 'for', 'with', 'was'],
  fr: ['le', 'la', 'et', 'de', 'les', 'des', 'est', 'pour', 'dans', 'que'],
  sw: ['na', 'ya', 'wa', 'kwa', 'ni', 'katika', 'hii', 'hiyo', 'kuwa', 'wao'],
  so: ['iyo', 'waa', 'ee', 'oo', 'ku', 'ka', 'in', 'ay', 'la', 'uu'],
  ha: ['da', 'na', 'wannan', 'ba', 'ne', 'ce', 'ya', 'shi', 'ta', 'wani'],
  yo: ['ati', 'ni', 'si', 'wa', 'ti', 'fun', 'ki', 'yi', 'won', 'mo'],
  zu: ['futhi', 'ne', 'uma', 'kodwa', 'ngoba', 'kanye', 'lokhu', 'nge', 'yena', 'lo'],
  lg: ['era', 'nga', 'ne', 'mu', 'ku', 'oba', 'ekyo', 'kya', 'ye', 'ate']
});

/** Real, executed tokenization — lowercase, strip punctuation, split on whitespace. */
function tokenize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[.,!?;:"'()\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Real, computed lexical overlap scoring — never fabricated. Confidence is
 * deliberately capped (never claims certainty a stop-word heuristic cannot
 * earn) and is 0 for any candidate with no supplied text or no reference
 * lexicon.
 * @param {string} text
 * @param {string[]} [candidateLanguages] - restrict scoring to these codes;
 *   defaults to every language this provider has a real lexicon for.
 * @returns {{languageCode: string|null, confidence: number, isReal: boolean, scored: Object<string,number>}}
 */
const CONFIDENCE_CAP = 0.65;

function detectFromText(text, candidateLanguages) {
  const scriptInfo = classifyScript(text);
  if (scriptInfo.script === 'ethiopic') {
    // Deterministic script match — no lexicon needed, no fabrication.
    return {
      languageCode: 'am',
      confidence: Math.min(CONFIDENCE_CAP + 0.2, 0.9),
      isReal: true,
      method: 'unicode-script-classification',
      scored: {}
    };
  }

  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return { languageCode: null, confidence: 0, isReal: false, method: 'lexical-heuristic', scored: {} };
  }

  const pool = Array.isArray(candidateLanguages) && candidateLanguages.length
    ? candidateLanguages.filter((code) => REFERENCE_LEXICON[code])
    : Object.keys(REFERENCE_LEXICON);

  const scored = {};
  for (const code of pool) {
    const lexicon = REFERENCE_LEXICON[code];
    const hits = tokens.filter((t) => lexicon.includes(t)).length;
    scored[code] = tokens.length > 0 ? hits / tokens.length : 0;
  }

  let best = null;
  let bestScore = 0;
  for (const [code, score] of Object.entries(scored)) {
    if (score > bestScore) {
      best = code;
      bestScore = score;
    }
  }

  if (!best || bestScore === 0) {
    return { languageCode: null, confidence: 0, isReal: false, method: 'lexical-heuristic', scored };
  }

  return {
    languageCode: best,
    confidence: Math.min(bestScore, CONFIDENCE_CAP),
    isReal: true,
    method: 'lexical-heuristic',
    scored
  };
}

function lexiconLanguages() {
  return Object.freeze(Object.keys(REFERENCE_LEXICON));
}

function createLexicalDetectProvider(type = 'reference-lexical') {
  return Object.freeze({
    type,
    detectFromText,
    classifyScript,
    lexiconLanguages
  });
}

export { createLexicalDetectProvider, detectFromText, classifyScript, lexiconLanguages, REFERENCE_LEXICON };
