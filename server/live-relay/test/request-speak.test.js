'use strict';

/**
 * server/live-relay/test/request-speak.test.js
 * R040 Phase 4A — real wiring for the confirmed gap: SessionAuthority
 * already had a fully-tested requestSpeaking() method
 * (session-authority.test.js) but no message type ever reached it. This
 * suite proves the new 'request-speak' server case actually composes the
 * existing authority and existing connection registry — no new
 * authorization logic is introduced here.
 *
 * HARNESS DISCLOSURE: real server, real loopback socket, real native
 * WebSocket. roleResolver is the same documented-contract double used by
 * every other suite in this directory (see session-authority.js header).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveDistributionSignalingServer } = require('../live-distribution-signaling-server');
const { SessionAuthority } = require('../session-authority');
const sessionToken = require('../session-token');

const SECRET = 'request-speak-test-secret';

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

test('viewer request-speak succeeds and is acked, and getSpeakState reflects SPEAK_REQUESTED', async () => {
    const { server, authority, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    try {
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: bobWs } = await connectWith(url, bobToken);
        bobWs.send(JSON.stringify({ type: 'request-speak', sessionId: 's1' }));
        const ack = await waitFor(bobWs, 'request-speak-ack');
        assert.equal(ack.success, true);
        assert.equal(authority.getSpeakState('s1', 'bob'), 'SPEAK_REQUESTED');
        bobWs.close();
    } finally { await server.close(); }
});

test('host/moderator connections are notified in real time via speak-requested; other viewers are not', async () => {
    const { server, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant', amy: 'participant' } });
    try {
        const pastorToken = (await fetchToken(httpUrl, 's1', 'pastor')).body.token;
        const { ws: pastorWs } = await connectWith(url, pastorToken);
        const amyToken = (await fetchToken(httpUrl, 's1', 'amy')).body.token;
        const { ws: amyWs } = await connectWith(url, amyToken);
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: bobWs } = await connectWith(url, bobToken);

        let amyGotNotified = false;
        amyWs.addEventListener('message', (evt) => {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'speak-requested') amyGotNotified = true;
        });

        bobWs.send(JSON.stringify({ type: 'request-speak', sessionId: 's1' }));
        const notified = await waitFor(pastorWs, 'speak-requested');
        assert.equal(notified.requesterId, 'bob');
        assert.equal(notified.sessionId, 's1');

        // give amy's socket a moment to (not) receive anything
        await new Promise((r) => setTimeout(r, 100));
        assert.equal(amyGotNotified, false, 'a fellow viewer must never see another participant\'s speak request');

        pastorWs.close(); amyWs.close(); bobWs.close();
    } finally { await server.close(); }
});

test('a removed participant cannot successfully request-speak again', async () => {
    const { server, authority, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    try {
        authority.removeParticipant('s1', 'pastor', 'bob');
        // A removed participant's OLD token would already be rejected at
        // auth time by the existing removed-user check; here we exercise
        // the request-speak path itself for a participant already known
        // REMOVED at the authority layer via a fresh (still-valid) token
        // scenario is not reachable — removal blocks new tokens entirely,
        // which is the existing, correct, stronger guarantee. We assert
        // that guarantee holds for this new endpoint too:
        const { status } = await fetchToken(httpUrl, 's1', 'bob');
        assert.equal(status, 403, 'a removed participant must not be able to obtain a new token to reach request-speak at all');
    } finally { await server.close(); }
});

test('request-speak requires sessionId to match the authenticated token (no cross-session spoofing)', async () => {
    const { server, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' }, s2: { carol: 'host' } });
    try {
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: bobWs } = await connectWith(url, bobToken);
        bobWs.send(JSON.stringify({ type: 'request-speak', sessionId: 's2' }));
        const err = await waitFor(bobWs, 'error');
        assert.match(err.reason, /sessionId mismatch/);
        bobWs.close();
    } finally { await server.close(); }
});

test('request-speak is rejected before authentication', async () => {
    const { server, url } = await startServer({ s1: { pastor: 'host' } });
    try {
        const ws = new WebSocket(url);
        await new Promise((resolve) => ws.addEventListener('open', resolve));
        ws.send(JSON.stringify({ type: 'request-speak', sessionId: 's1' }));
        const err = await waitFor(ws, 'error');
        assert.match(err.reason, /Not authenticated/);
        ws.close();
    } finally { await server.close(); }
});

test('a viewer who already holds granted speaking permission gets an honest failed ack on re-request (composes existing authority behavior, does not reimplement it)', async () => {
    const { server, authority, httpUrl, url } = await startServer({ s1: { pastor: 'host', bob: 'participant' } });
    try {
        authority.grantSpeaking('s1', 'pastor', 'bob');
        const bobToken = (await fetchToken(httpUrl, 's1', 'bob')).body.token;
        const { ws: bobWs } = await connectWith(url, bobToken);
        bobWs.send(JSON.stringify({ type: 'request-speak', sessionId: 's1' }));
        const ack = await waitFor(bobWs, 'request-speak-ack');
        assert.equal(ack.success, false);
        bobWs.close();
    } finally { await server.close(); }
});
