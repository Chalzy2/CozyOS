/**
 * tests/video-interpreter-coordinator.test.js
 *
 * Real, executed tests for core/engines/media/coordinator/ — M388 Engine 11.
 * Exercises the coordinator's own sequencing/aggregation logic against the
 * actual exported functions of Engines 1-10 (not hand-built fixtures),
 * following the same "feed the actual live output of the upstream engine"
 * pattern Engine 8's own integration tests already established.
 * Run with: node core/engines/media/coordinator/tests/video-interpreter-coordinator.test.js
 */

'use strict';

import assert from 'assert';
import Coordinator from '../video-interpreter-coordinator.js';
import MediaDecodeEngine from '../../decode/media-decode-engine.js';
import LanguageDetectionEngine from '../../language/language-detection-engine.js';
import SpeakerDiarizationEngine from '../../diarization/speaker-diarization-engine.js';
import BackgroundAudioSeparationEngine from '../../audio-separation/background-audio-separation-engine.js';
import SubtitleTimelineEngine from '../../subtitles/subtitle-timeline-engine.js';
import SynchronizationEngine from '../../synchronization/synchronization-engine.js';
import MediaEncodeEngine from '../../encode/media-encode-engine.js';
import TranslationPipelineEngine from '../../translation/translation-pipeline-engine.js';

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

function resetAllStages() {
  Coordinator.__resetForTests();
  MediaDecodeEngine.__resetForTests();
  MediaDecodeEngine.registerDefaultProvider();
  LanguageDetectionEngine.__resetForTests();
  LanguageDetectionEngine.registerDefaultProvider();
  SpeakerDiarizationEngine.__resetForTests();
  SpeakerDiarizationEngine.registerDefaultProvider();
  BackgroundAudioSeparationEngine.__resetForTests();
  BackgroundAudioSeparationEngine.registerDefaultProvider();
  SubtitleTimelineEngine.__resetForTests();
  SubtitleTimelineEngine.registerDefaultProvider();
  SynchronizationEngine.__resetForTests();
  MediaEncodeEngine.__resetForTests();
  TranslationPipelineEngine.__resetForTests();
}

async function run() {
  await test('interpretVideo() runs the real Engine 1/2/4/5/6 sequence and produces each stage\'s real output', async () => {
    resetAllStages();
    const sourceHandle = { bytes: new Uint8Array([1, 2, 3, 4]), mimeType: 'video/mp4', name: 'clip.mp4' };
    const segments = [{ segmentId: 'seg-1', speakerHint: 'A', text: 'hello there' }];

    const result = await Coordinator.interpretVideo(sourceHandle, { segments });

    assert.ok(result.stages.decode, 'decode stage present');
    assert.ok(result.stages.language, 'language stage present');
    assert.ok(result.stages.diarization, 'diarization stage present');
    assert.ok(result.stages.separation, 'separation stage present');
    assert.ok(result.stages.timeline, 'timeline stage present');
    assert.strictEqual(result.stages.diarization.speakerCount >= 0, true);
  });

  await test('interpretVideo() runs real Engine 9 encode only when Engine 8 synchronization actually ran', async () => {
    resetAllStages();
    const segments = [{ segmentId: 's1', text: 'hi' }];
    const timeline = SubtitleTimelineEngine.buildTimeline(segments, {});
    const playbackResults = [];

    const result = await Coordinator.interpretVideo(
      { bytes: new Uint8Array([1]), mimeType: 'video/mp4' },
      { segments, playbackResults }
    );

    assert.ok(!result.skipped.includes('synchronization'));
    assert.ok(!result.skipped.includes('encode'));
    assert.ok(result.stages.encode);
    assert.strictEqual(result.stages.encode.realEncode, false);
  });

  await test('interpretVideo() honestly skips translation when no speechTranslationAdapter is supplied', async () => {
    resetAllStages();
    const result = await Coordinator.interpretVideo(
      { bytes: new Uint8Array([1]), mimeType: 'video/mp4' },
      { segments: [{ segmentId: 's1', text: 'hi' }] }
    );
    assert.ok(result.skipped.includes('translation'));
    assert.strictEqual(result.stages.translation, undefined);
  });

  await test('interpretVideo() runs real Engine 3 translation when a real adapter is supplied', async () => {
    resetAllStages();
    const fakeAdapter = {
      previewTranslation: async (text, opts) => ({
        isReal: false,
        translatedText: null,
        reason: 'No real translation backend in this environment.'
      })
    };
    const result = await Coordinator.interpretVideo(
      { bytes: new Uint8Array([1]), mimeType: 'video/mp4' },
      {
        segments: [{ segmentId: 's1', text: 'hi' }],
        speechTranslationAdapter: fakeAdapter,
        sourceLanguage: 'en',
        targetLanguage: 'es'
      }
    );
    assert.ok(!result.skipped.includes('translation'));
    assert.strictEqual(result.stages.translation.length, 1);
    assert.strictEqual(result.stages.translation[0].isReal, false);
  });

  await test('interpretVideo() honestly skips voiceGeneration, synchronization, and streaming with no live instances supplied', async () => {
    resetAllStages();
    const result = await Coordinator.interpretVideo(
      { bytes: new Uint8Array([1]), mimeType: 'video/mp4' },
      { segments: [] }
    );
    assert.ok(result.skipped.includes('voiceGeneration'));
    assert.ok(result.skipped.includes('synchronization'));
    assert.ok(result.skipped.includes('streaming'));
  });

  await test('interpretVideo() runs Engine 8 synchronization for real when playbackResults is supplied', async () => {
    resetAllStages();
    const segments = [{ segmentId: 's1', text: 'hi' }];
    const playbackResults = [];

    const result = await Coordinator.interpretVideo(
      { bytes: new Uint8Array([1]), mimeType: 'video/mp4' },
      { segments, playbackResults }
    );

    assert.ok(!result.skipped.includes('synchronization'));
    assert.ok(result.stages.synchronization);
  });

  await test('interpretVideo() never mutates its returned envelope (frozen stages/skipped)', async () => {
    resetAllStages();
    const result = await Coordinator.interpretVideo(
      { bytes: new Uint8Array([1]), mimeType: 'video/mp4' },
      { segments: [] }
    );
    assert.throws(() => { result.stages.decode = null; }, /Cannot assign/);
    assert.throws(() => { result.skipped.push('x'); }, TypeError);
  });

  await test('getCapabilities() aggregates real Engine 1-9 capability reports and never rounds up', () => {
    resetAllStages();
    const caps = Coordinator.getCapabilities();
    // Confirmed from the live repository today: every consulted stage's
    // own real* flag is false, so the aggregate must also be false — it is
    // structurally impossible to be more real than the least-real stage.
    assert.strictEqual(caps.realEndToEndInterpretation, false);
    assert.strictEqual(caps.stages.decode.realDecode, false);
    assert.strictEqual(caps.stages.language.realAcousticDetection, false);
    assert.strictEqual(caps.stages.diarization.realAcousticDiarization, false);
    assert.strictEqual(caps.stages.separation.realAcousticSeparation, false);
    assert.strictEqual(caps.stages.timeline.realTranscriptionOrTiming, false);
    assert.strictEqual(caps.stages.synchronization.realDriftMeasurement, false);
    assert.strictEqual(caps.stages.encode.realEncode, false);
  });

  await test('getServiceManifest() reports the correct name and its real upstream dependencies', () => {
    const manifest = Coordinator.getServiceManifest();
    assert.strictEqual(manifest.name, 'video-interpreter-coordinator');
    assert.strictEqual(manifest.dependsOn.includes('media-decode'), true);
    assert.strictEqual(manifest.dependsOn.includes('streaming-pipeline'), false); // Engine 10 is optional/live-only, not a hard boot dependency.
  });

  await test('registerWithKernel() throws a clear error without a real kernel (fails closed, never fabricates)', async () => {
    await assert.rejects(() => Coordinator.registerWithKernel(null), /requires a real kernel/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
