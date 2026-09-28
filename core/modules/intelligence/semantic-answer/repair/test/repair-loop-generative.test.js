'use strict';

/**
 * core/modules/intelligence/semantic-answer/repair/test/repair-loop-generative.test.js
 * SA-6 EXTENSION — realizeValidatedGenerative() tests. Real, unstubbed
 * SA-4/SA-5 stack; only the "model" is a mock (real @wllama/wllama is
 * browser-only WASM — see the real-model proof in
 * core/tests/browser/offline-generative-realization-browser.test.js).
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/repair/test/repair-loop-generative.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACTS_DIR = path.join(__dirname, '..', '..', 'contracts');
const TEMPLATES_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-templates.js');
const REALIZE_SEAM_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-realize.js');
const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-registry.js');
const REALIZER_PATH = path.join(__dirname, '..', '..', 'realization', 'language-realizer.js');
const VALIDATOR_PATH = path.join(__dirname, '..', '..', 'validation', 'response-validator.js');
const REPAIR_LOOP_PATH = path.join(__dirname, '..', 'repair-loop.js');

const CONTRACT_FILES = [
    'semantic-answer-plan-contract.js',
    'verified-evidence-contract.js',
    'language-realization-request-contract.js',
    'candidate-sentence-contract.js',
    'response-validation-result-contract.js',
].map((f) => path.join(CONTRACTS_DIR, f));

const { VALID_HUMAN_BENEFIT_SW } = require('../../fixtures/semantic-answer-plan-fixtures');

function freshRealStack() {
    [...CONTRACT_FILES, TEMPLATES_PATH, REALIZE_SEAM_PATH, REGISTRY_PATH, REALIZER_PATH, VALIDATOR_PATH, REPAIR_LOOP_PATH]
        .forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    CONTRACT_FILES.forEach((p) => require(p));
    require(TEMPLATES_PATH);
    require(REALIZE_SEAM_PATH);
    require(REGISTRY_PATH);
    require(REALIZER_PATH);
    require(VALIDATOR_PATH);
    require(REPAIR_LOOP_PATH);
    return global.window.CozyOS;
}

function fullEvidence() {
    return [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'ChurchOS organizes church work.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw', entityId: 'churchos' },
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-2', claim: 'ChurchOS supports multilingual participation.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw', entityId: 'churchos' },
    ];
}

function makeRequest(plan, evidence) {
    return { schemaVersion: 'cozy.language-realization-request.v1', language: { languageId: plan.language }, semanticPlan: plan, evidence, constraints: { preserveMeaning: true, useOnlyEvidence: true, naturalLanguage: true, answerDirectly: true } };
}

test('A: realizeValidated() (existing, sync) is completely untouched by loading repair-loop.js\'s new export', () => {
    const cozy = freshRealStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const request = makeRequest(plan, fullEvidence());
    const outcome = cozy.RepairLoop.realizeValidated({ request });
    assert.equal(outcome.success, true, JSON.stringify(outcome));
    assert.equal(outcome.candidate.generation.mode, 'COMPOSED');
    assert.equal(outcome.candidate.generation.realizationMode, undefined);
});

test('B: realizeValidatedGenerative() with no `generative` config behaves identically to realizeValidated()', async () => {
    const cozy = freshRealStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const request = makeRequest(plan, fullEvidence());
    const sync = cozy.RepairLoop.realizeValidated({ request });
    const async_ = await cozy.RepairLoop.realizeValidatedGenerative({ request });
    assert.equal(async_.candidate.text, sync.candidate.text);
    assert.equal(async_.candidate.generation.mode, 'COMPOSED');
});

test('C: a genuinely successful real-model call end-to-end PASSes validation with GENERATIVE_OFFLINE, on the first attempt', async () => {
    const cozy = freshRealStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const request = makeRequest(plan, fullEvidence());
    const provider = { generate: async () => ({ available: true, success: true, text: 'ChurchOS brings congregations together across languages while keeping records organized for pastors.' }) };
    const outcome = await cozy.RepairLoop.realizeValidatedGenerative({ request, generative: { enabled: true, provider } });
    assert.equal(outcome.success, true, JSON.stringify(outcome));
    assert.equal(outcome.attempts, 1);
    assert.equal(outcome.validation.status, 'PASS');
    assert.equal(outcome.candidate.generation.mode, 'MODEL_GENERATED');
    assert.equal(outcome.candidate.generation.realizationMode, 'GENERATIVE_OFFLINE');
});

test('D: a provider that is genuinely unavailable end-to-end still PASSes (falls back to COMPOSED text) — never worse than the default pipeline', async () => {
    const cozy = freshRealStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const request = makeRequest(plan, fullEvidence());
    const provider = { generate: async () => ({ available: false, success: false, reason: 'MODEL_LOAD_FAILED' }) };
    const outcome = await cozy.RepairLoop.realizeValidatedGenerative({ request, generative: { enabled: true, provider } });
    assert.equal(outcome.success, true, JSON.stringify(outcome));
    assert.equal(outcome.candidate.generation.realizationMode, 'UNAVAILABLE');
    assert.equal(outcome.candidate.generation.mode, 'COMPOSED');
});
