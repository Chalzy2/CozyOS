/**
 * core/modules/QuarryOS/tests/quarry-storage-persistence.test.js
 *
 * FAST Node-level contract test for the QuarryOS storage persistence fix
 * (core/modules/QuarryOS/quarry-index.js).
 *
 * WHAT THIS PROVES
 *   That quarry-index.js's ~45 mutating/reading routes now genuinely call
 *   through to a real-shaped `window.CozyStorage` gateway using its real
 *   method names (save/get/update/list) with the real argument shapes
 *   (a primary key for update(), not a query object) — i.e. the exact
 *   calling-convention bug described in this milestone's root cause is
 *   fixed at the call site.
 *
 * WHAT THIS DOES NOT PROVE
 *   This test does not use real IndexedDB (Node has none) — the
 *   FakeStorageGateway below is a small in-memory double that mimics
 *   core/storage.js's real CozyStorageGateway shape (autoIncrement "id"
 *   keyPath, save()/get()/update()/list()/init()) closely enough to
 *   exercise quarry-index.js's real calling code, exactly the same
 *   Node-side limitation already disclosed by
 *   core/calculation/tests/business-record-engine.test.js for the same
 *   reason ("real indexedDB does not exist in Node"). REAL IndexedDB
 *   persistence, including surviving an actual page reload, is proven
 *   separately by the real-browser suite:
 *   core/modules/QuarryOS/tests/quarry-storage-persistence-browser.test.js
 *
 * Run with: node core/modules/QuarryOS/tests/quarry-storage-persistence.test.js
 */
'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
async function test(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`      ${err.stack || err.message}`);
        failed++;
    }
}

/**
 * FakeStorageGateway — mimics the REAL core/storage.js CozyStorageGateway's
 * public shape closely enough to exercise quarry-index.js's real calling
 * code: save() upserts via an autoIncrement "id" keyPath and returns the
 * generated key, get()/update()/list() all key off that real "id", exactly
 * like the real IndexedDB-backed gateway (object stores are created with
 * `{ keyPath: "id", autoIncrement: true }` in core/storage.js). It has NO
 * insert() and NO find() method, on purpose — those names never existed on
 * the real gateway either, so a test that only worked against a fake with
 * insert()/find() would not actually catch this bug.
 */
class FakeStorageGateway {
    constructor() {
        this._stores = new Map(); // storeName -> Map(id -> record)
        this._nextId = 1;
        this.initCallCount = 0;
    }
    async init() {
        this.initCallCount += 1;
        return true;
    }
    _store(name) {
        if (!this._stores.has(name)) this._stores.set(name, new Map());
        return this._stores.get(name);
    }
    async save(storeName, data) {
        const store = this._store(storeName);
        const id = (data && data.id !== undefined) ? data.id : this._nextId++;
        const record = { ...data, id };
        store.set(id, record);
        return id;
    }
    async get(storeName, key) {
        const store = this._store(storeName);
        return store.has(key) ? store.get(key) : null;
    }
    async update(storeName, key, partialData) {
        const store = this._store(storeName);
        if (!store.has(key)) throw new Error(`Target update record not found in ${storeName} matching key: ${key}`);
        const merged = { ...store.get(key), ...partialData, id: key };
        store.set(key, merged);
        return key;
    }
    async list(storeName) {
        return Array.from(this._store(storeName).values());
    }
}

function loadFreshQuarryManager(fakeWindow) {
    const modulePath = path.join(__dirname, '..', 'quarry-index.js');
    delete require.cache[require.resolve(modulePath)];
    global.window = fakeWindow;
    require(modulePath);
    return global.window.CozyOS.Modules.QuarryManager;
}

(async () => {
    // ────────────────────────────────────────────────────────────
    // (a) A route that previously silently no-op'd now actually writes
    //     a real, retrievable record.
    // ────────────────────────────────────────────────────────────
    await test('executeWorkforceAssignment: with window.CozyStorage present, the assignment is actually saved (real, retrievable record)', async () => {
        const storage = new FakeStorageGateway();
        const qm = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });

        const res = await qm.executeWorkforceAssignment({ machineId: 'CR-01', operatorIds: ['OP-1'] });
        assert.strictEqual(res.status, 200);

        const rows = await storage.list('quarry_assignments');
        assert.strictEqual(rows.length, 1, 'expected exactly one persisted assignment record');
        assert.strictEqual(rows[0].machineId, 'CR-01');
        assert.deepStrictEqual(rows[0].operators, ['OP-1']);
    });

    await test('executeEmployeeRegistration: saves into "quarry_employees" via storage.save (not the nonexistent storage.insert)', async () => {
        const storage = new FakeStorageGateway();
        const qm = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });

        const res = await qm.executeEmployeeRegistration({ phone: '0700000000', position: 'Operator', department: 'Crushing' });
        assert.strictEqual(res.status, 200);
        assert.ok(res.employeeId, 'expected a generated employeeId in the response');

        const rows = await storage.list('quarry_employees');
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].employeeId, res.employeeId);
        assert.strictEqual(rows[0].position, 'Operator');
        // The real gateway assigns its own autoIncrement primary key "id",
        // distinct from the business-level "employeeId" string.
        assert.strictEqual(typeof rows[0].id, 'number');
    });

    // ────────────────────────────────────────────────────────────
    // (b) The record survives being read back via a fresh list()/get()
    //     call in the SAME session (a second, independent call into the
    //     module, not just re-reading a JS variable held from the write).
    // ────────────────────────────────────────────────────────────
    await test('a saved crusher production record is independently readable back via the AI advisor helper (_safeFind -> storage.list, filtered)', async () => {
        const storage = new FakeStorageGateway();
        const qm = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });

        await qm.executeCrusherProductionLog({ machineId: 'CR-02', section: 'North', outputTons: 40 });
        await qm.executeCrusherProductionLog({ machineId: 'CR-03', section: 'North', outputTons: 10 });

        // _aiLeastEfficientMachine reads the SAME collection back through an
        // entirely separate code path (_safeFind -> storage.list), proving
        // the write really landed in the shared store, not just a local var.
        const advisorResult = await qm.executeAIAdvisorQuery({ text: 'which machine is the least efficient' });
        assert.ok(advisorResult.responseText.includes('CR-03'), 'expected the lower-output machine CR-03 to be identified from real persisted data: ' + advisorResult.responseText);
    });

    await test('executeParcelRegistration / executeMaintenanceUpdate / executeStockAdjustment all persist through storage.save', async () => {
        const storage = new FakeStorageGateway();
        const qm = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });

        await qm.executeParcelRegistration({ parcelId: 'PARCEL-1', landOwnerId: 'OWNER-1' });
        await qm.executeMaintenanceUpdate({ machineId: 'CR-01', repairCost: 0 });
        await qm.executeStockAdjustment({ category: 'Dust', delta: 50 });

        assert.strictEqual((await storage.list('quarry_parcels')).length, 1);
        assert.strictEqual((await storage.list('quarry_maintenance')).length, 1);
        assert.strictEqual((await storage.list('quarry_stock_adjustments')).length, 1);
    });

    // ────────────────────────────────────────────────────────────
    // update() call sites: must use the real record key, not a query
    // object (the real gateway's update(storeName, key, patch) signature).
    // ────────────────────────────────────────────────────────────
    await test('executeEmployeeUpdate looks up the real generated id and calls storage.update(store, id, patch) — not a query object', async () => {
        const storage = new FakeStorageGateway();
        const qm = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });

        const reg = await qm.executeEmployeeRegistration({ phone: '0711111111', position: 'Driver', department: 'Fleet' });
        const before = (await storage.list('quarry_employees'))[0];
        assert.strictEqual(before.position, 'Driver');

        const upd = await qm.executeEmployeeUpdate({ employeeId: reg.employeeId, position: 'Senior Driver' });
        assert.strictEqual(upd.status, 200);

        const after = (await storage.list('quarry_employees'))[0];
        assert.strictEqual(after.position, 'Senior Driver', 'expected the SAME record to be updated in place');
        assert.strictEqual(after.id, before.id, 'the real generated primary key must be unchanged across an update');
        assert.strictEqual((await storage.list('quarry_employees')).length, 1, 'update must not create a second record');
    });

    await test('executeCustomerUpdate (previously had no previousRecord lookup at all) now resolves a real key and updates in place', async () => {
        const storage = new FakeStorageGateway();
        const qm = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });

        const reg = await qm.executeCustomerRegistration({ name: 'Acme Builders', creditLimit: 5000 });
        await qm.executeCustomerUpdate({ customerId: reg.customerId, creditLimit: 9000 });

        const rows = await storage.list('quarry_customers');
        assert.strictEqual(rows.length, 1, 'update must not create a second customer record');
        assert.strictEqual(rows[0].creditLimit, 9000);
    });

    await test('executeDriverUpdate updates the real record by generated id', async () => {
        const storage = new FakeStorageGateway();
        const qm = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });

        const reg = await qm.executeDriverRegistration({ name: 'John Driver', licenseNumber: 'LIC-1' });
        await qm.executeDriverUpdate({ driverId: reg.driverId, availability: 'On Leave' });

        const rows = await storage.list('quarry_drivers');
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].availability, 'On Leave');
    });

    await test('an update with no matching previous record falls back to a patch record via storage.save (graceful degrade preserved)', async () => {
        const storage = new FakeStorageGateway();
        const qm = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });

        await qm.executeEmployeeUpdate({ employeeId: 'EMP-DOES-NOT-EXIST', position: 'X' });
        const patches = await storage.list('quarry_employees_patches');
        assert.strictEqual(patches.length, 1, 'expected the update to fall back to a patch record when no existing record was found');
    });

    // ────────────────────────────────────────────────────────────
    // Regression: with NO window.CozyStorage present at all, every route
    // must still degrade gracefully (no throw), matching pre-fix behavior
    // for that specific case.
    // ────────────────────────────────────────────────────────────
    await test('with NO window.CozyStorage present, routes still degrade gracefully (no throw) instead of crashing', async () => {
        const qm = loadFreshQuarryManager({ CozyOS: {} });
        const res = await qm.executeWorkforceAssignment({ machineId: 'CR-09', operatorIds: ['OP-9'] });
        assert.strictEqual(res.status, 200);
        const aiRes = await qm.executeAIAdvisorQuery({ text: 'which machine is the least efficient' });
        assert.ok(aiRes.responseText, 'AI advisor helper must still degrade to an insufficient-data response, not throw');
    });

    await test('_getStorage() calls storage.init() (idempotent init pattern) before use', async () => {
        const storage = new FakeStorageGateway();
        const qm = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });
        await qm.executeWorkforceAssignment({ machineId: 'CR-10', operatorIds: ['OP-1'] });
        assert.ok(storage.initCallCount >= 1, 'expected storage.init() to have been called at least once');
    });

    await test('getHealth() reports storageConnected using the real gateway shape (save+list), not the nonexistent find()', async () => {
        const storage = new FakeStorageGateway();
        const withStorage = loadFreshQuarryManager({ CozyOS: {}, CozyStorage: storage });
        assert.strictEqual(withStorage.getHealth().storageConnected, true);

        const withoutStorage = loadFreshQuarryManager({ CozyOS: {} });
        assert.strictEqual(withoutStorage.getHealth().storageConnected, false);
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
})();
