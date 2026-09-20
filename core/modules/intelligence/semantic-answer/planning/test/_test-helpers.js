'use strict';

/**
 * core/modules/intelligence/semantic-answer/planning/test/_test-helpers.js
 * SA-3 shared test loader — loads the REAL, unmodified SemanticIntentEngine
 * and CozyKnowledge, plus SA-1's contracts and SA-2's evidence adapters,
 * plus the SA-3 planner under test, all onto ONE fresh window per call.
 */

const path = require('node:path');

const PATHS = Object.freeze({
    semanticIntent: path.join(__dirname, '..', '..', '..', '..', '..', 'living', 'cozy-ai-semantic-intent.js'),
    knowledgeRegistry: path.join(__dirname, '..', '..', '..', 'knowledge', 'cozy-knowledge-registry.js'),
    publicKnowledge: path.join(__dirname, '..', '..', '..', 'knowledge', 'cozy-public-knowledge-source.js'),
    planContract: path.join(__dirname, '..', '..', 'contracts', 'semantic-answer-plan-contract.js'),
    evidenceContract: path.join(__dirname, '..', '..', 'contracts', 'verified-evidence-contract.js'),
    cognitiveDecision: path.join(__dirname, '..', '..', 'contracts', 'cognitive-decision-contract.js'),
    evidenceAdapter: path.join(__dirname, '..', '..', 'evidence', 'verified-evidence-adapter.js'),
    knowledgeAdapter: path.join(__dirname, '..', '..', 'evidence', 'source-adapters', 'cozy-knowledge-adapter.js'),
    planner: path.join(__dirname, '..', 'semantic-answer-planner.js'),
});

function freshLoad(selectedKeys) {
    for (const p of Object.values(PATHS)) delete require.cache[require.resolve(p)];
    global.window = { CozyOS: {}, addEventListener: () => {}, dispatchEvent: () => {} };
    if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;
    for (const key of Object.keys(PATHS)) {
        if (selectedKeys.includes(key)) require(PATHS[key]);
    }
    return global.window;
}

/** Full real stack every planner test needs. */
function loadFullStack() {
    const w = freshLoad(['semanticIntent', 'knowledgeRegistry', 'publicKnowledge', 'planContract', 'evidenceContract', 'cognitiveDecision', 'evidenceAdapter', 'knowledgeAdapter', 'planner']);
    return {
        intentEngine: w.CozyOS.SemanticIntentEngine,
        knowledge: w.CozyOS.CozyKnowledge,
        planContract: w.CozyOS.SemanticAnswerPlanContract,
        evidenceContract: w.CozyOS.VerifiedEvidenceContract,
        cognitiveDecision: w.CozyOS.CognitiveDecisionContract,
        evidenceAdapter: w.CozyOS.VerifiedEvidenceAdapter,
        planner: w.CozyOS.SemanticAnswerPlanner,
    };
}

module.exports = { PATHS, freshLoad, loadFullStack };
