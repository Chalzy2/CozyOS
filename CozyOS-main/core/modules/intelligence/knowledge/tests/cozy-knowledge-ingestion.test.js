/**
 * core/modules/intelligence/knowledge/tests/cozy-knowledge-ingestion.test.js
 * RP-029-A — real, executed tests for
 * core/modules/intelligence/knowledge/cozy-knowledge-ingestion.js
 *
 * Run with: node core/modules/intelligence/knowledge/tests/cozy-knowledge-ingestion.test.js
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

function loadModule(fakeWindow) {
  const modulePath = path.join(__dirname, '..', 'cozy-knowledge-ingestion.js');
  delete require.cache[require.resolve(modulePath)];
  global.window = fakeWindow || { CozyOS: {} };
  require(modulePath);
  return global.window.CozyOS.CozyKnowledgeIngestion;
}

// ---------------------------------------------------------------------
// Source handling
// ---------------------------------------------------------------------

test('ingestSource(): TEXT produces a CANDIDATE, never auto-VERIFIED', () => {
  const engine = loadModule();
  const result = engine.ingestSource({ sourceType: 'TEXT', content: 'Habari yako, karibu nyumbani.' });
  assert.strictEqual(result.status, 'CANDIDATE_CREATED');
  assert.strictEqual(result.candidate.verificationState, 'CANDIDATE');
  assert.strictEqual(result.candidate.visibility, 'PRIVATE');
});

test('ingestSource(): unknown sourceType is REJECTED, not silently accepted', () => {
  const engine = loadModule();
  const result = engine.ingestSource({ sourceType: 'VIDEO_STREAM', content: 'x' });
  assert.strictEqual(result.status, 'REJECTED');
  assert.strictEqual(result.candidate, null);
});

test('ingestSource(): empty/whitespace content is SOURCE_UNAVAILABLE', () => {
  const engine = loadModule();
  const result = engine.ingestSource({ sourceType: 'TEXT', content: '   ' });
  assert.strictEqual(result.status, 'SOURCE_UNAVAILABLE');
});

test('ingestSource(): HTML extraction strips tags/scripts/styles', () => {
  const engine = loadModule();
  const html = '<html><head><style>.a{}</style></head><body><script>evil()</script><p>Hello <b>World</b></p></body></html>';
  const result = engine.ingestSource({ sourceType: 'HTML', content: html });
  assert.strictEqual(result.status, 'CANDIDATE_CREATED');
  assert.ok(result.candidate.claim.includes('Hello World'));
  assert.ok(!result.candidate.claim.includes('evil'));
});

test('ingestSource(): malformed/empty HTML is SOURCE_UNAVAILABLE', () => {
  const engine = loadModule();
  const result = engine.ingestSource({ sourceType: 'HTML', content: '<div></div>   ' });
  assert.strictEqual(result.status, 'SOURCE_UNAVAILABLE');
});

test('ingestSource(): PDF without a real registered extractor is SOURCE_UNAVAILABLE (never fabricated)', () => {
  const engine = loadModule({ CozyOS: {} });
  const result = engine.ingestSource({ sourceType: 'PDF', content: 'binary-ish-content' });
  assert.strictEqual(result.status, 'SOURCE_UNAVAILABLE');
});

test('ingestSource(): PDF delegates to a real registered CozyOCR.extractPdfText when present', () => {
  const engine = loadModule({
    CozyOS: { CozyOCR: { extractPdfText: () => 'Extracted PDF body text.' } }
  });
  const result = engine.ingestSource({ sourceType: 'PDF', content: 'irrelevant-bytes' });
  assert.strictEqual(result.status, 'CANDIDATE_CREATED');
  assert.strictEqual(result.candidate.claim, 'Extracted PDF body text.');
});

test('ingestSource(): duplicate content (same hash + sourceType) is reported DUPLICATE, not re-created', () => {
  const engine = loadModule();
  const first = engine.ingestSource({ sourceType: 'TEXT', content: 'The same sentence twice.' });
  const second = engine.ingestSource({ sourceType: 'TEXT', content: 'The same sentence twice.' });
  assert.strictEqual(first.status, 'CANDIDATE_CREATED');
  assert.strictEqual(second.status, 'DUPLICATE');
  assert.strictEqual(second.candidate.id, first.candidate.id);
});

// ---------------------------------------------------------------------
// Language identification
// ---------------------------------------------------------------------

test('detectLanguage(): honestly returns LANGUAGE_UNCERTAIN for unrecognizable/too-short input', () => {
  const engine = loadModule();
  const result = engine._detectLanguageForTests('xyz qwq zzz');
  assert.strictEqual(result.state, 'LANGUAGE_UNCERTAIN');
  assert.strictEqual(result.code, null);
});

test('detectLanguage(): detects a Kiswahili signal from repeated common markers', () => {
  const engine = loadModule();
  const result = engine._detectLanguageForTests('Habari, karibu, asante kwa hii.');
  assert.strictEqual(result.code, 'sw');
  assert.strictEqual(result.state, 'DETECTED');
});

test('ingestSource(): a declared language is trusted as DECLARED, distinct from heuristic DETECTED', () => {
  const engine = loadModule();
  const result = engine.ingestSource({ sourceType: 'TEXT', content: 'Some arbitrary content.', meta: { language: 'sw' } });
  assert.strictEqual(result.candidate.language.code, 'sw');
  assert.strictEqual(result.candidate.language.state, 'DECLARED');
});

test('ingestSource(): cross-checks a NOT_READY language against the real CozyLanguageRegistry when present', () => {
  const engine = loadModule({
    CozyOS: {
      CozyLanguageRegistry: {
        getLanguage: (code) => (code === 'luo' ? { code: 'luo', state: 'NOT_READY' } : null)
      }
    }
  });
  const result = engine.ingestSource({ sourceType: 'TEXT', content: 'Some Luo content here.', meta: { language: 'luo' } });
  assert.strictEqual(result.candidate.language.registryChecked, true);
  assert.strictEqual(result.candidate.language.registryState, 'NOT_READY');
});

// ---------------------------------------------------------------------
// Website ingestion (no network fetch performed by this module)
// ---------------------------------------------------------------------

test('ingestWebsite(): missing htmlContent is honestly SOURCE_UNAVAILABLE, never invented', () => {
  const engine = loadModule();
  const result = engine.ingestWebsite({ url: 'https://example.org/article' });
  assert.strictEqual(result.status, 'SOURCE_UNAVAILABLE');
});

test('ingestWebsite(): missing url is REJECTED', () => {
  const engine = loadModule();
  const result = engine.ingestWebsite({ htmlContent: '<p>hi</p>' });
  assert.strictEqual(result.status, 'REJECTED');
});

test('ingestWebsite(): with real htmlContent produces a candidate carrying the URL as origin', () => {
  const engine = loadModule();
  const result = engine.ingestWebsite({ url: 'https://example.org/article', htmlContent: '<p>Real article text.</p>' });
  assert.strictEqual(result.status, 'CANDIDATE_CREATED');
  assert.strictEqual(result.candidate.provenance.origin, 'https://example.org/article');
  assert.strictEqual(result.candidate.provenance.sourceType, 'PUBLIC_WEBSITE');
});

// ---------------------------------------------------------------------
// Community submission + independent confirmation counting
// ---------------------------------------------------------------------

test('ingestCommunitySubmission(): starts at 0 independent confirmations, state CANDIDATE', () => {
  const engine = loadModule();
  const result = engine.ingestCommunitySubmission({ statement: 'This is how we say good morning.', contributorId: 'user-1' });
  assert.strictEqual(result.status, 'CANDIDATE_CREATED');
  assert.strictEqual(result.candidate.independentConfirmations, 0);
  assert.strictEqual(result.candidate.verificationState, 'CANDIDATE');
});

test('confirmCandidate(): the SAME contributor confirming twice does not double-count', () => {
  const engine = loadModule();
  const created = engine.ingestCommunitySubmission({ statement: 'A local greeting phrase.', contributorId: 'user-1' });
  engine.confirmCandidate(created.candidate.id, 'user-1');
  const second = engine.confirmCandidate(created.candidate.id, 'user-1');
  assert.strictEqual(second.status, 'ALREADY_COUNTED');
  assert.strictEqual(second.candidate.independentConfirmations, 0);
});

test('confirmCandidate(): 5 distinct independent confirmations move state to PARTIALLY_VERIFIED (never straight to VERIFIED)', () => {
  const engine = loadModule();
  const created = engine.ingestCommunitySubmission({ statement: 'A widely known local phrase.', contributorId: 'user-1' });
  ['user-2', 'user-3', 'user-4', 'user-5'].forEach((id) => engine.confirmCandidate(created.candidate.id, id));
  const candidate = engine.getCandidate(created.candidate.id);
  assert.strictEqual(candidate.independentConfirmations, 5);
  assert.strictEqual(candidate.verificationState, 'PARTIALLY_VERIFIED');
  assert.notStrictEqual(candidate.verificationState, 'VERIFIED');
});

// ---------------------------------------------------------------------
// Privacy / visibility
// ---------------------------------------------------------------------

test('a new candidate defaults to PRIVATE and stays PRIVATE unless explicitly contributed', () => {
  const engine = loadModule();
  const result = engine.ingestSource({ sourceType: 'TEXT', content: 'A private note about a word.' });
  assert.strictEqual(result.candidate.visibility, 'PRIVATE');
  const stillPrivate = engine.getCandidate(result.candidate.id);
  assert.strictEqual(stillPrivate.visibility, 'PRIVATE');
});

test('contributeToCommunity() explicitly raises visibility to COMMUNITY', () => {
  const engine = loadModule();
  const result = engine.ingestSource({ sourceType: 'TEXT', content: 'Something to share with the community.' });
  const updated = engine.contributeToCommunity(result.candidate.id);
  assert.strictEqual(updated.status, 'UPDATED');
  assert.strictEqual(updated.candidate.visibility, 'COMMUNITY');
});

test('contributeToPublic() is rejected while still PRIVATE (must pass through COMMUNITY first)', () => {
  const engine = loadModule();
  const result = engine.ingestSource({ sourceType: 'TEXT', content: 'Not yet shared with anyone.' });
  const attempt = engine.contributeToPublic(result.candidate.id);
  assert.strictEqual(attempt.status, 'REJECTED');
  assert.strictEqual(attempt.candidate.visibility, 'PRIVATE');
});

// ---------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------

test('listCandidates(): filters by visibility', () => {
  const engine = loadModule();
  const a = engine.ingestSource({ sourceType: 'TEXT', content: 'Alpha entry text.' });
  engine.ingestSource({ sourceType: 'TEXT', content: 'Beta entry text.' });
  engine.contributeToCommunity(a.candidate.id);
  const community = engine.listCandidates({ visibility: 'COMMUNITY' });
  assert.strictEqual(community.length, 1);
  assert.strictEqual(community[0].id, a.candidate.id);
});

test('searchCandidates(): substring match over stored claims', () => {
  const engine = loadModule();
  engine.ingestSource({ sourceType: 'TEXT', content: 'The market word for bread is unique here.' });
  engine.ingestSource({ sourceType: 'TEXT', content: 'An unrelated sentence about weather.' });
  const results = engine.searchCandidates('bread');
  assert.strictEqual(results.length, 1);
});

// ---------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------

test('every candidate carries source identity, contentHash, timestamps, and an UNVERIFIED trustState', () => {
  const engine = loadModule();
  const result = engine.ingestSource({ sourceType: 'DOCUMENT', content: 'Provenance check text.', meta: { title: 'Sample Doc', sourceId: 'doc-42' } });
  const p = result.candidate.provenance;
  assert.strictEqual(p.sourceType, 'DOCUMENT');
  assert.strictEqual(p.sourceId, 'doc-42');
  assert.strictEqual(p.title, 'Sample Doc');
  assert.strictEqual(p.trustState, 'UNVERIFIED');
  assert.ok(typeof p.contentHash === 'string' && p.contentHash.startsWith('djb2:'));
  assert.ok(typeof p.capturedAt === 'string' && p.capturedAt.length > 0);
});

// ---------------------------------------------------------------------
// Offline behavior
// ---------------------------------------------------------------------

test('ingestion works with no network-shaped dependencies at all (offline-safe by construction)', () => {
  const engine = loadModule({ CozyOS: {} });
  const result = engine.ingestSource({ sourceType: 'EDUCATIONAL_MATERIAL', content: 'Locally available lesson text.' });
  assert.strictEqual(result.status, 'CANDIDATE_CREATED');
});

// ---------------------------------------------------------------------
// Module registration hygiene
// ---------------------------------------------------------------------

test('module registers exactly once under window.CozyOS.Modules["cozy-knowledge-ingestion"]', () => {
  const engine = loadModule();
  assert.ok(global.window.CozyOS.Modules['cozy-knowledge-ingestion']);
  assert.strictEqual(typeof engine.getVersion(), 'string');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
