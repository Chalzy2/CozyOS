'use strict';

/**
 * core/modules/cognitive/providers/test/_test-helpers.js
 * SA-3B shared test loader — loads the REAL, unmodified cognitive stack
 * (Interpretation/Thinking/Reasoning/Sense/Policy/CognitiveCoordinator),
 * the REAL ai-bootstrap.js (so "living-nlu-baseline" etc. are genuinely
 * registered, exactly as on the real pages), the full SA-1/SA-2/SA-3
 * chain, and the SA-3B bridge, all onto ONE fresh window per call — the
 * exact real load order index.html/dashboard.html/admin-workspace.html
 * use.
 */

const path = require('node:path');

const PATHS = Object.freeze({
    memoryEngine: path.join(__dirname, '..', '..', '..', 'memory', 'cozy-memory-engine.js'),
    intelligence: path.join(__dirname, '..', '..', '..', 'intelligence', 'cozy-intelligence.js'),
    interpretation: path.join(__dirname, '..', '..', '..', 'interpretation', 'cozy-interpretation.js'),
    reasoning: path.join(__dirname, '..', '..', '..', 'reasoning', 'cozy-reasoning.js'),
    sense: path.join(__dirname, '..', '..', '..', 'sense', 'cozy-sense.js'),
    thinking: path.join(__dirname, '..', '..', '..', 'thinking', 'cozy-thinking.js'),
    policyEngine: path.join(__dirname, '..', '..', '..', 'policy', 'policy-engine.js'),
    policyDecisionEngine: path.join(__dirname, '..', '..', '..', 'policy', 'policy-decision-engine.js'),
    coordinator: path.join(__dirname, '..', '..', 'cognitive-coordinator.js'),
    aiBootstrap: path.join(__dirname, '..', '..', '..', 'intelligence', 'ai-bootstrap.js'),
    identity: path.join(__dirname, '..', '..', '..', 'identity', 'identity-engine.js'),
    orgRegistry: path.join(__dirname, '..', '..', '..', '..', 'organization', 'organization-registry.js'),
    orgMembership: path.join(__dirname, '..', '..', '..', '..', 'organization', 'organization-membership.js'),
    orgSupport: path.join(__dirname, '..', '..', '..', '..', 'organization', 'organization-support.js'),
    knowledgeRegistry: path.join(__dirname, '..', '..', '..', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js'),
    publicKnowledge: path.join(__dirname, '..', '..', '..', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js'),
    planContract: path.join(__dirname, '..', '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'semantic-answer-plan-contract.js'),
    evidenceContract: path.join(__dirname, '..', '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'verified-evidence-contract.js'),
    cognitiveDecision: path.join(__dirname, '..', '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'cognitive-decision-contract.js'),
    evidenceAdapter: path.join(__dirname, '..', '..', '..', 'intelligence', 'semantic-answer', 'evidence', 'verified-evidence-adapter.js'),
    knowledgeAdapter: path.join(__dirname, '..', '..', '..', 'intelligence', 'semantic-answer', 'evidence', 'source-adapters', 'cozy-knowledge-adapter.js'),
    memoryAdapter: path.join(__dirname, '..', '..', '..', 'intelligence', 'semantic-answer', 'evidence', 'source-adapters', 'cozy-memory-adapter.js'),
    planner: path.join(__dirname, '..', '..', '..', 'intelligence', 'semantic-answer', 'planning', 'semantic-answer-planner.js'),
    bridge: path.join(__dirname, '..', 'semantic-answer-interpretation-provider.js'),
    semanticIntent: path.join(__dirname, '..', '..', '..', '..', 'living', 'cozy-ai-semantic-intent.js'),
});

function freshLoad(selectedKeys) {
    for (const p of Object.values(PATHS)) delete require.cache[require.resolve(p)];
    global.window = { CozyOS: {}, addEventListener: () => {}, dispatchEvent: () => {}, setTimeout, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
    if (typeof global.crypto === 'undefined') global.crypto = require('crypto').webcrypto;
    for (const key of Object.keys(PATHS)) {
        if (selectedKeys.includes(key)) require(PATHS[key]);
    }
    return global.window;
}

/** Full real stack, exact real page load order (ai-bootstrap BEFORE the SA-3B chain, matching index.html). */
function loadFullStack() {
    const w = freshLoad([
        'memoryEngine', 'intelligence', 'interpretation', 'reasoning', 'sense', 'thinking',
        'policyEngine', 'policyDecisionEngine', 'coordinator', 'aiBootstrap',
        'identity', 'orgRegistry', 'orgMembership', 'orgSupport',
        'knowledgeRegistry', 'publicKnowledge',
        'planContract', 'evidenceContract', 'cognitiveDecision', 'evidenceAdapter', 'knowledgeAdapter', 'memoryAdapter', 'planner', 'bridge',
        'semanticIntent',
    ]);
    return {
        coordinator: w.CozyOS.CognitiveCoordinator,
        interpretation: w.CozyOS.CozyInterpretation,
        thinking: w.CozyOS.CozyThinking,
        reasoning: w.CozyOS.CozyReasoning,
        planner: w.CozyOS.SemanticAnswerPlanner,
        bridge: w.CozyOS.SemanticAnswerInterpretationProvider,
        intentEngine: w.CozyOS.SemanticIntentEngine,
        knowledge: w.CozyOS.CozyKnowledge,
        memory: w.CozyOS.CozyMemory,
        identity: w.CozyOS.IdentityEngine,
    };
}

/** Real stack WITHOUT ai-bootstrap.js — used only to prove degrade-safe behavior when it's absent. */
function loadWithoutBootstrap() {
    const w = freshLoad([
        'memoryEngine', 'interpretation', 'thinking', 'reasoning', 'policyDecisionEngine', 'coordinator',
        'knowledgeRegistry', 'publicKnowledge',
        'planContract', 'evidenceContract', 'cognitiveDecision', 'evidenceAdapter', 'knowledgeAdapter', 'memoryAdapter', 'planner', 'bridge',
        'semanticIntent',
    ]);
    return { coordinator: w.CozyOS.CognitiveCoordinator, interpretation: w.CozyOS.CozyInterpretation };
}

/** Real stack WITHOUT the SA-3B bridge at all — used to prove the coordinator degrades safely with no fabrication. */
function loadWithoutBridge() {
    const w = freshLoad([
        'memoryEngine', 'intelligence', 'interpretation', 'reasoning', 'sense', 'thinking',
        'policyEngine', 'policyDecisionEngine', 'coordinator', 'aiBootstrap',
        'knowledgeRegistry', 'publicKnowledge', 'semanticIntent',
    ]);
    return { coordinator: w.CozyOS.CognitiveCoordinator };
}

module.exports = { PATHS, freshLoad, loadFullStack, loadWithoutBootstrap, loadWithoutBridge };
