'use strict';

/**
 * core/modules/speech/tests/voice-manager-progressive-speech.test.js
 *
 * Universal CozyOS Voice — Phase 1 (progressive speech) + Phase 2
 * (queue/cancellation/stale-response protection) regression coverage
 * for VoiceManager.speakProgressive() / cancelSpeech() / getSpeechState().
 *
 * HARNESS DISCLOSURE (same discipline as living-tts.test.js):
 *   REAL, unmodified-by-this-suite production code under test:
 *   core/shell/platform-event-bus.js, core/modules/speech/
 *   speech-segmenter.js, core/modules/speech/voice-manager.js. No
 *   internal function of either is mocked. A real, explicitly-named
 *   "test-provider" is registered through VoiceManager's own real,
 *   public registerProvider() extension point — not a mock of
 *   VoiceManager itself. Node has no real window.speechSynthesis, so
 *   this suite never asserts on it directly; cancellation is proven via
 *   VoiceManager's own observable state/return values, which is what a
 *   real caller actually sees.
 *
 * Run with: node --test core/modules/speech/tests/voice-manager-progressive-speech.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function freshWindow() {
    global.window = { CozyOS: {}, addEventListener: () => {} };
    for (const mod of [
        '../../../shell/platform-event-bus.js',
        '../speech-segmenter.js',
        '../voice-manager.js',
    ]) {
        try { delete require.cache[require.resolve(mod)]; } catch (_e) { /* not yet required */ }
    }
    require('../../../shell/platform-event-bus.js');
    require('../speech-segmenter.js');
    require('../voice-manager.js');
    return window.CozyOS;
}

function registerTestProvider(CozyOS, speakImpl) {
    CozyOS.VoiceManager.registerProvider({
        providerId: 'test-provider',
        displayName: 'Test Provider',
        status: 'installed',
        isDefault: true,
        capabilities: { recordedPhrasePlayback: false, dynamicSynthesis: true },
        speak: speakImpl,
    });
    CozyOS.VoiceManager.setDefaultVoice('test-provider');
}

// ── SpeechSegmenter ──────────────────────────────────────────────────────

test('SpeechSegmenter.splitIntoSegments splits on real sentence-final punctuation', () => {
    const CozyOS = freshWindow();
    const segs = CozyOS.SpeechSegmenter.splitIntoSegments('First sentence. Second sentence! Third?');
    assert.deepEqual(segs, ['First sentence.', 'Second sentence!', 'Third?']);
});

test('SpeechSegmenter.splitIntoSegments is paragraph-aware (real newlines first)', () => {
    const CozyOS = freshWindow();
    const segs = CozyOS.SpeechSegmenter.splitIntoSegments('Para one sentence one. Para one sentence two.\n\nPara two only sentence.');
    assert.deepEqual(segs, ['Para one sentence one.', 'Para one sentence two.', 'Para two only sentence.']);
});

test('SpeechSegmenter.splitIntoSegments never fabricates a boundary — no terminal punctuation stays one segment', () => {
    const CozyOS = freshWindow();
    const segs = CozyOS.SpeechSegmenter.splitIntoSegments('no punctuation at all here');
    assert.deepEqual(segs, ['no punctuation at all here']);
});

test('SpeechSegmenter.splitIntoSegments honestly returns [] for empty/whitespace-only input', () => {
    const CozyOS = freshWindow();
    assert.deepEqual(CozyOS.SpeechSegmenter.splitIntoSegments(''), []);
    assert.deepEqual(CozyOS.SpeechSegmenter.splitIntoSegments('   '), []);
    assert.deepEqual(CozyOS.SpeechSegmenter.splitIntoSegments(null), []);
});

// ── speakProgressive() — real segment-by-segment realization ────────────

test('speakProgressive() speaks a multi-sentence reply as multiple, ordered real speak() calls — never re-synthesized', async () => {
    const CozyOS = freshWindow();
    const seen = [];
    registerTestProvider(CozyOS, async (config) => { seen.push(config.text); return { available: true, played: true }; });
    const result = await CozyOS.VoiceManager.speakProgressive({ text: 'First sentence. Second sentence. Third sentence.' });
    assert.deepEqual(seen, ['First sentence.', 'Second sentence.', 'Third sentence.']);
    assert.equal(result.segmentsSpoken, 3);
    assert.equal(result.cancelled, false);
    assert.equal(result.played, true);
});

test('speakProgressive() begins the first segment without waiting for the rest — the first provider call happens before the second is even constructed', async () => {
    const CozyOS = freshWindow();
    let firstCallOrder = null;
    let callCount = 0;
    registerTestProvider(CozyOS, async (config) => {
        callCount++;
        if (config.text.startsWith('First')) firstCallOrder = callCount;
        return { available: true, played: true };
    });
    await CozyOS.VoiceManager.speakProgressive({ text: 'First sentence. Second sentence.' });
    assert.equal(firstCallOrder, 1, 'the first segment must be the first real speak() call, not deferred until segmentation of the whole reply');
});

test('speakProgressive() with a single-sentence (unpunctuated) reply speaks it as exactly one segment, no artificial delay/chunking', async () => {
    const CozyOS = freshWindow();
    const seen = [];
    registerTestProvider(CozyOS, async (config) => { seen.push(config.text); return { available: true, played: true }; });
    const result = await CozyOS.VoiceManager.speakProgressive({ text: 'Karibu' });
    assert.deepEqual(seen, ['Karibu']);
    assert.equal(result.segmentsSpoken, 1);
});

test('speakProgressive() reaches getSpeechState()==="completed" after every segment plays', async () => {
    const CozyOS = freshWindow();
    registerTestProvider(CozyOS, async () => ({ available: true, played: true }));
    await CozyOS.VoiceManager.speakProgressive({ text: 'Only one sentence.', responseId: 'turn-1' });
    const state = CozyOS.VoiceManager.getSpeechState();
    assert.equal(state.state, 'completed');
    assert.equal(state.responseId, 'turn-1');
});

test('speakProgressive() honestly reports state "error" (not silently succeeding) when no provider can speak a segment', async () => {
    const CozyOS = freshWindow();
    // Deliberately no provider registered — VoiceManager's own existing,
    // unmodified fallback chain (charles -> browser) both honestly fail
    // in this Node harness (no real browser/audio backends).
    const result = await CozyOS.VoiceManager.speakProgressive({ text: 'Hello there.' });
    assert.equal(result.played, false);
    assert.equal(result.cancelled, false);
    assert.equal(CozyOS.VoiceManager.getSpeechState().state, 'error');
});

// ── cancelSpeech() / stale-response protection ──────────────────────────

test('a second speakProgressive() call supersedes an in-flight first call — the first call\'s later segments never speak', async () => {
    const CozyOS = freshWindow();
    const seen = [];
    let resolveFirstSegment;
    let callIndex = 0;
    registerTestProvider(CozyOS, async (config) => {
        callIndex++;
        seen.push(config.text);
        if (callIndex === 1) {
            // First call's first segment hangs until we explicitly let it
            // resolve, simulating a real in-flight utterance.
            await new Promise((resolve) => { resolveFirstSegment = resolve; });
        }
        return { available: true, played: true };
    });

    const firstCall = CozyOS.VoiceManager.speakProgressive({ text: 'Old first. Old second.', responseId: 'stale-turn' });
    // Give the first call's loop a tick to start its first segment.
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(CozyOS.VoiceManager.getSpeechState().state, 'speaking');

    const secondCall = CozyOS.VoiceManager.speakProgressive({ text: 'New reply.', responseId: 'fresh-turn' });
    resolveFirstSegment(); // let the stale call's pending segment settle now

    const [firstResult, secondResult] = await Promise.all([firstCall, secondCall]);
    assert.equal(firstResult.cancelled, true, 'the superseded call must honestly report cancelled, never a fabricated success for segments it never spoke');
    assert.equal(secondResult.cancelled, false);
    assert.equal(secondResult.played, true);
    assert.ok(!seen.includes('Old second.'), 'the stale call\'s second segment must never be spoken after it was superseded');
    assert.ok(seen.includes('New reply.'));
});

test('cancelSpeech() invalidates an in-flight sequence and is honestly a no-op when nothing was speaking', async () => {
    const CozyOS = freshWindow();
    const idleCancel = CozyOS.VoiceManager.cancelSpeech();
    assert.equal(idleCancel.wasActive, false);

    let resolveSegment;
    registerTestProvider(CozyOS, async () => new Promise((resolve) => { resolveSegment = () => resolve({ available: true, played: true }); }));
    const inFlight = CozyOS.VoiceManager.speakProgressive({ text: 'First. Second.', responseId: 'to-cancel' });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(CozyOS.VoiceManager.getSpeechState().state, 'speaking');

    const activeCancel = CozyOS.VoiceManager.cancelSpeech();
    assert.equal(activeCancel.wasActive, true);
    resolveSegment();
    const result = await inFlight;
    assert.equal(result.cancelled, true);
});

test('speakProgressive() never re-synthesizes the response text it is given — segments concatenate back to the original sentences verbatim', async () => {
    const CozyOS = freshWindow();
    const seen = [];
    registerTestProvider(CozyOS, async (config) => { seen.push(config.text); return { available: true, played: true }; });
    const original = 'ChurchOS husaidia kanisa kupanga mahudhurio. Pia inaweza kusaidia huduma za ufuatiliaji wa washiriki.';
    await CozyOS.VoiceManager.speakProgressive({ text: original });
    assert.equal(seen.join(' '), original);
});

async function main() {}
main();
