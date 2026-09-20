'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'candidate-sentence-contract.js');
const { SCHEMA_VERSION, VALID_FIXTURES, INVALID_FIXTURES } = require('../fixtures/candidate-sentence-fixtures');

function load() {
    delete require.cache[require.resolve(CONTRACT_PATH)];
    global.window = { CozyOS: {} };
    require(CONTRACT_PATH);
    return global.window.CozyOS.CandidateSentenceContract;
}

test('registers window.CozyOS.CandidateSentenceContract with the real, versioned schema id', () => {
    const contract = load();
    assert.equal(contract.SCHEMA_VERSION, SCHEMA_VERSION);
});

test('GENERATION_MODE is the real, exact four-value set from spec §3.D', () => {
    const contract = load();
    assert.deepEqual([...contract.GENERATION_MODE].sort(), ['COMPOSED', 'MODEL_GENERATED', 'REPAIRED', 'RULE_ASSISTED'].sort());
});

for (const fixture of VALID_FIXTURES) {
    test(`validate() accepts a real, valid candidate (mode=${fixture.generation.mode})`, () => {
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
        assert.ok(result.errors.length > 0);
    });
}

test('create() fills schemaVersion and returns {success:true, candidate} for valid fields', () => {
    const contract = load();
    const result = contract.create({
        text: 'A real sentence.', language: 'en', sourcePlanId: 'plan-1',
        evidenceIds: ['e1'], generation: { mode: 'COMPOSED' },
    });
    assert.equal(result.success, true);
    assert.equal(result.candidate.schemaVersion, SCHEMA_VERSION);
});

test('create() returns {success:false, errors} for invalid fields, never a partially-built candidate', () => {
    const contract = load();
    const result = contract.create({ text: '' });
    assert.equal(result.success, false);
    assert.ok(result.errors.length > 0);
    assert.equal(result.candidate, undefined);
});
