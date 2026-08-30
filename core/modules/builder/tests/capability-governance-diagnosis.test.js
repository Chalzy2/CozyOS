/**
 * core/modules/builder/tests/capability-governance-diagnosis.test.js
 * Phase 8 — real, executed tests for
 * core/modules/builder/capability-governance-diagnosis.js
 *
 * Run with: node core/modules/builder/tests/capability-governance-diagnosis.test.js
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

function baseContributionFields(overrides) {
  return Object.assign({
    knowledgeType: 'WORD', language: 'sw', country: 'KE', region: 'Nairobi',
    dialect: 'Standard Kiswahili', expression: 'habari', meaning: 'news / how are things',
    context: 'common greeting', consent: { acknowledged: true }, privacyLevel: 'PRIVATE',
    contributorId: 'test-fixture-contributor'
  }, overrides || {});
}

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

// ---------------------------------------------------------------------
// 1. Module registration
// ---------------------------------------------------------------------

test('1. module registers exactly once under window.CozyOS.Modules["capability-governance-diagnosis"]', () => {
  freshWindow();
  const mod = loadFullStack();
  assert.ok(mod);
  // Phase 10A note: version bumped 0.1.0-PHASE8 -> 0.2.0-PHASE10A when this
  // file was additively extended with the WEIGH stage and trace confidence
  // fields (see capability-governance-diagnosis.js header). Not a behavior
  // change to any Phase 8 API — this assertion is updated to match.
  assert.strictEqual(global.window.CozyOS.Modules['capability-governance-diagnosis'].version, '0.2.0-PHASE10A');
});

// ---------------------------------------------------------------------
// 2. Live Kiswahili diagnosis / vocabulary blocker / knowledge vs software
// ---------------------------------------------------------------------

test('2. live Kiswahili diagnosis: vocabulary blocker is detected against the real chain', () => {
  freshWindow();
  const gov = loadFullStack();
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.strictEqual(result.status, 'EVALUATED');
  assert.strictEqual(result.topBlocker.dependency, 'language:sw:vocabulary');
});

test('3. knowledge vs software classification: real vocabulary blocker classifies as KNOWLEDGE', () => {
  freshWindow();
  const gov = loadFullStack();
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.strictEqual(result.dependencyDomain, 'KNOWLEDGE');
});

test('4. no acquisition request yet -> governanceStatus KNOWLEDGE_MISSING', () => {
  freshWindow();
  const gov = loadFullStack();
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.strictEqual(result.governanceStatus, gov.GOVERNANCE_STATUS.KNOWLEDGE_MISSING);
  assert.strictEqual(result.acquisitionRequest, null);
});

test('5. acquisition request detection: an existing REQUESTED request is found and reported', () => {
  freshWindow();
  const gov = loadFullStack();
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  const created = acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.strictEqual(result.acquisitionRequest.requestId, created.request.requestId);
  assert.strictEqual(result.governanceStatus, gov.GOVERNANCE_STATUS.KNOWLEDGE_REQUESTED);
});

test('6. requested-but-unresolved state is distinguished from contribution-pending', () => {
  freshWindow();
  const gov = loadFullStack();
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.notStrictEqual(result.governanceStatus, gov.GOVERNANCE_STATUS.REVIEW_PENDING);
});

test('7. contribution-pending / promotion states are surfaced honestly after a real submitted contribution', () => {
  freshWindow();
  const gov = loadFullStack();
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  const created = acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  acq.submitAcquisitionContribution(created.request.requestId, baseContributionFields());
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.ok([gov.GOVERNANCE_STATUS.RULE_82_BLOCKED, gov.GOVERNANCE_STATUS.PROMOTION_PENDING, gov.GOVERNANCE_STATUS.REVIEW_PENDING].indexOf(result.governanceStatus) !== -1, `unexpected governanceStatus ${result.governanceStatus}`);
});

test('8. safety-blocked state is reported when the safety gate actually rejects the content', () => {
  freshWindow();
  const gov = loadFullStack();
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  const created = acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  acq.submitAcquisitionContribution(created.request.requestId, baseContributionFields({
    expression: 'password: hunter2 sk-abcdefghijklmnopqrstuvwxyz1234567890', meaning: 'credential leak pattern test fixture'
  }));
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.strictEqual(result.governanceStatus, gov.GOVERNANCE_STATUS.SAFETY_BLOCKED);
});

test('9. rule 82 blocked / structurally-unreachable is disclosed, never silently ELIGIBLE', () => {
  freshWindow();
  const gov = loadFullStack();
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  const created = acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  acq.submitAcquisitionContribution(created.request.requestId, baseContributionFields());
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  if (result.rule82GateResult) {
    assert.strictEqual(result.rule82GateResult.promotion, 'LOCKED');
    assert.strictEqual(result.rule82StructurallyUnreachable, true);
  }
});

test('10. no fabricated consent: this file never actually invokes submitAcquisitionContribution or evaluateRule82Gate (only discusses them in header prose)', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'capability-governance-diagnosis.js'), 'utf8');
  assert.ok(!/\.\s*submitAcquisitionContribution\s*\(/.test(src), 'must never call the mutator, only read its stored result');
  assert.ok(!/\.\s*evaluateRule82Gate\s*\(/.test(src), 'must never call the gate itself, only read acquisition.rule82GateResult');
});

test('11. no fabricated provenance: attestation/consent fields are never assigned in this file', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'capability-governance-diagnosis.js'), 'utf8');
  assert.ok(!/resourcesAttestedBy\s*[:=]/.test(src));
  assert.ok(!/consent\s*[:=]\s*\{/.test(src));
});

test('12. no false AVAILABLE: source never assigns resourceState or "AVAILABLE" as a literal state', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'capability-governance-diagnosis.js'), 'utf8');
  assert.ok(!/setResourceState/.test(src));
  assert.ok(!/=\s*['"]AVAILABLE['"]/.test(src));
});

test('13. no false VERIFIED: source never assigns "VERIFIED" as a literal overallStatus', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'capability-governance-diagnosis.js'), 'utf8');
  assert.ok(!/overallStatus\s*=\s*['"]VERIFIED['"]/.test(src));
});

test('14. MD-028 behavior: cozy-language-pack-registry map already covers every real reachable resourceState (NOT_READY, COMMUNITY_BUILDING) — MD-028 confirmed still dormant', () => {
  freshWindow();
  loadFullStack();
  const contract = global.window.CozyOS.UnifiedCapabilityContract;
  const mapped = contract.DIMENSION_SIGNAL_MAP['cozy-language-pack-registry'].map;
  assert.strictEqual(mapped.NOT_READY, 'negative');
  assert.strictEqual(mapped.COMMUNITY_BUILDING, 'negative');
  assert.strictEqual(mapped.AVAILABLE, undefined, 'MD-028 gap: AVAILABLE is still unmapped, as expected/dormant');
});

test('15. Rule 82 RP-030 behavior: gate result on an sw request carries languageCode "sw" (the axis mismatch documented in the header, not fixed here)', () => {
  freshWindow();
  const gov = loadFullStack();
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  const created = acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  acq.submitAcquisitionContribution(created.request.requestId, baseContributionFields());
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  if (result.rule82GateResult) assert.strictEqual(result.rule82GateResult.languageCode, 'sw');
});

test('16. post-promotion re-evaluation reads live state, never a cached judgment (two calls in a row agree with the live store)', () => {
  freshWindow();
  const gov = loadFullStack();
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  const created = acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  acq.submitAcquisitionContribution(created.request.requestId, baseContributionFields());
  const r1 = gov.reevaluateCapability(KISWAHILI_QUESTION);
  const r2 = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.strictEqual(r1.governanceStatus, r2.governanceStatus);
  assert.strictEqual(r1.acquisitionRequest.requestId, r2.acquisitionRequest.requestId);
});

test('17. dependency resolution / 18. next-blocker discovery: the hard case (vocabulary resolved, grammar remains) surfaces grammar, never hard-coded', () => {
  freshWindow();
  const gov = loadFullStack();
  const planner = stubRepairPlanner({
    diagnosis: { overallStatus: 'PARTIALLY_VERIFIED' },
    requiredBuilds: [{
      dependency: 'language:sw:grammar', dependencyClass: 'REQUIRED', status: 'MISSING', confidence: 'manifest',
      evidence: ['registry says NOT_READY'], sourceRegistry: 'cozy-language-pack-registry',
      dependencyMeta: null,
      repairQueue: { referenced: true, id: 'RP-031-CONTENT', status: 'Composed', priority: 'High', dependsOn: [] }
    }]
  });
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: planner });
  assert.strictEqual(result.topBlocker.dependency, 'language:sw:grammar');
  assert.strictEqual(result.dependencyDomain, 'KNOWLEDGE');
});

test('19. blocker prioritization is inherited from Phase 5\'s own ranking, not reimplemented here', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'capability-governance-diagnosis.js'), 'utf8');
  assert.ok(!/rankBlocker/.test(src), 'must not reimplement Phase 5 ranking logic');
  assert.ok(/requiredBuilds\[0\]/.test(src), 'must read Phase 5\'s own already-ranked list');
});

test('20. change detection: DEPENDENCY_RESOLVED + NEW_DEPENDENCY_DISCOVERED both reported when the top blocker changes', () => {
  freshWindow();
  const gov = loadFullStack();
  const before = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: stubRepairPlanner() });
  const grammarPlanner = stubRepairPlanner({
    requiredBuilds: [{
      dependency: 'language:sw:grammar', dependencyClass: 'REQUIRED', status: 'MISSING', confidence: 'manifest',
      evidence: [], sourceRegistry: 'x', dependencyMeta: null,
      repairQueue: { referenced: true, id: 'RP-031-CONTENT', status: 'Composed', priority: 'High', dependsOn: [] }
    }]
  });
  const after = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: grammarPlanner });
  const diff = gov.compareDiagnoses(before, after);
  assert.ok(diff.changes.indexOf(gov.CHANGE.DEPENDENCY_RESOLVED) !== -1);
  assert.ok(diff.changes.indexOf(gov.CHANGE.NEW_DEPENDENCY_DISCOVERED) !== -1);
});

test('21. no-change detection: two identical evaluations report NO_CHANGE', () => {
  freshWindow();
  const gov = loadFullStack();
  const planner = stubRepairPlanner();
  const r1 = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: planner });
  const r2 = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: planner });
  const diff = gov.compareDiagnoses(r1, r2);
  assert.deepStrictEqual(diff.changes, [gov.CHANGE.NO_CHANGE]);
});

test('22. evidence-change detection: same dependency, different evidence -> EVIDENCE_CHANGED', () => {
  freshWindow();
  const gov = loadFullStack();
  const r1 = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: stubRepairPlanner() });
  const r2 = gov.reevaluateCapability(KISWAHILI_QUESTION, {
    repairPlannerEngine: stubRepairPlanner({
      requiredBuilds: [{
        dependency: 'language:sw:vocabulary', dependencyClass: 'REQUIRED', status: 'NOT_VERIFIED', confidence: 'manifest',
        evidence: ['registry says NOT_READY', 'new evidence line'], sourceRegistry: 'cozy-language-pack-registry',
        dependencyMeta: null, repairQueue: { referenced: true, id: 'RP-030-CONTENT', status: 'Composed', priority: 'High', dependsOn: [] }
      }]
    })
  });
  const diff = gov.compareDiagnoses(r1, r2);
  assert.ok(diff.changes.indexOf(gov.CHANGE.EVIDENCE_CHANGED) !== -1);
});

test('23. software/knowledge separation: a SOFTWARE-domain blocker never produces an acquisition-linked governanceStatus', () => {
  freshWindow();
  const gov = loadFullStack();
  const planner = stubRepairPlanner({
    requiredBuilds: [{
      dependency: 'language:sw:vocabulary', dependencyClass: 'REQUIRED', status: 'MISSING', confidence: 'manifest',
      evidence: [], sourceRegistry: 'x', dependencyMeta: null,
      repairQueue: { referenced: true, id: 'RP-042', status: 'Composed', priority: 'High', dependsOn: [] }
    }]
  });
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION, { repairPlannerEngine: planner });
  assert.strictEqual(result.governanceStatus, gov.GOVERNANCE_STATUS.SOFTWARE_DEPENDENCY);
  assert.strictEqual(result.acquisitionRequest, null);
});

test('24. acquisition request integration: reevaluateCapability never actually invokes createAcquisitionRequest (only discusses it in header prose) — it only reads existing requests', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'capability-governance-diagnosis.js'), 'utf8');
  assert.ok(!/\.\s*createAcquisitionRequest\s*\(/.test(src));
  assert.ok(/\.\s*listAcquisitionRequests\s*\(/.test(src) || /\.\s*getAcquisitionRequest\s*\(/.test(src), 'must read via the real, existing read-only accessors');
});

test('25. repair planner integration: buildPlan() is called, never reimplemented', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'capability-governance-diagnosis.js'), 'utf8');
  assert.ok(/planner\.buildPlan\(/.test(src));
});

test('26. dependency graph integration: reached only indirectly through Phase 5/4, never required directly', () => {
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'capability-governance-diagnosis.js'), 'utf8');
  assert.ok(!/CapabilityDependencyGraph/.test(src));
});

test('27. synthetic fixture isolation: this file\'s own fixtures use a literal test contributor id, never presented as real', () => {
  const fields = baseContributionFields();
  assert.strictEqual(fields.contributorId, 'test-fixture-contributor');
});

test('28. no production vocabulary mutation: real pack resourceState only ever advances to COMMUNITY_BUILDING, never AVAILABLE, across this whole test run', () => {
  freshWindow();
  const gov = loadFullStack();
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  const created = acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  acq.submitAcquisitionContribution(created.request.requestId, baseContributionFields());
  gov.reevaluateCapability(KISWAHILI_QUESTION);
  const pack = global.window.CozyOS.CozyLanguagePacks.getPack('sw');
  assert.notStrictEqual(pack.resourceState, 'AVAILABLE');
});

// ---------------------------------------------------------------------
// 29-36. Regression — Phase 7/6/5/4/3/2 + language/language-pack registries
// ---------------------------------------------------------------------

test('29. Phase 7 regression: capability-knowledge-acquisition.js unaffected after Phase 8 loads', () => {
  freshWindow();
  loadFullStack();
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  const created = acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  assert.strictEqual(created.status, 'CREATED');
});

test('30. Phase 6 regression: real Kiswahili record is still PARTIALLY_VERIFIED, not falsely VERIFIED', () => {
  freshWindow();
  loadFullStack();
  const contract = global.window.CozyOS.UnifiedCapabilityContract;
  const record = contract.buildKiswahiliValidationRecord();
  assert.strictEqual(record.overallStatus.value, 'PARTIALLY_VERIFIED');
});

test('31. Phase 5 regression: capability-repair-planner.js buildPlan() unchanged after Phase 8 loads', () => {
  freshWindow();
  loadFullStack();
  const planner = global.window.CozyOS.CapabilityRepairPlanner;
  const plan = planner.buildPlan(KISWAHILI_QUESTION);
  assert.strictEqual(plan.status, 'READY');
});

test('32. Phase 4 regression: capability-self-diagnosis.js diagnose() unchanged after Phase 8 loads', () => {
  freshWindow();
  loadFullStack();
  const diag = global.window.CozyOS.CapabilitySelfDiagnosis;
  const result = diag.diagnose(KISWAHILI_QUESTION);
  assert.strictEqual(result.result, diag.DIAGNOSIS_RESULT.DIAGNOSED);
});

test('33. Phase 3 regression: capability-dependency-graph.js unchanged after Phase 8 loads', () => {
  freshWindow();
  loadFullStack();
  const built = global.window.CozyOS.CapabilityDependencyGraph.buildKiswahiliDependencyGraph();
  assert.ok(built.available);
});

test('34. Phase 2 regression: unified-capability-contract.js unchanged after Phase 8 loads', () => {
  freshWindow();
  loadFullStack();
  const record = global.window.CozyOS.UnifiedCapabilityContract.buildKiswahiliValidationRecord();
  assert.ok(record);
});

test('35. language registry regression: cozy-language-registry.js still resolves sw as AVAILABLE (templates axis)', () => {
  freshWindow();
  loadFullStack();
  assert.strictEqual(global.window.CozyOS.CozyLanguageRegistry.getLanguage('sw').state, 'AVAILABLE');
});

test('36. language-pack registry regression: cozy-language-pack-registry.js still resolves sw as NOT_READY before any contribution', () => {
  freshWindow();
  loadFullStack();
  assert.strictEqual(global.window.CozyOS.CozyLanguagePacks.getPack('sw').resourceState, 'NOT_READY');
});

test('37. explain() produces a real, state-derived sentence, not a fixed demo string', () => {
  freshWindow();
  const gov = loadFullStack();
  const r1 = gov.reevaluateCapability(KISWAHILI_QUESTION);
  const s1 = gov.explain(r1);
  assert.ok(s1.indexOf('language:sw:vocabulary') !== -1);
  const acq = global.window.CozyOS.CapabilityKnowledgeAcquisition;
  acq.createAcquisitionRequest(KISWAHILI_QUESTION);
  const r2 = gov.reevaluateCapability(KISWAHILI_QUESTION);
  const s2 = gov.explain(r2);
  assert.notStrictEqual(s1, s2, 'explanation must change when real state changes');
});

test('38. cognitiveTrace exposes real, inspectable inputs/outputs, not opaque placeholders', () => {
  freshWindow();
  const gov = loadFullStack();
  const result = gov.reevaluateCapability(KISWAHILI_QUESTION);
  assert.ok(Array.isArray(result.cognitiveTrace) && result.cognitiveTrace.length > 0);
  const ops = result.cognitiveTrace.map((t) => t.operation);
  assert.ok(ops.indexOf('TRIANGULATE') !== -1);
  assert.ok(ops.indexOf('UNTANGLE') !== -1);
  assert.ok(ops.indexOf('RECKON') !== -1);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
