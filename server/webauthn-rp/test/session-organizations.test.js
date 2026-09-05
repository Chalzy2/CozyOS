'use strict';
/**
 * server/webauthn-rp/test/session-organizations.test.js
 *
 * Milestone: Server Session + 3-Way Gate Foundation.
 *
 * Exercises the real GET /webauthn/session route end to end (cookie-derived
 * identity, real OrganizationRegistry-backed `organizations` field) — never
 * the pure gate-core decision logic directly (see
 * core/shell/tests/admin-gate-core.test.js for that). Follows the same
 * withServer/registerAndLogin conventions as organizations.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-session-orgs-${name}`);
}

async function withServer(name, fn) {
  const dbPath = freshDbPath(name);
  const server = createServer({ dbPath, rpId: RP_ID, rpName: 'CozyOS Test', origin: ORIGIN });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ server, base, rp: server.rp, db: server.db, orgs: server.orgs });
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
  const res = await fetch(base + path_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, cookie: extractCookie(res) };
}

async function get(base, path_, cookie) {
  const res = await fetch(base + path_, { headers: cookie ? { Cookie: cookie } : {} });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
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

// ---------- 1. authenticated platform admin ----------

test('session: platform admin sees isPlatformAdmin true and an empty/omitted organizations concern', async () => {
  await withServer('platform-admin', async ({ base, rp }) => {
    const admin = await registerAndLogin(base, 'admin');
    await rp.setPlatformAdmin(admin.userId, true);
    const session = await get(base, '/webauthn/session', admin.cookie);
    assert.equal(session.status, 200);
    assert.equal(session.json.authenticated, true);
    assert.equal(session.json.isPlatformAdmin, true);
    assert.deepEqual(session.json.organizations, []);
  });
});

// ---------- 2. authenticated user with one organization (as owner => org admin) ----------

test('session: organization owner sees isPlatformAdmin false and one isOrgAdmin:true membership', async () => {
  await withServer('one-org', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = (await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie)).json.organization;

    const session = await get(base, '/webauthn/session', owner.cookie);
    assert.equal(session.status, 200);
    assert.equal(session.json.isPlatformAdmin, false);
    assert.equal(session.json.organizations.length, 1);
    assert.equal(session.json.organizations[0].organizationId, org.id);
    assert.equal(session.json.organizations[0].name, 'Acme');
    assert.equal(session.json.organizations[0].status, 'active');
    assert.equal(session.json.organizations[0].isOrgAdmin, true);
  });
});

// ---------- 3. authenticated user with multiple organizations ----------

test('session: a user belonging to two organizations sees both, independently', async () => {
  await withServer('multi-org', async ({ base }) => {
    const james = await registerAndLogin(base, 'james');
    const orgOwnerB = await registerAndLogin(base, 'orgb-owner');

    // ORG-B: James is invited as a plain worker (no admin role).
    const orgB = (await post(base, '/organizations/create', { name: 'ORG-B' }, orgOwnerB.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: orgB.id, userId: james.userId, roles: ['cashier'] }, orgOwnerB.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: orgB.id }, james.cookie);

    // ORG-C: James creates and owns it himself => org admin there.
    const orgC = (await post(base, '/organizations/create', { name: 'ORG-C' }, james.cookie)).json.organization;

    const session = await get(base, '/webauthn/session', james.cookie);
    assert.equal(session.status, 200);
    assert.equal(session.json.organizations.length, 2);

    const b = session.json.organizations.find((m) => m.organizationId === orgB.id);
    const c = session.json.organizations.find((m) => m.organizationId === orgC.id);
    assert.ok(b, 'ORG-B membership present');
    assert.ok(c, 'ORG-C membership present');
    assert.equal(b.isOrgAdmin, false, 'cashier role in ORG-B is not org-admin capable');
    assert.equal(c.isOrgAdmin, true, 'owner role in ORG-C is org-admin capable');
  });
});

// ---------- 4. user with no organizations ----------

test('session: an authenticated user with no memberships gets an empty organizations array', async () => {
  await withServer('no-orgs', async ({ base }) => {
    const solo = await registerAndLogin(base, 'solo');
    const session = await get(base, '/webauthn/session', solo.cookie);
    assert.equal(session.status, 200);
    assert.equal(session.json.isPlatformAdmin, false);
    assert.deepEqual(session.json.organizations, []);
  });
});

// ---------- 5. unauthenticated session ----------

test('session: no cookie is rejected before touching organization data', async () => {
  await withServer('unauth', async ({ base }) => {
    const session = await get(base, '/webauthn/session', null);
    assert.equal(session.status, 401);
    assert.equal(session.json.authenticated, false);
    assert.equal(session.json.organizations, undefined);
  });
});

// ---------- 6. invalid/forged session cookie ----------

test('session: a forged/garbage session cookie is rejected, never treated as a valid identity', async () => {
  await withServer('invalid-cookie', async ({ base }) => {
    const session = await get(base, '/webauthn/session', 'cozy_admin_session=not-a-real-session-id');
    assert.equal(session.status, 401);
    assert.equal(session.json.authenticated, false);
  });
});

// ---------- non-active memberships are never exposed ----------

test('session: a pending invitation (not yet accepted) is not exposed as an organization membership', async () => {
  await withServer('pending-invite', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner2');
    const invitee = await registerAndLogin(base, 'invitee');
    const org = (await post(base, '/organizations/create', { name: 'Pending Co' }, owner.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: org.id, userId: invitee.userId, roles: ['cashier'] }, owner.cookie);

    const session = await get(base, '/webauthn/session', invitee.cookie);
    assert.equal(session.status, 200);
    assert.deepEqual(session.json.organizations, [], 'an invited-but-not-accepted membership carries no dashboard authority yet');
  });
});

test('session: a removed membership is not exposed as an organization membership', async () => {
  await withServer('removed-membership', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner3');
    const worker = await registerAndLogin(base, 'worker3');
    const org = (await post(base, '/organizations/create', { name: 'Departed Co' }, owner.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: org.id, userId: worker.userId, roles: ['cashier'] }, owner.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: org.id }, worker.cookie);
    await post(base, '/organizations/membership/remove', { organizationId: org.id, targetUserId: worker.userId }, owner.cookie);

    const session = await get(base, '/webauthn/session', worker.cookie);
    assert.equal(session.status, 200);
    assert.deepEqual(session.json.organizations, []);
  });
});
