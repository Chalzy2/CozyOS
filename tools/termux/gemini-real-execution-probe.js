#!/usr/bin/env node
/**
 * tools/termux/gemini-real-execution-probe.js
 * Phase 10C-3E — Real Gemini Execution Probe (Termux/Android)
 *
 * WHAT THIS IS
 *   A standalone CLI that starts the REAL, UNMODIFIED
 *   server/ai/gemini-backend-endpoint.js (GeminiBackendServer) locally,
 *   drives it through the REAL, UNMODIFIED
 *   core/living/providers/gemini-cloud-provider.js client, and performs
 *   ONE real outbound HTTPS request to the real Gemini API using
 *   Node's global fetch (Node 18+) and a real GEMINI_API_KEY supplied
 *   only via the environment. No fake fetchImpl is used here — this is
 *   the live path, not a structural/simulation test.
 *
 * WHY THIS EXISTS (context)
 *   Phase 10C-3D built the boundary but could not reach the live Gemini
 *   API because that development sandbox has outbound network access
 *   disabled entirely. Phase 10C-3E confirmed the same sandbox blocks
 *   ALL outbound hosts at an egress-proxy level (not Gemini-specific —
 *   even https://example.com returns 403 host_not_allowed there), and
 *   has no GEMINI_API_KEY. This script is the artifact that lets a real
 *   execution attempt happen outside that sandbox — e.g. on a physical
 *   Android device under Termux, which has ordinary outbound internet
 *   access.
 *
 * REQUIREMENTS (Termux)
 *   pkg install nodejs
 *   export GEMINI_API_KEY="<a real key, never committed to this repo>"
 *
 * USAGE
 *   GEMINI_API_KEY=xxxxx node tools/termux/gemini-real-execution-probe.js
 *   GEMINI_API_KEY=xxxxx node tools/termux/gemini-real-execution-probe.js "Custom prompt text"
 *
 * OUTPUT
 *   Prints one JSON object to stdout with the real, honest result:
 *     { success, isReal, model, latencyMs, textPreview, httpStatus, reason, correlationId }
 *   Exit code 0 on a genuine successful Gemini response, 1 on any
 *   failure (missing key, network error, upstream error, timeout).
 *   Never prints the API key. Never fabricates success.
 *
 * HONESTY CONTRACT
 *   - This script does not catch failures and relabel them as success.
 *   - If GEMINI_API_KEY is missing, it stops immediately and says so —
 *     it does not fall back to a fake/simulated response.
 *   - The only "real" claim this script will ever print is one backed
 *     by an actual HTTP round trip to generativelanguage.googleapis.com,
 *     performed by the real (unmodified) callGemini() in
 *     server/ai/gemini-backend-endpoint.js.
 */

'use strict';

const path = require('path');

const BACKEND_PATH = path.join(__dirname, '..', '..', 'server', 'ai', 'gemini-backend-endpoint.js');
const PROVIDER_PATH = path.join(__dirname, '..', '..', 'core', 'living', 'providers', 'gemini-cloud-provider.js');

function fail(reason, extra = {}) {
    console.log(JSON.stringify({ success: false, isReal: false, reason, ...extra }, null, 2));
    process.exit(1);
}

async function main() {
    if (typeof fetch !== 'function') {
        fail('NO_FETCH_AVAILABLE', { detail: 'This Node runtime has no global fetch. Use Node 18+.' });
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
        fail('PROVIDER_NOT_CONFIGURED', {
            detail: 'GEMINI_API_KEY is not set in the environment. Set it and re-run — this script will not proceed without a real key.',
        });
        return;
    }

    let GeminiBackendServer;
    let createGeminiCloudProvider;
    try {
        ({ GeminiBackendServer } = require(BACKEND_PATH));
        ({ createGeminiCloudProvider } = require(PROVIDER_PATH));
    } catch (e) {
        fail('MODULE_LOAD_FAILED', { detail: e.message });
        return;
    }

    const promptText = process.argv.slice(2).join(' ').trim()
        || 'Hello. Tell me briefly what you can help me with.';

    let server;
    try {
        server = new GeminiBackendServer({ path: '/ai/gemini', validateOnStart: true });
    } catch (e) {
        fail('STARTUP_VALIDATION_FAILED', { detail: e.message });
        return;
    }

    let addr;
    try {
        addr = await server.listen(0, '127.0.0.1');
    } catch (e) {
        fail('LOCAL_LISTEN_FAILED', { detail: e.message });
        return;
    }

    const backendUrl = `http://127.0.0.1:${addr.port}/ai/gemini`;
    const provider = createGeminiCloudProvider({ backendUrl, fetchImpl: fetch });

    const startedAt = Date.now();
    let result;
    try {
        result = await provider.think(promptText);
    } catch (e) {
        await server.close();
        fail('PROVIDER_THREW', { detail: e.message });
        return;
    }
    const latencyMs = Date.now() - startedAt;

    await server.close();

    if (result && result.success && result.result && result.result.isReal) {
        console.log(JSON.stringify({
            success: true,
            isReal: true,
            model: result.result.model,
            latencyMs,
            textPreview: String(result.result.text || '').slice(0, 200),
            correlationId: result.result.correlationId || null,
        }, null, 2));
        process.exit(0);
    } else {
        console.log(JSON.stringify({
            success: false,
            isReal: false,
            reason: (result && result.reason) || (result && result.result && result.result.reason) || 'UNKNOWN',
            latencyMs,
        }, null, 2));
        process.exit(1);
    }
}

main().catch((e) => fail('UNCAUGHT_ERROR', { detail: e.message }));
