'use strict';

/**
 * core/modules/speech/adapters/test/speech-translation-provider-availability-snapshot.test.js
 *
 * SA-8 Phase 4 (Provider-Agnostic Capability Audit & Availability
 * Contract) — unit tests for window.CozyOS.SpeechTranslationProviders.
 * getAvailabilitySnapshot(), the real, additive extension to the
 * EXISTING translation provider registry (list()/get(), both untouched).
 *
 * Run with: node --test core/modules/speech/adapters/test/speech-translation-provider-availability-snapshot.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadRegistry() {
    const modulePath = path.join(__dirname, '..', 'speech-translation-provider.js');
    delete require.cache[require.resolve(modulePath)];
    global.window = { CozyOS: {} };
    require(modulePath);
    return global.window.CozyOS.SpeechTranslationProviders;
}

test('getAvailabilitySnapshot() returns an empty, frozen array when no provider is registered', async () => {
    const registry = loadRegistry();
    const snapshot = await registry.getAvailabilitySnapshot();
    assert.deepEqual(snapshot, []);
    assert.ok(Object.isFrozen(snapshot));
});

test('getAvailabilitySnapshot() classifies a provider with no isAvailable() as UNKNOWN — never assumed available just because it is registered', async () => {
    const registry = loadRegistry();
    registry.register({ name: 'legacy', type: 'cloud', async translate() { return { translatedText: 'x', isReal: true }; } });
    const snapshot = await registry.getAvailabilitySnapshot();
    assert.equal(snapshot[0].availability, 'UNKNOWN');
});

test('getAvailabilitySnapshot() classifies an offline-capable provider whose isAvailable() resolves true as AVAILABLE_OFFLINE (the real nllb-bridge shape)', async () => {
    const registry = loadRegistry();
    registry.register({
        name: 'fake-nllb', type: 'ai', supportsOffline: true,
        async translate() { return { translatedText: 'x', isReal: true }; },
        async isAvailable() { return true; },
    });
    const snapshot = await registry.getAvailabilitySnapshot();
    assert.equal(snapshot[0].availability, 'AVAILABLE_OFFLINE');
});

test('getAvailabilitySnapshot() classifies a provider whose isAvailable() resolves false as REGISTERED_BUT_INACTIVE (the real, current nllb-bridge state — bridge process not running)', async () => {
    const registry = loadRegistry();
    registry.register({
        name: 'fake-nllb', type: 'ai', supportsOffline: true,
        async translate() { return { translatedText: 'x', isReal: true }; },
        async isAvailable() { return false; },
    });
    const snapshot = await registry.getAvailabilitySnapshot();
    assert.equal(snapshot[0].availability, 'REGISTERED_BUT_INACTIVE');
});

test('getAvailabilitySnapshot() classifies an online (non-offline) provider whose isAvailable() resolves true as AVAILABLE_ONLINE', async () => {
    const registry = loadRegistry();
    registry.register({
        name: 'fake-cloud', type: 'cloud', supportsOffline: false,
        async translate() { return { translatedText: 'x', isReal: true }; },
        async isAvailable() { return true; },
    });
    const snapshot = await registry.getAvailabilitySnapshot();
    assert.equal(snapshot[0].availability, 'AVAILABLE_ONLINE');
});

test('getAvailabilitySnapshot() reports REGISTERED_BUT_INACTIVE, never throws, when a provider\'s isAvailable() itself throws', async () => {
    const registry = loadRegistry();
    registry.register({
        name: 'flaky', type: 'cloud',
        async translate() { return { translatedText: 'x', isReal: true }; },
        async isAvailable() { throw new Error('simulated'); },
    });
    const snapshot = await registry.getAvailabilitySnapshot();
    assert.equal(snapshot[0].availability, 'REGISTERED_BUT_INACTIVE');
});

test('getAvailabilitySnapshot() times out a hanging isAvailable() and reports UNKNOWN rather than blocking or guessing true', async () => {
    const registry = loadRegistry();
    registry.register({
        name: 'hanging', type: 'cloud',
        async translate() { return { translatedText: 'x', isReal: true }; },
        async isAvailable() { return new Promise(() => {}); },
    });
    const snapshot = await registry.getAvailabilitySnapshot({ timeoutMs: 50 });
    assert.equal(snapshot[0].availability, 'UNKNOWN');
});

test('getAvailabilitySnapshot() preserves each provider\'s real, declared capability flags alongside the availability classification', async () => {
    const registry = loadRegistry();
    registry.register({
        name: 'full-flags', type: 'ai', supportsRealtime: true, supportsOffline: true, supportsAutoDetect: true, supportsStreaming: true,
        async translate() { return { translatedText: 'x', isReal: true }; },
        async isAvailable() { return true; },
    });
    const snapshot = await registry.getAvailabilitySnapshot();
    assert.deepEqual(snapshot[0], Object.freeze({
        name: 'full-flags', type: 'ai', availability: 'AVAILABLE_OFFLINE',
        supportsRealtime: true, supportsOffline: true, supportsAutoDetect: true, supportsStreaming: true,
    }));
});

test('getAvailabilitySnapshot() never mutates the existing registry — list()/get() remain unaffected by calling it', async () => {
    const registry = loadRegistry();
    registry.register({ name: 'a', type: 'cloud', async translate() { return { translatedText: 'x', isReal: true }; } });
    const before = registry.list();
    await registry.getAvailabilitySnapshot();
    assert.deepEqual(registry.list(), before);
});
