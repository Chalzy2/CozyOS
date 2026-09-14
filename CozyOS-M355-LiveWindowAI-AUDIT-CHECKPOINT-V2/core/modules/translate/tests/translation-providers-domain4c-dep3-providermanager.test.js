'use strict';

/**
 * core/modules/translate/tests/translation-providers-domain4c-dep3-providermanager.test.js
 *
 * Domain 4C Dependency #3 - real regression coverage. Extends the
 * exact, already-proven ProviderManager adoption pattern (Domain 4L's
 * conversational providers, Engine Ecosystem's visual engines) to the
 * two real translation providers: nllb-bridge and gemini-translate.
 * Purely observational - ProviderManager never becomes the owner of
 * translation execution; every existing translate()/isAvailable() call
 * is unchanged (confirmed by the pre-existing, unmodified test suites
 * for both files still passing).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const PROVIDER_MANAGER_PATH = path.join(ROOT, 'core', 'shell', 'provider-manager.js');
const PROVIDER_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-translation-provider.js');
const NLLB_PROVIDER_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-translation-provider-nllb.js');
const GEMINI_PROVIDER_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-translation-provider-gemini.js');
const GEMINI_CLIENT_PATH = path.join(ROOT, 'core', 'living', 'providers', 'gemini-cloud-provider.js');

function fakeLocalStorage() {
    const store = new Map();
    return { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
}

function freshStack() {
    [PROVIDER_MANAGER_PATH, PROVIDER_REGISTRY_PATH, NLLB_PROVIDER_PATH, GEMINI_PROVIDER_PATH, GEMINI_CLIENT_PATH].forEach((p) => delete require.cache[require.resolve(p)]);
    const win = { CozyOS: {}, localStorage: fakeLocalStorage() };
    global.window = win;
    require(PROVIDER_MANAGER_PATH);
    require(PROVIDER_REGISTRY_PATH);
    const geminiFactory = require(GEMINI_CLIENT_PATH);
    win.CozyOS.createGeminiCloudProvider = (opts = {}) => geminiFactory.createGeminiCloudProvider({ fetchImpl: async () => { throw new Error('no real network in this test'); }, ...opts });
    require(NLLB_PROVIDER_PATH);
    require(GEMINI_PROVIDER_PATH);
    return win;
}

test('registering nllb-bridge also registers it with the REAL ProviderManager, category "translation"', () => {
    const win = freshStack();
    win.CozyOS.SpeechTranslationNLLBProvider.register();
    const entry = win.CozyOS.ProviderManager.list().find((p) => p.id === 'nllb-bridge');
    assert.ok(entry, 'nllb-bridge must be registered with ProviderManager');
    assert.equal(entry.category, 'translation');
});

test('registering gemini-translate also registers it with the REAL ProviderManager, category "translation"', () => {
    const win = freshStack();
    win.CozyOS.SpeechTranslationGeminiProvider.register();
    const entry = win.CozyOS.ProviderManager.list().find((p) => p.id === 'gemini-translate');
    assert.ok(entry, 'gemini-translate must be registered with ProviderManager');
    assert.equal(entry.category, 'translation');
});

test('both translation providers report honest UNKNOWN health - never a fabricated ONLINE merely because registration succeeded', () => {
    const win = freshStack();
    win.CozyOS.SpeechTranslationNLLBProvider.register();
    win.CozyOS.SpeechTranslationGeminiProvider.register();
    const nllbHealth = win.CozyOS.ProviderManager.health('nllb-bridge');
    const geminiHealth = win.CozyOS.ProviderManager.health('gemini-translate');
    assert.equal(nllbHealth.health, 'UNKNOWN');
    assert.equal(geminiHealth.health, 'UNKNOWN');
    assert.match(nllbHealth.reason, /local NLLB bridge process/);
    assert.match(geminiHealth.reason, /GEMINI_API_KEY/);
});

test('both translation providers coexist with unique, non-colliding ProviderManager ids', () => {
    const win = freshStack();
    win.CozyOS.SpeechTranslationNLLBProvider.register();
    win.CozyOS.SpeechTranslationGeminiProvider.register();
    const ids = win.CozyOS.ProviderManager.list('translation').map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes('nllb-bridge'));
    assert.ok(ids.includes('gemini-translate'));
});

test("ProviderManager registration is additive/observational only - registering does not change what SpeechTranslationProviders.list() itself reports", () => {
    const win = freshStack();
    win.CozyOS.SpeechTranslationNLLBProvider.register();
    win.CozyOS.SpeechTranslationGeminiProvider.register();
    const realProviderNames = win.CozyOS.SpeechTranslationProviders.list().map((p) => p.name);
    assert.deepEqual(realProviderNames.sort(), ['gemini-translate', 'nllb-bridge'].sort());
});

test('PRESERVATION: registering with ProviderManager absent (not loaded) does not throw and the real translation provider still registers normally', () => {
    delete require.cache[require.resolve(PROVIDER_REGISTRY_PATH)];
    delete require.cache[require.resolve(NLLB_PROVIDER_PATH)];
    const win = { CozyOS: {} };
    global.window = win;
    require(PROVIDER_REGISTRY_PATH);
    require(NLLB_PROVIDER_PATH);
    assert.doesNotThrow(() => win.CozyOS.SpeechTranslationNLLBProvider.register());
    const entry = win.CozyOS.SpeechTranslationProviders.get('nllb-bridge');
    assert.ok(entry, 'the real translation provider must still register in SpeechTranslationProviders even when ProviderManager is entirely absent');
});
