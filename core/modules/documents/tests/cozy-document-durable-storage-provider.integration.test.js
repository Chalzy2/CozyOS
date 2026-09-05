/**
 * core/modules/documents/tests/cozy-document-durable-storage-provider.integration.test.js
 *
 * CozyOS File Phase 1, Step 5/6 — real, end-to-end proof that:
 *   CozyDocumentEngine.saveDocument()/loadDocument() (the engine's own
 *   real, unmodified public API — confirmed exact method names by
 *   direct inspection this round) -> CozyDocumentDurableStorageProvider
 *   -> a real running server.js instance -> DocumentStorageRegistry ->
 *   a real SQLite file
 * actually work together. DocumentEngine itself is never called via
 * the storage provider directly in this test — only through its own
 * real public methods, proving the existing contract is genuinely
 * preserved end to end, not merely compatible in isolation.
 *
 * Also proves the offline-first failure-isolation requirement: with no
 * server reachable at all, the durable provider must fail closed
 * (matching the in-memory provider's own {available:false} shape) —
 * never throwing, never crashing DocumentEngine or unrelated code.
 *
 * Run with: node core/modules/documents/tests/cozy-document-durable-storage-provider.integration.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { createServer } = require('../../../../server/webauthn-rp/server');

let passed = 0;
let failed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function loadDocumentEngineFresh() {
  const win = { CozyOS: {}, addEventListener: () => {} };
  global.window = win;
  global.document = { addEventListener: () => {} };

  const enginePath = path.join(__dirname, '..', 'cozy-document-engine.js');
  delete require.cache[require.resolve(enginePath)];
  require(enginePath);

  const durablePath = path.join(__dirname, '..', 'cozy-document-durable-storage-provider.js');
  delete require.cache[require.resolve(durablePath)];
  require(durablePath);

  return win;
}

async function withRealServer(fn) {
  const dbPath = path.join(os.tmpdir(), `cozyos-durable-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
  const server = createServer({ dbPath, rpId: 'localhost', rpName: 'CozyOS Test', origin: 'http://localhost' });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ base, server });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
}

// A minimal, real cookie jar — Node's global fetch does not
// automatically persist cookies across separate fetch() calls the way
// a browser does, so this test manages the one real session cookie
// explicitly and passes it via Cookie header, exactly matching how a
// real browser would send it after receiving Set-Cookie. This is not a
// mock of authentication — /auth/register and /auth/login are real
// routes, genuinely exercised.
async function registerLoginAndOrg(base) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = 'correct horse battery staple 1';
  await fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const loginRes = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const cookie = loginRes.headers.get('set-cookie').split(';')[0];
  const orgRes = await fetch(`${base}/organizations/create`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ name: 'E2E Org' }) });
  const org = await orgRes.json();
  return { cookie, organizationId: org.organization.id };
}

/**
 * A thin, real fetch wrapper bound to one session cookie — used so the
 * durable provider's own internal fetch() calls (which use
 * credentials:"same-origin", a browser concept Node's fetch does not
 * replicate automatically) actually carry the real session. This
 * overrides global.fetch for the duration of the test only, delegating
 * to the real, underlying fetch for the actual network call — it does
 * not fake or intercept any response data.
 */
function installCookieForwardingFetch(cookie) {
  const realFetch = global.fetch;
  global.fetch = (url, options = {}) => {
    const headers = { ...(options.headers || {}), Cookie: cookie };
    return realFetch(url, { ...options, headers });
  };
  return () => { global.fetch = realFetch; };
}

test('CozyDocumentEngine.saveDocument() and loadDocument(), through the real durable provider and a real running server, actually persist and retrieve a document end to end', async () => {
  await withRealServer(async ({ base }) => {
    const { cookie, organizationId } = await registerLoginAndOrg(base);
    const win = loadDocumentEngineFresh();
    const restoreFetch = installCookieForwardingFetch(cookie);
    try {
      win.CozyOS.DocumentDurableStorageProvider.registerAsDocumentStorageProvider({ baseUrl: base, organizationId });

      const documentId = crypto.randomUUID();
      const saveResult = await win.CozyOS.DocumentEngine.saveDocument({ documentId, title: 'E2E Testimony', rawText: 'Saved through the real engine and a real server.' });
      assert.strictEqual(saveResult.available, true, JSON.stringify(saveResult));
      assert.strictEqual(saveResult.documentId, documentId);

      const loadResult = await win.CozyOS.DocumentEngine.loadDocument(documentId);
      assert.strictEqual(loadResult.available, true, JSON.stringify(loadResult));
      assert.strictEqual(loadResult.record.title, 'E2E Testimony');
      assert.strictEqual(loadResult.record.rawText, 'Saved through the real engine and a real server.');
    } finally {
      restoreFetch();
    }
  });
});

test('CozyDocumentEngine.archiveDocument()/restoreDocument(), through the real durable provider, transition status correctly end to end', async () => {
  await withRealServer(async ({ base }) => {
    const { cookie, organizationId } = await registerLoginAndOrg(base);
    const win = loadDocumentEngineFresh();
    const restoreFetch = installCookieForwardingFetch(cookie);
    try {
      win.CozyOS.DocumentDurableStorageProvider.registerAsDocumentStorageProvider({ baseUrl: base, organizationId });
      const documentId = crypto.randomUUID();
      await win.CozyOS.DocumentEngine.saveDocument({ documentId, title: 'Policy' });

      const archived = await win.CozyOS.DocumentEngine.archiveDocument(documentId);
      assert.strictEqual(archived.available, true);
      const afterArchive = await win.CozyOS.DocumentEngine.loadDocument(documentId);
      assert.strictEqual(afterArchive.record.status, 'archived');

      const restored = await win.CozyOS.DocumentEngine.restoreDocument(documentId);
      assert.strictEqual(restored.available, true);
      const afterRestore = await win.CozyOS.DocumentEngine.loadDocument(documentId);
      assert.strictEqual(afterRestore.record.status, 'draft');
    } finally {
      restoreFetch();
    }
  });
});

// ---------------------------------------------------------------------
// Offline-first failure isolation — no server reachable at all
// ---------------------------------------------------------------------

test('OFFLINE-FIRST: with no server reachable at all, the durable provider fails closed ({available:false}) — never throws, never crashes DocumentEngine', async () => {
  const win = loadDocumentEngineFresh();
  // A deliberately unreachable port — nothing is listening here.
  win.CozyOS.DocumentDurableStorageProvider.registerAsDocumentStorageProvider({ baseUrl: 'http://127.0.0.1:1', organizationId: 'irrelevant-org' });

  const documentId = crypto.randomUUID();
  let threw = false;
  let saveResult;
  try {
    saveResult = await win.CozyOS.DocumentEngine.saveDocument({ documentId, title: 'Should fail closed' });
  } catch (_err) {
    threw = true;
  }
  assert.strictEqual(threw, false, 'a network failure must never throw out of saveDocument() — it must fail closed like any other honest failure');
  assert.strictEqual(saveResult.available, false, 'an unreachable durable backend must report available:false, exactly like the in-memory provider does for its own failure cases');
});

test('OFFLINE-FIRST: a durable-provider network failure does not affect an unrelated, already-loaded CozyOS global (window.CozyOS itself remains intact)', async () => {
  const win = loadDocumentEngineFresh();
  win.CozyOS.SomeUnrelatedModule = { healthy: true };
  win.CozyOS.DocumentDurableStorageProvider.registerAsDocumentStorageProvider({ baseUrl: 'http://127.0.0.1:1', organizationId: 'irrelevant-org' });
  await win.CozyOS.DocumentEngine.saveDocument({ documentId: crypto.randomUUID(), title: 'x' });
  assert.strictEqual(win.CozyOS.SomeUnrelatedModule.healthy, true, 'an unrelated global must remain completely unaffected by a document-storage network failure');
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`  \u2713 ${name}`);
      passed++;
    } catch (err) {
      console.log(`  \u2717 ${name}`);
      console.log(`      ${err.stack || err.message}`);
      failed++;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
  process.exit(process.exitCode);
})();
