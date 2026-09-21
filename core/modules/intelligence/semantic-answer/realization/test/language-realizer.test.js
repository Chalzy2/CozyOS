'use strict';

/**
 * core/modules/intelligence/semantic-answer/realization/test/language-realizer.test.js
 * SA-4 — Language Realizer tests. Reuses the SAME SA-1 fixtures every
 * other phase's own tests validate against (semantic-answer-plan-
 * fixtures.js / verified-evidence-fixtures.js / language-realization-
 * request-fixtures.js), plus custom fixtures for the multi-claim
 * composition case those shared fixtures don't cover.
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/realization/test/language-realizer.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACTS_DIR = path.join(__dirname, '..', '..', 'contracts');
const TEMPLATES_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-templates.js');
const REALIZE_SEAM_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-realize.js');
const REALIZER_PATH = path.join(__dirname, '..', 'language-realizer.js');

const CONTRACT_FILES = [
    'semantic-answer-plan-contract.js',
    'verified-evidence-contract.js',
    'language-realization-request-contract.js',
    'candidate-sentence-contract.js',
].map((f) => path.join(CONTRACTS_DIR, f));

const { VALID_SW_REQUEST } = require('../../fixtures/language-realization-request-fixtures');
const { VALID_HUMAN_BENEFIT_SW, VALID_CLARIFICATION_NO_CLAIMS } = require('../../fixtures/semantic-answer-plan-fixtures');

function freshRealizer() {
    [...CONTRACT_FILES, TEMPLATES_PATH, REALIZE_SEAM_PATH, REALIZER_PATH].forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    CONTRACT_FILES.forEach((p) => require(p));
    require(TEMPLATES_PATH);
    require(REALIZE_SEAM_PATH);
    require(REALIZER_PATH);
    return global.window.CozyOS.LanguageRealizer;
}

/* ------------------------------------------------------------------ */
/* A: single-claim composition — the real evidence sentence verbatim   */
/* ------------------------------------------------------------------ */

test('A: a single-claim plan realizes to the real evidence claim text verbatim, no fabricated intro', () => {
    const realizer = freshRealizer();
    // VALID_SW_REQUEST pairs a 2-claim plan with only 1 matching evidence
    // record (a real, honest partial-evidence scenario) — claim-2 is
    // skipped, claim-1's real evidence is used as-is.
    const result = realizer.realizeCandidateSentence(VALID_SW_REQUEST);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.candidate.text, 'ChurchOS organizes church work.');
    assert.equal(result.candidate.language, 'sw');
    assert.equal(result.candidate.generation.mode, 'COMPOSED');
    assert.deepEqual(result.candidate.evidenceIds, ['ev-churchos-benefit-1']);
});

/* ------------------------------------------------------------------ */
/* B: multi-claim composition — real intro + real joined claim texts   */
/* ------------------------------------------------------------------ */

test('B: a multi-claim plan with all evidence present composes a real intro + both real claim sentences, never a fabricated merge', () => {
    const realizer = freshRealizer();
    const evidence = [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'ChurchOS organizes church work.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw' },
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-2', claim: 'ChurchOS supports multilingual participation.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw' },
    ];
    const request = { ...VALID_SW_REQUEST, evidence };
    const result = realizer.realizeCandidateSentence(request);
    assert.equal(result.success, true, JSON.stringify(result));
    // Real, disclosed Kiswahili intro for HUMAN_BENEFIT.
    assert.match(result.candidate.text, /^Hivi ndivyo hii inavyosaidia:/);
    // Both real claim sentences present, verbatim.
    assert.match(result.candidate.text, /ChurchOS organizes church work/);
    assert.match(result.candidate.text, /ChurchOS supports multilingual participation/);
    assert.deepEqual(result.candidate.evidenceIds.sort(), ['ev-churchos-benefit-1', 'ev-churchos-benefit-2']);
});

test('the same multi-claim plan in English gets the real English intro, not a translated Kiswahili one', () => {
    const realizer = freshRealizer();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, language: 'en' };
    const evidence = [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'ChurchOS organizes church work.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'en' },
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-2', claim: 'ChurchOS supports multilingual participation.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'en' },
    ];
    const request = { ...VALID_SW_REQUEST, language: { languageId: 'en' }, semanticPlan: plan, evidence };
    const result = realizer.realizeCandidateSentence(request);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.match(result.candidate.text, /^Here's how this helps:/);
});

/* ------------------------------------------------------------------ */
/* C: honest degrade — no evidence in the requested language           */
/* ------------------------------------------------------------------ */

test('C: when a claim\'s only supplied evidence is in the WRONG language, it is honestly dropped, never realized as if it were correct', () => {
    const realizer = freshRealizer();
    const wrongLanguageEvidence = [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'ChurchOS organizes church work.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'en' },
    ];
    const request = { ...VALID_SW_REQUEST, evidence: wrongLanguageEvidence }; // plan requests sw, evidence is en
    const result = realizer.realizeCandidateSentence(request);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'NO_REALIZABLE_EVIDENCE_IN_LANGUAGE');
    assert.match(result.honestFallbackText, /ushahidi halisi/); // real Kiswahili honest-fallback text, never a fabricated construction
});

/* ------------------------------------------------------------------ */
/* D: zero-claim plans (CLARIFICATION/UNKNOWN) — honest, real disclosure */
/* ------------------------------------------------------------------ */

test('D: a zero-claim CLARIFICATION plan realizes to a real, existing honest disclosure, never fabricated content', () => {
    const realizer = freshRealizer();
    const request = { ...VALID_SW_REQUEST, semanticPlan: VALID_CLARIFICATION_NO_CLAIMS, evidence: [] };
    const result = realizer.realizeCandidateSentence(request);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(typeof result.candidate.text, 'string');
    assert.ok(result.candidate.text.length > 0);
});

/* ------------------------------------------------------------------ */
/* E: an invalid request is honestly refused, never processed           */
/* ------------------------------------------------------------------ */

test('E: a structurally invalid realization request (weakened constraint) is refused before any realization is attempted', () => {
    const realizer = freshRealizer();
    const invalidRequest = { ...VALID_SW_REQUEST, constraints: { ...VALID_SW_REQUEST.constraints, useOnlyEvidence: false } };
    const result = realizer.realizeCandidateSentence(invalidRequest);
    assert.equal(result.success, false);
    assert.equal(result.reason, 'INVALID_REALIZATION_REQUEST');
});

/* ------------------------------------------------------------------ */
/* F: the real candidate is a valid cozy.candidate-sentence.v1 record   */
/* ------------------------------------------------------------------ */

test('F: the produced candidate passes CandidateSentenceContract.validate() for real', () => {
    const realizer = freshRealizer();
    const result = realizer.realizeCandidateSentence(VALID_SW_REQUEST);
    const check = global.window.CozyOS.CandidateSentenceContract.validate(result.candidate);
    assert.deepEqual(check.errors, []);
    assert.equal(check.valid, true);
});
