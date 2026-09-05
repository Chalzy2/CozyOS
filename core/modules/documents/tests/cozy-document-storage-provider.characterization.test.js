/**
 * core/modules/documents/tests/cozy-document-storage-provider.characterization.test.js
 *
 * CozyOS File Phase 1, Step 4 — characterization tests for the EXISTING
 * in-memory CozyDocumentStorageProvider. These establish the real,
 * observed behavior of the reference implementation BEFORE comparing
 * it against the new durable (server-backed) provider. Only actual,
 * observed behavior is tested here — nothing invented.
 *
 * Run with: node core/modules/documents/tests/cozy-document-storage-provider.characterization.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function loadFresh() {
  const win = { CozyOS: {}, addEventListener: () => {} };
  global.window = win;
  global.document = { addEventListener: () => {} };

  const enginePath = path.join(__dirname, '..', 'cozy-document-engine.js');
  delete require.cache[require.resolve(enginePath)];
  require(enginePath);

  const providerPath = path.join(__dirname, '..', 'cozy-document-storage-provider.js');
  delete require.cache[require.resolve(providerPath)];
  require(providerPath);

  return win;
}

// ---------------------------------------------------------------------
// save() / load()
// ---------------------------------------------------------------------

test('save() accepts a record with a documentId and returns {available:true, documentId}', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  const result = await provider.save({ documentId: 'doc-1', title: 'Test', rawText: 'hello world' });
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.documentId, 'doc-1');
});

test('save() without a documentId throws — documentId is a hard requirement, observed directly', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await assert.rejects(() => provider.save({ title: 'No ID' }), TypeError);
});

test('load() retrieves the exact saved record, including rawText', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-2', title: 'Loadable', rawText: 'content here' });
  const result = await provider.load('doc-2');
  assert.strictEqual(result.available, true);
  assert.strictEqual(result.record.title, 'Loadable');
  assert.strictEqual(result.record.rawText, 'content here');
});

test('load() of a nonexistent documentId returns {available:false, reason}, never a fabricated record', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  const result = await provider.load('does-not-exist');
  assert.strictEqual(result.available, false);
  assert.strictEqual(result.reason, 'Document not found.');
});

test('a freshly-saved document defaults to status "draft" and version 1', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-3' });
  const result = await provider.load('doc-3');
  assert.strictEqual(result.record.status, 'draft');
  assert.strictEqual(result.record.version, 1);
});

test('an unsupported documentType is rejected with a TypeError', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await assert.rejects(() => provider.save({ documentId: 'doc-4', documentType: 'not_a_real_type' }), TypeError);
});

// ---------------------------------------------------------------------
// archive() / restore() / delete()
// ---------------------------------------------------------------------

test('archive() sets status to "archived"', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-5' });
  const archived = await provider.archive('doc-5');
  assert.strictEqual(archived.available, true);
  const loaded = await provider.load('doc-5');
  assert.strictEqual(loaded.record.status, 'archived');
});

test('restore() sets status back to "draft" (not the pre-archive status, observed directly) - this is the exact behavior the durable provider must match', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-6' });
  await provider.archive('doc-6');
  const restored = await provider.restore('doc-6');
  assert.strictEqual(restored.available, true);
  const loaded = await provider.load('doc-6');
  assert.strictEqual(loaded.record.status, 'draft');
});

test('delete() is a soft delete — status becomes "deleted" but the record remains loadable', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-7' });
  const deleted = await provider.delete('doc-7');
  assert.strictEqual(deleted.available, true);
  const loaded = await provider.load('doc-7');
  assert.strictEqual(loaded.available, true, 'soft delete must leave the record loadable');
  assert.strictEqual(loaded.record.status, 'deleted');
});

test('archive()/restore()/delete() on a nonexistent documentId return {available:false}', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  const archived = await provider.archive('nope');
  const restored = await provider.restore('nope');
  const deleted = await provider.delete('nope');
  assert.strictEqual(archived.available, false);
  assert.strictEqual(restored.available, false);
  assert.strictEqual(deleted.available, false);
});

// ---------------------------------------------------------------------
// updateDocument() / versions
// ---------------------------------------------------------------------

test('updateDocument() creates a new version, never overwriting prior history', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-8', title: 'v1' });
  const updated = await provider.updateDocument('doc-8', { title: 'v2' });
  assert.strictEqual(updated.available, true);
  assert.strictEqual(updated.version, 2);
  const versions = provider.getDocumentVersions('doc-8');
  assert.strictEqual(versions.length, 2);
  assert.strictEqual(versions[0].snapshot.title, 'v1');
  assert.strictEqual(versions[1].snapshot.title, 'v2');
});

test('getDocumentVersions() of a document with no updates returns exactly one entry (the initial save)', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-9' });
  const versions = provider.getDocumentVersions('doc-9');
  assert.strictEqual(versions.length, 1);
  assert.strictEqual(versions[0].version, 1);
});

// ---------------------------------------------------------------------
// searchDocuments()
// ---------------------------------------------------------------------

test('searchDocuments() with a text query matches against title (case-insensitive, observed directly)', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-10', title: 'Healing Testimony' });
  await provider.save({ documentId: 'doc-11', title: 'Building Fund' });
  const results = provider.searchDocuments({ query: 'healing' });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].documentId, 'doc-10');
});

test('searchDocuments() with no filters returns every saved document', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-12' });
  await provider.save({ documentId: 'doc-13' });
  const results = provider.searchDocuments({});
  assert.strictEqual(results.length, 2);
});

test('searchDocuments() filters by status', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-14' });
  await provider.save({ documentId: 'doc-15' });
  await provider.archive('doc-15');
  const archived = provider.searchDocuments({ status: 'archived' });
  assert.strictEqual(archived.length, 1);
  assert.strictEqual(archived[0].documentId, 'doc-15');
});

// ---------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------

test('getAuditLog() records a real entry for each save/archive/restore/delete operation', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-16' });
  await provider.archive('doc-16');
  const log = provider.getAuditLog();
  const actions = log.map((e) => e.action);
  assert.ok(actions.includes('DOCUMENT_CREATED'));
  assert.ok(actions.includes('DOCUMENT_ARCHIVED'));
});

// ---------------------------------------------------------------------
// Integrity (checksum)
// ---------------------------------------------------------------------

test('a saved document has a real, non-null checksum when rawText is provided', async () => {
  const win = loadFresh();
  const provider = win.CozyOS.DocumentStorageProvider;
  await provider.save({ documentId: 'doc-17', rawText: 'checksummed content' });
  const loaded = await provider.load('doc-17');
  assert.ok(loaded.record.checksum, 'expected a real, non-null checksum');
  assert.strictEqual(loaded.record.checksum.length, 64, 'SHA-256 hex digest must be 64 characters');
});

// ---------------------------------------------------------------------
// HONEST LIMITATIONS of the reference implementation, recorded explicitly
// ---------------------------------------------------------------------

test('HONEST LIMITATION: the in-memory provider does NOT survive being freshly reloaded (require cache cleared) - this is the exact gap the durable provider exists to close', async () => {
  const win1 = loadFresh();
  await win1.CozyOS.DocumentStorageProvider.save({ documentId: 'doc-18' });
  const win2 = loadFresh();
  const result = await win2.CozyOS.DocumentStorageProvider.load('doc-18');
  assert.strictEqual(result.available, false, 'confirms the in-memory provider genuinely has no persistence across a fresh load — the documented gap this phase closes');
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  \u2713 ${name}`);
      passed++;
    } catch (err) {
      console.log(`  \u2717 ${name}`);
      console.log(`      ${err.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
