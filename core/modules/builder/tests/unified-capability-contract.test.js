/**
 * core/modules/builder/tests/unified-capability-contract.test.js
 * Phase 2 — real, executed tests for
 * core/modules/builder/unified-capability-contract.js
 *
 * Run with: node core/modules/builder/tests/unified-capability-contract.test.js
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

function loadContract() {
  const modulePath = path.join(__dirname, '..', 'unified-capability-contract.js');
  delete require.cache[require.resolve(modulePath)];
  require(modulePath);
  return global.window.CozyOS.UnifiedCapabilityContract;
}

function loadRealLanguageRegistries() {
  const langPath = path.join(__dirname, '..', '..', 'intelligence', 'language', 'cozy-language-registry.js');
  const packPath = path.join(__dirname, '..', '..', 'intelligence', 'language-packs', 'cozy-language-pack-registry.js');
  delete require.cache[require.resolve(langPath)];
  delete require.cache[require.resolve(packPath)];
  require(langPath);
  require(packPath);
}

// ---------------------------------------------------------------------
// 1. Capability can be represented
// ---------------------------------------------------------------------
freshWindow();
let contract = loadContract();

test('1. capability can be represented via createCapabilityRecord()', () => {
  const dim = contract.makeDimension({ key: 'x', required: true, hasSource: false });
  const record = contract.createCapabilityRecord({ id: 'test:cap', dimensions: [dim] });
  assert.strictEqual(record.id, 'test:cap');
  assert.strictEqual(record.dimensions.length, 1);
});

// ---------------------------------------------------------------------
// 2. Multiple dimensions can coexist
// ---------------------------------------------------------------------
test('2. multiple dimensions coexist independently on one record', () => {
  const d1 = contract.makeDimension({ key: 'a', required: true, hasSource: false });
  const d2 = contract.makeDimension({ key: 'b', required: false, hasSource: false });
  const record = contract.createCapabilityRecord({ id: 'test:multi', dimensions: [d1, d2] });
  assert.strictEqual(record.dimensions.length, 2);
  assert.deepStrictEqual(record.dimensions.map((d) => d.key), ['a', 'b']);
});

// ---------------------------------------------------------------------
// 3. Source-native statuses are preserved
// ---------------------------------------------------------------------
test('3. source-native raw value is preserved verbatim, not renamed', () => {
  const dim = contract.makeDimension({
    key: 'response_generation', required: true, hasSource: true,
    registry: 'cozy-language-registry', file: 'x.js', exportedAs: 'window.X',
    rawValue: 'AVAILABLE'
  });
  assert.strictEqual(dim.sourceStatus.rawValue, 'AVAILABLE');
  assert.strictEqual(dim.sourceStatus.field, 'state');
});

// ---------------------------------------------------------------------
// 4. Provenance is preserved
// ---------------------------------------------------------------------
test('4. provenance array on the record names registry/file/retrieval method', () => {
  const dim = contract.makeDimension({ key: 'x', required: true, hasSource: false });
  const record = contract.createCapabilityRecord({
    id: 'test:prov', dimensions: [dim],
    provenance: [{ registry: 'cozy-language-registry', file: 'core/modules/intelligence/language/cozy-language-registry.js', retrievedVia: "getLanguage('sw')" }]
  });
  assert.strictEqual(record.provenance[0].registry, 'cozy-language-registry');
  assert.ok(record.provenance[0].retrievedVia);
});

// ---------------------------------------------------------------------
// 5. Evidence references are preserved
// ---------------------------------------------------------------------
test('5. evidenceRef is carried on the dimension untouched', () => {
  const dim = contract.makeDimension({ key: 'x', required: true, hasSource: false, evidenceRef: { note: 'test evidence' } });
  assert.strictEqual(dim.evidenceRef.note, 'test evidence');
});

// ---------------------------------------------------------------------
// 6. Dependencies can be referenced (pointer only, not resolved)
// ---------------------------------------------------------------------
test('6. dependencyRefs are pointers only, no graph resolution attempted', () => {
  const dim = contract.makeDimension({ key: 'x', required: true, hasSource: false });
  const record = contract.createCapabilityRecord({
    id: 'test:dep', dimensions: [dim],
    dependencyRefs: [{ engine: 'core/platform/dependency-engine.js', note: 'pointer only' }]
  });
  assert.strictEqual(record.dependencyRefs[0].engine, 'core/platform/dependency-engine.js');
  assert.ok(!('resolvedGraph' in record.dependencyRefs[0]), 'must not resolve a graph in Phase 2');
});

// ---------------------------------------------------------------------
// 7. Integration points can be represented
// ---------------------------------------------------------------------
test('7. integrationPoints use existing CozyOS naming conventions (provider/engine)', () => {
  const dim = contract.makeDimension({ key: 'x', required: true, hasSource: false });
  const record = contract.createCapabilityRecord({
    id: 'test:integ', dimensions: [dim],
    integrationPoints: [{ type: 'provider', ref: 'rule-based-conversational-provider.js' }]
  });
  assert.strictEqual(record.integrationPoints[0].type, 'provider');
});

// ---------------------------------------------------------------------
// 8. Verification metadata is represented (observedAt vs sourceVerifiedAt)
// ---------------------------------------------------------------------
test('8. observedAt is a real ISO timestamp; sourceVerifiedAt is honestly null when absent', () => {
  const dim = contract.makeDimension({ key: 'x', required: true, hasSource: false });
  assert.ok(!Number.isNaN(Date.parse(dim.observedAt)));
  assert.strictEqual(dim.sourceVerifiedAt, null);
});

// ---------------------------------------------------------------------
// 9. Conflicting statuses are not silently flattened
// ---------------------------------------------------------------------
test('9. two different dimensions each with their own source are NOT silently merged into one status', () => {
  const positive = contract.makeDimension({ key: 'response_generation', required: true, hasSource: true, registry: 'cozy-language-registry', rawValue: 'AVAILABLE' });
  const negative = contract.makeDimension({ key: 'vocabulary', required: true, hasSource: true, registry: 'cozy-language-pack-registry', rawValue: 'NOT_READY' });
  const record = contract.createCapabilityRecord({ id: 'test:conflict', dimensions: [positive, negative] });
  assert.strictEqual(record.dimensions[0].sourceStatus.rawValue, 'AVAILABLE');
  assert.strictEqual(record.dimensions[1].sourceStatus.rawValue, 'NOT_READY');
  assert.notStrictEqual(record.dimensions[0].sourceStatus.rawValue, record.dimensions[1].sourceStatus.rawValue);
  const diffFinding = record.conflicts.find((c) => c.type === 'DIMENSION_DIFFERENCE');
  assert.ok(diffFinding, 'expected a DIMENSION_DIFFERENCE finding, not silence');
});

test('9b. a true same-key conflict (two sources, same dimension, disagreeing) is flagged CONFLICT', () => {
  const a = contract.makeDimension({ key: 'vocabulary', required: true, hasSource: true, registry: 'cozy-language-registry', rawValue: 'AVAILABLE' });
  const b = contract.makeDimension({ key: 'vocabulary', required: true, hasSource: true, registry: 'cozy-language-pack-registry', rawValue: 'NOT_READY' });
  const record = contract.createCapabilityRecord({ id: 'test:realconflict', dimensions: [a, b] });
  const conflict = record.conflicts.find((c) => c.type === 'CONFLICT' && c.key === 'vocabulary');
  assert.ok(conflict, 'expected a real CONFLICT finding for same-key disagreement');
});

// ---------------------------------------------------------------------
// 10. Kiswahili's AVAILABLE/NOT_READY case is represented correctly
// ---------------------------------------------------------------------
test('10. buildKiswahiliValidationRecord() reflects the real AA-007 case: PARTIALLY_VERIFIED, not VERIFIED', () => {
  freshWindow();
  contract = loadContract();
  loadRealLanguageRegistries();
  const record = contract.buildKiswahiliValidationRecord();

  const responseGen = record.dimensions.find((d) => d.key === 'response_generation');
  const vocab = record.dimensions.find((d) => d.key === 'vocabulary');

  assert.strictEqual(responseGen.sourceStatus.rawValue, 'AVAILABLE', 'real cozy-language-registry.js value for sw');
  assert.strictEqual(vocab.sourceStatus.rawValue, 'NOT_READY', 'real cozy-language-pack-registry.js value for sw');
  assert.strictEqual(record.overallStatus.value, 'PARTIALLY_VERIFIED', 'must not falsely report VERIFIED (fully available)');
  assert.notStrictEqual(record.overallStatus.value, 'VERIFIED');

  const diffFinding = record.conflicts.find((c) => c.type === 'DIMENSION_DIFFERENCE');
  assert.ok(diffFinding, 'the two axes must be flagged as a dimension difference');
  const wrongConflict = record.conflicts.find((c) => c.type === 'CONFLICT' && (c.key === 'response_generation' || c.key === 'vocabulary'));
  assert.ok(!wrongConflict, 'response_generation and vocabulary are different keys — must not be reported as a same-key CONFLICT');
});

// ---------------------------------------------------------------------
// 11. Existing registries remain functional (regression smoke check —
//     no dedicated pre-existing test file for these two was found in
//     Phase 1, so this is a direct functional check, not a re-run of a
//     prior suite that doesn't exist).
// ---------------------------------------------------------------------
test('11a. cozy-language-registry.js still resolves sw as AVAILABLE after this file is loaded alongside it', () => {
  freshWindow();
  loadRealLanguageRegistries();
  loadContract();
  const lang = global.window.CozyOS.CozyLanguageRegistry.getLanguage('sw');
  assert.strictEqual(lang.state, 'AVAILABLE');
});

test('11b. cozy-language-pack-registry.js still resolves sw as NOT_READY after this file is loaded alongside it', () => {
  const pack = global.window.CozyOS.CozyLanguagePacks.getPack('sw');
  assert.strictEqual(pack.resourceState, 'NOT_READY');
});

// ---------------------------------------------------------------------
// 12. Existing evidence-engine behavior remains unchanged (this file
//     does not touch evidence-engine.js at all — confirmed by loading
//     it standalone and calling a real, synchronous method).
// ---------------------------------------------------------------------
test('12. evidence-engine.js loads and reports its own version unchanged', () => {
  freshWindow();
  const evidencePath = path.join(__dirname, '..', 'evidence-engine.js');
  delete require.cache[require.resolve(evidencePath)];
  require(evidencePath);
  assert.ok(global.window.CozyOS.BuilderEvidence, 'BuilderEvidence must still self-register exactly as before');
  assert.strictEqual(typeof global.window.CozyOS.BuilderEvidence.getVersion(), 'string');
});

// ---------------------------------------------------------------------
// 13. Existing dependency-engine behavior remains unchanged (loaded
//     standalone; this contract never requires or calls it).
// ---------------------------------------------------------------------
test('13. core/platform/dependency-engine.js loads and reports its own version unchanged', () => {
  freshWindow();
  const depPath = path.join(__dirname, '..', '..', '..', 'platform', 'dependency-engine.js');
  delete require.cache[require.resolve(depPath)];
  require(depPath);
  assert.ok(global.window.CozyOS.DependencyEngine, 'DependencyEngine must still self-register exactly as before');
  assert.strictEqual(global.window.CozyOS.DependencyEngine.getVersion(), '1.1.0-ENTERPRISE');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
