'use strict';

/**
 * core/plugins/tests/mpesaOS-till-entitlement.test.js
 *
 * Focused, real-path regression tests for the Entitlement.guard()
 * integration added to the LIVE MpesaOS till owner
 * (core/plugins/mpesaOS-till.js — window.CozyOS.MpesaTill).
 *
 * OWNERSHIP AUDIT (confirmed before this test was written): this file
 * is the canonical, actually-loaded till coordinator — referenced by
 * <script src="core/plugins/mpesaOS-till.js"> in
 * core/shell/cozy-shell.html, core/cozy-shell.html, and
 * admin-workspace.html, and listed in
 * core/platform/discovery-manifest.json and
 * docs/builder/knowledge/module-inventory.json.
 * core/plugins/mpesaOS-engine.js contains a near-duplicate Till-Payment
 * code path but is confirmed dead (no <script> reference anywhere,
 * absent from discovery-manifest.json) — it is intentionally left
 * byte-identical to the checkpoint baseline (untouched) by this change
 * and is not exercised by this suite.
 *
 * Real IdentityEngine and real EntitlementEngine are loaded fresh from
 * disk, never mocked. BillingEngine and Company are represented by
 * small, honest in-memory doubles matching their real documented
 * contracts, since neither coordinator is ES-module-requirable outside
 * a browser context (the same constraint the reports/float entitlement
 * suites document).
 *
 * This suite touches ONLY core/plugins/mpesaOS-till.js. It does not
 * exercise, mock, or assert on receipts, reports, float, transactions,
 * calculations, or any other coordinator. recordPayment() and
 * withdrawFromTill() are deliberately exercised as UNGUARDED (see file
 * header on mpesaOS-till.js for the dual-purpose/rollback rationale) —
 * tests 8 and 9 below are the regression proof for that.
 *
 * Run: node --test core/plugins/tests/mpesaOS-till-entitlement.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js');
const ENTITLEMENT_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'entitlement', 'entitlement-engine.js');
const MPESA_TILL_PATH = path.join(__dirname, '..', 'mpesaOS-till.js');

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

/** Small, honest double for window.CozyOS.Company — the exact real contract MpesaTill's #validateCompanyBranch reads. */
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
    freshRequire(MPESA_TILL_PATH);
    return {
        IE: global.window.CozyOS.IdentityEngine,
        ENT: global.window.CozyOS.Entitlement,
        TILL: global.window.CozyOS.MpesaTill
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

// ── 1. Till ENABLED (licensed, no override) -> real registration succeeds ──

test('till ENABLED (licensed, no override): registerTill records a real till', async () => {
    const { IE, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.till', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');

    const result = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '123456', merchantName: 'Acme Duka', organizationId: org });

    assert.equal(result.available, undefined, 'a successful registration keeps its existing return shape (no available:false marker)');
    assert.equal(result.tillNumber, '123456');
    assert.equal(result.status, 'active');
    assert.deepEqual(TILL.getTill('123456').tillNumber, '123456');
});

// ── 2. Till FUNCTION MUTED by admin override -> fails closed, nothing registered ─

test('till MUTED (admin override on mpesa.till): registerTill is blocked, no till is created', async () => {
    const { IE, ENT, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.till', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.till', state: 'MUTED', reason: 'Customer muted till management.' });

    const result = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '123456', merchantName: 'Acme Duka', organizationId: org });

    assert.equal(result.available, false);
    assert.equal(result.state, 'MUTED');
    assert.equal(TILL.getTill('123456'), null, 'a blocked registration must never create a till record');
});

// ── 3. APPLICATION-level ADMIN_DISABLED cascades to the till FUNCTION ──────

test('APPLICATION "mpesa" ADMIN_DISABLED: setTillStatus unavailable even though "mpesa.till" itself has no override', async () => {
    const { IE, ENT, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.till', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    // Register the till first, while the app is still enabled.
    TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '123456', merchantName: 'Acme Duka', organizationId: org });
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa', state: 'ADMIN_DISABLED', reason: 'Application suspended.' });

    const result = TILL.setTillStatus('123456', 'suspended', org);

    assert.equal(result.available, false, 'application-level disablement must cascade to the till function');
    assert.equal(result.state, 'ADMIN_DISABLED');
    assert.equal(TILL.getTill('123456').status, 'active', 'a blocked status change must never mutate the till record');
});

// ── 4. Till PLAN_RESTRICTED (not licensed) -> fails closed ─────────────────

test('till PLAN_RESTRICTED (mpesa.till not licensed): registerTill is blocked', async () => {
    const { IE, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa'] /* mpesa.till deliberately absent */ } });
    const org = makeOrg(IE, 'Acme Duka');

    const result = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '123456', merchantName: 'Acme Duka', organizationId: org });

    assert.equal(result.available, false);
    assert.equal(result.state, 'PLAN_RESTRICTED');
});

// ── 5. Entitlement engine completely unavailable -> fails closed ───────────

test('Entitlement engine unavailable: registerTill fails closed rather than silently registering', async () => {
    const { TILL } = freshFullStack({ billing: null });
    delete global.window.CozyOS.Entitlement; // simulate Entitlement never having loaded

    const result = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '123456', merchantName: 'Acme Duka', organizationId: 'org_no_entitlement' });

    assert.equal(result.available, false);
    assert.equal(result.state, 'UNAVAILABLE');
});

// ── 6. Org isolation: one organization's MUTED override never affects another ─

test('org isolation: org A MUTED does not affect org B\'s till registration', async () => {
    const { IE, ENT, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.till', 'mpesa'] } });
    const orgA = makeOrg(IE, 'Acme Duka A');
    const orgB = makeOrg(IE, 'Acme Duka B');
    const adminA = await makeAdmin(IE, orgA);
    ENT.setAdminOverride({ actorUserId: adminA, organizationId: orgA, feature: 'mpesa.till', state: 'MUTED' });

    const resultA = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '111111', merchantName: 'Org A Duka', organizationId: orgA });
    const resultB = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '222222', merchantName: 'Org B Duka', organizationId: orgB });

    assert.equal(resultA.available, false);
    assert.equal(resultB.available, undefined, 'org B\'s successful registration must be unaffected by org A\'s override');
    assert.equal(resultB.tillNumber, '222222');
});

// ── 7. Direct invocation / bypass resistance: the gate lives inside the method ──
//      There is no separate "checked" wrapper a caller could skip — calling
//      registerTill()/setTillStatus() directly (as any real caller must,
//      there being no other entry point) always passes through the gate.

test('direct invocation cannot bypass the gate: repeated direct calls to registerTill are all blocked while MUTED', async () => {
    const { IE, ENT, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.till', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.till', state: 'MUTED' });

    const attempt1 = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '333333', merchantName: 'Acme Duka', organizationId: org });
    const attempt2 = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '333333', merchantName: 'Acme Duka', organizationId: org });

    assert.equal(attempt1.available, false);
    assert.equal(attempt2.available, false, 'there is no unguarded path to registerTill — every direct call still hits the gate');
    assert.equal(TILL.getTill('333333'), null);
});

// ── 8. recordPayment() is never gated: real Till Payment money movement stays synced ─

test('recordPayment() is never gated: till balance stays in sync with a real Till Payment even while mpesa.till is MUTED', async () => {
    const { IE, ENT, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.till', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    // Register while enabled, then mute the discretionary function.
    TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '444444', merchantName: 'Acme Duka', organizationId: org });
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.till', state: 'MUTED' });

    // A discretionary registration is correctly blocked while muted...
    const blocked = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '555555', merchantName: 'Acme Duka', organizationId: org });
    assert.equal(blocked.available, false);

    // ...but a real customer payment (the engine's transaction-integrity
    // hook — organizationId is not even accepted here) must still be
    // recorded, exactly as it would have happened in the real world.
    const payment = TILL.recordPayment({ tillNumber: '444444', amount: 500, customerPhone: '0700000000' });

    assert.equal(payment.type, 'payment');
    assert.equal(payment.balanceAfter, 500, 'a real Till Payment must still be recorded even while mpesa.till is MUTED');
    assert.equal(TILL.getTillBalance('444444'), 500);
});

// ── 9. withdrawFromTill() is never gated: rollback/reversal integrity is preserved ─

test('withdrawFromTill() is never gated: a failed-transaction reversal still succeeds while mpesa.till is MUTED', async () => {
    const { IE, ENT, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.till', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '666666', merchantName: 'Acme Duka', organizationId: org });
    TILL.recordPayment({ tillNumber: '666666', amount: 1000, customerPhone: '0711111111' });
    assert.equal(TILL.getTillBalance('666666'), 1000);

    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.till', state: 'MUTED' });

    // Simulates mpesaOS.js's real best-effort rollback path (see
    // core/plugins/mpesaOS.js, the `tillApplied` reversal branch): this
    // call must succeed even while mpesa.till is MUTED, or a rolled-back
    // transaction would leave the till balance permanently desynced.
    const reversal = TILL.withdrawFromTill({ tillNumber: '666666', amount: 1000 });

    assert.equal(reversal.type, 'withdrawal');
    assert.equal(reversal.balanceAfter, 0, 'the reversal must still zero out the balance even while mpesa.till is MUTED');
    assert.equal(TILL.getTillBalance('666666'), 0);
});

// ── 10. Every guarded till action respects the same gate ───────────────────

test('every guarded till action fails closed under APPLICATION ADMIN_DISABLED', async () => {
    const { IE, ENT, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.till', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '777777', merchantName: 'Acme Duka', organizationId: org });
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa', state: 'ADMIN_DISABLED' });

    const results = [
        TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '888888', merchantName: 'Acme Duka', organizationId: org }),
        TILL.setTillStatus('777777', 'suspended', org)
    ];

    for (const result of results) {
        assert.equal(result.available, false, 'every guarded till action must fail closed once the application is disabled');
        assert.equal(result.state, 'ADMIN_DISABLED');
    }
});

// ── 11. Clearing the override restores real till registration ──────────────

test('clearing the admin override restores real till registration', async () => {
    const { IE, ENT, TILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.till', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.till', state: 'MUTED' });
    assert.equal(TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '999999', merchantName: 'Acme Duka', organizationId: org }).available, false);

    ENT.clearAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.till' });
    const result = TILL.registerTill({ companyId: 'company_1', branchId: 'branch_1', tillNumber: '999999', merchantName: 'Acme Duka', organizationId: org });

    assert.equal(result.available, undefined);
    assert.equal(result.tillNumber, '999999');
    assert.notEqual(TILL.getTill('999999'), null);
});
