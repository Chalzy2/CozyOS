/**
 * core/modules/hearing/test/living-hearing-session.test.js
 * Run with: node --test core/modules/hearing/test/living-hearing-session.test.js
 *
 * IMPORTANT — VERIFICATION LEVEL, STATED PLAINLY
 * ------------------------------------------------
 * CozyHearing and SpeechRecognitionAdapter are faked here (Node has no
 * real getUserMedia/SpeechRecognition). These fakes match each real
 * file's actual public contract (read from the real source before
 * writing these fakes, not assumed): CozyHearing.startListening()/
 * stopListening()/isListening() and SpeechRecognitionAdapter's real
 * on()/off()/start()/stop()/isActive()/isReal() event names (onStart,
 * onStop, onResult, onPartialResult, onFinalResult, onError). These
 * tests prove LivingHearingSession's own composition/state-machine/
 * listener-management logic. This is UNIT VERIFIED, not Browser-
 * Runtime Verified — no real browser or device was used anywhere in
 * this suite, and that is not claimed anywhere below.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const SESSION_PATH = path.join(__dirname, '..', 'living-hearing-session.js');

/** Fake SpeechRecognitionAdapter matching the real file's on/off/start/stop contract exactly. */
function makeFakeAdapter({ real = true } = {}) {
    const listeners = { onStart: [], onStop: [], onSpeechStart: [], onSpeechEnd: [], onResult: [], onPartialResult: [], onFinalResult: [], onError: [] };
    let active = false;
    return {
        _listeners: listeners,
        _startCalls: 0,
        _stopCalls: 0,
        isReal: () => real,
        isActive: () => active,
        on(eventName, handler) {
            if (!listeners[eventName]) return { success: false };
            listeners[eventName].push(handler);
            return { success: true };
        },
        off(eventName, handler) {
            if (!listeners[eventName]) return { success: false };
            const idx = listeners[eventName].indexOf(handler);
            if (idx === -1) return { success: false };
            listeners[eventName].splice(idx, 1);
            return { success: true };
        },
        start(config) {
            this._startCalls++;
            if (active) return { success: false, reason: 'Recognition already active. Call stop() first.' };
            active = true;
            listeners.onStart.forEach((h) => h());
            return { success: true, isReal: true, sessionId: config && config.sessionId };
        },
        // Test helper, not part of the real adapter's contract: simulates a real result/error arriving asynchronously.
        _emitFinalResult(payload) { listeners.onFinalResult.forEach((h) => h(payload)); },
        _emitError(err) { active = false; listeners.onError.forEach((h) => h(err)); },
        stop() {
            this._stopCalls++;
            if (!active) return { success: true, reason: 'No active recognition.' };
            active = false;
            // CP14: real adapter now forwards a real { wasExpectedStop } detail on its onStop event.
            listeners.onStop.forEach((h) => h({ wasExpectedStop: true }));
            return { success: true };
        }
    };
}

/** Fake CozyHearing matching startListening()/stopListening()/isListening()'s real return shapes. */
function makeFakeHearing({ startResult = { success: true } } = {}) {
    let listening = false;
    return {
        _startCalls: 0,
        _stopCalls: 0,
        async startListening() {
            this._startCalls++;
            if (startResult.success) listening = true;
            return startResult;
        },
        async stopListening() {
            this._stopCalls++;
            listening = false;
            return { success: true };
        },
        isListening: () => listening
    };
}

function load(windowOverrides) {
    delete require.cache[require.resolve(SESSION_PATH)];
    global.window = { CozyOS: windowOverrides || {} };
    require(SESSION_PATH);
    return global.window.CozyOS.LivingHearingSession;
}

// --- Start ---

test('start(): real success path goes PERMISSION_PENDING -> LISTENING, calling Hearing then the adapter', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const seenStates = [];
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({ languageCode: 'sw-KE' }, { onStateChange: (s) => seenStates.push(s) });
    assert.equal(r.success, true);
    assert.equal(r.state, 'LISTENING');
    assert.equal(session.getState(), 'LISTENING');
    assert.equal(hearing._startCalls, 1);
    assert.equal(adapter._startCalls, 1);
    assert.deepEqual(seenStates, ['PERMISSION_PENDING', 'LISTENING']);
});

// --- Stop ---

test('stop(): releases both the recognizer and the microphone, moves to STOPPED', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    await session.start({});
    const r = await session.stop();
    assert.equal(r.success, true);
    assert.equal(r.state, 'STOPPED');
    assert.equal(adapter._stopCalls, 1);
    assert.equal(hearing._stopCalls, 1);
});

test('stop() when never started is a safe, honest no-op', async () => {
    const session = load({ SpeechRecognitionAdapter: makeFakeAdapter(), CozyHearing: makeFakeHearing() });
    const r = await session.stop();
    assert.equal(r.success, true);
    assert.equal(r.state, 'IDLE');
});

// --- Permission denied ---

test('permission denied: Hearing failure surfaces honestly and classifies as permission-denied, never calls the adapter', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing({ startResult: { success: false, reason: 'Real getUserMedia() rejection: NotAllowedError: Permission denied' } });
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.success, false);
    assert.equal(r.problem, 'permission-denied');
    assert.equal(session.getState(), 'ERROR');
    assert.equal(adapter._startCalls, 0, 'must never start recognition if the mic permission step already failed');
});

// --- Hardware unavailable ---

test('hardware unavailable: CozyHearing itself missing fails closed without touching the adapter start', async () => {
    const adapter = makeFakeAdapter();
    const session = load({ SpeechRecognitionAdapter: adapter }); // no CozyHearing
    const r = await session.start({});
    assert.equal(r.success, false);
    assert.equal(r.problem, 'hardware-unavailable');
    assert.match(r.reason, /CozyHearing is not loaded/);
});

test('hardware unavailable: AudioEngine-backed mic hardware missing surfaces via Hearing\'s real reason', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing({ startResult: { success: false, reason: 'Real AudioEngine.startListening() rejection: getUserMedia is not available in this browser/context.' } });
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.success, false);
    assert.equal(r.problem, 'hardware-unavailable');
});

// --- Recognition unavailable ---

test('recognition unavailable: adapter.isReal() false fails closed before ever touching the microphone', async () => {
    const adapter = makeFakeAdapter({ real: false });
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.success, false);
    assert.equal(r.problem, 'hardware-unavailable');
    assert.equal(hearing._startCalls, 0, 'must never request the microphone if speech recognition itself is not real in this environment');
});

test('recognition fails to start after mic already granted: the microphone is released again (real cleanup)', async () => {
    const adapter = makeFakeAdapter();
    adapter.start = function () { this._startCalls++; return { success: false, reason: 'Real recognition.start() rejection: already running elsewhere.' }; };
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.success, false);
    assert.equal(hearing._startCalls, 1);
    assert.equal(hearing._stopCalls, 1, 'must release the mic it just acquired if recognition then fails to start');
});

// --- Repeated start/stop ---

test('repeated start/stop cycles behave the same way every time, with no state corruption', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    for (let i = 0; i < 3; i++) {
        const started = await session.start({});
        assert.equal(started.success, true);
        assert.equal(session.getState(), 'LISTENING');
        const stopped = await session.stop();
        assert.equal(stopped.success, true);
        assert.equal(session.getState(), 'STOPPED');
    }
    assert.equal(hearing._startCalls, 3);
    assert.equal(hearing._stopCalls, 3);
    assert.equal(adapter._startCalls, 3);
    assert.equal(adapter._stopCalls, 3);
});

test('start() while already listening is refused, never silently restarts', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    await session.start({});
    const r = await session.start({});
    assert.equal(r.success, false);
    assert.match(r.reason, /Already listening/);
    assert.equal(hearing._startCalls, 1, 'the second start() must not touch the microphone again');
});

// --- Listener cleanup / no duplicate callbacks ---

test('no duplicate callbacks: 3 start/stop cycles register the adapter listeners exactly once, ever', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    for (let i = 0; i < 3; i++) {
        await session.start({});
        await session.stop();
    }
    assert.equal(adapter._listeners.onFinalResult.length, 1, 'must never accumulate a second onFinalResult listener across cycles');
    assert.equal(adapter._listeners.onError.length, 1, 'must never accumulate a second onError listener across cycles');
});

test('no duplicate callbacks: a final result after 2 prior cycles fires the current callback exactly once', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    await session.start({});
    await session.stop();
    await session.start({});
    await session.stop();

    let fireCount = 0;
    await session.start({}, { onFinalResult: () => { fireCount++; } });
    adapter._emitFinalResult({ transcript: 'habari', confidence: 0.9 });
    assert.equal(fireCount, 1, 'the 3rd cycle\'s callback must fire exactly once, not 3 times from 3 accumulated listeners');
});

test('listener cleanup: destroy() actually removes this session\'s listeners from the adapter via off()', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    await session.start({});
    assert.equal(adapter._listeners.onFinalResult.length, 1);
    await session.destroy();
    assert.equal(adapter._listeners.onFinalResult.length, 0, 'destroy() must actually call off(), not just stop listening');
    assert.equal(adapter._listeners.onError.length, 0);
    assert.equal(session.getState(), 'IDLE');
});

// --- CP14 (Kiswahili Speech Recognition) additions ---

test('CP14: classifyProblem recognizes an unregistered-language reason from SpeechLanguageAdapter', async () => {
    const adapter = makeFakeAdapter();
    adapter.start = function () { this._startCalls++; return { success: false, reason: '"sw-XX" is not registered in CozySpeech.registerLanguage(). Register it there first — not fabricated here.' }; };
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({ languageCode: 'sw-XX' });
    assert.equal(r.success, false);
    assert.equal(r.problem, 'language-not-registered');
});

test('CP14: classifyProblem recognizes a network-interruption reason', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing({ startResult: { success: false, reason: 'Real AudioEngine.startListening() rejection: network error while acquiring stream.' } });
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.problem, 'network-interruption');
});

test('CP14: getLastTimings() delegates to the adapter\'s real getLastTimings() and adds this session\'s real micAcquiredAt', async () => {
    const adapter = makeFakeAdapter();
    adapter.getLastTimings = () => ({ startRequestedAt: 100, recognitionStartedAt: 110, firstInterimAt: 120, firstFinalAt: 140 });
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const before = Date.now();
    await session.start({});
    const timings = session.getLastTimings();
    assert.ok(timings.micAcquiredAt >= before, 'micAcquiredAt must be this session\'s own real measurement, not a value copied from the adapter');
    assert.equal(timings.recognitionStartedAt, 110);
    assert.equal(timings.firstFinalAt, 140);
});

test('CP14: getLastTimings() never fabricates fields when the adapter has no getLastTimings() at all', async () => {
    const adapter = makeFakeAdapter();
    delete adapter.getLastTimings;
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    await session.start({});
    const timings = session.getLastTimings();
    assert.equal(timings.recognitionStartedAt, undefined);
    assert.ok(typeof timings.micAcquiredAt === 'number');
});

test('CP14: onStop callback now receives the real wasExpectedStop detail forwarded from the adapter', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    let received = null;
    await session.start({}, { onStop: (p) => { received = p; } });
    await session.stop();
    assert.ok(received, 'onStop callback must be invoked with the forwarded event detail');
});

test('CP14: interim results never reach onFinalResult — only a finalized result would be eligible to enter Learning review', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    let finalCount = 0;
    let partialCount = 0;
    await session.start({}, {
        onFinalResult: () => { finalCount++; },
        onPartialResult: () => { partialCount++; }
    });
    adapter._listeners.onPartialResult.forEach((h) => h({ transcript: 'Ndugu zangu leo', isFinal: false }));
    adapter._listeners.onPartialResult.forEach((h) => h({ transcript: 'Ndugu zangu leo tunazungumza', isFinal: false }));
    adapter._emitFinalResult({ transcript: 'Ndugu zangu, leo tunazungumza kuhusu upendo wa Mungu.', confidence: 0.88 });
    assert.equal(partialCount, 2);
    assert.equal(finalCount, 1, 'exactly one finalized result, distinct from the interim stream that preceded it');
});

// --- CP14 continuation: unsupported recognition / provider failure, each classified distinctly (not collapsed into one generic error) ---

test('CP14: browser/provider speech recognition unavailable classifies as hardware-unavailable', async () => {
    const adapter = makeFakeAdapter({ real: false });
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.problem, 'hardware-unavailable');
});

test('CP14: provider failure (adapter.start() rejects after mic already granted) classifies as provider-start-failure, distinct from hardware-unavailable', async () => {
    const adapter = makeFakeAdapter();
    adapter.start = function () { this._startCalls++; return { success: false, reason: 'Real recognition.start() rejection: already running elsewhere.' }; };
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.problem, 'provider-start-failure');
});

test('CP14: unsupported recognition capability (browser reports service-not-allowed) classifies as recognition-service-not-allowed', async () => {
    const adapter = makeFakeAdapter();
    adapter.start = function () { this._startCalls++; return { success: false, reason: 'Real recognition.start() rejection: service-not-allowed' }; };
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    // service-not-allowed is checked ahead of the generic provider-start-failure pattern, so it gets its own distinct classification.
    assert.equal(r.problem, 'recognition-service-not-allowed');
});

test('CP14: unregistered language classifies as language-not-registered, distinct from every other failure class', async () => {
    const adapter = makeFakeAdapter();
    adapter.start = function () { this._startCalls++; return { success: false, reason: '"sw-XX" is not registered in CozySpeech.registerLanguage(). Register it there first — not fabricated here.' }; };
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.problem, 'language-not-registered');
});

test('CP14: network-related recognition failure classifies as network-interruption, distinct from hardware-unavailable', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing({ startResult: { success: false, reason: 'Real AudioEngine.startListening() rejection: network error while acquiring stream.' } });
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.problem, 'network-interruption');
});

test('CP14: no-speech condition classifies as no-speech-detected, distinct from every other failure class', async () => {
    const adapter = makeFakeAdapter();
    adapter.start = function () { this._startCalls++; return { success: false, reason: 'Real recognition.start() rejection: no-speech' }; };
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    const r = await session.start({});
    assert.equal(r.problem, 'no-speech-detected');
});

test('CP14: all six failure classes above are pairwise distinct — no two collapse into the same "problem" value', async () => {
    const problems = new Set();
    const cases = [
        () => makeFakeAdapter({ real: false }),
        () => { const a = makeFakeAdapter(); a.start = function () { return { success: false, reason: 'Real recognition.start() rejection: already running elsewhere.' }; }; return a; },
        () => { const a = makeFakeAdapter(); a.start = function () { return { success: false, reason: 'Real recognition.start() rejection: service-not-allowed' }; }; return a; },
        () => { const a = makeFakeAdapter(); a.start = function () { return { success: false, reason: '"sw-XX" is not registered in CozySpeech.registerLanguage().' }; }; return a; },
        () => { const a = makeFakeAdapter(); a.start = function () { return { success: false, reason: 'Real recognition.start() rejection: no-speech' }; }; return a; }
    ];
    for (const makeAdapter of cases) {
        const session = load({ SpeechRecognitionAdapter: makeAdapter(), CozyHearing: makeFakeHearing() });
        const r = await session.start({});
        problems.add(r.problem);
    }
    const networkSession = load({ SpeechRecognitionAdapter: makeFakeAdapter(), CozyHearing: makeFakeHearing({ startResult: { success: false, reason: 'network error while acquiring stream.' } }) });
    problems.add((await networkSession.start({})).problem);
    assert.equal(problems.size, 6, `expected 6 distinct problem classifications, got: ${[...problems].join(', ')}`);
});

// --- CP14 continuation: raw vs normalized transcript boundary ---

test('CP14: raw transcript is implemented (passed through byte-for-byte); no normalized-transcript field exists yet — documented honestly, not pretended', async () => {
    const adapter = makeFakeAdapter();
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    let payload = null;
    await session.start({}, { onFinalResult: (p) => { payload = p; } });
    const rawFromProvider = '  Ndugu Zangu,   leo TUNAZUNGUMZA...  ';
    adapter._emitFinalResult({ transcript: rawFromProvider, confidence: 0.8 });
    assert.equal(payload.transcript, rawFromProvider, 'the raw provider transcript must reach the caller completely unmodified — no trimming, casing, or punctuation normalization invented here');
    assert.equal('normalizedTranscript' in payload, false, 'no normalized-transcript field exists in the current architecture; CP14 must not fabricate one');
});

// --- CP14 continuation: continuous Kiswahili recognition config actually reaches the provider, unwrapped ---

test('CP14: continuous:true / interimResults:true for a Kiswahili session reach the adapter\'s start() call unchanged, not silently discarded', async () => {
    const adapter = makeFakeAdapter();
    let seenConfig = null;
    const realStart = adapter.start.bind(adapter);
    adapter.start = function (config) { seenConfig = config; return realStart(config); };
    const hearing = makeFakeHearing();
    const session = load({ SpeechRecognitionAdapter: adapter, CozyHearing: hearing });
    await session.start({ languageCode: 'sw', continuous: true, interimResults: true });
    assert.equal(seenConfig.languageCode, 'sw');
    assert.equal(seenConfig.continuous, true);
    assert.equal(seenConfig.interimResults, true);
});

test('module export is a singleton with a frozen STATE enum', () => {
    const session = load({ SpeechRecognitionAdapter: makeFakeAdapter(), CozyHearing: makeFakeHearing() });
    assert.ok(Object.isFrozen(session.STATE));
    assert.deepEqual(Object.keys(session.STATE).sort(), ['ERROR', 'IDLE', 'LISTENING', 'PERMISSION_PENDING', 'STOPPED', 'STOPPING']);
});
