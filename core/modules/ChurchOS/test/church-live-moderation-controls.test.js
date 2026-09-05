'use strict';

/**
 * Regression test suite for
 * core/modules/ChurchOS/church-live-moderation-controls.js (RP-035
 * Phase C, Checkpoint 2).
 *
 * HARNESS DISCLOSURE:
 *   REAL, unmodified production code under test: the real
 *   ldce-session-engine.js, the real organization-registry.js, the
 *   real organization-role.js, the real church-live-moderation.js
 *   (Checkpoint 1), and the real church-live-moderation-controls.js
 *   this checkpoint adds.
 *   STUBBED: IdentityEngine and CozyConversation, identical stubs to
 *   Checkpoint 1's own disclosed stub (reused verbatim, same method
 *   contract scope).
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
    for (const p of [
        '../../communication/ldce-session-engine.js',
        '../../../organization/organization-registry.js',
        '../../../organization/organization-role.js',
        '../church-live-moderation.js',
        '../church-live-moderation-controls.js'
    ]) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    global.window = { CozyOS: { CozyConversation: makeStubConversation(), IdentityEngine: identity } };
    require('../../communication/ldce-session-engine.js');
    require('../../../organization/organization-registry.js');
    require('../../../organization/organization-role.js');
    require('../church-live-moderation.js');
    require('../church-live-moderation-controls.js');
    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        mod1: global.window.CozyOS.ChurchLiveModeration,
        ctl: global.window.CozyOS.ChurchLiveModerationControls,
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
/* AVAILABILITY / REGISTRATION                                         */
/* ------------------------------------------------------------------ */

test('reports UNAVAILABLE when LDCESessionEngine is not loaded', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve('../church-live-moderation-controls.js')];
    require('../church-live-moderation-controls.js');
    const ctl = global.window.CozyOS.ChurchLiveModerationControls;
    const result = ctl.muteParticipant('nonexistent-session', 'host-1', 'user-1');
    assert.equal(result.status, 'UNAVAILABLE');
});

test('module registers version and Modules registry entry', () => {
    const { ctl } = freshEngines();
    assert.equal(ctl.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['church-live-moderation-controls'].version, '1.0.0');
});

/* ------------------------------------------------------------------ */
/* MUTE — composes real forceMuteParticipant()                        */
/* ------------------------------------------------------------------ */

test('an authorized host can mute a participant and it is reflected in LDCE real state', async () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', 'Background noise');
    assert.equal(result.status, 'OK');
    const participant = ldce.getParticipant(sessionId, 'host-1', 'viewer-a');
    assert.equal(participant.muted, true, 'LDCE real roster flag must actually flip, not just a UI claim');
});

test('an ordinary participant (not moderator/host) cannot mute anyone', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const result = ctl.muteParticipant(sessionId, 'viewer-a', 'viewer-b', 'no reason');
    assert.equal(result.status, 'NOT_AUTHORIZED');
    const participant = ldce.getParticipant(sessionId, 'host-1', 'viewer-b');
    assert.equal(participant.muted, false);
});

test('a promoted LDCE moderator (not the host) can mute a participant', async () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['mod-a', 'viewer-b']);
    const promote = await ldce.setParticipantRole(sessionId, 'host-1', 'mod-a', 'moderator');
    assert.equal(promote.success, true);
    const result = ctl.muteParticipant(sessionId, 'mod-a', 'viewer-b', 'disruptive');
    assert.equal(result.status, 'OK');
});

test('muting a nonexistent participant is rejected, not fabricated as success', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = ctl.muteParticipant(sessionId, 'host-1', 'ghost-user', null);
    assert.equal(result.status, 'REJECTED');
});

/* ------------------------------------------------------------------ */
/* MODERATOR-UNMUTE — new authorization path, real recorded state     */
/* ------------------------------------------------------------------ */

test('an authorized moderator can lift a restriction they recorded via muteParticipant', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', 'Please mute yourself');
    const result = ctl.moderatorUnmute(sessionId, 'host-1', 'viewer-a', 'Resolved');
    assert.equal(result.status, 'OK');
});

test('moderator-unmute does not modify forceMuteParticipant real behavior: LDCE.muted stays true', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', null);
    ctl.moderatorUnmute(sessionId, 'host-1', 'viewer-a', null);
    const participant = ldce.getParticipant(sessionId, 'host-1', 'viewer-a');
    assert.equal(participant.muted, true, 'the original one-way forceMuteParticipant contract must remain unchanged');
});

test('getMuteStatus reports moderationRestriction and ldceMuted as two distinct real facts', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', null);
    ctl.moderatorUnmute(sessionId, 'host-1', 'viewer-a', null);
    const status = ctl.getMuteStatus(sessionId, 'host-1', 'viewer-a');
    assert.equal(status.available, true);
    assert.equal(status.moderationRestriction, 'ACTIVE');
    assert.equal(status.ldceMuted, true);
});

test('moderator-unmute on a participant with no recorded restriction is refused, not a silent no-op', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = ctl.moderatorUnmute(sessionId, 'host-1', 'viewer-a', null);
    assert.equal(result.status, 'NOT_FOUND');
});

test('an unauthorized caller cannot moderator-unmute', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', null);
    const result = ctl.moderatorUnmute(sessionId, 'viewer-b', 'viewer-a', null);
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

/* ------------------------------------------------------------------ */
/* KICK — authorized entirely by real leaveSession()                  */
/* ------------------------------------------------------------------ */

test('an authorized host can kick a participant using the real actor-checked leaveSession', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = ctl.kickParticipant(sessionId, 'host-1', 'viewer-a', 'Repeated violations');
    assert.equal(result.status, 'OK');
    const list = ldce.listParticipants(sessionId, 'host-1');
    const record = list.find((p) => p.userId === 'viewer-a');
    assert.equal(record.status, 'left');
});

test('an ordinary participant cannot kick another participant (real LDCE rank check denies it)', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const result = ctl.kickParticipant(sessionId, 'viewer-a', 'viewer-b', 'no reason');
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

test('a kick denial is recorded in moderation history with the real reason', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    ctl.kickParticipant(sessionId, 'viewer-a', 'viewer-b', 'no reason');
    const history = ctl.getModerationHistory(sessionId, 'host-1');
    assert.equal(history.available, true);
    const denial = history.events.find((e) => e.action === 'KICK_DENIED');
    assert.ok(denial);
});

test('self-leave (actorId === userId) is unaffected by this file — byte-identical LDCE behavior', () => {
    const { ldce, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = ldce.leaveSession(sessionId, 'viewer-a');
    assert.equal(result.success, true);
});

/* ------------------------------------------------------------------ */
/* SLOW MODE                                                           */
/* ------------------------------------------------------------------ */

test('an authorized moderator can set slow mode and it rate-limits rapid comments', () => {
    const { ldce, mod1, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const setResult = ctl.setSlowMode(sessionId, 'host-1', 60000);
    assert.equal(setResult.status, 'OK');

    const first = ctl.submitComment(sessionId, 'viewer-a', 'first comment');
    assert.equal(first.status, 'OK');
    const second = ctl.submitComment(sessionId, 'viewer-a', 'second comment, too fast');
    assert.equal(second.status, 'RATE_LIMITED');
    assert.ok(second.retryAfterMs > 0);

    const visible = mod1.listComments(sessionId, 'viewer-a');
    assert.equal(visible.comments.length, 1, 'the rate-limited comment must never have been stored');
});

test('slow mode is session-scoped: a different session is unaffected', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionA = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const sessionB = makeSessionWithMembers(ldce, identity, 'host-2', ['viewer-c']);
    ctl.setSlowMode(sessionA, 'host-1', 60000);
    ctl.submitComment(sessionA, 'viewer-a', 'one');
    const blocked = ctl.submitComment(sessionA, 'viewer-a', 'two');
    assert.equal(blocked.status, 'RATE_LIMITED');

    const c1 = ctl.submitComment(sessionB, 'viewer-c', 'one');
    const c2 = ctl.submitComment(sessionB, 'viewer-c', 'two');
    assert.equal(c1.status, 'OK');
    assert.equal(c2.status, 'OK', 'session B never had slow mode set');
});

test('an unauthorized user cannot set slow mode', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = ctl.setSlowMode(sessionId, 'viewer-a', 30000);
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

/* ------------------------------------------------------------------ */
/* MUTED PARTICIPANTS CANNOT COMMENT                                   */
/* ------------------------------------------------------------------ */

test('a muted participant cannot submit a comment', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', null);
    const result = ctl.submitComment(sessionId, 'viewer-a', 'hello');
    assert.equal(result.status, 'REJECTED');
});

test('after moderator-unmute, the participant can comment again', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', null);
    ctl.moderatorUnmute(sessionId, 'host-1', 'viewer-a', null);
    const result = ctl.submitComment(sessionId, 'viewer-a', 'hello again');
    assert.equal(result.status, 'OK');
});

/* ------------------------------------------------------------------ */
/* MODERATOR / OFFICIAL MESSAGES                                       */
/* ------------------------------------------------------------------ */

test('a moderator message is distinguishable from an ordinary comment in the viewer feed', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.submitComment(sessionId, 'viewer-a', 'Hi everyone');
    const msgResult = ctl.postModeratorMessage(sessionId, 'host-1', 'Service starts in 5 minutes.');
    assert.equal(msgResult.status, 'OK');
    assert.equal(msgResult.message.authorUserId, 'host-1', 'author identity is preserved, never anonymized');

    const feed = ctl.getViewerFeed(sessionId, 'viewer-a');
    assert.equal(feed.status, 'OK');
    assert.equal(feed.items.length, 2);
    const official = feed.items.find((i) => i.official === true);
    const ordinary = feed.items.find((i) => i.official === false);
    assert.equal(official.kind, 'MODERATOR_MESSAGE');
    assert.equal(ordinary.kind, 'COMMENT');
    assert.equal(official.authorUserId, 'host-1');
});

test('a non-moderator cannot post an official moderator message', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = ctl.postModeratorMessage(sessionId, 'viewer-a', 'I am not really a moderator');
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

/* ------------------------------------------------------------------ */
/* TRUSTED MEMBERS — explicitly distinct from moderator status         */
/* ------------------------------------------------------------------ */

test('a trusted participant is not automatically granted moderator authorization', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const assign = ctl.assignTrusted(sessionId, 'host-1', 'viewer-a', 'Reliable long-time member');
    assert.equal(assign.status, 'OK');
    assert.equal(ctl.isTrusted(sessionId, 'viewer-a'), true);

    // Trusted status alone must not let viewer-a kick or mute someone else.
    const kickAttempt = ctl.kickParticipant(sessionId, 'viewer-a', 'viewer-b', 'no reason');
    assert.equal(kickAttempt.status, 'NOT_AUTHORIZED');
    const muteAttempt = ctl.muteParticipant(sessionId, 'viewer-a', 'viewer-b', 'no reason');
    assert.equal(muteAttempt.status, 'NOT_AUTHORIZED');
});

test('trusted status can be assigned and revoked only by an authorized moderator', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const deniedAssign = ctl.assignTrusted(sessionId, 'viewer-b', 'viewer-a', null);
    assert.equal(deniedAssign.status, 'NOT_AUTHORIZED');

    ctl.assignTrusted(sessionId, 'host-1', 'viewer-a', null);
    assert.equal(ctl.isTrusted(sessionId, 'viewer-a'), true);
    const revoke = ctl.revokeTrusted(sessionId, 'host-1', 'viewer-a', 'Standing review');
    assert.equal(revoke.status, 'OK');
    assert.equal(ctl.isTrusted(sessionId, 'viewer-a'), false);
});

/* ------------------------------------------------------------------ */
/* PRIVACY — viewer feed never leaks moderation-only data              */
/* ------------------------------------------------------------------ */

test('the viewer feed never includes restriction reasons, mute state, or history', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', 'Confidential internal reason');
    const feed = ctl.getViewerFeed(sessionId, 'viewer-a');
    const serialized = JSON.stringify(feed);
    assert.ok(!serialized.includes('Confidential internal reason'));
    assert.ok(!serialized.includes('moderationRestriction'));
});

test('getModerationHistory is fail-closed to non-moderators', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', 'reason');
    const result = ctl.getModerationHistory(sessionId, 'viewer-a');
    assert.equal(result.available, false);
});

test('getMuteStatus is fail-closed to non-moderators', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = ctl.getMuteStatus(sessionId, 'viewer-a', 'viewer-a');
    assert.equal(result.available, false);
});

/* ------------------------------------------------------------------ */
/* HONESTY — propagationState always QUEUED, never fabricated SENT     */
/* ------------------------------------------------------------------ */

test('every moderation-controls event always reports propagationState QUEUED', () => {
    const { ldce, ctl, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    ctl.muteParticipant(sessionId, 'host-1', 'viewer-a', null);
    ctl.moderatorUnmute(sessionId, 'host-1', 'viewer-a', null);
    ctl.setSlowMode(sessionId, 'host-1', 1000);
    ctl.postModeratorMessage(sessionId, 'host-1', 'Announcement');
    ctl.assignTrusted(sessionId, 'host-1', 'viewer-a', null);

    const history = ctl.getModerationHistory(sessionId, 'host-1');
    assert.ok(history.events.length >= 5);
    for (const event of history.events) {
        assert.equal(event.propagationState, 'QUEUED');
    }
});

test('an org-role holder (not host, not LDCE-promoted) can use PHC2-native capabilities like slow mode', () => {
    const { ldce, ctl, identity, orgRegistry, orgRole } = freshEngines();
    // makeSessionWithMembers() re-registers each user with an empty
    // identity record as part of session setup, so orgId must be set
    // AFTER it runs, not before (it would otherwise be overwritten).
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['org-mod', 'viewer-b']);
    const org = orgRegistry.createOrganization({ name: 'Test Church' });
    identity.registerUser('host-1', { orgId: org.orgId });
    identity.registerUser('org-mod', { orgId: org.orgId });

    const role = orgRole.createRole({
        orgId: org.orgId,
        name: 'Moderator',
        permissions: ['moderation:comment-manage'],
        assignedUserId: 'org-mod'
    });
    assert.equal(role.assignedUserId, 'org-mod');

    const slowModeResult = ctl.setSlowMode(sessionId, 'org-mod', 30000);
    assert.equal(slowModeResult.status, 'OK', 'org-role authorization must gate PHC2-native capabilities');
});

test('an org-role holder (not an LDCE-native moderator) CANNOT mute or kick — those two gates are entirely LDCE-native and do not recognize org-role', () => {
    const { ldce, ctl, identity, orgRegistry, orgRole } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['org-mod', 'viewer-b']);
    const org = orgRegistry.createOrganization({ name: 'Test Church' });
    identity.registerUser('host-1', { orgId: org.orgId });
    identity.registerUser('org-mod', { orgId: org.orgId });
    orgRole.createRole({
        orgId: org.orgId,
        name: 'Moderator',
        permissions: ['moderation:comment-manage'],
        assignedUserId: 'org-mod'
    });

    const muteResult = ctl.muteParticipant(sessionId, 'org-mod', 'viewer-b', null);
    assert.equal(muteResult.status, 'NOT_AUTHORIZED', 'forceMuteParticipant only recognizes host/LDCE-promoted-moderator rank, not org-role');

    const kickResult = ctl.kickParticipant(sessionId, 'org-mod', 'viewer-b', null);
    assert.equal(kickResult.status, 'NOT_AUTHORIZED', 'leaveSession only recognizes host/LDCE-promoted-moderator rank, not org-role');
});

test('org-role authorization for PHC2-native capabilities is refused once the requester does not share the host org', () => {
    const { ldce, ctl, identity, orgRegistry, orgRole } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['outsider-mod', 'viewer-b']);
    const org = orgRegistry.createOrganization({ name: 'Test Church' });
    const otherOrg = orgRegistry.createOrganization({ name: 'Different Org' });
    identity.registerUser('host-1', { orgId: org.orgId });
    identity.registerUser('outsider-mod', { orgId: otherOrg.orgId });
    orgRole.createRole({
        orgId: otherOrg.orgId,
        name: 'Moderator',
        permissions: ['moderation:comment-manage'],
        assignedUserId: 'outsider-mod'
    });
    const result = ctl.setSlowMode(sessionId, 'outsider-mod', 30000);
    assert.equal(result.status, 'NOT_AUTHORIZED');
});
