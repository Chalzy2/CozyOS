'use strict';

/**
 * Regression test suite for core/organization/organization-support.js
 * (LIVE INTEGRATION AUDIT — CozyOS Platform Support).
 *
 * HARNESS DISCLOSURE:
 *   REAL, unmodified production code under test: the real
 *   organization-registry.js, the real organization-membership.js, and
 *   the real organization-support.js this suite adds.
 *   STUBBED: IdentityEngine — real method contracts only
 *   (isPlatformAdmin/getUser), same disclosed pattern the rest of this
 *   test directory already uses.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function makeStubIdentity() {
    const platformAdmins = new Set();
    return {
        setPlatformAdmin(userId) { platformAdmins.add(userId); },
        isPlatformAdmin(userId) { return platformAdmins.has(userId); },
        getUser(userId) { return { userId }; },
    };
}

function freshEngines() {
    for (const p of ['../organization-registry.js', '../organization-membership.js', '../organization-support.js']) {
        delete require.cache[require.resolve(p)];
    }
    const identity = makeStubIdentity();
    global.window = { CozyOS: { IdentityEngine: identity } };
    require('../organization-registry.js');
    require('../organization-membership.js');
    require('../organization-support.js');
    return {
        orgRegistry: global.window.CozyOS.OrganizationRegistry,
        membership: global.window.CozyOS.OrganizationMembership,
        support: global.window.CozyOS.OrganizationSupport,
        identity,
    };
}

function setupChurchWithAdmin(orgRegistry, membership, adminId = 'church-admin-1') {
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    membership.createMembership({ userId: adminId, organizationId: org.orgId, status: 'active', roles: ['owner'] });
    return org;
}

test('module registers version and Modules registry entry', () => {
    const { support } = freshEngines();
    assert.equal(support.getVersion(), '1.0.0');
    assert.equal(global.window.CozyOS.Modules['organization-support'].version, '1.0.0');
});

/* ------------------------------------------------------------------ */
/* REQUEST — grants nothing, requires real active membership          */
/* ------------------------------------------------------------------ */

test('an active org member can request support; the request grants nothing by itself', () => {
    const { orgRegistry, membership, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    const result = support.requestSupport({ organizationId: org.orgId, requesterId: 'church-admin-1', reason: 'translation not working' });
    assert.equal(result.success, true);
    assert.equal(result.status, 'pending');
    assert.equal(support.isSupportActive(org.orgId, 'any-operator').active, false, 'a request must never itself grant support');
});

test('a non-member cannot request support for an organization they do not belong to', () => {
    const { orgRegistry, support } = freshEngines();
    const org = orgRegistry.createOrganization({ name: 'Grace Church', type: 'Church' });
    const result = support.requestSupport({ organizationId: org.orgId, requesterId: 'stranger', reason: 'help' });
    assert.equal(result.success, false);
});

test('a request without a real reason is refused, not fabricated as pending', () => {
    const { orgRegistry, membership, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    const result = support.requestSupport({ organizationId: org.orgId, requesterId: 'church-admin-1', reason: '' });
    assert.equal(result.success, false);
});

test('listPendingRequests() surfaces the real request for platform-admin triage', () => {
    const { orgRegistry, membership, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    support.requestSupport({ organizationId: org.orgId, requesterId: 'church-admin-1', reason: 'help' });
    const pending = support.listPendingRequests();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].organizationId, org.orgId);
});

/* ------------------------------------------------------------------ */
/* GRANT — platform-admin only, real expiry, real scope                */
/* ------------------------------------------------------------------ */

test('grantSupport() is refused for a non-platform-admin operator', () => {
    const { orgRegistry, membership, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    const result = support.grantSupport({ organizationId: org.orgId, operatorId: 'not-an-admin', reason: 'assist', scope: ['inspect-live-session'] });
    assert.equal(result.success, false);
    assert.match(result.reason, /not a CozyOS platform administrator/);
});

test('a real platform admin can grant scoped, time-boxed support', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    const result = support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'translation not working', scope: ['inspect-live-session'] });
    assert.equal(result.success, true);
    assert.ok(result.grantId);
    assert.ok(new Date(result.expiresAt).getTime() > Date.now());

    const active = support.isSupportActive(org.orgId, 'support-op-1');
    assert.equal(active.active, true);
    assert.equal(active.scope.includes('inspect-live-session'), true);
});

test('granting support against a real pending request marks it granted', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    const req = support.requestSupport({ organizationId: org.orgId, requesterId: 'church-admin-1', reason: 'help' });
    const grant = support.grantSupport({ requestId: req.requestId, organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'] });
    assert.equal(grant.success, true);

    const updatedRequest = support.getRequest(req.requestId);
    assert.equal(updatedRequest.status, 'granted');
    assert.equal(updatedRequest.grantId, grant.grantId);
    assert.equal(support.listPendingRequests().length, 0);
});

test('grantSupport() rejects an unscoped grant — support is never blanket', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    const result = support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: [] });
    assert.equal(result.success, false);
});

test('grantSupport() caps duration at 24h — never indefinite even if a larger value is requested', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    const result = support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'], durationMs: 999 * 24 * 60 * 60 * 1000 });
    assert.equal(result.success, true);
    const durationMs = new Date(result.expiresAt).getTime() - new Date(result.authorizedAt).getTime();
    assert.ok(durationMs <= 24 * 60 * 60 * 1000 + 1000, 'duration must never exceed the real 24h cap');
});

test('isSupportActive() correctly reports inactive for an unrelated organization or operator', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const orgA = setupChurchWithAdmin(orgRegistry, membership, 'admin-a');
    const orgB = orgRegistry.createOrganization({ name: 'Church B', type: 'Church' });
    identity.setPlatformAdmin('support-op-1');
    support.grantSupport({ organizationId: orgA.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'] });

    assert.equal(support.isSupportActive(orgB.orgId, 'support-op-1').active, false, 'a grant for Church A must never activate support in Church B');
    assert.equal(support.isSupportActive(orgA.orgId, 'a-different-operator').active, false);
});

test('isSupportActive() with requiredScope only reports active for a grant that actually covers that scope', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'] });

    assert.equal(support.isSupportActive(org.orgId, 'support-op-1', { requiredScope: 'inspect-live-session' }).active, true);
    assert.equal(support.isSupportActive(org.orgId, 'support-op-1', { requiredScope: 'moderate-live-session' }).active, false);
});

/* ------------------------------------------------------------------ */
/* ACTIONS — auditable, only against a genuinely active grant          */
/* ------------------------------------------------------------------ */

test('recordSupportAction() succeeds against an active grant and is retrievable in the audit trail', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    const grant = support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'] });

    const recorded = support.recordSupportAction(grant.grantId, 'inspected-transcript', { note: 'transcript looked fine' });
    assert.equal(recorded.success, true);

    const trail = support.getAuditTrail(org.orgId);
    const actions = trail.filter((e) => e.action === 'support-action');
    assert.equal(actions.length, 1);
    assert.equal(trail.some((e) => e.action === 'support-granted'), true);
});

test('recordSupportAction() is refused against an unknown grant, never fabricated as recorded', () => {
    const { support } = freshEngines();
    const result = support.recordSupportAction('does-not-exist', 'some-action');
    assert.equal(result.success, false);
});

/* ------------------------------------------------------------------ */
/* REVOCATION — operator, platform admin, or the org's own admin       */
/* ------------------------------------------------------------------ */

test('the operator can revoke their own support grant', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    const grant = support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'] });

    const revoked = support.revokeSupport(grant.grantId, 'support-op-1', 'done helping');
    assert.equal(revoked.success, true);
    assert.equal(support.isSupportActive(org.orgId, 'support-op-1').active, false);
});

test('the organization\'s own real admin can revoke platform support into their org — org sovereignty preserved', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership, 'church-admin-1');
    identity.setPlatformAdmin('support-op-1');
    const grant = support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'] });

    const revoked = support.revokeSupport(grant.grantId, 'church-admin-1', 'no longer needed');
    assert.equal(revoked.success, true);
});

test('an unrelated bystander cannot revoke a support grant', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    const grant = support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'] });

    const revoked = support.revokeSupport(grant.grantId, 'random-bystander', 'because');
    assert.equal(revoked.success, false);
    assert.equal(support.isSupportActive(org.orgId, 'support-op-1').active, true, 'a denied revoke attempt must never actually revoke real access');
});

test('a revoked grant can no longer record new support actions', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    const grant = support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'] });
    support.revokeSupport(grant.grantId, 'support-op-1', 'done');

    const result = support.recordSupportAction(grant.grantId, 'late-action');
    assert.equal(result.success, false);
});

test('an already-expired grant reports inactive even without explicit revocation', async () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    const grant = support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'], durationMs: 5 });

    // Real elapsed time, not a mocked clock — wait past the real 5ms expiry.
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(support.isSupportActive(org.orgId, 'support-op-1').active, false);
    const result = support.recordSupportAction(grant.grantId, 'too-late');
    assert.equal(result.success, false);
});

/* ------------------------------------------------------------------ */
/* ORGANIZATION ISOLATION                                              */
/* ------------------------------------------------------------------ */

test('listActiveGrants() is org-isolated: Church A never sees Church B\'s support grants', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const orgA = setupChurchWithAdmin(orgRegistry, membership, 'admin-a');
    const orgB = setupChurchWithAdmin(orgRegistry, membership, 'admin-b');
    identity.setPlatformAdmin('support-op-1');
    support.grantSupport({ organizationId: orgA.orgId, operatorId: 'support-op-1', reason: 'help A', scope: ['inspect-live-session'] });
    support.grantSupport({ organizationId: orgB.orgId, operatorId: 'support-op-1', reason: 'help B', scope: ['inspect-live-session'] });

    const listA = support.listActiveGrants(orgA.orgId);
    const listB = support.listActiveGrants(orgB.orgId);
    assert.equal(listA.length, 1);
    assert.equal(listB.length, 1);
    assert.equal(listA[0].organizationId, orgA.orgId);
});

test('getAuditTrail() is org-isolated: Church A never sees Church B\'s support audit events', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const orgA = setupChurchWithAdmin(orgRegistry, membership, 'admin-a');
    const orgB = setupChurchWithAdmin(orgRegistry, membership, 'admin-b');
    identity.setPlatformAdmin('support-op-1');
    support.grantSupport({ organizationId: orgA.orgId, operatorId: 'support-op-1', reason: 'help A', scope: ['inspect-live-session'] });
    support.grantSupport({ organizationId: orgB.orgId, operatorId: 'support-op-1', reason: 'help B', scope: ['inspect-live-session'] });

    const trailA = support.getAuditTrail(orgA.orgId);
    assert.ok(trailA.length > 0);
    assert.ok(trailA.every((e) => e.detail.organizationId === orgA.orgId));
});

/* ------------------------------------------------------------------ */
/* SUPPORT NEVER GRANTS ORGANIZATION AUTHORITY                         */
/* ------------------------------------------------------------------ */

test('a granted support session never creates an OrganizationMembership record for the operator', () => {
    const { orgRegistry, membership, identity, support } = freshEngines();
    const org = setupChurchWithAdmin(orgRegistry, membership);
    identity.setPlatformAdmin('support-op-1');
    support.grantSupport({ organizationId: org.orgId, operatorId: 'support-op-1', reason: 'help', scope: ['inspect-live-session'] });

    assert.equal(membership.hasMembership('support-op-1', org.orgId), false, 'granting support must never fabricate real organization membership for the operator');
});
