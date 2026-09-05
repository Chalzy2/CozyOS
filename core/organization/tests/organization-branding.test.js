/**
 * core/organization/tests/organization-branding.test.js
 * Real, executed tests for core/organization/organization-branding.js
 *
 * Run with: node core/organization/tests/organization-branding.test.js
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
  // Fresh require of every module involved, isolated per test — matches
  // the repository's own established pattern (see cozy-language-registry.test.js)
  // rather than sharing global registry state across tests.
  for (const p of [
    path.join(__dirname, '..', 'organization-registry.js'),
    path.join(__dirname, '..', 'organization-role.js'),
    path.join(__dirname, '..', 'organization-branding.js'),
  ]) {
    delete require.cache[require.resolve(p)];
  }
  global.window = { CozyOS: {} };
  require(path.join(__dirname, '..', 'organization-registry.js'));
  require(path.join(__dirname, '..', 'organization-role.js'));
  require(path.join(__dirname, '..', 'organization-branding.js'));
  return {
    OrgRegistry: global.window.CozyOS.OrganizationRegistry,
    OrgRole: global.window.CozyOS.OrganizationRole,
    Branding: global.window.CozyOS.OrganizationBranding,
  };
}

// A minimal, fake CozyMedia + IdentityEngine so the branding module's real
// composition points (not its own reimplementation) are exercised.
function installFakeMedia(assets) {
  global.window.CozyOS.CozyMedia = {
    getMedia(id) { return assets[id] || null; },
  };
}
function installFakeIdentity(platformAdmins) {
  global.window.CozyOS.IdentityEngine = {
    isPlatformAdmin(userId) { return platformAdmins.has(userId); },
  };
}

function makeOrgAndAdminRole(world, { orgName = 'Grace Church Nairobi', adminUserId = 'user-admin-1' } = {}) {
  const org = world.OrgRegistry.createOrganization({ name: orgName, type: 'Church' });
  const role = world.OrgRole.createRole({
    name: 'Organization Administrator', orgId: org.orgId,
    permissions: ['organization:branding'],
  });
  world.OrgRole.assignUser(role.roleId, adminUserId);
  return { org, role, adminUserId };
}

console.log('\norganization-branding.test.js');

// ── Metadata: create / read ────────────────────────────────────────────
test('setBranding() creates a full branding record for a real organization', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({
    orgId: org.orgId, requestedByUserId: adminUserId,
    identity: { displayName: 'Grace Church', shortName: 'Grace', description: 'A community church.' },
    address: { line1: '12 Ngong Rd', city: 'Nairobi', region: 'Nairobi County', country: 'Kenya', postalCode: '00100' },
    contact: { email: 'info@grace.example', phone: '+254700000000', website: 'https://grace.example' },
    preferredLanguage: 'sw',
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.branding.identity.displayName, 'Grace Church');
  assert.strictEqual(result.branding.address.city, 'Nairobi');
  assert.strictEqual(result.branding.preferredLanguage, 'sw');
});

test('getBranding() returns an honest null when no branding exists yet', () => {
  const world = freshWorld();
  const { org } = makeOrgAndAdminRole(world);
  assert.strictEqual(world.Branding.getBranding(org.orgId), null);
});

test('getBranding() returns null for a nonexistent orgId rather than throwing', () => {
  const world = freshWorld();
  assert.strictEqual(world.Branding.getBranding('org_does_not_exist'), null);
});

test('setBranding() is a real partial merge — updating one field preserves the others', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, identity: { displayName: 'Grace Church' } });
  const second = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, identity: { shortName: 'Grace' } });
  assert.strictEqual(second.branding.identity.displayName, 'Grace Church');
  assert.strictEqual(second.branding.identity.shortName, 'Grace');
});

test('setBranding() rejects a nonexistent organization', () => {
  const world = freshWorld();
  const result = world.Branding.setBranding({ orgId: 'org_fake', requestedByUserId: 'someone', identity: { displayName: 'X' } });
  assert.strictEqual(result.success, false);
});

test('setBranding() rejects malformed brand colors instead of storing bad values', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({
    orgId: org.orgId, requestedByUserId: adminUserId,
    branding: { colors: { primary: 'not-a-color', secondary: '#abc' } },
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.branding.branding.colors.primary, null);
  assert.strictEqual(result.branding.branding.colors.secondary, '#abc');
});

test('watermarkOpacity has a safe default and rejects out-of-range values', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, branding: { watermarkOpacity: 5 } });
  assert.strictEqual(result.branding.branding.watermarkOpacity, 0.15);
});

// ── Authority ────────────────────────────────────────────────────────
test('an ordinary organization user (no branding permission) cannot modify branding', () => {
  const world = freshWorld();
  const { org } = makeOrgAndAdminRole(world);
  const memberRole = world.OrgRole.createRole({ name: 'Member', orgId: org.orgId, permissions: [] });
  world.OrgRole.assignUser(memberRole.roleId, 'user-ordinary-1');
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: 'user-ordinary-1', identity: { displayName: 'Hijacked' } });
  assert.strictEqual(result.success, false);
});

test('an authorized organization administrator (real assigned role + permission) can modify branding', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, identity: { displayName: 'Grace Church' } });
  assert.strictEqual(result.success, true);
});

test('a completely unrecognized userId is rejected, not defaulted to allowed', () => {
  const world = freshWorld();
  const { org } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: 'nobody-knows-this-user', identity: { displayName: 'X' } });
  assert.strictEqual(result.success, false);
});

test('an arbitrary client-supplied "admin" string does not grant authority', () => {
  const world = freshWorld();
  const { org } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: 'admin', identity: { displayName: 'X' } });
  assert.strictEqual(result.success, false);
});

test('platform administrator (real IdentityEngine authority) can manage any organization\'s branding', () => {
  const world = freshWorld();
  installFakeIdentity(new Set(['platform-admin-1']));
  const { org } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: 'platform-admin-1', identity: { displayName: 'Grace Church' } });
  assert.strictEqual(result.success, true);
});

test('holding an application-level role alone does not accidentally grant platform authority', () => {
  const world = freshWorld();
  // IdentityEngine loaded, but this user holds no platform-admin role.
  installFakeIdentity(new Set(['platform-admin-1']));
  const { org } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: 'some-app-developer', identity: { displayName: 'X' } });
  assert.strictEqual(result.success, false);
});

test('an organization administrator role scoped to a DIFFERENT organization cannot modify this one\'s branding', () => {
  const world = freshWorld();
  const { org: orgA } = makeOrgAndAdminRole(world, { orgName: 'Grace Church Nairobi', adminUserId: 'admin-a' });
  const orgB = world.OrgRegistry.createOrganization({ name: 'Hope Church Kisumu', type: 'Church' });
  const roleB = world.OrgRole.createRole({ name: 'Organization Administrator', orgId: orgB.orgId, permissions: ['organization:branding'] });
  world.OrgRole.assignUser(roleB.roleId, 'admin-b');
  // admin-b manages orgB fine...
  const okForOwnOrg = world.Branding.setBranding({ orgId: orgB.orgId, requestedByUserId: 'admin-b', identity: { displayName: 'Hope Church' } });
  assert.strictEqual(okForOwnOrg.success, true);
  // ...but cannot touch orgA.
  const crossOrgAttempt = world.Branding.setBranding({ orgId: orgA.orgId, requestedByUserId: 'admin-b', identity: { displayName: 'Hijacked' } });
  assert.strictEqual(crossOrgAttempt.success, false);
});

// ── Cross-organization isolation ────────────────────────────────────
test('organization A never receives organization B\'s branding metadata', () => {
  const world = freshWorld();
  const { org: orgA, adminUserId: adminA } = makeOrgAndAdminRole(world, { orgName: 'Grace Church Nairobi', adminUserId: 'admin-a2' });
  const { org: orgB, adminUserId: adminB } = makeOrgAndAdminRole(world, { orgName: 'Hope Church Kisumu', adminUserId: 'admin-b2' });
  world.Branding.setBranding({ orgId: orgA.orgId, requestedByUserId: adminA, identity: { displayName: 'Grace Church' } });
  world.Branding.setBranding({ orgId: orgB.orgId, requestedByUserId: adminB, identity: { displayName: 'Hope Church' } });
  const readA = world.Branding.getBranding(orgA.orgId, { viewerUserId: adminA });
  const readB = world.Branding.getBranding(orgB.orgId, { viewerUserId: adminB });
  assert.strictEqual(readA.identity.displayName, 'Grace Church');
  assert.strictEqual(readB.identity.displayName, 'Hope Church');
  assert.notStrictEqual(readA.orgId, readB.orgId);
});

// ── Asset (logo/watermark) security ─────────────────────────────────
test('a logo asset owned by a DIFFERENT organization is rejected, not silently accepted', () => {
  const world = freshWorld();
  const { org: orgA, adminUserId } = makeOrgAndAdminRole(world);
  const orgB = world.OrgRegistry.createOrganization({ name: 'Hope Church Kisumu' });
  installFakeMedia({ 'media_1': { id: 'media_1', type: 'organization-logo', orgId: orgB.orgId } });
  const result = world.Branding.setBranding({ orgId: orgA.orgId, requestedByUserId: adminUserId, branding: { logoAssetId: 'media_1' } });
  assert.strictEqual(result.success, true); // the call itself succeeds...
  assert.strictEqual(result.branding.branding.logoAssetId, null); // ...but the cross-org asset reference is dropped, not trusted.
});

test('a logo asset genuinely owned by this organization is accepted', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  installFakeMedia({ 'media_2': { id: 'media_2', type: 'organization-logo', orgId: org.orgId } });
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, branding: { logoAssetId: 'media_2' } });
  assert.strictEqual(result.branding.branding.logoAssetId, 'media_2');
});

test('an asset reference is refused (fail closed) when CozyMedia is not loaded at all', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  // No installFakeMedia() call — CozyMedia genuinely absent.
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, branding: { watermarkAssetId: 'media_should_not_apply' } });
  assert.strictEqual(result.branding.branding.watermarkAssetId, null);
});

test('a nonexistent assetId is refused rather than stored as-is', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  installFakeMedia({});
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, branding: { logoAssetId: 'media_ghost' } });
  assert.strictEqual(result.branding.branding.logoAssetId, null);
});

// ── Privacy ──────────────────────────────────────────────────────────
test('an unauthorized/ordinary viewer never receives full address, postal code, or contact details', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  world.Branding.setBranding({
    orgId: org.orgId, requestedByUserId: adminUserId,
    identity: { displayName: 'Grace Church' },
    address: { line1: '12 Ngong Rd', city: 'Nairobi', region: 'Nairobi County', country: 'Kenya', postalCode: '00100' },
    contact: { email: 'private@grace.example', phone: '+254700000000', website: 'https://grace.example' },
  });
  const publicView = world.Branding.getBranding(org.orgId); // no viewerUserId at all — ordinary/public viewer
  assert.strictEqual(publicView.address, undefined);
  assert.strictEqual(publicView.contact, undefined);
  assert.strictEqual(publicView.location.city, 'Nairobi');
  assert.strictEqual(publicView.website, 'https://grace.example');
});

test('an authorized organization member DOES receive the full address and contact details', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  world.Branding.setBranding({
    orgId: org.orgId, requestedByUserId: adminUserId,
    address: { line1: '12 Ngong Rd', city: 'Nairobi', country: 'Kenya', postalCode: '00100' },
    contact: { email: 'private@grace.example' },
  });
  const privileged = world.Branding.getBranding(org.orgId, { viewerUserId: adminUserId });
  assert.strictEqual(privileged.address.line1, '12 Ngong Rd');
  assert.strictEqual(privileged.contact.email, 'private@grace.example');
});

// ── Dashboard consumption safety ────────────────────────────────────
test('dashboard-style consumption does not crash when organization has no branding at all', () => {
  const world = freshWorld();
  const { org } = makeOrgAndAdminRole(world);
  const branding = world.Branding.getBranding(org.orgId);
  // Simulates the honest empty-state the dashboard must render.
  const displayLogo = branding && branding.branding.logoAssetId ? branding.branding.logoAssetId : null;
  assert.strictEqual(branding, null);
  assert.strictEqual(displayLogo, null);
});

test('dashboard-style consumption does not crash when logo/watermark/location are individually absent', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, identity: { displayName: 'Grace Church' } });
  const branding = world.Branding.getBranding(org.orgId);
  assert.strictEqual(branding.branding.logoAssetId, null);
  assert.strictEqual(branding.branding.watermarkAssetId, null);
  assert.strictEqual(branding.location.city, null);
});

// ── Applications: generic, not ChurchOS-only ────────────────────────
test('the same branding engine serves unrelated application-style organizations without hardcoding', () => {
  const world = freshWorld();
  const { org: shop, adminUserId: shopAdmin } = makeOrgAndAdminRole(world, { orgName: 'Example Shop', adminUserId: 'shop-admin-1' });
  const result = world.Branding.setBranding({
    orgId: shop.orgId, requestedByUserId: shopAdmin,
    identity: { displayName: 'Example Shop', description: 'A retail shop, not a church.' },
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.branding.identity.displayName, 'Example Shop');
});

// ── Malformed / absent metadata safety ───────────────────────────────
test('setBranding() with no optional fields at all still produces safe defaults, not a crash', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.branding.identity.displayName, null);
  assert.strictEqual(result.branding.branding.watermarkOpacity, 0.15);
});

test('malformed nested input (non-object identity/address/contact) is sanitized, not thrown', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  const result = world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, identity: 'not-an-object', address: 42, contact: null });
  assert.strictEqual(result.success, true);
});

test('__proto__ / constructor keys in nested input are stripped, not merged into the record', () => {
  const world = freshWorld();
  const { org, adminUserId } = makeOrgAndAdminRole(world);
  const malicious = JSON.parse('{"identity": {"displayName": "X", "__proto__": {"polluted": true}}}');
  world.Branding.setBranding({ orgId: org.orgId, requestedByUserId: adminUserId, ...malicious });
  assert.strictEqual(({}).polluted, undefined);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
