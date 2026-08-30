'use strict';
/**
 * server/webauthn-rp/test/organizations.test.js
 *
 * Milestone A — server-backed organization + membership authority.
 * Exercises the real HTTP routes in server.js (not the OrganizationRegistry
 * class directly) so these tests prove the same thing a real browser
 * session would experience: cookie-derived identity, fail-closed
 * authorization, and organization isolation, end to end.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createServer } = require('../server');
const { freshDbPath: freshTmpDbPath } = require('./tmp-db');

const RP_ID = 'localhost';
const ORIGIN = 'http://localhost';

function freshDbPath(name) {
  return freshTmpDbPath(`webauthn-orgs-${name}`);
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

// ---------- 1. organization creation + ownership ----------

test('creating an organization seats the creator as an active owner', async () => {
  await withServer('create', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const create = await post(base, '/organizations/create', { name: 'Acme Org' }, owner.cookie);
    assert.equal(create.status, 200);
    assert.equal(create.json.organization.name, 'Acme Org');

    const mine = await get(base, '/organizations/mine', owner.cookie);
    assert.equal(mine.status, 200);
    assert.equal(mine.json.memberships.length, 1);
    assert.equal(mine.json.memberships[0].status, 'active');
    assert.deepEqual(mine.json.memberships[0].roles, ['owner']);
  });
});

test('unauthenticated requests are rejected before touching the database', async () => {
  await withServer('unauth', async ({ base }) => {
    const create = await post(base, '/organizations/create', { name: 'Nope' }, null);
    assert.equal(create.status, 401);
    const mine = await get(base, '/organizations/mine', null);
    assert.equal(mine.status, 401);
  });
});

// ---------- 2. invitation lifecycle ----------

test('invite -> accept flow, and only the invited identity can accept', async () => {
  await withServer('invite-accept', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const worker = await registerAndLogin(base, 'worker');
    const stranger = await registerAndLogin(base, 'stranger');
    const org = (await post(base, '/organizations/create', { name: 'B' }, owner.cookie)).json.organization;

    const invite = await post(base, '/organizations/invite', { organizationId: org.id, userId: worker.userId, roles: ['cashier'] }, owner.cookie);
    assert.equal(invite.status, 200);
    assert.equal(invite.json.membership.status, 'invited');

    // A stranger cannot accept an invitation addressed to someone else —
    // acceptance is tied to currentSession(req), not a body field.
    const strangerAccept = await post(base, '/organizations/invite/accept', { organizationId: org.id }, stranger.cookie);
    assert.equal(strangerAccept.status, 404, 'stranger has no membership row to accept');

    const accept = await post(base, '/organizations/invite/accept', { organizationId: org.id }, worker.cookie);
    assert.equal(accept.status, 200);
    assert.equal(accept.json.membership.status, 'active');
  });
});

test('a non-authorized member cannot invite others', async () => {
  await withServer('invite-unauthorized', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const worker = await registerAndLogin(base, 'worker');
    const other = await registerAndLogin(base, 'other');
    const org = (await post(base, '/organizations/create', { name: 'B' }, owner.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: org.id, userId: worker.userId, roles: ['cashier'] }, owner.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: org.id }, worker.cookie);

    // worker is an active member but holds no owner/admin role, so
    // org:workforce:invite must be denied.
    const attemptedInvite = await post(base, '/organizations/invite', { organizationId: org.id, userId: other.userId, roles: [] }, worker.cookie);
    assert.equal(attemptedInvite.status, 403);
    assert.equal(attemptedInvite.json.error, 'not_authorized');
  });
});

test('decline and revoke transitions work and are terminal', async () => {
  await withServer('decline-revoke', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const workerA = await registerAndLogin(base, 'workerA');
    const workerB = await registerAndLogin(base, 'workerB');
    const org = (await post(base, '/organizations/create', { name: 'B' }, owner.cookie)).json.organization;

    await post(base, '/organizations/invite', { organizationId: org.id, userId: workerA.userId }, owner.cookie);
    const decline = await post(base, '/organizations/invite/decline', { organizationId: org.id }, workerA.cookie);
    assert.equal(decline.json.membership.status, 'declined');
    const acceptAfterDecline = await post(base, '/organizations/invite/accept', { organizationId: org.id }, workerA.cookie);
    assert.equal(acceptAfterDecline.status, 409, 'a declined invite cannot later be accepted');

    await post(base, '/organizations/invite', { organizationId: org.id, userId: workerB.userId }, owner.cookie);
    const revoke = await post(base, '/organizations/invite/revoke', { organizationId: org.id, targetUserId: workerB.userId }, owner.cookie);
    assert.equal(revoke.json.membership.status, 'revoked');
  });
});

// ---------- 3. membership lifecycle ----------

test('suspend blocks authorization, reactivate restores it, remove is terminal', async () => {
  await withServer('lifecycle', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const worker = await registerAndLogin(base, 'worker');
    const org = (await post(base, '/organizations/create', { name: 'B' }, owner.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: org.id, userId: worker.userId, roles: ['admin'] }, owner.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: org.id }, worker.cookie);

    let authz = await post(base, '/organizations/authorize', { organizationId: org.id, capability: 'org:workforce:manage' }, worker.cookie);
    assert.equal(authz.json.authorized, true);

    await post(base, '/organizations/membership/suspend', { organizationId: org.id, targetUserId: worker.userId }, owner.cookie);
    authz = await post(base, '/organizations/authorize', { organizationId: org.id, capability: 'org:workforce:manage' }, worker.cookie);
    assert.equal(authz.json.authorized, false, 'suspended membership must fail closed');

    await post(base, '/organizations/membership/reactivate', { organizationId: org.id, targetUserId: worker.userId }, owner.cookie);
    authz = await post(base, '/organizations/authorize', { organizationId: org.id, capability: 'org:workforce:manage' }, worker.cookie);
    assert.equal(authz.json.authorized, true);

    await post(base, '/organizations/membership/remove', { organizationId: org.id, targetUserId: worker.userId }, owner.cookie);
    authz = await post(base, '/organizations/authorize', { organizationId: org.id, capability: 'org:workforce:manage' }, worker.cookie);
    assert.equal(authz.json.authorized, false, 'removed membership must fail closed');
  });
});

// ---------- 4. roles, applications, permissions ----------

test('deny-over-allow: an explicit deny permission beats the admin-role default grant', async () => {
  await withServer('deny-over-allow', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const org = (await post(base, '/organizations/create', { name: 'B' }, owner.cookie)).json.organization;

    let authz = await post(base, '/organizations/authorize', { organizationId: org.id, capability: 'org:workforce:manage' }, owner.cookie);
    assert.equal(authz.json.authorized, true, 'owner role grants org: capabilities by default');

    await post(base, '/organizations/permission/grant', { organizationId: org.id, targetUserId: owner.userId, permissionName: 'org:workforce:manage', effect: 'deny' }, owner.cookie);
    authz = await post(base, '/organizations/authorize', { organizationId: org.id, capability: 'org:workforce:manage' }, owner.cookie);
    assert.equal(authz.json.authorized, false, 'explicit deny must override the role-default allow');

    await post(base, '/organizations/permission/revoke', { organizationId: org.id, targetUserId: owner.userId, permissionName: 'org:workforce:manage' }, owner.cookie);
    authz = await post(base, '/organizations/authorize', { organizationId: org.id, capability: 'org:workforce:manage' }, owner.cookie);
    assert.equal(authz.json.authorized, true, 'revoking the deny restores the role-default grant');
  });
});

test('application assignment: an org admin can assign/remove within their org only', async () => {
  await withServer('app-assign', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const worker = await registerAndLogin(base, 'worker');
    const org = (await post(base, '/organizations/create', { name: 'B' }, owner.cookie)).json.organization;
    await post(base, '/organizations/invite', { organizationId: org.id, userId: worker.userId, roles: ['cashier'] }, owner.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: org.id }, worker.cookie);

    const assign = await post(base, '/organizations/application/assign', { organizationId: org.id, targetUserId: worker.userId, applicationId: 'MpesaOS' }, owner.cookie);
    assert.equal(assign.status, 200);
    assert.deepEqual(assign.json.membership.applications, ['MpesaOS']);

    // The worker (no admin/owner role, no explicit permission) cannot
    // assign applications to themselves or anyone else.
    const workerAttempt = await post(base, '/organizations/application/assign', { organizationId: org.id, targetUserId: worker.userId, applicationId: 'OtherOS' }, worker.cookie);
    assert.equal(workerAttempt.status, 403);

    const remove = await post(base, '/organizations/application/remove', { organizationId: org.id, targetUserId: worker.userId, applicationId: 'MpesaOS' }, owner.cookie);
    assert.deepEqual(remove.json.membership.applications, []);

    // Nothing in this milestone exposes a platform-wide "remove this
    // application from CozyOS" route at all — confirm it simply doesn't exist.
    const noSuchRoute = await post(base, '/applications/remove-global', { applicationId: 'MpesaOS' }, owner.cookie);
    assert.equal(noSuchRoute.status, 404);
  });
});

// ---------- 5. multi-organization isolation (the James scenario) ----------

test('a user active in two organizations keeps them fully isolated', async () => {
  await withServer('isolation', async ({ base }) => {
    const ownerB = await registerAndLogin(base, 'ownerB');
    const ownerC = await registerAndLogin(base, 'ownerC');
    const james = await registerAndLogin(base, 'james');

    const orgB = (await post(base, '/organizations/create', { name: 'ORG-B' }, ownerB.cookie)).json.organization;
    const orgC = (await post(base, '/organizations/create', { name: 'ORG-C' }, ownerC.cookie)).json.organization;

    await post(base, '/organizations/invite', { organizationId: orgB.id, userId: james.userId, roles: ['cashier'] }, ownerB.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: orgB.id }, james.cookie);
    await post(base, '/organizations/application/assign', { organizationId: orgB.id, targetUserId: james.userId, applicationId: 'MpesaOS' }, ownerB.cookie);

    await post(base, '/organizations/invite', { organizationId: orgC.id, userId: james.userId, roles: ['owner'] }, ownerC.cookie);
    await post(base, '/organizations/invite/accept', { organizationId: orgC.id }, james.cookie);

    const mine = await get(base, '/organizations/mine', james.cookie);
    assert.equal(mine.json.memberships.length, 2);
    const inB = mine.json.memberships.find((m) => m.organizationId === orgB.id);
    const inC = mine.json.memberships.find((m) => m.organizationId === orgC.id);
    assert.deepEqual(inB.roles, ['cashier']);
    assert.deepEqual(inB.applications, ['MpesaOS']);
    assert.deepEqual(inC.roles, ['owner']);
    assert.deepEqual(inC.applications, []);

    // James's ORG-B cashier role must not grant ORG-C authority, and
    // vice versa — no capability leaks across the organization boundary.
    const jamesOrgCAsWorkforceManager = await post(base, '/organizations/authorize', { organizationId: orgC.id, capability: 'org:workforce:manage' }, james.cookie);
    assert.equal(jamesOrgCAsWorkforceManager.json.authorized, true, 'james is legitimately owner in ORG-C');
    const jamesOrgBAsWorkforceManager = await post(base, '/organizations/authorize', { organizationId: orgB.id, capability: 'org:workforce:manage' }, james.cookie);
    assert.equal(jamesOrgBAsWorkforceManager.json.authorized, false, 'james is only a cashier in ORG-B');

    // ORG-B's owner must never see ORG-C's members through the members list.
    const orgBMembers = await post(base, '/organizations/members/list', { organizationId: orgB.id }, ownerB.cookie);
    assert.equal(orgBMembers.status, 200);
    assert.ok(orgBMembers.json.members.every((m) => m.organizationId === orgB.id));
    assert.equal(orgBMembers.json.members.some((m) => m.userId === ownerC.userId), false);

    // ORG-B's owner has no membership in ORG-C at all, so listing ORG-C's
    // members must fail closed rather than leak them.
    const crossOrgList = await post(base, '/organizations/members/list', { organizationId: orgC.id }, ownerB.cookie);
    assert.equal(crossOrgList.status, 403);
  });
});

// ---------- 6. identity cannot be spoofed through the request body ----------

test('a request body cannot claim to act as another authenticated identity', async () => {
  await withServer('no-spoof', async ({ base }) => {
    const owner = await registerAndLogin(base, 'owner');
    const attacker = await registerAndLogin(base, 'attacker');
    const org = (await post(base, '/organizations/create', { name: 'B' }, owner.cookie)).json.organization;

    // attacker is authenticated as themself, but tries to invite using
    // owner's userId in the body as if that made them the actor. The
    // route derives the actor from the session cookie only, so this must
    // still be evaluated as "attacker acting", and attacker holds no
    // membership in org at all.
    const spoofAttempt = await post(base, '/organizations/invite', { organizationId: org.id, userId: attacker.userId, actingAs: owner.userId }, attacker.cookie);
    assert.equal(spoofAttempt.status, 403);
    assert.equal(spoofAttempt.json.error, 'not_authorized');
  });
});

// ---------- 7. audit trail ----------

test('organization mutations are recorded in the shared audit_events table', async () => {
  await withServer('audit', async ({ base, db }) => {
    const owner = await registerAndLogin(base, 'owner');
    const create = await post(base, '/organizations/create', { name: 'Audited Org' }, owner.cookie);
    const orgId = create.json.organization.id;

    const rows = db.prepare('SELECT * FROM audit_events WHERE event_type = ?').all('organization_created');
    assert.equal(rows.length, 1);
    const detail = JSON.parse(rows[0].detail);
    assert.equal(detail.organizationId, orgId);
    assert.equal(rows[0].user_id, owner.userId);
  });
});
