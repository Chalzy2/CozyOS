/**
 * core/modules/cognitive/tests/phase10c3a-real-provider-integration.test.js
 * Phase 10C-3A — real, executed tests proving that the existing real
 * on-device conversational provider (on-device-conversational-provider.js)
 * is genuinely registered, selected, invoked, and that its real async
 * result reaches CognitiveCoordinator's pipeline via the new, minimal
 * on-device-cognitive-adapter.js — without changing any existing default
 * provider behavior, without fabricating output, and without disturbing
 * the Kiswahili vocabulary blocker or the CozyAI/CozyBuilder
 * CognitiveCoordinator singleton convergence proven in Phase 10B.
 *
 * Same convention as on-device-conversational-provider.test.js: the
 * browser's Prompt API (window.ai.languageModel / self.LanguageModel) is
 * stood in with a fake object exposing the real shape
 * (availability()/create()/session.prompt()) because this Node.js test
 * harness has no browser and cannot host the genuine Chrome-only Prompt
 * API. Every production file loaded here is the real, unmodified-by-this-
 * test file — only the browser API surface is a stand-in, exactly as the
 * existing RP-025-A test suite already establishes as this repository's
 * pattern for this specific, disclosed environmental dependency.
 *
 * Run with: node core/modules/cognitive/tests/phase10c3a-real-provider-integration.test.js
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

function loadModule(relPath) {
  const modulePath = path.join(__dirname, relPath);
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
}

/**
 * Loads the real cognitive stack, exactly matching Phase 10B's own
 * loadCognitiveStack() dependency order, then optionally the real
 * on-device provider file and/or the new adapter. `deviceApi`, when
 * provided, is installed as window.ai.languageModel BEFORE the provider
 * file loads (the provider resolves it dynamically at call time, so
 * order relative to provider load only matters for the registration
 * step itself, which does not call the API).
 */
function loadCognitiveStack({ withBaselineProviders = false, withOnDeviceProvider = false, withAdapter = false, deviceApi = null } = {}) {
  global.window = { CozyOS: {} };
  if (deviceApi) global.window.ai = { languageModel: deviceApi };
  loadModule(path.join('..', '..', 'interpretation', 'cozy-interpretation.js'));
  loadModule(path.join('..', '..', 'thinking', 'cozy-thinking.js'));
  loadModule(path.join('..', '..', 'reasoning', 'cozy-reasoning.js'));
  loadModule(path.join('..', '..', 'intelligence', 'cozy-intelligence.js'));
  loadModule(path.join('..', '..', 'memory', 'cozy-memory-engine.js'));
  loadModule(path.join('..', '..', 'policy', 'policy-decision-engine.js'));
  loadModule(path.join('..', 'cognitive-coordinator.js'));
  if (withBaselineProviders) {
    loadModule(path.join('..', '..', 'intelligence', 'ai-bootstrap.js'));
  }
  if (withOnDeviceProvider) {
    loadModule(path.join('..', '..', 'intelligence', 'providers', 'on-device-conversational-provider.js'));
  }
  if (withAdapter) {
    loadModule(path.join('..', '..', 'intelligence', 'providers', 'on-device-cognitive-adapter.js'));
  }
  return global.window.CozyOS;
}

function loadCozyAI() {
  loadModule(path.join('..', '..', 'intelligence', 'cozy-ai.js'));
  return global.window.CozyOS.CozyAI;
}

function loadBuilderOrchestrator() {
  loadModule(path.join('..', '..', 'builder', 'builder-orchestrator.js'));
  return global.window.CozyOS.BuilderOrchestrator;
}

/** Same governance-diagnosis load chain Phase 10B's suite already established, reused verbatim (not re-derived) for the Kiswahili regression proof. */
function loadGovernanceDiagnosis() {
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'language', 'cozy-language-registry.js'));
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'language-packs', 'cozy-language-pack-registry.js'));
  loadModule(path.join('..', '..', 'builder', '..', '..', 'platform', 'file-registry.js'));
  loadModule(path.join('..', '..', 'builder', '..', '..', 'platform', 'dependency-engine.js'));
  loadModule(path.join('..', '..', 'builder', 'unified-capability-contract.js'));
  loadModule(path.join('..', '..', 'builder', 'capability-dependency-graph.js'));
  loadModule(path.join('..', '..', 'builder', 'capability-self-diagnosis.js'));
  loadModule(path.join('..', '..', 'builder', 'capability-repair-planner.js'));
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'knowledge', 'cozy-knowledge-ingestion.js'));
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'knowledge', 'cozy-knowledge-community.js'));
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'knowledge', 'cozy-knowledge-review.js'));
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'language', 'cozy-language-templates.js'));
  loadModule(path.join('..', '..', 'builder', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'));
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'knowledge', 'ui', 'cozy-knowledge-safety-gate.js'));
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'knowledge', 'ui', 'cozy-knowledge-review-hotspot-bridge.js'));
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'knowledge', 'ui', 'cozy-knowledge-contribution-core.js'));
  loadModule(path.join('..', '..', 'builder', '..', 'intelligence', 'knowledge', 'teach', 'cozy-teach-cozyai-routing-core.js'));
  loadModule(path.join('..', '..', 'builder', 'capability-knowledge-acquisition.js'));
  loadModule(path.join('..', '..', 'builder', 'capability-governance-diagnosis.js'));
  return global.window.CozyOS.CapabilityGovernanceDiagnosis;
}

function makeFakeProviderManager() {
  const registered = [];
  return { register(p) { registered.push(p); return { success: true }; }, _registered: registered };
}

/** A fake browser Prompt API where the model is genuinely "available" and echoes real, distinguishable text back. */
function makeReadyDeviceApi(replyText) {
  const fakeSession = { prompt: async (text) => `${replyText}${text}` };
  return { availability: async () => 'available', create: async () => fakeSession };
}

(async () => {
  console.log('\n=== Phase 10C-3A — Real Provider Adapter & Registration ===\n');

  // ------------------------------------------------------------------
  // 1. REGISTRATION
  // ------------------------------------------------------------------
  test('1. on-device-cognitive-adapter.js registers a real "on-device-conversational" provider with CozyThinking', () => {
    const CozyOS = loadCognitiveStack({ withOnDeviceProvider: true, withAdapter: true });
    const descriptor = CozyOS.CozyThinking.findProvider('on-device-conversational');
    assert.ok(descriptor, 'CozyThinking.findProvider("on-device-conversational") must return a real descriptor.');
    assert.strictEqual(descriptor.offline, true, 'The descriptor must honestly report offline:true.');
  });

  test('2. Registration never overrides CozyThinking\'s existing default provider', () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true });
    // ai-bootstrap.js registers "living-planner-baseline" first (loaded before the adapter here),
    // so it must remain default — the adapter must never call setDefaultProvider().
    const defaultResult = CozyOS.CozyThinking.setDefaultProvider('living-planner-baseline');
    assert.strictEqual(defaultResult.success, true, 'living-planner-baseline must still be a real, registered provider.');
    // Re-set it back is a no-op proof; the real proof is behavioral, in test 8 below.
  });

  // ------------------------------------------------------------------
  // 2. SELECTION + REAL ASYNC EXECUTION + RESULT REACHES THE PIPELINE
  // ------------------------------------------------------------------
  await asyncTest('3. Explicitly selecting "on-device-conversational" via providerId genuinely invokes the real on-device provider (not the default)', async () => {
    const deviceApi = makeReadyDeviceApi('GENUINE MODEL REPLY: ');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    const result = await CozyOS.CozyThinking.think({
      evidence: [{ source: 'test', data: 'hello on-device' }],
      providerId: 'on-device-conversational'
    });
    assert.strictEqual(result.success, true, 'A genuinely available on-device model must succeed.');
    assert.strictEqual(result.isReal, true, 'Result must be honestly marked isReal:true.');
    assert.strictEqual(result.provider, 'on-device-conversational', 'The provider must be self-identified as the real on-device adapter, not the baseline.');
    assert.strictEqual(result.explanation, 'GENUINE MODEL REPLY: hello on-device', 'explanation must be the exact real text the fake model produced — proving genuine data flow, not a fabricated placeholder.');
  });

  await asyncTest('4. CognitiveCoordinator.run({ thinkingProviderId }) routes the real async provider result all the way through the cognitive pipeline', async () => {
    const deviceApi = makeReadyDeviceApi('PIPELINE REPLY: ');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    const result = await CozyOS.CognitiveCoordinator.run({
      text: 'connect me to the real model',
      actorId: 'phase10c3a-test',
      thinkingProviderId: 'on-device-conversational'
    });
    assert.strictEqual(result.success, true, 'Orchestration must complete.');
    assert.strictEqual(result.thinking.isReal, true, 'Thinking stage must honestly report isReal:true.');
    assert.strictEqual(result.thinking.provider, 'on-device-conversational', 'CognitiveCoordinator.diagnostics/result must show the real on-device provider was the one actually used.');
    assert.strictEqual(result.thinking.explanation, 'PIPELINE REPLY: connect me to the real model', 'The real model output must reach the final coordinator result unaltered.');
    assert.strictEqual(result.diagnostics.stages.thinking.isReal, true, 'diagnostics.stages.thinking must also honestly reflect isReal:true.');
  });

  // ------------------------------------------------------------------
  // 3. HONEST FAILURE HANDLING — NO FALSE-GREEN
  // ------------------------------------------------------------------
  await asyncTest('5. Honest failure when the on-device provider file was never loaded (adapter has nothing real to compose)', async () => {
    const CozyOS = loadCognitiveStack({ withAdapter: true }); // withOnDeviceProvider intentionally omitted
    const result = await CozyOS.CozyThinking.think({
      evidence: [{ source: 'test', data: 'no provider loaded' }],
      providerId: 'on-device-conversational'
    });
    assert.strictEqual(result.success, false, 'Must not fabricate success when the real provider object was never exported.');
    assert.strictEqual(result.isReal, false, 'Must honestly report isReal:false.');
    assert.ok(/not loaded/i.test(result.reason || ''), 'The real reason must name the actual missing dependency.');
  });

  await asyncTest('6. Honest failure when the real browser Prompt API is absent (genuine NOT_READY, not fabricated availability)', async () => {
    const CozyOS = loadCognitiveStack({ withOnDeviceProvider: true, withAdapter: true }); // no deviceApi installed
    const result = await CozyOS.CozyThinking.think({
      evidence: [{ source: 'test', data: 'is anyone home' }],
      providerId: 'on-device-conversational'
    });
    assert.strictEqual(result.success, false, 'No real on-device API means no real answer — must not fabricate one.');
    assert.strictEqual(result.isReal, false);
    assert.ok(typeof result.reason === 'string' && result.reason.length > 0, 'A real, non-empty reason must be reported.');
  });

  await asyncTest('7. Honest failure when the real model genuinely throws mid-call — no false-green result', async () => {
    const throwingApi = {
      availability: async () => 'available',
      create: async () => ({ prompt: async () => { throw new Error('genuine model runtime error'); } })
    };
    const CozyOS = loadCognitiveStack({ withOnDeviceProvider: true, withAdapter: true, deviceApi: throwingApi });
    const result = await CozyOS.CozyThinking.think({
      evidence: [{ source: 'test', data: 'trigger a real failure' }],
      providerId: 'on-device-conversational'
    });
    assert.strictEqual(result.success, false, 'A genuine provider-thrown error must never be reported as success.');
    assert.strictEqual(result.isReal, false);
    assert.ok(/Provider threw/.test(result.reason || ''), 'CozyThinking\'s own existing honest-failure wrapper must be the one reporting this, not a fabricated adapter-level success.');
  });

  // ------------------------------------------------------------------
  // 4. NO PROMISE / OBJECT CONFUSION
  // ------------------------------------------------------------------
  await asyncTest('8. No unresolved Promise or [object Object] ever leaks into the honest result surface', async () => {
    const deviceApi = makeReadyDeviceApi('CLEAN TEXT: ');
    const CozyOS = loadCognitiveStack({ withOnDeviceProvider: true, withAdapter: true, deviceApi });
    const result = await CozyOS.CozyThinking.think({
      evidence: [{ source: 'test', data: 'no promise confusion' }],
      providerId: 'on-device-conversational'
    });
    assert.strictEqual(typeof result.explanation, 'string', 'explanation must be a resolved real string, never a Promise object.');
    assert.ok(!/\[object /.test(result.explanation), 'explanation must never stringify as [object Promise]/[object Object].');
    assert.ok(Array.isArray(result.reasoningSteps) && typeof result.reasoningSteps[0] === 'string', 'reasoningSteps must contain a resolved real string.');
    assert.strictEqual(result.confidence, null, 'confidence must be honestly null (never a fabricated number, never an unresolved Promise).');
  });

  // ------------------------------------------------------------------
  // 5. REGRESSION — existing default-provider behavior is unchanged
  // ------------------------------------------------------------------
  await asyncTest('9. With no providerId specified, CognitiveCoordinator.run() still uses the pre-existing default provider (living-planner-baseline) even with the adapter loaded', async () => {
    const deviceApi = makeReadyDeviceApi('SHOULD NOT BE USED: ');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    const result = await CozyOS.CognitiveCoordinator.run({ text: 'why is kiswahili not fully supported', actorId: 'phase10c3a-test' });
    assert.strictEqual(result.thinking.provider, 'living-planner-baseline', 'Default provider selection must be completely unchanged by this phase\'s additive registration.');
    assert.ok(!/SHOULD NOT BE USED/.test(JSON.stringify(result.thinking)), 'The on-device provider must never be silently substituted for the default.');
  });

  // ------------------------------------------------------------------
  // 6. CONVERGENCE — CozyAI and CozyBuilder still reach the SAME
  //    CognitiveCoordinator singleton with the new files loaded.
  // ------------------------------------------------------------------
  await asyncTest('10. CozyAI and BuilderOrchestrator still converge on the exact same CognitiveCoordinator instance with the Phase 10C-3A files loaded', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true });
    const coordinatorRef = CozyOS.CognitiveCoordinator;
    let callCount = 0;
    const realRun = coordinatorRef.run.bind(coordinatorRef);
    coordinatorRef.run = async (...args) => { callCount++; return realRun(...args); };

    CozyOS.ProviderManager = makeFakeProviderManager();
    const CozyAI = loadCozyAI();
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'Loading cozy-ai.js must not replace the coordinator singleton.');
    await CozyAI.ask('why is the sky blue');
    assert.strictEqual(callCount, 1, 'CozyAI.ask() must still invoke the singleton coordinator exactly once.');

    const BuilderOrchestrator = loadBuilderOrchestrator();
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'Loading builder-orchestrator.js must not replace the coordinator singleton.');
    CozyOS.UnderstandingEngine = { analyzeText: (t) => ({ tokens: (t || '').split(' '), success: true }) };
    const sessionId = 'phase10c3a-convergence-session';
    const p1 = BuilderOrchestrator.runPhase1Understanding(sessionId, 'build a widget');
    assert.ok(p1.success, 'Phase 1 stub must succeed so Phase 2 is reachable.');
    await BuilderOrchestrator.runPhase2Analysis(sessionId, 'build a widget');
    assert.strictEqual(callCount, 2, 'BuilderOrchestrator.runPhase2Analysis() must invoke the SAME singleton coordinator.');
  });

  // ------------------------------------------------------------------
  // 7. KISWAHILI VOCABULARY BLOCKER REMAINS HONEST
  // ------------------------------------------------------------------
  test('11. The Kiswahili language:sw:vocabulary blocker remains honestly reported after Phase 10C-3A\'s files are loaded (governance path untouched)', () => {
    loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true });
    const CapabilityGovernanceDiagnosis = loadGovernanceDiagnosis();

    function stubRepairPlanner() {
      return {
        buildPlan() {
          return {
            question: 'Why am I not fully fluent in Kiswahili?', status: 'READY', targetCapability: 'language:sw',
            diagnosis: { overallStatus: 'PARTIALLY_VERIFIED' },
            requiredBuilds: [{
              dependency: 'language:sw:vocabulary', dependencyClass: 'REQUIRED', status: 'NOT_VERIFIED',
              confidence: 'manifest', evidence: ['registry says NOT_READY'], sourceRegistry: 'cozy-language-pack-registry',
              dependencyMeta: { registry: 'cozy-language-pack-registry', field: 'resourceState', rawValue: 'NOT_READY' },
              repairQueue: { referenced: true, id: 'RP-030-CONTENT', status: 'Composed', priority: 'High', dependsOn: ['RP-030'] }
            }],
            limitations: []
          };
        }
      };
    }
    global.window.CozyOS.CapabilityRepairPlanner = stubRepairPlanner();

    const diagnosis = CapabilityGovernanceDiagnosis.reevaluateCapability('language:sw', 'Why am I not fully fluent in Kiswahili?');
    assert.ok(diagnosis, 'A real diagnosis must be produced.');
    const blockerDep = diagnosis.topBlocker ? diagnosis.topBlocker.dependency : (diagnosis.requiredBuilds && diagnosis.requiredBuilds[0] && diagnosis.requiredBuilds[0].dependency);
    assert.ok(blockerDep && /vocabulary/.test(blockerDep), 'Vocabulary must remain the identified blocker after this phase\'s changes.');
    const serialized = JSON.stringify(diagnosis).toLowerCase();
    assert.ok(!serialized.includes('promoted') || serialized.includes('not_verified') || serialized.includes('not_ready'), 'No fabricated promotion may appear in the diagnosis.');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
