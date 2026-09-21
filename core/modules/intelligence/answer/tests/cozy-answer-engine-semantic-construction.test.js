'use strict';

/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-semantic-construction.test.js
 * SA-7 — Live Window Integration. Real, end-to-end proof that
 * CozyAnswerEngine.answer() now actually composes the full Cozy
 * Construction Sentence pipeline (SemanticIntentEngine -> SA-3 planner
 * -> SA-4 realizer -> SA-5 validator -> SA-6 repair loop) for
 * application-level questions with real, committed per-language
 * evidence — directly constructing the Kiswahili answer from real
 * Kiswahili evidence, never English-generated-then-translated.
 *
 * Loads the REAL, full CozyKnowledge chain (same roots as
 * core/modules/intelligence/tests/cozy-ai-context.test.js's own
 * loadFullStack(), which already proves this exact chain loads
 * correctly) plus the real SemanticIntentEngine and the full SA-1..SA-6
 * chain — no stubs for any of the construction pipeline itself.
 *
 * Run with: node --test core/modules/intelligence/answer/tests/cozy-answer-engine-semantic-construction.test.js
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
function makeFakeServiceRegistry() {
    return { listApplications: () => [{ id: 'churchos', name: 'ChurchOS' }] };
}
function makeFakeProviderManager() { return { register() {}, healthReport: () => ({}) }; }

// __dirname is core/modules/intelligence/answer/tests/ — four levels
// below core/, two levels below core/modules/intelligence/.
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
    return { window: fakeWindow, answerEngine: fakeWindow.CozyOS.CozyAnswerEngine };
}

/* ------------------------------------------------------------------ */
/* A: real end-to-end direct Kiswahili construction for an application  */
/* ------------------------------------------------------------------ */

test('A: "ChurchOS inasaidiaje mtu?" is answered by the REAL, live-wired SA construction pipeline, directly in Kiswahili from real evidence', async () => {
    const { answerEngine } = loadFullStack();
    const result = await answerEngine.answer('ChurchOS inasaidiaje mtu?', { language: 'sw', entityHint: 'ChurchOS' });
    assert.equal(result.evidenceState, 'VERIFIED');
    assert.ok(result.sources.some((s) => s.authority === 'semantic-answer-construction'), `expected the semantic-answer-construction authority, got: ${JSON.stringify(result.sources)}`);
    // Real, committed Kiswahili humanBenefits content, directly
    // constructed — the real intro sentence plus real Kiswahili claim
    // text (the benefit sentences correctly name "kanisa"/church
    // generically, not the English brand string "ChurchOS", exactly as
    // the real, committed humanBenefitsSw content actually reads).
    assert.match(result.answer, /^Hivi ndivyo hii inavyosaidia:/);
    assert.match(result.answer, /kanisa/);
    assert.doesNotMatch(result.answer, /\bthe\b|\band\b|\bAdditionally\b/i); // no stray English connective words
});

/* ------------------------------------------------------------------ */
/* B: the same question in English still resolves, via the same pipeline */
/* ------------------------------------------------------------------ */

test('B: the same question in English resolves through the SAME real pipeline, in English', async () => {
    const { answerEngine } = loadFullStack();
    const result = await answerEngine.answer('How does ChurchOS help people?', { language: 'en', entityHint: 'ChurchOS' });
    assert.equal(result.evidenceState, 'VERIFIED');
    assert.ok(result.sources.some((s) => s.authority === 'semantic-answer-construction'));
});

/* ------------------------------------------------------------------ */
/* C: platform-identity questions are NOT hijacked by SA construction   */
/* ------------------------------------------------------------------ */

test('C: a platform-identity question ("CozyOS ni nini?") is still answered by the real, existing FAQ router — SA construction correctly declines (no APPLICATION_HUMAN_PURPOSE_DATA entry for the platform itself)', async () => {
    const { answerEngine } = loadFullStack();
    const result = await answerEngine.answer('CozyOS ni nini?', { language: 'sw' });
    assert.equal(result.evidenceState, 'VERIFIED');
    assert.ok(result.sources.some((s) => s.authority === 'identity-faq-router'), `expected identity-faq-router, got: ${JSON.stringify(result.sources)}`);
    assert.ok(!result.sources.some((s) => s.authority === 'semantic-answer-construction'));
});

/* ------------------------------------------------------------------ */
/* D: the answer text is a real, valid, contract-checked construction   */
/* ------------------------------------------------------------------ */

test('D: the real answer text is exactly the real, committed Kiswahili humanBenefits evidence — never fabricated, never English translated post-hoc', async () => {
    const { answerEngine, window: win } = loadFullStack();
    const knowledge = win.CozyOS.CozyKnowledge;
    const realFact = knowledge.getApplicationHumanPurposeFact('churchos', 'sw');
    assert.equal(realFact.evidence, 'VERIFIED');
    const result = await answerEngine.answer('ChurchOS inasaidiaje mtu?', { language: 'sw', entityHint: 'ChurchOS' });
    // Every real humanBenefitsSw item used must appear verbatim in the answer.
    for (const benefit of realFact.purpose.humanBenefits) {
        assert.match(result.answer, new RegExp(benefit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `expected the real evidence sentence "${benefit}" to appear verbatim`);
    }
});
