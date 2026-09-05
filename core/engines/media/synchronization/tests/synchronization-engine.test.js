/**
 * tests/synchronization-engine.test.js
 *
 * Real, executed tests for core/engines/media/synchronization/* — M388
 * Engine 8, Phase 4 (Verification).
 * Run with: node core/engines/media/synchronization/tests/synchronization-engine.test.js
 */

'use strict';

import assert from 'assert';
import SynchronizationEngine from '../synchronization-engine.js';

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

// Real-shaped fixtures — matching Engine 6's buildTimeline() and Engine
// 7's generateSpeechForSegments() return values exactly (confirmed by
// direct read during Compose/Phase 2 Review).
function timelineOf(cueSegmentIds, skippedSegmentIds = []) {
  return {
    cues: cueSegmentIds.map((segmentId, i) => ({
      cueNumber: i + 1, segmentId, text: `text-${segmentId}`, startMs: i * 1000, endMs: i * 1000 + 900
    })),
    skippedSegmentIds,
    overlaps: [],
    isReal: true,
    method: 'reference'
  };
}

function playbackOf(entries) {
  // entries: [[segmentId, played], ...]
  return entries.map(([segmentId, played]) => Object.freeze({
    segmentId, played, providerId: played ? 'browser' : null, reason: played ? null : 'not played', realAudioBuffer: false
  }));
}

async function run() {
  console.log('Synchronization Engine — Phase 4 Verification\n');

  // ---------------------------------------------------------------------
  // Input validation — fails closed
  // ---------------------------------------------------------------------

  await test('crossCheckTiming() rejects a malformed timeline (fails closed)', () => {
    assert.throws(() => SynchronizationEngine.crossCheckTiming(null, []));
    assert.throws(() => SynchronizationEngine.crossCheckTiming({}, []));
    assert.throws(() => SynchronizationEngine.crossCheckTiming({ cues: [{}], skippedSegmentIds: [] }, [])); // cue missing segmentId
  });

  await test('crossCheckTiming() rejects malformed playbackResults (fails closed)', () => {
    const timeline = timelineOf(['s1']);
    assert.throws(() => SynchronizationEngine.crossCheckTiming(timeline, null));
    assert.throws(() => SynchronizationEngine.crossCheckTiming(timeline, [{ segmentId: 's1' }])); // missing played
    assert.throws(() => SynchronizationEngine.crossCheckTiming(timeline, [{ played: true }])); // missing segmentId
  });

  await test('crossCheckTiming() accepts a well-formed but empty timeline and playback list', () => {
    const result = SynchronizationEngine.crossCheckTiming(timelineOf([]), []);
    assert.deepStrictEqual(result.results, []);
  });

  // ---------------------------------------------------------------------
  // Classification correctness — the core contract
  // ---------------------------------------------------------------------

  await test('classifies a segment with a cue AND successful playback as "aligned"', () => {
    const timeline = timelineOf(['s1']);
    const playback = playbackOf([['s1', true]]);
    const result = SynchronizationEngine.crossCheckTiming(timeline, playback);
    assert.strictEqual(result.results[0].classification, SynchronizationEngine.CLASSIFICATIONS.ALIGNED);
    assert.strictEqual(result.results[0].hasCue, true);
    assert.strictEqual(result.results[0].wasPlayed, true);
  });

  await test('classifies a segment with a cue but played:false as "timing-without-playback"', () => {
    const timeline = timelineOf(['s1']);
    const playback = playbackOf([['s1', false]]);
    const result = SynchronizationEngine.crossCheckTiming(timeline, playback);
    assert.strictEqual(result.results[0].classification, SynchronizationEngine.CLASSIFICATIONS.TIMING_WITHOUT_PLAYBACK);
  });

  await test('classifies a segment with a cue but never submitted to Engine 7 as "timing-without-playback"', () => {
    const timeline = timelineOf(['s1']);
    const result = SynchronizationEngine.crossCheckTiming(timeline, []);
    assert.strictEqual(result.results[0].classification, SynchronizationEngine.CLASSIFICATIONS.TIMING_WITHOUT_PLAYBACK);
  });

  await test('classifies a successfully-played segment with no cue (skipped by Engine 6) as "playback-without-timing"', () => {
    const timeline = timelineOf([], ['s1']); // skipped, no cue
    const playback = playbackOf([['s1', true]]);
    const result = SynchronizationEngine.crossCheckTiming(timeline, playback);
    assert.strictEqual(result.results[0].classification, SynchronizationEngine.CLASSIFICATIONS.PLAYBACK_WITHOUT_TIMING);
  });

  await test('classifies a successfully-played segment never submitted to Engine 6 at all as "playback-without-timing"', () => {
    const timeline = timelineOf([]); // not even in skippedSegmentIds
    const playback = playbackOf([['s1', true]]);
    const result = SynchronizationEngine.crossCheckTiming(timeline, playback);
    assert.strictEqual(result.results[0].classification, SynchronizationEngine.CLASSIFICATIONS.PLAYBACK_WITHOUT_TIMING);
  });

  await test('classifies a segmentId with neither a cue nor a playback result as "unresolved"', () => {
    const timeline = timelineOf([]);
    const result = SynchronizationEngine.crossCheckTiming(timeline, [], { segmentIds: ['ghost'] });
    assert.strictEqual(result.results[0].classification, SynchronizationEngine.CLASSIFICATIONS.UNRESOLVED);
  });

  await test('classifies a skipped-by-Engine-6 segment with played:false as "unresolved" (no timing to check against, playback itself failed)', () => {
    const timeline = timelineOf([], ['s1']);
    const playback = playbackOf([['s1', false]]);
    const result = SynchronizationEngine.crossCheckTiming(timeline, playback);
    assert.strictEqual(result.results[0].classification, SynchronizationEngine.CLASSIFICATIONS.UNRESOLVED);
  });

  await test('a realistic multi-segment mix produces the correct classification for every segment and an accurate summary', () => {
    const timeline = timelineOf(['s1', 's2', 's3'], ['s4']);
    const playback = playbackOf([
      ['s1', true],   // aligned
      ['s2', false],  // timing-without-playback
      ['s5', true],   // playback-without-timing (never in Engine 6 at all)
      ['s4', false]   // unresolved (skipped by Engine 6, and playback failed)
      // s3: has a cue, never submitted to Engine 7 -> timing-without-playback
    ]);
    const { results, summary } = SynchronizationEngine.crossCheckTiming(timeline, playback);
    const byId = Object.fromEntries(results.map((r) => [r.segmentId, r.classification]));
    assert.strictEqual(byId.s1, 'aligned');
    assert.strictEqual(byId.s2, 'timing-without-playback');
    assert.strictEqual(byId.s3, 'timing-without-playback');
    assert.strictEqual(byId.s5, 'playback-without-timing');
    assert.strictEqual(byId.s4, 'unresolved');
    assert.strictEqual(summary.aligned, 1);
    assert.strictEqual(summary['timing-without-playback'], 2);
    assert.strictEqual(summary['playback-without-timing'], 1);
    assert.strictEqual(summary.unresolved, 1);
    assert.strictEqual(results.length, 5);
  });

  await test('an explicit options.segmentIds list restricts classification to exactly those ids', () => {
    const timeline = timelineOf(['s1', 's2']);
    const playback = playbackOf([['s1', true], ['s2', true]]);
    const result = SynchronizationEngine.crossCheckTiming(timeline, playback, { segmentIds: ['s1'] });
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].segmentId, 's1');
  });

  await test('the returned envelope, results array, individual result objects, and summary are all frozen (immutable)', () => {
    const timeline = timelineOf(['s1']);
    const playback = playbackOf([['s1', true]]);
    const result = SynchronizationEngine.crossCheckTiming(timeline, playback);
    assert.ok(Object.isFrozen(result));
    assert.ok(Object.isFrozen(result.results));
    assert.ok(Object.isFrozen(result.results[0]));
    assert.ok(Object.isFrozen(result.summary));
  });

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------

  await test('crossCheckTiming() emits CROSS_CHECKED with an accurate count and summary', () => {
    let captured = null;
    const unsub = SynchronizationEngine.on(SynchronizationEngine.EVENTS.CROSS_CHECKED, (payload) => { captured = payload; });
    SynchronizationEngine.crossCheckTiming(timelineOf(['s1']), playbackOf([['s1', true]]));
    unsub();
    assert.strictEqual(captured.count, 1);
    assert.strictEqual(captured.summary.aligned, 1);
  });

  await test('crossCheckTiming() emits ERROR and rethrows on a validation failure', () => {
    let captured = null;
    const unsub = SynchronizationEngine.on(SynchronizationEngine.EVENTS.ERROR, (payload) => { captured = payload; });
    assert.throws(() => SynchronizationEngine.crossCheckTiming(null, []));
    unsub();
    assert.ok(captured && typeof captured.message === 'string');
  });

  await test('on() with a non-function handler is a safe no-op', () => {
    const unsub = SynchronizationEngine.on('anything', 'not-a-function');
    assert.strictEqual(typeof unsub, 'function');
    assert.doesNotThrow(() => unsub());
  });

  // ---------------------------------------------------------------------
  // Honesty contract — no fabricated drift
  // ---------------------------------------------------------------------

  await test('getCapabilities() honestly reports realDriftMeasurement:false and timingPlaybackCrossCheck:true', () => {
    const caps = SynchronizationEngine.getCapabilities();
    assert.strictEqual(caps.realDriftMeasurement, false);
    assert.strictEqual(caps.timingPlaybackCrossCheck, true);
    assert.deepStrictEqual([...caps.classifications].sort(), ['aligned', 'playback-without-timing', 'timing-without-playback', 'unresolved']);
  });

  await test('no crossCheckTiming() result object ever contains a drift/offset field of any kind (never fabricated)', () => {
    const result = SynchronizationEngine.crossCheckTiming(timelineOf(['s1']), playbackOf([['s1', true]]));
    for (const r of result.results) {
      assert.deepStrictEqual(Object.keys(r).sort(), ['classification', 'hasCue', 'segmentId', 'wasPlayed']);
    }
  });

  // ---------------------------------------------------------------------
  // Service manifest / kernel registration
  // ---------------------------------------------------------------------

  await test('getServiceManifest() declares dependency on Engine 6 and Engine 7 by name', () => {
    const manifest = SynchronizationEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'synchronization-engine');
    assert.deepStrictEqual(manifest.dependencies, ['SubtitleTimelineEngine', 'VoiceGenerationEngine']);
  });

  await test('registerWithKernel() requires a real Kernel instance (fails closed)', async () => {
    await assert.rejects(() => SynchronizationEngine.registerWithKernel(null));
    await assert.rejects(() => SynchronizationEngine.registerWithKernel({}));
  });

  await test('registerWithKernel() calls kernel.registerEngine() with the real manifest', async () => {
    let received = null;
    const kernel = { registerEngine: async (manifest) => { received = manifest; return { success: true }; } };
    await SynchronizationEngine.registerWithKernel(kernel);
    assert.strictEqual(received.name, 'synchronization-engine');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
