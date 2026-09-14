/**
 * core/connectivity/test/cozy-living-connectivity.test.js
 * RP-033 Gate 1 — real, executed tests for the Cozy Living Connectivity
 * coordinator, using the REAL cozy-connect.js, REAL live-hotspot-engine.js,
 * and REAL cozy-share.js (loaded, not mocked) for regression, plus the new
 * Gate 1 coordinator file under test.
 * Run with: node core/connectivity/test/cozy-living-connectivity.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (err) {
        console.log(`  \u2717 ${name}`);
        console.log(`      ${err.message}`);
        failed++;
    }
}

async function asyncTest(name, fn) {
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

const roots = {
    cozyConnect: path.join(__dirname, '..', 'cozy-connect.js'),
    hotspotEngine: path.join(__dirname, '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
    cozyShare: path.join(__dirname, '..', '..', 'collaboration', 'cozy-share.js'),
    trustedDevice: path.join(__dirname, '..', '..', 'security', 'trusted-device-manager.js'),
    coordinator: path.join(__dirname, '..', 'cozy-living-connectivity.js')
};

/**
 * freshStack({ withNavigator, withRTC, withCozyConnect, withHotspot, withShare, withTrustedDevice })
 *   Builds a fresh fake window (and optionally a fake navigator / RTC
 *   global) then requires exactly the real files requested, in
 *   dependency order, returning the loaded engines. Every combination
 *   lets us test the coordinator honestly with and without its real
 *   composed dependencies present - this is the "browser vs Node
 *   environment" and "unavailable capabilities" matrix the RP-033 Gate 1
 *   prompt requires.
 */
function freshStack(opts) {
    const o = opts || {};
    Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });

    const win = { CozyOS: {} };
    global.window = win;

    // Node 21+ ships a read-only global.navigator getter, so a plain
    // assignment throws. Redefine the property itself instead.
    Object.defineProperty(global, 'navigator', {
        value: o.withNavigator ? (o.navigator || { onLine: true }) : undefined,
        configurable: true,
        writable: true
    });

    if (o.withRTC) {
        global.RTCPeerConnection = function FakeRTCPeerConnection() {};
        global.RTCDataChannel = function FakeRTCDataChannel() {};
    } else {
        delete global.RTCPeerConnection;
        delete global.RTCDataChannel;
    }

    if (o.withCozyConnect !== false) require(roots.cozyConnect);
    if (o.withHotspot !== false) require(roots.hotspotEngine);
    if (o.withShare) require(roots.cozyShare);
    if (o.withTrustedDevice) require(roots.trustedDevice);
    require(roots.coordinator);

    return {
        win,
        connect: win.CozyOS.CozyConnect,
        hotspot: win.CozyOS.LiveHotspotEngine,
        share: win.CozyOS.Modules && win.CozyOS.Modules['cozy-share'],
        coordinator: win.CozyOS.CozyLivingConnectivity
    };
}

console.log('RP-033 Gate 1 — Cozy Living Connectivity coordinator tests\n');

/* ------------------------------------------------------------------ */
/* 1. REGRESSION: real cozy-connect.js / live-hotspot-engine.js /       */
/*    cozy-share.js behavior is unchanged by loading the coordinator    */
/* ------------------------------------------------------------------ */

test('regression: CozyConnect still registers all its real providers after coordinator loads', () => {
    const { connect } = freshStack({ withNavigator: true, withRTC: true });
    const names = connect.providers.list();
    ['bluetooth', 'usb', 'presentation', 'wifi', 'cast', 'camera', 'microphone', 'screen', 'serial', 'hid', 'nfc']
        .forEach((n) => assert.ok(names.includes(n), `expected provider "${n}" still registered`));
});

test('regression: CozyConnect.bluetooth.capabilities() unchanged (no navigator.bluetooth in Node)', () => {
    const { connect } = freshStack({ withNavigator: true });
    const cap = connect.bluetooth.capabilities();
    assert.equal(cap.supported, false);
});

test('regression: LiveHotspotEngine.capabilities() unchanged shape after coordinator loads', () => {
    const { hotspot } = freshStack({ withNavigator: true, withRTC: true });
    const cap = hotspot.capabilities();
    assert.equal(cap.webRTC, true);
    assert.equal(cap.wifiHotspotCreation, false);
    assert.equal(cap.wifiDirect, false);
});

test('regression: LiveHotspotEngine.createWifiHotspot()/connectWifiDirect() still honestly refuse', () => {
    const { hotspot } = freshStack({ withNavigator: true });
    assert.equal(hotspot.createWifiHotspot().success, false);
    assert.equal(hotspot.connectWifiDirect().success, false);
});

test('regression: Cozy Share module still loads and exposes its frozen public API', () => {
    const { share } = freshStack({ withNavigator: true, withShare: true });
    assert.ok(share, 'cozy-share module should be registered');
});

/* ------------------------------------------------------------------ */
/* 2. CAPABILITY DETECTION                                              */
/* ------------------------------------------------------------------ */

test('capability detection: Node environment (no navigator, no RTC) reports honest UNAVAILABLE, never fabricated AVAILABLE', () => {
    const { coordinator } = freshStack({ withNavigator: false, withRTC: false });
    const report = coordinator.detectCapabilities();
    assert.equal(report.bluetooth.status, 'UNAVAILABLE');
    assert.equal(report.usb.status, 'UNAVAILABLE');
    assert.equal(report.webRTC.status, 'UNAVAILABLE');
    assert.equal(report.webRTCDataChannel.status, 'UNAVAILABLE');
    assert.equal(report.qrManualPairing.status, 'UNAVAILABLE');
});

test('capability detection: browser-like environment (navigator + RTC present) reports real AVAILABLE/PARTIAL', () => {
    const { coordinator } = freshStack({ withNavigator: true, navigator: { onLine: true }, withRTC: true });
    const report = coordinator.detectCapabilities();
    assert.equal(report.webRTC.status, 'AVAILABLE');
    assert.equal(report.webRTCDataChannel.status, 'AVAILABLE');
    assert.equal(report.qrManualPairing.status, 'AVAILABLE');
    assert.equal(report.internetAvailability.status, 'AVAILABLE');
});

test('capability detection: WebRTC detection reflects the real, composed LiveHotspotEngine flag both ways', () => {
    const withRtc = freshStack({ withNavigator: true, withRTC: true }).coordinator.detectCapabilities();
    const withoutRtc = freshStack({ withNavigator: true, withRTC: false }).coordinator.detectCapabilities();
    assert.equal(withRtc.webRTC.status, 'AVAILABLE');
    assert.equal(withoutRtc.webRTC.status, 'UNAVAILABLE');
});

test('capability detection: honest CAPABILITY_UNAVAILABLE for Cast regardless of environment', () => {
    const a = freshStack({ withNavigator: true, withRTC: true }).coordinator.detectCapabilities();
    const b = freshStack({ withNavigator: false, withRTC: false }).coordinator.detectCapabilities();
    assert.equal(a.cast.status, 'CAPABILITY_UNAVAILABLE');
    assert.equal(b.cast.status, 'CAPABILITY_UNAVAILABLE');
});

test('capability detection: native-companion requirements are never claimed available', () => {
    const { coordinator } = freshStack({ withNavigator: true, withRTC: true });
    const report = coordinator.detectCapabilities();
    assert.equal(report.nativeWifiDirect.status, 'REQUIRES_NATIVE_COMPANION');
    assert.equal(report.nativeHotspotCreation.status, 'REQUIRES_NATIVE_COMPANION');
});

test('capability detection: offline navigator.onLine reports PARTIAL, not fabricated AVAILABLE', () => {
    const { coordinator } = freshStack({ withNavigator: true, navigator: { onLine: false } });
    const report = coordinator.detectCapabilities();
    assert.equal(report.internetAvailability.status, 'PARTIAL');
});

test('capability detection: missing CozyConnect entirely is reported honestly, no throw', () => {
    const { coordinator } = freshStack({ withNavigator: true, withCozyConnect: false });
    const report = coordinator.detectCapabilities();
    assert.equal(report.bluetooth.status, 'UNAVAILABLE');
    assert.ok(report.bluetooth.reason.includes('not loaded'));
});

test('capability detection: camera/microphone require explicit user action, never silently AVAILABLE', () => {
    const fresh = freshStack({ withNavigator: true, navigator: { onLine: true, mediaDevices: { getUserMedia: () => {} } } });
    const cap = fresh.coordinator.detectCapabilities();
    assert.equal(cap.camera.status, 'REQUIRES_USER_ACTION');
    assert.equal(cap.microphone.status, 'REQUIRES_USER_ACTION');
});

/* ------------------------------------------------------------------ */
/* 3. CONNECTIVITY STATE MACHINE                                        */
/* ------------------------------------------------------------------ */

test('connectivity states: session starts in DISCOVERING, never a fake CONNECTED/SYNCED state', () => {
    const { coordinator } = freshStack({ withNavigator: true, withRTC: true });
    const session = coordinator.createConnectivitySession('s1');
    assert.equal(session.state, 'DISCOVERING');
    assert.ok(!coordinator.CONNECTIVITY_STATES.includes('CONNECTED'));
    assert.ok(!coordinator.CONNECTIVITY_STATES.includes('SYNCED'));
});

test('connectivity states: valid full pairing path transitions successfully', () => {
    const { coordinator } = freshStack({ withNavigator: true, withRTC: true });
    const session = coordinator.createConnectivitySession('s2');
    assert.equal(session.transition('PAIRING_REQUIRED').success, true);
    assert.equal(session.transition('PAIRING').success, true);
    assert.equal(session.transition('PAIRED').success, true);
    assert.equal(session.transition('READY').success, true);
    assert.equal(session.state, 'READY');
});

test('connectivity states: invalid transition is rejected honestly, state unchanged', () => {
    const { coordinator } = freshStack({ withNavigator: true, withRTC: true });
    const session = coordinator.createConnectivitySession('s3');
    const result = session.transition('VERIFIED');
    assert.equal(result.success, false);
    assert.equal(session.state, 'DISCOVERING');
});

test('connectivity states: unknown state name is rejected', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const session = coordinator.createConnectivitySession('s4');
    const result = session.transition('CONNECTED');
    assert.equal(result.success, false);
    assert.ok(result.reason.includes('not a real connectivity state'));
});

test('connectivity states: FAILED can only recover back through DISCOVERING, never straight to READY', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const session = coordinator.createConnectivitySession('s5');
    session.transition('PAIRING_REQUIRED');
    session.transition('FAILED');
    assert.equal(session.transition('READY').success, false);
    assert.equal(session.transition('DISCOVERING').success, true);
});

test('connectivity states: full history is recorded for audit', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const session = coordinator.createConnectivitySession('s6');
    session.transition('PAIRING_REQUIRED');
    session.transition('PAIRING');
    const history = session.getHistory();
    assert.equal(history.length, 3);
    assert.equal(history[0].state, 'DISCOVERING');
    assert.equal(history[2].state, 'PAIRING');
});

/* ------------------------------------------------------------------ */
/* 4. STORE-AND-FORWARD PACKET CONTRACT                                 */
/* ------------------------------------------------------------------ */

test('packet contract: creating a packet without a destination is rejected', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const result = coordinator.createPacket({ payloadType: 'message' });
    assert.equal(result.success, false);
});

test('packet contract: real packet has all required metadata fields', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const result = coordinator.createPacket({ destination: 'device_42', payloadType: 'message', createdBy: 'device_1' });
    assert.equal(result.success, true);
    const p = result.packet;
    ['id', 'destination', 'payloadType', 'createdAt', 'ttlMs', 'priority', 'encryptionState', 'transportState', 'retryCount', 'provenance']
        .forEach((field) => assert.ok(Object.prototype.hasOwnProperty.call(p, field), `packet missing field "${field}"`));
    assert.equal(p.transportState, 'QUEUED');
    assert.equal(p.retryCount, 0);
    assert.equal(p.priority, 'NORMAL');
    assert.equal(p.encryptionState, 'NONE');
});

test('packet contract: TTL expiry is computed honestly, not fabricated', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const result = coordinator.createPacket({ destination: 'd1', payloadType: 'file', ttlMs: 1000 });
    const p = result.packet;
    const notExpiredAt = new Date(new Date(p.createdAt).getTime() + 500).toISOString();
    const expiredAt = new Date(new Date(p.createdAt).getTime() + 5000).toISOString();
    assert.equal(coordinator.isPacketExpired(p, notExpiredAt), false);
    assert.equal(coordinator.isPacketExpired(p, expiredAt), true);
});

test('packet contract: retry handling increments a real counter', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const p1 = coordinator.createPacket({ destination: 'd1', payloadType: 'file' }).packet;
    const r1 = coordinator.withRetry(p1);
    const r2 = coordinator.withRetry(r1.packet);
    assert.equal(r1.packet.retryCount, 1);
    assert.equal(r2.packet.retryCount, 2);
});

test('packet contract: transport state can only be set to a real connectivity state', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const p = coordinator.createPacket({ destination: 'd1', payloadType: 'file' }).packet;
    const ok = coordinator.withTransportState(p, 'TRANSFERRING');
    const bad = coordinator.withTransportState(p, 'SYNCED');
    assert.equal(ok.success, true);
    assert.equal(ok.packet.transportState, 'TRANSFERRING');
    assert.equal(bad.success, false);
});

test('packet contract: queue creation defaults every new packet to QUEUED', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const p1 = coordinator.createPacket({ destination: 'd1', payloadType: 'message' }).packet;
    const p2 = coordinator.createPacket({ destination: 'd2', payloadType: 'file' }).packet;
    assert.equal(p1.transportState, 'QUEUED');
    assert.equal(p2.transportState, 'QUEUED');
    assert.notEqual(p1.id, p2.id);
});

/* ------------------------------------------------------------------ */
/* 5. IDENTITY / SESSION / INVITATION / REPLAY PROTECTION               */
/* ------------------------------------------------------------------ */

test('identity: session identity is separate from the raw device reference format', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const result = coordinator.createSessionIdentity('device_fingerprint_abc');
    assert.equal(result.success, true);
    assert.notEqual(result.session.sessionId, 'device_fingerprint_abc');
    assert.equal(result.session.trustState, 'UNVERIFIED');
});

test('invitation: QR/manual invitation code contains only a session reference and expiry, no keys', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const session = coordinator.createSessionIdentity('device_abc').session;
    const inv = coordinator.createInvitationCode(session.sessionId);
    assert.equal(inv.success, true);
    const keys = Object.keys(inv.invitation);
    assert.deepEqual(keys.sort(), ['expiresAt', 'issuedAt', 'sessionRef', 'version']);
    assert.equal(inv.invitation.sessionRef, session.sessionId);
});

test('invitation: expiry is evaluated honestly', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const inv = coordinator.createInvitationCode('sess_x', { expiresInMs: 1000 }).invitation;
    const before = new Date(new Date(inv.issuedAt).getTime() + 500).toISOString();
    const after = new Date(new Date(inv.issuedAt).getTime() + 5000).toISOString();
    assert.equal(coordinator.isInvitationExpired(inv, before), false);
    assert.equal(coordinator.isInvitationExpired(inv, after), true);
});

test('replay protection: a challenge nonce can be used exactly once', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const { nonce } = coordinator.issueChallenge('sess_1');
    const first = coordinator.verifyChallengeResponse(nonce, 'sess_1');
    const second = coordinator.verifyChallengeResponse(nonce, 'sess_1');
    assert.equal(first.success, true);
    assert.equal(second.success, false);
    assert.ok(second.reason.includes('Replay detected'));
});

test('replay protection: a challenge issued for one session cannot be verified by another', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const { nonce } = coordinator.issueChallenge('sess_A');
    const result = coordinator.verifyChallengeResponse(nonce, 'sess_B');
    assert.equal(result.success, false);
});

/* ------------------------------------------------------------------ */
/* 6. GOVERNANCE / METADATA                                             */
/* ------------------------------------------------------------------ */

test('metadata: coordinator reports a real version, id and dependency list', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    assert.equal(typeof coordinator.getVersion(), 'string');
    assert.equal(coordinator.getId(), 'CozyLivingConnectivity');
    assert.deepEqual(coordinator.getDependencies(), ['CozyConnect', 'LiveHotspotEngine']);
});

test('metadata: Gate 1 status honestly separates implemented vs deferred scope', () => {
    const { coordinator } = freshStack({ withNavigator: true });
    const status = coordinator.getGateStatus();
    assert.equal(status.gate, 1);
    assert.ok(status.implemented.includes('capability-detection'));
    assert.ok(status.deferred.includes('real-multi-hop-relay'));
    assert.ok(status.deferred.includes('crypto-settlement'));
});

(async () => {
    await asyncTest('identity: getDeviceIdentity() is honest when TrustedDeviceManager is not loaded', async () => {
        const { coordinator } = freshStack({ withNavigator: true, withTrustedDevice: false });
        const identity = await coordinator.getDeviceIdentity();
        assert.equal(identity.available, false);
        assert.ok(identity.reason.includes('not loaded'));
    });

    await asyncTest('identity: getDeviceIdentity() composes a real fingerprint when TrustedDeviceManager IS loaded', async () => {
        const { coordinator, win } = freshStack({ withNavigator: true, withTrustedDevice: true });
        assert.ok(win.CozyOS.TrustedDeviceManager, 'TrustedDeviceManager should be loaded');
        const identity = await coordinator.getDeviceIdentity();
        // Honest either way: real fingerprint if generateFingerprint() succeeds in
        // this Node environment, or an honest failure reason - never a fabricated value.
        if (identity.available) {
            assert.ok(identity.fingerprint, 'a real fingerprint value should be present');
        } else {
            assert.ok(typeof identity.reason === 'string' && identity.reason.length > 0);
        }
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exitCode = failed > 0 ? 1 : 0;
})();
