'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-app-info.test.js
 *
 * Named-application question dependency - real regression coverage.
 * Proves the real intent -> real getApplicationFact() -> real
 * ServiceRegistry.listApplications() chain, in both English and
 * Kiswahili, using the actual production functions (not duplicated
 * logic).
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
    { id: 'quarry_manager_001', name: 'QuarryOS', version: '1.4.1', category: 'business-application', icon: 'quarry.svg', enabled: true, launcher: 'applications/QuarryOS/quarry.html', entryPoint: 'applications/QuarryOS/quarry.html', sourcePath: 'applications/QuarryOS/quarry.html', certificationStatus: 'NOT_CERTIFIED' },
    { id: 'shop_os_001', name: 'ShopOS', version: '1.0.0', category: 'business-application', icon: 'shop.svg', enabled: false, launcher: 'applications/ShopOS/shop.html', entryPoint: 'applications/ShopOS/shop.html', sourcePath: 'applications/ShopOS/shop.html', certificationStatus: 'NOT_CERTIFIED' },
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

test('Fact source: getApplicationFact() resolves against window.CozyOS.listApplications() (the real ServiceRegistry contract), not a second inventory', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationFact('QuarryOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.equal(fact.source, 'window.CozyOS.ServiceRegistry');
});

test('ENGLISH: "What is QuarryOS?" resolves app-info with real, VERIFIED registry data', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is QuarryOS?');
    assert.equal(result.result.intent, 'app-info');
    assert.match(result.result.text, /QuarryOS/);
    assert.match(result.result.text, /business-application/);
    assert.match(result.result.text, /enabled/);
});

test('ENGLISH: "What is ShopOS?" resolves with the real disabled status (not fabricated)', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is ShopOS?');
    assert.equal(result.result.intent, 'app-info');
    assert.match(result.result.text, /disabled/);
});

test('KISWAHILI: "QuarryOS ni nini?" resolves app-info with real registry data', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('QuarryOS ni nini?');
    assert.equal(result.result.intent, 'app-info');
    assert.match(result.result.text, /QuarryOS/);
    assert.match(result.result.text, /imewezeshwa/);
});

test('KISWAHILI: "ShopOS ni nini?" resolves the real disabled status in Kiswahili', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('ShopOS ni nini?');
    assert.equal(result.result.intent, 'app-info');
    assert.match(result.result.text, /haijawezeshwa/);
});

test('UNKNOWN (English): "What is FakeOS?" honestly returns not-found, never fabricates an application', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is FakeOS?');
    assert.equal(result.result.intent, 'app-info');
    assert.doesNotMatch(result.result.text, /registered CozyOS application/);
    assert.match(result.result.text, /don't have any registered application/i);
});

test('UNKNOWN (Kiswahili): "FakeOS ni nini?" honestly returns not-found in Kiswahili', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('FakeOS ni nini?');
    assert.equal(result.result.intent, 'app-info');
    assert.match(result.result.text, /Sina programu iliyosajiliwa/);
});

test('REGRESSION: existing "What is CozyOS?" behavior remains intact, unaffected by the new generalized app-info intent', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is CozyOS?');
    assert.equal(result.result.intent, 'what-is-cozyos');
});

test('REGRESSION: existing unrelated intent (translate-request) remains unaffected', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Translate hello to French.');
    assert.equal(result.result.intent, 'translate-request');
});

test('REGRESSION: existing object-identification ("What is this?") remains unaffected, not swallowed by app-info', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is this?');
    assert.equal(result.result.intent, 'object-identification');
});

test('Application resolution is based on the authoritative registry - a name change in the fake registry is reflected immediately (no cached/second inventory)', async () => {
    const { provider, window: win } = freshFullStack();
    win.CozyOS.listApplications = () => [{ id: 'x', name: 'BrandNewApp', category: 'test', enabled: true }];
    const result = await provider.think('What is BrandNewApp?');
    assert.equal(result.result.intent, 'app-info');
    assert.match(result.result.text, /BrandNewApp/);
});

test('SECURITY: the app-info reply never contains launcher/entryPoint/sourcePath internals or any credential-shaped field', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('What is QuarryOS?');
    assert.doesNotMatch(result.result.text, /quarry\.html|password|api[_-]?key|secret|token|credential/i);
});
