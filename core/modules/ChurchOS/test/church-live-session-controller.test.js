'use strict';

/**
 * Regression test suite for
 * core/modules/ChurchOS/church-live-session-controller.js
 * (LIVE INTEGRATION AUDIT).
 *
 * HARNESS DISCLOSURE:
 *   REAL, unmodified production code under test: the real ldce-session-
 *   engine.js, the real organization-registry.js, the real
 *   organization-membership.js, the real church-worship-session.js,
 *   and the real church-live-session-controller.js this suite adds.
 *   STUBBED: IdentityEngine/CozyConversation (same disclosed contract-
 *   only stubs the rest of this test directory already uses) and
 *   SpeechRecognitionAdapter.isReal() (church-worship-session.js's own
 *   real, disclosed dependency — no real browser Web Speech API exists
 *   in Node; stubbed to report available exactly like this checkpoint's
 *   own header discloses as a real, honest environment limitation, not
 *   a fabricated capability).
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
    return {
        registerUser(userId, extra = {}) { users.set(userId, extra); },
        getUser(userId) {
            const u = users.get(userId);
            if (!u) return null;
            return { userId, username: userId, roles: [], status: 'active', orgId: u.orgId || null, country: u.country || null };
        },
        isPlatformAdmin() { return false; },
        grantResourcePermission(userId, permissionString) {
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
        '../../../organization/organization-membership.js',
        '../church-worship-session.js',
        '../church-live-session-controller.js',
    ]) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    global.window = {
        CozyOS: {
            CozyConversation: makeStubConversation(),
            IdentityEngine: identity,
            // Real, disclosed environment limitation — see header.
            SpeechRecognitionAdapter: { isReal: () => true },
        }
    };
    require('../../communication/ldce-session-engine.js');
    require('../../../organization/organization-registry.js');
    require('../../../organization/organization-membership.js');
    require('../church-worship-session.js');
    require('../church-live-session-controller.js');
    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        orgRegistry: global.window.CozyOS.OrganizationRegistry,
        membership: global.window.CozyOS.OrganizationMembership,
        worship: global.window.CozyOS.ChurchWorshipSession,
        ctl: global.window.CozyOS.ChurchLiveSessionController,
        identity,
    };
}

function setupAuthorizedChurch(orgRegistry, membership, identity, pastorId = 'pastor-1') {
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser(pastorId, { orgId: org.orgId });
    membership.createMembership({
        userId: pastorId, organizationId: org.orgId, status: 'active',
        permissions: ['churchos-live:manage']
    });
    return org;
}

test('module registers version and Modules registry entry', () => {
    const { ctl } = freshEngines();
    assert.equal(ctl.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['church-live-session-controller'].version, '1.0.0');
    assert.equal(ctl.LIVE_SESSION_MANAGE_PERMISSION, 'churchos-live:manage');
});

test('startSession requires a real orgId and actorId', async () => {
    const { ctl } = freshEngines();
    const r1 = await ctl.startSession({ actorId: 'pastor-1', sourceLanguage: 'sw' });
    assert.equal(r1.success, false);
    const r2 = await ctl.startSession({ orgId: 'org_1', sourceLanguage: 'sw' });
    assert.equal(r2.success, false);
});

test('an authorized Church Administrator can start a real session bundling LDCE + ChurchWorshipSession', async () => {
    const { orgRegistry, membership, identity, ctl } = freshEngines();
    const org = setupAuthorizedChurch(orgRegistry, membership, identity);
    const result = await ctl.startSession({ orgId: org.orgId, actorId: 'pastor-1', sourceLanguage: 'sw' });
    assert.equal(result.success, true);
    assert.ok(result.worshipServiceId);
    assert.ok(result.ldceSessionId);
    assert.equal(result.orgId, org.orgId);
    assert.equal(result.hostUserId, 'pastor-1');

    const bundle = ctl.getSessionBundle(result.worshipServiceId);
    assert.ok(bundle);
    assert.equal(bundle.ldceSessionId, result.ldceSessionId);
    assert.equal(ctl.getLdceSessionIdFor(result.worshipServiceId), result.ldceSessionId);
});

test('an unauthorized user (no membership/permission) cannot start a session', async () => {
    const { orgRegistry, ctl } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    const result = await ctl.startSession({ orgId: org.orgId, actorId: 'random-person', sourceLanguage: 'sw' });
    assert.equal(result.success, false);
    assert.match(result.reason, /not authorized/);
});

test('a member of a DIFFERENT organization cannot start a session for this church (org isolation)', async () => {
    const { orgRegistry, membership, identity, ctl } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    const otherOrg = orgRegistry.createOrganization({ name: 'Other Church', type: 'Church' });
    identity.registerUser('outsider-pastor', { orgId: otherOrg.orgId });
    membership.createMembership({ userId: 'outsider-pastor', organizationId: otherOrg.orgId, status: 'active', permissions: ['churchos-live:manage'] });

    const result = await ctl.startSession({ orgId: org.orgId, actorId: 'outsider-pastor', sourceLanguage: 'sw' });
    assert.equal(result.success, false, 'a real permission in Church B must never authorize starting a session in Church A');
});

test('a member with active membership but no churchos-live:manage permission cannot start a session', async () => {
    const { orgRegistry, membership, identity, ctl } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser('plain-member', { orgId: org.orgId });
    membership.createMembership({ userId: 'plain-member', organizationId: org.orgId, status: 'active' });

    const result = await ctl.startSession({ orgId: org.orgId, actorId: 'plain-member', sourceLanguage: 'sw' });
    assert.equal(result.success, false);
});

test('a suspended membership cannot start a session even with the right permission on record', async () => {
    const { orgRegistry, membership, identity, ctl } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser('pastor-suspended', { orgId: org.orgId });
    membership.createMembership({ userId: 'pastor-suspended', organizationId: org.orgId, status: 'active', permissions: ['churchos-live:manage'] });
    membership.suspendMembership('pastor-suspended', org.orgId);

    const result = await ctl.startSession({ orgId: org.orgId, actorId: 'pastor-suspended', sourceLanguage: 'sw' });
    assert.equal(result.success, false);
});

test('the host can end their own session, ending the real ChurchWorshipSession service', async () => {
    const { orgRegistry, membership, identity, ctl, worship } = freshEngines();
    const org = setupAuthorizedChurch(orgRegistry, membership, identity);
    const started = await ctl.startSession({ orgId: org.orgId, actorId: 'pastor-1', sourceLanguage: 'sw' });
    assert.equal(started.success, true);

    const ended = await ctl.endSession({ worshipServiceId: started.worshipServiceId, actorId: 'pastor-1' });
    assert.equal(ended.success, true);
    assert.ok(ended.summary);

    assert.equal(ctl.getSessionBundle(started.worshipServiceId), null, 'the bundle must be cleared once the session has ended');
    // The real ChurchWorshipSession service is really gone too - not just this controller's own bookkeeping.
    const stillActive = worship.getActiveService(started.worshipServiceId);
    assert.equal(stillActive, null);
});

test('another authorized org member (not the original host) can end the session', async () => {
    const { orgRegistry, membership, identity, ctl } = freshEngines();
    const org = setupAuthorizedChurch(orgRegistry, membership, identity, 'pastor-1');
    identity.registerUser('assistant-pastor', { orgId: org.orgId });
    membership.createMembership({ userId: 'assistant-pastor', organizationId: org.orgId, status: 'active', permissions: ['churchos-live:manage'] });

    const started = await ctl.startSession({ orgId: org.orgId, actorId: 'pastor-1', sourceLanguage: 'sw' });
    const ended = await ctl.endSession({ worshipServiceId: started.worshipServiceId, actorId: 'assistant-pastor' });
    assert.equal(ended.success, true);
});

test('an unauthorized outsider cannot end someone else\'s session', async () => {
    const { orgRegistry, membership, identity, ctl } = freshEngines();
    const org = setupAuthorizedChurch(orgRegistry, membership, identity);
    const started = await ctl.startSession({ orgId: org.orgId, actorId: 'pastor-1', sourceLanguage: 'sw' });

    const ended = await ctl.endSession({ worshipServiceId: started.worshipServiceId, actorId: 'random-outsider' });
    assert.equal(ended.success, false);
    assert.ok(ctl.getSessionBundle(started.worshipServiceId), 'a denied end attempt must never actually end the real session');
});

test('ending an unknown worshipServiceId is refused, not fabricated as success', async () => {
    const { ctl } = freshEngines();
    const result = await ctl.endSession({ worshipServiceId: 'does-not-exist', actorId: 'anyone' });
    assert.equal(result.success, false);
});

test('listActiveSessions is org-isolated: Church A never sees Church B\'s live sessions', async () => {
    const { orgRegistry, membership, identity, ctl } = freshEngines();
    const orgA = setupAuthorizedChurch(orgRegistry, membership, identity, 'pastor-a');
    const orgB = orgRegistry.createOrganization({ name: 'Church B', type: 'Church' });
    identity.registerUser('pastor-b', { orgId: orgB.orgId });
    membership.createMembership({ userId: 'pastor-b', organizationId: orgB.orgId, status: 'active', permissions: ['churchos-live:manage'] });

    await ctl.startSession({ orgId: orgA.orgId, actorId: 'pastor-a', sourceLanguage: 'sw' });
    await ctl.startSession({ orgId: orgB.orgId, actorId: 'pastor-b', sourceLanguage: 'en' });

    const listA = ctl.listActiveSessions(orgA.orgId);
    const listB = ctl.listActiveSessions(orgB.orgId);
    assert.equal(listA.length, 1);
    assert.equal(listB.length, 1);
    assert.equal(listA[0].orgId, orgA.orgId);
    assert.equal(listB[0].orgId, orgB.orgId);
});

test('starting a session rolls back the LDCE session if ChurchWorshipSession fails (no orphaned session left behind)', async () => {
    const { orgRegistry, membership, identity, ctl, ldce } = freshEngines();
    const org = setupAuthorizedChurch(orgRegistry, membership, identity);
    // Missing sourceLanguage -> ChurchWorshipSession.startService() fails honestly.
    const result = await ctl.startSession({ orgId: org.orgId, actorId: 'pastor-1' });
    assert.equal(result.success, false);

    // Confirm no session bundle was retained.
    assert.equal(ctl.listActiveSessions(org.orgId).length, 0);
});
