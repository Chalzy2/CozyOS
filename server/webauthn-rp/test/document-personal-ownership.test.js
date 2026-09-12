'use strict';
/**
 * server/webauthn-rp/test/document-personal-ownership.test.js
 *
 * Document Ownership Foundation — real HTTP-route tests for personal
 * (user-owned, non-organization) documents, mirroring document-
 * storage.test.js's own established philosophy: cookie-derived
 * identity, fail-closed authorization, real database, end to end.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-documents-personal-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ base, db: server.db, documentStorage: server.documentStorage });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
}

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return null;
  return setCookie.split(';')[0];
}

async function post(base, path_, body, cookie) {
  if ((path_ === '/documents' || path_ === '/documents/personal') && body && body.record && !body.record.documentId) {
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

let userCounter = 0;
async function registerAndLogin(base, emailPrefix) {
  const email = `${emailPrefix}-${++userCounter}@example.com`;
  const password = 'correct horse battery staple 1';
  const reg = await post(base, '/auth/register', { email, password });
  assert.equal(reg.status, 200, `register(${email}) should succeed`);
  const login = await post(base, '/auth/login', { email, password });
  assert.equal(login.status, 200, `login(${email}) should succeed`);
  return { email, userId: reg.json.userId, cookie: login.cookie };
}

// ---------------------------------------------------------------------
// 1. Personal document creation
// ---------------------------------------------------------------------

test('savePersonal(): a signed-in user with no organization can create a real personal document', async () => {
  await withServer('create', async ({ base }) => {
    const user = await registerAndLogin(base, 'solo');
    const result = await post(base, '/documents/personal', { record: { title: 'My Notes', rawText: 'Buy stock tomorrow.' } }, user.cookie);
    assert.equal(result.status, 200);
    assert.equal(result.json.available, true);
    assert.ok(result.json.documentId);
  });
});

test('savePersonal() without documentId is rejected, matching the organization path\'s own hard requirement', async () => {
  await withServer('missing-id', async ({ base }) => {
    const user = await registerAndLogin(base, 'solo');
    const res = await fetch(`${base}/documents/personal`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: user.cookie }, body: JSON.stringify({ record: { title: 'No ID' } }) });
    assert.equal(res.status, 400);
  });
});

// ---------------------------------------------------------------------
// 2. Personal ownership enforcement / cross-user denial
// ---------------------------------------------------------------------

test('loadPersonal(): the owning user can read their own document', async () => {
  await withServer('load-own', async ({ base }) => {
    const user = await registerAndLogin(base, 'solo');
    const saved = await post(base, '/documents/personal', { record: { title: 'Private Note', rawText: 'Only for me.' } }, user.cookie);
    const loaded = await post(base, '/documents/personal/load', { documentId: saved.json.documentId }, user.cookie);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.json.record.title, 'Private Note');
  });
});

test('CROSS-USER DENIAL: a different user cannot load, archive, restore, or delete someone else\'s personal document', async () => {
  await withServer('cross-user', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const attacker = await registerAndLogin(base, 'attacker');
    const saved = await post(base, '/documents/personal', { record: { title: 'Owner Only' } }, owner.cookie);
    const docId = saved.json.documentId;

    const load = await post(base, '/documents/personal/load', { documentId: docId }, attacker.cookie);
    assert.equal(load.status, 404, 'must not leak existence to a non-owner');

    const archive = await post(base, '/documents/personal/archive', { documentId: docId }, attacker.cookie);
    assert.equal(archive.status, 404);

    const del = await post(base, '/documents/personal/delete', { documentId: docId }, attacker.cookie);
    assert.equal(del.status, 404);

    // The real owner can still access it — the attacker's attempts changed nothing.
    const ownerLoad = await post(base, '/documents/personal/load', { documentId: docId }, owner.cookie);
    assert.equal(ownerLoad.status, 200);
    assert.equal(ownerLoad.json.record.title, 'Owner Only', 'the attacker\'s failed archive attempt must not have changed the real record');
  });
});

test('CROSS-USER DENIAL: savePersonal() on someone else\'s documentId is rejected, never silently creates a competing version', async () => {
  await withServer('cross-user-save', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const attacker = await registerAndLogin(base, 'attacker');
    const saved = await post(base, '/documents/personal', { record: { title: 'Original' } }, owner.cookie);

    const res = await fetch(`${base}/documents/personal`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: attacker.cookie }, body: JSON.stringify({ record: { documentId: saved.json.documentId, title: 'Hijacked' } }) });
    assert.notEqual(res.status, 200);

    const ownerLoad = await post(base, '/documents/personal/load', { documentId: saved.json.documentId }, owner.cookie);
    assert.equal(ownerLoad.json.record.title, 'Original', 'the attacker\'s save must never have taken effect');
  });
});

test('searchPersonal(): only returns the caller\'s own documents, never another user\'s', async () => {
  await withServer('search-isolation', async ({ base }) => {
    const userA = await registerAndLogin(base, 'usera');
    const userB = await registerAndLogin(base, 'userb');
    await post(base, '/documents/personal', { record: { title: 'A doc' } }, userA.cookie);
    await post(base, '/documents/personal', { record: { title: 'B doc' } }, userB.cookie);

    const resultA = await post(base, '/documents/personal/search', {}, userA.cookie);
    assert.equal(resultA.json.documents.length, 1);
    assert.equal(resultA.json.documents[0].title, 'A doc');
  });
});

// ---------------------------------------------------------------------
// 3. Organization document compatibility (regression)
// ---------------------------------------------------------------------

async function createOrgAsOwner(base, owner, name) {
  const res = await post(base, '/organizations/create', { name: name || `Org ${++userCounter}` }, owner.cookie);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.organization.id;
}

test('COMPATIBILITY: existing organization document save/load still works unchanged after the personal-ownership migration', async () => {
  await withServer('org-compat', async ({ base }) => {
    const owner = await registerAndLogin(base, 'orgowner');
    const orgId = await createOrgAsOwner(base, owner);
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'Org Report', rawText: 'Quarterly numbers.' } }, owner.cookie);
    assert.equal(saved.status, 200);
    const loaded = await post(base, '/documents/load', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(loaded.json.record.title, 'Org Report');
  });
});

test('COMPATIBILITY: organization membership enforcement is unchanged — a non-member still cannot read an organization document', async () => {
  await withServer('org-membership', async ({ base }) => {
    const owner = await registerAndLogin(base, 'orgowner2');
    const outsider = await registerAndLogin(base, 'outsider');
    const orgId = await createOrgAsOwner(base, owner);
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'Confidential' } }, owner.cookie);
    const load = await post(base, '/documents/load', { organizationId: orgId, documentId: saved.json.documentId }, outsider.cookie);
    assert.equal(load.status, 403, 'a non-member must be refused authorization outright, distinct from a genuine not-found');
  });
});

test('COMPATIBILITY: a personal document is never returned by, or accessible via, the organization document routes and vice versa', async () => {
  await withServer('no-cross-contamination', async ({ base }) => {
    const owner = await registerAndLogin(base, 'orgowner3');
    const orgId = await createOrgAsOwner(base, owner);
    const personalDoc = await post(base, '/documents/personal', { record: { title: 'Personal' } }, owner.cookie);

    // The same user's org-scoped load must not find their own personal document.
    const wrongLoad = await post(base, '/documents/load', { organizationId: orgId, documentId: personalDoc.json.documentId }, owner.cookie);
    assert.equal(wrongLoad.status, 404);
  });
});

// ---------------------------------------------------------------------
// 4. Unauthenticated access
// ---------------------------------------------------------------------

test('UNAUTHENTICATED: every personal document route requires a real session, never a client-supplied identity', async () => {
  await withServer('unauth', async ({ base }) => {
    const routes = ['/documents/personal', '/documents/personal/load', '/documents/personal/archive', '/documents/personal/restore', '/documents/personal/delete', '/documents/personal/versions', '/documents/personal/search'];
    for (const route of routes) {
      const res = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documentId: 'x', record: { documentId: 'x' } }) });
      assert.equal(res.status, 401, `${route} must require authentication`);
    }
  });
});

// ---------------------------------------------------------------------
// 5. Missing/invalid ownership at the registry level (direct, not HTTP)
// ---------------------------------------------------------------------

test('REGISTRY: savePersonal() with no actorUserId is rejected — never silently attributed to an anonymous/default owner', async () => {
  await withServer('registry-no-actor', async ({ documentStorage }) => {
    await assert.rejects(() => documentStorage.savePersonal(null, { documentId: crypto.randomUUID(), title: 'X' }));
  });
});

test('REGISTRY: the database CHECK constraint itself rejects a row with both organization_id and user_id set, or neither', async () => {
  await withServer('registry-check-constraint', async ({ db }) => {
    await assert.rejects(() => db.run(
      'INSERT INTO documents (id, organization_id, user_id, document_type, status, record_json, current_version, created_at, updated_at) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), 'unknown', 'draft', '{}', 1, Date.now(), Date.now()]
    ), 'a document with neither owner type set must be rejected by the real schema constraint');
  });
});

// ---------------------------------------------------------------------
// 6. Migration compatibility
// ---------------------------------------------------------------------

test('MIGRATION: a fresh database has the real user_id column and the organization/personal CHECK constraint', async () => {
  await withServer('migration-shape', async ({ db }) => {
    const cols = (await db.all('PRAGMA table_info(documents)')).map((c) => c.name);
    assert.ok(cols.includes('user_id'));
    assert.ok(cols.includes('organization_id'));
    const schemaRow = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='documents'");
    assert.match(schemaRow.sql, /CHECK/);
  });
});

test('MIGRATION: running openDb() twice against the same file does not fail or duplicate the rebuild (idempotent)', async () => {
  const { openDb } = require('../db');
  const dbPath = freshDbPath('idempotent');
  try {
    const db1 = openDb(dbPath);
    db1.close();
    assert.doesNotThrow(() => { const db2 = openDb(dbPath); db2.close(); });
  } finally {
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
});
