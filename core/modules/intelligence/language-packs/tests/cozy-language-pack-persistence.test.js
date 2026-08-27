/**
 * core/modules/intelligence/language-packs/tests/cozy-language-pack-persistence.test.js
 * RP-035 Phase 1 — real, executed tests for cozy-language-pack-persistence.js
 * Run with: node core/modules/intelligence/language-packs/tests/cozy-language-pack-persistence.test.js
 *
 * NOTE ON SCOPE: core/storage.js talks to the browser's real IndexedDB,
 * which does not exist in this Node test environment. Consistent with
 * this repository's own existing test convention (see
 * cozy-language-pack-registry.test.js, which also fakes `window`
 * end-to-end), this file uses a hand-written fake CozyStorage gateway
 * that implements the SAME async save/get/list/delete/initModule/init
 * method shapes as the real core/storage.js. It is disclosed here as a
 * fake, not presented as a real IndexedDB integration test. A real
 * browser-environment integration test is a documented future
 * dependency (see Phase 1 report, "known limitations").
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.stack || err.message}`); failed++; }
}
async function asyncTest(name, fn) {
    try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.stack || err.message}`); failed++; }
}

function makeFakeRealStorage(sharedTables) {
    // sharedTables: { [storeName]: Map<id, record> } — passed in so two
    // separate "app loads" can share the same underlying data, letting
    // us test that a reload does not erase persisted data.
    let initialized = false;
    let boundContext = null;
    return {
        initModule(tenantId, moduleContext) {
            if (!tenantId) throw new Error('tenantId required');
            boundContext = moduleContext;
        },
        async init() { initialized = true; return true; },
        async save(storeName, data) {
            if (!initialized) throw new Error('not initialized');
            const table = sharedTables[storeName] || (sharedTables[storeName] = new Map());
            const id = data.id != null ? data.id : `auto_${table.size + 1}`;
            table.set(id, Object.assign({}, data, { id }));
            return id;
        },
        async get(storeName, key) {
            const table = sharedTables[storeName];
            return table && table.has(key) ? table.get(key) : null;
        },
        async list(storeName) {
            const table = sharedTables[storeName];
            return table ? Array.from(table.values()) : [];
        },
        async delete(storeName, key) {
            const table = sharedTables[storeName];
            if (table) table.delete(key);
            return true;
        },
        _wasInitialized: () => initialized,
        _boundContext: () => boundContext
    };
}

function loadFresh(fakeWindow) {
    const registryPath = path.join(__dirname, '..', 'cozy-language-pack-registry.js');
    const persistencePath = path.join(__dirname, '..', 'cozy-language-pack-persistence.js');
    delete require.cache[require.resolve(registryPath)];
    delete require.cache[require.resolve(persistencePath)];
    global.window = fakeWindow;
    require(registryPath);
    require(persistencePath);
    return fakeWindow.CozyOS.CozyLanguagePackPersistence;
}

(async function run() {
    console.log('cozy-language-pack-persistence.js — Phase 1 tests\n');

    await asyncTest('reports IN_MEMORY_ONLY honestly when no real gateway exists', async () => {
        const fakeWindow = {};
        const persistence = loadFresh(fakeWindow);
        assert.strictEqual(persistence.isPersistenceAvailable(), false);
        const result = await persistence.initializePersistentRegistry({ tenantId: 'tenant_a' });
        assert.strictEqual(result.storageState, 'IN_MEMORY_ONLY');
        assert.strictEqual(result.packsInMemory, 17);
    });

    await asyncTest('all 17 languages initialize and remain REGISTERED/NOT_READY through persistence init', async () => {
        const tables = {};
        const fakeWindow = { CozyStorage: makeFakeRealStorage(tables) };
        const persistence = loadFresh(fakeWindow);
        const result = await persistence.initializePersistentRegistry({ tenantId: 'tenant_b' });
        assert.strictEqual(result.storageState, 'PERSISTENT');
        const packs = fakeWindow.CozyOS.CozyLanguagePacks.listPacks();
        assert.strictEqual(packs.length, 17);
        packs.forEach((p) => {
            assert.strictEqual(p.status, 'REGISTERED');
            assert.strictEqual(p.resourceState, 'NOT_READY');
        });
    });

    await asyncTest('no vocabulary is fabricated — every persisted pack has zero counts', async () => {
        const tables = {};
        const fakeWindow = { CozyStorage: makeFakeRealStorage(tables) };
        const persistence = loadFresh(fakeWindow);
        await persistence.initializePersistentRegistry({ tenantId: 'tenant_c' });
        const stored = Array.from(tables['language_packs'].values());
        assert.strictEqual(stored.length, 17);
        stored.forEach((p) => {
            assert.strictEqual(p.counts.submitted, 0);
            assert.strictEqual(p.counts.validated, 0);
        });
    });

    await asyncTest('language-pack registry state persists to the real backend', async () => {
        const tables = {};
        const fakeWindow = { CozyStorage: makeFakeRealStorage(tables) };
        const persistence = loadFresh(fakeWindow);
        await persistence.initializePersistentRegistry({ tenantId: 'tenant_d' });
        assert.ok(tables['language_packs']);
        assert.ok(tables['language_packs'].has('sw'));
        const sw = tables['language_packs'].get('sw');
        assert.strictEqual(sw.identity.languageId, 'sw');
    });

    await asyncTest('a second "app load" against the SAME backend does not erase persisted data (reload safety)', async () => {
        const tables = {};
        const fakeWindowFirstLoad = { CozyStorage: makeFakeRealStorage(tables) };
        const persistence1 = loadFresh(fakeWindowFirstLoad);
        await persistence1.initializePersistentRegistry({ tenantId: 'tenant_e' });
        const countAfterFirstLoad = tables['language_packs'].size;
        assert.strictEqual(countAfterFirstLoad, 17);

        // Simulate reload: fresh module instances, SAME underlying tables.
        const fakeWindowSecondLoad = { CozyStorage: makeFakeRealStorage(tables) };
        const persistence2 = loadFresh(fakeWindowSecondLoad);
        const result2 = await persistence2.initializePersistentRegistry({ tenantId: 'tenant_e' });
        assert.strictEqual(result2.restoredFromStorage, 17, 'second load should observe 17 pre-existing records');
        assert.strictEqual(tables['language_packs'].size, 17, 'reload must not erase records');
    });

    await asyncTest('createRealBackend adapts to the {get,set,remove,list} shape the registry expects', async () => {
        const tables = {};
        const fakeWindow = { CozyStorage: makeFakeRealStorage(tables) };
        const persistence = loadFresh(fakeWindow);
        await persistence.ensureInitialized('tenant_f');
        const backend = persistence.createRealBackend('dictionary', 'tenant_f');
        const setOk = await backend.set('word_1', { languageId: 'sw', term: 'shule' });
        assert.strictEqual(setOk, true);
        const got = await backend.get('word_1');
        assert.strictEqual(got.term, 'shule');
        const keys = await backend.list('');
        assert.ok(keys.includes('word_1'));
        const removed = await backend.remove('word_1');
        assert.strictEqual(removed, true);
    });

    await asyncTest('ensureInitialized degrades honestly (no throw) when gateway.init() rejects', async () => {
        const fakeWindow = {
            CozyStorage: {
                initModule() {},
                async init() { throw new Error('simulated IndexedDB failure'); },
                async save() {}, async get() { return null; }, async list() { return []; }, async delete() {}
            }
        };
        const persistence = loadFresh(fakeWindow);
        const result = await persistence.ensureInitialized('tenant_g');
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.reason, 'INIT_FAILED');
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
})();
