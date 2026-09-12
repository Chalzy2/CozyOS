'use strict';

/**
 * core/modules/entitlement/tests/organization-entitlement-bridge.test.js
 *
 * Focused, real-path tests for organization-entitlement-bridge.js.
 * OrganizationRegistry, PlatformEventBus, OrganizationMembership, and
 * IdentityEngine are the real source files, loaded fresh, never mocked.
 * BillingEngine is represented by the same minimal, honest test double
 * entitlement-engine.test.js already uses (getSubscriptionSnapshot()/
 * isFeatureLicensed()) — this suite does not re-implement billing logic
 * either.
 *
 * Run: node --test core/modules/entitlement/tests/organization-entitlement-bridge.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', '..', '..', 'organization', 'organization-registry.js');
const EVENTBUS_PATH = path.join(__dirname, '..', '..', '..', 'shell', 'platform-event-bus.js');
const MEMBERSHIP_PATH = path.join(__dirname, '..', '..', '..', 'organization', 'organization-membership.js');
const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'identity', 'identity-engine.js');
const ENTITLEMENT_ENGINE_PATH = path.join(__dirname, '..', 'entitlement-engine.js');
const BRIDGE_PATH = path.join(__dirname, '..', 'organization-entitlement-bridge.js');

function freshRequire(modPath) {
    delete require.cache[require.resolve(modPath)];
    require(modPath);
}

function installBillingDouble({ enforcing = true, planId = 'starter', licensedModules = [] } = {}) {
    global.window.CozyOS.Billing = {
        getSubscriptionSnapshot() { return { planId, isEnforcingActiveBilling: enforcing, licensedModules: licensedModules.slice() }; },
        isFeatureLicensed(moduleId) { if (!enforcing) return true; return licensedModules.includes(moduleId); },
    };
}

function freshWorld({ billing } = {}) {
    global.window = { CozyOS: {} };
    freshRequire(REGISTRY_PATH);
    freshRequire(EVENTBUS_PATH);
    freshRequire(MEMBERSHIP_PATH);
    freshRequire(IDENTITY_ENGINE_PATH);
    if (billing !== null) installBillingDouble(billing || {});
    freshRequire(ENTITLEMENT_ENGINE_PATH);
    freshRequire(BRIDGE_PATH);
    return {
        Registry: global.window.CozyOS.OrganizationRegistry,
        Membership: global.window.CozyOS.OrganizationMembership,
        IE: global.window.CozyOS.IdentityEngine,
        ENT: global.window.CozyOS.Entitlement,
        Bridge: global.window.CozyOS.OrganizationEntitlementBridge,
    };
}

function makeOrg(Registry, name) {
    return Registry.createOrganization({ name: `${name}_${Math.random().toString(36).slice(2, 8)}` }).orgId;
}

async function makeAdminActor(IE, Membership, orgId) {
    const res = await IE.createUser({ username: `admin_${Math.random().toString(36).slice(2, 10)}`, password: 'anything', roles: [] });
    const userId = res.userId;
    Membership.createMembership({ userId, organizationId: orgId, roles: ['admin'], status: 'active' });
    return userId;
}

// ── 1 & 2 & 3. Per-organization resolution, different state, no leakage ────

test('two organizations resolve independent effective state; a worker\'s state in one never leaks into another', async () => {
    const { Registry, Membership, IE, ENT, Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const orgB = makeOrg(Registry, 'Org B');
    const orgC = makeOrg(Registry, 'Org C');
    const adminB = await makeAdminActor(IE, Membership, orgB);

    Membership.createMembership({ userId: 'james', organizationId: orgB, applications: ['pos'], status: 'active' });
    Membership.createMembership({ userId: 'james', organizationId: orgC, applications: ['pos'], status: 'active' });

    // A real, authorized Org B admin mutes POS for James's Org B membership only.
    ENT.setAdminOverride({ actorUserId: adminB, organizationId: orgB, feature: 'pos', state: 'MUTED', reason: 'test' });

    const decisionB = Bridge.getEffectiveState({ userId: 'james', organizationId: orgB, applicationId: 'pos' });
    const decisionC = Bridge.getEffectiveState({ userId: 'james', organizationId: orgC, applicationId: 'pos' });

    assert.equal(decisionB.enabled, false, 'Org B: POS was muted for this organization');
    assert.equal(decisionB.state, 'MUTED');
    assert.equal(decisionC.enabled, true, 'Org C: unaffected by Org B\'s override — no leakage');
    assert.equal(decisionC.organizationId, orgC);
    assert.notEqual(decisionB.organizationId, decisionC.organizationId);
});

// ── 4. Unassigned application is denied ─────────────────────────────────────

test('an application not assigned to the worker is denied before EntitlementEngine is even consulted', () => {
    const { Registry, Membership, Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const org = makeOrg(Registry, 'Acme');
    Membership.createMembership({ userId: 'staffer', organizationId: org, applications: ['inventory'], status: 'active' });

    const decision = Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos' });
    assert.equal(decision.enabled, false);
    assert.equal(decision.state, 'APPLICATION_NOT_ASSIGNED');
});

// ── 5. Inactive membership is denied ────────────────────────────────────────

test('a suspended membership is denied regardless of a previously-assigned application', () => {
    const { Registry, Membership, Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const org = makeOrg(Registry, 'Acme');
    Membership.createMembership({ userId: 'staffer', organizationId: org, applications: ['pos'], status: 'active' });
    Membership.suspendMembership('staffer', org);

    const decision = Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos' });
    assert.equal(decision.enabled, false);
    assert.equal(decision.state, 'MEMBERSHIP_INACTIVE');
});

test('no membership at all is denied as NOT_A_MEMBER', () => {
    const { Registry, Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const org = makeOrg(Registry, 'Acme');
    const decision = Bridge.getEffectiveState({ userId: 'ghost', organizationId: org, applicationId: 'pos' });
    assert.equal(decision.enabled, false);
    assert.equal(decision.state, 'NOT_A_MEMBER');
});

// ── 6. Worker cannot elevate entitlement through client-side/role input ────

test('a worker holding every role/permission still cannot exceed the organization\'s effective entitlement', async () => {
    const { Registry, Membership, IE, ENT, Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const org = makeOrg(Registry, 'Acme');
    const admin = await makeAdminActor(IE, Membership, org);
    Membership.createMembership({ userId: 'staffer', organizationId: org, applications: ['pos'], roles: ['admin', 'owner', 'superuser'], permissions: ['pos:manage', 'pos:override'], status: 'active' });

    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'pos', state: 'ADMIN_DISABLED', reason: 'temporarily closed' });

    // Even though the worker's OWN membership record claims every role/permission,
    // the bridge never reads record.roles/permissions to raise the ceiling.
    const decision = Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos' });
    assert.equal(decision.enabled, false);
    assert.equal(decision.state, 'ADMIN_DISABLED');
});

// ── 7. Organization admin can manage worker assignment ──────────────────────

test('an organization admin can assign/remove a worker\'s application access, reflected immediately in the bridge', () => {
    const { Registry, Membership, Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const org = makeOrg(Registry, 'Acme');
    Membership.createMembership({ userId: 'staffer', organizationId: org, applications: [], status: 'active' });

    assert.equal(Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos' }).state, 'APPLICATION_NOT_ASSIGNED');

    Membership.assignApplication('staffer', org, 'pos'); // the real org-admin-facing API this milestone reuses, not duplicates
    assert.equal(Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos' }).enabled, true);

    Membership.removeApplication('staffer', org, 'pos');
    assert.equal(Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos' }).state, 'APPLICATION_NOT_ASSIGNED');
});

// ── 8. Organization admin cannot reach platform-level application authority ─

test('the bridge exposes no method that removes/mutes an application platform-wide; org-admin authority stays scoped to one worker\'s access', () => {
    const { Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const surface = Object.keys(Bridge);
    assert.deepEqual(surface.sort(), ['getEffectiveState', 'getVersion', 'guard', 'isEnabled'].sort());
    // No "removeApplicationFromPlatform" / "muteApplication" / similar exists on the bridge at all —
    // that authority remains solely the platform-admin path this milestone never touches.
});

// ── 9. Application-level disable cascades to features/functions ────────────

test('an application-level ADMIN_DISABLED cascades to every feature and function beneath it', async () => {
    const { Registry, Membership, IE, ENT, Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const org = makeOrg(Registry, 'Acme');
    const admin = await makeAdminActor(IE, Membership, org);
    Membership.createMembership({ userId: 'staffer', organizationId: org, applications: ['pos'], status: 'active' });

    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'pos', state: 'ADMIN_DISABLED', reason: 'closed for audit' });

    const feature = Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos', featureId: 'refunds' });
    const fn = Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos', featureId: 'refunds', functionId: 'issueRefund' });

    assert.equal(feature.enabled, false);
    assert.equal(feature.state, 'ADMIN_DISABLED');
    assert.match(feature.source, /^ENTITLEMENT_CASCADE\(pos\)$/);
    assert.equal(fn.enabled, false);
    assert.match(fn.source, /^ENTITLEMENT_CASCADE\(pos\)$/);
});

// ── 10. Required feature/function remains protected through the cascade ────

test('a REQUIRED function stays enabled even when its parent application is admin-disabled', async () => {
    const { Registry, Membership, IE, ENT, Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const org = makeOrg(Registry, 'Acme');
    const admin = await makeAdminActor(IE, Membership, org);
    Membership.createMembership({ userId: 'staffer', organizationId: org, applications: ['pos'], status: 'active' });

    ENT.registerRequiredFeature('pos.core.closeOfDay');
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'pos', state: 'ADMIN_DISABLED', reason: 'closed for audit' });

    const required = Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos', featureId: 'core', functionId: 'closeOfDay' });
    assert.equal(required.enabled, true);
    assert.equal(required.state, 'REQUIRED');
    assert.equal(required.required, true);

    // A sibling, non-required function under the same disabled app is still blocked.
    const notRequired = Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'pos', featureId: 'core', functionId: 'openTill' });
    assert.equal(notRequired.enabled, false);
});

// ── 11. Plan state remains owned by Billing/Entitlement, not fabricated ────

test('planState is read honestly from EntitlementEngine/Billing, never fabricated by the bridge', () => {
    const { Registry, Membership, Bridge } = freshWorld({ billing: { enforcing: true, planId: 'growth', licensedModules: [] } });
    const org = makeOrg(Registry, 'Acme');
    Membership.createMembership({ userId: 'staffer', organizationId: org, applications: ['reports'], status: 'active' });

    const decision = Bridge.getEffectiveState({ userId: 'staffer', organizationId: org, applicationId: 'reports' });
    assert.equal(decision.state, 'PLAN_RESTRICTED');
    assert.equal(decision.planState.planId, 'growth');
    assert.equal(decision.planState.restricted, true);
});

// ── Fail-closed on missing organization / missing dependencies ─────────────

test('getEffectiveState() throws (fails closed) when organizationId is missing', () => {
    const { Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    assert.throws(() => Bridge.getEffectiveState({ userId: 'staffer', applicationId: 'pos' }), TypeError);
});

test('guard() throws OrgEntitlementBridgeDeniedError carrying the full decision on denial', () => {
    const { Registry, Bridge } = freshWorld({ billing: { enforcing: true, licensedModules: ['pos'] } });
    const org = makeOrg(Registry, 'Acme');
    assert.throws(
        () => Bridge.guard({ userId: 'ghost', organizationId: org, applicationId: 'pos' }),
        (err) => err.name === 'OrgEntitlementBridgeDeniedError' && err.decision.state === 'NOT_A_MEMBER'
    );
});
