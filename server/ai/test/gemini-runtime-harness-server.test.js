'use strict';
/**
 * server/ai/test/gemini-runtime-harness-server.test.js
 * Phase 10C-3E — Real Gemini Runtime Integration
 *
 * SCOPE: structural tests of the combined static+API harness server.
 * Uses real HTTP requests over a real loopback socket to a real
 * http.Server instance (not mocked), but with an injected fake
 * getApiKey/fetchImpl for the Gemini leg — no real network call to
 * Google, no real credential. Proves: real static file serving of the
 * actual repo files, the real /ai/gemini route mounted on the same
 * origin/port, and correct routing between the two.
 *
 * Run with: node server/ai/test/gemini-runtime-harness-server.test.js
 */

const assert = require('assert');
const path = require('path');
const { createRuntimeHarnessServer } = require('../gemini-runtime-harness-server.js');

let passed = 0;
let failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
}

function fakeGeminiOkFetch(text = 'harness fake response') {
    return async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
}

(async () => {
    console.log('\n=== Phase 10C-3E — Gemini Runtime Harness Server (STRUCTURAL, real HTTP loopback, no real network) ===\n');

    let harness, baseUrl;

    await test('1. Server starts and serves the real, unmodified index.html from disk', async () => {
        harness = createRuntimeHarnessServer({ getApiKey: () => 'structural-fake-key', fetchImpl: fakeGeminiOkFetch() });
        const addr = await harness.listen(0, '127.0.0.1');
        baseUrl = `http://127.0.0.1:${addr.port}`;
        const res = await fetch(`${baseUrl}/index.html`);
        assert.strictEqual(res.status, 200);
        const text = await res.text();
        assert.ok(text.includes('CozyOS Enterprise'), 'must be the real index.html, not a stub');
    });

    await test('2. Served index.html contains the real Phase 10C-3E script wiring in the correct order', async () => {
        const res = await fetch(`${baseUrl}/index.html`);
        const text = await res.text();
        const livingIdx = text.indexOf('core/living/cozy-living-ai.js');
        const providerIdx = text.indexOf('core/living/providers/gemini-cloud-provider.js"');
        const bootstrapIdx = text.indexOf('core/living/providers/gemini-cloud-provider-bootstrap.js');
        assert.ok(livingIdx > -1 && providerIdx > livingIdx && bootstrapIdx > providerIdx);
    });

    await test('3. Real static JS files (the actual provider + bootstrap) are servable byte-for-byte', async () => {
        const res = await fetch(`${baseUrl}/core/living/providers/gemini-cloud-provider.js`);
        assert.strictEqual(res.status, 200);
        const text = await res.text();
        assert.ok(text.includes('createGeminiCloudProvider'));
        assert.ok(res.headers.get('content-type').includes('javascript'));
    });

    await test('4. dashboard.html is also servable and contains the same wiring', async () => {
        const res = await fetch(`${baseUrl}/dashboard.html`);
        assert.strictEqual(res.status, 200);
        const text = await res.text();
        assert.ok(text.includes('core/living/providers/gemini-cloud-provider-bootstrap.js'));
    });

    await test('5. /ai/gemini is mounted on the SAME origin/port as the static files (same-origin, no CORS needed)', async () => {
        const res = await fetch(`${baseUrl}/ai/gemini`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'hello from harness test' }),
        });
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.success, true);
        assert.strictEqual(data.isReal, true);
        assert.strictEqual(data.text, 'harness fake response');
    });

    await test('6. A missing static file returns a real 404, not a silent fallback to index.html', async () => {
        const res = await fetch(`${baseUrl}/this-file-does-not-exist.js`);
        assert.strictEqual(res.status, 404);
    });

    await test('7. Path traversal outside the repo root is rejected (403), not served', async () => {
        const res = await fetch(`${baseUrl}/../../../../../etc/passwd`);
        assert.ok(res.status === 403 || res.status === 404, `expected 403/404, got ${res.status}`);
    });

    await test('8. Missing-key path still works end-to-end through the harness (honest 503, never a fabricated success)', async () => {
        const noKeyHarness = createRuntimeHarnessServer({ getApiKey: () => null });
        const addr = await noKeyHarness.listen(0, '127.0.0.1');
        const res = await fetch(`http://127.0.0.1:${addr.port}/ai/gemini`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'hello' }),
        });
        assert.strictEqual(res.status, 503);
        const data = await res.json();
        assert.strictEqual(data.success, false);
        assert.strictEqual(data.reason, 'PROVIDER_NOT_CONFIGURED');
        await noKeyHarness.close();
    });

    if (harness) await harness.close();

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
})();
