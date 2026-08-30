'use strict';

/**
 * Regression test suite for
 * core/modules/ChurchOS/church-live-attendance.js (RP-035 Phase B,
 * Checkpoint 1).
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified production code under test: the real
 *   ldce-session-engine.js (core/modules/communication/) and the real
 *   church-live-attendance.js this checkpoint adds. Every join/leave/
 *   count in this file runs through those two real files' actual
 *   logic — no roster, no count, and no attendance number in this
 *   suite is hand-constructed; all of it is the real return value of
 *   real production calls.
 *
 *   STUBBED, and disclosed as stubs, not real production files:
 *   CozyConversation and IdentityEngine — the two engines
 *   ldce-session-engine.js composes. Real production versions exist
 *   elsewhere in this repository (core/modules/conversation/
 *   cozy-conversation.js, core/modules/identity/identity-engine.js)
 *   but pull in unrelated subsystems (PBKDF2 auth, org registries,
 *   speech/translation adapters) not needed to exercise real LDCE
 *   join/leave/roster logic in isolation. These stubs implement only
 *   the exact method contracts LDCE actually calls
 *   (createConversation/startConversation/pauseConversation/
 *   resumeConversation/endConversation/cancelConversation/
 *   addTranscriptSegment; grantResourcePermission/
 *   checkResourcePermission on a real registered-user set) —
 *   matching, not loosening, the real engines' semantics (e.g.
 *   grantResourcePermission throws for an unregistered userId, same
 *   as the real IdentityEngine).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function makeStubConversation() {
    const conversations = new Map();
    let n = 0;
    return {
        createConversation({ type, participants }) {
            const conversationId = `conv_${++n}`;
            conversations.set(conversationId, { conversationId, type, participants, state: 'created' });
            return { success: true, conversationId };
        },
        getConversation(id) { return conversations.get(id) || null; },
        startConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'active'; return { success: true }; },
        pauseConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'paused'; return { success: true }; },
        resumeConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'active'; return { success: true }; },
        endConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'ended'; return { success: true }; },
        cancelConversation(id) { const c = conversations.get(id); if (!c) return { success: false, reason: 'Unknown conversation.' }; c.state = 'cancelled'; return { success: true }; },
        addTranscriptSegment() { /* real engine logs transcript; not relevant to attendance counts */ },
    };
}

/** Stub IdentityEngine — same resource:action grant/check contract the
 * real engine exposes to LDCE, including the real "unknown userId
 * throws" behavior LDCE's own comments rely on. */
function makeStubIdentity() {
    const users = new Set();
    const grants = new Map(); // userId -> Set(permissionString)
    return {
        registerUser(userId) { users.add(userId); },
        grantResourcePermission(userId, permissionString) {
            if (!users.has(userId)) throw new Error(`[StubIdentity] unknown userId "${userId}".`);
            if (!grants.has(userId)) grants.set(userId, new Set());
            grants.get(userId).add(permissionString);
            return true;
        },
        checkResourcePermission(userId, permissionString) {
            return !!(grants.get(userId) && grants.get(userId).has(permissionString));
        },
    };
}

function freshEngines() {
    delete require.cache[require.resolve('../../communication/ldce-session-engine.js')];
    delete require.cache[require.resolve('../church-live-attendance.js')];
    const identity = makeStubIdentity();
    global.window = { CozyOS: { CozyConversation: makeStubConversation(), IdentityEngine: identity } };
    require('../../communication/ldce-session-engine.js');
    require('../church-live-attendance.js');
    return { ldce: global.window.CozyOS.LDCESessionEngine, attendance: global.window.CozyOS.ChurchLiveAttendance, identity };
}

function registerAndInvite(ldce, identity, sessionId, hostId, userIds) {
    for (const uid of userIds) {
        identity.registerUser(uid);
        const result = ldce.inviteParticipant(sessionId, hostId, uid);
        assert.equal(result.success, true, `invite for ${uid} should succeed: ${result.reason}`);
    }
}

/* ------------------------------------------------------------------ */
/* AVAILABILITY / HONESTY GUARANTEES                                   */
/* ------------------------------------------------------------------ */

test('reports available:false, not a fabricated count, when LDCESessionEngine is not loaded', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve('../church-live-attendance.js')];
    require('../church-live-attendance.js');
    const attendance = global.window.CozyOS.ChurchLiveAttendance;
    const result = attendance.getViewerAttendance('nonexistent-session');
    assert.equal(result.available, false);
    assert.equal(result.attending, 0);
    assert.ok(result.reason);
});

test('reports available:false for an unknown sessionId, never a placeholder number', () => {
    const { attendance } = freshEngines();
    const result = attendance.getViewerAttendance('does-not-exist');
    assert.equal(result.available, false);
    assert.equal(result.attending, 0);
});

test('module registers version and Modules registry entry', () => {
    const { attendance } = freshEngines();
    assert.equal(attendance.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['church-live-attendance'].version, '1.0.0');
});

/* ------------------------------------------------------------------ */
/* REAL JOIN / LEAVE / DUPLICATE-JOIN / ACTIVE-LEFT COUNTS             */
/* ------------------------------------------------------------------ */

test('zero real participants beyond the host reports active:1 (host only), not a fabricated number', () => {
    const { ldce, attendance } = freshEngines();
    const created = ldce.createSession('pastor-1', { type: 'meeting', title: 'Sunday Service' });
    assert.equal(created.success, true);

    const counts = attendance.getAttendanceCounts(created.sessionId);
    assert.equal(counts.available, true);
    assert.equal(counts.totalEverJoined, 1); // host is seeded into the roster by createSession()
    assert.equal(counts.active, 1);
    assert.equal(counts.left, 0);

    const viewer = attendance.getViewerAttendance(created.sessionId);
    assert.deepEqual(viewer, { available: true, attending: 1 });
});

test('real join events increase active count exactly, no double counting', () => {
    const { ldce, attendance, identity } = freshEngines();
    const created = ldce.createSession('pastor-1', { type: 'meeting' });
    const sessionId = created.sessionId;
    registerAndInvite(ldce, identity, sessionId, 'pastor-1', ['member-a', 'member-b', 'member-c']);

    for (const uid of ['member-a', 'member-b', 'member-c']) {
        const joinResult = ldce.joinSession(sessionId, uid);
        assert.equal(joinResult.success, true, `join for ${uid} should succeed: ${joinResult.reason}`);
    }

    const counts = attendance.getAttendanceCounts(sessionId);
    assert.equal(counts.totalEverJoined, 4); // host + 3 real joins
    assert.equal(counts.active, 4);
    assert.equal(counts.left, 0);
    assert.equal(attendance.getViewerAttendance(sessionId).attending, 4);
});

test('duplicate join by the same real userId does not inflate the count (LDCE roster is Map-keyed by userId)', () => {
    const { ldce, attendance, identity } = freshEngines();
    const created = ldce.createSession('pastor-1', { type: 'meeting' });
    const sessionId = created.sessionId;
    registerAndInvite(ldce, identity, sessionId, 'pastor-1', ['member-a']);

    ldce.joinSession(sessionId, 'member-a');
    ldce.joinSession(sessionId, 'member-a'); // real duplicate join attempt, same userId
    ldce.joinSession(sessionId, 'member-a'); // and again

    const counts = attendance.getAttendanceCounts(sessionId);
    assert.equal(counts.totalEverJoined, 2); // host + member-a, exactly once each
    assert.equal(counts.active, 2);
    assert.equal(attendance.getViewerAttendance(sessionId).attending, 2);
});

test('a real leave event moves a participant from active to left, and viewer count drops accordingly', () => {
    const { ldce, attendance, identity } = freshEngines();
    const created = ldce.createSession('pastor-1', { type: 'meeting' });
    const sessionId = created.sessionId;
    registerAndInvite(ldce, identity, sessionId, 'pastor-1', ['member-a', 'member-b']);
    ldce.joinSession(sessionId, 'member-a');
    ldce.joinSession(sessionId, 'member-b');

    let counts = attendance.getAttendanceCounts(sessionId);
    assert.equal(counts.active, 3);
    assert.equal(counts.left, 0);

    const leaveResult = ldce.leaveSession(sessionId, 'member-a');
    assert.equal(leaveResult.success, true);

    counts = attendance.getAttendanceCounts(sessionId);
    assert.equal(counts.totalEverJoined, 3); // real leave does not erase the roster entry (soft-delete)
    assert.equal(counts.active, 2); // host + member-b
    assert.equal(counts.left, 1); // member-a
    assert.equal(attendance.getViewerAttendance(sessionId).attending, 2);
});

test('rejoin after a real leave returns the participant to active without a second roster entry', () => {
    const { ldce, attendance, identity } = freshEngines();
    const created = ldce.createSession('pastor-1', { type: 'meeting' });
    const sessionId = created.sessionId;
    registerAndInvite(ldce, identity, sessionId, 'pastor-1', ['member-a']);
    ldce.joinSession(sessionId, 'member-a');
    ldce.leaveSession(sessionId, 'member-a');
    ldce.joinSession(sessionId, 'member-a'); // real rejoin

    const counts = attendance.getAttendanceCounts(sessionId);
    assert.equal(counts.totalEverJoined, 2); // still exactly host + member-a
    assert.equal(counts.active, 2);
    assert.equal(counts.left, 0);
});

/* ------------------------------------------------------------------ */
/* SESSION ISOLATION                                                   */
/* ------------------------------------------------------------------ */

test('attendance counts for one session never leak into another real session', () => {
    const { ldce, attendance, identity } = freshEngines();
    const sessionA = ldce.createSession('pastor-1', { type: 'meeting' }).sessionId;
    const sessionB = ldce.createSession('pastor-2', { type: 'meeting' }).sessionId;
    registerAndInvite(ldce, identity, sessionA, 'pastor-1', ['member-a', 'member-b']);
    registerAndInvite(ldce, identity, sessionB, 'pastor-2', ['member-c']);
    ldce.joinSession(sessionA, 'member-a');
    ldce.joinSession(sessionA, 'member-b');
    ldce.joinSession(sessionB, 'member-c');

    const countsA = attendance.getAttendanceCounts(sessionA);
    const countsB = attendance.getAttendanceCounts(sessionB);
    assert.equal(countsA.active, 3); // pastor-1 + member-a + member-b
    assert.equal(countsB.active, 2); // pastor-2 + member-c
    assert.notEqual(countsA.sessionId, countsB.sessionId);
});

/* ------------------------------------------------------------------ */
/* PRIVACY BOUNDARY                                                    */
/* ------------------------------------------------------------------ */

test('viewer-facing result exposes only {available, attending} — no names, roles, userIds, or roster', () => {
    const { ldce, attendance, identity } = freshEngines();
    const sessionId = ldce.createSession('pastor-1', { type: 'meeting' }).sessionId;
    registerAndInvite(ldce, identity, sessionId, 'pastor-1', ['member-a']);
    ldce.joinSession(sessionId, 'member-a');

    const viewer = attendance.getViewerAttendance(sessionId);
    const keys = Object.keys(viewer).sort();
    assert.deepEqual(keys, ['attending', 'available']);
    assert.equal(JSON.stringify(viewer).includes('pastor-1'), false);
    assert.equal(JSON.stringify(viewer).includes('member-a'), false);
});

test('getAttendanceCounts never returns individual participant records, only aggregate numbers', () => {
    const { ldce, attendance, identity } = freshEngines();
    const sessionId = ldce.createSession('pastor-1', { type: 'meeting' }).sessionId;
    registerAndInvite(ldce, identity, sessionId, 'pastor-1', ['member-a']);
    ldce.joinSession(sessionId, 'member-a');

    const counts = attendance.getAttendanceCounts(sessionId);
    const keys = Object.keys(counts).sort();
    assert.deepEqual(keys, ['active', 'available', 'left', 'sessionId', 'totalEverJoined']);
});

/* ------------------------------------------------------------------ */
/* CRITICAL HONESTY RULE — no fabricated example numbers               */
/* ------------------------------------------------------------------ */

test('a session with exactly one real participant (the host) never reports a larger number', () => {
    const { ldce, attendance } = freshEngines();
    const sessionId = ldce.createSession('pastor-1', { type: 'meeting' }).sessionId;
    const viewer = attendance.getViewerAttendance(sessionId);
    assert.equal(viewer.attending, 1);
    assert.notEqual(viewer.attending, 1284); // the spec's own fabrication example — must never appear from real data this small
});
