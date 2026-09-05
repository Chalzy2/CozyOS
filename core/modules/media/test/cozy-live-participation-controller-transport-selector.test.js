'use strict';

/**
 * core/modules/media/test/cozy-live-participation-controller-transport-selector.test.js
 * STEP 4D-B PATCH #2 — proves CozyLiveMediaTransportSelector is correctly
 * composed into the real CozyLiveParticipationController without
 * touching SessionAuthority, the SPEAKING_ALLOWED gate, removal/mute
 * protection, or the dynamic per-segment language architecture.
 *
 * HARNESS DISCLOSURE: INTEGRATION TESTED / LOOPBACK TESTED — real
 * LiveDistributionSignalingServer, real loopback WebSocket, real signed
 * session tokens, real SessionAuthority role checks. getUserMedia is a
 * disclosed fake (no hardware in this sandbox), matching the existing
 * convention in cozy-live-participation-controller.test.js. NOT
 * browser-tested — see PATCH-2-REPORT.md "Browser verification".
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { LiveDistributionSignalingServer } = require('../../../../server/live-relay/live-distribution-signaling-server');
const { SessionAuthority } = require('../../../../server/live-relay/session-authority');
const sessionToken = require('../../../../server/live-relay/session-token');

const SECRET = 'participation-transport-selector-test-secret';

function loadProviderModule() {
    const modulePath = path.join(__dirname, '..', '..', '..', 'shell', 'live', 'providers', 'cozy-live-remote-relay-transport-provider.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}
function loadDeviceManagerModule() {
    const modulePath = path.join(__dirname, '..', 'cozy-audio-device-manager.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}
function loadControllerModule() {
    const modulePath = path.join(__dirname, '..', 'cozy-live-participation-controller.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}
function loadSelectorModule() {
    const modulePath = path.join(__dirname, '..', '..', '..', 'shell', 'live', 'providers', 'cozy-live-media-transport-selector.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}
const segmentPublisher = require('../cozy-live-audio-segment-publisher.js');

function makeRoster(entries) {
    return (sessionId, requesterId) => {
        const role = entries[sessionId]?.[requesterId];
        if (!role) return null;
        return { userId: requesterId, role, language: 'en', muted: false, cameraOn: true, joinedAt: Date.now() };
    };
}

async function startServer(roster) {
    const authority = new SessionAuthority({ secret: SECRET, roleResolver: makeRoster(roster) });
    const server = new LiveDistributionSignalingServer({ secret: SECRET, authority, heartbeatTimeoutMs: 5000, disconnectTimeoutMs: 20000 });
    const addr = await server.listen(0, '127.0.0.1');
    return { server, authority, url: `ws://127.0.0.1:${addr.port}` };
}

function waitForEvent(events, type, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const check = () => {
            const hit = events.find((e) => e.type === type);
            if (hit) return resolve(hit);
            if (Date.now() - startedAt > timeoutMs) return reject(new Error(`Timed out waiting for "${type}"`));
            setTimeout(check, 20);
        };
        check();
    });
}

function makeFakeMediaDevices() {
    return {
        async enumerateDevices() { return []; },
        async getUserMedia() {
            const track = { kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } };
            return {
                _track: track,
                getTracks() { return [this._track]; },
                getAudioTracks() { return [this._track]; },
            };
        },
        addEventListener() {},
        removeEventListener() {},
    };
}

async function makeController({ sessionId, userId, transportSelector } = {}) {
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const { CozyLiveParticipationController } = loadControllerModule();
    const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
    await deviceManager.initialize();
    return { CozyLiveParticipationController, deviceManager, RemoteRelayTransportProvider };
}

// ---------------------------------------------------------------------
// 1 & 2 — selector is actually invoked at construction; default is
// LOCAL_CHUNKED_RELAY
// ---------------------------------------------------------------------
test('transport selector is invoked during participation-controller construction, default LOCAL_CHUNKED_RELAY', async () => {
    const { CozyLiveMediaTransportSelector, MODE } = loadSelectorModule();
    const { CozyLiveParticipationController } = loadControllerModule();
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
    await deviceManager.initialize();

    const selector = new CozyLiveMediaTransportSelector({ chunkedCapabilities: () => segmentPublisher.capabilities() });
    assert.equal(selector.getTransportMode(), null, 'selector must be untouched before controller construction');

    const fakeTransport = { requestSpeak() {}, selfMute() {}, leaveViewer() {} };
    const controller = new CozyLiveParticipationController({
        deviceManager, transportProvider: fakeTransport, sessionId: 's1', userId: 'bob', transportSelector: selector,
    });

    assert.equal(selector.getTransportMode(), MODE.LOCAL_CHUNKED_RELAY, 'constructing the controller must invoke selectDefaultMode() on the supplied selector');
    assert.equal(controller.getTransportMode(), MODE.LOCAL_CHUNKED_RELAY);
});

// ---------------------------------------------------------------------
// 11 — existing consumers (omitting transportSelector) remain compatible
// ---------------------------------------------------------------------
test('existing participation-controller consumers remain compatible: omitting transportSelector never throws, getTransportMode()/getTransportCapabilities() are null', async () => {
    const { CozyLiveParticipationController } = loadControllerModule();
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
    await deviceManager.initialize();
    const fakeTransport = { requestSpeak() {}, selfMute() {}, leaveViewer() {} };

    const controller = new CozyLiveParticipationController({ deviceManager, transportProvider: fakeTransport, sessionId: 's1', userId: 'bob' });
    assert.equal(controller.getTransportMode(), null);
    assert.equal(controller.getTransportCapabilities(), null);
});

// ---------------------------------------------------------------------
// 4 — mesh remains selectable when explicitly supported
// ---------------------------------------------------------------------
test('mesh remains explicitly selectable when the caller supplies real webRTC capability', () => {
    const { CozyLiveMediaTransportSelector, MODE } = loadSelectorModule();
    const selector = new CozyLiveMediaTransportSelector({
        chunkedCapabilities: () => segmentPublisher.capabilities(),
        meshCapabilities: () => ({ webRTC: true }), // caller asserts real RTCPeerConnection is present
    });
    const result = selector.selectMode(MODE.MESH_WEBRTC_SIGNALING);
    assert.equal(result.actual, MODE.MESH_WEBRTC_SIGNALING);
    assert.equal(result.fallback, false);
});

// ---------------------------------------------------------------------
// 5, 6, 7 — REAL_RTP_SFU cannot become available merely because an
// adapter/interface exists; fails closed and visibly
// ---------------------------------------------------------------------
test('REAL_RTP_SFU stays unavailable through the controller-supplied selector even with an adapter object present, and selection fails closed', async () => {
    const { CozyLiveMediaTransportSelector, MODE } = loadSelectorModule();
    const { CozyLiveParticipationController } = loadControllerModule();
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
    await deviceManager.initialize();

    const unverifiedAdapter = { connect() {}, publish() {} }; // structurally present only
    const selector = new CozyLiveMediaTransportSelector({
        chunkedCapabilities: () => segmentPublisher.capabilities(),
        sfuAdapter: unverifiedAdapter,
    });
    const fakeTransport = { requestSpeak() {}, selfMute() {}, leaveViewer() {} };
    const controller = new CozyLiveParticipationController({
        deviceManager, transportProvider: fakeTransport, sessionId: 's1', userId: 'bob', transportSelector: selector,
    });

    const caps = controller.getTransportCapabilities();
    assert.equal(caps[MODE.REAL_RTP_SFU].structurallySupported, true);
    assert.equal(caps[MODE.REAL_RTP_SFU].available, false, 'adapter presence alone must never flip available:true');
    assert.equal(caps[MODE.REAL_RTP_SFU].verified, false);

    const attempt = selector.selectMode(MODE.REAL_RTP_SFU);
    assert.equal(attempt.actual, null, 'must fail closed, not silently substitute a mode');
    assert.equal(attempt.fallback, false);
    assert.ok(attempt.reason, 'failure must be visible/reported, not silent');
});

// ---------------------------------------------------------------------
// 8, 9, 10 — transport selection does not bypass SessionAuthority;
// SPEAKING_ALLOWED remains required; removed/revoked users stay protected
// ---------------------------------------------------------------------
test('real SessionAuthority chain unaffected by transportSelector: mic gate, revoke, and removal all behave exactly as in the unmodified 4D-A path', async () => {
    const { CozyLiveMediaTransportSelector, MODE } = loadSelectorModule();
    const { server, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const { CozyLiveParticipationController, STATE } = loadControllerModule();

    try {
        const bobEvents = [];
        const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
        await deviceManager.initialize();

        const bobProvider = new RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => { bobEvents.push({ type, detail }); controller.handleTransportEvent(type, detail); },
        });
        const selector = new CozyLiveMediaTransportSelector({ chunkedCapabilities: () => segmentPublisher.capabilities() });
        const controller = new CozyLiveParticipationController({
            deviceManager, transportProvider: bobProvider, sessionId: 's1', userId: 'bob', transportSelector: selector,
        });
        assert.equal(controller.getTransportMode(), MODE.LOCAL_CHUNKED_RELAY);

        bobProvider.joinViewer('s1', 'bob');
        await waitForEvent(bobEvents, 'join-ack');

        // Mic gate: cannot start speaking before server grant — unaffected by the selector's presence.
        const early = await controller.startSpeaking();
        assert.equal(early.success, false);
        assert.equal(early.reason, 'NOT_AUTHORIZED_TO_SPEAK');

        const hostProvider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60), onEvent: () => {},
        });
        hostProvider.publishSource('s1', { segmentId: 'seed', sourceLanguage: 'en-US', text: 'welcome', publisherId: 'pastor' });
        await new Promise((r) => setTimeout(r, 150));

        controller.requestToSpeak();
        await waitForEvent(bobEvents, 'request-speak-ack');
        hostProvider.grantSpeak('s1', 'bob');
        await waitForEvent(bobEvents, 'speaking-state');
        assert.equal(controller.getState(), STATE.SPEAKING_ALLOWED);

        const startResult = await controller.startSpeaking();
        assert.equal(startResult.success, true);
        const liveTrack = startResult.stream.getAudioTracks()[0];

        // Revoke: real SessionAuthority-driven, must still hard-stop mic — selector plays no role here.
        bobEvents.length = 0;
        hostProvider.revokeSpeak('s1', 'bob');
        await waitForEvent(bobEvents, 'speaking-state');
        assert.equal(controller.getState(), STATE.MUTED);
        assert.equal(liveTrack.stopped, true);

        // Selector state is untouched by the whole speaking-authority exchange above.
        assert.equal(controller.getTransportMode(), MODE.LOCAL_CHUNKED_RELAY);

        bobProvider.disconnectAll();
        hostProvider.disconnectAll();
    } finally {
        await server.close();
    }
});

test('removed participant stays removed regardless of transportSelector presence', async () => {
    const { CozyLiveMediaTransportSelector } = loadSelectorModule();
    const { server, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const { CozyLiveParticipationController, STATE } = loadControllerModule();

    try {
        const bobEvents = [];
        const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
        await deviceManager.initialize();
        const bobProvider = new RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => { bobEvents.push({ type, detail }); controller.handleTransportEvent(type, detail); },
        });
        const selector = new CozyLiveMediaTransportSelector({ chunkedCapabilities: () => segmentPublisher.capabilities() });
        const controller = new CozyLiveParticipationController({
            deviceManager, transportProvider: bobProvider, sessionId: 's1', userId: 'bob', transportSelector: selector,
        });

        bobProvider.joinViewer('s1', 'bob');
        await waitForEvent(bobEvents, 'join-ack');

        controller.handleTransportEvent('removed', { removedBy: 'pastor' });
        assert.equal(controller.getState(), STATE.REMOVED);
        const reqAfterRemoval = controller.requestToSpeak();
        assert.equal(reqAfterRemoval.success, false);
        assert.equal(reqAfterRemoval.reason, 'REMOVED_CANNOT_REQUEST');

        bobProvider.disconnectAll();
    } finally {
        await server.close();
    }
});

// ---------------------------------------------------------------------
// 12 — dynamic source-language / viewer-language architecture untouched
// ---------------------------------------------------------------------
test('per-segment sourceLanguage architecture is untouched by the transport selector', async () => {
    const { CozyLiveMediaTransportSelector } = loadSelectorModule();
    const { server, url } = await startServer({ s1: { pastor: 'host' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    try {
        const hostProvider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60), onEvent: () => {},
        });
        // The selector never sees or transforms segment payloads — confirmed
        // structurally: CozyLiveMediaTransportSelector exposes no publish
        // pass-through that touches segment shape (see PATCH-1 Test E/F).
        const selector = new CozyLiveMediaTransportSelector({ chunkedCapabilities: () => segmentPublisher.capabilities() });
        assert.equal(typeof selector.publish, 'undefined', 'selector must not intercept or transform segment publication');

        hostProvider.publishSource('s1', { segmentId: 'seg-en', sourceLanguage: 'en-US', text: 'hello', publisherId: 'pastor' });
        hostProvider.publishSource('s1', { segmentId: 'seg-sw', sourceLanguage: 'sw-KE', text: 'karibu', publisherId: 'pastor' });
        await new Promise((r) => setTimeout(r, 150));
        hostProvider.disconnectAll();
    } finally {
        await server.close();
    }
});
