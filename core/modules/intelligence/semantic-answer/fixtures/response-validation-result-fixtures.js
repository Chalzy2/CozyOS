'use strict';

/**
 * core/modules/intelligence/semantic-answer/fixtures/response-validation-result-fixtures.js
 * SA-1 fixture layer — see semantic-answer-plan-fixtures.js's own header
 * for the shared-fixture convention this follows.
 */

const SCHEMA_VERSION = 'cozy.response-validation-result.v1';

function passedCheck(details) { return Object.freeze({ status: 'PASS', confidence: 'HIGH', details }); }

const VALID_PASS = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    status: 'PASS',
    checks: Object.freeze({
        meaning: passedCheck('Satisfies HUMAN_BENEFIT goal.'),
        evidence: passedCheck('All claims trace to real VerifiedEvidence ids.'),
        language: passedCheck('Confirmed Kiswahili output.'),
        grammar: passedCheck('Structurally valid Kiswahili.'),
        naturalness: passedCheck('Reads as a native speaker would phrase it.'),
        completeness: passedCheck('Answers the intended question.'),
        entity: passedCheck('Entity preserved as ChurchOS.'),
        authorization: passedCheck('Within PUBLIC sensitivity, no restricted evidence used.'),
    }),
    violations: Object.freeze([]),
});

const VALID_REPAIR_REQUIRED = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    status: 'REPAIR_REQUIRED',
    checks: Object.freeze({
        meaning: passedCheck(),
        evidence: passedCheck(),
        language: Object.freeze({ status: 'FAIL', confidence: 'HIGH', details: 'Output was English, not the requested Kiswahili.' }),
        grammar: Object.freeze({ status: 'NOT_EVALUATED' }),
        naturalness: Object.freeze({ status: 'NOT_EVALUATED' }),
        completeness: passedCheck(),
        entity: passedCheck(),
        authorization: passedCheck(),
    }),
    violations: Object.freeze([
        Object.freeze({ code: 'LANGUAGE_MISMATCH', severity: 'MAJOR', message: 'Requested sw, produced en.' }),
    ]),
    repair: Object.freeze({ instructions: Object.freeze(['Re-realize in Kiswahili using the same semantic plan and evidence.']) }),
});

const VALID_REJECT = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    status: 'REJECT',
    checks: Object.freeze({
        meaning: passedCheck(),
        evidence: Object.freeze({ status: 'FAIL', confidence: 'HIGH', details: 'Claim not grounded in any supplied evidence id.' }),
        language: passedCheck(),
        grammar: passedCheck(),
        naturalness: passedCheck(),
        completeness: passedCheck(),
        entity: passedCheck(),
        authorization: passedCheck(),
    }),
    violations: Object.freeze([
        Object.freeze({ code: 'UNGROUNDED_CLAIM', severity: 'BLOCKING', message: 'A factual assertion had no matching evidence id — never invent a replacement fact.' }),
    ]),
});

const INVALID_FIXTURES = Object.freeze([
    { name: 'unrecognized status', payload: { ...VALID_PASS, status: 'MADE_UP_STATUS' } },
    { name: 'missing a required check', payload: { ...VALID_PASS, checks: { meaning: passedCheck(), evidence: passedCheck() } } },
    { name: 'violation missing severity', payload: { ...VALID_REJECT, violations: [{ code: 'X', message: 'no severity' }] } },
    { name: 'REJECT status with no BLOCKING violation', payload: { ...VALID_REJECT, violations: [{ code: 'X', severity: 'MINOR', message: 'not blocking' }] } },
    { name: 'PASS status with a BLOCKING violation recorded', payload: { ...VALID_PASS, violations: [{ code: 'X', severity: 'BLOCKING', message: 'inconsistent' }] } },
    { name: 'REPAIR_REQUIRED status with no repair object', payload: { ...VALID_REPAIR_REQUIRED, repair: undefined } },
    { name: 'repair.instructions empty', payload: { ...VALID_REPAIR_REQUIRED, repair: { instructions: [] } } },
]);

module.exports = {
    SCHEMA_VERSION, VALID_PASS, VALID_REPAIR_REQUIRED, VALID_REJECT,
    VALID_FIXTURES: [VALID_PASS, VALID_REPAIR_REQUIRED, VALID_REJECT],
    INVALID_FIXTURES,
};
