'use strict';

/**
 * core/modules/intelligence/answer/tests/cozy-answer-engine-exception-nonleakage.test.js
 *
 * WAVE 6 — "exception/error scenarios" verification requirement.
 *
 * Fault-injects a real internal exception (a distinctive, secret-shaped
 * error message) directly into the evidence adapter SA-3's planner
 * actually calls (window.CozyOS.VerifiedEvidenceAdapter), then proves
 * two things about the REAL, full, unmodified answer() chain:
 *
 *   1. The distinctive internal error text never appears ANYWHERE in
 *      the returned result (answer text, cognitiveContext, sources) —
 *      not just "the visible chat text," the ENTIRE structured return
 *      value a caller could read.
 *   2. This is not because the whole request silently fails — it is
 *      because cozy-answer-engine.js's tryConstructSemanticAnswer()
 *      catches the exception, discards it, and returns null, so
 *      answer() gracefully falls through to the OLDER, separately-
 *      verified CozyIdentityFAQRouter/CozyAI.getContext() answer chain
 *      instead — a real, working, evidence-backed answer is still
 *      produced, not a hard failure and not a leak.
 *
 * Uses the same loadFullStack() composition as
 * cozy-answer-engine-semantic-construction.test.js.
 *
 * Run with: node --test core/modules/intelligence/answer/tests/cozy-answer-engine-exception-nonleakage.test.js
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
    return { window: fakeWindow, answerEngine: fakeWindow.CozyOS.CozyAnswerEngine };
}

test('A: a real internal exception thrown inside the evidence adapter SA-3 actually calls never leaks its message anywhere in answer()\'s full return value — the SA construction pipeline fails closed and the engine falls through to the older, separately-verified answer chain instead', async () => {
    const { window: win, answerEngine } = loadFullStack();
    const SECRET_MARKER = 'INTERNAL_STACK_TRACE_/etc/secrets/db-password.txt_LEAKED';
    const realAdapter = win.CozyOS.VerifiedEvidenceAdapter;
    win.CozyOS.VerifiedEvidenceAdapter = Object.assign({}, realAdapter, {
        collectApplicationHumanPurposeEvidence: () => { throw new Error(SECRET_MARKER); },
    });

    const result = await answerEngine.answer('What does ChurchOS do?', { entityHint: 'ChurchOS', language: 'en' });

    assert.ok(result, 'expected answer() to still return a real result, not throw or return nothing');
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(SECRET_MARKER), `expected the injected internal error message to never appear anywhere in the result, got: ${serialized}`);
    // Graceful degradation, not a silent failure: a real, working,
    // evidence-backed answer still comes back from the older chain.
    assert.equal(result.evidenceState, 'VERIFIED');
    assert.match(result.answer, /ChurchOS/i);
});

test('B: the SAME fault injection, in Kiswahili, is equally non-leaking and equally gracefully degraded', async () => {
    const { window: win, answerEngine } = loadFullStack();
    const SECRET_MARKER_SW = 'HITILAFU_YA_NDANI_/etc/secrets/nywila.txt';
    const realAdapter = win.CozyOS.VerifiedEvidenceAdapter;
    win.CozyOS.VerifiedEvidenceAdapter = Object.assign({}, realAdapter, {
        collectApplicationHumanPurposeEvidence: () => { throw new Error(SECRET_MARKER_SW); },
    });

    const result = await answerEngine.answer('ChurchOS inafanya nini?', { entityHint: 'ChurchOS', language: 'sw' });

    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(SECRET_MARKER_SW), `expected no leak, got: ${serialized}`);
    assert.equal(result.evidenceState, 'VERIFIED');
});
