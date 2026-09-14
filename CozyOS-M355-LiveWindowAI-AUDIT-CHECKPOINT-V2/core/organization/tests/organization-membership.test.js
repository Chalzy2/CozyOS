'use strict';

/**
 * core/organization/tests/organization-membership.test.js
 *
 * Focused, real-path tests for core/organization/organization-membership.js
 * (Milestone A). OrganizationRegistry and PlatformEventBus are the real
 * source files, loaded fresh, never mocked — this exercises the real
 * fail-closed organization-existence check and the real shared event bus,
 * exactly like the sibling organization-role-extension test does for its
 * own dependency (OrganizationRegistry).
 *
 * Run: node --test core/organization/tests/organization-membership.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', 'organization-registry.js');
const EVENTBUS_PATH = path.join(__dirname, '..', '..', 'shell', 'platform-event-bus.js');
const MEMBERSHIP_PATH = path.join(__dirname, '..', 'organization-membership.js');

function freshRequire(modPath) {
    delete require.cache[require.resolve(modPath)];
    require(modPath);
}

function freshWorld({ withEventBus = true } = {}) {
    global.window = { CozyOS: {} };
    freshRequire(REGISTRY_PATH);
    if (withEventBus) freshRequire(EVENTBUS_PATH);
    freshRequire(MEMBERSHIP_PATH);
    return {
        Registry: global.window.CozyOS.OrganizationRegistry,
        Membership: global.window.CozyOS.OrganizationMembership,
        Bus: global.window.CozyOS.PlatformEventBus,
    };
}

function makeOrg(Registry, name) {
    return Registry.createOrganization({ name: `${name}_${Math.random().toString(36).slice(2, 8)}` }).orgId;
}

// ── 1. Fail-closed against a nonexistent organization ───────────────────────

test('createMembership(): refuses a nonexistent organizationId', () => {
    const { Membership } = freshWorld();
    assert.throws(
        () => Membership.createMembership({ userId: 'USER-1', organizationId: 'org_does_not_exist' }),
        /no real organization/
    );
});

test('invite(): refuses a nonexistent organizationId', () => {
    const { Registry, Membership } = freshWorld();
    void Registry;
    assert.throws(
        () => Membership.invite({ userId: 'USER-1', organizationId: 'org_does_not_exist', invitedBy: 'ADMIN' }),
        /no real organization/
    );
});

// ── 2. createMembership() / getMembership() round trip ──────────────────────

test('createMembership(): round trips through getMembership() as active by default', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');

    const created = Membership.createMembership({ userId: 'USER-1', organizationId: org, roles: ['cashier'] });
    assert.equal(created.status, 'active');
    assert.deepEqual(created.roles, ['cashier']);

    const fetched = Membership.getMembership('USER-1', org);
    assert.equal(fetched.membershipId, created.membershipId);
    assert.equal(fetched.userId, 'USER-1');
    assert.equal(fetched.organizationId, org);
});

test('createMembership(): refuses a duplicate live membership for the same userId+organizationId', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    Membership.createMembership({ userId: 'USER-1', organizationId: org });
    assert.throws(
        () => Membership.createMembership({ userId: 'USER-1', organizationId: org }),
        /already has a live membership/
    );
});

// ── 3. Invitation lifecycle ──────────────────────────────────────────────────

test('invite() -> acceptInvitation(): an invited membership authorizes nothing until accepted', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');

    Membership.invite({ userId: 'USER-1', organizationId: org, invitedBy: 'OWNER-1', roles: ['cashier'] });
    assert.equal(Membership.getMembership('USER-1', org).status, 'invited');
    assert.equal(Membership.isAuthorized('USER-1', org, 'cashier'), false, 'invited-but-not-yet-accepted must not authorize');

    const accepted = Membership.acceptInvitation('USER-1', org);
    assert.equal(accepted.status, 'active');
    assert.equal(Membership.isAuthorized('USER-1', org, 'cashier'), true, 'active membership with the role now authorizes it');
});

test('declineInvitation(): a declined invitation never authorizes and cannot be accepted afterwards', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    Membership.invite({ userId: 'USER-1', organizationId: org, invitedBy: 'OWNER-1' });

    const declined = Membership.declineInvitation('USER-1', org);
    assert.equal(declined.status, 'declined');
    assert.throws(() => Membership.acceptInvitation('USER-1', org), /not "invited"/);
});

test('expireInvitation(): an expired invitation cannot be accepted', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    Membership.invite({ userId: 'USER-1', organizationId: org, invitedBy: 'OWNER-1' });
    Membership.expireInvitation('USER-1', org);
    assert.equal(Membership.getMembership('USER-1', org).status, 'expired');
    assert.throws(() => Membership.acceptInvitation('USER-1', org), /not "invited"/);
});

test('acceptInvitation(): refuses an invitation past its own expiresAt, even without an explicit expireInvitation() call', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    const past = new Date(Date.now() - 1000).toISOString();
    Membership.invite({ userId: 'USER-1', organizationId: org, invitedBy: 'OWNER-1', expiresAt: past });
    assert.throws(() => Membership.acceptInvitation('USER-1', org), /expired at/);
});

test('revokeInvitation(): an admin can revoke a pending invitation before it is answered', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    Membership.invite({ userId: 'USER-1', organizationId: org, invitedBy: 'OWNER-1' });
    const revoked = Membership.revokeInvitation('USER-1', org);
    assert.equal(revoked.status, 'revoked');
    assert.throws(() => Membership.acceptInvitation('USER-1', org), /not "invited"/);
});

// ── 4. Suspend / reactivate / remove — deny-over-allow ───────────────────────

test('suspendMembership(): denies authorization even though roles/permissions remain on the record; reactivateMembership() restores it', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    Membership.createMembership({ userId: 'USER-1', organizationId: org, roles: ['cashier'] });
    assert.equal(Membership.isAuthorized('USER-1', org, 'cashier'), true);

    const suspended = Membership.suspendMembership('USER-1', org);
    assert.equal(suspended.status, 'suspended');
    assert.deepEqual(suspended.roles, ['cashier'], 'roles are preserved, not stripped, on suspension');
    assert.equal(Membership.isAuthorized('USER-1', org, 'cashier'), false, 'deny-over-allow: suspended status wins over a still-present role');

    const reactivated = Membership.reactivateMembership('USER-1', org);
    assert.equal(reactivated.status, 'active');
    assert.equal(Membership.isAuthorized('USER-1', org, 'cashier'), true);
});

test('removeMembership(): terminal — denies authorization permanently and cannot be reactivated', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    Membership.createMembership({ userId: 'USER-1', organizationId: org, roles: ['owner'] });

    const removed = Membership.removeMembership('USER-1', org);
    assert.equal(removed.status, 'removed');
    assert.equal(Membership.isAuthorized('USER-1', org, 'owner'), false);
    assert.throws(() => Membership.reactivateMembership('USER-1', org), /not "suspended"/);
});

// ── 5. Organization-specific roles / applications / permissions ─────────────

test('assignRole()/removeRole(): mutate only this membership\'s own role list', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    Membership.createMembership({ userId: 'USER-1', organizationId: org });
    Membership.assignRole('USER-1', org, 'cashier');
    assert.deepEqual(Membership.getMembership('USER-1', org).roles, ['cashier']);
    Membership.removeRole('USER-1', org, 'cashier');
    assert.deepEqual(Membership.getMembership('USER-1', org).roles, []);
});

test('assignApplication()/removeApplication(): worker-access only — removing one member\'s app assignment never touches another member\'s assignment of the same app', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    Membership.createMembership({ userId: 'USER-1', organizationId: org });
    Membership.createMembership({ userId: 'USER-2', organizationId: org });
    Membership.assignApplication('USER-1', org, 'MpesaOS');
    Membership.assignApplication('USER-2', org, 'MpesaOS');

    Membership.removeApplication('USER-1', org, 'MpesaOS');
    assert.deepEqual(Membership.getMembership('USER-1', org).applications, []);
    assert.deepEqual(Membership.getMembership('USER-2', org).applications, ['MpesaOS'], 'USER-2 must be unaffected — this is worker-access scoping, never a global mute');
});

test('grantPermission(): validates the real resource:action format and rejects malformed strings', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    Membership.createMembership({ userId: 'USER-1', organizationId: org });
    assert.throws(() => Membership.grantPermission('USER-1', org, 'not-a-permission'), /resource:action/);
    Membership.grantPermission('USER-1', org, 'mpesaos:full-access');
    assert.equal(Membership.isAuthorized('USER-1', org, 'mpesaos:full-access'), true);
    Membership.revokePermission('USER-1', org, 'mpesaos:full-access');
    assert.equal(Membership.isAuthorized('USER-1', org, 'mpesaos:full-access'), false);
});

// ── 6. Organization isolation ────────────────────────────────────────────────

test('organization isolation: the same user can hold different roles in different organizations, with no cross-organization leakage', () => {
    const { Registry, Membership } = freshWorld();
    const orgB = makeOrg(Registry, 'Organization B');
    const orgC = makeOrg(Registry, 'Organization C');

    Membership.createMembership({ userId: 'USER-456', organizationId: orgB, roles: ['cashier'] });
    Membership.createMembership({ userId: 'USER-456', organizationId: orgC, roles: ['owner'] });

    assert.equal(Membership.isAuthorized('USER-456', orgB, 'owner'), false, 'B must not authorize a role only granted in C');
    assert.equal(Membership.isAuthorized('USER-456', orgC, 'owner'), true);
    assert.equal(Membership.isAuthorized('USER-456', orgB, 'cashier'), true);
    assert.equal(Membership.isAuthorized('USER-456', orgC, 'cashier'), false, 'C must not authorize a role only granted in B');
});

test('listOrganizationMembers(): scoped to exactly one organization, never leaks another organization\'s members', () => {
    const { Registry, Membership } = freshWorld();
    const orgB = makeOrg(Registry, 'Organization B');
    const orgC = makeOrg(Registry, 'Organization C');
    Membership.createMembership({ userId: 'USER-1', organizationId: orgB });
    Membership.createMembership({ userId: 'USER-2', organizationId: orgC });

    const membersB = Membership.listOrganizationMembers(orgB);
    assert.equal(membersB.length, 1);
    assert.equal(membersB[0].userId, 'USER-1');
});

test('listUserOrganizations(): returns every organization one user belongs to', () => {
    const { Registry, Membership } = freshWorld();
    const orgB = makeOrg(Registry, 'Organization B');
    const orgC = makeOrg(Registry, 'Organization C');
    Membership.createMembership({ userId: 'USER-456', organizationId: orgB, roles: ['cashier'] });
    Membership.createMembership({ userId: 'USER-456', organizationId: orgC, roles: ['owner'] });

    const orgs = Membership.listUserOrganizations('USER-456').map(m => m.organizationId).sort();
    assert.deepEqual(orgs, [orgB, orgC].sort());
});

// ── 7. Audit provenance + PlatformEventBus events ────────────────────────────

test('membership changes are recorded through OrganizationRegistry\'s real shared history', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    const created = Membership.createMembership({ userId: 'USER-1', organizationId: org });
    Membership.suspendMembership('USER-1', org);

    const history = Registry.getHistory({ entityType: 'membership', entityId: created.membershipId });
    const actions = history.map(h => h.action);
    assert.ok(actions.includes('membership-created'));
    assert.ok(actions.includes('membership-suspended'));
});

test('membership changes emit real PlatformEventBus events', () => {
    // NOTE (discovered, not introduced by this file): when
    // OrganizationRegistry IS loaded, #record() correctly goes through
    // its real recordExternalHistory() door (see the "audit provenance"
    // test above for the full detail that lands in getHistory()) —
    // but OrganizationRegistry's own #recordHistory() only re-emits
    // {entityType, entityId} on PlatformEventBus, not the full detail
    // object. That is pre-existing behavior of the shared mechanism
    // this file reuses (organization-role.js's own emitted events carry
    // the same, narrower shape) — not something this milestone's scope
    // includes changing. This test asserts the real, current shape.
    const { Registry, Membership, Bus } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    const seen = [];
    Bus.on('organization:membership-role-assigned', (payload) => seen.push(payload));

    const created = Membership.createMembership({ userId: 'USER-1', organizationId: org });
    Membership.assignRole('USER-1', org, 'cashier');

    assert.equal(seen.length, 1);
    assert.equal(seen[0].entityType, 'membership');
    assert.equal(seen[0].entityId, created.membershipId);
});

// ── 8. Deny-over-allow / default deny for unknown pairs ──────────────────────

test('isAuthorized(): denies for a userId+organizationId pair with no membership at all', () => {
    const { Registry, Membership } = freshWorld();
    const org = makeOrg(Registry, 'Acme Duka');
    assert.equal(Membership.isAuthorized('USER-NEVER-INVITED', org, 'owner'), false);
});
