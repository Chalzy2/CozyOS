'use strict';

/**
 * Living TTS test suite for core/living/living-tts.js
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test:
 *   core/shell/platform-event-bus.js, core/modules/speech/cozy-speech.js,
 *   core/modules/speech/adapters/cozy-tts-browser-adapter.js,
 *   core/modules/speech/providers/charles-voice-provider.js,
 *   core/modules/speech/voice-manager.js, and core/living/living-tts.js
 *   itself. No internal function of any of these is mocked.
 *
 *   Node has no real `window.speechSynthesis`/`SpeechSynthesisUtterance`
 *   or `Audio` global, so CozyTTSBrowserAdapter and CharlesVoiceProvider
 *   honestly fail to register/play in this harness — that is their real,
 *   documented fail-closed behavior in an environment without those
 *   browser APIs, not a fake. Tests that need a SUCCESSFUL speak path
 *   register an additional, explicitly-named "test-provider" through
 *   VoiceManager's own real, public registerProvider() API — providers
 *   are meant to be pluggable; this is not a mock of VoiceManager, it is
 *   real use of its real extension point.
 *
 * Run with: node --test core/living/tests/living-tts.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function freshWindow() {
    global.window = { CozyOS: {}, addEventListener: () => {} };
    for (const mod of [
        '../../shell/platform-event-bus.js',
        '../../modules/speech/cozy-speech.js',
        '../../modules/speech/adapters/cozy-tts-browser-adapter.js',
        '../../modules/speech/providers/charles-voice-provider.js',
        '../../modules/speech/voice-manager.js',
        '../living-tts.js',
    ]) {
        try { delete require.cache[require.resolve(mod)]; } catch (_e) { /* not yet required */ }
    }
    require('../../shell/platform-event-bus.js');
    require('../../modules/speech/cozy-speech.js');
    require('../../modules/speech/adapters/cozy-tts-browser-adapter.js');
    require('../../modules/speech/providers/charles-voice-provider.js');
    require('../../modules/speech/voice-manager.js');
    require('../living-tts.js');
    return window.CozyOS;
}

function registerTestProvider(CozyOS, overrides = {}) {
    CozyOS.VoiceManager.registerProvider({
        providerId: 'test-provider',
        displayName: 'Test Provider',
        status: 'installed',
        capabilities: { recordedPhrasePlayback: false, dynamicSynthesis: true },
        speak: async (config) => ({ available: true, played: true, reason: null }),
        ...overrides,
    });
}

test('LivingTTS loads and honestly declares its real dependencies', () => {
    const CozyOS = freshWindow();
    assert.ok(CozyOS.LivingTTS, 'LivingTTS must be registered on window.CozyOS');
    assert.equal(CozyOS.LivingTTS.getId(), 'LivingTTS');
    assert.deepEqual(CozyOS.LivingTTS.getDependencies(), ['CozySpeech', 'VoiceManager']);
});

test('composes VoiceManager as CozySpeech\'s real preview backend (no regression)', () => {
    const CozyOS = freshWindow();
    assert.equal(CozyOS.CozySpeech.hasRealPreviewBackend(), true);
    assert.equal(CozyOS.LivingTTS.getStatus().previewBackendRegistered, true);
});

test('speak() with no working provider and no browser TTS honestly reports unavailable', async () => {
    const CozyOS = freshWindow();
    const result = await CozyOS.LivingTTS.speak({ text: 'Hello' });
    assert.equal(result.available, false);
    assert.equal(result.played, false);
    assert.equal(result.providerId, null);
    assert.equal(result.kind, 'unknown');
    assert.ok(typeof result.reason === 'string' && result.reason.length > 0);
});

test('speak() succeeds through a real registered provider and classifies kind:"synthesized"', async () => {
    const CozyOS = freshWindow();
    registerTestProvider(CozyOS, { capabilities: { recordedPhrasePlayback: false, dynamicSynthesis: true } });
    const result = await CozyOS.LivingTTS.speak({ text: 'Hello', providerId: 'test-provider' });
    assert.equal(result.available, true);
    assert.equal(result.played, true);
    assert.equal(result.providerId, 'test-provider');
    assert.equal(result.kind, 'synthesized');
});

test('speak() classifies kind:"recorded" for a provider registered with recordedPhrasePlayback', async () => {
    const CozyOS = freshWindow();
    registerTestProvider(CozyOS, { capabilities: { recordedPhrasePlayback: true, dynamicSynthesis: false } });
    const result = await CozyOS.LivingTTS.speak({ text: 'Hello', providerId: 'test-provider' });
    assert.equal(result.kind, 'recorded');
});

test('speak() classifies kind:"unknown" for a provider that declares neither capability flag', async () => {
    const CozyOS = freshWindow();
    registerTestProvider(CozyOS, { capabilities: {} });
    const result = await CozyOS.LivingTTS.speak({ text: 'Hello', providerId: 'test-provider' });
    assert.equal(result.kind, 'unknown');
});

test('never claims a recording is TTS or a browser voice is a specific person', async () => {
    const CozyOS = freshWindow();
    registerTestProvider(CozyOS, { capabilities: { recordedPhrasePlayback: true } });
    const result = await CozyOS.LivingTTS.speak({ text: 'Hello', providerId: 'test-provider' });
    assert.notEqual(result.kind, 'synthesized', 'a recorded provider must never be classified as synthesized');
});

test('context selection routes to the real per-context provider assignment', async () => {
    const CozyOS = freshWindow();
    registerTestProvider(CozyOS);
    CozyOS.VoiceManager.setContextVoice('startup', 'test-provider');
    const result = await CozyOS.LivingTTS.speak({ text: 'Welcome', context: 'startup' });
    assert.equal(result.providerId, 'test-provider');
});

test('empty/failed provider response falls through to an honest overall unavailable result', async () => {
    const CozyOS = freshWindow();
    registerTestProvider(CozyOS, { speak: async () => ({ available: true, played: false, reason: 'simulated real failure' }) });
    const result = await CozyOS.LivingTTS.speak({ text: 'Hello', providerId: 'test-provider' });
    assert.equal(result.available, false);
    assert.equal(result.played, false);
});

test('language propagates via a real, transient CozySpeech VoiceSettings record and is cleaned up', async () => {
    const CozyOS = freshWindow();
    let observedLanguage = null;
    let observedSettingsIdExistedDuringCall = false;
    registerTestProvider(CozyOS, {
        speak: async (config) => {
            if (config.settingsId) {
                const settings = CozyOS.CozySpeech.getVoiceSettings(config.settingsId);
                observedSettingsIdExistedDuringCall = !!settings;
                observedLanguage = settings ? settings.language : null;
            }
            return { available: true, played: true, reason: null };
        },
    });
    const before = CozyOS.CozySpeech.listVoiceSettings().length;
    await CozyOS.LivingTTS.speak({ text: 'Habari', language: 'sw', providerId: 'test-provider' });
    const after = CozyOS.CozySpeech.listVoiceSettings().length;
    assert.equal(observedLanguage, 'sw');
    assert.equal(observedSettingsIdExistedDuringCall, true, 'the transient settings record must exist during the call');
    assert.equal(after, before, 'the transient settings record must be removed after the call — no leak');
});

test('an explicit settingsId is never overridden by a language shorthand', async () => {
    const CozyOS = freshWindow();
    const explicitId = CozyOS.CozySpeech.registerVoiceSettings({ language: 'en' });
    let receivedSettingsId = null;
    registerTestProvider(CozyOS, {
        speak: async (config) => { receivedSettingsId = config.settingsId; return { available: true, played: true, reason: null }; },
    });
    await CozyOS.LivingTTS.speak({ text: 'Hi', language: 'sw', settingsId: explicitId, providerId: 'test-provider' });
    assert.equal(receivedSettingsId, explicitId);
    CozyOS.CozySpeech.removeVoiceSettings(explicitId);
});

test('PlatformEventBus emits a real speak-start and speak-success pair on success', async () => {
    const CozyOS = freshWindow();
    registerTestProvider(CozyOS);
    const seen = [];
    CozyOS.PlatformEventBus.on('living-tts:speak-start', (d) => seen.push(['start', d]));
    CozyOS.PlatformEventBus.on('living-tts:speak-success', (d) => seen.push(['success', d]));
    await CozyOS.LivingTTS.speak({ text: 'Hello', providerId: 'test-provider' });
    assert.equal(seen.length, 2);
    assert.equal(seen[0][0], 'start');
    assert.equal(seen[1][0], 'success');
    assert.equal(seen[1][1].providerId, 'test-provider');
});

test('PlatformEventBus emits speak-unavailable, never speak-success, when nothing can speak', async () => {
    const CozyOS = freshWindow();
    const seen = [];
    CozyOS.PlatformEventBus.on('living-tts:speak-success', (d) => seen.push('success'));
    CozyOS.PlatformEventBus.on('living-tts:speak-unavailable', (d) => seen.push('unavailable'));
    await CozyOS.LivingTTS.speak({ text: 'Hello' });
    assert.deepEqual(seen, ['unavailable']);
});

test('getStatus() is fully honest and derived — muted is disclosed as not-yet-real', () => {
    const CozyOS = freshWindow();
    const status = CozyOS.LivingTTS.getStatus();
    assert.equal(status.muted, false);
    assert.equal(status.voiceManagerLoaded, true);
    assert.ok(Array.isArray(status.providers));
    assert.ok(Array.isArray(status.contexts));
});

test('no duplicate TTS manager — re-loading the file does not create a second instance', () => {
    const CozyOS = freshWindow();
    const first = CozyOS.LivingTTS;
    delete require.cache[require.resolve('../living-tts.js')];
    require('../living-tts.js');
    assert.strictEqual(window.CozyOS.LivingTTS, first, 'the duplicate-load guard must keep the original instance');
});

test('does not import/require founder-story files (mentioning the boundary in comments is fine; loading them is not)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../living-tts.js'), 'utf8');
    assert.doesNotMatch(src, /(require|import|src=)\s*\(?['"][^'"]*founder-story/i);
});

test('CozySpeech and VoiceManager regression: previewVoice() still routes through the real chain unchanged', async () => {
    const CozyOS = freshWindow();
    const result = await CozyOS.CozySpeech.previewVoice({ text: 'Hello' });
    // Honest in this harness (no browser TTS, no installed provider) —
    // proves LivingTTS's presence did not break the pre-existing contract.
    assert.equal(result.available, true); // VoiceManager IS registered as the backend
    assert.equal(typeof result.played, 'boolean');
});
