'use strict';
/**
 * tools/termux/tests/gemini-real-execution-probe.test.js
 * Phase 10C-3E
 *
 * SCOPE DISCLOSURE: these tests exercise the probe script's own honesty
 * guarantees (fails closed without a key; never fabricates success) by
 * running it as a real child process. They do NOT and cannot verify a
 * real Gemini response — that requires a real GEMINI_API_KEY and real
 * network access, neither of which this test environment has. See
 * PHASE10C-3E-GEMINI-REAL-EXECUTION-REPORT.md.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const { execFile } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.join(__dirname, '..', 'gemini-real-execution-probe.js');

function run(env) {
    return new Promise((resolve) => {
        execFile(process.execPath, [SCRIPT], { env: { ...process.env, ...env } }, (error, stdout) => {
            resolve({ code: error ? error.code : 0, stdout });
        });
    });
}

test('1. No GEMINI_API_KEY set -> fails closed with PROVIDER_NOT_CONFIGURED, exit code 1, no fabricated success', async () => {
    const cleanEnv = { GEMINI_API_KEY: '' };
    const { code, stdout } = await run(cleanEnv);
    const parsed = JSON.parse(stdout);
    assert.strictEqual(code, 1);
    assert.strictEqual(parsed.success, false);
    assert.strictEqual(parsed.isReal, false);
    assert.strictEqual(parsed.reason, 'PROVIDER_NOT_CONFIGURED');
});

test('2. Output never contains the literal API key string, success or failure', async () => {
    const secret = 'totally-real-looking-key-abc123xyz';
    const { stdout } = await run({ GEMINI_API_KEY: secret });
    assert.ok(!stdout.includes(secret), 'API key leaked into stdout');
});

test('3. A dummy (non-functional) key still reaches the real network layer and fails honestly (not a fabricated success)', async () => {
    const { code, stdout } = await run({ GEMINI_API_KEY: 'dummy-not-a-real-key' });
    const parsed = JSON.parse(stdout);
    // In a network-disabled sandbox this will be an upstream/network-shaped
    // failure. In a real Termux run with real network this exact key would
    // still fail (Google will reject it) — either way, success must be false
    // because this is not a real, valid key.
    assert.strictEqual(parsed.success, false);
    assert.strictEqual(parsed.isReal, false);
    assert.strictEqual(code, 1);
});

test('4. Script never prints success:true without isReal:true (no partial/fabricated success shape)', async () => {
    const { stdout } = await run({ GEMINI_API_KEY: 'dummy-not-a-real-key' });
    const parsed = JSON.parse(stdout);
    if (parsed.success === true) {
        assert.strictEqual(parsed.isReal, true);
    } else {
        assert.strictEqual(parsed.success, false);
    }
});
