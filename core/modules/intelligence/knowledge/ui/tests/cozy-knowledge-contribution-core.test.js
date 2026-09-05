/**
 * core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-contribution-core.test.js
 * RP-029-C Phase 3 — real, executed tests for cozy-knowledge-contribution-core.js
 * Run with: node core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-contribution-core.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  \u2713 ${name}`); passed++; }
  catch (err) { console.log(`  \u2717 ${name}`); console.log(`      ${err.message}`); failed++; }
}

const roots = {
  ingestion: path.join(__dirname, '..', '..', 'cozy-knowledge-ingestion.js'),
  community: path.join(__dirname, '..', '..', 'cozy-knowledge-community.js'),
  review: path.join(__dirname, '..', '..', 'cozy-knowledge-review.js'),
  templates: path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-templates.js'),
  registry: path.join(__dirname, '..', '..', '..', 'language', 'cozy-language-registry.js'),
  hotspot: path.join(__dirname, '..', '..', '..', '..', '..', 'engines', 'collaboration', 'live-hotspot-engine.js'),
  bridge: path.join(__dirname, '..', 'cozy-knowledge-review-hotspot-bridge.js'),
  gate: path.join(__dirname, '..', 'cozy-knowledge-safety-gate.js'),
  core: path.join(__dirname, '..', 'cozy-knowledge-contribution-core.js')
};

function loadModules() {
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
  require(roots.core);
  return {
    Community: global.window.CozyOS.CozyKnowledgeCommunity,
    Review: global.window.CozyOS.CozyKnowledgeReview,
    Core: global.window.CozyOS.CozyKnowledgeContributionCore
  };
}

let mods = loadModules();
let Community = mods.Community;
let Core = mods.Core;
function reset() { mods = loadModules(); Community = mods.Community; Core = mods.Core; }

function readyOralDraft(overrides) {
  const d = Core.createDraft(Object.assign({
    contributionType: 'PRONUNCIATION', language: 'luo', meaning: 'no problem',
    context: 'casual reassurance', phonetic: 'oh-nge wach', consent: { acknowledged: true }
  }, overrides || {}));
  return d;
}
function readyWrittenDraft(overrides) {
  return Core.createDraft(Object.assign({
    contributionType: 'TEXT', language: 'sw', expression: 'Sasa', meaning: 'informal greeting',
    context: 'youth slang', consent: { acknowledged: true }
  }, overrides || {}));
}

// ---------------------------------------------------------------------
test('module loads and exposes its API', () => {
  assert.strictEqual(typeof Core.submitDraft, 'function');
  assert.strictEqual(typeof Core.validateDraft, 'function');
});

// ---------------------------------------------------------------------
// Language list — real registry only
// ---------------------------------------------------------------------
test('listLanguageOptions(): reflects real registry statuses, never AVAILABLE for NOT_READY languages', () => {
  const { options } = Core.listLanguageOptions();
  const luo = options.find((o) => o.code === 'luo');
  const en = options.find((o) => o.code === 'en');
  assert.strictEqual(luo.status, 'NOT_READY');
  assert.strictEqual(en.status, 'AVAILABLE');
});

test('listLanguageOptions(): includes an honest "Other" option with UNKNOWN status, no fabricated code', () => {
  const { options } = Core.listLanguageOptions();
  const other = options.find((o) => o.code === null);
  assert.ok(other);
  assert.strictEqual(other.status, 'UNKNOWN');
});

test('languageStatus(): UNKNOWN for a language not present anywhere in the real registry', () => {
  assert.strictEqual(Core.languageStatus('made-up-code-xyz'), 'UNKNOWN');
});

// ---------------------------------------------------------------------
// Oral-language-first validation
// ---------------------------------------------------------------------
test('validateDraft(): oral type never requires a written expression', () => {
  const d = readyOralDraft({ expression: null });
  const check = Core.validateDraft(d);
  assert.strictEqual(check.valid, true, JSON.stringify(check.errors));
});

test('validateDraft(): oral type still requires at least one of expression/audioReference/phonetic', () => {
  const d = readyOralDraft({ phonetic: null, expression: null, audioReference: null });
  const check = Core.validateDraft(d);
  assert.strictEqual(check.valid, false);
  assert.ok(check.errors.some((e) => /oral-language evidence/.test(e)));
});

test('validateDraft(): written type requires expression', () => {
  const d = readyWrittenDraft({ expression: null });
  const check = Core.validateDraft(d);
  assert.strictEqual(check.valid, false);
  assert.ok(check.errors.some((e) => /expression is required/.test(e)));
});

test('validateDraft(): consent is mandatory regardless of type', () => {
  const d = readyWrittenDraft({ consent: { acknowledged: false } });
  const check = Core.validateDraft(d);
  assert.ok(check.errors.some((e) => /[Cc]onsent/.test(e)));
});

// ---------------------------------------------------------------------
// Draft lifecycle
// ---------------------------------------------------------------------
test('createDraft()/updateDraft(): starts DRAFT, becomes READY once valid', () => {
  const d = Core.createDraft({ contributionType: 'TEXT' });
  assert.strictEqual(d.state, 'DRAFT');
  const result = Core.updateDraft(d.id, { language: 'sw', expression: 'x', meaning: 'y', context: 'z', consent: { acknowledged: true } });
  assert.strictEqual(result.status, 'READY');
});

test('withdrawDraft(): discards a not-yet-submitted local draft', () => {
  const d = Core.createDraft({});
  const result = Core.withdrawDraft(d.id);
  assert.strictEqual(result.status, 'WITHDRAWN');
  assert.strictEqual(Core.getDraft(d.id), null);
});

test('withdrawDraft(): honestly CAPABILITY_UNAVAILABLE after real submission, never fakes it', () => {
  const d = readyWrittenDraft();
  Core.submitDraft(d.id);
  const result = Core.withdrawDraft(d.id);
  assert.strictEqual(result.status, 'CAPABILITY_UNAVAILABLE');
});

// ---------------------------------------------------------------------
// Submission — composes RP-029-B's real API only
// ---------------------------------------------------------------------
test('submitDraft(): REJECTED without consent, and no real candidate is created', () => {
  reset();
  const d = readyWrittenDraft({ consent: { acknowledged: false } });
  const before = Community.listCommunityRecords({}).length;
  const result = Core.submitDraft(d.id);
  assert.strictEqual(result.status, 'REJECTED');
  assert.strictEqual(Community.listCommunityRecords({}).length, before);
});

test('submitDraft(): a valid written draft creates a real PRIVATE/CANDIDATE record', () => {
  reset();
  const d = readyWrittenDraft();
  const result = Core.submitDraft(d.id);
  assert.strictEqual(result.status, 'SUBMITTED');
  assert.strictEqual(result.record.visibility, 'PRIVATE');
  assert.strictEqual(result.record.communityExtensions.reviewState, 'CANDIDATE');
});

test('submitDraft(): a valid oral draft with no expression still creates a real candidate', () => {
  reset();
  const d = readyOralDraft({ expression: null });
  const result = Core.submitDraft(d.id);
  assert.strictEqual(result.status, 'SUBMITTED');
  assert.ok(result.record.id);
});

test('submitDraft(): NOT_FOUND for an unknown draft id', () => {
  const result = Core.submitDraft('nope');
  assert.strictEqual(result.status, 'NOT_FOUND');
});

// ---------------------------------------------------------------------
// Timeline state — reuses Phase 1's real display-state mapper
// ---------------------------------------------------------------------
test('timelineState(): DRAFT before consent/required fields are complete', () => {
  reset();
  const d = Core.createDraft({ contributionType: 'TEXT' });
  assert.strictEqual(Core.timelineState(d.id), 'DRAFT');
});

test('timelineState(): READY once valid but not yet submitted', () => {
  reset();
  const d = readyWrittenDraft();
  assert.strictEqual(Core.timelineState(d.id), 'READY');
});

test('timelineState(): after submission, defers entirely to Phase 1\'s real computeDisplayState()', () => {
  reset();
  const d = readyWrittenDraft();
  const result = Core.submitDraft(d.id);
  const expected = mods.Review.computeDisplayState(mods.Community.getRecord(result.candidateId));
  assert.strictEqual(Core.timelineState(d.id), expected);
});

// ---------------------------------------------------------------------
// Offline / Cozy Offline Hotspot — composes Phase 2's real bridge only
// ---------------------------------------------------------------------
test('shareOffline(): QUEUED (never SHARED) when no hotspot connection exists', () => {
  reset();
  const d = readyWrittenDraft();
  const result = Core.submitDraft(d.id);
  const share = Core.shareOffline(result.record);
  assert.strictEqual(share.status, 'QUEUED');
});

test('shareOffline(): never emits SYNCED or CONFLICT — no real capability backs either', () => {
  reset();
  const d = readyWrittenDraft();
  const result = Core.submitDraft(d.id);
  const share = Core.shareOffline(result.record);
  assert.notStrictEqual(share.status, 'SYNCED');
  assert.notStrictEqual(share.status, 'CONFLICT');
});

test('retryShare(): honestly reflects the same real, current state, marked retried', () => {
  reset();
  const d = readyWrittenDraft();
  const result = Core.submitDraft(d.id);
  const retry = Core.retryShare(result.record);
  assert.strictEqual(retry.retried, true);
  assert.strictEqual(retry.status, 'QUEUED');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
