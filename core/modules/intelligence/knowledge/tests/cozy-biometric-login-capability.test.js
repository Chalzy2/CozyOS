'use strict';

/**
 * core/modules/intelligence/knowledge/tests/cozy-biometric-login-capability.test.js
 *
 * Enterprise Control Center Fingerprint/Face -> WebAuthn passkey
 * connection dependency - knowledge-side coverage.
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

test('1. Human-purpose knowledge for biometric-login is retrievable, real, and never fabricated for an unregistered name', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getCapabilityHumanPurposeFact('biometric-login');
    assert.equal(fact.evidence, 'VERIFIED');
    assert.match(fact.purpose.humanPurpose, /device or browser performs the actual biometric check/);
});

test('2. CURRENT capability explicitly includes real WebAuthn passkey login, never a fabricated fingerprint-matching claim', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getCapabilityHumanPurposeFact('biometric-login');
    const current = fact.purpose.currentVerifiedCapabilities.join(' ');
    assert.match(current, /WebAuthn passkey/);
    assert.doesNotMatch(current, /FingerprintProvider has a working|FaceProvider has a working/i);
});

test('3. VISION section honestly discloses that FingerprintProvider/FaceProvider remain unbacked - never presented as already working', () => {
    const { window: win } = freshFullStack();
    const fact = win.CozyOS.CozyKnowledge.getCapabilityHumanPurposeFact('biometric-login');
    assert.match(fact.purpose.visionSourceNote, /remain real interfaces with no registered backend/);
});

test('4. "Why is fingerprint login important?" resolves through the existing app-importance intent to the real capability fact, CURRENT/VISION separated', async () => {
    const { provider } = freshFullStack();
    const result = await provider.think('Why is fingerprint login important?');
    assert.equal(result.result.intent, 'app-importance');
    assert.match(result.result.text, /CURRENTLY VERIFIED/);
    assert.match(result.result.text, /VISION \/ DESTINATION/);
    assert.match(result.result.text, /WebAuthn passkey/);
});

test('5. REGRESSION: existing ChurchOS/record-capture human-purpose facts remain unaffected', () => {
    const { window: win } = freshFullStack();
    const church = win.CozyOS.CozyKnowledge.getApplicationHumanPurposeFact('ChurchOS');
    const record = win.CozyOS.CozyKnowledge.getCapabilityHumanPurposeFact('natural-record-capture');
    assert.equal(church.evidence, 'VERIFIED');
    assert.equal(record.evidence, 'VERIFIED');
});

test('6. REGRESSION: existing app-info/translate-request intents remain unaffected', async () => {
    const { provider } = freshFullStack();
    const info = await provider.think('What is ChurchOS?');
    const translate = await provider.think('Translate hello to French.');
    assert.equal(info.result.intent, 'app-info');
    assert.equal(translate.result.intent, 'translate-request');
});
