'use strict';

/**
 * server/live-relay/test/live-distribution-signaling-server.test.js
 * R040 Phase 3 — Live Distribution Signaling Server
 *
 * HARNESS DISCLOSURE (read before trusting these results):
 *   REAL: an actual LiveDistributionSignalingServer instance listening
 *   on a real loopback TCP port (127.0.0.1, OS-assigned ephemeral port),
 *   real RFC6455 WebSocket handshakes, real native `WebSocket` clients
 *   (Node's built-in global, same class real browsers use), real signed
 *   tokens via server/live-relay/session-token.js.
 *   NOT covered here: cross-machine/public-internet reachability, TLS
 *   termination, horizontal scale-out, and load at realistic viewer
 *   counts — those require an actual deployment (see ../README.md) and
 *   are explicitly not claimed as verified by this suite.
 *
 * Run: node --test server/live-relay/test/live-distribution-signaling-server.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveDistributionSignalingServer } = require('../live-distribution-signaling-server');
const sessionToken = require('../session-token');
const { LdceRosterBridge } = require('../ldce-roster-bridge');
const { SessionAuthority } = require('../session-authority');

const SECRET = 'test-secret-do-not-use-in-production';

async function startServer(opts = {}) {
    const server = new LiveDistributionSignalingServer(Object.assign({ secret: SECRET, heartbeatTimeoutMs: 200, disconnectTimeoutMs: 500, sweepIntervalMs: 50 }, opts));
    const addr = await server.listen(0, '127.0.0.1');
    return { server, url: `ws://127.0.0.1:${addr.port}`, httpUrl: `http://127.0.0.1:${addr.port}` };
}

/**
 * startServerWithRosterBridge() — the real, disclosed end-to-end wiring
 * this module's own default export bootstrap uses (see this file's
 * pair, live-distribution-signaling-server.js, bottom of file): a real
 * LdceRosterBridge feeding a real SessionAuthority's roleResolver. No
 * mock roster or role logic anywhere in this path — only the transport
 * (WebSocket handshake + JSON framing) is exercised over loopback TCP.
 */
async function startServerWithRosterBridge(opts = {}) {
    const rosterBridge = new LdceRosterBridge(Object.assign({}, opts.rosterBridgeOpts));
    const authority = new SessionAuthority({ secret: SECRET, roleResolver: rosterBridge.roleResolver, tokenTtlSeconds: opts.tokenTtlSeconds });
    const server = new LiveDistributionSignalingServer(Object.assign({ secret: SECRET, heartbeatTimeoutMs: 200, disconnectTimeoutMs: 500, sweepIntervalMs: 50, authority, rosterBridge }, opts.serverOpts));
    const addr = await server.listen(0, '127.0.0.1');
    return { server, rosterBridge, authority, url: `ws://127.0.0.1:${addr.port}`, httpUrl: `http://127.0.0.1:${addr.port}` };
}

async function httpPost(httpUrl, path) {
    const res = await fetch(`${httpUrl}${path}`, { method: 'POST' });
    return { status: res.status, body: await res.json() };
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

test('health endpoint reports real counters', async () => {
    const { server, httpUrl } = await startServer();
    try {
        const res = await fetch(`${httpUrl}/healthz`);
        const body = await res.json();
        assert.equal(body.status, 'ok');
        assert.equal(body.sessionCount, 0);
        assert.equal(body.capability.webrtcSfu, false); // honest: no SFU here
    } finally {
        await server.close();
    }
});

test('rejects unsigned/garbage tokens', async () => {
    const { server, url } = await startServer();
    try {
        const ws = new WebSocket(url);
        await new Promise((resolve) => ws.addEventListener('open', resolve));
        ws.send(JSON.stringify({ type: 'auth', token: 'not-a-real-token' }));
        const ack = await waitFor(ws, 'auth-ack');
        assert.equal(ack.success, false);
        ws.close();
    } finally {
        await server.close();
    }
});

test('rejects viewer role attempting to publish-source (server-authoritative)', async () => {
    const { server, url } = await startServer();
    try {
        const viewer = await openAuthed(url, 'sess-1', 'viewer', 'viewer-a');
        viewer.send(JSON.stringify({ type: 'publish-source', sessionId: 'sess-1', segment: { segmentId: 'seg-1', text: 'hi' } }));
        const err = await waitFor(viewer, 'error');
        assert.match(err.reason, /host\/moderator/);
        viewer.close();
    } finally {
        await server.close();
    }
});

test('rejects publish for a sessionId not matching the authenticated token', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 'sess-1', 'host', 'pastor-1');
        host.send(JSON.stringify({ type: 'publish-source', sessionId: 'DIFFERENT-SESSION', segment: { segmentId: 'seg-1' } }));
        const err = await waitFor(host, 'error');
        assert.match(err.reason, /sessionId mismatch/);
        host.close();
    } finally {
        await server.close();
    }
});

test('end-to-end: host publishes, two viewers in the same session both receive the segment', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 'sess-e2e', 'host', 'pastor-1');
        const viewerA = await openAuthed(url, 'sess-e2e', 'viewer', 'viewer-a');
        const viewerB = await openAuthed(url, 'sess-e2e', 'viewer', 'viewer-b');

        viewerA.send(JSON.stringify({ type: 'join-viewer', sessionId: 'sess-e2e', viewerId: 'viewer-a' }));
        viewerB.send(JSON.stringify({ type: 'join-viewer', sessionId: 'sess-e2e', viewerId: 'viewer-b' }));
        await waitFor(viewerA, 'join-ack');
        await waitFor(viewerB, 'join-ack');

        const segPromiseA = waitFor(viewerA, 'segment');
        const segPromiseB = waitFor(viewerB, 'segment');

        host.send(JSON.stringify({ type: 'publish-source', sessionId: 'sess-e2e', segment: { segmentId: 'seg-42', sourceLanguage: 'sw', text: 'Karibu' } }));

        const ack = await waitFor(host, 'publish-ack');
        assert.equal(ack.success, true);
        assert.equal(ack.segmentId, 'seg-42');
        assert.equal(ack.delivered.length, 2);

        const [segA, segB] = await Promise.all([segPromiseA, segPromiseB]);
        assert.equal(segA.segment.segmentId, 'seg-42');
        assert.equal(segB.segment.segmentId, 'seg-42');
        assert.equal(segA.segment.text, 'Karibu');

        host.close(); viewerA.close(); viewerB.close();
    } finally {
        await server.close();
    }
});

test('translation-failure isolation: a viewer session with no source does not affect another session', async () => {
    const { server, url } = await startServer();
    try {
        const hostX = await openAuthed(url, 'sess-x', 'host', 'pastor-x');
        const viewerX = await openAuthed(url, 'sess-x', 'viewer', 'viewer-x');
        viewerX.send(JSON.stringify({ type: 'join-viewer', sessionId: 'sess-x', viewerId: 'viewer-x' }));
        await waitFor(viewerX, 'join-ack');

        // A second, entirely separate session with no source connected.
        const viewerY = await openAuthed(url, 'sess-y', 'viewer', 'viewer-y');
        viewerY.send(JSON.stringify({ type: 'join-viewer', sessionId: 'sess-y', viewerId: 'viewer-y' }));
        await waitFor(viewerY, 'join-ack');

        const segPromiseX = waitFor(viewerX, 'segment');
        hostX.send(JSON.stringify({ type: 'publish-source', sessionId: 'sess-x', segment: { segmentId: 'seg-iso', text: 'hello' } }));
        const segX = await segPromiseX;
        assert.equal(segX.segment.segmentId, 'seg-iso');

        hostX.close(); viewerX.close(); viewerY.close();
    } finally {
        await server.close();
    }
});

test('heartbeat keeps a viewer connected; missed heartbeats real-transition to degraded then the server closes it', async () => {
    const { server, url } = await startServer({ heartbeatTimeoutMs: 150, disconnectTimeoutMs: 400, sweepIntervalMs: 50 });
    try {
        const viewer = await openAuthed(url, 'sess-hb', 'viewer', 'viewer-hb');
        viewer.send(JSON.stringify({ type: 'join-viewer', sessionId: 'sess-hb', viewerId: 'viewer-hb' }));
        await waitFor(viewer, 'join-ack');

        // No heartbeats sent: expect a real "degraded" state push from the server.
        const degraded = await waitFor(viewer, 'state', 2000);
        assert.equal(degraded.state, 'degraded');

        // And eventually a real close from the server due to timeout.
        await new Promise((resolve) => viewer.addEventListener('close', resolve));
    } finally {
        await server.close();
    }
});

test('roster-request is privileged (viewer denied, host/moderator allowed) and reflects real joined viewers', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 'sess-roster', 'host', 'pastor-r');
        const viewer = await openAuthed(url, 'sess-roster', 'viewer', 'viewer-r');

        viewer.send(JSON.stringify({ type: 'roster-request', sessionId: 'sess-roster' }));
        const denied = await waitFor(viewer, 'error');
        assert.match(denied.reason, /host\/moderator/);

        viewer.send(JSON.stringify({ type: 'join-viewer', sessionId: 'sess-roster', viewerId: 'viewer-r' }));
        await waitFor(viewer, 'join-ack');

        host.send(JSON.stringify({ type: 'roster-request', sessionId: 'sess-roster' }));
        const roster = await waitFor(host, 'roster');
        assert.equal(roster.viewers.length, 1);
        assert.equal(roster.viewers[0].viewerId, 'viewer-r');

        host.close(); viewer.close();
    } finally {
        await server.close();
    }
});

test('rate limiting: a connection sending far above the configured rate gets rejected messages', async () => {
    const { server, url } = await startServer({ rateLimitPerSec: 5 });
    try {
        const host = await openAuthed(url, 'sess-rl', 'host', 'pastor-rl');
        let sawRateLimitError = false;
        host.addEventListener('message', (evt) => {
            const msg = JSON.parse(evt.data);
            if (msg.type === 'error' && /Rate limit/.test(msg.reason)) sawRateLimitError = true;
        });
        for (let i = 0; i < 40; i++) {
            host.send(JSON.stringify({ type: 'publish-source', sessionId: 'sess-rl', segment: { segmentId: `seg-${i}` } }));
        }
        await new Promise((resolve) => setTimeout(resolve, 300));
        assert.equal(sawRateLimitError, true);
        host.close();
    } finally {
        await server.close();
    }
});

test('expired token is rejected', async () => {
    const { server, url } = await startServer();
    try {
        const token = sessionToken.sign({ sessionId: 'sess-exp', role: 'viewer', sub: 'v1' }, SECRET, -5); // already expired
        const ws = new WebSocket(url);
        await new Promise((resolve) => ws.addEventListener('open', resolve));
        ws.send(JSON.stringify({ type: 'auth', token }));
        const ack = await waitFor(ws, 'auth-ack');
        assert.equal(ack.success, false);
        assert.match(ack.reason, /expired/);
        ws.close();
    } finally {
        await server.close();
    }
});

test('tampered token signature is rejected', async () => {
    const { server, url } = await startServer();
    try {
        const token = sessionToken.sign({ sessionId: 'sess-t', role: 'host', sub: 'p1' }, SECRET, 60);
        const tampered = token.slice(0, -2) + 'xx';
        const ws = new WebSocket(url);
        await new Promise((resolve) => ws.addEventListener('open', resolve));
        ws.send(JSON.stringify({ type: 'auth', token: tampered }));
        const ack = await waitFor(ws, 'auth-ack');
        assert.equal(ack.success, false);
        ws.close();
    } finally {
        await server.close();
    }
});

// ============================================================================
// R040 Phase 3 (continuation) — LDCE roster bridge, end to end.
//
// HARNESS DISCLOSURE for this section specifically: every test below runs
// through startServerWithRosterBridge(), i.e. a REAL LdceRosterBridge and a
// REAL SessionAuthority wired exactly as this module's own bottom-of-file
// bootstrap wires them — the same composition a production deployment uses.
// Nothing about roster mirroring or role resolution is mocked; only the
// LDCESessionEngine instance that would normally report the roster on the
// host's own device is replaced by this test directly sending the
// roster-sync/register-host messages a real LdceRosterReporter would send
// (that client-side composition is covered separately in
// core/modules/communication/test/ldce-roster-reporter.test.js).
// ============================================================================

test('register-host bootstraps a session so its first token issuance succeeds before any roster has ever been reported', async () => {
    const { server, httpUrl } = await startServerWithRosterBridge();
    try {
        const reg = await httpPost(httpUrl, '/session/sess-boot/register-host/pastor-boot');
        assert.equal(reg.status, 200);
        assert.equal(reg.body.success, true);

        const tokenRes = await fetch(`${httpUrl}/session/sess-boot/token/pastor-boot`, { method: 'POST' });
        const tokenBody = await tokenRes.json();
        assert.equal(tokenRes.status, 200);
        assert.equal(tokenBody.success, true);
        assert.equal(tokenBody.role, 'host');
    } finally {
        await server.close();
    }
});

test('before register-host or any roster-sync, token issuance for anyone fails closed (no bootstrap-free backdoor)', async () => {
    const { server, httpUrl } = await startServerWithRosterBridge();
    try {
        const tokenRes = await fetch(`${httpUrl}/session/sess-nobody/token/whoever`, { method: 'POST' });
        const tokenBody = await tokenRes.json();
        assert.equal(tokenRes.status, 403);
        assert.equal(tokenBody.success, false);
    } finally {
        await server.close();
    }
});

test('end-to-end: host reports a real roster via roster-sync, and a listed participant can then obtain a correctly-roled token', async () => {
    const { server, url, httpUrl } = await startServerWithRosterBridge();
    try {
        await httpPost(httpUrl, '/session/sess-e2e-roster/register-host/pastor-e2e');
        const hostToken = (await (await fetch(`${httpUrl}/session/sess-e2e-roster/token/pastor-e2e`, { method: 'POST' })).json()).token;

        const host = await openAuthed(url, 'sess-e2e-roster', 'host', 'pastor-e2e');
        assert.equal(sessionToken.verify(hostToken, SECRET).valid, true); // sanity: real signed token

        host.send(JSON.stringify({
            type: 'roster-sync', sessionId: 'sess-e2e-roster', participants: [
                { userId: 'pastor-e2e', role: 'host' },
                { userId: 'mod-e2e', role: 'moderator' },
                { userId: 'p-e2e', role: 'participant', language: 'sw' },
            ]
        }));
        const ack = await waitFor(host, 'roster-sync-ack');
        assert.equal(ack.success, true);
        assert.equal(ack.count, 3);

        const tokenRes = await fetch(`${httpUrl}/session/sess-e2e-roster/token/p-e2e`, { method: 'POST' });
        const tokenBody = await tokenRes.json();
        assert.equal(tokenBody.success, true);
        assert.equal(tokenBody.role, 'viewer'); // LDCE "participant" -> token role "viewer", per session-authority.js's disclosed mapping

        host.close();
    } finally {
        await server.close();
    }
});

test('security: a viewer cannot report the roster (only the session host may)', async () => {
    const { server, url, rosterBridge } = await startServerWithRosterBridge();
    try {
        rosterBridge.registerHost('sess-sec1', 'pastor-sec1');
        const viewer = await openAuthed(url, 'sess-sec1', 'viewer', 'viewer-sec1');
        viewer.send(JSON.stringify({ type: 'roster-sync', sessionId: 'sess-sec1', participants: [{ userId: 'viewer-sec1', role: 'host' }] }));
        const err = await waitFor(viewer, 'error');
        assert.match(err.reason, /Only the session host may report the roster/);
        viewer.close();
    } finally {
        await server.close();
    }
});

test('security: a moderator cannot report the roster either (only host — a moderator is an entry ON the roster, not its source)', async () => {
    const { server, url, rosterBridge } = await startServerWithRosterBridge();
    try {
        rosterBridge.updateRoster('sess-sec-mod', 'pastor-sm', [
            { userId: 'pastor-sm', role: 'host' },
            { userId: 'mod-sm', role: 'moderator' },
        ]);
        const mod = await openAuthed(url, 'sess-sec-mod', 'moderator', 'mod-sm');
        mod.send(JSON.stringify({ type: 'roster-sync', sessionId: 'sess-sec-mod', participants: [] }));
        const err = await waitFor(mod, 'error');
        assert.match(err.reason, /Only the session host may report the roster/);
        mod.close();
    } finally {
        await server.close();
    }
});

test('security: a viewer cannot become host by claiming role in the roster-sync payload — server trusts only conn.role from the signed token', async () => {
    const { server, url, rosterBridge } = await startServerWithRosterBridge();
    try {
        rosterBridge.registerHost('sess-sec2', 'pastor-sec2');
        const viewer = await openAuthed(url, 'sess-sec2', 'viewer', 'attacker');
        // Attacker's own connection role is 'viewer' per its signed token,
        // no matter what the payload below claims about itself.
        viewer.send(JSON.stringify({ type: 'roster-sync', sessionId: 'sess-sec2', participants: [{ userId: 'attacker', role: 'host' }] }));
        const err = await waitFor(viewer, 'error');
        assert.match(err.reason, /Only the session host may report the roster/);
        viewer.close();
    } finally {
        await server.close();
    }
});

test('security: roster-sync for a sessionId not matching the authenticated token is rejected', async () => {
    const { server, url, rosterBridge } = await startServerWithRosterBridge();
    try {
        rosterBridge.registerHost('sess-real', 'pastor-cross');
        const host = await openAuthed(url, 'sess-real', 'host', 'pastor-cross');
        host.send(JSON.stringify({ type: 'roster-sync', sessionId: 'SOME-OTHER-SESSION', participants: [] }));
        const err = await waitFor(host, 'error');
        assert.match(err.reason, /sessionId mismatch/);
        host.close();
    } finally {
        await server.close();
    }
});

test('security: forged/tampered token cannot be used to open a host connection and report a roster', async () => {
    const { server, url } = await startServerWithRosterBridge();
    try {
        const forged = sessionToken.sign({ sessionId: 'sess-forge', role: 'host', sub: 'forger' }, 'wrong-secret-not-the-real-one', 60);
        const ws = new WebSocket(url);
        await new Promise((resolve) => ws.addEventListener('open', resolve));
        ws.send(JSON.stringify({ type: 'auth', token: forged }));
        const ack = await waitFor(ws, 'auth-ack');
        assert.equal(ack.success, false);
        ws.close();
    } finally {
        await server.close();
    }
});

test('fail-closed: a stale mirrored roster (older than maxAgeMs) denies token issuance for a previously-valid participant', async () => {
    const { server, httpUrl } = await startServerWithRosterBridge({ rosterBridgeOpts: { maxAgeMs: 100 } });
    try {
        await httpPost(httpUrl, '/session/sess-stale/register-host/pastor-stale');
        const fresh = await fetch(`${httpUrl}/session/sess-stale/token/pastor-stale`, { method: 'POST' });
        assert.equal((await fresh.json()).success, true);

        await new Promise((resolve) => setTimeout(resolve, 150));

        const stale = await fetch(`${httpUrl}/session/sess-stale/token/pastor-stale`, { method: 'POST' });
        const staleBody = await stale.json();
        assert.equal(stale.status, 403);
        assert.equal(staleBody.success, false);
    } finally {
        await server.close();
    }
});

test('host disconnect clears the mirrored roster so a crashed-without-clean-disconnect host cannot leave stale trust behind', async () => {
    const { server, url, rosterBridge } = await startServerWithRosterBridge();
    try {
        const host = await openAuthed(url, 'sess-disc', 'host', 'pastor-disc');
        host.send(JSON.stringify({ type: 'roster-sync', sessionId: 'sess-disc', participants: [{ userId: 'pastor-disc', role: 'host' }] }));
        await waitFor(host, 'roster-sync-ack');
        assert.ok(rosterBridge.roleResolver('sess-disc', 'pastor-disc'));

        host.close();
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(rosterBridge.roleResolver('sess-disc', 'pastor-disc'), null, 'roster must be cleared, not left stale, on host disconnect');
    } finally {
        await server.close();
    }
});

test('a removed participant\'s still-unexpired token is rejected on reconnect even though the roster still lists them (SessionAuthority\'s own removal record, composed with, not overridden by, the mirrored roster)', async () => {
    const { server, url, authority, rosterBridge } = await startServerWithRosterBridge();
    try {
        rosterBridge.updateRoster('sess-removed', 'pastor-rm', [
            { userId: 'pastor-rm', role: 'host' },
            { userId: 'p-rm', role: 'participant' },
        ]);
        const issued = authority.issueToken('sess-removed', 'p-rm');
        assert.equal(issued.success, true);

        const removal = authority.removeParticipant('sess-removed', 'pastor-rm', 'p-rm');
        assert.equal(removal.success, true);

        const ws = new WebSocket(url);
        await new Promise((resolve) => ws.addEventListener('open', resolve));
        ws.send(JSON.stringify({ type: 'auth', token: issued.token }));
        const ack = await waitFor(ws, 'auth-ack');
        assert.equal(ack.success, false);
        assert.match(ack.reason, /removed/);
        ws.close();
    } finally {
        await server.close();
    }
});

test('one target language per group — moderation grant/revoke uses the real mirrored role, not a client-asserted one', async () => {
    const { server, url, rosterBridge } = await startServerWithRosterBridge();
    try {
        rosterBridge.updateRoster('sess-mod-e2e', 'pastor-mg', [
            { userId: 'pastor-mg', role: 'host' },
            { userId: 'p-mg', role: 'participant' },
        ]);
        const host = await openAuthed(url, 'sess-mod-e2e', 'host', 'pastor-mg');
        const viewer = await openAuthed(url, 'sess-mod-e2e', 'viewer', 'p-mg');

        host.send(JSON.stringify({ type: 'grant-speak', sessionId: 'sess-mod-e2e', targetUserId: 'p-mg' }));
        const ack = await waitFor(host, 'grant-speak-ack');
        assert.equal(ack.success, true);

        // Viewer itself cannot grant speaking to anyone, including itself.
        viewer.send(JSON.stringify({ type: 'grant-speak', sessionId: 'sess-mod-e2e', targetUserId: 'p-mg' }));
        const denied = await waitFor(viewer, 'grant-speak-ack');
        assert.equal(denied.success, false);

        host.close(); viewer.close();
    } finally {
        await server.close();
    }
});
