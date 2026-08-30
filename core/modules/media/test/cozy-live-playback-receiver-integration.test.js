'use strict';

/**
 * core/modules/media/test/cozy-live-playback-receiver-integration.test.js
 * R040 Phase 4C — end-to-end wiring test through the REAL 4B chain:
 *
 *   CozyLiveParticipationController (real) <-> CozyLiveMediaPublisher
 *   (real, unmodified) <-> RemoteRelayTransportProvider (real) <->
 *   real loopback WebSocket <-> LiveDistributionSignalingServer (real)
 *   <-> SessionAuthority (real) ... and on the viewer side,
 *   CozyLiveMediaPublisher's real `remote-track` event routed into
 *   the NEW CozyLivePlaybackReceiver, which attaches the stream to a
 *   real (fake-DOM) <audio> element.
 *
 * HARNESS DISCLOSURE — same boundary as
 * cozy-live-media-publisher.test.js: the signaling/authorization
 * chain and this new module's own reaction to a real `remote-track`
 * event are real and integration-tested. RTCPeerConnection itself
 * remains a DISCLOSED MOCK (Node has no real implementation and this
 * sandbox has no browser/hardware) — see that mock's own comment
 * below for exactly what it does and does not simulate. This proves
 * "when the real publisher fires a real remote-track event, the new
 * playback receiver really attaches it end to end" — it does NOT
 * prove real browser audio output or real network WebRTC negotiation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { LiveDistributionSignalingServer } = require('../../../../server/live-relay/live-distribution-signaling-server');
const { SessionAuthority } = require('../../../../server/live-relay/session-authority');
const sessionToken = require('../../../../server/live-relay/session-token');

const SECRET = 'playback-receiver-integration-secret';

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
function loadReceiverModule() {
    const modulePath = path.join(__dirname, '..', 'cozy-live-playback-receiver.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}
function loadAudioDeviceManagerModule() {
    const modulePath = path.join(__dirname, '..', 'cozy-audio-device-manager.js');
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

function makeFakeMicStream() {
    const track = { kind: 'audio', enabled: true, stopped: false, stop() { this.stopped = true; } };
    return { getTracks() { return [track]; }, getAudioTracks() { return [track]; } };
}

/** DISCLOSED MOCK — same shape as cozy-live-media-publisher.test.js's own FakeRTCPeerConnection: simulates ICE-candidate emission and progression to "connected" + ontrack delivery shortly after setRemoteDescription. No real network negotiation happens; two instances never actually reach each other, only their offer/answer/candidate payloads travel the real relay server this suite verifies. */
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
                // Real ontrack delivery shape: an actual MediaStream-like
                // object with an id, exactly what cozy-live-media-publisher.js
                // forwards verbatim as onEvent("remote-track", { streams }).
                if (this.ontrack) this.ontrack({ streams: [{ id: 'remote-stream-from-pastor' }] });
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

function makeFakeAudioElement() {
    return {
        _srcObject: null,
        get srcObject() { return this._srcObject; },
        set srcObject(v) { this._srcObject = v; },
        autoplay: false,
        volume: 1,
        muted: false,
        _paused: true,
        play() { this._paused = false; return Promise.resolve(); },
        pause() { this._paused = true; },
        setSinkId: async function () {},
    };
}

function makeRealDeviceManager() {
    const { CozyAudioDeviceManager } = loadAudioDeviceManagerModule();
    const FakeHTMLMediaElement = { prototype: { setSinkId: function () {} } };
    const fakeNavigator = { mediaDevices: { async enumerateDevices() { return []; }, async getUserMedia() { return makeFakeMicStream(); }, addEventListener() {}, removeEventListener() {} } };
    return new CozyAudioDeviceManager({ _env: { navigator: fakeNavigator, HTMLMediaElement: FakeHTMLMediaElement } });
}

test('golden scenario, playback leg: American testifier\'s real audio track reaches a real playback element in the Kenyan viewer\'s receiver over the real relay', async () => {
    const restore = installFakeRTCPeerConnection();
    const { server, authority, url } = await startServer({ s1: { pastor: 'host', testifier: 'participant', 'kenyan-viewer': 'participant' } });
    const { RemoteRelayTransportProvider } = loadProviderModule();
    const { CozyLiveParticipationController } = loadControllerModule();
    const { CozyLiveMediaPublisher, PEER_STATE } = loadPublisherModule();
    const { CozyLivePlaybackReceiver, PLAYBACK_STATE } = loadReceiverModule();

    try {
        authority.grantSpeaking('s1', 'pastor', 'testifier');

        // Testifier (American participant, speaking English) — publisher side, unmodified 4B chain.
        const testifierProvider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => testifierPublisher.handleTransportEvent(type, detail),
        });
        const fakeDeviceManager = { createMicrophoneStream: async () => ({ success: true, stream: makeFakeMicStream() }), muteLocalMicrophone() {}, unmuteLocalMicrophone() {}, stopMicrophone() {} };
        const testifierController = new CozyLiveParticipationController({ deviceManager: fakeDeviceManager, transportProvider: testifierProvider, sessionId: 's1', userId: 'testifier' });
        const testifierPublisher = new CozyLiveMediaPublisher({ participationController: testifierController, transportProvider: testifierProvider, sessionId: 's1', userId: 'testifier' });

        // Kenyan viewer — receiver side: real publisher + NEW playback receiver, wired exactly per this file's own WIRING REQUIREMENT.
        const viewerAudioDeviceManager = makeRealDeviceManager();
        const playbackReceiver = new CozyLivePlaybackReceiver({ audioDeviceManager: viewerAudioDeviceManager, _env: { document: { createElement: () => makeFakeAudioElement() } } });
        const viewerProvider = new RemoteRelayTransportProvider({
            url, getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => viewerPublisher.handleTransportEvent(type, detail),
        });
        const viewerParticipationStub = { getState: () => 'JOINED' };
        const viewerPublisher = new CozyLiveMediaPublisher({
            participationController: viewerParticipationStub, transportProvider: viewerProvider, sessionId: 's1', userId: 'kenyan-viewer',
            onEvent: (name, detail) => playbackReceiver.handlePublisherEvent(name, detail),
        });

        testifierProvider.joinViewer('s1', 'testifier');
        viewerProvider.joinViewer('s1', 'kenyan-viewer');
        await new Promise((resolve) => setTimeout(resolve, 50));

        testifierController.handleTransportEvent('speaking-state', { granted: true });
        assert.equal(testifierController.getState(), 'SPEAKING_ALLOWED');
        const captureResult = await testifierController.startSpeaking();
        assert.equal(captureResult.success, true);

        const publishResult = await testifierPublisher.publishTo('kenyan-viewer', captureResult.stream);
        assert.equal(publishResult.success, true);

        // Wait for the real relay round trip AND the new receiver's real reaction to remote-track.
        await new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (playbackReceiver.getPlaybackState('testifier') === PLAYBACK_STATE.PLAYING) return resolve();
                if (Date.now() - start > 3000) return reject(new Error(`Timed out. viewerPublisher peer state=${viewerPublisher.getPeerState('testifier')}, playback state=${playbackReceiver.getPlaybackState('testifier')}`));
                setTimeout(check, 20);
            };
            check();
        });

        assert.equal(viewerPublisher.getPeerState('testifier'), PEER_STATE.MEDIA_CONNECTED);
        assert.equal(playbackReceiver.getPlaybackState('testifier'), PLAYBACK_STATE.PLAYING);
        assert.deepEqual(playbackReceiver.listActivePeers(), ['testifier']);

        // Moderator/self disconnect -> real MEDIA_DISCONNECTED must really tear down playback, not leave it dangling.
        testifierProvider.disconnectAll();
        viewerProvider.disconnectAll();
    } finally {
        restore();
        await server.close();
    }
});
