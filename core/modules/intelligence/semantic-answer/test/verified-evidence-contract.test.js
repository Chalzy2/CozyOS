'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CONTRACT_PATH = path.join(__dirname, '..', 'contracts', 'verified-evidence-contract.js');
const { SCHEMA_VERSION, VALID_FIXTURES, INVALID_FIXTURES, VALID_UNVERIFIED_LEARNED } = require('../fixtures/verified-evidence-fixtures');

function load() {
    delete require.cache[require.resolve(CONTRACT_PATH)];
    global.window = { CozyOS: {} };
    require(CONTRACT_PATH);
    return global.window.CozyOS.VerifiedEvidenceContract;
}

test('registers window.CozyOS.VerifiedEvidenceContract with the real, versioned schema id', () => {
    const contract = load();
    assert.equal(contract.SCHEMA_VERSION, SCHEMA_VERSION);
});

test('VERIFICATION_STATUS distinguishes VERIFIED/CURATED/APPROVED from UNVERIFIED/CONFLICTED/DEPRECATED (spec §3.B)', () => {
    const contract = load();
    for (const s of ['VERIFIED', 'CURATED', 'APPROVED', 'UNVERIFIED', 'CONFLICTED', 'DEPRECATED']) assert.ok(contract.VERIFICATION_STATUS.includes(s));
});

for (const fixture of VALID_FIXTURES) {
    test(`validate() accepts a real, valid evidence record (source.type=${fixture.source.type})`, () => {
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

test('isAuthoritative() is true only for VERIFIED/CURATED/APPROVED, never for UNVERIFIED/CONFLICTED/DEPRECATED', () => {
    const contract = load();
    assert.equal(contract.isAuthoritative({ verification: { status: 'VERIFIED' } }), true);
    assert.equal(contract.isAuthoritative({ verification: { status: 'CURATED' } }), true);
    assert.equal(contract.isAuthoritative({ verification: { status: 'APPROVED' } }), true);
    assert.equal(contract.isAuthoritative(VALID_UNVERIFIED_LEARNED), false);
    assert.equal(contract.isAuthoritative({ verification: { status: 'CONFLICTED' } }), false);
    assert.equal(contract.isAuthoritative({ verification: { status: 'DEPRECATED' } }), false);
    assert.equal(contract.isAuthoritative(null), false);
    assert.equal(contract.isAuthoritative(undefined), false);
});

test('SENSITIVITY is the real union of both existing repo authorization systems (CozyMemory + server knowledge-registry)', () => {
    const contract = load();
    // CozyMemory's own values, normalized to uppercase (core/modules/memory/cozy-memory-engine.js).
    for (const s of ['PUBLIC', 'ORGANIZATION', 'PRIVATE']) assert.ok(contract.SENSITIVITY.includes(s));
    // server/webauthn-rp/knowledge-registry.js's own additional values.
    for (const s of ['ADMIN', 'SYSTEM', 'SECRET']) assert.ok(contract.SENSITIVITY.includes(s));
});

test('create() fills schemaVersion and returns {success:true, evidence} for valid fields', () => {
    const contract = load();
    const result = contract.create({
        id: 'ev-1', claim: 'A real claim.', source: { type: 'CozyKnowledge', id: 'x' },
        verification: { status: 'VERIFIED', confidence: 'HIGH' }, sensitivity: 'PUBLIC',
    });
    assert.equal(result.success, true);
    assert.equal(result.evidence.schemaVersion, SCHEMA_VERSION);
});

test('create() returns {success:false, errors} for invalid fields', () => {
    const contract = load();
    const result = contract.create({ id: 'ev-1' });
    assert.equal(result.success, false);
    assert.ok(result.errors.length > 0);
});
