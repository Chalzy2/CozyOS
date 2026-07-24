/**
 * tests/engine-bridge.test.js
 * Run with: node core/bridge/tests/engine-bridge.test.js
 * Real dynamic import() against the real engine files — no fake tests.
 */

'use strict';

import assert from 'assert';
import EngineBridge from '../engine-bridge.js';

let passed = 0, failed = 0;
function test(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`  \u2713 ${name}`);
      passed++;
    } catch (err) {
      console.log(`  \u2717 ${name}`);
      console.log(`      ${err.stack}`);
      failed++;
    }
  })();
}

async function run() {
  EngineBridge.__resetForTests();

  await test('register() stores a registration without loading it (lazy)', () => {
    EngineBridge.register('media', { modulePath: '../engines/media/media-pipeline-manager.js', globalName: 'MediaEngine', expectedManifestName: 'media-pipeline-manager' });
    assert.strictEqual(EngineBridge.isLoaded('media'), false);
    assert.strictEqual(EngineBridge.getStatus('media').status, 'registered');
  });

  await test('register() throws on duplicate name (Conflict Review)', () => {
    assert.throws(() => EngineBridge.register('media', { modulePath: 'x.js', globalName: 'X' }));
  });

  await test('load() performs a real dynamic import and exposes on target.CozyOS', async () => {
    const target = {};
    const result = await EngineBridge.load('media', { target });
    assert.strictEqual(result.success, true);
    assert.ok(target.CozyOS.MediaEngine, 'expected window.CozyOS.MediaEngine to be set');
    assert.strictEqual(typeof target.CozyOS.MediaEngine.process, 'function', 'real Media Pipeline Manager API should be present');
    assert.strictEqual(EngineBridge.isLoaded('media'), true);
  });

  await test('resolve() returns the real engine, loading lazily if needed', async () => {
    EngineBridge.register('audio', { modulePath: '../engines/audio/audio-manager.js', globalName: 'AudioEngine', expectedManifestName: 'audio-manager' });
    const target = {};
    const engine = await EngineBridge.resolve('audio', { target });
    assert.ok(engine);
    assert.ok(target.CozyOS.AudioEngine === engine);
  });

  await test('load() fails closed on a bad module path — status becomes unavailable, no throw', async () => {
    EngineBridge.register('broken', { modulePath: '../engines/does-not-exist.js', globalName: 'Broken' });
    const result = await EngineBridge.load('broken', {});
    assert.strictEqual(result.success, false);
    assert.ok(result.reason);
    assert.strictEqual(EngineBridge.getStatus('broken').status, 'unavailable');
  });

  await test('resolve() on a failed engine returns null, never a fabricated stub', async () => {
    const engine = await EngineBridge.resolve('broken', {});
    assert.strictEqual(engine, null);
  });

  await test('load() rejects manifest name mismatch (fail closed, honest naming check)', async () => {
    EngineBridge.register('mismatch', { modulePath: '../engines/scene/scene-manager.js', globalName: 'SceneEngine', expectedManifestName: 'not-the-real-name' });
    const result = await EngineBridge.load('mismatch', {});
    assert.strictEqual(result.success, false);
    assert.match(result.reason, /manifest name mismatch/);
  });

  await test('expose() refuses to silently overwrite a different existing global (Conflict Review)', async () => {
    EngineBridge.register('collide-test', { modulePath: '../engines/camera/camera-manager.js', globalName: 'Collide' });
    const target = { CozyOS: { Collide: { notTheRealEngine: true } } };
    const result = await EngineBridge.load('collide-test', { target });
    assert.strictEqual(result.success, false);
    assert.match(result.reason, /already occupied/);
  });

  await test('DISCOVERED DEFECT: playback-engine.js has a dangling import to a non-existent recording-engine.js — bridge fails closed instead of crashing', async () => {
    EngineBridge.register('playback', { modulePath: '../engines/playback/playback-engine.js', globalName: 'PlaybackEngine' });
    const result = await EngineBridge.load('playback', {});
    assert.strictEqual(result.success, false);
    assert.match(result.reason, /recording-engine\.js/);
    assert.strictEqual(EngineBridge.getStatus('playback').status, 'unavailable');
  });

  await test('unload() removes the global and resets status', async () => {
    EngineBridge.register('scene', { modulePath: '../engines/scene/scene-manager.js', globalName: 'SceneEngine', expectedManifestName: 'scene-manager' });
    const target = {};
    await EngineBridge.load('scene', { target });
    assert.ok(target.CozyOS.SceneEngine);
    const result = EngineBridge.unload('scene', target);
    assert.strictEqual(result, true);
    assert.strictEqual(target.CozyOS.SceneEngine, undefined);
    assert.strictEqual(EngineBridge.isLoaded('scene'), false);
  });

  await test('getCapabilities() reflects the real engine, null when not loaded', async () => {
    assert.strictEqual(EngineBridge.getCapabilities('scene'), null);
    EngineBridge.register('image-check', { modulePath: '../engines/camera/camera-manager.js', globalName: 'CameraEngine', expectedManifestName: 'camera-manager' });
    const target = {};
    await EngineBridge.load('image-check', { target });
    // camera-manager.js has no getCapabilities() export -> honest null, not fabricated
    assert.strictEqual(EngineBridge.getCapabilities('image-check'), null);
  });

  await test('listRegistered() reflects every register() call', () => {
    const names = EngineBridge.listRegistered();
    assert.ok(names.includes('media'));
    assert.ok(names.includes('audio'));
    assert.ok(names.includes('broken'));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
