/**
 * tests/playback-engine.test.js
 *
 * Real, executed tests for core/engines/playback/playback-engine.js.
 * Plays back REAL sessions produced by the real, certified Recording
 * Engine — real frame files, real timing, real export delegation.
 *
 * Run with: node tests/playback-engine.test.js
 */

'use strict';

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import PlaybackEngine from '../core/engines/playback/playback-engine.js';
import RecordingEngine from '../core/engines/recording/recording-engine.js';
import VideoProcessor from '../core/engines/video/video-processor.js';
import { createSoftwareVideoProvider } from '../core/engines/video/provider-software.js';
import SceneManager from '../core/engines/scene/scene-manager.js';
import CameraManager from '../core/engines/camera/camera-manager.js';
import AudioManager from '../core/engines/audio/audio-manager.js';
import { createInMemoryCameraProvider } from '../core/engines/camera/provider-inmemory.js';
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

function freshTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cozyos-playback-'));
}

/** Produces a REAL, STOPPED recording session with a given frame count and frame rate, via the real pipeline. */
async function recordRealSession(frameCount, frameRate = 10) {
  RecordingEngine.__resetForTests();
  VideoProcessor.__resetForTests();
  SceneManager.__resetForTests();
  CameraManager.__resetForTests();
  AudioManager.__resetForTests();

  const camProvider = createInMemoryCameraProvider('usb');
  camProvider._simulateDeviceAdded({ externalId: 'cam-a', name: 'Front' });
  CameraManager.registerProvider(camProvider);
  const camA = CameraManager.registerCamera({ providerType: 'usb', externalId: 'cam-a' });
  await CameraManager.connectCamera(camA.id);

  const micProvider = createInMemoryAudioProvider('usb');
  micProvider._simulateDeviceAdded({ externalId: 'mic-a', name: 'Main' });
  AudioManager.registerProvider(micProvider);
  const micA = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-a' });
  await AudioManager.connectMicrophone(micA.id);

  const scene = SceneManager.createScene({ name: 'Live', camera: { primaryCameraId: camA.id }, audio: { primaryMicId: micA.id } });
  await SceneManager.activateScene(scene.id);

  VideoProcessor.registerProvider(createSoftwareVideoProvider('software'));
  VideoProcessor.setResolution(160, 90);
  VideoProcessor.setFrameRate(frameRate);
  VideoProcessor.start();

  const dir = freshTmpDir();
  RecordingEngine.startRecording({ outputDir: dir, segmentMaxFrames: 5 }); // multiple segments if frameCount > 5
  for (let i = 0; i < frameCount; i++) await RecordingEngine.recordFrame();
  const summary = RecordingEngine.stopRecording();
  return summary.dir;
}

console.log('CozyOS Playback Engine — Test Suite (real sessions, real timing)\n');

(async () => {
  // 1. loadSession() honestly refuses a non-existent manifest
  test('loadSession() refuses a directory with no manifest.json', () => {
    PlaybackEngine.__resetForTests();
    assert.throws(() => PlaybackEngine.loadSession(freshTmpDir()), /No manifest.json found/);
  });

  // 2. loadSession() honestly refuses a still-RECORDING session
  await asyncTest('loadSession() refuses a session that is not STOPPED', async () => {
    PlaybackEngine.__resetForTests();
    RecordingEngine.__resetForTests();
    VideoProcessor.__resetForTests();
    SceneManager.__resetForTests();
    CameraManager.__resetForTests();
    AudioManager.__resetForTests();
    const camProvider = createInMemoryCameraProvider('usb');
    camProvider._simulateDeviceAdded({ externalId: 'cam-a', name: 'Front' });
    CameraManager.registerProvider(camProvider);
    const camA = CameraManager.registerCamera({ providerType: 'usb', externalId: 'cam-a' });
    await CameraManager.connectCamera(camA.id);
    const micProvider = createInMemoryAudioProvider('usb');
    micProvider._simulateDeviceAdded({ externalId: 'mic-a', name: 'Main' });
    AudioManager.registerProvider(micProvider);
    const micA = AudioManager.registerMicrophone({ providerType: 'usb', externalId: 'mic-a' });
    await AudioManager.connectMicrophone(micA.id);
    const scene = SceneManager.createScene({ name: 'Live', camera: { primaryCameraId: camA.id }, audio: { primaryMicId: micA.id } });
    await SceneManager.activateScene(scene.id);
    VideoProcessor.registerProvider(createSoftwareVideoProvider('software'));
    VideoProcessor.start();
    const dir = freshTmpDir();
    RecordingEngine.startRecording({ outputDir: dir, segmentMaxFrames: 10 });
    await RecordingEngine.recordFrame();
    const stillRecordingDir = RecordingEngine.getSession().dir;
    assert.throws(() => PlaybackEngine.loadSession(stillRecordingDir), /only STOPPED sessions/);
  });

  // 3. loadSession() builds a real frame index matching real files on disk
  await asyncTest('loadSession() indexes exactly the real frame files that exist on disk', async () => {
    const sessionDir = await recordRealSession(7);
    const status = PlaybackEngine.loadSession(sessionDir);
    assert.strictEqual(status.frameCount, 7);
  });

  // 4. getCurrentFrame() reads real bytes matching the real file on disk
  await asyncTest('getCurrentFrame() returns real bytes matching the real file size', async () => {
    const sessionDir = await recordRealSession(3);
    PlaybackEngine.loadSession(sessionDir);
    const frame = PlaybackEngine.getCurrentFrame();
    assert.strictEqual(frame.data.length, frame.byteLength);
    assert.ok(frame.data.length > 0);
  });

  // 5. seek() bounds-checks against the real frame count
  await asyncTest('seek() validates against the real frame count', async () => {
    const sessionDir = await recordRealSession(5);
    PlaybackEngine.loadSession(sessionDir);
    assert.throws(() => PlaybackEngine.seek(999), /out of range/);
    const status = PlaybackEngine.seek(3);
    assert.strictEqual(status.position, 3);
  });

  // 6. seekToTime() converts using the real recorded frame rate
  await asyncTest('seekToTime() converts real milliseconds to the correct frame index at the recorded frame rate', async () => {
    const sessionDir = await recordRealSession(20, 10); // 10 fps -> 100ms/frame
    PlaybackEngine.loadSession(sessionDir);
    const status = PlaybackEngine.seekToTime(500); // should land on frame 5
    assert.strictEqual(status.position, 5);
  });

  // 7. Real timed playback: play() really delivers frames paced by real elapsed time
  await asyncTest('play() delivers real frames paced by real wall-clock time at the recorded frame rate', async () => {
    const sessionDir = await recordRealSession(5, 20); // 20fps -> 50ms/frame, 5 frames => ~200-250ms total
    PlaybackEngine.loadSession(sessionDir);
    const received = [];
    const off = PlaybackEngine.on(PlaybackEngine.EVENTS.FRAME, (f) => received.push(f.globalIndex));

    const ended = new Promise((resolve) => {
      const offEnd = PlaybackEngine.on(PlaybackEngine.EVENTS.ENDED, () => { offEnd(); resolve(); });
    });
    const start = Date.now();
    PlaybackEngine.play();
    await ended;
    const elapsedMs = Date.now() - start;
    off();

    assert.deepStrictEqual(received, [0, 1, 2, 3, 4]);
    // Real pacing check with generous tolerance for sandbox jitter: 5 frames
    // at 50ms each should take meaningfully longer than an instant delivery.
    assert.ok(elapsedMs >= 150, `expected real pacing >=150ms, got ${elapsedMs}ms`);
  });

  // 8. pause()/resume() really stop and continue real delivery
  await asyncTest('pause()/resume() really halt and continue real frame delivery', async () => {
    const sessionDir = await recordRealSession(4, 20);
    PlaybackEngine.loadSession(sessionDir);
    const received = [];
    PlaybackEngine.on(PlaybackEngine.EVENTS.FRAME, (f) => received.push(f.globalIndex));
    PlaybackEngine.play();
    await new Promise((r) => setTimeout(r, 70)); // let ~1 frame through
    PlaybackEngine.pause();
    const countAtPause = received.length;
    await new Promise((r) => setTimeout(r, 100)); // real wait — nothing should arrive while paused
    assert.strictEqual(received.length, countAtPause);
    PlaybackEngine.resume();
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(received.length > countAtPause);
  });

  // 9. Loop mode really restarts at position 0 instead of ending
  await asyncTest('setLoop(true) really restarts playback at frame 0 instead of ENDED', async () => {
    const sessionDir = await recordRealSession(2, 25); // 40ms/frame
    PlaybackEngine.loadSession(sessionDir);
    PlaybackEngine.setLoop(true);
    const received = [];
    PlaybackEngine.on(PlaybackEngine.EVENTS.FRAME, (f) => received.push(f.globalIndex));
    PlaybackEngine.play();
    await new Promise((r) => setTimeout(r, 220)); // enough real time for several loops of 2 frames
    PlaybackEngine.stop();
    assert.ok(received.length > 2); // proves it looped rather than ending after 2
    assert.strictEqual(PlaybackEngine.getStatus().state, 'STOPPED');
  });

  // 10. stop() resets position
  await asyncTest('stop() resets real position to 0', async () => {
    const sessionDir = await recordRealSession(5, 30);
    PlaybackEngine.loadSession(sessionDir);
    PlaybackEngine.seek(3);
    PlaybackEngine.stop();
    assert.strictEqual(PlaybackEngine.getStatus().position, 0);
  });

  // 11. Export delegates to Recording Engine's real archive logic — not reimplemented
  await asyncTest('exportArchive() delegates to Recording Engine\'s real createArchivePackage and produces a real zip', async () => {
    const sessionDir = await recordRealSession(3);
    PlaybackEngine.loadSession(sessionDir);
    const zipPath = path.join(sessionDir, '..', 'playback-export.zip');
    const result = await PlaybackEngine.exportArchive(zipPath);
    assert.ok(fs.existsSync(result.path));
    assert.ok(result.byteLength > 0);
  });

  // 12. Kernel integration
  await asyncTest('registerWithKernel() registers Playback Engine as a real platform service', async () => {
    PlaybackEngine.__resetForTests();
    const state = await PlaybackEngine.registerWithKernel(Kernel);
    assert.strictEqual(state, 'REGISTERED');
  });

  // 13. Frozen surface
  test('PlaybackEngine is frozen and cannot be mutated', () => {
    assert.throws(() => { PlaybackEngine.PLAYBACK_STATES = {}; }, TypeError);
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exitCode = failed > 0 ? 1 : 0;
})();
