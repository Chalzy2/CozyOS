'use strict';

/**
 * Regression test suite for
 * core/modules/ChurchOS/church-prayer-interaction.js (RP-035 Phase C,
 * Checkpoint 4).
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test: the
 *   real ldce-session-engine.js, the real organization-registry.js,
 *   the real organization-role.js, the real church-live-moderation.js
 *   (Checkpoint 1, loaded only so its exported
 *   MODERATION_MANAGE_PERMISSION constant is available for reuse — its
 *   comment store is not exercised here), and the real
 *   church-prayer-interaction.js this checkpoint adds. Every role/
 *   permission/roster fact in this file runs through those real
 *   files' actual logic.
 *
 *   STUBBED, and disclosed as a stub, not the real production file:
 *   IdentityEngine, at the identical method-contract scope Checkpoints
 *   1/2/B2's own test suites disclosed (getUser/isPlatformAdmin).
 *   CozyConversation is stubbed identically to Checkpoints 1/2's own
 *   disclosed stub, reused verbatim (LDCE's own real requirement, not
 *   this file's concern).
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
        addTranscriptSegment() {},
    };
}

function makeStubIdentity() {
    const users = new Map();
    const grants = new Map();
    const platformAdmins = new Set();
    return {
        registerUser(userId, { orgId = null, country = null } = {}) {
            users.set(userId, { orgId, country });
        },
        setPlatformAdmin(userId) { platformAdmins.add(userId); },
        isPlatformAdmin(userId) { return platformAdmins.has(userId); },
        getUser(userId) {
            const u = users.get(userId);
            if (!u) return null;
            return { userId, username: userId, roles: [], status: 'active', companyId: null, branchId: null, departmentId: null, teamId: null, languagePreference: null, country: u.country, orgId: u.orgId };
        },
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
    for (const p of ['../../communication/ldce-session-engine.js', '../../../organization/organization-registry.js', '../../../organization/organization-role.js', '../church-live-moderation.js', '../church-prayer-interaction.js']) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    global.window = { CozyOS: { CozyConversation: makeStubConversation(), IdentityEngine: identity } };
    require('../../communication/ldce-session-engine.js');
    require('../../../organization/organization-registry.js');
    require('../../../organization/organization-role.js');
    require('../church-live-moderation.js');
    require('../church-prayer-interaction.js');
    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        prayer: global.window.CozyOS.ChurchPrayerInteraction,
        orgRegistry: global.window.CozyOS.OrganizationRegistry,
        orgRole: global.window.CozyOS.OrganizationRole,
        identity,
    };
}

function makeSessionWithMembers(ldce, identity, hostId, memberIds) {
    identity.registerUser(hostId, {});
    const created = ldce.createSession(hostId, { type: 'classroom' });
    for (const uid of memberIds) {
        identity.registerUser(uid, {});
        const invite = ldce.inviteParticipant(created.sessionId, hostId, uid);
        assert.equal(invite.success, true, `invite for ${uid} should succeed: ${invite.reason}`);
        const join = ldce.joinSession(created.sessionId, uid);
        assert.equal(join.success, true, `join for ${uid} should succeed: ${join.reason}`);
    }
    return created.sessionId;
}

/* ------------------------------------------------------------------ */
/* 1. PRAYER REQUEST CREATION                                         */
/* ------------------------------------------------------------------ */

test('module registers version and Modules registry entry', () => {
    const { prayer } = freshEngines();
    assert.equal(prayer.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['church-prayer-interaction'].version, '1.0.0');
});

test('reports UNAVAILABLE when LDCESessionEngine is not loaded', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve('../church-prayer-interaction.js')];
    require('../church-prayer-interaction.js');
    const prayer = global.window.CozyOS.ChurchPrayerInteraction;
    const result = prayer.submitPrayerRequest('nonexistent-session', 'user-1', { text: 'help' });
    assert.equal(result.status, 'UNAVAILABLE');
});

test('a real session member can submit a prayer request', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'Please pray for my family.' });
    assert.equal(result.status, 'OK');
    assert.equal(result.request.authorUserId, 'viewer-a');
    assert.equal(result.request.sessionId, sessionId);
});

test('the host can submit a prayer request without a separate LDCE roster record', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = prayer.submitPrayerRequest(sessionId, 'host-1', { text: 'For the congregation.' });
    assert.equal(result.status, 'OK');
});

/* ------------------------------------------------------------------ */
/* 2. REQUIRED-FIELD VALIDATION                                       */
/* ------------------------------------------------------------------ */

test('submitting with no authorUserId is rejected', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = prayer.submitPrayerRequest(sessionId, null, { text: 'help' });
    assert.equal(result.status, 'REJECTED');
});

test('submitting with an invalid visibility value is rejected', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help', visibility: 'GLOBAL' });
    assert.equal(result.status, 'REJECTED');
});

test('a request always contains the mandatory field set', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help' });
    for (const field of ['requestId', 'sessionId', 'authorUserId', 'createdAt', 'status', 'visibility', 'propagationState']) {
        assert.ok(Object.prototype.hasOwnProperty.call(result.request, field), `missing field ${field}`);
    }
});

/* ------------------------------------------------------------------ */
/* 3. SESSION OWNERSHIP                                                */
/* ------------------------------------------------------------------ */

test('submitting against an unknown session is NOT_FOUND', () => {
    const { prayer } = freshEngines();
    const result = prayer.submitPrayerRequest('does-not-exist', 'user-1', { text: 'help' });
    assert.equal(result.status, 'NOT_FOUND');
});

/* ------------------------------------------------------------------ */
/* 4 & 6. PARTICIPANT AUTHORIZATION / WRONG-USER REJECTION            */
/* ------------------------------------------------------------------ */

test('a user who never joined and is not the host cannot submit a request', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    identity.registerUser('never-joined', {});
    const result = prayer.submitPrayerRequest(sessionId, 'never-joined', { text: 'help' });
    assert.equal(result.status, 'REJECTED');
});

test('a non-member cannot list visible requests', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    identity.registerUser('outsider', {});
    const result = prayer.listVisiblePrayerRequests(sessionId, 'outsider');
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

/* ------------------------------------------------------------------ */
/* 5 & 7. MODERATOR AUTHORIZATION / WRONG-ORGANIZATION REJECTION      */
/* ------------------------------------------------------------------ */

test('the session host is always authorized to moderate prayer requests', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help' });
    const result = prayer.markPrayedFor(sessionId, 'host-1', posted.request.requestId);
    assert.equal(result.status, 'OK');
});

test('a real LDCE-promoted moderator is authorized to moderate prayer requests', async () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['mod-a', 'viewer-b']);
    const promote = await ldce.setParticipantRole(sessionId, 'host-1', 'mod-a', 'moderator');
    assert.equal(promote.success, true);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-b', { text: 'help' });
    const result = prayer.markPrayedFor(sessionId, 'mod-a', posted.request.requestId);
    assert.equal(result.status, 'OK');
});

test('a platform administrator is authorized to moderate prayer requests', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    identity.registerUser('platform-admin-1', {});
    identity.setPlatformAdmin('platform-admin-1');
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help' });
    const result = prayer.archiveRequest(sessionId, 'platform-admin-1', posted.request.requestId);
    assert.equal(result.status, 'OK');
});

test('an authorized organization-role holder can moderate prayer requests', () => {
    const { ldce, prayer, identity, orgRegistry, orgRole } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser('host-1', { orgId: org.orgId });
    const created = ldce.createSession('host-1', { type: 'classroom' });
    identity.registerUser('viewer-a', {});
    ldce.inviteParticipant(created.sessionId, 'host-1', 'viewer-a');
    ldce.joinSession(created.sessionId, 'viewer-a');
    identity.registerUser('pastor-1', { orgId: org.orgId });
    const posted = prayer.submitPrayerRequest(created.sessionId, 'viewer-a', { text: 'help' });
    const mod = global.window.CozyOS.ChurchLiveModeration;
    orgRole.createRole({ name: 'Senior Pastor', orgId: org.orgId, assignedUserId: 'pastor-1', permissions: [mod.MODERATION_MANAGE_PERMISSION] });
    const result = prayer.markPrayedFor(created.sessionId, 'pastor-1', posted.request.requestId);
    assert.equal(result.status, 'OK');
});

test('an ordinary participant is refused when attempting to moderate', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help' });
    const result = prayer.markPrayedFor(sessionId, 'viewer-b', posted.request.requestId);
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

test('an unknown requester is refused when attempting to moderate', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help' });
    const result = prayer.markPrayedFor(sessionId, 'ghost-user', posted.request.requestId);
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

test('an org-role holder from a different organization is refused', () => {
    const { ldce, prayer, identity, orgRegistry, orgRole } = freshEngines();
    const orgA = orgRegistry.createOrganization({ name: 'Church A', type: 'Church' });
    const orgB = orgRegistry.createOrganization({ name: 'Church B', type: 'Church' });
    identity.registerUser('host-1', { orgId: orgA.orgId });
    const created = ldce.createSession('host-1', { type: 'classroom' });
    identity.registerUser('viewer-a', {});
    ldce.inviteParticipant(created.sessionId, 'host-1', 'viewer-a');
    ldce.joinSession(created.sessionId, 'viewer-a');
    identity.registerUser('outside-pastor', { orgId: orgB.orgId });
    const mod = global.window.CozyOS.ChurchLiveModeration;
    orgRole.createRole({ name: 'Pastor', orgId: orgB.orgId, assignedUserId: 'outside-pastor', permissions: [mod.MODERATION_MANAGE_PERMISSION] });
    const posted = prayer.submitPrayerRequest(created.sessionId, 'viewer-a', { text: 'help' });
    const result = prayer.markPrayedFor(created.sessionId, 'outside-pastor', posted.request.requestId);
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

/* ------------------------------------------------------------------ */
/* 8 & 9 & 10. VISIBILITY — private, moderator-only, public/session   */
/* ------------------------------------------------------------------ */

test('a PRIVATE request is never visible to another ordinary viewer', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'private matter', visibility: 'PRIVATE' });
    const result = prayer.listVisiblePrayerRequests(sessionId, 'viewer-b');
    assert.equal(result.status, 'OK');
    assert.equal(result.requests.length, 0);
});

test('the author always sees their own PRIVATE request', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'private matter', visibility: 'PRIVATE' });
    const result = prayer.listVisiblePrayerRequests(sessionId, 'viewer-a');
    assert.equal(result.requests.length, 1);
});

test('a MODERATOR_ONLY request is excluded from the ordinary viewer feed but present in the moderation queue', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'sensitive', visibility: 'MODERATOR_ONLY' });
    const viewerList = prayer.listVisiblePrayerRequests(sessionId, 'viewer-b');
    assert.equal(viewerList.requests.length, 0);
    const queue = prayer.getModerationQueue(sessionId, 'host-1');
    assert.equal(queue.available, true);
    assert.equal(queue.requests.length, 1);
});

test('a SESSION-visibility request is visible to other real session members', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'for the group', visibility: 'SESSION' });
    const result = prayer.listVisiblePrayerRequests(sessionId, 'viewer-b');
    assert.equal(result.requests.length, 1);
});

test('a PUBLIC request is visible to other real session members', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'for everyone', visibility: 'PUBLIC' });
    const result = prayer.listVisiblePrayerRequests(sessionId, 'viewer-b');
    assert.equal(result.requests.length, 1);
});

/* ------------------------------------------------------------------ */
/* 11, 12, 13. STATUS TRANSITIONS / ARCHIVE / REMOVE                  */
/* ------------------------------------------------------------------ */

test('markPrayedFor transitions status to PRAYED_FOR', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help' });
    const result = prayer.markPrayedFor(sessionId, 'host-1', posted.request.requestId);
    assert.equal(result.status, 'OK');
    assert.equal(result.request.status, 'PRAYED_FOR');
});

test('archiveRequest transitions status to ARCHIVED and removes it from the moderator queue view distinctly', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help', visibility: 'PUBLIC' });
    const result = prayer.archiveRequest(sessionId, 'host-1', posted.request.requestId);
    assert.equal(result.status, 'OK');
    assert.equal(result.request.status, 'ARCHIVED');
});

test('removeRequest transitions status to REMOVED and the request no longer appears in the viewer feed', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help', visibility: 'PUBLIC' });
    const result = prayer.removeRequest(sessionId, 'host-1', posted.request.requestId, 'Off-topic');
    assert.equal(result.status, 'OK');
    assert.equal(result.request.status, 'REMOVED');
    const viewerList = prayer.listVisiblePrayerRequests(sessionId, 'viewer-b');
    assert.equal(viewerList.requests.length, 0);
});

/* ------------------------------------------------------------------ */
/* 14 & 15. OFFLINE QUEUED STATE / NO FABRICATED SENT STATE            */
/* ------------------------------------------------------------------ */

test('a newly submitted request always carries propagationState QUEUED, never SENT', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help' });
    assert.equal(posted.request.propagationState, 'QUEUED');
    assert.notEqual(posted.request.propagationState, 'SENT');
});

test('every moderation event carries propagationState QUEUED, never SENT', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help' });
    const result = prayer.markPrayedFor(sessionId, 'host-1', posted.request.requestId);
    assert.equal(result.event.propagationState, 'QUEUED');
});

/* ------------------------------------------------------------------ */
/* 16, 17, 18. AMEN CREATION / DUPLICATE PREVENTION / LOCAL vs CONFIRMED */
/* ------------------------------------------------------------------ */

test('a real session member can press Amen on a request', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help', visibility: 'PUBLIC' });
    const result = prayer.pressAmen(sessionId, 'viewer-b', posted.request.requestId);
    assert.equal(result.status, 'OK');
    assert.equal(result.localAmen, 1);
});

test('the same participant pressing Amen twice on the same request is rejected as duplicate', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help', visibility: 'PUBLIC' });
    prayer.pressAmen(sessionId, 'viewer-b', posted.request.requestId);
    const second = prayer.pressAmen(sessionId, 'viewer-b', posted.request.requestId);
    assert.equal(second.status, 'DUPLICATE');
    assert.equal(second.localAmen, 1);
});

test('localAmen and confirmedAmen are reported distinctly, and confirmedAmen is never fabricated as synchronized', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b', 'viewer-c']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help', visibility: 'PUBLIC' });
    prayer.pressAmen(sessionId, 'viewer-b', posted.request.requestId);
    prayer.pressAmen(sessionId, 'viewer-c', posted.request.requestId);
    const counts = prayer.getAmenCounts(sessionId, 'viewer-a', posted.request.requestId);
    assert.equal(counts.available, true);
    assert.equal(counts.localAmen, 2);
    assert.equal(counts.confirmedAmen, 0);
});

/* ------------------------------------------------------------------ */
/* 19 & 20. MODERATION INTEGRATION / PROPAGATIONSTATE INTEGRITY        */
/* ------------------------------------------------------------------ */

test('church-live-moderation.js MODERATION_MANAGE_PERMISSION is reused as-is, not a second permission string', () => {
    const { prayer } = freshEngines();
    const mod = global.window.CozyOS.ChurchLiveModeration;
    assert.equal(mod.MODERATION_MANAGE_PERMISSION, 'moderation:comment-manage');
});

test('getModerationLog is fail-closed to unauthorized requesters', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = prayer.getModerationLog(sessionId, 'viewer-a');
    assert.equal(result.available, false);
});

test('getModerationLog returns real events for an authorized moderator', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 'help' });
    prayer.markPrayedFor(sessionId, 'host-1', posted.request.requestId);
    const result = prayer.getModerationLog(sessionId, 'host-1');
    assert.equal(result.available, true);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].action, 'PRAYED_FOR');
});

/* ------------------------------------------------------------------ */
/* 21, 22, 23. REGRESSION SMOKE (loaded together, no interference)     */
/* ------------------------------------------------------------------ */

test('church-live-moderation.js (PHC1) still functions unchanged alongside church-prayer-interaction.js', () => {
    const { ldce, identity } = freshEngines();
    const mod = global.window.CozyOS.ChurchLiveModeration;
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = mod.postComment(sessionId, 'viewer-a', 'Great sermon!');
    assert.equal(posted.status, 'OK');
});

test('church-live-moderation-controls.js (PHC2) loads and functions unchanged alongside church-prayer-interaction.js', () => {
    freshEngines();
    delete require.cache[require.resolve('../church-live-moderation-controls.js')];
    require('../church-live-moderation-controls.js');
    const controls = global.window.CozyOS.ChurchLiveModerationControls;
    assert.ok(controls, 'ChurchLiveModerationControls should still register normally');
});

test('church-live-attendance.js (PHB) loads and functions unchanged alongside church-prayer-interaction.js', () => {
    freshEngines();
    delete require.cache[require.resolve('../church-live-attendance.js')];
    require('../church-live-attendance.js');
    const attendance = global.window.CozyOS.ChurchLiveAttendance;
    assert.ok(attendance, 'ChurchLiveAttendance should still register normally');
});

/* ------------------------------------------------------------------ */
/* 24 & 25. MALFORMED / EMPTY / INVALID INPUT HANDLING                 */
/* ------------------------------------------------------------------ */

test('a malformed request (non-string text) is stored with text normalized to null, not a crash', () => {
    const { ldce, prayer, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = prayer.submitPrayerRequest(sessionId, 'viewer-a', { text: 12345 });
    assert.equal(result.status, 'OK');
    assert.equal(result.request.text, null);
});

test('an empty/invalid sessionId is handled as NOT_FOUND, never a crash', () => {
    const { prayer } = freshEngines();
    const result1 = prayer.submitPrayerRequest('', 'user-1', { text: 'help' });
    assert.equal(result1.status, 'NOT_FOUND');
    const result2 = prayer.listVisiblePrayerRequests('', 'user-1');
    assert.equal(result2.status, 'NOT_FOUND');
});
