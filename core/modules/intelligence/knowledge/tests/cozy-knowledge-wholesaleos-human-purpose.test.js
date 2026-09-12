'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-wholesaleos-human-purpose.test.js
 *
 * WholesaleOS human-purpose dependency - real regression coverage.
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

function freshFullStack() {
    const files = [KNOWLEDGE_REGISTRY_PATH, LANGUAGE_REGISTRY_PATH, LANGUAGE_TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, PROVIDER_PATH];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = {
        CozyOS: {
            LivingAI: makeFakeLivingAI(),
            CognitiveCoordinator: makeFakeCoordinator(),
            ProviderManager: makeFakeProviderManager(),
            listApplications: () => [],
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return {
        window: fakeWindow,
        provider: fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational'),
    };
}

test('1. WholesaleOS purpose fact is returned correctly (VERIFIED, real content)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('WholesaleOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /ShopOS's own product catalog/);
});

test('2. Real-life problems are returned correctly', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('wholesaleos');
    assert.ok(fact.purpose.realLifeProblems.length > 0);
});

test('3. Beneficiaries are returned correctly', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('WholesaleOS');
    assert.ok(fact.purpose.whoBenefits.includes('wholesale buyers'));
});

test('4. Human benefits are returned correctly', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('WholesaleOS');
    assert.ok(fact.purpose.humanBenefits.length > 0);
});

test('5. VERIFIED capabilities correctly reflect the genuinely small Phase 1 scope', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('WholesaleOS');
    const current = fact.purpose.currentVerifiedCapabilities.join(' ');
    assert.match(current, /getSharedCatalog/);
    assert.match(current, /getProductForWholesale/);
    assert.doesNotMatch(current, /ordering|inventory management|payment processing|supplier|invoicing|delivery/i);
});

test('6. VISION capabilities match the roadmap named directly in wholesaleOS-core.js\'s own header - no invented items', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('WholesaleOS');
    const vision = fact.purpose.visionCapabilities;
    assert.ok(vision.includes('wholesaler directory'));
    assert.ok(vision.includes('debt reminders'));
    assert.ok(vision.includes('goals'));
    const visionText = vision.join(' ');
    assert.doesNotMatch(visionText, /payment processing|supplier management|bulk purchasing|invoicing|delivery\/logistics/i);
});

test('7. VERIFIED/VISION separation holds in the conversational reply, CURRENT before VISION', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is WholesaleOS important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /WholesaleOS matters because/);
    const verifiedIdx = result.result.text.indexOf('CURRENTLY VERIFIED');
    const visionIdx = result.result.text.indexOf('VISION / DESTINATION');
    assert.ok(verifiedIdx !== -1 && visionIdx !== -1 && verifiedIdx < visionIdx);
});

test('8. Unknown application behavior remains honest', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('SomeUnregisteredApp');
    assert.equal(fact.evidence, 'NOT_FOUND');
});

test('9. Existing ChurchOS knowledge remains intact', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    assert.equal(fact.evidence, 'VERIFIED');
});

test('10. Existing QuarryOS knowledge remains intact', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /quarry\/mining business/);
});

test('11. Existing MpesaOS knowledge remains intact', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('MpesaOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /mobile-money transactions/);
});

test('12. Existing ShopOS knowledge remains intact', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ShopOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /branches and its products/);
});

test('13. No authorization/security side effect - no credential/secret field is ever exposed', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('WholesaleOS');
    const serialized = JSON.stringify(fact).toLowerCase();
    assert.ok(!/password|api[_-]?key|secret|token|credential/.test(serialized));
});

test('REGRESSION: existing app-info and translate-request intents remain unaffected', async () => {
    const { provider } = freshFullStack();
    const info = await provider.think('What is ChurchOS?');
    const translate = await provider.think('Translate hello to French.');
    assert.equal(info.result.intent, 'app-info');
    assert.equal(translate.result.intent, 'translate-request');
});
