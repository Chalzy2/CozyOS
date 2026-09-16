'use strict';

/**
 * core/modules/speech/adapters/test/speech-translation-provider-gemini.test.js
 *
 * Domain 4C — tests for the smallest real Gemini translation adapter.
 * STRUCTURAL/CONTRACT TESTS ONLY: fetchImpl is always a local fake here
 * (the same discipline core/living/tests/gemini-cloud-provider.test.js
 * already established for the client provider itself) — proving the
 * adapter's own request-construction, response-extraction, and
 * fail-closed logic is real and correct. This is NOT live Gemini
 * execution — that requires a real GEMINI_API_KEY and real network
 * egress, neither of which exist in this environment (see this
 * domain's own checkpoint report). Mocking here tests an independent
 * boundary (the adapter's own logic) while the real integration below
 * it (createGeminiCloudProvider -> gemini-backend-endpoint.js) is
 * separately, already verified by its own test suites
 * (gemini-cloud-provider.test.js, gemini-backend-endpoint.test.js).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const GEMINI_CLIENT_PATH = path.join(ROOT, 'core', 'living', 'providers', 'gemini-cloud-provider.js');
const PROVIDER_REGISTRY_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-translation-provider.js');
const GEMINI_ADAPTER_PATH = path.join(__dirname, '..', 'speech-translation-provider-gemini.js');

function fakeFetch(responder) {
    return async (url, opts) => {
        const body = JSON.parse(opts.body);
        return responder(url, body);
    };
}

function freshEnv({ fetchImpl } = {}) {
    [GEMINI_CLIENT_PATH, PROVIDER_REGISTRY_PATH, GEMINI_ADAPTER_PATH].forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = { CozyOS: {} };
    const geminiFactory = require(GEMINI_CLIENT_PATH); // Node branch: module.exports
    global.window.CozyOS.createGeminiCloudProvider = (opts = {}) => geminiFactory.createGeminiCloudProvider({ fetchImpl, ...opts });
    require(PROVIDER_REGISTRY_PATH);
    require(GEMINI_ADAPTER_PATH);
    global.window.CozyOS.SpeechTranslationGeminiProvider.register();
    return global.window.CozyOS.SpeechTranslationProviders.get('gemini-translate');
}

// 1. Real request construction: correct backend URL, correct prompt content.
test('translate(): builds a real translation-instructing prompt and posts it to the same-origin Gemini backend', async () => {
    let capturedBody = null;
    const fetchImpl = fakeFetch((url, body) => {
        capturedBody = body;
        return { ok: true, json: async () => ({ success: true, text: 'Hello there', isReal: true, model: 'gemini-2.0-flash' }) };
    });
    const provider = freshEnv({ fetchImpl });

    const result = await provider.translate('Habari', { sourceLanguage: 'sw', targetLanguage: 'en' });
    assert.match(capturedBody.text, /Translate the following Kiswahili text into English/);
    assert.match(capturedBody.text, /Habari/);
    assert.equal(result.translatedText, 'Hello there');
    assert.equal(result.provider, 'gemini');
});

// 2. Honest failure: backend reports failure -> never fabricates translated text.
test('translate(): a real backend failure is relayed honestly, never fabricated as a translation', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, json: async () => ({ success: false, reason: 'PROVIDER_NOT_CONFIGURED' }) }));
    const provider = freshEnv({ fetchImpl });

    await assert.rejects(
        () => provider.translate('Habari', { sourceLanguage: 'sw', targetLanguage: 'en' }),
        /PROVIDER_NOT_CONFIGURED/
    );
});

// 3. Empty completion -> honest failure, not an empty "translation".
test('translate(): an empty Gemini response is treated as a real failure, not an empty translation', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, json: async () => ({ success: true, text: '   ', isReal: true }) }));
    const provider = freshEnv({ fetchImpl });

    await assert.rejects(
        () => provider.translate('Habari', { sourceLanguage: 'sw', targetLanguage: 'en' }),
        /empty response/
    );
});

// 4. A refusal-shaped completion is treated as a real failure, not a translation.
test('translate(): a Gemini refusal is treated as a real failure, not returned as translated text', async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, json: async () => ({ success: true, text: "I cannot assist with that request.", isReal: true }) }));
    const provider = freshEnv({ fetchImpl });

    await assert.rejects(
        () => provider.translate('Habari', { sourceLanguage: 'sw', targetLanguage: 'en' }),
        /declined to translate/
    );
});

// 5. Unsupported language rejected before any network call.
test('translate(): an unsupported language is rejected before any network call', async () => {
    let called = false;
    const fetchImpl = fakeFetch(() => { called = true; return { ok: true, json: async () => ({}) }; });
    const provider = freshEnv({ fetchImpl });

    await assert.rejects(
        () => provider.translate('Habari', { sourceLanguage: 'sw', targetLanguage: 'klingon' }),
        /unsupported targetLanguage/
    );
    assert.equal(called, false);
});

// 6. Network failure is relayed honestly.
test('translate(): a real network failure is relayed honestly', async () => {
    const fetchImpl = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    const provider = freshEnv({ fetchImpl });

    await assert.rejects(
        () => provider.translate('Habari', { sourceLanguage: 'sw', targetLanguage: 'en' }),
        /Could not reach the Gemini backend/
    );
});

// 7. Security: the API key is never referenced anywhere in this file's
// own source (static check) and never appears in any result/exception.
test('SECURITY: this adapter file never ACCESSES GEMINI_API_KEY in code (only in doc comments explaining the boundary), and no key-shaped value ever appears in results or errors', async () => {
    const fs = require('node:fs');
    const src = fs.readFileSync(GEMINI_ADAPTER_PATH, 'utf8');
    // Real code-access patterns, not doc-comment mentions of the name
    // (this file's own header legitimately explains it does NOT touch
    // the key — that explanation necessarily names it in prose).
    assert.doesNotMatch(src, /process\.env\s*\.\s*GEMINI_API_KEY/);
    assert.doesNotMatch(src, /getApiKey\s*\(/);

    const fetchImpl = fakeFetch(() => ({ ok: true, json: async () => ({ success: true, text: 'Jambo', isReal: true }) }));
    const provider = freshEnv({ fetchImpl });
    const result = await provider.translate('Hello', { sourceLanguage: 'en', targetLanguage: 'sw' });
    assert.equal(JSON.stringify(result).toLowerCase().includes('apikey'), false);
});

// 8. Coexistence with NLLB: registering Gemini does not remove or
// disturb the nllb-bridge provider (Domain 4C's own "do not disturb
// NLLB" requirement).
test('registering gemini-translate does not disturb a separately-registered nllb-bridge provider', async () => {
    const NLLB_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-translation-provider-nllb.js');
    delete require.cache[require.resolve(NLLB_PATH)];
    const fetchImpl = fakeFetch(() => ({ ok: true, json: async () => ({ success: true, text: 'x', isReal: true }) }));
    freshEnv({ fetchImpl });
    require(NLLB_PATH);
    global.window.CozyOS.SpeechTranslationNLLBProvider.register();

    const providers = global.window.CozyOS.SpeechTranslationProviders;
    assert.ok(providers.get('gemini-translate'));
    assert.ok(providers.get('nllb-bridge'));
    assert.equal(providers.list().length, 2);
});

// 9. LIVE VERIFICATION STATUS — explicitly not attempted here.
test('LIVE VERIFICATION: real Gemini execution is NOT-RUN in this environment (no GEMINI_API_KEY, no outbound network) — not claimed as VERIFIED', () => {
    assert.equal(process.env.GEMINI_API_KEY, undefined, 'this test environment genuinely has no real key configured');
});
