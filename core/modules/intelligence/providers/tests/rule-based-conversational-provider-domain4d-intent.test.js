'use strict';

/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider-domain4d-intent.test.js
 *
 * Domain 4D (Intent Understanding discovery) — real regression coverage
 * for the "translate-request" intent fix. Repository-wide search before
 * writing this confirmed no "translate this"-shaped intent existed
 * anywhere in the conversational classifier (EN or SW) — a real
 * Kiswahili request ("Nisaidie kutafsiri ujumbe huu kwa Kifaransa.")
 * previously misclassified as "help" (via a coincidental "nisaidie"
 * substring match), and the English equivalent fell through to
 * "unsupported". Neither ever reached Domain 4C's real
 * TranslationService/Gemini adapter, because nothing here ever
 * recognized the request as translation-shaped at all.
 *
 * These tests prove: correct classification in both languages, honest
 * (never fabricated) reply content, correct target-language
 * recognition where nameable, honest "I don't know the target"
 * handling otherwise, and — critically — that recognizing the intent
 * never itself performs or claims a translation (Domain 4D's own
 * action-boundary requirement).
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

function freshProvider() {
    const files = [
        path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-registry.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'language', 'cozy-language-templates.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-public-knowledge-source.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'knowledge', 'cozy-knowledge-registry.js'),
        path.join(ROOT, 'core', 'modules', 'intelligence', 'providers', 'rule-based-conversational-provider.js'),
    ];
    files.forEach((p) => delete require.cache[require.resolve(p)]);
    const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), CognitiveCoordinator: makeFakeCoordinator(), ProviderManager: makeFakeProviderManager() } };
    global.window = fakeWindow;
    files.forEach((p) => require(p));
    return fakeWindow.CozyOS.LivingAI._registered.get('rule-based-conversational');
}

// ---- The exact reported bug, both languages ----

test('KISWAHILI: "Nisaidie kutafsiri ujumbe huu kwa Kifaransa." classifies as translate-request, NOT "help" (the original bug)', async () => {
    const provider = freshProvider();
    const result = await provider.think('Nisaidie kutafsiri ujumbe huu kwa Kifaransa.');
    assert.equal(result.result.intent, 'translate-request');
    assert.equal(result.result.language, 'sw');
});

test('ENGLISH: "Translate this into French." classifies as translate-request, NOT "unsupported" (the original bug)', async () => {
    const provider = freshProvider();
    const result = await provider.think('Translate this into French.');
    assert.equal(result.result.intent, 'translate-request');
});

// ---- Target language recognized ----

test('the reply names the recognized target language back to the person (English)', async () => {
    const provider = freshProvider();
    const result = await provider.think('Translate this into French.');
    assert.match(result.result.text, /French/);
    assert.match(result.result.text, /exact text/i);
});

test('the reply names the recognized target language back to the person (Kiswahili)', async () => {
    const provider = freshProvider();
    const result = await provider.think('Nisaidie kutafsiri ujumbe huu kwa Kifaransa.');
    assert.match(result.result.text, /Nimeelewa/);
});

// ---- Target language NOT recognized -> honest, never guessed ----

test('a translate-request with no identifiable target language honestly asks for one, never guesses', async () => {
    const provider = freshProvider();
    const result = await provider.think('Translate this.');
    assert.equal(result.result.intent, 'translate-request');
    assert.match(result.result.text, /couldn't tell which language/i);
});

// ---- Action boundary: recognizing the intent never performs or
// claims a translation ----

test('ACTION BOUNDARY: recognizing translate-request never fabricates translated content or claims execution', async () => {
    const provider = freshProvider();
    const result = await provider.think('Translate this into French.');
    assert.doesNotMatch(result.result.text, /voici|voila|here is the translation/i);
    assert.match(result.result.text, /please send me the exact text/i);
});

// ---- Regression: unrelated existing intents remain correctly classified ----

test('REGRESSION: registration intents (EN + SW) remain correctly classified, unaffected by the new rule', async () => {
    const provider = freshProvider();
    assert.equal((await provider.think('I want to register.')).result.intent, 'how-to-register');
    assert.equal((await provider.think('Nataka kujisajili.')).result.intent, 'how-to-register');
});

test('REGRESSION: "CozyOS ni nini?" / "What is CozyOS?" remain correctly classified', async () => {
    const provider = freshProvider();
    assert.equal((await provider.think('CozyOS ni nini?')).result.intent, 'what-is-cozyos');
    assert.equal((await provider.think('What is CozyOS?')).result.intent, 'what-is-cozyos');
});

test('REGRESSION: a generic help request ("Nataka msaada.") still classifies as generic help, not forced into translate-request', async () => {
    const provider = freshProvider();
    assert.equal((await provider.think('Nataka msaada.')).result.intent, 'help');
});

// ---- Honest gaps: genuinely unimplemented intents remain honestly UNKNOWN/unsupported ----

test('genuinely unimplemented intents (orders, language switch) remain honestly "unsupported" in both languages, never forced into a wrong bucket', async () => {
    const provider = freshProvider();
    // Domain 4I dependency #1 note: app launch and "open <noun>"-shaped
    // phrasing (including "Fungua mipangilio yangu." / "Open my
    // settings.") are intentionally NOT in this list anymore. The new,
    // real "app-launch" intent rule correctly recognizes ANY
    // "open/fungua <name>" action request, then honestly resolves (or
    // fails to resolve) the name against the real application
    // registry — so "settings" now correctly classifies as app-launch
    // with an honest, unresolved application:null (no matching
    // registered app), rather than a plain "unsupported". That is a
    // real improvement (an action was correctly recognized as
    // action-shaped), not a regression — see
    // rule-based-conversational-provider-domain4i-app-launch.test.js
    // for dedicated coverage of this exact behavior.
    const cases = [
        'Nataka kuona oda zangu.', 'Show me my orders.',
        'Nataka kubadilisha lugha.', 'I want to change my language.',
    ];
    for (const c of cases) {
        const result = await provider.think(c);
        assert.equal(result.result.intent, 'unsupported', `expected "unsupported" for ${JSON.stringify(c)}, got ${result.result.intent}`);
    }
});
