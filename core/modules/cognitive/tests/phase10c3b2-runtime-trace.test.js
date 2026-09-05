/**
 * core/modules/cognitive/tests/phase10c3b2-runtime-trace.test.js
 * Phase 10C-3B2 — Real Provider Execution Bridge.
 *
 * IMPORTANT — READ BEFORE TRUSTING ANY "success" LINE BELOW:
 * This sandbox has NO real browser Prompt API (confirmed separately, see
 * PHASE10C3B2-RUNTIME-EVIDENCE.md — a real headless Chromium 141 was
 * launched via Playwright and self.LanguageModel / self.ai were both
 * `undefined`; the outbound network needed to download the on-device
 * model component is also blocked, HTTP 403).
 *
 * Every "provider" exercised in this file is therefore the SAME
 * disclosed test-double convention already used by
 * on-device-conversational-provider.test.js and
 * phase10c3a-real-provider-integration.test.js: a fake `window.ai.
 * languageModel` object exposing the real Prompt API shape
 * (availability()/create()/session.prompt()). It proves the WIRING
 * (CozyAI -> CognitiveCoordinator -> CozyThinking -> adapter ->
 * on-device-conversational-provider -> "model") is structurally
 * correct and that a real async result would reach CozyAI unmodified.
 *
 * IT DOES NOT AND CANNOT PROVE that a real Gemini Nano / Prompt API
 * model produced these strings. Anywhere this file's output says
 * "isReal: true" or "success: true", that reflects the PRODUCTION
 * CODE's own honest self-report given a fake-but-correctly-shaped
 * model underneath it — not a genuine model execution. Do not read
 * this test's green checkmarks as Outcome A evidence.
 *
 * Run with: node core/modules/cognitive/tests/phase10c3b2-runtime-trace.test.js
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

/** Identical dependency order to the 10C-3A suite's loadCognitiveStack(), reused verbatim. */
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

(async () => {
  console.log('\n=== Phase 10C-3B2 — Runtime Trace (TEST-DOUBLE, not real model execution) ===\n');

  const trace = {};

  // ------------------------------------------------------------------
  // PART 2 — Trace one request: CozyAI -> CognitiveCoordinator ->
  // CozyThinking -> on-device-cognitive-adapter ->
  // on-device-conversational-provider -> "model"
  // ------------------------------------------------------------------
  await asyncTest('Part 2: one full-pipeline request via CozyAI.ask() reaches the on-device adapter path and returns honestly', async () => {
    const deviceApi = makeTestDoubleDeviceApi('TESTDOUBLE:REAL-SHAPE-REPLY:');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    CozyOS.ProviderManager = makeFakeProviderManager();
    const CozyAI = loadCozyAI();

    const providerId = 'on-device-conversational';
    const input = 'trace: what is CozyOS?';
    const t0 = Date.now();
    const result = await CozyAI.ask(input, { actorId: 'phase10c3b2-trace', thinkingProviderId: providerId });
    const t1 = Date.now();

    trace.providerId = providerId;
    trace.providerActivation = 'explicit opt-in via thinkingProviderId (never default-active, matching 10C-3A/10C-3B1 finding)';
    trace.input = input;
    trace.output = result && result.thinking && result.thinking.explanation;
    trace.confidence = result && result.thinking && (result.thinking.confidence !== undefined ? result.thinking.confidence : null);
    trace.isReal = result && result.thinking && result.thinking.isReal;
    trace.success = result && result.success;
    trace.timingMs = t1 - t0;
    trace.reachedCozyAI = !!(result && result.thinking);
    trace.rawThinkingBlock = result && result.thinking;

    assert.ok(result, 'CozyAI.ask() must return a result object.');
    assert.strictEqual(typeof trace.output, 'string', 'Output reaching CozyAI must be a resolved string, never a Promise.');
    assert.ok(!/\[object /.test(trace.output || ''), 'Output must never stringify as [object Promise]/[object Object] (would indicate a missing await).');
    assert.ok(trace.output.includes('TESTDOUBLE:REAL-SHAPE-REPLY:'), 'Output must be traceable back to the test-double model, proving the real code path (not a hardcoded stub) produced it.');
  });

  await asyncTest('Part 2 (error path): honest failure is preserved end-to-end when the model API is absent (no real runtime here)', async () => {
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi: null });
    CozyOS.ProviderManager = makeFakeProviderManager();
    const CozyAI = loadCozyAI();
    const result = await CozyAI.ask('trace: no api present', { actorId: 'phase10c3b2-trace-fail', thinkingProviderId: 'on-device-conversational' });
    trace.errorPathIsReal = result.thinking && result.thinking.isReal;
    trace.errorPathSuccess = result.success;
    trace.errorPathReason = result.thinking && (result.thinking.reason || result.reason);
    assert.strictEqual(result.thinking.isReal, false, 'Without a real model API, isReal must honestly be false, never fabricated true.');
  });

  // ------------------------------------------------------------------
  // PART 3 — Builder path: same CognitiveCoordinator singleton, same
  // Thinking provider, no second intelligence engine.
  // ------------------------------------------------------------------
  await asyncTest('Part 3: Builder converges on the SAME CognitiveCoordinator singleton as CozyAI (no second engine)', async () => {
    const deviceApi = makeTestDoubleDeviceApi('TESTDOUBLE:BUILDER-PATH:');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    const coordinatorRef = CozyOS.CognitiveCoordinator;
    let callCount = 0;
    const realRun = coordinatorRef.run.bind(coordinatorRef);
    coordinatorRef.run = async (...args) => { callCount++; return realRun(...args); };

    CozyOS.ProviderManager = makeFakeProviderManager();
    const CozyAI = loadCozyAI();
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'Loading cozy-ai.js must not replace the singleton.');
    await CozyAI.ask('builder convergence check');
    assert.strictEqual(callCount, 1);

    const BuilderOrchestrator = loadBuilderOrchestrator();
    assert.strictEqual(CozyOS.CognitiveCoordinator, coordinatorRef, 'Loading builder-orchestrator.js must not replace the singleton.');
    CozyOS.UnderstandingEngine = { analyzeText: (t) => ({ tokens: (t || '').split(' '), success: true }) };
    const sessionId = 'phase10c3b2-builder-session';
    const p1 = BuilderOrchestrator.runPhase1Understanding(sessionId, 'build a widget');
    assert.ok(p1.success, 'Phase 1 stub must succeed so Phase 2 is reachable.');
    const p2 = await BuilderOrchestrator.runPhase2Analysis(sessionId, 'build a widget');
    trace.builderSameSingleton = CozyOS.CognitiveCoordinator === coordinatorRef;
    trace.builderCallReachedCoordinator = callCount === 2;
    trace.builderProviderUsed = p2 && p2.thinking && p2.thinking.provider;
    trace.builderCanSelectOnDeviceProvider = true; // RESOLVED in Phase 10C-3B3 (see below) — this specific trace call still passes no options, so it still resolves to the default provider; the capability itself now exists and is exercised in phase10c3b3-builder-provider-selection.test.js
    assert.strictEqual(callCount, 2, 'BuilderOrchestrator.runPhase2Analysis() must invoke the SAME singleton coordinator.');
  });

  test('Part 3 (finding RESOLVED in Phase 10C-3B3): BuilderOrchestrator.runPhase2Analysis(sessionId, text) previously had no options parameter and could not pass thinkingProviderId through. Phase 10C-3B3 (core/modules/cognitive/tests/phase10c3b3-builder-provider-selection.test.js) added the smallest additive fix: an optional third `options` argument whose only read field is `thinkingProviderId`, forwarded unchanged to CognitiveCoordinator.run(). This test is retained, updated (not deleted), as the historical record of the original finding and its resolution — see the Phase 10C-3B3 suite for full coverage of the fix itself.', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', '..', 'builder', 'builder-orchestrator.js'), 'utf8');
    const m = src.match(/async runPhase2Analysis\(([^)]*)\)/);
    assert.ok(m, 'runPhase2Analysis must exist.');
    assert.strictEqual(m[1].trim(), 'sessionId, text, options = {}', 'Confirms the Phase 10C-3B3 signature now genuinely accepts an options/providerId passthrough (finding resolved, not fabricated).');
  });

  // ------------------------------------------------------------------
  // PART 4 — Kiswahili proof: reasoning over existing state while
  // preserving language:sw:vocabulary / NOT_READY diagnosis.
  // ------------------------------------------------------------------
  await asyncTest('Part 4: one small Kiswahili reasoning request through the traced pipeline (test-double), governance blocker unchanged', async () => {
    const deviceApi = makeTestDoubleDeviceApi('TESTDOUBLE:SW-REPLY:');
    const CozyOS = loadCognitiveStack({ withBaselineProviders: true, withOnDeviceProvider: true, withAdapter: true, deviceApi });
    CozyOS.ProviderManager = makeFakeProviderManager();
    const CozyAI = loadCozyAI();

    const input = 'Kiswahili: eleza kwa ufupi CozyOS ni nini?'; // "briefly explain what CozyOS is" — no new vocabulary created or promoted
    const result = await CozyAI.ask(input, { actorId: 'phase10c3b2-sw-trace', thinkingProviderId: 'on-device-conversational' });
    trace.swInput = input;
    trace.swOutput = result && result.thinking && result.thinking.explanation;
    trace.swIsReal = result && result.thinking && result.thinking.isReal;
    assert.strictEqual(typeof trace.swOutput, 'string');

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
    trace.swGovernanceBlocker = diagnosis.topBlocker ? diagnosis.topBlocker.dependency : (diagnosis.requiredBuilds && diagnosis.requiredBuilds[0] && diagnosis.requiredBuilds[0].dependency);
    trace.swResourceState = 'NOT_READY';
    assert.ok(trace.swGovernanceBlocker && /vocabulary/.test(trace.swGovernanceBlocker), 'language:sw:vocabulary must remain the blocker.');
    const serialized = JSON.stringify(diagnosis).toLowerCase();
    assert.ok(!serialized.includes('"promoted":true'), 'No fabricated vocabulary promotion may appear.');
  });

  console.log('\n--- CAPTURED TRACE (test-double; see file header) ---');
  console.log(JSON.stringify(trace, null, 2));

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
