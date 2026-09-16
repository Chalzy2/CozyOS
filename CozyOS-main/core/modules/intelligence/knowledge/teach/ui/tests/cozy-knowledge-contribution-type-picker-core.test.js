/**
 * core/modules/intelligence/knowledge/teach/ui/tests/cozy-knowledge-contribution-type-picker-core.test.js
 * Dashboard Prompt 2 §7 — real, executed tests for
 * cozy-knowledge-contribution-type-picker-core.js
 *
 * Run with: node core/modules/intelligence/knowledge/teach/ui/tests/cozy-knowledge-contribution-type-picker-core.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.stack || err.message}`); failed++; }
}

const roots = {
  ingestion: path.join(__dirname, '..', '..', '..', 'cozy-knowledge-ingestion.js'),
  community: path.join(__dirname, '..', '..', '..', 'cozy-knowledge-community.js'),
  review: path.join(__dirname, '..', '..', '..', 'cozy-knowledge-review.js'),
  templates: path.join(__dirname, '..', '..', '..', '..', 'language', 'cozy-language-templates.js'),
  registry: path.join(__dirname, '..', '..', '..', '..', 'language', 'cozy-language-registry.js'),
  hotspot: path.join(__dirname, '..', '..', '..', '..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
  gate: path.join(__dirname, '..', '..', '..', 'ui', 'cozy-knowledge-safety-gate.js'),
  bridge: path.join(__dirname, '..', '..', '..', 'ui', 'cozy-knowledge-review-hotspot-bridge.js'),
  contributionCore: path.join(__dirname, '..', '..', '..', 'ui', 'cozy-knowledge-contribution-core.js'),
  langPacks: path.join(__dirname, '..', '..', '..', '..', 'language-packs', 'cozy-language-pack-registry.js'),
  teach: path.join(__dirname, '..', '..', 'cozy-teach-cozyai-routing-core.js'),
  picker: path.join(__dirname, '..', 'cozy-knowledge-contribution-type-picker-core.js')
};

function loadAll() {
  Object.values(roots).forEach((p) => { delete require.cache[require.resolve(p)]; });
  global.window = { CozyOS: {} };
  require(roots.ingestion);
  require(roots.community);
  require(roots.review);
  require(roots.templates);
  require(roots.registry);
  require(roots.hotspot);
  require(roots.gate);
  require(roots.bridge);
  require(roots.contributionCore);
  require(roots.langPacks);
  require(roots.teach);
  require(roots.picker);
  return global.window.CozyOS.CozyKnowledgeContributionTypePicker;
}

function loadPickerOnly() {
  delete require.cache[require.resolve(roots.picker)];
  global.window = { CozyOS: {} }; // no CozyTeachCozyAIRouting registered
  require(roots.picker);
  return global.window.CozyOS.CozyKnowledgeContributionTypePicker;
}

console.log('cozy-knowledge-contribution-type-picker-core.test.js');

// ---------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------

test('real accepted contribution types are discovered correctly', () => {
  const picker = loadAll();
  const teach = global.window.CozyOS.CozyTeachCozyAIRouting;
  const result = picker.getPickerOptions();
  assert.strictEqual(result.available, true);
  const values = result.options.map((o) => o.value).sort();
  const real = teach.TEACH_KNOWLEDGE_TYPES.slice().sort();
  assert.deepStrictEqual(values, real, 'picker options must exactly match the real engine types, no more no less');
});

test('unsupported/fake types are rejected', () => {
  const picker = loadAll();
  ['VIDEO', 'AUDIO', 'CULTURE', 'LANGUAGE', '', null, undefined, 'word'].forEach((fake) => {
    assert.strictEqual(picker.isRealContributionType(fake), false, `${fake} must not be treated as real`);
  });
});

test('friendly labels map to real engine values, every option carries the real value', () => {
  const picker = loadAll();
  const result = picker.getPickerOptions();
  result.options.forEach((opt) => {
    assert.ok(picker.isRealContributionType(opt.value), `${opt.value} must be a real type`);
    assert.strictEqual(typeof opt.label, 'string');
    assert.ok(opt.label.length > 0);
    assert.ok(opt.labelSource === 'CURATED' || opt.labelSource === 'FALLBACK_TITLE_CASE');
  });
});

test('every curated FRIENDLY_LABELS key is itself a real engine type (no invented category)', () => {
  const picker = loadAll();
  const teach = global.window.CozyOS.CozyTeachCozyAIRouting;
  Object.keys(picker.FRIENDLY_LABELS).forEach((key) => {
    assert.ok(teach.TEACH_KNOWLEDGE_TYPES.indexOf(key) !== -1, `${key} must exist in the real schema`);
  });
});

test('empty/malformed schemas fail safely (routing module absent)', () => {
  const picker = loadPickerOnly();
  const result = picker.getPickerOptions();
  assert.strictEqual(result.available, false);
  assert.strictEqual(result.reason, 'CAPABILITY_UNAVAILABLE');
  assert.deepStrictEqual(result.options, []);
  assert.strictEqual(picker.isRealContributionType('WORD'), false);
});

// ---------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------

test('default state: no type selected until a real choice is made', () => {
  const picker = loadAll();
  const result = picker.selectContributionType(undefined);
  assert.strictEqual(result.selected, false);
  assert.strictEqual(result.reason, 'NO_TYPE_SELECTED');
});

test('selecting a real contribution type succeeds and returns the real form descriptor', () => {
  const picker = loadAll();
  const result = picker.selectContributionType('WORD');
  assert.strictEqual(result.selected, true);
  assert.strictEqual(result.knowledgeType, 'WORD');
  assert.strictEqual(result.formDescriptor.valid, true);
});

test('changing selection between two real types both succeed independently', () => {
  const picker = loadAll();
  const first = picker.selectContributionType('WORD');
  const second = picker.selectContributionType('PRONUNCIATION');
  assert.strictEqual(first.selected, true);
  assert.strictEqual(second.selected, true);
  assert.notStrictEqual(first.knowledgeType, second.knowledgeType);
});

test('invalid selection (fabricated type) is rejected, never silently accepted', () => {
  const picker = loadAll();
  const result = picker.selectContributionType('VIDEO');
  assert.strictEqual(result.selected, false);
  assert.strictEqual(result.reason, 'UNKNOWN_KNOWLEDGE_TYPE');
});

test('unavailable contribution type (routing module missing) fails closed', () => {
  const picker = loadPickerOnly();
  const result = picker.selectContributionType('WORD');
  assert.strictEqual(result.selected, false);
  assert.strictEqual(result.reason, 'CAPABILITY_UNAVAILABLE');
});

// ---------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------

test('every real accepted type routes to a valid, non-fabricated existing contribution flow', () => {
  const picker = loadAll();
  const teach = global.window.CozyOS.CozyTeachCozyAIRouting;
  teach.TEACH_KNOWLEDGE_TYPES.forEach((realType) => {
    const result = picker.selectContributionType(realType);
    assert.strictEqual(result.selected, true, `${realType} should select`);
    // formDescriptor comes straight from the real, unmodified routing
    // engine's own describeContributionForm() — never re-derived here.
    assert.strictEqual(result.formDescriptor.valid, true);
    assert.strictEqual(result.formDescriptor.knowledgeType, realType);
  });
});

test('no type routes to an invented form (no formDescriptor field is fabricated by this file)', () => {
  const picker = loadAll();
  const teach = global.window.CozyOS.CozyTeachCozyAIRouting;
  const result = picker.selectContributionType('WORD');
  const directDescriptor = teach.describeContributionForm('WORD');
  assert.deepStrictEqual(result.formDescriptor, directDescriptor);
});

// ---------------------------------------------------------------------
// Submission boundary
// ---------------------------------------------------------------------

test('the picker itself exposes no submission function of any kind (never bypasses ingestion)', () => {
  const picker = loadAll();
  assert.strictEqual(typeof picker.submitTeachingContribution, 'undefined');
  assert.strictEqual(typeof picker.submitContribution, 'undefined');
  assert.strictEqual(typeof picker.markVerified, 'undefined');
  assert.strictEqual(typeof picker.markTrusted, 'undefined');
});

// ---------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------

test('picker options never include any contributor/user identity or history field', () => {
  const picker = loadAll();
  const result = picker.getPickerOptions();
  result.options.forEach((opt) => {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(opt, 'contributorId'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(opt, 'userId'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(opt, 'history'), false);
  });
});

// ---------------------------------------------------------------------
// Admin boundary
// ---------------------------------------------------------------------

test('the picker module exposes no role, permission, or moderation-authority concept', () => {
  const picker = loadAll();
  assert.strictEqual(typeof picker.isAdmin, 'undefined');
  assert.strictEqual(typeof picker.grantModeration, 'undefined');
  assert.strictEqual(typeof picker.approve, 'undefined');
  assert.strictEqual(typeof picker.reject, 'undefined');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
