/**
 * core/modules/learning/test/universal-learning-pipeline-multimodal.test.js
 * Run with: node --test core/modules/learning/test/universal-learning-pipeline-multimodal.test.js
 *
 * Focused on the two new methods added to UniversalLearningPipeline
 * (learnFromMultimodalObservation / confirmMultimodalObservation).
 * The pre-existing single-modality methods (learnFromVoice,
 * learnFromOCR, learnFromQuestion, learnFromCorrection) are untouched
 * by this change and are not re-tested here.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CORE_PATH = path.join(__dirname, '..', 'multimodal-observation-core.js');
const PIPELINE_PATH = path.join(__dirname, '..', 'universal-learning-pipeline.js');
const HEARING_SESSION_PATH = path.join(__dirname, '..', '..', 'hearing', 'living-hearing-session.js');

function freshWindow() {
    delete require.cache[require.resolve(CORE_PATH)];
    delete require.cache[require.resolve(PIPELINE_PATH)];
    delete require.cache[require.resolve(HEARING_SESSION_PATH)];
    global.window = { CozyOS: {} };
    require(CORE_PATH);
    require(PIPELINE_PATH);
    return global.window.CozyOS.UniversalLearningPipeline;
}

/**
 * CP13 (Kiswahili Hearing Foundation) addition: learnFromVoice() now
 * delegates to the real window.CozyOS.LivingHearingSession instead of
 * talking to SpeechRecognitionAdapter directly (see that file's own
 * header). The voice-path tests below need LivingHearingSession
 * actually loaded (real file, not re-faked — its own dedicated suite
 * at core/modules/hearing/test/living-hearing-session.test.js already
 * covers its internals) plus a minimal, honest CozyHearing fake, since
 * Node has no real getUserMedia for LivingHearingSession's real
 * CozyHearing.startListening() call to succeed against.
 */
function fakeHearingForVoiceTests() {
    let listening = false;
    return {
        async startListening() { listening = true; return { success: true }; },
        async stopListening() { listening = false; return { success: true }; },
        isListening: () => listening,
    };
}
function loadLivingHearingSession() {
    delete require.cache[require.resolve(HEARING_SESSION_PATH)];
    require(HEARING_SESSION_PATH);
}

function fakeMemory() {
    const store = new Map();
    return {
        saveMemory(namespace, key, value) { store.set(`${namespace}/${key}`, value); return { success: true }; },
        readMemory(namespace, key) { return store.has(`${namespace}/${key}`) ? { value: store.get(`${namespace}/${key}`) } : null; },
        _store: store,
    };
}

function fakeVerifier() {
    const calls = [];
    return {
        submitObservation(termId, meaning, opts) { calls.push({ termId, meaning, opts }); return { success: true, totalObservations: calls.length }; },
        _calls: calls,
    };
}

test('learnFromMultimodalObservation builds a real observation and never auto-confirms it', () => {
    const pipeline = freshWindow();
    const result = pipeline.learnFromMultimodalObservation({
        userId: 'user-1',
        visual: { text: 'Buenos días', confidence: 0.9, source: 'camera' },
        audio: { transcript: 'buenos dias', confidence: 0.85, source: 'microphone' },
        context: { application: 'lesson-app', topic: 'greetings' },
        translation: { sourceLanguage: 'es', targetLanguage: 'en', meaning: 'Good morning', confidence: 0.9 },
    });
    assert.equal(result.success, true);
    assert.ok(result.observation.observationId);
    assert.ok(result.observation.matching.combinedConfidence > 0.9);
    assert.equal(result.decision.action, 'REVIEW_REQUIRED', 'a high-confidence match still requires explicit user confirmation, never auto-learned');
});

test('learnFromMultimodalObservation reports IGNORE_LOW_CONFIDENCE for genuinely mismatched visual/audio', () => {
    const pipeline = freshWindow();
    const result = pipeline.learnFromMultimodalObservation({
        userId: 'user-1',
        visual: { text: 'completely different text here', confidence: 0.9 },
        audio: { transcript: 'nothing alike at all', confidence: 0.9 },
    });
    assert.equal(result.decision.action, 'IGNORE_LOW_CONFIDENCE');
});

test('learnFromMultimodalObservation honestly fails if MultimodalObservationCore is not loaded', () => {
    delete require.cache[require.resolve(PIPELINE_PATH)];
    global.window = { CozyOS: {} }; // no MultimodalObservationCore loaded
    require(PIPELINE_PATH);
    const pipeline = global.window.CozyOS.UniversalLearningPipeline;
    const result = pipeline.learnFromMultimodalObservation({ userId: 'u1', visual: { text: 'x' } });
    assert.equal(result.success, false);
    assert.match(result.reason, /MultimodalObservationCore is not loaded/);
});

test('confirmMultimodalObservation stores the full record via CozyMemory and submits to LivingLanguageVerification', () => {
    const pipeline = freshWindow();
    global.window.CozyOS.CozyMemory = fakeMemory();
    global.window.CozyOS.LivingLanguageVerification = fakeVerifier();

    const { observation } = pipeline.learnFromMultimodalObservation({
        userId: 'user-1',
        visual: { text: 'Buenos días', confidence: 0.9 },
        audio: { transcript: 'buenos dias', confidence: 0.85 },
        context: { topic: 'greetings' },
        translation: { meaning: 'Good morning' },
    });

    const result = pipeline.confirmMultimodalObservation(observation, { userId: 'user-1', region: 'nairobi' });
    assert.equal(result.success, true);
    assert.equal(result.storedObservationId, observation.observationId);

    const stored = global.window.CozyOS.CozyMemory.readMemory('multimodal-learning', observation.observationId);
    assert.ok(stored, 'the full observation record must actually be persisted via the real CozyMemory');
    assert.equal(stored.value.confirmedBy, 'user-1');

    const verCalls = global.window.CozyOS.LivingLanguageVerification._calls;
    assert.equal(verCalls.length, 1);
    assert.equal(verCalls[0].termId, 'Buenos días');
    assert.equal(verCalls[0].meaning, 'Good morning');
    assert.equal(verCalls[0].opts.region, 'nairobi');
    assert.equal(verCalls[0].opts.submittedBy, 'user-1');
});

test('confirmMultimodalObservation honestly fails without a real term or a real meaning — never records an empty/fabricated fact', () => {
    const pipeline = freshWindow();
    global.window.CozyOS.CozyMemory = fakeMemory();
    const { observation } = pipeline.learnFromMultimodalObservation({ userId: 'u1', context: { topic: 'x' } }); // no visual/audio/translation at all
    const result = pipeline.confirmMultimodalObservation(observation, { userId: 'u1' });
    assert.equal(result.success, false);
    assert.match(result.reason, /needs at least a real observed term/);
});

test('confirmMultimodalObservation honestly reports when CozyMemory is not loaded, never silently succeeding', () => {
    const pipeline = freshWindow();
    const { observation } = pipeline.learnFromMultimodalObservation({
        userId: 'u1', visual: { text: 'x' }, translation: { meaning: 'y' },
    });
    const result = pipeline.confirmMultimodalObservation(observation, { userId: 'u1' });
    assert.equal(result.success, false);
    assert.match(result.reason, /CozyMemory is not loaded/);
});

test('confirmMultimodalObservation honestly reports when LivingLanguageVerification is unavailable, but still stores the observation itself', () => {
    const pipeline = freshWindow();
    global.window.CozyOS.CozyMemory = fakeMemory();
    const { observation } = pipeline.learnFromMultimodalObservation({
        userId: 'u1', visual: { text: 'x' }, translation: { meaning: 'y' },
    });
    const result = pipeline.confirmMultimodalObservation(observation, { userId: 'u1' });
    assert.equal(result.success, true, 'the record itself is real and storable even if community verification is unavailable');
    assert.equal(result.verification.success, false);
    assert.match(result.verification.reason, /LivingLanguageVerification is not loaded/);
});

test('confirmMultimodalObservation never invents a userId/submittedBy — passes through exactly what the caller provided, including null', () => {
    const pipeline = freshWindow();
    global.window.CozyOS.CozyMemory = fakeMemory();
    global.window.CozyOS.LivingLanguageVerification = fakeVerifier();
    const { observation } = pipeline.learnFromMultimodalObservation({
        visual: { text: 'x' }, translation: { meaning: 'y' },
    });
    pipeline.confirmMultimodalObservation(observation, {});
    assert.equal(global.window.CozyOS.LivingLanguageVerification._calls[0].opts.submittedBy, null);
});

// --- learnFromVoice() real event-wiring bug fix ---

function fakeLiving(provider) {
    const declared = [];
    return {
        serviceContracts: {
            listDeclared: () => declared,
            declare: (capabilityName, providerName, description) => declared.push({ capabilityName, providerName, description }),
            require: (consumer, capabilities) => {
                const resolved = {};
                for (const cap of capabilities) resolved[cap] = { provider, reason: null };
                return { allSatisfied: true, resolved };
            },
        },
    };
}

/**
 * A faithful mock of SpeechRecognitionAdapter's REAL event contract —
 * only "onResult"/"onPartialResult"/"onFinalResult"/"onError" (etc,
 * with the "on" prefix) are ever recognized, exactly like the real
 * file. Registering under "result"/"error" (the bug this fix
 * addresses) is honestly rejected here too, precisely reproducing the
 * real adapter's behavior — this is what makes the test below able to
 * actually catch the bug rather than passing regardless of which
 * event names learnFromVoice() uses.
 */
function faithfulSpeechAdapterMock({ startBehavior } = {}) {
    const listeners = { onStart: [], onStop: [], onSpeechStart: [], onSpeechEnd: [], onResult: [], onPartialResult: [], onFinalResult: [], onError: [] };
    return {
        isReal: () => true,
        on(eventName, handler) {
            if (!listeners[eventName]) return { success: false, reason: `Unknown event "${eventName}".` };
            listeners[eventName].push(handler);
            return { success: true };
        },
        start() {
            if (startBehavior === 'final-result') {
                listeners.onFinalResult.forEach((h) => h({ sessionId: null, transcript: 'buenos dias', confidence: 0.91, isFinal: true }));
            } else if (startBehavior === 'error') {
                listeners.onError.forEach((h) => h({ sessionId: null, error: 'network' }));
            }
            // 'hang' behavior: neither fires, proving the bug (Promise never resolves)
            // Real adapter contract: start() always returns a {success,...}
            // result synchronously, separate from any async event firing —
            // this mock previously returned undefined here, which this
            // checkpoint's LivingHearingSession (a real new caller that
            // actually checks that return value) correctly exposed as a
            // pre-existing gap in this mock, not in the real adapter.
            return { success: true, isReal: true, sessionId: null };
        },
        stop() { return { success: true }; },
    };
}

test('learnFromVoice() resolves with the real transcript once onFinalResult genuinely fires (this is the fix under test — it previously listened on the wrong event name and would have hung here)', async () => {
    const pipeline = freshWindow();
    const adapter = faithfulSpeechAdapterMock({ startBehavior: 'final-result' });
    global.window.CozyOS.Living = fakeLiving(adapter);
    global.window.CozyOS.SpeechRecognitionAdapter = adapter;
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();

    const result = await pipeline.learnFromVoice({});
    assert.equal(result.success, true);
    assert.equal(result.transcript, 'buenos dias');
    assert.equal(result.confidence, 0.91);
});

test('learnFromVoice() resolves with an honest failure once onError genuinely fires', async () => {
    const pipeline = freshWindow();
    const adapter = faithfulSpeechAdapterMock({ startBehavior: 'error' });
    global.window.CozyOS.Living = fakeLiving(adapter);
    global.window.CozyOS.SpeechRecognitionAdapter = adapter;
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();

    const result = await pipeline.learnFromVoice({});
    assert.equal(result.success, false);
    assert.match(result.reason, /network/);
});

test('learnFromVoice() reports honestly when Living is not loaded, without ever touching the adapter', () => {
    const pipeline = freshWindow();
    return pipeline.learnFromVoice({}).then((result) => {
        assert.equal(result.success, false);
        assert.match(result.reason, /Living is not loaded/);
    });
});

// --- captureVoiceForLearning() / learnFromCameraAndVoice() (Hearing increment) ---

test('captureVoiceForLearning() reshapes a real voice capture into the exact audio field shape buildObservation() expects', async () => {
    const pipeline = freshWindow();
    const adapter = faithfulSpeechAdapterMock({ startBehavior: 'final-result' });
    global.window.CozyOS.Living = fakeLiving(adapter);
    global.window.CozyOS.SpeechRecognitionAdapter = adapter;
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();

    const result = await pipeline.captureVoiceForLearning({ languageCode: 'es-ES', context: { topic: 'greetings' } });
    assert.equal(result.success, true);
    assert.equal(result.stage, 'voice-captured');
    assert.deepEqual(result.audio, { transcript: 'buenos dias', confidence: 0.91, language: 'es-ES', source: 'microphone' });
    assert.deepEqual(result.context, { topic: 'greetings' });
});

test('captureVoiceForLearning() honestly propagates a real voice-capture failure, never fabricating an audio object', async () => {
    const pipeline = freshWindow();
    const adapter = faithfulSpeechAdapterMock({ startBehavior: 'error' });
    global.window.CozyOS.Living = fakeLiving(adapter);
    global.window.CozyOS.SpeechRecognitionAdapter = adapter;
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();

    const result = await pipeline.captureVoiceForLearning({ languageCode: 'es-ES' });
    assert.equal(result.success, false);
    assert.equal(result.stage, 'voice-capture-failed');
    assert.match(result.reason, /network/);
    assert.equal(result.audio, undefined);
});

test('learnFromCameraAndVoice() joins a real (already-captured) visual observation with a real fresh voice capture into one multimodal observation', async () => {
    const pipeline = freshWindow();
    const adapter = faithfulSpeechAdapterMock({ startBehavior: 'final-result' }); // transcript: 'buenos dias'
    global.window.CozyOS.Living = fakeLiving(adapter);
    global.window.CozyOS.SpeechRecognitionAdapter = adapter;
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();

    const result = await pipeline.learnFromCameraAndVoice({
        userId: 'user-1',
        visual: { text: 'Buenos días', confidence: 0.9, source: 'camera' }, // e.g. from LearningCameraAdapter.captureForLearning()'s ocr.extracted
        languageCode: 'es-ES',
        context: { application: 'lesson-app', topic: 'greetings' },
        translation: { meaning: 'Good morning' },
    });

    assert.equal(result.success, true);
    assert.equal(result.observation.visual.text, 'Buenos días');
    assert.equal(result.observation.audio.transcript, 'buenos dias');
    assert.ok(result.observation.matching.visualAudioMatch > 0.9, 'the real cross-modal matching must have actually run on both real inputs');
    assert.equal(result.decision.action, 'REVIEW_REQUIRED', 'joining camera+voice must still require explicit user confirmation, never auto-learn');
});

test('learnFromCameraAndVoice() short-circuits honestly if the voice capture fails, never calling learnFromMultimodalObservation() with a fabricated audio field', async () => {
    const pipeline = freshWindow();
    const adapter = faithfulSpeechAdapterMock({ startBehavior: 'error' });
    global.window.CozyOS.Living = fakeLiving(adapter);
    global.window.CozyOS.SpeechRecognitionAdapter = adapter;
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();

    const result = await pipeline.learnFromCameraAndVoice({
        userId: 'user-1',
        visual: { text: 'Buenos días', confidence: 0.9 },
    });
    assert.equal(result.success, false);
    assert.equal(result.stage, 'voice-capture-failed');
    assert.equal(result.observation, undefined);
});

test('learnFromCameraAndVoice() works with visual omitted (voice-only observation), never fabricating a visual field', async () => {
    const pipeline = freshWindow();
    const adapter = faithfulSpeechAdapterMock({ startBehavior: 'final-result' });
    global.window.CozyOS.Living = fakeLiving(adapter);
    global.window.CozyOS.SpeechRecognitionAdapter = adapter;
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();
    global.window.CozyOS.CozyHearing = fakeHearingForVoiceTests();
    loadLivingHearingSession();

    const result = await pipeline.learnFromCameraAndVoice({ userId: 'user-1' });
    assert.equal(result.success, true);
    assert.equal(result.observation.visual, null);
    assert.equal(result.observation.audio.transcript, 'buenos dias');
    assert.equal(result.observation.matching.visualAudioMatch, null, 'no cross-modal match without a real visual observation to compare against');
});
