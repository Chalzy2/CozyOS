'use strict';

/**
 * core/modules/speech/adapters/test/kiswahili-dep1-stt-locale-qualification.test.js
 *
 * Kiswahili Capability Dependency #1 - real end-to-end regression
 * proving the REAL registration -> resolution -> recognition.lang
 * propagation chain, using the real, unmodified cozy-speech.js,
 * speech-language-adapter.js, and speech-recognition-adapter.js
 * together - not fakes standing in for any of them.
 *
 * SCOPE DISCLOSURE (explicit, per the active Kiswahili capability
 * methodology): this proves correct LOCALE PROPAGATION only. It does
 * NOT and cannot prove any improvement in real speech recognition
 * accuracy - that requires a real microphone and real Kiswahili
 * speech on a real device, which this Node-only sandbox does not have.
 * That remains NOT-RUN / DEVICE-DEPENDENT, explicitly, not fabricated.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..', '..', '..');
const COZY_SPEECH_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'cozy-speech.js');
const LANGUAGE_ADAPTER_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-language-adapter.js');
const RECOGNITION_ADAPTER_PATH = path.join(ROOT, 'core', 'modules', 'speech', 'adapters', 'speech-recognition-adapter.js');

function makeFakeApi() {
    class FakeRecognition {
        constructor() {
            FakeRecognition.instances.push(this);
            this.lang = null;
            this.continuous = null;
            this.interimResults = null;
            this.onstart = null; this.onspeechstart = null; this.onspeechend = null;
            this.onerror = null; this.onend = null; this.onresult = null;
        }
        start() { if (this.onstart) this.onstart(); }
        stop() { if (this.onend) this.onend(); }
        abort() { if (this.onend) this.onend(); }
    }
    FakeRecognition.instances = [];
    return FakeRecognition;
}

function freshRealStack() {
    [COZY_SPEECH_PATH, LANGUAGE_ADAPTER_PATH, RECOGNITION_ADAPTER_PATH].forEach((p) => delete require.cache[require.resolve(p)]);
    const Api = makeFakeApi();
    const win = { CozyOS: {}, SpeechRecognition: Api };
    global.window = win;
    require(COZY_SPEECH_PATH);
    require(LANGUAGE_ADAPTER_PATH);
    require(RECOGNITION_ADAPTER_PATH);
    return { win, Api };
}

test('1. Kiswahili remains registered as "sw" (languageCode unchanged)', () => {
    const { win } = freshRealStack();
    const entry = win.CozyOS.CozySpeech.listLanguages().find((l) => l.languageCode === 'sw');
    assert.ok(entry, 'Kiswahili must still be registered under languageCode "sw"');
    assert.equal(entry.name, 'Kiswahili');
});

test('2. the real registry now genuinely stores bcp47Tag "sw-KE" for Kiswahili (the actual defect this dependency fixed)', () => {
    const { win } = freshRealStack();
    const entry = win.CozyOS.CozySpeech.listLanguages().find((l) => l.languageCode === 'sw');
    assert.equal(entry.bcp47Tag, 'sw-KE');
});

test("3. the real SpeechLanguageAdapter.resolve('sw') genuinely returns bcp47 \"sw-KE\", via the real, unmodified adapter", () => {
    const { win } = freshRealStack();
    const result = win.CozyOS.SpeechLanguageAdapter.resolve('sw');
    assert.equal(result.success, true);
    assert.equal(result.bcp47, 'sw-KE');
});

test('4. the real SpeechRecognitionAdapter genuinely sets recognition.lang to the resolved "sw-KE" value (full real chain, not a fake resolver)', () => {
    const { win, Api } = freshRealStack();
    const adapter = win.CozyOS.SpeechRecognitionAdapter;
    adapter.start({ languageCode: 'sw', continuous: true, interimResults: true });
    assert.equal(Api.instances[0].lang, 'sw-KE');
});

test('5a. REGRESSION: other languages without a bcp47Tag override are completely unaffected', () => {
    const { win } = freshRealStack();
    const enEntry = win.CozyOS.CozySpeech.listLanguages().find((l) => l.languageCode === 'en');
    assert.equal(enEntry.bcp47Tag, null, 'languages without an explicit override must store null, exactly like region/family already do');
    const result = win.CozyOS.SpeechLanguageAdapter.resolve('en');
    assert.equal(result.bcp47, 'en');
});

test('5b. REGRESSION: French, Arabic, Somali remain registered and resolve to their own languageCode', () => {
    const { win } = freshRealStack();
    for (const code of ['fr', 'ar', 'so']) {
        const entry = win.CozyOS.CozySpeech.listLanguages().find((l) => l.languageCode === code);
        assert.ok(entry, `${code} must still be registered`);
        assert.equal(entry.bcp47Tag, null);
        const result = win.CozyOS.SpeechLanguageAdapter.resolve(code);
        assert.equal(result.bcp47, code);
    }
});

test("5c. REGRESSION: an unregistered language still fails closed exactly as before", () => {
    const { win } = freshRealStack();
    const result = win.CozyOS.SpeechLanguageAdapter.resolve('zz');
    assert.equal(result.success, false);
    assert.match(result.reason, /not registered/);
});

test("5d. REGRESSION: registerLanguage() with an explicit region still stores region correctly alongside the new, always-present bcp47Tag:null field", () => {
    const { win } = freshRealStack();
    const entry = win.CozyOS.CozySpeech.listLanguages().find((l) => l.languageCode === 'luo');
    assert.ok(entry, 'African language registry entries must remain intact');
    assert.equal(entry.region, 'africa');
    assert.equal(entry.bcp47Tag, null);
});

test('DEVICE LIMITATION (explicit, not fabricated): real recognition-accuracy improvement from sw-KE cannot be verified in this environment', () => {
    console.log('      LIVE KISWAHILI RECOGNITION ACCURACY: NOT-RUN / DEVICE-DEPENDENT (no real microphone or real Kiswahili speech available in this sandbox)');
});
