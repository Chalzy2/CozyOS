/**
 * core/modules/builder/tests/capability-dependency-graph.test.js
 * Phase 3 — real, executed tests for
 * core/modules/builder/capability-dependency-graph.js
 *
 * Run with: node core/modules/builder/tests/capability-dependency-graph.test.js
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

function loadGraphModule() {
  loadModule(path.join('..', 'capability-dependency-graph.js'));
  return global.window.CozyOS.CapabilityDependencyGraph;
}

function loadContractModule() {
  loadModule(path.join('..', 'unified-capability-contract.js'));
  return global.window.CozyOS.UnifiedCapabilityContract;
}

function loadRealLanguageRegistries() {
  loadModule(path.join('..', '..', 'intelligence', 'language', 'cozy-language-registry.js'));
  loadModule(path.join('..', '..', 'intelligence', 'language-packs', 'cozy-language-pack-registry.js'));
}

function loadPlatformDependencyEngine() {
  loadModule(path.join('..', '..', '..', 'platform', 'file-registry.js'));
  loadModule(path.join('..', '..', '..', 'platform', 'dependency-engine.js'));
}

// ---------------------------------------------------------------------
// 1. Graph initialization
// ---------------------------------------------------------------------
freshWindow();
let mod = loadGraphModule();

test('1. graph initializes with zero nodes/edges', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  const diag = graph.getDiagnosticsReport();
  assert.strictEqual(diag.totalNodes, 0);
  assert.strictEqual(diag.totalEdges, 0);
});

// ---------------------------------------------------------------------
// 2. Capability node registration
// ---------------------------------------------------------------------
test('2. capability node registration', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  const result = graph.addNode('CAPABILITY', 'language:sw', { name: 'Kiswahili' });
  assert.strictEqual(result.created, true);
  assert.strictEqual(graph.hasNode('CAPABILITY', 'language:sw'), true);
  assert.strictEqual(graph.getNode('CAPABILITY', 'language:sw').meta.name, 'Kiswahili');
});

// ---------------------------------------------------------------------
// 3. Dependency node registration
// ---------------------------------------------------------------------
test('3. dependency node registration', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  const result = graph.addNode('DEPENDENCY', 'language:sw:vocabulary', { key: 'vocabulary' });
  assert.strictEqual(result.created, true);
  assert.strictEqual(graph.hasNode('DEPENDENCY', 'language:sw:vocabulary'), true);
});

// ---------------------------------------------------------------------
// 4. capability -> dependency edge
// ---------------------------------------------------------------------
test('4. capability -> dependency edge (depends_on)', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('DEPENDENCY', 'language:sw:vocabulary', {});
  const { edge, created } = graph.addEdge({
    source: 'language:sw', sourceType: 'CAPABILITY',
    target: 'language:sw:vocabulary', targetType: 'DEPENDENCY',
    relationship: 'depends_on', sourceRegistry: 'cozy-language-pack-registry',
    evidence: 'resourceState="NOT_READY"', status: 'NOT_VERIFIED', confidence: 'manifest'
  });
  assert.strictEqual(created, true);
  assert.strictEqual(edge.relationship, 'depends_on');
  assert.strictEqual(edge.source, 'language:sw');
  assert.strictEqual(edge.target, 'language:sw:vocabulary');
});

// ---------------------------------------------------------------------
// 5. capability -> implementation edge
// ---------------------------------------------------------------------
test('5. capability -> implementation edge (implemented_by)', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('IMPLEMENTATION', 'core/modules/intelligence/providers/rule-based-conversational-provider.js', {});
  const { edge } = graph.addEdge({
    source: 'language:sw', sourceType: 'CAPABILITY',
    target: 'core/modules/intelligence/providers/rule-based-conversational-provider.js', targetType: 'IMPLEMENTATION',
    relationship: 'implemented_by', evidence: 'integrationPoints entry', confidence: 'best-effort'
  });
  assert.strictEqual(edge.relationship, 'implemented_by');
});

// ---------------------------------------------------------------------
// 6. capability -> test/evidence edge
// ---------------------------------------------------------------------
test('6. capability -> test/evidence edge (verified_by)', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('TEST', 'cozy-language-registry.test.js', {});
  const { edge } = graph.addEdge({
    source: 'language:sw', sourceType: 'CAPABILITY',
    target: 'cozy-language-registry.test.js', targetType: 'TEST',
    relationship: 'verified_by', evidence: 'per file header disclosure', confidence: 'unverified'
  });
  assert.strictEqual(edge.relationship, 'verified_by');
  assert.strictEqual(edge.targetType, 'TEST');
});

// ---------------------------------------------------------------------
// 7. Provenance preservation
// ---------------------------------------------------------------------
test('7. provenance preservation on edges', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('DEPENDENCY', 'language:sw:vocabulary', {});
  const { edge } = graph.addEdge({
    source: 'language:sw', sourceType: 'CAPABILITY',
    target: 'language:sw:vocabulary', targetType: 'DEPENDENCY',
    relationship: 'depends_on', sourceRegistry: 'cozy-language-pack-registry',
    evidence: 'core/modules/intelligence/language-packs/cozy-language-pack-registry.js#resourceState="NOT_READY"'
  });
  assert.strictEqual(edge.sourceRegistry, 'cozy-language-pack-registry');
  assert.ok(edge.evidence.length === 1);
  assert.ok(edge.evidence[0].includes('resourceState'));
  assert.ok(edge.createdAt);
});

// ---------------------------------------------------------------------
// 8. Status preservation (source-native, not flattened)
// ---------------------------------------------------------------------
test('8. status preservation — source-native status carried through unchanged', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('DEPENDENCY', 'language:sw:vocabulary', {});
  const { edge } = graph.addEdge({
    source: 'language:sw', sourceType: 'CAPABILITY',
    target: 'language:sw:vocabulary', targetType: 'DEPENDENCY',
    relationship: 'depends_on', status: mod.DEPENDENCY_STATUS.BLOCKED, evidence: 'x'
  });
  assert.strictEqual(edge.status, 'BLOCKED');
  assert.notStrictEqual(edge.status, 'MISSING'); // not silently reclassified
});

// ---------------------------------------------------------------------
// 9. Blocker detection
// ---------------------------------------------------------------------
test('9. blocker detection — getBlockers() separates blocking from clear', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('DEPENDENCY', 'language:sw:vocabulary', {});
  graph.addNode('DEPENDENCY', 'language:sw:response_generation', {});
  graph.addEdge({ source: 'language:sw', sourceType: 'CAPABILITY', target: 'language:sw:vocabulary', targetType: 'DEPENDENCY', relationship: 'depends_on', status: 'NOT_VERIFIED', evidence: 'x' });
  graph.addEdge({ source: 'language:sw', sourceType: 'CAPABILITY', target: 'language:sw:response_generation', targetType: 'DEPENDENCY', relationship: 'depends_on', status: 'AVAILABLE', evidence: 'y' });
  const report = graph.getBlockers('language:sw');
  assert.strictEqual(report.available, true);
  assert.strictEqual(report.blockers.length, 1);
  assert.strictEqual(report.clear.length, 1);
  assert.strictEqual(report.blockers[0].dependency, 'language:sw:vocabulary');
});

// ---------------------------------------------------------------------
// 10. Missing dependency detection
// ---------------------------------------------------------------------
test('10. missing dependency detection — unregistered capability returns available:false', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  const report = graph.getBlockers('language:unknown');
  assert.strictEqual(report.available, false);
});

test('10b. missing dependency detection — MISSING status surfaces as a blocker', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('DEPENDENCY', 'language:sw:stt', {});
  graph.addEdge({ source: 'language:sw', sourceType: 'CAPABILITY', target: 'language:sw:stt', targetType: 'DEPENDENCY', relationship: 'depends_on', status: 'MISSING' });
  const report = graph.getBlockers('language:sw');
  assert.strictEqual(report.blockers[0].status, 'MISSING');
});

// ---------------------------------------------------------------------
// 11. Circular dependency handling
// ---------------------------------------------------------------------
test('11. capability-level circular dependency is honestly reported, not hidden', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'cap:a', {});
  graph.addNode('CAPABILITY', 'cap:b', {});
  graph.addEdge({ source: 'cap:a', sourceType: 'CAPABILITY', target: 'cap:b', targetType: 'CAPABILITY', relationship: 'depends_on', evidence: 'x' });
  graph.addEdge({ source: 'cap:b', sourceType: 'CAPABILITY', target: 'cap:a', targetType: 'CAPABILITY', relationship: 'depends_on', evidence: 'y' });
  const report = graph.detectCapabilityCircular();
  assert.ok(report.cycles.length >= 1);
});

test('11b. module-level circular report delegates to the real platform engine', () => {
  loadPlatformDependencyEngine();
  global.window.CozyOS.FileRegistry.replaceAll([
    { path: 'a.js', imports: ['./b'], declaredDependencies: null },
    { path: 'b.js', imports: ['./a'], declaredDependencies: null }
  ]);
  mod = loadGraphModule();
  const graph = new mod.CozyCapabilityDependencyGraph();
  const report = graph.getModuleLevelCircularReport();
  assert.strictEqual(report.available, true);
  assert.strictEqual(report.source, 'core/platform/dependency-engine.js#detectCircular');
  assert.ok(report.cycles.length >= 1);
});

// ---------------------------------------------------------------------
// 12. bestEffort distinction
// ---------------------------------------------------------------------
test('12. bestEffort/manifest confidence distinction is preserved on edges', () => {
  freshWindow();
  mod = loadGraphModule();
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('DEPENDENCY', 'language:sw:vocabulary', {});
  graph.addNode('DEPENDENCY', 'language:sw:grammar', {});
  const manifestEdge = graph.addEdge({ source: 'language:sw', sourceType: 'CAPABILITY', target: 'language:sw:vocabulary', targetType: 'DEPENDENCY', relationship: 'depends_on', evidence: 'x', confidence: 'manifest' }).edge;
  const bestEffortEdge = graph.addEdge({ source: 'language:sw', sourceType: 'CAPABILITY', target: 'language:sw:grammar', targetType: 'DEPENDENCY', relationship: 'depends_on', evidence: 'y', confidence: 'best-effort' }).edge;
  assert.strictEqual(manifestEdge.confidence, 'manifest');
  assert.strictEqual(bestEffortEdge.confidence, 'best-effort');
  assert.notStrictEqual(manifestEdge.confidence, bestEffortEdge.confidence);
});

// ---------------------------------------------------------------------
// 13. unknown/unverified relationship handling
// ---------------------------------------------------------------------
test('13. edge with no evidence is recorded honestly as unverified, not fabricated', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('DEPENDENCY', 'language:sw:tts', {});
  const { edge } = graph.addEdge({ source: 'language:sw', sourceType: 'CAPABILITY', target: 'language:sw:tts', targetType: 'DEPENDENCY', relationship: 'depends_on' });
  assert.strictEqual(edge.confidence, 'unverified');
  assert.strictEqual(edge.evidence.length, 0);
  const diag = graph.getDiagnosticsReport();
  assert.strictEqual(diag.unverifiedEdges, 1);
});

// ---------------------------------------------------------------------
// 14. duplicate edge handling
// ---------------------------------------------------------------------
test('14. duplicate edge is merged, not double-registered', () => {
  const graph = new mod.CozyCapabilityDependencyGraph();
  graph.addNode('CAPABILITY', 'language:sw', {});
  graph.addNode('DEPENDENCY', 'language:sw:vocabulary', {});
  const first = graph.addEdge({ source: 'language:sw', sourceType: 'CAPABILITY', target: 'language:sw:vocabulary', targetType: 'DEPENDENCY', relationship: 'depends_on', evidence: 'evidence-A' });
  const second = graph.addEdge({ source: 'language:sw', sourceType: 'CAPABILITY', target: 'language:sw:vocabulary', targetType: 'DEPENDENCY', relationship: 'depends_on', evidence: 'evidence-B' });
  assert.strictEqual(first.created, true);
  assert.strictEqual(second.created, false);
  assert.strictEqual(second.deduped, true);
  assert.strictEqual(graph.getDiagnosticsReport().totalEdges, 1);
  assert.deepStrictEqual(second.edge.evidence.slice().sort(), ['evidence-A', 'evidence-B']);
});

// ---------------------------------------------------------------------
// 15. Kiswahili dependency graph proof case
// ---------------------------------------------------------------------
test('15. Kiswahili dependency graph proof case builds from real live registries', () => {
  freshWindow();
  loadRealLanguageRegistries();
  const contract = loadContractModule();
  mod = loadGraphModule();
  const result = mod.buildKiswahiliDependencyGraph();
  assert.strictEqual(result.available, true);
  const graph = result.graph;
  assert.strictEqual(graph.hasNode('CAPABILITY', 'language:sw'), true);
  assert.strictEqual(graph.hasNode('DEPENDENCY', 'language:sw:vocabulary'), true);
  assert.strictEqual(graph.hasNode('DEPENDENCY', 'language:sw:response_generation'), true);
  const vocabEdge = graph.listEdges({ source: 'language:sw', target: 'language:sw:vocabulary', relationship: 'depends_on' })[0];
  assert.ok(vocabEdge, 'vocabulary depends_on edge must exist');
  assert.strictEqual(vocabEdge.sourceRegistry, 'cozy-language-pack-registry');
  // real repo evidence: sw pack resourceState is NOT_READY -> negative signal -> NOT_VERIFIED
  assert.strictEqual(vocabEdge.status, 'NOT_VERIFIED');
  const responseGenEdge = graph.listEdges({ source: 'language:sw', target: 'language:sw:response_generation', relationship: 'depends_on' })[0];
  // real repo evidence: sw language state is AVAILABLE -> positive signal -> AVAILABLE
  assert.strictEqual(responseGenEdge.status, 'AVAILABLE');
  const blockers = graph.getBlockers('language:sw');
  assert.strictEqual(blockers.available, true);
  assert.ok(blockers.blockers.some(b => b.dependency === 'language:sw:vocabulary'));
});

// ---------------------------------------------------------------------
// 16. Phase 2 contract remains unchanged
// ---------------------------------------------------------------------
test('16. Phase 2 unified-capability-contract.js is untouched by Phase 3', () => {
  freshWindow();
  const contract = loadContractModule();
  assert.strictEqual(contract.getVersion(), '0.1.0-PHASE2');
  const dim = contract.makeDimension({ key: 'x', required: true, hasSource: false });
  const record = contract.createCapabilityRecord({ id: 'test:cap', dimensions: [dim] });
  assert.strictEqual(record.contractVersion, '0.1.0-PHASE2');
  assert.strictEqual(record.overallStatus.value, contract.OVERALL_STATUS.NOT_FOUND);
});

// ---------------------------------------------------------------------
// 17. Existing platform dependency-engine behavior remains unchanged
// ---------------------------------------------------------------------
test('17. core/platform/dependency-engine.js behavior is unchanged by Phase 3', () => {
  freshWindow();
  loadPlatformDependencyEngine();
  const engine = global.window.CozyOS.DependencyEngine;
  assert.strictEqual(engine.getVersion(), '1.1.0-ENTERPRISE');
  global.window.CozyOS.FileRegistry.replaceAll([
    { path: 'x.js', imports: ['./y'], declaredDependencies: null },
    { path: 'y.js', imports: [], declaredDependencies: null }
  ]);
  const deps = engine.getDependencies('x.js');
  assert.deepStrictEqual(deps.dependencies, ['y.js']);
  assert.strictEqual(deps.bestEffort, true);
  const missing = engine.detectMissingDependencies();
  assert.strictEqual(missing.missing.length, 0);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
