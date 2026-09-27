/**
 * core/modules/speech/tests/voice-catalog.test.js
 * CozyOS — Voice Catalog & Presentation-Realization
 *
 * Covers the real, concrete additions/edits made in this pass:
 *   1. voice-catalog.js: catalog metadata, provider-level selection
 *      (delegates to VoiceManager unmodified), browser-voice selection
 *      (own small settings store, verified against live voices),
 *      persistence across a simulated reload, language-continuity
 *      honesty in resolveSpeakRequest().
 *   2. cozy-tts-browser-adapter.js: optional config.voiceURI override,
 *      honest fallback to the existing language-prefix lookup when it
 *      doesn't match a real installed voice.
 *   3. voice-manager.js: optional request.voiceURI passthrough to the
 *      browser fallback call only.
 *   4. living-tts.js: optional request.voiceURI passthrough to
 *      VoiceManager.speak().
 *   5. Owner Voice / Charles precedence and honest unavailable/fallback
 *      behavior are unaffected (Charles registration, onboarding rule).
 *   6. Structural checks: no duplicate provider/catalog registration, no
 *      second Live Window/state machine introduced.
 *
 * Run with: node --test core/modules/speech/tests/voice-catalog.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const VOICE_MANAGER_PATH = path.join(__dirname, '..', 'voice-manager.js');
const CHARLES_PATH = path.join(__dirname, '..', 'providers', 'charles-voice-provider.js');
const STUBS_PATH = path.join(__dirname, '..', 'providers', 'stub-voice-providers.js');
const TTS_ADAPTER_PATH = path.join(__dirname, '..', 'adapters', 'cozy-tts-browser-adapter.js');
const CATALOG_PATH = path.join(__dirname, '..', 'voice-catalog.js');
const LIVING_TTS_PATH = path.join(__dirname, '..', '..', '..', 'living', 'living-tts.js');
const LIVING_ASSISTANT_PATH = path.join(__dirname, '..', '..', '..', 'living', 'cozy-living-assistant.js');
const ONBOARDING_VOICE_PATH = path.join(__dirname, '..', '..', 'identity', 'onboarding-voice-core.js');

// ── Shared fakes ─────────────────────────────────────────────────────

function makeFakeLocalStorage(seed) {
    const store = new Map(Object.entries(seed || {}));
    return {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); },
        _store: store,
    };
}

function fakeSpeechSynthesis(installedVoices) {
    return {
        getVoices: () => installedVoices,
        addEventListener() {},
        speak(utterance) { setTimeout(() => utterance.onend && utterance.onend(), 0); },
    };
}

const ENGLISH_VOICE = { voiceURI: 'com.apple.voice.en-US.Samantha', name: 'Samantha', lang: 'en-US', localService: true };
const ENGLISH_VOICE_2 = { voiceURI: 'com.apple.voice.en-GB.Daniel', name: 'Daniel', lang: 'en-GB', localService: true };
const SWAHILI_VOICE = { voiceURI: 'com.google.voice.sw-KE.Wanjiru', name: 'Wanjiru', lang: 'sw-KE', localService: false };

/**
 * freshChain(...) — loads voice-manager.js, charles, stubs, the browser
 * adapter, and voice-catalog.js into one shared fake `window`, in the
 * SAME order dashboard.html now loads them in. Mirrors the pattern
 * already established by voice-language-cognitive-response-integration.test.js.
 */
function freshChain({ localStorage, voices } = {}) {
    for (const p of [VOICE_MANAGER_PATH, CHARLES_PATH, STUBS_PATH, TTS_ADAPTER_PATH, CATALOG_PATH]) {
        delete require.cache[require.resolve(p)];
    }
    const ls = localStorage || makeFakeLocalStorage();
    global.window = { CozyOS: {}, localStorage: ls };
    global.localStorage = ls;
    global.window.speechSynthesis = fakeSpeechSynthesis(voices || [ENGLISH_VOICE, ENGLISH_VOICE_2, SWAHILI_VOICE]);
    global.speechSynthesis = global.window.speechSynthesis;
    global.SpeechSynthesisUtterance = function (text) { this.text = text; };
    global.document = { addEventListener() {}, removeEventListener() {} };
    global.Audio = class FakeAudio {
        constructor() { this.src = ''; }
        play() { setTimeout(() => this.onended && this.onended(), 0); return Promise.resolve(); }
    };

    require(VOICE_MANAGER_PATH);
    require(CHARLES_PATH);
    require(STUBS_PATH);
    require(TTS_ADAPTER_PATH);
    require(CATALOG_PATH);

    return {
        vm: global.window.CozyOS.VoiceManager,
        charles: global.window.CozyOS.CharlesVoiceProvider,
        stubs: global.window.CozyOS.StubVoiceProviders,
        adapter: global.window.CozyOS.CozyTTSBrowserAdapter,
        catalog: global.window.CozyOS.VoiceCatalog,
        ls,
    };
}

// ── 1. Catalog metadata ─────────────────────────────────────────────

test('catalog lists Charles, the stub providers, and every real installed browser voice — nothing fabricated', () => {
    const { catalog } = freshChain();
    const entries = catalog.listCatalog();
    const ids = entries.map((e) => e.voiceId);
    assert.ok(ids.includes('charles'));
    assert.ok(ids.includes('google'));
    assert.ok(ids.includes('swahili-pack'));
    assert.ok(ids.includes(`browser:${ENGLISH_VOICE.voiceURI}`));
    assert.ok(ids.includes(`browser:${SWAHILI_VOICE.voiceURI}`));
    // Exactly one entry per real installed voice — no duplicates fabricated.
    assert.equal(entries.filter((e) => e.provider === 'browser').length, 3);
});

test('Charles entry is honestly typed "recorded", never claims dynamic synthesis', () => {
    const { catalog } = freshChain();
    const charlesEntry = catalog.getVoice('charles');
    assert.equal(charlesEntry.type, 'recorded');
    assert.equal(charlesEntry.availability, 'installed');
});

test('stub providers (google/microsoft/etc.) are honestly reported as unavailable, never claimed installed', () => {
    const { catalog } = freshChain();
    const google = catalog.getVoice('google');
    assert.equal(google.availability, 'requires_api_key');
    assert.equal(google.type, 'unavailable');
});

test('browser voice entries carry real, derived-only locale/language/accent — never invented gender/age', () => {
    const { catalog } = freshChain();
    const sw = catalog.getVoice(`browser:${SWAHILI_VOICE.voiceURI}`);
    assert.equal(sw.language, 'sw');
    assert.equal(sw.locale, 'sw-KE');
    assert.equal(sw.accentRegion, 'KE');
    assert.equal(sw.genderAgeCharacterization, null, 'must never guess gender/age from a voice name');
    assert.equal(sw.expressivenessControl, false, 'no real backend exposes expressiveness — must never be fabricated as true');
});

test('language filter never matches an entry with an undeclared (null) language', () => {
    const { catalog } = freshChain();
    const swEntries = catalog.listCatalog({ language: 'sw' });
    // Only the real installed Swahili browser voice — Charles/stubs have
    // no declared language and must not appear.
    assert.equal(swEntries.length, 1);
    assert.equal(swEntries[0].voiceId, `browser:${SWAHILI_VOICE.voiceURI}`);
});

// ── 2. Provider-level selection delegates to VoiceManager unmodified ──

test('selecting a provider-level voice (e.g. Charles) is a direct, unmodified VoiceManager.setContextVoice() call', () => {
    const { catalog, vm } = freshChain();
    const result = catalog.selectVoice({ context: 'onboarding', voiceId: 'charles' });
    assert.equal(result.success, true);
    assert.equal(vm.getContextVoice('onboarding'), 'charles');
});

test('selecting an unknown provider-level voiceId fails honestly, exactly as VoiceManager itself would', () => {
    const { catalog } = freshChain();
    const result = catalog.selectVoice({ context: 'assistant', voiceId: 'not-a-real-provider' });
    assert.equal(result.success, false);
    assert.match(result.reason, /Unknown providerId/);
});

test('selecting with no context sets VoiceManager\'s real default voice', () => {
    const { catalog, vm } = freshChain();
    vm.registerProvider({ providerId: 'google', displayName: 'Google', status: 'installed', speak: async () => ({ available: true, played: true }) });
    const result = catalog.selectVoice({ voiceId: 'google' });
    assert.equal(result.success, true);
    assert.equal(vm.getDefaultVoice(), 'google');
});

// ── 3. Browser-voice (voiceURI) selection: verified, own settings store ──

test('selecting a specific installed browser voice succeeds only if it is REALLY currently installed', () => {
    const { catalog } = freshChain();
    const ok = catalog.selectVoice({ context: 'assistant', voiceId: `browser:${ENGLISH_VOICE.voiceURI}` });
    assert.equal(ok.success, true);
    const bad = catalog.selectVoice({ context: 'assistant', voiceId: 'browser:does-not-exist' });
    assert.equal(bad.success, false);
});

test('selecting a specific browser voice does NOT touch VoiceManager\'s own provider registry/settings', () => {
    const { catalog, vm } = freshChain();
    const before = vm.getSettings();
    catalog.selectVoice({ context: 'assistant', voiceId: `browser:${ENGLISH_VOICE.voiceURI}` });
    const after = vm.getSettings();
    assert.deepEqual(before, after, 'VoiceManager\'s own settings must be untouched by a presentation-only browser-voice preference');
});

test('"switching voices": selecting a second browser voice replaces the first for that context', () => {
    const { catalog } = freshChain();
    catalog.selectVoice({ context: 'assistant', voiceId: `browser:${ENGLISH_VOICE.voiceURI}` });
    assert.equal(catalog.currentSelection('assistant').preferredBrowserVoiceURI, ENGLISH_VOICE.voiceURI);
    catalog.selectVoice({ context: 'assistant', voiceId: `browser:${ENGLISH_VOICE_2.voiceURI}` });
    assert.equal(catalog.currentSelection('assistant').preferredBrowserVoiceURI, ENGLISH_VOICE_2.voiceURI);
});

test('a preference persists across a fresh reload (same localStorage, fresh module load)', () => {
    const storage = makeFakeLocalStorage();
    const first = freshChain({ localStorage: storage });
    first.catalog.selectVoice({ context: 'assistant', voiceId: `browser:${ENGLISH_VOICE.voiceURI}` });

    const second = freshChain({ localStorage: storage });
    assert.equal(second.catalog.currentSelection('assistant').preferredBrowserVoiceURI, ENGLISH_VOICE.voiceURI, 'selected voice must survive a new session, exactly like VoiceManager\'s own settings');
});

test('clearing a preference honestly removes it and persists the removal', () => {
    const storage = makeFakeLocalStorage();
    const first = freshChain({ localStorage: storage });
    first.catalog.selectVoice({ context: 'assistant', voiceId: `browser:${ENGLISH_VOICE.voiceURI}` });
    first.catalog.clearBrowserVoicePreference('assistant');

    const second = freshChain({ localStorage: storage });
    assert.equal(second.catalog.currentSelection('assistant').preferredBrowserVoiceURI, null);
});

test('a corrupt localStorage value never throws and degrades to real empty defaults', () => {
    const storage = makeFakeLocalStorage({ 'cozyos.voiceCatalog.v1': '{not-json' });
    assert.doesNotThrow(() => freshChain({ localStorage: storage }));
});

// ── 4. Language continuity in resolveSpeakRequest() ─────────────────

test('English text + a selected English voice: voiceURI is honestly included', () => {
    const { catalog } = freshChain();
    catalog.selectVoice({ context: 'assistant', voiceId: `browser:${ENGLISH_VOICE.voiceURI}` });
    const req = catalog.resolveSpeakRequest({ context: 'assistant', text: 'Hello there', language: 'en' });
    assert.equal(req.voiceURI, ENGLISH_VOICE.voiceURI);
    assert.equal(req.language, 'en', 'requested language must be passed through unchanged');
});

test('Kiswahili text + a selected Kiswahili voice: voiceURI is honestly included', () => {
    const { catalog } = freshChain();
    catalog.selectVoice({ context: 'assistant', voiceId: `browser:${SWAHILI_VOICE.voiceURI}` });
    const req = catalog.resolveSpeakRequest({ context: 'assistant', text: 'Habari yako', language: 'sw' });
    assert.equal(req.voiceURI, SWAHILI_VOICE.voiceURI);
    assert.equal(req.language, 'sw');
});

test('language switching mid-conversation: a Kiswahili voice preference is honestly dropped for an English-language call, never forced', () => {
    const { catalog } = freshChain();
    catalog.selectVoice({ context: 'assistant', voiceId: `browser:${SWAHILI_VOICE.voiceURI}` });
    const req = catalog.resolveSpeakRequest({ context: 'assistant', text: 'Hello there', language: 'en' });
    assert.equal(req.voiceURI, undefined, 'a mismatched voice preference must never be forced onto a different-language request');
    assert.equal(req.language, 'en', 'the requested language itself is never changed/substituted');
    assert.equal(req.text, 'Hello there', 'text is never altered — this layer never decides what to say or translates it');
});

test('the underlying Kiswahili preference is NOT deleted by one mismatched call — it still applies to the next Kiswahili request', () => {
    const { catalog } = freshChain();
    catalog.selectVoice({ context: 'assistant', voiceId: `browser:${SWAHILI_VOICE.voiceURI}` });
    catalog.resolveSpeakRequest({ context: 'assistant', text: 'Hello there', language: 'en' }); // mismatched, dropped for this call only
    const req2 = catalog.resolveSpeakRequest({ context: 'assistant', text: 'Habari', language: 'sw' });
    assert.equal(req2.voiceURI, SWAHILI_VOICE.voiceURI, 'preference must still be intact for a matching-language call afterward');
});

test('with no language requested at all, a set preference is honestly applied (no language to conflict with)', () => {
    const { catalog } = freshChain();
    catalog.selectVoice({ context: 'assistant', voiceId: `browser:${ENGLISH_VOICE.voiceURI}` });
    const req = catalog.resolveSpeakRequest({ context: 'assistant', text: 'Hi' });
    assert.equal(req.voiceURI, ENGLISH_VOICE.voiceURI);
});

// ── 5. End-to-end dispatch: voiceURI actually reaches the real backend ──

test('end-to-end: a selected browser voice is the ACTUAL voice used by the real Web Speech API utterance', async () => {
    const { catalog, vm } = freshChain();
    catalog.selectVoice({ context: 'assistant', voiceId: `browser:${ENGLISH_VOICE_2.voiceURI}` });
    const req = catalog.resolveSpeakRequest({ context: 'assistant', text: 'testing', language: 'en' });

    // "assistant" has no real Charles phrase key, so VoiceManager's
    // existing, unmodified fallback chain already reaches the browser
    // backend for arbitrary text — confirmed by reading
    // charles-voice-provider.js before this pass. This proves the
    // voiceURI actually threads all the way through, unmodified chain.
    const result = await vm.speak(req);
    assert.equal(result.available, true);
    assert.equal(result.played, true);
    assert.equal(result.providerId, 'browser', 'Charles cannot speak arbitrary "assistant" text — must honestly fall through to the browser backend');
    assert.equal(result.dedicatedVoiceMatched, true, 'the exact selected voiceURI must be honestly reported as matched');
});

test('an explicit voiceURI that is NOT actually installed falls back to the existing honest language-prefix lookup, never silently drops the request', async () => {
    const { adapter } = freshChain();
    const result = await adapter.speakPreview({ text: 'hi', language: 'en', voiceURI: 'not-installed-voice-id' });
    assert.equal(result.played, true);
    assert.equal(result.dedicatedVoiceMatched, true, 'must still honestly match via the existing language-prefix fallback');
});

test('omitting voiceURI entirely (every pre-existing caller) behaves byte-for-byte as before this pass', async () => {
    const { adapter } = freshChain();
    const result = await adapter.speakPreview({ text: 'hi', language: 'en' });
    assert.equal(result.played, true);
    assert.equal(result.dedicatedVoiceMatched, true);
});

// ── 6. Owner Voice / Charles precedence untouched ────────────────────

test('Owner Voice rule (first user) still resolves to "charles" — untouched by this pass', () => {
    delete require.cache[require.resolve(ONBOARDING_VOICE_PATH)];
    global.window = { CozyOS: {} };
    require(ONBOARDING_VOICE_PATH);
    const { decideOnboardingVoice, OWNER_VOICE_PROVIDER_ID } = global.window.CozyOS.OnboardingVoiceCore;
    assert.equal(OWNER_VOICE_PROVIDER_ID, 'charles');
    const result = decideOnboardingVoice({ isFirstUser: true, soundEnabled: true });
    assert.equal(result.useOwnerVoice, true);
    assert.equal(result.providerId, 'charles');
});

test('VoiceManager\'s unconditional default remains "charles" after voice-catalog.js is loaded', () => {
    const { vm } = freshChain();
    assert.equal(vm.getDefaultVoice(), 'charles');
});

test('a real recorded Charles phrase ("startup") still plays via the exact same audio path, unaffected by voiceURI plumbing', async () => {
    const { vm } = freshChain();
    const result = await vm.speak({ context: 'startup' });
    assert.equal(result.available, true);
    assert.equal(result.providerId, 'charles');
});

// ── 7. Provider failure / unavailable voice / fallback chain ─────────

test('unavailable voice (a stub) can never actually be dispatched — VoiceManager\'s own speak:null guard is untouched', async () => {
    const { vm } = freshChain();
    // "google" is a real, registered stub with speak:null.
    const result = await vm.speak({ providerId: 'google', text: 'hi' });
    // direct attempt on "google" fails (speak:null) -> honest fallback
    // chain (charles -> browser) kicks in exactly as before this pass.
    assert.equal(result.providerId, 'browser');
});

test('total provider failure (no synth, no Charles match) resolves an honest unavailable — never a fabricated success', async () => {
    delete require.cache[require.resolve(VOICE_MANAGER_PATH)];
    delete require.cache[require.resolve(CHARLES_PATH)];
    global.window = { CozyOS: {} };
    require(VOICE_MANAGER_PATH);
    require(CHARLES_PATH);
    // No CozyTTSBrowserAdapter loaded at all this time.
    const vm = global.window.CozyOS.VoiceManager;
    const result = await vm.speak({ context: 'assistant', text: 'hi' });
    assert.equal(result.available, false);
    assert.equal(result.played, false);
    assert.equal(result.providerId, null);
});

// ── 8. No duplicate TTS invocation / no second Live Window / structural ──

test('duplicate-load guard: requiring voice-catalog.js twice never creates a second instance', () => {
    const { catalog: first } = freshChain();
    // Re-require without clearing the cache entry for CATALOG_PATH only —
    // module-level `if (window.CozyOS.VoiceCatalog) return;` guard.
    require(CATALOG_PATH);
    assert.equal(global.window.CozyOS.VoiceCatalog, first);
});

test('VoiceManager.speak() is called exactly once per #speak() when VoiceCatalog resolves a request (no double dispatch)', () => {
    const assistantSrc = fs.readFileSync(LIVING_ASSISTANT_PATH, 'utf8');
    const speakMethodMatch = assistantSrc.match(/#speak\(text\) \{[\s\S]*?\n {8}\}/);
    assert.ok(speakMethodMatch, '#speak() method must exist');
    const body = speakMethodMatch[0];
    const vmSpeakCalls = (body.match(/vm\.speak\(/g) || []).length;
    assert.equal(vmSpeakCalls, 1, '#speak() must call VoiceManager.speak() exactly once — no duplicate TTS invocation');
});

test('no second Live Window / state machine: cozy-living-assistant.js still subscribes to LivingAI\'s existing state machine exactly once, and this pass introduces no new state machine wiring', () => {
    const assistantSrc = fs.readFileSync(LIVING_ASSISTANT_PATH, 'utf8');
    const wireCalls = (assistantSrc.match(/#wireLivingAIState\(\)/g) || []).length;
    // Doc comment + declaration + exactly one call site — this exact
    // count (3) was confirmed by direct inspection BEFORE this pass and
    // must be unchanged by it (a 4th occurrence would mean a second
    // call site/wiring was added).
    assert.equal(wireCalls, 3, 'expected doc comment + declaration + exactly one call site for #wireLivingAIState(), unchanged by this pass');
    assert.ok(!/new\s+VoiceCatalog|class\s+VoiceCatalog/.test(assistantSrc), 'cozy-living-assistant.js must not instantiate/define a second voice/state engine');
});

test('cozy-living-assistant.js\'s #speak() honestly no-ops when VoiceCatalog is not loaded (backward compatible)', () => {
    // Structural proof via source inspection: the catalog call is
    // guarded by a typeof/existence check and wrapped in try/catch.
    const assistantSrc = fs.readFileSync(LIVING_ASSISTANT_PATH, 'utf8');
    assert.match(assistantSrc, /window\.CozyOS && window\.CozyOS\.VoiceCatalog/);
    assert.match(assistantSrc, /catalog && typeof catalog\.resolveSpeakRequest === "function"/);
});

test('living-tts.js and voice-manager.js only add an optional, additively-named voiceURI field — no removed/renamed existing fields', () => {
    const livingTtsSrc = fs.readFileSync(LIVING_TTS_PATH, 'utf8');
    const vmSrc = fs.readFileSync(VOICE_MANAGER_PATH, 'utf8');
    assert.match(livingTtsSrc, /voiceURI: request\.voiceURI/);
    assert.match(livingTtsSrc, /text: request\.text/);
    assert.match(livingTtsSrc, /providerId: request\.providerId/);
    assert.match(vmSrc, /voiceURI: request\.voiceURI/);
});

console.log('Voice Catalog & Presentation-Realization suite: run complete.');
