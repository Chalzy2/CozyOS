/**
 * core/modules/speech/adapters/test/kiswahili-language-path.test.js
 * Checkpoint: CP14 — Kiswahili Speech Recognition
 * Run with: node --test core/modules/speech/adapters/test/kiswahili-language-path.test.js
 *
 * PURPOSE
 *   CP14 spec item 3 ("Verify Kiswahili Language Path") asks for proof
 *   that "sw" is validated through the REAL language registry rather
 *   than treated as an arbitrary string. Every other CP14 test file
 *   fakes SpeechLanguageAdapter/CozySpeech for isolation. This file
 *   deliberately does the opposite: it loads the REAL
 *   core/modules/speech/cozy-speech.js (the actual language registry,
 *   confirmed by reading it — "sw"/"Kiswahili" is seeded there, not
 *   invented for this test) and the REAL
 *   core/modules/speech/adapters/speech-language-adapter.js, and only
 *   fakes the one thing Node genuinely cannot provide: the browser's
 *   SpeechRecognition constructor.
 *
 * VERIFICATION LEVEL
 *   UNIT VERIFIED with real first-party modules wired together (no
 *   `require`-mocking of cozy-speech.js or speech-language-adapter.js
 *   themselves). Still NOT Browser-Runtime Verified — no real browser
 *   or device is used anywhere in this suite.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const COZY_SPEECH_PATH = path.join(__dirname, '..', '..', 'cozy-speech.js');
const LANGUAGE_ADAPTER_PATH = path.join(__dirname, '..', 'speech-language-adapter.js');
const RECOGNITION_ADAPTER_PATH = path.join(__dirname, '..', 'speech-recognition-adapter.js');

function makeFakeApi() {
    class FakeRecognition {
        constructor() { FakeRecognition.instances.push(this); this.onstart = null; }
        start() { if (this.onstart) this.onstart(); }
        stop() {}
        abort() {}
    }
    FakeRecognition.instances = [];
    return FakeRecognition;
}

/** Loads the real cozy-speech.js -> real speech-language-adapter.js -> real speech-recognition-adapter.js, in that real dependency order, into a fresh window. */
function loadRealChain(Api) {
    [COZY_SPEECH_PATH, LANGUAGE_ADAPTER_PATH, RECOGNITION_ADAPTER_PATH].forEach((p) => delete require.cache[require.resolve(p)]);
    global.window = { SpeechRecognition: Api, CozyOS: {} };
    require(COZY_SPEECH_PATH);
    require(LANGUAGE_ADAPTER_PATH);
    require(RECOGNITION_ADAPTER_PATH);
    return global.window.CozyOS;
}

test('real registry: "sw"/"Kiswahili" is actually registered in CozySpeech before any recognition attempt — not assumed, read from the real registry', () => {
    const CozyOS = loadRealChain(makeFakeApi());
    const known = CozyOS.CozySpeech.listLanguages().find((l) => l.languageCode === 'sw');
    assert.ok(known, '"sw" must be a real entry in CozySpeech.listLanguages()');
    assert.equal(known.name, 'Kiswahili');
});

test('real path: SpeechLanguageAdapter.resolve("sw") succeeds against the real registry (not a fake), returning the registry\'s own value — no invented locale', () => {
    const CozyOS = loadRealChain(makeFakeApi());
    const resolved = CozyOS.SpeechLanguageAdapter.resolve('sw');
    assert.equal(resolved.success, true);
    assert.equal(resolved.bcp47, 'sw', 'the real registry has no bcp47Tag field for "sw" yet, so the honest resolved value is the registry\'s own "sw" code — not an invented "sw-KE"/"sw-TZ" tag');
});

test('real path: an unregistered language code fails closed through the real registry — never silently substitutes English', () => {
    const CozyOS = loadRealChain(makeFakeApi());
    const resolved = CozyOS.SpeechLanguageAdapter.resolve('zz-not-a-real-language');
    assert.equal(resolved.success, false);
    assert.match(resolved.reason, /not registered in CozySpeech/);
});

test('full real path: Living Hearing config { languageCode:"sw", continuous:true, interimResults:true } reaches the real recognition instance exactly as validated by the real registry chain', () => {
    const Api = makeFakeApi();
    const CozyOS = loadRealChain(Api);
    const result = CozyOS.SpeechRecognitionAdapter.start({ languageCode: 'sw', continuous: true, interimResults: true, sessionId: 'cp14-path-check' });
    assert.equal(result.success, true);
    assert.equal(Api.instances.length, 1);
    assert.equal(Api.instances[0].lang, 'sw', 'the language actually set on the real recognition instance must be the real registry\'s resolved value, not a raw/guessed string');
    assert.equal(Api.instances[0].continuous, true, 'continuous must reach the real provider unchanged — not silently discarded by an intermediate wrapper');
    assert.equal(Api.instances[0].interimResults, true, 'interimResults must reach the real provider unchanged — not silently discarded by an intermediate wrapper');
});

test('full real path: a language never registered in CozySpeech is refused before a real recognition instance is ever constructed', () => {
    const Api = makeFakeApi();
    const CozyOS = loadRealChain(Api);
    const result = CozyOS.SpeechRecognitionAdapter.start({ languageCode: 'klingon', continuous: true, interimResults: true });
    assert.equal(result.success, false);
    assert.equal(Api.instances.length, 0, 'must never construct a real recognition instance for a language the real registry does not know');
});
