'use strict';

/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-domain4c-dep1.test.js
 *
 * Domain 4C Dependency #1 - real regression coverage. Proves the
 * translate-request intent (Domain 4D) genuinely invokes the real,
 * canonical TranslationService.translateSegment() (Domain 4C) when the
 * utterance contains real, literal embedded source text - reusing the
 * existing gemini-translate provider, never a new engine.
 *
 * Real fail-closed behavior is proven directly: when the real
 * TranslationService reports failure (exactly as it honestly does today
 * with no live GEMINI_API_KEY/network in this environment), the reply
 * text reflects that real failure, never a fabricated translation.
 *
 * A real, necessary companion fix is also covered here: the Kiswahili
 * translate-request pattern only recognized fixed placeholder phrasing
 * ("tafsiri hii/hivi/hiki/ujumbe kwa X") before this dependency - "tafsiri
 * <real text> kwa X" fell through to an unrelated intent (greeting,
 * matched on a coincidental word like "habari"). Broadened narrowly to
 * also recognize that shape, without touching the existing English
 * pattern or the existing placeholder-only Kiswahili shapes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');

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

function makeFakeTranslationService({ shouldSucceed = true, translatedText = 'Bonjour le monde', reason = 'Provider unavailable in this environment' } = {}) {
    const calls = [];
    return {
        calls,
        async translateSegment(opts) {
            calls.push(opts);
            if (!shouldSucceed) return { success: false, reason };
            return { success: true, segment: { translatedText }, providerName: 'gemini-translate' };
        },
    };
}

function freshProvider({ translationService } = {}) {
    const files = [
        path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js'),
    ];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = {
        CozyOS: {
            LivingAI: makeFakeLivingAI(),
            CognitiveCoordinator: makeFakeCoordinator(),
            ProviderManager: makeFakeProviderManager(),
            TranslationService: translationService,
        },
    };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational');
}

test('ENGLISH: "Translate hello world to French." genuinely calls the real TranslationService.translateSegment() with the correct arguments', async () => {
    const translationService = makeFakeTranslationService();
    const provider = freshProvider({ translationService });
    const result = await provider.think('Translate hello world to French.');

    assert.equal(result.result.intent, 'translate-request');
    assert.equal(translationService.calls.length, 1);
    assert.equal(translationService.calls[0].sourceText, 'hello world');
    assert.equal(translationService.calls[0].targetLanguage, 'fr');
    assert.equal(translationService.calls[0].sourceLanguage, 'en');
    assert.equal(translationService.calls[0].preferredProviderName, 'gemini-translate');
});

test('ENGLISH: the real provider result (translatedText) is returned honestly in the reply, not fabricated', async () => {
    const translationService = makeFakeTranslationService({ translatedText: 'Bonjour tout le monde' });
    const provider = freshProvider({ translationService });
    const result = await provider.think('Translate hello everyone to French.');
    assert.match(result.result.text, /Bonjour tout le monde/);
});

test('KISWAHILI: "Tafsiri habari kwa Kiingereza." genuinely calls the real TranslationService with sourceLanguage sw, targetLanguage en', async () => {
    const translationService = makeFakeTranslationService({ translatedText: 'news' });
    const provider = freshProvider({ translationService });
    const result = await provider.think('Tafsiri habari kwa Kiingereza.');

    assert.equal(result.result.intent, 'translate-request', 'must not be misclassified as an unrelated intent (e.g. greeting)');
    assert.equal(translationService.calls.length, 1);
    assert.equal(translationService.calls[0].sourceText, 'habari');
    assert.equal(translationService.calls[0].targetLanguage, 'en');
    assert.equal(translationService.calls[0].sourceLanguage, 'sw');
    assert.match(result.result.text, /news/);
});

test('a real TranslationService failure produces an honest failure reply, never a fabricated translation', async () => {
    const translationService = makeFakeTranslationService({ shouldSucceed: false, reason: 'NLLB bridge unavailable (not running or model not loaded).' });
    const provider = freshProvider({ translationService });
    const result = await provider.think('Translate hello to French.');

    assert.equal(translationService.calls.length, 1, 'the real service must genuinely be called');
    assert.doesNotMatch(result.result.text, /Bonjour/i, 'must never contain a fabricated translation');
    assert.match(result.result.text, /couldn't complete/i);
    assert.match(result.result.text, /NLLB bridge unavailable/, 'the real, honest failure reason must be preserved, not hidden');
});

test('if TranslationService is not loaded at all, the reply honestly reports failure - never throws, never fabricates', async () => {
    const provider = freshProvider({ translationService: undefined });
    const result = await provider.think('Translate hello to French.');
    assert.equal(result.result.intent, 'translate-request');
    assert.match(result.result.text, /you'd like something translated into French/i, 'falls back to the existing "please send text" reply when the real service is entirely absent');
});

test('REGRESSION: "Translate this into French." (no real embedded text) still uses the existing honest ask-for-text reply, TranslationService is never called', async () => {
    const translationService = makeFakeTranslationService();
    const provider = freshProvider({ translationService });
    const result = await provider.think('Translate this into French.');
    assert.equal(translationService.calls.length, 0, 'a placeholder like "this" must never be sent to the real translator as if it were real text');
    assert.match(result.result.text, /exact text/i);
});

test('REGRESSION: "Nisaidie kutafsiri ujumbe huu kwa Kifaransa." (placeholder "ujumbe huu") still uses the existing honest reply, TranslationService is never called', async () => {
    const translationService = makeFakeTranslationService();
    const provider = freshProvider({ translationService });
    const result = await provider.think('Nisaidie kutafsiri ujumbe huu kwa Kifaransa.');
    assert.equal(translationService.calls.length, 0);
    assert.match(result.result.text, /Nimeelewa/);
});

test('REGRESSION: "Translate this." (no target language) still asks for the target language, TranslationService is never called', async () => {
    const translationService = makeFakeTranslationService();
    const provider = freshProvider({ translationService });
    const result = await provider.think('Translate this.');
    assert.equal(translationService.calls.length, 0);
    assert.match(result.result.text, /couldn't tell which language/i);
});

test('REGRESSION: registration/what-is-cozyos/generic-help intents remain unaffected', async () => {
    const provider = freshProvider({ translationService: makeFakeTranslationService() });
    assert.equal((await provider.think('I want to register.')).result.intent, 'how-to-register');
    assert.equal((await provider.think('What is CozyOS?')).result.intent, 'what-is-cozyos');
    assert.equal((await provider.think('Nataka msaada.')).result.intent, 'help');
});

test("REGRESSION: real greeting phrases containing 'habari' as an actual greeting (not inside a translate request) still classify as greeting-generic", async () => {
    const provider = freshProvider({ translationService: makeFakeTranslationService() });
    const result = await provider.think('Habari yako?');
    assert.equal(result.result.intent, 'greeting-generic');
});
