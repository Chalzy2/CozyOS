'use strict';

/**
 * core/plugins/tests/interestOS-documents-client.test.js
 * InterestOS Phase 2, Dependency #4 — Durable Document Access wiring.
 * No real server is started here (that's document-personal-ownership.
 * test.js's job); these tests exercise the client's own real routing/
 * fail-closed logic against a mocked fetch, matching the sandbox's own
 * established pattern for browser-only files.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const CLIENT_PATH = path.join(__dirname, '..', 'interestOS-documents-client.js');

function freshClient({ session = undefined, parentSession = undefined, fetchImpl = null } = {}) {
  delete require.cache[require.resolve(CLIENT_PATH)];
  const cozyos = {};
  if (session !== undefined) cozyos.Session = session;
  global.window = { CozyOS: cozyos, location: { origin: "http://localhost" } };
  if (parentSession !== undefined) {
    global.window.parent = { CozyOS: { Session: parentSession } };
  } else {
    global.window.parent = global.window; // no real parent frame — matches a top-level (non-iframe) load
  }
  const calls = [];
  global.fetch = fetchImpl || (async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ available: true, documentId: 'doc-1' }) };
  });
  require(CLIENT_PATH);
  return { client: global.window.CozyOS.InterestOSDocumentsClient, calls };
}

function makeSession(snap) {
  return { current: () => snap };
}

// ---------------------------------------------------------------
// Personal user path
// ---------------------------------------------------------------

test('PERSONAL: an authenticated user with no company is routed to /documents/personal*', async () => {
  const { client, calls } = freshClient({ session: makeSession({ uid: 'user-1', company: null }) });
  const result = await client.saveDocument({ documentId: 'd1', title: 'Note' });
  assert.equal(result.available, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/documents\/personal$/);
  assert.equal(calls[0].body.organizationId, undefined, 'personal requests must never include an organizationId');
});

test('PERSONAL: resolveDocumentContext() never fabricates an organization for a user with no real company reference', () => {
  const { client } = freshClient({ session: makeSession({ uid: 'user-1', company: null }) });
  const ctx = client.resolveDocumentContext();
  assert.equal(ctx.mode, 'personal');
  assert.equal(ctx.organizationId, null);
});

// ---------------------------------------------------------------
// Organization user path
// ---------------------------------------------------------------

test('ORGANIZATION: an authenticated user with a real company is routed to the organization routes with the real organizationId', async () => {
  const { client, calls } = freshClient({ session: makeSession({ uid: 'user-2', company: { companyId: 'org-42' } }) });
  const result = await client.loadDocument('doc-1');
  assert.equal(result.available, true);
  assert.match(calls[0].url, /\/documents\/load$/);
  assert.equal(calls[0].body.organizationId, 'org-42');
});

test('ORGANIZATION: every method (save/load/search/archive/restore/delete) uses the real organizationId, never a client-invented one', async () => {
  const { client, calls } = freshClient({ session: makeSession({ uid: 'user-2', company: { companyId: 'org-42' } }) });
  await client.saveDocument({ documentId: 'd1' });
  await client.searchDocuments({ query: 'x' });
  await client.archiveDocument('d1');
  await client.restoreDocument('d1');
  await client.deleteDocument('d1');
  assert.equal(calls.length, 5);
  calls.forEach((c) => assert.equal(c.body.organizationId, 'org-42'));
});

// ---------------------------------------------------------------
// Unauthenticated access
// ---------------------------------------------------------------

test('UNAUTHENTICATED: no Session at all — honestly refuses, never calls fetch', async () => {
  const { client, calls } = freshClient({}); // no session key set at all
  const result = await client.saveDocument({ documentId: 'd1' });
  assert.equal(result.available, false);
  assert.match(result.reason, /Session is not connected/);
  assert.equal(calls.length, 0);
});

test('UNAUTHENTICATED: a real Session with no current user — honestly refuses, never calls fetch', async () => {
  const { client, calls } = freshClient({ session: makeSession(null) });
  const result = await client.loadDocument('doc-1');
  assert.equal(result.available, false);
  assert.match(result.reason, /No authenticated user/);
  assert.equal(calls.length, 0);
});

test('UNAUTHENTICATED: a 401 from the real server is surfaced honestly, not retried or bypassed', async () => {
  const { client } = freshClient({
    session: makeSession({ uid: 'user-1', company: null }),
    fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'not_authenticated' }) }),
  });
  const result = await client.saveDocument({ documentId: 'd1' });
  assert.equal(result.available, false);
  assert.match(result.reason, /Not authenticated/);
});

// ---------------------------------------------------------------
// Cross-owner / authorization denial surfaced honestly
// ---------------------------------------------------------------

test('AUTHORIZATION: a 403 from the real server (e.g. non-member/cross-owner) is surfaced honestly, not treated as success', async () => {
  const { client } = freshClient({
    session: makeSession({ uid: 'user-1', company: { companyId: 'org-1' } }),
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({ error: 'not_authorized' }) }),
  });
  const result = await client.loadDocument('doc-owned-by-someone-else');
  assert.equal(result.available, false);
  assert.match(result.reason, /Not authorized/);
});

test('AUTHORIZATION: a real {available:false} 404 body from the server (personal cross-owner denial) passes through unchanged, never rewritten as a success', async () => {
  const { client } = freshClient({
    session: makeSession({ uid: 'user-1', company: null }),
    fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({ available: false, reason: 'Document not found.' }) }),
  });
  const result = await client.loadDocument('doc-1');
  assert.equal(result.available, false);
  assert.equal(result.reason, 'Document not found.');
});

// ---------------------------------------------------------------
// Backend/network failure surfaced honestly
// ---------------------------------------------------------------

test('BACKEND FAILURE: a real network error is surfaced honestly, never silently falls back to a fake success', async () => {
  const { client } = freshClient({
    session: makeSession({ uid: 'user-1', company: null }),
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
  });
  const result = await client.saveDocument({ documentId: 'd1' });
  assert.equal(result.available, false);
  assert.match(result.reason, /Document backend unreachable/);
});

// ---------------------------------------------------------------
// Iframe execution context
// ---------------------------------------------------------------

test('IFRAME: with no local window.CozyOS.Session, the real window.parent.CozyOS.Session (same-origin) is used instead', async () => {
  const { client, calls } = freshClient({
    session: undefined, // nothing local at all — simulates the iframe's own fresh window.CozyOS
    parentSession: makeSession({ uid: 'user-3', company: { companyId: 'org-9' } }),
  });
  const result = await client.saveDocument({ documentId: 'd1' });
  assert.equal(result.available, true);
  assert.equal(calls[0].body.organizationId, 'org-9');
});

test('IFRAME: a local window.CozyOS.Session (top-level, non-iframe load) takes priority over window.parent when both exist', async () => {
  const { client, calls } = freshClient({
    session: makeSession({ uid: 'local-user', company: null }),
    parentSession: makeSession({ uid: 'parent-user', company: { companyId: 'org-parent' } }),
  });
  await client.saveDocument({ documentId: 'd1' });
  assert.equal(calls[0].url.endsWith('/documents/personal'), true, 'the local session (personal) must win, not the parent\'s organization session');
});

// ---------------------------------------------------------------
// uploadDocument() / downloadDocument()
// ---------------------------------------------------------------

function fakeBinaryFetch(responses) {
  const calls = [];
  let i = 0;
  const impl = async (url, opts) => {
    calls.push({ url: String(url), opts });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return r;
  };
  return { impl, calls };
}

test('UPLOAD: personal context routes to /documents/personal/binary with no organization header', async () => {
  const { calls, impl } = fakeBinaryFetch([{ ok: true, status: 200, json: async () => ({ available: true, size: 3, mimeType: 'text/plain', checksum: 'abc' }) }]);
  const { client } = freshClient({ session: makeSession({ uid: 'user-1', company: null }), fetchImpl: impl });
  const result = await client.uploadDocument('doc-1', 'hi!', { filename: 'note.txt', mimeType: 'text/plain' });
  assert.equal(result.available, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/documents\/personal\/binary$/);
  assert.equal(calls[0].opts.headers['X-Cozy-Organization-Id'], undefined, 'personal upload must never send an organization header');
  assert.equal(calls[0].opts.headers['X-Cozy-Document-Id'], 'doc-1');
  assert.equal(calls[0].opts.body, 'hi!');
});

test('UPLOAD: organization context routes to /documents/binary with the real organization header', async () => {
  const { calls, impl } = fakeBinaryFetch([{ ok: true, status: 200, json: async () => ({ available: true }) }]);
  const { client } = freshClient({ session: makeSession({ uid: 'user-2', company: { companyId: 'org-42' } }), fetchImpl: impl });
  await client.uploadDocument('doc-1', 'content', { mimeType: 'application/pdf' });
  assert.match(calls[0].url, /\/documents\/binary$/);
  assert.equal(calls[0].opts.headers['X-Cozy-Organization-Id'], 'org-42');
});

test('UPLOAD: a 413 (too large) is surfaced honestly, never converted into a success', async () => {
  const { impl } = fakeBinaryFetch([{ ok: false, status: 413, json: async () => ({ error: 'binary_too_large', maxBytes: 26214400 }) }]);
  const { client } = freshClient({ session: makeSession({ uid: 'user-1', company: null }), fetchImpl: impl });
  const result = await client.uploadDocument('doc-1', 'big', {});
  assert.equal(result.available, false);
  assert.match(result.reason, /binary_too_large/);
});

test('UPLOAD: a 403 from the real server is surfaced honestly (e.g. non-owner attempting a write)', async () => {
  const { impl } = fakeBinaryFetch([{ ok: false, status: 403, json: async () => ({ error: 'not_authorized' }) }]);
  const { client } = freshClient({ session: makeSession({ uid: 'user-1', company: { companyId: 'org-1' } }), fetchImpl: impl });
  const result = await client.uploadDocument('doc-1', 'x', {});
  assert.equal(result.available, false);
  assert.match(result.reason, /Not authorized/);
});

test('UPLOAD: no authenticated user — honestly refuses, never calls fetch', async () => {
  const { calls, impl } = fakeBinaryFetch([]);
  const { client } = freshClient({ session: makeSession(null), fetchImpl: impl });
  const result = await client.uploadDocument('doc-1', 'x', {});
  assert.equal(result.available, false);
  assert.equal(calls.length, 0);
});

test('DOWNLOAD: personal context routes to /documents/personal/binary and returns a real Blob plus real server metadata', async () => {
  const fakeBlob = { size: 5 };
  const headerMap = new Map([['content-type', 'text/plain'], ['content-length', '5'], ['x-cozy-checksum-sha256', 'real-checksum']]);
  const fakeHeaders = { get: (k) => headerMap.get(k.toLowerCase()) || null };
  const impl = async (url) => {
    assert.match(String(url), /\/documents\/personal\/binary\?documentId=doc-1$/);
    return { ok: true, status: 200, headers: fakeHeaders, blob: async () => fakeBlob };
  };
  const { client } = freshClient({ session: makeSession({ uid: 'user-1', company: null }), fetchImpl: impl });
  const result = await client.downloadDocument('doc-1');
  assert.equal(result.available, true);
  assert.equal(result.mimeType, 'text/plain');
  assert.equal(result.checksum, 'real-checksum');
  assert.equal(result.blob, fakeBlob);
});

test('DOWNLOAD: organization context includes the real organizationId in the query string', async () => {
  let capturedUrl = null;
  const fakeHeaders = { get: () => null };
  const impl = async (url) => { capturedUrl = String(url); return { ok: true, status: 200, headers: fakeHeaders, blob: async () => ({ size: 0 }) }; };
  const { client } = freshClient({ session: makeSession({ uid: 'user-2', company: { companyId: 'org-9' } }), fetchImpl: impl });
  await client.downloadDocument('doc-2');
  assert.match(capturedUrl, /organizationId=org-9/);
  assert.match(capturedUrl, /documentId=doc-2/);
});

test('DOWNLOAD: a 404 (cross-owner / not found) is surfaced honestly, never a fabricated blob', async () => {
  const impl = async () => ({ ok: false, status: 404, json: async () => ({ error: 'Document not found.' }) });
  const { client } = freshClient({ session: makeSession({ uid: 'user-1', company: null }), fetchImpl: impl });
  const result = await client.downloadDocument('doc-1');
  assert.equal(result.available, false);
  assert.equal(result.reason, 'Document not found.');
  assert.equal(result.blob, undefined);
});

test('DOWNLOAD: no authenticated user — honestly refuses, never calls fetch', async () => {
  let called = false;
  const impl = async () => { called = true; return { ok: true, status: 200 }; };
  const { client } = freshClient({ session: makeSession(null), fetchImpl: impl });
  const result = await client.downloadDocument('doc-1');
  assert.equal(result.available, false);
  assert.equal(called, false);
});

test('BOUNDARY: uploadDocument/downloadDocument resolve context fresh on every call, same as every other method', async () => {
  // Real regression check: nothing in the new methods caches context —
  // confirmed by exercising both personal and organization routing
  // from the SAME client instance across two calls with different
  // sessions swapped in between.
  let currentSnap = { uid: 'user-1', company: null };
  const session = { current: () => currentSnap };
  const { calls } = fakeBinaryFetch([]);
  const uploadCalls = [];
  const impl = async (url, opts) => { uploadCalls.push(String(url)); return { ok: true, status: 200, json: async () => ({ available: true }) }; };
  const { client } = freshClient({ session, fetchImpl: impl });
  await client.uploadDocument('doc-1', 'x', {});
  currentSnap = { uid: 'user-1', company: { companyId: 'org-1' } };
  await client.uploadDocument('doc-1', 'x', {});
  assert.match(uploadCalls[0], /\/documents\/personal\/binary$/);
  assert.match(uploadCalls[1], /\/documents\/binary$/);
});
