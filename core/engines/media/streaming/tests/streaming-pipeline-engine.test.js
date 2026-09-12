/**
 * tests/streaming-pipeline-engine.test.js
 *
 * Real, executed tests for core/engines/media/streaming/* — M388 Engine 10,
 * Phase 4 (Verification).
 * Run with: node core/engines/media/streaming/tests/streaming-pipeline-engine.test.js
 */

'use strict';

import assert from 'assert';
import StreamingPipelineEngine from '../streaming-pipeline-engine.js';

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

class FakeCozyLiveError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function makeFakeCozyLive(streams) {
  return {
    getStream(sessionId, roomId, streamId) {
      const key = `${sessionId}::${roomId}::${streamId}`;
      if (!streams.has(key)) {
        throw new FakeCozyLiveError('NOT_FOUND', `Stream "${streamId}" not found`);
      }
      return streams.get(key);
    }
  };
}

function makeFakeCozyMedia() {
  let seq = 0;
  const adapters = new Map();
  return {
    Adapters: {
      register(desc) {
        const id = `adapter_${++seq}`;
        adapters.set(id, desc);
        return { success: true, data: { id } };
      }
    },
    _adapters: adapters
  };
}

async function run() {
  StreamingPipelineEngine.__resetForTests();

  // ---------------------------------------------------------------------
  // beginStreamTracking() — validation, fails closed on real errors
  // ---------------------------------------------------------------------

  await test('beginStreamTracking() throws TypeError when cozyLive is missing/invalid', () => {
    assert.throws(() => StreamingPipelineEngine.beginStreamTracking(null, 's1', 'r1', 'stream1'), TypeError);
    assert.throws(() => StreamingPipelineEngine.beginStreamTracking({}, 's1', 'r1', 'stream1'), TypeError);
  });

  await test('beginStreamTracking() throws TypeError when streamId is not a real string', () => {
    const cozyLive = makeFakeCozyLive(new Map());
    assert.throws(() => StreamingPipelineEngine.beginStreamTracking(cozyLive, 's1', 'r1', ''), TypeError);
    assert.throws(() => StreamingPipelineEngine.beginStreamTracking(cozyLive, 's1', 'r1', null), TypeError);
  });

  await test('beginStreamTracking() surfaces cozy-live.js\'s own real error for a stream that does not exist (fails closed, never fabricates success)', () => {
    const cozyLive = makeFakeCozyLive(new Map());
    assert.throws(() => StreamingPipelineEngine.beginStreamTracking(cozyLive, 's1', 'r1', 'ghost-stream'), FakeCozyLiveError);
  });

  await test('beginStreamTracking() succeeds for a real, existing stream and returns real metadata', () => {
    StreamingPipelineEngine.__resetForTests();
    const streams = new Map([['s1::r1::stream1', { id: 'stream1', status: 'LIVE' }]]);
    const cozyLive = makeFakeCozyLive(streams);
    const result = StreamingPipelineEngine.beginStreamTracking(cozyLive, 's1', 'r1', 'stream1');
    assert.strictEqual(result.streamId, 'stream1');
    assert.strictEqual(result.streamStatus, 'LIVE');
    assert.ok(typeof result.startedAt === 'number');
  });

  await test('beginStreamTracking() emits TRACKING_STARTED', () => {
    StreamingPipelineEngine.__resetForTests();
    const streams = new Map([['s1::r1::stream1', { id: 'stream1', status: 'LIVE' }]]);
    const cozyLive = makeFakeCozyLive(streams);
    let captured = null;
    const off = StreamingPipelineEngine.on(StreamingPipelineEngine.EVENTS.TRACKING_STARTED, (p) => { captured = p; });
    StreamingPipelineEngine.beginStreamTracking(cozyLive, 's1', 'r1', 'stream1');
    off();
    assert.ok(captured);
    assert.strictEqual(captured.streamId, 'stream1');
  });

  // ---------------------------------------------------------------------
  // recordSegmentRelay() — real, never-fabricated latency computation
  // ---------------------------------------------------------------------

  function beginTrackedStream(streamId = 'stream1') {
    StreamingPipelineEngine.__resetForTests();
    const streams = new Map([[`s1::r1::${streamId}`, { id: streamId, status: 'LIVE' }]]);
    const cozyLive = makeFakeCozyLive(streams);
    StreamingPipelineEngine.beginStreamTracking(cozyLive, 's1', 'r1', streamId);
    return streamId;
  }

  await test('recordSegmentRelay() throws when the stream is not under tracking', () => {
    StreamingPipelineEngine.__resetForTests();
    assert.throws(() => StreamingPipelineEngine.recordSegmentRelay('unknown-stream', { segmentId: 'seg1' }, Date.now()), TypeError);
  });

  await test('recordSegmentRelay() throws TypeError on an invalid segment', () => {
    const streamId = beginTrackedStream();
    assert.throws(() => StreamingPipelineEngine.recordSegmentRelay(streamId, null, Date.now()), TypeError);
    assert.throws(() => StreamingPipelineEngine.recordSegmentRelay(streamId, {}, Date.now()), TypeError);
  });

  await test('recordSegmentRelay() throws TypeError on a non-finite observedAtMs', () => {
    const streamId = beginTrackedStream();
    assert.throws(() => StreamingPipelineEngine.recordSegmentRelay(streamId, { segmentId: 'seg1' }, NaN), TypeError);
    assert.throws(() => StreamingPipelineEngine.recordSegmentRelay(streamId, { segmentId: 'seg1' }, 'now'), TypeError);
  });

  await test('recordSegmentRelay() computes a real latencyMs from a real segment.timestamp', () => {
    const streamId = beginTrackedStream();
    const result = StreamingPipelineEngine.recordSegmentRelay(streamId, { segmentId: 'seg1', timestamp: 1000 }, 1250);
    assert.strictEqual(result.latencyMs, 250);
    assert.strictEqual(result.segmentId, 'seg1');
  });

  await test('recordSegmentRelay() never invents a latency when segment.timestamp is not a real number', () => {
    const streamId = beginTrackedStream();
    const result = StreamingPipelineEngine.recordSegmentRelay(streamId, { segmentId: 'seg-no-ts' }, Date.now());
    assert.strictEqual(result.latencyMs, null);
  });

  await test('recordSegmentRelay() emits SEGMENT_RECORDED', () => {
    const streamId = beginTrackedStream();
    let captured = null;
    const off = StreamingPipelineEngine.on(StreamingPipelineEngine.EVENTS.SEGMENT_RECORDED, (p) => { captured = p; });
    StreamingPipelineEngine.recordSegmentRelay(streamId, { segmentId: 'seg1', timestamp: 1000 }, 1100);
    off();
    assert.ok(captured);
    assert.strictEqual(captured.latencyMs, 100);
  });

  // ---------------------------------------------------------------------
  // getStreamMetrics() — real computation only, null when no real data
  // ---------------------------------------------------------------------

  await test('getStreamMetrics() throws when the stream is not under tracking', () => {
    StreamingPipelineEngine.__resetForTests();
    assert.throws(() => StreamingPipelineEngine.getStreamMetrics('unknown-stream'), TypeError);
  });

  await test('getStreamMetrics() returns null latency fields (never 0 or a guess) when no segment has been recorded yet', () => {
    const streamId = beginTrackedStream();
    const metrics = StreamingPipelineEngine.getStreamMetrics(streamId);
    assert.strictEqual(metrics.segmentCount, 0);
    assert.strictEqual(metrics.averageLatencyMs, null);
    assert.strictEqual(metrics.minLatencyMs, null);
    assert.strictEqual(metrics.maxLatencyMs, null);
  });

  await test('getStreamMetrics() computes real average/min/max only over real (non-null) latency observations', () => {
    const streamId = beginTrackedStream();
    StreamingPipelineEngine.recordSegmentRelay(streamId, { segmentId: 'seg1', timestamp: 1000 }, 1100); // latency 100
    StreamingPipelineEngine.recordSegmentRelay(streamId, { segmentId: 'seg2', timestamp: 1000 }, 1300); // latency 300
    StreamingPipelineEngine.recordSegmentRelay(streamId, { segmentId: 'seg3' }, Date.now()); // latency null, not fabricated
    const metrics = StreamingPipelineEngine.getStreamMetrics(streamId);
    assert.strictEqual(metrics.segmentCount, 3);
    assert.strictEqual(metrics.averageLatencyMs, 200);
    assert.strictEqual(metrics.minLatencyMs, 100);
    assert.strictEqual(metrics.maxLatencyMs, 300);
  });

  // ---------------------------------------------------------------------
  // endStreamTracking() — clears own state only, never touches cozy-live.js
  // ---------------------------------------------------------------------

  await test('endStreamTracking() throws when the stream is not under tracking', () => {
    StreamingPipelineEngine.__resetForTests();
    assert.throws(() => StreamingPipelineEngine.endStreamTracking('unknown-stream'), TypeError);
  });

  await test('endStreamTracking() clears this engine\'s own tracking state and emits TRACKING_ENDED', () => {
    const streamId = beginTrackedStream();
    StreamingPipelineEngine.recordSegmentRelay(streamId, { segmentId: 'seg1', timestamp: 1000 }, 1100);
    let captured = null;
    const off = StreamingPipelineEngine.on(StreamingPipelineEngine.EVENTS.TRACKING_ENDED, (p) => { captured = p; });
    const result = StreamingPipelineEngine.endStreamTracking(streamId);
    off();
    assert.strictEqual(result, true);
    assert.ok(captured);
    assert.throws(() => StreamingPipelineEngine.getStreamMetrics(streamId), TypeError);
  });

  // ---------------------------------------------------------------------
  // getCapabilities() — honest, never fabricated
  // ---------------------------------------------------------------------

  await test('getCapabilities() honestly reports realLowLatencyTransport:false and describes the limitation', () => {
    const caps = StreamingPipelineEngine.getCapabilities();
    assert.strictEqual(caps.realLowLatencyTransport, false);
    assert.strictEqual(caps.supportsSegmentLatencyInstrumentation, true);
    assert.ok(typeof caps.honestLimitation === 'string' && caps.honestLimitation.length > 0);
  });

  // ---------------------------------------------------------------------
  // attachToCoordinator() — same composition pattern as Engine 1/9
  // ---------------------------------------------------------------------

  await test('attachToCoordinator() requires a real cozy-media.js CozyMedia instance', () => {
    assert.throws(() => StreamingPipelineEngine.attachToCoordinator(null), /requires a real cozy-media\.js/);
    assert.throws(() => StreamingPipelineEngine.attachToCoordinator({}), /requires a real cozy-media\.js/);
  });

  await test('attachToCoordinator() registers a stream-latency-instrumentation-adapter descriptor', () => {
    StreamingPipelineEngine.__resetForTests();
    const cozyMedia = makeFakeCozyMedia();
    const result = StreamingPipelineEngine.attachToCoordinator(cozyMedia);
    assert.ok(result.adapterId);
    const adapterDesc = cozyMedia._adapters.get(result.adapterId);
    assert.strictEqual(adapterDesc.kind, 'stream-latency-instrumentation-adapter');
    assert.deepStrictEqual(adapterDesc.capabilities, ['segment-latency-instrumentation']);
    assert.strictEqual(StreamingPipelineEngine.getStatus().attachedToCoordinator, true);
  });

  // ---------------------------------------------------------------------
  // Manifest / kernel registration — honest, non-mandatory
  // ---------------------------------------------------------------------

  await test('getServiceManifest() reports a real, non-fabricated, non-mandatory manifest', () => {
    const manifest = StreamingPipelineEngine.getServiceManifest();
    assert.strictEqual(manifest.name, 'streaming-pipeline-engine');
    assert.strictEqual(manifest.mandatory, false);
    assert.deepStrictEqual(manifest.dependencies, []);
  });

  await test('registerWithKernel() requires a real Kernel instance', async () => {
    await assert.rejects(() => StreamingPipelineEngine.registerWithKernel(null), /requires a real Kernel/);
    let called = false;
    const fakeKernel = { registerEngine: (m) => { called = true; return m; } };
    await StreamingPipelineEngine.registerWithKernel(fakeKernel);
    assert.strictEqual(called, true);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run();
