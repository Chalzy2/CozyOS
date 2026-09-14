/**
 * core/living/tests/gemini-cloud-provider.test.js
 * Phase 10C-3D — Gemini provider / CozyLivingAI registry integration.
 *
 * STRUCTURAL ONLY. fetchImpl is always a local fake here — no real
 * network call, no real Gemini API key. Proves: provider registration,
 * provider selection, the client-side provider's own error handling,
 * and that this file (the client side) never contains or transmits a
 * credential. Does NOT prove live Gemini execution.
 *
 * Run with: node core/living/tests/gemini-cloud-provider.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
}

const LIVING_FILE = path.join(__dirname, '..', 'cozy-living-ai.js');
const PROVIDER_FILE = path.join(__dirname, '..', 'providers', 'gemini-cloud-provider.js');

function fakeDocument() {
    return { body: { classList: { add() {}, remove() {}, contains() { return false; } } } };
}

function loadLivingAI() {
    global.window = { CozyOS: {} };
    global.document = fakeDocument();
    delete require.cache[require.resolve(LIVING_FILE)];
    require(LIVING_FILE);
    return global.window.CozyOS.LivingAI;
}

function loadGeminiProviderFactory() {
    delete require.cache[require.resolve(PROVIDER_FILE)];
    return require(PROVIDER_FILE); // Node branch of the UMD wrapper: module.exports path
}

function fakeFetchOk(text = 'fake gemini text', overrides = {}) {
    return async () => ({
        ok: true,
        json: async () => ({ success: true, isReal: true, provider: 'gemini-api', model: 'gemini-2.0-flash', text, correlationId: 'test-corr-id', latencyMs: 12, ...overrides }),
    });
}

function fakeFetchBackendFailure(reason = 'PROVIDER_NOT_CONFIGURED', status = 503) {
    return async () => ({ ok: false, status, json: async () => ({ success: false, reason }) });
}

function fakeFetchNetworkError() {
    return async () => { throw new Error('simulated network failure'); };
}

(async () => {
    console.log('\n=== Phase 10C-3D — Gemini Cloud Provider / LivingAI Registry (STRUCTURAL, no real network) ===\n');

    await test('1. Provider factory module loads and exports createGeminiCloudProvider + registerGeminiCloudProvider', () => {
        const mod = loadGeminiProviderFactory();
        assert.strictEqual(typeof mod.createGeminiCloudProvider, 'function');
        assert.strictEqual(typeof mod.registerGeminiCloudProvider, 'function');
    });

    await test('2. Provider object matches the exact CozyLivingAI contract: think() and describe() functions', () => {
        const { createGeminiCloudProvider } = loadGeminiProviderFactory();
        const provider = createGeminiCloudProvider({ fetchImpl: fakeFetchOk() });
        assert.strictEqual(typeof provider.think, 'function');
        assert.strictEqual(typeof provider.describe, 'function');
    });

    await test('3. registerGeminiCloudProvider() registers into the REAL, unmodified CozyLivingAI via its public registerProvider()', () => {
        const livingAI = loadLivingAI();
        const before = livingAI.listProviders().slice();
        assert.ok(before.includes('cloud-llm'), 'sanity: the pre-existing unconfigured cloud-llm slot from cozy-living-ai.js must still exist, unmodified');
        const { registerGeminiCloudProvider } = loadGeminiProviderFactory();
        const result = registerGeminiCloudProvider(livingAI, { fetchImpl: fakeFetchOk() });
        assert.strictEqual(result.success, true);
        assert.ok(livingAI.listProviders().includes('gemini-api'), 'gemini-api must now be registered');
        assert.ok(livingAI.listProviders().includes('cloud-llm'), 'cloud-llm slot must remain untouched/unconfigured');
    });

    await test('4. Registering gemini-api does not change LivingAI\'s default active provider (still reasoning-pipeline)', () => {
        const livingAI = loadLivingAI();
        const { registerGeminiCloudProvider } = loadGeminiProviderFactory();
        registerGeminiCloudProvider(livingAI, { fetchImpl: fakeFetchOk() });
        assert.strictEqual(livingAI.getActiveProvider(), 'reasoning-pipeline', 'default provider must remain exactly as before this file was loaded');
    });

    await test('5. Explicit provider selection: setActiveProvider("gemini-api") then think() routes to the Gemini provider, not the default pipeline', async () => {
        const livingAI = loadLivingAI();
        const { registerGeminiCloudProvider } = loadGeminiProviderFactory();
        registerGeminiCloudProvider(livingAI, { fetchImpl: fakeFetchOk('routed correctly') });
        const setResult = livingAI.setActiveProvider('gemini-api');
        assert.strictEqual(setResult.success, true);
        const result = await livingAI.think('hello');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.text, 'routed correctly');
    });

    await test('6. describeProvider("gemini-api") reports isLLM:true, offline:false, and discloses the credential boundary', () => {
        const livingAI = loadLivingAI();
        const { registerGeminiCloudProvider } = loadGeminiProviderFactory();
        registerGeminiCloudProvider(livingAI, { fetchImpl: fakeFetchOk() });
        const desc = livingAI.describeProvider('gemini-api');
        assert.strictEqual(desc.isLLM, true);
        assert.strictEqual(desc.offline, false);
        assert.ok(/credential/i.test(desc.note), 'describe() must disclose the credential boundary');
    });

    await test('7. Backend-reported failure (e.g. missing key) surfaces as an honest {success:false, reason} — never fabricated success', async () => {
        const { createGeminiCloudProvider } = loadGeminiProviderFactory();
        const provider = createGeminiCloudProvider({ fetchImpl: fakeFetchBackendFailure('PROVIDER_NOT_CONFIGURED', 503) });
        const result = await provider.think('hello');
        assert.strictEqual(result.success, false);
        assert.strictEqual(result.reason, 'PROVIDER_NOT_CONFIGURED');
    });

    await test('8. Network-level failure (fetch throws) is caught and returned as an honest failure, never thrown to the caller', async () => {
        const { createGeminiCloudProvider } = loadGeminiProviderFactory();
        const provider = createGeminiCloudProvider({ fetchImpl: fakeFetchNetworkError() });
        const result = await provider.think('hello');
        assert.strictEqual(result.success, false);
        assert.ok(/simulated network failure/.test(result.reason));
    });

    await test('9. Empty/whitespace text is rejected locally without even attempting a fetch call', async () => {
        let called = false;
        const { createGeminiCloudProvider } = loadGeminiProviderFactory();
        const provider = createGeminiCloudProvider({ fetchImpl: async () => { called = true; return fakeFetchOk()(); } });
        const result = await provider.think('   ');
        assert.strictEqual(result.success, false);
        assert.strictEqual(called, false, 'no network call should be attempted for invalid input');
    });

    await test('10. Static source scan: gemini-cloud-provider.js contains no hardcoded API-key-shaped literal and no process.env reference', () => {
        const src = fs.readFileSync(PROVIDER_FILE, 'utf8');
        assert.ok(!/AIza[0-9A-Za-z_\-]{10,}/.test(src), 'no real-looking Gemini key literal may appear in client-side source');
        assert.ok(!/process\.env/.test(src), 'the client-side provider file must never read environment variables (that is the backend\'s job only)');
        assert.ok(!/GEMINI_API_KEY\s*[:=]/.test(src), 'the client-side provider file must never assign/reference a raw key variable');
    });

    await test('11. isReal on a successful result is exactly whatever the backend reported, never hardcoded true in this file', () => {
        const src = fs.readFileSync(PROVIDER_FILE, 'utf8');
        // Strip /* */ and // comments before scanning so doc-comment prose
        // (e.g. this file's own header saying "Never fabricates isReal:true")
        // can't produce a false positive/negative — only real code is checked.
        const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        assert.ok(!/isReal\s*:\s*true(?!\s*[=)])/.test(codeOnly), 'this file must never itself hardcode isReal:true in actual code — only forward data.isReal from the backend response');
        assert.ok(/isReal\s*:\s*data\.isReal\s*===\s*true/.test(codeOnly), 'the actual code must forward data.isReal from the backend, not invent its own value');
    });

    await test('12. Invalid explicit provider id still fails honestly through LivingAI (unrelated pre-existing behavior, re-verified unchanged)', () => {
        const livingAI = loadLivingAI();
        const { registerGeminiCloudProvider } = loadGeminiProviderFactory();
        registerGeminiCloudProvider(livingAI, { fetchImpl: fakeFetchOk() });
        const setResult = livingAI.setActiveProvider('not-a-real-provider-id');
        assert.strictEqual(setResult.success, false);
    });

    await test('13. [Phase 10C-3E regression] Real browser <script>-load UMD branch exposes BOTH createGeminiCloudProvider and registerGeminiCloudProvider as top-level window.CozyOS properties (not nested under one key)', () => {
        // Deliberately does NOT use require() (the module.exports branch,
        // already covered by test 1-12). Uses vm to execute the real file
        // source in a context with no `module` global, exactly like an
        // actual <script src="gemini-cloud-provider.js"> tag would. This
        // is the exact real-runtime path that was silently broken before
        // Phase 10C-3E (window.CozyOS.createGeminiCloudProvider held the
        // whole {createGeminiCloudProvider, registerGeminiCloudProvider}
        // object instead of the function itself) and went undetected
        // because tests 1-12 never touch this branch.
        const vm = require('vm');
        const src = fs.readFileSync(PROVIDER_FILE, 'utf8');
        const ctx = { window: {}, console };
        vm.createContext(ctx);
        vm.runInContext(src, ctx, { filename: PROVIDER_FILE });
        assert.strictEqual(typeof ctx.window.CozyOS.createGeminiCloudProvider, 'function', 'window.CozyOS.createGeminiCloudProvider must be a function in a real browser load, not an object');
        assert.strictEqual(typeof ctx.window.CozyOS.registerGeminiCloudProvider, 'function', 'window.CozyOS.registerGeminiCloudProvider must exist and be a function in a real browser load');
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
})();
