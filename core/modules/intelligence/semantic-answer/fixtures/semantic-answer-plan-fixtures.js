'use strict';

/**
 * core/modules/intelligence/semantic-answer/fixtures/semantic-answer-plan-fixtures.js
 *
 * SA-1 fixture layer — real example SemanticAnswerPlan payloads, valid
 * and invalid, reused by this contract's own schema tests AND by later
 * phases (SA-3's planner tests, SA-4's realizer tests) so every phase
 * validates against the SAME fixtures rather than each inventing its
 * own drifting examples. Plain CommonJS data module — no window/DOM
 * dependency, no registration of its own.
 */

const SCHEMA_VERSION = 'cozy.semantic-answer-plan.v1';

// A real, disclosed example matching the spec's own motivating case:
// "ChurchOS inasaidiaje mtu?" -> entity=ChurchOS, goal=HUMAN_BENEFIT, language=sw.
const VALID_HUMAN_BENEFIT_SW = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    goal: 'HUMAN_BENEFIT',
    answerMode: 'DIRECT_ANSWER',
    entity: Object.freeze({ type: 'application', value: 'ChurchOS', canonicalValue: 'ChurchOS' }),
    claims: Object.freeze([
        Object.freeze({ claimId: 'claim-1', text: 'ChurchOS organizes church work.', evidenceIds: Object.freeze(['ev-churchos-benefit-1']) }),
        Object.freeze({ claimId: 'claim-2', text: 'ChurchOS supports multilingual participation.', evidenceIds: Object.freeze(['ev-churchos-benefit-2']) }),
    ]),
    language: 'sw',
});

const VALID_PRACTICAL_WORK_CONTRIBUTION_SW = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    goal: 'PRACTICAL_WORK_CONTRIBUTION',
    answerMode: 'EXPLANATION',
    entity: Object.freeze({ type: 'application', value: 'ChurchOS' }),
    claims: Object.freeze([
        Object.freeze({ claimId: 'claim-1', text: 'ChurchOS organizes church work.', evidenceIds: Object.freeze(['ev-churchos-work-1']) }),
        Object.freeze({ claimId: 'claim-2', text: 'ChurchOS preserves church knowledge.', evidenceIds: Object.freeze(['ev-churchos-work-2']) }),
    ]),
    language: 'sw',
    conversationContext: Object.freeze({ previousEntity: 'ChurchOS' }),
});

// A real, existing SemanticIntentEngine goal (not one of the spec's new
// REQUIRED_INFORMATION_GOALS), proving the contract's union taxonomy.
const VALID_EXISTING_SEMANTIC_GOAL = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    goal: 'UNDERSTAND_CAPABILITIES',
    answerMode: 'LIST',
    entity: Object.freeze({ type: 'application', value: 'MpesaOS' }),
    claims: Object.freeze([
        Object.freeze({ claimId: 'claim-1', text: 'MpesaOS processes real transactions.', evidenceIds: Object.freeze(['ev-mpesaos-cap-1']) }),
    ]),
    language: 'en',
});

// A CLARIFICATION plan legitimately has zero claims — nothing to ground yet.
const VALID_CLARIFICATION_NO_CLAIMS = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    goal: 'CLARIFICATION',
    answerMode: 'CLARIFICATION_REQUEST',
    entity: Object.freeze({ type: 'unknown', value: 'unresolved' }),
    claims: Object.freeze([]),
    language: 'en',
});

const INVALID_FIXTURES = Object.freeze([
    { name: 'missing schemaVersion', payload: { goal: 'HUMAN_BENEFIT', answerMode: 'DIRECT_ANSWER', entity: { type: 'application', value: 'ChurchOS' }, claims: [{ claimId: 'c1', text: 't', evidenceIds: ['e1'] }], language: 'sw' } },
    { name: 'unrecognized goal', payload: { ...VALID_HUMAN_BENEFIT_SW, goal: 'MADE_UP_GOAL' } },
    { name: 'unrecognized answerMode', payload: { ...VALID_HUMAN_BENEFIT_SW, answerMode: 'MADE_UP_MODE' } },
    { name: 'entity missing value', payload: { ...VALID_HUMAN_BENEFIT_SW, entity: { type: 'application' } } },
    { name: 'claim missing evidenceIds', payload: { ...VALID_HUMAN_BENEFIT_SW, claims: [{ claimId: 'c1', text: 'no evidence array' }] } },
    { name: 'non-CLARIFICATION goal with zero claims', payload: { ...VALID_HUMAN_BENEFIT_SW, claims: [] } },
    { name: 'missing language', payload: { ...VALID_HUMAN_BENEFIT_SW, language: undefined } },
    { name: 'claims not an array', payload: { ...VALID_HUMAN_BENEFIT_SW, claims: 'not-an-array' } },
]);

module.exports = {
    SCHEMA_VERSION,
    VALID_HUMAN_BENEFIT_SW,
    VALID_PRACTICAL_WORK_CONTRIBUTION_SW,
    VALID_EXISTING_SEMANTIC_GOAL,
    VALID_CLARIFICATION_NO_CLAIMS,
    VALID_FIXTURES: [VALID_HUMAN_BENEFIT_SW, VALID_PRACTICAL_WORK_CONTRIBUTION_SW, VALID_EXISTING_SEMANTIC_GOAL, VALID_CLARIFICATION_NO_CLAIMS],
    INVALID_FIXTURES,
};
