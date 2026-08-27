/**
 * core/modules/intelligence/providers/tests/rule-based-conversational-provider.test.js
 * RP-026 — real, executed tests for
 * core/modules/intelligence/providers/rule-based-conversational-provider.js
 *
 * Runs against a minimal, real global.window stub (this file is a
 * classic <script>, not an ES module, so it is loaded the same way a
 * browser would — via a plain require() against a fake `window` —
 * never a copy of its logic re-implemented in the test), mirroring
 * RP-025-A's own test convention exactly.
 *
 * Run with: node core/modules/intelligence/providers/tests/rule-based-conversational-provider.test.js
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

/**
 * Builds a fresh fake LivingAI that records call ORDER (not just
 * counts) of registerProvider() vs. setActiveProvider(), so activation
 * sequencing (RP-026 item 6/9 — explicit, not a side effect of
 * register) is genuinely verifiable, not assumed.
 */
function makeFakeLivingAI() {
  const registered = new Map();
  const callOrder = [];
  let setActiveCalls = 0;
  let lastActivated = null;
  return {
    registerProvider(name, provider) {
      registered.set(name, provider);
      callOrder.push('registerProvider:' + name);
      return { success: true };
    },
    setActiveProvider(name) {
      setActiveCalls++;
      lastActivated = name;
      callOrder.push('setActiveProvider:' + name);
      return { success: true };
    },
    _registered: registered,
    _callOrder: callOrder,
    _setActiveCallCount: () => setActiveCalls,
    _lastActivated: () => lastActivated
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

/** Builds a fresh fake CognitiveCoordinator — records run() calls, never throws unless configured to. */
function makeFakeCoordinator({ shouldThrow = false, resultShape = null } = {}) {
  const calls = [];
  return {
    async run(args) {
      calls.push(args);
      if (shouldThrow) throw new Error('simulated pipeline failure');
      return resultShape || {
        interpretation: { available: true, isReal: false },
        thinking: { success: true, isReal: false },
        reasoning: { success: true, isReal: false },
        intelligence: { success: true, isReal: true, insights: [{ type: 'summary', text: 'Received 1 real evidence source totaling 5 characters for category "custom".' }], confidence: 0.3 },
        recalledMemories: [],
        policyResult: [],
        diagnostics: { stages: {} }
      };
    },
    _calls: calls
  };
}

/**
 * Loads the real file fresh against the given fake window (no module
 * cache reuse across scenarios). Deliberately leaves global.window
 * pointed at fakeWindow after returning — the module's own functions
 * resolve `window` dynamically, same as a real <script> would.
 */
function loadProviderModule(fakeWindow) {
  const modulePath = path.join(__dirname, '..', 'rule-based-conversational-provider.js');
  delete require.cache[require.resolve(modulePath)];
  global.window = fakeWindow;
  require(modulePath);
  return fakeWindow;
}

(async () => {
// ---------------------------------------------------------------------
// A/B/C — supported intents produce genuine conversational responses
// ---------------------------------------------------------------------

await asyncTest('A: "Hello" produces a genuine, defined .text conversational response', async () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator() } });
  const provider = fakeAI._registered.get('rule-based-conversational');
  const result = await provider.think('Hello');
  assert.strictEqual(result.success, true);
  assert.strictEqual(typeof result.result.text, 'string');
  assert.ok(result.result.text.length > 0);
  assert.ok(/hello/i.test(result.result.text));
});

await asyncTest('B: "Good morning" produces a genuine, morning-specific conversational response', async () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator() } });
  const provider = fakeAI._registered.get('rule-based-conversational');
  const result = await provider.think('Good morning');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.result.intent, 'greeting-morning');
  assert.ok(/good morning/i.test(result.result.text));
});

await asyncTest('C: "Can you help?" produces a genuine help response', async () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator() } });
  const provider = fakeAI._registered.get('rule-based-conversational');
  const result = await provider.think('Can you help?');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.result.intent, 'help');
  assert.ok(result.result.text.length > 0);
});

// ---------------------------------------------------------------------
// D — pipeline diagnostic strings are never returned as chat answers
// ---------------------------------------------------------------------

await asyncTest('D: reply text never contains pipeline evidence/diagnostic strings', async () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator() } });
  const provider = fakeAI._registered.get('rule-based-conversational');
  const result = await provider.think('Hello');
  const text = result.result.text;
  assert.ok(!/real evidence source/i.test(text));
  assert.ok(!/isReal/i.test(text));
  assert.ok(!/characters for category/i.test(text));
  assert.ok(!/insights/i.test(text));
});

// ---------------------------------------------------------------------
// E — unsupported input produces an honest fallback (not the RP-024
// generic string, its own disclosed "not supported yet" text)
// ---------------------------------------------------------------------

await asyncTest('E: unsupported input produces an honest, defined "not supported yet" text', async () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator() } });
  const provider = fakeAI._registered.get('rule-based-conversational');
  const result = await provider.think('What is the weather on Mars going to be like next Tuesday?');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.result.intent, 'unsupported');
  assert.ok(/don't have a rule-based answer/i.test(result.result.text));
});

// ---------------------------------------------------------------------
// F — genuine .text continues to work with RP-024's own selector
// ---------------------------------------------------------------------

await asyncTest('F: resolveConversationalReply() (RP-024, real unmodified file) renders this provider\'s .text', async () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator() } });
  const provider = fakeAI._registered.get('rule-based-conversational');
  const result = await provider.think('Hello');

  const assistantModulePath = path.join(__dirname, '..', '..', '..', '..', 'living', 'cozy-living-assistant.js');
  delete require.cache[require.resolve(assistantModulePath)];
  const { resolveConversationalReply, NO_CONVERSATIONAL_ENGINE_FALLBACK } = require(assistantModulePath);

  const replyText = resolveConversationalReply(result.result) || NO_CONVERSATIONAL_ENGINE_FALLBACK;
  assert.strictEqual(replyText, result.result.text);
  assert.notStrictEqual(replyText, NO_CONVERSATIONAL_ENGINE_FALLBACK);
});

// ---------------------------------------------------------------------
// H — activation is explicit and deliberate, never a side effect of
// registration itself (RP-026 item 6/9)
// ---------------------------------------------------------------------

test('H: registration and activation are two distinct calls, in order (register before activate)', () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator() } });
  assert.ok(fakeAI._registered.has('rule-based-conversational'), 'provider must be registered');
  assert.strictEqual(fakeAI._setActiveCallCount(), 1, 'setActiveProvider must be called exactly once (explicit, not auto)');
  assert.strictEqual(fakeAI._lastActivated(), 'rule-based-conversational');
  const registerIndex = fakeAI._callOrder.indexOf('registerProvider:rule-based-conversational');
  const activateIndex = fakeAI._callOrder.indexOf('setActiveProvider:rule-based-conversational');
  assert.ok(registerIndex >= 0 && activateIndex > registerIndex, 'activation must happen strictly after registration, as a separate step');
});

test('H2: activation is never attempted if registration itself failed', () => {
  const failingAI = {
    registered: new Map(),
    registerProvider() { return { success: false, reason: 'simulated registration failure' }; },
    setActiveCalls: 0,
    setActiveProvider() { this.setActiveCalls++; return { success: true }; }
  };
  loadProviderModule({ CozyOS: { LivingAI: failingAI, CognitiveCoordinator: makeFakeCoordinator() } });
  assert.strictEqual(failingAI.setActiveCalls, 0, 'must never activate a provider whose registration failed');
});

// ---------------------------------------------------------------------
// Composes CognitiveCoordinator for real side effects, but never lets
// a missing/failing coordinator block the honest reply
// ---------------------------------------------------------------------

await asyncTest('CognitiveCoordinator.run() is genuinely called (real Memory/Policy pipeline still executes)', async () => {
  const fakeAI = makeFakeLivingAI();
  const coordinator = makeFakeCoordinator();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: coordinator } });
  const provider = fakeAI._registered.get('rule-based-conversational');
  await provider.think('Hello', { context: 'dashboard' });
  assert.strictEqual(coordinator._calls.length, 1);
  assert.strictEqual(coordinator._calls[0].text, 'Hello');
});

await asyncTest('A missing CognitiveCoordinator never blocks the honest reply', async () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI } }); // no CognitiveCoordinator at all
  const provider = fakeAI._registered.get('rule-based-conversational');
  const result = await provider.think('Hello');
  assert.strictEqual(result.success, true);
  assert.ok(/hello/i.test(result.result.text));
});

await asyncTest('A throwing CognitiveCoordinator never blocks the honest reply', async () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator({ shouldThrow: true }) } });
  const provider = fakeAI._registered.get('rule-based-conversational');
  const result = await provider.think('Thank you');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.result.intent, 'thanks');
  assert.strictEqual(result.result.pipeline, null);
});

// ---------------------------------------------------------------------
// describe() honesty — never claims LLM/neural/ML capability
// ---------------------------------------------------------------------

test('describe() honestly discloses rule-based, non-LLM, offline composition', () => {
  const fakeAI = makeFakeLivingAI();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator() } });
  const provider = fakeAI._registered.get('rule-based-conversational');
  const desc = provider.describe();
  assert.strictEqual(desc.isLLM, false);
  assert.strictEqual(desc.offline, true);
  assert.ok(!/neural|machine learning|cloud intelligence/i.test(desc.note));
});

// ---------------------------------------------------------------------
// ProviderManager integration — optional, mirrors RP-025-A's pattern
// ---------------------------------------------------------------------

test('registers with ProviderManager when present, with an always-ONLINE health (no external dependency)', () => {
  const fakeAI = makeFakeLivingAI();
  const fakePM = makeFakeProviderManager();
  loadProviderModule({ CozyOS: { LivingAI: fakeAI, ProviderManager: fakePM, CognitiveCoordinator: makeFakeCoordinator() } });
  assert.strictEqual(fakePM._registered.length, 1);
  assert.strictEqual(fakePM._registered[0].id, 'rule-based-conversational');
  assert.strictEqual(fakePM._registered[0].getHealth().health, 'ONLINE');
});

test('does not throw when ProviderManager is absent (optional integration)', () => {
  const fakeAI = makeFakeLivingAI();
  assert.doesNotThrow(() => {
    loadProviderModule({ CozyOS: { LivingAI: fakeAI, CognitiveCoordinator: makeFakeCoordinator() } });
  });
});


  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
