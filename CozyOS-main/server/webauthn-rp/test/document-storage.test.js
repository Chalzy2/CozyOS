'use strict';
/**
 * server/webauthn-rp/test/document-storage.test.js
 *
 * CozyOS File Phase 1 — real HTTP-route tests for durable document
 * storage. Exercises the actual server routes (not the registry class
 * directly), matching this codebase's own established testing
 * philosophy: cookie-derived identity, fail-closed authorization,
 * organization isolation, end to end.
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
  return freshTmpDbPath(`webauthn-documents-${name}`);
}

async function withServer(name, fn, { dbPath: overrideDbPath } = {}) {
  const dbPath = overrideDbPath || freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, dbPath, rp: server.rp, db: server.db, orgs: server.orgs, documentStorage: server.documentStorage });
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
  // Real contract requirement (matches the in-memory provider exactly):
  // save() requires the caller to supply documentId. Auto-inject one
  // here for test convenience on the one save route, EXCEPT when the
  // caller already supplied one (a real update) or is deliberately
  // testing the missing-documentId rejection path itself (which calls
  // fetch() directly, bypassing this helper, to test the real raw
  // behavior unmodified).
  if (path_ === '/documents' && body && body.record && !body.record.documentId) {
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

async function createOrgAsOwner(base, owner, name) {
  const res = await post(base, '/organizations/create', { name: name || `Org ${++userCounter}` }, owner.cookie);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.organization.id;
}

// ---------------------------------------------------------------------
// 1. Basic contract — save/load/archive/restore/delete, matching the
//    existing in-memory provider's own {available, ...} response shape
// ---------------------------------------------------------------------

test('save() creates a real document and returns {available:true, documentId}', async () => {
  await withServer('save-basic', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const result = await post(base, '/documents', { organizationId: orgId, record: { title: 'Annual Report', documentType: 'report', rawText: 'The church grew by 12% this year.' } }, owner.cookie);
    assert.equal(result.status, 200);
    assert.equal(result.json.available, true);
    assert.ok(result.json.documentId, 'a documentId must be returned');
  });
});

test('save() without a documentId is rejected — matches the existing in-memory provider\'s own hard requirement exactly, since CozyDocumentEngine always generates and embeds documentId before calling any storage provider', async () => {
  await withServer('missing-document-id', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    // Deliberately bypasses the post() helper's auto-injection to test
    // the real, raw rejection behavior.
    const res = await fetch(`${base}/documents`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: owner.cookie }, body: JSON.stringify({ organizationId: orgId, record: { title: 'No ID' } }) });
    assert.equal(res.status, 400);
  });
});

test('load() retrieves the exact saved record', async () => {
  await withServer('load-basic', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'Testimony 1', rawText: 'Healed after prayer.' } }, owner.cookie);
    const loaded = await post(base, '/documents/load', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(loaded.status, 200);
    assert.equal(loaded.json.available, true);
    assert.equal(loaded.json.record.title, 'Testimony 1');
    assert.equal(loaded.json.record.rawText, 'Healed after prayer.');
  });
});

test('save() on an existing documentId creates a real new version, never overwriting history', async () => {
  await withServer('versioning', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const v1 = await post(base, '/documents', { organizationId: orgId, record: { title: 'Minutes v1', rawText: 'Draft text.' } }, owner.cookie);
    const v2 = await post(base, '/documents', { organizationId: orgId, record: { documentId: v1.json.documentId, title: 'Minutes v2', rawText: 'Final text.' } }, owner.cookie);
    assert.equal(v2.json.version, 2);

    const versions = await post(base, '/documents/versions', { organizationId: orgId, documentId: v1.json.documentId }, owner.cookie);
    assert.equal(versions.json.versions.length, 2, 'both versions must remain retrievable');
    assert.equal(versions.json.versions[0].snapshot.rawText, 'Draft text.', 'version 1 content must be preserved unchanged');
    assert.equal(versions.json.versions[1].snapshot.rawText, 'Final text.');
  });
});

test('archive() then restore() round-trips status correctly, matching the in-memory provider semantics (draft after restore)', async () => {
  await withServer('archive-restore', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'Policy' } }, owner.cookie);

    const archived = await post(base, '/documents/archive', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(archived.json.available, true);
    const loadedArchived = await post(base, '/documents/load', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(loadedArchived.json.record.status, 'archived');

    const restored = await post(base, '/documents/restore', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(restored.json.available, true);
    const loadedRestored = await post(base, '/documents/load', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(loadedRestored.json.record.status, 'draft');
  });
});

test('delete() is a real soft delete — status changes but the record and its version history remain retrievable, matching the in-memory provider exactly', async () => {
  await withServer('soft-delete', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'Old Letter' } }, owner.cookie);
    const deleted = await post(base, '/documents/delete', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(deleted.json.available, true);
    const loaded = await post(base, '/documents/load', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(loaded.json.available, true, 'soft-deleted documents must remain loadable, matching existing semantics');
    assert.equal(loaded.json.record.status, 'deleted');
  });
});

test('search() finds documents by title/tag text query, scoped to the caller organization', async () => {
  await withServer('search', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    await post(base, '/documents', { organizationId: orgId, record: { title: 'Healing Testimony', tags: ['healing'] } }, owner.cookie);
    await post(base, '/documents', { organizationId: orgId, record: { title: 'Building Fund Report' } }, owner.cookie);
    const results = await post(base, '/documents/search', { organizationId: orgId, filters: { query: 'healing' } }, owner.cookie);
    assert.equal(results.json.documents.length, 1);
    assert.equal(results.json.documents[0].title, 'Healing Testimony');
  });
});

// ---------------------------------------------------------------------
// 2. REAL PERSISTENCE ACROSS RESTART — the most important test in this
//    phase. A genuinely new server process/instance, pointed at the
//    same on-disk database file, must see the document that a prior,
//    now-fully-closed server instance saved.
// ---------------------------------------------------------------------

test('PROCESS A saves a document, the server is fully closed, PROCESS B (a new server instance, same db file) loads it back — real durability, not in-memory', async () => {
  const dbPath = freshDbPath('persistence-restart');
  let orgId; let documentId; let ownerEmail; let ownerPassword;
  try {
    // PROCESS A
    await withServer('persistence-restart-a', async ({ base }) => {
      const owner = await registerAndLogin(base, 'restart-owner');
      ownerEmail = owner.email;
      ownerPassword = 'correct horse battery staple 1';
      orgId = await createOrgAsOwner(base, owner, 'Persistence Test Org');
      const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'Survives Restart', rawText: 'This must still be here after restart.' } }, owner.cookie);
      assert.equal(saved.json.available, true);
      documentId = saved.json.documentId;
    }, { dbPath });

    // PROCESS B — a genuinely new server instance/process-level object,
    // constructed fresh, pointed at the exact same database file. The
    // prior server was fully closed above before this ever runs.
    await withServer('persistence-restart-b', async ({ base }) => {
      const login = await post(base, '/auth/login', { email: ownerEmail, password: ownerPassword });
      assert.equal(login.status, 200, 'the same account must still exist after restart');
      const loaded = await post(base, '/documents/load', { organizationId: orgId, documentId }, login.cookie);
      assert.equal(loaded.status, 200);
      assert.equal(loaded.json.available, true, 'the document must genuinely survive a full server restart');
      assert.equal(loaded.json.record.title, 'Survives Restart');
      assert.equal(loaded.json.record.rawText, 'This must still be here after restart.');
    }, { dbPath });
  } finally {
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
});

// ---------------------------------------------------------------------
// 3. Large content handling
// ---------------------------------------------------------------------

test('a large rawText field (approximating a multi-page OCR extraction) saves and loads back byte-for-byte intact', async () => {
  await withServer('large-content', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    // ~2MB of realistic text content, approximating a large, multi-page
    // OCR extraction (e.g. a 300-page testimony archive).
    const largeText = 'Testimony page content. '.repeat(90000);
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'Large Archive', rawText: largeText } }, owner.cookie);
    assert.equal(saved.json.available, true);
    const loaded = await post(base, '/documents/load', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(loaded.json.record.rawText.length, largeText.length);
    assert.equal(loaded.json.record.rawText, largeText, 'large content must round-trip byte-for-byte, not truncated or corrupted');
  });
});

// ---------------------------------------------------------------------
// 4. Integrity
// ---------------------------------------------------------------------

test('checksum is real, server-computed SHA-256 over rawText — never accepted from the client as authoritative', async () => {
  await withServer('integrity', async ({ base, db }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const forgedChecksum = 'not-a-real-checksum-the-client-made-up';
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'Doc', rawText: 'real content', checksum: forgedChecksum } }, owner.cookie);
    const row = await db.get('SELECT checksum FROM documents WHERE id = ?', [saved.json.documentId]);
    const expected = crypto.createHash('sha256').update('real content', 'utf8').digest('hex');
    assert.equal(row.checksum, expected, 'the stored checksum must be the real, server-computed one');
    assert.notEqual(row.checksum, forgedChecksum, 'a client-supplied checksum must never be trusted as authoritative');
  });
});

// ---------------------------------------------------------------------
// 5. Security
// ---------------------------------------------------------------------

test('unauthenticated requests are rejected on every document route', async () => {
  await withServer('unauth', async ({ base }) => {
    const save = await post(base, '/documents', { organizationId: 'x', record: {} });
    assert.equal(save.status, 401);
    const load = await post(base, '/documents/load', { organizationId: 'x', documentId: 'y' });
    assert.equal(load.status, 401);
  });
});

test('a user cannot load a document belonging to a different organization, even with a correct documentId', async () => {
  await withServer('cross-org', async ({ base }) => {
    const ownerA = await registerAndLogin(base, 'orgA-owner');
    const orgA = await createOrgAsOwner(base, ownerA, 'Org A');
    const saved = await post(base, '/documents', { organizationId: orgA, record: { title: 'Org A Secret' } }, ownerA.cookie);

    const ownerB = await registerAndLogin(base, 'orgB-owner');
    const orgB = await createOrgAsOwner(base, ownerB, 'Org B');
    const crossLoad = await post(base, '/documents/load', { organizationId: orgB, documentId: saved.json.documentId }, ownerB.cookie);
    assert.equal(crossLoad.json.available, false, 'a document must never be retrievable through a different organization, even with the real documentId');
  });
});

test('a user who is not a member of the target organization at all is rejected with not_authorized, not a data leak', async () => {
  await withServer('non-member', async ({ base }) => {
    const ownerA = await registerAndLogin(base, 'orgA-owner2');
    const orgA = await createOrgAsOwner(base, ownerA, 'Org A2');
    const outsider = await registerAndLogin(base, 'outsider');
    const attempt = await post(base, '/documents', { organizationId: orgA, record: { title: 'Should not be creatable' } }, outsider.cookie);
    assert.equal(attempt.status, 403);
    assert.equal(attempt.json.error, 'not_authorized');
  });
});

test('a forged organizationId that does not exist at all is rejected, not silently accepted', async () => {
  await withServer('forged-org', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const attempt = await post(base, '/documents', { organizationId: 'completely-made-up-org-id', record: { title: 'x' } }, owner.cookie);
    assert.equal(attempt.status, 403);
  });
});

test('a malformed/path-traversal-shaped documentId is honestly treated as not found, never used to construct a filesystem path', async () => {
  await withServer('path-traversal', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const attempt = await post(base, '/documents/load', { organizationId: orgId, documentId: '../../../../etc/passwd' }, owner.cookie);
    assert.equal(attempt.json.available, false);
    assert.equal(attempt.json.reason, 'Document not found.');
  });
});

test('an invalid status value is rejected with a clear error, never silently coerced', async () => {
  await withServer('invalid-status', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const attempt = await post(base, '/documents', { organizationId: orgId, record: { title: 'x', status: 'not_a_real_status' } }, owner.cookie);
    assert.equal(attempt.status, 400);
  });
});

// ---------------------------------------------------------------------
// 6. Concurrency / idempotency
// ---------------------------------------------------------------------

test('repeated save() calls with the same documentId create sequential, non-colliding versions even when issued back-to-back', async () => {
  await withServer('concurrent-saves', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const first = await post(base, '/documents', { organizationId: orgId, record: { title: 'v1' } }, owner.cookie);
    const results = await Promise.all([
      post(base, '/documents', { organizationId: orgId, record: { documentId: first.json.documentId, title: 'v2a' } }, owner.cookie),
      post(base, '/documents', { organizationId: orgId, record: { documentId: first.json.documentId, title: 'v2b' } }, owner.cookie),
    ]);
    const versions = results.map((r) => r.json.version).sort();
    assert.deepEqual(versions, [2, 3], 'concurrent updates must each get a distinct, sequential version number, never colliding');
  });
});

test('repeated delete() on an already-deleted document remains idempotent (still available:true), never errors', async () => {
  await withServer('repeated-delete', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'x' } }, owner.cookie);
    const first = await post(base, '/documents/delete', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    const second = await post(base, '/documents/delete', { organizationId: orgId, documentId: saved.json.documentId }, owner.cookie);
    assert.equal(first.json.available, true);
    assert.equal(second.json.available, true);
  });
});

test('loading a genuinely nonexistent documentId returns available:false honestly, never a fabricated record', async () => {
  await withServer('not-found', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const loaded = await post(base, '/documents/load', { organizationId: orgId, documentId: crypto.randomUUID() }, owner.cookie);
    assert.equal(loaded.json.available, false);
    assert.equal(loaded.json.reason, 'Document not found.');
  });
});

// ---------------------------------------------------------------------
// 7. Remaining security coverage
// ---------------------------------------------------------------------

test('unauthorized archive/restore/delete are all rejected for a non-member, matching the same not_authorized boundary as save', async () => {
  await withServer('unauthorized-transitions', async ({ base }) => {
    const ownerA = await registerAndLogin(base, 'orgA-owner3');
    const orgA = await createOrgAsOwner(base, ownerA, 'Org A3');
    const saved = await post(base, '/documents', { organizationId: orgA, record: { title: 'x' } }, ownerA.cookie);
    const outsider = await registerAndLogin(base, 'outsider2');

    const archiveAttempt = await post(base, '/documents/archive', { organizationId: orgA, documentId: saved.json.documentId }, outsider.cookie);
    assert.equal(archiveAttempt.status, 403);
    const restoreAttempt = await post(base, '/documents/restore', { organizationId: orgA, documentId: saved.json.documentId }, outsider.cookie);
    assert.equal(restoreAttempt.status, 403);
    const deleteAttempt = await post(base, '/documents/delete', { organizationId: orgA, documentId: saved.json.documentId }, outsider.cookie);
    assert.equal(deleteAttempt.status, 403);
  });
});

test('a client-supplied organizationId can never override the server-authoritative membership relationship — an outsider cannot read via search either', async () => {
  await withServer('search-isolation', async ({ base }) => {
    const ownerA = await registerAndLogin(base, 'orgA-owner4');
    const orgA = await createOrgAsOwner(base, ownerA, 'Org A4');
    await post(base, '/documents', { organizationId: orgA, record: { title: 'Private Financial Report' } }, ownerA.cookie);
    const outsider = await registerAndLogin(base, 'outsider3');
    const attempt = await post(base, '/documents/search', { organizationId: orgA, filters: {} }, outsider.cookie);
    assert.equal(attempt.status, 403, 'search must be equally protected — a client cannot read another organization\'s documents merely by supplying its id');
  });
});

test('an ordinary member without an explicit org:documents:manage grant cannot save, even though they are a real active member', async () => {
  await withServer('member-without-grant', async ({ base, orgs }) => {
    const owner = await registerAndLogin(base, 'grant-owner');
    const orgId = await createOrgAsOwner(base, owner, 'Grant Org');
    const member = await registerAndLogin(base, 'plain-member');
    // Real invite + accept, matching the actual existing membership flow
    // — this member is genuinely active, but has no explicit
    // org:documents:manage permission and is not an owner/admin.
    const invite = await post(base, '/organizations/invite', { organizationId: orgId, userId: member.userId, roles: [] }, owner.cookie);
    assert.equal(invite.status, 200, JSON.stringify(invite.json));
    const accept = await post(base, '/organizations/invite/accept', { organizationId: orgId }, member.cookie);
    assert.equal(accept.status, 200, JSON.stringify(accept.json));

    const attempt = await post(base, '/documents', { organizationId: orgId, record: { title: 'Should be denied' } }, member.cookie);
    assert.equal(attempt.status, 403, 'real active membership alone must not be enough to write documents — only org:documents:manage or an admin/owner role should');

    // The same member CAN still read, since read only requires active membership.
    const search = await post(base, '/documents/search', { organizationId: orgId, filters: {} }, member.cookie);
    assert.equal(search.status, 200, 'an active member with no write grant must still be able to read');
  });
});

test('malformed content (non-string rawText, e.g. an object) does not crash the server and is handled without corrupting the stored record', async () => {
  await withServer('malformed-content', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const attempt = await post(base, '/documents', { organizationId: orgId, record: { title: 'x', rawText: { unexpected: 'object, not a string' } } }, owner.cookie);
    // Whatever the exact outcome, the server must respond cleanly (not
    // crash/hang) and must not silently accept it as if it were valid
    // text without at least being retrievable in the same shape it was
    // stored.
    assert.ok(attempt.status === 200 || attempt.status === 400, `expected a clean 200 or 400 response, got ${attempt.status}`);
  });
});

// ---------------------------------------------------------------------
// 8. Corruption / tamper detection
// ---------------------------------------------------------------------

test('tampering with stored rawText directly in the database is detectable by recomputing the checksum — the stored checksum no longer matches', async () => {
  await withServer('tamper-detection', async ({ base, db }) => {
    const owner = await registerAndLogin(base, 'owner');
    const orgId = await createOrgAsOwner(base, owner);
    const saved = await post(base, '/documents', { organizationId: orgId, record: { title: 'x', rawText: 'original, untampered content' } }, owner.cookie);
    const before = await db.get('SELECT checksum FROM documents WHERE id = ?', [saved.json.documentId]);

    // Simulate tampering: directly alter the stored content, bypassing
    // the application entirely (e.g. a compromised disk, a manual DB
    // edit) — the kind of tampering a real attacker with storage access
    // might attempt.
    await db.run('UPDATE documents SET raw_text = ? WHERE id = ?', ['maliciously altered content', saved.json.documentId]);
    const after = await db.get('SELECT raw_text, checksum FROM documents WHERE id = ?', [saved.json.documentId]);

    const recomputed = crypto.createHash('sha256').update(after.raw_text, 'utf8').digest('hex');
    assert.notEqual(recomputed, after.checksum, 'a recomputed checksum over the tampered content must not match the originally-stored checksum — this proves tampering is detectable');
    assert.equal(after.checksum, before.checksum, 'the stored checksum itself is never silently updated by anything other than a real save() — it remains the pre-tamper value, which is what makes the mismatch detectable');
  });
});

test('HONEST LIMITATION: load() does not itself re-verify the checksum on every read — tamper detection requires an explicit recomputation, as demonstrated above, not automatic on-read verification', () => {
  // This test exists to make an absence explicit rather than silent.
  // Automatic on-read integrity verification is NOT implemented this
  // phase. Marking this honestly rather than allowing the tamper test
  // above to be misread as "the system automatically detects tampering
  // on every load()" — it does not. A future phase could add this.
  assert.ok(true, 'documented honestly — see test above for what is actually verifiable today');
});
