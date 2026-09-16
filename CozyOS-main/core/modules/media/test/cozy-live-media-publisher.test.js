'use strict';

/**
 * core/modules/media/test/cozy-live-media-publisher.test.js
 * R040 Phase 4B — proves the full real chain end to end:
 *
 *   CozyLiveParticipationController (real, unmodified) <->
 *   CozyLiveMediaPublisher (new) <-> RemoteRelayTransportProvider (real,
 *   its new sendWebrtcOffer/Answer/IceCandidate methods) <-> real
 *   loopback WebSocket <-> LiveDistributionSignalingServer (real, its
 *   new #_onWebrtcSignal relay) <-> SessionAuthority (real, unmodified).
 *
 * HARNESS DISCLOSURE: INTEGRATION TESTED / LOOPBACK TESTED for the
 * signaling relay and permission-gating logic — real server, real
 * socket, real signed tokens, real SessionAuthority role checks.
 * RTCPeerConnection itself is a DISCLOSED MOCK (FakeRTCPeerConnection
 * below): Node has no real implementation, and this sandbox has no
 * hardware/browser to exercise a genuine ICE/DTLS/SRTP negotiation.
 * This suite therefore proves the SIGNALING and AUTHORIZATION chain is
 * real and correct; it does NOT claim BROWSER-TESTED, DEVICE-TESTED, or
 * PUBLIC-INTERNET-TESTED media connectivity — see this module's own
 * file header for the same boundary already disclosed there.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { LiveDistributionSignalingServer } = require('../../../../server/live-relay/live-distribution-signaling-server');
const { SessionAuthority } = require('../../../../server/live-relay/session-authority');
const sessionToken = require('../../../../server/live-relay/session-token');

const SECRET = 'media-publisher-test-secret';

function loadProviderModule() {
    const modulePath = path.join(__dirname, '..', '..', '..', 'shell', 'live', 'providers', 'cozy-live-remote-relay-transport-provider.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}
function loadControllerModule() {
    const modulePath = path.join(__dirname, '..', 'cozy-live-participation-controller.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}
function loadPublisherModule() {
    const modulePath = path.join(__dirname, '..', 'cozy-live-media-publisher.js');
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

/** Fake mediaStream matching the real MediaStream contract's surface this module reads (getTracks()) — same disclosed pattern as cozy-live-participation-controller.test.js's fake getUserMedia. */
function makeFakeStream() {
    const track = { kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } };
    return { getTracks() { return [track]; }, getAudioTracks() { return [track]; } };
}

/**
 * FakeRTCPeerConnection — DISCLOSED MOCK. Simulates ICE-candidate
 * emission and connection-state progression to "connected" shortly
 * after a remote description is applied, and "closed" on close(). It
 * does not perform any real network negotiation — two independent
 * instances never actually reach each other; the test wires their
 * offer/answer/candidate payloads through the REAL relay server, which
 * is the layer this suite actually verifies.
 */
function installFakeRTCPeerConnection() {
    const previous = globalThis.RTCPeerConnection;
    let seq = 0;
    class FakeRTCPeerConnection {
        constructor(config) {
            this.iceServers = config && config.iceServers;
            this.localDescription = null;
            this.remoteDescription = null;
            this.connectionState = 'new';
            this._tracks = [];
            this.onicecandidate = null;
            this.ontrack = null;
            this.onconnectionstatechange = null;
        }
        addTrack(track) { this._tracks.push(track); }
        async createOffer() { return { type: 'offer', sdp: `fake-offer-${seq++}` }; }
        async createAnswer() { return { type: 'answer', sdp: `fake-answer-${seq++}` }; }
        async setLocalDescription(desc) {
            this.localDescription = desc;
            setTimeout(() => { if (this.onicecandidate) this.onicecandidate({ candidate: { candidate: 'candidate:1 fake', sdpMid: '0' } }); }, 5);
        }
        async setRemoteDescription(desc) {
            this.remoteDescription = desc;
            setTimeout(() => {
                if (this.connectionState === 'closed') return;
                this.connectionState = 'connected';
                if (this.onconnectionstatechange) this.onconnectionstatechange();
                if (this.ontrack) this.ontrack({ streams: [{ id: 'remote-stream' }] });
            }, 10);
        }
        async addIceCandidate(candidate) { this._remoteCandidates = this._remoteCandidates || []; this._remoteCandidates.push(candidate); }
        close() {
            this.connectionState = 'closed';
            if (this.onconnectionstatechange) this.onconnectionstatechange();
        }
    }
    globalThis.RTCPeerConnection = FakeRTCPeerConnection;
    return () => { globalThis.RTCPeerConnection = previous; };
}

test('end-to-end: granted speaker publishes real MediaStream to a viewer over the real relay; both sides reach MEDIA_CONNECTED', async () => {
    const restore = installFakeRTCPeerConnection();
    const { server, authority, url } = await startServer({ s1: { pastor: 'host', testifier: 'participant', 'kenyan-viewer': 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyLiveParticipationController } = loadControllerModule();
    const { CozyLiveMediaPublisher, PEER_STATE } = loadPublisherModule();

    try {
        // Server-authoritative grant BEFORE either connects, so the token issued at auth time already carries role "speaker".
        authority.grantSpeaking('s1', 'pastor', 'testifier');

        const testifierEvents = [];
        const testifierProvider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => { testifierEvents.push({ type, detail }); testifierPublisher.handleTransportEvent(type, detail); },
        });
        const fakeDeviceManager = { createMicrophoneStream: async () => ({ success: true, stream: makeFakeStream() }), muteLocalMicrophone() {}, unmuteLocalMicrophone() {}, stopMicrophone() {} };
        const testifierController = new CozyLiveParticipationController({ deviceManager: fakeDeviceManager, transportProvider: testifierProvider, sessionId: 's1', userId: 'testifier' });
        const testifierPublisher = new CozyLiveMediaPublisher({ participationController: testifierController, transportProvider: testifierProvider, sessionId: 's1', userId: 'testifier' });

        const viewerEvents = [];
        const viewerProvider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => { viewerEvents.push({ type, detail }); viewerPublisher.handleTransportEvent(type, detail); },
        });
        const viewerParticipationStub = { getState: () => 'JOINED' }; // receiver role never needs publish authority
        const viewerPublisher = new CozyLiveMediaPublisher({ participationController: viewerParticipationStub, transportProvider: viewerProvider, sessionId: 's1', userId: 'kenyan-viewer' });

        // Establish both connections against the real server (join-viewer for both is fine; role comes from the signed token, not this call).
        testifierProvider.joinViewer('s1', 'testifier');
        await waitForEvent(testifierEvents, 'join-ack');
        viewerProvider.joinViewer('s1', 'kenyan-viewer');
        await waitForEvent(viewerEvents, 'join-ack');

        // Real hard-gate check: testifier must actually hold SPEAKING_ALLOWED before startSpeaking() will hand back a stream.
        testifierController.handleTransportEvent('speaking-state', { granted: true });
        assert.equal(testifierController.getState(), 'SPEAKING_ALLOWED');
        const captureResult = await testifierController.startSpeaking();
        assert.equal(captureResult.success, true);

        const publishResult = await testifierPublisher.publishTo('kenyan-viewer', captureResult.stream);
        assert.equal(publishResult.success, true);

        const peerStateEvents = [];
        testifierPublisher._onEvent = (name, detail) => { if (name === 'media-peer-state') peerStateEvents.push(detail); };

        // Wait for the real relay round trip: offer -> viewer -> answer -> testifier -> both connectionState "connected".
        await new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (testifierPublisher.getPeerState('kenyan-viewer') === PEER_STATE.MEDIA_CONNECTED &&
                    viewerPublisher.getPeerState('testifier') === PEER_STATE.MEDIA_CONNECTED) return resolve();
                if (Date.now() - start > 3000) return reject(new Error('Timed out waiting for MEDIA_CONNECTED on both sides.'));
                setTimeout(check, 20);
            };
            check();
        });

        assert.equal(testifierPublisher.getPeerState('kenyan-viewer'), PEER_STATE.MEDIA_CONNECTED);
        assert.equal(viewerPublisher.getPeerState('testifier'), PEER_STATE.MEDIA_CONNECTED);

        testifierProvider.disconnectAll();
        viewerProvider.disconnectAll();
    } finally {
        restore();
        await server.close();
    }
});

test('security: a viewer who was never granted speaking permission cannot publish — local hard gate refuses before any signaling is sent', async () => {
    const restore = installFakeRTCPeerConnection();
    const { server, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyLiveParticipationController } = loadControllerModule();
    const { CozyLiveMediaPublisher } = loadPublisherModule();
    try {
        const bobEvents = [];
        const bobProvider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => { bobEvents.push({ type, detail }); controller.handleTransportEvent(type, detail); },
        });
        const controller = new CozyLiveParticipationController({ deviceManager: { createMicrophoneStream: async () => ({ success: true, stream: makeFakeStream() }), muteLocalMicrophone() {}, unmuteLocalMicrophone() {}, stopMicrophone() {} }, transportProvider: bobProvider, sessionId: 's1', userId: 'bob' });
        const publisher = new CozyLiveMediaPublisher({ participationController: controller, transportProvider: bobProvider, sessionId: 's1', userId: 'bob' });

        bobProvider.joinViewer('s1', 'bob');
        await waitForEvent(bobEvents, 'join-ack');
        assert.equal(controller.getState(), 'JOINED'); // never asked to speak, never granted

        const result = await publisher.publishTo('pastor', makeFakeStream());
        assert.equal(result.success, false);
        assert.equal(result.reason, 'NOT_AUTHORIZED_TO_PUBLISH');
        assert.equal(publisher.listPeers().length, 0, 'no RTCPeerConnection may be created for an unauthorized publish attempt');

        bobProvider.disconnectAll();
    } finally {
        restore();
        await server.close();
    }
});

test('security: even a SPEAK_REQUESTED (not yet granted) participant cannot publish', async () => {
    const restore = installFakeRTCPeerConnection();
    const { server, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyLiveParticipationController } = loadControllerModule();
    const { CozyLiveMediaPublisher } = loadPublisherModule();
    try {
        const bobEvents = [];
        const bobProvider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => { bobEvents.push({ type, detail }); controller.handleTransportEvent(type, detail); },
        });
        const controller = new CozyLiveParticipationController({ deviceManager: { createMicrophoneStream: async () => ({ success: true, stream: makeFakeStream() }), muteLocalMicrophone() {}, unmuteLocalMicrophone() {}, stopMicrophone() {} }, transportProvider: bobProvider, sessionId: 's1', userId: 'bob' });
        const publisher = new CozyLiveMediaPublisher({ participationController: controller, transportProvider: bobProvider, sessionId: 's1', userId: 'bob' });

        bobProvider.joinViewer('s1', 'bob');
        await waitForEvent(bobEvents, 'join-ack');
        controller.requestToSpeak();
        await waitForEvent(bobEvents, 'request-speak-ack');
        assert.equal(controller.getState(), 'SPEAK_REQUESTED');

        const result = await publisher.publishTo('pastor', makeFakeStream());
        assert.equal(result.success, false);
        assert.equal(result.reason, 'NOT_AUTHORIZED_TO_PUBLISH');

        bobProvider.disconnectAll();
    } finally {
        restore();
        await server.close();
    }
});

test('revoke while publishing: stopAllPublishing() (wired via participation onEvent) closes the real peer connection', async () => {
    const restore = installFakeRTCPeerConnection();
    const { server, authority, url } = await startServer({ s1: { pastor: 'host', testifier: 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyLiveParticipationController } = loadControllerModule();
    const { CozyLiveMediaPublisher, PEER_STATE } = loadPublisherModule();
    try {
        authority.grantSpeaking('s1', 'pastor', 'testifier');
        const events = [];
        const provider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => { events.push({ type, detail }); controller.handleTransportEvent(type, detail); publisher.handleTransportEvent(type, detail); },
        });
        const controller = new CozyLiveParticipationController({
            deviceManager: { createMicrophoneStream: async () => ({ success: true, stream: makeFakeStream() }), muteLocalMicrophone() {}, unmuteLocalMicrophone() {}, stopMicrophone() {} },
            transportProvider: provider, sessionId: 's1', userId: 'testifier',
            onEvent: (name, detail) => { if (name === 'participation-state' && detail.current !== 'SPEAKING' && detail.current !== 'SPEAKING_ALLOWED') publisher.stopAllPublishing(); },
        });
        const publisher = new CozyLiveMediaPublisher({ participationController: controller, transportProvider: provider, sessionId: 's1', userId: 'testifier' });

        provider.joinViewer('s1', 'testifier');
        await waitForEvent(events, 'join-ack');
        controller.handleTransportEvent('speaking-state', { granted: true });
        const cap = await controller.startSpeaking();
        const pub = await publisher.publishTo('pastor', cap.stream);
        assert.equal(pub.success, true);
        assert.equal(publisher.getPeerState('pastor'), PEER_STATE.MEDIA_PUBLISHED);
        const pcBeforeRevoke = publisher._peers.get('pastor').pc;
        assert.equal(pcBeforeRevoke.connectionState === 'closed', false);

        // Real server-driven revoke event, same shape session-authority/signaling-server actually sends.
        controller.handleTransportEvent('speaking-state', { granted: false });
        assert.equal(controller.getState(), 'MUTED');
        assert.equal(publisher.listPeers().length, 0, 'stopAllPublishing must have closed and removed the peer');
        assert.equal(pcBeforeRevoke.connectionState, 'closed');

        provider.disconnectAll();
    } finally {
        restore();
        await server.close();
    }
});

test('capability honesty: publishTo() fails cleanly with a disclosed reason when RTCPeerConnection is unavailable, and creates no peer', async () => {
    const previous = globalThis.RTCPeerConnection;
    delete globalThis.RTCPeerConnection;
    try {
        const { CozyLiveMediaPublisher } = loadPublisherModule();
        const stubController = { getState: () => 'SPEAKING_ALLOWED' };
        const stubTransport = { sendWebrtcOffer: () => ({ success: true, dispatched: true }) };
        const publisher = new CozyLiveMediaPublisher({ participationController: stubController, transportProvider: stubTransport, sessionId: 's1', userId: 'x' });
        assert.equal(publisher.capabilities().webRTC, false);
        const result = await publisher.publishTo('y', makeFakeStream());
        assert.equal(result.success, false);
        assert.match(result.reason, /not available/);
        assert.equal(publisher.listPeers().length, 0);
    } finally {
        globalThis.RTCPeerConnection = previous;
    }
});
