/**
 * core/modules/translate/test/translation-service.test.js
 * Run with: node --test core/modules/translate/test/translation-service.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SEGMENT_CORE_PATH = path.join(__dirname, '..', 'translation-segment-core.js');
const SERVICE_PATH = path.join(__dirname, '..', 'translation-service.js');

function freshWindow() {
    delete require.cache[require.resolve(SEGMENT_CORE_PATH)];
    delete require.cache[require.resolve(SERVICE_PATH)];
    global.window = { CozyOS: {} };
    require(SEGMENT_CORE_PATH);
    require(SERVICE_PATH);
    return global.window.CozyOS.TranslationService;
}

function fakeVoiceManager({ contextVoice = 'charles', providerStatus = 'installed' } = {}) {
    const overrides = { translation: contextVoice };
    return {
        getContextVoice: (ctx) => overrides[ctx] || 'charles',
        setContextVoice: (ctx, id) => { overrides[ctx] = id; return { success: true }; },
        getProvider: (id) => ({ providerId: id, status: providerStatus }),
    };
}

function fakeProviderRegistry({ translateResult, hasAny = true } = {}) {
    const calls = [];
    return {
        hasAny: () => hasAny,
        get: () => (hasAny ? { name: 'nllb-bridge' } : null),
        translate: async (text, opts) => { calls.push({ text, opts }); return translateResult; },
        _calls: calls,
    };
}

// --- resolveTranslationVoice() ---

test('resolveTranslationVoice() defaults to Owner Voice (charles) when no override has ever been set — VoiceManager\'s own real default, not a second mechanism', () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager({ contextVoice: 'charles' });
    const voice = service.resolveTranslationVoice();
    assert.equal(voice.available, true);
    assert.equal(voice.providerId, 'charles');
    assert.equal(voice.isOwnerVoice, true);
});

test('resolveTranslationVoice() honors an explicit, real override to a different authorized voice', () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager({ contextVoice: 'some-other-voice' });
    const voice = service.resolveTranslationVoice();
    assert.equal(voice.providerId, 'some-other-voice');
    assert.equal(voice.isOwnerVoice, false);
});

test('resolveTranslationVoice() reports honestly when VoiceManager is not loaded — never assumes Owner Voice is usable without checking', () => {
    const service = freshWindow();
    const voice = service.resolveTranslationVoice();
    assert.equal(voice.available, false);
    assert.match(voice.reason, /VoiceManager is not loaded/);
});

test('resolveTranslationVoice() reports honestly when the resolved provider is not actually installed — never silently substitutes another voice while calling it Owner Voice', () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager({ contextVoice: 'charles', providerStatus: 'not-installed' });
    const voice = service.resolveTranslationVoice();
    assert.equal(voice.available, false);
    assert.equal(voice.isOwnerVoice, true, 'must still honestly report which voice was resolved, even though it is unavailable');
});

// --- translateSegment() ---

test('translateSegment() produces a real structured segment via the real, existing provider registry, with Owner Voice resolved', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    const registry = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'Good morning', providerName: 'nllb-bridge' } });
    global.window.CozyOS.SpeechTranslationProviders = registry;

    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'Habari za asubuhi' });
    assert.equal(result.success, true);
    assert.equal(result.segment.translatedText, 'Good morning');
    assert.equal(result.segment.sourceText, 'Habari za asubuhi');
    assert.equal(result.segment.sourceLanguage, 'sw');
    assert.equal(result.segment.targetLanguage, 'en');
    assert.equal(result.segment.voiceId, 'charles');
    assert.equal(result.voice.isOwnerVoice, true);
    assert.equal(registry._calls[0].text, 'Habari za asubuhi');
    assert.deepEqual(registry._calls[0].opts, { sourceLanguage: 'sw', targetLanguage: 'en' });
});

test('translateSegment() honestly fails (never fabricates a translation) when the real provider is unavailable', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({
        translateResult: { isReal: false, translatedText: null, reason: 'nllb-bridge unavailable (not running or model not loaded).' },
    });

    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'Habari' });
    assert.equal(result.success, false);
    assert.match(result.reason, /unavailable/);
});

test('translateSegment() requires real sourceText — never translates an empty/missing string', async () => {
    const service = freshWindow();
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'x' } });
    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: '   ' });
    assert.equal(result.success, false);
    assert.match(result.reason, /sourceText is required/);
});

test('translateSegment() requires both sourceLanguage and targetLanguage — never guesses a missing one', async () => {
    const service = freshWindow();
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'x' } });
    const result = await service.translateSegment({ sourceLanguage: 'sw', sourceText: 'x' });
    assert.equal(result.success, false);
    assert.match(result.reason, /both required/);
});

test('translateSegment() reports confidence as "unavailable" for the real nllb-bridge response shape (no confidence field), never a fabricated percentage', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({
        translateResult: { isReal: true, translatedText: 'Good morning', providerName: 'nllb-bridge' },
    });
    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'Habari' });
    assert.equal(result.segment.confidence, 'unavailable');
});

test('translateSegment() passes through a real numeric confidence unchanged if a future provider ever supplies one', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({
        translateResult: { isReal: true, translatedText: 'Good morning', confidence: 0.93 },
    });
    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'Habari' });
    assert.equal(result.segment.confidence, 0.93);
});

test('translateSegment() still returns a real translation even when the voice cannot be resolved — voice failure does not block translation text', async () => {
    const service = freshWindow();
    // No VoiceManager loaded at all.
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({
        translateResult: { isReal: true, translatedText: 'Good morning' },
    });
    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'Habari' });
    assert.equal(result.success, true);
    assert.equal(result.segment.translatedText, 'Good morning');
    assert.equal(result.segment.voiceId, null, 'must never fabricate a voiceId when none could be resolved');
});

test('translateSegment() preserves real context/sourceTiming/pauseMetadata through to the structured segment, never dropping or altering them', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({
        translateResult: { isReal: true, translatedText: 'Today we are talking about love.' },
    });
    const result = await service.translateSegment({
        sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'leo tunazungumza kuhusu upendo',
        context: { type: 'sermon' },
        sourceTiming: { startRequestedAt: 100, firstFinalAt: 900 },
        pauseMetadata: { available: true, durationMs: 350 },
    });
    assert.deepEqual(result.segment.context, { type: 'sermon' });
    assert.deepEqual(result.segment.sourceTiming, { startRequestedAt: 100, firstFinalAt: 900 });
    assert.deepEqual(result.segment.pauseMetadata, { available: true, durationMs: 350 });
});

test('translateSegment() resolves the voice fresh, once per call — two consecutive calls after a real voice-preference change use their own current resolution, never a stale cached one', async () => {
    const service = freshWindow();
    const vm = fakeVoiceManager({ contextVoice: 'charles' });
    global.window.CozyOS.VoiceManager = vm;
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'x' } });

    const first = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'a' });
    assert.equal(first.segment.voiceId, 'charles');

    vm.setContextVoice('translation', 'a-different-authorized-voice');
    const second = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'b' });
    assert.equal(second.segment.voiceId, 'a-different-authorized-voice');
    assert.notEqual(first.segment.voiceId, second.segment.voiceId, 'each call must reflect the real current voice setting, never a voice frozen from an earlier call');
});

// --- ensureNllbProviderRegistered() ---

test('ensureNllbProviderRegistered() registers the real provider exactly once, idempotently', () => {
    const service = freshWindow();
    let registerCalls = 0;
    global.window.CozyOS.SpeechTranslationProviders = { hasAny: () => registerCalls > 0, get: (n) => (registerCalls > 0 && n === 'nllb-bridge' ? {} : null) };
    global.window.CozyOS.SpeechTranslationNLLBProvider = { register: () => { registerCalls++; } };

    service.ensureNllbProviderRegistered();
    service.ensureNllbProviderRegistered();
    service.ensureNllbProviderRegistered();
    assert.equal(registerCalls, 1, 'must never register the same real provider more than once');
});

test('ensureNllbProviderRegistered() reports honestly when the real dependency files are not loaded', () => {
    const service = freshWindow();
    const result = service.ensureNllbProviderRegistered();
    assert.equal(result.success, false);
});

test('OWNER_VOICE_PROVIDER_ID is "charles" — the existing official CozyOS voice provider, not a new one', () => {
    const service = freshWindow();
    assert.equal(service.OWNER_VOICE_PROVIDER_ID, 'charles');
});

// --- CP16A architectural correction: routeTranslation() — NLLB is a tool, not the knowledge base ---

function fakeLanguageVerification({ recommendation } = {}) {
    const calls = [];
    return {
        getRecommendedTranslation: (termId) => { calls.push(termId); return recommendation || { available: false, reason: 'No recommendation has been explicitly set for this term yet.' }; },
        _calls: calls,
    };
}

test('routeTranslation() chooses verified-vocabulary when a real, explicitly-approved recommendation exists for the exact source text', () => {
    const service = freshWindow();
    global.window.CozyOS.LivingLanguageVerification = fakeLanguageVerification({
        recommendation: { available: true, meaning: 'Thank you', confidence: 0.95, level: 3 },
    });
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'x' } });

    const routing = service.routeTranslation({ sourceText: 'asante', targetLanguage: 'en' });
    assert.equal(routing.route, 'verified-vocabulary');
    assert.equal(routing.recommendation.meaning, 'Thank you');
});

test('routeTranslation() falls through to the provider registry when no verified recommendation exists', () => {
    const service = freshWindow();
    global.window.CozyOS.LivingLanguageVerification = fakeLanguageVerification({ recommendation: { available: false } });
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'x' } });

    const routing = service.routeTranslation({ sourceText: 'a full sentence nobody verified yet', targetLanguage: 'en' });
    assert.equal(routing.route, 'provider');
});

test('routeTranslation() honestly reports "none" when neither verified vocabulary nor any registered provider exists — never fabricates a route', () => {
    const service = freshWindow();
    const routing = service.routeTranslation({ sourceText: 'x', targetLanguage: 'en' });
    assert.equal(routing.route, 'none');
});

test('routeTranslation() works correctly when LivingLanguageVerification is not loaded at all — falls through to the provider path, never throws', () => {
    const service = freshWindow();
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'x' } });
    const routing = service.routeTranslation({ sourceText: 'x', targetLanguage: 'en' });
    assert.equal(routing.route, 'provider');
});

test('translateSegment() uses the verified-vocabulary route end-to-end WITHOUT ever calling the provider registry — NLLB is never invoked when real verified knowledge already answers the question', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.LivingLanguageVerification = fakeLanguageVerification({
        recommendation: { available: true, meaning: 'Thank you', confidence: 0.95, level: 3 },
    });
    const registry = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'SHOULD NOT BE USED' } });
    global.window.CozyOS.SpeechTranslationProviders = registry;

    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'asante' });
    assert.equal(result.success, true);
    assert.equal(result.segment.translatedText, 'Thank you');
    assert.equal(result.providerName, 'verified-vocabulary');
    assert.equal(result.routing.route, 'verified-vocabulary');
    assert.equal(registry._calls.length, 0, 'the provider registry (NLLB) must never be called when a real verified recommendation already exists');
});

test('translateSegment() falls through to the real provider registry for a full sentence with no verified single-term match, exactly as before this correction', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.LivingLanguageVerification = fakeLanguageVerification({ recommendation: { available: false } });
    const registry = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'My brothers and sisters, today we are talking about love.' } });
    global.window.CozyOS.SpeechTranslationProviders = registry;

    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'Ndugu zangu, leo tunazungumza kuhusu upendo.' });
    assert.equal(result.success, true);
    assert.equal(result.routing.route, 'provider');
    assert.equal(registry._calls.length, 1, 'the provider registry must be consulted exactly once when no verified match exists');
});

test('translateSegment() honestly fails when routing finds neither a verified match nor any provider — never silently produces a fabricated translation', async () => {
    const service = freshWindow();
    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'x' });
    assert.equal(result.success, false);
    assert.equal(result.routing.route, 'none');
});

test('a verified-vocabulary confidence level is passed through exactly (real number), never converted into a fabricated percentage string', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.LivingLanguageVerification = fakeLanguageVerification({
        recommendation: { available: true, meaning: 'Thank you', confidence: 0.5, level: 2 },
    });
    global.window.CozyOS.SpeechTranslationProviders = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'x' } });
    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: 'asante' });
    assert.equal(result.segment.confidence, 0.5);
});

// --- CP16B: multi-listener architecture — source-to-listener-language, never a fixed sw->en pipeline ---

test('routeTranslation() short-circuits to original-language when the listener selects the SAME language the source already is — no lookup, no provider call', () => {
    const service = freshWindow();
    const verification = fakeLanguageVerification({ recommendation: { available: true, meaning: 'should never be reached' } });
    global.window.CozyOS.LivingLanguageVerification = verification;
    const registry = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'should never be reached' } });
    global.window.CozyOS.SpeechTranslationProviders = registry;

    const routing = service.routeTranslation({ sourceLanguage: 'sw', targetLanguage: 'sw', sourceText: 'Habari za asubuhi' });
    assert.equal(routing.route, 'original-language');
    assert.equal(verification._calls.length, 0, 'verified-vocabulary lookup must never even be attempted for a same-language request');
});

test('translateSegment() returns the exact original sourceText verbatim when targetLanguage === sourceLanguage — never calls any real translation path', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.LivingLanguageVerification = fakeLanguageVerification({ recommendation: { available: true, meaning: 'WRONG' } });
    const registry = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'WRONG' } });
    global.window.CozyOS.SpeechTranslationProviders = registry;

    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'sw', sourceText: 'Habari za asubuhi' });
    assert.equal(result.success, true);
    assert.equal(result.segment.translatedText, 'Habari za asubuhi', 'must be the exact original text, byte for byte');
    assert.equal(result.segment.sourceText, 'Habari za asubuhi');
    assert.equal(result.providerName, 'original-language');
    assert.equal(result.routing.route, 'original-language');
    assert.equal(registry._calls.length, 0, 'the real translation provider (NLLB) must never be called for a same-language request');
});

test('translateSegment() confidence for original-language passthrough is "unavailable" — never a fabricated 100%/perfect score', async () => {
    const service = freshWindow();
    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'sw', sourceText: 'x' });
    assert.equal(result.segment.confidence, 'unavailable');
});

test('translateSegment() still resolves a real voice for an original-language request, so a future delivery layer has the information even though no synthesis is architecturally implied', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'sw', sourceText: 'x' });
    assert.equal(result.voice.available, true);
    assert.equal(result.voice.isOwnerVoice, true);
});

test('translateSegment() sends sw->fr directly to the provider registry — never pivots through English or any third language', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.LivingLanguageVerification = fakeLanguageVerification({ recommendation: { available: false } });
    const registry = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'Aujourd\'hui nous parlons d\'amour.' } });
    global.window.CozyOS.SpeechTranslationProviders = registry;

    const result = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'fr', sourceText: 'leo tunazungumza kuhusu upendo' });
    assert.equal(result.success, true);
    assert.equal(result.segment.targetLanguage, 'fr');
    assert.deepEqual(registry._calls[0].opts, { sourceLanguage: 'sw', targetLanguage: 'fr' }, 'the real provider call must request sw->fr directly, with no intermediate "en" anywhere in the request');
});

test('three independent listeners selecting sw, en, and fr from the SAME Kiswahili source each get their own correct, independently-routed result', async () => {
    const service = freshWindow();
    global.window.CozyOS.VoiceManager = fakeVoiceManager();
    global.window.CozyOS.LivingLanguageVerification = fakeLanguageVerification({ recommendation: { available: false } });
    const registry = fakeProviderRegistry({ translateResult: { isReal: true, translatedText: 'TRANSLATED' } });
    global.window.CozyOS.SpeechTranslationProviders = registry;

    const source = 'Ndugu zangu, leo tunazungumza kuhusu upendo.';
    const swListener = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'sw', sourceText: source });
    const enListener = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'en', sourceText: source });
    const frListener = await service.translateSegment({ sourceLanguage: 'sw', targetLanguage: 'fr', sourceText: source });

    assert.equal(swListener.segment.translatedText, source, 'the Kiswahili listener gets the real original, untouched');
    assert.equal(enListener.segment.translatedText, 'TRANSLATED');
    assert.equal(frListener.segment.translatedText, 'TRANSLATED');
    assert.equal(enListener.segment.targetLanguage, 'en');
    assert.equal(frListener.segment.targetLanguage, 'fr');
    assert.equal(registry._calls.length, 2, 'exactly two real provider calls — one per listener who actually needed translation, none for the Kiswahili listener');
});
