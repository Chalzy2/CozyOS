'use strict';

/**
 * REAL integration test for the JS provider -> live HTTP bridge -> real
 * NLLB model path.
 *
 * TEST TAXONOMY IN THIS REPO (disclosed explicitly so results are never
 * confused with each other):
 *
 *   1. MOCKED UNIT TEST
 *      core/modules/speech/adapters/test/speech-translation-provider-nllb.test.js
 *      Real provider/registry code; `fetch` is stubbed with disclosed
 *      canned responses. Proves the provider's own logic (registration,
 *      fail-closed behavior, response mapping). Never touches a real
 *      bridge or a real model.
 *
 *   2. BRIDGE IN-PROCESS TEST
 *      language-packs/shared/NLLB-200-600M-INT8/test_nllb_http_bridge.py
 *      Real Flask app + real NLLBEngine, driven via Flask's test client
 *      (no real TCP socket). Proves the Python side alone.
 *
 *   3. THIS FILE — REAL JS-PROVIDER INTEGRATION TEST
 *      Real, unmodified provider files; Node's real global `fetch`; a
 *      genuinely running nllb_http_bridge.py process (reused if one is
 *      already up, spawned and owned by this file otherwise); a real
 *      loaded NLLB model. Proves the exact path:
 *        JS provider -> registry -> real HTTP bridge -> real NLLB
 *      Scope is intentionally minimal — one sw -> en translation — not
 *      the full 16-target fan-out. This file exists to give that path
 *      permanent, automatable coverage; it does not replace (4) below.
 *
 *   4. FULL FAN-OUT PROOF
 *      language-packs/shared/NLLB-200-600M-INT8/real_sw_to_16.js
 *      Manual, device-run script exercising the same real path as (3)
 *      across all 16 supported targets, reporting wall/latency numbers.
 *      Remains the authoritative full fan-out proof. Not duplicated
 *      here.
 *
 * WHY THIS TEST IS OPT-IN
 *   Running this unconditionally in every `node --test` invocation would
 *   mean every contributor/CI run silently tries to spawn a Python
 *   process and load a 600M-parameter ONNX model — slow (this repo's own
 *   device log: ~27s/load average across 11 loads) and dependent on
 *   python3/flask/onnxruntime/tokenizers plus the model files actually
 *   being present. Rather than fake that or silently skip it forever,
 *   every test in this file is gated behind an explicit opt-in env var.
 *   Without it, this file reports SKIPPED with an explanatory message —
 *   never a silent pass, never a fabricated result.
 *
 * RUNNING THIS TEST FOR REAL
 *   cd language-packs/shared/NLLB-200-600M-INT8 && python3 nllb_http_bridge.py &   # optional; auto-started if absent
 *   COZY_RUN_NLLB_INTEGRATION=1 node --test core/modules/speech/adapters/test/speech-translation-provider-nllb.integration.test.js
 *
 *   Optional env vars:
 *     COZY_NLLB_TEST_BASE_URL       default http://127.0.0.1:8177
 *     COZY_NLLB_STARTUP_TIMEOUT_MS  default 60000 (only used if this
 *                                   file has to spawn the bridge itself)
 *
 * LIFECYCLE
 *   - If a bridge already answers /health with modelLoaded:true at the
 *     target base URL, this file reuses it and does NOT kill it on
 *     exit — this file didn't start it, so it has no right to tear it
 *     down.
 *   - Otherwise this file spawns `python3 nllb_http_bridge.py` itself
 *     (cwd: language-packs/shared/NLLB-200-600M-INT8), polls /health
 *     until the model reports loaded, and kills the process it started
 *     in an after() hook.
 *
 * FAIL-CLOSED CONTRACT
 *   Every assertion here throws on: bridge unreachable, model not
 *   loaded, non-2xx response, isReal !== true, or a missing/empty
 *   translatedText. Nothing in this file is allowed to soft-pass.
 *   Malformed-response and connection-refused *provider logic* is
 *   already covered exhaustively by the mocked unit test (1) above and
 *   is deliberately not re-duplicated here — this file's job is proving
 *   the real wiring, not re-proving logic already proven with a stub.
 *
 * WHAT THIS FILE DOES NOT CHANGE
 *   No production file is imported in any modified form. The two
 *   provider files are required as-is, exactly as real_sw_to_16.js
 *   requires them. No lock, concurrency, latency, retry, model-loading,
 *   or error-status behavior is touched by this file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RUN_INTEGRATION = process.env.COZY_RUN_NLLB_INTEGRATION === '1';
const BASE_URL = process.env.COZY_NLLB_TEST_BASE_URL || 'http://127.0.0.1:8177';
const STARTUP_TIMEOUT_MS = Number(process.env.COZY_NLLB_STARTUP_TIMEOUT_MS || 60000);
const POLL_INTERVAL_MS = 500;

const SPEECH_ADAPTERS_DIR = path.resolve(__dirname, '..');
const BRIDGE_DIR = path.resolve(
    __dirname, '..', '..', '..', '..', '..',
    'language-packs', 'shared', 'NLLB-200-600M-INT8'
);

function freshRegistry() {
    for (const rel of ['speech-translation-provider.js', 'speech-translation-provider-nllb.js']) {
        const p = path.join(SPEECH_ADAPTERS_DIR, rel);
        delete require.cache[require.resolve(p)];
    }
    global.window = { CozyOS: {} };
    require(path.join(SPEECH_ADAPTERS_DIR, 'speech-translation-provider.js'));
    require(path.join(SPEECH_ADAPTERS_DIR, 'speech-translation-provider-nllb.js'));
}

async function checkHealthOnce(baseUrl) {
    try {
        const res = await fetch(`${baseUrl}/health`);
        if (!res.ok) return { ok: false };
        const body = await res.json();
        return { ok: !!(body && body.ok === true && body.modelLoaded === true), body };
    } catch (_e) {
        return { ok: false };
    }
}

let spawnedProcess = null;

async function ensureBridge() {
    const initial = await checkHealthOnce(BASE_URL);
    if (initial.ok) {
        return { startedHere: false };
    }

    spawnedProcess = spawn('python3', ['nllb_http_bridge.py'], {
        cwd: BRIDGE_DIR,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderrBuf = '';
    spawnedProcess.stderr.on('data', (chunk) => { stderrBuf += chunk.toString(); });
    spawnedProcess.on('error', (err) => { stderrBuf += `\n[spawn error] ${err.message}`; });

    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const check = await checkHealthOnce(BASE_URL);
        if (check.ok) return { startedHere: true };
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    // Fail closed: kill whatever we started and surface the real diagnostic output.
    if (spawnedProcess && !spawnedProcess.killed) spawnedProcess.kill('SIGTERM');
    throw new Error(
        `nllb_http_bridge.py did not report a loaded model within ${STARTUP_TIMEOUT_MS}ms `
        + `at ${BASE_URL}/health. Captured stderr: ${stderrBuf || '(empty)'}`
    );
}

function teardownBridge() {
    if (spawnedProcess && !spawnedProcess.killed) {
        spawnedProcess.kill('SIGTERM');
    }
    spawnedProcess = null;
}

test(
    'REAL JS provider -> HTTP bridge -> NLLB integration (sw -> en)',
    {
        skip: !RUN_INTEGRATION
            && 'Set COZY_RUN_NLLB_INTEGRATION=1 to run this against a real bridge and real model. '
            + 'See real_sw_to_16.js for the manual full 16-target fan-out proof.',
    },
    async (t) => {
        let startedHere = false;

        t.after(() => {
            if (startedHere) teardownBridge();
        });

        await t.test('bridge is reachable and honestly reports a loaded model', async () => {
            const result = await ensureBridge();
            startedHere = result.startedHere;
            const health = await checkHealthOnce(BASE_URL);
            assert.equal(health.ok, true, 'expected /health to report ok:true, modelLoaded:true');
        });

        await t.test('real provider registers and isAvailable() is honestly true', async () => {
            freshRegistry();
            window.CozyOS.SpeechTranslationNLLBProvider.register(BASE_URL);
            const provider = window.CozyOS.SpeechTranslationProviders.get('nllb-bridge');
            assert.ok(provider, 'expected nllb-bridge to be registered');
            assert.equal(provider.name, 'nllb-bridge');
            assert.equal(provider.type, 'offline');

            const healthy = await provider.isAvailable();
            assert.equal(healthy, true, 'expected isAvailable() to be true against a real running bridge');
        });

        await t.test('real translate() sw -> en succeeds through the real bridge and real model', async () => {
            const result = await window.CozyOS.SpeechTranslationProviders.translate(
                'Habari ya leo?', { sourceLanguage: 'sw', targetLanguage: 'en' }, 'nllb-bridge'
            );
            assert.equal(result.isReal, true, `expected isReal:true, got reason: ${result.reason}`);
            assert.equal(result.providerName, 'nllb-bridge');
            assert.equal(typeof result.translatedText, 'string');
            assert.ok(result.translatedText.trim().length > 0, 'expected a non-empty translatedText');
        });
    }
);
