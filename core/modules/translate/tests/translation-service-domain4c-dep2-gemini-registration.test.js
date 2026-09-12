'use strict';

/**
 * core/modules/translate/tests/translation-service-domain4c-dep2-gemini-registration.test.js
 *
 * Domain 4C Dependency #2 - real regression coverage. Proves the real
 * gap found in the Domain 4C review is genuinely closed:
 * TranslationService.translateSegment() now calls the new, small,
 * idempotent ensureGeminiProviderRegistered() - mirroring
 * ensureNllbProviderRegistered() exactly - whenever
 * preferredProviderName is genuinely "gemini-translate", so the real,
 * existing, unmodified SpeechTranslationGeminiProvider.register()
 * actually gets called in the real call path, not merely available in
 * theory.
 *
 * No new provider, no new registry, no new engine - this loads the
 * real, unmodified speech-translation-provider.js (registry),
 * speech-translation-provider-gemini.js (the real adapter, untouched),
 * translation-segment-core.js, and translation-service.js (the one
 * file this dependency actually changed) together.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const PROVIDER_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-translation-provider.js');
const NLLB_PROVIDER_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-translation-provider-nllb.js');
const GEMINI_PROVIDER_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-translation-provider-gemini.js');
const GEMINI_CLIENT_PATH = path.join(ROOT, 'core', 'living', 'providers', 'gemini-cloud-provider.js');
const SEGMENT_CORE_PATH = path.join(ROOT, 'core', 'modules', 'translate', 'translation-segment-core.js');
const SERVICE_PATH = path.join(ROOT, 'core', 'modules', 'translate', 'translation-service.js');

const ALL_PATHS = [PROVIDER_REGISTRY_PATH, NLLB_PROVIDER_PATH, GEMINI_PROVIDER_PATH, GEMINI_CLIENT_PATH, SEGMENT_CORE_PATH, SERVICE_PATH];

function freshChain({ withGemini = true, fetchImpl } = {}) {
    ALL_PATHS.forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = { CozyOS: {} };
    global.fetch = async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:8177'); };

    const geminiFactory = require(GEMINI_CLIENT_PATH);
    global.window.CozyOS.createGeminiCloudProvider = (opts = {}) => geminiFactory.createGeminiCloudProvider({
        fetchImpl: fetchImpl || (async () => { throw new Error('no real GEMINI_API_KEY/network in this sandbox'); }),
        ...opts,
    });

    require(PROVIDER_REGISTRY_PATH);
    require(NLLB_PROVIDER_PATH);
    if (withGemini) require(GEMINI_PROVIDER_PATH);
    require(SEGMENT_CORE_PATH);
    require(SERVICE_PATH);
    return global.window.CozyOS.TranslationService;
}

test('BEFORE any translateSegment() call, gemini-translate is genuinely NOT registered (confirms the real gap that existed)', () => {
    freshChain();
    const providers = global.window.CozyOS.SpeechTranslationProviders;
    assert.equal(providers.get('gemini-translate'), null);
});

test('calling translateSegment() with preferredProviderName:"gemini-translate" genuinely registers the real provider (the gap is closed)', async () => {
    const svc = freshChain();
    await svc.translateSegment({
        segmentId: 'seg-dep2-1', sourceLanguage: 'sw', targetLanguage: 'en',
        sourceText: 'Habari yako', preferredProviderName: 'gemini-translate',
    });
    const providers = global.window.CozyOS.SpeechTranslationProviders;
    const entry = providers.get('gemini-translate');
    assert.ok(entry, 'gemini-translate must be genuinely registered after a real call requesting it');
});

test('a call that does NOT request gemini-translate never registers it (no unnecessary/unrequested registration)', async () => {
    const svc = freshChain();
    await svc.translateSegment({
        segmentId: 'seg-dep2-2', sourceLanguage: 'sw', targetLanguage: 'en',
        sourceText: 'Habari yako',
    });
    const providers = global.window.CozyOS.SpeechTranslationProviders;
    assert.equal(providers.get('gemini-translate'), null);
});

test('ensureGeminiProviderRegistered() is idempotent - repeated real calls never double-register', async () => {
    const svc = freshChain();
    const first = svc.ensureGeminiProviderRegistered();
    const second = svc.ensureGeminiProviderRegistered();
    const third = svc.ensureGeminiProviderRegistered();
    assert.equal(first.success, true);
    assert.equal(first.alreadyRegistered, false);
    assert.equal(second.alreadyRegistered, true);
    assert.equal(third.alreadyRegistered, true);
    const providers = global.window.CozyOS.SpeechTranslationProviders;
    assert.equal(providers.list().filter((p) => p.name === 'gemini-translate').length, 1, 'exactly one registration must exist, never duplicated');
});

test('repeated real translateSegment() calls requesting gemini-translate do not duplicate the registration', async () => {
    const svc = freshChain();
    await svc.translateSegment({ segmentId: 's1', sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'a', preferredProviderName: 'gemini-translate' });
    await svc.translateSegment({ segmentId: 's2', sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'b', preferredProviderName: 'gemini-translate' });
    const providers = global.window.CozyOS.SpeechTranslationProviders;
    assert.equal(providers.list().filter((p) => p.name === 'gemini-translate').length, 1);
});

test('if SpeechTranslationGeminiProvider itself is not loaded, ensureGeminiProviderRegistered() honestly fails, never fabricates', () => {
    const svc = freshChain({ withGemini: false });
    const result = svc.ensureGeminiProviderRegistered();
    assert.equal(result.success, false);
    assert.match(result.reason, /not loaded/);
});

test("REGRESSION: NLLB registration remains exactly as before - unaffected by the new Gemini registration path", async () => {
    const svc = freshChain();
    await svc.translateSegment({ segmentId: 's3', sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'habari', preferredProviderName: 'gemini-translate' });
    const providers = global.window.CozyOS.SpeechTranslationProviders;
    assert.ok(providers.get('nllb-bridge'), 'NLLB must still be registered automatically, exactly as before');
    assert.ok(providers.get('gemini-translate'), 'and gemini-translate must ALSO now be registered - both coexist');
});

test('REGRESSION: a default (no preferredProviderName) call still routes through nllb-bridge exactly as before, honestly failing closed (no real model in this environment)', async () => {
    const svc = freshChain();
    const result = await svc.translateSegment({ segmentId: 's4', sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'habari' });
    assert.equal(result.success, false);
    assert.match(result.reason, /NLLB bridge unavailable/);
});

test('END-TO-END: with a real (simulated) successful Gemini backend, translateSegment() genuinely returns the real translated text via the newly-reachable provider', async () => {
    const fetchImpl = async (_url, opts) => {
        const body = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ success: true, text: 'Hello, how are you?', isReal: true, model: 'gemini-2.0-flash' }) };
    };
    const svc = freshChain({ fetchImpl });
    const result = await svc.translateSegment({
        segmentId: 'seg-e2e', sourceLanguage: 'sw', targetLanguage: 'en',
        sourceText: 'Habari yako', preferredProviderName: 'gemini-translate',
    });
    assert.equal(result.success, true);
    assert.equal(result.segment.translatedText, 'Hello, how are you?');
    assert.equal(result.providerName, 'gemini-translate');
});

test('END-TO-END: with no real GEMINI_API_KEY/network (the honest default in this sandbox), the real path still fails closed, never fabricating output - LIVE GEMINI EXECUTION: NOT-RUN', async () => {
    const svc = freshChain();
    const result = await svc.translateSegment({
        segmentId: 'seg-live', sourceLanguage: 'sw', targetLanguage: 'en',
        sourceText: 'Habari yako', preferredProviderName: 'gemini-translate',
    });
    assert.equal(result.success, false);
    assert.doesNotMatch(JSON.stringify(result), /Hello|Bonjour/i, 'must never contain a fabricated translation');
});
