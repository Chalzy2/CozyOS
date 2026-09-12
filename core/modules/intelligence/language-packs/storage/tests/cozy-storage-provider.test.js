/**
 * core/modules/intelligence/language-packs/storage/tests/cozy-storage-provider.test.js
 * RP-035 COS-LANG-PM-001 — real, executed tests for cozy-storage-provider.js
 * Run with: node core/modules/intelligence/language-packs/storage/tests/cozy-storage-provider.test.js
 */
'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
async function test(name, fn) {
    try {
        await fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.message}`);
        failed++;
    }
}

function loadModule(fakeWindow) {
    const modulePath = path.join(__dirname, '..', 'cozy-storage-provider.js');
    delete require.cache[require.resolve(modulePath)];
    global.window = fakeWindow;
    require(modulePath);
    return global.window.CozyOS.CozyStorageProvider;
}

(async () => {
    await test('with NO real engines present, every provider degrades honestly (no fabricated AVAILABLE)', async () => {
        const api = loadModule({ CozyOS: {} });
        const caps = await api.getAllCapabilities();
        assert.strictEqual(caps.INTERNAL_INDEXEDDB.read, 'UNAVAILABLE');
        assert.strictEqual(caps.EXTERNAL_DIRECTORY.read, 'UNAVAILABLE');
        assert.strictEqual(caps.SD_CARD_DIRECT.read, 'UNAVAILABLE');
        assert.strictEqual(caps.ANDROID_NATIVE_BRIDGE.read, 'NOT_IMPLEMENTED');
    });

    await test('SD_CARD_DIRECT NEVER reports AVAILABLE regardless of what other engines are present', async () => {
        const api = loadModule({
            CozyOS: {
                Storage: { save: () => {}, get: () => {}, list: () => {}, delete: () => {}, health: async () => ({ databaseConnected: true }) },
                UniversalFileEngine: { capabilities: () => ({ 'local-filesystem': true }) }
            },
            showDirectoryPicker: async () => ({})
        });
        const caps = await api.getAllCapabilities();
        for (const key of Object.keys(caps.SD_CARD_DIRECT)) {
            if (key === 'note') continue;
            assert.strictEqual(caps.SD_CARD_DIRECT[key], 'UNAVAILABLE', `SD_CARD_DIRECT.${key} must never be anything but UNAVAILABLE from this app context`);
        }
        const status = await api.getProvider('SD_CARD_DIRECT').getStatus();
        assert.strictEqual(status.status, 'STORAGE_UNAVAILABLE');
        assert.ok(status.bridge.includes('termux'));
    });

    await test('INTERNAL_INDEXEDDB reports AVAILABLE only when a real gateway with the required methods is present', async () => {
        const withGateway = loadModule({ CozyOS: { Storage: { save: () => {}, get: () => {}, list: () => {}, delete: () => {} } } });
        const capsWith = await withGateway.getAllCapabilities();
        assert.strictEqual(capsWith.INTERNAL_INDEXEDDB.read, 'AVAILABLE');

        const withoutGateway = loadModule({ CozyOS: {} });
        const capsWithout = await withoutGateway.getAllCapabilities();
        assert.strictEqual(capsWithout.INTERNAL_INDEXEDDB.read, 'UNAVAILABLE');
    });

    await test('INTERNAL_INDEXEDDB freeSpace/totalSpace are honestly NOT_IMPLEMENTED, never a fabricated number', async () => {
        const api = loadModule({ CozyOS: { Storage: { save: () => {}, get: () => {}, list: () => {}, delete: () => {} } } });
        const caps = await api.getAllCapabilities();
        assert.strictEqual(caps.INTERNAL_INDEXEDDB.freeSpace, 'NOT_IMPLEMENTED');
        assert.strictEqual(caps.INTERNAL_INDEXEDDB.totalSpace, 'NOT_IMPLEMENTED');
        const free = await api.getProvider('INTERNAL_INDEXEDDB').getFreeSpace();
        assert.strictEqual(free.bytes, null);
        assert.strictEqual(free.state, 'NOT_IMPLEMENTED');
    });

    await test('EXTERNAL_DIRECTORY reports UNAVAILABLE when File System Access API is absent (the real Android-browser case)', async () => {
        const api = loadModule({ CozyOS: { UniversalFileEngine: { capabilities: () => ({ 'local-filesystem': false }) } } });
        const caps = await api.getAllCapabilities();
        assert.strictEqual(caps.EXTERNAL_DIRECTORY.read, 'UNAVAILABLE');
        const status = await api.getProvider('EXTERNAL_DIRECTORY').getStatus();
        assert.strictEqual(status.status, 'STORAGE_UNAVAILABLE');
        assert.strictEqual(status.reason, 'FILE_SYSTEM_ACCESS_API_NOT_SUPPORTED');
    });

    await test('EXTERNAL_DIRECTORY reports PERMISSION_REQUIRED (not AVAILABLE) when API exists but no folder is connected yet', async () => {
        const api = loadModule({ CozyOS: { UniversalFileEngine: { capabilities: () => ({ 'local-filesystem': true }) } } });
        const caps = await api.getAllCapabilities();
        assert.strictEqual(caps.EXTERNAL_DIRECTORY.read, 'PERMISSION_REQUIRED');
    });

    await test('ANDROID_NATIVE_BRIDGE is NOT_IMPLEMENTED when no real bridge is registered (confirmed absent, not assumed)', async () => {
        const api = loadModule({ CozyOS: {} });
        const bridge = api.detectAndroidNativeBridge();
        assert.strictEqual(bridge, null);
    });

    await test('ANDROID_NATIVE_BRIDGE delegates to a real bridge if one registers itself (future-proofing, never invented here)', async () => {
        const fakeBridge = { isAvailable: () => true, getCapabilities: () => ({ read: 'AVAILABLE' }) };
        const api = loadModule({ CozyOS: { NativeStorageBridge: fakeBridge } });
        const bridge = api.detectAndroidNativeBridge();
        assert.strictEqual(bridge, fakeBridge);
    });

    await test('choosePreferredProvider defaults to INTERNAL_INDEXEDDB when no external directory is connected', async () => {
        const api = loadModule({ CozyOS: {} });
        const choice = await api.choosePreferredProvider();
        assert.strictEqual(choice, 'INTERNAL_INDEXEDDB');
    });

    await test('all four PROVIDER_TYPES are covered by getAllCapabilities/getAllStatus', async () => {
        const api = loadModule({ CozyOS: {} });
        const caps = await api.getAllCapabilities();
        const statuses = await api.getAllStatus();
        assert.deepStrictEqual(Object.keys(caps).sort(), [...api.PROVIDER_TYPES].sort());
        assert.deepStrictEqual(Object.keys(statuses).sort(), [...api.PROVIDER_TYPES].sort());
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exitCode = failed > 0 ? 1 : 0;
})();
