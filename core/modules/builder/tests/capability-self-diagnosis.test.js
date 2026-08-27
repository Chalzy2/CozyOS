/**
 * core/modules/builder/tests/capability-self-diagnosis.test.js
 * Phase 4 — real, executed tests for
 * core/modules/builder/capability-self-diagnosis.js
 *
 * Run with: node core/modules/builder/tests/capability-self-diagnosis.test.js
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
  return global.window.CozyOS.CapabilitySelfDiagnosis;
}

// ---------------------------------------------------------------------
// 1. Known capability diagnosis
// ---------------------------------------------------------------------
test('1. known capability question resolves to DIAGNOSED', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('Why am I not fully fluent in Kiswahili?');
  assert.strictEqual(result.result, diag.DIAGNOSIS_RESULT.DIAGNOSED);
  assert.strictEqual(result.diagnosis.capability, 'language:sw');
});

// ---------------------------------------------------------------------
// 2. Unknown capability
// ---------------------------------------------------------------------
test('2. unknown capability returns IDENTIFICATION_UNCERTAIN, not a guess', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('Why can you not do quantum chemistry?');
  assert.strictEqual(result.result, diag.DIAGNOSIS_RESULT.IDENTIFICATION_UNCERTAIN);
  assert.strictEqual(result.diagnosis, null);
});

// ---------------------------------------------------------------------
// 3. Ambiguous / empty capability question
// ---------------------------------------------------------------------
test('3. empty question returns IDENTIFICATION_UNCERTAIN with candidate list', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('');
  assert.strictEqual(result.result, diag.DIAGNOSIS_RESULT.IDENTIFICATION_UNCERTAIN);
  assert.ok(Array.isArray(result.stages[0].candidates));
});

// ---------------------------------------------------------------------
// 4. Verified capability (synthetic: all-positive record diagnosed by
//    hand-composing the pipeline stage functions, since no capability in
//    this repository is currently fully VERIFIED — an honest fact, not
//    a test limitation to hide).
// ---------------------------------------------------------------------
test('4. a fully-positive record derives overall VERIFIED via analyzeStatus (Phase 2 vocabulary, unmodified)', () => {
  freshWindow();
  const diag = loadFullStack();
  const contract = global.window.CozyOS.UnifiedCapabilityContract;
  const dim = contract.makeDimension({
    key: 'response_generation', required: true, registry: 'cozy-language-registry',
    file: 'x', exportedAs: 'x', rawValue: 'AVAILABLE', hasSource: true
  });
  const record = contract.createCapabilityRecord({ id: 'synthetic:verified', dimensions: [dim] });
  const statusAnalysis = diag.analyzeStatus(record);
  assert.strictEqual(statusAnalysis.overallStatus, 'VERIFIED');
});

// ---------------------------------------------------------------------
// 5. Partially verified capability (real Kiswahili case)
// ---------------------------------------------------------------------
test('5. Kiswahili diagnosis reports PARTIALLY_VERIFIED, matching Phase 2 record directly', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('kiswahili');
  assert.strictEqual(result.diagnosis.overallStatus, 'PARTIALLY_VERIFIED');
});

// ---------------------------------------------------------------------
// 6. Blocked capability — blockers are identified and non-empty
// ---------------------------------------------------------------------
test('6. blocker identification returns real, non-empty blockers for Kiswahili', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('swahili');
  const blockerStage = result.stages.find((s) => s.stage === 'BLOCKER_IDENTIFICATION');
  assert.strictEqual(blockerStage.available, true);
  assert.ok(blockerStage.blockers.length > 0);
});

// ---------------------------------------------------------------------
// 7. Missing dependency (real: grammar/stt/etc. placeholders)
// ---------------------------------------------------------------------
test('7. missing-dependency stage finds MISSING-status placeholder dimensions', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('kiswahili');
  const missingStage = result.stages.find((s) => s.stage === 'MISSING_DEPENDENCY_IDENTIFICATION');
  assert.strictEqual(missingStage.available, true);
  assert.ok(missingStage.missing.some((m) => m.dependency === 'language:sw:grammar'));
});

// ---------------------------------------------------------------------
// 8. Unverified dependency — vocabulary keeps status NOT_VERIFIED, never
//    silently reclassified as MISSING (§6 core rule).
// ---------------------------------------------------------------------
test('8. real evidence of "not ready" is NOT_VERIFIED, never relabelled MISSING', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('kiswahili');
  const vocab = result.diagnosis.dependencyTraversal.find((e) => e.target === 'language:sw:vocabulary');
  assert.strictEqual(vocab.status, 'NOT_VERIFIED');
  assert.notStrictEqual(vocab.status, 'MISSING');
});

// ---------------------------------------------------------------------
// 9. Failed dependency (synthetic — no FAILED case exists in this
//    repository's real data; tested directly against getBlockers()
//    honesty, not fabricated diagnosis output)
// ---------------------------------------------------------------------
test('9. a synthetic FAILED-status edge surfaces as a blocker with status preserved verbatim', () => {
  freshWindow();
  const diag = loadFullStack();
  const graphMod = global.window.CozyOS.CapabilityDependencyGraph;
  const g = new graphMod.CozyCapabilityDependencyGraph();
  g.addNode('CAPABILITY', 'synthetic:failed', {});
  g.addNode('DEPENDENCY', 'synthetic:failed:dep', {});
  g.addEdge({ source: 'synthetic:failed', sourceType: 'CAPABILITY', target: 'synthetic:failed:dep', targetType: 'DEPENDENCY', relationship: 'depends_on', status: 'FAILED', confidence: 'manifest', evidence: 'test-injected' });
  const blockers = diag.identifyBlockers(g, 'synthetic:failed');
  assert.strictEqual(blockers.blockers[0].status, 'FAILED');
});

// ---------------------------------------------------------------------
// 10. Evidence-backed diagnosis — manifest confidence maps to
//     SOURCE_VERIFIED_LIVE, not merely "exists"
// ---------------------------------------------------------------------
test('10. evidence analysis classifies manifest confidence as SOURCE_VERIFIED_LIVE', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('kiswahili');
  const evidenceStage = result.stages.find((s) => s.stage === 'EVIDENCE_ANALYSIS');
  const respGen = evidenceStage.perDimension.find((d) => d.dimension === 'response_generation');
  assert.strictEqual(respGen.strength, 'SOURCE_VERIFIED_LIVE');
});

// ---------------------------------------------------------------------
// 11. Insufficient evidence — Phase 3 graph module absent
// ---------------------------------------------------------------------
test('11. missing Phase 3 module yields INSUFFICIENT_EVIDENCE, not a fabricated diagnosis', () => {
  freshWindow(); // Phase 3/2 deliberately NOT loaded
  loadModule(path.join('..', 'capability-self-diagnosis.js'));
  const diag = global.window.CozyOS.CapabilitySelfDiagnosis;
  const result = diag.diagnose('kiswahili');
  assert.strictEqual(result.result, diag.DIAGNOSIS_RESULT.INSUFFICIENT_EVIDENCE);
  assert.ok(/Phase 3/.test(result.stages[result.stages.length - 1].reason));
});

// ---------------------------------------------------------------------
// 12. Multiple capability dimensions all represented
// ---------------------------------------------------------------------
test('12. all ten Phase 2 dimensions appear in dimension analysis', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('kiswahili');
  const dimStage = result.stages.find((s) => s.stage === 'DIMENSION_ANALYSIS');
  assert.strictEqual(dimStage.dimensions.length, 10);
});

// ---------------------------------------------------------------------
// 13. Source-status preservation — raw registry values untouched
// ---------------------------------------------------------------------
test('13. dimension analysis preserves raw sourceStatus values verbatim', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('kiswahili');
  const dimStage = result.stages.find((s) => s.stage === 'DIMENSION_ANALYSIS');
  const vocab = dimStage.dimensions.find((d) => d.dimension === 'vocabulary');
  assert.strictEqual(vocab.sourceStatus.rawValue, 'NOT_READY');
  assert.strictEqual(vocab.sourceStatus.field, 'resourceState');
});

// ---------------------------------------------------------------------
// 14. Dependency traversal — every capability edge is represented
// ---------------------------------------------------------------------
test('14. dependency traversal count matches graph edges from the capability node', () => {
  freshWindow();
  const diag = loadFullStack();
  const graphMod = global.window.CozyOS.CapabilityDependencyGraph;
  const built = graphMod.buildKiswahiliDependencyGraph();
  const result = diag.diagnose('kiswahili');
  const realEdgeCount = built.graph.listEdges({ source: 'language:sw' }).length;
  assert.strictEqual(result.diagnosis.dependencyTraversal.length, realEdgeCount);
});

// ---------------------------------------------------------------------
// 15. Blocker identification excludes clear (AVAILABLE/VERIFIED) deps
// ---------------------------------------------------------------------
test('15. response_generation (AVAILABLE) is excluded from blockers', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('kiswahili');
  const blockerStage = result.stages.find((s) => s.stage === 'BLOCKER_IDENTIFICATION');
  assert.ok(!blockerStage.blockers.some((b) => b.dependency === 'language:sw:response_generation'));
});

// ---------------------------------------------------------------------
// 16. Next-build recommendation prioritizes the required, evidence-backed
//     blocker over non-required MISSING placeholders
// ---------------------------------------------------------------------
test('16. next-build recommendation picks required "vocabulary", not a non-required placeholder', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('kiswahili');
  assert.strictEqual(result.diagnosis.nextRequiredBuild.dependency, 'language:sw:vocabulary');
  assert.strictEqual(result.diagnosis.nextRequiredBuild.required, true);
});

// ---------------------------------------------------------------------
// 17. Kiswahili end-to-end proof — full structural shape from §9
// ---------------------------------------------------------------------
test('17. Kiswahili end-to-end diagnosis produces every required §9 field from real data', () => {
  freshWindow();
  const diag = loadFullStack();
  const result = diag.diagnose('Why am I not fully fluent in Kiswahili?');
  const d = result.diagnosis;
  assert.strictEqual(d.overallStatus, 'PARTIALLY_VERIFIED');
  assert.ok(d.workingDimensions.includes('response_generation'));
  assert.ok(d.incompleteDimensions.includes('vocabulary'));
  assert.strictEqual(d.primaryBlocker.dependency, 'language:sw:vocabulary');
  assert.strictEqual(d.nextRequiredBuild.dependency, 'language:sw:vocabulary');
  assert.strictEqual(d.verificationRequired.required, true);
});

// ---------------------------------------------------------------------
// 18. No hallucinated dependency — every traversal edge target is a real
//     node that Phase 3 actually registered, not invented by Phase 4
// ---------------------------------------------------------------------
test('18. every dependency-traversal target exists as a real graph node', () => {
  freshWindow();
  const diag = loadFullStack();
  const graphMod = global.window.CozyOS.CapabilityDependencyGraph;
  const built = graphMod.buildKiswahiliDependencyGraph();
  const result = diag.diagnose('kiswahili');
  for (const edge of result.diagnosis.dependencyTraversal) {
    const node = built.graph.getNode(edge.targetType, edge.target);
    assert.ok(node, `Phase 4 reported a target "${edge.target}" that Phase 3 never registered.`);
  }
});

// ---------------------------------------------------------------------
// 19. Phase 2 contract regression — untouched by Phase 4 load
// ---------------------------------------------------------------------
test('19. unified-capability-contract.js still resolves the real Kiswahili record after Phase 4 loads', () => {
  freshWindow();
  loadFullStack();
  const contract = global.window.CozyOS.UnifiedCapabilityContract;
  const record = contract.buildKiswahiliValidationRecord();
  assert.strictEqual(record.overallStatus.value, 'PARTIALLY_VERIFIED');
});

// ---------------------------------------------------------------------
// 20. Phase 3 graph regression — untouched by Phase 4 load
// ---------------------------------------------------------------------
test('20. capability-dependency-graph.js getBlockers() still behaves identically after Phase 4 loads', () => {
  freshWindow();
  loadFullStack();
  const graphMod = global.window.CozyOS.CapabilityDependencyGraph;
  const built = graphMod.buildKiswahiliDependencyGraph();
  const blockers = built.graph.getBlockers('language:sw');
  assert.strictEqual(blockers.available, true);
  assert.ok(blockers.blockers.some((b) => b.dependency === 'language:sw:vocabulary'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
