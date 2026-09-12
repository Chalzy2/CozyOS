'use strict';

/**
 * core/plugins/tests/mpesaOS-paybill-entitlement.test.js
 *
 * Focused, real-path regression tests for the Entitlement.guard()
 * integration added to the LIVE MpesaOS paybill owner
 * (core/plugins/mpesaOS-paybill.js — window.CozyOS.MpesaPaybill).
 *
 * OWNERSHIP AUDIT (confirmed before this test was written): this file
 * is the canonical, actually-loaded paybill coordinator — referenced
 * by <script src="core/plugins/mpesaOS-paybill.js"> in
 * core/shell/cozy-shell.html, core/cozy-shell.html, and
 * admin-workspace.html, and listed in
 * core/platform/discovery-manifest.json and
 * docs/builder/knowledge/module-inventory.json.
 * core/plugins/mpesaOS-engine.js contains a near-duplicate Paybill
 * code path but is confirmed dead (no <script> reference anywhere,
 * absent from discovery-manifest.json) — it is intentionally left
 * byte-identical to the checkpoint baseline (untouched) by this change
 * and is not exercised by this suite.
 *
 * Real IdentityEngine and real EntitlementEngine are loaded fresh from
 * disk, never mocked. BillingEngine and Company are represented by
 * small, honest in-memory doubles matching their real documented
 * contracts, since neither coordinator is ES-module-requirable outside
 * a browser context (the same constraint the reports/float/till
 * entitlement suites document).
 *
 * This suite touches ONLY core/plugins/mpesaOS-paybill.js. It does not
 * exercise, mock, or assert on receipts, reports, float, till,
 * transactions, calculations, or any other coordinator.
 * recordCollection() and withdrawFromPaybill() are deliberately
 * exercised as UNGUARDED (see file header on mpesaOS-paybill.js for
 * the dual-purpose/rollback rationale, identical to Till's) — tests 8
 * and 9 below are the regression proof for that.
 *
 * Run: node --test core/plugins/tests/mpesaOS-paybill-entitlement.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js');
const ENTITLEMENT_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'entitlement', 'entitlement-engine.js');
const MPESA_PAYBILL_PATH = path.join(__dirname, '..', 'mpesaOS-paybill.js');

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

/** Small, honest double for window.CozyOS.Company — the exact real contract MpesaPaybill's #validateCompanyBranch reads. */
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
    freshRequire(MPESA_PAYBILL_PATH);
    return {
        IE: global.window.CozyOS.IdentityEngine,
        ENT: global.window.CozyOS.Entitlement,
        PAYBILL: global.window.CozyOS.MpesaPaybill
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

// ── 1. Paybill ENABLED (licensed, no override) -> real registration succeeds ──

test('paybill ENABLED (licensed, no override): registerPaybill records a real paybill', async () => {
    const { IE, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.paybill', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');

    const result = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '123456', businessName: 'Acme Duka', organizationId: org });

    assert.equal(result.available, undefined, 'a successful registration keeps its existing return shape (no available:false marker)');
    assert.equal(result.paybillNumber, '123456');
    assert.equal(result.status, 'active');
    assert.deepEqual(PAYBILL.getPaybill('123456').paybillNumber, '123456');
});

// ── 2. Paybill FUNCTION MUTED by admin override -> fails closed, nothing registered ─

test('paybill MUTED (admin override on mpesa.paybill): registerPaybill is blocked, no paybill is created', async () => {
    const { IE, ENT, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.paybill', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.paybill', state: 'MUTED', reason: 'Customer muted paybill management.' });

    const result = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '123456', businessName: 'Acme Duka', organizationId: org });

    assert.equal(result.available, false);
    assert.equal(result.state, 'MUTED');
    assert.equal(PAYBILL.getPaybill('123456'), null, 'a blocked registration must never create a paybill record');
});

// ── 3. APPLICATION-level ADMIN_DISABLED cascades to the paybill FUNCTION ──────

test('APPLICATION "mpesa" ADMIN_DISABLED: setPaybillStatus unavailable even though "mpesa.paybill" itself has no override', async () => {
    const { IE, ENT, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.paybill', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    // Register the paybill first, while the app is still enabled.
    PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '123456', businessName: 'Acme Duka', organizationId: org });
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa', state: 'ADMIN_DISABLED', reason: 'Application suspended.' });

    const result = PAYBILL.setPaybillStatus('123456', 'suspended', org);

    assert.equal(result.available, false, 'application-level disablement must cascade to the paybill function');
    assert.equal(result.state, 'ADMIN_DISABLED');
    assert.equal(PAYBILL.getPaybill('123456').status, 'active', 'a blocked status change must never mutate the paybill record');
});

// ── 4. Paybill PLAN_RESTRICTED (not licensed) -> fails closed ─────────────────

test('paybill PLAN_RESTRICTED (mpesa.paybill not licensed): registerPaybill is blocked', async () => {
    const { IE, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa'] /* mpesa.paybill deliberately absent */ } });
    const org = makeOrg(IE, 'Acme Duka');

    const result = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '123456', businessName: 'Acme Duka', organizationId: org });

    assert.equal(result.available, false);
    assert.equal(result.state, 'PLAN_RESTRICTED');
});

// ── 5. Entitlement engine completely unavailable -> fails closed ───────────

test('Entitlement engine unavailable: registerPaybill fails closed rather than silently registering', async () => {
    const { PAYBILL } = freshFullStack({ billing: null });
    delete global.window.CozyOS.Entitlement; // simulate Entitlement never having loaded

    const result = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '123456', businessName: 'Acme Duka', organizationId: 'org_no_entitlement' });

    assert.equal(result.available, false);
    assert.equal(result.state, 'UNAVAILABLE');
});

// ── 6. Org isolation: one organization's MUTED override never affects another ─

test('org isolation: org A MUTED does not affect org B\'s paybill registration', async () => {
    const { IE, ENT, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.paybill', 'mpesa'] } });
    const orgA = makeOrg(IE, 'Acme Duka A');
    const orgB = makeOrg(IE, 'Acme Duka B');
    const adminA = await makeAdmin(IE, orgA);
    ENT.setAdminOverride({ actorUserId: adminA, organizationId: orgA, feature: 'mpesa.paybill', state: 'MUTED' });

    const resultA = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '111111', businessName: 'Org A Duka', organizationId: orgA });
    const resultB = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '222222', businessName: 'Org B Duka', organizationId: orgB });

    assert.equal(resultA.available, false);
    assert.equal(resultB.available, undefined, 'org B\'s successful registration must be unaffected by org A\'s override');
    assert.equal(resultB.paybillNumber, '222222');
});

// ── 7. Direct invocation / bypass resistance: the gate lives inside the method ──
//      There is no separate "checked" wrapper a caller could skip — calling
//      registerPaybill()/setPaybillStatus() directly (as any real caller must,
//      there being no other entry point) always passes through the gate.

test('direct invocation cannot bypass the gate: repeated direct calls to registerPaybill are all blocked while MUTED', async () => {
    const { IE, ENT, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.paybill', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.paybill', state: 'MUTED' });

    const attempt1 = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '333333', businessName: 'Acme Duka', organizationId: org });
    const attempt2 = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '333333', businessName: 'Acme Duka', organizationId: org });

    assert.equal(attempt1.available, false);
    assert.equal(attempt2.available, false, 'there is no unguarded path to registerPaybill — every direct call still hits the gate');
    assert.equal(PAYBILL.getPaybill('333333'), null);
});

// ── 8. recordCollection() is never gated: real Paybill Payment money movement stays synced ─

test('recordCollection() is never gated: paybill balance stays in sync with a real Paybill Payment even while mpesa.paybill is MUTED', async () => {
    const { IE, ENT, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.paybill', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    // Register while enabled, then mute the discretionary function.
    PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '444444', businessName: 'Acme Duka', organizationId: org });
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.paybill', state: 'MUTED' });

    // A discretionary registration is correctly blocked while muted...
    const blocked = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '555555', businessName: 'Acme Duka', organizationId: org });
    assert.equal(blocked.available, false);

    // ...but a real customer collection (the engine's transaction-integrity
    // hook — organizationId is not even accepted here) must still be
    // recorded, exactly as it would have happened in the real world.
    const collection = PAYBILL.recordCollection({ paybillNumber: '444444', amount: 500, accountNumber: 'INV-001', customerPhone: '0700000000' });

    assert.equal(collection.type, 'collection');
    assert.equal(collection.balanceAfter, 500, 'a real Paybill Payment must still be recorded even while mpesa.paybill is MUTED');
    assert.equal(PAYBILL.getPaybillBalance('444444'), 500);
});

// ── 9. withdrawFromPaybill() is never gated: rollback/reversal integrity is preserved ─

test('withdrawFromPaybill() is never gated: a failed-transaction reversal still succeeds while mpesa.paybill is MUTED', async () => {
    const { IE, ENT, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.paybill', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '666666', businessName: 'Acme Duka', organizationId: org });
    PAYBILL.recordCollection({ paybillNumber: '666666', amount: 1000, accountNumber: 'INV-002', customerPhone: '0711111111' });
    assert.equal(PAYBILL.getPaybillBalance('666666'), 1000);

    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.paybill', state: 'MUTED' });

    // Simulates mpesaOS.js's real best-effort rollback path (see
    // core/plugins/mpesaOS.js, the `paybillApplied` reversal branch): this
    // call must succeed even while mpesa.paybill is MUTED, or a rolled-back
    // transaction would leave the paybill balance permanently desynced.
    const reversal = PAYBILL.withdrawFromPaybill({ paybillNumber: '666666', amount: 1000 });

    assert.equal(reversal.type, 'withdrawal');
    assert.equal(reversal.balanceAfter, 0, 'the reversal must still zero out the balance even while mpesa.paybill is MUTED');
    assert.equal(PAYBILL.getPaybillBalance('666666'), 0);
});

// ── 10. Every guarded paybill action respects the same gate ───────────────────

test('every guarded paybill action fails closed under APPLICATION ADMIN_DISABLED', async () => {
    const { IE, ENT, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.paybill', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '777777', businessName: 'Acme Duka', organizationId: org });
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa', state: 'ADMIN_DISABLED' });

    const results = [
        PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '888888', businessName: 'Acme Duka', organizationId: org }),
        PAYBILL.setPaybillStatus('777777', 'suspended', org)
    ];

    for (const result of results) {
        assert.equal(result.available, false, 'every guarded paybill action must fail closed once the application is disabled');
        assert.equal(result.state, 'ADMIN_DISABLED');
    }
});

// ── 11. Clearing the override restores real paybill registration ──────────────

test('clearing the admin override restores real paybill registration', async () => {
    const { IE, ENT, PAYBILL } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.paybill', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.paybill', state: 'MUTED' });
    assert.equal(PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '999999', businessName: 'Acme Duka', organizationId: org }).available, false);

    ENT.clearAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.paybill' });
    const result = PAYBILL.registerPaybill({ companyId: 'company_1', branchId: 'branch_1', paybillNumber: '999999', businessName: 'Acme Duka', organizationId: org });

    assert.equal(result.available, undefined);
    assert.equal(result.paybillNumber, '999999');
    assert.notEqual(PAYBILL.getPaybill('999999'), null);
});
