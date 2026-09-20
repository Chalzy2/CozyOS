'use strict';

/**
 * core/modules/intelligence/semantic-answer/fixtures/language-realization-request-fixtures.js
 * SA-1 fixture layer — see semantic-answer-plan-fixtures.js's own header
 * for the shared-fixture convention this follows. Composes the other
 * two fixture files so a request fixture always references real,
 * independently-valid plan/evidence fixtures rather than inventing new
 * ones that could silently drift.
 */

const { VALID_HUMAN_BENEFIT_SW } = require('./semantic-answer-plan-fixtures');
const { VALID_FROM_KNOWLEDGE } = require('./verified-evidence-fixtures');

const SCHEMA_VERSION = 'cozy.language-realization-request.v1';

const FIXED_CONSTRAINTS = Object.freeze({ preserveMeaning: true, useOnlyEvidence: true, naturalLanguage: true, answerDirectly: true });

const VALID_SW_REQUEST = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    language: Object.freeze({ languageId: 'sw', bcp47: 'sw-KE', displayName: 'Kiswahili', nativeName: 'Kiswahili' }),
    semanticPlan: VALID_HUMAN_BENEFIT_SW,
    evidence: Object.freeze([VALID_FROM_KNOWLEDGE]),
    constraints: FIXED_CONSTRAINTS,
});

const INVALID_FIXTURES = Object.freeze([
    { name: 'missing language.languageId', payload: { ...VALID_SW_REQUEST, language: { bcp47: 'sw-KE' } } },
    { name: 'malformed semanticPlan (fails nested validation)', payload: { ...VALID_SW_REQUEST, semanticPlan: { ...VALID_HUMAN_BENEFIT_SW, goal: 'NOT_A_REAL_GOAL' } } },
    { name: 'evidence not an array', payload: { ...VALID_SW_REQUEST, evidence: 'not-an-array' } },
    { name: 'constraints.useOnlyEvidence weakened to false', payload: { ...VALID_SW_REQUEST, constraints: { ...FIXED_CONSTRAINTS, useOnlyEvidence: false } } },
    { name: 'constraints.naturalLanguage missing', payload: { ...VALID_SW_REQUEST, constraints: { preserveMeaning: true, useOnlyEvidence: true, answerDirectly: true } } },
]);

module.exports = { SCHEMA_VERSION, FIXED_CONSTRAINTS, VALID_SW_REQUEST, VALID_FIXTURES: [VALID_SW_REQUEST], INVALID_FIXTURES };
