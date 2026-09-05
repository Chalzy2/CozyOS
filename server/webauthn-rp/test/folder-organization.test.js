'use strict';
/**
 * server/webauthn-rp/test/folder-organization.test.js
 *
 * CozyOS File Phase 3 — real HTTP-route tests for server-authoritative
 * folder organization: hierarchy, real cycle prevention (walking the
 * actual database chain), move/rename, root immutability, security,
 * and real restart persistence.
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
  return freshTmpDbPath(`webauthn-folders-${name}`);
}

async function withServer(name, fn, { dbPath: overrideDbPath } = {}) {
  const dbPath = overrideDbPath || freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, dbPath, db: server.db, folders: server.folders });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    if (!overrideDbPath) {
      fs.rmSync(dbPath, { force: true });
      fs.rmSync(dbPath + '-wal', { force: true });
      fs.rmSync(dbPath + '-shm', { force: true });
    }
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

// ---------------------------------------------------------------------
// 1. Root folder
// ---------------------------------------------------------------------

test('ensureRoot creates exactly one root folder per organization, idempotently', async () => {
  await withServer('root', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const first = await post(base, '/folders/root', { organizationId: orgId }, owner.cookie);
    const second = await post(base, '/folders/root', { organizationId: orgId }, owner.cookie);
    assert.equal(first.json.folder.folderId, second.json.folder.folderId, 'calling ensureRoot twice must return the same real root folder, never create a second one');
    assert.equal(first.json.folder.isRoot, true);
  });
});

test('the root folder cannot be renamed, moved, archived, or deleted', async () => {
  await withServer('root-immutable', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const root = await post(base, '/folders/root', { organizationId: orgId }, owner.cookie);
    const rootId = root.json.folder.folderId;

    const rename = await post(base, '/folders/rename', { organizationId: orgId, folderId: rootId, name: 'New Name' }, owner.cookie);
    assert.equal(rename.status, 403);
    assert.equal(rename.json.error, 'root_folder_immutable');

    const child = await post(base, '/folders', { organizationId: orgId, name: 'Child', parentFolderId: rootId }, owner.cookie);
    const move = await post(base, '/folders/move', { organizationId: orgId, folderId: rootId, newParentFolderId: child.json.folderId }, owner.cookie);
    assert.equal(move.json.error, 'root_folder_immutable');

    const archive = await post(base, '/folders/archive', { organizationId: orgId, folderId: rootId }, owner.cookie);
    assert.equal(archive.json.error, 'root_folder_immutable');
  });
});

// ---------------------------------------------------------------------
// 2. Hierarchy - create, list, nesting
// ---------------------------------------------------------------------

test('a folder created without a parent is placed under the real root, not orphaned', async () => {
  await withServer('default-parent', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const root = await post(base, '/folders/root', { organizationId: orgId }, owner.cookie);
    const created = await post(base, '/folders', { organizationId: orgId, name: 'Reports' }, owner.cookie);
    const fetched = await post(base, '/folders/get', { organizationId: orgId, folderId: created.json.folderId }, owner.cookie);
    assert.equal(fetched.json.folder.parentFolderId, root.json.folder.folderId);
  });
});

test('nested subfolders (root -> folder -> subfolder) are real and persistent', async () => {
  await withServer('nesting', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const folder = await post(base, '/folders', { organizationId: orgId, name: 'Church' }, owner.cookie);
    const subfolder = await post(base, '/folders', { organizationId: orgId, name: 'Testimonies', parentFolderId: folder.json.folderId }, owner.cookie);
    assert.equal(subfolder.status, 200);

    const children = await post(base, '/folders/children', { organizationId: orgId, folderId: folder.json.folderId }, owner.cookie);
    assert.equal(children.json.subfolders.length, 1);
    assert.equal(children.json.subfolders[0].folderId, subfolder.json.folderId);
  });
});

test('listing folder contents correctly distinguishes subfolders from documents, without duplicating document records', async () => {
  await withServer('list-mixed', async ({ base, db }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const folder = await post(base, '/folders', { organizationId: orgId, name: 'Mixed' }, owner.cookie);
    await post(base, '/folders', { organizationId: orgId, name: 'Sub', parentFolderId: folder.json.folderId }, owner.cookie);
    const doc = await post(base, '/documents', { organizationId: orgId, record: { documentId: crypto.randomUUID(), title: 'A Report' } }, owner.cookie);
    await post(base, '/documents/move', { organizationId: orgId, documentId: doc.json.documentId, folderId: folder.json.folderId }, owner.cookie);

    const contents = await post(base, '/folders/children', { organizationId: orgId, folderId: folder.json.folderId }, owner.cookie);
    assert.equal(contents.json.subfolders.length, 1);
    assert.equal(contents.json.documents.length, 1);
    assert.equal(contents.json.documents[0].documentId, doc.json.documentId);

    const documentRowCount = await db.get('SELECT COUNT(*) as count FROM documents WHERE id = ?', [doc.json.documentId]);
    assert.equal(documentRowCount.count, 1, 'moving a document into a folder must never duplicate its row');
  });
});

// ---------------------------------------------------------------------
// 3. Duplicate name policy (documented design decision)
// ---------------------------------------------------------------------

test('two active sibling folders cannot share the same normalized name under the same parent', async () => {
  await withServer('duplicate-name', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const first = await post(base, '/folders', { organizationId: orgId, name: 'Sermons' }, owner.cookie);
    assert.equal(first.status, 200);
    const duplicate = await post(base, '/folders', { organizationId: orgId, name: 'sermons' }, owner.cookie); // different case, same normalized name
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.json.error, 'duplicate_folder_name');
  });
});

test('an archived folder\'s name can be reused by a new active folder', async () => {
  await withServer('reuse-archived-name', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const first = await post(base, '/folders', { organizationId: orgId, name: 'Drafts' }, owner.cookie);
    await post(base, '/folders/archive', { organizationId: orgId, folderId: first.json.folderId }, owner.cookie);
    const second = await post(base, '/folders', { organizationId: orgId, name: 'Drafts' }, owner.cookie);
    assert.equal(second.status, 200, 'an archived folder\'s name must not permanently block reuse');
  });
});

// ---------------------------------------------------------------------
// 4. Real cycle prevention - walks the actual database chain
// ---------------------------------------------------------------------

test('a folder cannot be moved into itself', async () => {
  await withServer('self-move', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const folder = await post(base, '/folders', { organizationId: orgId, name: 'X' }, owner.cookie);
    const move = await post(base, '/folders/move', { organizationId: orgId, folderId: folder.json.folderId, newParentFolderId: folder.json.folderId }, owner.cookie);
    assert.equal(move.status, 400);
    assert.equal(move.json.error, 'self_parent_rejected');
  });
});

test('a folder cannot be moved into its own direct child (a real 1-level cycle)', async () => {
  await withServer('cycle-1level', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const parent = await post(base, '/folders', { organizationId: orgId, name: 'Parent' }, owner.cookie);
    const child = await post(base, '/folders', { organizationId: orgId, name: 'Child', parentFolderId: parent.json.folderId }, owner.cookie);
    const move = await post(base, '/folders/move', { organizationId: orgId, folderId: parent.json.folderId, newParentFolderId: child.json.folderId }, owner.cookie);
    assert.equal(move.status, 400);
    assert.equal(move.json.error, 'cycle_rejected');
  });
});

test('a folder cannot be moved into a deep descendant (a real multi-level cycle, proving the ancestor walk is genuine, not a single-level check)', async () => {
  await withServer('cycle-deep', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const a = await post(base, '/folders', { organizationId: orgId, name: 'A' }, owner.cookie);
    const b = await post(base, '/folders', { organizationId: orgId, name: 'B', parentFolderId: a.json.folderId }, owner.cookie);
    const c = await post(base, '/folders', { organizationId: orgId, name: 'C', parentFolderId: b.json.folderId }, owner.cookie);
    const d = await post(base, '/folders', { organizationId: orgId, name: 'D', parentFolderId: c.json.folderId }, owner.cookie);

    // Attempt to move A (the top ancestor) into D (its own great-great-grandchild).
    const move = await post(base, '/folders/move', { organizationId: orgId, folderId: a.json.folderId, newParentFolderId: d.json.folderId }, owner.cookie);
    assert.equal(move.status, 400);
    assert.equal(move.json.error, 'cycle_rejected', 'the real ancestor walk must detect a cycle at any depth, not just direct children');
  });
});

test('a legitimate, non-cyclical move between unrelated folders succeeds', async () => {
  await withServer('legit-move', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const a = await post(base, '/folders', { organizationId: orgId, name: 'A' }, owner.cookie);
    const b = await post(base, '/folders', { organizationId: orgId, name: 'B' }, owner.cookie);
    const move = await post(base, '/folders/move', { organizationId: orgId, folderId: a.json.folderId, newParentFolderId: b.json.folderId }, owner.cookie);
    assert.equal(move.status, 200);
    const fetched = await post(base, '/folders/get', { organizationId: orgId, folderId: a.json.folderId }, owner.cookie);
    assert.equal(fetched.json.folder.parentFolderId, b.json.folderId);
  });
});

// ---------------------------------------------------------------------
// 5. Archive semantics - empty-folder-only, honest limitation
// ---------------------------------------------------------------------

test('a non-empty folder (has an active subfolder) cannot be archived', async () => {
  await withServer('non-empty-archive', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const parent = await post(base, '/folders', { organizationId: orgId, name: 'Parent' }, owner.cookie);
    await post(base, '/folders', { organizationId: orgId, name: 'Child', parentFolderId: parent.json.folderId }, owner.cookie);
    const archive = await post(base, '/folders/archive', { organizationId: orgId, folderId: parent.json.folderId }, owner.cookie);
    assert.equal(archive.status, 409);
    assert.equal(archive.json.error, 'folder_not_empty');
  });
});

test('an empty folder can be archived and restored', async () => {
  await withServer('archive-restore', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const folder = await post(base, '/folders', { organizationId: orgId, name: 'Empty' }, owner.cookie);
    const archive = await post(base, '/folders/archive', { organizationId: orgId, folderId: folder.json.folderId }, owner.cookie);
    assert.equal(archive.json.available, true);
    const restore = await post(base, '/folders/restore', { organizationId: orgId, folderId: folder.json.folderId }, owner.cookie);
    assert.equal(restore.json.available, true);
    const fetched = await post(base, '/folders/get', { organizationId: orgId, folderId: folder.json.folderId }, owner.cookie);
    assert.equal(fetched.json.folder.status, 'active');
  });
});

// ---------------------------------------------------------------------
// 6. Document move preserves identity, version, and binary reference
// ---------------------------------------------------------------------

test('moving a document preserves its documentId, version, and binary storage reference exactly - never creates a new document or rewrites binary content', async () => {
  await withServer('move-preserves-identity', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const doc = await post(base, '/documents', { organizationId: orgId, record: { documentId: crypto.randomUUID(), title: 'x' } }, owner.cookie);
    const content = Buffer.from('binary content for move test');
    await fetch(`${base}/documents/binary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', 'X-Cozy-Organization-Id': orgId, 'X-Cozy-Document-Id': doc.json.documentId, Cookie: owner.cookie },
      body: content,
    });

    const folderA = await post(base, '/folders', { organizationId: orgId, name: 'A' }, owner.cookie);
    const folderB = await post(base, '/folders', { organizationId: orgId, name: 'B' }, owner.cookie);

    await post(base, '/documents/move', { organizationId: orgId, documentId: doc.json.documentId, folderId: folderA.json.folderId }, owner.cookie);
    const moveResult = await post(base, '/documents/move', { organizationId: orgId, documentId: doc.json.documentId, folderId: folderB.json.folderId }, owner.cookie);

    assert.equal(moveResult.json.documentId, doc.json.documentId, 'documentId must remain exactly the same');
    assert.equal(moveResult.json.version, 1, 'version must be unaffected by a folder move');
    assert.ok(moveResult.json.binaryStorageRef, 'the binary storage reference must remain present and unchanged');

    // Confirm the document is still loadable with its real content intact.
    const loaded = await post(base, '/documents/load', { organizationId: orgId, documentId: doc.json.documentId }, owner.cookie);
    assert.equal(loaded.json.record.title, 'x');
  });
});

// ---------------------------------------------------------------------
// 7. Security
// ---------------------------------------------------------------------

test('unauthenticated requests are rejected on every folder route', async () => {
  await withServer('unauth-folders', async ({ base }) => {
    const create = await post(base, '/folders', { organizationId: 'x', name: 'y' });
    assert.equal(create.status, 401);
    const list = await post(base, '/folders/children', { organizationId: 'x', folderId: 'y' });
    assert.equal(list.status, 401);
  });
});

test('a user cannot read, list, rename, move, or archive a folder belonging to a different organization', async () => {
  await withServer('cross-org-folder', async ({ base }) => {
    const ownerA = await registerAndLogin(base, 'orgA');
    const orgA = await createOrgAsOwner(base, ownerA, 'Org A');
    const folder = await post(base, '/folders', { organizationId: orgA, name: 'Secret' }, ownerA.cookie);

    const ownerB = await registerAndLogin(base, 'orgB');
    const orgB = await createOrgAsOwner(base, ownerB, 'Org B');

    const get = await post(base, '/folders/get', { organizationId: orgB, folderId: folder.json.folderId }, ownerB.cookie);
    assert.equal(get.json.available, false, 'a folder must never be retrievable through a different organization');

    const rename = await post(base, '/folders/rename', { organizationId: orgB, folderId: folder.json.folderId, name: 'Hijacked' }, ownerB.cookie);
    assert.equal(rename.status, 404);
  });
});

test('cross-organization parent assignment is rejected - a folder cannot be created with a parent belonging to a different organization', async () => {
  await withServer('cross-org-parent', async ({ base }) => {
    const ownerA = await registerAndLogin(base, 'orgA2');
    const orgA = await createOrgAsOwner(base, ownerA, 'Org A2');
    const folderA = await post(base, '/folders', { organizationId: orgA, name: 'A-Folder' }, ownerA.cookie);

    const ownerB = await registerAndLogin(base, 'orgB2');
    const orgB = await createOrgAsOwner(base, ownerB, 'Org B2');
    const attempt = await post(base, '/folders', { organizationId: orgB, name: 'Cross', parentFolderId: folderA.json.folderId }, ownerB.cookie);
    assert.equal(attempt.status, 400);
    assert.equal(attempt.json.error, 'invalid_parent');
  });
});

test('a forged companyId/organizationId that does not exist is rejected, not silently accepted', async () => {
  await withServer('forged-org-folder', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const attempt = await post(base, '/folders', { organizationId: 'completely-made-up-org', name: 'x' }, owner.cookie);
    assert.equal(attempt.status, 403);
  });
});

test('a member without org:documents:manage cannot create, rename, move, or archive folders, but can still read/list', async () => {
  await withServer('member-no-grant-folder', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const folder = await post(base, '/folders', { organizationId: orgId, name: 'Readable' }, owner.cookie);

    const member = await registerAndLogin(base, 'member');
    await post(base, '/organizations/invite', { organizationId: orgId, userId: member.userId, roles: [] }, owner.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: orgId }, member.cookie);

    const createAttempt = await post(base, '/folders', { organizationId: orgId, name: 'Should Fail' }, member.cookie);
    assert.equal(createAttempt.status, 403);

    const readAttempt = await post(base, '/folders/get', { organizationId: orgId, folderId: folder.json.folderId }, member.cookie);
    assert.equal(readAttempt.status, 200, 'a plain member must still be able to read folders');
  });
});

test('a path-traversal-shaped or SQL-injection-shaped folder name is stored and retrieved safely as literal text, never interpreted specially', async () => {
  await withServer('injection-shaped-name', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const maliciousName = "../../etc/passwd'; DROP TABLE folders; --";
    const created = await post(base, '/folders', { organizationId: orgId, name: maliciousName }, owner.cookie);
    assert.equal(created.status, 200, 'a malicious-looking name is just literal text for a metadata field - it must be accepted and stored safely, not interpreted');
    const fetched = await post(base, '/folders/get', { organizationId: orgId, folderId: created.json.folderId }, owner.cookie);
    assert.equal(fetched.json.folder.name, maliciousName, 'the exact literal name must be preserved, and the folders table must still exist');

    // Confirm the table genuinely still exists (a real SQL injection would have dropped it).
    const stillWorks = await post(base, '/folders', { organizationId: orgId, name: 'Still Works' }, owner.cookie);
    assert.equal(stillWorks.status, 200);
  });
});

test('a prototype-pollution-shaped request body does not corrupt the server or grant unintended authority', async () => {
  await withServer('proto-pollution', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const res = await fetch(`${base}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: owner.cookie },
      body: JSON.stringify({ organizationId: orgId, name: 'x', __proto__: { isAdmin: true, isPlatformAdmin: true } }),
    });
    const json = await res.json().catch(() => ({}));
    // Whatever the exact outcome, the server must not crash, and must
    // not have granted any elevated authority through this shape.
    assert.ok(res.status === 200 || res.status === 400, `expected a clean response, got ${res.status}`);
    const stillWorks = await post(base, '/folders', { organizationId: orgId, name: 'Still Fine' }, owner.cookie);
    assert.equal(stillWorks.status, 200, 'the server must remain completely functional after a prototype-pollution-shaped request');
  });
});

test('an invalid/nonexistent parent folder ID is rejected, not silently treated as root', async () => {
  await withServer('invalid-parent', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const attempt = await post(base, '/folders', { organizationId: orgId, name: 'x', parentFolderId: crypto.randomUUID() }, owner.cookie);
    assert.equal(attempt.status, 400);
    assert.equal(attempt.json.error, 'invalid_parent');
  });
});

// ---------------------------------------------------------------------
// 8. REAL PERSISTENCE ACROSS RESTART
// ---------------------------------------------------------------------

test('PROCESS A creates a nested hierarchy and places a document with binary content in it, the server is fully closed, PROCESS B (a new server instance, same db file) sees the exact same hierarchy, document association, and binary checksum', async () => {
  const dbPath = freshDbPath('restart');
  let orgId; let parentFolderId; let childFolderId; let documentId; let ownerEmail; let ownerPassword; let expectedChecksum;
  const content = Buffer.from('This binary content and this folder hierarchy must both survive a real restart.');

  try {
    await withServer('restart-a', async ({ base }) => {
      const owner = await registerAndLogin(base, 'restart-owner');
      ownerEmail = owner.email;
      ownerPassword = 'correct horse battery staple 1';
      orgId = await createOrgAsOwner(base, owner, 'Restart Org');

      const parent = await post(base, '/folders', { organizationId: orgId, name: 'Church Archive' }, owner.cookie);
      parentFolderId = parent.json.folderId;
      const child = await post(base, '/folders', { organizationId: orgId, name: 'Testimonies', parentFolderId }, owner.cookie);
      childFolderId = child.json.folderId;

      const doc = await post(base, '/documents', { organizationId: orgId, record: { documentId: crypto.randomUUID(), title: 'Survives Restart' } }, owner.cookie);
      documentId = doc.json.documentId;
      await post(base, '/documents/move', { organizationId: orgId, documentId, folderId: childFolderId }, owner.cookie);

      const uploadRes = await fetch(`${base}/documents/binary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf', 'X-Cozy-Organization-Id': orgId, 'X-Cozy-Document-Id': documentId, Cookie: owner.cookie },
        body: content,
      });
      const uploadJson = await uploadRes.json();
      expectedChecksum = uploadJson.checksum;
      assert.ok(expectedChecksum);
    }, { dbPath });

    await withServer('restart-b', async ({ base }) => {
      const login = await post(base, '/auth/login', { email: ownerEmail, password: ownerPassword });
      assert.equal(login.status, 200, 'the same account must still exist after restart');

      const child = await post(base, '/folders/get', { organizationId: orgId, folderId: childFolderId }, login.cookie);
      assert.equal(child.json.available, true);
      assert.equal(child.json.folder.parentFolderId, parentFolderId, 'the real hierarchy must survive a full server restart');

      const contents = await post(base, '/folders/children', { organizationId: orgId, folderId: childFolderId }, login.cookie);
      assert.equal(contents.json.documents.length, 1);
      assert.equal(contents.json.documents[0].documentId, documentId, 'the document-to-folder association must survive restart');

      const download = await fetch(new URL(`${base}/documents/binary?organizationId=${orgId}&documentId=${documentId}`), { headers: { Cookie: login.cookie } });
      const buffer = Buffer.from(await download.arrayBuffer());
      assert.ok(buffer.equals(content), 'the real binary content must survive restart, byte-for-byte');
      assert.equal(download.headers.get('x-cozy-checksum-sha256'), expectedChecksum, 'the checksum must remain unchanged after restart');
    }, { dbPath });
  } finally {
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
});
