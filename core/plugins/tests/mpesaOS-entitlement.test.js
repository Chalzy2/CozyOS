'use strict';

/**
 * core/plugins/tests/mpesaOS-entitlement.test.js
 *
 * Focused, real-path regression tests for the Entitlement.guard()
 * integration added to the LIVE MpesaOS execution owner
 * (core/plugins/mpesaOS.js — confirmed the canonical, actually-loaded
 * file: referenced by <script src="core/plugins/mpesaOS.js"> in
 * core/shell/cozy-shell.html, core/cozy-shell.html,
 * applications/MpesaOS/index.html, and admin-workspace.html, and
 * depended on by mpesaOS-float.js/mpesaOS-till.js/mpesaos.js).
 * core/plugins/mpesaOS-engine.js is a near-duplicate file that is never
 * loaded by any <script> tag and does not appear in
 * core/platform/discovery-manifest.json — it is dead/orphaned, not a
 * second live owner, and is intentionally left byte-identical to the
 * checkpoint baseline (untouched) by this change.
 *
 * Real IdentityEngine and real EntitlementEngine are loaded fresh from
 * disk, never mocked — every guard()/setAdminOverride() call below
 * exercises the actual merge/authorization logic. BillingEngine is
 * represented by the same minimal, honest test double used in
 * core/modules/entitlement/tests/entitlement-engine.test.js. mpesaOS.js's
 * OTHER real dependencies (CozyStorage, Company, PaymentChannel,
 * Customer, MpesaFloat) are represented by small, honest in-memory
 * doubles matching their real documented contracts exactly, since none
 * of those coordinators are ES-module-requirable outside a browser
 * context — the same constraint entitlement-engine.test.js documents
 * for BillingEngine.
 *
 * Run: node --test core/plugins/tests/mpesaOS-entitlement.test.js
 */

const test = require('node:test');
const { afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// CozyBusinessEngine's constructor schedules a real setInterval reaper
// (_reapStaleLocks, every 60s) — correct production behavior, but it
// keeps a bare `node --test` process alive unless cleared. Track the
// most recently created engine and destroy() it after every test so
// the process can exit; this touches no production code.
let __lastEngine = null;
afterEach(() => { if (__lastEngine) { __lastEngine.destroy(); __lastEngine = null; } });

const IDENTITY_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'identity', 'identity-engine.js');
const ENTITLEMENT_ENGINE_PATH = path.join(__dirname, '..', '..', 'modules', 'entitlement', 'entitlement-engine.js');
const MPESA_OS_PATH = path.join(__dirname, '..', 'mpesaOS.js');

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

/** In-memory CozyStorage double matching the real, documented contract mpesaOS.js reads: get/save/delete + optional beginTransaction. */
function createStorageDouble({ transactional = true } = {}) {
    const stores = new Map(); // storeName -> Map(id -> record)

    function storeFor(name) {
        if (!stores.has(name)) stores.set(name, new Map());
        return stores.get(name);
    }

    const storage = {
        _stores: stores,
        async get(storeName, id) {
            const rec = storeFor(storeName).get(id);
            if (!rec) throw new Error(`not found: ${storeName}/${id}`);
            return rec;
        },
        async save(storeName, record) {
            storeFor(storeName).set(record.id, record);
            return record;
        },
        async delete(storeName, id) {
            storeFor(storeName).delete(id);
            return true;
        }
    };

    if (transactional) {
        storage.beginTransaction = async function beginTransaction(_storeNames) {
            const staged = [];
            return {
                async save(storeName, record) { staged.push([storeName, record]); },
                async commit() { for (const [storeName, record] of staged) { storeFor(storeName).set(record.id, record); } },
                async rollback() { /* staged writes simply discarded */ }
            };
        };
    }

    return storage;
}

function installMpesaDependencyDoubles(storage) {
    window.CozyStorage = storage;
    window.CozyOS.Company = {
        getCompany(id) { return { companyId: id, companyStatus: 'ACTIVE' }; },
        listBranches(companyId) { return [{ branchId: 'branch_1', companyId, status: 'ACTIVE' }]; }
    };
    window.CozyOS.PaymentChannel = {
        validateChannel() { return { valid: true }; },
        recordTransactionChannel() { return true; }
    };
    window.CozyOS.Customer = {
        searchCustomers() { return []; },
        createCustomer(input) { return { customerId: 'cust_1', displayName: `${input.firstName} ${input.lastName}`.trim() }; }
    };
    window.CozyOS.MpesaFloat = {
        recordTransactionImpact() { return true; }
    };
}

function freshFullStack({ billing, transactional = true } = {}) {
    global.window = { CozyOS: {}, addEventListener() { /* no-op: no real DOM in this test process */ } };
    freshRequire(IDENTITY_ENGINE_PATH);
    if (billing !== null) installBillingDouble(billing || {});
    freshRequire(ENTITLEMENT_ENGINE_PATH);
    const storage = createStorageDouble({ transactional });
    installMpesaDependencyDoubles(storage);
    freshRequire(MPESA_OS_PATH);
    __lastEngine = global.window.CozyEnterpriseBusinessEngine;
    return {
        IE: global.window.CozyOS.IdentityEngine,
        ENT: global.window.CozyOS.Entitlement,
        engine: global.window.CozyEnterpriseBusinessEngine,
        storage
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

let seq = 0;
function depositAction(overrides = {}) {
    seq += 1;
    return Object.assign({
        type: 'Deposit',
        amount: 5000,
        channel: 'cash',
        providerCode: `PROV_${seq}_${Math.random().toString(36).slice(2, 8)}`,
        agent: 'Agent_Test',
        companyId: 'company_1',
        branchId: 'branch_1',
        customer: { name: 'Jane Doe', phone: '0700000000' }
    }, overrides);
}

// ── 1. Receipts entitled/enabled -> receipt written, transaction unaffected ─

test('receipts ENABLED (licensed, no override): receipt is written and transaction commits normally', async (t) => {
    const { IE, engine, storage } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts', 'mpesa'] } });
    t.after(() => engine.destroy());
    const org = makeOrg(IE, 'Acme Duka');

    const result = await engine.processAutomatedWorkflow(depositAction(), org);

    assert.equal(result.receiptStatus, 'GENERATED');
    assert.equal(storage._stores.get('receipts').size, 1, 'a real receipt record must exist in storage');
    assert.equal(storage._stores.get('transactions').size, 1, 'the transaction itself must still be recorded');
});

// ── 2. Receipts MUTED by admin override -> fails closed for receipts only ──

test('receipts MUTED (admin override): receipt is NOT written, transaction still commits, calculations still run', async () => {
    const { IE, ENT, engine, storage } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED', reason: 'Customer requested calculations-only.' });

    const action = depositAction({ amount: 12000 });
    const result = await engine.processAutomatedWorkflow(action, org);

    assert.equal(result.receiptStatus, 'MUTED');
    assert.equal(storage._stores.get('receipts'), undefined, 'no receipt store write should have happened at all');
    assert.equal(storage._stores.get('transactions').size, 1, 'muting receipts must not mute the transaction');
    // Calculations remain usable: charge/commission were genuinely computed and persisted on the ledger.
    assert.equal(typeof result.charges, 'number');
    assert.ok(result.charges > 0);
    assert.equal(typeof result.commission, 'number');
});

// ── 3. Receipts PLAN_RESTRICTED -> fails closed for receipts only ──────────

test('receipts PLAN_RESTRICTED (not licensed): receipt is NOT written, transaction still commits', async () => {
    const { IE, engine, storage } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa'] /* mpesa.receipts deliberately absent */ } });
    const org = makeOrg(IE, 'Acme Duka');

    const result = await engine.processAutomatedWorkflow(depositAction(), org);

    assert.equal(result.receiptStatus, 'MUTED');
    assert.equal(storage._stores.get('receipts'), undefined);
    assert.equal(storage._stores.get('transactions').size, 1);
});

// ── 4. APPLICATION-level ADMIN_DISABLED cascades to the receipts FUNCTION ──

test('APPLICATION "mpesa" ADMIN_DISABLED: receipts unavailable even though "mpesa.receipts" itself has no override', async () => {
    const { IE, ENT, engine, storage } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa', state: 'ADMIN_DISABLED', reason: 'Application suspended.' });

    const result = await engine.processAutomatedWorkflow(depositAction(), org);

    assert.equal(result.receiptStatus, 'MUTED', 'application-level disablement must cascade to the receipts function');
    assert.equal(storage._stores.get('receipts'), undefined);
});

// ── 5. Entitlement engine completely unavailable -> fails closed for receipts, transaction unaffected ─

test('Entitlement engine unavailable: receipt fails closed, but the transaction (REQUIRED) still commits — existing behavior preserved', async () => {
    const { engine, storage } = freshFullStack({ billing: null });
    delete global.window.CozyOS.Entitlement; // simulate Entitlement never having loaded

    const result = await engine.processAutomatedWorkflow(depositAction(), 'org_no_entitlement');

    assert.equal(result.receiptStatus, 'MUTED');
    assert.equal(storage._stores.get('receipts'), undefined);
    assert.equal(storage._stores.get('transactions').size, 1, 'transactions must remain REQUIRED and unaffected by Entitlement being absent');
});

// ── 6. Direct invocation of the receipt-writing operation cannot bypass the guard ─

test('direct invocation of _generateReceipt() cannot bypass the guard when MUTED', async () => {
    const { IE, ENT, engine } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED' });

    // Calling the real receipt-writing operation directly — not through
    // processAutomatedWorkflow's orchestration — must still respect the
    // guard, because the guard lives inside the operation itself.
    const direct = engine._generateReceipt(org, { internalTxId: 'TXN_DIRECT', timestamp: Date.now() });
    assert.equal(direct, null, 'direct invocation must not fabricate a receipt when receipts are MUTED');
});

test('direct invocation of _generateReceipt() succeeds when genuinely entitled', async () => {
    const { IE, engine } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');

    const direct = engine._generateReceipt(org, { internalTxId: 'TXN_DIRECT_2', timestamp: Date.now() });
    assert.ok(direct, 'a genuinely entitled direct call must still produce a real receipt record');
    assert.equal(direct.txId, 'TXN_DIRECT_2');
});

// ── 7. Existing behavior preserved when entitlement is fully enabled, non-transactional fallback path ─

test('fallback (non-transactional) storage path: receipts MUTED still leaves the transaction intact', async () => {
    const { IE, ENT, engine, storage } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts', 'mpesa'] }, transactional: false });
    const org = makeOrg(IE, 'Acme Duka');
    const admin = await makeAdmin(IE, org);
    ENT.setAdminOverride({ actorUserId: admin, organizationId: org, feature: 'mpesa.receipts', state: 'MUTED' });

    const result = await engine.processAutomatedWorkflow(depositAction(), org);

    assert.equal(result.receiptStatus, 'MUTED');
    assert.equal(storage._stores.get('receipts'), undefined);
    assert.equal(storage._stores.get('transactions').size, 1);
});

test('fallback (non-transactional) storage path: receipts ENABLED writes a real receipt', async () => {
    const { IE, engine, storage } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts', 'mpesa'] }, transactional: false });
    const org = makeOrg(IE, 'Acme Duka');

    const result = await engine.processAutomatedWorkflow(depositAction(), org);

    assert.equal(result.receiptStatus, 'GENERATED');
    assert.equal(storage._stores.get('receipts').size, 1);
});

// ── 8. mpesa.transactions / mpesa.calculations are registered REQUIRED (hierarchy is real) ─

test('mpesa.transactions and mpesa.calculations are registered as REQUIRED once the engine has run', async () => {
    const { IE, ENT, engine } = freshFullStack({ billing: { enforcing: true, licensedModules: ['mpesa.receipts', 'mpesa'] } });
    const org = makeOrg(IE, 'Acme Duka');
    await engine.processAutomatedWorkflow(depositAction(), org);

    assert.equal(ENT.isRequiredFeature('mpesa.transactions'), true);
    assert.equal(ENT.isRequiredFeature('mpesa.calculations'), true);
});
