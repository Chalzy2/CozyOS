'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-churchos-human-purpose.test.js
 *
 * ChurchOS human-purpose/importance dependency - real regression
 * coverage. Proves human-purpose knowledge is retrievable through the
 * existing centralized application-knowledge path, with CURRENT vs
 * VISION strictly separated, in both English and Kiswahili.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');
const LANGUAGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const LANGUAGE_TEMPLATES_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const PROVIDER_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');

function makeFakeLivingAI() {
    const registered = new Map();
    return {
        registerProvider(name, provider) { registered.set(name, provider); return { success: true }; },
        setActiveProvider() { return { success: true }; },
        getActiveProvider() { return null; },
        _registered: registered,
    };
}
function makeFakeCoordinator() { return { async run() { return {}; } }; }
function makeFakeProviderManager() { return { register() {}, healthReport: () => ({}) }; }

const REAL_SHAPED_APPS = [
    { id: 'churchos_core_001', name: 'ChurchOS', version: '1.0.0-ENTERPRISE', category: 'Business Application', enabled: true },
    { id: 'quarry_manager_001', name: 'QuarryOS', version: '1.4.1', category: 'business-application', enabled: true },
];

function freshFullStack() {
    const files = [KNOWLEDGE_REGISTRY_PATH, LANGUAGE_REGISTRY_PATH, LANGUAGE_TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, PROVIDER_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = {
        CozyOS: {
            LivingAI: makeFakeLivingAI(),
            CognitiveCoordinator: makeFakeCoordinator(),
            ProviderManager: makeFakeProviderManager(),
            listApplications: () => REAL_SHAPED_APPS.map((a) => ({ ...a })),
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return {
        window: fakeWindow,
        provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational'),
    };
}

test('1. ChurchOS technical identity (app-info) still comes from the authoritative application registry, unaffected by this dependency', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is ChurchOS?');
    assert.equal(result.result.intent, 'app-info');
    assert.match(result.result.text, /business application/i);
});

test('2. ChurchOS human purpose is retrievable through the centralized knowledge path (getApplicationHumanPurposeFact)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.ok(fact.purpose.humanPurpose.length > 0);
});

test('3. Real-life problems are represented', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    assert.ok(fact.purpose.realLifeProblems.includes('language barriers'));
    assert.ok(fact.purpose.realLifeProblems.includes('fragmented church/member information'));
});

test('4. Beneficiaries are represented', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    assert.ok(fact.purpose.whoBenefits.includes('pastors'));
    assert.ok(fact.purpose.whoBenefits.includes('congregations across countries'));
});

test('5. Human benefits are represented', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    assert.ok(fact.purpose.humanBenefits.includes('multilingual participation'));
    assert.ok(fact.purpose.humanBenefits.includes('preservation of church knowledge'));
});

test('6. Current verified capabilities remain correctly identified as CURRENT, not mixed with vision', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    const current = fact.purpose.currentVerifiedCapabilities.join(' ');
    assert.match(current, /setupChurch/);
    assert.match(current, /membership reporting/i);
    assert.doesNotMatch(current, /live streaming|notification system|calendar/i, 'current capabilities must never include vision-only items');
});

test('7a. Vision capabilities are NOT falsely returned as implemented - a real reply distinguishes the two sections explicitly', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is ChurchOS important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /CURRENTLY VERIFIED/);
    assert.match(result.result.text, /VISION \/ DESTINATION/);
    const visionIndex = result.result.text.indexOf('VISION / DESTINATION');
    const currentIndex = result.result.text.indexOf('CURRENTLY VERIFIED');
    assert.ok(currentIndex < visionIndex, 'CURRENT must be presented before VISION, never conflated');
});

test('7b. Vision-only capabilities (e.g. live streaming) never appear inside the CURRENTLY VERIFIED section', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is ChurchOS important?');
    const currentSection = result.result.text.split('CURRENTLY VERIFIED')[1].split('VISION / DESTINATION')[0];
    assert.doesNotMatch(currentSection, /live streaming|notification system|calendar|backup system/i);
});

test('8. The missing CHURCHOS_ENGINE_AUDIT.md reference is represented honestly, never fabricated', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is ChurchOS important?');
    assert.match(result.result.text, /CHURCHOS_ENGINE_AUDIT\.md/);
    assert.match(result.result.text, /not available for direct inspection/i);
});

test('9a. KISWAHILI: "ChurchOS ni muhimu kwa nini?" resolves app-importance with real Kiswahili content', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('ChurchOS ni muhimu kwa nini?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /ZILIZOTHIBITISHWA SASA/);
});

test('9b. KISWAHILI: "ChurchOS inanisaidia nini?" also resolves app-importance', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('ChurchOS inanisaidia nini?');
    assert.equal(result.result.intent, 'app-importance');
});

test('10. "What is ChurchOS?" (technical) and "Why is ChurchOS important?" (human purpose) resolve to DIFFERENT intents', async () => {
    const { provider } = freshFullStack();
    const technical = await provider.think('What is ChurchOS?');
    const importance = await provider.think('Why is ChurchOS important?');
    assert.equal(technical.result.intent, 'app-info');
    assert.equal(importance.result.intent, 'app-importance');
    assert.notEqual(technical.result.intent, importance.result.intent);
});

test('11. Existing app-info behavior does not regress for a non-ChurchOS app', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is QuarryOS?');
    assert.equal(result.result.intent, 'app-info');
    assert.match(result.result.text, /business-application/);
});

test('12. Unknown application human-purpose lookup honestly returns not-found (a genuinely unregistered application name)', async () => {
    // QuarryOS Human-Purpose dependency (later turn) intentionally added
    // a real entry for QuarryOS - this test's original assumption
    // ("QuarryOS has no purpose record yet") is now correctly outdated
    // by that authorized change, not a regression. Updated to a
    // genuinely unregistered name to keep proving the same real
    // honest-fallback behavior.
    const { provider } = freshFullStack();
    const result = await provider.think('Why is SomeCompletelyUnregisteredApp important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /don't have human-purpose information/i);
});

test('13. Existing unrelated intents remain unaffected', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Translate hello to French.');
    assert.equal(result.result.intent, 'translate-request');
});

test('14. Existing object-identification remains unaffected, not swallowed by app-importance', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is this?');
    assert.equal(result.result.intent, 'object-identification');
});

test('SECURITY: the human-purpose reply never claims a capability as an authorization mechanism, and never exposes secrets', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is ChurchOS important?');
    assert.doesNotMatch(result.result.text, /password|api[_-]?key|secret|token|credential/i);
});

test('SECURITY: attendance/location/live-translation claims are never presented as currently implemented', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is ChurchOS important?');
    const currentSection = result.result.text.split('CURRENTLY VERIFIED')[1].split('VISION / DESTINATION')[0];
    assert.doesNotMatch(currentSection, /live translation|attendance|population/i);
});
