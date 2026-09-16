'use strict';

/**
 * core/modules/tests/application-destination-repairs.test.js
 *
 * Level 2B — repairs three applications that Level 2B's own capability
 * audit found BLOCKED (no real, resolvable launch destination):
 * PharmacyOS, WholesaleOS, ChurchOS (business-app entry, distinct from
 * the already-working Live Worship capability).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

function loadPluginCapturingRegistration(pluginRelPath) {
  const full = path.join(REPO_ROOT, pluginRelPath);
  delete require.cache[require.resolve(full)];
  const calls = { registerApplication: [] };
  global.window = {
    CozyOS: {
      ServiceRegistry: {
        registerApplication(manifest) { calls.registerApplication.push(manifest); },
        registerCoordinator() {},
      },
      OrganizationRegistry: { createOrganization: () => ({ orgId: 'org_test' }), organizationExists: () => true },
      IdentityEngine: {},
    },
  };
  global.document = { addEventListener() {} };
  require(full);
  return calls;
}

// ---------------------------------------------------------------
// PharmacyOS
// ---------------------------------------------------------------

test('PHARMACYOS: registerApplication now includes a real entryPoint (was missing before the Level 2B repair)', () => {
  const calls = loadPluginCapturingRegistration('core/plugins/pharmacyOS-core.js');
  assert.equal(calls.registerApplication.length, 1);
  const manifest = calls.registerApplication[0];
  assert.equal(manifest.id, 'pharmacyos_core_001');
  assert.equal(manifest.entryPoint, 'applications/PharmacyOS/pharmacyos.html');
});

test('PHARMACYOS: the real entry point file exists on disk and is a real standalone document (real <head>, so ApplicationLauncher mounts it via the real iframe path, not fragment injection which would never execute its script tags)', () => {
  const full = path.join(REPO_ROOT, 'applications/PharmacyOS/pharmacyos.html');
  assert.ok(fs.existsSync(full));
  const html = fs.readFileSync(full, 'utf8');
  assert.match(html, /<head[\s>]/i);
  // The real, pre-existing Phase 1 UI/logic must be untouched — same ids.
  assert.match(html, /id="ph-setup-btn"/);
  assert.match(html, /window\.CozyOS\.PharmacyOS/);
});

// ---------------------------------------------------------------
// WholesaleOS
// ---------------------------------------------------------------

test('WHOLESALEOS: registerApplication now includes a real entryPoint (no destination existed at all before the Level 2B repair)', () => {
  const calls = loadPluginCapturingRegistration('core/plugins/wholesaleOS-core.js');
  assert.equal(calls.registerApplication.length, 1);
  const manifest = calls.registerApplication[0];
  assert.equal(manifest.id, 'wholesaleos_core_001');
  assert.equal(manifest.entryPoint, 'applications/WholesaleOS/wholesaleos.html');
});

test('WHOLESALEOS: the new minimal destination only calls the real, existing getSharedCatalog() — no fabricated capability (no wholesaler directory, chat, receipts, etc.)', () => {
  const full = path.join(REPO_ROOT, 'applications/WholesaleOS/wholesaleos.html');
  assert.ok(fs.existsSync(full));
  const html = fs.readFileSync(full, 'utf8');
  assert.match(html, /<head[\s>]/i);
  assert.match(html, /window\.CozyOS\.WholesaleOS/);
  assert.match(html, /getSharedCatalog/);
  // The disclosure comment at the top of the file may legitimately name
  // not-yet-built capabilities (to explain what was deliberately left
  // out) — what must never appear is an actual functional call to any
  // WholesaleOS method other than the one real, implemented
  // getSharedCatalog().
  const wholesaleMethodCalls = [...html.matchAll(/wholesale\.(\w+)\(/g)].map(m => m[1]);
  assert.deepEqual(new Set(wholesaleMethodCalls), new Set(['getSharedCatalog']));
});

// ---------------------------------------------------------------
// ChurchOS (business-app entry)
// ---------------------------------------------------------------

test('CHURCHOS: registerApplication now includes a real entryPoint (no business-app destination existed before the Level 2B repair)', () => {
  const calls = loadPluginCapturingRegistration('core/plugins/churchOS-core.js');
  assert.equal(calls.registerApplication.length, 1);
  const manifest = calls.registerApplication[0];
  assert.equal(manifest.id, 'churchos_core_001');
  assert.equal(manifest.entryPoint, 'applications/ChurchOS/churchos.html');
});

test('CHURCHOS: the new destination is the real Setup Wizard/Membership capability, never a substitute for Live Worship', () => {
  const full = path.join(REPO_ROOT, 'applications/ChurchOS/churchos.html');
  assert.ok(fs.existsSync(full));
  const html = fs.readFileSync(full, 'utf8');
  assert.match(html, /<head[\s>]/i);
  assert.match(html, /window\.CozyOS\.ChurchOS/);
  assert.match(html, /setupChurch/);
  assert.match(html, /createMember/);
  // Must not pull in or reference the separate Living Worship Player.
  assert.doesNotMatch(html, /LivingWorshipPlayer/);
  assert.doesNotMatch(html, /LiveViewController/);
});

// ---------------------------------------------------------------
// ModuleRegistry wiring (Mode 2 launch path for all three)
// ---------------------------------------------------------------

test('MODULE REGISTRY: all three repaired applications are registered under their real, canonical ServiceRegistry ids with real, on-disk html files', () => {
  delete require.cache[require.resolve(path.join(REPO_ROOT, 'core/modules/module-registry.js'))];
  const calls = { register: [] };
  global.window = {
    CozyOS: {
      ModuleRegistry: undefined,
    },
    addEventListener() {},
  };
  require(path.join(REPO_ROOT, 'core/modules/module-registry.js'));
  const registry = global.window.CozyOS.ModuleRegistry;
  for (const id of ['pharmacyos_core_001', 'wholesaleos_core_001', 'churchos_core_001']) {
    const manifest = registry.get(id);
    assert.ok(manifest, `expected a real ModuleRegistry entry for "${id}"`);
    assert.ok(fs.existsSync(path.join(REPO_ROOT, manifest.html)), `manifest.html for "${id}" must exist on disk: ${manifest.html}`);
  }
});
