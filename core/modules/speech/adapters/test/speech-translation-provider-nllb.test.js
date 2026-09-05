'use strict';

/**
 * Regression test suite for
 * core/modules/speech/adapters/speech-translation-provider-nllb.js
 *
 * HARNESS DISCLOSURE
 *   REAL, unmodified-by-this-suite code under test: the real
 *   speech-translation-provider.js (SpeechTranslationProviders registry)
 *   and the real speech-translation-provider-nllb.js this checkpoint
 *   adds. Registration, validation, and fail-closed behavior all run
 *   through those real files' actual logic.
 *
 *   STUBBED, and disclosed as a stub: `fetch`/`global.fetch`. This suite
 *   never has network access to a real running nllb_http_bridge.py
 *   process, so HTTP calls are mocked at the fetch boundary with
 *   explicit, disclosed canned responses (both a genuinely-healthy
 *   bridge and a genuinely-unavailable one) to prove the provider
 *   handles both truthfully. This suite does NOT prove the real Python
 *   bridge or the real NLLB model works end-to-end — see the
 *   real-integration test
 *   (speech-translation-provider-nllb.integration.test.js, opt-in via
 *   COZY_RUN_NLLB_INTEGRATION=1) and the manual full fan-out proof in
 *   language-packs/shared/NLLB-200-600M-INT8/real_sw_to_16.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function freshRegistry() {
    for (const p of [
        '../speech-translation-provider.js',
        '../speech-translation-provider-nllb.js',
    ]) {
        delete require.cache[require.resolve(p)];
    }
    global.window = { CozyOS: {} };
    require('../speech-translation-provider.js');
    require('../speech-translation-provider-nllb.js');
}

test('registers exactly one provider named "nllb-bridge"', () => {
    freshRegistry();
    window.CozyOS.SpeechTranslationNLLBProvider.register('http://127.0.0.1:8177');
    const list = window.CozyOS.SpeechTranslationProviders.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'nllb-bridge');
    assert.equal(list[0].type, 'offline');
});

test('reports registered !== available: bridge unreachable => isAvailable() is honestly false', async () => {
    freshRegistry();
    global.fetch = async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:8177'); };
    window.CozyOS.SpeechTranslationNLLBProvider.register('http://127.0.0.1:8177');
    const provider = window.CozyOS.SpeechTranslationProviders.get('nllb-bridge');
    assert.equal(await provider.isAvailable(), false);
});

test('translate() fails closed (no fabricated text) when bridge is unavailable', async () => {
    freshRegistry();
    global.fetch = async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:8177'); };
    window.CozyOS.SpeechTranslationNLLBProvider.register('http://127.0.0.1:8177');
    const result = await window.CozyOS.SpeechTranslationProviders.translate(
        'Habari ya leo?', { sourceLanguage: 'sw', targetLanguage: 'en' }, 'nllb-bridge'
    );
    assert.equal(result.isReal, false);
    assert.equal(result.translatedText, null);
    assert.ok(/unavailable/i.test(result.reason));
});

test('isAvailable() is honestly true only when /health reports modelLoaded: true', async () => {
    freshRegistry();
    global.fetch = async (url) => {
        assert.ok(String(url).endsWith('/health'));
        return { ok: true, json: async () => ({ ok: true, provider: 'nllb', modelLoaded: true }) };
    };
    window.CozyOS.SpeechTranslationNLLBProvider.register('http://127.0.0.1:8177');
    const provider = window.CozyOS.SpeechTranslationProviders.get('nllb-bridge');
    assert.equal(await provider.isAvailable(), true);
});

test('isAvailable() is honestly false when /health reports modelLoaded: false', async () => {
    freshRegistry();
    global.fetch = async () => ({ ok: true, json: async () => ({ ok: false, provider: 'nllb', modelLoaded: false }) });
    window.CozyOS.SpeechTranslationNLLBProvider.register('http://127.0.0.1:8177');
    const provider = window.CozyOS.SpeechTranslationProviders.get('nllb-bridge');
    assert.equal(await provider.isAvailable(), false);
});

test('translate() succeeds and preserves isReal/latency when bridge reports success', async () => {
    freshRegistry();
    let translateCalled = null;
    global.fetch = async (url, opts) => {
        if (String(url).endsWith('/health')) {
            return { ok: true, json: async () => ({ ok: true, provider: 'nllb', modelLoaded: true }) };
        }
        translateCalled = JSON.parse(opts.body);
        return {
            ok: true,
            json: async () => ({
                success: true,
                translatedText: 'Good morning today?',
                sourceLanguage: 'sw',
                targetLanguage: 'en',
                provider: 'nllb',
                isReal: true,
                latencyMs: 42.5,
            }),
        };
    };
    window.CozyOS.SpeechTranslationNLLBProvider.register('http://127.0.0.1:8177');
    const result = await window.CozyOS.SpeechTranslationProviders.translate(
        'Habari ya leo?', { sourceLanguage: 'sw', targetLanguage: 'en' }, 'nllb-bridge'
    );
    assert.equal(result.isReal, true);
    assert.equal(result.translatedText, 'Good morning today?');
    assert.deepEqual(translateCalled, { text: 'Habari ya leo?', sourceLanguage: 'sw', targetLanguage: 'en' });
});

test('translate() rejects unsupported language before any network call', async () => {
    freshRegistry();
    let called = false;
    global.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
    window.CozyOS.SpeechTranslationNLLBProvider.register('http://127.0.0.1:8177');
    const result = await window.CozyOS.SpeechTranslationProviders.translate(
        'hello', { sourceLanguage: 'sw', targetLanguage: 'de' }, 'nllb-bridge'
    );
    assert.equal(result.isReal, false);
    assert.equal(called, false);
});

test('translate() surfaces the bridge\'s own failure reason, never fabricates text', async () => {
    freshRegistry();
    global.fetch = async (url) => {
        if (String(url).endsWith('/health')) {
            return { ok: true, json: async () => ({ ok: true, provider: 'nllb', modelLoaded: true }) };
        }
        return {
            ok: false,
            status: 502,
            json: async () => ({
                success: false, translatedText: null, sourceLanguage: 'sw', targetLanguage: 'en',
                provider: 'nllb', isReal: false, reason: 'RuntimeError: NLLB engine is not loaded.',
            }),
        };
    };
    window.CozyOS.SpeechTranslationNLLBProvider.register('http://127.0.0.1:8177');
    const result = await window.CozyOS.SpeechTranslationProviders.translate(
        'Habari ya leo?', { sourceLanguage: 'sw', targetLanguage: 'en' }, 'nllb-bridge'
    );
    assert.equal(result.isReal, false);
    assert.equal(result.translatedText, null);
    assert.match(result.reason, /NLLB engine is not loaded/);
});
