/**
 * core/modules/builder/tests/capability-repair-planner.test.js
 * Phase 5 — real, executed tests for
 * core/modules/builder/capability-repair-planner.js
 *
 * Run with: node core/modules/builder/tests/capability-repair-planner.test.js
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

function freshWindow() {
  global.window = { CozyOS: {} };
  return global.window;
}

function loadModule(relPath) {
  const modulePath = path.join(__dirname, relPath);
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
}

function loadFullStack() {
  loadModule(path.join('..', '..', 'intelligence', 'language', 'cozy-language-registry.js'));
  loadModule(path.join('..', '..', 'intelligence', 'language-packs', 'cozy-language-pack-registry.js'));
  loadModule(path.join('..', '..', '..', 'platform', 'file-registry.js'));
  loadModule(path.join('..', '..', '..', 'platform', 'dependency-engine.js'));
  loadModule(path.join('..', 'unified-capability-contract.js'));
  loadModule(path.join('..', 'capability-dependency-graph.js'));
  loadModule(path.join('..', 'capability-self-diagnosis.js'));
  loadModule(path.join('..', 'capability-repair-planner.js'));
  return global.window.CozyOS.CapabilityRepairPlanner;
}

// A minimal stand-in matching Phase 4's real diagnose()/DIAGNOSIS_RESULT
// shape, used only to isolate the planner's own classify/order/validate
// logic from real registry data (same "synthetic edge" testing pattern
// already used by capability-self-diagnosis.test.js test 9).
function stubDiagnosisEngine(overrides) {
  const DIAGNOSIS_RESULT = { IDENTIFICATION_UNCERTAIN: 'IDENTIFICATION_UNCERTAIN', INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE', DIAGNOSED: 'DIAGNOSED' };
  return Object.assign({
    DIAGNOSIS_RESULT,
    diagnose() {
      return {
        question: 'stub',
        result: DIAGNOSIS_RESULT.DIAGNOSED,
        stages: [
          { stage: 'DIMENSION_ANALYSIS', dimensions: [
            { dimension: 'vocabulary', required: true },
            { dimension: 'grammar', required: false }
          ] },
          {
            stage: 'BLOCKER_IDENTIFICATION', available: true,
            blockers: [
              { dependency: 'capability:x:grammar', status: 'MISSING', confidence: 'unverified', evidence: [], sourceRegistry: null, dependencyMeta: null },
              { dependency: 'capability:x:vocabulary', status: 'NOT_VERIFIED', confidence: 'manifest', evidence: ['registry says NOT_READY'], sourceRegistry: 'stub-registry', dependencyMeta: { registry: 'stub-registry', field: 'resourceState', rawValue: 'NOT_READY' } }
            ]
          }
        ],
        diagnosis: {
          capability: 'capability:x', name: 'Stub Capability', overallStatus: 'PARTIALLY_VERIFIED',
          verificationRequired: { required: true, verification: 'Stub verification criteria.' }
        }
      };
    }
  }, overrides || {});
}

// ---------------------------------------------------------------------
// 1. diagnosis -> build plan
// ---------------------------------------------------------------------
test('1. diagnosis -> build plan produces a real plan object for the Kiswahili case', () => {
  freshWindow();
  const planner = loadFullStack();
  const plan = planner.buildPlan('Why am I not fully fluent in Kiswahili?');
  assert.strictEqual(plan.targetCapability, 'language:sw');
  assert.ok(plan.planId);
  assert.ok(Array.isArray(plan.buildOrder));
});

// ---------------------------------------------------------------------
// 2. required dependency ordering
// ---------------------------------------------------------------------
test('2. required dependency ordering places all REQUIRED builds before REEVALUATE_CAPABILITY', () => {
  freshWindow();
  const planner = loadFullStack();
  const engine = stubDiagnosisEngine();
  const plan = planner.buildPlan('stub question', engine);
  const capStepIndex = plan.buildOrder.findIndex((s) => s.type === 'REEVALUATE_CAPABILITY');
  const buildStepIndices = plan.buildOrder.filter((s) => s.type === 'BUILD_DEPENDENCY').map((s) => plan.buildOrder.indexOf(s));
  assert.ok(buildStepIndices.every((i) => i < capStepIndex), 'every BUILD_DEPENDENCY step must precede REEVALUATE_CAPABILITY');
});

// ---------------------------------------------------------------------
// 3. optional dependency ordering
// ---------------------------------------------------------------------
test('3. optional/placeholder dependency never appears in requiredBuilds or buildOrder', () => {
  freshWindow();
  const planner = loadFullStack();
  const engine = stubDiagnosisEngine();
  const plan = planner.buildPlan('stub question', engine);
  assert.ok(!plan.requiredBuilds.some((rb) => rb.dependency.endsWith(':grammar')));
  assert.ok(!plan.buildOrder.some((s) => s.target && s.target.endsWith(':grammar')));
});

// ---------------------------------------------------------------------
// 4. placeholder rejection (grammar-vs-vocabulary failure mode, part 1)
// ---------------------------------------------------------------------
test('4. placeholder ("grammar") is classified OPTIONAL, never REQUIRED', () => {
  freshWindow();
  const planner = loadFullStack();
  const engine = stubDiagnosisEngine();
  const plan = planner.buildPlan('stub question', engine);
  const grammarEntry = plan.blockingDependencies.find((b) => b.dependency.endsWith(':grammar'));
  assert.strictEqual(grammarEntry.dependencyClass, planner.DEPENDENCY_CLASS.OPTIONAL);
});

// ---------------------------------------------------------------------
// 5. evidence-backed blocker priority (grammar-vs-vocabulary failure
//    mode, part 2 — the exact class of error the spec requires Phase 5
//    to prove it does not repeat)
// ---------------------------------------------------------------------
test('5. evidence-backed required "vocabulary" is ranked and chosen ahead of placeholder "grammar"', () => {
  freshWindow();
  const planner = loadFullStack();
  const engine = stubDiagnosisEngine();
  const plan = planner.buildPlan('stub question', engine);
  assert.strictEqual(plan.blockingDependencies[0].dependency, 'capability:x:vocabulary');
  assert.strictEqual(plan.targetDimension, 'vocabulary');
  assert.notStrictEqual(plan.targetDimension, 'grammar');
});

// ---------------------------------------------------------------------
// 6. multiple blockers
// ---------------------------------------------------------------------
test('6. multiple blockers all appear in blockingDependencies, classified independently', () => {
  freshWindow();
  const planner = loadFullStack();
  const engine = stubDiagnosisEngine();
  const plan = planner.buildPlan('stub question', engine);
  assert.strictEqual(plan.blockingDependencies.length, 2);
});

// ---------------------------------------------------------------------
// 7. dependency chain
// ---------------------------------------------------------------------
test('7. topologicalOrder() resolves a real multi-level dependency chain', () => {
  freshWindow();
  const planner = loadFullStack();
  const result = planner.topologicalOrder([
    { id: 'A', requires: ['B'] },
    { id: 'B', requires: ['C'] },
    { id: 'C', requires: [] }
  ]);
  assert.strictEqual(result.cycle, null);
  assert.ok(result.order.indexOf('C') < result.order.indexOf('B'));
  assert.ok(result.order.indexOf('B') < result.order.indexOf('A'));
});

// ---------------------------------------------------------------------
// 8. circular dependency
// ---------------------------------------------------------------------
test('8. topologicalOrder() detects a circular dependency instead of ordering it', () => {
  freshWindow();
  const planner = loadFullStack();
  const result = planner.topologicalOrder([
    { id: 'A', requires: ['B'] },
    { id: 'B', requires: ['A'] }
  ]);
  assert.strictEqual(result.order, null);
  assert.ok(Array.isArray(result.cycle) && result.cycle.length >= 2);
});

// ---------------------------------------------------------------------
// 9. insufficient evidence
// ---------------------------------------------------------------------
test('9. missing Phase 4 engine yields INSUFFICIENT_EVIDENCE, not a fabricated plan', () => {
  freshWindow();
  loadModule(path.join('..', 'capability-repair-planner.js'));
  const planner = global.window.CozyOS.CapabilityRepairPlanner;
  const plan = planner.buildPlan('Why am I not fully fluent in Kiswahili?', null);
  // window.CozyOS.CapabilitySelfDiagnosis was never loaded in this fresh window
  assert.strictEqual(plan.status, planner.PLAN_STATUS.INSUFFICIENT_EVIDENCE);
  assert.strictEqual(plan.buildOrder.length, 0);
});

// ---------------------------------------------------------------------
// 10. ambiguous target
// ---------------------------------------------------------------------
test('10. empty/unmatched question yields AMBIGUOUS, never a guessed target', () => {
  freshWindow();
  const planner = loadFullStack();
  const plan = planner.buildPlan('');
  assert.strictEqual(plan.status, planner.PLAN_STATUS.AMBIGUOUS);
  assert.strictEqual(plan.targetCapability, null);
});

// ---------------------------------------------------------------------
// 11. fabricated implementation rejection
// ---------------------------------------------------------------------
test('11. unknown implementation detail is explicitly marked, never invented', () => {
  freshWindow();
  const planner = loadFullStack();
  const plan = planner.buildPlan('Why am I not fully fluent in Kiswahili?');
  const vocab = plan.requiredBuilds.find((rb) => rb.dependency.endsWith(':vocabulary'));
  assert.ok(vocab, 'vocabulary must be a required build');
  assert.ok(vocab.implementationDetail.known === true || vocab.implementationDetail.marker === planner.IMPLEMENTATION_DETAIL_UNKNOWN);
  if (!vocab.implementationDetail.known) {
    assert.strictEqual(vocab.implementationDetail.marker, 'IMPLEMENTATION_DETAIL_UNKNOWN');
  }
});

// ---------------------------------------------------------------------
// 12. missing verification criteria
// ---------------------------------------------------------------------
test('12. validatePlan() fails check 7 when verificationCriteria is absent', () => {
  freshWindow();
  const planner = loadFullStack();
  const brokenPlan = {
    targetCapability: 'capability:x', diagnosis: { result: 'DIAGNOSED' },
    blockingDependencies: [{ dependency: 'capability:x:thing' }],
    requiredBuilds: [{ dependency: 'capability:x:thing', implementationDetail: { known: false, marker: planner.IMPLEMENTATION_DETAIL_UNKNOWN } }],
    buildOrder: [{ target: 'capability:x:thing' }],
    verificationCriteria: null,
    provenance: 'test',
    status: planner.PLAN_STATUS.READY
  };
  const validation = planner.validatePlan(brokenPlan);
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.failedChecks.some((c) => c.id === '7'));
});

// ---------------------------------------------------------------------
// 13. READY plan
// ---------------------------------------------------------------------
test('13. Kiswahili plan reaches status READY with a passing validation', () => {
  freshWindow();
  const planner = loadFullStack();
  const plan = planner.buildPlan('Why am I not fully fluent in Kiswahili?');
  assert.strictEqual(plan.status, planner.PLAN_STATUS.READY);
  assert.strictEqual(plan.validation.valid, true);
});

// ---------------------------------------------------------------------
// 14. BLOCKED plan
// ---------------------------------------------------------------------
test('14. validatePlan() reports BLOCKED-driving failures for a malformed plan', () => {
  freshWindow();
  const planner = loadFullStack();
  const brokenPlan = {
    targetCapability: null, diagnosis: { result: 'DIAGNOSED' },
    blockingDependencies: [], requiredBuilds: [], buildOrder: [],
    verificationCriteria: 'x', provenance: 'test', status: planner.PLAN_STATUS.READY
  };
  const validation = planner.validatePlan(brokenPlan);
  assert.strictEqual(validation.valid, false);
  assert.ok(validation.failedChecks.some((c) => c.id === '1'));
  assert.ok(validation.failedChecks.some((c) => c.id === '3'));
  assert.ok(validation.failedChecks.some((c) => c.id === '4'));
});

// ---------------------------------------------------------------------
// 15. Kiswahili proof case (spec §9 required output shape)
// ---------------------------------------------------------------------
test('15. Kiswahili proof case matches spec §9\'s required structural shape', () => {
  freshWindow();
  const planner = loadFullStack();
  const plan = planner.buildPlan('Why am I not fully fluent in Kiswahili?');
  assert.strictEqual(plan.targetCapability, 'language:sw');
  assert.strictEqual(plan.diagnosis.overallStatus, 'PARTIALLY_VERIFIED');
  assert.strictEqual(plan.blockingDependencies[0].dependency, 'language:sw:vocabulary');
  assert.ok(plan.buildOrder.some((s) => s.type === 'BUILD_DEPENDENCY' && s.target === 'language:sw:vocabulary'));
  assert.ok(plan.buildOrder.some((s) => s.type === 'VERIFY_DEPENDENCY' && s.target === 'language:sw:vocabulary'));
  assert.ok(plan.buildOrder.some((s) => s.type === 'REEVALUATE_DEPENDENCY' && s.target === 'language:sw:vocabulary'));
  assert.ok(plan.buildOrder.some((s) => s.type === 'REEVALUATE_CAPABILITY' && s.target === 'language:sw'));
  assert.ok(plan.requiredTests.length > 0);
  assert.ok(plan.verificationCriteria && plan.verificationCriteria.length > 0);
});

// ---------------------------------------------------------------------
// 16. Repair Queue integration behavior
// ---------------------------------------------------------------------
test('16. Repair Queue integration references RP-030-CONTENT for vocabulary and refuses to invent one for unknowns', () => {
  freshWindow();
  const planner = loadFullStack();
  const plan = planner.buildPlan('Why am I not fully fluent in Kiswahili?');
  const vocab = plan.blockingDependencies.find((b) => b.dependency === 'language:sw:vocabulary');
  assert.strictEqual(vocab.repairQueue.referenced, true);
  assert.strictEqual(vocab.repairQueue.id, 'RP-030-CONTENT');

  const engine = stubDiagnosisEngine();
  const stubPlan = planner.buildPlan('stub question', engine);
  const unknownDep = stubPlan.blockingDependencies.find((b) => b.dependency === 'capability:x:grammar');
  assert.strictEqual(unknownDep.repairQueue.referenced, false);
});

// ---------------------------------------------------------------------
// 17. builder-orchestrator integration boundary
// ---------------------------------------------------------------------
test('17. toBuilderOrchestratorPlanningShape() reshapes the plan without calling BuilderOrchestrator', () => {
  freshWindow();
  const planner = loadFullStack();
  // Deliberately do NOT load builder-orchestrator.js — proves no call is made into it.
  assert.strictEqual(global.window.CozyOS.BuilderOrchestrator, undefined);
  const plan = planner.buildPlan('Why am I not fully fluent in Kiswahili?');
  const shaped = planner.toBuilderOrchestratorPlanningShape(plan);
  assert.strictEqual(shaped.phase, 5);
  assert.strictEqual(shaped.name, 'Planning');
  assert.strictEqual(shaped.success, plan.status === planner.PLAN_STATUS.READY);
  assert.strictEqual(global.window.CozyOS.BuilderOrchestrator, undefined);
});

// ---------------------------------------------------------------------
// 18. Phase 4 regression
// ---------------------------------------------------------------------
test('18. capability-self-diagnosis.js (Phase 4) behaves identically after Phase 5 loads', () => {
  freshWindow();
  loadFullStack();
  const diag = global.window.CozyOS.CapabilitySelfDiagnosis;
  const result = diag.diagnose('Why am I not fully fluent in Kiswahili?');
  assert.strictEqual(result.result, diag.DIAGNOSIS_RESULT.DIAGNOSED);
  assert.strictEqual(result.diagnosis.capability, 'language:sw');
  assert.strictEqual(result.diagnosis.primaryBlocker.dependency, 'language:sw:vocabulary');
});

// ---------------------------------------------------------------------
// 19. Phase 3 regression
// ---------------------------------------------------------------------
test('19. capability-dependency-graph.js (Phase 3) getBlockers() unchanged after Phase 5 loads', () => {
  freshWindow();
  loadFullStack();
  const graphMod = global.window.CozyOS.CapabilityDependencyGraph;
  const built = graphMod.buildKiswahiliDependencyGraph();
  const blockers = built.graph.getBlockers('language:sw');
  assert.ok(blockers.available);
  assert.ok(blockers.blockers.some((b) => b.dependency === 'language:sw:vocabulary'));
});

// ---------------------------------------------------------------------
// 20. Phase 2 regression
// ---------------------------------------------------------------------
test('20. unified-capability-contract.js (Phase 2) still resolves the real Kiswahili record after Phase 5 loads', () => {
  freshWindow();
  loadFullStack();
  const contract = global.window.CozyOS.UnifiedCapabilityContract;
  const record = contract.buildKiswahiliValidationRecord();
  assert.strictEqual(record.id, 'language:sw');
  assert.strictEqual(record.overallStatus.value, 'PARTIALLY_VERIFIED');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
