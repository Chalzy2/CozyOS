'use strict';

/**
 * core/modules/entitlement/tests/entitlement-engine.test.js
 *
 * Focused, real-path tests for the new EntitlementEngine. IdentityEngine
 * is the real source file, loaded fresh, never mocked — authorization
 * checks in these tests exercise the real checkPermission()/
 * isPlatformAdmin() logic. BillingEngine is represented by a minimal
 * test double attached directly to window.CozyOS.Billing, matching its
 * real, documented public surface (getSubscriptionSnapshot() /
 * isFeatureLicensed()) exactly — the real modules/billingEngine.js file
 * uses ES module import/export syntax and is not part of the IIFE
 * window.CozyOS.* load chain anything else in this test suite convention
 * loads via require(); it is not wired into any HTML entry point in the
 * repository today. The double exists only to exercise the *contract*
 * EntitlementEngine reads from Billing — it is not a second
 * implementation of billing logic.
 *
 * Run: node --test core/modules/entitlement/tests/entitlement-engine.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'identity', 'identity-engine.js');
const ENTITLEMENT_ENGINE_PATH = path.join(__dirname, '..', 'entitlement-engine.js');

function freshRequire(modPath) {
    delete require.cache[require.resolve(modPath)];
    require(modPath);
}

/** Installs a minimal, honest Billing double matching BillingEngine's real public surface. */
function installBillingDouble({ enforcing = true, planId = 'starter', licensedModules = [] } = {}) {
    window.CozyOS.Billing = {
        getSubscriptionSnapshot() {
            return { planId, isEnforcingActiveBilling: enforcing, licensedModules: licensedModules.slice() };
        },
        isFeatureLicensed(moduleId) {
            if (!enforcing) return true;
            return licensedModules.includes(moduleId);
        }
    };
}

function freshFullStack({ billing } = {}) {
    global.window = { CozyOS: {} };
    freshRequire(IDENTITY_ENGINE_PATH);
    if (billing !== null) installBillingDouble(billing || {});
    freshRequire(ENTITLEMENT_ENGINE_PATH);
    return {
        IE: global.window.CozyOS.IdentityEngine,
        ENT: global.window.CozyOS.Entitlement,
    };
}

async function makeAdmin(IE, orgId) {
    const res = await IE.createUser({ username: `admin_${Math.random().toString(36).slice(2, 10)}`, password: 'anything', orgId, roles: ['admin'] });
    assert.equal(res.available, true, 'test setup: admin creation must succeed');
    return res.userId;
}
async function makeStaff(IE, orgId) {
    const res = await IE.createUser({ username: `staff_${Math.random().toString(36).slice(2, 10)}`, password: 'anything', orgId, roles: ['staff'] });
    assert.equal(res.available, true, 'test setup: staff creation must succeed');
    return res.userId;
}
function makeOrg(IE, name) {
    // IdentityEngine.createOrganization() is synchronous and takes a plain
    // name string (its deprecated, Company-Engine-delegating standalone
    // fallback path — see identity-engine.js Rule 25). Returns {id, ...}.
    const org = IE.createOrganization(`${name}_${Math.random().toString(36).slice(2, 8)}`);
    return org.id;
}

// ── 1. Plan-licensed feature -> ENABLED ─────────────────────────────────────

test('getEffectiveState(): a plan-licensed feature with no override is ENABLED', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.calculations'] } });
    const org = makeOrg(IE, 'Acme Duka');

    const decision = ENT.getEffectiveState(org, 'mpesa.calculations');
    assert.equal(decision.enabled, true);
    assert.equal(decision.state, 'ENABLED');
    assert.equal(decision.source, 'PLAN');
});

// ── 2. Plan-unlicensed feature -> PLAN_RESTRICTED ───────────────────────────

test('getEffectiveState(): a feature excluded from the plan is PLAN_RESTRICTED, with an honest reason', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.calculations'] } });
    const org = makeOrg(IE, 'Acme Duka');

    const decision = ENT.getEffectiveState(org, 'mpesa.reports');
    assert.equal(decision.enabled, false);
    assert.equal(decision.state, 'PLAN_RESTRICTED');
    assert.equal(decision.source, 'PLAN');
    assert.equal(decision.reason, 'NOT_INCLUDED_IN_SUBSCRIPTION');
    assert.equal(decision.planId, 'starter');
});

// ── 3. Admin mute -> MUTED / ADMIN_DISABLED ─────────────────────────────────

test('setAdminOverride(): an authorized admin can mute a plan-licensed feature', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);

    const decision = ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED', reason: 'Customer requested calculations-only.' });
    assert.equal(decision.enabled, false);
    assert.equal(decision.state, 'MUTED');
    assert.equal(decision.source, 'ADMIN_OVERRIDE');

    assert.equal(ENT.isFeatureEnabled(org, 'mpesa.receipts'), false);
});

// ── 4. Admin unmute -> returns to plan-derived state ────────────────────────

test('clearAdminOverride(): unmuting a plan-licensed feature restores ENABLED', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);

    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED' });
    assert.equal(ENT.isFeatureEnabled(org, 'mpesa.receipts'), false);

    const decision = ENT.clearAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts' });
    assert.equal(decision.enabled, true);
    assert.equal(decision.state, 'ENABLED');
});

// ── 5. Unauthorized admin mutation rejected ─────────────────────────────────

test('setAdminOverride(): a non-admin actor is rejected', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const staff = await makeStaff(IE, org);

    assert.throws(
        () => ENT.setAdminOverride({ actorUserId: staff, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED' }),
        /does not hold "admin"/
    );
    assert.equal(ENT.isFeatureEnabled(org, 'mpesa.receipts'), true, 'the rejected mutation must not have taken effect');
});

// ── 6. Missing IdentityEngine fails closed ──────────────────────────────────

test('setAdminOverride(): fails closed when IdentityEngine is not available', () => {
    global.window = { CozyOS: {} };
    installBillingDouble({ enforcing: true, licensedModules: ['mpesa.receipts'] });
    freshRequire(ENTITLEMENT_ENGINE_PATH);
    const ENT = global.window.CozyOS.Entitlement;

    assert.throws(
        () => ENT.setAdminOverride({ actorUserId: 'someone', organizationId: 'org_1', feature: 'mpesa.receipts', state: 'MUTED' }),
        /IdentityEngine is not available/
    );
});

// ── 7. Missing BillingEngine does not fabricate entitlement ─────────────────

test('getEffectiveState(): missing BillingEngine reports an honest DEFAULT decision, never a fabricated plan restriction', async () => {
    const { IE, ENT } = freshFullStack({ billing: null });
    const org = makeOrg(IE, 'Acme Duka');

    const decision = ENT.getEffectiveState(org, 'mpesa.reports');
    assert.equal(decision.enabled, true);
    assert.equal(decision.state, 'ENABLED');
    assert.equal(decision.source, 'DEFAULT');
    assert.equal(decision.planId, null, 'must never invent a planId when BillingEngine is absent');
});

// ── 8. Organization isolation ───────────────────────────────────────────────

test('overrides are organization-scoped: org A cannot read or be affected by org B\'s override', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts'] } });
    const orgA = makeOrg(IE, 'Org A');
    const orgB = makeOrg(IE, 'Org B');
    const adminA = await makeAdmin(IE, orgA);

    ENT.setAdminOverride({ actorUserId: adminA, organizationId: orgA, feature: 'mpesa.receipts', state: 'MUTED' });

    assert.equal(ENT.isFeatureEnabled(orgA, 'mpesa.receipts'), false);
    assert.equal(ENT.isFeatureEnabled(orgB, 'mpesa.receipts'), true, 'org B must be unaffected by org A\'s override');
    assert.equal(ENT.getAdminOverride(orgB, 'mpesa.receipts'), null, 'org B must not see org A\'s override record');

    // adminA has no admin role scoped to orgB, and is not a platform admin.
    assert.throws(() => ENT.setAdminOverride({ actorUserId: adminA, organizationId: orgB, feature: 'mpesa.receipts', state: 'MUTED' }));
});

// ── 9. Direct service guard rejects muted feature ───────────────────────────

test('guard(): throws EntitlementDeniedError carrying the full decision when a feature is muted', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED' });

    assert.throws(() => ENT.guard(org, 'mpesa.receipts'), (err) => {
        assert.equal(err.name, 'EntitlementDeniedError');
        assert.equal(err.decision.state, 'MUTED');
        assert.equal(err.decision.feature, 'mpesa.receipts');
        return true;
    });
});

// ── 10. Unrelated feature remains enabled ───────────────────────────────────

test('guard(): muting one feature never affects an unrelated feature', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts', 'mpesa.calculations'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED' });

    assert.doesNotThrow(() => ENT.guard(org, 'mpesa.calculations'));
    assert.equal(ENT.isFeatureEnabled(org, 'mpesa.calculations'), true);
});

// ── 11. Required feature cannot be disabled ─────────────────────────────────

test('setAdminOverride(): a REQUIRED feature can never be muted, even by an authorized admin', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.transactions'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.registerRequiredFeature('mpesa.transactions');

    assert.throws(
        () => ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.transactions', state: 'ADMIN_DISABLED' }),
        /required feature/
    );
    const decision = ENT.getEffectiveState(org, 'mpesa.transactions');
    assert.equal(decision.state, 'REQUIRED');
    assert.equal(decision.enabled, true);
});

// ── 12. Audit provenance survives ───────────────────────────────────────────

test('getAuditLog(): records actor, organization, feature, previous/new state, and reason', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);

    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED', reason: 'Customer request' });

    const entries = ENT.getAuditLog(e => e.action === 'ADMIN_OVERRIDE_SET');
    assert.equal(entries.length, 1);
    const entry = entries[0];
    assert.equal(entry.actorUserId, admin);
    assert.equal(entry.organizationId, org);
    assert.equal(entry.feature, 'mpesa.receipts');
    assert.equal(entry.previousState, null);
    assert.equal(entry.newState, 'MUTED');
    assert.equal(entry.reason, 'Customer request');
    assert.ok(entry.timestamp);
});

// ── 13. entitlement-changed event is emitted ────────────────────────────────

test('PlatformEventBus: an entitlement:changed event is emitted on override mutation', async () => {
    global.window = { CozyOS: {} };
    freshRequire(IDENTITY_ENGINE_PATH);
    installBillingDouble({ enforcing: true, licensedModules: ['mpesa.receipts'] });
    freshRequire(path.join(__dirname, '..', '..', '..', 'shell', 'platform-event-bus.js'));
    freshRequire(ENTITLEMENT_ENGINE_PATH);
    const IE = global.window.CozyOS.IdentityEngine;
    const ENT = global.window.CozyOS.Entitlement;
    const bus = global.window.CozyOS.PlatformEventBus;

    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);

    let received = null;
    bus.on('entitlement:changed', (payload) => { received = payload; });

    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED', reason: 'test' });

    assert.ok(received, 'entitlement:changed must have been emitted on the shared PlatformEventBus');
    assert.equal(received.action, 'ADMIN_OVERRIDE_SET');
    assert.equal(received.feature, 'mpesa.receipts');
    assert.equal(received.organizationId, org);
});

// ── 14. Duplicate override handling ─────────────────────────────────────────

test('setAdminOverride(): setting the same override twice is idempotent and both mutations are audited', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);

    const first = ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED', reason: 'first' });
    const second = ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED', reason: 'second' });

    assert.equal(first.overrideId, second.overrideId, 'the same override record must be reused, not duplicated');
    assert.equal(ENT.getAuditLog(e => e.action === 'ADMIN_OVERRIDE_SET').length, 2, 'both mutations must be independently audited');
    assert.equal(ENT.listOrganizationOverrides(org).length, 1, 'the override store must not contain a duplicate entry');
});

// ── 15. Explainable effective-state result ──────────────────────────────────

test('getEffectiveState(): the decision object is fully explainable for every state', async () => {
    const { IE, ENT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.calculations'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.registerRequiredFeature('mpesa.core');
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.calculations', state: 'ADMIN_DISABLED', reason: 'temporary freeze' });

    const required = ENT.getEffectiveState(org, 'mpesa.core');
    const restricted = ENT.getEffectiveState(org, 'mpesa.reports');
    const disabled = ENT.getEffectiveState(org, 'mpesa.calculations');

    for (const decision of [required, restricted, disabled]) {
        assert.ok(decision.feature);
        assert.ok(decision.organizationId);
        assert.ok(decision.state);
        assert.ok(decision.source);
        assert.ok(decision.evaluatedAt);
        assert.ok('reason' in decision);
        assert.ok('planId' in decision);
        assert.ok('overrideId' in decision);
    }
    assert.equal(required.state, 'REQUIRED');
    assert.equal(restricted.state, 'PLAN_RESTRICTED');
    assert.equal(disabled.state, 'ADMIN_DISABLED');
    assert.equal(disabled.reason, 'temporary freeze');
});
