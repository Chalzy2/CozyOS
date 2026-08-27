/**
 * tests/camera-manager.test.js
 *
 * Real, executed tests for core/engines/camera/camera-manager.js.
 * Exercises the actual orchestration logic against the reference in-memory
 * provider (provider-inmemory.js) and, for the Kernel-registration case,
 * the real Kernel singleton — no stubs standing in for CameraManager's own
 * logic (Rule 20).
 *
 * Run with: node tests/camera-manager.test.js
 */

'use strict';

import assert from 'assert';
import CameraManager from '../core/engines/camera/camera-manager.js';
import { createInMemoryCameraProvider } from '../core/engines/camera/provider-inmemory.js';
import Kernel from '../core/kernel/kernel.js';

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

console.log('CozyOS Camera Manager — Test Suite (real integration, reference provider)\n');

(async () => {
  // 1. Provider registration validates shape
  test('registerProvider() rejects an adapter missing required methods', () => {
    CameraManager.__resetForTests();
    assert.throws(() => CameraManager.registerProvider({ type: 'broken' }), /missing required method/);
  });

  test('registerProvider() accepts a valid adapter', () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    assert.strictEqual(CameraManager.registerProvider(provider), true);
    assert.deepStrictEqual(CameraManager.listProviders(), ['usb']);
  });

  // 2. Detection reports exactly what the provider returns — nothing invented
  await asyncTest('detectCameras() returns exactly the devices the provider reports', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Logitech Brio', metadata: { res: '4k' } });
    CameraManager.registerProvider(provider);
    const detected = await CameraManager.detectCameras();
    assert.strictEqual(detected.length, 1);
    assert.strictEqual(detected[0].externalId, 'usb-1');
    assert.strictEqual(detected[0].providerType, 'usb');
  });

  // 3. Registration
  await asyncTest('registerCamera() moves a detected device into the managed registry', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Logitech Brio' });
    CameraManager.registerProvider(provider);
    await CameraManager.detectCameras();
    const cam = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1', name: 'Front Camera' });
    assert.strictEqual(cam.state, 'REGISTERED');
    assert.strictEqual(CameraManager.listCameras().length, 1);
  });

  test('registerCamera() rejects unknown provider types', () => {
    CameraManager.__resetForTests();
    assert.throws(
      () => CameraManager.registerCamera({ providerType: 'nonexistent', externalId: 'x' }),
      /no provider for type/
    );
  });

  test('registerCamera() rejects duplicate registration of the same device', () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Cam' });
    CameraManager.registerProvider(provider);
    CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1' });
    assert.throws(
      () => CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1' }),
      /already registered/
    );
  });

  // 4. Connect / preview / switch
  await asyncTest('connectCamera() transitions REGISTERED -> CONNECTED and yields a real provider streamHandle', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Cam' });
    CameraManager.registerProvider(provider);
    const cam = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1' });
    const connected = await CameraManager.connectCamera(cam.id);
    assert.strictEqual(connected.state, 'CONNECTED');
    const handle = CameraManager.previewCamera(cam.id);
    assert.strictEqual(handle.externalId, 'usb-1');
  });

  await asyncTest('switchActiveCamera() requires CONNECTED and updates getActiveCamera()', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Cam A' });
    provider._simulateDeviceAdded({ externalId: 'usb-2', name: 'Cam B' });
    CameraManager.registerProvider(provider);
    const camA = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1' });
    const camB = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-2' });

    assert.throws(() => CameraManager.switchActiveCamera(camA.id), /not CONNECTED/);

    await CameraManager.connectCamera(camA.id);
    await CameraManager.connectCamera(camB.id);
    CameraManager.switchActiveCamera(camA.id);
    assert.strictEqual(CameraManager.getActiveCamera().id, camA.id);
    CameraManager.switchActiveCamera(camB.id);
    assert.strictEqual(CameraManager.getActiveCamera().id, camB.id);
    assert.strictEqual(CameraManager.getCamera(camA.id).isActive, false);
  });

  // 5. Disconnect clears active pointer
  await asyncTest('disconnectCamera() on the active camera clears getActiveCamera()', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Cam' });
    CameraManager.registerProvider(provider);
    const cam = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1' });
    await CameraManager.connectCamera(cam.id);
    CameraManager.switchActiveCamera(cam.id);
    await CameraManager.disconnectCamera(cam.id);
    assert.strictEqual(CameraManager.getActiveCamera(), null);
    assert.strictEqual(CameraManager.getCamera(cam.id).state, 'DISCONNECTED');
  });

  // 6. Connect failure -> ERROR state (real thrown error, not swallowed)
  await asyncTest('connectCamera() on an unhealthy device transitions to ERROR and rethrows', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Cam' });
    provider._simulateUnhealthy('usb-1');
    CameraManager.registerProvider(provider);
    const cam = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1' });
    await assert.rejects(() => CameraManager.connectCamera(cam.id), /unhealthy/);
    assert.strictEqual(CameraManager.getCamera(cam.id).state, 'ERROR');
  });

  // 7. Illegal transitions rejected by the real state machine
  test('previewCamera() on a non-CONNECTED camera throws instead of returning fabricated data', () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Cam' });
    CameraManager.registerProvider(provider);
    const cam = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1' });
    assert.throws(() => CameraManager.previewCamera(cam.id), /not CONNECTED/);
  });

  // 8. PTZ
  await asyncTest('sendPTZCommand() works for a PTZ-capable connected camera and rejects for a non-PTZ camera', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('ptz');
    provider._simulateDeviceAdded({ externalId: 'ptz-1', name: 'PTZ Cam', ptzCapable: true });
    provider._simulateDeviceAdded({ externalId: 'fixed-1', name: 'Fixed Cam', ptzCapable: false });
    CameraManager.registerProvider(provider);

    const ptzCam = CameraManager.registerCamera({ providerType: 'ptz', externalId: 'ptz-1', ptzCapable: true });
    const fixedCam = CameraManager.registerCamera({ providerType: 'ptz', externalId: 'fixed-1', ptzCapable: false });
    await CameraManager.connectCamera(ptzCam.id);
    await CameraManager.connectCamera(fixedCam.id);

    await CameraManager.sendPTZCommand(ptzCam.id, { pan: 10, tilt: 0, zoom: 1 });
    await assert.rejects(() => CameraManager.sendPTZCommand(fixedCam.id, { pan: 1 }), /not PTZ-capable/);
  });

  // 9. Health monitoring
  await asyncTest('checkCameraHealth()/checkAllHealth() reflect real provider health, degrading state on fault', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Cam' });
    CameraManager.registerProvider(provider);
    const cam = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1' });
    await CameraManager.connectCamera(cam.id);

    let health = await CameraManager.checkCameraHealth(cam.id);
    assert.strictEqual(health.ok, true);

    provider._simulateUnhealthy('usb-1', 'Sensor overheated');
    health = await CameraManager.checkCameraHealth(cam.id);
    assert.strictEqual(health.ok, false);
    assert.strictEqual(CameraManager.getCamera(cam.id).state, 'ERROR');

    const all = await CameraManager.checkAllHealth();
    assert.strictEqual(all.length, 1);
  });

  // 10. Hot-plug
  await asyncTest('hot-plug add/remove emits real events and auto-disconnects a removed connected camera', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    CameraManager.registerProvider(provider);

    let added = null;
    CameraManager.on(CameraManager.EVENTS.HOTPLUG_ADDED, (payload) => { added = payload; });
    provider._simulateDeviceAdded({ externalId: 'usb-hotplug', name: 'Hotplug Cam' });
    assert.ok(added && added.device.externalId === 'usb-hotplug');

    const cam = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-hotplug' });
    await CameraManager.connectCamera(cam.id);

    let disconnected = false;
    CameraManager.on(CameraManager.EVENTS.DISCONNECTED, () => { disconnected = true; });
    provider._simulateDeviceRemoved('usb-hotplug');
    assert.strictEqual(CameraManager.getCamera(cam.id).state, 'DISCONNECTED');
    assert.ok(disconnected);
  });

  // 11. removeCamera cleans up an active, connected camera safely
  await asyncTest('removeCamera() disconnects first if connected and clears active pointer', async () => {
    CameraManager.__resetForTests();
    const provider = createInMemoryCameraProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'usb-1', name: 'Cam' });
    CameraManager.registerProvider(provider);
    const cam = CameraManager.registerCamera({ providerType: 'usb', externalId: 'usb-1' });
    await CameraManager.connectCamera(cam.id);
    CameraManager.switchActiveCamera(cam.id);
    await CameraManager.removeCamera(cam.id);
    assert.strictEqual(CameraManager.getActiveCamera(), null);
    assert.throws(() => CameraManager.getCamera(cam.id), /Unknown camera/);
  });

  // 12. Kernel integration — real registration against the real Kernel singleton
  await asyncTest('registerWithKernel() registers Camera Manager as a real platform service', async () => {
    CameraManager.__resetForTests();
    const state = await CameraManager.registerWithKernel(Kernel);
    assert.strictEqual(state, 'REGISTERED');
  });

  // 13. Frozen public surface
  test('CameraManager is frozen and cannot be mutated', () => {
    assert.throws(() => { CameraManager.CAMERA_STATES = {}; }, TypeError);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
