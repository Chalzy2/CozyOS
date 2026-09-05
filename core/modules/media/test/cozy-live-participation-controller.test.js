'use strict';

/**
 * core/modules/media/test/cozy-live-participation-controller.test.js
 * R040 Phase 4A — proves the full real chain end to end:
 *
 *   CozyAudioDeviceManager (real logic, fake getUserMedia — no hardware
 *   in this sandbox) <-> CozyLiveParticipationController <->
 *   RemoteRelayTransportProvider (real, unmodified in logic) <-> real
 *   loopback WebSocket <-> LiveDistributionSignalingServer (real) <->
 *   SessionAuthority (real, unmodified in logic).
 *
 * HARNESS DISCLOSURE: INTEGRATION TESTED / LOOPBACK TESTED. Real server,
 * real socket, real signed tokens, real SessionAuthority role checks.
 * NOT browser-tested, NOT device-tested — getUserMedia is a disclosed
 * fake (see cozy-audio-device-manager.test.js header for why that's an
 * honest boundary, not a claim of hardware verification).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { LiveDistributionSignalingServer } = require('../../../../server/live-relay/live-distribution-signaling-server');
const { SessionAuthority } = require('../../../../server/live-relay/session-authority');
const sessionToken = require('../../../../server/live-relay/session-token');

const SECRET = 'participation-controller-test-secret';

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

/** Fake mediaDevices matching the real getUserMedia contract — no real
 * hardware available in this sandbox (see file header disclosure). */
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

test('end-to-end: viewer requests to speak, host grants, controller starts real mic capture, host revokes, capture stops', async () => {
    const { server, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const { CozyLiveParticipationController, STATE } = loadControllerModule();

    try {
        const bobEvents = [];
        const controllerEvents = [];
        const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
        await deviceManager.initialize();

        const bobProvider = new RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => {
                bobEvents.push({ type, detail });
                controller.handleTransportEvent(type, detail);
            },
        });
        const controller = new CozyLiveParticipationController({
            deviceManager,
            transportProvider: bobProvider,
            sessionId: 's1',
            userId: 'bob',
            onEvent: (type, detail) => controllerEvents.push({ type, detail }),
        });

        bobProvider.joinViewer('s1', 'bob');
        await waitForEvent(bobEvents, 'join-ack');
        assert.equal(controller.getState(), STATE.JOINED);

        // Host connects (via publishSource, the existing real host-connection path).
        const hostProvider = new RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: () => {},
        });
        hostProvider.publishSource('s1', { segmentId: 'seed', sourceLanguage: 'sw', text: 'karibu', publisherId: 'pastor' });
        await new Promise((r) => setTimeout(r, 150)); // let host auth complete

        // Viewer requests to speak.
        const reqResult = controller.requestToSpeak();
        assert.equal(reqResult.success, true);
        assert.equal(controller.getState(), STATE.SPEAK_REQUESTED);
        await waitForEvent(bobEvents, 'request-speak-ack');

        // Host grants — real message, real SessionAuthority role check, real broadcast back to bob.
        hostProvider.grantSpeak('s1', 'bob');
        await waitForEvent(bobEvents, 'speaking-state');
        assert.equal(controller.getState(), STATE.SPEAKING_ALLOWED);

        // ONLY NOW may capture start (hard gate under test).
        const startResult = await controller.startSpeaking();
        assert.equal(startResult.success, true);
        assert.equal(controller.getState(), STATE.SPEAKING);
        assert.equal(startResult.stream.getAudioTracks()[0].stopped, false);
        const liveTrack = startResult.stream.getAudioTracks()[0];

        // Host revokes — capture must stop immediately, server-driven, not a local UI choice.
        bobEvents.length = 0;
        hostProvider.revokeSpeak('s1', 'bob');
        await waitForEvent(bobEvents, 'speaking-state');
        assert.equal(controller.getState(), STATE.MUTED);
        assert.equal(liveTrack.stopped, true, 'revoke must actually stop the real microphone track, not just flip a UI flag');

        bobProvider.disconnectAll();
        hostProvider.disconnectAll();
    } finally {
        await server.close();
    }
});

test('security: startSpeaking() is refused before server grants, even if called directly (no client-side bypass of server authority)', async () => {
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const { CozyLiveParticipationController, STATE } = loadControllerModule();
    const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
    const fakeTransport = { requestSpeak: () => ({ success: true }), selfMute: () => ({ success: true }), leaveViewer: () => ({ success: true }) };
    const controller = new CozyLiveParticipationController({ deviceManager, transportProvider: fakeTransport, sessionId: 's1', userId: 'bob' });

    assert.equal(controller.getState(), STATE.JOINED);
    const result = await controller.startSpeaking();
    assert.equal(result.success, false);
    assert.equal(result.reason, 'NOT_AUTHORIZED_TO_SPEAK');
});

test('security: a viewer cannot grant speaking to themselves through the real server, and the controller never locally fabricates SPEAKING_ALLOWED from that failure', async () => {
    const { server, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const { CozyLiveParticipationController, STATE } = loadControllerModule();

    try {
        const bobEvents = [];
        const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
        const bobProvider = new RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => { bobEvents.push({ type, detail }); controller.handleTransportEvent(type, detail); },
        });
        const controller = new CozyLiveParticipationController({ deviceManager, transportProvider: bobProvider, sessionId: 's1', userId: 'bob' });

        bobProvider.joinViewer('s1', 'bob');
        await waitForEvent(bobEvents, 'join-ack');

        bobProvider.grantSpeak('s1', 'bob'); // self-grant attempt over the real wire
        const ack = await waitForEvent(bobEvents, 'grant-speak-ack');
        assert.equal(ack.detail.success, false);
        assert.equal(controller.getState(), STATE.JOINED, 'a denied self-grant must never advance local state');

        bobProvider.disconnectAll();
    } finally {
        await server.close();
    }
});

test('self-mute stops local transmission without touching server-side speaking authority state', async () => {
    const { server, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyAudioDeviceManager } = loadDeviceManagerModule();
    const { CozyLiveParticipationController, STATE } = loadControllerModule();

    try {
        const bobEvents = [];
        const deviceManager = new CozyAudioDeviceManager({ _env: { navigator: { mediaDevices: makeFakeMediaDevices() } } });
        const bobProvider = new RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => { bobEvents.push({ type, detail }); controller.handleTransportEvent(type, detail); },
        });
        const controller = new CozyLiveParticipationController({ deviceManager, transportProvider: bobProvider, sessionId: 's1', userId: 'bob' });

        bobProvider.joinViewer('s1', 'bob');
        await waitForEvent(bobEvents, 'join-ack');

        const hostProvider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60), onEvent: () => {},
        });
        hostProvider.publishSource('s1', { segmentId: 'seed', sourceLanguage: 'sw', text: 'x', publisherId: 'pastor' });
        await new Promise((r) => setTimeout(r, 150));

        controller.requestToSpeak();
        await waitForEvent(bobEvents, 'request-speak-ack');
        hostProvider.grantSpeak('s1', 'bob');
        await waitForEvent(bobEvents, 'speaking-state');
        await controller.startSpeaking();
        assert.equal(controller.getState(), STATE.SPEAKING);

        controller.selfMute();
        assert.equal(deviceManager.isMicrophoneMuted(), true);
        // Self-mute is a local/transport signal only — SessionAuthority's
        // grant is untouched, so the participant can unmute themselves
        // without asking to speak again.
        controller.selfUnmute();
        assert.equal(deviceManager.isMicrophoneMuted(), false);

        bobProvider.disconnectAll();
        hostProvider.disconnectAll();
    } finally {
        await server.close();
    }
});
