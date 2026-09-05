'use strict';

/**
 * core/modules/communication/test/ldce-roster-reporter.test.js
 * R040 Phase 3 (continuation) — LdceRosterReporter
 *
 * HARNESS DISCLOSURE (read before trusting these results):
 *   REAL: the actual, unmodified-by-this-suite ldce-roster-reporter.js.
 *   STUBBED, and disclosed as a stub, not the real production file: the
 *   LDCESessionEngine dependency. The real ldce-session-engine.js
 *   (566 lines) requires window.CozyOS.CozyConversation, IdentityEngine,
 *   AuthorizationCoordinator, CozyTranslate, and real-time Firestore —
 *   a full browser runtime this Node test process does not have. This
 *   suite instead uses `makeFakeLdce()` below, built to the EXACT
 *   documented contract ldce-roster-reporter.js's own header declares
 *   it depends on and nothing more:
 *     - on(eventName, handler) -> unsubscribe function (matches
 *       ldce-session-engine.js line ~135 field-for-field)
 *     - listParticipants(sessionId, requesterId) -> array, fail-closed
 *       to [] for an unrecognized requester/session (matches
 *       ldce-session-engine.js's real listParticipants() at line ~333)
 *   This is the same disclosed-stub convention already used by this
 *   repository's own server/live-relay/session-authority.js tests for
 *   the identical real dependency-graph reason.
 *   NOT covered here: the real LDCESessionEngine's own internal roster
 *   correctness (that belongs to ldce-session-engine.js's own suite)
 *   and the WebSocket transport send() actually reaches a server (that
 *   is covered by live-distribution-signaling-server.test.js's
 *   roster-sync tests, which exercise the real transport end to end).
 *
 * Run: node --test core/modules/communication/test/ldce-roster-reporter.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LdceRosterReporter } = require('../ldce-roster-reporter');

/** makeFakeLdce() — see HARNESS DISCLOSURE above. */
function makeFakeLdce() {
    const listeners = new Map();
    const rosters = new Map(); // sessionId -> array of participant records
    return {
        emit(eventName, detail) {
            const set = listeners.get(eventName);
            if (!set) return;
            for (const fn of Array.from(set)) fn(detail);
        },
        setRoster(sessionId, participants) {
            rosters.set(sessionId, participants);
        },
        on(eventName, handler) {
            if (!listeners.has(eventName)) listeners.set(eventName, new Set());
            listeners.get(eventName).add(handler);
            return () => listeners.get(eventName)?.delete(handler);
        },
        listenerCount(eventName) {
            return listeners.get(eventName)?.size || 0;
        },
        // Fail-closed exactly like the real listParticipants(): unknown
        // session/requester returns [], never fabricated data.
        listParticipants(sessionId, requesterId) {
            if (requesterId !== 'host-1') return [];
            return rosters.get(sessionId) || [];
        },
    };
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

test('constructor validates a real ldce dependency shape', () => {
    assert.throws(() => new LdceRosterReporter({}), /opts\.ldce must be a real LDCESessionEngine instance/);
    assert.throws(() => new LdceRosterReporter({ ldce: { on() {}, listParticipants() {} } }), /opts\.sessionId is required/);
    assert.throws(() => new LdceRosterReporter({ ldce: { on() {}, listParticipants() {} }, sessionId: 's1' }), /opts\.hostId is required/);
    assert.throws(() => new LdceRosterReporter({ ldce: { on() {}, listParticipants() {} }, sessionId: 's1', hostId: 'h1' }), /opts\.send\(participants\) is required/);
});

test('subscribes to every roster-affecting LDCE event on construction', () => {
    const ldce = makeFakeLdce();
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', send() {} });
    for (const evt of ['participant-joined', 'participant-left', 'participant-role-changed', 'participant-language-changed', 'participant-state-changed', 'session-ended', 'session-cancelled']) {
        assert.equal(ldce.listenerCount(evt), 1, `expected a listener on "${evt}"`);
    }
    reporter.stop();
});

test('does NOT subscribe to signaling-*/metadata-changed events (never roster-affecting)', () => {
    const ldce = makeFakeLdce();
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', send() {} });
    for (const evt of ['signaling-offer-sent', 'signaling-answer-sent', 'metadata-changed', 'translation-session-linked']) {
        assert.equal(ldce.listenerCount(evt), 0);
    }
    reporter.stop();
});

test('a roster-affecting event triggers a real re-read via listParticipants(), never an assembled-from-payload roster', () => {
    const ldce = makeFakeLdce();
    ldce.setRoster('s1', [{ userId: 'host-1', role: 'host' }, { userId: 'p-1', role: 'participant' }]);
    const sent = [];
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', send: (p) => sent.push(p) });

    ldce.emit('participant-joined', { sessionId: 's1', userId: 'p-1' });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].length, 2);
    assert.equal(sent[0][1].userId, 'p-1');
    reporter.stop();
});

test('syncNow() performs an immediate real re-read, usable right after createSession()/joinSession()', () => {
    const ldce = makeFakeLdce();
    ldce.setRoster('s1', [{ userId: 'host-1', role: 'host' }]);
    const sent = [];
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', send: (p) => sent.push(p) });

    const result = reporter.syncNow();
    assert.equal(result.length, 1);
    assert.equal(sent.length, 1);
    assert.equal(reporter.getSyncCount(), 1);
    reporter.stop();
});

test('session isolation: an event carrying a different sessionId never triggers a resync for this reporter', () => {
    const ldce = makeFakeLdce();
    const sent = [];
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', send: (p) => sent.push(p) });

    ldce.emit('participant-joined', { sessionId: 'OTHER-SESSION', userId: 'x' });
    assert.equal(sent.length, 0, 'must not report a roster for the wrong session');
    reporter.stop();
});

test('an event with no sessionId in its detail still triggers a resync (detail.sessionId is an opt-in isolation guard, not a requirement)', () => {
    const ldce = makeFakeLdce();
    ldce.setRoster('s1', [{ userId: 'host-1', role: 'host' }]);
    const sent = [];
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', send: (p) => sent.push(p) });

    ldce.emit('session-ended', {});
    assert.equal(sent.length, 1);
    reporter.stop();
});

test('debounceMs coalesces a burst of same-tick events into one wire send with the final roster state', async () => {
    const ldce = makeFakeLdce();
    ldce.setRoster('s1', [{ userId: 'host-1', role: 'host' }]);
    const sent = [];
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', debounceMs: 20, send: (p) => sent.push(p) });

    ldce.emit('participant-joined', { sessionId: 's1', userId: 'a' });
    ldce.setRoster('s1', [{ userId: 'host-1', role: 'host' }, { userId: 'a', role: 'participant' }]);
    ldce.emit('participant-joined', { sessionId: 's1', userId: 'b' });
    ldce.setRoster('s1', [{ userId: 'host-1', role: 'host' }, { userId: 'a', role: 'participant' }, { userId: 'b', role: 'participant' }]);
    ldce.emit('participant-joined', { sessionId: 's1', userId: 'c' });

    assert.equal(sent.length, 0, 'debounced sends must not fire synchronously');
    await wait(60);
    assert.equal(sent.length, 1, 'exactly one coalesced send for the whole burst');
    assert.equal(sent[0].length, 3, 'the single send reflects the real, final roster read, not an intermediate one');
    reporter.stop();
});

test('without debounceMs (default 0), every event sends immediately — no coalescing', () => {
    const ldce = makeFakeLdce();
    ldce.setRoster('s1', []);
    const sent = [];
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', send: (p) => sent.push(p) });

    ldce.emit('participant-joined', { sessionId: 's1' });
    ldce.emit('participant-joined', { sessionId: 's1' });
    ldce.emit('participant-left', { sessionId: 's1' });
    assert.equal(sent.length, 3);
    reporter.stop();
});

test('stop() unsubscribes from every real LDCE event — no dangling listeners survive teardown', () => {
    const ldce = makeFakeLdce();
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', send() {} });
    reporter.stop();
    for (const evt of ['participant-joined', 'participant-left', 'participant-role-changed', 'participant-language-changed', 'participant-state-changed', 'session-ended', 'session-cancelled']) {
        assert.equal(ldce.listenerCount(evt), 0);
    }
});

test('stop() is idempotent and cancels a pending debounced sync so it never fires after teardown', async () => {
    const ldce = makeFakeLdce();
    ldce.setRoster('s1', [{ userId: 'host-1', role: 'host' }]);
    const sent = [];
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', debounceMs: 20, send: (p) => sent.push(p) });

    ldce.emit('participant-joined', { sessionId: 's1' });
    reporter.stop();
    reporter.stop(); // must not throw
    await wait(60);
    assert.equal(sent.length, 0, 'a pending debounced timer must be cancelled by stop()');
});

test('an event after stop() no longer triggers a resync', () => {
    const ldce = makeFakeLdce();
    const sent = [];
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'host-1', send: (p) => sent.push(p) });
    reporter.stop();
    ldce.emit('participant-joined', { sessionId: 's1' });
    assert.equal(sent.length, 0);
});

test('fail-closed pass-through: if listParticipants() denies the configured hostId (e.g. host removed), the reporter forwards the real empty result rather than substituting a cached one', () => {
    const ldce = makeFakeLdce(); // fake denies anyone but 'host-1'
    const sent = [];
    const reporter = new LdceRosterReporter({ ldce, sessionId: 's1', hostId: 'not-the-real-host', send: (p) => sent.push(p) });
    const result = reporter.syncNow();
    assert.deepEqual(result, []);
    assert.deepEqual(sent[0], []);
    reporter.stop();
});
