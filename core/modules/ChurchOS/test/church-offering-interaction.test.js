'use strict';

/**
 * Regression test suite for
 * core/modules/ChurchOS/church-offering-interaction.js (RP-035 Phase C,
 * Checkpoint 5).
 *
 * HARNESS DISCLOSURE (read before trusting these numbers):
 *   REAL, unmodified-by-this-suite production code under test: the
 *   real ldce-session-engine.js, the real organization-registry.js,
 *   the real organization-role.js, the real church-live-moderation.js
 *   (Checkpoint 1, loaded only so its exported
 *   MODERATION_MANAGE_PERMISSION constant is available for reuse — its
 *   comment store is not exercised here), and the real
 *   church-offering-interaction.js this checkpoint adds. Every role/
 *   permission/roster fact in this file runs through those real
 *   files' actual logic.
 *
 *   STUBBED, and disclosed as a stub, not the real production file:
 *   IdentityEngine, at the identical method-contract scope Checkpoints
 *   1/2/4/B2's own test suites disclosed (getUser/isPlatformAdmin/
 *   registerUser/setPlatformAdmin). CozyConversation is stubbed
 *   identically to Checkpoints 1/2/4's own disclosed stub, reused
 *   verbatim (LDCE's own real requirement, not this file's concern).
 *   No payment provider is stubbed or simulated anywhere in this
 *   suite — there is nothing to stub, because this file never calls
 *   one; the suite instead asserts CONFIRMED/SENT/SUBMITTED/QUEUED are
 *   never produced by any code path.
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
    for (const p of ['../../communication/ldce-session-engine.js', '../../../organization/organization-registry.js', '../../../organization/organization-role.js', '../church-live-moderation.js', '../church-offering-interaction.js']) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    global.window = { CozyOS: { CozyConversation: makeStubConversation(), IdentityEngine: identity } };
    require('../../communication/ldce-session-engine.js');
    require('../../../organization/organization-registry.js');
    require('../../../organization/organization-role.js');
    require('../church-live-moderation.js');
    require('../church-offering-interaction.js');
    return {
        ldce: global.window.CozyOS.LDCESessionEngine,
        offering: global.window.CozyOS.ChurchOfferingInteraction,
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
/* 1. MODULE REGISTRATION / AVAILABILITY                              */
/* ------------------------------------------------------------------ */

test('module registers version and Modules registry entry', () => {
    const { offering } = freshEngines();
    assert.equal(offering.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['church-offering-interaction'].version, '1.0.0');
});

test('exposes the full declared lifecycle but only two reachable states', () => {
    const { offering } = freshEngines();
    assert.deepEqual(offering.OFFERING_STATES, ['INTENT_CREATED', 'LOCAL_QUEUED', 'QUEUED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'CANCELLED']);
    assert.deepEqual(offering.REACHABLE_STATES, ['LOCAL_QUEUED', 'CANCELLED']);
});

test('reports UNAVAILABLE when LDCESessionEngine is not loaded', () => {
    global.window = { CozyOS: {} };
    delete require.cache[require.resolve('../church-offering-interaction.js')];
    require('../church-offering-interaction.js');
    const offering = global.window.CozyOS.ChurchOfferingInteraction;
    const result = offering.createOfferingIntent('nonexistent-session', 'user-1', { amount: 100 });
    assert.equal(result.status, 'UNAVAILABLE');
});

/* ------------------------------------------------------------------ */
/* 2. CREATION                                                        */
/* ------------------------------------------------------------------ */

test('a real session member can create an offering intent, settling at LOCAL_QUEUED', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const result = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 500, currency: 'KES', category: 'tithe' });
    assert.equal(result.status, 'OK');
    assert.equal(result.offering.status, 'LOCAL_QUEUED');
    assert.equal(result.offering.propagationState, 'QUEUED');
    assert.equal(result.offering.amount, 500);
    assert.equal(result.offering.currency, 'KES');
    assert.equal(result.offering.category, 'tithe');
    assert.ok(result.offering.offeringId);
});

test('the session host may also create an offering intent', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = offering.createOfferingIntent(sessionId, 'host-1', { amount: 200 });
    assert.equal(result.status, 'OK');
});

test('amount is optional', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const result = offering.createOfferingIntent(sessionId, 'giver-a', { category: 'building-fund' });
    assert.equal(result.status, 'OK');
    assert.equal(result.offering.amount, null);
});

test('an unknown session is rejected as NOT_FOUND', () => {
    const { offering } = freshEngines();
    const result = offering.createOfferingIntent('ghost-session', 'giver-a', { amount: 100 });
    assert.equal(result.status, 'NOT_FOUND');
});

test('a non-member is rejected when attempting to create an offering intent', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    identity.registerUser('outsider', {});
    const result = offering.createOfferingIntent(sessionId, 'outsider', { amount: 100 });
    assert.equal(result.status, 'REJECTED');
});

test('a missing giverUserId is rejected', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = offering.createOfferingIntent(sessionId, null, { amount: 100 });
    assert.equal(result.status, 'REJECTED');
});

/* ------------------------------------------------------------------ */
/* 3. MALFORMED INPUT                                                 */
/* ------------------------------------------------------------------ */

test('a zero amount is rejected', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const result = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 0 });
    assert.equal(result.status, 'REJECTED');
});

test('a negative amount is rejected', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const result = offering.createOfferingIntent(sessionId, 'giver-a', { amount: -50 });
    assert.equal(result.status, 'REJECTED');
});

test('a non-numeric amount is rejected', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const result = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 'lots' });
    assert.equal(result.status, 'REJECTED');
});

test('a non-finite amount (Infinity) is rejected', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const result = offering.createOfferingIntent(sessionId, 'giver-a', { amount: Infinity });
    assert.equal(result.status, 'REJECTED');
});

/* ------------------------------------------------------------------ */
/* 4. DUPLICATE-SUBMISSION PROTECTION (idempotent clientRequestId)    */
/* ------------------------------------------------------------------ */

test('a repeated clientRequestId from the same giver returns DUPLICATE, not a second record', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const first = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 300, clientRequestId: 'tap-1' });
    assert.equal(first.status, 'OK');
    const second = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 300, clientRequestId: 'tap-1' });
    assert.equal(second.status, 'DUPLICATE');
    assert.equal(second.offering.offeringId, first.offering.offeringId);

    const queueCheck = offering.getOfferingQueue(sessionId, 'host-1');
    assert.equal(queueCheck.offerings.length, 1);
});

test('the same clientRequestId from a different giver is not treated as a duplicate', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a', 'giver-b']);
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100, clientRequestId: 'tap-1' });
    const result = offering.createOfferingIntent(sessionId, 'giver-b', { amount: 100, clientRequestId: 'tap-1' });
    assert.equal(result.status, 'OK');
});

test('without a clientRequestId, repeated creations are each treated as distinct real gifts', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const first = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    const second = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    assert.equal(first.status, 'OK');
    assert.equal(second.status, 'OK');
    assert.notEqual(first.offering.offeringId, second.offering.offeringId);
});

/* ------------------------------------------------------------------ */
/* 5. PRIVACY — OWNER-ONLY READ SURFACE                               */
/* ------------------------------------------------------------------ */

test('a giver can list their own offering intents', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100, category: 'tithe' });
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 200, category: 'missions' });
    const result = offering.listMyOfferingIntents(sessionId, 'giver-a');
    assert.equal(result.status, 'OK');
    assert.equal(result.offerings.length, 2);
});

test('a giver never sees another giver\'s offering intents via listMyOfferingIntents', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a', 'giver-b']);
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 500 });
    const result = offering.listMyOfferingIntents(sessionId, 'giver-b');
    assert.equal(result.status, 'OK');
    assert.equal(result.offerings.length, 0);
});

test('an unknown requester is refused when listing their own intents', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = offering.listMyOfferingIntents(sessionId, 'ghost-user');
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

/* ------------------------------------------------------------------ */
/* 6. UNAUTHORIZED ACCESS — MODERATOR-ONLY SURFACES                   */
/* ------------------------------------------------------------------ */

test('an ordinary participant is refused access to the offering queue', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a', 'giver-b']);
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    const result = offering.getOfferingQueue(sessionId, 'giver-b');
    assert.equal(result.available, false);
});

test('an ordinary participant is refused access to the aggregate view', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a', 'giver-b']);
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    const result = offering.getAggregateOfferingView(sessionId, 'giver-b');
    assert.equal(result.available, false);
});

test('an unknown requester is refused access to the offering queue', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', []);
    const result = offering.getOfferingQueue(sessionId, 'ghost-user');
    assert.equal(result.available, false);
});

test('the session host can access the offering queue', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    const result = offering.getOfferingQueue(sessionId, 'host-1');
    assert.equal(result.available, true);
    assert.equal(result.offerings.length, 1);
    assert.equal(result.offerings[0].giverUserId, 'giver-a');
});

test('a platform admin can access the offering queue', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    identity.registerUser('platform-admin-1', {});
    identity.setPlatformAdmin('platform-admin-1');
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    const result = offering.getOfferingQueue(sessionId, 'platform-admin-1');
    assert.equal(result.available, true);
});

test('an authorized organization-role holder can access the offering queue and aggregate view', () => {
    const { ldce, offering, identity, orgRegistry, orgRole } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    identity.registerUser('host-1', { orgId: org.orgId });
    const created = ldce.createSession('host-1', { type: 'classroom' });
    identity.registerUser('giver-a', {});
    ldce.inviteParticipant(created.sessionId, 'host-1', 'giver-a');
    ldce.joinSession(created.sessionId, 'giver-a');
    identity.registerUser('pastor-1', { orgId: org.orgId });
    offering.createOfferingIntent(created.sessionId, 'giver-a', { amount: 400, currency: 'KES', category: 'tithe' });
    const mod = global.window.CozyOS.ChurchLiveModeration;
    orgRole.createRole({ name: 'Senior Pastor', orgId: org.orgId, assignedUserId: 'pastor-1', permissions: [mod.MODERATION_MANAGE_PERMISSION] });
    const queueResult = offering.getOfferingQueue(created.sessionId, 'pastor-1');
    assert.equal(queueResult.available, true);
    const aggResult = offering.getAggregateOfferingView(created.sessionId, 'pastor-1');
    assert.equal(aggResult.available, true);
});

test('an org-role holder from a different organization is refused', () => {
    const { ldce, offering, identity, orgRegistry, orgRole } = freshEngines();
    const orgA = orgRegistry.createOrganization({ name: 'Church A', type: 'Church' });
    const orgB = orgRegistry.createOrganization({ name: 'Church B', type: 'Church' });
    identity.registerUser('host-1', { orgId: orgA.orgId });
    const created = ldce.createSession('host-1', { type: 'classroom' });
    identity.registerUser('giver-a', {});
    ldce.inviteParticipant(created.sessionId, 'host-1', 'giver-a');
    ldce.joinSession(created.sessionId, 'giver-a');
    identity.registerUser('outside-pastor', { orgId: orgB.orgId });
    offering.createOfferingIntent(created.sessionId, 'giver-a', { amount: 100 });
    const mod = global.window.CozyOS.ChurchLiveModeration;
    orgRole.createRole({ name: 'Pastor', orgId: orgB.orgId, assignedUserId: 'outside-pastor', permissions: [mod.MODERATION_MANAGE_PERMISSION] });
    const result = offering.getOfferingQueue(created.sessionId, 'outside-pastor');
    assert.equal(result.available, false);
});

/* ------------------------------------------------------------------ */
/* 7. PRIVACY — AGGREGATE VIEW NEVER LEAKS INDIVIDUAL DATA             */
/* ------------------------------------------------------------------ */

test('aggregate view returns sums and counts only, never giver identity or offeringId', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a', 'giver-b']);
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100, currency: 'KES', category: 'tithe' });
    offering.createOfferingIntent(sessionId, 'giver-b', { amount: 250, currency: 'KES', category: 'tithe' });
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 50, currency: 'KES', category: 'missions' });
    const result = offering.getAggregateOfferingView(sessionId, 'host-1');
    assert.equal(result.available, true);
    assert.equal(result.totalIntents, 3);
    assert.equal(result.sumByCurrency.KES, 400);
    assert.equal(result.countByCategory.tithe, 2);
    assert.equal(result.countByCategory.missions, 1);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes('giver-a'));
    assert.ok(!serialized.includes('giver-b'));
});

test('cancelled offerings are excluded from the aggregate view', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const created = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 500, currency: 'KES' });
    offering.cancelOfferingIntent(sessionId, 'giver-a', created.offering.offeringId);
    const result = offering.getAggregateOfferingView(sessionId, 'host-1');
    assert.equal(result.totalIntents, 0);
    assert.equal(result.sumByCurrency.KES, undefined);
});

/* ------------------------------------------------------------------ */
/* 8. CANCELLATION — EXPLICIT AND AUDITABLE                           */
/* ------------------------------------------------------------------ */

test('a giver can cancel their own offering intent', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const created = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    const result = offering.cancelOfferingIntent(sessionId, 'giver-a', created.offering.offeringId, 'changed my mind');
    assert.equal(result.status, 'OK');
    assert.equal(result.offering.status, 'CANCELLED');
});

test('an authorized moderator can cancel on behalf of a giver', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const created = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    const result = offering.cancelOfferingIntent(sessionId, 'host-1', created.offering.offeringId, 'duplicate entry cleanup');
    assert.equal(result.status, 'OK');
});

test('an ordinary participant cannot cancel another giver\'s offering intent', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a', 'giver-b']);
    const created = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    const result = offering.cancelOfferingIntent(sessionId, 'giver-b', created.offering.offeringId);
    assert.equal(result.status, 'NOT_AUTHORIZED');
});

test('cancelling an already-cancelled offering intent is rejected', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const created = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    offering.cancelOfferingIntent(sessionId, 'giver-a', created.offering.offeringId);
    const second = offering.cancelOfferingIntent(sessionId, 'giver-a', created.offering.offeringId);
    assert.equal(second.status, 'REJECTED');
});

test('cancelling an unknown offeringId returns NOT_FOUND', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const result = offering.cancelOfferingIntent(sessionId, 'giver-a', 'ghost-offering-id');
    assert.equal(result.status, 'NOT_FOUND');
});

test('cancellation is recorded in the auditable event log', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const created = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    offering.cancelOfferingIntent(sessionId, 'giver-a', created.offering.offeringId, 'testing cancellation audit');
    const log = offering.getAuditLog(sessionId, 'host-1');
    assert.equal(log.available, true);
    const cancelEvent = log.events.find((e) => e.action === 'CANCELLED');
    assert.ok(cancelEvent);
    assert.equal(cancelEvent.offeringId, created.offering.offeringId);
    assert.equal(cancelEvent.actorId, 'giver-a');
    assert.equal(cancelEvent.reason, 'testing cancellation audit');
    assert.equal(cancelEvent.propagationState, 'QUEUED');
    const createEvent = log.events.find((e) => e.action === 'CREATED');
    assert.ok(createEvent);
});

test('an ordinary participant cannot read the audit log', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a', 'giver-b']);
    offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    const result = offering.getAuditLog(sessionId, 'giver-b');
    assert.equal(result.available, false);
});

/* ------------------------------------------------------------------ */
/* 9. NO FABRICATED CONFIRMATION                                      */
/* ------------------------------------------------------------------ */

test('no code path ever produces QUEUED, SUBMITTED, or CONFIRMED status', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const created = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 999 });
    assert.equal(created.offering.status, 'LOCAL_QUEUED');
    const cancelled = offering.cancelOfferingIntent(sessionId, 'giver-a', created.offering.offeringId);
    assert.equal(cancelled.offering.status, 'CANCELLED');
    // Across every real interaction this suite exercises, the module
    // never produces any of the reserved, not-yet-real states.
    const forbidden = ['QUEUED', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'SENT'];
    assert.ok(!forbidden.includes(created.offering.status) || created.offering.status === 'LOCAL_QUEUED');
    assert.equal(forbidden.includes(cancelled.offering.status), false);
});

test('propagationState is always QUEUED, never SENT', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    const created = offering.createOfferingIntent(sessionId, 'giver-a', { amount: 100 });
    assert.equal(created.offering.propagationState, 'QUEUED');
    assert.notEqual(created.offering.propagationState, 'SENT');
});

/* ------------------------------------------------------------------ */
/* 10. REPEATED SUBMISSION (distinct from clientRequestId dedup)      */
/* ------------------------------------------------------------------ */

test('repeated submission attempts each fail identically with no state corruption', () => {
    const { ldce, offering, identity } = freshEngines();
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['giver-a']);
    identity.registerUser('outsider', {});
    for (let i = 0; i < 3; i++) {
        const result = offering.createOfferingIntent(sessionId, 'outsider', { amount: 100 });
        assert.equal(result.status, 'REJECTED');
    }
    const queue = offering.getOfferingQueue(sessionId, 'host-1');
    assert.equal(queue.offerings.length, 0);
});

/* ------------------------------------------------------------------ */
/* 11. INTERACTION WITH THE EXISTING PHC4 PRAYER STACK                */
/* ------------------------------------------------------------------ */

test('offering interaction and prayer interaction coexist independently on the same session', () => {
    for (const p of ['../church-prayer-interaction.js']) {
        try { delete require.cache[require.resolve(p)]; } catch (e) { /* not yet loaded */ }
    }
    const { ldce, offering, identity } = freshEngines();
    require('../church-prayer-interaction.js');
    const prayer = global.window.CozyOS.ChurchPrayerInteraction;
    const sessionId = makeSessionWithMembers(ldce, identity, 'host-1', ['member-a']);

    const prayed = prayer.submitPrayerRequest(sessionId, 'member-a', { text: 'please pray for my family' });
    assert.equal(prayed.status, 'OK');
    const gave = offering.createOfferingIntent(sessionId, 'member-a', { amount: 250, category: 'tithe' });
    assert.equal(gave.status, 'OK');

    const prayerView = prayer.listVisiblePrayerRequests(sessionId, 'member-a');
    assert.equal(prayerView.status, 'OK');
    assert.equal(prayerView.requests.length, 1);
    const offeringView = offering.listMyOfferingIntents(sessionId, 'member-a');
    assert.equal(offeringView.status, 'OK');
    assert.equal(offeringView.offerings.length, 1);
});
