'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PLAN_CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'semantic-answer-plan-contract.js');
const EVIDENCE_CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'verified-evidence-contract.js');
const REQUEST_CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'language-realization-request-contract.js');
const { SCHEMA_VERSION, FIXED_CONSTRAINTS, VALID_FIXTURES, INVALID_FIXTURES, VALID_SW_REQUEST } = require('../fixtures/language-realization-request-fixtures');

/** Loads all three real contract modules onto ONE shared window, matching how they'll really be <script>-loaded together. */
function loadAll() {
    for (const p of [PLAN_CONTRACT_PATH, EVIDENCE_CONTRACT_PATH, REQUEST_CONTRACT_PATH]) delete require.cache[require.resolve(p)];
    global.window = { CozyOS: {} };
    require(PLAN_CONTRACT_PATH);
    require(EVIDENCE_CONTRACT_PATH);
    require(REQUEST_CONTRACT_PATH);
    return global.window.CozyOS.LanguageRealizationRequestContract;
}

/** Loads ONLY the request contract, proving its soft-dependency degrade path when siblings aren't loaded. */
function loadRequestOnly() {
    delete require.cache[require.resolve(REQUEST_CONTRACT_PATH)];
    global.window = { CozyOS: {} };
    require(REQUEST_CONTRACT_PATH);
    return global.window.CozyOS.LanguageRealizationRequestContract;
}

test('registers window.CozyOS.LanguageRealizationRequestContract with the real, versioned schema id', () => {
    const contract = loadAll();
    assert.equal(contract.SCHEMA_VERSION, SCHEMA_VERSION);
});

test('REQUIRED_TRUE_CONSTRAINTS is the real, exact four-item non-negotiable set from spec §1/§3.C', () => {
    const contract = loadAll();
    assert.deepEqual([...contract.REQUIRED_TRUE_CONSTRAINTS].sort(), ['answerDirectly', 'naturalLanguage', 'preserveMeaning', 'useOnlyEvidence'].sort());
});

for (const fixture of VALID_FIXTURES) {
    test('validate() accepts a real, valid request composing a real valid plan + real valid evidence', () => {
        const contract = loadAll();
        const result = contract.validate(fixture);
        assert.deepEqual(result.errors, []);
        assert.equal(result.valid, true);
    });
}

for (const { name, payload } of INVALID_FIXTURES) {
    test(`validate() rejects: ${name}`, () => {
        const contract = loadAll();
        const result = contract.validate(payload);
        assert.equal(result.valid, false);
        assert.ok(result.errors.length > 0);
    });
}

test('NON-NEGOTIABLE: each of the four required-true constraints, set to false individually, is independently rejected', () => {
    const contract = loadAll();
    for (const key of contract.REQUIRED_TRUE_CONSTRAINTS) {
        const weakened = { ...VALID_SW_REQUEST, constraints: { ...FIXED_CONSTRAINTS, [key]: false } };
        const result = contract.validate(weakened);
        assert.equal(result.valid, false, `expected constraints.${key}=false to be rejected`);
        assert.ok(result.errors.some((e) => e.includes(key)), `expected an error mentioning ${key}, got: ${JSON.stringify(result.errors)}`);
    }
});

test('create() ALWAYS produces the fixed, correct constraints object — a caller cannot pass a different one in', () => {
    const contract = loadAll();
    const planContract = global.window.CozyOS.SemanticAnswerPlanContract;
    const evidenceContract = global.window.CozyOS.VerifiedEvidenceContract;
    const { plan } = planContract.create({
        goal: 'HUMAN_BENEFIT', answerMode: 'DIRECT_ANSWER', entity: { type: 'application', value: 'ChurchOS' },
        claims: [{ claimId: 'c1', text: 't', evidenceIds: ['e1'] }], language: 'sw',
    });
    const { evidence } = evidenceContract.create({
        id: 'e1', claim: 't', source: { type: 'CozyKnowledge', id: 'x' },
        verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC',
    });
    const result = contract.create({ language: { languageId: 'sw' }, semanticPlan: plan, evidence: [evidence] });
    assert.equal(result.success, true);
    assert.deepEqual(result.request.constraints, { preserveMeaning: true, useOnlyEvidence: true, naturalLanguage: true, answerDirectly: true });
    assert.ok(Object.isFrozen(result.request.constraints));
});

test('when a sibling contract module is not loaded, validate() still checks shape (semanticPlan/evidence must at least be real objects/array) without throwing', () => {
    const contract = loadRequestOnly();
    const result = contract.validate({
        schemaVersion: SCHEMA_VERSION,
        language: { languageId: 'sw' },
        semanticPlan: { some: 'object' },
        evidence: [],
        constraints: FIXED_CONSTRAINTS,
    });
    // No SemanticAnswerPlanContract/VerifiedEvidenceContract loaded, so
    // deep plan/evidence validation is skipped honestly (soft
    // dependency) — this must never throw, and top-level shape
    // (semanticPlan is a real object, evidence is a real array,
    // constraints all literal true) still passes.
    assert.equal(result.valid, true);
});
