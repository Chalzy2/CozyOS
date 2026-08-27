'use strict';

/**
 * core/plugins/tests/mpesaOS-reporting-entitlement.test.js
 *
 * Focused, real-path regression tests for the Entitlement.guard()
 * integration added to the LIVE MpesaOS reporting owner
 * (core/plugins/mpesaOS-reporting.js — window.CozyOS.MpesaReporting).
 *
 * OWNERSHIP AUDIT (confirmed before this test was written): this file
 * is the canonical, actually-loaded reporting coordinator — referenced
 * by <script src="core/plugins/mpesaOS-reporting.js"> in
 * core/shell/cozy-shell.html, core/cozy-shell.html, and
 * admin-workspace.html, and listed in
 * core/platform/discovery-manifest.json. No other file in the
 * repository implements MpesaOS report generation; no new reporting
 * engine was created for this integration.
 *
 * No dedicated MpesaOS "exports" mechanism exists anywhere in the
 * repository (confirmed by search — core/output/output-export.js is a
 * generic ZIP utility used only by Developer Hub / Certification and
 * has no MpesaOS wiring). Because every report method audited here is
 * the only real source of exportable report data, the tests below
 * that show a report method fails closed under MUTED/PLAN_RESTRICTED/
 * ADMIN_DISABLED also demonstrate, by construction, that there is no
 * surviving path to export that data — "exports disabled when the
 * relevant capability is disabled" is satisfied at the single real
 * choke point rather than by a second, invented export-specific gate.
 *
 * Real IdentityEngine and real EntitlementEngine are loaded fresh from
 * disk, never mocked. BillingEngine is represented by the same
 * minimal, honest test double used in
 * core/modules/entitlement/tests/entitlement-engine.test.js and
 * core/plugins/tests/mpesaOS-entitlement.test.js. MpesaFloat/
 * MpesaTill/MpesaPaybill/the transaction engine are represented by
 * small, honest in-memory doubles matching their real documented
 * contracts, since none of those coordinators are ES-module-requirable
 * outside a browser context.
 *
 * This suite touches ONLY core/plugins/mpesaOS-reporting.js. It does
 * not exercise, mock, or assert on sales, transactions, calculations,
 * or bookkeeping in any other coordinator.
 *
 * Run: node --test core/plugins/tests/mpesaOS-reporting-entitlement.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js');
const ENTITLEMENT_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'entitlement', 'entitlement-engine.js');
const MPESA_REPORTING_PATH = path.join(__dirname, '..', 'mpesaOS-reporting.js');

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

/** Small, honest double for window.CozyEnterpriseBusinessEngine.listTransactionSummaries() — the exact real contract MpesaReporting reads. */
function installEngineDouble(summaries = []) {
    window.CozyEnterpriseBusinessEngine = {
        listTransactionSummaries({ companyId, branchId, date }) {
            return summaries.filter(t =>
                (!companyId || t.companyId === companyId) &&
                (!branchId || t.branchId === branchId) &&
                (!date || t.date === date)
            );
        }
    };
}

function freshFullStack({ billing, seedTransactions = [] } = {}) {
    global.window = { CozyOS: {}, addEventListener() { /* no-op: no real DOM in this test process */ } };
    freshRequire(IDENTITY_ENGINE_PATH);
    if (billing !== null) installBillingDouble(billing || {});
    freshRequire(ENTITLEMENT_ENGINE_PATH);
    installEngineDouble(seedTransactions);
    freshRequire(MPESA_REPORTING_PATH);
    return {
        IE: global.window.CozyOS.IdentityEngine,
        ENT: global.window.CozyOS.Entitlement,
        REPORTING: global.window.CozyOS.MpesaReporting
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

const SEED_TX = [
    { companyId: 'company_1', branchId: 'branch_1', date: '2026-08-26', type: 'Deposit', amount: 5000, commission: 250, agent: 'Agent_A' },
    { companyId: 'company_1', branchId: 'branch_1', date: '2026-08-26', type: 'Withdrawal', amount: 12000, commission: 112, agent: 'Agent_B' }
];

// ── 1. Reports ENABLED (licensed, no override) -> real report data returned ─

test('reports ENABLED (licensed, no override): getDailyTransactionTotals returns real computed data', async () => {
    const { IE, REPORTING } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.reports', 'mpesa'] }, seedTransactions: SEED_TX });
    const org = makeOrg(IE, 'Acme Duka');

    const result = REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', org);

    assert.equal(result.available, true);
    assert.equal(result.deposits.count, 1);
    assert.equal(result.deposits.amount, 5000);
    assert.equal(result.withdrawals.count, 1);
    assert.equal(result.withdrawals.amount, 12000);
});

// ── 2. Reports MUTED by admin override -> fails closed, no data returned ───

test('reports MUTED (admin override on mpesa.reports): report is blocked, no data leaks', async () => {
    const { IE, ENT, REPORTING } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.reports', 'mpesa'] }, seedTransactions: SEED_TX });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.reports', state: 'MUTED', reason: 'Customer muted reports.' });

    const result = REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', org);

    assert.equal(result.available, false);
    assert.equal(result.state, 'MUTED');
    assert.equal(result.deposits, undefined, 'no report figures may leak once muted');
});

// ── 3. Reports PLAN_RESTRICTED (not licensed) -> fails closed ──────────────

test('reports PLAN_RESTRICTED (mpesa.reports not licensed): report is blocked', async () => {
    const { IE, REPORTING } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa'] /* mpesa.reports deliberately absent */ }, seedTransactions: SEED_TX });
    const org = makeOrg(IE, 'Acme Duka');

    const result = REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', org);

    assert.equal(result.available, false);
    assert.equal(result.state, 'PLAN_RESTRICTED');
});

// ── 4. APPLICATION-level ADMIN_DISABLED cascades to the reports FUNCTION ───

test('APPLICATION "mpesa" ADMIN_DISABLED: reports unavailable even though "mpesa.reports" itself has no override', async () => {
    const { IE, ENT, REPORTING } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.reports', 'mpesa'] }, seedTransactions: SEED_TX });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa', state: 'ADMIN_DISABLED', reason: 'Application suspended.' });

    const result = REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', org);

    assert.equal(result.available, false, 'application-level disablement must cascade to the reports function');
    assert.equal(result.state, 'ADMIN_DISABLED');
});

// ── 5. Entitlement engine completely unavailable -> fails closed ───────────

test('Entitlement engine unavailable: reports fail closed rather than fabricating data', async () => {
    const { REPORTING } = freshFullStack({ billing: null, seedTransactions: SEED_TX });
    delete global.window.CozyOS.Entitlement; // simulate Entitlement never having loaded

    const result = REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', 'org_no_entitlement');

    assert.equal(result.available, false);
    assert.equal(result.state, 'UNAVAILABLE');
});

// ── 6. Missing organizationId -> fails closed honestly, never a silent bypass ─

test('missing organizationId: report is blocked rather than silently defaulting to enabled', async () => {
    const { IE, REPORTING } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.reports', 'mpesa'] }, seedTransactions: SEED_TX });
    makeOrg(IE, 'Acme Duka'); // an org exists, but is never passed in below

    const result = REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', undefined);

    assert.equal(result.available, false);
    assert.equal(result.state, 'UNAVAILABLE');
});

// ── 7. Org isolation: one organization's MUTED override never affects another ─

test('org isolation: org A MUTED does not affect org B\'s reports', async () => {
    const { IE, ENT, REPORTING } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.reports', 'mpesa'] }, seedTransactions: SEED_TX });
    const orgA = makeOrg(IE, 'Acme Duka A');
    const orgB = makeOrg(IE, 'Acme Duka B');
    const adminA = await makeAdmin(IE, orgA);
    ENT.setAdminOverride({ actorUserId: adminA, organizationId: orgA, feature: 'mpesa.reports', state: 'MUTED' });

    const resultA = REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', orgA);
    const resultB = REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', orgB);

    assert.equal(resultA.available, false);
    assert.equal(resultB.available, true, 'org B must be unaffected by org A\'s override');
});

// ── 8. Every report method (the only real export data source) respects the same gate ─
//      Demonstrates "exports disabled when the relevant capability is disabled":
//      with no separate export mechanism anywhere in the repository, blocking every
//      one of these methods blocks every path through which report data could ever
//      be exported.

test('every report method fails closed under APPLICATION ADMIN_DISABLED — the only real export data sources are all blocked', async () => {
    const { IE, ENT, REPORTING } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.reports', 'mpesa'] }, seedTransactions: SEED_TX });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa', state: 'ADMIN_DISABLED' });

    const results = [
        REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', org),
        REPORTING.getFloatMovementReport('company_1', 'branch_1', org),
        REPORTING.getCommissionReport('company_1', 'branch_1', {}, org),
        REPORTING.getTillPerformanceReport('company_1', 'branch_1', org),
        REPORTING.getPaybillCollectionsReport('company_1', 'branch_1', org),
        REPORTING.getAgentActivityReport('company_1', 'branch_1', {}, org)
    ];

    for (const result of results) {
        assert.equal(result.available, false, 'every report method must fail closed once the application is disabled');
        assert.equal(result.state, 'ADMIN_DISABLED');
    }
});

// ── 9. Clearing the override restores real report data ─────────────────────

test('clearing the admin override restores real report data', async () => {
    const { IE, ENT, REPORTING } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.reports', 'mpesa'] }, seedTransactions: SEED_TX });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.reports', state: 'MUTED' });
    assert.equal(REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', org).available, false);

    ENT.clearAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.reports' });
    const result = REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', org);

    assert.equal(result.available, true);
    assert.equal(result.deposits.count, 1);
});

// ── 10. Reports being MUTED never touches transactions, calculations, or the engine itself ─

test('reports MUTED does not alter engine-owned transaction data at all (isolation from sales/bookkeeping)', async () => {
    const { IE, ENT, REPORTING } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.reports', 'mpesa'] }, seedTransactions: SEED_TX });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.reports', state: 'MUTED' });

    REPORTING.getDailyTransactionTotals('company_1', 'branch_1', '2026-08-26', org);

    // The underlying transaction engine double is untouched — reporting never
    // mutates, deletes, or recomputes the real transaction index it reads from.
    const raw = global.window.CozyEnterpriseBusinessEngine.listTransactionSummaries({ companyId: 'company_1', branchId: 'branch_1' });
    assert.equal(raw.length, 2, 'reporting entitlement must never mutate the real transaction data it reads from');
});
