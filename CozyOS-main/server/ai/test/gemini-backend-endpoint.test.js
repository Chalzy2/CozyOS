/**
 * server/ai/test/gemini-backend-endpoint.test.js
 * Phase 10C-3D — Gemini backend boundary tests.
 *
 * STRUCTURAL ONLY. fetchImpl is always a local fake in this file — no
 * real network call is made anywhere here, and no real Gemini API key
 * is used. This file proves the backend's OWN logic (secret handling,
 * error mapping, timeout, redaction) is correct; it does NOT prove
 * live Gemini execution. See PHASE10C-3D-GEMINI-BACKEND-REPORT.md for
 * the explicit UNVERIFIED status of live execution.
 *
 * Run with: node server/ai/test/gemini-backend-endpoint.test.js
 */

'use strict';

const assert = require('assert');
const http = require('http');
const path = require('path');

const {
    createGeminiRequestHandler,
    GeminiBackendServer,
    GENERIC_FAILURE_REASONS,
} = require(path.join(__dirname, '..', 'gemini-backend-endpoint.js'));

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
}

function startHandlerServer(handler) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, 'http://localhost');
            if (url.pathname !== '/ai/gemini') { res.writeHead(404); res.end(); return; }
            handler(req, res);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

function postJson(port, body, { contentType = 'application/json', raw = null } = {}) {
    return new Promise((resolve, reject) => {
        const payload = raw !== null ? raw : JSON.stringify(body);
        const req = http.request({
            host: '127.0.0.1', port, path: '/ai/gemini', method: 'POST',
            headers: { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(payload) },
        }, (res) => {
            let chunks = '';
            res.on('data', (c) => chunks += c);
            res.on('end', () => {
                let parsed = null;
                try { parsed = JSON.parse(chunks); } catch (_e) { /* leave null for malformed-body test */ }
                resolve({ status: res.statusCode, body: parsed, raw: chunks });
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function fakeFetchOk(text = 'Hello from a fake Gemini response.') {
    return async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
    });
}

function fakeFetchUpstreamError(status = 500) {
    return async () => ({ ok: false, status, json: async () => ({ error: { message: 'simulated upstream failure' } }) });
}

function fakeFetchThatHangs() {
    return (_url, opts) => new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => {
            const e = new Error('The operation was aborted.');
            e.name = 'AbortError';
            reject(e);
        });
    });
}

function fakeFetchCapturingUrl(captured, text = 'ok') {
    return async (url) => { captured.url = url; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) }; };
}

(async () => {
    console.log('\n=== Phase 10C-3D — Gemini Backend Endpoint (STRUCTURAL, no real network) ===\n');

    await test('1. Missing API key -> 503, generic reason, no key-shaped content in body', async () => {
        const handler = createGeminiRequestHandler({ getApiKey: () => null, fetchImpl: fakeFetchOk() });
        const server = await startHandlerServer(handler);
        try {
            const res = await postJson(server.address().port, { text: 'hello' });
            assert.strictEqual(res.status, 503);
            assert.strictEqual(res.body.success, false);
            assert.strictEqual(res.body.reason, GENERIC_FAILURE_REASONS.NO_KEY);
            assert.ok(res.body.correlationId, 'correlationId must be present');
            assert.ok(!res.raw.includes('AIza'), 'response body must never contain a key-shaped string');
        } finally { server.close(); }
    });

    await test('2. Malformed JSON body -> 400 BAD_REQUEST, connection not left hanging', async () => {
        const handler = createGeminiRequestHandler({ getApiKey: () => 'fake-key-not-real', fetchImpl: fakeFetchOk() });
        const server = await startHandlerServer(handler);
        try {
            const res = await postJson(server.address().port, null, { raw: '{not valid json' });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.reason, GENERIC_FAILURE_REASONS.BAD_REQUEST);
        } finally { server.close(); }
    });

    await test('3. Missing text field -> 400 BAD_REQUEST', async () => {
        const handler = createGeminiRequestHandler({ getApiKey: () => 'fake-key-not-real', fetchImpl: fakeFetchOk() });
        const server = await startHandlerServer(handler);
        try {
            const res = await postJson(server.address().port, { options: {} });
            assert.strictEqual(res.status, 400);
            assert.strictEqual(res.body.reason, GENERIC_FAILURE_REASONS.BAD_REQUEST);
        } finally { server.close(); }
    });

    await test('4. Wrong Content-Type -> 415', async () => {
        const handler = createGeminiRequestHandler({ getApiKey: () => 'fake-key-not-real', fetchImpl: fakeFetchOk() });
        const server = await startHandlerServer(handler);
        try {
            const res = await postJson(server.address().port, { text: 'hi' }, { contentType: 'text/plain' });
            assert.strictEqual(res.status, 415);
        } finally { server.close(); }
    });

    await test('5. Upstream 5xx error -> 502 UPSTREAM_ERROR, no upstream error detail leaked to client', async () => {
        const handler = createGeminiRequestHandler({ getApiKey: () => 'fake-key-not-real', fetchImpl: fakeFetchUpstreamError(500) });
        const server = await startHandlerServer(handler);
        try {
            const res = await postJson(server.address().port, { text: 'hello' });
            assert.strictEqual(res.status, 502);
            assert.strictEqual(res.body.reason, GENERIC_FAILURE_REASONS.UPSTREAM_ERROR);
            assert.ok(!res.raw.includes('simulated upstream failure'), 'raw upstream error text must not reach the client');
        } finally { server.close(); }
    });

    await test('6. Timeout -> 504 UPSTREAM_TIMEOUT', async () => {
        const handler = createGeminiRequestHandler({ getApiKey: () => 'fake-key-not-real', fetchImpl: fakeFetchThatHangs(), timeoutMs: 100 });
        const server = await startHandlerServer(handler);
        try {
            const res = await postJson(server.address().port, { text: 'hello' });
            assert.strictEqual(res.status, 504);
            assert.strictEqual(res.body.reason, GENERIC_FAILURE_REASONS.TIMEOUT);
        } finally { server.close(); }
    });

    await test('7. Successful mocked response -> 200, isReal:true, real text passed through', async () => {
        const handler = createGeminiRequestHandler({ getApiKey: () => 'fake-key-not-real', fetchImpl: fakeFetchOk('mocked model text') });
        const server = await startHandlerServer(handler);
        try {
            const res = await postJson(server.address().port, { text: 'hello' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.success, true);
            assert.strictEqual(res.body.isReal, true);
            assert.strictEqual(res.body.text, 'mocked model text');
            assert.ok(res.body.correlationId);
            assert.ok(typeof res.body.latencyMs === 'number');
        } finally { server.close(); }
    });

    await test('8. API key is placed in the outbound URL to Google but never appears in any client-facing response field', async () => {
        const captured = {};
        const handler = createGeminiRequestHandler({ getApiKey: () => 'SECRET_TEST_KEY_VALUE', fetchImpl: fakeFetchCapturingUrl(captured) });
        const server = await startHandlerServer(handler);
        try {
            const res = await postJson(server.address().port, { text: 'hello' });
            assert.ok(captured.url.includes('SECRET_TEST_KEY_VALUE'), 'sanity: the fake upstream call itself did receive the key (proves the call is real, not skipped)');
            assert.ok(!res.raw.includes('SECRET_TEST_KEY_VALUE'), 'the key must never appear anywhere in the HTTP response body sent to the client');
        } finally { server.close(); }
    });

    await test('9. onServerEvent (server-side log hook) never receives the API key', async () => {
        const events = [];
        const handler = createGeminiRequestHandler({
            getApiKey: () => 'SECRET_TEST_KEY_VALUE',
            fetchImpl: fakeFetchOk(),
            onServerEvent: (name, detail) => events.push({ name, detail }),
        });
        const server = await startHandlerServer(handler);
        try {
            await postJson(server.address().port, { text: 'hello' });
            const serialized = JSON.stringify(events);
            assert.ok(!serialized.includes('SECRET_TEST_KEY_VALUE'), 'server-side event log must never contain the raw key');
        } finally { server.close(); }
    });

    await test('10. Method not allowed (GET) -> 405', async () => {
        const handler = createGeminiRequestHandler({ getApiKey: () => 'fake-key-not-real', fetchImpl: fakeFetchOk() });
        const server = await startHandlerServer(handler);
        try {
            const result = await new Promise((resolve, reject) => {
                const req = http.request({ host: '127.0.0.1', port: server.address().port, path: '/ai/gemini', method: 'GET' }, (res) => {
                    let chunks = ''; res.on('data', (c) => chunks += c);
                    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(chunks) }));
                });
                req.on('error', reject); req.end();
            });
            assert.strictEqual(result.status, 405);
        } finally { server.close(); }
    });

    await test('11. GeminiBackendServer constructor throws on missing key when validateOnStart is true (startup validation)', () => {
        assert.throws(() => {
            new GeminiBackendServer({ getApiKey: () => null, fetchImpl: fakeFetchOk(), validateOnStart: true });
        }, /GEMINI_API_KEY is not set/);
    });

    await test('12. GeminiBackendServer starts fine with validateOnStart:false and a missing key (per-request 503 path still applies)', async () => {
        const server = new GeminiBackendServer({ getApiKey: () => null, fetchImpl: fakeFetchOk(), validateOnStart: false });
        await server.listen(0, '127.0.0.1');
        try {
            const res = await postJson(server.raw.address().port, { text: 'hello' });
            assert.strictEqual(res.status, 503);
            assert.strictEqual(res.body.reason, GENERIC_FAILURE_REASONS.NO_KEY);
        } finally { await server.close(); }
    });

    await test('13. GeminiBackendServer end-to-end with a real key + a fake fetch (structural only, not live) succeeds', async () => {
        const server = new GeminiBackendServer({ getApiKey: () => 'fake-key-not-real', fetchImpl: fakeFetchOk('end to end structural text'), validateOnStart: true });
        await server.listen(0, '127.0.0.1');
        try {
            const res = await postJson(server.raw.address().port, { text: 'hello' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.text, 'end to end structural text');
            assert.strictEqual(res.body.isReal, true, 'isReal reflects that the fake upstream call genuinely ran and returned this value — it does NOT mean this was a real Gemini call; see report.');
        } finally { await server.close(); }
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
})();
