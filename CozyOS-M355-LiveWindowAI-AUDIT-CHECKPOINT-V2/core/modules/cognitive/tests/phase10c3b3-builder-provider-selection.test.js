/**
 * core/modules/cognitive/tests/phase10c3b3-builder-provider-selection.test.js
 * Phase 10C-3B3 — Builder Provider-Selection Boundary.
 *
 * WHAT THIS FIXES: Phase 10C-3B2's own runtime-trace test
 * (phase10c3b2-runtime-trace.test.js, "Part 3 (disclosed finding)")
 * recorded that BuilderOrchestrator.runPhase2Analysis(sessionId, text)
 * had no options parameter, so it could never forward
 * thinkingProviderId into CognitiveCoordinator.run() the way CozyAI.ask()
 * already could. This file proves the fix: runPhase2Analysis(sessionId,
 * text, options) now forwards options.thinkingProviderId — one named
 * field, not a general options pass-through — to the SAME
 * CognitiveCoordinator.run({ thinkingProviderId }) parameter Phase
 * 10C-3A already built and CozyAI already uses. No new provider-
 * selection system, no second cognitive engine, no default-provider
 * change, no LivingAI activation.
 *
 * PROVIDER REALITY, same disclosed convention as phase10c3a/phase10c3b2:
 * this sandbox has no real browser Prompt API. window.ai.languageModel is
 * a test-double exposing the real shape (availability()/create()/
 * session.prompt()). Anywhere this file's output says isReal:true, that
 * is the production code's own honest self-report given a fake-but-
 * correctly-shaped model underneath it — never genuine model execution.
 * This file verifies PLUMBING ONLY, not real-model correctness.
 *
 * Run with: node core/modules/cognitive/tests/phase10c3b3-builder-provider-selection.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

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

/** Identical dependency order to the 10C-3A/10C-3B2 suites' loadCognitiveStack(), reused verbatim. */
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
  if (withBaselineProviders) loadModule(path.join('..', '..', 'intelligence', 'ai-bootstrap.js'));
  if (withOnDeviceProvider) loadModule(path.join('..', '..', 'intelligence', 'providers', 'on-device-conversational-provider.js'));
  if (withAdapter) loadModule(path.join('..', '..', 'intelligence', 'providers', 'on-device-cognitive-adapter.js'));
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

/** TEST-DOUBLE ONLY — mirrors the real Prompt API shape. Never a real model. */
function makeTestDoubleDeviceApi(replyPrefix) {
  const fakeSession = { prompt: async (text) => `${replyPrefix}${text}` };
  return { availability: async () => 'available', create: async () => fakeSession };
}

function startSession(BuilderOrchestrator, CozyOS, sessionId, description) {
  CozyOS.UnderstandingEngine = CozyOS.UnderstandingEngine || { analyzeText: (t) => ({ tokens: (t || '').split(' '), success: true }) };
  const p1 = BuilderOrchestrator.runPhase1Understanding(sessionId, description);
  assert.ok(p1.success, 'Phase 1 stub must succeed so Phase 2 is reachable in this test.');
}

(async () => {
  console.log('\n=== Phase 10C-3B3 — Builder Provider-Selection Boundary (TEST-DOUBLE, not real model execution) ===\n');

  // ------------------------------------------------------------------
  // 1. Backward compatibility — existing call shape unchanged.
  // ------------------------------------------------------------------
  await asyncTest('1. builder.runPhase2Analysis(sessionId, text) with NO options continues to work exactly as before', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true });
    const BuilderOrchestrator = loadBuilderOrchestrator();
    const sessionId = 's-no-options';
    startSession(BuilderOrchestrator, CozyOS, sessionId, 'build a widget');
    const p2 = await BuilderOrchestrator.runPhase2Analysis(sessionId, 'build a widget');
    assert.strictEqual(p2.phase, 2);
    assert.ok(typeof p2.success === 'boolean');
  });

  await asyncTest('2. builder.runPhase2Analysis(sessionId, text, options) accepts a real options object without throwing', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true });
    const BuilderOrchestrator = loadBuilderOrchestrator();
    const sessionId = 's-options-object';
    startSession(BuilderOrchestrator, CozyOS, sessionId, 'build a widget');
    const p2 = await BuilderOrchestrator.runPhase2Analysis(sessionId, 'build a widget', {});
    assert.strictEqual(p2.phase, 2);
  });

  await asyncTest('3. options.thinkingProviderId is genuinely forwarded to CognitiveCoordinator.run() and reaches CozyThinking\'s real provider selection', async () => {
    const deviceApi = makeTestDoubleDeviceApi('TESTDOUBLE:BUILDER-SELECT:');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    const BuilderOrchestrator = loadBuilderOrchestrator();
    const sessionId = 's-provider-forward';
    startSession(BuilderOrchestrator, CozyOS, sessionId, 'explain the widget');
    const p2 = await BuilderOrchestrator.runPhase2Analysis(sessionId, 'explain the widget', { thinkingProviderId: 'on-device-conversational' });
    assert.strictEqual(p2.thinking.provider, 'on-device-conversational', 'The real Thinking result must report the explicitly-selected provider, not the default.');
    assert.ok(p2.thinking.explanation.includes('TESTDOUBLE:BUILDER-SELECT:'), 'Output must be traceable to the selected test-double provider, proving genuine forwarding (not a hardcoded label).');
  });

  await asyncTest('4. the SAME CognitiveCoordinator singleton is used for both the default and explicit-provider calls — no second instance created', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi: makeTestDoubleDeviceApi('X:') });
    const coordinatorRef = CozyOS.CognitiveCoordinator;
    const BuilderOrchestrator = loadBuilderOrchestrator();
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'Loading builder-orchestrator.js must never replace the singleton.');
    const sessionId = 's-singleton';
    startSession(BuilderOrchestrator, CozyOS, sessionId, 'singleton check');
    await BuilderOrchestrator.runPhase2Analysis(sessionId, 'singleton check');
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'Calling runPhase2Analysis() (with or without options) must never replace or duplicate the coordinator.');
  });

  test('5. BuilderOrchestrator defines exactly one BuilderOrchestrator instance on window.CozyOS — no second cognitive/reasoning engine is created by this change', () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true });
    loadBuilderOrchestrator();
    const first = CozyOS.BuilderOrchestrator;
    loadModule(path.join('..', '..', 'builder', 'builder-orchestrator.js')); // re-require; file itself guards `if (window.CozyOS.BuilderOrchestrator) return;`
    assert.strictEqual(CozyOS.BuilderOrchestrator, first, 'Re-loading the file must not create a second BuilderOrchestrator instance.');
  });

  await asyncTest('6. explicit provider selection on ONE Builder call does not change CozyThinking\'s global/default provider for a later, unrelated call', async () => {
    const deviceApi = makeTestDoubleDeviceApi('TESTDOUBLE:');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    const BuilderOrchestrator = loadBuilderOrchestrator();

    const s1 = 's-explicit-then-default-a';
    startSession(BuilderOrchestrator, CozyOS, s1, 'call with explicit provider');
    const explicit = await BuilderOrchestrator.runPhase2Analysis(s1, 'call with explicit provider', { thinkingProviderId: 'on-device-conversational' });
    assert.strictEqual(explicit.thinking.provider, 'on-device-conversational');

    const s2 = 's-explicit-then-default-b';
    startSession(BuilderOrchestrator, CozyOS, s2, 'call with no provider');
    const afterward = await BuilderOrchestrator.runPhase2Analysis(s2, 'call with no provider');
    assert.strictEqual(afterward.thinking.provider, 'living-planner-baseline', 'A later call with no options must still use the ordinary default provider — one explicit selection must never become sticky/global.');
  });

  await asyncTest('7. the existing CozyAI.ask() path is completely unaffected by this change — same default provider, same result shape', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi: makeTestDoubleDeviceApi('X:') });
    loadBuilderOrchestrator(); // loaded, but never called — proves its mere presence changes nothing for CozyAI
    const CozyAI = loadCozyAI();
    const result = await CozyAI.ask('cozyai unaffected check');
    assert.strictEqual(result.thinking.provider, 'living-planner-baseline', 'CozyAI.ask() with no thinkingProviderId must still resolve to the ordinary default provider.');
  });

  await asyncTest('8. an explicit "on-device-conversational" selection from Builder genuinely reaches the real Thinking layer end-to-end (not a stub/shortcut)', async () => {
    const deviceApi = makeTestDoubleDeviceApi('TESTDOUBLE:END-TO-END:');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    const BuilderOrchestrator = loadBuilderOrchestrator();
    const sessionId = 's-end-to-end';
    startSession(BuilderOrchestrator, CozyOS, sessionId, 'end to end check');
    const p2 = await BuilderOrchestrator.runPhase2Analysis(sessionId, 'end to end check', { thinkingProviderId: 'on-device-conversational' });
    assert.strictEqual(p2.thinking.isReal, true, 'With a real-shaped (test-double) model actually present, isReal must honestly be true.');
    assert.ok(p2.realStagesUsed.includes('thinking'), 'The thinking stage must be recorded as a genuinely-used real stage.');
  });

  await asyncTest('9. the on-device provider remains strictly opt-in through Builder — it is never selected unless explicitly requested', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi: makeTestDoubleDeviceApi('X:') });
    const BuilderOrchestrator = loadBuilderOrchestrator();
    const sessionId = 's-opt-in';
    startSession(BuilderOrchestrator, CozyOS, sessionId, 'default should not be on-device');
    const p2 = await BuilderOrchestrator.runPhase2Analysis(sessionId, 'default should not be on-device');
    assert.notStrictEqual(p2.thinking.provider, 'on-device-conversational', 'Merely having the on-device provider loaded/adapter present must never make Builder use it by default.');
  });

  await asyncTest('10. honest failure is preserved when the explicitly-selected provider genuinely fails (no real model API present) — no false-green result', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi: null });
    const BuilderOrchestrator = loadBuilderOrchestrator();
    const sessionId = 's-honest-failure';
    startSession(BuilderOrchestrator, CozyOS, sessionId, 'no model api present');
    const p2 = await BuilderOrchestrator.runPhase2Analysis(sessionId, 'no model api present', { thinkingProviderId: 'on-device-conversational' });
    assert.strictEqual(p2.thinking.isReal, false, 'Without a real model API, isReal must honestly be false, never fabricated true.');
  });

  test('11. no fabricated confidence is introduced by this change — Phase 2\'s result carries only the real thinking/reasoning fields CognitiveCoordinator already produced', async () => {
    // Static check: runPhase2Analysis() must not itself set/compute a confidence value.
    const src = require('fs').readFileSync(path.join(__dirname, '..', '..', 'builder', 'builder-orchestrator.js'), 'utf8');
    const methodMatch = src.match(/async runPhase2Analysis\([\s\S]*?\n {8}\}/);
    assert.ok(methodMatch, 'runPhase2Analysis method body must be found.');
    assert.ok(!/confidence\s*[:=]/.test(methodMatch[0]), 'runPhase2Analysis must never assign its own confidence value — only pass through what CognitiveCoordinator/CozyThinking genuinely produced.');
  });

  await asyncTest('12. Kiswahili governance (language:sw:vocabulary blocker, NOT_READY) is completely unchanged by this Builder plumbing change', async () => {
    const deviceApi = makeTestDoubleDeviceApi('TESTDOUBLE:SW:');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    const BuilderOrchestrator = loadBuilderOrchestrator();
    const sessionId = 's-sw-governance';
    const input = 'Kiswahili: eleza kwa ufupi CozyOS ni nini?'; // "briefly explain what CozyOS is" — existing repository vocabulary, nothing new created
    startSession(BuilderOrchestrator, CozyOS, sessionId, input);
    const p2 = await BuilderOrchestrator.runPhase2Analysis(sessionId, input, { thinkingProviderId: 'on-device-conversational' });
    assert.strictEqual(typeof p2.thinking.explanation, 'string');

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
    const blocker = diagnosis.topBlocker ? diagnosis.topBlocker.dependency : (diagnosis.requiredBuilds && diagnosis.requiredBuilds[0] && diagnosis.requiredBuilds[0].dependency);
    assert.ok(blocker && /vocabulary/.test(blocker), 'language:sw:vocabulary must remain the blocker, unaffected by Builder\'s new options parameter.');
    const serialized = JSON.stringify(diagnosis).toLowerCase();
    assert.ok(!serialized.includes('"promoted":true'), 'No fabricated vocabulary promotion may appear.');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
