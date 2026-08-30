/**
 * core/organization/tests/organization-role-extension.test.js
 * Real, executed tests for the PROMPT 4 additive extension to
 * core/organization/organization-role.js:
 *   - applicationId scope (§5)
 *   - restrictions / deny-over-allow precedence (§8)
 *   - capacity / capacityEnforced (§11)
 *
 * Run with: node core/organization/tests/organization-role-extension.test.js
 */

'use strict';

const assert = require('assert');
const path = require('path');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.stack || err.message}`);
    failed++;
  }
}

function freshWorld() {
  for (const p of [
    path.join(__dirname, '..', 'organization-registry.js'),
    path.join(__dirname, '..', 'organization-role.js'),
  ]) {
    delete require.cache[require.resolve(p)];
  }
  global.window = { CozyOS: {} };
  require(path.join(__dirname, '..', 'organization-registry.js'));
  require(path.join(__dirname, '..', 'organization-role.js'));
  return {
    OrgRegistry: global.window.CozyOS.OrganizationRegistry,
    OrgRole: global.window.CozyOS.OrganizationRole,
  };
}

console.log('\norganization-role-extension.test.js');

// ── applicationId scope (§5) ────────────────────────────────────────────

test('a role may declare an applicationId', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  const role = w.OrgRole.createRole({ name: 'Pastor', orgId: org.orgId, applicationId: 'ChurchOS' });
  assert.strictEqual(role.applicationId, 'ChurchOS');
});

test('omitting applicationId keeps prior behavior — null, not required', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Acme' });
  const role = w.OrgRole.createRole({ name: 'Owner', orgId: org.orgId });
  assert.strictEqual(role.applicationId, null);
});

test('the same real org can hold the same person under two separate application-scoped roles', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  const pastor = w.OrgRole.createRole({ name: 'Pastor', orgId: org.orgId, applicationId: 'ChurchOS', permissions: ['churchos:member-manage'] });
  const shopRole = w.OrgRole.createRole({ name: 'Owner', orgId: org.orgId, applicationId: 'ShopOS', permissions: ['shopos:inventory-manage'] });
  w.OrgRole.assignUser(pastor.roleId, 'alice');
  w.OrgRole.assignUser(shopRole.roleId, 'alice');
  const pastorAfter = w.OrgRole.getRole(pastor.roleId);
  const shopAfter = w.OrgRole.getRole(shopRole.roleId);
  assert.strictEqual(pastorAfter.assignedUserId, 'alice');
  assert.strictEqual(shopAfter.assignedUserId, 'alice');
  // Authorities never merge: ChurchOS role grants nothing in ShopOS scope.
  assert.deepStrictEqual(w.OrgRole.evaluateCapability(pastor.roleId, 'shopos:inventory-manage'), {
    allowed: false, reason: 'No explicit permission for "shopos:inventory-manage" — default deny.', source: 'default'
  });
});

test('listRoles({applicationId}) filters correctly and does not leak across applications', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  w.OrgRole.createRole({ name: 'Pastor', orgId: org.orgId, applicationId: 'ChurchOS' });
  w.OrgRole.createRole({ name: 'Elder', orgId: org.orgId, applicationId: 'ChurchOS' });
  w.OrgRole.createRole({ name: 'Owner', orgId: org.orgId, applicationId: 'ShopOS' });
  w.OrgRole.createRole({ name: 'Org Admin', orgId: org.orgId }); // no application scope

  const churchRoles = w.OrgRole.listRoles({ orgId: org.orgId, applicationId: 'ChurchOS' });
  const shopRoles = w.OrgRole.listRoles({ orgId: org.orgId, applicationId: 'ShopOS' });
  const unscopedRoles = w.OrgRole.listRoles({ orgId: org.orgId, applicationId: null });
  const allRoles = w.OrgRole.listRoles({ orgId: org.orgId });

  assert.strictEqual(churchRoles.length, 2);
  assert.strictEqual(shopRoles.length, 1);
  assert.strictEqual(unscopedRoles.length, 1);
  assert.strictEqual(allRoles.length, 4);
});

test('holding a ChurchOS Pastor role never implies platform admin or ShopOS admin authority (data-level check)', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  const pastor = w.OrgRole.createRole({ name: 'Pastor', orgId: org.orgId, applicationId: 'ChurchOS', permissions: ['churchos:member-manage'] });
  w.OrgRole.assignUser(pastor.roleId, 'alice');
  // This engine has no concept of "platform admin" at all — real IdentityEngine
  // owns that boundary separately (per organization-role.js's own header) and
  // this engine never fabricates one. Confirm the role object carries no such field.
  const role = w.OrgRole.getRole(pastor.roleId);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(role, 'isPlatformAdmin'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(role, 'isAdmin'), false);
});

// ── restrictions / deny precedence (§8) ─────────────────────────────────

test('createRole() accepts a valid restrictions array', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  const role = w.OrgRole.createRole({
    name: 'Usher', orgId: org.orgId, applicationId: 'ChurchOS',
    permissions: ['churchos:attendance-view', 'churchos:member-checkin'],
    restrictions: ['churchos:finance-delete', 'churchos:member-remove'],
  });
  assert.deepStrictEqual(role.permissions, ['churchos:attendance-view', 'churchos:member-checkin']);
  assert.deepStrictEqual(role.restrictions, ['churchos:finance-delete', 'churchos:member-remove']);
});

test('createRole() rejects a malformed restriction the same way it rejects a malformed permission', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Acme' });
  assert.throws(() => w.OrgRole.createRole({
    name: 'Worker', orgId: org.orgId, restrictions: ['not a valid capability string'],
  }), TypeError);
});

test('evaluateCapability(): an explicit permission with no conflicting restriction is allowed', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  const role = w.OrgRole.createRole({ name: 'Usher', orgId: org.orgId, permissions: ['churchos:attendance-view'] });
  const result = w.OrgRole.evaluateCapability(role.roleId, 'churchos:attendance-view');
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.source, 'permission');
});

test('evaluateCapability(): a capability neither permitted nor restricted is denied by default', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  const role = w.OrgRole.createRole({ name: 'Usher', orgId: org.orgId, permissions: ['churchos:attendance-view'] });
  const result = w.OrgRole.evaluateCapability(role.roleId, 'churchos:finance-delete');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.source, 'default');
});

test('evaluateCapability(): CONFLICT — explicit restriction wins over an explicit permission for the same capability', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  // Deliberately contradictory input: same capability string in both arrays.
  const role = w.OrgRole.createRole({
    name: 'Conflicted Role', orgId: org.orgId,
    permissions: ['churchos:member-remove'],
    restrictions: ['churchos:member-remove'],
  });
  const result = w.OrgRole.evaluateCapability(role.roleId, 'churchos:member-remove');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.source, 'restriction');
});

test('evaluateCapability(): an archived role is denied regardless of its declared permissions', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  const role = w.OrgRole.createRole({ name: 'Usher', orgId: org.orgId, permissions: ['churchos:attendance-view'] });
  w.OrgRole.archiveRole(role.roleId);
  const result = w.OrgRole.evaluateCapability(role.roleId, 'churchos:attendance-view');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.source, 'archived');
});

test('evaluateCapability(): an unknown roleId is denied, not a crash', () => {
  const w = freshWorld();
  const result = w.OrgRole.evaluateCapability('role_does_not_exist', 'churchos:attendance-view');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.source, 'not-found');
});

// ── capacity / capacityEnforced (§11) ───────────────────────────────────
// Architecture note (see organization-role.js's createRole() doc comment):
// capacity is enforced at the POSITION level (how many active role
// records of the same name+orgId+applicationId may exist), not by
// redesigning the real, load-bearing single-occupant assignedUserId field.

test('capacity disabled (capacityEnforced default false) — unlimited positions even with a capacity number set', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  for (let i = 0; i < 5; i++) {
    w.OrgRole.createRole({ name: 'Usher', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 2 });
  }
  const ushers = w.OrgRole.listRoles({ orgId: org.orgId, applicationId: 'ChurchOS' });
  assert.strictEqual(ushers.length, 5);
});

test('capacity = 0, enforced — refuses to create even the first position', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  assert.throws(() => w.OrgRole.createRole({
    name: 'Suspended Role', orgId: org.orgId, capacity: 0, capacityEnforced: true,
  }), /capacity/);
});

test('capacity = 1, enforced — second position of the same name/org/application is refused', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  w.OrgRole.createRole({ name: 'Lead Pastor', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 1, capacityEnforced: true });
  assert.throws(() => w.OrgRole.createRole({
    name: 'Lead Pastor', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 1, capacityEnforced: true,
  }), /capacity/);
});

test('capacity reached exactly — the Nth position succeeds, the (N+1)th is refused', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  for (let i = 0; i < 10; i++) {
    const role = w.OrgRole.createRole({ name: 'Security', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 10, capacityEnforced: true });
    assert.ok(role.roleId);
  }
  assert.throws(() => w.OrgRole.createRole({
    name: 'Security', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 10, capacityEnforced: true,
  }), /10\/10/);
});

test('capacity exceeded attempt does not silently create a role — Nth+1 position count stays at N', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  for (let i = 0; i < 3; i++) {
    w.OrgRole.createRole({ name: 'Security', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 3, capacityEnforced: true });
  }
  try {
    w.OrgRole.createRole({ name: 'Security', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 3, capacityEnforced: true });
  } catch (_e) { /* expected */ }
  const positions = w.OrgRole.listRoles({ orgId: org.orgId, applicationId: 'ChurchOS' });
  assert.strictEqual(positions.length, 3);
});

test('removing (archiving) a position then adding another succeeds once capacity frees up', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  const roles = [];
  for (let i = 0; i < 2; i++) {
    roles.push(w.OrgRole.createRole({ name: 'Security', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 2, capacityEnforced: true }));
  }
  assert.throws(() => w.OrgRole.createRole({
    name: 'Security', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 2, capacityEnforced: true,
  }), /capacity/);
  w.OrgRole.archiveRole(roles[0].roleId);
  const created = w.OrgRole.createRole({ name: 'Security', orgId: org.orgId, applicationId: 'ChurchOS', capacity: 2, capacityEnforced: true });
  assert.ok(created.roleId);
  const active = w.OrgRole.listRoles({ orgId: org.orgId, applicationId: 'ChurchOS' });
  assert.strictEqual(active.length, 2);
});

test('capacity is scoped per applicationId — the same role name in a different application has its own independent count', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Grace Community Church' });
  w.OrgRole.createRole({ name: 'Manager', orgId: org.orgId, applicationId: 'ShopOS', capacity: 1, capacityEnforced: true });
  // Same name "Manager", different applicationId — must NOT be blocked by ShopOS's capacity.
  const wholesaleRole = w.OrgRole.createRole({ name: 'Manager', orgId: org.orgId, applicationId: 'WholesaleOS', capacity: 1, capacityEnforced: true });
  assert.ok(wholesaleRole.roleId);
});

test('createRole() rejects a negative or non-integer capacity', () => {
  const w = freshWorld();
  const org = w.OrgRegistry.createOrganization({ name: 'Acme' });
  assert.throws(() => w.OrgRole.createRole({ name: 'Worker', orgId: org.orgId, capacity: -1 }), TypeError);
  assert.throws(() => w.OrgRole.createRole({ name: 'Worker', orgId: org.orgId, capacity: 1.5 }), TypeError);
});

// ── result ───────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exitCode = failed > 0 ? 1 : 0;
