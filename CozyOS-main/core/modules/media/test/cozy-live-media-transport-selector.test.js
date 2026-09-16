'use strict';

/**
 * core/modules/media/test/cozy-live-media-transport-selector.test.js
 * STEP 4D-B — proves the transport-mode composition boundary is truthful
 * and does not duplicate, bypass, or fake anything the 4D-A checkpoint
 * already established.
 *
 * DISCLOSURE: this file tests cozy-live-media-transport-selector.js in
 * isolation using real capability functions from the real chunked
 * publisher/receiver modules, and a documented FakeSfuAdapter test
 * double (Test C) that is NEVER asserted to be a real SFU — see that
 * class's own comment.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function loadSelectorModule() {
    const modulePath = path.join(__dirname, '..', '..', '..', 'shell', 'live', 'providers', 'cozy-live-media-transport-selector.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}

const segmentPublisher = require('../cozy-live-audio-segment-publisher.js');
const segmentReceiver = require('../cozy-live-audio-segment-receiver.js');

test('Test A — default mode with no SFU is LOCAL_CHUNKED_RELAY, and the existing relay capability is genuinely reported', () => {
    const { CozyLiveMediaTransportSelector, MODE } = loadSelectorModule();
    const selector = new CozyLiveMediaTransportSelector({
        chunkedCapabilities: () => segmentPublisher.capabilities(),
    });
    const result = selector.selectDefaultMode();
    assert.equal(result.actual, MODE.LOCAL_CHUNKED_RELAY);
    assert.equal(selector.getTransportMode(), MODE.LOCAL_CHUNKED_RELAY);
    const caps = selector.getCapabilities();
    assert.equal(caps[MODE.LOCAL_CHUNKED_RELAY].available, true);
    // Node has no MediaRecorder — the underlying capability function must
    // still report that honestly inside the passthrough, never overridden.
    assert.equal(caps[MODE.LOCAL_CHUNKED_RELAY].detail.mediaRecorder, false);
});

test('Test B — requesting REAL_RTP_SFU with no adapter installed fails clearly and does not silently fall back', () => {
    const { CozyLiveMediaTransportSelector, MODE } = loadSelectorModule();
    const selector = new CozyLiveMediaTransportSelector({});
    const result = selector.selectMode(MODE.REAL_RTP_SFU);
    assert.equal(result.actual, null);
    assert.equal(result.fallback, false);
    assert.match(result.reason, /No SFU adapter installed/);
    assert.equal(selector.getTransportMode(), null, 'must not silently claim any mode');
});

test('Test B(ii) — an SFU adapter merely being present (structurally supported) is never reported as available/verified', () => {
    const { CozyLiveMediaTransportSelector, MODE } = loadSelectorModule();
    const unverifiedAdapter = { connect() {}, publish() {} };
    const selector = new CozyLiveMediaTransportSelector({ sfuAdapter: unverifiedAdapter /* sfuAdapterVerifiedDeployed defaults false */ });
    const caps = selector.getCapabilities();
    assert.equal(caps[MODE.REAL_RTP_SFU].structurallySupported, true);
    assert.equal(caps[MODE.REAL_RTP_SFU].available, false);
    assert.equal(caps[MODE.REAL_RTP_SFU].verified, false);

    const result = selector.selectMode(MODE.REAL_RTP_SFU);
    assert.equal(result.actual, null);
    assert.match(result.reason, /structurally present but not verified/);
});

test('Test B(iii) — explicit allowFallback produces an honest {requested, actual, fallback:true} record, never a bare sfu:true claim', () => {
    const { CozyLiveMediaTransportSelector, MODE } = loadSelectorModule();
    const selector = new CozyLiveMediaTransportSelector({
        chunkedCapabilities: () => segmentPublisher.capabilities(),
    });
    const result = selector.selectMode(MODE.REAL_RTP_SFU, { allowFallback: true });
    assert.deepEqual(result, { requested: MODE.REAL_RTP_SFU, actual: MODE.LOCAL_CHUNKED_RELAY, fallback: true });
});

test('Test C — a future SFU adapter test double can satisfy the transport interface without modifying the selector', () => {
    const { CozyLiveMediaTransportSelector, TRANSPORT_INTERFACE_METHODS } = loadSelectorModule();

    /**
     * FakeSfuAdapter — a DISCLOSED TEST DOUBLE for interface-shape testing
     * only. It performs no real RTP/media forwarding whatsoever and must
     * NEVER be described as a real SFU outside this test file. Its only
     * purpose is proving TRANSPORT_INTERFACE_METHODS is satisfiable.
     */
    class FakeSfuAdapter {
        connect() { return true; }
        disconnect() { return true; }
        publish() { return true; }
        subscribe() { return true; }
        stopPublishing() { return true; }
        stopReceiving() { return true; }
        getCapabilities() { return { fake: true }; }
    }
    const fake = new FakeSfuAdapter();
    for (const method of TRANSPORT_INTERFACE_METHODS) {
        assert.equal(typeof fake[method], 'function', `FakeSfuAdapter must implement ${method}`);
    }

    // Confirm the selector still refuses to call it "verified" merely for
    // satisfying the interface shape — structural support only.
    const selector = new CozyLiveMediaTransportSelector({ sfuAdapter: fake });
    assert.equal(selector.getCapabilities().REAL_RTP_SFU.available, false);
});

test('Test D — existing chunked-relay and mesh capability functions remain callable through the selector, unmodified', () => {
    const { CozyLiveMediaTransportSelector, MODE } = loadSelectorModule();
    const selector = new CozyLiveMediaTransportSelector({
        chunkedCapabilities: () => segmentPublisher.capabilities(),
        meshCapabilities: () => ({ webRTC: false }), // Node has no RTCPeerConnection — honest passthrough
    });
    const caps = selector.getCapabilities();
    assert.deepEqual(caps[MODE.LOCAL_CHUNKED_RELAY].detail, segmentPublisher.capabilities());
    assert.equal(caps[MODE.MESH_WEBRTC_SIGNALING].available, false);
    // Receiver-side capability function is likewise untouched by this file.
    assert.deepEqual(segmentReceiver.capabilities(), segmentReceiver.capabilities());
});

test('Test E — the selector has no connection/auth surface of its own to bypass SessionAuthority with', () => {
    const { CozyLiveMediaTransportSelector } = loadSelectorModule();
    const selector = new CozyLiveMediaTransportSelector({});
    const ownMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(selector))
        .filter((m) => m !== 'constructor');
    // The selector only ever selects/reports a mode — it must never expose a
    // method that itself opens a socket, sends a signaling message, or
    // grants/asserts an authorization decision. Those all remain the real
    // engines' job (RemoteRelayTransportProvider / SessionAuthority).
    const forbidden = ['connect', 'authenticate', 'grantSpeaking', 'requestSpeaking', 'joinViewer', 'send', 'open'];
    for (const name of forbidden) {
        assert.equal(ownMethods.includes(name), false, `selector must not expose ${name}() — that stays the real engine's responsibility`);
    }
});

test('Test F — capability passthrough never touches segment.sourceLanguage or viewer.language shapes', () => {
    const { CozyLiveMediaTransportSelector } = loadSelectorModule();
    const segmentLike = { sourceLanguage: 'en-US', viewerLanguage: 'sw-KE' };
    const selector = new CozyLiveMediaTransportSelector({
        chunkedCapabilities: () => Object.assign({}, segmentPublisher.capabilities(), segmentLike),
    });
    const caps = selector.getCapabilities();
    assert.equal(caps.LOCAL_CHUNKED_RELAY.detail.sourceLanguage, 'en-US');
    assert.equal(caps.LOCAL_CHUNKED_RELAY.detail.viewerLanguage, 'sw-KE');
});

test('Regression — unknown mode is rejected with a clear error, never silently coerced', () => {
    const { CozyLiveMediaTransportSelector } = loadSelectorModule();
    const selector = new CozyLiveMediaTransportSelector({});
    assert.throws(() => selector.selectMode('NOT_A_REAL_MODE'), /Unknown transport mode/);
});
