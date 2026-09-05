'use strict';

/**
 * Regression test suite for
 * core/modules/ChurchOS/church-attendance-geography.js (RP-035 Phase
 * B, Checkpoint 2).
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test: the
 *   real ldce-session-engine.js, the real organization-registry.js,
 *   the real organization-role.js, and the real
 *   church-attendance-geography.js this checkpoint adds. Every
 *   roster/role/permission fact in this file runs through those four
 *   real files' actual logic.
 *
 *   STUBBED, and disclosed as a stub, not the real production file:
 *   IdentityEngine. The real identity-engine.js (1300+ lines) pulls in
 *   PBKDF2 password hashing, IdentityStorage/IndexedDB persistence,
 *   and speech/translation adapters not needed to exercise this
 *   checkpoint's real logic in isolation — the same disclosed
 *   trade-off Checkpoint 1's test suite already made for the same
 *   reason. This stub implements only the exact method contracts this
 *   checkpoint's two real consumers (ldce-session-engine.js and
 *   church-attendance-geography.js) actually call:
 *   grantResourcePermission/checkResourcePermission (LDCE) and
 *   getUser/isPlatformAdmin (church-attendance-geography.js) — with
 *   getUser() returning the exact same shape the real, Checkpoint-2-
 *   updated getUser() now returns, including the real optional
 *   `country` field this checkpoint added.
 *
 *   CozyConversation is stubbed identically to Checkpoint 1's own
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

/** Stub IdentityEngine — real method contracts only (see header). */
function makeStubIdentity() {
    const users = new Map(); // userId -> { orgId, country, roles }
    const grants = new Map(); // userId -> Set(permissionString)
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
    for (const p of ['../../communication/ldce-session-engine.js', '../../../organization/organization-registry.js', '../../../organization/organization-role.js', '../church-attendance-geography.js']) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    global.window = { CozyOS: { CozyConversation: makeStubConversation(), IdentityEngine: identity } };
    require('../../communication/ldce-session-engine.js');
    require('../../../organization/organization-registry.js');
    require('../../../organization/organization-role.js');
    require('../church-attendance-geography.js');
    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        geo: global.window.CozyOS.ChurchAttendanceGeography,
        orgRegistry: global.window.CozyOS.OrganizationRegistry,
        orgRole: global.window.CozyOS.OrganizationRole,
        identity,
    };
}

function joinAll(ldce, identity, sessionId, hostId, userCountries) {
    for (const [uid, country] of Object.entries(userCountries)) {
        identity.registerUser(uid, { country });
        const invite = ldce.inviteParticipant(sessionId, hostId, uid);
        assert.equal(invite.success, true, `invite for ${uid} should succeed: ${invite.reason}`);
        const join = ldce.joinSession(sessionId, uid);
        assert.equal(join.success, true, `join for ${uid} should succeed: ${join.reason}`);
    }
}

/* ------------------------------------------------------------------ */
/* AVAILABILITY / HONESTY GUARANTEES                                   */
/* ------------------------------------------------------------------ */

test('reports available:false when LDCESessionEngine is not loaded', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve('../church-attendance-geography.js')];
    require('../church-attendance-geography.js');
    const geo = global.window.CozyOS.ChurchAttendanceGeography;
    const result = geo.getPastorAdminAnalytics('nonexistent-session', 'pastor-1');
    assert.equal(result.available, false);
    assert.ok(result.reason);
});

test('reports available:false for an unknown sessionId', () => {
    const { geo } = freshEngines();
    const result = geo.getPastorAdminAnalytics('does-not-exist', 'pastor-1');
    assert.equal(result.available, false);
});

test('module registers version and Modules registry entry', () => {
    const { geo } = freshEngines();
    assert.equal(geo.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['church-attendance-geography'].version, '1.0.0');
    assert.equal(geo.PASTOR_ADMIN_ANALYTICS_PERMISSION, 'attendance:analytics-view');
});

/* ------------------------------------------------------------------ */
/* AUTHORIZATION — fail-closed, evidence-based                        */
/* ------------------------------------------------------------------ */

test('an ordinary member with no org role and no platform-admin grant is refused analytics', () => {
    const { ldce, geo, identity } = freshEngines();
    identity.registerUser('host-1', { orgId: 'org_x' });
    identity.registerUser('random-member', { orgId: 'org_x', country: 'Kenya' });
    const created = ldce.createSession('host-1', { type: 'meeting' });

    const result = geo.getPastorAdminAnalytics(created.sessionId, 'random-member');
    assert.equal(result.available, false);
    assert.match(result.reason, /No real, active org role/);
});

test('an unknown requesterUserId is refused, not silently treated as authorized', () => {
    const { ldce, geo, identity } = freshEngines();
    identity.registerUser('host-1', { orgId: 'org_x' });
    const created = ldce.createSession('host-1', { type: 'meeting' });
    const result = geo.getPastorAdminAnalytics(created.sessionId, 'nobody-registered');
    assert.equal(result.available, false);
});

test('a real platform-admin is authorized even with no org role at all', () => {
    const { ldce, geo, identity } = freshEngines();
    identity.registerUser('host-1', { orgId: 'org_x' });
    identity.registerUser('platform-admin-1', { orgId: null, country: 'UK' });
    identity.setPlatformAdmin('platform-admin-1');
    const created = ldce.createSession('host-1', { type: 'meeting' });
    joinAll(ldce, identity, created.sessionId, 'host-1', { 'member-a': 'Kenya' });

    const result = geo.getPastorAdminAnalytics(created.sessionId, 'platform-admin-1');
    assert.equal(result.available, true);
    assert.equal(result.total, 2); // host + member-a
});

test('a real org role holding the analytics permission, assigned to the requester, authorizes them', () => {
    const { ldce, geo, identity, orgRegistry, orgRole } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser('host-1', { orgId: org.orgId });
    identity.registerUser('pastor-1', { orgId: org.orgId, country: 'Kenya' });
    const role = orgRole.createRole({ name: 'Senior Pastor', orgId: org.orgId, permissions: [geo.PASTOR_ADMIN_ANALYTICS_PERMISSION] });
    orgRole.assignUser(role.roleId, 'pastor-1');

    const created = ldce.createSession('host-1', { type: 'meeting' });
    joinAll(ldce, identity, created.sessionId, 'host-1', { 'member-a': 'Kenya' });

    const result = geo.getPastorAdminAnalytics(created.sessionId, 'pastor-1');
    assert.equal(result.available, true);
});

test('a role that declares the permission but is NOT assigned to the requester does not authorize them', () => {
    const { ldce, geo, identity, orgRegistry, orgRole } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser('host-1', { orgId: org.orgId });
    identity.registerUser('someone-else', { orgId: org.orgId });
    const role = orgRole.createRole({ name: 'Senior Pastor', orgId: org.orgId, permissions: [geo.PASTOR_ADMIN_ANALYTICS_PERMISSION] });
    orgRole.assignUser(role.roleId, 'a-different-real-userid-not-under-test');
    identity.registerUser('a-different-real-userid-not-under-test', { orgId: org.orgId });

    const created = ldce.createSession('host-1', { type: 'meeting' });
    const result = geo.getPastorAdminAnalytics(created.sessionId, 'someone-else');
    assert.equal(result.available, false);
});

test('a requester in a DIFFERENT organization from the session host is refused even if they hold the permission in their own org', () => {
    const { ldce, geo, identity, orgRegistry, orgRole } = freshEngines();
    const orgA = orgRegistry.createOrganization({ name: 'Church A', type: 'Church' });
    const orgB = orgRegistry.createOrganization({ name: 'Church B', type: 'Church' });
    identity.registerUser('host-a', { orgId: orgA.orgId });
    identity.registerUser('pastor-b', { orgId: orgB.orgId, country: 'Uganda' });
    const roleB = orgRole.createRole({ name: 'Senior Pastor', orgId: orgB.orgId, permissions: [geo.PASTOR_ADMIN_ANALYTICS_PERMISSION] });
    orgRole.assignUser(roleB.roleId, 'pastor-b');

    const created = ldce.createSession('host-a', { type: 'meeting' });
    const result = geo.getPastorAdminAnalytics(created.sessionId, 'pastor-b');
    assert.equal(result.available, false);
});

/* ------------------------------------------------------------------ */
/* GEOGRAPHIC EVIDENCE — real, never guessed                          */
/* ------------------------------------------------------------------ */

function authorizedPastorSetup() {
    const { ldce, geo, identity, orgRegistry, orgRole } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser('host-1', { orgId: org.orgId });
    identity.registerUser('pastor-1', { orgId: org.orgId, country: 'Kenya' });
    const role = orgRole.createRole({ name: 'Senior Pastor', orgId: org.orgId, permissions: [geo.PASTOR_ADMIN_ANALYTICS_PERMISSION] });
    orgRole.assignUser(role.roleId, 'pastor-1');
    const created = ldce.createSession('host-1', { type: 'meeting' });
    return { ldce, geo, identity, sessionId: created.sessionId };
}

test('real country breakdown reflects only real, consented per-participant records', () => {
    const { ldce, geo, identity, sessionId } = authorizedPastorSetup();
    joinAll(ldce, identity, sessionId, 'host-1', {
        'm1': 'Kenya', 'm2': 'Kenya', 'm3': 'Uganda', 'm4': 'Tanzania', 'm5': 'UK', 'm6': null,
    });
    const result = geo.getPastorAdminAnalytics(sessionId, 'pastor-1');
    assert.equal(result.available, true);
    // host-1 (registered with no country -> Unknown) + 6 joined members = 7 active
    assert.equal(result.total, 7);
    assert.equal(result.byCountry['Kenya'], 2); // m1+m2 (pastor-1 is the requester, not a session participant)
    assert.equal(result.byCountry['Uganda'], 1);
    assert.equal(result.byCountry['Tanzania'], 1);
    assert.equal(result.byCountry['UK'], 1);
    assert.equal(result.byCountry['Unknown'], 2); // host-1 + m6
    const sum = Object.values(result.byCountry).reduce((a, b) => a + b, 0);
    assert.equal(sum, result.total);
});

test('a participant with no country on file is counted as Unknown, never guessed', () => {
    const { ldce, geo, identity, sessionId } = authorizedPastorSetup();
    joinAll(ldce, identity, sessionId, 'host-1', { 'm1': null });
    const result = geo.getPastorAdminAnalytics(sessionId, 'pastor-1');
    assert.equal(result.available, true);
    assert.ok(result.byCountry['Unknown'] >= 1);
});

test('local/east-africa/international split anchors to the requesters real country', () => {
    const { ldce, geo, identity, sessionId } = authorizedPastorSetup(); // pastor-1 country: Kenya
    joinAll(ldce, identity, sessionId, 'host-1', {
        'm1': 'Kenya', 'm2': 'Kenya', 'm3': 'Uganda', 'm4': 'Tanzania', 'm5': 'UK',
    });
    const result = geo.getPastorAdminAnalytics(sessionId, 'pastor-1');
    assert.equal(result.regional.available, true);
    assert.equal(result.regional.localCountry, 'Kenya');
    // Kenya count = m1+m2 = 2 (host-1 has no country -> Unknown, counted as international, never local)
    assert.equal(result.regional.localArea, 2);
    // East Africa (excluding local Kenya) = Uganda(1) + Tanzania(1) = 2
    assert.equal(result.regional.eastAfrica, 2);
    // International = UK(1) + Unknown(host-1, 1) = 2
    assert.equal(result.regional.international, 2);
    assert.equal(result.regional.localArea + result.regional.eastAfrica + result.regional.international, result.total);
});

test('returns LOCATION_DATA_UNAVAILABLE for regional split, never an invented country, when the requester has no country on file', () => {
    const { ldce, geo, identity, orgRegistry, orgRole } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser('host-1', { orgId: org.orgId });
    identity.registerUser('pastor-no-country', { orgId: org.orgId }); // no country supplied
    const role = orgRole.createRole({ name: 'Senior Pastor', orgId: org.orgId, permissions: [geo.PASTOR_ADMIN_ANALYTICS_PERMISSION] });
    orgRole.assignUser(role.roleId, 'pastor-no-country');
    const created = ldce.createSession('host-1', { type: 'meeting' });
    joinAll(ldce, identity, created.sessionId, 'host-1', { 'm1': 'Kenya' });

    const result = geo.getPastorAdminAnalytics(created.sessionId, 'pastor-no-country');
    assert.equal(result.available, true); // country breakdown still real and available
    assert.equal(result.regional.available, false);
    assert.equal(result.regional.reason, 'LOCATION_DATA_UNAVAILABLE');
    assert.equal(result.byCountry['Kenya'], 1); // per-country evidence still honestly returned
});

/* ------------------------------------------------------------------ */
/* VIEWER PATH UNTOUCHED — Checkpoint 1 contract still holds           */
/* ------------------------------------------------------------------ */

test('church-live-attendance.js (Checkpoint 1) still loads and behaves identically alongside this checkpoint', () => {
    delete require.cache[require.resolve('../church-live-attendance.js')];
    const { ldce, identity, sessionId } = authorizedPastorSetup();
    require('../church-live-attendance.js');
    const viewerAttendance = global.window.CozyOS.ChurchLiveAttendance;
    joinAll(ldce, identity, sessionId, 'host-1', { 'm1': 'Kenya' });
    const viewer = viewerAttendance.getViewerAttendance(sessionId);
    assert.equal(viewer.available, true);
    assert.equal(viewer.attending, 2); // host + m1
    // Never a country, name, or userId anywhere in the viewer object.
    assert.deepEqual(Object.keys(viewer).sort(), ['attending', 'available']);
});
