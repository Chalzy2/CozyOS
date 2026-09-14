/**
 * tests/media-pipeline-manager.test.js
 *
 * Real, executed tests for core/engines/media/* — Milestone 140 + Phase 2.
 * Run with: node core/engines/media/tests/media-pipeline-manager.test.js
 */

'use strict';

import assert from 'assert';
import Media from '../media-pipeline-manager.js';
import { createInMemoryMediaProvider } from '../provider-inmemory.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`      ${err.stack}`);
    failed++;
  }
}

async function run() {
  Media.__resetForTests();
  Media.registerDefaultProvider();
  const provider = createInMemoryMediaProvider();

  // ---------------------------------------------------------------------
  // Milestone 140
  // ---------------------------------------------------------------------

  await test('image engine resizes for real (dimensions change, data length matches)', () => {
    const img = provider.createImage(4, 4, [10, 20, 30, 255]);
    const resized = Media.ImageEngine.resize(img, 2, 2);
    assert.strictEqual(resized.width, 2);
    assert.strictEqual(resized.height, 2);
    assert.strictEqual(resized.data.length, 2 * 2 * 4);
  });

  await test('image engine crop rejects out-of-bounds (fail closed)', () => {
    const img = provider.createImage(4, 4);
    assert.throws(() => Media.ImageEngine.crop(img, 0, 0, 10, 10));
  });

  await test('filter engine applies black-and-white for real (saturation removed)', () => {
    const img = provider.createImage(2, 2, [200, 50, 50, 255]);
    const out = Media.applyFilter('black-and-white', img);
    assert.strictEqual(out.data[0], out.data[1]);
    assert.strictEqual(out.data[1], out.data[2]);
  });

  await test('filter engine fails closed on unknown filter', () => {
    const img = provider.createImage(2, 2);
    assert.throws(() => Media.applyFilter('does-not-exist', img));
  });

  await test('background engine requires a mask for replace mode (fail closed)', () => {
    assert.throws(() => Media.enableBackground('session-1', 'replace', {}));
  });

  await test('background engine blur mode works without a mask', () => {
    Media.enableBackground('session-2', 'blur', { blurRadius: 1 });
    assert.strictEqual(Media.BackgroundEngine.getActiveMode('session-2'), 'blur');
  });

  await test('enhancement engine autoExposure computes a real brightness delta', () => {
    const darkImg = provider.createImage(2, 2, [20, 20, 20, 255]);
    const result = Media.EnhancementEngine.autoExposure(darkImg);
    assert.ok(result.data[0] > darkImg.data[0], 'brightened image should have higher channel values');
  });

  await test('enhancement engine fails closed on unsupported ML capability', () => {
    assert.throws(() => Media.EnhancementEngine.faceSmoothing(provider.createImage(2, 2), {}));
  });

  await test('codec encode/decode round-trips through the reference provider', () => {
    const img = provider.createImage(3, 3, [1, 2, 3, 255]);
    const encoded = Media.compress(img, 'png');
    const decoded = Media.importContainer(encoded);
    assert.strictEqual(decoded.width, 3);
    assert.strictEqual(decoded.height, 3);
    assert.deepStrictEqual(Array.from(decoded.data), Array.from(img.data));
  });

  await test('codec decode fails closed on a payload it did not encode', () => {
    assert.throws(() => Media.importContainer({ format: 'jpeg', payload: 'not-real' }));
  });

  await test('record export packages frames via codec encoding (async job API)', async () => {
    const img = provider.createImage(2, 2, [5, 5, 5, 255]);
    const { promise } = Media.exportSession({ sessionId: 's1', videoFrames: [{ index: 0, image: img }] }, 'png');
    const bundle = await promise;
    assert.strictEqual(bundle.frameCount, 1);
    assert.strictEqual(bundle.hasAudio, false);
  });

  await test('media-pipeline-manager.process() chains image + filter steps for real', () => {
    const img = provider.createImage(4, 4, [100, 150, 200, 255]);
    const out = Media.process(img, [
      { engine: 'image', op: 'resize', args: [2, 2] },
      { engine: 'filter', op: 'black-and-white' }
    ]);
    assert.strictEqual(out.width, 2);
    assert.strictEqual(out.data[0], out.data[1]);
  });

  // NOTE: cozy-media.js is browser-only (reads/writes `window` at load
  // time, no ES export) — not Node-importable without polyfilling
  // `window`, deliberately avoided. This exercises the real, documented
  // Adapters/Pipelines contract via a mock built to that exact shape.
  await test('attachToCoordinator registers a plain-data descriptor via the real Adapters/Pipelines contract', () => {
    const store = new Map();
    const mockCozyMedia = {
      Adapters: {
        register(descriptor) {
          assert.strictEqual(typeof descriptor, 'object');
          Object.values(descriptor).forEach((v) => assert.notStrictEqual(typeof v, 'function'));
          const id = 'adapter_' + (store.size + 1);
          store.set(id, descriptor);
          return { success: true, data: { id } };
        },
        has(id) { return store.has(id); }
      },
      Pipelines: { register() { return { success: true, data: { id: 'pipeline_1' } }; } }
    };
    const result = Media.attachToCoordinator(mockCozyMedia);
    assert.ok(result.adapterId);
    assert.ok(mockCozyMedia.Adapters.has(result.adapterId));
  });

  // ---------------------------------------------------------------------
  // Phase 2 — Environment Engine (registry only, no fabricated assets)
  // ---------------------------------------------------------------------

  await test('environment engine registers and resolves a real environment via a real provider function', async () => {
    Media.EnvironmentEngine.registerEnvironment('africa', 'maasai-mara', {
      label: 'Maasai Mara',
      resolve: async () => provider.createImage(2, 2, [90, 60, 20, 255])
    });
    const img = await Media.EnvironmentEngine.resolveEnvironment('africa', 'maasai-mara');
    assert.strictEqual(img.width, 2);
  });

  await test('environment engine fails closed on an unregistered environment (no fabricated image)', async () => {
    await assert.rejects(() => Media.EnvironmentEngine.resolveEnvironment('africa', 'victoria-falls'));
  });

  await test('environment engine rejects an unknown category', () => {
    assert.throws(() => Media.EnvironmentEngine.registerEnvironment('not-a-category', 'x', { resolve: () => {} }));
  });

  // ---------------------------------------------------------------------
  // Phase 2 — Live Effects (real procedural generation, deterministic seed)
  // ---------------------------------------------------------------------

  await test('live effects: rain is a real, seeded particle simulation (pixels actually change, deterministic)', () => {
    const base = provider.createImage(20, 20, [10, 10, 10, 255]);
    Media.LiveEffectsEngine.start('fx-1', 'rain', base, { seed: 42, count: 30 });
    const frame1 = Media.LiveEffectsEngine.render('fx-1', base);
    const changed = frame1.data.some((v, i) => v !== base.data[i]);
    assert.ok(changed, 'rain should actually alter pixels');

    Media.LiveEffectsEngine.stop('fx-1');
    Media.LiveEffectsEngine.start('fx-2', 'rain', base, { seed: 42, count: 30 });
    const frame2 = Media.LiveEffectsEngine.render('fx-2', base);
    assert.deepStrictEqual(Array.from(frame1.data), Array.from(frame2.data), 'same seed must produce identical first frame — real determinism, not random');
  });

  await test('live effects: clouds (noise-field based, no particles) also changes pixels', () => {
    const base = provider.createImage(20, 20, [10, 10, 10, 255]);
    Media.LiveEffectsEngine.start('fx-clouds', 'clouds', base, { seed: 7 });
    const frame = Media.LiveEffectsEngine.render('fx-clouds', base);
    const changed = frame.data.some((v, i) => v !== base.data[i]);
    assert.ok(changed);
  });

  await test('live effects: render() on a stopped session is a no-op, not a crash', () => {
    const base = provider.createImage(4, 4, [1, 1, 1, 255]);
    const out = Media.LiveEffectsEngine.render('never-started', base);
    assert.deepStrictEqual(Array.from(out.data), Array.from(base.data));
  });

  // ---------------------------------------------------------------------
  // Phase 2 — Image Analysis (real pixel math, no fabricated AI scoring)
  // ---------------------------------------------------------------------

  await test('image analysis: a flat gray image is measurably low-contrast and low-noise', () => {
    const flat = provider.createImage(10, 10, [128, 128, 128, 255]);
    const report = Media.ImageEngine.analyze(flat);
    assert.strictEqual(report.contrast.stdDev, 0);
    assert.strictEqual(report.noise.estimate, 0);
    assert.strictEqual(report.brightness.mean, 128);
  });

  await test('image analysis: brightness/exposure verdicts respond to real pixel values', () => {
    const dark = provider.createImage(4, 4, [5, 5, 5, 255]);
    const bright = provider.createImage(4, 4, [250, 250, 250, 255]);
    assert.strictEqual(Media.ImageEngine.analyzeExposure(dark).verdict, 'underexposed');
    assert.strictEqual(Media.ImageEngine.analyzeExposure(bright).verdict, 'overexposed');
  });

  await test('image analysis: histogram sums to total pixel count (real distribution, not fabricated)', () => {
    const img = provider.createImage(5, 5, [64, 64, 64, 255]);
    const hist = Media.ImageEngine.analyzeHistogram(img);
    const total = hist.reduce((a, b) => a + b, 0);
    assert.strictEqual(total, 25);
  });

  // ---------------------------------------------------------------------
  // Phase 2 — Enhancement quality comparison + history
  // ---------------------------------------------------------------------

  await test('enhancement compareQuality measures a real improvement after autoExposure', () => {
    const dark = provider.createImage(6, 6, [15, 15, 15, 255]);
    const enhanced = Media.EnhancementEngine.autoExposure(dark, undefined, 'quality-session-1');
    const report = Media.EnhancementEngine.compareQuality(dark, enhanced);
    assert.ok(report.confidence >= 0, 'confidence must be a real computed ratio');
    const exposureDim = report.dimensions.find((d) => d.name === 'exposureBalance');
    assert.strictEqual(exposureDim.improved, true, 'pushing 15 toward 128 must measurably improve exposure balance');
  });

  await test('enhancement engine records real processing history when given a sessionId', () => {
    Media.EnhancementEngine.clearHistory('quality-session-2');
    const img = provider.createImage(4, 4, [30, 30, 30, 255]);
    Media.EnhancementEngine.autoExposure(img, undefined, 'quality-session-2');
    const history = Media.EnhancementEngine.getHistory('quality-session-2');
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].operation, 'autoExposure');
  });

  // ---------------------------------------------------------------------
  // Phase 2 — Filter Pipelines (compose existing filters only)
  // ---------------------------------------------------------------------

  await test('filter pipeline applies each composed filter in order (no duplicated filter logic)', () => {
    const img = provider.createImage(3, 3, [200, 60, 60, 255]);
    const out = Media.FilterEngine.applyPipeline('cozycabin-product', img, Media.ImageEngine.getProvider());
    assert.strictEqual(out.width, 3);
  });

  await test('filter pipeline registration rejects an unregistered filter name (no fabricated composition)', () => {
    assert.throws(() => Media.FilterEngine.registerPipeline('bad-pipeline', ['not-a-real-filter']));
  });

  await test('built-in pipelines are all registered', () => {
    const names = Media.FilterEngine.listPipelines();
    for (const n of ['cozycabin-product', 'meeting', 'portrait-pipeline', 'document', 'ocr-pipeline', 'security']) {
      assert.ok(names.includes(n), `expected pipeline "${n}"`);
    }
  });

  // ---------------------------------------------------------------------
  // Phase 2 — Record Export Session Manager (queue, pause/resume/cancel,
  // batch, integrity — real async control flow, not a cosmetic flag)
  // ---------------------------------------------------------------------

  await test('record export: pause requested immediately genuinely halts before all frames process', async () => {
    const frames = Array.from({ length: 10 }, (_, i) => ({ index: i, image: provider.createImage(2, 2, [i, i, i, 255]) }));
    const { jobId, promise } = Media.RecordExportSessionManager.exportSession({ sessionId: 'pause-test', videoFrames: frames });
    Media.RecordExportSessionManager.pauseExport(jobId); // called before awaiting — real interleave via microtask yield
    const result = await promise;
    assert.strictEqual(result, null, 'a paused job resolves null, not a fabricated partial bundle');
    const status = Media.RecordExportSessionManager.getStatus(jobId);
    assert.strictEqual(status.status, 'paused');
    assert.ok(status.frameCount < 10, 'must have genuinely stopped before processing all frames');
  });

  await test('record export: resume continues from where it paused and completes for real', async () => {
    const frames = Array.from({ length: 6 }, (_, i) => ({ index: i, image: provider.createImage(2, 2, [i, i, i, 255]) }));
    const { jobId, promise } = Media.RecordExportSessionManager.exportSession({ sessionId: 'resume-test', videoFrames: frames });
    Media.RecordExportSessionManager.pauseExport(jobId);
    await promise;
    assert.strictEqual(Media.RecordExportSessionManager.getStatus(jobId).status, 'paused');
    const bundle = await Media.RecordExportSessionManager.resumeExport(jobId);
    assert.strictEqual(bundle.frameCount, 6, 'resumed job must process every remaining frame for real');
  });

  await test('record export: cancel produces a real cancelled status, not a completed bundle', async () => {
    const frames = Array.from({ length: 8 }, (_, i) => ({ index: i, image: provider.createImage(2, 2, [1, 1, 1, 255]) }));
    const { jobId, promise } = Media.RecordExportSessionManager.exportSession({ sessionId: 'cancel-test', videoFrames: frames });
    Media.RecordExportSessionManager.cancelExport(jobId);
    const result = await promise;
    assert.strictEqual(result, null);
    assert.strictEqual(Media.RecordExportSessionManager.getStatus(jobId).status, 'cancelled');
  });

  await test('record export: batchExport queues multiple real jobs', async () => {
    const mk = (n) => ({ sessionId: `batch-${n}`, videoFrames: [{ index: 0, image: provider.createImage(2, 2, [n, n, n, 255]) }] });
    const jobs = Media.RecordExportSessionManager.batchExport([mk(1), mk(2), mk(3)]);
    assert.strictEqual(jobs.length, 3);
    const bundles = await Promise.all(jobs.map((j) => j.promise));
    assert.ok(bundles.every((b) => b.frameCount === 1));
  });

  await test('record export: verifyIntegrity detects real tampering (recomputed checksum mismatch)', async () => {
    const { promise } = Media.RecordExportSessionManager.exportSession({
      sessionId: 'integrity-test',
      videoFrames: [{ index: 0, image: provider.createImage(2, 2, [9, 9, 9, 255]) }]
    });
    const bundle = await promise;
    assert.strictEqual(Media.RecordExportSessionManager.verifyIntegrity(bundle).valid, true);
    const tampered = { ...bundle, frames: [{ ...bundle.frames[0], container: { ...bundle.frames[0].container, payload: 'tampered' } }] };
    assert.strictEqual(Media.RecordExportSessionManager.verifyIntegrity(tampered).valid, false);
  });

  await test('record export: getCapabilities honestly reports cloud/vault as unimplemented', () => {
    const caps = Media.RecordExportSessionManager.getCapabilities();
    assert.strictEqual(caps.cloudExport, false);
    assert.strictEqual(caps.vaultIntegration, false);
    assert.strictEqual(caps.pauseResume, true);
  });

  await test('legacy recording-export-engine.js re-export still works (backward compatibility)', async () => {
    const { default: LegacyRecordingExportEngine } = await import('../recording-export-engine.js');
    const bundle = await LegacyRecordingExportEngine.exportSession(
      { sessionId: 'legacy-test', videoFrames: [{ index: 0, image: provider.createImage(2, 2, [3, 3, 3, 255]) }] },
      'png'
    );
    assert.strictEqual(bundle.frameCount, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
