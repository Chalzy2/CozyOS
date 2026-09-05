'use strict';

/**
 * Regression test suite for
 * core/modules/ChurchOS/church-live-moderation.js (RP-035 Phase C,
 * Checkpoint 1).
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test: the
 *   real ldce-session-engine.js, the real organization-registry.js,
 *   the real organization-role.js, and the real
 *   church-live-moderation.js this checkpoint adds. Every role/
 *   permission/roster fact in this file runs through those real
 *   files' actual logic.
 *
 *   STUBBED, and disclosed as a stub, not the real production file:
 *   IdentityEngine, for the identical reason and at the identical
 *   method-contract scope Checkpoint B2's own test suite disclosed
 *   (grantResourcePermission/checkResourcePermission for LDCE;
 *   getUser/isPlatformAdmin for this checkpoint's own file).
 *   CozyConversation is stubbed identically to Checkpoints B1/B2's own
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
    for (const p of ['../../communication/ldce-session-engine.js', '../../../organization/organization-registry.js', '../../../organization/organization-role.js', '../church-live-moderation.js']) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    global.window = { CozyOS: { CozyConversation: makeStubConversation(), IdentityEngine: identity } };
    require('../../communication/ldce-session-engine.js');
    require('../../../organization/organization-registry.js');
    require('../../../organization/organization-role.js');
    require('../church-live-moderation.js');
    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        mod: global.window.CozyOS.ChurchLiveModeration,
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
/* AVAILABILITY / HONESTY GUARANTEES                                   */
/* ------------------------------------------------------------------ */

test('reports UNAVAILABLE when LDCESessionEngine is not loaded', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve('../church-live-moderation.js')];
    require('../church-live-moderation.js');
    const mod = global.window.CozyOS.ChurchLiveModeration;
    const result = mod.postComment('nonexistent-session', 'user-1', 'hello');
    assert.equal(result.status, 'UNAVAILABLE');
});

test('module registers version and Modules registry entry', () => {
    const { mod } = freshEngines();
    assert.equal(mod.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['church-live-moderation'].version, '1.0.0');
    assert.equal(mod.MODERATION_MANAGE_PERMISSION, 'moderation:comment-manage');
});

test('reports NOT_FOUND for an unknown sessionId', () => {
    const { mod } = freshEngines();
    const result = mod.postComment('does-not-exist', 'user-1', 'hello');
    assert.equal(result.status, 'NOT_FOUND');
});

/* ------------------------------------------------------------------ */
/* COMMENT OWNERSHIP / AUTHORSHIP — fail-closed                       */
/* ------------------------------------------------------------------ */

test('comment owner is correctly identified as the real posting user', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const result = mod.postComment(sessionId, 'viewer-a', 'Amen!');
    assert.equal(result.status, 'OK');
    assert.equal(result.comment.authorUserId, 'viewer-a');
});

test('a user who never joined and is not the host cannot post a comment', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    identity.registerUser('never-joined', {});
    const result = mod.postComment(sessionId, 'never-joined', 'hello');
    assert.equal(result.status, 'REJECTED');
});

test('the host can post a comment without a separate LDCE roster record', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = mod.postComment(sessionId, 'host-1', 'Welcome everyone.');
    assert.equal(result.status, 'OK');
});

/* ------------------------------------------------------------------ */
/* VIEWER PRIVACY — normal comments visible, moderation invisible     */
/* ------------------------------------------------------------------ */

test('an ordinary viewer sees normal, visible comments', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    mod.postComment(sessionId, 'viewer-a', 'Great sermon!');
    const result = mod.listComments(sessionId, 'viewer-a');
    assert.equal(result.status, 'OK');
    assert.equal(result.comments.length, 1);
    assert.equal(result.comments[0].text, 'Great sermon!');
});

test('a removed comment no longer appears in the viewer-facing list', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = mod.postComment(sessionId, 'viewer-a', 'inappropriate text');
    const removed = mod.removeComment(sessionId, 'host-1', posted.comment.commentId, 'Off-topic');
    assert.equal(removed.status, 'OK');
    const result = mod.listComments(sessionId, 'viewer-a');
    assert.equal(result.comments.length, 0);
});

test('a hidden comment no longer appears in the viewer-facing list, but is preserved in the moderation view', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = mod.postComment(sessionId, 'viewer-a', 'borderline comment');
    mod.hideComment(sessionId, 'host-1', posted.comment.commentId, 'Needs review');
    const viewerList = mod.listComments(sessionId, 'viewer-a');
    assert.equal(viewerList.comments.length, 0);
    const modView = mod.getModerationView(sessionId, 'host-1');
    assert.equal(modView.available, true);
    assert.equal(modView.comments.length, 1);
    assert.equal(modView.comments[0].moderationState, 'HIDDEN');
});

/* ------------------------------------------------------------------ */
/* AUTHORIZATION — fail-closed, evidence-based                        */
/* ------------------------------------------------------------------ */

test('the session host is always authorized to moderate', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = mod.postComment(sessionId, 'viewer-a', 'text');
    const result = mod.hideComment(sessionId, 'host-1', posted.comment.commentId);
    assert.equal(result.status, 'OK');
});

test('a real LDCE-promoted moderator is authorized to moderate', async () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['mod-a', 'viewer-b']);
    const promote = await ldce.setParticipantRole(sessionId, 'host-1', 'mod-a', 'moderator');
    assert.equal(promote.success, true);
    const posted = mod.postComment(sessionId, 'viewer-b', 'text');
    const result = mod.hideComment(sessionId, 'mod-a', posted.comment.commentId);
    assert.equal(result.status, 'OK');
});

test('an ordinary participant (role "participant") is refused when attempting to moderate', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const posted = mod.postComment(sessionId, 'viewer-a', 'text');
    const result = mod.hideComment(sessionId, 'viewer-b', posted.comment.commentId);
    assert.equal(result.status, 'NOT_AUTHORIZED');
    // The comment must remain untouched and still visible.
    const viewerList = mod.listComments(sessionId, 'viewer-a');
    assert.equal(viewerList.comments.length, 1);
});

test('an unknown/unregistered requester is refused, not silently treated as authorized', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = mod.postComment(sessionId, 'viewer-a', 'text');
    const result = mod.hideComment(sessionId, 'nobody-registered', posted.comment.commentId);
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

test('a real platform-admin is authorized to moderate even with no LDCE role and no org role', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    identity.registerUser('platform-admin-1', {});
    identity.setPlatformAdmin('platform-admin-1');
    const posted = mod.postComment(sessionId, 'viewer-a', 'text');
    const result = mod.removeComment(sessionId, 'platform-admin-1', posted.comment.commentId);
    assert.equal(result.status, 'OK');
});

test('a real org role holding the moderation permission, assigned to the requester, authorizes them', () => {
    const { ldce, mod, identity, orgRegistry, orgRole } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser('host-1', { orgId: org.orgId });
    identity.registerUser('pastor-1', { orgId: org.orgId });
    const role = orgRole.createRole({ name: 'Assistant Pastor', orgId: org.orgId, permissions: [mod.MODERATION_MANAGE_PERMISSION] });
    orgRole.assignUser(role.roleId, 'pastor-1');
    const created = ldce.createSession('host-1', { type: 'classroom' });
    identity.registerUser('viewer-a', { orgId: org.orgId });
    ldce.inviteParticipant(created.sessionId, 'host-1', 'viewer-a');
    ldce.joinSession(created.sessionId, 'viewer-a');
    const posted = mod.postComment(created.sessionId, 'viewer-a', 'text');
    const result = mod.hideComment(created.sessionId, 'pastor-1', posted.comment.commentId);
    assert.equal(result.status, 'OK');
});

test('a requester from a different organization than the host is refused even holding the permission in their own org', () => {
    const { ldce, mod, identity, orgRegistry, orgRole } = freshEngines();
    const orgA = orgRegistry.createOrganization({ name: 'Church A', type: 'Church' });
    const orgB = orgRegistry.createOrganization({ name: 'Church B', type: 'Church' });
    identity.registerUser('host-a', { orgId: orgA.orgId });
    identity.registerUser('pastor-b', { orgId: orgB.orgId });
    const roleB = orgRole.createRole({ name: 'Assistant Pastor', orgId: orgB.orgId, permissions: [mod.MODERATION_MANAGE_PERMISSION] });
    orgRole.assignUser(roleB.roleId, 'pastor-b');
    const created = ldce.createSession('host-a', { type: 'classroom' });
    identity.registerUser('viewer-a', { orgId: orgA.orgId });
    ldce.inviteParticipant(created.sessionId, 'host-a', 'viewer-a');
    ldce.joinSession(created.sessionId, 'viewer-a');
    const posted = mod.postComment(created.sessionId, 'viewer-a', 'text');
    const result = mod.hideComment(created.sessionId, 'pastor-b', posted.comment.commentId);
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

test('getModerationLog and getModerationView are fail-closed to unauthorized requesters', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const logResult = mod.getModerationLog(sessionId, 'viewer-b');
    assert.equal(logResult.available, false);
    const viewResult = mod.getModerationView(sessionId, 'viewer-b');
    assert.equal(viewResult.available, false);
});

/* ------------------------------------------------------------------ */
/* MODERATION EVENT RECORDS — real, and honest about propagation      */
/* ------------------------------------------------------------------ */

test('a moderation action is recorded as a real event with actorId and reason', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a']);
    const posted = mod.postComment(sessionId, 'viewer-a', 'text');
    mod.hideComment(sessionId, 'host-1', posted.comment.commentId, 'Needs review');
    const log = mod.getModerationLog(sessionId, 'host-1');
    assert.equal(log.available, true);
    assert.equal(log.events.length, 1);
    assert.equal(log.events[0].action, 'HIDE');
    assert.equal(log.events[0].actorId, 'host-1');
    assert.equal(log.events[0].reason, 'Needs review');
    assert.equal(log.events[0].commentId, posted.comment.commentId);
});

test('every moderation event reports propagationState QUEUED, never falsely SENT — even for an authorized, "online" host', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['viewer-a', 'viewer-b']);
    const c1 = mod.postComment(sessionId, 'viewer-a', 'first');
    const c2 = mod.postComment(sessionId, 'viewer-b', 'second');
    const r1 = mod.hideComment(sessionId, 'host-1', c1.comment.commentId);
    const r2 = mod.removeComment(sessionId, 'host-1', c2.comment.commentId);
    assert.equal(r1.event.propagationState, 'QUEUED');
    assert.equal(r2.event.propagationState, 'QUEUED');
    const log = mod.getModerationLog(sessionId, 'host-1');
    assert.equal(log.events.every((e) => e.propagationState === 'QUEUED'), true);
    assert.equal(log.events.some((e) => e.propagationState === 'SENT'), false);
});

test('attempting to moderate a nonexistent commentId is rejected with NOT_FOUND, not silently ignored', () => {
    const { ldce, mod, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = mod.hideComment(sessionId, 'host-1', 'cmt_does_not_exist');
    assert.equal(result.status, 'NOT_FOUND');
});
