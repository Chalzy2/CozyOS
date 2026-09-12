/**
 * =============================================================================
 * CozyOS Media Engine — Streaming/Playback Pipeline Engine (M388 Engine 10)
 * File: core/engines/media/streaming/streaming-pipeline-engine.js
 * =============================================================================
 *
 * HONEST SCOPE (per M388-E10-StreamingPipeline-Compose.md, Phase 1/2)
 * ------------------------------------------------------------------------
 * No WebRTC or other low-latency network transport exists anywhere in this
 * repository (MD-013, confirmed again at this engine's own Phase 0). This
 * engine therefore does NOT, and cannot honestly, provide real network
 * streaming, real playback timing, or real clock synchronization. It is a
 * real, deterministic PER-STREAM SEGMENT LATENCY/THROUGHPUT INSTRUMENTATION
 * SIDECAR over `modules/live/cozy-live.js`'s existing, real Stream /
 * TranslationStream object model (`createStream`/`setStreamStatus`/
 * `relaySpeechSegment`) — it composes real, already-recorded segment
 * timestamps with a real, caller-supplied observation time into real
 * per-stream metrics. It never fabricates a latency/throughput figure that
 * wasn't computed from a real observation. `getCapabilities().
 * realLowLatencyTransport` stays honestly `false` — this engine does not
 * resolve MD-013's core transport gap, only instruments the existing state
 * model around it, same honesty boundary Engine 1/9 drew for decode/encode.
 *
 * SCOPE BOUNDARIES (Final Implementation Contract, 7 items,
 * M388-E10-StreamingPipeline-Compose.md, Phase 2)
 * ------------------------------------------------------------------------
 * 1. New file only, under core/engines/media/streaming/.
 * 2. modules/live/cozy-live.js and core/engines/playback/playback-engine.js
 *    remain untouched — composition only, via cozy-live.js's existing
 *    public API (getStream/listStreams/etc.), never its internals.
 * 3. One additive REGISTRATIONS entry in engine-bridge-bootstrap.js.
 * 4. Never fabricates a latency/throughput figure that wasn't computed from
 *    a real, caller-supplied observation — getStreamMetrics() returns null
 *    fields rather than 0 or an invented default when no real observation
 *    exists yet.
 * 5. getCapabilities().realLowLatencyTransport stays honestly false.
 * 6. Does not implement Engine 11 (Video Interpreter Coordinator) — Locked
 *    per Rule 68.
 * 7. Fails closed, never throws on a stream that doesn't exist by
 *    swallowing/fabricating success — beginStreamTracking() surfaces
 *    cozy-live.js's own real getStream() error rather than swallowing it.
 * =============================================================================
 */

'use strict';

const EVENTS = Object.freeze({
  TRACKING_STARTED: 'streaming-pipeline:tracking-started',
  SEGMENT_RECORDED: 'streaming-pipeline:segment-recorded',
  TRACKING_ENDED: 'streaming-pipeline:tracking-ended',
  ATTACHED: 'streaming-pipeline:attached-to-coordinator',
  ERROR: 'streaming-pipeline:error'
});

const listeners = new Map();
let attachedCoordinatorAdapterId = null;

// streamId -> { sessionId, roomId, startedAt, observations: [{segmentId, latencyMs: number|null}] }
const trackedStreams = new Map();

function on(eventName, handler) {
  if (typeof handler !== 'function') return () => {};
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  listeners.get(eventName).add(handler);
  return () => listeners.get(eventName)?.delete(handler);
}

function emit(eventName, payload) {
  const handlers = listeners.get(eventName);
  if (!handlers) return;
  for (const handler of handlers) handler(payload);
}

function _throwTypeError(message) {
  const err = new TypeError(`[StreamingPipelineEngine] ${message}`);
  emit(EVENTS.ERROR, { message: err.message });
  throw err;
}

function _isValidSegment(segment) {
  return Boolean(segment && typeof segment === 'object' && typeof segment.segmentId === 'string' && segment.segmentId.length > 0);
}

/**
 * Begins latency/throughput tracking for a real, already-existing Stream.
 * Fails closed: never swallows or fabricates success for a stream that
 * doesn't exist — the caller sees cozy-live.js's own real getStream()
 * error (e.g. its NOT_FOUND CozyLiveError) unmodified.
 * @param {{getStream: Function}} cozyLive - the running cozy-live.js module instance
 * @param {string} sessionId
 * @param {string} roomId
 * @param {string} streamId
 * @returns {Readonly<{streamId: string, sessionId: string, roomId: string, startedAt: number}>}
 */
function beginStreamTracking(cozyLive, sessionId, roomId, streamId) {
  if (!cozyLive || typeof cozyLive.getStream !== 'function') {
    _throwTypeError('beginStreamTracking() requires a real cozy-live.js module instance exposing getStream().');
  }
  if (typeof streamId !== 'string' || streamId.length === 0) {
    _throwTypeError('beginStreamTracking() requires a real streamId string.');
  }

  // Real validation against cozy-live.js's own Stream registry — no
  // try/catch here on purpose: a stream that doesn't exist must surface
  // cozy-live.js's own real error, not a swallowed/fabricated success
  // (Final Implementation Contract item 7).
  const stream = cozyLive.getStream(sessionId, roomId, streamId);

  const record = { sessionId, roomId, startedAt: Date.now(), observations: [] };
  trackedStreams.set(streamId, record);

  const result = Object.freeze({ streamId, sessionId, roomId, startedAt: record.startedAt, streamStatus: stream.status });
  emit(EVENTS.TRACKING_STARTED, result);
  return result;
}

/**
 * Records a real relay observation for a stream already under tracking.
 * Computes latencyMs = observedAtMs - segment.timestamp only when
 * segment.timestamp is a real, finite number — never invents a latency
 * figure (Final Implementation Contract item 4).
 * @param {string} streamId
 * @param {{segmentId: string, timestamp?: number}} segment - as returned by cozy-live.js's relaySpeechSegment()-recorded segment (getSegment()/getTimeline() shape)
 * @param {number} observedAtMs - real Date.now() at the point the caller actually observed/delivered the segment
 * @returns {Readonly<{streamId: string, segmentId: string, latencyMs: number|null}>}
 */
function recordSegmentRelay(streamId, segment, observedAtMs) {
  if (typeof streamId !== 'string' || streamId.length === 0) {
    _throwTypeError('recordSegmentRelay() requires a real streamId string.');
  }
  if (!trackedStreams.has(streamId)) {
    _throwTypeError(`recordSegmentRelay() called for stream "${streamId}" which is not under tracking — call beginStreamTracking() first.`);
  }
  if (!_isValidSegment(segment)) {
    _throwTypeError('recordSegmentRelay() requires a real segment object with a string segmentId.');
  }
  if (typeof observedAtMs !== 'number' || !Number.isFinite(observedAtMs)) {
    _throwTypeError('recordSegmentRelay() requires a real, finite observedAtMs (Date.now() at the point of observation).');
  }

  const hasRealTimestamp = typeof segment.timestamp === 'number' && Number.isFinite(segment.timestamp);
  const latencyMs = hasRealTimestamp ? observedAtMs - segment.timestamp : null;

  const record = trackedStreams.get(streamId);
  record.observations.push({ segmentId: segment.segmentId, latencyMs });

  const result = Object.freeze({ streamId, segmentId: segment.segmentId, latencyMs });
  emit(EVENTS.SEGMENT_RECORDED, result);
  return result;
}

/**
 * Real, computed per-stream metrics — only from real recorded
 * observations. Returns null fields (never 0 or an invented default) when
 * no real latency observation exists yet (Final Implementation Contract
 * item 4).
 * @param {string} streamId
 * @returns {Readonly<{streamId: string, segmentCount: number, averageLatencyMs: number|null, minLatencyMs: number|null, maxLatencyMs: number|null}>}
 */
function getStreamMetrics(streamId) {
  if (!trackedStreams.has(streamId)) {
    _throwTypeError(`getStreamMetrics() called for stream "${streamId}" which is not under tracking — call beginStreamTracking() first.`);
  }
  const record = trackedStreams.get(streamId);
  const latencies = record.observations.map((o) => o.latencyMs).filter((v) => typeof v === 'number' && Number.isFinite(v));

  const averageLatencyMs = latencies.length > 0 ? latencies.reduce((sum, v) => sum + v, 0) / latencies.length : null;
  const minLatencyMs = latencies.length > 0 ? Math.min(...latencies) : null;
  const maxLatencyMs = latencies.length > 0 ? Math.max(...latencies) : null;

  return Object.freeze({
    streamId,
    segmentCount: record.observations.length,
    averageLatencyMs,
    minLatencyMs,
    maxLatencyMs
  });
}

/**
 * Clears this engine's own tracking state for a stream. Does NOT call
 * cozy-live.js's removeStream() — the underlying Stream's lifecycle stays
 * owned by cozy-live.js (Compose §"Public surface").
 * @param {string} streamId
 * @returns {boolean}
 */
function endStreamTracking(streamId) {
  if (!trackedStreams.has(streamId)) {
    _throwTypeError(`endStreamTracking() called for stream "${streamId}" which is not under tracking.`);
  }
  trackedStreams.delete(streamId);
  emit(EVENTS.TRACKING_ENDED, { streamId });
  return true;
}

/** Honest capability report — no fabricated support claims. */
function getCapabilities() {
  return Object.freeze({
    // Real, computed per-stream segment latency/throughput instrumentation,
    // deterministic from cozy-live.js's real Stream state + caller-
    // supplied real observations.
    supportsSegmentLatencyInstrumentation: true,
    // No real WebRTC/streaming-transcode transport exists anywhere in this
    // repository (MD-013, open) — this engine instruments the existing
    // Stream/TranslationStream state model, it does not provide real
    // network streaming, real playback timing, or real clock
    // synchronization.
    realLowLatencyTransport: false,
    honestLimitation: 'No WebRTC or other low-latency network transport exists in this repository (MD-013, open) — this engine computes real per-stream segment latency/throughput metrics from cozy-live.js\'s real recorded segment timestamps and real caller-supplied observation times, but never fabricates a transport-level latency it did not observe.'
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'streaming-pipeline-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 23,
    mandatory: false,
    // Composes cozy-live.js's real Stream API but has no hard, blocking
    // dependency wired within M388 (same soft-dependency stance as prior
    // engines) — the caller supplies a real cozy-live.js instance directly
    // to beginStreamTracking().
    dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[StreamingPipelineEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

/**
 * Registers this engine as a plain-data adapter descriptor into the
 * EXISTING cozy-media.js coordinator's registry — same composition
 * pattern as Engine 1/9's own attachToCoordinator(). cozy-media.js itself
 * is never modified.
 * @param {object} cozyMedia - the running window.CozyOS.CozyMedia instance
 */
function attachToCoordinator(cozyMedia) {
  if (!cozyMedia || typeof cozyMedia.Adapters?.register !== 'function') {
    throw new Error('[StreamingPipelineEngine] attachToCoordinator() requires a real cozy-media.js CozyMedia instance.');
  }
  const adapterResult = cozyMedia.Adapters.register({
    name: 'streaming-pipeline-engine',
    kind: 'stream-latency-instrumentation-adapter',
    version: '1.0.0',
    capabilities: ['segment-latency-instrumentation']
  });
  if (!adapterResult.success) {
    throw new Error('[StreamingPipelineEngine] failed to register adapter descriptor: ' + adapterResult.reason);
  }
  attachedCoordinatorAdapterId = adapterResult.data.id;
  emit(EVENTS.ATTACHED, { adapterId: adapterResult.data.id });
  return Object.freeze({ adapterId: adapterResult.data.id });
}

function getStatus() {
  return Object.freeze({
    attachedToCoordinator: Boolean(attachedCoordinatorAdapterId),
    adapterId: attachedCoordinatorAdapterId,
    trackedStreamCount: trackedStreams.size
  });
}

function __resetForTests() {
  attachedCoordinatorAdapterId = null;
  trackedStreams.clear();
  listeners.clear();
}

const StreamingPipelineEngine = Object.freeze({
  EVENTS,
  on,
  beginStreamTracking,
  recordSegmentRelay,
  getStreamMetrics,
  endStreamTracking,
  getCapabilities,
  getStatus,
  attachToCoordinator,
  getServiceManifest,
  registerWithKernel,
  __resetForTests
});

export default StreamingPipelineEngine;
