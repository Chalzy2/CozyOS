'use strict';

/**
 * core/modules/intelligence/semantic-answer/repair/test/repair-loop.test.js
 * SA-6 — Repair Loop tests.
 *
 * Tests A-C run the REAL, unstubbed SA-4 (LanguageRealizer) + SA-5
 * (ResponseValidator) stack, proving the real happy path, the real
 * "realization itself fails" path, and a real BLOCKING/REJECT path
 * never enters the loop. Tests D-E use a small, disclosed fake
 * LanguageRealizer (same fake-authority discipline as this repo's own
 * cozy-answer-engine.test.js) specifically to exercise the LOOP's OWN
 * control flow (attempt counting, bounded max, REPAIRED tagging) —
 * SA-4/SA-5's own real logic already has its own dedicated test suites
 * and is not being re-tested here.
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/repair/test/repair-loop.test.js
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

/* ------------------------------------------------------------------ */
/* A: real happy path — PASS on the first real attempt                  */
/* ------------------------------------------------------------------ */

test('A (real stack): a genuinely complete, correct request PASSes on attempt 1, no repair needed', () => {
    const cozy = freshRealStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const request = makeRequest(plan, fullEvidence());
    const outcome = cozy.RepairLoop.realizeValidated({ request });
    assert.equal(outcome.success, true, JSON.stringify(outcome));
    assert.equal(outcome.attempts, 1);
    assert.equal(outcome.validation.status, 'PASS');
    assert.equal(outcome.candidate.generation.mode, 'COMPOSED');
});

/* ------------------------------------------------------------------ */
/* B: real realization failure never enters the repair loop             */
/* ------------------------------------------------------------------ */

test('B (real stack): SA-4 itself failing (no evidence in the requested language) is reported honestly, never disguised as a repair failure', () => {
    const cozy = freshRealStack();
    const plan = VALID_HUMAN_BENEFIT_SW; // requests sw
    const wrongLanguageEvidence = [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'ChurchOS organizes church work.', source: { type: 'CozyKnowledge', id: 'x' }, verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC', language: 'en', entityId: 'churchos' },
    ];
    const request = makeRequest(plan, wrongLanguageEvidence);
    const outcome = cozy.RepairLoop.realizeValidated({ request });
    assert.equal(outcome.success, false);
    assert.equal(outcome.reason, 'REALIZATION_FAILED');
    assert.equal(outcome.attempts, 1);
});

/* ------------------------------------------------------------------ */
/* C: real BLOCKING violation -> REJECT, never enters a repair retry    */
/* ------------------------------------------------------------------ */

test('C (real stack): a real BLOCKING violation (non-PUBLIC evidence, no actorContext) is REJECTed on attempt 1, never retried', () => {
    const cozy = freshRealStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const orgEvidence = [
        { schemaVersion: 'cozy.verified-evidence.v1', id: 'ev-churchos-benefit-1', claim: 'Announcement for the congregation.', source: { type: 'CozyMemory', id: 'x' }, verification: { status: 'CURATED', confidence: 'MEDIUM' }, sensitivity: 'ORGANIZATION', language: 'sw', entityId: 'churchos' },
    ];
    const request = makeRequest({ ...plan, claims: [{ claimId: 'claim-1', text: 'x', evidenceIds: ['ev-churchos-benefit-1'] }] }, orgEvidence);
    const outcome = cozy.RepairLoop.realizeValidated({ request }); // no actorContext supplied
    assert.equal(outcome.success, false);
    assert.equal(outcome.reason, 'REJECTED');
    assert.equal(outcome.attempts, 1);
    assert.ok(outcome.validation.violations.some((v) => v.code === 'AUTHORIZATION_CONTEXT_MISSING'));
});

/* ------------------------------------------------------------------ */
/* D: repair retry succeeds — loop control flow, fake realizer          */
/* ------------------------------------------------------------------ */

test('D (fake realizer, real validator): a REPAIR_REQUIRED result on attempt 1 triggers a real second attempt, tagged REPAIRED, which then PASSes', () => {
    const cozy = freshRealStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const evidence = fullEvidence();

    let calls = 0;
    // Disclosed fake: attempt 1 "forgets" claim-2 (simulating a flawed
    // realizer); attempt 2 includes both — proves the loop actually
    // re-invokes the realizer rather than reusing a cached candidate.
    cozy.LanguageRealizer = {
        realizeCandidateSentence(_request, opts) {
            calls++;
            const includeBoth = opts && opts.attempt >= 2;
            return {
                success: true,
                candidate: {
                    schemaVersion: 'cozy.candidate-sentence.v1',
                    text: includeBoth ? 'ChurchOS organizes church work. ChurchOS supports multilingual participation.' : 'ChurchOS organizes church work.',
                    language: 'sw',
                    sourcePlanId: 'plan:test:1',
                    evidenceIds: includeBoth ? ['ev-churchos-benefit-1', 'ev-churchos-benefit-2'] : ['ev-churchos-benefit-1'],
                    generation: { mode: 'COMPOSED', attempt: opts.attempt },
                },
            };
        },
    };

    const request = makeRequest(plan, evidence);
    const outcome = cozy.RepairLoop.realizeValidated({ request });
    assert.equal(outcome.success, true, JSON.stringify(outcome));
    assert.equal(outcome.attempts, 2);
    assert.equal(calls, 2);
    assert.equal(outcome.validation.status, 'PASS');
    assert.equal(outcome.candidate.generation.mode, 'REPAIRED');
    assert.equal(outcome.candidate.generation.attempt, 2);
});

/* ------------------------------------------------------------------ */
/* E: bounded — never loops forever                                     */
/* ------------------------------------------------------------------ */

test('E (fake realizer, real validator): a realizer that NEVER produces a complete candidate exhausts maxAttempts honestly, never a fabricated PASS', () => {
    const cozy = freshRealStack();
    const plan = { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application', value: 'ChurchOS', canonicalValue: 'churchos' } };
    const evidence = fullEvidence();

    let calls = 0;
    cozy.LanguageRealizer = {
        realizeCandidateSentence(_request, opts) {
            calls++;
            return {
                success: true,
                candidate: {
                    schemaVersion: 'cozy.candidate-sentence.v1',
                    text: 'ChurchOS organizes church work.',
                    language: 'sw', sourcePlanId: 'plan:test:1',
                    evidenceIds: ['ev-churchos-benefit-1'], // always missing claim-2's evidence
                    generation: { mode: 'COMPOSED', attempt: opts.attempt },
                },
            };
        },
    };

    const request = makeRequest(plan, evidence);
    const outcome = cozy.RepairLoop.realizeValidated({ request, maxAttempts: 3 });
    assert.equal(outcome.success, false);
    assert.equal(outcome.reason, 'MAX_REPAIR_ATTEMPTS_EXCEEDED');
    assert.equal(outcome.attempts, 3);
    assert.equal(calls, 3);
    assert.equal(outcome.lastValidation.status, 'REPAIR_REQUIRED');
});
