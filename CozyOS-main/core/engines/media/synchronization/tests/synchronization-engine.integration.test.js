/**
 * tests/synchronization-engine.integration.test.js
 *
 * Real, executed end-to-end integration test — Engine 8's crossCheckTiming()
 * fed with the ACTUAL output of Engine 6 (subtitle-timeline-engine.js) and
 * Engine 7 (voice-generation-engine.js), not hand-built fixtures. M388
 * Engine 8, Phase 4 (Verification).
 *
 * Run with: node core/engines/media/synchronization/tests/synchronization-engine.integration.test.js
 */

'use strict';

import assert from 'assert';
import SynchronizationEngine from '../synchronization-engine.js';
import SubtitleTimelineEngine from '../../subtitles/subtitle-timeline-engine.js';
import VoiceGenerationEngine from '../../../../modules/speech/generation/voice-generation-engine.js';

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
  console.log('Synchronization Engine — Phase 4 Integration Verification (real Engine 6 + Engine 7)\n');

  await test('crossCheckTiming() consumes the REAL buildTimeline() output shape without modification', () => {
    SubtitleTimelineEngine.__resetForTests();
    SubtitleTimelineEngine.registerDefaultProvider();
    const timeline = SubtitleTimelineEngine.buildTimeline([
      { segmentId: 's1', text: 'hello', startMs: 0, endMs: 900 },
      { segmentId: 's2', text: 'world', startMs: 1000, endMs: 1900 },
      { segmentId: 's3' } // missing text/timing -> real skip
    ]);
    assert.strictEqual(timeline.skippedSegmentIds.includes('s3'), true);

    const playback = [
      Object.freeze({ segmentId: 's1', played: true, providerId: 'browser', reason: null, realAudioBuffer: false }),
      Object.freeze({ segmentId: 's2', played: false, providerId: null, reason: 'no backend', realAudioBuffer: false })
    ];

    const { results } = SynchronizationEngine.crossCheckTiming(timeline, playback);
    const byId = Object.fromEntries(results.map((r) => [r.segmentId, r.classification]));
    assert.strictEqual(byId.s1, 'aligned');
    assert.strictEqual(byId.s2, 'timing-without-playback');
    assert.strictEqual(byId.s3, 'unresolved'); // skipped by Engine 6, never submitted to Engine 7
  });

  await test('crossCheckTiming() consumes the REAL generateSpeechForSegments() output shape without modification', async () => {
    SubtitleTimelineEngine.__resetForTests();
    SubtitleTimelineEngine.registerDefaultProvider();
    const timeline = SubtitleTimelineEngine.buildTimeline([
      { segmentId: 's1', text: 'hello', startMs: 0, endMs: 900 }
    ]);

    // Real call into Engine 7 with an injected fake backend (the same
    // dependency-injection seam voice-generation-engine.js's own test
    // suite uses) — exercises the REAL generateSpeechForSegments()
    // function body, not a hand-built playback array.
    const fakeVoiceManager = { speak: async () => ({ played: true, providerId: 'fake-provider', reason: null }) };
    const playback = await VoiceGenerationEngine.generateSpeechForSegments(
      [{ segmentId: 's1', text: 'hello' }],
      { voiceManager: fakeVoiceManager }
    );
    // Confirm this is really Engine 7's own honest envelope, not something
    // this test fabricated.
    assert.strictEqual(playback[0].realAudioBuffer, false);

    const { results } = SynchronizationEngine.crossCheckTiming(timeline, playback);
    assert.strictEqual(results[0].classification, 'aligned');
  });

  await test('a fully realistic pipeline slice (Engine 6 real skip + Engine 7 real fail-closed) classifies correctly end to end', async () => {
    SubtitleTimelineEngine.__resetForTests();
    SubtitleTimelineEngine.registerDefaultProvider();
    const timeline = SubtitleTimelineEngine.buildTimeline([
      { segmentId: 's1', text: 'hello', startMs: 0, endMs: 900 },
      { segmentId: 's2' } // real skip, no valid text/timing
    ]);

    // No voiceManager/browserAdapter injected -> Engine 7's own real
    // fail-closed path ("Neither VoiceManager nor CozyTTSBrowserAdapter
    // is available.").
    const playback = await VoiceGenerationEngine.generateSpeechForSegments(
      [{ segmentId: 's1', text: 'hello' }],
      {}
    );
    assert.strictEqual(playback[0].played, false);
    assert.match(playback[0].reason, /Fail closed/);

    const { results, summary } = SynchronizationEngine.crossCheckTiming(timeline, playback);
    const byId = Object.fromEntries(results.map((r) => [r.segmentId, r.classification]));
    assert.strictEqual(byId.s1, 'timing-without-playback'); // real cue, real playback failure
    assert.strictEqual(byId.s2, 'unresolved'); // real skip, never submitted to Engine 7
    assert.strictEqual(summary['timing-without-playback'], 1);
    assert.strictEqual(summary.unresolved, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
