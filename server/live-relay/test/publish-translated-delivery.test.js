'use strict';

/**
 * server/live-relay/test/publish-translated-delivery.test.js
 * R040 Phase 3E — targeted translated-segment delivery.
 *
 * HARNESS DISCLOSURE: real LiveDistributionSignalingServer instance,
 * real loopback TCP socket, real native WebSocket clients, real signed
 * tokens. Proves the server-side half of the wire that lets a
 * per-language-group translation result (computed once, client-side,
 * by LiveLanguageFanoutRouter) reach ONLY the viewers subscribed to
 * that language — never a broadcast to every joined viewer, which is
 * what distinguishes this from publish-source.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { LiveDistributionSignalingServer } = require('../live-distribution-signaling-server');
const sessionToken = require('../session-token');

const SECRET = 'test-secret-do-not-use-in-production';

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

function neverReceives(ws, type, windowMs) {
    return new Promise((resolve, reject) => {
        function onMsg(evt) {
            const msg = JSON.parse(evt.data);
            if (msg.type === type) { ws.removeEventListener('message', onMsg); reject(new Error(`Unexpectedly received "${type}"`)); }
        }
        ws.addEventListener('message', onMsg);
        setTimeout(() => { ws.removeEventListener('message', onMsg); resolve(); }, windowMs);
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

test('publish-translated delivers only to the named target viewers, not the whole session', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 'sess-tr-1', 'host', 'pastor-1');
        const viewerSw = await openAuthed(url, 'sess-tr-1', 'viewer', 'viewer-sw');
        const viewerFr = await openAuthed(url, 'sess-tr-1', 'viewer', 'viewer-fr');

        viewerSw.send(JSON.stringify({ type: 'join-viewer', sessionId: 'sess-tr-1', viewerId: 'viewer-sw' }));
        await waitFor(viewerSw, 'join-ack');
        viewerFr.send(JSON.stringify({ type: 'join-viewer', sessionId: 'sess-tr-1', viewerId: 'viewer-fr' }));
        await waitFor(viewerFr, 'join-ack');

        const frNeverGetsSwResult = neverReceives(viewerFr, 'translated-segment', 500);
        const swReceivesResult = waitFor(viewerSw, 'translated-segment');

        host.send(JSON.stringify({
            type: 'publish-translated',
            sessionId: 'sess-tr-1',
            segmentId: 'seg-1',
            language: 'sw',
            translated: { outputText: 'Karibu sana', isReal: true },
            targetViewerIds: ['viewer-sw'],
        }));

        const ack = await waitFor(host, 'publish-translated-ack');
        assert.equal(ack.success, true);
        assert.deepEqual(ack.delivered, ['viewer-sw']);

        const received = await swReceivesResult;
        assert.equal(received.language, 'sw');
        assert.equal(received.segmentId, 'seg-1');
        assert.equal(received.translated.outputText, 'Karibu sana');

        await frNeverGetsSwResult; // proves no broadcast leak to the other language group

        host.close(); viewerSw.close(); viewerFr.close();
    } finally {
        await server.close();
    }
});

test('publish-translated: a viewer-role connection cannot publish (server-authoritative, not client-claimed)', async () => {
    const { server, url } = await startServer();
    try {
        const viewer = await openAuthed(url, 'sess-tr-2', 'viewer', 'viewer-1');
        viewer.send(JSON.stringify({
            type: 'publish-translated', sessionId: 'sess-tr-2', segmentId: 'seg-x', language: 'fr',
            translated: {}, targetViewerIds: ['viewer-1'],
        }));
        const err = await waitFor(viewer, 'error');
        assert.match(err.reason, /host\/moderator/);
        viewer.close();
    } finally {
        await server.close();
    }
});

test('publish-translated: unknown/not-joined viewerId is honestly omitted from delivered, never fabricated', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 'sess-tr-3', 'host', 'pastor-1');
        const viewerA = await openAuthed(url, 'sess-tr-3', 'viewer', 'viewer-a');
        viewerA.send(JSON.stringify({ type: 'join-viewer', sessionId: 'sess-tr-3', viewerId: 'viewer-a' }));
        await waitFor(viewerA, 'join-ack');

        host.send(JSON.stringify({
            type: 'publish-translated', sessionId: 'sess-tr-3', segmentId: 'seg-2', language: 'en',
            translated: { outputText: 'hi' }, targetViewerIds: ['viewer-a', 'viewer-never-joined'],
        }));
        const ack = await waitFor(host, 'publish-translated-ack');
        assert.deepEqual(ack.delivered, ['viewer-a']); // never claims viewer-never-joined got it

        host.close(); viewerA.close();
    } finally {
        await server.close();
    }
});

test('publish-translated: sessionId mismatch and missing fields are rejected', async () => {
    const { server, url } = await startServer();
    try {
        const host = await openAuthed(url, 'sess-tr-4', 'host', 'pastor-1');

        host.send(JSON.stringify({ type: 'publish-translated', sessionId: 'other-session', segmentId: 's', language: 'en', targetViewerIds: ['v'] }));
        let err = await waitFor(host, 'error');
        assert.match(err.reason, /sessionId mismatch/);

        host.send(JSON.stringify({ type: 'publish-translated', sessionId: 'sess-tr-4', language: 'en', targetViewerIds: ['v'] }));
        err = await waitFor(host, 'error');
        assert.match(err.reason, /segmentId/);

        host.send(JSON.stringify({ type: 'publish-translated', sessionId: 'sess-tr-4', segmentId: 's', targetViewerIds: ['v'] }));
        err = await waitFor(host, 'error');
        assert.match(err.reason, /language/);

        host.send(JSON.stringify({ type: 'publish-translated', sessionId: 'sess-tr-4', segmentId: 's', language: 'en', targetViewerIds: [] }));
        err = await waitFor(host, 'error');
        assert.match(err.reason, /targetViewerIds/);

        host.close();
    } finally {
        await server.close();
    }
});
