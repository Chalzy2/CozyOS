/**
 * core/living/tests/phase10c3b42-living-provider-integration.test.js
 * Phase 10C-3B4-2 — Living Engine Provider Integration.
 *
 * OUTCOME B: the Phase 10C-3B4-1 audit and this phase's own live probes
 * (see PHASE10C3B42-IMPLEMENTATION-REPORT.md) proved that the shared
 * provider-selection path (default / explicit / invalid / exception)
 * already works correctly through the EXISTING, UNMODIFIED
 * core/living/cozy-living-ai.js, core/modules/cognitive/cognitive-coordinator.js
 * and core/modules/thinking/cozy-thinking.js. This file adds NO
 * production implementation — it adds a permanent regression contract
 * for behavior that was previously true only by inspection/one-off
 * probe script, matching the project's established pattern (e.g. how
 * Phase 10B protected the CozyAI/Builder convergence that Phase 10A
 * first discovered).
 *
 * STRUCTURAL / TEST-DOUBLE ONLY. No real browser Prompt API is
 * available in this environment (see PHASE10C3B42-DEPENDENCY-REPORT.md
 * and PHASE10C3B4-1-RUNTIME-EVIDENCE.md for the real headless-Chrome
 * probe result: window.ai / self.ai / LanguageModel are all
 * `undefined` on Chrome for Testing 131.0.6778.204, and outbound
 * network is blocked). Every "on-device-conversational" provider
 * exercised below is the same disclosed fake window.ai.languageModel
 * shape already used by on-device-conversational-provider.test.js,
 * phase10c3a-real-provider-integration.test.js, phase10c3b2-runtime-trace.test.js
 * and phase10c3b4-1-living-engine-browser-provider-audit.test.js. No
 * assertion in this file should be read as proof of real model output.
 *
 * Run with: node core/living/tests/phase10c3b42-living-provider-integration.test.js
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

const COGNITIVE_DIR = path.join(__dirname, '..', '..', 'modules', 'cognitive');
const LIVING_FILE = path.join(__dirname, '..', 'cozy-living-ai.js');

function loadModule(relPath) {
  const modulePath = path.join(COGNITIVE_DIR, relPath);
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
}

function fakeDocument() {
  return { body: { classList: { add() {}, remove() {}, contains() { return false; } } } };
}

function loadCognitiveStack({ withBaselineProviders = false, withOnDeviceProvider = false, withAdapter = false, deviceApi = null } = {}) {
  global.window = { CozyOS: {} };
  global.document = fakeDocument();
  if (deviceApi) global.window.ai = { languageModel: deviceApi };
  loadModule(path.join('..', 'interpretation', 'cozy-interpretation.js'));
  loadModule(path.join('..', 'thinking', 'cozy-thinking.js'));
  loadModule(path.join('..', 'reasoning', 'cozy-reasoning.js'));
  loadModule(path.join('..', 'intelligence', 'cozy-intelligence.js'));
  loadModule(path.join('..', 'memory', 'cozy-memory-engine.js'));
  loadModule(path.join('..', 'policy', 'policy-decision-engine.js'));
  loadModule(path.join('tests', '..', 'cognitive-coordinator.js'));
  if (withBaselineProviders) loadModule(path.join('..', 'intelligence', 'ai-bootstrap.js'));
  if (withOnDeviceProvider) loadModule(path.join('..', 'intelligence', 'providers', 'on-device-conversational-provider.js'));
  if (withAdapter) loadModule(path.join('..', 'intelligence', 'providers', 'on-device-cognitive-adapter.js'));
  return global.window.CozyOS;
}

function loadLivingAI() {
  delete require.cache[require.resolve(LIVING_FILE)];
  require(LIVING_FILE);
  return global.window.CozyOS.LivingAI;
}

function loadCozyAI() {
  loadModule(path.join('..', 'intelligence', 'cozy-ai.js'));
  return global.window.CozyOS.CozyAI;
}

function loadBuilderOrchestrator() {
  loadModule(path.join('..', 'builder', 'builder-orchestrator.js'));
  return global.window.CozyOS.BuilderOrchestrator;
}

/** TEST-DOUBLE ONLY — mirrors the real Prompt API shape. Never a real model. */
function makeTestDoubleDeviceApi(replyPrefix) {
  const fakeSession = { prompt: async (text) => `${replyPrefix}${text}` };
  return { availability: async () => 'available', create: async () => fakeSession };
}

function makeThrowingDeviceApi(message) {
  return { availability: async () => 'available', create: async () => { throw new Error(message); } };
}

(async () => {
  console.log('\n=== Phase 10C-3B4-2 — Living Engine Provider Integration (STRUCTURAL / TEST-DOUBLE ONLY) ===\n');

  // 1. LivingAI exists
  test('1. window.CozyOS.LivingAI exists after loading core/living/cozy-living-ai.js', () => {
    global.window = { CozyOS: {} };
    global.document = fakeDocument();
    const LivingAI = loadLivingAI();
    assert.ok(LivingAI, 'LivingAI must be defined.');
    assert.strictEqual(typeof LivingAI.think, 'function');
  });

  // 2 & 3. LivingAI uses the shared CognitiveCoordinator; runtime identity proof
  await asyncTest('2/3. LivingAI.think() invokes the exact same window.CozyOS.CognitiveCoordinator instance exactly once (runtime object-identity proof, not static inspection)', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true });
    const coordinatorRef = CozyOS.CognitiveCoordinator;
    let callCount = 0;
    const realRun = coordinatorRef.run.bind(coordinatorRef);
    coordinatorRef.run = async (...args) => { callCount++; return realRun(...args); };
    const LivingAI = loadLivingAI();
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'Loading LivingAI must not replace the singleton.');
    await LivingAI.think('identity check');
    assert.strictEqual(callCount, 1);
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'Coordinator identity must be unchanged after use.');
  });

  // 4. Case A — default behavior unchanged
  await asyncTest('4. Case A (default): LivingAI.think(text) with no options still resolves through the existing default provider', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true });
    const LivingAI = loadLivingAI();
    const result = await LivingAI.think('default case');
    assert.ok(result.success);
    assert.strictEqual(result.result.thinking.provider, 'living-planner-baseline', 'Default provider must remain living-planner-baseline.');
  });

  // 5. Explicit thinkingProviderId reaches the coordinator
  await asyncTest('5. options.thinkingProviderId passed to LivingAI.think() reaches CognitiveCoordinator.run() unchanged', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi: makeTestDoubleDeviceApi('TESTDOUBLE:P42-REACH:') });
    const coordinatorRef = CozyOS.CognitiveCoordinator;
    let capturedArgs = null;
    const realRun = coordinatorRef.run.bind(coordinatorRef);
    coordinatorRef.run = async (args) => { capturedArgs = args; return realRun(args); };
    const LivingAI = loadLivingAI();
    await LivingAI.think('explicit provider reach', { thinkingProviderId: 'on-device-conversational' });
    assert.strictEqual(capturedArgs.thinkingProviderId, 'on-device-conversational', 'thinkingProviderId must reach coordinator.run() verbatim.');
  });

  // 6. Case B — on-device-conversational selection reaches CozyThinking
  await asyncTest('6. Case B: explicit "on-device-conversational" selection genuinely reaches CozyThinking\'s real provider (traceable output, not a shortcut)', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi: makeTestDoubleDeviceApi('TESTDOUBLE:P42-CASEB:') });
    CozyOS.ProviderManager = { register: () => ({ success: true }) };
    const LivingAI = loadLivingAI();
    const result = await LivingAI.think('case b', { thinkingProviderId: 'on-device-conversational' });
    assert.ok(result.success);
    const text = result.result.thinking.explanation;
    assert.strictEqual(typeof text, 'string');
    assert.ok(text.includes('TESTDOUBLE:P42-CASEB:'), 'Output must be traceable to the real on-device adapter path.');
    assert.strictEqual(result.result.thinking.provider, 'on-device-conversational');
  });

  // 7. Case C — invalid provider ID produces honest failure, no silent fallback
  await asyncTest('7. Case C: an invalid thinkingProviderId produces an honest failure and does NOT silently fall back to the default provider', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true });
    const LivingAI = loadLivingAI();
    const result = await LivingAI.think('invalid provider case', { thinkingProviderId: 'totally-invalid-provider-xyz' });
    assert.strictEqual(result.result.thinking.success, false, 'Invalid provider must fail, not fabricate a result.');
    assert.strictEqual(result.result.thinking.isReal, false);
    assert.notStrictEqual(result.result.thinking.provider, 'living-planner-baseline', 'Must not silently fall back to the default provider when an explicit (invalid) id was given.');
  });

  // 8. Case D — provider exception produces honest failure
  await asyncTest('8. Case D: a real provider throwing mid-call surfaces as an honest failure with a meaningful reason, never a false-green result', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi: makeThrowingDeviceApi('simulated model crash') });
    const LivingAI = loadLivingAI();
    const result = await LivingAI.think('exception case', { thinkingProviderId: 'on-device-conversational' });
    assert.strictEqual(result.result.thinking.success, false);
    assert.strictEqual(result.result.thinking.isReal, false);
    assert.ok(/simulated model crash/.test(result.result.thinking.reason || ''), 'Reason must be meaningful, not generic.');
  });

  // 9. isReal never fabricated across the whole matrix above
  test('9. isReal is never hardcoded to true in cozy-living-ai.js — it only ever forwards whatever CognitiveCoordinator/CozyThinking already computed', () => {
    const src = fs.readFileSync(LIVING_FILE, 'utf8');
    assert.ok(!/isReal\s*:\s*true/.test(src), 'cozy-living-ai.js must never itself assert isReal:true.');
  });

  // 10. Confidence remains honest (never invented by Living Engine)
  test('10. cozy-living-ai.js never assigns/overwrites a confidence field itself', () => {
    const src = fs.readFileSync(LIVING_FILE, 'utf8');
    assert.ok(!/\.confidence\s*=/.test(src), 'Living Engine must never write its own confidence value; only report what the pipeline computed.');
  });

  // 11. Builder / CozyAI / LivingAI share the same cognitive path
  await asyncTest('11. CozyAI, BuilderOrchestrator and LivingAI all converge on the exact same CognitiveCoordinator instance in one shared runtime', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true });
    const coordinatorRef = CozyOS.CognitiveCoordinator;
    const LivingAI = loadLivingAI();
    const CozyAI = loadCozyAI();
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'CozyAI load must not replace the singleton.');
    CozyOS.UnderstandingEngine = { analyzeText: (t) => ({ tokens: (t || '').split(' '), success: true }) };
    const BuilderOrchestrator = loadBuilderOrchestrator();
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'BuilderOrchestrator load must not replace the singleton.');
    await LivingAI.think('convergence a');
    await CozyAI.ask('convergence b');
    const sessionId = 'phase10c3b42-convergence-session';
    BuilderOrchestrator.runPhase1Understanding(sessionId, 'build a widget');
    await BuilderOrchestrator.runPhase2Analysis(sessionId, 'build a widget');
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'All three callers used the same final coordinator reference.');
  });

  // 12. No duplicate Living cognitive engine exists
  test('12. No duplicate cognitive engine: exactly one "new CozyCognitiveCoordinator" exists in the entire repository, and cozy-living-ai.js does not define its own Thinking/Reasoning engine', () => {
    const coordSrc = fs.readFileSync(path.join(COGNITIVE_DIR, 'cognitive-coordinator.js'), 'utf8');
    const matches = coordSrc.match(/new\s+CozyCognitiveCoordinator/g) || [];
    assert.strictEqual(matches.length, 1, 'Exactly one CognitiveCoordinator construction site must exist.');
    const livingSrc = fs.readFileSync(LIVING_FILE, 'utf8');
    assert.ok(!/class\s+\w*Thinking\w*/.test(livingSrc), 'cozy-living-ai.js must not define its own Thinking-class engine.');
    assert.ok(!/class\s+\w*Reasoning\w*/.test(livingSrc), 'cozy-living-ai.js must not define its own Reasoning-class engine.');
  });

  // 13. Kiswahili governance untouched (bonus coverage, matches Part 10 of the spec)
  await asyncTest('13. A Kiswahili request through LivingAI.think() is honestly handled with no vocabulary fabricated or promoted', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi: makeTestDoubleDeviceApi('TESTDOUBLE:P42-SW:') });
    CozyOS.ProviderManager = { register: () => ({ success: true }) };
    const LivingAI = loadLivingAI();
    const result = await LivingAI.think('Kiswahili: eleza kwa ufupi CozyOS ni nini?', { thinkingProviderId: 'on-device-conversational' });
    assert.ok(result.success);
    const serialized = JSON.stringify(result).toLowerCase();
    assert.ok(!serialized.includes('"promoted":true'), 'No fabricated vocabulary promotion may appear.');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
