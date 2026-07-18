/**
 * tests/audio-manager.test.js
 *
 * Real, executed tests for core/engines/audio/audio-manager.js.
 * Run with: node tests/audio-manager.test.js
 */

'use strict';

import assert from 'assert';
import AudioManager from '../core/engines/audio/audio-manager.js';
import { createInMemoryAudioProvider } from '../core/engines/audio/provider-inmemory.js';
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

console.log('CozyOS Audio Manager — Test Suite (real integration, reference provider)\n');

(async () => {
  // 1. Provider registration
  test('registerProvider() rejects an adapter missing required methods', () => {
    AudioManager.__resetForTests();
    assert.throws(() => AudioManager.registerProvider({ type: 'broken' }), /missing required method/);
  });

  // 2. Detection
  await asyncTest('detectMicrophones() returns exactly what the provider reports', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Shure SM7B' });
    AudioManager.registerProvider(provider);
    const detected = await AudioManager.detectMicrophones();
    assert.strictEqual(detected.length, 1);
    assert.strictEqual(detected[0].externalId, 'mic-1');
  });

  // 3. Registration + duplicate rejection
  test('registerMicrophone() registers and rejects duplicates', () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    assert.strictEqual(mic.state, 'REGISTERED');
    assert.throws(
      () => AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' }),
      /already registered/
    );
  });

  // 4. Connect + primary selection
  await asyncTest('selectPrimaryMicrophone() requires CONNECTED and updates getPrimaryMicrophone()', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });

    assert.throws(() => AudioManager.selectPrimaryMicrophone(mic.id), /not CONNECTED/);

    await AudioManager.connectMicrophone(mic.id);
    AudioManager.selectPrimaryMicrophone(mic.id);
    assert.strictEqual(AudioManager.getPrimaryMicrophone().id, mic.id);
  });

  // 5. Backup failover on manual disconnect
  await asyncTest('disconnecting the primary fails over to a connected backup', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Primary' });
    provider._simulateDeviceAdded({ externalId: 'mic-2', name: 'Backup' });
    AudioManager.registerProvider(provider);
    const primary = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    const backup = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-2' });
    await AudioManager.connectMicrophone(primary.id);
    await AudioManager.connectMicrophone(backup.id);
    AudioManager.selectPrimaryMicrophone(primary.id);
    AudioManager.setBackupMicrophone(backup.id);

    let failoverEvent = null;
    AudioManager.on(AudioManager.EVENTS.BACKUP_FAILOVER, (p) => { failoverEvent = p; });
    await AudioManager.disconnectMicrophone(primary.id);

    assert.ok(failoverEvent && failoverEvent.to === backup.id);
    assert.strictEqual(AudioManager.getPrimaryMicrophone().id, backup.id);
  });

  // 6. Backup failover on health-check failure
  await asyncTest('a failed health check on the primary triggers failover to backup', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Primary' });
    provider._simulateDeviceAdded({ externalId: 'mic-2', name: 'Backup' });
    AudioManager.registerProvider(provider);
    const primary = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    const backup = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-2' });
    await AudioManager.connectMicrophone(primary.id);
    await AudioManager.connectMicrophone(backup.id);
    AudioManager.selectPrimaryMicrophone(primary.id);
    AudioManager.setBackupMicrophone(backup.id);

    provider._simulateUnhealthy('mic-1', 'Cable fault');
    await AudioManager.checkMicHealth(primary.id);

    assert.strictEqual(AudioManager.getMicrophone(primary.id).state, 'ERROR');
    assert.strictEqual(AudioManager.getPrimaryMicrophone().id, backup.id);
  });

  // 7. Failover does NOT happen if backup isn't connected (Rule 6: never
  // promote a backup that isn't actually ready)
  await asyncTest('failover is skipped if the configured backup is not CONNECTED', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Primary' });
    provider._simulateDeviceAdded({ externalId: 'mic-2', name: 'Backup' });
    AudioManager.registerProvider(provider);
    const primary = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    const backup = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-2' }); // never connected
    await AudioManager.connectMicrophone(primary.id);
    AudioManager.selectPrimaryMicrophone(primary.id);
    AudioManager.setBackupMicrophone(backup.id);

    await AudioManager.disconnectMicrophone(primary.id);
    assert.strictEqual(AudioManager.getPrimaryMicrophone(), null);
  });

  // 8. Mixer: gain + mute delegate to provider DSP when present
  await asyncTest('setGain()/setMute() call provider DSP methods when the provider supports them', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb', { withDsp: true });
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    await AudioManager.connectMicrophone(mic.id);

    await AudioManager.setGain(mic.id, -6);
    assert.strictEqual(AudioManager.getGain(mic.id), -6);

    await AudioManager.setMute(mic.id, true);
    assert.strictEqual(AudioManager.isMuted(mic.id), true);
  });

  // 9. Mixer: mute still works (software-level) even with a no-DSP provider;
  // echo cancellation/noise reduction honestly reject as unsupported
  await asyncTest('mute works on a no-DSP provider; EC/NR honestly reject as unsupported', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('legacy', { withDsp: false });
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Legacy Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'legacy', externalId: 'mic-1' });
    await AudioManager.connectMicrophone(mic.id);

    await AudioManager.setMute(mic.id, true); // must not throw — software mute always tracked
    assert.strictEqual(AudioManager.isMuted(mic.id), true);

    await assert.rejects(() => AudioManager.setEchoCancellation(mic.id, true), /does not support echo cancellation/);
    await assert.rejects(() => AudioManager.setNoiseReduction(mic.id, true), /does not support noise reduction/);
    await assert.rejects(() => AudioManager.getLevel(mic.id), /does not support level monitoring/);
  });

  // 10. Monitoring on a DSP-capable provider returns real simulated levels
  await asyncTest('getLevel() returns the real value the provider reports, requires CONNECTED', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb', { withDsp: true });
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });

    await assert.rejects(() => AudioManager.getLevel(mic.id), /not CONNECTED/);

    await AudioManager.connectMicrophone(mic.id);
    provider._simulateLevel('mic-1', -12, -18);
    const level = await AudioManager.getLevel(mic.id);
    assert.strictEqual(level.peakDb, -12);
    assert.strictEqual(level.rmsDb, -18);
  });

  // 11. Routing
  await asyncTest('setRouting() validates bus names and getMixState() reflects it', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });

    assert.throws(() => AudioManager.setRouting(mic.id, ['not-a-bus']), /setRouting requires/);
    AudioManager.setRouting(mic.id, ['program', 'record']);
    assert.deepStrictEqual(AudioManager.getRouting(mic.id), ['program', 'record']);

    const mix = AudioManager.getMixState();
    assert.strictEqual(mix.channels.length, 1);
    assert.deepStrictEqual(mix.channels[0].routing, ['program', 'record']);
  });

  // 12. Hot-plug triggers disconnect + failover path together
  await asyncTest('hot-unplug of the primary disconnects it and fails over to a connected backup', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    AudioManager.registerProvider(provider);
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Primary' });
    provider._simulateDeviceAdded({ externalId: 'mic-2', name: 'Backup' });
    const primary = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    const backup = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-2' });
    await AudioManager.connectMicrophone(primary.id);
    await AudioManager.connectMicrophone(backup.id);
    AudioManager.selectPrimaryMicrophone(primary.id);
    AudioManager.setBackupMicrophone(backup.id);

    provider._simulateDeviceRemoved('mic-1');
    assert.strictEqual(AudioManager.getMicrophone(primary.id).state, 'DISCONNECTED');
    assert.strictEqual(AudioManager.getPrimaryMicrophone().id, backup.id);
  });

  // 13. removeMicrophone awaits disconnect before REMOVED (regression guard
  // for the exact race Camera Manager's removeCamera had)
  await asyncTest('removeMicrophone() on a CONNECTED mic disconnects first without an illegal transition', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    await AudioManager.connectMicrophone(mic.id);
    await AudioManager.removeMicrophone(mic.id);
    assert.throws(() => AudioManager.getMicrophone(mic.id), /Unknown microphone/);
  });

  // 14. Kernel integration
  await asyncTest('registerWithKernel() registers Audio Manager as a real platform service', async () => {
    AudioManager.__resetForTests();
    const state = await AudioManager.registerWithKernel(Kernel);
    assert.strictEqual(state, 'REGISTERED');
  });

  // 15. Frozen surface
  test('AudioManager is frozen and cannot be mutated', () => {
    assert.throws(() => { AudioManager.MIC_STATES = {}; }, TypeError);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
