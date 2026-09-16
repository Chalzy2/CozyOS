/**
 * core/modules/intelligence/knowledge/teach/tests/cozy-teach-cozyai-routing-core.test.js
 * RP-031 Phase 2A — real, executed tests for
 * core/modules/intelligence/knowledge/teach/cozy-teach-cozyai-routing-core.js
 *
 * Run with: node core/modules/intelligence/knowledge/teach/tests/cozy-teach-cozyai-routing-core.test.js
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
  gate: path.join(__dirname, '..', '..', 'ui', 'cozy-knowledge-safety-gate.js'),
  bridge: path.join(__dirname, '..', '..', 'ui', 'cozy-knowledge-review-hotspot-bridge.js'),
  contributionCore: path.join(__dirname, '..', '..', 'ui', 'cozy-knowledge-contribution-core.js'),
  langPacks: path.join(__dirname, '..', '..', '..', 'language-packs', 'cozy-language-pack-registry.js'),
  teach: path.join(__dirname, '..', 'cozy-teach-cozyai-routing-core.js')
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
  require(roots.contributionCore);
  require(roots.langPacks);
  require(roots.teach);
  return global.window.CozyOS.CozyTeachCozyAIRouting;
}

let Teach = loadModules();
function reset() { Teach = loadModules(); }

function baseFields(overrides) {
  return Object.assign({
    knowledgeType: 'WORD',
    language: 'luo',
    country: 'KE',
    region: 'Kisumu',
    dialect: 'Standard Dholuo',
    expression: 'wach',
    meaning: 'a matter or issue',
    context: 'used in everyday conversation',
    consent: { acknowledged: true },
    privacyLevel: 'PRIVATE'
  }, overrides || {});
}

// ---------------------------------------------------------------------
// Module registration / no fabrication
// ---------------------------------------------------------------------

test('module registers exactly once under window.CozyOS.Modules["cozy-teach-cozyai-routing-core"]', () => {
  const mod = global.window.CozyOS.Modules['cozy-teach-cozyai-routing-core'];
  assert.ok(mod);
  assert.strictEqual(mod.version, '1.0.0');
});

test('module description never claims ASR/OCR/automatic language ID/translation-ML', () => {
  const desc = global.window.CozyOS.Modules['cozy-teach-cozyai-routing-core'].description.toLowerCase();
  ['speech recognition', 'automatic translation', 'ocr engine', 'video understanding'].forEach((claim) => {
    assert.ok(desc.indexOf(claim) === -1, `should not claim: ${claim}`);
  });
});

// ---------------------------------------------------------------------
// Vocabulary / required fields (spec section A)
// ---------------------------------------------------------------------

test('TEACH_KNOWLEDGE_TYPES includes the full spec vocabulary', () => {
  ['WORD', 'PHRASE', 'SENTENCE', 'DEFINITION', 'LITERAL_MEANING', 'CONTEXTUAL_MEANING',
    'PRONUNCIATION', 'DIALECT_VARIANT', 'EXAMPLE_USAGE', 'TRANSLATION', 'CULTURAL_NOTE',
    'AGRICULTURE', 'EDUCATION', 'BUSINESS', 'COMMUNITY_LIFE', 'OTHER_DOMAIN'
  ].forEach((t) => assert.ok(Teach.TEACH_KNOWLEDGE_TYPES.indexOf(t) !== -1, t));
});

test('describeContributionForm(): WORD requires expression, never forces oral evidence', () => {
  const form = Teach.describeContributionForm('WORD');
  assert.ok(form.required.indexOf('expression') !== -1);
  assert.deepStrictEqual(form.oneOf, []);
});

test('describeContributionForm(): PRONUNCIATION is oral-first — expression is not required, oneOf offers audio/phonetic', () => {
  const form = Teach.describeContributionForm('PRONUNCIATION');
  assert.ok(form.required.indexOf('expression') === -1);
  assert.ok(form.oneOf.indexOf('audioReference') !== -1);
  assert.ok(form.oneOf.indexOf('phonetic') !== -1);
});

test('describeContributionForm(): domain types require domainKnowledge and disclose evidenceStatus', () => {
  ['AGRICULTURE', 'EDUCATION', 'BUSINESS', 'COMMUNITY_LIFE', 'OTHER_DOMAIN'].forEach((t) => {
    const form = Teach.describeContributionForm(t);
    assert.ok(form.required.indexOf('domainKnowledge') !== -1, t);
    assert.strictEqual(form.evidenceStatus, 'COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED', t);
  });
});

test('describeContributionForm(): unknown knowledgeType is honestly invalid', () => {
  const form = Teach.describeContributionForm('NOT_A_TYPE');
  assert.strictEqual(form.valid, false);
});

test('validateFields(): missing required field is rejected with a clear error', () => {
  const result = Teach.validateFields('WORD', { language: 'luo', meaning: 'x', context: 'y' });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.indexOf('expression') !== -1));
});

test('validateFields(): LITERAL_MEANING requires literalMeaning specifically', () => {
  const result = Teach.validateFields('LITERAL_MEANING', baseFields());
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.indexOf('literalMeaning') !== -1));
});

// ---------------------------------------------------------------------
// Dual-pipeline submission (review pipeline + language-pack routing)
// ---------------------------------------------------------------------

test('submitTeachingContribution(): a safe WORD reaches both the review pipeline and the language pack', () => {
  reset();
  const result = Teach.submitTeachingContribution(baseFields());
  assert.strictEqual(result.status, 'SUBMITTED');
  assert.strictEqual(result.reviewPipeline.status, 'SUBMITTED');
  assert.ok(result.reviewPipeline.candidateId);
  assert.ok(['CANDIDATE_CREATED', 'EVIDENCE_ADDED'].indexOf(result.languagePackRouting.status) !== -1);
  assert.ok(result.languagePackRouting.recordId);
});

test('submitTeachingContribution(): unsafe content never reaches the language-pack registry', () => {
  reset();
  const result = Teach.submitTeachingContribution(baseFields({
    context: 'how to make a bomb at home'
  }));
  assert.notStrictEqual(result.status, 'SUBMITTED');
  assert.strictEqual(result.languagePackRouting.status, 'NOT_ATTEMPTED');
});

test('submitTeachingContribution(): missing consent is rejected before either pipeline runs', () => {
  reset();
  const result = Teach.submitTeachingContribution(baseFields({ consent: { acknowledged: false } }));
  assert.notStrictEqual(result.status, 'SUBMITTED');
  assert.strictEqual(result.languagePackRouting.status, 'NOT_ATTEMPTED');
});

test('submitTeachingContribution(): domain contribution is tagged COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED', () => {
  reset();
  const result = Teach.submitTeachingContribution(baseFields({
    knowledgeType: 'AGRICULTURE',
    expression: null,
    meaning: 'local remedy for crop pest',
    domainKnowledge: 'Farmers apply ash around the base of the plant.'
  }));
  assert.strictEqual(result.status, 'SUBMITTED');
  assert.strictEqual(result.evidenceStatus, 'COMMUNITY_REPORTED_NOT_PROFESSIONALLY_VERIFIED');
});

test('submitTeachingContribution(): oral PRONUNCIATION with only phonetic (no expression) is accepted', () => {
  reset();
  const result = Teach.submitTeachingContribution(baseFields({
    knowledgeType: 'PRONUNCIATION', expression: null, phonetic: 'wahch'
  }));
  assert.strictEqual(result.status, 'SUBMITTED');
});

test('submitTeachingContribution(): literal + contextual meaning are preserved (not dropped) in the combined meaning', () => {
  reset();
  const result = Teach.submitTeachingContribution(baseFields({
    knowledgeType: 'LITERAL_MEANING', literalMeaning: 'thing spoken'
  }));
  assert.strictEqual(result.status, 'SUBMITTED');
  const rec = Teach.getRoutingRecord(result.languagePackRouting.recordId);
  assert.ok(rec.meaning.indexOf('Literal: thing spoken') !== -1);
});

// ---------------------------------------------------------------------
// Language-pack routing (spec section B) — Country+Region+Community+
// Dialect, same expression can have multiple valid records
// ---------------------------------------------------------------------

test('submitTeachingContribution(): same expression, different region, produces distinct pack records', () => {
  reset();
  const kisumu = Teach.submitTeachingContribution(baseFields({ region: 'Kisumu', meaning: 'a matter or issue' }));
  const siaya = Teach.submitTeachingContribution(baseFields({ region: 'Siaya', meaning: 'a matter or issue' }));
  assert.notStrictEqual(kisumu.languagePackRouting.recordId, siaya.languagePackRouting.recordId);
});

test('submitTeachingContribution(): community is honestly tracked even though RP-030 has no native community field', () => {
  reset();
  const result = Teach.submitTeachingContribution(baseFields({
    knowledgeType: 'WORD', region: 'Kiambu', community: 'Karura', dialect: 'Kikuyu',
    language: 'ki', expression: 'mũgũnda', meaning: 'a farm or field'
  }));
  assert.strictEqual(result.status, 'SUBMITTED');
  const rec = Teach.getRoutingRecord(result.languagePackRouting.recordId);
  assert.strictEqual(rec.community, 'Karura');
  assert.ok(rec.region.indexOf('Karura') !== -1); // folded into region per disclosed compromise
});

test('submitTeachingContribution(): same community+region+expression but different meaning stays a distinct record', () => {
  reset();
  const first = Teach.submitTeachingContribution(baseFields({
    region: 'Kiambu', community: 'Karura', dialect: 'Kikuyu', language: 'ki',
    expression: 'mũgũnda', meaning: 'a farm or field'
  }));
  const second = Teach.submitTeachingContribution(baseFields({
    region: 'Kiambu', community: 'Karura', dialect: 'Kikuyu', language: 'ki',
    expression: 'mũgũnda', meaning: 'a homestead compound (alternate local usage)'
  }));
  assert.notStrictEqual(first.languagePackRouting.recordId, second.languagePackRouting.recordId);
});

test('detectRoutingSuggestion(): discloses it is a heuristic, never claims real language ID', () => {
  reset();
  Teach.submitTeachingContribution(baseFields());
  const suggestion = Teach.detectRoutingSuggestion({ languageId: 'luo', country: 'KE' });
  assert.ok(suggestion.matched);
  assert.ok(suggestion.note.toLowerCase().indexOf('no ml') !== -1 || suggestion.note.toLowerCase().indexOf('heuristic') !== -1);
});

// ---------------------------------------------------------------------
// Failure / degradation honesty
// ---------------------------------------------------------------------

test('submitTeachingContribution(): CAPABILITY_UNAVAILABLE when CozyKnowledgeContributionCore is absent', () => {
  delete require.cache[require.resolve(roots.teach)];
  global.window = { CozyOS: {} };
  require(roots.teach);
  const teachAlone = global.window.CozyOS.CozyTeachCozyAIRouting;
  const result = teachAlone.submitTeachingContribution(baseFields());
  assert.strictEqual(result.status, 'CAPABILITY_UNAVAILABLE');
  reset();
});

test('getRoutingRecord(): returns null for a non-existent recordId rather than fabricating a record', () => {
  reset();
  assert.strictEqual(Teach.getRoutingRecord('expr-does-not-exist'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
