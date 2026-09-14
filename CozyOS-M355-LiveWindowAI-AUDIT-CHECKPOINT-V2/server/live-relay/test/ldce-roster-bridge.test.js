'use strict';

/**
 * server/live-relay/test/ldce-roster-bridge.test.js
 * R040 Phase 3 (continuation) — LdceRosterBridge
 *
 * HARNESS DISCLOSURE (read before trusting these results):
 *   REAL: the actual, unmodified-by-this-suite ldce-roster-bridge.js.
 *   No mock replaces it — this is pure in-process logic (a Map plus
 *   Date.now()), so there is nothing to stub. Time-based staleness
 *   assertions use the class's own `maxAgeMs` option (set small here)
 *   rather than faking Date.now(), so real wall-clock delay elapses in
 *   this suite (a few hundred ms total).
 *   NOT covered here: the WebSocket transport, SessionAuthority
 *   integration, and the HTTP register-host route — those are covered
 *   in live-distribution-signaling-server.test.js, which exercises
 *   this same class through the real server.
 *
 * Run: node --test server/live-relay/test/ldce-roster-bridge.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LdceRosterBridge } = require('../ldce-roster-bridge');

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

test('roleResolver() fails closed for an unknown session', () => {
    const bridge = new LdceRosterBridge();
    assert.equal(bridge.roleResolver('no-such-session', 'anyone'), null);
});

test('registerHost() bootstraps a host-only roster and roleResolver() resolves it', () => {
    const bridge = new LdceRosterBridge();
    const result = bridge.registerHost('sess-1', 'pastor-1');
    assert.equal(result.success, true);
    assert.equal(result.alreadySeeded, false);

    const record = bridge.roleResolver('sess-1', 'pastor-1');
    assert.equal(record.role, 'host');
    assert.equal(record.userId, 'pastor-1');

    // Nobody else is on the bootstrap roster yet.
    assert.equal(bridge.roleResolver('sess-1', 'viewer-1'), null);
});

test('registerHost() is idempotent and additive-only: a second call on an already-seeded session never overwrites a real reported roster', () => {
    const bridge = new LdceRosterBridge();
    bridge.registerHost('sess-1', 'pastor-1');
    bridge.updateRoster('sess-1', 'pastor-1', [
        { userId: 'pastor-1', role: 'host' },
        { userId: 'viewer-9', role: 'participant' },
    ]);

    const second = bridge.registerHost('sess-1', 'pastor-1');
    assert.equal(second.success, true);
    assert.equal(second.alreadySeeded, true);

    // The real, richer reported roster must still be intact — not
    // replaced by a fresh single-host bootstrap Map.
    assert.ok(bridge.roleResolver('sess-1', 'viewer-9'));
});

test('registerHost() requires both sessionId and hostUserId', () => {
    const bridge = new LdceRosterBridge();
    assert.equal(bridge.registerHost(null, 'pastor-1').success, false);
    assert.equal(bridge.registerHost('sess-1', null).success, false);
});

test('updateRoster() mirrors real listParticipants() output field-for-field', () => {
    const bridge = new LdceRosterBridge();
    const result = bridge.updateRoster('sess-2', 'pastor-2', [
        { userId: 'pastor-2', role: 'host', language: 'en', muted: false, cameraOn: true, joinedAt: 1000 },
        { userId: 'mod-1', role: 'moderator', language: 'sw' },
        { userId: 'p-1', role: 'participant' },
    ]);
    assert.equal(result.success, true);
    assert.equal(result.count, 3);

    const host = bridge.roleResolver('sess-2', 'pastor-2');
    assert.equal(host.role, 'host');
    assert.equal(host.language, 'en');
    assert.equal(host.cameraOn, true);

    const mod = bridge.roleResolver('sess-2', 'mod-1');
    assert.equal(mod.role, 'moderator');
    assert.equal(mod.language, 'sw');
});

test('updateRoster() completely replaces the previous snapshot (a participant who left is no longer resolvable)', () => {
    const bridge = new LdceRosterBridge();
    bridge.updateRoster('sess-3', 'host-3', [
        { userId: 'host-3', role: 'host' },
        { userId: 'p-leaving', role: 'participant' },
    ]);
    assert.ok(bridge.roleResolver('sess-3', 'p-leaving'));

    bridge.updateRoster('sess-3', 'host-3', [
        { userId: 'host-3', role: 'host' },
    ]);
    assert.equal(bridge.roleResolver('sess-3', 'p-leaving'), null);
});

test('updateRoster() skips malformed entries rather than fabricating defaults', () => {
    const bridge = new LdceRosterBridge();
    const result = bridge.updateRoster('sess-4', 'host-4', [
        { userId: 'host-4', role: 'host' },
        { userId: 'bad-1' }, // missing role
        { role: 'participant' }, // missing userId
        null,
        'not-an-object',
    ]);
    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(bridge.roleResolver('sess-4', 'bad-1'), null);
});

test('updateRoster() rejects a non-array participants payload without touching any existing roster', () => {
    const bridge = new LdceRosterBridge();
    bridge.registerHost('sess-5', 'host-5');
    const result = bridge.updateRoster('sess-5', 'host-5', 'not-an-array');
    assert.equal(result.success, false);
    // Existing bootstrap roster is untouched by the rejected call.
    assert.ok(bridge.roleResolver('sess-5', 'host-5'));
});

test('roleResolver() fails closed once a roster snapshot exceeds maxAgeMs (stale roster)', async () => {
    const bridge = new LdceRosterBridge({ maxAgeMs: 100 });
    bridge.updateRoster('sess-6', 'host-6', [{ userId: 'host-6', role: 'host' }]);
    assert.ok(bridge.roleResolver('sess-6', 'host-6'), 'fresh roster resolves');

    await wait(150);
    assert.equal(bridge.roleResolver('sess-6', 'host-6'), null, 'stale roster fails closed');
    assert.equal(bridge.isFresh('sess-6'), false);
});

test('a fresh updateRoster() call after staleness restores resolution (real re-report, not a cache bypass)', async () => {
    const bridge = new LdceRosterBridge({ maxAgeMs: 100 });
    bridge.updateRoster('sess-7', 'host-7', [{ userId: 'host-7', role: 'host' }]);
    await wait(150);
    assert.equal(bridge.roleResolver('sess-7', 'host-7'), null);

    bridge.updateRoster('sess-7', 'host-7', [{ userId: 'host-7', role: 'host' }]);
    assert.ok(bridge.roleResolver('sess-7', 'host-7'));
});

test('clearSession() removes a roster so a later session reusing the same sessionId never inherits stale data', () => {
    const bridge = new LdceRosterBridge();
    bridge.updateRoster('sess-8', 'host-8', [{ userId: 'host-8', role: 'host' }]);
    assert.ok(bridge.roleResolver('sess-8', 'host-8'));

    bridge.clearSession('sess-8');
    assert.equal(bridge.roleResolver('sess-8', 'host-8'), null);
    assert.equal(bridge.isFresh('sess-8'), false);
    assert.equal(bridge.lastReportedAt('sess-8'), null);
});

test('lastReportedAt() reflects the real last report time and advances on each real update', async () => {
    const bridge = new LdceRosterBridge();
    bridge.updateRoster('sess-9', 'host-9', [{ userId: 'host-9', role: 'host' }]);
    const first = bridge.lastReportedAt('sess-9');
    assert.ok(typeof first === 'number' && first > 0);

    await wait(10);
    bridge.updateRoster('sess-9', 'host-9', [{ userId: 'host-9', role: 'host' }]);
    const second = bridge.lastReportedAt('sess-9');
    assert.ok(second >= first);
});

test('roleResolver() returns a defensive copy, not a live reference into the internal roster', () => {
    const bridge = new LdceRosterBridge();
    bridge.updateRoster('sess-10', 'host-10', [{ userId: 'host-10', role: 'host', muted: false }]);
    const record = bridge.roleResolver('sess-10', 'host-10');
    record.role = 'moderator'; // mutate the returned object
    const rereadRecord = bridge.roleResolver('sess-10', 'host-10');
    assert.equal(rereadRecord.role, 'host', 'internal state must be unaffected by mutating a prior read');
});
