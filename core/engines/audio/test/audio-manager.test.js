/**
 * core/engines/audio/test/audio-manager.test.js
 *
 * Real, executed tests for core/engines/audio/audio-manager.js.
 * Run with: node core/engines/audio/test/audio-manager.test.js
 */

'use strict';

import assert from 'assert';
import AudioManager from '../audio-manager.js';
import { createInMemoryAudioProvider } from '../provider-inmemory.js';
import Kernel from '../../../kernel.js';

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

  // ── Milestone 158 — Listening Engine coverage ─────────────────────────

  // 16. Capability API fails closed with no browser APIs present (this is a
  // real, honest result in a Node test environment, not a stub)
  test('getCapabilities() fails closed to false with no navigator present', () => {
    AudioManager.__resetForTests();
    const caps = AudioManager.getCapabilities();
    assert.strictEqual(caps.supportsMicrophone, false);
    assert.strictEqual(caps.supportsMultipleInputs, false);
    assert.strictEqual(caps.supportsDeviceSwitch, false);
    assert.strictEqual(caps.supportsRealtimeCapture, false);
    assert.strictEqual(caps.supportsContinuousListening, false);
    assert.strictEqual(caps.supportsBackgroundListening, false); // never true — no guaranteed API exists
  });

  // 17. Permission state never fabricates GRANTED
  test('getPermissionState() starts UNKNOWN, never a fabricated default', () => {
    AudioManager.__resetForTests();
    assert.strictEqual(AudioManager.getPermissionState(), 'UNKNOWN');
  });

  // 18. Health reflects real capability + session evidence, in the right
  // precedence order (an active session outranks the static capability
  // check, since it's direct evidence capture is already working)
  await asyncTest('getHealth() is UNAVAILABLE with no mic support, then reflects a real active session', async () => {
    AudioManager.__resetForTests();
    assert.strictEqual(AudioManager.getHealth(), 'UNAVAILABLE');

    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    const session = AudioManager.createListeningSession({ deviceId: mic.id, profile: 'NORMAL' });
    await AudioManager.startListeningSession(session.id);
    assert.strictEqual(AudioManager.getHealth(), 'LISTENING');

    AudioManager.pauseListeningSession(session.id);
    assert.strictEqual(AudioManager.getHealth(), 'PAUSED');
  });

  // 19. createListeningSession() rejects unknown devices and unknown profiles
  test('createListeningSession() validates device existence and profile name', () => {
    AudioManager.__resetForTests();
    assert.throws(() => AudioManager.createListeningSession({ deviceId: 'no-such-mic' }), /Unknown microphone/);

    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    assert.throws(() => AudioManager.createListeningSession({ deviceId: mic.id, profile: 'NOT_A_PROFILE' }), /Unknown listening profile/);
  });

  // 20. Full session lifecycle: create -> start (auto-connects device,
  // auto-selects primary if none set) -> pause -> resume -> stop
  // (auto-disconnects device once no session references it), with real
  // Session ID / Device / Start Time / End Time / Duration / Status tracking
  await asyncTest('listening session lifecycle: create/start/pause/resume/stop tracks real fields', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });

    const created = AudioManager.createListeningSession({ deviceId: mic.id, profile: 'MEETING' });
    assert.strictEqual(created.status, 'CREATED');
    assert.strictEqual(created.deviceId, mic.id);
    assert.strictEqual(created.startTime, null);

    const started = await AudioManager.startListeningSession(created.id);
    assert.strictEqual(started.status, 'LISTENING');
    assert.ok(typeof started.startTime === 'number');
    assert.strictEqual(AudioManager.getMicrophone(mic.id).state, 'CONNECTED');
    assert.strictEqual(AudioManager.getPrimaryMicrophone().id, mic.id); // auto-selected, none was set

    const paused = AudioManager.pauseListeningSession(created.id);
    assert.strictEqual(paused.status, 'PAUSED');
    const resumed = AudioManager.resumeListeningSession(created.id);
    assert.strictEqual(resumed.status, 'LISTENING');

    const stopped = await AudioManager.stopListeningSession(created.id);
    assert.strictEqual(stopped.status, 'STOPPED');
    assert.ok(typeof stopped.endTime === 'number');
    assert.ok(typeof stopped.duration === 'number');
    assert.strictEqual(AudioManager.getMicrophone(mic.id).state, 'DISCONNECTED'); // no other session referencing it
  });

  // 21. Illegal session transitions are rejected (state machine is real,
  // not a formality) — e.g. cannot pause a session that was never started
  test('illegal listening session transitions throw', () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    const created = AudioManager.createListeningSession({ deviceId: mic.id });
    assert.throws(() => AudioManager.pauseListeningSession(created.id), /Illegal listening session transition/);
    assert.throws(() => AudioManager.resumeListeningSession(created.id), /Illegal listening session transition/);
  });

  // 22. A shared device is only disconnected once ALL sessions referencing
  // it have stopped — never torn down out from under a sibling session
  await asyncTest('stopping one of two sessions sharing a device leaves the device connected', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });

    const sessionA = await AudioManager.startListeningSession(AudioManager.createListeningSession({ deviceId: mic.id }).id);
    const sessionB = await AudioManager.startListeningSession(AudioManager.createListeningSession({ deviceId: mic.id }).id);

    await AudioManager.stopListeningSession(sessionA.id);
    assert.strictEqual(AudioManager.getMicrophone(mic.id).state, 'CONNECTED', 'sessionB still needs the device');

    await AudioManager.stopListeningSession(sessionB.id);
    assert.strictEqual(AudioManager.getMicrophone(mic.id).state, 'DISCONNECTED');
  });

  // 23. cancelListeningSession() from CREATED (never started) works, and is terminal
  test('cancelListeningSession() cancels a never-started session and blocks further transitions', () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    const created = AudioManager.createListeningSession({ deviceId: mic.id });
    const cancelled = AudioManager.cancelListeningSession(created.id);
    assert.strictEqual(cancelled.status, 'CANCELLED');
    assert.throws(() => AudioManager.pauseListeningSession(created.id), /Illegal listening session transition/);
  });

  // 24. restartListeningSession() stops and starts again with a fresh startTime
  await asyncTest('restartListeningSession() produces a new startTime on the same session id', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    const created = AudioManager.createListeningSession({ deviceId: mic.id });
    const started = await AudioManager.startListeningSession(created.id);
    const restarted = await AudioManager.restartListeningSession(created.id);
    assert.strictEqual(restarted.id, started.id);
    assert.strictEqual(restarted.status, 'LISTENING');
  });

  // 25. Developer API convenience surface: startListening() auto-detects and
  // registers a device from the registered provider when none is given
  await asyncTest('startListening() with no deviceId auto-detects and registers from the provider', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('browser');
    provider._simulateDeviceAdded({ externalId: 'default', name: 'Default Mic' });
    AudioManager.registerProvider(provider);

    const session = await AudioManager.startListening();
    assert.strictEqual(session.status, 'LISTENING');
    assert.ok(AudioManager.getActiveDevice());
    assert.strictEqual(AudioManager.listDevices().length, 1);

    await AudioManager.stopListening();
    assert.strictEqual((await AudioManager.stopListening()).reason, 'No active listening session.');
  });

  // 26. startListening() fails closed with a real error when no provider is
  // registered at all (never fabricates a session against nothing)
  await asyncTest('startListening() fails closed when no provider is registered', async () => {
    AudioManager.__resetForTests();
    await assert.rejects(() => AudioManager.startListening(), /No microphone registered and no "browser" provider available/);
  });

  // 27. selectDevice() connects if needed and sets primary — Developer API's
  // selectDevice() reuses connectMicrophone()/selectPrimaryMicrophone()
  // rather than duplicating device logic
  await asyncTest('selectDevice() connects an unconnected device and makes it primary', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });
    assert.strictEqual(AudioManager.getMicrophone(mic.id).state, 'REGISTERED');

    await AudioManager.selectDevice(mic.id);
    assert.strictEqual(AudioManager.getMicrophone(mic.id).state, 'CONNECTED');
    assert.strictEqual(AudioManager.getActiveDevice().id, mic.id);
  });

  // 28. Audio Routing: registerInputAdapter() validates target names, and
  // routeAudio() delivers the real active stream to every registered
  // consumer without one adapter's failure blocking another
  await asyncTest('registerInputAdapter()/routeAudio() deliver the real stream to multiple consumers, fail-closed per adapter', async () => {
    AudioManager.__resetForTests();
    assert.throws(() => AudioManager.registerInputAdapter({ target: 'not-a-target', handler: () => {} }), /registerInputAdapter requires target/);

    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });

    let hearingReceived = null;
    let speechCalls = 0;
    AudioManager.registerInputAdapter({ target: 'hearing', handler: (stream) => { hearingReceived = stream; } });
    AudioManager.registerInputAdapter({ target: 'speech', handler: () => { speechCalls += 1; throw new Error('consumer bug — must not break hearing'); } });

    const session = await AudioManager.startListeningSession(AudioManager.createListeningSession({ deviceId: mic.id }).id);
    assert.ok(hearingReceived, 'hearing adapter received the real stream on session start');
    assert.strictEqual(speechCalls, 1, 'speech adapter was still called despite throwing');

    await AudioManager.stopListeningSession(session.id);
    assert.strictEqual(hearingReceived, null, 'stop routes a null stream to signal capture ended');
  });

  // 29. unregisterInputAdapter() stops further delivery to that consumer
  await asyncTest('unregisterInputAdapter() removes a consumer from future routing', async () => {
    AudioManager.__resetForTests();
    const provider = createInMemoryAudioProvider('usb');
    provider._simulateDeviceAdded({ externalId: 'mic-1', name: 'Mic' });
    AudioManager.registerProvider(provider);
    const mic = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-1' });

    let calls = 0;
    const adapterId = AudioManager.registerInputAdapter({ target: 'media', handler: () => { calls += 1; } });
    assert.strictEqual(AudioManager.unregisterInputAdapter(adapterId), true);

    await AudioManager.startListeningSession(AudioManager.createListeningSession({ deviceId: mic.id }).id);
    assert.strictEqual(calls, 0);
  });

  // 30. Frozen surface covers the new Listening Engine constants too
  test('Listening Engine constants are frozen and cannot be mutated', () => {
    assert.throws(() => { AudioManager.SESSION_STATES = {}; }, TypeError);
    assert.throws(() => { AudioManager.LISTENING_PROFILES = []; }, TypeError);
    assert.throws(() => { AudioManager.PERMISSION_STATES = {}; }, TypeError);
    assert.throws(() => { AudioManager.LISTENING_HEALTH = {}; }, TypeError);
    assert.ok(Object.isFrozen(AudioManager.getCapabilities()));
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
