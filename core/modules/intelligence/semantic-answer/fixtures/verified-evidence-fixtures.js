'use strict';

/**
 * core/modules/intelligence/semantic-answer/fixtures/verified-evidence-fixtures.js
 * SA-1 fixture layer — see semantic-answer-plan-fixtures.js's own header
 * for the shared-fixture convention this follows.
 */

const SCHEMA_VERSION = 'cozy.verified-evidence.v1';

const VALID_FROM_KNOWLEDGE = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    id: 'ev-churchos-benefit-1',
    claim: 'ChurchOS organizes church work.',
    source: Object.freeze({ type: 'CozyKnowledge', id: 'getApplicationHumanPurposeFact:churchos', path: 'APPLICATION_HUMAN_PURPOSE_DATA.churchos.humanBenefits' }),
    verification: Object.freeze({ status: 'VERIFIED', confidence: 'HIGH', verifiedAt: '2024-01-01T00:00:00.000Z' }),
    sensitivity: 'PUBLIC',
    entityId: 'ChurchOS',
    provenance: 'window.CozyOS.CozyKnowledge',
});

const VALID_FROM_MEMORY_ORGANIZATION = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    id: 'ev-memory-org-1',
    claim: 'The pastor announced a new service time.',
    source: Object.freeze({ type: 'CozyMemory', id: 'church-notes:announcement-42' }),
    verification: Object.freeze({ status: 'CURATED', confidence: 'MEDIUM' }),
    sensitivity: 'ORGANIZATION',
    language: 'sw',
});

const VALID_UNVERIFIED_LEARNED = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    id: 'ev-cozylearn-candidate-1',
    claim: 'A user-taught synonym candidate not yet promoted.',
    source: Object.freeze({ type: 'CozyLearn', id: 'candidate-7' }),
    verification: Object.freeze({ status: 'UNVERIFIED', confidence: 'UNKNOWN' }),
    sensitivity: 'PRIVATE',
});

const INVALID_FIXTURES = Object.freeze([
    { name: 'missing id', payload: { ...VALID_FROM_KNOWLEDGE, id: undefined } },
    { name: 'missing claim', payload: { ...VALID_FROM_KNOWLEDGE, claim: '' } },
    { name: 'source missing type', payload: { ...VALID_FROM_KNOWLEDGE, source: { id: 'x' } } },
    { name: 'unrecognized verification.status', payload: { ...VALID_FROM_KNOWLEDGE, verification: { status: 'MADE_UP', confidence: 'HIGH' } } },
    { name: 'unrecognized verification.confidence', payload: { ...VALID_FROM_KNOWLEDGE, verification: { status: 'VERIFIED', confidence: 'SUPER_HIGH' } } },
    { name: 'unrecognized sensitivity', payload: { ...VALID_FROM_KNOWLEDGE, sensitivity: 'TOP_SECRET_MADE_UP' } },
    { name: 'missing sensitivity', payload: { ...VALID_FROM_KNOWLEDGE, sensitivity: undefined } },
]);

module.exports = {
    SCHEMA_VERSION,
    VALID_FROM_KNOWLEDGE,
    VALID_FROM_MEMORY_ORGANIZATION,
    VALID_UNVERIFIED_LEARNED,
    VALID_FIXTURES: [VALID_FROM_KNOWLEDGE, VALID_FROM_MEMORY_ORGANIZATION, VALID_UNVERIFIED_LEARNED],
    INVALID_FIXTURES,
};
