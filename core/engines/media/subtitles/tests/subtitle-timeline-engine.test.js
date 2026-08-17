/**
 * tests/subtitle-timeline-engine.test.js
 *
 * Real, executed tests for core/engines/media/subtitles/* — M388 Engine
 * 6, Phase 4 (Verification).
 * Run with: node core/engines/media/subtitles/tests/subtitle-timeline-engine.test.js
 */

'use strict';

import assert from 'assert';
import SubtitleTimelineEngine from '../subtitle-timeline-engine.js';
import { createSrtFormatterProvider, buildTimeline, toSrt, _formatSrtTimestamp } from '../provider-srt-formatter.js';

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
  SubtitleTimelineEngine.__resetForTests();
  SubtitleTimelineEngine.registerDefaultProvider();

  // ---------------------------------------------------------------------
  // _formatSrtTimestamp() — real, deterministic math
  // ---------------------------------------------------------------------

  await test('_formatSrtTimestamp() formats zero correctly', () => {
    assert.strictEqual(_formatSrtTimestamp(0), '00:00:00,000');
  });

  await test('_formatSrtTimestamp() formats hours/minutes/seconds/millis correctly', () => {
    // 1h 2m 3.456s
    const ms = (1 * 3600 + 2 * 60 + 3) * 1000 + 456;
    assert.strictEqual(_formatSrtTimestamp(ms), '01:02:03,456');
  });

  // ---------------------------------------------------------------------
  // buildTimeline() — real cue construction, skip, and overlap detection
  // ---------------------------------------------------------------------

  await test('buildTimeline() honestly returns an empty envelope for zero segments', () => {
    const result = buildTimeline([]);
    assert.strictEqual(result.isReal, false);
    assert.strictEqual(result.method, 'no-analyzable-signal');
  });

  await test('buildTimeline() honestly skips a segment with no text, never fabricating placeholder text', () => {
    const result = buildTimeline([{ segmentId: 's1', startMs: 0, endMs: 1000 }]);
    assert.strictEqual(result.isReal, false); // nothing valid remained
    assert.deepStrictEqual(result.skippedSegmentIds, ['s1']);
  });

  await test('buildTimeline() honestly skips a segment with invalid timing (endMs <= startMs)', () => {
    const result = buildTimeline([{ segmentId: 's1', text: 'hello', startMs: 1000, endMs: 500 }]);
    assert.deepStrictEqual(result.skippedSegmentIds, ['s1']);
  });

  await test('buildTimeline() builds a real, correctly-ordered cue list', () => {
    const result = buildTimeline([
      { segmentId: 's2', text: 'second', startMs: 1000, endMs: 2000 },
      { segmentId: 's1', text: 'first', startMs: 0, endMs: 900 }
    ]);
    assert.strictEqual(result.isReal, true);
    assert.strictEqual(result.method, 'real-cue-timeline');
    assert.strictEqual(result.cues.length, 2);
    assert.strictEqual(result.cues[0].segmentId, 's1');
    assert.strictEqual(result.cues[0].cueNumber, 1);
    assert.strictEqual(result.cues[1].segmentId, 's2');
    assert.strictEqual(result.cues[1].cueNumber, 2);
  });

  await test('buildTimeline() detects a real overlap and reports it, never silently accepting it', () => {
    const result = buildTimeline([
      { segmentId: 's1', text: 'first', startMs: 0, endMs: 1500 },
      { segmentId: 's2', text: 'second', startMs: 1000, endMs: 2000 }
    ]);
    assert.strictEqual(result.overlaps.length, 1);
    assert.strictEqual(result.overlaps[0].segmentId, 's1');
    assert.strictEqual(result.overlaps[0].overlapsWithSegmentId, 's2');
    // Cues are still built (overlap is reported, not fatal) — never silently dropped either.
    assert.strictEqual(result.cues.length, 2);
  });

  await test('buildTimeline() reports no overlaps for cleanly sequential cues', () => {
    const result = buildTimeline([
      { segmentId: 's1', text: 'first', startMs: 0, endMs: 900 },
      { segmentId: 's2', text: 'second', startMs: 1000, endMs: 2000 }
    ]);
    assert.strictEqual(result.overlaps.length, 0);
  });

  await test('buildTimeline() mixes valid and invalid segments correctly', () => {
    const result = buildTimeline([
      { segmentId: 's1', text: 'valid', startMs: 0, endMs: 900 },
      { segmentId: 's2', startMs: 1000, endMs: 2000 }, // missing text
      { segmentId: 's3', text: '   ', startMs: 2000, endMs: 3000 } // whitespace-only text
    ]);
    assert.strictEqual(result.cues.length, 1);
    assert.deepStrictEqual([...result.skippedSegmentIds].sort(), ['s2', 's3']);
  });

  // ---------------------------------------------------------------------
  // toSrt() — real, deterministic export
  // ---------------------------------------------------------------------

  await test('toSrt() returns an empty string for an empty timeline', () => {
    assert.strictEqual(toSrt({ cues: [] }), '');
  });

  await test('toSrt() produces correct, real SRT text for a real timeline', () => {
    const timeline = buildTimeline([
      { segmentId: 's1', text: 'Hello world', startMs: 0, endMs: 1000 },
      { segmentId: 's2', text: 'Second line', startMs: 1500, endMs: 2500 }
    ]);
    const srt = toSrt(timeline);
    const expected =
      '1\n00:00:00,000 --> 00:00:01,000\nHello world\n\n' +
      '2\n00:00:01,500 --> 00:00:02,500\nSecond line\n';
    assert.strictEqual(srt, expected);
  });

  await test('createSrtFormatterProvider() exposes the correct provider shape', () => {
    const provider = createSrtFormatterProvider();
    assert.strictEqual(provider.type, 'reference-srt-formatter');
    assert.strictEqual(typeof provider.buildTimeline, 'function');
    assert.strictEqual(typeof provider.toSrt, 'function');
  });

  // ---------------------------------------------------------------------
  // Engine-level: buildTimeline() / exportSrt()
  // ---------------------------------------------------------------------

  await test('SubtitleTimelineEngine.buildTimeline() returns a frozen envelope', () => {
    const result = SubtitleTimelineEngine.buildTimeline([{ segmentId: 's1', text: 'hi', startMs: 0, endMs: 500 }]);
    assert.throws(() => { result.isReal = false; }, TypeError);
  });

  await test('SubtitleTimelineEngine.buildTimeline() emits TIMELINE_BUILT with real counts', () => {
    let captured = null;
    const off = SubtitleTimelineEngine.on(SubtitleTimelineEngine.EVENTS.TIMELINE_BUILT, (payload) => { captured = payload; });
    SubtitleTimelineEngine.buildTimeline([
      { segmentId: 's1', text: 'hi', startMs: 0, endMs: 500 },
      { segmentId: 's2', startMs: 600, endMs: 900 }
    ]);
    off();
    assert.ok(captured);
    assert.strictEqual(captured.cueCount, 1);
    assert.strictEqual(captured.skippedCount, 1);
  });

  await test('SubtitleTimelineEngine.buildTimeline() throws (fails closed) with no provider registered', () => {
    SubtitleTimelineEngine.__resetForTests();
    assert.throws(() => SubtitleTimelineEngine.buildTimeline([{ segmentId: 's1', text: 'hi', startMs: 0, endMs: 500 }]));
    SubtitleTimelineEngine.registerDefaultProvider();
  });

  await test('SubtitleTimelineEngine.exportSrt() matches the provider-level toSrt() output exactly', () => {
    const timeline = SubtitleTimelineEngine.buildTimeline([{ segmentId: 's1', text: 'Hi there', startMs: 0, endMs: 1000 }]);
    const srt = SubtitleTimelineEngine.exportSrt(timeline);
    assert.strictEqual(srt, '1\n00:00:00,000 --> 00:00:01,000\nHi there\n');
  });

  // ---------------------------------------------------------------------
  // getCapabilities() — honesty check
  // ---------------------------------------------------------------------

  await test('getCapabilities() reports realTranscriptionOrTiming:false (no unearned claim)', () => {
    const caps = SubtitleTimelineEngine.getCapabilities();
    assert.strictEqual(caps.realTranscriptionOrTiming, false);
    assert.strictEqual(caps.cueTimelineConstruction, true);
    assert.strictEqual(caps.srtExport, true);
  });

  // ---------------------------------------------------------------------
  // getServiceManifest() / registerWithKernel()
  // ---------------------------------------------------------------------

  await test('getServiceManifest() matches the sibling sub-engines\' exact shape', () => {
    const manifest = SubtitleTimelineEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'subtitle-timeline-engine');
    assert.strictEqual(manifest.version, '1.0.0');
    assert.strictEqual(manifest.apiVersion, '1.0.0');
    assert.deepStrictEqual(manifest.dependencies, []);
  });

  await test('registerWithKernel() requires a real Kernel instance (fails closed)', async () => {
    await assert.rejects(() => SubtitleTimelineEngine.registerWithKernel(null));
    await assert.rejects(() => SubtitleTimelineEngine.registerWithKernel({}));
  });

  await test('registerWithKernel() calls kernel.registerEngine() with the real manifest', async () => {
    let receivedManifest = null;
    const fakeKernel = { registerEngine: (manifest) => { receivedManifest = manifest; return { success: true }; } };
    await SubtitleTimelineEngine.registerWithKernel(fakeKernel);
    assert.strictEqual(receivedManifest.name, 'subtitle-timeline-engine');
  });

  // ---------------------------------------------------------------------
  // registerProvider() validation
  // ---------------------------------------------------------------------

  await test('registerProvider() rejects a malformed provider (fails closed)', () => {
    assert.throws(() => SubtitleTimelineEngine.registerProvider(null));
    assert.throws(() => SubtitleTimelineEngine.registerProvider({ type: 'x' })); // missing buildTimeline()/toSrt()
  });

  await test('a second, custom provider type can be registered independently', () => {
    const custom = createSrtFormatterProvider('custom');
    assert.strictEqual(SubtitleTimelineEngine.registerProvider(custom), true);
    const result = SubtitleTimelineEngine.buildTimeline(
      [{ segmentId: 's1', text: 'hi', startMs: 0, endMs: 500 }],
      { providerType: 'custom' }
    );
    assert.strictEqual(result.isReal, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
