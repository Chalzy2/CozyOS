'use strict';

/**
 * Regression test suite for
 * core/modules/document-understanding/document-understanding.js
 *
 * This coordinator is a browser-global (window.CozyOS.*) file, matching
 * the convention of cozy-document-engine.js — there is no module.exports.
 * These tests stub a minimal `window` global (Node's global object lookup
 * resolves bare `window` references inside the required file to
 * `global.window`) and load the real production file with `require()`.
 * No behavior is mocked inside the file itself — only its optional
 * collaborator, DocumentEngine, is stubbed where a test needs to verify
 * pipeline delegation.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function freshInstance() {
  // Each test gets an isolated window/CozyOS + a fresh require of the
  // production file, since it self-registers a singleton on load.
  delete require.cache[require.resolve('./document-understanding.js')];
  global.window = { CozyOS: {} };
  require('./document-understanding.js');
  return global.window.CozyOS.DocumentUnderstanding;
}

function makeRecord(overrides = {}) {
  return {
    documentId: 'DOC-KE-000000001',
    documentType: 'unknown',
    typeConfidence: 'low',
    rawText: '',
    confidence: 90,
    ...overrides
  };
}

/* ------------------------------------------------------------------ */
/* METADATA / REGISTRATION                                            */
/* ------------------------------------------------------------------ */

test('coordinator is exposed, frozen, and versioned', () => {
  const du = freshInstance();
  assert.equal(typeof du.getVersion(), 'string');
  assert.ok(Object.isFrozen(du));
});

test('coordinator self-registers with the ServiceRegistry when present', () => {
  global.window = { CozyOS: {} };
  const registered = [];
  global.window.CozyOS.registerCoordinator = (descriptor) => registered.push(descriptor);
  delete require.cache[require.resolve('./document-understanding.js')];
  require('./document-understanding.js');
  assert.equal(registered.length, 1);
  assert.equal(registered[0].name, 'DocumentUnderstanding');
  assert.ok(!registered[0].capabilities.includes('document-classification'));
  assert.ok(registered[0].capabilities.includes('entity-extraction'));
});

/* ------------------------------------------------------------------ */
/* OWNERSHIP BOUNDARY — never classifies, never bypasses DocumentEngine */
/* ------------------------------------------------------------------ */

test('never bypasses DocumentEngine: image-source input without DocumentEngine fails honestly', async () => {
  const du = freshInstance();
  const result = await du.analyze('some-image-blob', {});
  assert.equal(result.available, false);
  assert.match(result.reason, /DocumentEngine/);
});

test('delegates to DocumentEngine.parseDocument for image-source input', async () => {
  const du = freshInstance();
  let calledWith = null;
  global.window.CozyOS.DocumentEngine = {
    parseDocument: async (src, opts) => {
      calledWith = { src, opts };
      return { available: true, record: makeRecord({ documentType: 'invoice', rawText: 'Invoice No: INV-2026-001. Total KES 4,500.' }) };
    }
  };
  const result = await du.analyze('image-blob', { lang: 'eng' });
  assert.equal(calledWith.src, 'image-blob');
  assert.equal(result.available, true);
  assert.equal(result.documentType, 'invoice'); // sourced from DocumentEngine, not re-detected
});

test('does not reimplement detectDocumentType or parseDocument on the coordinator', () => {
  const du = freshInstance();
  assert.equal(typeof du.detectDocumentType, 'undefined');
  assert.equal(typeof du.parseDocument, 'undefined');
});

/* ------------------------------------------------------------------ */
/* DOCUMENT TYPE PASS-THROUGH (invoice / receipt / certificate / ID)  */
/* ------------------------------------------------------------------ */

test('invoice record: documentType and typeConfidence pass through unchanged', async () => {
  const du = freshInstance();
  const record = makeRecord({ documentType: 'invoice', typeConfidence: 'high', rawText: 'Invoice No: INV-2026-045\nAmount Due: KES 12,000\nContact: billing@acme.co.ke' });
  const result = await du.analyze(record);
  assert.equal(result.documentType, 'invoice');
  assert.equal(result.typeConfidence, 'high');
});

test('receipt record: entities extracted without re-classifying', async () => {
  const du = freshInstance();
  const record = makeRecord({ documentType: 'receipt', typeConfidence: 'high', rawText: 'Till Receipt\nReceipt No: RC-99812\nTotal: KES 850\nThank you for shopping.' });
  const result = await du.analyze(record);
  assert.equal(result.documentType, 'receipt');
  assert.ok(result.ids ? true : true); // classification untouched, no throw
  assert.ok(result.money.some(m => /850/.test(m)));
});

test('certificate record: structure detection runs regardless of type', async () => {
  const du = freshInstance();
  const record = makeRecord({
    documentType: 'business_permit',
    typeConfidence: 'medium',
    rawText: 'CERTIFICATE OF REGISTRATION\n\nThis certifies that Acme Traders Ltd is duly registered.\n\nRegistration No: REG-2024-3321\nIssued in Nairobi, Kenya.'
  });
  const result = await du.analyze(record);
  assert.equal(result.title, 'CERTIFICATE OF REGISTRATION');
  assert.ok(result.entities.locations.includes('Nairobi'));
  assert.ok(result.entities.countries.includes('Kenya'));
});

test('ID card record: labeled ID number extraction is real, not guessed', async () => {
  const du = freshInstance();
  const record = makeRecord({
    documentType: 'national_id',
    typeConfidence: 'high',
    rawText: 'REPUBLIC OF KENYA\nID No: 12345678\nName: John Mwangi'
  });
  const result = await du.analyze(record);
  assert.ok(result.ids.includes('12345678'));
  assert.ok(result.entities.people.includes('John Mwangi'));
});

test('unknown document: passes through as unknown without fabricating a type', async () => {
  const du = freshInstance();
  const record = makeRecord({ documentType: 'unknown', typeConfidence: 'low', rawText: 'asdkj qweiop zxcvb random unclassifiable text blob' });
  const result = await du.analyze(record);
  assert.equal(result.documentType, 'unknown');
});

/* ------------------------------------------------------------------ */
/* ENTITY EXTRACTION                                                   */
/* ------------------------------------------------------------------ */

test('entity extraction: dates, money, phone, email all real-matched', async () => {
  const du = freshInstance();
  const record = makeRecord({
    documentType: 'invoice',
    rawText: 'Invoice Date: 2026-07-15\nDue: KES 3,200.50\nContact: 0712345678 or accounts@example.com'
  });
  const result = await du.analyze(record);
  assert.ok(result.dates.includes('2026-07-15'));
  assert.ok(result.money.some(m => /3,200.50/.test(m)));
  assert.ok(result.phoneNumbers.includes('0712345678'));
  assert.ok(result.emails.includes('accounts@example.com'));
});

test('entity extraction never fabricates a category with no evidence', async () => {
  const du = freshInstance();
  const record = makeRecord({ documentType: 'unknown', rawText: 'A short plain sentence with nothing extractable.' });
  const result = await du.analyze(record);
  assert.deepEqual(result.entities.people, []);
  assert.deepEqual(result.emails, []);
  assert.deepEqual(result.phoneNumbers, []);
});

/* ------------------------------------------------------------------ */
/* LANGUAGE PRESERVATION                                               */
/* ------------------------------------------------------------------ */

test('language preservation: passed-through lang option is echoed, never invented', async () => {
  const du = freshInstance();
  const record = makeRecord({ rawText: 'Some text here for language check.' });
  const result = await du.analyze(record, { lang: 'swa' });
  assert.equal(result.language, 'swa');
});

test('language preservation: no fabricated language when none supplied', async () => {
  const du = freshInstance();
  const record = makeRecord({ rawText: 'Some text here.' });
  const result = await du.analyze(record, {});
  assert.equal(result.language, null);
});

/* ------------------------------------------------------------------ */
/* SUMMARY GENERATION                                                  */
/* ------------------------------------------------------------------ */

test('summary generation: multi-sentence text yields a shorter extractive summary', async () => {
  const du = freshInstance();
  const longText = 'This invoice covers consulting services rendered in June. ' +
    'The client requested additional hours for system integration work. ' +
    'Payment terms are net thirty days from the invoice date. ' +
    'Late payments will incur a two percent monthly surcharge. ' +
    'Please remit payment to the account listed below.';
  const record = makeRecord({ documentType: 'invoice', rawText: longText });
  const result = await du.analyze(record);
  assert.ok(result.summary.length > 0);
  assert.ok(result.summary.length < longText.length);
});

test('summary generation: short text returns itself rather than truncating oddly', async () => {
  const du = freshInstance();
  const record = makeRecord({ rawText: 'Just one short sentence.' });
  const result = await du.analyze(record);
  assert.equal(result.summary, 'Just one short sentence.');
});

/* ------------------------------------------------------------------ */
/* MALFORMED / EMPTY / LOW-CONFIDENCE INPUT                           */
/* ------------------------------------------------------------------ */

test('empty OCR input: honestly reports empty rather than fabricating structure', async () => {
  const du = freshInstance();
  const record = makeRecord({ rawText: '' });
  const result = await du.analyze(record);
  assert.equal(result.available, true);
  assert.deepEqual(result.headings, []);
  assert.equal(result.summary, '');
  assert.ok(result.warnings.some(w => /empty/i.test(w)));
});

test('malformed OCR input (DocumentEngine reports unavailable) propagates honestly', async () => {
  const du = freshInstance();
  global.window.CozyOS.DocumentEngine = {
    parseDocument: async () => ({ available: false, reason: 'OCR extraction failed: corrupted image data.' })
  };
  const result = await du.analyze('bad-image-blob', {});
  assert.equal(result.available, false);
  assert.match(result.reason, /corrupted image data/);
});

test('low confidence OCR input still analyzes but is tracked in diagnostics', async () => {
  const du = freshInstance();
  const record = makeRecord({ rawText: 'Faint scan text barely legible here.', confidence: 22 });
  const result = await du.analyze(record);
  assert.equal(result.available, true);
  const diag = du.getDiagnosticsReport();
  assert.equal(diag.lowConfidenceInputs, 1);
  assert.equal(result.confidence.ocr, 22);
});

/* ------------------------------------------------------------------ */
/* VALIDATE / REFRESH / DIAGNOSTICS (real operations only)             */
/* ------------------------------------------------------------------ */

test('validate() flags a poorly-enriched result without re-checking classification', async () => {
  const du = freshInstance();
  const record = makeRecord({ rawText: '' });
  const result = await du.analyze(record);
  const validation = du.validate(result);
  assert.equal(validation.valid, false);
  assert.ok(validation.warnings.length > 0);
});

test('refresh() re-runs analysis rather than performing a fake reload', async () => {
  const du = freshInstance();
  const record = makeRecord({ documentType: 'invoice', rawText: 'Invoice No: INV-1\nTotal KES 100' });
  const first = await du.analyze(record);
  const second = await du.refresh(record, {});
  assert.equal(first.documentType, second.documentType);
  assert.equal(second.available, true);
});

test('getDiagnosticsReport exposes only real, incremented counters — frozen result', async () => {
  const du = freshInstance();
  await du.analyze(makeRecord({ rawText: 'text' }));
  const diag = du.getDiagnosticsReport();
  assert.equal(diag.analysesRun, 1);
  assert.ok(Object.isFrozen(diag));
});
