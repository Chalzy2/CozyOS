'use strict';

/**
 * core/modules/media/test/cozy-live-audio-segment-relay-integration.test.js
 * R040 Phase 4D, Dependency A — REAL loopback integration test.
 *
 * HARNESS DISCLOSURE (read before trusting these results):
 *   REAL: an actual LiveDistributionSignalingServer instance listening on
 *   a real loopback TCP port, real native WebSocket clients (Node's
 *   built-in global — the SAME class real browsers use), real signed
 *   session tokens (server/live-relay/session-token.js), real
 *   buildAudioSegment()/SegmentOrderer logic from
 *   cozy-live-audio-segment-shape.js, and the real
 *   CozyLiveAudioSegmentReceiver decode/order path.
 *   NOT covered here (Node has neither): MediaRecorder capture (so the
 *   "publisher" side of this test constructs wire-shaped audio-chunk
 *   segments directly via buildAudioSegment(), exactly what
 *   CozyLiveAudioSegmentPublisher's _onChunk() hands to
 *   transport.publishSource() — same object shape, different caller),
 *   and MediaSource/<audio> playback (so PLAYBACK_STARTED is never
 *   claimed by this suite — see the dedicated capability-report
 *   assertion below, which stays NOT_ATTACHED honestly in Node).
 *   Cross-machine/public-internet reachability, TLS, and real
 *   MediaRecorder/MediaSource behavior in an actual browser remain
 *   BROWSER TESTED / DEVICE TESTED, not claimed here.
 *
 * Run: node --test core/modules/media/test/cozy-live-audio-segment-relay-integration.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveDistributionSignalingServer } = require('../../../../server/live-relay/live-distribution-signaling-server');
const sessionToken = require('../../../../server/live-relay/session-token');
const { buildAudioSegment } = require('../cozy-live-audio-segment-shape');
const { CozyLiveAudioSegmentReceiver } = require('../cozy-live-audio-segment-receiver');

const SECRET = 'audio-segment-relay-test-secret';

async function startServer(opts = {}) {
    const server = new LiveDistributionSignalingServer(Object.assign({ secret: SECRET, heartbeatTimeoutMs: 500, disconnectTimeoutMs: 2000, sweepIntervalMs: 100 }, opts));
    const addr = await server.listen(0, '127.0.0.1');
    return { server, url: `ws://127.0.0.1:${addr.port}` };
}

function waitFor(ws, type, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${type}"`)), timeoutMs);
        function onMsg(evt) {
            const msg = JSON.parse(evt.data);
            if (msg.type === type) { clearTimeout(timer); ws.removeEventListener('message', onMsg); resolve(msg); }
        }
        ws.addEventListener('message', onMsg);
    });
}

function connectAndAuth(url, { sessionId, role, sub }) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.addEventListener('open', async () => {
            const token = sessionToken.sign({ sessionId, role, sub }, SECRET);
            ws.send(JSON.stringify({ type: 'auth', token }));
            try {
                const ack = await waitFor(ws, 'auth-ack');
                if (!ack.success) return reject(new Error('auth failed: ' + ack.reason));
                resolve(ws);
            } catch (e) { reject(e); }
        });
        ws.addEventListener('error', (e) => reject(e));
    });
}

test('one real host connection publishes audio-chunk segments; MANY real viewer connections all receive them (one-upstream-many-viewers, real transport)', async (t) => {
    const { server, url } = await startServer();
    t.after(() => server.close());

    const sessionId = 'golden-session-1';
    const host = await connectAndAuth(url, { sessionId, role: 'host', sub: 'american-speaker-1' });

    const VIEWER_COUNT = 5; // Kenya, Nigeria, USA, UK, France — deliberately worldwide-flavored sub ids
    const viewerSubs = ['viewer-kenya', 'viewer-nigeria', 'viewer-usa', 'viewer-uk', 'viewer-france'];
    const viewers = await Promise.all(viewerSubs.map((sub) => connectAndAuth(url, { sessionId, role: 'viewer', sub })));

    // Each viewer joins and is composed with a REAL receiver instance,
    // exactly mirroring how a caller wires RemoteRelayTransportProvider's
    // onEvent into CozyLiveAudioSegmentReceiver.handleTransportEvent().
    const receivers = viewers.map((ws, i) => {
        const receiver = new CozyLiveAudioSegmentReceiver({ sessionId });
        ws.addEventListener('message', (evt) => {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'segment') receiver.handleTransportEvent('segment-received', msg);
        });
        return receiver;
    });

    await Promise.all(viewers.map((ws, i) => new Promise((resolve, reject) => {
        ws.send(JSON.stringify({ type: 'join-viewer', sessionId, viewerId: viewerSubs[i] }));
        waitFor(ws, 'join-ack').then(resolve).catch(reject);
    })));

    // The American speaker's testimony: 3 chunks of ONE segment, English, published from ONE host connection.
    const segmentId = 'testimony-seg-1';
    const chunks = ['chunk-0-bytes', 'chunk-1-bytes', 'chunk-2-bytes'].map((raw, seq) =>
        buildAudioSegment({
            segmentId, seq, isFinal: seq === 2, publisherId: 'american-speaker-1',
            sourceLanguage: 'en', mimeType: 'audio/webm;codecs=opus',
            audioBase64: Buffer.from(raw).toString('base64'),
        }).segment
    );

    for (const segment of chunks) {
        host.send(JSON.stringify({ type: 'publish-source', sessionId, segment }));
        await waitFor(host, 'publish-ack');
    }

    // Give the event loop a tick for all viewer sockets to have processed their messages.
    await new Promise((r) => setTimeout(r, 100));

    // THE ACTUAL ASSERTION: every one of the 5 independent viewer
    // connections — reached through ONE upstream host connection and
    // the server's single fan-out pass per publish — received and
    // correctly ordered/decoded all 3 chunks.
    for (let i = 0; i < VIEWER_COUNT; i++) {
        const metrics = receivers[i].getMetrics();
        assert.equal(metrics.chunksAccepted, 3, `viewer ${viewerSubs[i]} should accept all 3 chunks`);
        assert.equal(metrics.chunksRejected, 0, `viewer ${viewerSubs[i]} should reject none`);
        assert.equal(metrics.segmentsCompleted, 1, `viewer ${viewerSubs[i]} should see the segment complete exactly once`);
    }

    // Honest capability report: the RELAY property is real; browser
    // PLAYBACK is honestly NOT claimed in this Node harness.
    const report = receivers[0].getCapabilityReport();
    assert.equal(report.ONE_UPSTREAM_MANY_VIEWERS_AUDIO_SEGMENT_RELAY, true);
    assert.equal(report.ONE_UPSTREAM_MANY_VIEWERS_RTP_SFU, false);
    assert.equal(report.PLAYBACK_STATE, 'NOT_ATTACHED');
    assert.equal(report.capabilities.mediaSource, false, 'Node has no MediaSource — must be honestly reported, never fabricated');

    // Server-side confirmation from the source's own perspective: the
    // publish-ack for the FINAL chunk reports delivery to all 5 viewers
    // from the SAME single host connection — the "one upstream" side of
    // the property, verified from the server's own bookkeeping, not
    // just inferred from the viewer side.
    // (Re-publish one more chunk of a NEW segment to inspect a fresh ack.)
    const secondSegment = buildAudioSegment({
        segmentId: 'testimony-seg-2', seq: 0, isFinal: true, publisherId: 'american-speaker-1',
        sourceLanguage: 'en', mimeType: 'audio/webm;codecs=opus', audioBase64: Buffer.from('x').toString('base64'),
    }).segment;
    host.send(JSON.stringify({ type: 'publish-source', sessionId, segment: secondSegment }));
    const ack2 = await waitFor(host, 'publish-ack');
    assert.equal(ack2.delivered.length, VIEWER_COUNT, 'one publish-source call from ONE host connection must be acknowledged as delivered to all 5 viewers');

    for (const ws of [host, ...viewers]) ws.close();
});

test('receiver rejects a duplicate chunk and a gapped chunk instead of silently accepting them', async (t) => {
    const { server, url } = await startServer();
    t.after(() => server.close());
    const sessionId = 'golden-session-2';
    const host = await connectAndAuth(url, { sessionId, role: 'host', sub: 'speaker-2' });
    const viewer = await connectAndAuth(url, { sessionId, role: 'viewer', sub: 'viewer-1' });

    const receiver = new CozyLiveAudioSegmentReceiver({ sessionId });
    const events = [];
    receiver._onEvent = (type, detail) => events.push({ type, detail });
    viewer.addEventListener('message', (evt) => {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'segment') receiver.handleTransportEvent('segment-received', msg);
    });
    viewer.send(JSON.stringify({ type: 'join-viewer', sessionId, viewerId: 'viewer-1' }));
    await waitFor(viewer, 'join-ack');

    const seg0 = buildAudioSegment({ segmentId: 'seg-gap', seq: 0, publisherId: 'speaker-2', sourceLanguage: 'sw', mimeType: 'audio/webm', audioBase64: Buffer.from('a').toString('base64') }).segment;
    const seg2 = buildAudioSegment({ segmentId: 'seg-gap', seq: 2, publisherId: 'speaker-2', sourceLanguage: 'sw', mimeType: 'audio/webm', audioBase64: Buffer.from('c').toString('base64') }).segment;

    host.send(JSON.stringify({ type: 'publish-source', sessionId, segment: seg0 }));
    await waitFor(host, 'publish-ack');
    host.send(JSON.stringify({ type: 'publish-source', sessionId, segment: seg0 })); // duplicate, real re-send over the wire
    await waitFor(host, 'publish-ack');
    host.send(JSON.stringify({ type: 'publish-source', sessionId, segment: seg2 })); // gap: seq 1 never sent
    await waitFor(host, 'publish-ack');
    await new Promise((r) => setTimeout(r, 100));

    const metrics = receiver.getMetrics();
    assert.equal(metrics.chunksAccepted, 1, 'only the first, genuinely new chunk is accepted');
    assert.equal(metrics.chunksRejected, 2, 'duplicate and gapped chunks are both rejected, not silently accepted');
    assert.ok(events.some((e) => e.type === 'chunk-rejected' && /duplicate/.test(e.detail.reason)));
    assert.ok(events.some((e) => e.type === 'chunk-rejected' && /out-of-order/.test(e.detail.reason)));

    host.close(); viewer.close();
});
