'use strict';
/**
 * server/webauthn-rp/test/qr-pairing.test.js
 *
 * CozyOS File Phase 5 — real tests for the QR pairing payload codec and
 * its integration with the existing, unmodified Phase 4
 * TransferSessionRegistry.pair(). No new security engine is tested here
 * because none was created — every security decision (token match,
 * expiry, cross-organization isolation, replay) is proven to flow
 * through the exact same Phase 4 logic already tested in
 * transfer-session.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { createServer } = require('../server');
const { encodeQrPayload, decodeQrPayload } = require('../qr-pairing');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-qr-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, db: server.db });
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
  return setCookie ? setCookie.split(';')[0] : null;
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
  if (content) {
    await fetch(`${base}/documents/binary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', 'X-Cozy-Organization-Id': orgId, 'X-Cozy-Document-Id': documentId, Cookie: cookie },
      body: content,
    });
  }
  return { documentId };
}

// ---------------------------------------------------------------------
// 1. Pure payload codec (unit tests, no server needed)
// ---------------------------------------------------------------------

test('encodeQrPayload/decodeQrPayload round-trip exactly, including a UUID sessionId and a real base64url token', () => {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + 60000;
  const encoded = encodeQrPayload({ sessionId, token, expiresAt });
  const decoded = decodeQrPayload(encoded);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.sessionId, sessionId);
  assert.equal(decoded.token, token);
  assert.equal(decoded.expiresAt, expiresAt);
});

test('the QR payload contains only protocol/version/sessionId/token/expiresAt - nothing else, confirmed by exact field count', () => {
  const encoded = encodeQrPayload({ sessionId: crypto.randomUUID(), token: crypto.randomBytes(32).toString('base64url'), expiresAt: Date.now() + 1000 });
  assert.equal(encoded.split(':').length, 5, 'the payload must contain exactly scheme, version, sessionId, token, expiresAt - no extra fields');
  assert.ok(!encoded.includes('password'));
});

test('decodeQrPayload rejects a malformed payload (wrong field count)', () => {
  assert.equal(decodeQrPayload('cozyshare:v1:only-three-fields').valid, false);
  assert.equal(decodeQrPayload('not-even-close-to-valid').valid, false);
  assert.equal(decodeQrPayload('').valid, false);
  assert.equal(decodeQrPayload(null).valid, false);
});

test('decodeQrPayload rejects an unsupported protocol version', () => {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const forged = `cozyshare:v99:${sessionId}:${token}:${Date.now() + 60000}`;
  const decoded = decodeQrPayload(forged);
  assert.equal(decoded.valid, false);
  assert.equal(decoded.reason, 'unsupported_version');
});

test('decodeQrPayload rejects a tampered sessionId (not a real UUID shape)', () => {
  const token = crypto.randomBytes(32).toString('base64url');
  const decoded = decodeQrPayload(`cozyshare:v1:not-a-uuid:${token}:${Date.now() + 60000}`);
  assert.equal(decoded.valid, false);
  assert.equal(decoded.reason, 'malformed_payload');
});

test('decodeQrPayload rejects a tampered token (wrong shape)', () => {
  const sessionId = crypto.randomUUID();
  const decoded = decodeQrPayload(`cozyshare:v1:${sessionId}:short:${Date.now() + 60000}`);
  assert.equal(decoded.valid, false);
  assert.equal(decoded.reason, 'malformed_payload');
});

test('decodeQrPayload rejects a payload with an already-past expiry, honestly and early (defense in depth, not the authoritative check)', () => {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const decoded = decodeQrPayload(`cozyshare:v1:${sessionId}:${token}:${Date.now() - 60000}`);
  assert.equal(decoded.valid, false);
  assert.equal(decoded.reason, 'expired_payload');
});

test('decodeQrPayload rejects a non-numeric expiry field', () => {
  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const decoded = decodeQrPayload(`cozyshare:v1:${sessionId}:${token}:not-a-number`);
  assert.equal(decoded.valid, false);
  assert.equal(decoded.reason, 'malformed_payload');
});

// ---------------------------------------------------------------------
// 2. Full route integration - real hand-off to the existing, unmodified pair()
// ---------------------------------------------------------------------

test('a valid, real QR payload pairs successfully through /transfer/pair/qr, identically to the existing token-based /transfer/pair', async () => {
  await withServer('valid-qr-pair', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('content') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);
    assert.ok(created.json.qrPayloadString, 'createSession must return a real, encoded QR payload string');

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const paired = await post(base, '/transfer/pair/qr', { organizationId: orgB, qrPayloadString: created.json.qrPayloadString }, receiver.cookie);
    assert.equal(paired.status, 200);
    assert.equal(paired.json.manifest.length, 1);
  });
});

test('QR-based pairing shares the exact same single-use guarantee as token-based pairing - a second scan of the same QR is rejected as a replay', async () => {
  await withServer('qr-replay', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('content') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const first = await post(base, '/transfer/pair/qr', { organizationId: orgB, qrPayloadString: created.json.qrPayloadString }, receiver.cookie);
    assert.equal(first.status, 200);

    const otherReceiver = await registerAndLogin(base, 'other-receiver');
    const orgC = await createOrgAsOwner(base, otherReceiver, 'Org C');
    const second = await post(base, '/transfer/pair/qr', { organizationId: orgC, qrPayloadString: created.json.qrPayloadString }, otherReceiver.cookie);
    assert.equal(second.status, 409);
    assert.equal(second.json.error, 'replay_rejected');
  });
});

test('a malformed QR payload string is rejected before ever reaching the transfer session logic', async () => {
  await withServer('malformed-route', async ({ base }) => {
    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const attempt = await post(base, '/transfer/pair/qr', { organizationId: orgB, qrPayloadString: 'garbage-not-a-real-payload' }, receiver.cookie);
    assert.equal(attempt.status, 400);
    assert.equal(attempt.json.error, 'malformed_payload');
  });
});

test('an unsupported QR protocol version is rejected cleanly, distinct from a malformed payload', async () => {
  await withServer('unsupported-version-route', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);
    const forgedVersion = created.json.qrPayloadString.replace(':v1:', ':v99:');

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const attempt = await post(base, '/transfer/pair/qr', { organizationId: orgB, qrPayloadString: forgedVersion }, receiver.cookie);
    assert.equal(attempt.status, 400);
    assert.equal(attempt.json.error, 'unsupported_version');
  });
});

test('a tampered token inside an otherwise well-formed QR payload is rejected by the existing pair() logic, not a QR-specific check', async () => {
  await withServer('tampered-token-route', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);
    const parts = created.json.qrPayloadString.split(':');
    parts[3] = crypto.randomBytes(32).toString('base64url');
    const tampered = parts.join(':');

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const attempt = await post(base, '/transfer/pair/qr', { organizationId: orgB, qrPayloadString: tampered }, receiver.cookie);
    assert.equal(attempt.status, 401);
    assert.equal(attempt.json.error, 'invalid_pairing_credential', 'tampering must be caught by the existing token-hash comparison in pair(), proving no new, separate security mechanism was needed');
  });
});

test('a tampered sessionId inside an otherwise well-formed QR payload is rejected as session_not_found', async () => {
  await withServer('tampered-session-route', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);
    const parts = created.json.qrPayloadString.split(':');
    parts[2] = crypto.randomUUID();
    const tampered = parts.join(':');

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const attempt = await post(base, '/transfer/pair/qr', { organizationId: orgB, qrPayloadString: tampered }, receiver.cookie);
    assert.equal(attempt.status, 404);
    assert.equal(attempt.json.error, 'session_not_found');
  });
});

test('the SERVER remains authoritative on expiry even if the QR payload own embedded timestamp has not yet elapsed', async () => {
  await withServer('server-authoritative-expiry', async ({ base, db }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('x') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);

    await db.run('UPDATE transfer_sessions SET expires_at = ? WHERE id = ?', [Date.now() - 1000, created.json.sessionId]);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const attempt = await post(base, '/transfer/pair/qr', { organizationId: orgB, qrPayloadString: created.json.qrPayloadString }, receiver.cookie);
    assert.equal(attempt.status, 410);
    assert.equal(attempt.json.error, 'session_expired', 'the server-side row must remain authoritative, not the QR payload\'s own embedded timestamp');
  });
});

test('cross-organization isolation via QR: pairing through a QR code establishes the receiver own real organization, never any other', async () => {
  await withServer('qr-cross-org', async ({ base }) => {
    const sender = await registerAndLogin(base, 'sender');
    const orgA = await createOrgAsOwner(base, sender, 'Org A');
    const { documentId } = await createDocumentWithBinary(base, orgA, sender.cookie, { content: Buffer.from('secret') });
    const created = await post(base, '/transfer/sessions', { organizationId: orgA, items: [{ documentId, relativePath: 'a.pdf' }] }, sender.cookie);

    const receiver = await registerAndLogin(base, 'receiver');
    const orgB = await createOrgAsOwner(base, receiver, 'Org B');
    const paired = await post(base, '/transfer/pair/qr', { organizationId: orgB, qrPayloadString: created.json.qrPayloadString }, receiver.cookie);
    assert.equal(paired.status, 200);

    const sessionInfo = await post(base, '/transfer/get', { sessionId: created.json.sessionId }, receiver.cookie);
    assert.equal(sessionInfo.json.session.receiverOrganizationId, orgB);
  });
});

test('unauthenticated requests to /transfer/pair/qr are rejected', async () => {
  await withServer('unauth-qr', async ({ base }) => {
    const attempt = await post(base, '/transfer/pair/qr', { organizationId: 'x', qrPayloadString: 'anything' });
    assert.equal(attempt.status, 401);
  });
});

// ---------------------------------------------------------------------
// 3. Renderer fail-closed integration (real browser-context test)
// ---------------------------------------------------------------------

test('a real encoded QR payload string, passed to the existing window.CozyOS.QRRenderer.render(), correctly returns the honest, unmodified fail-closed result', () => {
  const win = { CozyOS: {}, addEventListener: () => {} };
  global.window = win;
  const rendererPath = require.resolve('../../../core/security/qr-renderer.js');
  delete require.cache[rendererPath];
  require(rendererPath);

  const sessionId = crypto.randomUUID();
  const token = crypto.randomBytes(32).toString('base64url');
  const payloadString = encodeQrPayload({ sessionId, token, expiresAt: Date.now() + 60000 });

  return win.CozyOS.QRRenderer.render(payloadString).then((result) => {
    assert.equal(result.available, false, 'render() must remain honestly fail-closed - this phase does not fabricate a working renderer');
    assert.ok(result.reason.includes('No QR encoder is registered'));
    assert.equal(win.CozyOS.QRRenderer.hasRealEncoder(), false);
  });
});

// ---------------------------------------------------------------------
// 4. Scan capability detection (real, honest, UNIT-VERIFIED only)
// ---------------------------------------------------------------------

test('QrScanCapability.detect() honestly reports unsupported in this Node environment', () => {
  const win = { CozyOS: {}, isSecureContext: false };
  global.window = win;
  delete global.navigator;
  delete global.BarcodeDetector;
  delete global.location;
  const capPath = require.resolve('../../../core/security/qr-scan-capability.js');
  delete require.cache[capPath];
  require(capPath);

  const report = win.CozyOS.QrScanCapability.detect();
  assert.equal(report.barcodeDetector.supported, false);
  assert.equal(report.camera.supported, false);
  assert.equal(report.canScan, false, 'canScan must honestly be false when the underlying APIs are genuinely absent');
  assert.equal(report.evidenceLevel, 'UNIT-VERIFIED');
});

test('QrScanCapability.detect() correctly reports availability when the underlying real APIs are present - still only UNIT-VERIFIED, never DEVICE-VERIFIED', () => {
  const win = { CozyOS: {}, isSecureContext: true };
  global.window = win;
  global.navigator = { mediaDevices: { getUserMedia: () => {} } };
  global.BarcodeDetector = function () {};
  const capPath = require.resolve('../../../core/security/qr-scan-capability.js');
  delete require.cache[capPath];
  require(capPath);

  const report = win.CozyOS.QrScanCapability.detect();
  assert.equal(report.barcodeDetector.supported, true);
  assert.equal(report.camera.supported, true);
  assert.equal(report.canScan, true);
  assert.equal(report.evidenceLevel, 'UNIT-VERIFIED', 'even with the real APIs present, this must never claim DEVICE-VERIFIED');

  delete global.navigator;
  delete global.BarcodeDetector;
});
