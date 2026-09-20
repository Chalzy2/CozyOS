'use strict';

/**
 * core/modules/learning/test/_test-helpers.js
 * LIF shared test loader — loads the REAL, unmodified engines this
 * phase composes (CozyMemory, CozySense, CozyLearn, CozyLanguagePacks,
 * CozyLanguageAcquisitionPipeline, the knowledge safety gate,
 * MultimodalObservationCore, SA-1's VerifiedEvidenceContract) plus this
 * phase's own new contracts/adapters, all onto ONE fresh window per
 * call.
 *
 * CML (Spelling/Correction Learning + Search -> Learn) extends this with
 * the real CozyLanguageKnowledgeModel (corrections), CozyKnowledgeIngestion
 * (search/document ingestion), SearchEngine, the runtime-loop adapters
 * (observation-store/learning-correlation/gap-detection/regression-
 * generator/learning-evidence-supplement), the SA-3 SemanticAnswerPlanner
 * stack (so gap-detection/regression-generator can compose the REAL
 * planner), and correction-learning.js/search-learn-bridge.js.
 */

const path = require('node:path');

const PATHS = Object.freeze({
    memoryEngine: path.join(__dirname, '..', '..', 'memory', 'cozy-memory-engine.js'),
    sense: path.join(__dirname, '..', '..', 'sense', 'cozy-sense.js'),
    cozyLearn: path.join(__dirname, '..', '..', '..', 'living', 'cozy-learn.js'),
    safetyGate: path.join(__dirname, '..', '..', 'intelligence', 'knowledge', 'ui', 'cozy-knowledge-safety-gate.js'),
    languagePackRegistry: path.join(__dirname, '..', '..', 'intelligence', 'language-packs', 'cozy-language-pack-registry.js'),
    languageAcquisitionPipeline: path.join(__dirname, '..', '..', 'intelligence', 'language-packs', 'cozy-language-acquisition-pipeline.js'),
    languageKnowledgeModel: path.join(__dirname, '..', '..', 'intelligence', 'language-packs', 'cozy-language-knowledge-model.js'),
    multimodalObservationCore: path.join(__dirname, '..', 'multimodal-observation-core.js'),
    evidenceContract: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'verified-evidence-contract.js'),
    observationContract: path.join(__dirname, '..', 'contracts', 'multimodal-observation-contract.js'),
    conceptContract: path.join(__dirname, '..', 'contracts', 'canonical-concept-contract.js'),
    observationAdapter: path.join(__dirname, '..', 'adapters', 'observation-adapter.js'),
    observationLifecycle: path.join(__dirname, '..', 'adapters', 'observation-lifecycle.js'),
    evidenceBridge: path.join(__dirname, '..', 'adapters', 'observation-evidence-bridge.js'),
    conceptRegistry: path.join(__dirname, '..', 'adapters', 'canonical-concept-registry.js'),
    observationStore: path.join(__dirname, '..', 'adapters', 'observation-store.js'),
    learningCorrelation: path.join(__dirname, '..', 'adapters', 'learning-correlation.js'),
    correctionLearning: path.join(__dirname, '..', 'adapters', 'correction-learning.js'),
    knowledgeIngestion: path.join(__dirname, '..', '..', 'intelligence', 'knowledge', 'cozy-knowledge-ingestion.js'),
    searchEngine: path.join(__dirname, '..', '..', '..', 'engines', 'search', 'search-engine.js'),
    searchLearnBridge: path.join(__dirname, '..', 'adapters', 'search-learn-bridge.js'),
    // SA-3 stack (real, unmodified except the one disclosed, tested
    // LearningEvidenceSupplement hook in semantic-answer-planner.js
    // itself) — required for gap-detection.js/regression-generator.js/
    // learning-evidence-supplement.js, which all compose the REAL planner.
    semanticIntent: path.join(__dirname, '..', '..', '..', 'living', 'cozy-ai-semantic-intent.js'),
    knowledgeRegistry: path.join(__dirname, '..', '..', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js'),
    publicKnowledge: path.join(__dirname, '..', '..', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js'),
    planContract: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'semantic-answer-plan-contract.js'),
    cognitiveDecision: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'contracts', 'cognitive-decision-contract.js'),
    evidenceAdapter: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'evidence', 'verified-evidence-adapter.js'),
    knowledgeAdapter: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'evidence', 'source-adapters', 'cozy-knowledge-adapter.js'),
    planner: path.join(__dirname, '..', '..', 'intelligence', 'semantic-answer', 'planning', 'semantic-answer-planner.js'),
    gapDetection: path.join(__dirname, '..', 'adapters', 'gap-detection.js'),
    regressionGenerator: path.join(__dirname, '..', 'adapters', 'regression-generator.js'),
    learningEvidenceSupplement: path.join(__dirname, '..', 'adapters', 'learning-evidence-supplement.js'),
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

/** Full real stack every LIF test needs, with sw/en language packs pre-registered. */
function loadFullStack() {
    const w = freshLoad([
        'memoryEngine', 'sense', 'cozyLearn', 'safetyGate', 'languagePackRegistry', 'languageAcquisitionPipeline',
        'multimodalObservationCore', 'evidenceContract',
        'observationContract', 'conceptContract', 'observationAdapter', 'observationLifecycle', 'evidenceBridge', 'conceptRegistry',
    ]);
    if (w.CozyOS.CozyLanguagePacks && typeof w.CozyOS.CozyLanguagePacks.registerDefaultPacks === 'function') {
        w.CozyOS.CozyLanguagePacks.registerDefaultPacks();
    }
    return {
        memory: w.CozyOS.CozyMemory,
        sense: w.CozyOS.CozySense,
        learn: w.CozyOS.CozyLearn,
        packs: w.CozyOS.CozyLanguagePacks,
        acquisition: w.CozyOS.CozyLanguageAcquisition,
        core: w.CozyOS.MultimodalObservationCore,
        evidenceContract: w.CozyOS.VerifiedEvidenceContract,
        observationContract: w.CozyOS.MultimodalObservationContract,
        conceptContract: w.CozyOS.CanonicalConceptContract,
        adapter: w.CozyOS.MultimodalObservationAdapter,
        lifecycle: w.CozyOS.ObservationLifecycle,
        bridge: w.CozyOS.ObservationEvidenceBridge,
        conceptRegistry: w.CozyOS.CanonicalConceptRegistry,
    };
}

/**
 * Full real stack for CML Spelling/Correction Learning + Search -> Learn
 * tests: everything loadFullStack() loads, PLUS the real SA-3 planner
 * stack, the runtime-loop adapters, corrections, search ingestion, and
 * the language-knowledge-model correction schema.
 */
function loadFullStackWithPlanner() {
    const w = freshLoad([
        'memoryEngine', 'sense', 'cozyLearn', 'safetyGate', 'languagePackRegistry', 'languageAcquisitionPipeline', 'languageKnowledgeModel',
        'multimodalObservationCore', 'evidenceContract',
        'observationContract', 'conceptContract', 'observationAdapter', 'observationLifecycle', 'evidenceBridge', 'conceptRegistry',
        'observationStore', 'learningCorrelation', 'correctionLearning',
        'knowledgeIngestion', 'searchEngine', 'searchLearnBridge',
        'semanticIntent', 'knowledgeRegistry', 'publicKnowledge', 'planContract', 'cognitiveDecision', 'evidenceAdapter', 'knowledgeAdapter', 'planner',
        'gapDetection', 'regressionGenerator', 'learningEvidenceSupplement',
    ]);
    if (w.CozyOS.CozyLanguagePacks && typeof w.CozyOS.CozyLanguagePacks.registerDefaultPacks === 'function') {
        w.CozyOS.CozyLanguagePacks.registerDefaultPacks();
    }
    return {
        memory: w.CozyOS.CozyMemory,
        sense: w.CozyOS.CozySense,
        learn: w.CozyOS.CozyLearn,
        packs: w.CozyOS.CozyLanguagePacks,
        acquisition: w.CozyOS.CozyLanguageAcquisition,
        knowledgeModel: w.CozyOS.CozyLanguageKnowledgeModel,
        core: w.CozyOS.MultimodalObservationCore,
        evidenceContract: w.CozyOS.VerifiedEvidenceContract,
        observationContract: w.CozyOS.MultimodalObservationContract,
        conceptContract: w.CozyOS.CanonicalConceptContract,
        adapter: w.CozyOS.MultimodalObservationAdapter,
        lifecycle: w.CozyOS.ObservationLifecycle,
        bridge: w.CozyOS.ObservationEvidenceBridge,
        conceptRegistry: w.CozyOS.CanonicalConceptRegistry,
        observationStore: w.CozyOS.ObservationStore,
        correlation: w.CozyOS.LearningCorrelation,
        correctionLearning: w.CozyOS.CorrectionLearning,
        knowledgeIngestion: w.CozyOS.CozyKnowledgeIngestion,
        searchEngine: w.CozyOS.SearchEngine,
        searchLearnBridge: w.CozyOS.SearchLearnBridge,
        intentEngine: w.CozyOS.SemanticIntentEngine,
        knowledge: w.CozyOS.CozyKnowledge,
        planner: w.CozyOS.SemanticAnswerPlanner,
        gapDetection: w.CozyOS.GapDetection,
        regressionGenerator: w.CozyOS.RegressionGenerator,
        learningEvidenceSupplement: w.CozyOS.LearningEvidenceSupplement,
        window: w,
    };
}

const AUTHORIZED_CONSENT = Object.freeze({ authorized: true, scope: 'SELF', grantedBy: 'test-user' });
const UNAUTHORIZED_CONSENT = Object.freeze({ authorized: false, scope: 'SESSION_PARTICIPANTS', grantedBy: null });

module.exports = { PATHS, freshLoad, loadFullStack, loadFullStackWithPlanner, AUTHORIZED_CONSENT, UNAUTHORIZED_CONSENT };
