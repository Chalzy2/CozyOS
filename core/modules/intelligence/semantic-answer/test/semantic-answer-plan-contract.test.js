'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'semantic-answer-plan-contract.js');
const { SCHEMA_VERSION, VALID_FIXTURES, INVALID_FIXTURES } = require('../fixtures/semantic-answer-plan-fixtures');

function load() {
    delete require.cache[require.resolve(CONTRACT_PATH)];
    global.window = { CozyOS: {} };
    require(CONTRACT_PATH);
    return global.window.CozyOS.SemanticAnswerPlanContract;
}

test('registers window.CozyOS.SemanticAnswerPlanContract with the real, versioned schema id', () => {
    const contract = load();
    assert.equal(contract.SCHEMA_VERSION, SCHEMA_VERSION);
    assert.equal(typeof contract.getVersion(), 'string');
});

test('GOAL is the real union of REQUIRED_INFORMATION_GOALS and EXISTING_SEMANTIC_GOALS, no duplicates', () => {
    const contract = load();
    const required = ['HUMAN_BENEFIT', 'BENEFITS', 'CAPABILITY', 'IMPORTANCE', 'VALUE', 'PRACTICAL_WORK_CONTRIBUTION', 'DIFFERENTIATION', 'DEFINITION', 'COMPARISON', 'LIST', 'HOW_TO', 'CLARIFICATION', 'UNKNOWN'];
    for (const g of required) assert.ok(contract.GOAL.includes(g), `expected required goal "${g}" in GOAL`);
    const existing = ['UNDERSTAND_USEFULNESS', 'UNDERSTAND_CAPABILITIES', 'MAKE_COMPARISON_DECISION', 'UNDERSTAND_USEFULNESS_BEFORE_PURCHASE', 'MAKE_PURCHASE_DECISION', 'UNDERSTAND_APPLICATION'];
    for (const g of existing) assert.ok(contract.GOAL.includes(g), `expected existing SemanticIntentEngine goal "${g}" in GOAL`);
    assert.equal(new Set(contract.GOAL).size, contract.GOAL.length, 'GOAL must have no duplicate entries');
});

for (const fixture of VALID_FIXTURES) {
    test(`validate() accepts a real, valid plan (goal=${fixture.goal})`, () => {
        const contract = load();
        const result = contract.validate(fixture);
        assert.deepEqual(result.errors, []);
        assert.equal(result.valid, true);
    });
}

for (const { name, payload } of INVALID_FIXTURES) {
    test(`validate() rejects: ${name}`, () => {
        const contract = load();
        const result = contract.validate(payload);
        assert.equal(result.valid, false);
        assert.ok(result.errors.length > 0, 'expected at least one real error message');
    });
}

test('validate() rejects a non-object payload without throwing', () => {
    const contract = load();
    for (const bad of [null, undefined, 'string', 42, []]) {
        const result = contract.validate(bad);
        assert.equal(result.valid, false);
    }
});

test('create() fills schemaVersion and returns {success:true, plan} for valid fields', () => {
    const contract = load();
    const result = contract.create({
        goal: 'HUMAN_BENEFIT', answerMode: 'DIRECT_ANSWER',
        entity: { type: 'application', value: 'ChurchOS' },
        claims: [{ claimId: 'c1', text: 't', evidenceIds: ['e1'] }],
        language: 'sw',
    });
    assert.equal(result.success, true);
    assert.equal(result.plan.schemaVersion, SCHEMA_VERSION);
});

test('create() returns {success:false, errors} for invalid fields, never a partially-built plan', () => {
    const contract = load();
    const result = contract.create({ goal: 'NOT_REAL' });
    assert.equal(result.success, false);
    assert.ok(Array.isArray(result.errors) && result.errors.length > 0);
    assert.equal(result.plan, undefined);
});

test('GOAL/ANSWER_MODE/REQUIRED_INFORMATION_GOALS/EXISTING_SEMANTIC_GOALS are frozen (cannot be mutated at a call site)', () => {
    const contract = load();
    assert.ok(Object.isFrozen(contract.GOAL));
    assert.ok(Object.isFrozen(contract.ANSWER_MODE));
    assert.ok(Object.isFrozen(contract.REQUIRED_INFORMATION_GOALS));
    assert.ok(Object.isFrozen(contract.EXISTING_SEMANTIC_GOALS));
});

test('re-running the module against the SAME window (simulating a second <script> load) is a real no-op — the internal Modules[] guard fires, never reassigning or re-freezing the export', () => {
    const contract = load();
    delete require.cache[require.resolve(CONTRACT_PATH)]; // force the IIFE to execute again
    require(CONTRACT_PATH); // same global.window as load() left behind — Modules[...] guard should short-circuit
    assert.equal(global.window.CozyOS.SemanticAnswerPlanContract, contract, 'expected the exact same frozen object reference, proving the guard returned early rather than rebuilding it');
});
