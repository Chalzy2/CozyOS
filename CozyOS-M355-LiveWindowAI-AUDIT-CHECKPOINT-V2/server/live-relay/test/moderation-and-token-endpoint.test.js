'use strict';

/**
 * server/live-relay/test/moderation-and-token-endpoint.test.js
 * R040 Phase 3B/3C/3D/3K
 *
 * HARNESS DISCLOSURE: real server, real loopback socket, real native
 * WebSocket + fetch. roleResolver is a documented-contract double (see
 * session-authority.js header) standing in for a live LDCESessionEngine
 * instance — not a fabrication of LDCE's behavior, the same disclosed-
 * stub convention this repository's own suites already use.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveDistributionSignalingServer } = require('../live-distribution-signaling-server');
const { SessionAuthority } = require('../session-authority');
const sessionToken = require('../session-token');

const SECRET = 'mod-test-secret';

function makeRoster(entries) {
    return (sessionId, requesterId) => {
        const role = entries[sessionId]?.[requesterId];
        if (!role) return null;
        return { userId: requesterId, role, language: 'en', muted: false, cameraOn: true, joinedAt: Date.now() };
    };
}

async function startServer(roster, opts = {}) {
    const authority = new SessionAuthority({ secret: SECRET, roleResolver: makeRoster(roster) });
    const server = new LiveDistributionSignalingServer(Object.assign({ secret: SECRET, authority, heartbeatTimeoutMs: 5000, disconnectTimeoutMs: 20000 }, opts));
    const addr = await server.listen(0, '127.0.0.1');
    return { server, authority, url: `ws://127.0.0.1:${addr.port}`, httpUrl: `http://127.0.0.1:${addr.port}` };
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

async function fetchToken(httpUrl, sessionId, requesterId) {
    const res = await fetch(`${httpUrl}/session/${encodeURIComponent(sessionId)}/token/${encodeURIComponent(requesterId)}`, { method: 'POST' });
    const body = await res.json();
    return { status: res.status, body };
}

function connectWith(url, token) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.addEventListener('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
        ws.addEventListener('error', reject);
        waitFor(ws, 'auth-ack').then((ack) => resolve({ ws, ack }), reject);
    });
}

test('token endpoint mints a token server-side; secret never leaves the server', async () => {
    const { server, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    try {
        const { status, body } = await fetchToken(httpUrl, 's1', 'pastor');
        assert.equal(status, 200);
        assert.equal(body.role, 'host');
        const { ws, ack } = await connectWith(url, body.token);
        assert.equal(ack.success, true);
        assert.equal(ack.role, 'host');
        ws.close();
    } finally { await server.close(); }
});

test('token endpoint rejects an unrecognized requester (not on the real roster)', async () => {
    const { server, httpUrl } = await startServer({ s1: { pastor: 'host' } });
    try {
        const { status, body } = await fetchToken(httpUrl, 's1', 'nobody');
        assert.equal(status, 403);
        assert.equal(body.success, false);
    } finally { await server.close(); }
});

test('ATTACK: viewer attempts to grant speaking permission — denied', async () => {
    const { server, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant', amy: 'participant' } });
    try {
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: bobWs } = await connectWith(url, bobToken);
        bobWs.send(JSON.stringify({ type: 'grant-speak', sessionId: 's1', targetUserId: 'amy' }));
        const ack = await waitFor(bobWs, 'grant-speak-ack');
        assert.equal(ack.success, false);
        bobWs.close();
    } finally { await server.close(); }
});

test('ATTACK: viewer attempts to remove another participant — denied', async () => {
    const { server, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant', amy: 'participant' } });
    try {
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: bobWs } = await connectWith(url, bobToken);
        bobWs.send(JSON.stringify({ type: 'remove-participant', sessionId: 's1', targetUserId: 'amy' }));
        const ack = await waitFor(bobWs, 'remove-participant-ack');
        assert.equal(ack.success, false);
        bobWs.close();
    } finally { await server.close(); }
});

test('ATTACK: viewer attempts to publish as source over a real authed connection — denied (regression from Phase 3A)', async () => {
    const { server, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    try {
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: bobWs } = await connectWith(url, bobToken);
        bobWs.send(JSON.stringify({ type: 'publish-source', sessionId: 's1', segment: { segmentId: 'x' } }));
        const err = await waitFor(bobWs, 'error');
        assert.match(err.reason, /host\/moderator/);
        bobWs.close();
    } finally { await server.close(); }
});

test('HAPPY PATH: host grants speaking to a remote viewer; viewer is notified in real time', async () => {
    const { server, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    try {
        const pastorToken = (await fetchToken(httpUrl, 's1', 'pastor')).body.token;
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: pastorWs } = await connectWith(url, pastorToken);
        const { ws: bobWs } = await connectWith(url, bobToken);

        const speakingStatePromise = waitFor(bobWs, 'speaking-state');
        pastorWs.send(JSON.stringify({ type: 'grant-speak', sessionId: 's1', targetUserId: 'bob' }));
        const ack = await waitFor(pastorWs, 'grant-speak-ack');
        assert.equal(ack.success, true);

        const notice = await speakingStatePromise;
        assert.equal(notice.granted, true);

        // Bob reconnects — the NEW token he'd fetch would now say "speaker".
        const reissued = await fetchToken(httpUrl, 's1', 'bob');
        assert.equal(reissued.body.role, 'speaker');

        pastorWs.close(); bobWs.close();
    } finally { await server.close(); }
});

test('HAPPY PATH + Phase 3K: moderator removes a participant; they are force-disconnected AND cannot reconnect with the old token', async () => {
    const { server, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    try {
        const pastorToken = (await fetchToken(httpUrl, 's1', 'pastor')).body.token;
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: pastorWs } = await connectWith(url, pastorToken);
        const { ws: bobWs } = await connectWith(url, bobToken);

        const removedNoticePromise = waitFor(bobWs, 'removed');
        const closePromise = new Promise((resolve) => bobWs.addEventListener('close', resolve));
        pastorWs.send(JSON.stringify({ type: 'remove-participant', sessionId: 's1', targetUserId: 'bob' }));
        await waitFor(pastorWs, 'remove-participant-ack');

        await removedNoticePromise;
        await closePromise; // real forced disconnect, not just a notice

        // ATTACK: reconnect attempt with the still-cryptographically-valid old token.
        const reconnect = new WebSocket(url);
        await new Promise((resolve) => reconnect.addEventListener('open', resolve));
        reconnect.send(JSON.stringify({ type: 'auth', token: bobToken }));
        const reconnectAck = await waitFor(reconnect, 'auth-ack');
        assert.equal(reconnectAck.success, false);
        assert.match(reconnectAck.reason, /removed/);
        reconnect.close();

        pastorWs.close();
    } finally { await server.close(); }
});

test('ATTACK: expired token, forged token, and a token minted for a different session are all rejected', async () => {
    const { server, url } = await startServer({ s1: { pastor: 'host' }, s2: { other: 'host' } });
    try {
        const expired = sessionToken.sign({ sessionId: 's1', role: 'host', sub: 'pastor' }, SECRET, -10);
        const forged = sessionToken.sign({ sessionId: 's1', role: 'host', sub: 'pastor' }, 'WRONG-SECRET', 60);
        const crossSession = sessionToken.sign({ sessionId: 's2', role: 'host', sub: 'other' }, SECRET, 60);

        for (const [label, token, expectSuccess] of [
            ['expired', expired, false],
            ['forged', forged, false],
            ['cross-session (valid sig, different session — must NOT authorize s1 actions)', crossSession, true /* auth itself succeeds, it IS a valid token for s2 */],
        ]) {
            const ws = new WebSocket(url);
            await new Promise((resolve) => ws.addEventListener('open', resolve));
            ws.send(JSON.stringify({ type: 'auth', token }));
            const ack = await waitFor(ws, 'auth-ack');
            assert.equal(ack.success, expectSuccess, label);
            if (ack.success) {
                // Even though auth succeeded (it's a real token for s2), it must be
                // REJECTED for any s1 operation — sessionId binding, not just signature.
                ws.send(JSON.stringify({ type: 'publish-source', sessionId: 's1', segment: { segmentId: 'x' } }));
                const err = await waitFor(ws, 'error');
                assert.match(err.reason, /sessionId mismatch/);
            }
            ws.close();
        }
    } finally { await server.close(); }
});

test('self-mute works for any authenticated participant without moderator authorization', async () => {
    const { server, httpUrl, url } = await startServer({ s1: { bob: 'participant' } });
    try {
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: bobWs } = await connectWith(url, bobToken);
        bobWs.send(JSON.stringify({ type: 'self-mute', sessionId: 's1', muted: true }));
        const ack = await waitFor(bobWs, 'self-mute-ack');
        assert.equal(ack.success, true);
        assert.equal(ack.muted, true);
        bobWs.close();
    } finally { await server.close(); }
});
