'use strict';

/**
 * core/modules/intelligence/semantic-answer/realization/test/language-realizer-paa4-detail-level.test.js
 *
 * PAA-4 (Depth-Adaptive Cognitive Composition) — focused tests for
 * composeClaims()'s new, optional detailLevel-aware join behavior.
 * Reuses the exact same fixture/request pattern as this directory's
 * own language-realizer.test.js (test B) — this file only adds
 * `detailLevel` to the plan, everything else is the same real
 * SA-1..SA-4 chain.
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/realization/test/language-realizer-paa4-detail-level.test.js
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
const { VALID_HUMAN_BENEFIT_SW } = require('../../fixtures/semantic-answer-plan-fixtures');

function freshRealizer() {
    [...CONTRACT_FILES, TEMPLATES_PATH, REALIZE_SEAM_PATH, REALIZER_PATH].forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    CONTRACT_FILES.forEach((p) => require(p));
    require(TEMPLATES_PATH);
    require(REALIZE_SEAM_PATH);
    require(REALIZER_PATH);
    return global.window.CozyOS.LanguageRealizer;
}

function benefitAreaEvidence(id, claim, lang) {
    return { schemaVersion: 'cozy.verified-evidence.v1', id, claim, source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: lang };
}

test('detailLevel "DEEP_EXPLANATION": multiple claims are joined as a real bullet list (intro + one line per already-verified claim), never a run-on paragraph', () => {
    const realizer = freshRealizer();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, detailLevel: 'DEEP_EXPLANATION' };
    const evidence = [
        benefitAreaEvidence('ev-churchos-benefit-1', 'Wanachama — Husaidia kupanga na kupata taarifa muhimu za wanachama. Faida: Viongozi hutumia muda mfupi kutafuta taarifa.', 'sw'),
        benefitAreaEvidence('ev-churchos-benefit-2', 'Maarifa ya kanisa — Husaidia kuhifadhi maarifa muhimu. Faida: Maarifa hayategemei kumbukumbu ya mtu mmoja pekee.', 'sw'),
    ];
    const request = { ...VALID_SW_REQUEST, semanticPlan: plan, evidence };
    const result = realizer.realizeCandidateSentence(request);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.match(result.candidate.text, /^Hivi ndivyo ChurchOS inavyosaidia:\n• Wanachama/);
    assert.match(result.candidate.text, /\n• Maarifa ya kanisa/);
    assert.equal(result.candidate.generation.mode, 'COMPOSED', 'must remain COMPOSED — a different JOIN format is not generation');
    assert.deepEqual(result.candidate.evidenceIds.sort(), ['ev-churchos-benefit-1', 'ev-churchos-benefit-2']);
});

test('detailLevel undefined (the default): the exact same two claims are still period-joined into one paragraph, byte-identical to before this addition', () => {
    const realizer = freshRealizer();
    const evidence = [
        benefitAreaEvidence('ev-churchos-benefit-1', 'Wanachama — Husaidia kupanga na kupata taarifa muhimu za wanachama.', 'sw'),
        benefitAreaEvidence('ev-churchos-benefit-2', 'Maarifa ya kanisa — Husaidia kuhifadhi maarifa muhimu.', 'sw'),
    ];
    const request = { ...VALID_SW_REQUEST, evidence };
    const result = realizer.realizeCandidateSentence(request);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.doesNotMatch(result.candidate.text, /\n•/, 'no detailLevel must never produce bullets');
    assert.match(result.candidate.text, /^Hivi ndivyo ChurchOS inavyosaidia: Wanachama/);
});

test('detailLevel "DIRECT" (a single matching claim): unaffected by the bullet logic — a single claim is always returned verbatim regardless of detailLevel', () => {
    const realizer = freshRealizer();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, detailLevel: 'DIRECT' };
    // Same real, honest partial-evidence shape as this directory's own
    // test A: only claim-1's evidence is supplied, claim-2 is honestly
    // skipped — leaving exactly one real piece to compose.
    const request = { ...VALID_SW_REQUEST, semanticPlan: plan };
    const result = realizer.realizeCandidateSentence(request);
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(result.candidate.text, 'ChurchOS organizes church work.');
});
