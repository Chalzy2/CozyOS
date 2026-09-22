'use strict';

/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-stale-cognitive-result.test.js
 *
 * WAVE 7a — multi-turn entity-switching repair.
 *
 * ROOT CAUSE (traced through the real, live call chain, not assumed):
 *   semantic-answer-interpretation-provider.js's buildInterpretation()
 *   (SA-3B's bridge, invoked EARLY in every turn by CognitiveCoordinator.run()
 *   from inside rule-based-conversational-provider.js's think()) calls
 *   SemanticAnswerPlanner.planAnswer({text, conversationState, actorId})
 *   with NO entityHint. When the CURRENT turn names an application
 *   SemanticIntentEngine's own KNOWN_ENTITIES list does not recognize
 *   (a real, disclosed, pre-existing gap — see semantic-answer-planner.js's
 *   own header, "entityHint... takes priority... since that engine's real
 *   KNOWN_ENTITIES list... does not cover every real application"),
 *   SA-3's own resolveContextualEntity() honestly falls back to
 *   inheriting conversationState.lastDiscussedApplication — the
 *   PREVIOUS turn's application — producing a structurally valid
 *   (success:true, plan.goal set) but WRONG-entity plan.
 *
 *   Separately, cozy-living-assistant.js's own `entityHint`
 *   (`contextualEntityName`, computed in #send() AFTER this turn's
 *   conversationState is updated) correctly names the CURRENT turn's
 *   real entity — but cozy-answer-engine.js's Wave 1 cognitiveResult-
 *   reuse optimization (tryConstructSemanticAnswer()) blindly trusted
 *   the stale cached plan whenever it was structurally valid, never
 *   comparing it against entityHint. This is the exact, reproduced
 *   "answers the previous app instead of the one just asked about"
 *   defect (PRE-EXISTING-FAILURE-REGISTER.md §7.2.1).
 *
 * REPAIR (minimal, additive, no new entity-resolution system):
 *   tryConstructSemanticAnswer() now only reuses cognitiveResult when
 *   its own resolved plan.entity.value agrees with entityHint (or no
 *   entityHint was supplied at all — preserving every pre-Wave-7a
 *   caller's exact behavior byte-for-byte). Disagreement falls through
 *   to the SAME fresh planner.planAnswer() call this function has
 *   always made when cognitiveResult is absent, which already correctly
 *   threads entityHint through SA-3's own real entityHint-first
 *   priority (semantic-answer-planner.js's resolveContextualEntity()).
 *
 * Uses the REAL, full stack (no stubs for the construction pipeline) —
 * same loadFullStack() composition as
 * cozy-answer-engine-semantic-construction.test.js's own, so this test
 * proves the repair against the actual production module graph, not a
 * synthetic one.
 *
 * Run with: node --test core/modules/intelligence/answer/tests/cozy-answer-engine-stale-cognitive-result.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function makeFakeDeveloperIdentity() {
    return {
        answerWhoCreatedYou() { return { known: true, answer: 'CozyOS was founded by Test Founder.' }; },
        answerWhyCreated() { return { known: true, answer: 'CozyOS was created to solve real community problems.' } }
    };
}
function makeFakeServiceRegistry() { return { listApplications: () => [{ id: 'churchos', name: 'ChurchOS' }] }; }
function makeFakeProviderManager() { return { register() {}, healthReport: () => ({}) }; }

const roots = {
    secretRegistry: path.join(__dirname, '..', '..', '..', 'vault', 'secret-registry.js'),
    encryptionManager: path.join(__dirname, '..', '..', '..', 'vault', 'encryption-manager.js'),
    secretManager: path.join(__dirname, '..', '..', '..', 'vault', 'secret-manager.js'),
    typedManagers: path.join(__dirname, '..', '..', '..', 'vault', 'typed-managers.js'),
    rotationHealth: path.join(__dirname, '..', '..', '..', 'vault', 'rotation-and-health.js'),
    vaultEngine: path.join(__dirname, '..', '..', '..', 'vault', 'cozy-vault-engine.js'),
    founderStory: path.join(__dirname, '..', '..', '..', 'founder-story', 'founder-story-engine.js'),
    knowledgeRegistry: path.join(__dirname, '..', '..', 'knowledge', 'cozy-knowledge-registry.js'),
    publicKnowledgeSource: path.join(__dirname, '..', '..', 'knowledge', 'cozy-public-knowledge-source.js'),
    memoryEngine: path.join(__dirname, '..', '..', '..', 'memory', 'cozy-memory-engine.js'),
    identityFaqRouter: path.join(__dirname, '..', '..', '..', 'knowledge', 'cozyos-identity-faq-router.js'),
    semanticIntentEngine: path.join(__dirname, '..', '..', '..', '..', 'living', 'cozy-ai-semantic-intent.js'),
    templates: path.join(__dirname, '..', '..', 'language', 'cozy-language-templates.js'),
    realizeSeam: path.join(__dirname, '..', '..', 'language', 'cozy-language-realize.js'),
    languageRegistry: path.join(__dirname, '..', '..', 'language', 'cozy-language-registry.js'),
    cozyAi: path.join(__dirname, '..', '..', 'cozy-ai.js'),
    answerEngine: path.join(__dirname, '..', 'cozy-answer-engine.js'),
    planPlanContract: path.join(__dirname, '..', '..', 'semantic-answer', 'contracts', 'semantic-answer-plan-contract.js'),
    evidenceContract: path.join(__dirname, '..', '..', 'semantic-answer', 'contracts', 'verified-evidence-contract.js'),
    realizationRequestContract: path.join(__dirname, '..', '..', 'semantic-answer', 'contracts', 'language-realization-request-contract.js'),
    candidateContract: path.join(__dirname, '..', '..', 'semantic-answer', 'contracts', 'candidate-sentence-contract.js'),
    validationResultContract: path.join(__dirname, '..', '..', 'semantic-answer', 'contracts', 'response-validation-result-contract.js'),
    cognitiveDecisionContract: path.join(__dirname, '..', '..', 'semantic-answer', 'contracts', 'cognitive-decision-contract.js'),
    evidenceAdapter: path.join(__dirname, '..', '..', 'semantic-answer', 'evidence', 'verified-evidence-adapter.js'),
    knowledgeAdapter: path.join(__dirname, '..', '..', 'semantic-answer', 'evidence', 'source-adapters', 'cozy-knowledge-adapter.js'),
    memoryAdapter: path.join(__dirname, '..', '..', 'semantic-answer', 'evidence', 'source-adapters', 'cozy-memory-adapter.js'),
    planner: path.join(__dirname, '..', '..', 'semantic-answer', 'planning', 'semantic-answer-planner.js'),
    realizer: path.join(__dirname, '..', '..', 'semantic-answer', 'realization', 'language-realizer.js'),
    validator: path.join(__dirname, '..', '..', 'semantic-answer', 'validation', 'response-validator.js'),
    repairLoop: path.join(__dirname, '..', '..', 'semantic-answer', 'repair', 'repair-loop.js'),
};

function loadFullStack() {
    Object.values(roots).forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const fakeWindow = {
        CozyOS: {
            DeveloperIdentity: makeFakeDeveloperIdentity(),
            ServiceRegistry: makeFakeServiceRegistry(),
            ProviderManager: makeFakeProviderManager(),
        },
        addEventListener: () => {}, dispatchEvent: () => {}
    };
    global.window = fakeWindow;
    if (!global.crypto) { global.crypto = require('crypto').webcrypto; }
    [
        roots.secretRegistry, roots.encryptionManager, roots.secretManager, roots.typedManagers, roots.rotationHealth,
        roots.vaultEngine, roots.founderStory, roots.knowledgeRegistry, roots.publicKnowledgeSource, roots.memoryEngine,
        roots.identityFaqRouter, roots.semanticIntentEngine,
        roots.templates, roots.realizeSeam, roots.languageRegistry,
        roots.cozyAi,
        roots.planPlanContract, roots.evidenceContract, roots.realizationRequestContract, roots.candidateContract, roots.validationResultContract, roots.cognitiveDecisionContract,
        roots.evidenceAdapter, roots.knowledgeAdapter, roots.memoryAdapter,
        roots.planner, roots.realizer, roots.validator, roots.repairLoop,
        roots.answerEngine,
    ].forEach((p) => require(p));
    return { window: fakeWindow, answerEngine: fakeWindow.CozyOS.CozyAnswerEngine, planner: fakeWindow.CozyOS.SemanticAnswerPlanner };
}

/* ------------------------------------------------------------------ */
/* A: the exact reproduced defect — now repaired                       */
/* ------------------------------------------------------------------ */

test('A: a stale cognitiveResult inherited from the PREVIOUS turn\'s conversationState (real resolveContextualEntity() fallback, entity=ChurchOS) is discarded when the CURRENT turn\'s real entityHint names a different application (MpesaOS) — the answer is about MpesaOS, not ChurchOS', async () => {
    const { answerEngine, planner } = loadFullStack();
    // Faithful to the real SA-3B bridge call shape: CURRENT turn's own
    // text, OLD conversationState (as it existed before this turn's
    // update), NO entityHint — semantic-answer-interpretation-provider.js
    // line 174, confirmed by direct reading.
    const bridgeComputedCognitiveResult = planner.planAnswer({
        text: 'What does MpesaOS do?',
        actorId: 'wave7a-actor-a',
        conversationState: { lastIntent: null, lastApplication: 'ChurchOS', lastDiscussedApplication: 'ChurchOS', lastLanguage: 'en' },
    });
    // Confirms the real, pre-existing SA-3 inheritance fallback actually
    // fires here (this is the defect's real cause, not a synthetic stand-in).
    assert.equal(bridgeComputedCognitiveResult.success, true);
    assert.equal(bridgeComputedCognitiveResult.plan.entity.value, 'ChurchOS');

    const result = await answerEngine.answer('What does MpesaOS do?', {
        actorId: 'wave7a-actor-a', entityHint: 'MpesaOS', language: 'en', cognitiveResult: bridgeComputedCognitiveResult,
    });
    assert.match(result.answer, /^Here's what MpesaOS can currently do:/);
    assert.doesNotMatch(result.answer, /ChurchOS|setupChurch/);
    assert.ok(result.sources.every((s) => !s.key || s.key.includes('mpesaos')));
});

/* ------------------------------------------------------------------ */
/* B: the perf optimization is preserved when the cache is correct     */
/* ------------------------------------------------------------------ */

test('B: when cognitiveResult\'s own entity AGREES with entityHint, it is still reused (no redundant fresh planAnswer() call) — the Wave 1 optimization is not regressed', async () => {
    const { window: win, answerEngine, planner } = loadFullStack();
    const cached = planner.planAnswer({ text: 'What does ChurchOS do?', actorId: 'wave7a-actor-b' });
    assert.equal(cached.plan.entity.value, 'ChurchOS');

    let freshCallCount = 0;
    const realPlanAnswer = planner.planAnswer;
    win.CozyOS.SemanticAnswerPlanner = Object.assign({}, planner, {
        planAnswer: (...args) => { freshCallCount += 1; return realPlanAnswer(...args); },
    });

    const result = await answerEngine.answer('What does ChurchOS do?', {
        actorId: 'wave7a-actor-b', entityHint: 'ChurchOS', language: 'en', cognitiveResult: cached,
    });
    assert.match(result.answer, /^Here's what ChurchOS can currently do:/);
    assert.equal(freshCallCount, 0, 'expected the cached cognitiveResult to be reused, not recomputed, when its entity matches entityHint');
});

/* ------------------------------------------------------------------ */
/* C: no entityHint supplied — every pre-Wave-7a caller is unaffected  */
/* ------------------------------------------------------------------ */

test('C: with NO entityHint supplied at all, a cached cognitiveResult is still reused unconditionally — byte-identical to pre-Wave-7a behavior for every caller that never passes entityHint', async () => {
    const { window: win, answerEngine, planner } = loadFullStack();
    const cached = planner.planAnswer({ text: 'What does ChurchOS do?', actorId: 'wave7a-actor-c' });

    let freshCallCount = 0;
    const realPlanAnswer = planner.planAnswer;
    win.CozyOS.SemanticAnswerPlanner = Object.assign({}, planner, {
        planAnswer: (...args) => { freshCallCount += 1; return realPlanAnswer(...args); },
    });

    const result = await answerEngine.answer('What does ChurchOS do?', {
        actorId: 'wave7a-actor-c', language: 'en', cognitiveResult: cached,
    });
    assert.match(result.answer, /^Here's what ChurchOS can currently do:/);
    assert.equal(freshCallCount, 0, 'expected the cached cognitiveResult to be reused unconditionally when no entityHint is supplied');
});

/* ------------------------------------------------------------------ */
/* D: a CLARIFICATION/no-entity cached plan never blocks a real,       */
/*    entity-hinted current-turn answer                                */
/* ------------------------------------------------------------------ */

test('D: a cached CLARIFICATION plan (entity "unresolved") never overrides a real, current-turn entityHint — falls through to a correct fresh answer', async () => {
    const { answerEngine, planner } = loadFullStack();
    const clarification = planner.planAnswer({ text: 'huh?', actorId: 'wave7a-actor-d' });
    assert.equal(clarification.plan.entity.value, 'unresolved');

    const result = await answerEngine.answer('What does QuarryOS do?', {
        actorId: 'wave7a-actor-d', entityHint: 'QuarryOS', language: 'en', cognitiveResult: clarification,
    });
    assert.match(result.answer, /^Here's what QuarryOS can currently do:/);
});
