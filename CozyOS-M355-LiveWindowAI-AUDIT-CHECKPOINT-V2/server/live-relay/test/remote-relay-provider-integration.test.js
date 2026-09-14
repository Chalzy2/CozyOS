'use strict';

/**
 * server/live-relay/test/remote-relay-provider-integration.test.js
 * R040 Phase 3 — proves the remote-relay provider plugs into the
 * EXISTING, unmodified-in-logic core/shell/live/cozy-live-distribution-transport.js
 * via its real registerTransportProvider()/selectTransport() extension
 * points, and that publishSource()/joinViewer() issued through that
 * SAME orchestrator API a caller already used for local-relay now
 * really cross a real loopback TCP socket to a real independent
 * server process object.
 *
 * HARNESS DISCLOSURE: real server (real port), real WebSocket client
 * (Node's native global), real HMAC-signed tokens. Not covered: public
 * internet reachability (see server/live-relay/README.md).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { LiveDistributionSignalingServer } = require('../live-distribution-signaling-server');
const sessionToken = require('../session-token');

const SECRET = 'integration-secret';

function loadTransportOrchestrator() {
    const modulePath = path.join(__dirname, '..', '..', '..', 'core', 'shell', 'live', 'cozy-live-distribution-transport.js');
    delete require.cache[require.resolve(modulePath)];
    const win = { CozyOS: {} };
    global.window = win;
    require(modulePath);
    return win.CozyOS.CozyLiveDistributionTransport;
}

function loadRemoteProvider() {
    const modulePath = path.join(__dirname, '..', '..', '..', 'core', 'shell', 'live', 'providers', 'cozy-live-remote-relay-transport-provider.js');
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}

test('remote-relay provider registers into the real orchestrator and fans a real segment out to a real remote viewer', async () => {
    const server = new LiveDistributionSignalingServer({ secret: SECRET, heartbeatTimeoutMs: 5000, disconnectTimeoutMs: 20000 });
    const addr = await server.listen(0, '127.0.0.1');
    const url = `ws://127.0.0.1:${addr.port}`;

    try {
        const transport = loadTransportOrchestrator();
        const { RemoteRelayTransportProvider } = loadRemoteProvider();

        // Real orchestrator, real un-fabricated capability report before any remote provider exists.
        let cap = transport.getCapabilityReport();
        assert.equal(cap.REMOTE_CAPABLE_PROVIDER_REGISTERED, false);

        const events = [];
        const provider = new RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            transport,
            onEvent: (type, detail) => events.push({ type, detail }),
        });

        transport.registerTransportProvider(provider);
        cap = transport.getCapabilityReport();
        assert.equal(cap.REMOTE_CAPABLE_PROVIDER_REGISTERED, true, 'orchestrator must honestly reflect the newly registered remote-capable provider');

        transport.selectTransport('remote-relay');

        // A "viewer" client connects via a second provider instance representing a different runtime/device.
        const viewerProviderModule = loadRemoteProvider(); // fresh module instance is fine; class is stateless at module scope
        const viewerEvents = [];
        const viewerProvider = new viewerProviderModule.RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => viewerEvents.push({ type, detail }),
        });

        const joinResult = viewerProvider.joinViewer('sess-int', 'viewer-remote-1');
        assert.equal(joinResult.success, true);

        // Wait for the real join-ack round trip.
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('join-ack timeout')), 3000);
            const check = setInterval(() => {
                if (viewerEvents.some((e) => e.type === 'join-ack' && e.detail.success)) {
                    clearInterval(check); clearTimeout(timer); resolve();
                }
            }, 20);
        });

        // Pastor's device publishes THROUGH THE UNMODIFIED ORCHESTRATOR CALL — exactly
        // the same call site a caller already used for local-relay in Phase 2.
        const publishResult = transport.publishSource('sess-int', { segmentId: 'seg-int-1', sourceLanguage: 'sw', text: 'Karibu sana' });
        assert.equal(publishResult.success, true);

        // Real segment arrival on the real remote viewer connection.
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('segment-received timeout')), 3000);
            const check = setInterval(() => {
                const hit = viewerEvents.find((e) => e.type === 'segment-received' && e.detail.segment && e.detail.segment.segmentId === 'seg-int-1');
                if (hit) { clearInterval(check); clearTimeout(timer); resolve(hit); }
            }, 20);
        });

        // The orchestrator's own connection-state model was updated via the real
        // async reportAsyncState() hook — not fabricated by the test.
        await new Promise((resolve) => setTimeout(resolve, 100));
        const sourceState = transport.getConnectionState('sess-int', 'source');
        assert.equal(sourceState, 'connected');

        provider.disconnectAll();
        viewerProvider.disconnectAll();
    } finally {
        await server.close();
    }
});

test('connectAsHost() closes the host-before-requestSpeak gap: a host reaches authenticated session presence and can request-to-speak WITHOUT ever calling publishSource()', async () => {
    const { SessionAuthority } = require('../session-authority');
    // Real SessionAuthority so request-speak actually reaches SessionAuthority.requestSpeaking(),
    // not just the wire — same real path _onRequestSpeak() uses in production.
    const roster = { 'sess-host-connect': { 'pastor-1': 'host' } };
    const authority = new SessionAuthority({
        secret: SECRET,
        roleResolver: (sessionId, userId) => (roster[sessionId] && roster[sessionId][userId]) ? { userId, role: roster[sessionId][userId], language: 'en', muted: false, cameraOn: false, joinedAt: Date.now() } : null,
    });
    const server = new LiveDistributionSignalingServer({ secret: SECRET, authority, heartbeatTimeoutMs: 5000, disconnectTimeoutMs: 20000 });
    const addr = await server.listen(0, '127.0.0.1');
    const url = `ws://127.0.0.1:${addr.port}`;

    try {
        const { RemoteRelayTransportProvider } = loadRemoteProvider();
        const events = [];
        const hostProvider = new RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role: 'host', sub }, SECRET, 60),
            onEvent: (type, detail) => events.push({ type, detail }),
        });

        // THE GAP: before this session's fix, the only host-role connection
        // path was publishSource() (already-authorized-publisher) — there
        // was no way to reach an authenticated presence first. This proves
        // the new method does it alone.
        const connectResult = hostProvider.connectAsHost('sess-host-connect', 'pastor-1');
        assert.equal(connectResult.success, true);
        assert.equal(connectResult.pending, true);

        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('auth-ack timeout')), 3000);
            const check = setInterval(() => {
                if (events.some((e) => e.type === 'auth-ack' && e.detail.success)) {
                    clearInterval(check); clearTimeout(timer); resolve();
                }
            }, 20);
        });

        // requestSpeak() must now succeed purely off the connectAsHost()
        // connection — publishSource() is never called anywhere in this test.
        const speakResult = hostProvider.requestSpeak('sess-host-connect');
        assert.equal(speakResult.success, true, 'requestSpeak must dispatch over the connectAsHost() connection, not fail with "No active connection for session."');

        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('request-speak-ack timeout')), 3000);
            const check = setInterval(() => {
                if (events.some((e) => e.type === 'request-speak-ack')) { clearInterval(check); clearTimeout(timer); resolve(); }
            }, 20);
        });
        const ack = events.find((e) => e.type === 'request-speak-ack');
        assert.equal(ack.detail.success, true, 'the real SessionAuthority must actually grant the request-speak, proving this reached real server authorization, not a stub');

        // Confirm no publish-source/publish-ack ever occurred on this connection.
        assert.equal(events.some((e) => e.type === 'publish-ack'), false, 'this test never calls publishSource() — the connection came from connectAsHost() alone');

        hostProvider.disconnectAll();
    } finally {
        await server.close();
    }
});
