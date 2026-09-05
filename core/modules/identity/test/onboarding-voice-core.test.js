/**
 * core/modules/identity/test/onboarding-voice-core.test.js
 * Run with: node --test core/modules/identity/test/onboarding-voice-core.test.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CORE_PATH = path.join(__dirname, '..', 'onboarding-voice-core.js');

function load() {
    delete require.cache[require.resolve(CORE_PATH)];
    global.window = { CozyOS: {} };
    require(CORE_PATH);
    return global.window.CozyOS.OnboardingVoiceCore;
}

const { decideOnboardingVoice, OWNER_VOICE_PROVIDER_ID } = load();

test('OWNER_VOICE_PROVIDER_ID is "charles" (the existing official CozyOS voice provider, not a new one)', () => {
    assert.equal(OWNER_VOICE_PROVIDER_ID, 'charles');
});

test('TEST 1: first user + sound enabled -> Owner Voice selected', () => {
    const result = decideOnboardingVoice({ isFirstUser: true, soundEnabled: true });
    assert.equal(result.useOwnerVoice, true);
    assert.equal(result.providerId, 'charles');
});

test('TEST 2: first user + sound disabled -> no forced voice playback', () => {
    const result = decideOnboardingVoice({ isFirstUser: true, soundEnabled: false });
    assert.equal(result.useOwnerVoice, false);
    assert.equal(result.providerId, null);
    assert.equal(result.reason, 'sound_disabled');
});

test('TEST 3: not the first user -> Owner Voice never forced, regardless of sound setting', () => {
    const withSound = decideOnboardingVoice({ isFirstUser: false, soundEnabled: true });
    assert.equal(withSound.useOwnerVoice, false);
    const withoutSound = decideOnboardingVoice({ isFirstUser: false, soundEnabled: false });
    assert.equal(withoutSound.useOwnerVoice, false);
});

test('a truthy-but-non-boolean isFirstUser (spoofing-shaped input) does NOT grant Owner Voice', () => {
    const result = decideOnboardingVoice({ isFirstUser: 1, soundEnabled: true });
    assert.equal(result.useOwnerVoice, false);
});

test('a truthy-but-non-boolean soundEnabled does NOT grant Owner Voice', () => {
    const result = decideOnboardingVoice({ isFirstUser: true, soundEnabled: 'true' });
    assert.equal(result.useOwnerVoice, false);
});

test('malformed/missing input never throws and never grants Owner Voice', () => {
    assert.equal(decideOnboardingVoice(undefined).useOwnerVoice, false);
    assert.equal(decideOnboardingVoice(null).useOwnerVoice, false);
    assert.equal(decideOnboardingVoice({}).useOwnerVoice, false);
});

test('this module never inspects username/URL/query/role — only isFirstUser/soundEnabled/ownerVoiceAvailable', () => {
    const result = decideOnboardingVoice({
        isFirstUser: false,
        soundEnabled: true,
        username: 'owner',
        url: '/register?firstUser=true',
        role: 'admin',
    });
    assert.equal(result.useOwnerVoice, false, 'extra fields must have zero effect; only the real isFirstUser signal matters');
});

test('ownerVoiceAvailable explicit false -> Owner Voice not forced, distinct reason reported', () => {
    const result = decideOnboardingVoice({ isFirstUser: true, soundEnabled: true, ownerVoiceAvailable: false });
    assert.equal(result.useOwnerVoice, false);
    assert.equal(result.reason, 'owner_voice_unavailable');
});

test('ownerVoiceAvailable omitted defaults to available (common case still works)', () => {
    const result = decideOnboardingVoice({ isFirstUser: true, soundEnabled: true });
    assert.equal(result.useOwnerVoice, true);
});

test('module is frozen / no accidental mutation surface', () => {
    const mod = load();
    assert.ok(Object.isFrozen(mod));
});
