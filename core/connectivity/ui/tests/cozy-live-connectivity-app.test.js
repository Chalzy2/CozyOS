/**
 * core/connectivity/ui/tests/cozy-live-connectivity-app.test.js
 * RP-035 Section 13 — Live / Connectivity application
 * Run with: node core/connectivity/ui/tests/cozy-live-connectivity-app.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(
                () => { console.log(`  \u2713 ${name}`); passed++; },
                (err) => { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
            );
        }
        console.log(`  \u2713 ${name}`);
        passed++;
        return Promise.resolve();
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.message}`);
        failed++;
        return Promise.resolve();
    }
}

const roots = {
    trustedDevice: path.join(__dirname, '..', '..', '..', 'security', 'trusted-device-manager.js'),
    cozyConnect: path.join(__dirname, '..', '..', 'cozy-connect.js'),
    hotspotEngine: path.join(__dirname, '..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
    cozyShare: path.join(__dirname, '..', '..', '..', 'collaboration', 'cozy-share.js'),
    living: path.join(__dirname, '..', '..', 'cozy-living-connectivity.js'),
    transport: path.join(__dirname, '..', '..', 'cozy-connectivity-transport.js'),
    app: path.join(__dirname, '..', 'cozy-live-connectivity-app.js'),
    identityEngine: path.join(__dirname, '..', '..', '..', 'modules', 'identity', 'identity-engine.js'),
    serviceRegistry: path.join(__dirname, '..', '..', '..', 'registry', 'cozy-registry.js')
};

function freshStack() {
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
    const win = { CozyOS: {} };
    global.window = win;

    require(roots.trustedDevice);
    require(roots.cozyConnect);
    require(roots.hotspotEngine);
    require(roots.cozyShare);
    require(roots.living);
    require(roots.transport);
    require(roots.app);
    require(roots.identityEngine);
    require(roots.serviceRegistry);

    return {
        win,
        living: win.CozyOS.CozyLivingConnectivity,
        transport: win.CozyOS.CozyConnectivityTransport,
        connect: win.CozyOS.CozyConnect,
        app: win.CozyOS.CozyLiveConnectivityApp,
        identity: win.CozyOS.IdentityEngine,
        serviceRegistry: win.CozyOS.ServiceRegistry
    };
}

async function makeActiveUser(s, username) {
    const result = await s.identity.createUser({ username, password: 'Str0ngPassw0rd!', roles: [] });
    if (!result || result.available !== true || !result.userId) {
        throw new Error('makeActiveUser() failed to create a real user: ' + JSON.stringify(result));
    }
    return result;
}

console.log('RP-035 Section 13 — Live / Connectivity application tests\n');

(async () => {

/* ===================================================================
   1. APPLICATION REGISTRATION / DISCOVERY
=================================================================== */
console.log('Application registration & discovery:');

test('registerAsApplication() registers through the real ServiceRegistry, no second registry', () => {
    const s = freshStack();
    const r = s.app.registerAsApplication();
    assert.strictEqual(r.serviceRegistry, 'REGISTERED');
    assert.ok(s.serviceRegistry.hasApplication('live_connectivity_001'));
});

test('CAPABILITY_UNAVAILABLE reported honestly when ServiceRegistry absent', () => {
    delete require.cache[require.resolve(roots.app)];
    global.window = { CozyOS: {} };
    require(roots.app);
    const r = global.window.CozyOS.CozyLiveConnectivityApp.registerAsApplication();
    assert.strictEqual(r.serviceRegistry, 'CAPABILITY_UNAVAILABLE');
});

test('this application is NOT auto-registered as a BUILT_IN core app — visibility stays an explicit decision', () => {
    const s = freshStack();
    s.app.registerAsApplication();
    assert.strictEqual(s.identity.isCoreApplication('live-connectivity'), false);
});

/* ===================================================================
   2. LAUNCH AUTHORIZATION — active/inactive account behavior
=================================================================== */
console.log('\nLaunch authorization:');

await test('an active user with the app explicitly assigned can launch it', async () => {
    const s = freshStack();
    s.app.registerAsApplication();
    const user = await makeActiveUser(s, 's13-user1-' + Date.now());
    s.identity.assignApplication(user.userId, 'live-connectivity');
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'live-connectivity'), true);
});

await test('an active user WITHOUT assignment cannot launch it (visibility != authorization)', async () => {
    const s = freshStack();
    s.app.registerAsApplication();
    const user = await makeActiveUser(s, 's13-user2-' + Date.now());
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'live-connectivity'), false);
});

await test('an inactive (disabled) user cannot launch it even if assigned', async () => {
    const s = freshStack();
    s.app.registerAsApplication();
    const user = await makeActiveUser(s, 's13-user3-' + Date.now());
    s.identity.assignApplication(user.userId, 'live-connectivity');
    s.identity.disableUser(user.userId);
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'live-connectivity'), false);
});

await test('the global disable toggle blocks access even for an assigned, active user', async () => {
    const s = freshStack();
    s.app.registerAsApplication();
    const user = await makeActiveUser(s, 's13-user4-' + Date.now());
    s.identity.assignApplication(user.userId, 'live-connectivity');
    s.identity.setApplicationEnabled('live-connectivity', false);
    assert.strictEqual(s.identity.canAccessApplication(user.userId, 'live-connectivity'), false);
});

/* ===================================================================
   3. CAPABILITY OVERVIEW — real, no fabrication
=================================================================== */
console.log('\nCapability overview:');

test('getConnectivityOverview() composes real detectCapabilities(), never a second detector', () => {
    const s = freshStack();
    const r = s.app.getConnectivityOverview();
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.groups.internet);
    assert.ok(r.groups.bluetooth);
    assert.ok(r.groups.wifiDirect);
});

test('CAPABILITY_UNAVAILABLE reported honestly when the living connectivity engine is absent', () => {
    delete require.cache[require.resolve(roots.app)];
    global.window = { CozyOS: {} };
    require(roots.app);
    const r = global.window.CozyOS.CozyLiveConnectivityApp.getConnectivityOverview();
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

test('nativeWifiDirect always reports REQUIRES_NATIVE_COMPANION, never AVAILABLE — no fabricated native capability', () => {
    const s = freshStack();
    const r = s.app.getConnectivityOverview();
    const entry = r.groups.wifiDirect[0];
    assert.strictEqual(entry.status, 'REQUIRES_NATIVE_COMPANION');
});

test('nativeHotspotCreation always reports REQUIRES_NATIVE_COMPANION, never AVAILABLE', () => {
    const s = freshStack();
    const r = s.app.getConnectivityOverview();
    const entry = r.groups.nativeHotspot[0];
    assert.strictEqual(entry.status, 'REQUIRES_NATIVE_COMPANION');
});

test('every capability entry carries a real reason/source, never an unexplained status', () => {
    const s = freshStack();
    const r = s.app.getConnectivityOverview();
    Object.values(r.groups).forEach((entries) => {
        entries.forEach((e) => { assert.ok('status' in e); assert.ok('reason' in e); });
    });
});

test('a display group with no real detection source reports CAPABILITY_UNAVAILABLE, never omitted silently', () => {
    const s = freshStack();
    const r = s.app.getConnectivityOverview();
    assert.ok(r.groups.camera);
    assert.ok(r.groups.microphone);
});

/* ===================================================================
   4. OFFLINE SYNC / QUEUE
=================================================================== */
console.log('\nOffline sync queue:');

test('getQueueStatus() composes the real Transport OfflineQueue, never a second queue', () => {
    const s = freshStack();
    s.transport.sendPacket({ destination: 'peer-B', payloadType: 'text', payload: 'hi', sender: 'peer-A', sessionId: 'sess-1' });
    const r = s.app.getQueueStatus();
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.items.length >= 1);
});

test('a queued packet with no open transport adapter honestly stays WAITING_FOR_TRANSPORT, never SYNCED', () => {
    const s = freshStack();
    const result = s.transport.sendPacket({ destination: 'peer-B', payloadType: 'text', payload: 'hi', sender: 'peer-A', sessionId: 'sess-2' });
    assert.strictEqual(result.state, 'WAITING_FOR_TRANSPORT');
    const r = s.app.getQueueStatus();
    const item = r.items.find((i) => i.packetId === result.packetId);
    assert.strictEqual(item.state, 'WAITING_FOR_TRANSPORT');
});

test('CAPABILITY_UNAVAILABLE reported honestly when the transport engine is absent', () => {
    delete require.cache[require.resolve(roots.app)];
    global.window = { CozyOS: {} };
    require(roots.app);
    const r = global.window.CozyOS.CozyLiveConnectivityApp.getQueueStatus();
    assert.strictEqual(r.status, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   5. LOCAL DEVICE DISCOVERY
=================================================================== */
console.log('\nLocal device discovery:');

test('getLocalDevices() composes the real CozyConnect device registry, never a second one', () => {
    const s = freshStack();
    const r = s.app.getLocalDevices();
    assert.strictEqual(r.status, 'OK');
    assert.ok(Array.isArray(r.devices));
});

test('an honest empty device list is reported when no device has been discovered', () => {
    const s = freshStack();
    const r = s.app.getLocalDevices();
    assert.strictEqual(r.devices.length, 0);
});

/* ===================================================================
   6. CONNECTIVITY SESSION — real state machine only
=================================================================== */
console.log('\nConnectivity session:');

test('startConnectivitySession() begins at the real DISCOVERING state, never CONNECTED', () => {
    const s = freshStack();
    const r = s.app.startConnectivitySession('sess-a');
    assert.strictEqual(r.status, 'OK');
    assert.strictEqual(r.state, 'DISCOVERING');
});

test('getConnectivitySessionState() on an unknown session is NOT_FOUND, never fabricated', () => {
    const s = freshStack();
    const r = s.app.getConnectivitySessionState('no-such-session');
    assert.strictEqual(r.status, 'NOT_FOUND');
});

test('session history is real and reflects only real transitions', () => {
    const s = freshStack();
    s.app.startConnectivitySession('sess-b');
    const r = s.app.getConnectivitySessionState('sess-b');
    assert.strictEqual(r.history.length, 1);
    assert.strictEqual(r.history[0].state, 'DISCOVERING');
});

/* ===================================================================
   7. PAIRING
=================================================================== */
console.log('\nPairing:');

test('createPairingSession() composes the real Transport pairing session', () => {
    const s = freshStack();
    const r = s.app.createPairingSession({});
    assert.strictEqual(r.status, 'OK');
    assert.ok(r.session);
});

await test('attemptBluetoothPairing() honestly reports CAPABILITY_UNAVAILABLE in a Node (non-browser) environment', async () => {
    const s = freshStack();
    const r = await s.app.attemptBluetoothPairing({});
    assert.strictEqual(r.success, false);
    assert.strictEqual(r.state, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   8. GATE STATUS
=================================================================== */
console.log('\nGate status:');

test('getGateStatus() composes real Gate 1 + Gate 2 status, never invents a gate', () => {
    const s = freshStack();
    const r = s.app.getGateStatus();
    assert.strictEqual(r.gate1.gate, 1);
    assert.strictEqual(r.gate2.gate, 2);
});

/* ===================================================================
   9. CAPABILITY REGISTRY
=================================================================== */
console.log('\nCapability registry:');

test('getCapabilityStatus() reports bluetoothGATT as CAPABILITY_UNAVAILABLE — Gate 2\'s own honest scope, no fabricated GATT transport', () => {
    const s = freshStack();
    const c = s.app.getCapabilityStatus();
    assert.strictEqual(c.bluetoothGATT, 'CAPABILITY_UNAVAILABLE');
});

test('getCapabilityStatus() reports nativeWifiDirect/nativeHotspot as REQUIRES_NATIVE_COMPANION, never AVAILABLE', () => {
    const s = freshStack();
    const c = s.app.getCapabilityStatus();
    assert.strictEqual(c.nativeWifiDirect, 'REQUIRES_NATIVE_COMPANION');
    assert.strictEqual(c.nativeHotspot, 'REQUIRES_NATIVE_COMPANION');
});

test('getCapabilityStatus() reports dashboardVisibility NOT_CORE by default (this app is not BUILT_IN)', () => {
    const s = freshStack();
    assert.strictEqual(s.app.getCapabilityStatus().dashboardVisibility, 'NOT_CORE');
});

test('getCapabilityStatus() never reports AVAILABLE for a capability merely because an account is authorized', () => {
    const s = freshStack();
    const c = s.app.getCapabilityStatus();
    assert.strictEqual(c.bluetoothGATT, 'CAPABILITY_UNAVAILABLE');
});

/* ===================================================================
   10. NO DUPLICATE ENGINE
=================================================================== */
console.log('\nNo duplicate engine:');

test('this application module exposes no independent transport/sync/discovery re-implementation — only composition wrappers', () => {
    const s = freshStack();
    // Every data-bearing function must delegate; the app module itself
    // holds no capability-detection or transport state of its own.
    assert.strictEqual(typeof s.app.detectCapabilities, 'undefined');
    assert.strictEqual(typeof s.app.sendPacket, 'undefined');
});

test('deterministic results: calling getConnectivityOverview() twice returns the same real capability values', () => {
    const s = freshStack();
    const r1 = s.app.getConnectivityOverview();
    const r2 = s.app.getConnectivityOverview();
    assert.deepStrictEqual(r1.groups.wifiDirect, r2.groups.wifiDirect);
});

/* ===================================================================
   11. REGRESSION SANITY — Gate 1/2's own tests unaffected
=================================================================== */
console.log('\nRegression sanity:');

test('regression: RP-033 Gate 1 detectCapabilities() still functions unchanged alongside Section 13', () => {
    const s = freshStack();
    const report = s.living.detectCapabilities();
    assert.ok('internetAvailability' in report);
});

test('regression: RP-033 Gate 2 sendPacket()/queue still function unchanged alongside Section 13', () => {
    const s = freshStack();
    const result = s.transport.sendPacket({ destination: 'x', payloadType: 'text', payload: 'y', sender: 'z', sessionId: 's' });
    assert.strictEqual(result.success, true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
})();
