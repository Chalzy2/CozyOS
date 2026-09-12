/**
 * core/modules/speech/adapters/test/speech-recognition-adapter.test.js
 * Checkpoint: CP14 — Kiswahili Speech Recognition
 * Run with: node --test core/modules/speech/adapters/test/speech-recognition-adapter.test.js
 *
 * VERIFICATION LEVEL, STATED PLAINLY
 * -----------------------------------
 * `window.SpeechRecognition` is a fake constructor here (Node has no
 * real browser speech API). The fake matches the adapter's actual real
 * usage (read from source before writing this fake, not assumed):
 * `.lang`, `.continuous`, `.interimResults` are set, then
 * `.onstart/.onspeechstart/.onspeechend/.onerror/.onend/.onresult` are
 * assigned, then `.start()/.stop()/.abort()` are called. This is
 * UNIT VERIFIED, not Browser-Runtime Verified — no real browser or
 * device is used anywhere in this suite, and that is not claimed
 * anywhere below. The Kiswahili sentences used here come from the
 * controlled fixture file (./fixtures/kiswahili-sentences.js); they are
 * the input fed to the fake recognizer, not a claim about what a real
 * provider will actually transcribe from real audio.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { KISWAHILI_SENTENCES } = require('./fixtures/kiswahili-sentences.js');

const ADAPTER_PATH = path.join(__dirname, '..', 'speech-recognition-adapter.js');

/** Fake SpeechRecognition constructor matching the adapter's actual real usage of the Web Speech API surface. */
function makeFakeApi() {
    class FakeRecognition {
        constructor() {
            FakeRecognition.instances.push(this);
            this.lang = null;
            this.continuous = null;
            this.interimResults = null;
            this.onstart = null;
            this.onspeechstart = null;
            this.onspeechend = null;
            this.onerror = null;
            this.onend = null;
            this.onresult = null;
            this._started = false;
        }
        start() { this._started = true; if (this.onstart) this.onstart(); }
        stop() { if (this.onend) this.onend(); }
        abort() { if (this.onend) this.onend(); }
        /** Test helper: simulates a real provider-side error event. */
        _emitError(errorCode) { if (this.onerror) this.onerror({ error: errorCode }); }
    }
    FakeRecognition.instances = [];
    return FakeRecognition;
}

function load({ Api = makeFakeApi(), CozySpeech, SpeechLanguageAdapter } = {}) {
    delete require.cache[require.resolve(ADAPTER_PATH)];
    global.window = { SpeechRecognition: Api, CozyOS: {} };
    if (CozySpeech) global.window.CozyOS.CozySpeech = CozySpeech;
    if (SpeechLanguageAdapter) global.window.CozyOS.SpeechLanguageAdapter = SpeechLanguageAdapter;
    require(ADAPTER_PATH);
    return { adapter: global.window.CozyOS.SpeechRecognitionAdapter, Api };
}

/** Emits one real-shaped result event: a single alternative, at resultIndex 0. */
function emitOne(recognition, { transcript, confidence, isFinal }) {
    const alt = { transcript, confidence };
    const res = [alt];
    res.isFinal = isFinal;
    recognition.onresult({ resultIndex: 0, results: [res] });
}

// --- isReal() ---

test('isReal(): true only when a real SpeechRecognition/webkitSpeechRecognition constructor exists; never fabricated', () => {
    assert.equal(load({ Api: makeFakeApi() }).adapter.isReal(), true);
    assert.equal(load({ Api: null }).adapter.isReal(), false);
});

// --- Configuration (CP14 item 2/3) ---

test('start(): sw is passed through to the real recognition instance as lang, continuous/interimResults reach it unchanged', () => {
    const { adapter, Api } = load();
    const r = adapter.start({ languageCode: 'sw', continuous: true, interimResults: true });
    assert.equal(r.success, true);
    assert.equal(Api.instances.length, 1);
    assert.equal(Api.instances[0].lang, 'sw');
    assert.equal(Api.instances[0].continuous, true);
    assert.equal(Api.instances[0].interimResults, true);
});

test('start(): sw is validated against the real CozySpeech language registry via SpeechLanguageAdapter when available, not used raw unvalidated', () => {
    let resolveCalledWith = null;
    const SpeechLanguageAdapter = { resolve: (code) => { resolveCalledWith = code; return { success: true, languageCode: code, bcp47: 'sw' }; } };
    const { adapter, Api } = load({ SpeechLanguageAdapter });
    adapter.start({ languageCode: 'sw', continuous: true, interimResults: true });
    assert.equal(resolveCalledWith, 'sw');
    assert.equal(Api.instances[0].lang, 'sw');
});

test('start(): an unregistered language fails closed — never silently substitutes English or any other language', () => {
    const SpeechLanguageAdapter = { resolve: () => ({ success: false, reason: '"zz" is not registered in CozySpeech.registerLanguage().' }) };
    const { adapter, Api } = load({ SpeechLanguageAdapter });
    const errors = [];
    adapter.on('onError', (e) => errors.push(e));
    const r = adapter.start({ languageCode: 'zz' });
    assert.equal(r.success, false);
    assert.equal(Api.instances.length, 0, 'must never construct a real recognition instance for an unregistered language');
    assert.equal(errors.length, 1, 'the failure must also surface through the real onError event, not just the return value');
    assert.equal(errors[0].error, 'language-not-supported');
});

// --- Interim vs final results (CP14 item 4) ---

test('onResult fires for every result; onPartialResult and onFinalResult are mutually exclusive per event, matching isFinal', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const seen = { onResult: [], onPartialResult: [], onFinalResult: [] };
    adapter.on('onResult', (p) => seen.onResult.push(p));
    adapter.on('onPartialResult', (p) => seen.onPartialResult.push(p));
    adapter.on('onFinalResult', (p) => seen.onFinalResult.push(p));

    const fixture = KISWAHILI_SENTENCES.find((s) => s.id === 'church-1');
    emitOne(Api.instances[0], { transcript: fixture.interimPrefix, confidence: null, isFinal: false });
    emitOne(Api.instances[0], { transcript: fixture.text, confidence: 0.87, isFinal: true });

    assert.equal(seen.onResult.length, 2);
    assert.equal(seen.onPartialResult.length, 1);
    assert.equal(seen.onFinalResult.length, 1);
    assert.equal(seen.onPartialResult[0].transcript, fixture.interimPrefix);
    assert.equal(seen.onFinalResult[0].transcript, fixture.text);
});

// --- Confidence (CP14 item 9) ---

test('confidence: a real numeric confidence from the provider is preserved exactly, never rounded/invented', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const results = [];
    adapter.on('onFinalResult', (p) => results.push(p));
    emitOne(Api.instances[0], { transcript: 'Habari yako', confidence: 0.734, isFinal: true });
    assert.equal(results[0].confidence, 0.734);
});

test('confidence: "unavailable" (never null, never a fabricated percentage) when the provider supplies no numeric confidence', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const results = [];
    adapter.on('onFinalResult', (p) => results.push(p));
    emitOne(Api.instances[0], { transcript: 'Habari yako', confidence: undefined, isFinal: true });
    assert.equal(results[0].confidence, 'unavailable');
});

// --- Multiple segments / empty result ---

test('multiple segments: two consecutive final segments each fire their own onFinalResult', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const finals = [];
    adapter.on('onFinalResult', (p) => finals.push(p.transcript));
    emitOne(Api.instances[0], { transcript: 'Karibu.', confidence: 0.9, isFinal: true });
    emitOne(Api.instances[0], { transcript: 'Tafadhali keti.', confidence: 0.9, isFinal: true });
    assert.deepEqual(finals, ['Karibu.', 'Tafadhali keti.']);
});

test('empty result: an empty transcript is still forwarded honestly, never dropped silently', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const finals = [];
    adapter.on('onFinalResult', (p) => finals.push(p));
    emitOne(Api.instances[0], { transcript: '', confidence: 'unavailable', isFinal: true });
    assert.equal(finals.length, 1);
    assert.equal(finals[0].transcript, '');
});

// --- Lifecycle ---

test('start() while active is refused; stop() then start() again works cleanly', () => {
    const { adapter } = load();
    const first = adapter.start({ languageCode: 'sw' });
    assert.equal(first.success, true);
    const second = adapter.start({ languageCode: 'sw' });
    assert.equal(second.success, false);
    assert.match(second.reason, /already active/);
    adapter.stop();
    const third = adapter.start({ languageCode: 'sw' });
    assert.equal(third.success, true);
});

test('stop(): sets wasExpectedStop:true on the resulting onStop event', () => {
    const { adapter, Api } = load();
    const stops = [];
    adapter.on('onStop', (p) => stops.push(p));
    adapter.start({ languageCode: 'sw' });
    adapter.stop();
    assert.equal(stops.length, 1);
    assert.equal(stops[0].wasExpectedStop, true);
});

test('unexpected stop: the recognition engine ending on its own (browser fires onend without a prior stop()/cancel()) reports wasExpectedStop:false', () => {
    const { adapter, Api } = load();
    const stops = [];
    adapter.on('onStop', (p) => stops.push(p));
    adapter.start({ languageCode: 'sw' });
    // Simulate the browser itself ending the session (e.g. network drop),
    // not this adapter's own stop()/cancel().
    Api.instances[0].onend();
    assert.equal(stops.length, 1);
    assert.equal(stops[0].wasExpectedStop, false);
});

test('no duplicate listeners: off() removes exactly the given handler, leaving other handlers on the same event intact', () => {
    const { adapter, Api } = load();
    let aCount = 0, bCount = 0;
    const a = () => aCount++;
    const b = () => bCount++;
    adapter.on('onFinalResult', a);
    adapter.on('onFinalResult', b);
    adapter.off('onFinalResult', a);
    adapter.start({ languageCode: 'sw' });
    emitOne(Api.instances[0], { transcript: 'x', confidence: 0.5, isFinal: true });
    assert.equal(aCount, 0);
    assert.equal(bCount, 1);
});

// --- Errors ---

test('errors: provider error codes are forwarded faithfully (no-speech, network, audio-capture, not-allowed) — never relabeled', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const errors = [];
    adapter.on('onError', (e) => errors.push(e.error));
    ['no-speech', 'network', 'audio-capture', 'not-allowed', 'aborted'].forEach((code) => Api.instances[0]._emitError(code));
    assert.deepEqual(errors, ['no-speech', 'network', 'audio-capture', 'not-allowed', 'aborted']);
});

test('errors: no SpeechRecognition constructor at all fails closed via both the return value and an onError event', () => {
    const { adapter } = load({ Api: null });
    const errors = [];
    adapter.on('onError', (e) => errors.push(e));
    const r = adapter.start({ languageCode: 'sw' });
    assert.equal(r.success, false);
    assert.match(r.reason, /No SpeechRecognition/);
    assert.equal(errors.length, 1);
});

// --- Performance measurement (CP14 item 18) — real timestamps only ---

test('getLastTimings(): records real, measured timestamps for start-requested, recognition-started, first interim, first final — never a claimed duration', () => {
    const { adapter, Api } = load();
    const before = Date.now();
    adapter.start({ languageCode: 'sw' });
    emitOne(Api.instances[0], { transcript: 'Habari', confidence: null, isFinal: false });
    emitOne(Api.instances[0], { transcript: 'Habari yako', confidence: 0.9, isFinal: true });
    const timings = adapter.getLastTimings();
    assert.ok(timings.startRequestedAt >= before);
    assert.ok(timings.recognitionStartedAt >= timings.startRequestedAt);
    assert.ok(timings.firstInterimAt >= timings.recognitionStartedAt);
    assert.ok(timings.firstFinalAt >= timings.firstInterimAt);
});

test('getLastTimings(): fields not yet reached by a real event stay null, never fabricated', () => {
    const { adapter } = load();
    adapter.start({ languageCode: 'sw' });
    const timings = adapter.getLastTimings();
    assert.equal(timings.firstInterimAt, null);
    assert.equal(timings.firstFinalAt, null);
});

// --- CP14 continuation: expected vs unexpected stop, verified from both stop() and cancel() ---

test('expected stop: cancel() also reports wasExpectedStop:true (same as stop()), never treated as an unexpected provider-side end', () => {
    const { adapter, Api } = load();
    const stops = [];
    adapter.on('onStop', (p) => stops.push(p));
    adapter.start({ languageCode: 'sw' });
    adapter.cancel();
    assert.equal(stops.length, 1);
    assert.equal(stops[0].wasExpectedStop, true);
});

test('no automatic restart: an unexpected provider-side end does not itself call start() again anywhere in the adapter', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const instanceCountBefore = Api.instances.length;
    Api.instances[0].onend(); // simulates the browser ending the session on its own
    assert.equal(Api.instances.length, instanceCountBefore, 'the adapter must never construct a new recognition instance on its own after an unexpected end — no auto-restart, no restart-loop risk');
    assert.equal(adapter.isActive(), false);
});

// --- CP14 continuation: unsupported recognition / provider failure, tested separately so failures don't collapse into one generic case ---

test('unsupported recognition capability: a real "service-not-allowed" provider error is forwarded faithfully as its own error code, not relabeled as a generic failure', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const errors = [];
    adapter.on('onError', (e) => errors.push(e.error));
    Api.instances[0]._emitError('service-not-allowed');
    assert.deepEqual(errors, ['service-not-allowed']);
});

test('provider failure: a real recognition.start() rejection (e.g. the OS/browser refusing a second concurrent session) surfaces its own distinct reason text, not a generic message', () => {
    const Api = makeFakeApi();
    class ThrowingApi extends Api {
        start() { throw new Error('already running elsewhere'); }
    }
    const { adapter } = load({ Api: ThrowingApi });
    const r = adapter.start({ languageCode: 'sw' });
    assert.equal(r.success, false);
    assert.match(r.reason, /Real recognition\.start\(\) rejection: already running elsewhere/);
});

test('network-related recognition failure: forwarded as its own "network" error code, distinct from "no-speech" and "audio-capture"', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const errors = [];
    adapter.on('onError', (e) => errors.push(e.error));
    Api.instances[0]._emitError('network');
    assert.deepEqual(errors, ['network']);
});

test('no-speech condition: forwarded as its own "no-speech" error code', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const errors = [];
    adapter.on('onError', (e) => errors.push(e.error));
    Api.instances[0]._emitError('no-speech');
    assert.deepEqual(errors, ['no-speech']);
});

// --- CP14 continuation: raw transcript boundary ---

test('raw transcript: the provider transcript reaches onResult/onFinalResult exactly as supplied — implemented. There is no normalized-transcript field anywhere in this adapter — not yet implemented, and not fabricated here.', () => {
    const { adapter, Api } = load();
    adapter.start({ languageCode: 'sw' });
    const finals = [];
    adapter.on('onFinalResult', (p) => finals.push(p));
    const rawText = '  Habari... ZANGU  ';
    emitOne(Api.instances[0], { transcript: rawText, confidence: 0.7, isFinal: true });
    assert.equal(finals[0].transcript, rawText);
    assert.equal('normalizedTranscript' in finals[0], false);
});

// --- CP14 continuation: full Kiswahili fixture coverage across all categories ---

test('Kiswahili fixtures: every controlled fixture (greetings, church, questions, numbers, names, punctuation) round-trips through interim -> final unmodified', () => {
    const categoriesSeen = new Set();
    for (const fixture of KISWAHILI_SENTENCES) {
        const { adapter, Api } = load();
        adapter.start({ languageCode: 'sw', continuous: true, interimResults: true });
        const partials = [];
        const finals = [];
        adapter.on('onPartialResult', (p) => partials.push(p));
        adapter.on('onFinalResult', (p) => finals.push(p));
        emitOne(Api.instances[0], { transcript: fixture.interimPrefix, confidence: null, isFinal: false });
        emitOne(Api.instances[0], { transcript: fixture.text, confidence: 0.9, isFinal: true });
        assert.equal(partials[0].transcript, fixture.interimPrefix, `fixture ${fixture.id}`);
        assert.equal(finals[0].transcript, fixture.text, `fixture ${fixture.id}`);
        categoriesSeen.add(fixture.category);
    }
    assert.deepEqual([...categoriesSeen].sort(), ['church', 'conversation', 'greeting', 'names', 'numbers', 'pause', 'punctuation', 'question'].sort());
});
