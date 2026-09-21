'use strict';

/**
 * core/modules/intelligence/semantic-answer/validation/test/response-validator.test.js
 * SA-5 — Response Validator tests.
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/validation/test/response-validator.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACTS_DIR = path.join(__dirname, '..', '..', 'contracts');
const TEMPLATES_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-templates.js');
const REALIZE_SEAM_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-realize.js');
const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-registry.js');
const REALIZER_PATH = path.join(__dirname, '..', '..', 'realization', 'language-realizer.js');
const VALIDATOR_PATH = path.join(__dirname, '..', 'response-validator.js');

const CONTRACT_FILES = [
    'semantic-answer-plan-contract.js',
    'verified-evidence-contract.js',
    'language-realization-request-contract.js',
    'candidate-sentence-contract.js',
    'response-validation-result-contract.js',
].map((f) => path.join(CONTRACTS_DIR, f));

const { VALID_HUMAN_BENEFIT_SW } = require('../../fixtures/semantic-answer-plan-fixtures');

function freshStack() {
    [...CONTRACT_FILES, TEMPLATES_PATH, REALIZE_SEAM_PATH, REGISTRY_PATH, REALIZER_PATH, VALIDATOR_PATH]
        .forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    global.window = { CozyOS: {} };
    CONTRACT_FILES.forEach((p) => require(p));
    require(TEMPLATES_PATH);
    require(REALIZE_SEAM_PATH);
    require(REGISTRY_PATH);
    require(REALIZER_PATH);
    require(VALIDATOR_PATH);
    return global.window.CozyOS;
}

function fullEvidence() {
    return [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'ChurchOS organizes church work.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw', entityId: 'churchos' },
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-2', claim: 'ChurchOS supports multilingual participation.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw', entityId: 'churchos' },
    ];
}

/* ------------------------------------------------------------------ */
/* A: a genuinely complete, correct candidate passes                    */
/* ------------------------------------------------------------------ */

test('A: a real, complete candidate realized from SA-4 passes validation with no violations', () => {
    const cozy = freshStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const evidence = fullEvidence();
    const request = { schemaVersion: 'cozy.language-realization-request.v1', language: { languageId: 'sw' }, semanticPlan: plan, evidence, constraints: { preserveMeaning: true, useOnlyEvidence: true, naturalLanguage: true, answerDirectly: true } };
    const realized = cozy.LanguageRealizer.realizeCandidateSentence(request);
    assert.equal(realized.success, true);

    const validation = cozy.ResponseValidator.validateCandidate({ candidate: realized.candidate, plan, evidence });
    assert.equal(validation.success, true, JSON.stringify(validation));
    assert.equal(validation.result.status, 'PASS');
    assert.deepEqual(validation.result.violations, []);
});

/* ------------------------------------------------------------------ */
/* B: completeness — a claim with real evidence dropped -> REPAIR_REQUIRED */
/* ------------------------------------------------------------------ */

test('B: a candidate missing a claim that HAD real, correct-language evidence available is REPAIR_REQUIRED, never silently passed', () => {
    const cozy = freshStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const evidence = fullEvidence();
    // Simulate a candidate that only used claim-1's evidence even though claim-2's real evidence was supplied.
    const candidate = { schemaVersion: 'cozy.candidate-sentence.v1', text: 'ChurchOS organizes church work.', language: 'sw', sourcePlanId: 'plan:test:1', evidenceIds: ['ev-churchos-benefit-1'], generation: { mode: 'COMPOSED', attempt: 1 } };

    const validation = cozy.ResponseValidator.validateCandidate({ candidate, plan, evidence });
    assert.equal(validation.result.status, 'REPAIR_REQUIRED');
    assert.ok(validation.result.repair.instructions.length > 0);
    assert.ok(validation.result.violations.some((v) => v.code === 'COMPLETENESS_CLAIM_DROPPED'));
});

/* ------------------------------------------------------------------ */
/* C: meaning — an invented citation is BLOCKING -> REJECT               */
/* ------------------------------------------------------------------ */

test('C: a candidate citing an evidenceId no claim references is REJECTed, never trusted', () => {
    const cozy = freshStack();
    const plan = VALID_HUMAN_BENEFIT_SW;
    const evidence = fullEvidence();
    const candidate = { schemaVersion: 'cozy.candidate-sentence.v1', text: 'A fabricated sentence.', language: 'sw', sourcePlanId: 'plan:test:1', evidenceIds: ['ev-made-up-id'], generation: { mode: 'COMPOSED', attempt: 1 } };
    const validation = cozy.ResponseValidator.validateCandidate({ candidate, plan, evidence });
    assert.equal(validation.result.status, 'REJECT');
    assert.ok(validation.result.violations.some((v) => v.code === 'MEANING_INVENTED_CITATION' && v.severity === 'BLOCKING'));
});

/* ------------------------------------------------------------------ */
/* D: language — output language does not match the plan -> REJECT      */
/* ------------------------------------------------------------------ */

test('D: a candidate realized in the wrong language (English for a Kiswahili plan) is REJECTed', () => {
    const cozy = freshStack();
    const plan = VALID_HUMAN_BENEFIT_SW; // language: 'sw'
    const evidence = fullEvidence();
    const candidate = { schemaVersion: 'cozy.candidate-sentence.v1', text: 'ChurchOS organizes church work.', language: 'en', sourcePlanId: 'plan:test:1', evidenceIds: ['ev-churchos-benefit-1'], generation: { mode: 'COMPOSED', attempt: 1 } };
    const validation = cozy.ResponseValidator.validateCandidate({ candidate, plan, evidence });
    assert.equal(validation.result.status, 'REJECT');
    assert.ok(validation.result.violations.some((v) => v.code === 'LANGUAGE_MISMATCH'));
});

/* ------------------------------------------------------------------ */
/* E: entity — evidence about a different entity is REJECTed             */
/* ------------------------------------------------------------------ */

test('E: a candidate citing evidence whose entityId contradicts the plan\'s entity is REJECTed', () => {
    const cozy = freshStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const wrongEntityEvidence = [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'MpesaOS processes payments.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'sw', entityId: 'mpesaos' },
    ];
    const candidate = { schemaVersion: 'cozy.candidate-sentence.v1', text: 'MpesaOS processes payments.', language: 'sw', sourcePlanId: 'plan:test:1', evidenceIds: ['ev-churchos-benefit-1'], generation: { mode: 'COMPOSED', attempt: 1 } };
    const validation = cozy.ResponseValidator.validateCandidate({ candidate, plan, evidence: wrongEntityEvidence });
    assert.equal(validation.result.status, 'REJECT');
    assert.ok(validation.result.violations.some((v) => v.code === 'ENTITY_MISMATCH'));
});

/* ------------------------------------------------------------------ */
/* F: authorization — non-PUBLIC evidence with no actorContext is REJECTed */
/* ------------------------------------------------------------------ */

test('F: non-PUBLIC evidence used with no actorContext is REJECTed; the SAME candidate PASSES once a real actorContext is supplied', () => {
    const cozy = freshStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const orgEvidence = [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'Announcement for the congregation.', source: { type: 'CozyMemory', id: 'x' }, verification: { status: 'CURATED', confidence: 'MEDIUM' }, sensitivity: 'ORGANIZATION', language: 'sw', entityId: 'churchos' },
    ];
    const candidate = { schemaVersion: 'cozy.candidate-sentence.v1', text: 'Announcement for the congregation.', language: 'sw', sourcePlanId: 'plan:test:1', evidenceIds: ['ev-churchos-benefit-1'], generation: { mode: 'COMPOSED', attempt: 1 } };

    const denied = cozy.ResponseValidator.validateCandidate({ candidate, plan, evidence: orgEvidence });
    assert.equal(denied.result.status, 'REJECT');
    assert.ok(denied.result.violations.some((v) => v.code === 'AUTHORIZATION_CONTEXT_MISSING'));

    const allowed = cozy.ResponseValidator.validateCandidate({ candidate, plan, evidence: orgEvidence, actorContext: { actorId: 'real-user-1', organizationId: 'org-1' } });
    assert.equal(allowed.result.status, 'PASS');
});

/* ------------------------------------------------------------------ */
/* G: grammar/naturalness — honest PASS-by-construction for COMPOSED    */
/* ------------------------------------------------------------------ */

test('G: grammar/naturalness are PASS-by-construction (disclosed) for COMPOSED-mode candidates, never fabricated NLP scoring', () => {
    const cozy = freshStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const evidence = fullEvidence();
    const candidate = { schemaVersion: 'cozy.candidate-sentence.v1', text: 'ChurchOS organizes church work.', language: 'sw', sourcePlanId: 'plan:test:1', evidenceIds: ['ev-churchos-benefit-1'], generation: { mode: 'COMPOSED', attempt: 1 } };
    const validation = cozy.ResponseValidator.validateCandidate({ candidate, plan, evidence });
    assert.equal(validation.result.checks.grammar.status, 'PASS');
    assert.match(validation.result.checks.grammar.details, /no generative grammar/);
    assert.equal(validation.result.checks.naturalness.status, 'PASS');
});

/* ------------------------------------------------------------------ */
/* H: the produced result is a real, valid cozy.response-validation-result.v1 */
/* ------------------------------------------------------------------ */

test('H: the produced result passes ResponseValidationResultContract.validate() for real', () => {
    const cozy = freshStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const evidence = fullEvidence();
    const candidate = { schemaVersion: 'cozy.candidate-sentence.v1', text: 'ChurchOS organizes church work.', language: 'sw', sourcePlanId: 'plan:test:1', evidenceIds: ['ev-churchos-benefit-1'], generation: { mode: 'COMPOSED', attempt: 1 } };
    const validation = cozy.ResponseValidator.validateCandidate({ candidate, plan, evidence });
    const check = cozy.ResponseValidationResultContract.validate(validation.result);
    assert.deepEqual(check.errors, []);
    assert.equal(check.valid, true);
});
