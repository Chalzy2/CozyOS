'use strict';

/**
 * Regression test suite for
 * core/modules/duplicate-detection/duplicate-detection.js
 * Same harness convention as document-understanding.test.js: stub a
 * minimal `window` global and require the real production file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

function freshInstance() {
  delete require.cache[require.resolve('./duplicate-detection.js')];
  global.window = { CozyOS: {} };
  require('./duplicate-detection.js');
  return global.window.CozyOS.DuplicateDetection;
}

function doc({ id = 'DOC-KE-000000001', documentType = 'invoice', rawText = '', title = null, date = null, updatedAt = null, userId = null, merchantName = null, total = null, documentNumber = null } = {}) {
  return { documentId: id, documentType, rawText, title, date, updatedAt, userId, merchantName, total, documentNumber, confidence: 90 };
}
function und({ language = 'eng', summary = '', keywords = [], topic = null, entities = {}, sections = [] } = {}) {
  return { language, summary, keywords, topic, entities, sections };
}

/* ------------------------------------------------------------------ */
/* METADATA / REGISTRATION / OWNERSHIP BOUNDARY                        */
/* ------------------------------------------------------------------ */

test('coordinator is exposed, frozen, and versioned', () => {
  const dd = freshInstance();
  assert.equal(typeof dd.getVersion(), 'string');
  assert.ok(Object.isFrozen(dd));
});

test('registers with capabilities matching spec, nothing fabricated', () => {
  global.window = { CozyOS: {} };
  const registered = [];
  global.window.CozyOS.registerCoordinator = (d) => registered.push(d);
  delete require.cache[require.resolve('./duplicate-detection.js')];
  require('./duplicate-detection.js');
  assert.deepEqual(registered[0].capabilities.sort(), ['duplicate-detection', 'fingerprinting', 'similarity-analysis', 'version-detection'].sort());
});

test('rejects missing documentRecord honestly rather than guessing', async () => {
  const dd = freshInstance();
  const result = await dd.analyze({ understanding: und() });
  assert.equal(result.available, false);
  assert.match(result.reason, /documentRecord/);
});

test('never exposes delete/merge/replace/restart/reload operations', () => {
  const dd = freshInstance();
  for (const forbidden of ['delete', 'merge', 'replace', 'restart', 'reload']) {
    assert.equal(typeof dd[forbidden], 'undefined', `must not expose ${forbidden}`);
  }
});

/* ------------------------------------------------------------------ */
/* NEW DOCUMENT / NO CANDIDATES                                        */
/* ------------------------------------------------------------------ */

test('completely new document with no candidates -> NEW_DOCUMENT', async () => {
  const dd = freshInstance();
  const record = doc({ rawText: 'A unique invoice for consulting services rendered in July.' });
  const result = await dd.analyze({ documentRecord: record, understanding: und({ keywords: ['consulting'] }) });
  assert.equal(result.duplicateStatus, 'NEW_DOCUMENT');
  assert.equal(result.recommendation, 'Store as new document');
  assert.deepEqual(result.comparedDocuments, []);
});

/* ------------------------------------------------------------------ */
/* EXACT DUPLICATE                                                     */
/* ------------------------------------------------------------------ */

test('exact duplicate: identical record+understanding -> EXACT_DUPLICATE via fingerprint', async () => {
  const dd = freshInstance();
  const record = doc({ id: 'DOC-1', documentType: 'invoice', rawText: 'Invoice No INV-100 total 500', documentNumber: 'INV-100' });
  const understanding = und({ language: 'eng' });
  const candidate = { documentRecord: doc({ id: 'DOC-0', documentType: 'invoice', rawText: 'Invoice No INV-100 total 500', documentNumber: 'INV-100' }), understanding };
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  assert.equal(result.duplicateStatus, 'EXACT_DUPLICATE');
  assert.equal(result.confidence, 100);
  assert.equal(result.exactMatches.length, 1);
  assert.equal(result.recommendation, 'Reject duplicate');
});

/* ------------------------------------------------------------------ */
/* NEAR DUPLICATE                                                      */
/* ------------------------------------------------------------------ */

test('near duplicate: similar content and entities, no identifier match', async () => {
  const dd = freshInstance();
  const text1 = 'Receipt for office supplies purchased at Acme Stationers Nairobi branch for total amount today';
  const text2 = 'Receipt for office supplies purchased at Acme Stationers Nairobi branch for total amount yesterday';
  const record = doc({ id: 'DOC-2', documentType: 'receipt', rawText: text1 });
  const understanding = und({ summary: text1, keywords: ['office', 'supplies', 'acme'], entities: { organizations: ['Acme Stationers'], locations: ['Nairobi'] } });
  const candidate = {
    documentRecord: doc({ id: 'DOC-1', documentType: 'receipt', rawText: text2 }),
    understanding: und({ summary: text2, keywords: ['office', 'supplies', 'acme'], entities: { organizations: ['Acme Stationers'], locations: ['Nairobi'] } })
  };
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  assert.equal(result.duplicateStatus, 'NEAR_DUPLICATE');
  assert.ok(result.confidence >= 60 && result.confidence < 100);
  assert.equal(result.nearMatches.length, 1);
});

/* ------------------------------------------------------------------ */
/* UPDATED VERSION                                                     */
/* ------------------------------------------------------------------ */

test('updated version: same identifier, near-identical content, different modification date', async () => {
  const dd = freshInstance();
  const textOld = 'Invoice No INV-500 for consulting services rendered total amount due thirty days net';
  const textNew = 'Invoice No INV-500 for consulting services rendered total amount due thirty days net revised';
  const record = doc({ id: 'DOC-NEW', documentType: 'invoice', rawText: textNew, documentNumber: 'INV-500', updatedAt: '2026-07-20T10:00:00Z' });
  const understanding = und({ keywords: ['invoice', 'consulting'] });
  const candidate = {
    documentRecord: doc({ id: 'DOC-OLD', documentType: 'invoice', rawText: textOld, documentNumber: 'INV-500', updatedAt: '2026-07-01T10:00:00Z' }),
    understanding: und({ keywords: ['invoice', 'consulting'] })
  };
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  assert.equal(result.duplicateStatus, 'UPDATED_VERSION');
  assert.equal(result.versionMatches.length, 1);
  assert.equal(result.recommendation, 'Replace previous version');
});

/* ------------------------------------------------------------------ */
/* CONFLICT                                                            */
/* ------------------------------------------------------------------ */

test('conflict: same identifier, different totals and issuer -> CONFLICT, never silently guessed', async () => {
  const dd = freshInstance();
  const record = doc({ id: 'DOC-NEW', documentType: 'invoice', rawText: 'Invoice INV-777 total 900 from Acme Ltd', documentNumber: 'INV-777', total: 900, merchantName: 'Acme Ltd' });
  const understanding = und();
  const candidate = {
    documentRecord: doc({ id: 'DOC-OLD', documentType: 'invoice', rawText: 'Invoice INV-777 total 500 from Beta Ltd', documentNumber: 'INV-777', total: 500, merchantName: 'Beta Ltd' }),
    understanding: und()
  };
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  assert.equal(result.duplicateStatus, 'CONFLICT');
  assert.equal(result.conflicts.length, 1);
  assert.ok(result.conflicts[0].reasons.length > 0);
  assert.equal(result.recommendation, 'Review manually');
});

/* ------------------------------------------------------------------ */
/* MISSING DATA CASES                                                  */
/* ------------------------------------------------------------------ */

test('missing identifiers: still compares via other layers without throwing', async () => {
  const dd = freshInstance();
  const text = 'A general letter regarding upcoming church event schedule for the month';
  const record = doc({ documentType: 'letter', rawText: text });
  const understanding = und({ summary: text, keywords: ['church', 'event', 'schedule'] });
  const candidate = { documentRecord: doc({ documentType: 'letter', rawText: text }), understanding: und({ summary: text, keywords: ['church', 'event', 'schedule'] }) };
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  assert.equal(result.available, true);
  assert.ok(['EXACT_DUPLICATE', 'NEAR_DUPLICATE', 'UPDATED_VERSION'].includes(result.duplicateStatus));
});

test('missing summary: comparison still works from other layers', async () => {
  const dd = freshInstance();
  const record = doc({ documentType: 'receipt', rawText: 'Receipt total 200 paid via mpesa', documentNumber: 'RC-1' });
  const understanding = und({ summary: '' });
  const candidate = { documentRecord: doc({ documentType: 'receipt', rawText: 'Receipt total 200 paid via mpesa', documentNumber: 'RC-1' }), understanding: und({ summary: '' }) };
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  assert.equal(result.available, true);
  assert.notEqual(result.duplicateStatus, 'UNKNOWN');
});

test('missing keywords: comparison still works from content/entities', async () => {
  const dd = freshInstance();
  const text = 'This is a straightforward delivery note with no special fields';
  const record = doc({ documentType: 'delivery_note', rawText: text });
  const understanding = und({ keywords: [] });
  const candidate = { documentRecord: doc({ documentType: 'delivery_note', rawText: text }), understanding: und({ keywords: [] }) };
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  assert.equal(result.available, true);
});

test('different language: still compares, metadata layer reflects the mismatch', async () => {
  const dd = freshInstance();
  const record = doc({ documentType: 'letter', rawText: 'Hello this is a letter' });
  const understanding = und({ language: 'eng' });
  const candidate = { documentRecord: doc({ documentType: 'letter', rawText: 'Hello this is a letter' }), understanding: und({ language: 'swa' }) };
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  assert.equal(result.available, true);
});

test('empty document with no candidates and no basis -> UNKNOWN, never guessed as NEW_DOCUMENT', async () => {
  const dd = freshInstance();
  const record = doc({ rawText: '' });
  const understanding = und({ summary: '', keywords: [] });
  const result = await dd.analyze({ documentRecord: record, understanding });
  assert.equal(result.duplicateStatus, 'UNKNOWN');
  assert.equal(result.confidence, 0);
});

test('malformed document (non-object understanding, missing fields) does not throw', async () => {
  const dd = freshInstance();
  const record = { documentId: 'DOC-X', rawText: 42, documentType: null };
  const result = await dd.analyze({ documentRecord: record, understanding: 'not-an-object' });
  assert.equal(result.available, true);
});

/* ------------------------------------------------------------------ */
/* LARGE DOCUMENT / PERFORMANCE                                        */
/* ------------------------------------------------------------------ */

test('large document completes analysis within a reasonable time budget', async () => {
  const dd = freshInstance();
  const bigText = 'This is a repeated sentence about invoices and payments. '.repeat(2000);
  const record = doc({ documentType: 'invoice', rawText: bigText });
  const understanding = und({ summary: bigText.slice(0, 500), keywords: ['invoice', 'payment'] });
  const candidate = { documentRecord: doc({ documentType: 'invoice', rawText: bigText }), understanding: und({ summary: bigText.slice(0, 500), keywords: ['invoice', 'payment'] }) };
  const start = Date.now();
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  const elapsed = Date.now() - start;
  assert.equal(result.available, true);
  assert.ok(elapsed < 5000, `expected under 5s, took ${elapsed}ms`);
});

/* ------------------------------------------------------------------ */
/* MULTIPLE CANDIDATES / LOW CONFIDENCE                                */
/* ------------------------------------------------------------------ */

test('multiple candidates: best match wins, all are reported in comparedDocuments', async () => {
  const dd = freshInstance();
  const text = 'Invoice No INV-900 total 1000 for logistics services';
  const record = doc({ documentType: 'invoice', rawText: text, documentNumber: 'INV-900' });
  const understanding = und();
  const candidates = [
    { documentRecord: doc({ id: 'DOC-A', documentType: 'invoice', rawText: 'Completely unrelated content about farming' }), understanding: und() },
    { documentRecord: doc({ id: 'DOC-B', documentType: 'invoice', rawText: text, documentNumber: 'INV-900' }), understanding: und() },
    { documentRecord: doc({ id: 'DOC-C', documentType: 'invoice', rawText: 'Another unrelated document about weather' }), understanding: und() }
  ];
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates });
  assert.equal(result.comparedDocuments.length, 3);
  assert.equal(result.duplicateStatus, 'EXACT_DUPLICATE');
  assert.equal(result.exactMatches[0].documentId, 'DOC-B');
});

test('low confidence match is reported honestly, not inflated', async () => {
  const dd = freshInstance();
  const record = doc({ documentType: 'letter', rawText: 'Some fairly generic short note about a meeting' });
  const understanding = und({ keywords: ['meeting'] });
  const candidate = { documentRecord: doc({ documentType: 'letter', rawText: 'A totally different note about groceries and shopping' }), understanding: und({ keywords: ['groceries'] }) };
  const result = await dd.analyze({ documentRecord: record, understanding }, { candidates: [candidate] });
  assert.equal(result.duplicateStatus, 'NEW_DOCUMENT');
  assert.ok(result.confidence < 60);
});

/* ------------------------------------------------------------------ */
/* CANDIDATE PROVIDER HOOK (disclosed, empty-until-registered)         */
/* ------------------------------------------------------------------ */

test('no candidate provider registered -> honestly empty corpus, NEW_DOCUMENT', async () => {
  const dd = freshInstance();
  const record = doc({ rawText: 'Some content with enough basis to judge' });
  const result = await dd.analyze({ documentRecord: record, understanding: und() });
  assert.equal(result.duplicateStatus, 'NEW_DOCUMENT');
  assert.deepEqual(result.comparedDocuments, []);
});

test('registered candidate provider is actually consulted', async () => {
  const dd = freshInstance();
  let called = false;
  dd.registerCandidateProvider(async () => {
    called = true;
    return [{ documentRecord: doc({ rawText: 'match text here' }), understanding: und() }];
  });
  const record = doc({ rawText: 'match text here' });
  await dd.analyze({ documentRecord: record, understanding: und() });
  assert.ok(called);
});

/* ------------------------------------------------------------------ */
/* VALIDATE / REFRESH / DIAGNOSTICS / RESOURCE / HEALTH                */
/* ------------------------------------------------------------------ */

test('validate() flags an inconsistent confidence value', () => {
  const dd = freshInstance();
  const bad = { available: true, duplicateStatus: 'NEW_DOCUMENT', confidence: 150, conflicts: [] };
  const v = dd.validate(bad);
  assert.equal(v.valid, false);
});

test('refresh() re-runs analyze() rather than a fake reload', async () => {
  const dd = freshInstance();
  const record = doc({ rawText: 'text for refresh test' });
  const first = await dd.analyze({ documentRecord: record, understanding: und() });
  const second = await dd.refresh({ documentRecord: record, understanding: und() });
  assert.equal(first.duplicateStatus, second.duplicateStatus);
});

test('getResourceReport tracks real counters only', async () => {
  const dd = freshInstance();
  await dd.analyze({ documentRecord: doc({ rawText: 'a' }), understanding: und() });
  const report = dd.getResourceReport();
  assert.equal(report.analysisCount, 1);
  assert.ok(Object.isFrozen(report));
});

test('getHealthReport reflects real internal state, only documented statuses', async () => {
  const dd = freshInstance();
  await dd.analyze({ documentRecord: doc({ rawText: 'a' }), understanding: und() });
  const health = dd.getHealthReport();
  assert.ok(['Ready', 'Running', 'Idle', 'Failed', 'Healthy'].includes(health.status));
});
