'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionAuthority } = require('../session-authority');
const sessionToken = require('../session-token');

const SECRET = 'authority-test-secret';

/**
 * Resolver double matching the DOCUMENTED LDCESessionEngine.getParticipant()
 * contract (see session-authority.js file header): { userId, role,
 * language, muted, cameraOn, joinedAt }, role in host|moderator|participant.
 */
function makeRoster(entries) {
    // entries: { [sessionId]: { [userId]: role } }
    return (sessionId, requesterId) => {
        const role = entries[sessionId]?.[requesterId];
        if (!role) return null;
        return { userId: requesterId, role, language: 'en', muted: false, cameraOn: true, joinedAt: Date.now() };
    };
}

test('issueToken mints a token whose role reflects the REAL resolved role, not a client claim', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });

    const hostResult = authority.issueToken('s1', 'pastor');
    assert.equal(hostResult.success, true);
    assert.equal(hostResult.role, 'host');
    const decoded = sessionToken.verify(hostResult.token, SECRET);
    assert.equal(decoded.payload.role, 'host');

    const viewerResult = authority.issueToken('s1', 'bob');
    assert.equal(viewerResult.role, 'viewer'); // LDCE "participant" maps to token "viewer"
});

test('issueToken rejects a requester who is not on the real roster', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    const result = authority.issueToken('s1', 'stranger');
    assert.equal(result.success, false);
    assert.match(result.reason, /not a recognized participant/);
});

test('grantSpeaking requires host/moderator; a viewer cannot grant speaking to themselves or anyone else', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant', amy: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });

    const viewerAttempt = authority.grantSpeaking('s1', 'bob', 'bob'); // self-grant attempt
    assert.equal(viewerAttempt.success, false);
    assert.match(viewerAttempt.reason, /host or a moderator/);

    const viewerGrantsOther = authority.grantSpeaking('s1', 'bob', 'amy');
    assert.equal(viewerGrantsOther.success, false);

    const hostGrant = authority.grantSpeaking('s1', 'pastor', 'bob');
    assert.equal(hostGrant.success, true);
    assert.equal(authority.isSpeaker('s1', 'bob'), true);

    // Once granted, the NEXT issued token for bob reflects "speaker".
    const token = authority.issueToken('s1', 'bob');
    assert.equal(token.role, 'speaker');
});

test('revokeSpeaking removes speaker status; only host/moderator may revoke', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    authority.grantSpeaking('s1', 'pastor', 'bob');
    assert.equal(authority.isSpeaker('s1', 'bob'), true);

    const deniedRevoke = authority.revokeSpeaking('s1', 'bob', 'bob');
    assert.equal(deniedRevoke.success, false);
    assert.equal(authority.isSpeaker('s1', 'bob'), true); // unchanged

    const ok = authority.revokeSpeaking('s1', 'pastor', 'bob');
    assert.equal(ok.success, true);
    assert.equal(authority.isSpeaker('s1', 'bob'), false);
});

test('removeParticipant: viewer cannot remove anyone; host can; host cannot be removed; removed participant cannot get a new token', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant', amy: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });

    const deniedByViewer = authority.removeParticipant('s1', 'bob', 'amy');
    assert.equal(deniedByViewer.success, false);

    const cannotRemoveHost = authority.removeParticipant('s1', 'bob', 'pastor');
    assert.equal(cannotRemoveHost.success, false);

    const removed = authority.removeParticipant('s1', 'pastor', 'bob');
    assert.equal(removed.success, true);
    assert.equal(authority.isRemoved('s1', 'bob'), true);

    const reissue = authority.issueToken('s1', 'bob');
    assert.equal(reissue.success, false);
    assert.match(reissue.reason, /removed/);
});

test('readmit reverses a removal; explicit and separately authorized', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    authority.removeParticipant('s1', 'pastor', 'bob');
    assert.equal(authority.isRemoved('s1', 'bob'), true);

    const deniedReadmit = authority.readmit('s1', 'bob', 'bob'); // self-readmit
    assert.equal(deniedReadmit.success, false);
    assert.equal(authority.isRemoved('s1', 'bob'), true);

    const ok = authority.readmit('s1', 'pastor', 'bob');
    assert.equal(ok.success, true);
    assert.equal(authority.isRemoved('s1', 'bob'), false);
    assert.equal(authority.issueToken('s1', 'bob').success, true);
});

// ---- Phase 3E: speak-request state machine ----

test('requestSpeaking: a recognized participant can request; state becomes SPEAK_REQUESTED', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });

    assert.equal(authority.getSpeakState('s1', 'bob'), 'JOINED');
    const req = authority.requestSpeaking('s1', 'bob');
    assert.equal(req.success, true);
    assert.equal(authority.getSpeakState('s1', 'bob'), 'SPEAK_REQUESTED');
    assert.equal(authority.isSpeaker('s1', 'bob'), false); // requesting is not granting
});

test('requestSpeaking rejects an unrecognized user and a removed participant', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });

    const stranger = authority.requestSpeaking('s1', 'stranger');
    assert.equal(stranger.success, false);
    assert.match(stranger.reason, /not a recognized participant/);

    authority.removeParticipant('s1', 'pastor', 'bob');
    const removed = authority.requestSpeaking('s1', 'bob');
    assert.equal(removed.success, false);
    assert.match(removed.reason, /removed/);
});

test('requestSpeaking cannot be used to request on behalf of another user (no targetUserId param exists)', () => {
    // Structural guarantee: the method signature itself takes no target.
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant', amy: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    assert.equal(authority.requestSpeaking.length, 2); // (sessionId, userId) only
    authority.requestSpeaking('s1', 'bob');
    assert.equal(authority.getSpeakState('s1', 'amy'), 'JOINED'); // amy untouched by bob's request
});

test('listSpeakRequests: host/moderator sees the real pending queue; a viewer cannot list it', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant', amy: 'participant', cam: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    authority.requestSpeaking('s1', 'bob');
    authority.requestSpeaking('s1', 'amy');

    const viewerAttempt = authority.listSpeakRequests('s1', 'bob');
    assert.equal(viewerAttempt.success, false);
    assert.match(viewerAttempt.reason, /host or a moderator/);

    const hostList = authority.listSpeakRequests('s1', 'pastor');
    assert.equal(hostList.success, true);
    assert.deepEqual(hostList.requesters.sort(), ['amy', 'bob']);
    assert.ok(!hostList.requesters.includes('cam')); // cam never requested
});

test('granting speaking to a requester clears the pending request and moves state to SPEAKING_ALLOWED', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    authority.requestSpeaking('s1', 'bob');
    assert.equal(authority.getSpeakState('s1', 'bob'), 'SPEAK_REQUESTED');

    authority.grantSpeaking('s1', 'pastor', 'bob');
    assert.equal(authority.getSpeakState('s1', 'bob'), 'SPEAKING_ALLOWED');

    const stillPending = authority.listSpeakRequests('s1', 'pastor');
    assert.ok(!stillPending.requesters.includes('bob'));
});

test('revoking a granted speaker moves state to MUTED, not back to JOINED or SPEAK_REQUESTED', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    authority.grantSpeaking('s1', 'pastor', 'bob');
    assert.equal(authority.getSpeakState('s1', 'bob'), 'SPEAKING_ALLOWED');

    authority.revokeSpeaking('s1', 'pastor', 'bob');
    assert.equal(authority.getSpeakState('s1', 'bob'), 'MUTED');
    assert.equal(authority.isSpeaker('s1', 'bob'), false);
});

test('getSpeakState reports REMOVED for a removed participant regardless of prior speak state', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    authority.grantSpeaking('s1', 'pastor', 'bob');
    authority.removeParticipant('s1', 'pastor', 'bob');
    assert.equal(authority.getSpeakState('s1', 'bob'), 'REMOVED');
});

test('getSpeakState returns null for a user with no roster record at all', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    assert.equal(authority.getSpeakState('s1', 'ghost'), null);
});

test('speak-request state is scoped per session, like removal', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' }, s2: { pastor2: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    authority.requestSpeaking('s1', 'bob');
    assert.equal(authority.getSpeakState('s1', 'bob'), 'SPEAK_REQUESTED');
    assert.equal(authority.getSpeakState('s2', 'bob'), 'JOINED');
});

test('a viewer who already holds speaking permission cannot re-request (already granted, not pending)', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    authority.grantSpeaking('s1', 'pastor', 'bob');
    const reReq = authority.requestSpeaking('s1', 'bob');
    assert.equal(reReq.success, false);
    assert.match(reReq.reason, /Already granted/);
});

test('removal is scoped per session — removal in one session does not block another', () => {
    const roleResolver = makeRoster({ s1: { pastor: 'host', bob: 'participant' }, s2: { pastor2: 'host', bob: 'participant' } });
    const authority = new SessionAuthority({ secret: SECRET, roleResolver });
    authority.removeParticipant('s1', 'pastor', 'bob');
    assert.equal(authority.isRemoved('s1', 'bob'), true);
    assert.equal(authority.isRemoved('s2', 'bob'), false);
    assert.equal(authority.issueToken('s2', 'bob').success, true);
});
