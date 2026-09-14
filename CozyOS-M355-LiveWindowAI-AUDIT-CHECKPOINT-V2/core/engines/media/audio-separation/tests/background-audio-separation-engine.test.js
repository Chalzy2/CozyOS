/**
 * tests/background-audio-separation-engine.test.js
 *
 * Real, executed tests for core/engines/media/audio-separation/* — M388
 * Engine 5, Phase 4 (Verification).
 * Run with: node core/engines/media/audio-separation/tests/background-audio-separation-engine.test.js
 */

'use strict';

import assert from 'assert';
import BackgroundAudioSeparationEngine from '../background-audio-separation-engine.js';
import { createTurnCoverageProvider, partitionSegments } from '../provider-turn-coverage.js';
import SpeakerDiarizationEngine from '../../diarization/speaker-diarization-engine.js';

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
  BackgroundAudioSeparationEngine.__resetForTests();
  BackgroundAudioSeparationEngine.registerDefaultProvider();

  // ---------------------------------------------------------------------
  // Provider-level: real, executed diarization-turn-coverage partitioning
  // ---------------------------------------------------------------------

  await test('partitionSegments() honestly returns an empty envelope for zero segments (no fabrication)', () => {
    const result = partitionSegments([], { turns: [] });
    assert.strictEqual(result.isReal, false);
    assert.strictEqual(result.method, 'no-analyzable-signal');
  });

  await test('partitionSegments() honestly returns an empty envelope with no diarization turns at all', () => {
    const result = partitionSegments([{ segmentId: 's1' }, { segmentId: 's2' }], { turns: [] });
    assert.strictEqual(result.isReal, false);
    assert.strictEqual(result.speechSegmentIds.length, 0);
    assert.strictEqual(result.unclassifiedSegmentIds.length, 0);
  });

  await test('partitionSegments() honestly returns an empty envelope with undefined diarizationResult', () => {
    const result = partitionSegments([{ segmentId: 's1' }], undefined);
    assert.strictEqual(result.isReal, false);
  });

  await test('partitionSegments() attributes a turn-covered segment as real speech', () => {
    const result = partitionSegments(
      [{ segmentId: 's1' }, { segmentId: 's2' }],
      { turns: [{ speakerHint: 'pastor', segmentIds: ['s1'] }] }
    );
    assert.strictEqual(result.isReal, true);
    assert.strictEqual(result.method, 'diarization-turn-coverage');
    assert.deepStrictEqual(result.speechSegmentIds, ['s1']);
  });

  await test('partitionSegments() labels an uncovered segment unclassified, never "background"', () => {
    const result = partitionSegments(
      [{ segmentId: 's1' }, { segmentId: 's2' }],
      { turns: [{ speakerHint: 'pastor', segmentIds: ['s1'] }] }
    );
    assert.deepStrictEqual(result.unclassifiedSegmentIds, ['s2']);
    assert.ok(!Object.keys(result).some((k) => /background/i.test(k)));
  });

  await test('partitionSegments() covers segments spanning multiple diarization turns', () => {
    const result = partitionSegments(
      [{ segmentId: 's1' }, { segmentId: 's2' }, { segmentId: 's3' }],
      { turns: [
        { speakerHint: 'pastor', segmentIds: ['s1'] },
        { speakerHint: 'interpreter', segmentIds: ['s3'] }
      ] }
    );
    assert.deepStrictEqual(result.speechSegmentIds, ['s1', 's3']);
    assert.deepStrictEqual(result.unclassifiedSegmentIds, ['s2']);
  });

  await test('createTurnCoverageProvider() exposes the correct provider shape', () => {
    const provider = createTurnCoverageProvider();
    assert.strictEqual(provider.type, 'reference-turn-coverage');
    assert.strictEqual(typeof provider.partitionSegments, 'function');
  });

  // ---------------------------------------------------------------------
  // Real composition with Engine 4's own diarize() output (no mocking)
  // ---------------------------------------------------------------------

  await test('partition() correctly consumes a real Engine 4 diarize() result end-to-end', () => {
    SpeakerDiarizationEngine.__resetForTests();
    SpeakerDiarizationEngine.registerDefaultProvider();
    const diarizationResult = SpeakerDiarizationEngine.diarize([
      { segmentId: 's1', speakerHint: 'pastor' },
      { segmentId: 's2' },
      { segmentId: 's3', speakerHint: 'pastor' }
    ]);
    const result = BackgroundAudioSeparationEngine.partition(
      [{ segmentId: 's1' }, { segmentId: 's2' }, { segmentId: 's3' }],
      diarizationResult
    );
    assert.strictEqual(result.isReal, true);
    assert.deepStrictEqual(result.speechSegmentIds, ['s1', 's3']);
    assert.deepStrictEqual(result.unclassifiedSegmentIds, ['s2']);
  });

  await test('partition() honestly propagates Engine 4\'s own isReal:false when Engine 4 had no hints (no fabrication across the seam)', () => {
    SpeakerDiarizationEngine.__resetForTests();
    SpeakerDiarizationEngine.registerDefaultProvider();
    const diarizationResult = SpeakerDiarizationEngine.diarize([{ segmentId: 's1' }]);
    const result = BackgroundAudioSeparationEngine.partition([{ segmentId: 's1' }], diarizationResult);
    assert.strictEqual(result.isReal, false);
  });

  // ---------------------------------------------------------------------
  // Engine-level: partition()
  // ---------------------------------------------------------------------

  await test('partition() returns a frozen envelope', () => {
    const result = BackgroundAudioSeparationEngine.partition([{ segmentId: 's1' }], { turns: [] });
    assert.throws(() => { result.isReal = true; }, TypeError);
  });

  await test('partition() emits PARTITIONED with the real envelope fields', () => {
    let captured = null;
    const off = BackgroundAudioSeparationEngine.on(BackgroundAudioSeparationEngine.EVENTS.PARTITIONED, (payload) => { captured = payload; });
    BackgroundAudioSeparationEngine.partition(
      [{ segmentId: 's1' }],
      { turns: [{ speakerHint: 'pastor', segmentIds: ['s1'] }] }
    );
    off();
    assert.ok(captured);
    assert.strictEqual(captured.isReal, true);
    assert.strictEqual(captured.speechCount, 1);
    assert.strictEqual(captured.unclassifiedCount, 0);
  });

  await test('partition() throws (fails closed) with no provider registered', () => {
    BackgroundAudioSeparationEngine.__resetForTests();
    assert.throws(() => BackgroundAudioSeparationEngine.partition([{ segmentId: 's1' }], { turns: [] }));
    BackgroundAudioSeparationEngine.registerDefaultProvider();
  });

  // ---------------------------------------------------------------------
  // getCapabilities() — honesty check
  // ---------------------------------------------------------------------

  await test('getCapabilities() reports realAcousticSeparation:false (no unearned claim)', () => {
    const caps = BackgroundAudioSeparationEngine.getCapabilities();
    assert.strictEqual(caps.realAcousticSeparation, false);
    assert.strictEqual(caps.turnCoveragePartitioning, true);
  });

  // ---------------------------------------------------------------------
  // getServiceManifest() / registerWithKernel()
  // ---------------------------------------------------------------------

  await test('getServiceManifest() matches the sibling sub-engines\' exact shape', () => {
    const manifest = BackgroundAudioSeparationEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'background-audio-separation-engine');
    assert.strictEqual(manifest.version, '1.0.0');
    assert.strictEqual(manifest.apiVersion, '1.0.0');
    assert.deepStrictEqual(manifest.dependencies, []);
  });

  await test('registerWithKernel() requires a real Kernel instance (fails closed)', async () => {
    await assert.rejects(() => BackgroundAudioSeparationEngine.registerWithKernel(null));
    await assert.rejects(() => BackgroundAudioSeparationEngine.registerWithKernel({}));
  });

  await test('registerWithKernel() calls kernel.registerEngine() with the real manifest', async () => {
    let receivedManifest = null;
    const fakeKernel = { registerEngine: (manifest) => { receivedManifest = manifest; return { success: true }; } };
    await BackgroundAudioSeparationEngine.registerWithKernel(fakeKernel);
    assert.strictEqual(receivedManifest.name, 'background-audio-separation-engine');
  });

  // ---------------------------------------------------------------------
  // registerProvider() validation
  // ---------------------------------------------------------------------

  await test('registerProvider() rejects a malformed provider (fails closed)', () => {
    assert.throws(() => BackgroundAudioSeparationEngine.registerProvider(null));
    assert.throws(() => BackgroundAudioSeparationEngine.registerProvider({ type: 'x' })); // missing partitionSegments()
  });

  await test('a second, custom provider type can be registered independently', () => {
    const custom = createTurnCoverageProvider('custom');
    assert.strictEqual(BackgroundAudioSeparationEngine.registerProvider(custom), true);
    const result = BackgroundAudioSeparationEngine.partition(
      [{ segmentId: 's1' }],
      { turns: [{ speakerHint: 'pastor', segmentIds: ['s1'] }] },
      { providerType: 'custom' }
    );
    assert.strictEqual(result.isReal, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
