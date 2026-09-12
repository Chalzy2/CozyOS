'use strict';
/**
 * server/webauthn-rp/test/organizations-context.test.js
 *
 * D2 prerequisite (server organization context). Exercises the real
 * POST /organizations/context route end to end over real HTTP, following
 * the same withServer/registerAndLogin/post/get conventions as
 * server/webauthn-rp/test/session-organizations.test.js (auth/register +
 * auth/login, not the full WebAuthn ceremony — this route doesn't care
 * which auth method produced the session, only that one exists).
 *
 * Run with: node --test server/webauthn-rp/test/organizations-context.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`organizations-context-${name}`);
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
  assert.equal(reg.status, 200, `register(${email}) should succeed`);
  const login = await post(base, '/auth/login', { email, password });
  assert.equal(login.status, 200, `login(${email}) should succeed`);
  return { email, userId: reg.json.userId, cookie: login.cookie };
}

// ---------- unauthenticated ----------

test('context: no cookie at all is rejected before touching organization data', async () => {
  await withServer('unauth', async ({ base }) => {
    const res = await post(base, '/organizations/context', { organizationId: 'org-b' }, null);
    assert.equal(res.status, 401);
    assert.equal(res.json.error, 'not_authenticated');
  });
});

// ---------- missing param ----------

test('context: missing organizationId is a 400, never treated as "no org selected -> deny"', async () => {
  await withServer('missing-param', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const res = await post(base, '/organizations/context', {}, owner.cookie);
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'organizationId_required');
  });
});

// ---------- org-owner happy path ----------

test('context: an organization owner gets full context with isOrgAdmin true', async () => {
  await withServer('owner-happy', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner2');
    const org = (await post(base, '/organizations/create', { name: 'Acme' }, owner.cookie)).json.organization;

    const res = await post(base, '/organizations/context', { organizationId: org.id }, owner.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.organizationId, org.id);
    assert.equal(res.json.organizationName, 'Acme');
    assert.equal(res.json.status, 'active');
    assert.deepEqual(res.json.roles, ['owner']);
    assert.equal(res.json.isOrgAdmin, true);
    assert.equal(res.json.canManageWorkforce, true);
    assert.equal(res.json.canManageApplications, true);
    assert.equal(res.json.canManagePermissions, true);
  });
});

// ---------- worker (James-as-Cashier-in-ORG-B) happy path ----------

test('context: a plain worker (cashier) gets their real applications/permissions with isOrgAdmin false', async () => {
  await withServer('worker-happy', async ({ base }) => {
    const james = await registerAndLogin(base, 'james');
    const ownerB = await registerAndLogin(base, 'orgb-owner');
    const orgB = (await post(base, '/organizations/create', { name: 'ORG-B' }, ownerB.cookie)).json.organization;

    await post(base, '/organizations/invite', { organizationId: orgB.id, userId: james.userId, roles: ['cashier'] }, ownerB.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: orgB.id }, james.cookie);
    await post(base, '/organizations/application/assign', { organizationId: orgB.id, targetUserId: james.userId, applicationId: 'MpesaOS' }, ownerB.cookie);
    await post(base, '/organizations/permission/grant', { organizationId: orgB.id, targetUserId: james.userId, permissionName: 'app:MpesaOS:Transactions', effect: 'allow' }, ownerB.cookie);

    const res = await post(base, '/organizations/context', { organizationId: orgB.id }, james.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.json.organizationId, orgB.id);
    assert.deepEqual(res.json.roles, ['cashier']);
    assert.deepEqual(res.json.applications, ['MpesaOS']);
    assert.deepEqual(res.json.permissions, [{ name: 'app:MpesaOS:Transactions', effect: 'allow' }]);
    assert.equal(res.json.isOrgAdmin, false);
    assert.equal(res.json.canManageWorkforce, false);
    assert.equal(res.json.canManageApplications, false);
  });
});

// ---------- multi-org isolation: James in ORG-B and ORG-C ----------

test('context: James selecting ORG-B never returns any ORG-C data, and vice versa', async () => {
  await withServer('multi-org', async ({ base }) => {
    const james = await registerAndLogin(base, 'james2');
    const ownerB = await registerAndLogin(base, 'orgb-owner2');

    const orgB = (await post(base, '/organizations/create', { name: 'ORG-B' }, ownerB.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: orgB.id, userId: james.userId, roles: ['cashier'] }, ownerB.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: orgB.id }, james.cookie);

    const orgC = (await post(base, '/organizations/create', { name: 'ORG-C' }, james.cookie)).json.organization;

    const ctxB = await post(base, '/organizations/context', { organizationId: orgB.id }, james.cookie);
    assert.equal(ctxB.status, 200);
    assert.equal(ctxB.json.organizationId, orgB.id);
    assert.equal(ctxB.json.organizationName, 'ORG-B');
    assert.equal(ctxB.json.isOrgAdmin, false);

    const ctxC = await post(base, '/organizations/context', { organizationId: orgC.id }, james.cookie);
    assert.equal(ctxC.status, 200);
    assert.equal(ctxC.json.organizationId, orgC.id);
    assert.equal(ctxC.json.organizationName, 'ORG-C');
    assert.equal(ctxC.json.isOrgAdmin, true);

    // Neither response leaks the other organization's id/name/role.
    assert.notEqual(ctxB.json.organizationId, ctxC.json.organizationId);
    assert.notEqual(ctxB.json.isOrgAdmin, ctxC.json.isOrgAdmin);
  });
});

// ---------- cross-tenant tampering ----------

test('context: a real member of ORG-B requesting ORG-C (they never joined) is denied, not given ORG-C data', async () => {
  await withServer('cross-tenant', async ({ base }) => {
    const james = await registerAndLogin(base, 'james3');
    const ownerB = await registerAndLogin(base, 'orgb-owner3');
    const ownerC = await registerAndLogin(base, 'orgc-owner3');

    const orgB = (await post(base, '/organizations/create', { name: 'ORG-B' }, ownerB.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: orgB.id, userId: james.userId, roles: ['cashier'] }, ownerB.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: orgB.id }, james.cookie);

    const orgC = (await post(base, '/organizations/create', { name: 'ORG-C' }, ownerC.cookie)).json.organization;

    const res = await post(base, '/organizations/context', { organizationId: orgC.id }, james.cookie);
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'not_an_active_member');
    assert.equal(res.json.organizationName, undefined, 'must not leak ORG-C name to a non-member');
    assert.equal(res.json.roles, undefined);
  });
});

test('context: a nonexistent organizationId is denied the same way as a real one the caller never joined', async () => {
  await withServer('nonexistent-org', async ({ base }) => {
    const someone = await registerAndLogin(base, 'someone');
    const res = await post(base, '/organizations/context', { organizationId: 'org-does-not-exist' }, someone.cookie);
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'not_an_active_member');
  });
});

// ---------- suspended / removed / pending-invite membership ----------

test('context: a suspended membership is denied, never returns organization data', async () => {
  await withServer('suspended', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner4');
    const worker = await registerAndLogin(base, 'worker4');
    const org = (await post(base, '/organizations/create', { name: 'Suspend Co' }, owner.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: org.id, userId: worker.userId, roles: ['cashier'] }, owner.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: org.id }, worker.cookie);
    await post(base, '/organizations/membership/suspend', { organizationId: org.id, targetUserId: worker.userId }, owner.cookie);

    const res = await post(base, '/organizations/context', { organizationId: org.id }, worker.cookie);
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'not_an_active_member');
    assert.equal(res.json.organizationName, undefined);
  });
});

test('context: a removed membership is denied, never returns organization data', async () => {
  await withServer('removed', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner5');
    const worker = await registerAndLogin(base, 'worker5');
    const org = (await post(base, '/organizations/create', { name: 'Departed Co' }, owner.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: org.id, userId: worker.userId, roles: ['cashier'] }, owner.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: org.id }, worker.cookie);
    await post(base, '/organizations/membership/remove', { organizationId: org.id, targetUserId: worker.userId }, owner.cookie);

    const res = await post(base, '/organizations/context', { organizationId: org.id }, worker.cookie);
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'not_an_active_member');
  });
});

test('context: a pending (not-yet-accepted) invitation is denied exactly like no membership at all', async () => {
  await withServer('pending-invite', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner6');
    const invitee = await registerAndLogin(base, 'invitee6');
    const org = (await post(base, '/organizations/create', { name: 'Pending Co' }, owner.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: org.id, userId: invitee.userId, roles: ['cashier'] }, owner.cookie);

    const res = await post(base, '/organizations/context', { organizationId: org.id }, invitee.cookie);
    assert.equal(res.status, 403);
    assert.equal(res.json.error, 'not_an_active_member');
  });
});

// ---------- malformed organizationId ----------

test('context: a non-string organizationId (forged JSON) is a 400, never coerced into a query', async () => {
  await withServer('malformed', async ({ base }) => {
    const someone = await registerAndLogin(base, 'someone2');
    const res = await post(base, '/organizations/context', { organizationId: { $ne: null } }, someone.cookie);
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'organizationId_required');
  });
});
