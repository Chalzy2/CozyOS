/**
 * core/modules/intelligence/providers/tests/on-device-conversational-provider.test.js
 * RP-025-A — real, executed tests for
 * core/modules/intelligence/providers/on-device-conversational-provider.js
 *
 * Runs against a minimal, real global.window stub (this file is a
 * classic <script>, not an ES module, so it is loaded the same way a
 * browser would — via a plain require() against a fake `window` — never
 * a copy of its logic re-implemented in the test).
 *
 * Run with: node core/modules/intelligence/providers/tests/on-device-conversational-provider.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

/** Builds a fresh fake LivingAI (records registerProvider/setActiveProvider calls, exactly the real registry's public shape). */
function makeFakeLivingAI() {
  const registered = new Map();
  let setActiveCalls = 0;
  return {
    registerProvider(name, provider) { registered.set(name, provider); return { success: true }; },
    setActiveProvider() { setActiveCalls++; return { success: true }; },
    _registered: registered,
    _setActiveCallCount: () => setActiveCalls
  };
}

/** Builds a fresh fake ProviderManager (records register() calls, exactly the real class's public shape). */
function makeFakeProviderManager() {
  const registered = [];
  return {
    register(descriptor) { registered.push(descriptor); return { success: true }; },
    _registered: registered
  };
}

/**
 * Loads the real file fresh against the given fake window (no module
 * cache reuse across scenarios, so each gets its own top-level
 * registration run). Deliberately leaves global.window pointed at
 * fakeWindow after returning: the module's own functions (think(),
 * getStatus(), etc.) resolve the free identifier `window` dynamically
 * at CALL time, same as a real <script> would resolve the browser
 * global — so a scenario's later provider.think() call still needs
 * global.window set to that scenario's fakeWindow, not reset early.
 * Each test sets its own fresh fakeWindow via this function, so there
 * is no cross-test leakage in practice.
 */
function loadProviderModule(fakeWindow) {
  const modulePath = path.join(__dirname, '..', 'on-device-conversational-provider.js');
  delete require.cache[require.resolve(modulePath)];
  global.window = fakeWindow;
  require(modulePath);
}

(async () => {
  console.log('on-device-conversational-provider.test.js');

  // --- Scenario 1: no on-device API in this browser at all ---
  await asyncTest('registers into LivingAI\'s "on-device" slot without activating it', async () => {
    const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), Modules: {} } };
    loadProviderModule(fakeWindow);
    const ai = fakeWindow.CozyOS.LivingAI;
    assert.ok(ai._registered.has('on-device'), 'provider must register under the existing "on-device" slot');
    assert.strictEqual(ai._setActiveCallCount(), 0, 'registration must never call setActiveProvider()');
  });

  await asyncTest('think() honestly reports NOT_READY when no on-device model API exists', async () => {
    const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), Modules: {} } };
    loadProviderModule(fakeWindow);
    const provider = fakeWindow.CozyOS.LivingAI._registered.get('on-device');
    const result = await provider.think('hello');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.state, 'NOT_READY');
    assert.strictEqual(typeof result.reason, 'string');
  });

  await asyncTest('describe() honestly discloses this is an offline on-device provider, never claims ONLINE by default', async () => {
    const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), Modules: {} } };
    loadProviderModule(fakeWindow);
    const provider = fakeWindow.CozyOS.LivingAI._registered.get('on-device');
    const desc = provider.describe();
    assert.strictEqual(desc.kind, 'on-device model');
    assert.strictEqual(desc.offline, true);
  });

  // --- Scenario 2: API present but model not installed yet ---
  await asyncTest('think() reports MODEL_NOT_INSTALLED when the API is present but the model is downloadable', async () => {
    const fakeWindow = {
      CozyOS: { LivingAI: makeFakeLivingAI(), Modules: {} },
      ai: { languageModel: { availability: async () => 'downloadable' } }
    };
    loadProviderModule(fakeWindow);
    const provider = fakeWindow.CozyOS.LivingAI._registered.get('on-device');
    const result = await provider.think('hello');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.state, 'MODEL_NOT_INSTALLED');
  });

  // --- Scenario 3: API present and model genuinely available ---
  await asyncTest('think() returns a real .text field (satisfying resolveConversationalReply()) when the model is actually available', async () => {
    const fakeSession = { prompt: async (text) => `real reply to: ${text}` };
    const fakeWindow = {
      CozyOS: { LivingAI: makeFakeLivingAI(), Modules: {} },
      ai: {
        languageModel: {
          availability: async () => 'available',
          create: async () => fakeSession
        }
      }
    };
    loadProviderModule(fakeWindow);
    const provider = fakeWindow.CozyOS.LivingAI._registered.get('on-device');
    const result = await provider.think('hello');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.result.text, 'real reply to: hello');
  });

  await asyncTest('never fabricates a response when the real model returns an empty string', async () => {
    const fakeSession = { prompt: async () => '   ' };
    const fakeWindow = {
      CozyOS: { LivingAI: makeFakeLivingAI(), Modules: {} },
      ai: { languageModel: { availability: async () => 'available', create: async () => fakeSession } }
    };
    loadProviderModule(fakeWindow);
    const provider = fakeWindow.CozyOS.LivingAI._registered.get('on-device');
    const result = await provider.think('hello');
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.state, 'READY');
  });

  // --- ProviderManager visibility/health integration (optional surface) ---
  await asyncTest('registers a real descriptor with ProviderManager when it is present on the page', async () => {
    const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), ProviderManager: makeFakeProviderManager(), Modules: {} } };
    loadProviderModule(fakeWindow);
    const pm = fakeWindow.CozyOS.ProviderManager;
    assert.strictEqual(pm._registered.length, 1);
    assert.strictEqual(pm._registered[0].id, 'on-device-conversational');
    assert.strictEqual(typeof pm._registered[0].getHealth, 'function');
  });

  test('does not throw when ProviderManager is absent from the page (e.g. index.html today)', () => {
    const fakeWindow = { CozyOS: { LivingAI: makeFakeLivingAI(), Modules: {} } };
    loadProviderModule(fakeWindow); // must not throw
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
