'use strict';

/**
 * core/plugins/tests/mpesaOS-float-entitlement.test.js
 *
 * Focused, real-path regression tests for the Entitlement.guard()
 * integration added to the LIVE MpesaOS float owner
 * (core/plugins/mpesaOS-float.js — window.CozyOS.MpesaFloat).
 *
 * OWNERSHIP AUDIT (confirmed before this test was written): this file
 * is the canonical, actually-loaded float coordinator — referenced by
 * <script src="core/plugins/mpesaOS-float.js"> in
 * core/shell/cozy-shell.html, core/cozy-shell.html, and
 * admin-workspace.html, and listed in
 * core/platform/discovery-manifest.json and
 * docs/builder/knowledge/module-inventory.json. No other file in the
 * repository implements agent float tracking; no second float engine
 * was created for this integration.
 *
 * Real IdentityEngine and real EntitlementEngine are loaded fresh from
 * disk, never mocked. BillingEngine and Company are represented by
 * small, honest in-memory doubles matching their real documented
 * contracts, since neither coordinator is ES-module-requirable outside
 * a browser context (the same constraint entitlement-engine.test.js
 * and mpesaOS-reporting-entitlement.test.js document).
 *
 * This suite touches ONLY core/plugins/mpesaOS-float.js. It does not
 * exercise, mock, or assert on receipts, reports, transactions,
 * calculations, or any other coordinator. recordTransactionImpact()
 * is deliberately exercised as UNGUARDED (see file header on
 * mpesaOS-float.js for the Rule 9 transaction-integrity rationale) —
 * test 8 below is the regression proof for that.
 *
 * Run: node --test core/plugins/tests/mpesaOS-float-entitlement.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js');
const ENTITLEMENT_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'entitlement', 'entitlement-engine.js');
const MPESA_FLOAT_PATH = path.join(__dirname, '..', 'mpesaOS-float.js');

function freshRequire(modPath) {
    delete require.cache[require.resolve(modPath)];
    require(modPath);
}

function installBillingDouble({ enforcing = true, licensedModules = [] } = {}) {
    window.CozyOS.Billing = {
        getSubscriptionSnapshot() {
            return { planId: 'starter', isEnforcingActiveBilling: enforcing, licensedModules: licensedModules.slice() };
        },
        isFeatureLicensed(moduleId) {
            if (!enforcing) return true;
            return licensedModules.includes(moduleId);
        }
    };
}

/** Small, honest double for window.CozyOS.Company — the exact real contract MpesaFloat's #validateCompanyBranch reads. */
function installCompanyDouble() {
    window.CozyOS.Company = {
        getCompany(companyId) { return companyId === 'company_1' ? { id: 'company_1', name: 'Acme Duka' } : null; },
        listBranches(companyId) { return companyId === 'company_1' ? [{ branchId: 'branch_1' }] : []; }
    };
}

function freshFullStack({ billing } = {}) {
    global.window = { CozyOS: {}, addEventListener() { /* no-op: no real DOM in this test process */ } };
    freshRequire(IDENTITY_ENGINE_PATH);
    if (billing !== null) installBillingDouble(billing || {});
    freshRequire(ENTITLEMENT_ENGINE_PATH);
    installCompanyDouble();
    freshRequire(MPESA_FLOAT_PATH);
    return {
        IE: global.window.CozyOS.IdentityEngine,
        ENT: global.window.CozyOS.Entitlement,
        FLOAT: global.window.CozyOS.MpesaFloat
    };
}

async function makeAdmin(IE, orgId) {
    const res = await IE.createUser({ username: `admin_${Math.random().toString(36).slice(2, 10)}`, password: 'anything', orgId, roles: ['admin'] });
    assert.equal(res.available, true, 'test setup: admin creation must succeed');
    return res.userId;
}
function makeOrg(IE, name) {
    const org = IE.createOrganization(`${name}_${Math.random().toString(36).slice(2, 8)}`);
    return org.id;
}

// ── 1. Float ENABLED (licensed, no override) -> real purchase recorded ─────

test('float ENABLED (licensed, no override): purchaseFloat records a real movement', async () => {
    const { IE, FLOAT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.float', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');

    const result = FLOAT.purchaseFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 5000, source: 'Safaricom Dealer', organizationId: org });

    assert.equal(result.available, undefined, 'a successful purchase keeps its existing return shape (no available:false marker)');
    assert.equal(result.type, 'purchase');
    assert.equal(result.amount, 5000);
    assert.equal(FLOAT.getCurrentFloat('company_1', 'branch_1'), 5000);
});

// ── 2. Float MUTED by admin override -> fails closed, balance untouched ────

test('float MUTED (admin override on mpesa.float): purchaseFloat is blocked, balance never moves', async () => {
    const { IE, ENT, FLOAT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.float', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.float', state: 'MUTED', reason: 'Customer muted float management.' });

    const result = FLOAT.purchaseFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 5000, source: 'Safaricom Dealer', organizationId: org });

    assert.equal(result.available, false);
    assert.equal(result.state, 'MUTED');
    assert.equal(FLOAT.getCurrentFloat('company_1', 'branch_1'), 0, 'a blocked purchase must never move the tracked balance');
});

// ── 3. Float PLAN_RESTRICTED (not licensed) -> fails closed ────────────────

test('float PLAN_RESTRICTED (mpesa.float not licensed): adjustFloat is blocked', async () => {
    const { IE, FLOAT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa'] /* mpesa.float deliberately absent */ } });
    const org = makeOrg(IE, 'Acme Duka');

    const result = FLOAT.adjustFloat({ companyId: 'company_1', branchId: 'branch_1', amount: -500, reason: 'Till shortage', organizationId: org });

    assert.equal(result.available, false);
    assert.equal(result.state, 'PLAN_RESTRICTED');
});

// ── 4. APPLICATION-level ADMIN_DISABLED cascades to the float FUNCTION ─────

test('APPLICATION "mpesa" ADMIN_DISABLED: reconcileFloat unavailable even though "mpesa.float" itself has no override', async () => {
    const { IE, ENT, FLOAT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.float', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa', state: 'ADMIN_DISABLED', reason: 'Application suspended.' });

    const result = FLOAT.reconcileFloat({ companyId: 'company_1', branchId: 'branch_1', actualFloat: 4500, organizationId: org });

    assert.equal(result.available, false, 'application-level disablement must cascade to the float function');
    assert.equal(result.state, 'ADMIN_DISABLED');
});

// ── 5. Entitlement engine completely unavailable -> fails closed ───────────

test('Entitlement engine unavailable: purchaseFloat fails closed rather than silently recording', async () => {
    const { FLOAT } = freshFullStack({ billing: null });
    delete global.window.CozyOS.Entitlement; // simulate Entitlement never having loaded

    const result = FLOAT.purchaseFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 1000, source: 'Bank Transfer', organizationId: 'org_no_entitlement' });

    assert.equal(result.available, false);
    assert.equal(result.state, 'UNAVAILABLE');
});

// ── 6. Missing organizationId -> fails closed honestly, never a silent bypass ─

test('missing organizationId: adjustFloat is blocked rather than silently defaulting to enabled', async () => {
    const { IE, FLOAT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.float', 'mpesa'] } });
    makeOrg(IE, 'Acme Duka'); // an org exists, but is never passed in below

    const result = FLOAT.adjustFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 200, reason: 'Reconciliation top-up' });

    assert.equal(result.available, false);
    assert.equal(result.state, 'UNAVAILABLE');
});

// ── 7. Org isolation: one organization's MUTED override never affects another ─

test('org isolation: org A MUTED does not affect org B\'s float purchases', async () => {
    const { IE, ENT, FLOAT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.float', 'mpesa'] } });
    const orgA = makeOrg(IE, 'Acme Duka A');
    const orgB = makeOrg(IE, 'Acme Duka B');
    const adminA = await makeAdmin(IE, orgA);
    ENT.setAdminOverride({ actorUserId: adminA, organizationId: orgA, feature: 'mpesa.float', state: 'MUTED' });

    const resultA = FLOAT.purchaseFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 1000, source: 'Bank Transfer', organizationId: orgA });
    const resultB = FLOAT.purchaseFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 1000, source: 'Bank Transfer', organizationId: orgB });

    assert.equal(resultA.available, false);
    assert.equal(resultB.available, undefined, 'org B\'s successful purchase must be unaffected by org A\'s override');
    assert.equal(resultB.type, 'purchase');
});

// ── 8. recordTransactionImpact() remains UNGUARDED (Rule 9: transaction integrity) ─

test('recordTransactionImpact() is never gated: float stays in sync with money movement even while mpesa.float is MUTED', async () => {
    const { IE, ENT, FLOAT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.float', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.float', state: 'MUTED' });

    // A discretionary purchase is correctly blocked while muted...
    const blocked = FLOAT.purchaseFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 1000, source: 'Bank Transfer', organizationId: org });
    assert.equal(blocked.available, false);

    // ...but the engine's real post-transaction hook must still keep the
    // tracked float balance accurate — this is not optional UI, it is
    // real money-movement bookkeeping that must never be blocked by an
    // optional feature mute (organizationId is not even accepted here).
    const impact = FLOAT.recordTransactionImpact({ companyId: 'company_1', branchId: 'branch_1', transactionType: 'Deposit', amount: 2000 });

    assert.equal(impact.type, 'transaction');
    assert.equal(impact.balanceAfter, -2000, 'a Deposit must still decrease tracked float even while mpesa.float is MUTED');
    assert.equal(FLOAT.getCurrentFloat('company_1', 'branch_1'), -2000);
});

// ── 9. Clearing the override restores real float purchases ─────────────────

test('clearing the admin override restores real float purchases', async () => {
    const { IE, ENT, FLOAT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.float', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.float', state: 'MUTED' });
    assert.equal(FLOAT.purchaseFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 1000, source: 'Bank Transfer', organizationId: org }).available, false);

    ENT.clearAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.float' });
    const result = FLOAT.purchaseFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 1000, source: 'Bank Transfer', organizationId: org });

    assert.equal(result.available, undefined);
    assert.equal(result.type, 'purchase');
    assert.equal(FLOAT.getCurrentFloat('company_1', 'branch_1'), 1000);
});

// ── 10. Every guarded float action respects the same gate ──────────────────

test('every guarded float action fails closed under APPLICATION ADMIN_DISABLED', async () => {
    const { IE, ENT, FLOAT } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.float', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa', state: 'ADMIN_DISABLED' });

    const results = [
        FLOAT.purchaseFloat({ companyId: 'company_1', branchId: 'branch_1', amount: 1000, source: 'Bank Transfer', organizationId: org }),
        FLOAT.adjustFloat({ companyId: 'company_1', branchId: 'branch_1', amount: -100, reason: 'Shortage', organizationId: org }),
        FLOAT.reconcileFloat({ companyId: 'company_1', branchId: 'branch_1', actualFloat: 500, organizationId: org })
    ];

    for (const result of results) {
        assert.equal(result.available, false, 'every guarded float action must fail closed once the application is disabled');
        assert.equal(result.state, 'ADMIN_DISABLED');
    }
});
