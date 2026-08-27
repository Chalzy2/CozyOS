'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CozyDeliveryBackendRegistry, REAL_CHANNELS } = require('../delivery-backend-registry');

test('unknown channel is rejected, real channels are exactly email and sms', () => {
    assert.deepEqual(REAL_CHANNELS, ['email', 'sms']);
    const registry = new CozyDeliveryBackendRegistry();
    assert.throws(() => registry.getState('carrier-pigeon'));
});

test('dispatch with zero backends is an honest no-op, never fabricated delivery', async () => {
    const registry = new CozyDeliveryBackendRegistry();
    const result = await registry.dispatch('email', { rawToken: 'abc' });
    assert.equal(result.delivered, false);
    assert.match(result.reason, /No delivery backend registered/);
    assert.deepEqual(registry.getState('email'), { channel: 'email', state: 'NONE', configured: false });
});

test('a devOnly backend delivers but the channel state never reports past DEV_ONLY', async () => {
    const registry = new CozyDeliveryBackendRegistry();
    let received = null;
    registry.registerBackend('email', 'dev-console', async (payload) => { received = payload; return { delivered: true }; }, { devOnly: true });
    const result = await registry.dispatch('email', { rawToken: 'xyz', username: 'alice' });
    assert.equal(result.delivered, true);
    assert.equal(result.backend, 'dev-console');
    assert.equal(result.devOnly, true);
    assert.equal(received.rawToken, 'xyz');
    assert.deepEqual(registry.getState('email'), { channel: 'email', state: 'DEV_ONLY', configured: false });
});

test('a real (non-devOnly) backend that has not yet delivered reports CONFIGURED_UNVERIFIED', () => {
    const registry = new CozyDeliveryBackendRegistry();
    registry.registerBackend('sms', 'real-sms-vendor', async () => ({ delivered: false, reason: 'not wired yet' }));
    assert.deepEqual(registry.getState('sms'), { channel: 'sms', state: 'CONFIGURED_UNVERIFIED', configured: true });
});

test('a real backend that successfully delivers moves the channel to LOCALLY_VERIFIED, never PRODUCTION_VERIFIED unless the backend says so', async () => {
    const registry = new CozyDeliveryBackendRegistry();
    registry.registerBackend('sms', 'real-sms-vendor', async () => ({ delivered: true }));
    await registry.dispatch('sms', { code: '123456' });
    assert.deepEqual(registry.getState('sms'), { channel: 'sms', state: 'LOCALLY_VERIFIED', configured: true });
});

test('PRODUCTION_VERIFIED is only ever set when a real backend explicitly proves it', async () => {
    const registry = new CozyDeliveryBackendRegistry();
    registry.registerBackend('sms', 'real-sms-vendor', async () => ({ delivered: true, productionVerified: true }));
    await registry.dispatch('sms', { code: '123456' });
    assert.deepEqual(registry.getState('sms'), { channel: 'sms', state: 'PRODUCTION_VERIFIED', configured: true });
});

test('dispatch tries multiple backends in registration order until one honestly delivers', async () => {
    const registry = new CozyDeliveryBackendRegistry();
    const calls = [];
    registry.registerBackend('email', 'first-fails', async () => { calls.push('first-fails'); return { delivered: false, reason: 'down' }; });
    registry.registerBackend('email', 'second-succeeds', async () => { calls.push('second-succeeds'); return { delivered: true }; });
    const result = await registry.dispatch('email', {});
    assert.deepEqual(calls, ['first-fails', 'second-succeeds']);
    assert.equal(result.delivered, true);
    assert.equal(result.backend, 'second-succeeds');
});

test('a throwing backend is caught and reported, not propagated, and other backends still get a chance', async () => {
    const registry = new CozyDeliveryBackendRegistry();
    registry.registerBackend('email', 'throws', async () => { throw new Error('boom'); });
    registry.registerBackend('email', 'works', async () => ({ delivered: true }));
    const result = await registry.dispatch('email', {});
    assert.equal(result.delivered, true);
    assert.equal(result.backend, 'works');
});

test('unregisterBackend genuinely removes a backend; dispatch after removal honestly fails again', async () => {
    const registry = new CozyDeliveryBackendRegistry();
    registry.registerBackend('email', 'temp', async () => ({ delivered: true }));
    const unreg = registry.unregisterBackend('email', 'temp');
    assert.equal(unreg.success, true);
    const result = await registry.dispatch('email', {});
    assert.equal(result.delivered, false);
});

test('listBackends and getHistory report real, non-fabricated state', async () => {
    const registry = new CozyDeliveryBackendRegistry();
    registry.registerBackend('sms', 'vendor-a', async () => ({ delivered: true }), { devOnly: false });
    const listed = registry.listBackends('sms');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'vendor-a');
    assert.equal(listed[0].devOnly, false);
    await registry.dispatch('sms', { code: '1' });
    const history = registry.getHistory();
    assert.ok(history.some(h => h.event === 'backend-registered'));
    assert.ok(history.some(h => h.event === 'dispatch-delivered'));
});
