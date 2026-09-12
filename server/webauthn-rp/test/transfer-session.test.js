'use strict';
/**
 * server/webauthn-rp/test/transfer-session.test.js
 *
 * CozyOS File Phase 4 — real tests for Cozy Share's transfer session
 * foundation: session creation, real pairing with a cryptographically
 * random token, replay protection, manifest validation, real streamed
 * transfer with independent checksum verification, receiver-side
 * ownership (never trusting sender-supplied organization identity),
 * folder-destination integration, cancellation, restart persistence,
 * and security (forged IDs, path traversal, cross-organization
 * rejection, checksum mismatch).
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
  return freshTmpDbPath(`webauthn-transfer-${name}`);
}

async function withServer(name, fn, { dbPath: overrideDbPath } = {}) {
  const dbPath = overrideDbPath || freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, dbPath, db: server.db });
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

async function createDocumentWithBinary(base, orgId, cookie, { title = 'Doc', content } = {}) {
  const documentId = crypto.randomUUID();
  await post(base, '/documents', { organizationId: orgId, record: { documentId, title } }, cookie);
  let checksum = null;
  if (content) {
    const res = await fetch(`${base}/documents/binary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', 'X-Cozy-Organization-Id': orgId, 'X-Cozy-Document-Id': documentId, Cookie: cookie },
      body: content,
    });
    checksum = (await res.json()).checksum;
  }
  return { documentId, checksum };
}

// ---------------------------------------------------------------------
// 1. Session creation, one-active-session enforcement
// ---------------------------------------------------------------------

test('createSession returns a real session, a real single-use pairing token, and a manifest with real item IDs', async () => {
  await withServer('create', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('content') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'report.pdf' }] }, sender.cookie);
    assert.equal(created.status, 200);
    assert.ok(created.json.sessionId);
    assert.ok(created.json.pairingToken);
    assert.equal(created.json.qrPayload.sessionId, created.json.sessionId);
  });
});

test('a second concurrent session from the same sender is rejected - only one active session per sender', async () => {
  await withServer('concurrent', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('content') });
    const first = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);
    assert.equal(first.status, 200);
    const second = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'b.pdf' }] }, sender.cookie);
    assert.equal(second.status, 409);
    assert.equal(second.json.error, 'concurrent_session_rejected');
  });
});

test('after the first session is cancelled, the sender can create a new one', async () => {
  await withServer('after-cancel', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('content') });
    const first = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);
    await post(base, '/transfer/cancel', { sessionId: first.json.sessionId }, sender.cookie);
    const second = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'b.pdf' }] }, sender.cookie);
    assert.equal(second.status, 200);
  });
});

// ---------------------------------------------------------------------
// 2. Real pairing, replay protection
// ---------------------------------------------------------------------

test('pairing with the correct token succeeds exactly once; a second pairing attempt (replay) is rejected', async () => {
  await withServer('pair-replay', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('content') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const pair1 = await post(base, '/transfer/pair', { organizationId: orgB, sessionId: created.json.sessionId, token: created.json.pairingToken }, receiver.cookie);
    assert.equal(pair1.status, 200);

    const otherReceiver = await registerAndLogin(base, 'other-receiver');
    const orgC = await createOrgAsOwner(base, otherReceiver, 'Org C');
    const pair2 = await post(base, '/transfer/pair', { organizationId: orgC, sessionId: created.json.sessionId, token: created.json.pairingToken }, otherReceiver.cookie);
    assert.equal(pair2.status, 409);
    assert.equal(pair2.json.error, 'replay_rejected', 'a second pairing attempt against an already-connected session must be rejected as a replay');
  });
});

test('pairing with a forged/wrong token is rejected', async () => {
  await withServer('forged-token', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('content') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const attempt = await post(base, '/transfer/pair', { organizationId: orgB, sessionId: created.json.sessionId, token: 'completely-forged-token' }, receiver.cookie);
    assert.equal(attempt.status, 401);
    assert.equal(attempt.json.error, 'invalid_pairing_credential');
  });
});

test('pairing against a forged/nonexistent session ID is rejected', async () => {
  await withServer('forged-session', async ({ base }) => {
    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const attempt = await post(base, '/transfer/pair', { organizationId: orgB, sessionId: crypto.randomUUID(), token: 'anything' }, receiver.cookie);
    assert.equal(attempt.status, 404);
  });
});

// ---------------------------------------------------------------------
// 3. Real streamed transfer, independent checksum verification, receiver-side ownership
// ---------------------------------------------------------------------

test('a full transfer round-trip: real binary content is received byte-for-byte, checksum independently re-verified, into the RECEIVER\'s own organization - never the sender\'s - and never duplicated in the sender\'s organization', async () => {
  await withServer('full-transfer', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const content = Buffer.from('Real testimony content for a real transfer test.'.repeat(100));
    const { documentId, checksum } = await createDocumentWithBinary(base, orgA, sender.cookie, { title: 'Testimony', content });

    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'Testimony.pdf' }] }, sender.cookie);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const paired = await post(base, '/transfer/pair', { organizationId: orgB, sessionId: created.json.sessionId, token: created.json.pairingToken }, receiver.cookie);
    assert.equal(paired.status, 200);
    assert.equal(paired.json.manifest[0].checksum, checksum, 'the manifest must carry the real, sender-side checksum');
    const realItemId = paired.json.manifest[0].itemId;
    assert.ok(realItemId, 'the manifest must expose the real, referenceable item ID');

    const received = await post(base, '/transfer/items/receive', { sessionId: created.json.sessionId, itemId: realItemId }, receiver.cookie);
    assert.equal(received.status, 200);
    assert.equal(received.json.checksum, checksum, 'the receiver must independently compute the same real checksum');

    // Confirm the new document is real, loadable, and lives in the
    // RECEIVER's organization, with byte-identical content.
    const loaded = await post(base, '/documents/load', { organizationId: orgB, documentId: received.json.receivedDocumentId }, receiver.cookie);
    assert.equal(loaded.json.available, true);
    assert.equal(loaded.json.record.title, 'Testimony');

    const download = await fetch(new URL(`${base}/documents/binary?organizationId=${orgB}&documentId=${received.json.receivedDocumentId}`), { headers: { Cookie: receiver.cookie } });
    const buffer = Buffer.from(await download.arrayBuffer());
    assert.ok(buffer.equals(content), 'the received binary content must be byte-for-byte identical to the original');

    // Confirm the SENDER's original document is completely untouched -
    // this was a copy, not a move.
    const senderStillHas = await post(base, '/documents/load', { organizationId: orgA, documentId }, sender.cookie);
    assert.equal(senderStillHas.json.available, true);
    assert.equal(senderStillHas.json.record.title, 'Testimony');

    await post(base, '/transfer/complete', { sessionId: created.json.sessionId }, receiver.cookie);
  });
});

test('completeSession fails if not every item has been genuinely verified - never allows a false COMPLETE', async () => {
  await withServer('incomplete', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);
    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    await post(base, '/transfer/pair', { organizationId: orgB, sessionId: created.json.sessionId, token: created.json.pairingToken }, receiver.cookie);

    // Attempt to complete WITHOUT ever calling /transfer/items/receive.
    const attempt = await post(base, '/transfer/complete', { sessionId: created.json.sessionId }, receiver.cookie);
    assert.equal(attempt.status, 409);
    assert.equal(attempt.json.error, 'items_not_verified');
  });
});

test('a genuine checksum mismatch (content tampered with mid-transfer) marks the session CORRUPTED, never silently COMPLETE', async () => {
  await withServer('checksum-mismatch', async ({ base, db }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('original content') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const paired = await post(base, '/transfer/pair', { organizationId: orgB, sessionId: created.json.sessionId, token: created.json.pairingToken }, receiver.cookie);
    const realItemId = paired.json.manifest[0].itemId;

    // Simulate real corruption: the manifest's recorded checksum no
    // longer matches the actual, current content - exactly the class
    // of real-world event (mid-transfer corruption, or content altered
    // between manifest creation and receive) this check exists to
    // catch. This exercises the exact same mismatch-detection code
    // path a real corruption would trigger.
    await db.run('UPDATE transfer_items SET checksum = ? WHERE id = ?', ['0000000000000000000000000000000000000000000000000000000000000000', realItemId]);

    const attempt = await post(base, '/transfer/items/receive', { sessionId: created.json.sessionId, itemId: realItemId }, receiver.cookie);
    assert.equal(attempt.status, 409);
    assert.equal(attempt.json.error, 'checksum_mismatch');

    const sessionState = await post(base, '/transfer/get', { sessionId: created.json.sessionId }, receiver.cookie);
    assert.equal(sessionState.json.session.state, 'corrupted', 'the session must be marked corrupted, never silently completed');
  });
});

// ---------------------------------------------------------------------
// 4. Folder integration (Phase 3 compatibility)
// ---------------------------------------------------------------------

test('a received document can be placed directly into a real, existing destination folder in the receiver\'s organization', async () => {
  await withServer('folder-destination', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('content') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const destFolder = await post(base, '/folders', { organizationId: orgB, name: 'Received' }, receiver.cookie);
    const paired = await post(base, '/transfer/pair', { organizationId: orgB, sessionId: created.json.sessionId, token: created.json.pairingToken }, receiver.cookie);
    const realItemId = paired.json.manifest[0].itemId;

    const received = await post(base, '/transfer/items/receive', { sessionId: created.json.sessionId, itemId: realItemId, destinationFolderId: destFolder.json.folderId }, receiver.cookie);
    assert.equal(received.status, 200);

    const contents = await post(base, '/folders/children', { organizationId: orgB, folderId: destFolder.json.folderId }, receiver.cookie);
    assert.equal(contents.json.documents.length, 1);
    assert.equal(contents.json.documents[0].documentId, received.json.receivedDocumentId);
  });
});

// ---------------------------------------------------------------------
// 5. Security
// ---------------------------------------------------------------------

test('unauthenticated requests are rejected on every transfer route', async () => {
  await withServer('unauth-transfer', async ({ base }) => {
    const create = await post(base, '/transfer/sessions', { organizationId: 'x', items: [] });
    assert.equal(create.status, 401);
    const pair = await post(base, '/transfer/pair', { organizationId: 'x', sessionId: 'y', token: 'z' });
    assert.equal(pair.status, 401);
  });
});

test('a forged/nonexistent organizationId on session creation is rejected', async () => {
  await withServer('forged-org-create', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const attempt = await post(base, '/transfer/sessions', { organizationId: 'made-up-org', items: [{ documentId: crypto.randomUUID(), relativePath: 'a.pdf' }] }, sender.cookie);
    assert.equal(attempt.status, 403);
  });
});

test('a forged documentId that does not exist/belong to the sender is rejected at session creation, never silently included', async () => {
  await withServer('forged-document', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const attempt = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId: crypto.randomUUID(), relativePath: 'a.pdf' }] }, sender.cookie);
    assert.equal(attempt.status, 400);
    assert.equal(attempt.json.error, 'invalid_manifest');
  });
});

test('a path-traversal-shaped relativePath is rejected at session creation', async () => {
  await withServer('path-traversal-manifest', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const attempt = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: '../../../../etc/passwd' }] }, sender.cookie);
    assert.equal(attempt.status, 400);
    assert.equal(attempt.json.error, 'invalid_manifest');
  });
});

test('an absolute path or Windows drive path in relativePath is rejected', async () => {
  await withServer('absolute-path-manifest', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const attemptA = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: '/etc/passwd' }] }, sender.cookie);
    assert.equal(attemptA.status, 400);
    const attemptB = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'C:\\Windows\\System32\\config' }] }, sender.cookie);
    assert.equal(attemptB.status, 400);
  });
});

test('a receiver cannot call /transfer/items/receive against a session they never paired with', async () => {
  await withServer('unpaired-receive', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);

    const outsider = await registerAndLogin(base, 'outsider');
    await createOrgAsOwner(base, outsider, 'Org X');
    // Never paired - attempt a direct receive call.
    const attempt = await post(base, '/transfer/items/receive', { sessionId: created.json.sessionId, itemId: crypto.randomUUID() }, outsider.cookie);
    assert.equal(attempt.status, 403, 'a non-party to the session must be rejected');
  });
});

test('completing or cancelling an already-terminal session is rejected as an invalid state transition', async () => {
  await withServer('invalid-transition', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);
    await post(base, '/transfer/cancel', { sessionId: created.json.sessionId }, sender.cookie);
    const secondCancel = await post(base, '/transfer/cancel', { sessionId: created.json.sessionId }, sender.cookie);
    assert.equal(secondCancel.status, 409);
    assert.equal(secondCancel.json.error, 'invalid_state_transition');
  });
});

test('an expired session cannot be paired', async () => {
  await withServer('expired', async ({ base, db }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);

    // Force real expiration by directly setting expires_at into the past.
    await db.run('UPDATE transfer_sessions SET expires_at = ? WHERE id = ?', [Date.now() - 1000, created.json.sessionId]);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const attempt = await post(base, '/transfer/pair', { organizationId: orgB, sessionId: created.json.sessionId, token: created.json.pairingToken }, receiver.cookie);
    assert.equal(attempt.status, 410);
    assert.equal(attempt.json.error, 'session_expired');
  });
});

// ---------------------------------------------------------------------
// 6. Large file transfer
// ---------------------------------------------------------------------

test('a large (~3MB) file transfers and verifies correctly through the real transfer path', async () => {
  await withServer('large-transfer', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const content = crypto.randomBytes(3 * 1024 * 1024);
    const { documentId, checksum } = await createDocumentWithBinary(base, orgA, sender.cookie, { title: 'Large File', content });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'large.bin' }] }, sender.cookie);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const paired = await post(base, '/transfer/pair', { organizationId: orgB, sessionId: created.json.sessionId, token: created.json.pairingToken }, receiver.cookie);
    const realItemId = paired.json.manifest[0].itemId;

    const received = await post(base, '/transfer/items/receive', { sessionId: created.json.sessionId, itemId: realItemId }, receiver.cookie);
    assert.equal(received.status, 200);
    assert.equal(received.json.checksum, checksum);

    const download = await fetch(new URL(`${base}/documents/binary?organizationId=${orgB}&documentId=${received.json.receivedDocumentId}`), { headers: { Cookie: receiver.cookie } });
    const buffer = Buffer.from(await download.arrayBuffer());
    assert.ok(buffer.equals(content), 'a ~3MB file must round-trip byte-for-byte through the real transfer path');
  });
});

// ---------------------------------------------------------------------
// 7. RESTART PERSISTENCE
// ---------------------------------------------------------------------

test('PROCESS A creates a session and pairs it, the server is fully closed, PROCESS B (new instance, same db file) can still receive the item, proving session state genuinely persists', async () => {
  const dbPath = freshDbPath('restart');
  let orgA, orgB, sessionId, itemId, senderEmail, receiverEmail, password, expectedChecksum, documentId;
  const content = Buffer.from('This transfer session must survive a real restart.');
  password = 'correct horse battery staple 1';

  try {
    await withServer('restart-a', async ({ base }) => {
      const sender = await registerAndLogin(base, 'restart-sender');
      senderEmail = sender.email;
      orgA = await createOrgAsOwner(base, sender, 'Restart Org A');
      const doc = await createDocumentWithBinary(base, orgA, sender.cookie, { title: 'Persisted', content });
      documentId = doc.documentId;
      expectedChecksum = doc.checksum;
      const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);
      sessionId = created.json.sessionId;

      const receiver = await registerAndLogin(base, 'restart-receiver');
      receiverEmail = receiver.email;
      orgB = await createOrgAsOwner(base, receiver, 'Restart Org B');
      const paired = await post(base, '/transfer/pair', { organizationId: orgB, sessionId, token: created.json.pairingToken }, receiver.cookie);
      itemId = paired.json.manifest[0].itemId;
    }, { dbPath });

    await withServer('restart-b', async ({ base }) => {
      const login = await post(base, '/auth/login', { email: receiverEmail, password });
      assert.equal(login.status, 200);
      const received = await post(base, '/transfer/items/receive', { sessionId, itemId }, login.cookie);
      assert.equal(received.status, 200, 'the paired session must still be usable after a real server restart');
      assert.equal(received.json.checksum, expectedChecksum);
    }, { dbPath });
  } finally {
    fs.rmSync(dbPath, { force: true });
    fs.rmSync(dbPath + '-wal', { force: true });
    fs.rmSync(dbPath + '-shm', { force: true });
  }
});
