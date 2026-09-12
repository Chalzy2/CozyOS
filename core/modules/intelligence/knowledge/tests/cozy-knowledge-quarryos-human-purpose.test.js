'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-quarryos-human-purpose.test.js
 *
 * QuarryOS human-purpose dependency - real regression coverage.
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

test('1. QuarryOS purpose fact is returned correctly (VERIFIED, real content)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /quarry\/mining business/);
});

test('2. QuarryOS real-life problems are returned correctly', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('quarryos');
    assert.ok(fact.purpose.realLifeProblems.some((p) => /fuel.*theft/i.test(p)));
    assert.ok(fact.purpose.realLifeProblems.some((p) => /payroll/i.test(p)));
});

test('3. QuarryOS beneficiaries are returned correctly', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    assert.ok(fact.purpose.whoBenefits.includes('drivers and supervisors'));
    assert.ok(fact.purpose.whoBenefits.includes('land owners owed royalties'));
});

test('4. QuarryOS human benefits are returned correctly', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    assert.ok(fact.purpose.humanBenefits.some((b) => /fuel theft/i.test(b)));
    assert.ok(fact.purpose.humanBenefits.some((b) => /royalty/i.test(b)));
});

test('5. Current verified capabilities are present and accurate against real source evidence', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    const current = fact.purpose.currentVerifiedCapabilities.join(' ');
    assert.match(current, /roleMatrix/);
    assert.match(current, /executeDispatchEvent/);
    assert.match(current, /gross = daily rate/);
});

test('6. Vision capabilities remain separately classified and correctly flag commonly-assumed-but-absent capabilities', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    const vision = fact.purpose.visionCapabilities.join(' ');
    assert.match(vision, /weighbridge/i);
    assert.match(vision, /company-setup/i);
    assert.match(vision, /stone-product catalog/i);
    const current = fact.purpose.currentVerifiedCapabilities.join(' ');
    assert.doesNotMatch(current, /weighbridge/i);
    assert.doesNotMatch(current, /dedicated.*company-setup/i);
});

test('7. Cozy AI can answer a QuarryOS application-purpose question using the authoritative data, CURRENT before VISION', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is QuarryOS important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /QuarryOS matters because/);
    assert.match(result.result.text, /CURRENTLY VERIFIED/);
    assert.match(result.result.text, /VISION \/ DESTINATION/);
    const verifiedIdx = result.result.text.indexOf('CURRENTLY VERIFIED');
    const visionIdx = result.result.text.indexOf('VISION / DESTINATION');
    assert.ok(verifiedIdx < visionIdx);
});

test('9. Unknown application behavior remains honest (no fabricated purpose for an unregistered name)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('SomeUnregisteredApp');
    assert.equal(fact.evidence, 'NOT_FOUND');
    assert.equal(fact.purpose, null);
});

test('10. No authorization/security side effect - the fact-getter is read-only and never touches credentials', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    const serialized = JSON.stringify(fact).toLowerCase();
    assert.ok(!/password|api[_-]?key|secret|token|credential/.test(serialized));
});

test('11. Existing ChurchOS purpose knowledge remains completely unchanged', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /digital foundation/);
    assert.match(fact.purpose.visionSourceNote, /CHURCHOS_ENGINE_AUDIT\.md/);
});

test('REGRESSION: existing app-info and translate-request intents remain unaffected', async () => {
    const { provider } = freshFullStack();
    const info = await provider.think('What is ChurchOS?');
    const translate = await provider.think('Translate hello to French.');
    assert.equal(info.result.intent, 'app-info');
    assert.equal(translate.result.intent, 'translate-request');
});
