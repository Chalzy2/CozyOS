/**
 * =============================================================================
 * CozyOS Media Engine — Media Encode Engine (M388 Engine 9)
 * File: core/engines/media/encode/media-encode-engine.js
 * =============================================================================
 *
 * HONEST SCOPE (Rule 6, per M388-E9-MediaEncode-Compose.md §4 / Phase 2)
 * ------------------------------------------------------------------------
 * Neither of Engine 9's real upstream inputs carries real bytes today:
 * Engine 1's videoTrackRef is a structural placeholder (realDecode: false,
 * confirmed in provider-inmemory.js), and Engine 7's generated speech is
 * realAudioBuffer: false in every code path (MD-020). This engine therefore
 * does not, and cannot honestly, mux real encoded media this pass. It
 * instead produces a real, deterministic MUX PLAN — a computed, structural
 * description of exactly which generated-speech segments would be muxed
 * into the original video track, cross-referenced against Engine 8's real
 * timing classification — while getCapabilities().realEncode stays false
 * and no byte output is fabricated. MD-009 (encode half) and MD-020 remain
 * open, carried forward unchanged.
 *
 * SCOPE BOUNDARIES (Final Implementation Contract, 7 items,
 * M388-E9-MediaEncode-Compose.md, Phase 2)
 * ------------------------------------------------------------------------
 * 1. New file only, under core/engines/media/encode/.
 * 2. One additive REGISTRATIONS entry in engine-bridge-bootstrap.js.
 *    media-pipeline-manager.js, record-export-session-manager.js,
 *    codec-encoding-engine.js/codec-decoding-engine.js (still absent,
 *    MD-004) all remain untouched.
 * 3. Attaches only via cozy-media.js's existing Adapters/Pipelines
 *    registries (attachToCoordinator()), same pattern as Engine 1 —
 *    cozy-media.js itself untouched.
 * 4. Honest structural envelope only — never claims realEncode: true,
 *    never fabricates encoded byte output; does not resolve MD-009 or
 *    MD-020.
 * 5. Consumes, does not duplicate — reads Engine 1's videoTrackRef,
 *    Engine 7's per-segment generation result, and Engine 8's
 *    crossCheckTiming() output as-is.
 * 6. Does not attempt to resolve MD-004.
 * 7. Does not implement Engine 10 or Engine 11.
 * =============================================================================
 */

'use strict';

const EVENTS = Object.freeze({
  PLAN_BUILT: 'media-encode:plan-built',
  ATTACHED: 'media-encode:attached-to-coordinator',
  ERROR: 'media-encode:error'
});

const listeners = new Map();
let attachedCoordinatorAdapterId = null;

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

function _isValidDecodeResult(decodeResult) {
  return Boolean(decodeResult && typeof decodeResult === 'object' && 'videoTrackRef' in decodeResult && decodeResult.metadata && typeof decodeResult.metadata === 'object');
}

function _isValidSpeechResults(speechResults) {
  return Array.isArray(speechResults) && speechResults.every((r) => r && typeof r.segmentId === 'string' && typeof r.played === 'boolean');
}

function _isValidSyncResult(syncResult) {
  return Boolean(syncResult && Array.isArray(syncResult.results) && syncResult.results.every((r) => r && typeof r.segmentId === 'string' && typeof r.classification === 'string'));
}

/**
 * Core method (Compose §6/Phase 2 item 4). Builds a real, deterministic
 * mux plan from Engine 1/7/8's actual outputs — never fabricates encoded
 * bytes, never claims realEncode: true.
 * @param {{audioTrack: object|null, videoTrackRef: object|null, metadata: object}} decodeResult - Engine 1's decodeMedia() return value.
 * @param {Array<{segmentId: string, played: boolean, providerId: string|null, reason: string|null, realAudioBuffer: boolean}>} speechResults - Engine 7's generateSpeechForSegments() return value.
 * @param {{results: Array<{segmentId: string, classification: string, hasCue: boolean, wasPlayed: boolean}>, summary: object}} syncResult - Engine 8's crossCheckTiming() return value.
 * @returns {{video: object, audioTrackPlan: object[], summary: object, realEncode: boolean, envelope: string}}
 */
function buildEncodePlan(decodeResult, speechResults, syncResult) {
  if (!_isValidDecodeResult(decodeResult)) {
    const err = new TypeError('[MediaEncodeEngine] buildEncodePlan() requires a decodeResult shaped like Engine 1\'s decodeMedia() return value ({videoTrackRef, metadata}).');
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }
  if (!_isValidSpeechResults(speechResults)) {
    const err = new TypeError('[MediaEncodeEngine] buildEncodePlan() requires speechResults shaped like Engine 7\'s generateSpeechForSegments() return value ([{segmentId, played, ...}]).');
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }
  if (!_isValidSyncResult(syncResult)) {
    const err = new TypeError('[MediaEncodeEngine] buildEncodePlan() requires a syncResult shaped like Engine 8\'s crossCheckTiming() return value ({results: [{segmentId, classification, ...}]}).');
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }

  const speechBySegmentId = new Map(speechResults.map((r) => [r.segmentId, r]));

  // A segment is honestly includable in the mux plan only when Engine 8
  // classified it ALIGNED (real cue + real playback attempt both present)
  // AND Engine 7 actually reports it played — never inferred, never
  // defaulted to true.
  const audioTrackPlan = syncResult.results.map((syncEntry) => {
    const speech = speechBySegmentId.get(syncEntry.segmentId) ?? null;
    const includedInMux = syncEntry.classification === 'aligned' && Boolean(speech && speech.played === true);
    return Object.freeze({
      segmentId: syncEntry.segmentId,
      classification: syncEntry.classification,
      played: Boolean(speech && speech.played === true),
      realAudioBuffer: Boolean(speech && speech.realAudioBuffer === true),
      includedInMux
    });
  });

  const includedCount = audioTrackPlan.filter((e) => e.includedInMux).length;

  const plan = Object.freeze({
    video: Object.freeze({
      container: decodeResult.metadata.container ?? null,
      videoTrackRef: decodeResult.videoTrackRef
    }),
    audioTrackPlan: Object.freeze(audioTrackPlan),
    summary: Object.freeze({
      totalSegments: audioTrackPlan.length,
      includedSegments: includedCount,
      excludedSegments: audioTrackPlan.length - includedCount
    }),
    // Honest — no real container/codec byte output is produced this
    // pass; see file header and Compose §4/§9.
    realEncode: false,
    envelope: 'structural-mux-plan-not-real-container-bytes'
  });

  emit(EVENTS.PLAN_BUILT, { totalSegments: plan.summary.totalSegments, includedSegments: plan.summary.includedSegments, realEncode: false });
  return plan;
}

/** Honest capability report — no fabricated support claims. */
function getCapabilities() {
  return Object.freeze({
    // Real, computed structural mux planning (segment inclusion/exclusion
    // decisions, deterministic from Engine 1/7/8's real outputs).
    supportsMuxPlanning: true,
    // No real container/codec byte output — MD-009's encode half remains
    // open, same honesty stance as Engine 1's realDecode: false.
    realEncode: false,
    honestLimitation: 'Neither Engine 1\'s decoded video track nor Engine 7\'s generated speech carries real bytes yet (MD-009/MD-020, both open) — this engine produces a real, deterministic mux plan describing what would be encoded, never fabricated encoded output.'
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'media-encode-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 22,
    mandatory: false,
    // Consumes Engine 1/7/8's real outputs but has no hard, blocking
    // dependency wired within M388 (same soft-dependency stance as prior
    // engines) — the caller supplies their outputs directly to
    // buildEncodePlan().
    dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[MediaEncodeEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

/**
 * Registers this engine as a plain-data adapter + pipeline descriptor into
 * the EXISTING cozy-media.js coordinator's registries — same composition
 * pattern as Engine 1's own attachToCoordinator(). cozy-media.js itself is
 * never modified.
 * @param {object} cozyMedia - the running window.CozyOS.CozyMedia instance
 */
function attachToCoordinator(cozyMedia) {
  if (!cozyMedia || typeof cozyMedia.Adapters?.register !== 'function' || typeof cozyMedia.Pipelines?.register !== 'function') {
    throw new Error('[MediaEncodeEngine] attachToCoordinator() requires a real cozy-media.js CozyMedia instance.');
  }
  const adapterResult = cozyMedia.Adapters.register({
    name: 'media-encode-engine',
    kind: 'media-mux-adapter',
    version: '1.0.0',
    capabilities: ['media-encode']
  });
  if (!adapterResult.success) {
    throw new Error('[MediaEncodeEngine] failed to register adapter descriptor: ' + adapterResult.reason);
  }
  const pipelineResult = cozyMedia.Pipelines.register({
    name: 'media-encode-engine-pipeline',
    adapterId: adapterResult.data.id,
    stages: ['encode']
  });
  attachedCoordinatorAdapterId = adapterResult.data.id;
  emit(EVENTS.ATTACHED, { adapterId: adapterResult.data.id, pipelineRegistered: pipelineResult.success });
  return Object.freeze({
    adapterId: adapterResult.data.id,
    pipelineId: pipelineResult.success ? pipelineResult.data.id : null
  });
}

function getStatus() {
  return Object.freeze({
    attachedToCoordinator: Boolean(attachedCoordinatorAdapterId),
    adapterId: attachedCoordinatorAdapterId
  });
}

function __resetForTests() {
  attachedCoordinatorAdapterId = null;
  listeners.clear();
}

const MediaEncodeEngine = Object.freeze({
  EVENTS,
  on,
  buildEncodePlan,
  getCapabilities,
  getStatus,
  attachToCoordinator,
  getServiceManifest,
  registerWithKernel,
  __resetForTests
});

export default MediaEncodeEngine;
