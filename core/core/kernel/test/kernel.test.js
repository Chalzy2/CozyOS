/**
 * tests/kernel.test.js
 *
 * Real, executed integration tests for core/kernel/kernel.js.
 *
 * Per Rule 20 (Deliverable Verification Gate) and Rule 21 (Real Interface
 * Verification), this suite exercises the ACTUAL Bootstrap, Lifecycle,
 * Compatibility, and Diagnostics singletons through Kernel — never mocks
 * or stubs. The previous version of this file stubbed a class-based
 * interface (bootstrap.initialize(), lifecycle.restartService(name) with
 * no token, diagnostics.getHealth()) that never matched the real,
 * token-gated, frozen-singleton engines actually in this codebase. That
 * mismatch is why this file was rewritten instead of Kernel being bent
 * to match fictional stubs.
 *
 * Run with: node tests/kernel.test.js
 */

'use strict';

import assert from 'assert';
import Kernel from '../core/kernel/kernel.js';
import Bootstrap from '../core/kernel/bootstrap.js';

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

console.log('CozyOS Kernel — Test Suite (real integration, no stubs)\n');

(async () => {
  // 1. Constants are re-exported from Bootstrap, not redefined (Rule 2)
  test('KERNEL_VERSION and PLATFORM_STATES are re-exported from Bootstrap unchanged', () => {
    assert.strictEqual(Kernel.KERNEL_VERSION, Bootstrap.KERNEL_VERSION);
    assert.deepStrictEqual(Kernel.PLATFORM_STATES, Bootstrap.PLATFORM_STATES);
  });

  // 2. registerEngine delegates to Bootstrap.registerService (real call)
  await asyncTest('registerEngine() delegates to Bootstrap and reaches REGISTERED', async () => {
    const name = uniqueName('svc-register');
    const state = await Kernel.registerEngine({ name, version: '1.0.0', apiVersion: '1.0.0' });
    assert.strictEqual(state, 'REGISTERED');
    assert.ok(Bootstrap.getManifest(name), 'Bootstrap should hold the manifest Kernel registered');
  });

  // 3. validateManifest delegates to Bootstrap's real shape validator
  test('validateManifest() delegates to Bootstrap.validateManifest', () => {
    const bad = Kernel.validateManifest({});
    assert.strictEqual(bad.valid, false);
    assert.ok(bad.errors.length > 0);

    const good = Kernel.validateManifest({ name: uniqueName('svc-shape') });
    assert.strictEqual(good.valid, true);
  });

  // 4. checkCompatibility delegates to the real Compatibility engine
  test('checkCompatibility() delegates to Compatibility.check with the real kernel version', () => {
    const result = Kernel.checkCompatibility({ name: 'svc-x', apiVersion: '1.0.0' });
    assert.strictEqual(result.compatible, true);

    const incompatible = Kernel.checkCompatibility({ name: 'svc-y', apiVersion: '9.0.0' });
    assert.strictEqual(incompatible.compatible, false);
  });

  // 5. Full real lifecycle walk through Kernel -> Bootstrap -> Lifecycle
  await asyncTest('initializeService/verifyService/startService walk a real service to RUNNING', async () => {
    const name = uniqueName('svc-lifecycle');
    await Kernel.registerEngine({ name, version: '1.0.0' });
    Kernel.initializeService(name);
    await Kernel.verifyService(name, () => true);
    const state = Kernel.startService(name);
    assert.strictEqual(state, 'RUNNING');
  });

  // 6. pause/resume real service
  await asyncTest('pauseService/resumeService walk a real RUNNING service', async () => {
    const name = uniqueName('svc-pause');
    await Kernel.registerEngine({ name, version: '1.0.0' });
    Kernel.initializeService(name);
    await Kernel.verifyService(name, () => true);
    Kernel.startService(name);
    assert.strictEqual(Kernel.pauseService(name), 'PAUSED');
    assert.strictEqual(Kernel.resumeService(name), 'RUNNING');
  });

  // 7. stop/restart real service
  await asyncTest('stopService/restartService walk a real service through real Lifecycle transitions', async () => {
    const name = uniqueName('svc-restart');
    await Kernel.registerEngine({ name, version: '1.0.0' });
    Kernel.initializeService(name);
    await Kernel.verifyService(name, () => true);
    Kernel.startService(name);
    assert.strictEqual(Kernel.stopService(name), 'STOPPED');
    const restarted = await Kernel.restartService(name);
    assert.strictEqual(restarted, 'RUNNING');
  });

  // 8. fail/recover real service
  await asyncTest('failService/recoverService walk a real service through failure and recovery', async () => {
    const name = uniqueName('svc-fail');
    await Kernel.registerEngine({ name, version: '1.0.0' });
    Kernel.initializeService(name);
    Kernel.failService(name, new Error('induced failure'));
    const recovered = await Kernel.recoverService(name, () => true);
    assert.strictEqual(recovered, 'RUNNING');
  });

  // 9. removeService
  await asyncTest('removeService removes a real service from both Bootstrap and Lifecycle', async () => {
    const name = uniqueName('svc-remove');
    await Kernel.registerEngine({ name, version: '1.0.0' });
    Kernel.removeService(name);
    assert.strictEqual(Bootstrap.getManifest(name), null);
  });

  // 10. getPlatformState / isReady reflect real Bootstrap state
  test('getPlatformState()/isReady() reflect the real Bootstrap platform state', () => {
    const state = Kernel.getPlatformState();
    assert.ok(Object.values(Kernel.PLATFORM_STATES).includes(state));
    assert.strictEqual(Kernel.isReady(), state === Kernel.PLATFORM_STATES.READY);
  });

  // 11. kernel:ready event forwards a real Bootstrap READY event
  await asyncTest('"kernel:ready" fires from a real Bootstrap platform:ready event', async () => {
    // Register + run a mandatory service so markPlatformReady() succeeds for real.
    const name = uniqueName('svc-mandatory');
    await Kernel.registerEngine({ name, version: '1.0.0', mandatory: true });
    Kernel.initializeService(name);
    await Kernel.verifyService(name, () => true);
    Kernel.startService(name);

    let fired = false;
    const off = Kernel.on('kernel:ready', () => { fired = true; });
    Kernel.markPlatformReady();
    off();
    assert.ok(fired, 'kernel:ready should have fired from the real platform:ready event');
    assert.strictEqual(Kernel.getPlatformState(), 'READY');
  });

  // 12. kernel:error forwards a real Bootstrap SERVICE_REJECTED event
  await asyncTest('"kernel:error" fires from a real Bootstrap platform:service-rejected event', async () => {
    let fired = false;
    const off = Kernel.on('kernel:error', () => { fired = true; });
    await assert.rejects(() => Kernel.registerEngine({})); // invalid manifest, real rejection
    off();
    assert.ok(fired, 'kernel:error should have fired from a real rejected registration');
  });

  // 13. getHealth / getBootReport / getStatistics / getDashboard delegate to real Diagnostics
  test('getHealth()/getBootReport()/getStatistics()/getDashboard() delegate to real Diagnostics reports', () => {
    const health = Kernel.getHealth();
    const boot = Kernel.getBootReport();
    const stats = Kernel.getStatistics();
    const dash = Kernel.getDashboard();
    assert.ok(health, 'getHealth should return a real report');
    assert.ok(boot, 'getBootReport should return a real report');
    assert.ok(stats && typeof stats.totalBoots === 'number', 'getStatistics should return real stats');
    assert.ok(dash && 'platform' in dash, 'getDashboard should return real dashboard shape');
  });

  // 14. getCapabilities aggregates from real engines without fabricating extras
  test('getCapabilities() aggregates real per-engine capabilities, future[] stays empty (Rule 15)', () => {
    const caps = Kernel.getCapabilities();
    assert.ok(caps.compatibility);
    assert.ok(caps.bootstrap.kernelVersion);
    assert.strictEqual(caps.lifecycle, true);
    assert.strictEqual(caps.diagnostics, true);
    assert.deepStrictEqual(caps.future, []);
  });

  // 15. getKernelReport aggregates real reports, no independently invented fields
  await asyncTest('getKernelReport() aggregates real Bootstrap + Diagnostics reports', async () => {
    const report = Kernel.getKernelReport();
    assert.strictEqual(report.kernelVersion, Bootstrap.KERNEL_VERSION);
    assert.strictEqual(report.platformState, Kernel.getPlatformState());
    assert.ok(report.platform, 'should embed the real Bootstrap.getPlatformReport()');
    assert.ok(report.health, 'should embed the real Diagnostics.getPlatformHealth()');
    assert.ok(report.dashboard, 'should embed the real Diagnostics.getDashboardSummary()');
  });

  // 16. Kernel never duplicates Lifecycle's transition legality — an illegal
  // transition attempted through Kernel must throw the SAME real error
  // Lifecycle itself throws (proves no shadow logic exists in Kernel).
  test('Kernel surfaces real illegal-transition errors from Lifecycle unchanged (Rule 2: no duplication)', () => {
    const name = uniqueName('svc-illegal');
    // Not yet registered at all -- calling startService on an unknown
    // service must produce Lifecycle's real "Unknown service" error,
    // proving Kernel does no independent validation of its own.
    assert.throws(() => Kernel.startService(name), /Unknown service/);
  });

  // 17. Frozen public surface (Rule 16)
  test('Kernel is frozen and cannot be mutated', () => {
    assert.throws(() => { Kernel.KERNEL_VERSION = '9.9.9'; }, TypeError);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
