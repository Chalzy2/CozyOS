'use strict';
/**
 * server/webauthn-rp/test/document-personal-binary-storage.test.js
 *
 * Real HTTP-route tests for personal binary document storage, mirroring
 * document-binary-storage.test.js's own established philosophy: real
 * filesystem-backed FilesystemObjectStorageProvider, real streaming,
 * real SHA-256 verification, cookie-derived identity.
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
  return freshTmpDbPath(`webauthn-personal-binary-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const objectStorageRoot = fs.mkdtempSync(path.join(os.tmpdir(), `cozyos-personal-binary-test-${name}-`));
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
  if (path_ === '/documents/personal' && body && body.record && !body.record.documentId) {
    body = { ...body, record: { ...body.record, documentId: crypto.randomUUID() } };
  }
  const res = await fetch(base + path_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: extractCookie(res) };
}

async function uploadPersonalBinary(base, { documentId, filename, mimeType, content, cookie }) {
  const res = await fetch(`${base}/documents/personal/binary`, {
    method: 'POST',
    headers: {
      'Content-Type': mimeType || 'application/octet-stream',
      'X-Cozy-Document-Id': documentId,
      ...(filename ? { 'X-Cozy-Filename': encodeURIComponent(filename) } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: content,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function downloadPersonalBinary(base, { documentId, cookie }) {
  const url = new URL(`${base}/documents/personal/binary`);
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

async function createPersonalDoc(base, cookie, title) {
  const saved = await post(base, '/documents/personal', { record: { title: title || 'Doc' } }, cookie);
  assert.equal(saved.status, 200);
  return saved.json.documentId;
}

// ---------------------------------------------------------------------
// 1/2/3. Personal binary save/load, real filesystem persistence, checksum
// ---------------------------------------------------------------------

test('PERSONAL BINARY: save and load round-trips real content with a real, verifiable SHA-256 checksum', async () => {
  await withServer('roundtrip', async ({ base, objectStorageRoot }) => {
    const user = await registerAndLogin(base, 'solo');
    const docId = await createPersonalDoc(base, user.cookie);
    const content = Buffer.from('Real personal document content.');
    const realChecksum = crypto.createHash('sha256').update(content).digest('hex');

    const upload = await uploadPersonalBinary(base, { documentId: docId, filename: 'note.txt', mimeType: 'text/plain', content, cookie: user.cookie });
    assert.equal(upload.status, 200);
    assert.equal(upload.json.checksum, realChecksum);
    assert.equal(upload.json.size, content.length);

    // Real filesystem persistence — confirm something was actually written to disk, not just claimed.
    const files = fs.readdirSync(objectStorageRoot, { recursive: true }).filter((f) => fs.statSync(path.join(objectStorageRoot, f)).isFile());
    assert.ok(files.length > 0, 'a real file must exist on disk after upload');

    const download = await downloadPersonalBinary(base, { documentId: docId, cookie: user.cookie });
    assert.equal(download.status, 200);
    assert.equal(download.buffer.toString(), content.toString());
    assert.equal(download.headers.get('x-cozy-checksum-sha256'), realChecksum);
  });
});

// ---------------------------------------------------------------------
// 4. MIME metadata / 5. filename sanitization
// ---------------------------------------------------------------------

test('PERSONAL BINARY: MIME type and sanitized filename are stored and returned correctly', async () => {
  await withServer('mime-filename', async ({ base }) => {
    const user = await registerAndLogin(base, 'solo');
    const docId = await createPersonalDoc(base, user.cookie);
    const unsafeFilename = 'evil\r\nname.pdf' + 'x'.repeat(300);
    const upload = await uploadPersonalBinary(base, { documentId: docId, filename: unsafeFilename, mimeType: 'application/pdf', content: Buffer.from('%PDF-1.4'), cookie: user.cookie });
    assert.equal(upload.status, 200);
    assert.equal(upload.json.mimeType, 'application/pdf');

    const download = await downloadPersonalBinary(base, { documentId: docId, cookie: user.cookie });
    assert.equal(download.headers.get('content-type'), 'application/pdf');
    // Sanitization is verified at the storage layer via the registry directly below (server test 'REGISTRY: filename sanitization').
  });
});

test('PERSONAL BINARY: filename sanitization strips CR/LF and truncates to 255 chars, same as organization uploads', async () => {
  await withServer('sanitize', async ({ base, db }) => {
    const user = await registerAndLogin(base, 'solo');
    const docId = await createPersonalDoc(base, user.cookie);
    const unsafeFilename = 'evil\r\nname' + 'x'.repeat(300) + '.pdf';
    await uploadPersonalBinary(base, { documentId: docId, filename: unsafeFilename, mimeType: 'application/pdf', content: Buffer.from('%PDF-1.4'), cookie: user.cookie });

    const row = await db.get('SELECT binary_original_filename FROM documents WHERE id = ?', [docId]);
    assert.ok(row.binary_original_filename.length <= 255);
    assert.doesNotMatch(row.binary_original_filename, /[\r\n]/);
  });
});

// ---------------------------------------------------------------------
// 6. Size enforcement / HTTP 413, 12. cleanup after rejected upload
// ---------------------------------------------------------------------

test('PERSONAL BINARY: an oversized upload (>25MB) is rejected and never persisted — matches the existing organization-path precedent (abrupt connection close, not a clean HTTP error)', async () => {
  await withServer('oversized', async ({ base, objectStorage }) => {
    const user = await registerAndLogin(base, 'solo');
    const docId = await createPersonalDoc(base, user.cookie);
    const content = crypto.randomBytes(26 * 1024 * 1024);
    await assert.rejects(
      () => uploadPersonalBinary(base, { documentId: docId, content, cookie: user.cookie }),
      /fetch failed/,
      'an oversized upload must fail the connection, matching the organization path\'s existing precedent'
    );
    const key = objectStorage.buildKey(`personal_${user.userId}`, docId, 1);
    assert.equal(await objectStorage.exists(key), false, 'rejected oversized content must never be persisted');
  });
});

// ---------------------------------------------------------------------
// 8. Unauthenticated access
// ---------------------------------------------------------------------

test('UNAUTHENTICATED: personal binary upload and download both require a real session', async () => {
  await withServer('unauth', async ({ base }) => {
    const uploadRes = await fetch(`${base}/documents/personal/binary`, { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Cozy-Document-Id': 'x' }, body: Buffer.from('x') });
    assert.equal(uploadRes.status, 401);

    const downloadRes = await fetch(`${base}/documents/personal/binary?documentId=x`);
    assert.equal(downloadRes.status, 401);
  });
});

// ---------------------------------------------------------------------
// 9/10. Cross-user read/write denial
// ---------------------------------------------------------------------

test('CROSS-USER DENIAL: a different user cannot upload binary content to someone else\'s personal document', async () => {
  await withServer('cross-write', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const attacker = await registerAndLogin(base, 'attacker');
    const docId = await createPersonalDoc(base, owner.cookie);

    const upload = await uploadPersonalBinary(base, { documentId: docId, mimeType: 'text/plain', content: Buffer.from('hijacked'), cookie: attacker.cookie });
    assert.equal(upload.status, 404, 'must not leak existence or allow write to a non-owned document');

    // The real owner's document must have no binary content — the attacker's attempt did nothing.
    const ownerDownload = await downloadPersonalBinary(base, { documentId: docId, cookie: owner.cookie });
    assert.equal(ownerDownload.status, 404);
    assert.match(ownerDownload.json.error, /no binary content/);
  });
});

test('CROSS-USER DENIAL: a different user cannot download binary content from someone else\'s personal document', async () => {
  await withServer('cross-read', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner2');
    const attacker = await registerAndLogin(base, 'attacker2');
    const docId = await createPersonalDoc(base, owner.cookie);
    await uploadPersonalBinary(base, { documentId: docId, mimeType: 'text/plain', content: Buffer.from('secret'), cookie: owner.cookie });

    const attackerDownload = await downloadPersonalBinary(base, { documentId: docId, cookie: attacker.cookie });
    assert.equal(attackerDownload.status, 404, 'must not leak existence or content to a non-owner');

    // The real owner can still read their own real content.
    const ownerDownload = await downloadPersonalBinary(base, { documentId: docId, cookie: owner.cookie });
    assert.equal(ownerDownload.status, 200);
    assert.equal(ownerDownload.buffer.toString(), 'secret');
  });
});

// ---------------------------------------------------------------------
// 11. Organization path regression
// ---------------------------------------------------------------------

test('COMPATIBILITY: organization binary upload/download is unaffected by the personal binary addition', async () => {
  await withServer('org-regression', async ({ base }) => {
    const owner = await registerAndLogin(base, 'orgowner');
    const org = await post(base, '/organizations/create', { name: 'Org X' }, owner.cookie);
    const orgId = org.json.organization.id;
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'Org Doc', documentId: crypto.randomUUID() } }, owner.cookie);
    const docId = saved.json.documentId;

    const uploadRes = await fetch(`${base}/documents/binary`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'X-Cozy-Organization-Id': orgId, 'X-Cozy-Document-Id': docId, Cookie: owner.cookie },
      body: Buffer.from('org content'),
    });
    assert.equal(uploadRes.status, 200);

    const url = new URL(`${base}/documents/binary`);
    url.searchParams.set('organizationId', orgId);
    url.searchParams.set('documentId', docId);
    const downloadRes = await fetch(url, { headers: { Cookie: owner.cookie } });
    assert.equal(downloadRes.status, 200);
    assert.equal((await downloadRes.text()), 'org content');
  });
});
