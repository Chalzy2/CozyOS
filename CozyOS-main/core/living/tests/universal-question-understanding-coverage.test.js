/**
 * core/living/tests/universal-question-understanding-coverage.test.js
 * CozyOS — Universal User Question Understanding & Answer Coverage
 *
 * Reproduces and fixes the exact live-conversation failures from the
 * reported screenshot, plus broader English + Kiswahili coverage per
 * the same shared APP_IMPORTANCE_PATTERN / app-info / app-capability-
 * search / list-apps infrastructure - no new engine, no per-phrase
 * hardcoded answers.
 *
 * Run with: node --test core/living/tests/universal-question-understanding-coverage.test.js
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

const ALL_PATHS = [DEV_PROFILE_PATH, PROJECT_HISTORY_PATH, AFRICAN_KNOWLEDGE_PATH, IDENTITY_ASSEMBLY_PATH, REGISTRY_PATH, TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH, FAQ_ROUTER_PATH, PROVIDER_PATH];

function freshProvider() {
    ALL_PATHS.forEach((p) => { try { delete require.cache[require.resolve(p)]; } catch (_e) { /* not loaded */ } });
    const registered = new Map();
    global.window = { CozyOS: { LivingAI: { registerProvider(name, p) { registered.set(name, p); }, setActiveProvider() {} } } };
    for (const p of ALL_PATHS) require(p);
    return registered.get('rule-based-conversational');
}

// ---- Section: exact screenshot reproduction (with real fixes) ----

const SCREENSHOT_CASES = [
    'I want to knowore about Cozyos',           // real typo, live-observed
    'I want to know more about cozyos',
    "What's cozyos for?",
    'Why is cozyos not other applications',
    'What are the application helping us with in real life',
    'ShopOS helps in inwhich way ?',
    'ChurchOs help church with what ?',
];

for (const phrase of SCREENSHOT_CASES) {
    test(`SCREENSHOT FIX: "${phrase}" no longer falls into the generic honest-failure fallback`, async () => {
        const provider = freshProvider();
        const r = await provider.think(phrase, {});
        assert.notEqual(r.result.intent, 'unsupported', `"${phrase}" must resolve to a real intent`);
        assert.doesNotMatch(r.result.text, /I don't have a rule-based answer/i);
        assert.doesNotMatch(r.result.text, /I don't have verified information to answer that yet/i);
    });
}

test('"ChurchOs help church with what?" resolves to app-importance (ChurchOS human-purpose), not the generic "help" capabilities list', async () => {
    const provider = freshProvider();
    const r = await provider.think('ChurchOs help church with what ?', {});
    assert.equal(r.result.intent, 'app-importance');
    assert.match(r.result.text, /ChurchOs|ChurchOS/);
});

test('"What are the application helping us with in real life" resolves to list-apps (with real per-app purpose), not a bare capabilities list', async () => {
    const provider = freshProvider();
    const r = await provider.think('What are the application helping us with in real life', {});
    assert.equal(r.result.intent, 'list-apps');
});

// ---- Section: broader English identity/purpose variants ----

const IDENTITY_VARIANTS = [
    'I want to know more about CozyOS',
    'I want to know about CozyOS',
    'Can you explain CozyOS?',
    'Naomba unieleze CozyOS.',
    'Nataka kujua zaidi kuhusu CozyOS.',
];

for (const phrase of IDENTITY_VARIANTS) {
    test(`IDENTITY VARIANT: "${phrase}" resolves to real CozyOS identity knowledge`, async () => {
        const provider = freshProvider();
        const r = await provider.think(phrase, {});
        assert.notEqual(r.result.intent, 'unsupported');
        assert.match(r.result.text, /CozyOS/i);
    });
}

// ---- Section: application purpose, English + Kiswahili ----

const APP_PURPOSE_VARIANTS = [
    'ShopOS ni ya nini?',
    'ShopOS inafanya nini?',
    'ShopOS inanisaidiaje?',
    'ShopOS inasaidia biashara vipi?',
    'ShopOS inatatua tatizo gani?',
    'Nani anaweza kutumia ShopOS?',
];

for (const phrase of APP_PURPOSE_VARIANTS) {
    test(`APP PURPOSE (Kiswahili): "${phrase}" resolves to real ShopOS knowledge`, async () => {
        const provider = freshProvider();
        const r = await provider.think(phrase, {});
        assert.notEqual(r.result.intent, 'unsupported');
        assert.match(r.result.text, /ShopOS/i);
    });
}

// ---- Section: Kiswahili application capability search ----

test('"Ni application gani inaweza kusaidia kanisa?" finds ChurchOS via the real Kiswahili-aware capability search', async () => {
    const { CozyKnowledge } = { CozyKnowledge: null }; // placeholder to keep lint calm; not used directly
    const provider = freshProvider();
    const r = await provider.think('Ni application gani inaweza kusaidia kanisa?', {});
    assert.equal(r.result.intent, 'app-capability-search');
    assert.match(r.result.text, /churchos/i);
});

test('"Ni application gani inaweza kunisaidia na malipo?" finds a real payment-related application', async () => {
    const provider = freshProvider();
    const r = await provider.think('Ni application gani inaweza kunisaidia na malipo?', {});
    assert.equal(r.result.intent, 'app-capability-search');
    assert.doesNotMatch(r.result.text, /sikuweza kupata/i);
});

test('searchApplicationsByCapability() matches a Kiswahili query word against real Kiswahili-language verified data (not just English)', () => {
    delete require.cache[require.resolve(KNOWLEDGE_REGISTRY_PATH)];
    global.window = { CozyOS: {} };
    require(KNOWLEDGE_REGISTRY_PATH);
    const result = global.window.CozyOS.CozyKnowledge.searchApplicationsByCapability('kanisa', 'sw');
    assert.equal(result.evidence, 'VERIFIED');
    assert.ok(result.matches.some((m) => m.application === 'churchos'));
});

// ---- Section: cross-application English discovery (regression from prior pass) ----

test('REGRESSION: "Which CozyOS application can help me sell products?" still resolves correctly', async () => {
    const provider = freshProvider();
    const r = await provider.think('Which CozyOS application can help me sell products?', {});
    assert.equal(r.result.intent, 'app-capability-search');
});

// ---- Section: follow-up context still works ----

test('REGRESSION: contextual follow-up ("Why is it useful?" after a ChurchOS question) still resolves via context', async () => {
    const provider = freshProvider();
    const t1 = await provider.think('What is ChurchOS?', {});
    const t2 = await provider.think('Why is it useful?', { conversationState: t1.result.conversationState });
    assert.notEqual(t2.result.intent, 'unsupported');
});

console.log('Universal Question Understanding & Answer Coverage suite: run complete.');
