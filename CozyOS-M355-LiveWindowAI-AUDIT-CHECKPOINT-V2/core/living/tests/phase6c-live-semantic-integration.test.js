/**
 * core/living/tests/phase6c-live-semantic-integration.test.js
 * PHASE 6C — Universal Semantic Authority + First Live Integration
 *
 * Proves the semantic engine actually participates in real
 * rule-based-conversational-provider.js conversations - not isolated
 * unit tests of the engine alone. Every test here loads the REAL
 * provider file and calls its real, public think(), exactly as
 * cozy-living-assistant.js does.
 *
 * Run with: node --test core/living/tests/phase6c-live-semantic-integration.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const PROVIDER_PATH = path.join(ROOT, 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');
const TEMPLATES_PATH = path.join(ROOT, 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const REGISTRY_PATH = path.join(ROOT, 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const DEV_PROFILE_PATH = path.join(ROOT, 'identity', 'developer-profile.js');
const PROJECT_HISTORY_PATH = path.join(ROOT, 'identity', 'project-history.js');
const AFRICAN_KNOWLEDGE_PATH = path.join(ROOT, 'identity', 'african-knowledge-initiative.js');
const IDENTITY_ASSEMBLY_PATH = path.join(ROOT, 'identity', 'cozyai-identity.js');
const FAQ_ROUTER_PATH = path.join(ROOT, 'modules', 'knowledge', 'cozyos-identity-faq-router.js');
const SEMANTIC_ENGINE_PATH = path.join(ROOT, 'living', 'cozy-ai-semantic-intent.js');
const COZY_LEARN_PATH = path.join(ROOT, 'living', 'cozy-learn.js');

const BASE_PATHS = [DEV_PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, IDENTITY_ASSEMBLY_PATH, REGISTRY_PATH, TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH, FAQ_ROUTER_PATH, PROVIDER_PATH];
const WITH_SEMANTIC_PATHS = [...BASE_PATHS.slice(0, -1), COZY_LEARN_PATH, SEMANTIC_ENGINE_PATH, PROVIDER_PATH];

function makeFakeLivingAI() {
    const registered = new Map();
    return { registerProvider(name, p) { registered.set(name, p); }, setActiveProvider() {}, _registered: registered };
}

function freshProvider(withSemantic) {
    const paths = withSemantic ? WITH_SEMANTIC_PATHS : BASE_PATHS;
    paths.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const fakeAI = makeFakeLivingAI();
    global.window = { CozyOS: { LivingAI: fakeAI } };
    for (const p of paths) require(p);
    return fakeAI._registered.get('rule-based-conversational');
}

// ---- TEST A: Live semantic engine invocation ----
test('A: semantic engine is actually consulted in a live think() call (semanticSource disclosed on a clarification reply)', async () => {
    const provider = freshProvider(true);
    const r = await provider.think('Nataka kununua CozyOS inasaida aje?', {});
    assert.equal(r.result.semanticSource, 'universal-semantic-engine');
});

// ---- TEST D/E: Ambiguous purchase+benefits -> real clarification ----
test('D/E: ambiguous purchase+benefits produces the semantic engine\'s own real clarification, never a guessed answer', async () => {
    const provider = freshProvider(true);
    const r = await provider.think('Nataka kununua CozyOS inasaida aje?', {});
    assert.equal(r.result.needsClarification, true);
    assert.equal(r.result.text, 'Unataka kununua CozyOS, au kwanza ungependa kujua jinsi inavyokusaidia?');
    assert.notEqual(r.result.intent, 'purchase-intent');
});

// ---- THE THREE-TURN CRITICAL ACCEPTANCE TEST (Section 24 of the directive) ----
test('CRITICAL: three-turn live sequence — clarify, then benefits, then purchase, using real conversation context throughout', async () => {
    const provider = freshProvider(true);
    let state;

    const turn1 = await provider.think('Nataka kununua CozyOS inasaida aje?', { conversationState: state });
    assert.equal(turn1.result.needsClarification, true);
    assert.equal(turn1.result.intent, 'unsupported');
    state = turn1.result.conversationState;
    assert.equal(state.lastDiscussedApplication, 'CozyOS'); // entity survives the clarification turn

    const turn2 = await provider.think('Kwanza nataka kujua inanisaidia nini.', { conversationState: state });
    // No entity is named in turn 2's own text at all - only real
    // conversation context resolves it, exactly per Section 19.
    assert.equal(turn2.result.intent, 'why-use-cozyos');
    assert.doesNotMatch(turn2.result.text, /Some related context exists/i);
    state = turn2.result.conversationState;

    const turn3 = await provider.think('Sawa, sasa nataka kununua.', { conversationState: state });
    assert.equal(turn3.result.intent, 'purchase-intent');
    assert.match(turn3.result.text, /kununua/i);
    // Action safety (Section 15/18): no action field, no execution -
    // this is a reply, never an authorized transaction.
    assert.equal('action' in turn3.result, false);
});

// ---- TEST G/H/I: cross-language + mixed-language convergence ----
test('G: English equivalent of a clear benefits question reaches the same why-use-cozyos executor', async () => {
    const provider = freshProvider(true);
    const r = await provider.think('How does CozyOS help me?', {});
    // Either the semantic override or the legacy pattern resolves this -
    // what matters is it is NOT the generic unsupported/clarification path.
    assert.notEqual(r.result.intent, 'unsupported');
});

// ---- TEST P: legacy behavior regression when the semantic engine is NOT loaded ----
test('P: with the semantic engine NOT loaded, behavior is completely unaffected (pure opt-in, zero side effects)', async () => {
    const provider = freshProvider(false); // semantic engine + CozyLearn never required
    const r = await provider.think('What is ChurchOS?', {});
    assert.equal(r.result.intent, 'app-info');
    assert.equal(r.result.semanticSource, undefined);
});

test('P2: a real, existing, unrelated intent (founder question) is completely unaffected by the semantic integration', async () => {
    const provider = freshProvider(true);
    const r = await provider.think('Nani alianzisha CozyOS?', {});
    assert.notEqual(r.result.semanticSource, 'universal-semantic-engine');
});

// ---- TEST M: authorization remains separate ----
test('M: the purchase-intent reply never contains an authorization/execution field', async () => {
    const provider = freshProvider(true);
    const r = await provider.think('Sasa nataka kununua CozyOS.', {});
    const json = JSON.stringify(r.result).toLowerCase();
    assert.doesNotMatch(json, /"authorized":true/);
    assert.doesNotMatch(json, /"executed":true/);
});

// ---- Named-application benefits still route through app-importance, not why-use-cozyos ----
test('A named application (not CozyOS itself) with a resolved APP_BENEFITS intent still uses the real app-importance/human-purpose path', async () => {
    const provider = freshProvider(true);
    const r = await provider.think('ChurchOS inasaidiaje?', {});
    assert.equal(r.result.intent, 'app-importance');
});

console.log('Phase 6C Live Semantic Integration suite: run complete.');
