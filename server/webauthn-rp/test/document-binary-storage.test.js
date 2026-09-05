'use strict';
/**
 * server/webauthn-rp/test/document-binary-storage.test.js
 *
 * CozyOS File Phase 2 — real HTTP-route tests for binary/object
 * storage, exercising the actual server routes against a real,
 * filesystem-backed FilesystemObjectStorageProvider, following the same
 * testing philosophy as document-storage.test.js: cookie-derived
 * identity, fail-closed authorization, organization isolation, end to
 * end, real streaming (not base64/JSON), real SHA-256 verification.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-binary-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const objectStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), `cozyos-binary-test-${name}-`));
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN, objectStorageRoot });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, dbPath, objectStorageRoot, db: server.db, objectStorage: server.objectStorage });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
    fs.rmSync(objectStorageRoot, { recursive: true, force: true });
  }
}

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  return setCookie.split(';')[0];
}

async function post(base, path_, body, cookie) {
  const res = await fetch(base + path_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: extractCookie(res) };
}

async function uploadBinary(base, { organizationId, documentId, filename, mimeType, content, cookie }) {
  const res = await fetch(`${base}/documents/binary`, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'X-Cozy-Organization-Id': organizationId,
      'X-Cozy-Document-Id': documentId,
      ...(filename ? { 'X-Cozy-Filename': encodeURIComponent(filename) } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: content,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function downloadBinary(base, { organizationId, documentId, cookie }) {
  const url = new URL(`${base}/documents/binary`);
  url.searchParams.set('organizationId', organizationId);
  url.searchParams.set('documentId', documentId);
  const res = await fetch(url, { headers: cookie ? { Cookie: cookie } : {} });
  const buffer = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
  const json = res.ok ? null : await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, buffer, json };
}

let userCounter = 0;
async function registerAndLogin(base, emailPrefix) {
  const email = `${emailPrefix}-${++userCounter}@example.com`;
  const password = 'correct horse battery staple 1';
  const reg = await post(base, '/auth/register', { email, password });
  assert.equal(reg.status, 200);
  const login = await post(base, '/auth/login', { email, password });
  assert.equal(login.status, 200);
  return { email, userId: reg.json.userId, cookie: login.cookie };
}

async function createOrgAsOwner(base, owner, name) {
  const res = await post(base, '/organizations/create', { name: name || `Org ${++userCounter}` }, owner.cookie);
  assert.equal(res.status, 200);
  return res.json.organization.id;
}

async function createDocument(base, orgId, cookie, title = 'Test Document') {
  const res = await post(base, '/documents', { organizationId: orgId, record: { documentId: crypto.randomUUID(), title } }, cookie);
  assert.equal(res.status, 200);
  return res.json.documentId;
}

// ---------------------------------------------------------------------
// 1. Basic upload/download contract
// ---------------------------------------------------------------------

test('upload then download returns byte-identical content', async () => {
  await withServer('basic', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const documentId = await createDocument(base, orgId, owner.cookie);

    const content = Buffer.from('Real PDF-like binary content for testing.'.repeat(500));
    const upload = await uploadBinary(base, { organizationId: orgId, documentId, mimeType: 'application/pdf', filename: 'report.pdf', content, cookie: owner.cookie });
    assert.equal(upload.status, 200);
    assert.equal(upload.json.available, true);
    assert.equal(upload.json.size, content.length);

    const download = await downloadBinary(base, { organizationId: orgId, documentId, cookie: owner.cookie });
    assert.equal(download.status, 200);
    assert.ok(download.buffer.equals(content), 'downloaded content must be byte-identical to what was uploaded');
    assert.equal(download.headers.get('content-type'), 'application/pdf');
  });
});

test('upload computes and returns a real, server-side SHA-256 matching an independent recomputation', async () => {
  await withServer('checksum', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const documentId = await createDocument(base, orgId, owner.cookie);
    const content = Buffer.from('checksummed binary content');
    const expected = crypto.createHash('sha256').update(content).digest('hex');

    const upload = await uploadBinary(base, { organizationId: orgId, documentId, content, cookie: owner.cookie });
    assert.equal(upload.json.checksum, expected);

    const download = await downloadBinary(base, { organizationId: orgId, documentId, cookie: owner.cookie });
    assert.equal(download.headers.get('x-cozy-checksum-sha256'), expected);
  });
});

test('the document record_json never contains the raw binary bytes - only a storage reference', async () => {
  await withServer('no-embedded-binary', async ({ base, db }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const documentId = await createDocument(base, orgId, owner.cookie);
    const content = Buffer.from('This exact string must never appear inside record_json.');
    await uploadBinary(base, { organizationId: orgId, documentId, content, cookie: owner.cookie });

    const row = await db.get('SELECT record_json, binary_storage_ref FROM documents WHERE id = ?', [documentId]);
    assert.ok(row.binary_storage_ref, 'a real storage reference must be recorded');
    assert.ok(!row.record_json.includes('This exact string'), 'the raw binary content must never be embedded in record_json');
  });
});

test('loadBinary honestly reports unavailable for a document that has metadata but no uploaded binary', async () => {
  await withServer('no-binary-yet', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const documentId = await createDocument(base, orgId, owner.cookie);
    const download = await downloadBinary(base, { organizationId: orgId, documentId, cookie: owner.cookie });
    assert.equal(download.status, 404);
  });
});

// ---------------------------------------------------------------------
// 2. Versioning - old binary content must remain recoverable
// ---------------------------------------------------------------------

test('uploading binary content again after a new metadata version does not destroy the previous version\'s binary content', async () => {
  await withServer('binary-versioning', async ({ base, objectStorage }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const documentId = await createDocument(base, orgId, owner.cookie, 'v1');

    const v1Content = Buffer.from('version 1 binary content');
    await uploadBinary(base, { organizationId: orgId, documentId, content: v1Content, cookie: owner.cookie });
    const v1Key = objectStorage.buildKey(orgId, documentId, 1);
    assert.equal(await objectStorage.exists(v1Key), true);

    // Create a new metadata version (v2) of the same document.
    await post(base, '/documents', { organizationId: orgId, record: { documentId, title: 'v2' } }, owner.cookie);
    const v2Content = Buffer.from('version 2 binary content, different from v1');
    await uploadBinary(base, { organizationId: orgId, documentId, content: v2Content, cookie: owner.cookie });
    const v2Key = objectStorage.buildKey(orgId, documentId, 2);

    // Both real objects must exist independently on disk.
    assert.equal(await objectStorage.exists(v1Key), true, 'version 1 binary content must remain recoverable after v2 is uploaded');
    assert.equal(await objectStorage.exists(v2Key), true);

    const v1Stored = await objectStorage.get(v1Key);
    const v1Chunks = []; for await (const c of v1Stored.stream) v1Chunks.push(c);
    assert.ok(Buffer.concat(v1Chunks).equals(v1Content), 'version 1 content must be byte-identical to what was originally uploaded, unaffected by v2');
  });
});

// ---------------------------------------------------------------------
// 3. Large files
// ---------------------------------------------------------------------

test('a large (~5MB) binary upload succeeds and round-trips byte-for-byte, without loading the whole file into a single JSON payload', async () => {
  await withServer('large-binary', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const documentId = await createDocument(base, orgId, owner.cookie);
    const content = crypto.randomBytes(5 * 1024 * 1024);

    const upload = await uploadBinary(base, { organizationId: orgId, documentId, mimeType: 'application/pdf', content, cookie: owner.cookie });
    assert.equal(upload.status, 200);
    assert.equal(upload.json.size, content.length);

    const download = await downloadBinary(base, { organizationId: orgId, documentId, cookie: owner.cookie });
    assert.ok(download.buffer.equals(content), 'a large binary file must round-trip byte-for-byte intact');
  });
});

test('an oversized upload (>25MB) is rejected and never persisted - matches this codebase\'s existing readJsonBody() precedent for oversized bodies (an abrupt connection close, not a clean HTTP error), consistent rather than inventing a different behavior for binary uploads', async () => {
  await withServer('oversized', async ({ base, objectStorage }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const documentId = await createDocument(base, orgId, owner.cookie);
    const content = crypto.randomBytes(26 * 1024 * 1024);
    await assert.rejects(
      () => uploadBinary(base, { organizationId: orgId, documentId, content, cookie: owner.cookie }),
      /fetch failed/,
      'an oversized upload must fail the connection, matching this server\'s existing precedent for oversized request bodies'
    );
    // Most important part of this test: confirm the oversized content
    // was never actually persisted to disk, regardless of how the
    // connection failed.
    const key = objectStorage.buildKey(orgId, documentId, 1);
    assert.equal(await objectStorage.exists(key), false, 'rejected oversized content must never be persisted');
  });
});

// ---------------------------------------------------------------------
// 4. Security
// ---------------------------------------------------------------------

test('unauthenticated upload and download are both rejected', async () => {
  await withServer('unauth-binary', async ({ base }) => {
    const upload = await uploadBinary(base, { organizationId: 'x', documentId: 'y', content: Buffer.from('x') });
    assert.equal(upload.status, 401);
    const download = await downloadBinary(base, { organizationId: 'x', documentId: 'y' });
    assert.equal(download.status, 401);
  });
});

test('a user cannot download binary content belonging to a different organization', async () => {
  await withServer('cross-org-binary', async ({ base }) => {
    const ownerA = await registerAndLogin(base, 'orgA');
    const orgA = await createOrgAsOwner(base, ownerA, 'Org A');
    const documentId = await createDocument(base, orgA, ownerA.cookie);
    await uploadBinary(base, { organizationId: orgA, documentId, content: Buffer.from('secret content'), cookie: ownerA.cookie });

    const ownerB = await registerAndLogin(base, 'orgB');
    const orgB = await createOrgAsOwner(base, ownerB, 'Org B');
    const crossDownload = await downloadBinary(base, { organizationId: orgB, documentId, cookie: ownerB.cookie });
    assert.equal(crossDownload.status, 404, 'a document must never be downloadable through a different organization, even with the real documentId');
  });
});

test('a member without org:documents:manage cannot upload binary content, even though they can read it once uploaded', async () => {
  await withServer('member-no-grant-binary', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const documentId = await createDocument(base, orgId, owner.cookie);
    await uploadBinary(base, { organizationId: orgId, documentId, content: Buffer.from('owner uploaded this'), cookie: owner.cookie });

    const member = await registerAndLogin(base, 'member');
    await post(base, '/organizations/invite', { organizationId: orgId, userId: member.userId, roles: [] }, owner.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: orgId }, member.cookie);

    const uploadAttempt = await uploadBinary(base, { organizationId: orgId, documentId, content: Buffer.from('member tries to overwrite'), cookie: member.cookie });
    assert.equal(uploadAttempt.status, 403);

    const download = await downloadBinary(base, { organizationId: orgId, documentId, cookie: member.cookie });
    assert.equal(download.status, 200, 'a plain member must still be able to read/download');
  });
});

test('binary storage keys are always server-generated and never influenced by a client-supplied filename, even one shaped like a path traversal attempt', async () => {
  await withServer('filename-traversal', async ({ base, objectStorage }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const documentId = await createDocument(base, orgId, owner.cookie);
    const maliciousFilename = '../../../../etc/passwd';
    const upload = await uploadBinary(base, { organizationId: orgId, documentId, filename: maliciousFilename, content: Buffer.from('content'), cookie: owner.cookie });
    assert.equal(upload.status, 200, 'the upload itself must still succeed - the filename is just a display label');

    // The real storage key must be the normal, server-generated one -
    // never derived from the malicious filename.
    const expectedKey = objectStorage.buildKey(orgId, documentId, 1);
    assert.equal(upload.json.storageRef, expectedKey);
    assert.ok(!upload.json.storageRef.includes('etc/passwd'), 'the malicious filename must never appear in the real storage key');
  });
});

test('a forged/nonexistent documentId in the upload headers is rejected as not found, never silently creates orphaned binary content', async () => {
  await withServer('forged-document-id', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const fakeDocumentId = crypto.randomUUID();
    const upload = await uploadBinary(base, { organizationId: orgId, documentId: fakeDocumentId, content: Buffer.from('orphan attempt'), cookie: owner.cookie });
    assert.equal(upload.status, 404);
  });
});

// ---------------------------------------------------------------------
// 5. Delete/exists at the object storage layer
// ---------------------------------------------------------------------

test('the FilesystemObjectStorageProvider itself: put/get/exists/delete are all real and honest (direct unit-level proof, not just through HTTP)', async () => {
  await withServer('provider-direct', async ({ objectStorage }) => {
    const { Readable } = require('node:stream');
    const key = objectStorage.buildKey('org-x', 'doc-x', 1);
    const content = Buffer.from('direct provider test content');
    await objectStorage.put(key, Readable.from(content), { mimeType: 'text/plain' });
    assert.equal(await objectStorage.exists(key), true);
    await objectStorage.delete(key);
    assert.equal(await objectStorage.exists(key), false);
  });
});
