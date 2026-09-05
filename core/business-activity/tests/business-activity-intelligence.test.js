'use strict';

/**
 * core/business-activity/tests/business-activity-intelligence.test.js
 *
 * Focused, real-path tests for BusinessActivityIntelligence.
 * OrganizationRegistry, OrganizationMembership, FormulaRegistry,
 * CalculationEngine, formula-library.js and BusinessRecordEngine are the
 * REAL source files, loaded fresh via require() — never mocked. Every
 * summary/trend/observation in these tests is produced by the real
 * BusinessActivityIntelligence code calling the real BusinessRecordEngine.
 *
 * window.CozyStorage is a minimal, honest test double of the real
 * CozyStorageGateway CRUD contract — the same fixture used by
 * core/calculation/tests/business-record-engine.test.js, for the same
 * documented reason (no indexedDB in Node, no polyfill available).
 *
 * Run: node --test core/business-activity/tests/business-activity-intelligence.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const ORG_REGISTRY_PATH   = path.join(__dirname, '..', '..', 'organization', 'organization-registry.js');
const ORG_MEMBERSHIP_PATH = path.join(__dirname, '..', '..', 'organization', 'organization-membership.js');
const FORMULA_REGISTRY_PATH = path.join(__dirname, '..', '..', 'calculation', 'formula-registry.js');
const FORMULA_LIBRARY_PATH  = path.join(__dirname, '..', '..', 'calculation', 'formula-library.js');
const CALC_ENGINE_PATH       = path.join(__dirname, '..', '..', 'calculation', 'calculation-engine.js');
const BRE_PATH               = path.join(__dirname, '..', '..', 'calculation', 'business-record-engine.js');
const BAI_PATH                = path.join(__dirname, '..', 'business-activity-intelligence.js');

function freshRequire(modPath) {
    delete require.cache[require.resolve(modPath)];
    require(modPath);
}

function installStorageDouble() {
    const stores = new Map();
    let autoInc = 1;
    function storeFor(name) {
        if (!stores.has(name)) stores.set(name, new Map());
        return stores.get(name);
    }
    window.CozyStorage = {
        async save(storeName, data, tenantId = 'default_tenant') {
            const store = storeFor(storeName);
            const id = data.id || `auto_${autoInc++}`;
            const record = { ...data, id, tenantId, _lastModified: Date.now(), _version: data._version ?? 0 };
            store.set(id, record);
            return id;
        },
        async get(storeName, key, tenantId = 'default_tenant') {
            const store = storeFor(storeName);
            const record = store.get(key);
            if (!record) return null;
            if (record.tenantId && record.tenantId !== tenantId) {
                throw new Error(`[Security Boundary Exception] Cross-tenant leak blocked for key: ${key}`);
            }
            return { ...record };
        },
        async update(storeName, key, partialData, tenantId = 'default_tenant') {
            const store = storeFor(storeName);
            const current = store.get(key);
            if (!current) throw new Error(`Target update record not found in ${storeName} matching key: ${key}`);
            if (current.tenantId && current.tenantId !== tenantId) {
                throw new Error(`[Security Boundary Exception] Cross-tenant update blocked for key: ${key}`);
            }
            const combined = { ...current, ...partialData, id: key, tenantId, _lastModified: Date.now(), _version: (current._version || 0) + 1 };
            store.set(key, combined);
            return key;
        },
        async list(storeName, tenantId = 'default_tenant') {
            const store = storeFor(storeName);
            return [...store.values()].filter(r => !r.tenantId || r.tenantId === tenantId).map(r => ({ ...r }));
        }
    };
}

function setup() {
    global.window = { CozyOS: {} };
    installStorageDouble();
    freshRequire(ORG_REGISTRY_PATH);
    freshRequire(ORG_MEMBERSHIP_PATH);
    freshRequire(FORMULA_REGISTRY_PATH);
    freshRequire(FORMULA_LIBRARY_PATH);
    freshRequire(CALC_ENGINE_PATH);
    freshRequire(BRE_PATH);
    freshRequire(BAI_PATH);

    const OrgRegistry = window.CozyOS.OrganizationRegistry;
    const Membership  = window.CozyOS.OrganizationMembership;
    const BRE         = window.CozyOS.BusinessRecordEngine;
    const BAI         = window.CozyOS.BusinessActivityIntelligence;

    const org = OrgRegistry.createOrganization({ name: 'Test Org A' });
    const otherOrg = OrgRegistry.createOrganization({ name: 'Test Org B' });

    const userId = 'user_owner';
    Membership.createMembership({
        userId, organizationId: org.orgId,
        permissions: [BRE.PERMISSIONS.CREATE, BRE.PERMISSIONS.READ, BAI.PERMISSIONS.READ]
    });
    Membership.createMembership({
        userId, organizationId: otherOrg.orgId,
        permissions: [BRE.PERMISSIONS.CREATE, BRE.PERMISSIONS.READ, BAI.PERMISSIONS.READ]
    });

    const noReadUserId = 'user_no_permission';
    Membership.createMembership({ userId: noReadUserId, organizationId: org.orgId, permissions: [] });

    return { OrgRegistry, Membership, BRE, BAI, org, otherOrg, userId, noReadUserId };
}

async function seedSale({ BRE, org, userId }, { name, quantity, buyingPrice, sellingPrice, createdAtOverride, applicationId = 'RetailOS', recordType = 'sale', extraFields = {} }) {
    const result = await BRE.createRecord({
        organizationId: org.orgId, applicationId, recordType, userId,
        fields: { name, quantity, buyingPrice, sellingPrice, ...extraFields }
    });
    assert.equal(result.success, true, result.reason);
    if (createdAtOverride) {
        // Directly patch storage for deterministic historical dates —
        // BusinessRecordEngine itself always stamps "now"; tests need
        // control over "when" to exercise period/trend/dormancy logic.
        const stored = await window.CozyStorage.get('business_records', result.record.id, org.orgId);
        await window.CozyStorage.update('business_records', result.record.id, { createdAt: createdAtOverride }, org.orgId);
    }
    return result.record;
}

// ── Daily / period summaries ──

test('dailySummary reports sales/purchases/expenses/gross-profit/net-result from real records', async () => {
    const ctx = setup();
    const { BAI, BRE, org, userId } = ctx;
    await seedSale(ctx, { name: 'Sugar', quantity: 10, buyingPrice: 100, sellingPrice: 150 });
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'purchase', userId, fields: { quantity: 10, buyingPrice: 100, sellingPrice: 100 } });
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'expense', userId, fields: { quantity: 1, buyingPrice: 200, sellingPrice: 200 } });

    const summary = await BAI.dailySummary({
        organizationId: org.orgId, applicationId: 'RetailOS', userId,
        valueFields: { sale: 'sales', purchase: 'cost', expense: 'cost' }
    });
    assert.equal(summary.success, true);
    assert.equal(summary.sales.value, 1500);
    assert.equal(summary.purchases.value, 1000);
    assert.equal(summary.expenses.value, 200);
    assert.equal(summary.grossProfit.value, 500);
    assert.equal(summary.netResult.value, 300);
});

test('missing expense data is reported as insufficient, never fabricated as zero', async () => {
    const ctx = setup();
    const { BAI, org, userId } = ctx;
    await seedSale(ctx, { name: 'Sugar', quantity: 10, buyingPrice: 100, sellingPrice: 150 });

    const summary = await BAI.dailySummary({ organizationId: org.orgId, applicationId: 'RetailOS', userId });
    assert.equal(summary.success, true);
    assert.equal(summary.sales.value, 1500);
    assert.equal(summary.purchases.available, false);
    assert.equal(summary.expenses.available, false);
    assert.equal(summary.grossProfit.available, false);
    assert.match(summary.grossProfit.reason, /Insufficient recorded data/);
});

test('periodSummary supports an arbitrary custom date range', async () => {
    const ctx = setup();
    const { BAI, org, userId } = ctx;
    await seedSale(ctx, { name: 'Sugar', quantity: 1, buyingPrice: 10, sellingPrice: 20, createdAtOverride: '2026-08-05T10:00:00.000Z' });
    const summary = await BAI.periodSummary({
        organizationId: org.orgId, applicationId: 'RetailOS', userId,
        preset: 'custom', from: '2026-08-01T00:00:00.000Z', to: '2026-08-10T23:59:59.999Z'
    });
    assert.equal(summary.success, true);
    assert.equal(summary.sales.value, 20);
});

// ── Trends / comparisons ──

test('salesTrend detects an increase between two named periods with an explainable message', async () => {
    const ctx = setup();
    const { BAI, org, userId } = ctx;
    await seedSale(ctx, { name: 'A', quantity: 1, buyingPrice: 10, sellingPrice: 100, createdAtOverride: '2026-07-15T10:00:00.000Z' }); // previous month: 100
    await seedSale(ctx, { name: 'A', quantity: 1, buyingPrice: 10, sellingPrice: 300, createdAtOverride: '2026-08-15T10:00:00.000Z' }); // this month: 300

    const trend = await BAI.salesTrend({
        organizationId: org.orgId, applicationId: 'RetailOS', userId,
        currentPreset: 'thisMonth', previousPreset: 'previousMonth', referenceDate: '2026-08-20T00:00:00.000Z'
    });
    assert.equal(trend.success, true);
    assert.equal(trend.status, 'increase');
    assert.equal(trend.currentValue, 300);
    assert.equal(trend.previousValue, 100);
    assert.match(trend.message, /increased/);
    assert.match(trend.message, /200%/);
});

test('profitTrend reports insufficient-history when the previous period has no data', async () => {
    const ctx = setup();
    const { BAI, org, userId } = ctx;
    await seedSale(ctx, { name: 'A', quantity: 1, buyingPrice: 10, sellingPrice: 100, createdAtOverride: '2026-08-15T10:00:00.000Z' });

    const trend = await BAI.profitTrend({
        organizationId: org.orgId, applicationId: 'RetailOS', userId,
        currentPreset: 'thisMonth', previousPreset: 'previousMonth', referenceDate: '2026-08-20T00:00:00.000Z'
    });
    assert.equal(trend.success, true);
    assert.equal(trend.status, 'insufficient-history');
});

// ── Product activity / dormant detection ──

test('productActivity flags a dormant product with explainable evidence', async () => {
    const ctx = setup();
    const { BAI, org, userId } = ctx;
    await seedSale(ctx, { name: 'Cement', quantity: 5, buyingPrice: 500, sellingPrice: 600, createdAtOverride: '2026-06-01T00:00:00.000Z', extraFields: { productId: 'P1' } });

    const activity = await BAI.productActivity({
        organizationId: org.orgId, applicationId: 'RetailOS', userId, recordType: 'sale',
        dormantDays: 30, referenceDate: '2026-08-27T00:00:00.000Z'
    });
    assert.equal(activity.success, true);
    assert.equal(activity.available, true);
    assert.equal(activity.observations.length, 1);
    assert.equal(activity.observations[0].type, 'PRODUCT_NOT_SOLD');
    assert.equal(activity.observations[0].entityId, 'P1');
    assert.ok(activity.observations[0].evidence.sourceRecordIds.length > 0);
});

test('productActivity reports unavailable when no records carry the product field', async () => {
    const ctx = setup();
    const { BAI, org, userId } = ctx;
    await seedSale(ctx, { name: 'Cement', quantity: 5, buyingPrice: 500, sellingPrice: 600 }); // no productId field
    const activity = await BAI.productActivity({ organizationId: org.orgId, applicationId: 'RetailOS', userId, recordType: 'sale' });
    assert.equal(activity.available, false);
    assert.match(activity.reason, /Insufficient recorded data/);
});

// ── Low-stock intelligence ──

test('lowStockObservations is unavailable when no inventory record type is configured', async () => {
    const ctx = setup();
    const { BAI, org, userId } = ctx;
    const result = await BAI.lowStockObservations({ organizationId: org.orgId, applicationId: 'RetailOS', userId });
    assert.equal(result.available, false);
    assert.match(result.reason, /Insufficient recorded data/);
});

test('lowStockObservations is unavailable when no threshold is configured (no invented universal threshold)', async () => {
    const ctx = setup();
    const { BAI, BRE, org, userId } = ctx;
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'inventory', userId, fields: { productId: 'P1', quantityOnHand: 2 } });
    const result = await BAI.lowStockObservations({ organizationId: org.orgId, applicationId: 'RetailOS', userId, inventoryRecordType: 'inventory' });
    assert.equal(result.available, false);
    assert.match(result.reason, /No stock threshold configured/);
});

test('lowStockObservations flags a product at or below a configured threshold', async () => {
    const ctx = setup();
    const { BAI, BRE, org, userId } = ctx;
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'inventory', userId, fields: { productId: 'P1', quantityOnHand: 2 } });
    const result = await BAI.lowStockObservations({ organizationId: org.orgId, applicationId: 'RetailOS', userId, inventoryRecordType: 'inventory', defaultThreshold: 5 });
    assert.equal(result.available, true);
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].type, 'LOW_STOCK');
});

// ── Supplier price intelligence ──

test('supplierPriceIntelligence detects a buying-price increase across two purchases', async () => {
    const ctx = setup();
    const { BAI, BRE, org, userId } = ctx;
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'purchase', userId, fields: { productId: 'Sugar', buyingPrice: 1180 } });
    await window.CozyStorage.list('business_records', org.orgId); // no-op, keeps timing deterministic
    const second = await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'purchase', userId, fields: { productId: 'Sugar', buyingPrice: 1250 } });
    await window.CozyStorage.update('business_records', second.record.id, { createdAt: new Date(Date.now() + 1000).toISOString() }, org.orgId);

    const result = await BAI.supplierPriceIntelligence({ organizationId: org.orgId, applicationId: 'RetailOS', userId, purchaseRecordType: 'purchase' });
    assert.equal(result.success, true);
    assert.equal(result.observations.length, 1);
    assert.equal(result.observations[0].evidence.previousPrice, 1180);
    assert.equal(result.observations[0].evidence.latestPrice, 1250);
    assert.match(result.observations[0].message, /increased/);
});

// ── Organization isolation & authorization ──

test('organization isolation: org B records never influence org A summary', async () => {
    const ctx = setup();
    const { BAI, BRE, org, otherOrg, userId } = ctx;
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'sale', userId, fields: { quantity: 1, buyingPrice: 1, sellingPrice: 100 } });
    await BRE.createRecord({ organizationId: otherOrg.orgId, applicationId: 'RetailOS', recordType: 'sale', userId, fields: { quantity: 1, buyingPrice: 1, sellingPrice: 9999 } });

    const summaryA = await BAI.dailySummary({ organizationId: org.orgId, applicationId: 'RetailOS', userId });
    assert.equal(summaryA.sales.value, 100);
});

test('unauthorized user is rejected (fail closed)', async () => {
    const ctx = setup();
    const { BAI, org, noReadUserId } = ctx;
    const result = await BAI.dailySummary({ organizationId: org.orgId, applicationId: 'RetailOS', userId: noReadUserId });
    assert.equal(result.success, false);
    assert.match(result.reason, /not authorized/);
});

test('missing organization context is rejected (fail closed)', async () => {
    const ctx = setup();
    const { BAI, userId } = ctx;
    const result = await BAI.dailySummary({ applicationId: 'RetailOS', userId });
    assert.equal(result.success, false);
    assert.match(result.reason, /organizationId is required/);
});

test('unknown organization is rejected (fail closed)', async () => {
    const ctx = setup();
    const { BAI, userId } = ctx;
    const result = await BAI.dailySummary({ organizationId: 'org_does_not_exist', applicationId: 'RetailOS', userId });
    assert.equal(result.success, false);
    assert.match(result.reason, /does not exist/);
});

// ── Anomaly observations ──

test('anomalyObservations reports insufficient history below the minimum sample size', async () => {
    const ctx = setup();
    const { BAI, BRE, org, userId } = ctx;
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'sale', userId, fields: { quantity: 1, buyingPrice: 1, sellingPrice: 100 } });
    const result = await BAI.anomalyObservations({ organizationId: org.orgId, applicationId: 'RetailOS', userId, recordType: 'sale', valueField: 'sales' });
    assert.equal(result.available, false);
    assert.match(result.reason, /Insufficient recorded history/);
});

test('anomalyObservations flags an unusually large amount against a real baseline', async () => {
    const ctx = setup();
    const { BAI, BRE, org, userId } = ctx;
    for (let i = 0; i < 5; i++) {
        await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'sale', userId, fields: { quantity: 1, buyingPrice: 1, sellingPrice: 100 } });
    }
    const spike = await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'sale', userId, fields: { quantity: 1, buyingPrice: 1, sellingPrice: 5000 } });

    const result = await BAI.anomalyObservations({ organizationId: org.orgId, applicationId: 'RetailOS', userId, recordType: 'sale', valueField: 'sales', thresholdMultiple: 3 });
    assert.equal(result.available, true);
    assert.ok(result.observations.some(o => o.entityId === spike.record.id));
});

// ── Pending activity ──

test('pendingActivity surfaces only application-provided pending statuses', async () => {
    const ctx = setup();
    const { BAI, BRE, org, userId } = ctx;
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'sale', userId, fields: { quantity: 1, buyingPrice: 1, sellingPrice: 100, status: 'pending' } });
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'sale', userId, fields: { quantity: 1, buyingPrice: 1, sellingPrice: 100, status: 'confirmed' } });

    const result = await BAI.pendingActivity({ organizationId: org.orgId, applicationId: 'RetailOS', userId, recordType: 'sale' });
    assert.equal(result.available, true);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].status, 'pending');
});

test('pendingActivity reports unavailable when no records carry a status field', async () => {
    const ctx = setup();
    const { BAI, BRE, org, userId } = ctx;
    await BRE.createRecord({ organizationId: org.orgId, applicationId: 'RetailOS', recordType: 'sale', userId, fields: { quantity: 1, buyingPrice: 1, sellingPrice: 100 } });
    const result = await BAI.pendingActivity({ organizationId: org.orgId, applicationId: 'RetailOS', userId, recordType: 'sale' });
    assert.equal(result.available, false);
});

// ── Version guard / duplicate load ──

test('duplicate load of the same version is a no-op, not a re-registration', () => {
    const ctx = setup();
    const before = ctx.BAI;
    freshRequire(BAI_PATH);
    assert.equal(window.CozyOS.BusinessActivityIntelligence, before);
});
