'use strict';
/**
 * tools/termux/gemini-browser-runtime-probe.js
 * Phase 10C-3E — Real Browser Runtime Probe
 *
 * WHAT THIS IS
 *   Launches a REAL Chromium browser (via Playwright, using the real
 *   binary confirmed present in this environment at
 *   /opt/pw-browsers/chromium-1194/chrome-linux/chrome — falls back to
 *   Playwright's own managed browser if that exact path is absent, e.g.
 *   on a different machine/Termux where `npx playwright install` was
 *   run instead), starts the real, unmodified
 *   server/ai/gemini-runtime-harness-server.js (real static file
 *   serving of index.html + the real /ai/gemini route on one origin),
 *   and navigates the real browser to the real, served index.html.
 *
 *   This is the actual browser/runtime path, not a Node-side simulation
 *   of one: window.CozyOS.LivingAI, window.CozyOS.createGeminiCloudProvider,
 *   and the gemini-cloud-provider-bootstrap.js auto-registration all run
 *   exactly as they would for a real visitor, inside a real DOM, under
 *   real Chromium's real JS engine.
 *
 * WHAT THIS SCRIPT CHECKS, IN THE REAL BROWSER PAGE CONTEXT
 *   1. window.CozyOS.LivingAI exists.
 *   2. "gemini-api" is present in LivingAI.listProviders() — proving the
 *      production bootstrap (core/living/providers/
 *      gemini-cloud-provider-bootstrap.js), loaded via the real <script>
 *      tag in index.html, actually ran and actually registered it.
 *   3. LivingAI.getActiveProvider() is still "reasoning-pipeline" — the
 *      default was never touched by this phase's wiring.
 *   4. Explicitly calls LivingAI.setActiveProvider("gemini-api") (the
 *      existing, public, unmodified API) and confirms it succeeds and
 *      switches the active provider.
 *   5. Calls LivingAI.think(prompt) from inside the real browser page —
 *      this is a real fetch('/ai/gemini') issued by the real browser's
 *      real network stack, not by Node.
 *
 * HONESTY CONTRACT
 *   - If GEMINI_API_KEY is not set in this process's environment, the
 *     harness server is still started (with getApiKey returning null),
 *     so steps 1-4 above can be genuinely proven even without a key —
 *     they do not require Gemini itself, only the real registration/
 *     routing machinery. Step 5 will then honestly report
 *     PROVIDER_NOT_CONFIGURED (never a fabricated success).
 *   - If GEMINI_API_KEY IS set and real network is available (e.g. on a
 *     Termux device with real internet), the harness server reads the
 *     real key via the real, unmodified defaultGetApiKey(), and step 5
 *     performs one genuine outbound call to the real Gemini API. Success
 *     is only ever reported if the real backend genuinely reported
 *     isReal:true.
 *   - This script never falls back to a fake fetch or a canned response
 *     for step 5. Whatever the real browser's real think() call returns
 *     is printed verbatim (as JSON).
 *
 * USAGE
 *   node tools/termux/gemini-browser-runtime-probe.js
 *   GEMINI_API_KEY=xxxxx node tools/termux/gemini-browser-runtime-probe.js
 */

const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const KNOWN_CHROMIUM_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function findPlaywright() {
    const candidates = [
        '/home/claude/.npm-global/lib/node_modules/playwright',
        'playwright',
    ];
    for (const c of candidates) {
        try { return require(c); } catch (_e) { /* try next */ }
    }
    throw new Error('Playwright is not resolvable from this environment. Install it (npm i -D playwright) or run this on a machine/Termux setup that has it.');
}

async function resolveChromiumLaunchOptions() {
    const fs = require('fs');
    if (fs.existsSync(KNOWN_CHROMIUM_PATH)) {
        return { executablePath: KNOWN_CHROMIUM_PATH, headless: true };
    }
    // Fall back to Playwright's own managed browser resolution (works if
    // `npx playwright install chromium` has been run on this machine).
    return { headless: true };
}

async function main() {
    const { createRuntimeHarnessServer } = require(path.join(REPO_ROOT, 'server', 'ai', 'gemini-runtime-harness-server.js'));
    const { chromium } = findPlaywright();

    const hasRealKey = typeof process.env.GEMINI_API_KEY === 'string' && process.env.GEMINI_API_KEY.trim().length > 0;
    const serverEvents = [];
    const harness = createRuntimeHarnessServer({
        // Real, unmodified defaultGetApiKey() reads process.env.GEMINI_API_KEY
        // itself — we don't pass a custom getApiKey here at all, so this is
        // exactly the real production code path, honestly reporting
        // PROVIDER_NOT_CONFIGURED if this environment has no key.
        onServerEvent: (event, detail) => serverEvents.push({ event, detail }),
    });
    const addr = await harness.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const report = {
        phase: '10C-3E',
        probeType: 'real-browser-runtime',
        environment: {
            hasGeminiApiKeyInEnv: hasRealKey,
            harnessBaseUrl: baseUrl,
        },
        checks: {},
        thinkResult: null,
        serverSideEvents: null, // filled in after, key-free by construction
        errors: [],
    };

    let browser;
    try {
        const launchOpts = await resolveChromiumLaunchOptions();
        browser = await chromium.launch(launchOpts);
        report.chromiumVersion = await browser.version();
        report.chromiumExecutable = launchOpts.executablePath || '(playwright-managed)';

        const page = await browser.newPage();
        const consoleMessages = [];
        page.on('console', (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
        page.on('pageerror', (err) => consoleMessages.push(`[pageerror] ${err.message}`));

        await page.goto(`${baseUrl}/index.html`, { waitUntil: 'load', timeout: 30000 });

        // Give the launch-sequence / async bootstraps a moment to settle.
        // We are not waiting for the full ~10s launch animation — only for
        // the synchronous <script> tags (which include our real wiring)
        // to have executed, which happens well before that.
        await page.waitForTimeout(1000);

        report.checks.livingAIExists = await page.evaluate(() => {
            return !!(window.CozyOS && window.CozyOS.LivingAI && typeof window.CozyOS.LivingAI.think === 'function');
        });

        report.checks.providerList = await page.evaluate(() => {
            return window.CozyOS && window.CozyOS.LivingAI ? window.CozyOS.LivingAI.listProviders() : null;
        });
        report.checks.geminiApiRegistered = Array.isArray(report.checks.providerList) && report.checks.providerList.includes('gemini-api');

        report.checks.defaultActiveProviderBeforeSwitch = await page.evaluate(() => {
            return window.CozyOS && window.CozyOS.LivingAI ? window.CozyOS.LivingAI.getActiveProvider() : null;
        });
        report.checks.defaultProviderIsReasoningPipeline = report.checks.defaultActiveProviderBeforeSwitch === 'reasoning-pipeline';

        report.checks.describeGeminiApi = await page.evaluate(() => {
            return window.CozyOS && window.CozyOS.LivingAI ? window.CozyOS.LivingAI.describeProvider('gemini-api') : null;
        });

        // Step 4: explicit, real, public API call inside the real browser.
        report.checks.setActiveProviderResult = await page.evaluate(() => {
            return window.CozyOS.LivingAI.setActiveProvider('gemini-api');
        });
        report.checks.activeProviderAfterSwitch = await page.evaluate(() => {
            return window.CozyOS.LivingAI.getActiveProvider();
        });
        report.checks.switchSucceeded = report.checks.setActiveProviderResult
            && report.checks.setActiveProviderResult.success === true
            && report.checks.activeProviderAfterSwitch === 'gemini-api';

        // Step 5: the real think() call, from inside the real browser,
        // issuing a real fetch('/ai/gemini') over the real loopback socket
        // to the real harness server (which, in turn, would make a real
        // outbound call to Google IF a real key + real network exist).
        const startedAt = Date.now();
        report.thinkResult = await page.evaluate(async () => {
            return await window.CozyOS.LivingAI.think('Hello. Tell me briefly what you can help me with.');
        });
        report.thinkLatencyMsClientSide = Date.now() - startedAt;

        report.consoleMessages = consoleMessages.slice(0, 40); // cap for readability
    } catch (e) {
        report.errors.push(e.message);
    } finally {
        if (browser) await browser.close();
        await harness.close();
    }

    report.serverSideEvents = serverEvents; // never contains the key, per gemini-backend-endpoint.js's own contract

    console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
    console.error(JSON.stringify({ success: false, reason: 'PROBE_CRASHED', detail: e.message }, null, 2));
    process.exit(1);
});
