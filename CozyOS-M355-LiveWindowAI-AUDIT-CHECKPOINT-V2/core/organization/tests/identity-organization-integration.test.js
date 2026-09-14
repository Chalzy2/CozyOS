'use strict';

/**
 * core/organization/tests/identity-organization-integration.test.js
 *
 * Milestone A regression suite. Proves the exact 9 properties the
 * Milestone A specification requires before IdentityEngine's additive
 * checkPermission() change can be considered safe:
 *
 *   1. Existing single-organization behavior remains compatible.
 *   2. A user can belong to multiple organizations.
 *   3. Organization B cannot authorize Organization C permissions.
 *   4. Organization B cannot see Organization C membership/business data.
 *   5. Roles are organization-specific.
 *   6. Application assignments are organization-specific.
 *   7. Platform-admin authority remains separate.
 *   8. Organization admins cannot globally remove/mute applications.
 *   9. Worker application/function restrictions remain enforceable at the
 *      service boundary.
 *
 * IdentityEngine and OrganizationRegistry/OrganizationMembership are the
 * real source files, loaded fresh, never mocked.
 *
 * Run: node --test core/organization/tests/identity-organization-integration.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js');
const REGISTRY_PATH = path.join(__dirname, '..', 'organization-registry.js');
const MEMBERSHIP_PATH = path.join(__dirname, '..', 'organization-membership.js');

function freshRequire(modPath) {
    delete require.cache[require.resolve(modPath)];
    require(modPath);
}

/** Identity-only stack — mirrors entitlement-engine.test.js's freshFullStack() exactly, with no OrganizationMembership loaded at all. */
function freshIdentityOnlyWorld() {
    global.window = { CozyOS: {} };
    freshRequire(IDENTITY_ENGINE_PATH);
    return { IE: global.window.CozyOS.IdentityEngine };
}

/** Full stack — IdentityEngine + OrganizationRegistry + OrganizationMembership, the Milestone A target configuration. */
function freshFullWorld() {
    global.window = { CozyOS: {} };
    freshRequire(IDENTITY_ENGINE_PATH);
    freshRequire(REGISTRY_PATH);
    freshRequire(MEMBERSHIP_PATH);
    return {
        IE: global.window.CozyOS.IdentityEngine,
        Registry: global.window.CozyOS.OrganizationRegistry,
        Membership: global.window.CozyOS.OrganizationMembership,
    };
}

function makeOrg(Registry, name) {
    return Registry.createOrganization({ name: `${name}_${Math.random().toString(36).slice(2, 8)}` }).orgId;
}

/**
 * makeUser() — orgId here (when passed) must be a real org IdentityEngine
 * itself recognizes, i.e. one created through IE.createOrganization()
 * (its own internal store, entirely separate from OrganizationRegistry —
 * confirmed by reading identity-engine.js's createUser() validation
 * before writing these tests). Multi-organization tests below
 * deliberately create users with orgId: null — this is the real point
 * of Milestone A: a user's actual cross-organization authority now lives
 * in OrganizationMembership, and the legacy single orgId field is no
 * longer required to represent it (see the file header's "must NOT
 * remain an enforcement boundary" directive).
 */
async function makeUser(IE, { orgId = null, roles = [] } = {}) {
    const res = await IE.createUser({ username: `u_${Math.random().toString(36).slice(2, 10)}`, password: 'anything', orgId, roles });
    assert.equal(res.available, true, 'test setup: user creation must succeed');
    return res.userId;
}

// ── 1. Existing single-organization behavior remains compatible ─────────────

test('REGRESSION 1: without OrganizationMembership loaded, checkPermission(userId, role, {orgId}) behaves exactly as before', async () => {
    const { IE } = freshIdentityOnlyWorld();
    const org = IE.createOrganization('Acme Duka').id;
    const otherOrg = IE.createOrganization('Other Duka').id;
    const admin = await makeUser(IE, { orgId: org, roles: ['admin'] });

    assert.equal(IE.checkPermission(admin, 'admin', { orgId: org }), true, 'same-org legacy check must still allow');
    assert.equal(IE.checkPermission(admin, 'admin', { orgId: otherOrg }), false, 'legacy user.orgId mismatch must still deny, exactly as before');
    assert.equal(IE.checkPermission(admin, 'admin'), true, 'no-orgId platform-wide check is untouched');
});

// ── 2. A user can belong to multiple organizations ───────────────────────────

test('REGRESSION 2: a user can hold real, independent authority in more than one organization', async () => {
    const { IE, Registry, Membership } = freshFullWorld();
    const orgB = makeOrg(Registry, 'Organization B');
    const orgC = makeOrg(Registry, 'Organization C');
    // USER-456's legacy IdentityEngine record has a single, unchanged
    // orgId field (left null here — see makeUser()'s own comment) —
    // proving the multi-org fact does NOT depend on that field being
    // changed, duplicated, or repointed on every organization switch.
    const james = await makeUser(IE, { roles: [] });

    Membership.createMembership({ userId: james, organizationId: orgB, roles: ['cashier'] });
    Membership.createMembership({ userId: james, organizationId: orgC, roles: ['owner', 'admin'] });

    assert.equal(IE.checkPermission(james, 'cashier', { orgId: orgB }), true, 'James is a cashier in B');
    assert.equal(IE.checkPermission(james, 'admin', { orgId: orgC }), true, 'James is ALSO an admin/owner in C, despite user.orgId never being repointed at either');
});

// ── 3. Organization B cannot authorize Organization C permissions ───────────

test('REGRESSION 3: Organization B never authorizes a role/permission only granted in Organization C', async () => {
    const { IE, Registry, Membership } = freshFullWorld();
    const orgB = makeOrg(Registry, 'Organization B');
    const orgC = makeOrg(Registry, 'Organization C');
    const james = await makeUser(IE);
    Membership.createMembership({ userId: james, organizationId: orgB, roles: ['cashier'] });
    Membership.createMembership({ userId: james, organizationId: orgC, roles: ['owner'] });

    assert.equal(IE.checkPermission(james, 'owner', { orgId: orgB }), false, 'B must not authorize C\'s "owner" grant');
    assert.equal(IE.checkPermission(james, 'owner', { orgId: orgC }), true);
});

// ── 4. Organization B cannot see Organization C membership/business data ────

test('REGRESSION 4: listing Organization B\'s members never includes Organization C\'s membership records', async () => {
    const { IE, Registry, Membership } = freshFullWorld();
    const orgB = makeOrg(Registry, 'Organization B');
    const orgC = makeOrg(Registry, 'Organization C');
    const james = await makeUser(IE);
    const otherC = await makeUser(IE);
    Membership.createMembership({ userId: james, organizationId: orgB, roles: ['cashier'] });
    Membership.createMembership({ userId: james, organizationId: orgC, roles: ['owner'] });
    Membership.createMembership({ userId: otherC, organizationId: orgC, roles: ['staff'] });

    const membersB = Membership.listOrganizationMembers(orgB);
    assert.equal(membersB.length, 1);
    assert.equal(membersB[0].userId, james);
    assert.ok(!membersB.some(m => m.userId === otherC), 'Organization C\'s own member must never appear in B\'s list');
});

// ── 5. Roles are organization-specific ───────────────────────────────────────

test('REGRESSION 5: the same user\'s role in one organization has no bearing on their role in another', async () => {
    const { IE, Registry, Membership } = freshFullWorld();
    const orgB = makeOrg(Registry, 'Organization B');
    const orgC = makeOrg(Registry, 'Organization C');
    const james = await makeUser(IE);
    Membership.createMembership({ userId: james, organizationId: orgB, roles: ['cashier'] });
    Membership.createMembership({ userId: james, organizationId: orgC, roles: ['owner', 'admin'] });

    assert.deepEqual(Membership.getMembership(james, orgB).roles, ['cashier']);
    assert.deepEqual(Membership.getMembership(james, orgC).roles, ['owner', 'admin']);
});

// ── 6. Application assignments are organization-specific ────────────────────

test('REGRESSION 6: MpesaOS access assigned to James in Organization C does not appear in his Organization B membership', async () => {
    const { IE, Registry, Membership } = freshFullWorld();
    const orgB = makeOrg(Registry, 'Organization B');
    const orgC = makeOrg(Registry, 'Organization C');
    const james = await makeUser(IE);
    Membership.createMembership({ userId: james, organizationId: orgB, roles: ['cashier'] });
    Membership.createMembership({ userId: james, organizationId: orgC, roles: ['owner'] });

    Membership.assignApplication(james, orgB, 'MpesaOS'); // limited functions, per the milestone's own diagram
    Membership.assignApplication(james, orgC, 'MpesaOS'); // different/full functions

    assert.deepEqual(Membership.getMembership(james, orgB).applications, ['MpesaOS']);
    assert.deepEqual(Membership.getMembership(james, orgC).applications, ['MpesaOS']);
    Membership.removeApplication(james, orgB, 'MpesaOS');
    assert.deepEqual(Membership.getMembership(james, orgB).applications, [], 'removing B\'s assignment must not touch C\'s');
    assert.deepEqual(Membership.getMembership(james, orgC).applications, ['MpesaOS']);
});

// ── 7. Platform-admin authority remains separate ─────────────────────────────

test('REGRESSION 7: platform-admin authority is untouched by OrganizationMembership and requires no orgId', async () => {
    const { IE } = freshFullWorld(); // OrganizationMembership IS loaded here
    const platformAdmin = await makeUser(IE, { roles: ['platform-admin'] });
    const ordinaryUser = await makeUser(IE, { roles: [] });

    assert.equal(IE.isPlatformAdmin(platformAdmin), true);
    assert.equal(IE.isPlatformAdmin(ordinaryUser), false);
});

// ── 8. Organization admins cannot globally remove/mute applications ─────────

test('REGRESSION 8: OrganizationMembership exposes no capability to remove/mute an application platform-wide or for other members', async () => {
    const { Registry, Membership } = freshFullWorld();
    void Registry;
    // Structural check: the only application-affecting methods this file
    // exposes are scoped to (userId, organizationId, applicationId) —
    // there is no organization-wide or platform-wide "remove application"
    // entry point at all.
    assert.equal(typeof Membership.removeApplication, 'function');
    assert.equal(Membership.removeApplication.length, 3, 'removeApplication() only ever takes (userId, organizationId, applicationId) — never a bare applicationId with organization- or platform-wide effect');
    assert.equal(typeof Membership.muteApplication, 'undefined');
    assert.equal(typeof Membership.removeApplicationGlobally, 'undefined');

    const org = makeOrg(Registry, 'Organization B');
    Membership.createMembership({ userId: 'WORKER-1', organizationId: org });
    Membership.createMembership({ userId: 'WORKER-2', organizationId: org });
    Membership.assignApplication('WORKER-1', org, 'MpesaOS');
    Membership.assignApplication('WORKER-2', org, 'MpesaOS');

    Membership.removeApplication('WORKER-1', org, 'MpesaOS');
    assert.deepEqual(Membership.getMembership('WORKER-2', org).applications, ['MpesaOS'], 'removing one worker\'s access must never affect another worker\'s access to the same application');
});

// ── 9. Worker application/function restrictions remain enforceable at the service boundary ─

test('REGRESSION 9: a service boundary using IdentityEngine.checkPermission(userId, role, {orgId}) correctly grants full functions to an org owner and denies them to a limited-function cashier in a different organization', async () => {
    const { IE, Registry, Membership } = freshFullWorld();
    const orgB = makeOrg(Registry, 'Organization B');
    const orgC = makeOrg(Registry, 'Organization C');
    const james = await makeUser(IE);

    Membership.createMembership({ userId: james, organizationId: orgB, roles: ['cashier'] });
    Membership.grantPermission(james, orgB, 'mpesaos:limited-functions');

    Membership.createMembership({ userId: james, organizationId: orgC, roles: ['owner'] });
    Membership.grantPermission(james, orgC, 'mpesaos:full-functions');

    // Simulated MpesaOS-style service boundary check (mirrors
    // core/modules/MpesaOS/mpesaos.js's own real
    // IdentityEngine.checkPermission() defense-in-depth pattern).
    function mpesaosCanUseFullFunctions(userId, orgId) {
        return IE.checkPermission(userId, 'mpesaos:full-functions', { orgId });
    }
    function mpesaosCanUseLimitedFunctions(userId, orgId) {
        return IE.checkPermission(userId, 'mpesaos:limited-functions', { orgId });
    }

    assert.equal(mpesaosCanUseLimitedFunctions(james, orgB), true, 'cashier in B gets limited functions');
    assert.equal(mpesaosCanUseFullFunctions(james, orgB), false, 'cashier in B must NOT get full functions');
    assert.equal(mpesaosCanUseFullFunctions(james, orgC), true, 'owner in C gets full functions');
    assert.equal(mpesaosCanUseLimitedFunctions(james, orgC), false, 'C never granted the limited-functions permission at all');

    // And once suspended in B, the service boundary denies him there too —
    // even though he remains a fully active owner in C.
    Membership.suspendMembership(james, orgB);
    assert.equal(mpesaosCanUseLimitedFunctions(james, orgB), false, 'suspension in B must deny at the service boundary');
    assert.equal(mpesaosCanUseFullFunctions(james, orgC), true, 'C is unaffected by B\'s suspension');
});
