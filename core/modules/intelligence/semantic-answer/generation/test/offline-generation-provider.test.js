'use strict';

/**
 * core/modules/intelligence/semantic-answer/generation/test/offline-generation-provider.test.js
 * Node-level checks for offline-generation-provider.js that don't need a
 * real browser: (1) it never throws or blocks when window/WebAssembly
 * aren't present (this file itself runs under plain Node, which has
 * neither `window` nor a DOM), and (2) MODEL_URL's filename stays in
 * sync with scripts/offline-model/fetch-offline-model.js's own
 * MODEL.fileName - the one place those two independent constants could
 * silently drift (see that file's own header for why they're not a
 * shared module). Real model-load/inference behavior is proven in the
 * real browser test (core/tests/browser/offline-generative-realization-
 * browser.test.js), not here.
 *
 * Run with: node --test core/modules/intelligence/semantic-answer/generation/test/offline-generation-provider.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const PROVIDER_PATH = path.join(__dirname, '..', 'offline-generation-provider.js');
const FETCH_SCRIPT_PATH = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'scripts', 'offline-model', 'fetch-offline-model.js');

function freshProvider() {
    try { delete require.cache[require.resolve(PROVIDER_PATH)]; } catch (_e) { /* not loaded */ }
    global.window = { CozyOS: {}, fetch: undefined }; // no `window.fetch` -> NOT a real browser/WASM environment
    global.WebAssembly = undefined;
    require(PROVIDER_PATH);
    return global.window.CozyOS.OfflineGenerationProvider;
}

test('A: registers under window.CozyOS without throwing, even with no window.fetch/WebAssembly (plain Node-like environment)', () => {
    const provider = freshProvider();
    assert.ok(provider);
    assert.equal(typeof provider.generate, 'function');
    assert.equal(typeof provider.isEnvironmentCapable, 'function');
});

test('B: isEnvironmentCapable() honestly reports false with no window.fetch/WebAssembly', () => {
    const provider = freshProvider();
    assert.equal(provider.isEnvironmentCapable(), false);
});

test('C: generate() never throws in a non-browser environment - returns a real, disclosed NO_BROWSER_WASM_ENVIRONMENT failure', async () => {
    const provider = freshProvider();
    const result = await provider.generate({ messages: [{ role: 'user', content: 'hi' }] });
    assert.deepEqual(result, { available: false, success: false, reason: 'NO_BROWSER_WASM_ENVIRONMENT' });
});

test('D: generate() with no messages is a real, disclosed NO_PROMPT_MESSAGES failure even in a capable environment', async () => {
    delete require.cache[require.resolve(PROVIDER_PATH)];
    global.window = { CozyOS: {}, fetch: () => {} };
    global.WebAssembly = {};
    require(PROVIDER_PATH);
    const provider = global.window.CozyOS.OfflineGenerationProvider;
    assert.equal(provider.isEnvironmentCapable(), true);
    const result = await provider.generate({ messages: [] });
    assert.deepEqual(result, { available: true, success: false, reason: 'NO_PROMPT_MESSAGES' });
});

test('E: MODEL_URL\'s filename matches fetch-offline-model.js\'s MODEL.fileName exactly - the two constants must never silently drift', () => {
    const provider = freshProvider();
    const { MODEL } = require(FETCH_SCRIPT_PATH);
    const urlFileName = provider.MODEL_URL.split('/').pop();
    assert.equal(urlFileName, MODEL.fileName, `offline-generation-provider.js's MODEL_URL ("${provider.MODEL_URL}") must end with fetch-offline-model.js's real MODEL.fileName ("${MODEL.fileName}")`);
});
