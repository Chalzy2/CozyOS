'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'response-validation-result-contract.js');
const { SCHEMA_VERSION, VALID_FIXTURES, INVALID_FIXTURES, VALID_PASS, VALID_REJECT, VALID_REPAIR_REQUIRED } = require('../fixtures/response-validation-result-fixtures');

function load() {
    delete require.cache[require.resolve(CONTRACT_PATH)];
    global.window = { CozyOS: {} };
    require(CONTRACT_PATH);
    return global.window.CozyOS.ResponseValidationResultContract;
}

test('registers window.CozyOS.ResponseValidationResultContract with the real, versioned schema id', () => {
    const contract = load();
    assert.equal(contract.SCHEMA_VERSION, SCHEMA_VERSION);
});

test('CHECK_NAMES carries all 8 real checks: the 7 from spec §3.E plus the "authorization" check spec §7 separately requires', () => {
    const contract = load();
    for (const c of ['meaning', 'evidence', 'language', 'grammar', 'naturalness', 'completeness', 'entity', 'authorization']) {
        assert.ok(contract.CHECK_NAMES.includes(c), `expected check "${c}"`);
    }
    assert.equal(contract.CHECK_NAMES.length, 8);
});

for (const fixture of VALID_FIXTURES) {
    test(`validate() accepts a real, valid result (status=${fixture.status})`, () => {
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

test('cross-field consistency: REJECT requires a real BLOCKING violation', () => {
    const contract = load();
    const result = contract.validate({ ...VALID_REJECT, violations: [{ code: 'X', severity: 'MAJOR', message: 'not blocking enough' }] });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('BLOCKING')));
});

test('cross-field consistency: PASS is rejected if a BLOCKING or MAJOR violation is still recorded', () => {
    const contract = load();
    const withBlocking = contract.validate({ ...VALID_PASS, violations: [{ code: 'X', severity: 'BLOCKING', message: 'inconsistent' }] });
    assert.equal(withBlocking.valid, false);
    const withMajor = contract.validate({ ...VALID_PASS, violations: [{ code: 'X', severity: 'MAJOR', message: 'inconsistent' }] });
    assert.equal(withMajor.valid, false);
});

test('cross-field consistency: REPAIR_REQUIRED requires a real, non-empty repair.instructions array — repair must preserve the ability to point the realizer back at the original plan/evidence', () => {
    const contract = load();
    const noRepair = contract.validate({ ...VALID_REPAIR_REQUIRED, repair: undefined });
    assert.equal(noRepair.valid, false);
    const emptyInstructions = contract.validate({ ...VALID_REPAIR_REQUIRED, repair: { instructions: [] } });
    assert.equal(emptyInstructions.valid, false);
});

test('create() fills schemaVersion and returns {success:true, result} for a valid PASS payload', () => {
    const contract = load();
    const { schemaVersion: _drop, ...rest } = VALID_PASS;
    const result = contract.create(rest);
    assert.equal(result.success, true);
    assert.equal(result.result.schemaVersion, SCHEMA_VERSION);
});

test('create() returns {success:false, errors} for invalid fields', () => {
    const contract = load();
    const result = contract.create({ status: 'NOT_REAL' });
    assert.equal(result.success, false);
    assert.ok(result.errors.length > 0);
});
