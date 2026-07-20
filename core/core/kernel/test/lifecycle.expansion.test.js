/**
 * core/core/kernel/test/lifecycle.expansion.test.js
 *
 * Real, executed regression tests for the Platform Lifecycle Ownership
 * Expansion of core/core/kernel/lifecycle.js (Constitution v7 —
 * "Lifecycle Ownership Rule"). Exercises the ACTUAL LifecycleEngine
 * singleton directly — no mocks or stubs — covering:
 *   1. Backward compatibility: existing service API is byte-for-byte
 *      unchanged in behavior.
 *   2. The new generic acceptComponent()/COMPONENT_KINDS surface.
 *   3. Kind-scoped vs. all-kind reporting (getLifecycleReport vs.
 *      getPlatformComponentsReport).
 *   4. The optional PluginManager bridge, using a real CustomEvent on a
 *      minimal DOM shim (no window in Node, so a shim is provided) —
 *      the bridge code path itself is exercised for real, not mocked.
 *
 * Run with: node core/core/kernel/test/lifecycle.expansion.test.js
 */

'use strict';

import assert from 'assert';
import Lifecycle from '../lifecycle.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.message}`);
    failed++;
  }
}

function uniqueName(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

console.log('CozyOS Lifecycle Engine — Ownership Expansion Test Suite (real, no stubs)\n');

// A single shared Bootstrap-style token for this test run, exactly the
// way the real Bootstrap owns and uses one.
const testToken = { owner: 'test-bootstrap' };
Lifecycle.setBootstrapToken(testToken);

(async () => {
  // 1. Old acceptRegisteredService() call site is completely unaffected.
  await asyncTest('acceptRegisteredService() still registers a plain service exactly as before', async () => {
    const name = uniqueName('svc');
    const state = Lifecycle.acceptRegisteredService(testToken, { name, version: '1.0.0' });
    assert.strictEqual(state, 'REGISTERED');
    const report = Lifecycle.getLifecycleReport(name);
    assert.strictEqual(report.kind, 'service', 'default kind for old API must be service');
  });

  // 2. Old service walk to RUNNING still works unchanged.
  await asyncTest('service walk to RUNNING via existing functions is unaffected', async () => {
    const name = uniqueName('svc-walk');
    Lifecycle.acceptRegisteredService(testToken, { name, version: '1.0.0' });
    Lifecycle.initializeService(testToken, name);
    await Lifecycle.verifyService(testToken, name, () => true);
    const state = Lifecycle.startService(testToken, name);
    assert.strictEqual(state, 'RUNNING');
  });

  // 3. getLifecycleReport() with no args stays SERVICE-ONLY (Bootstrap's
  //    getPlatformReport() depends on this exact behavior).
  await asyncTest('getLifecycleReport() with no args returns service-kind entries only', async () => {
    const svcName = uniqueName('svc-only');
    const themeName = uniqueName('theme-only');
    Lifecycle.acceptRegisteredService(testToken, { name: svcName, version: '1.0.0' });
    Lifecycle.acceptComponent(testToken, Lifecycle.COMPONENT_KINDS.THEME, { name: themeName, version: '1.0.0' });

    const allDefault = Lifecycle.getLifecycleReport();
    const names = allDefault.map((r) => r.serviceName);
    assert.ok(names.includes(svcName), 'service must appear in default (service-scoped) report');
    assert.ok(!names.includes(themeName), 'theme must NOT appear in default service-scoped report');
  });

  // 4. New generic acceptComponent() + COMPONENT_KINDS works for a
  //    non-service kind and is queryable by kind.
  test('acceptComponent() registers a non-service component and tags it with kind', () => {
    const name = uniqueName('app');
    const state = Lifecycle.acceptComponent(testToken, Lifecycle.COMPONENT_KINDS.APPLICATION, { name, version: '2.0.0' });
    assert.strictEqual(state, 'REGISTERED');
    const report = Lifecycle.getLifecycleReport(name);
    assert.strictEqual(report.kind, 'application');
    assert.ok(Lifecycle.getComponentsByKind('application').includes(name));
  });

  // 5. Invalid kind is rejected, not silently accepted.
  test('acceptComponent() rejects an unknown kind', () => {
    assert.throws(
      () => Lifecycle.acceptComponent(testToken, 'not-a-real-kind', { name: uniqueName('bad') }),
      /Unknown component kind/
    );
  });

  // 6. getPlatformComponentsReport(null) returns ALL kinds; a kind filter
  //    narrows it correctly.
  test('getPlatformComponentsReport() aggregates across all kinds, or filters by one', () => {
    const svcName = uniqueName('svc-multi');
    const modName = uniqueName('mod-multi');
    Lifecycle.acceptRegisteredService(testToken, { name: svcName, version: '1.0.0' });
    Lifecycle.acceptComponent(testToken, Lifecycle.COMPONENT_KINDS.MODULE, { name: modName, version: '1.0.0' });

    const all = Lifecycle.getPlatformComponentsReport();
    const allNames = all.map((r) => r.serviceName);
    assert.ok(allNames.includes(svcName) && allNames.includes(modName), 'unfiltered report must include every kind');

    const modulesOnly = Lifecycle.getPlatformComponentsReport('module');
    assert.ok(modulesOnly.every((r) => r.kind === 'module'), 'kind-filtered report must contain only that kind');
    assert.ok(modulesOnly.map((r) => r.serviceName).includes(modName));
  });

  // 7. Existing state-machine legality is untouched — an illegal jump for
  //    a NON-service kind is rejected exactly like it is for services.
  test('illegal transitions are rejected identically regardless of kind (single state machine)', () => {
    const name = uniqueName('engine-illegal');
    Lifecycle.acceptComponent(testToken, Lifecycle.COMPONENT_KINDS.ENGINE, { name, version: '1.0.0' });
    // REGISTERED -> RUNNING directly is illegal for every kind.
    assert.throws(() => Lifecycle.startService(testToken, name), /Illegal transition/);
  });

  // 8. getComponentsByState() generalizes getRunningServices() etc.
  //    across kinds, while the legacy functions stay service-scoped.
  await asyncTest('getComponentsByState() covers all kinds; getRunningServices() stays service-only', async () => {
    const svcName = uniqueName('svc-running');
    const coordName = uniqueName('coord-running');

    Lifecycle.acceptRegisteredService(testToken, { name: svcName, version: '1.0.0' });
    Lifecycle.initializeService(testToken, svcName);
    await Lifecycle.verifyService(testToken, svcName, () => true);
    Lifecycle.startService(testToken, svcName);

    Lifecycle.acceptComponent(testToken, Lifecycle.COMPONENT_KINDS.COORDINATOR, { name: coordName, version: '1.0.0' });
    Lifecycle.initializeService(testToken, coordName);
    await Lifecycle.verifyService(testToken, coordName, () => true);
    Lifecycle.startService(testToken, coordName);

    const runningServices = Lifecycle.getRunningServices();
    assert.ok(runningServices.includes(svcName));
    assert.ok(!runningServices.includes(coordName), 'legacy getRunningServices() must stay service-scoped');

    const allRunning = Lifecycle.getComponentsByState('RUNNING', null);
    assert.ok(allRunning.includes(svcName) && allRunning.includes(coordName));
  });

  // 9. Plugin bridge: attach against a minimal window/CustomEvent shim,
  //    dispatch REAL events matching PluginManager's exact shape, and
  //    verify the mirrored Lifecycle state — no mocking of Lifecycle
  //    itself, only a DOM shim since this is a Node test environment.
  await asyncTest('bridgePluginManagerEvents() mirrors real cozyos:plugin:* events into Lifecycle state', async () => {
    installWindowShim();
    try {
      Lifecycle.bridgePluginManagerEvents(testToken);

      const pluginId = uniqueName('plugin');
      dispatch('install', { pluginId, name: pluginId, version: '1.0.0' });
      assert.strictEqual(Lifecycle.getServiceState(pluginId), 'REGISTERED');

      dispatch('enable', { pluginId, name: pluginId });
      // Bridge walk is synchronous except for one await inside verify —
      // yield a tick so it completes.
      await new Promise((r) => setTimeout(r, 0));
      assert.strictEqual(Lifecycle.getServiceState(pluginId), 'RUNNING');

      dispatch('disable', { pluginId, name: pluginId });
      await new Promise((r) => setTimeout(r, 0));
      assert.strictEqual(Lifecycle.getServiceState(pluginId), 'PAUSED');

      const report = Lifecycle.getLifecycleReport(pluginId);
      assert.strictEqual(report.kind, 'plugin');
    } finally {
      Lifecycle.unbridgePluginManagerEvents();
      removeWindowShim();
    }
  });

  // 10. Frozen surface still cannot be mutated, and new members exist.
  test('LifecycleEngine remains frozen and exposes the new generalized surface', () => {
    assert.throws(() => { Lifecycle.STATES = {}; }, TypeError);
    assert.strictEqual(typeof Lifecycle.acceptComponent, 'function');
    assert.strictEqual(typeof Lifecycle.getPlatformComponentsReport, 'function');
    assert.strictEqual(typeof Lifecycle.getComponentsByKind, 'function');
    assert.strictEqual(typeof Lifecycle.getComponentsByState, 'function');
    assert.strictEqual(typeof Lifecycle.bridgePluginManagerEvents, 'function');
    assert.ok(Lifecycle.COMPONENT_KINDS.APPLICATION);
    assert.ok(Lifecycle.COMPONENT_KINDS.THEME);
    assert.ok(Lifecycle.COMPONENT_KINDS.AI_PROVIDER);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
})();

// -----------------------------------------------------------------------------
// Minimal window/CustomEvent shim (Node has no DOM) — only what
// bridgePluginManagerEvents() actually touches: addEventListener,
// removeEventListener, dispatchEvent, and a CustomEvent with `.detail`.
// -----------------------------------------------------------------------------

function installWindowShim() {
  const listeners = new Map();
  global.__lifecycleTestListeners = listeners;
  global.window = {
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) {
      listeners.get(name)?.delete(fn);
    },
    dispatchEvent(evt) {
      const set = listeners.get(evt.type);
      if (!set) return;
      for (const fn of set) fn(evt);
    }
  };
  global.CustomEvent = class CustomEvent {
    constructor(type, opts = {}) {
      this.type = type;
      this.detail = opts.detail;
    }
  };
}

function removeWindowShim() {
  delete global.window;
  delete global.CustomEvent;
  delete global.__lifecycleTestListeners;
}

function dispatch(pluginEventName, detail) {
  global.window.dispatchEvent(new CustomEvent(`cozyos:plugin:${pluginEventName}`, { detail }));
}
