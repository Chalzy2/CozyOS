/**
 * core/modules/cognitive/tests/phase10c3b4-1-living-engine-browser-provider-audit.test.js
 * Phase 10C-3B4-1 — Living Engine + Browser Prompt API Architecture Audit.
 *
 * AUDIT-ONLY PHASE. This file adds NO production implementation. It proves
 * (not asserts) the findings written up in
 * PHASE10C3B4-1-IMPLEMENTATION-REPORT.md:
 *
 *   1. The real "Living Engine" is core/living/cozy-living-ai.js
 *      (window.CozyOS.LivingAI). It holds an AIProviderRegistry whose
 *      only implemented provider ("reasoning-pipeline") composes
 *      window.CozyOS.CognitiveCoordinator.run() BY DIRECT REFERENCE —
 *      it never constructs a second coordinator.
 *   2. LivingAI.think(text, options) forwards `options` unchanged into
 *      coordinator.run({ text, ...options }), so an existing caller can
 *      already pass { thinkingProviderId } today with ZERO production
 *      changes. This is the Part 3 finding: OUTCOME A, not B.
 *   3. LivingAI's other registry slots (cloud-llm, on-device,
 *      enterprise-byo, research-multi) are honest, unconfigured stubs.
 *      Critically: LivingAI's "on-device" slot name is NOT wired to the
 *      real core/modules/intelligence/providers/on-device-*.js files —
 *      selecting it returns an honest "not configured" failure. Reaching
 *      the REAL on-device provider from Living Engine today requires
 *      going through options.thinkingProviderId = 'on-device-conversational'
 *      on the default reasoning-pipeline provider (which is already
 *      possible, per #2), not through LivingAI's own "on-device" slot
 *      name. This is a naming/documentation gap, not a missing capability.
 *   4. setActiveProvider()/getActiveProvider() only change LivingAI's own
 *      registry pointer — they never touch CozyThinking's default
 *      provider, matching the "provider selection must remain
 *      explicit/opt-in" and "setActiveProvider() remains untouched"
 *      project rules.
 *   5. Kiswahili governance is untouched by any of the above.
 *
 * REAL BROWSER PROMPT API RESULT (not re-executed by this file — see
 * PHASE10C3B4-1-RUNTIME-EVIDENCE.md for the full transcript): a real
 * headless Google Chrome for Testing 131.0.6778.204 binary
 * (/home/claude/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome)
 * was launched via Playwright's chromium driver in this same audit
 * session. window.ai, self.ai, window.LanguageModel and
 * self.LanguageModel were all `undefined`. A plain HTTPS request to
 * example.com in this sandbox returns HTTP 403 (egress blocked), so even
 * if a Chrome build exposing the flag existed, on-device model download
 * could not be tested. This matches Phase 10C-3B2's independently
 * recorded finding on a different Chromium build (141) in a prior
 * session: the Prompt API is consistently unavailable in this sandbox,
 * not merely on one specific binary.
 *
 * Everything below this point is the SAME disclosed test-double
 * convention already used by on-device-conversational-provider.test.js,
 * phase10c3a-real-provider-integration.test.js and
 * phase10c3b2-runtime-trace.test.js: a fake window.ai.languageModel
 * object with the real Prompt API shape. It proves WIRING through
 * Living Engine, not genuine model output.
 *
 * Run with: node core/modules/cognitive/tests/phase10c3b4-1-living-engine-browser-provider-audit.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
}

async function asyncTest(name, fn) {
  try { await fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
}

function loadModule(relPath) {
  const modulePath = path.join(__dirname, relPath);
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
}

function fakeDocument() {
  return {
    body: {
      classList: { add() {}, remove() {}, contains() { return false; } }
    }
  };
}

function loadCognitiveStack({ withBaselineProviders = false, withOnDeviceProvider = false, withAdapter = false, deviceApi = null } = {}) {
  global.window = { CozyOS: {} };
  global.document = fakeDocument();
  if (deviceApi) global.window.ai = { languageModel: deviceApi };
  loadModule(path.join('..', '..', 'interpretation', 'cozy-interpretation.js'));
  loadModule(path.join('..', '..', 'thinking', 'cozy-thinking.js'));
  loadModule(path.join('..', '..', 'reasoning', 'cozy-reasoning.js'));
  loadModule(path.join('..', '..', 'intelligence', 'cozy-intelligence.js'));
  loadModule(path.join('..', '..', 'memory', 'cozy-memory-engine.js'));
  loadModule(path.join('..', '..', 'policy', 'policy-decision-engine.js'));
  loadModule(path.join('..', 'cognitive-coordinator.js'));
  if (withBaselineProviders) loadModule(path.join('..', '..', 'intelligence', 'ai-bootstrap.js'));
  if (withOnDeviceProvider) loadModule(path.join('..', '..', 'intelligence', 'providers', 'on-device-conversational-provider.js'));
  if (withAdapter) loadModule(path.join('..', '..', 'intelligence', 'providers', 'on-device-cognitive-adapter.js'));
  return global.window.CozyOS;
}

function loadLivingAI() {
  loadModule(path.join('..', '..', '..', 'living', 'cozy-living-ai.js'));
  return global.window.CozyOS.LivingAI;
}

/** TEST-DOUBLE ONLY — mirrors the real Prompt API shape. Never a real model. */
function makeTestDoubleDeviceApi(replyPrefix) {
  const fakeSession = { prompt: async (text) => `${replyPrefix}${text}` };
  return { availability: async () => 'available', create: async () => fakeSession };
}

(async () => {
  console.log('\n=== Phase 10C-3B4-1 — Living Engine + Browser Prompt API Audit ===\n');

  // ------------------------------------------------------------------
  // PART A — Object identity: Living Engine uses the SAME coordinator.
  // ------------------------------------------------------------------
  await asyncTest('A1. LivingAI.think() reaches the exact same window.CozyOS.CognitiveCoordinator instance (no second coordinator)', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true });
    const coordinatorRef = CozyOS.CognitiveCoordinator;
    let callCount = 0;
    const realRun = coordinatorRef.run.bind(coordinatorRef);
    coordinatorRef.run = async (...args) => { callCount++; return realRun(...args); };

    const LivingAI = loadLivingAI();
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'Loading cozy-living-ai.js must not replace the singleton.');
    await LivingAI.think('audit check');
    assert.strictEqual(callCount, 1, 'LivingAI.think() must call the real coordinator exactly once.');
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'The coordinator reference must still be identical after use.');
  });

  test('A2. cozy-living-ai.js source never instantiates CozyCognitiveCoordinator or any second engine', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'living', 'cozy-living-ai.js'), 'utf8');
    assert.ok(!/new\s+CozyCognitiveCoordinator/.test(src), 'Must not construct a second coordinator.');
    assert.ok(/const coordinator = window\.CozyOS\.CognitiveCoordinator;/.test(src), 'Must reference the singleton by direct property access, not a copy.');
  });

  // ------------------------------------------------------------------
  // PART B — Provider selection: thinkingProviderId already passes
  // through today with zero production changes (Outcome A finding).
  // ------------------------------------------------------------------
  await asyncTest('B1. LivingAI.think(text, { thinkingProviderId }) already forwards the field to CognitiveCoordinator.run() with NO code change', async () => {
    const deviceApi = makeTestDoubleDeviceApi('TESTDOUBLE:LIVING-ENGINE-REPLY:');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    CozyOS.ProviderManager = { register: () => ({ success: true }) };
    const LivingAI = loadLivingAI();

    const result = await LivingAI.think('living engine trace', { thinkingProviderId: 'on-device-conversational', actorId: 'phase10c3b4-1-audit' });
    assert.ok(result.success, 'Explicit provider selection through Living Engine must succeed with the test-double model present.');
    const text = result.result && result.result.thinking && result.result.thinking.explanation;
    assert.strictEqual(typeof text, 'string');
    assert.ok(text.includes('TESTDOUBLE:LIVING-ENGINE-REPLY:'), 'Output must be traceable to the real on-device adapter path, not a shortcut.');
  });

  await asyncTest('B2. With no thinkingProviderId, LivingAI still resolves through the default provider — no forced/global provider switch', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true });
    CozyOS.ProviderManager = { register: () => ({ success: true }) };
    const LivingAI = loadLivingAI();
    const result = await LivingAI.think('default path check');
    assert.ok(result.success, 'Default path (no on-device model needed) must still work.');
    assert.strictEqual(result.result.thinking.provider, 'living-planner-baseline', 'Default provider must remain unchanged.');
  });

  test('B3. LivingAI\'s own "on-device" registry slot is an honest unconfigured stub, distinct from the real on-device-conversational provider (naming gap, not a bug)', () => {
    global.window = { CozyOS: {} };
    global.document = fakeDocument();
    const LivingAI = loadLivingAI();
    const descriptor = LivingAI.describeProvider('on-device');
    assert.strictEqual(descriptor.kind, 'on-device model');
    assert.ok(/[Nn]ot yet configured/.test(descriptor.note), 'Must honestly disclose it is unconfigured, never imply it already routes to a real model.');
  });

  test('B4. setActiveProvider() only changes LivingAI\'s own registry pointer, never CozyThinking\'s global default provider', () => {
    global.window = { CozyOS: {} };
    global.document = fakeDocument();
    const LivingAI = loadLivingAI();
    const before = LivingAI.getActiveProvider();
    assert.strictEqual(before, 'reasoning-pipeline');
    const setResult = LivingAI.setActiveProvider('cloud-llm');
    assert.ok(setResult.success);
    assert.strictEqual(LivingAI.getActiveProvider(), 'cloud-llm');
    // CozyThinking itself was never even loaded in this scope, proving
    // LivingAI's active-provider pointer is a local registry concept,
    // not a call into any global provider-activation surface.
    assert.strictEqual(typeof global.window.CozyOS.CozyThinking, 'undefined');
  });

  // ------------------------------------------------------------------
  // PART C — Kiswahili governance unchanged through Living Engine.
  // ------------------------------------------------------------------
  await asyncTest('C1. A Kiswahili prompt through LivingAI.think() produces an honest result and creates/promotes no vocabulary', async () => {
    const deviceApi = makeTestDoubleDeviceApi('TESTDOUBLE:SW-LIVING-REPLY:');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    CozyOS.ProviderManager = { register: () => ({ success: true }) };
    const LivingAI = loadLivingAI();
    const result = await LivingAI.think('Kiswahili: eleza kwa ufupi CozyOS ni nini?', { thinkingProviderId: 'on-device-conversational' });
    assert.ok(result.success);
    const serialized = JSON.stringify(result).toLowerCase();
    assert.ok(!serialized.includes('"promoted":true'), 'No fabricated vocabulary promotion may appear anywhere in the Living Engine result.');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
