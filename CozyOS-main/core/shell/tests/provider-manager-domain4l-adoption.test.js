'use strict';

/**
 * core/shell/tests/provider-manager-domain4l-adoption.test.js
 *
 * Domain 4L dependency #1 (AI Provider/Model Integration) — real
 * regression coverage. Loads the ACTUAL, unmodified
 * core/shell/provider-manager.js (never stubbed, unlike every existing
 * test harness across Domains 4A–4I) alongside the two real
 * conversational providers, proving genuine registration, unique ids,
 * category, real health invocation, and honest degraded/unknown
 * reporting — without touching LivingAI routing, CozyAIEngine, or any
 * language/authorization/translation code.
 *
 * CORRECTION TO THE PRIOR DISCOVERY REPORT: re-reading
 * rule-based-conversational-provider.js directly (not just grepping
 * for the literal string "ProviderManager.register") found it already
 * calls the real ProviderManager.register() via a `pm.register(...)`
 * variable reference — the discovery's "zero adopters" claim was
 * correct only for gemini-cloud-provider.js. This file's tests reflect
 * that corrected, verified reality.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const PROVIDER_MANAGER_PATH = path.join(ROOT, 'core', 'shell', 'provider-manager.js');
const RULE_BASED_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js');
const GEMINI_PATH = path.join(ROOT, 'core', 'living', 'providers', 'gemini-cloud-provider.js');
const LANGUAGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js');
const LANGUAGE_TEMPLATES_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js');
const PUBLIC_KNOWLEDGE_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js');
const KNOWLEDGE_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js');

function fakeLocalStorage() {
    const store = new Map();
    return { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
}
function makeFakeLivingAI() {
    const registered = new Map();
    let active = null;
    return {
        registerProvider(name, provider) { registered.set(name, provider); return { success: true }; },
        setActiveProvider(name) { active = name; return { success: true }; },
        getActiveProvider() { return active; },
        _registered: registered,
    };
}
function makeFakeCoordinator() { return { async run() { return {}; } }; }

function freshRealStack() {
    [PROVIDER_MANAGER_PATH, RULE_BASED_PATH, GEMINI_PATH, LANGUAGE_REGISTRY_PATH, LANGUAGE_TEMPLATES_PATH, PUBLIC_KNOWLEDGE_PATH, KNOWLEDGE_REGISTRY_PATH]
        .forEach((p) => delete require.cache[require.resolve(p)]);

    const fakeWindow = {
        CozyOS: { LivingAI: makeFakeLivingAI(), CognitiveCoordinator: makeFakeCoordinator() },
        localStorage: fakeLocalStorage(),
    };
    global.window = fakeWindow;

    // Real ProviderManager — the actual dependency under test, never stubbed.
    require(PROVIDER_MANAGER_PATH);
    // Real rule-based provider (self-registers with LivingAI + ProviderManager at load).
    require(LANGUAGE_REGISTRY_PATH);
    require(LANGUAGE_TEMPLATES_PATH);
    require(PUBLIC_KNOWLEDGE_PATH);
    require(KNOWLEDGE_REGISTRY_PATH);
    require(RULE_BASED_PATH);

    return { CozyOS: fakeWindow.CozyOS, geminiFactory: require(GEMINI_PATH) };
}

// ---- Rule-based conversational provider: real registration ----

test('rule-based-conversational-provider.js genuinely registers itself with the REAL ProviderManager at load time', () => {
    const { CozyOS } = freshRealStack();
    const list = CozyOS.ProviderManager.list();
    const entry = list.find((p) => p.id === 'rule-based-conversational');
    assert.ok(entry, 'rule-based-conversational must be registered');
    assert.equal(entry.name, 'Rule-Based Conversational Composer');
    assert.equal(entry.category, 'conversational');
});

test('rule-based-conversational-provider.js reports a real, honest ONLINE health (no external dependency to fail)', () => {
    const { CozyOS } = freshRealStack();
    const health = CozyOS.ProviderManager.health('rule-based-conversational');
    assert.equal(health.health, 'ONLINE');
    assert.match(health.reason, /no external runtime or network dependency/i);
});

// ---- Gemini cloud provider: real registration (the actual Domain 4L fix) ----

test('gemini-cloud-provider.js genuinely registers itself with the REAL ProviderManager when registerGeminiCloudProvider() is called', () => {
    const { CozyOS, geminiFactory } = freshRealStack();
    const result = geminiFactory.registerGeminiCloudProvider(CozyOS.LivingAI);
    assert.equal(result.success, true);

    const list = CozyOS.ProviderManager.list();
    const entry = list.find((p) => p.id === 'gemini-api');
    assert.ok(entry, 'gemini-api must be registered');
    assert.equal(entry.name, 'Gemini Cloud Provider');
    assert.equal(entry.category, 'conversational');
});

test('gemini-cloud-provider.js honestly reports UNKNOWN health — never fabricates ONLINE/OFFLINE without a live call', () => {
    const { CozyOS, geminiFactory } = freshRealStack();
    geminiFactory.registerGeminiCloudProvider(CozyOS.LivingAI);
    const health = CozyOS.ProviderManager.health('gemini-api');
    assert.equal(health.health, 'UNKNOWN');
    assert.match(health.reason, /cannot be verified|neither is knowable/i);
});

test('gemini-cloud-provider.js registration does NOT crash and still registers with LivingAI when window.CozyOS.ProviderManager is absent (honest degrade)', () => {
    delete require.cache[require.resolve(GEMINI_PATH)];
    const registeredCalls = [];
    global.window = { CozyOS: { LivingAI: { registerProvider: (name) => { registeredCalls.push(name); return { success: true }; } } } };
    const geminiFactory = require(GEMINI_PATH);
    const result = geminiFactory.registerGeminiCloudProvider(global.window.CozyOS.LivingAI);
    assert.equal(result.success, true);
    assert.deepEqual(registeredCalls, ['gemini-api']);
});

// ---- Unique IDs, no collision ----

test('both real providers have unique, non-colliding ProviderManager ids', () => {
    const { CozyOS, geminiFactory } = freshRealStack();
    geminiFactory.registerGeminiCloudProvider(CozyOS.LivingAI);
    const ids = CozyOS.ProviderManager.list().map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
    assert.ok(ids.includes('rule-based-conversational'));
    assert.ok(ids.includes('gemini-api'));
});

// ---- healthReport() aggregates both real providers honestly ----

test('ProviderManager.healthReport() aggregates both real providers with their own genuine, distinct health states', () => {
    const { CozyOS, geminiFactory } = freshRealStack();
    geminiFactory.registerGeminiCloudProvider(CozyOS.LivingAI);
    const report = CozyOS.ProviderManager.healthReport();
    assert.equal(report['rule-based-conversational'].health, 'ONLINE');
    assert.equal(report['gemini-api'].health, 'UNKNOWN');
});

// ---- Preservation of existing LivingAI/provider behavior ----

test('PRESERVATION: LivingAI registration and activation still behave exactly as before — ProviderManager adoption is additive only', () => {
    const { CozyOS } = freshRealStack();
    assert.equal(CozyOS.LivingAI.getActiveProvider(), 'rule-based-conversational');
    assert.ok(CozyOS.LivingAI._registered.has('rule-based-conversational'));
});

test('PRESERVATION: registerGeminiCloudProvider() still returns the real provider object and success flag exactly as before', () => {
    const { CozyOS, geminiFactory } = freshRealStack();
    const result = geminiFactory.registerGeminiCloudProvider(CozyOS.LivingAI);
    assert.equal(result.success, true);
    assert.equal(typeof result.provider.think, 'function');
    assert.equal(typeof result.provider.describe, 'function');
});

// ---- disable() cascades honestly (real ProviderManager behavior, exercised for real) ----

test('disabling rule-based-conversational is reflected honestly by ProviderManager.health() (DISABLED, not a fabricated ONLINE)', () => {
    const { CozyOS } = freshRealStack();
    CozyOS.ProviderManager.disable('rule-based-conversational');
    const health = CozyOS.ProviderManager.health('rule-based-conversational');
    assert.equal(health.health, 'DISABLED');
});
