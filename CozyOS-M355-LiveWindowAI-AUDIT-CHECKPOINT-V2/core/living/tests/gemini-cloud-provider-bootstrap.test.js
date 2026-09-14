'use strict';
/**
 * core/living/tests/gemini-cloud-provider-bootstrap.test.js
 * Phase 10C-3E — Real Gemini Runtime Integration
 *
 * SCOPE: structural/bootstrap-order tests. These verify the bootstrap
 * file's logic and the HTML wiring using vm-executed real source (the
 * actual <script>-load code path, not require()) plus real fake-DOM
 * shims — no real network, no real Gemini API key. They do NOT and
 * cannot verify a real Gemini response; see
 * tools/termux/gemini-browser-runtime-probe.js and
 * PHASE10C-3E-GEMINI-RUNTIME-INTEGRATION-REPORT.md for that.
 *
 * Run with: node core/living/tests/gemini-cloud-provider-bootstrap.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

let passed = 0;
let failed = 0;
async function test(name, fn) {
    try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
    catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
}

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const LIVING_AI_FILE = path.join(REPO_ROOT, 'core', 'living', 'cozy-living-ai.js');
const PROVIDER_FILE = path.join(REPO_ROOT, 'core', 'living', 'providers', 'gemini-cloud-provider.js');
const BOOTSTRAP_FILE = path.join(REPO_ROOT, 'core', 'living', 'providers', 'gemini-cloud-provider-bootstrap.js');
const INDEX_HTML = path.join(REPO_ROOT, 'index.html');
const DASHBOARD_HTML = path.join(REPO_ROOT, 'dashboard.html');

function fakeDocument() {
    return { body: { classList: { add() {}, remove() {}, contains() { return false; } } } };
}

/**
 * runRealScriptLoadSequence(order)
 *   Executes the REAL source of each file in `order`, in order, inside
 *   ONE shared vm context that has `window`/`document` but NO `module`
 *   global — exactly reproducing what a real browser does when it hits
 *   a sequence of <script src="..."> tags in document order. This is
 *   the exact mechanism that caught the Phase 10C-3E UMD bug that
 *   require()-based tests could not see.
 */
function runRealScriptLoadSequence(order, events) {
    const ctx = { window: { CozyOS: {} }, document: fakeDocument(), console };
    ctx.window.CozyOS.onBootstrapEvent = (event, detail) => { if (events) events.push({ event, detail }); };
    vm.createContext(ctx);
    for (const file of order) {
        const src = fs.readFileSync(file, 'utf8');
        vm.runInContext(src, ctx, { filename: file });
    }
    return ctx.window;
}

(async () => {
    console.log('\n=== Phase 10C-3E — Gemini Bootstrap / Runtime-Order Tests (STRUCTURAL, no real network) ===\n');

    await test('1. Full real script-load order (cozy-living-ai.js -> gemini-cloud-provider.js -> bootstrap) registers "gemini-api" without changing the default active provider', () => {
        const events = [];
        const win = runRealScriptLoadSequence([LIVING_AI_FILE, PROVIDER_FILE, BOOTSTRAP_FILE], events);
        assert.ok(win.CozyOS.LivingAI.listProviders().includes('gemini-api'), 'gemini-api must be registered after real script load order');
        assert.strictEqual(win.CozyOS.LivingAI.getActiveProvider(), 'reasoning-pipeline', 'default active provider must remain reasoning-pipeline');
        assert.ok(events.some((e) => e.event === 'GEMINI_BOOTSTRAP_REGISTERED'), 'bootstrap must emit a real success event');
    });

    await test('2. Wrong load order (bootstrap before cozy-living-ai.js) fails honestly — never throws, never fabricates registration', () => {
        const events = [];
        const win = runRealScriptLoadSequence([BOOTSTRAP_FILE, LIVING_AI_FILE, PROVIDER_FILE], events);
        // LivingAI loads AFTER bootstrap here, so bootstrap could not have
        // found it — it must have reported a real skip, not thrown or
        // silently retried, and gemini-api must NOT be registered as a
        // side effect of this wrong order.
        assert.ok(events.some((e) => e.event === 'GEMINI_BOOTSTRAP_SKIPPED'), 'bootstrap must honestly report being skipped when LivingAI is not yet loaded');
        assert.ok(!win.CozyOS.LivingAI.listProviders().includes('gemini-api'), 'gemini-api must not be registered when bootstrap ran before its dependencies');
    });

    await test('3. Missing provider factory (cozy-living-ai.js loaded, gemini-cloud-provider.js NOT loaded) fails honestly, does not throw', () => {
        const events = [];
        assert.doesNotThrow(() => runRealScriptLoadSequence([LIVING_AI_FILE, BOOTSTRAP_FILE], events));
        assert.ok(events.some((e) => e.event === 'GEMINI_BOOTSTRAP_SKIPPED'));
    });

    await test('4. Bootstrap is idempotent: loading it twice in the same real context does not duplicate the registry entry or change the active provider', () => {
        const events = [];
        const win = runRealScriptLoadSequence([LIVING_AI_FILE, PROVIDER_FILE, BOOTSTRAP_FILE, BOOTSTRAP_FILE], events);
        const occurrences = win.CozyOS.LivingAI.listProviders().filter((p) => p === 'gemini-api').length;
        assert.strictEqual(occurrences, 1, 'gemini-api must appear exactly once in the provider list even if bootstrap runs twice');
        assert.strictEqual(win.CozyOS.LivingAI.getActiveProvider(), 'reasoning-pipeline');
    });

    await test('5. describeProvider("gemini-api") is reachable end-to-end after the real script-load sequence (isLLM:true, offline:false)', () => {
        const win = runRealScriptLoadSequence([LIVING_AI_FILE, PROVIDER_FILE, BOOTSTRAP_FILE]);
        const desc = win.CozyOS.LivingAI.describeProvider('gemini-api');
        assert.strictEqual(desc.isLLM, true);
        assert.strictEqual(desc.offline, false);
    });

    await test('6. Explicit setActiveProvider("gemini-api") + think() after the real script-load sequence performs a real fetch() call (verified via a real, injected fetch spy) — never bypasses the network layer', async () => {
        const events = [];
        const win = runRealScriptLoadSequence([LIVING_AI_FILE, PROVIDER_FILE, BOOTSTRAP_FILE], events);
        let fetchCalledWith = null;
        win.fetch = async (url, opts) => {
            fetchCalledWith = { url, opts };
            return { ok: true, json: async () => ({ success: true, isReal: true, text: 'real-path response', model: 'gemini-2.0-flash', correlationId: 'c1', latencyMs: 3 }) };
        };
        // Re-register with the window-level fetch this time (the earlier
        // registration in this context used the default global.fetch
        // lookup at registration time, which has no window.fetch override
        // hook — so re-run registerGeminiCloudProvider explicitly here to
        // prove the provider really does call fetch(), not a stub).
        const { registerGeminiCloudProvider, createGeminiCloudProvider } = win.CozyOS;
        const provider = createGeminiCloudProvider({ backendUrl: '/ai/gemini', fetchImpl: win.fetch });
        win.CozyOS.LivingAI.registerProvider('gemini-api', provider);
        const setResult = win.CozyOS.LivingAI.setActiveProvider('gemini-api');
        assert.strictEqual(setResult.success, true);
        const result = await win.CozyOS.LivingAI.think('hello from bootstrap test');
        assert.strictEqual(result.success, true);
        assert.strictEqual(result.result.text, 'real-path response');
        assert.ok(fetchCalledWith, 'a real fetch call must have been made');
        assert.strictEqual(fetchCalledWith.url, '/ai/gemini');
        void registerGeminiCloudProvider;
    });

    await test('7. index.html loads gemini-cloud-provider.js and its bootstrap AFTER cozy-living-ai.js, in the correct relative order', () => {
        const html = fs.readFileSync(INDEX_HTML, 'utf8');
        const livingIdx = html.indexOf('core/living/cozy-living-ai.js');
        const providerIdx = html.indexOf('core/living/providers/gemini-cloud-provider.js"');
        const bootstrapIdx = html.indexOf('core/living/providers/gemini-cloud-provider-bootstrap.js');
        assert.ok(livingIdx > -1 && providerIdx > -1 && bootstrapIdx > -1, 'all three script references must be present in index.html');
        assert.ok(livingIdx < providerIdx, 'cozy-living-ai.js must load before gemini-cloud-provider.js in index.html');
        assert.ok(providerIdx < bootstrapIdx, 'gemini-cloud-provider.js must load before its bootstrap in index.html');
    });

    await test('8. dashboard.html loads gemini-cloud-provider.js and its bootstrap AFTER cozy-living-ai.js, in the correct relative order', () => {
        const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
        const livingIdx = html.indexOf('core/living/cozy-living-ai.js');
        const providerIdx = html.indexOf('core/living/providers/gemini-cloud-provider.js"');
        const bootstrapIdx = html.indexOf('core/living/providers/gemini-cloud-provider-bootstrap.js');
        assert.ok(livingIdx > -1 && providerIdx > -1 && bootstrapIdx > -1, 'all three script references must be present in dashboard.html');
        assert.ok(livingIdx < providerIdx, 'cozy-living-ai.js must load before gemini-cloud-provider.js in dashboard.html');
        assert.ok(providerIdx < bootstrapIdx, 'gemini-cloud-provider.js must load before its bootstrap in dashboard.html');
    });

    await test('9. Neither index.html nor dashboard.html was given a setActiveProvider("gemini-api") call anywhere (default provider is never switched by this phase\'s HTML wiring)', () => {
        for (const file of [INDEX_HTML, DASHBOARD_HTML]) {
            const html = fs.readFileSync(file, 'utf8');
            assert.ok(!/setActiveProvider\s*\(\s*['"]gemini-api['"]\s*\)/.test(html), `${path.basename(file)} must not force-activate gemini-api`);
        }
    });

    await test('10. Static source scan: gemini-cloud-provider-bootstrap.js\'s actual CODE (comments stripped) never references process.env or a key-shaped literal', () => {
        const src = fs.readFileSync(BOOTSTRAP_FILE, 'utf8');
        const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        assert.ok(!/process\.env/.test(codeOnly), 'the file\'s own doc comment discusses process.env in prose — only the actual code must never reference it');
        assert.ok(!/AIza[0-9A-Za-z_\-]{10,}/.test(codeOnly));
    });

    console.log(`\n${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
})();
