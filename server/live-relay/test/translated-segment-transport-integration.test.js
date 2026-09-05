'use strict';

/**
 * server/live-relay/test/translated-segment-transport-integration.test.js
 * R040 Phase 3E — proves deliverTranslatedSegment() on the EXISTING,
 * unmodified-in-interface core/shell/live/cozy-live-distribution-transport.js
 * really reaches a genuinely separate remote-relay client connection
 * over a real loopback socket, and that the capability report never
 * fabricates this for a provider that doesn't implement it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { LiveDistributionSignalingServer } = require('../live-distribution-signaling-server');
const sessionToken = require('../session-token');

const SECRET = 'integration-secret-2';

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

test('getCapabilityReport() reports TARGETED_TRANSLATED_DELIVERY_AVAILABLE honestly false before, true after a real remote-relay provider is active', async () => {
    const transport = loadTransportOrchestrator();
    let cap = transport.getCapabilityReport();
    assert.equal(cap.TARGETED_TRANSLATED_DELIVERY_AVAILABLE, false, 'local-relay does not implement publishTranslatedSegment');
});

test('deliverTranslatedSegment() carries a language-group result to a real remote viewer over a real socket', async () => {
    const server = new LiveDistributionSignalingServer({ secret: SECRET, heartbeatTimeoutMs: 5000, disconnectTimeoutMs: 20000 });
    const addr = await server.listen(0, '127.0.0.1');
    const url = `ws://127.0.0.1:${addr.port}`;

    try {
        const transport = loadTransportOrchestrator();
        const { RemoteRelayTransportProvider } = loadRemoteProvider();

        const hostProvider = new RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            transport,
        });
        transport.registerTransportProvider(hostProvider);
        transport.selectTransport('remote-relay');

        const cap = transport.getCapabilityReport();
        assert.equal(cap.TARGETED_TRANSLATED_DELIVERY_AVAILABLE, true, 'orchestrator must honestly reflect the active provider now implementing targeted delivery');

        const viewerEvents = [];
        const viewerModule = loadRemoteProvider();
        const viewerProvider = new viewerModule.RemoteRelayTransportProvider({
            url,
            getToken: (sessionId, role, sub) => sessionToken.sign({ sessionId, role, sub }, SECRET, 60),
            onEvent: (type, detail) => viewerEvents.push({ type, detail }),
        });
        viewerProvider.joinViewer('sess-int-tr', 'viewer-kiswahili-1');
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('join-ack timeout')), 3000);
            const check = setInterval(() => {
                if (viewerEvents.some((e) => e.type === 'join-ack' && e.detail.success)) { clearInterval(check); clearTimeout(timer); resolve(); }
            }, 20);
        });

        // This is the same publicly-called method LiveLanguageFanoutRouter
        // now calls per distinct target language — the real production
        // call site, exercised here through the unmodified transport API.
        const result = transport.deliverTranslatedSegment('sess-int-tr', ['viewer-kiswahili-1'], {
            segmentId: 'seg-groupcall-1', sourceLanguage: 'en', language: 'sw', mode: 'TRANSLATE',
            outputText: 'Karibu', isReal: true, providerName: 'nllb',
        });
        assert.equal(result.success, true);

        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('translated-segment-received timeout')), 3000);
            const check = setInterval(() => {
                const hit = viewerEvents.find((e) => e.type === 'translated-segment-received' && e.detail.segmentId === 'seg-groupcall-1');
                if (hit) { clearInterval(check); clearTimeout(timer); resolve(hit); }
            }, 20);
        });

        const delivery = viewerEvents.find((e) => e.type === 'translated-segment-received');
        assert.equal(delivery.detail.language, 'sw');
        assert.equal(delivery.detail.translated.outputText, 'Karibu');

        hostProvider.disconnectAll();
        viewerProvider.disconnectAll();
    } finally {
        await server.close();
    }
});

test('deliverTranslatedSegment() honestly refuses when the active provider does not implement it (local-relay)', async () => {
    const transport = loadTransportOrchestrator();
    const result = transport.deliverTranslatedSegment('sess-x', ['v1'], { segmentId: 's', language: 'fr' });
    assert.equal(result.success, false);
    assert.match(result.reason, /does not support/);
});
