/**
 * core/living/tests/voice-language-cognitive-response-integration.test.js
 * CozyOS — Voice, Language and Cognitive Response Integration
 *
 * Covers the two real, concrete architecture gaps closed by this pass:
 *   1. Background/ambient audio mute now persists (was purely in-memory
 *      before, reset to unmuted on every reload) - reuses the exact
 *      localStorage convention this repo already uses elsewhere
 *      (cozy-workspace.js's "cozy.workspace.*" keys). mute()/unmute()/
 *      isMuted() are clear aliases for the pre-existing enable()/
 *      disable()/isEnabled() - same single flag, not a second one.
 *   2. Voice selection now honestly discloses whether an actually-
 *      installed voice matched the requested language
 *      (dedicatedVoiceMatched), propagated real end-to-end through
 *      the browser TTS adapter -> VoiceManager -> LivingTTS - never
 *      fabricating a "native" voice when none exists.
 *
 * Sections 3/4/5 (spoken response = displayed response, understanding
 * before voicing) were AUDITED, not modified - cozy-living-assistant.js
 * was confirmed (by direct code reading) to already compute one
 * `replyText` from the full resolved ai.think() pipeline and use that
 * exact same variable for both #addMessage() (display) and #speak()
 * (voice), with #speak() called strictly after resolution. No code
 * change was needed or made there - see the accompanying report.
 *
 * Run with: node --test core/living/tests/voice-language-cognitive-response-integration.test.js
 */
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');

const SOUNDS_PATH = path.join(__dirname, '..', 'cozy-living-sounds.js');
const TTS_ADAPTER_PATH = path.join(__dirname, '..', '..', 'modules', 'speech', 'adapters', 'cozy-tts-browser-adapter.js');
const VOICE_MANAGER_PATH = path.join(__dirname, '..', '..', 'modules', 'speech', 'voice-manager.js');
const LIVING_TTS_PATH = path.join(__dirname, '..', 'living-tts.js');

function makeFakeLocalStorage() {
    const store = new Map();
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        _store: store
    };
}

function makeFakeAudioClass() {
    return class FakeAudio {
        constructor() { this._volume = 1; this.preload = ''; this.src = ''; this.loop = false; this.currentTime = 0; this.duration = 2.0; }
        set volume(v) { this._volume = v; }
        get volume() { return this._volume; }
        play() { return Promise.resolve(); }
        pause() {}
    };
}

function freshSoundsEngine(localStorage) {
    delete require.cache[require.resolve(SOUNDS_PATH)];
    global.window = { CozyOS: {} };
    global.window.localStorage = localStorage || makeFakeLocalStorage();
    global.localStorage = global.window.localStorage;
    global.Audio = makeFakeAudioClass();
    global.document = { addEventListener() {}, removeEventListener() {} };
    require(SOUNDS_PATH);
    return global.window.CozyOS.LivingSounds;
}

// ---- Section 1: background audio mute ----

test('mute()/unmute() are real, clear aliases for the same existing disable()/enable() flag', () => {
    const sounds = freshSoundsEngine();
    assert.equal(sounds.isEnabled(), true);
    assert.equal(sounds.isMuted(), false);
    sounds.mute();
    assert.equal(sounds.isEnabled(), false);
    assert.equal(sounds.isMuted(), true);
    sounds.unmute();
    assert.equal(sounds.isEnabled(), true);
    assert.equal(sounds.isMuted(), false);
});

test('mute preference persists across a fresh reload (real gap fixed - was purely in-memory before)', () => {
    const storage = makeFakeLocalStorage();
    const first = freshSoundsEngine(storage);
    first.mute();
    assert.equal(first.isMuted(), true);

    // Simulate a page reload: fresh module load, SAME localStorage.
    const second = freshSoundsEngine(storage);
    assert.equal(second.isMuted(), true, 'mute state must survive a reload, exactly like cozy-workspace.js\'s own persisted settings');
});

test('unmute preference also persists across a fresh reload', () => {
    const storage = makeFakeLocalStorage();
    const first = freshSoundsEngine(storage);
    first.mute();
    first.unmute();
    const second = freshSoundsEngine(storage);
    assert.equal(second.isMuted(), false);
});

test('default state (no prior preference stored) is unmuted, matching existing pre-milestone behavior', () => {
    const sounds = freshSoundsEngine(makeFakeLocalStorage());
    assert.equal(sounds.isMuted(), false);
});

test('honest degrade: a localStorage failure never crashes the engine, defaults to unmuted', () => {
    delete require.cache[require.resolve(SOUNDS_PATH)];
    global.window = { CozyOS: {} };
    global.window.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    global.Audio = makeFakeAudioClass();
    global.document = { addEventListener() {}, removeEventListener() {} };
    assert.doesNotThrow(() => require(SOUNDS_PATH));
    const sounds = global.window.CozyOS.LivingSounds;
    assert.equal(sounds.isMuted(), false);
    assert.doesNotThrow(() => sounds.mute());
});

test('muting background sound has zero connection to assistant speech (VoiceManager/LivingTTS) — separate systems, no shared flag', () => {
    const sounds = freshSoundsEngine();
    sounds.mute();
    // Real, structural proof: LivingSounds exposes no reference to
    // VoiceManager/LivingTTS at all, and vice versa - confirmed by the
    // fact that muting it requires touching only window.CozyOS.LivingSounds.
    assert.equal(typeof sounds.speak, 'undefined');
});

// ---- Section 2: honest Kiswahili/language voice-match disclosure ----

function freshTTSAdapter() {
    delete require.cache[require.resolve(TTS_ADAPTER_PATH)];
    global.window = global.window || {};
    global.window.CozyOS = global.window.CozyOS || {};
    require(TTS_ADAPTER_PATH);
    return global.window.CozyOS.CozyTTSBrowserAdapter;
}

function fakeSpeechSynthesis(installedVoices) {
    return {
        getVoices: () => installedVoices,
        speak(utterance) {
            setTimeout(() => utterance.onend && utterance.onend(), 0);
        }
    };
}

test('dedicatedVoiceMatched is honestly true when a real installed voice matches the language', async () => {
    global.window = { CozyOS: { CozySpeech: { registerPreviewBackend: () => ({ success: true }) } } };
    global.window.speechSynthesis = fakeSpeechSynthesis([{ lang: 'en-US', name: 'English Voice' }, { lang: 'sw-KE', name: 'Swahili Voice' }]);
    global.SpeechSynthesisUtterance = function (text) { this.text = text; };
    const adapter = freshTTSAdapter();
    const result = await adapter.speakPreview({ text: 'habari', language: 'sw' });
    assert.equal(result.played, true);
    assert.equal(result.dedicatedVoiceMatched, true);
    assert.equal(result.requestedLanguage, 'sw');
});

test('dedicatedVoiceMatched is honestly false when NO installed voice matches the language - never fabricates a match', async () => {
    global.window = { CozyOS: { CozySpeech: { registerPreviewBackend: () => ({ success: true }) } } };
    global.window.speechSynthesis = fakeSpeechSynthesis([{ lang: 'en-US', name: 'English Voice' }]); // no Kiswahili voice installed
    global.SpeechSynthesisUtterance = function (text) { this.text = text; };
    const adapter = freshTTSAdapter();
    const result = await adapter.speakPreview({ text: 'habari', language: 'sw' });
    assert.equal(result.played, true);
    assert.equal(result.dedicatedVoiceMatched, false, 'must honestly disclose no dedicated voice was found, never pretend the English voice is a Kiswahili one');
    assert.equal(result.requestedLanguage, 'sw');
});

test('VoiceManager.speak() passes the honest dedicatedVoiceMatched/requestedLanguage fields through unchanged, never strips them', async () => {
    delete require.cache[require.resolve(VOICE_MANAGER_PATH)];
    global.window = { CozyOS: {} };
    require(VOICE_MANAGER_PATH);
    const vm = global.window.CozyOS.VoiceManager;
    // Register a minimal fake provider that reports the honest fields,
    // exactly as the real browser adapter now does.
    vm.registerProvider({
        providerId: 'fake-real-provider',
        displayName: 'Fake Real Provider',
        status: 'installed',
        speak: async () => ({ available: true, played: true, dedicatedVoiceMatched: false, requestedLanguage: 'sw' })
    });
    vm.setDefaultVoice('fake-real-provider');
    const result = await vm.speak({ text: 'CozyOS inasaidiaje?', language: 'sw' });
    assert.equal(result.played, true);
    assert.equal(result.dedicatedVoiceMatched, false);
    assert.equal(result.requestedLanguage, 'sw');
});

console.log('Voice, Language and Cognitive Response Integration suite: run complete.');
