'use strict';

/**
 * core/modules/intelligence/semantic-answer/fixtures/candidate-sentence-fixtures.js
 * SA-1 fixture layer — see semantic-answer-plan-fixtures.js's own header
 * for the shared-fixture convention this follows.
 */

const SCHEMA_VERSION = 'cozy.candidate-sentence.v1';

const VALID_COMPOSED_SW = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    text: 'ChurchOS husaidia kupanga kazi za kanisa na kuwezesha ushiriki wa lugha nyingi.',
    language: 'sw',
    sourcePlanId: 'plan-1',
    evidenceIds: Object.freeze(['ev-churchos-benefit-1', 'ev-churchos-benefit-2']),
    generation: Object.freeze({ mode: 'COMPOSED', provider: 'semantic-answer-realizer', attempt: 1 }),
});

const VALID_REPAIRED_EN = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    text: 'ChurchOS organizes church work and supports multilingual participation.',
    language: 'en',
    sourcePlanId: 'plan-2',
    evidenceIds: Object.freeze(['ev-churchos-work-1', 'ev-churchos-work-2']),
    generation: Object.freeze({ mode: 'REPAIRED', attempt: 2 }),
});

const INVALID_FIXTURES = Object.freeze([
    { name: 'missing text', payload: { ...VALID_COMPOSED_SW, text: '' } },
    { name: 'missing sourcePlanId', payload: { ...VALID_COMPOSED_SW, sourcePlanId: undefined } },
    { name: 'evidenceIds not an array', payload: { ...VALID_COMPOSED_SW, evidenceIds: 'ev-1' } },
    { name: 'unrecognized generation.mode', payload: { ...VALID_COMPOSED_SW, generation: { mode: 'MADE_UP_MODE' } } },
    { name: 'generation.attempt not a positive integer', payload: { ...VALID_COMPOSED_SW, generation: { mode: 'COMPOSED', attempt: 0 } } },
]);

module.exports = { SCHEMA_VERSION, VALID_COMPOSED_SW, VALID_REPAIRED_EN, VALID_FIXTURES: [VALID_COMPOSED_SW, VALID_REPAIRED_EN], INVALID_FIXTURES };
