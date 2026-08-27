/**
 * tests/media-encode-engine.test.js
 *
 * Real, executed tests for core/engines/media/encode/* — M388 Engine 9,
 * Phase 4 (Verification).
 * Run with: node core/engines/media/encode/tests/media-encode-engine.test.js
 */

'use strict';

import assert from 'assert';
import MediaEncodeEngine from '../media-encode-engine.js';

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

function makeDecodeResult(overrides = {}) {
  return {
    audioTrack: null,
    videoTrackRef: { kind: 'video', container: 'mp4', isReal: false, envelope: 'structural-reference-not-real-codec' },
    metadata: { container: 'mp4', byteLength: 12345 },
    ...overrides
  };
}

function makeFakeCozyMedia() {
  let seq = 0;
  const adapters = new Map();
  const pipelines = new Map();
  return {
    Adapters: {
      register(desc) {
        const id = `adapter_${++seq}`;
        adapters.set(id, desc);
        return { success: true, data: { id } };
      }
    },
    Pipelines: {
      register(desc) {
        const id = `pipeline_${++seq}`;
        pipelines.set(id, desc);
        return { success: true, data: { id } };
      }
    },
    _adapters: adapters,
    _pipelines: pipelines
  };
}

async function run() {
  MediaEncodeEngine.__resetForTests();

  // ---------------------------------------------------------------------
  // buildEncodePlan() — validation (fail closed, honest)
  // ---------------------------------------------------------------------

  await test('buildEncodePlan() throws TypeError on invalid decodeResult', () => {
    assert.throws(() => MediaEncodeEngine.buildEncodePlan(null, [], { results: [] }), TypeError);
    assert.throws(() => MediaEncodeEngine.buildEncodePlan({}, [], { results: [] }), TypeError);
  });

  await test('buildEncodePlan() throws TypeError on invalid speechResults', () => {
    assert.throws(() => MediaEncodeEngine.buildEncodePlan(makeDecodeResult(), 'not-an-array', { results: [] }), TypeError);
    assert.throws(() => MediaEncodeEngine.buildEncodePlan(makeDecodeResult(), [{ segmentId: 's1' }], { results: [] }), TypeError);
  });

  await test('buildEncodePlan() throws TypeError on invalid syncResult', () => {
    assert.throws(() => MediaEncodeEngine.buildEncodePlan(makeDecodeResult(), [], null), TypeError);
    assert.throws(() => MediaEncodeEngine.buildEncodePlan(makeDecodeResult(), [], { results: [{ segmentId: 's1' }] }), TypeError);
  });

  // ---------------------------------------------------------------------
  // buildEncodePlan() — real, deterministic composition
  // ---------------------------------------------------------------------

  await test('buildEncodePlan() includes a segment only when ALIGNED and played=true', () => {
    const decodeResult = makeDecodeResult();
    const speechResults = [
      { segmentId: 's1', played: true, providerId: 'p', reason: null, realAudioBuffer: false },
      { segmentId: 's2', played: false, providerId: 'p', reason: 'failed', realAudioBuffer: false },
      { segmentId: 's3', played: true, providerId: 'p', reason: null, realAudioBuffer: false }
    ];
    const syncResult = {
      results: [
        { segmentId: 's1', classification: 'aligned', hasCue: true, wasPlayed: true },
        { segmentId: 's2', classification: 'aligned', hasCue: true, wasPlayed: false },
        { segmentId: 's3', classification: 'timing-without-playback', hasCue: true, wasPlayed: false }
      ],
      summary: {}
    };
    const plan = MediaEncodeEngine.buildEncodePlan(decodeResult, speechResults, syncResult);
    assert.strictEqual(plan.realEncode, false);
    assert.strictEqual(plan.summary.totalSegments, 3);
    assert.strictEqual(plan.summary.includedSegments, 1);
    assert.strictEqual(plan.summary.excludedSegments, 2);
    const s1 = plan.audioTrackPlan.find((e) => e.segmentId === 's1');
    assert.strictEqual(s1.includedInMux, true);
    const s2 = plan.audioTrackPlan.find((e) => e.segmentId === 's2');
    assert.strictEqual(s2.includedInMux, false); // aligned but not played
    const s3 = plan.audioTrackPlan.find((e) => e.segmentId === 's3');
    assert.strictEqual(s3.includedInMux, false); // played is false in syncResult context, and not aligned
  });

  await test('buildEncodePlan() never fabricates: a segment with no matching speech result is excluded, not defaulted to played', () => {
    const decodeResult = makeDecodeResult();
    const speechResults = [];
    const syncResult = { results: [{ segmentId: 'orphan', classification: 'aligned', hasCue: true, wasPlayed: true }], summary: {} };
    const plan = MediaEncodeEngine.buildEncodePlan(decodeResult, speechResults, syncResult);
    const entry = plan.audioTrackPlan[0];
    assert.strictEqual(entry.played, false);
    assert.strictEqual(entry.includedInMux, false);
  });

  await test('buildEncodePlan() carries through the real video container/track reference, never fabricating bytes', () => {
    const decodeResult = makeDecodeResult({ metadata: { container: 'webm', byteLength: 999 } });
    const plan = MediaEncodeEngine.buildEncodePlan(decodeResult, [], { results: [], summary: {} });
    assert.strictEqual(plan.video.container, 'webm');
    assert.deepStrictEqual(plan.video.videoTrackRef, decodeResult.videoTrackRef);
    assert.strictEqual(plan.envelope, 'structural-mux-plan-not-real-container-bytes');
  });

  await test('buildEncodePlan() emits PLAN_BUILT with honest realEncode:false', () => {
    let captured = null;
    const off = MediaEncodeEngine.on(MediaEncodeEngine.EVENTS.PLAN_BUILT, (payload) => { captured = payload; });
    MediaEncodeEngine.buildEncodePlan(makeDecodeResult(), [], { results: [], summary: {} });
    off();
    assert.ok(captured);
    assert.strictEqual(captured.realEncode, false);
  });

  // ---------------------------------------------------------------------
  // getCapabilities() — honest, never fabricated
  // ---------------------------------------------------------------------

  await test('getCapabilities() honestly reports realEncode:false and describes the limitation', () => {
    const caps = MediaEncodeEngine.getCapabilities();
    assert.strictEqual(caps.realEncode, false);
    assert.strictEqual(caps.supportsMuxPlanning, true);
    assert.ok(typeof caps.honestLimitation === 'string' && caps.honestLimitation.length > 0);
  });

  // ---------------------------------------------------------------------
  // attachToCoordinator() — same composition pattern as Engine 1
  // ---------------------------------------------------------------------

  await test('attachToCoordinator() requires a real cozy-media.js CozyMedia instance', () => {
    assert.throws(() => MediaEncodeEngine.attachToCoordinator(null), /requires a real cozy-media\.js/);
    assert.throws(() => MediaEncodeEngine.attachToCoordinator({}), /requires a real cozy-media\.js/);
  });

  await test('attachToCoordinator() registers a media-mux-adapter + pipeline descriptor', () => {
    MediaEncodeEngine.__resetForTests();
    const cozyMedia = makeFakeCozyMedia();
    const result = MediaEncodeEngine.attachToCoordinator(cozyMedia);
    assert.ok(result.adapterId);
    assert.ok(result.pipelineId);
    const adapterDesc = cozyMedia._adapters.get(result.adapterId);
    assert.strictEqual(adapterDesc.kind, 'media-mux-adapter');
    assert.deepStrictEqual(adapterDesc.capabilities, ['media-encode']);
    assert.strictEqual(MediaEncodeEngine.getStatus().attachedToCoordinator, true);
  });

  // ---------------------------------------------------------------------
  // Manifest / kernel registration — honest, non-mandatory
  // ---------------------------------------------------------------------

  await test('getServiceManifest() reports a real, non-fabricated, non-mandatory manifest', () => {
    const manifest = MediaEncodeEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'media-encode-engine');
    assert.strictEqual(manifest.mandatory, false);
    assert.deepStrictEqual(manifest.dependencies, []);
  });

  await test('registerWithKernel() requires a real Kernel instance', async () => {
    await assert.rejects(() => MediaEncodeEngine.registerWithKernel(null), /requires a real Kernel/);
    let called = false;
    const fakeKernel = { registerEngine: (m) => { called = true; return m; } };
    await MediaEncodeEngine.registerWithKernel(fakeKernel);
    assert.strictEqual(called, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();
