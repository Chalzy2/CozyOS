/**
 * core/modules/builder/tests/capability-governance-diagnosis-phase10a.test.js
 * Phase 10A — real, executed tests for the Step 3/4 cognitive operation
 * contract (OPERATION_SEMANTICS) and the Step 5/6 cognitiveTrace
 * additions (WEIGH stage; confidence/whatRemainsUnknown/
 * discardedAlternatives on every trace entry) layered additively onto
 * capability-governance-diagnosis.js (Phase 8).
 *
 * Run with: node core/modules/builder/tests/capability-governance-diagnosis-phase10a.test.js
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
  loadModule(path.join('..', '..', 'intelligence', 'knowledge', 'cozy-knowledge-ingestion.js'));
  loadModule(path.join('..', '..', 'intelligence', 'knowledge', 'cozy-knowledge-community.js'));
  loadModule(path.join('..', '..', 'intelligence', 'knowledge', 'cozy-knowledge-review.js'));
  loadModule(path.join('..', '..', 'intelligence', 'language', 'cozy-language-templates.js'));
  loadModule(path.join('..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'));
  loadModule(path.join('..', '..', 'intelligence', 'knowledge', 'ui', 'cozy-knowledge-safety-gate.js'));
  loadModule(path.join('..', '..', 'intelligence', 'knowledge', 'ui', 'cozy-knowledge-review-hotspot-bridge.js'));
  loadModule(path.join('..', '..', 'intelligence', 'knowledge', 'ui', 'cozy-knowledge-contribution-core.js'));
  loadModule(path.join('..', '..', 'intelligence', 'knowledge', 'teach', 'cozy-teach-cozyai-routing-core.js'));
  loadModule(path.join('..', 'capability-knowledge-acquisition.js'));
  loadModule(path.join('..', 'capability-governance-diagnosis.js'));
  return global.window.CozyOS.CapabilityGovernanceDiagnosis;
}

const KISWAHILI_QUESTION = 'Why am I not fully fluent in Kiswahili?';

function stubRepairPlanner(planOverrides) {
  return {
    buildPlan() {
      return Object.assign({
        question: 'stub', status: 'READY', targetCapability: 'language:sw',
        diagnosis: { overallStatus: 'PARTIALLY_VERIFIED' },
        requiredBuilds: [{
          dependency: 'language:sw:vocabulary', dependencyClass: 'REQUIRED', status: 'NOT_VERIFIED',
          confidence: 'manifest', evidence: ['registry says NOT_READY'], sourceRegistry: 'cozy-language-pack-registry',
          dependencyMeta: { registry: 'cozy-language-pack-registry', field: 'resourceState', rawValue: 'NOT_READY' },
          repairQueue: { referenced: true, id: 'RP-030-CONTENT', status: 'Composed', priority: 'High', dependsOn: ['RP-030'] }
        }],
        limitations: []
      }, planOverrides || {});
    }
  };
}

const ALL_16_OPERATIONS = [
  'PONDER', 'CONTEMPLATE', 'THINK', 'HOME_IN', 'MUSE', 'FATHOM', 'MULL',
  'SIFT', 'CRYSTALLIZE', 'TRIANGULATE', 'UNTANGLE', 'WEIGH', 'COGITATE',
  'FIGURE', 'HONE', 'RECKON'
];

const REAL_PIPELINE_OPERATIONS = ['PONDER', 'WEIGH', 'TRIANGULATE', 'UNTANGLE', 'SIFT', 'CRYSTALLIZE', 'RECKON'];

// ---------------------------------------------------------------------
// 1. Operation creation / semantic contract (Step 3/4)
// ---------------------------------------------------------------------

test('1. operation creation: OPERATION_SEMANTICS defines all 16 requested operation names', () => {
  freshWindow();
  const gov = loadFullStack();
  ALL_16_OPERATIONS.forEach((op) => {
    assert.ok(gov.OPERATION_SEMANTICS[op], `missing semantic entry for ${op}`);
    assert.strictEqual(typeof gov.OPERATION_SEMANTICS[op].purpose, 'string');
    assert.ok(gov.OPERATION_SEMANTICS[op].purpose.length > 0);
  });
});

test('2. operation ordering: real pipeline trace entries appear in the order the pipeline actually computes them', () => {
  freshWindow();
  const gov = loadFullStack();
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  const ops = result.cognitiveTrace.map((t) => t.operation);
  const expectedSubsequence = ['PONDER', 'PONDER', 'WEIGH', 'TRIANGULATE', 'UNTANGLE', 'SIFT', 'SIFT', 'CRYSTALLIZE', 'RECKON'];
  assert.deepStrictEqual(ops, expectedSubsequence);
});

test('3. trace structure: every entry carries operation/description/input/output/confidence/whatRemainsUnknown/discardedAlternatives', () => {
  freshWindow();
  const gov = loadFullStack();
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  result.cognitiveTrace.forEach((entry) => {
    assert.strictEqual(typeof entry.operation, 'string');
    assert.strictEqual(typeof entry.description, 'string');
    assert.ok('input' in entry);
    assert.ok('output' in entry);
    assert.strictEqual(typeof entry.confidence, 'string');
    assert.ok(Array.isArray(entry.whatRemainsUnknown));
    assert.ok(Array.isArray(entry.discardedAlternatives));
  });
});

test('4. confidence preservation: WEIGH/TRIANGULATE/CRYSTALLIZE/RECKON confidence reflects the real blocker confidence (manifest -> SOURCE_VERIFIED_LIVE)', () => {
  freshWindow();
  const gov = loadFullStack();
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: stubRepairPlanner() });
  const byOp = {};
  result.cognitiveTrace.forEach((t) => { byOp[t.operation] = byOp[t.operation] || []; byOp[t.operation].push(t); });
  ['WEIGH', 'TRIANGULATE', 'CRYSTALLIZE', 'RECKON'].forEach((op) => {
    assert.strictEqual(byOp[op][0].confidence, gov.TRACE_CONFIDENCE.SOURCE_VERIFIED_LIVE, `${op} should reflect real 'manifest' confidence`);
  });
});

test('5. UNKNOWN preservation: an unverified blocker is never upgraded to a fabricated confidence, and remaining unknowns are stated, not hidden', () => {
  freshWindow();
  const gov = loadFullStack();
  const unverifiedPlanner = stubRepairPlanner({
    requiredBuilds: [{
      dependency: 'language:sw:vocabulary', dependencyClass: 'REQUIRED', status: 'NOT_VERIFIED',
      confidence: 'unverified', evidence: [], sourceRegistry: 'cozy-language-pack-registry',
      dependencyMeta: null,
      repairQueue: { referenced: true, id: 'RP-030-CONTENT', status: 'Composed', priority: 'High', dependsOn: ['RP-030'] }
    }]
  });
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: unverifiedPlanner });
  const weigh = result.cognitiveTrace.find((t) => t.operation === 'WEIGH');
  assert.strictEqual(weigh.confidence, gov.TRACE_CONFIDENCE.NO_EVIDENCE);
  assert.ok(weigh.whatRemainsUnknown.length > 0, 'an unverified blocker must disclose what remains unknown, never silently claim certainty');
});

test('6. discarded alternatives: WEIGH lists real other requiredBuilds candidates, never a fabricated list', () => {
  freshWindow();
  const gov = loadFullStack();
  const twoCandidatePlanner = stubRepairPlanner({
    requiredBuilds: [
      {
        dependency: 'language:sw:vocabulary', dependencyClass: 'REQUIRED', status: 'NOT_VERIFIED',
        confidence: 'manifest', evidence: ['a'], sourceRegistry: 'x', dependencyMeta: null,
        repairQueue: { referenced: true, id: 'RP-030-CONTENT', status: 'Composed', priority: 'High', dependsOn: [] }
      },
      {
        dependency: 'language:sw:grammar', dependencyClass: 'REQUIRED', status: 'MISSING',
        confidence: 'best-effort', evidence: ['b'], sourceRegistry: 'x', dependencyMeta: null,
        repairQueue: { referenced: true, id: 'RP-031-CONTENT', status: 'Composed', priority: 'High', dependsOn: [] }
      }
    ]
  });
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: twoCandidatePlanner });
  const weigh = result.cognitiveTrace.find((t) => t.operation === 'WEIGH');
  assert.strictEqual(weigh.discardedAlternatives.length, 1);
  assert.strictEqual(weigh.discardedAlternatives[0].dependency, 'language:sw:grammar');
  assert.strictEqual(weigh.discardedAlternatives[0].confidence, 'best-effort');
});

// ---------------------------------------------------------------------
// 7-22. Every requested operation name has a real, inspectable
// semantic purpose (Step 4). The 7 real pipeline operations are also
// confirmed present with real input/output on a live trace; the other
// 9 are confirmed honestly marked as not currently emitted, never
// faked onto the trace.
// ---------------------------------------------------------------------

const OPERATION_TEST_NUMBERS = {
  PONDER: 7, CONTEMPLATE: 8, THINK: 9, HOME_IN: 10, MUSE: 11, FATHOM: 12,
  MULL: 13, SIFT: 14, CRYSTALLIZE: 15, TRIANGULATE: 16, UNTANGLE: 17,
  WEIGH: 18, COGITATE: 19, FIGURE: 20, HONE: 21, RECKON: 22
};

ALL_16_OPERATIONS.forEach((op) => {
  const n = OPERATION_TEST_NUMBERS[op];
  test(`${n}. ${op} has a real semantic purpose${REAL_PIPELINE_OPERATIONS.indexOf(op) !== -1 ? ' and appears on a live trace' : ' (honestly not yet emitted by this pipeline)'}`, () => {
    freshWindow();
    const gov = loadFullStack();
    const semantics = gov.OPERATION_SEMANTICS[op];
    assert.ok(semantics && semantics.purpose);

    const isReal = REAL_PIPELINE_OPERATIONS.indexOf(op) !== -1;
    assert.strictEqual(semantics.emittedByThisPipeline, isReal);

    const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
    const onTrace = result.cognitiveTrace.some((t) => t.operation === op);
    assert.strictEqual(onTrace, isReal, isReal
      ? `${op} is marked real but did not appear on the live trace`
      : `${op} is marked not-yet-emitted but appeared on the live trace — fabrication`);
  });
});

// ---------------------------------------------------------------------
// Existing Phase 8 behavior remains unchanged
// ---------------------------------------------------------------------

test('23. existing Phase 8 behavior unchanged: governanceStatus/overallStatus/topBlocker still computed exactly as before', () => {
  freshWindow();
  const gov = loadFullStack();
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.strictEqual(result.status, 'EVALUATED');
  assert.strictEqual(result.overallStatus, 'PARTIALLY_VERIFIED');
  assert.strictEqual(result.topBlocker.dependency, 'language:sw:vocabulary');
  assert.strictEqual(result.governanceStatus, gov.GOVERNANCE_STATUS.KNOWLEDGE_MISSING);
});

test('24. existing Phase 8 behavior unchanged: compareDiagnoses()/explain() untouched by the trace additions', () => {
  freshWindow();
  const gov = loadFullStack();
  const before = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: stubRepairPlanner() });
  const after = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: stubRepairPlanner() });
  const diff = gov.compareDiagnoses(before, after);
  assert.ok(diff.changes.indexOf(gov.CHANGE.NO_CHANGE) !== -1);
  assert.strictEqual(typeof gov.explain(after), 'string');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
