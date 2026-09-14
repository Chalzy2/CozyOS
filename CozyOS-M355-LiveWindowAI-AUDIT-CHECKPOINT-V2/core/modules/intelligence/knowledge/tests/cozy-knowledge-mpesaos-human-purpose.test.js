'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-mpesaos-human-purpose.test.js
 *
 * MpesaOS human-purpose dependency - real regression coverage, same
 * pattern as ChurchOS/QuarryOS. Proves the entry is real, correctly
 * separates VERIFIED from VISION (scanIntake() is a real function but
 * returns hardcoded values - confirmed by direct source inspection -
 * and must never be classified as a genuine identity-verification
 * capability), and does not regress any other application's entry.
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

test('1. MpesaOS has a valid purpose record (VERIFIED, real content)', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('MpesaOS');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /mobile-money transactions/);
});

test('2. Human-purpose information exists: real-life problems and beneficiaries are present', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('mpesaos');
    assert.ok(fact.purpose.realLifeProblems.length > 0);
    assert.ok(fact.purpose.whoBenefits.includes('their customers making mobile-money payments'));
});

test('3. VERIFIED capabilities are represented correctly, including the real tiered fee calculation', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('MpesaOS');
    const current = fact.purpose.currentVerifiedCapabilities.join(' ');
    assert.match(current, /calculateCharges/);
    assert.match(current, /SHA-256 audit hash/);
    assert.match(current, /Company\/Branch validation/);
});

test('4. VISION capabilities are represented separately', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('MpesaOS');
    assert.ok(fact.purpose.visionCapabilities.length > 0);
    assert.match(fact.purpose.visionCapabilities.join(' '), /KYC/);
});

test('5. No unsupported capability is accidentally classified as VERIFIED - scanIntake() is correctly excluded as real identity verification', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('MpesaOS');
    const current = fact.purpose.currentVerifiedCapabilities.join(' ');
    assert.doesNotMatch(current, /identity verification|KYC/i);
    const vision = fact.purpose.visionCapabilities.join(' ');
    assert.match(vision, /scanIntake\(\) currently returns hardcoded/);
});

test('6. Conversational knowledge can retrieve/explain the entry, CURRENT before VISION', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is MpesaOS important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /MpesaOS matters because/);
    assert.match(result.result.text, /CURRENTLY VERIFIED/);
    assert.match(result.result.text, /VISION \/ DESTINATION/);
});

test('7. CURRENT/VERIFIED appears before VISION in the conversational reply', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is MpesaOS important?');
    const verifiedIdx = result.result.text.indexOf('CURRENTLY VERIFIED');
    const visionIdx = result.result.text.indexOf('VISION / DESTINATION');
    assert.ok(verifiedIdx !== -1 && visionIdx !== -1 && verifiedIdx < visionIdx);
});

test('8. No duplicate knowledge source - ChurchOS and QuarryOS entries remain unaffected', () => {
    const { window: win } = freshFullStack();
    const church = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    const quarry = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('QuarryOS');
    assert.equal(church.evidence, 'VERIFIED');
    assert.equal(quarry.evidence, 'VERIFIED');
    assert.match(quarry.purpose.humanPurpose, /quarry\/mining business/);
});

test('9. Unknown application behavior remains honest', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('SomeUnregisteredApp');
    assert.equal(fact.evidence, 'NOT_FOUND');
});

test('10. No credential/secret field is ever exposed through this fact', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('MpesaOS');
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
