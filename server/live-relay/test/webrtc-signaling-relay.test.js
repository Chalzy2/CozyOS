'use strict';

/**
 * server/live-relay/test/webrtc-signaling-relay.test.js
 * R040 Phase 4B — WebRTC Signaling Relay
 *
 * HARNESS DISCLOSURE: real LiveDistributionSignalingServer over a real
 * loopback TCP port, real native WebSocket clients — same harness
 * convention as live-distribution-signaling-server.test.js. No real
 * RTCPeerConnection is exercised here (Node has none) — the sdp/
 * candidate payloads below are opaque strings/objects as far as this
 * server is concerned; it never parses or validates their SDP content,
 * only relays them, so a plain string is an honest, sufficient
 * substitute for verifying THIS layer.
 *
 * Run: node --test server/live-relay/test/webrtc-signaling-relay.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveDistributionSignalingServer } = require('../live-distribution-signaling-server');
const sessionToken = require('../session-token');

const SECRET = 'webrtc-relay-test-secret';

async function startServer(opts = {}) {
    const server = new LiveDistributionSignalingServer(Object.assign({ secret: SECRET, heartbeatTimeoutMs: 200, disconnectTimeoutMs: 500, sweepIntervalMs: 50 }, opts));
    const addr = await server.listen(0, '127.0.0.1');
    return { server, url: `ws://127.0.0.1:${addr.port}` };
}

function waitFor(ws, type, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${type}"`)), timeoutMs);
        function onMsg(evt) {
            const msg = JSON.parse(evt.data);
            if (msg.type === type) {
                clearTimeout(timer);
                ws.removeEventListener('message', onMsg);
                resolve(msg);
            }
        }
        ws.addEventListener('message', onMsg);
    });
}

function openAuthed(url, sessionId, role, sub) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.addEventListener('open', () => {
            const token = sessionToken.sign({ sessionId, role, sub }, SECRET, 60);
            ws.send(JSON.stringify({ type: 'auth', token }));
        });
        ws.addEventListener('error', reject);
        waitFor(ws, 'auth-ack').then((ack) => {
            if (!ack.success) return reject(new Error('auth-ack failed: ' + ack.reason));
            resolve(ws);
        }, reject);
    });
}

test('host (real publish authority) can send a webrtc-offer that is relayed verbatim to the target', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 's1', 'host', 'pastor');
        const viewer = await openAuthed(url, 's1', 'viewer', 'amy');

        const relayed = waitFor(viewer, 'webrtc-offer');
        const ack = waitFor(host, 'webrtc-offer-ack');
        host.send(JSON.stringify({ type: 'webrtc-offer', sessionId: 's1', targetUserId: 'amy', sdp: { type: 'offer', sdp: 'fake-sdp-body' } }));

        const [msg, ackMsg] = await Promise.all([relayed, ack]);
        assert.equal(msg.fromUserId, 'pastor');
        assert.equal(msg.sdp.sdp, 'fake-sdp-body');
        assert.equal(ackMsg.success, true);

        host.close(); viewer.close();
    } finally {
        await server.close();
    }
});

test('a granted speaker (token role "speaker") may also initiate a webrtc-offer', async () => {
    const { server, url } = await startServer();
    try {
        const speaker = await openAuthed(url, 's1', 'speaker', 'testifier');
        const viewer = await openAuthed(url, 's1', 'viewer', 'kenyan-viewer');

        const relayed = waitFor(viewer, 'webrtc-offer');
        speaker.send(JSON.stringify({ type: 'webrtc-offer', sessionId: 's1', targetUserId: 'kenyan-viewer', sdp: { type: 'offer', sdp: 'testimony-sdp' } }));
        const msg = await relayed;
        assert.equal(msg.fromUserId, 'testifier');

        speaker.close(); viewer.close();
    } finally {
        await server.close();
    }
});

test('a plain viewer (no granted speaking authority) cannot initiate a webrtc-offer — server rejects, never relays', async () => {
    const { server, url } = await startServer();
    try {
        const viewer = await openAuthed(url, 's1', 'viewer', 'bob');
        const other = await openAuthed(url, 's1', 'viewer', 'amy');

        let otherReceivedOffer = false;
        other.addEventListener('message', (evt) => {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'webrtc-offer') otherReceivedOffer = true;
        });

        const ack = waitFor(viewer, 'webrtc-offer-ack');
        viewer.send(JSON.stringify({ type: 'webrtc-offer', sessionId: 's1', targetUserId: 'amy', sdp: { type: 'offer', sdp: 'forged' } }));
        const ackMsg = await ack;

        assert.equal(ackMsg.success, false);
        assert.match(ackMsg.reason, /Only host\/moderator\/granted-speaker/);
        await new Promise((r) => setTimeout(r, 100));
        assert.equal(otherReceivedOffer, false, 'a rejected offer must never reach the target');

        viewer.close(); other.close();
    } finally {
        await server.close();
    }
});

test('any authenticated participant (including a viewer) may send webrtc-answer / webrtc-ice-candidate', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 's1', 'host', 'pastor');
        const viewer = await openAuthed(url, 's1', 'viewer', 'amy');

        const answerRelayed = waitFor(host, 'webrtc-answer');
        viewer.send(JSON.stringify({ type: 'webrtc-answer', sessionId: 's1', targetUserId: 'pastor', sdp: { type: 'answer', sdp: 'answer-body' } }));
        const answerMsg = await answerRelayed;
        assert.equal(answerMsg.fromUserId, 'amy');

        const candidateRelayed = waitFor(host, 'webrtc-ice-candidate');
        viewer.send(JSON.stringify({ type: 'webrtc-ice-candidate', sessionId: 's1', targetUserId: 'pastor', candidate: { candidate: 'candidate:1 fake' } }));
        const candidateMsg = await candidateRelayed;
        assert.equal(candidateMsg.candidate.candidate, 'candidate:1 fake');

        host.close(); viewer.close();
    } finally {
        await server.close();
    }
});

test('targeting an unknown/offline participant is honestly rejected, never fabricated as delivered', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 's1', 'host', 'pastor');
        const ack = waitFor(host, 'webrtc-offer-ack');
        host.send(JSON.stringify({ type: 'webrtc-offer', sessionId: 's1', targetUserId: 'nobody-here', sdp: { type: 'offer', sdp: 'x' } }));
        const ackMsg = await ack;
        assert.equal(ackMsg.success, false);
        assert.match(ackMsg.reason, /not currently connected/);
        host.close();
    } finally {
        await server.close();
    }
});

test('sessionId mismatch with the authenticated token is rejected', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 's1', 'host', 'pastor');
        const err = waitFor(host, 'error');
        host.send(JSON.stringify({ type: 'webrtc-offer', sessionId: 'forged-session', targetUserId: 'amy', sdp: { type: 'offer', sdp: 'x' } }));
        const errMsg = await err;
        assert.match(errMsg.reason, /sessionId mismatch/);
        host.close();
    } finally {
        await server.close();
    }
});

test('a moderator with a forged targetUserId claiming to be a different real participant still only relays under their OWN real sub (fromUserId cannot be spoofed)', async () => {
    const { server, url } = await startServer();
    try {
        const moderator = await openAuthed(url, 's1', 'moderator', 'mod1');
        const viewer = await openAuthed(url, 's1', 'viewer', 'amy');

        const relayed = waitFor(viewer, 'webrtc-offer');
        // Attempt to forge fromUserId in the message body — server must ignore it and use conn.sub.
        moderator.send(JSON.stringify({ type: 'webrtc-offer', sessionId: 's1', targetUserId: 'amy', fromUserId: 'pastor', sdp: { type: 'offer', sdp: 'x' } }));
        const msg = await relayed;
        assert.equal(msg.fromUserId, 'mod1');

        moderator.close(); viewer.close();
    } finally {
        await server.close();
    }
});

test('healthz honestly reports webrtcSignalingRelay:true and webrtcSfu:false', async () => {
    const { server, url } = await startServer();
    try {
        const httpUrl = url.replace('ws://', 'http://');
        const res = await fetch(`${httpUrl}/healthz`);
        const body = await res.json();
        assert.equal(body.capability.webrtcSignalingRelay, true);
        assert.equal(body.capability.webrtcSfu, false);
    } finally {
        await server.close();
    }
});
