/**
 * =============================================================================
 * CozyOS Media Engine — Synchronization Engine (M388 Engine 8)
 * File: core/engines/media/synchronization/synchronization-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Keeps generated speech timing checked against the original video's
 * speech segments by joining Engine 6's built cue timeline against Engine
 * 7's speech-playback results, by `segmentId`, and classifying each
 * segment into one of four real, deterministic states. Lip-sync itself
 * remains `MD-015`, Out of Scope this milestone. Eighth of the Approved
 * 11-engine Implementation Order (docs/history/M388.md, Phase 2 Review).
 *
 * APPROVED VIA PHASE 2 REVIEW (Approved, AA-008 revised, no other change)
 * ------------------------------------------------------------------------
 * See docs/history/M388-E8-Synchronization-Compose.md for the full
 * Compose Report and Phase 2 Review. This file implements that report's
 * Final Implementation Contract exactly:
 *   1. New files only, under core/engines/media/synchronization/ — no
 *      shared directory, class name, or global with any of the six
 *      unrelated "synchroniz*"/"drift"/"timing align" modules found and
 *      confirmed non-duplicate during Phase 0/Phase 2 (AA-008):
 *      core/modules/sync/cozy-sync.js, core/connectivity/sync.js,
 *      core/living/cozy-living-sync.js, core/connectivity/conflict.js,
 *      modules/live/cozy-live.js's syncTimestamp()/EVENT_SYNC, and
 *      core/network/cozy-network-orchestrator.js's #stampMediaSync().
 *   2. Does not modify subtitle-timeline-engine.js (Engine 6) or
 *      voice-generation-engine.js (Engine 7) — reads only their existing,
 *      already-public return shapes.
 *   3. Core method crossCheckTiming(timeline, playbackResults) — real,
 *      deterministic, segmentId-keyed join/classification. Never
 *      fabricates a drift/offset value. getCapabilities().realDriftMeasurement
 *      is always false.
 *   4. One additive REGISTRATIONS entry in engine-bridge-bootstrap.js
 *      ("synchronization") — same precedent as Engines 1–7.
 *   5. Does not resolve MD-020/MD-021 (no real audio buffer/duration
 *      anywhere in this pipeline) — both remain open, out of scope.
 *   6. Does not resolve MD-015 (lip-sync) — unchanged, Out of Scope.
 *
 * HONESTY (Rule 6)
 * ------------------
 * No engine anywhere in this repository's pipeline produces a real audio
 * duration or buffer (Engine 1's decode is structural-only, `isReal:false`;
 * Engine 7's speech is playback-only, `realAudioBuffer:false` hardcoded in
 * every branch) — confirmed by direct read during Engine 8's own Phase 0
 * and re-confirmed at Phase 2 Review. A numeric timing offset/drift
 * therefore cannot be honestly computed this pass (`MD-021`). This engine
 * performs a real, deterministic timing-vs-playback CLASSIFICATION instead
 * — never a fabricated drift number — matching the same honesty pattern
 * already established by Engine 1 (`isReal:false`), Engine 4
 * (`isReal:false` empty envelope), and Engine 7 (`realAudioBuffer:false`).
 * =============================================================================
 */

'use strict';

const EVENTS = Object.freeze({
  CROSS_CHECKED: 'synchronization:cross-checked',
  ERROR: 'synchronization:error'
});

const CLASSIFICATIONS = Object.freeze({
  ALIGNED: 'aligned',
  TIMING_WITHOUT_PLAYBACK: 'timing-without-playback',
  PLAYBACK_WITHOUT_TIMING: 'playback-without-timing',
  UNRESOLVED: 'unresolved'
});

const listeners = new Map();

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

/**
 * Validates a timeline shaped like Engine 6's buildTimeline() return
 * value. Does not require every field — only what crossCheckTiming()
 * actually reads (cues[].segmentId, skippedSegmentIds).
 * @param {*} timeline
 * @returns {boolean}
 */
function _isValidTimeline(timeline) {
  return Boolean(
    timeline &&
    Array.isArray(timeline.cues) &&
    Array.isArray(timeline.skippedSegmentIds) &&
    timeline.cues.every((c) => c && typeof c.segmentId === 'string')
  );
}

/**
 * Validates a playbackResults array shaped like Engine 7's
 * generateSpeechForSegments() return value. Does not require every
 * field — only what crossCheckTiming() actually reads
 * (segmentId, played).
 * @param {*} playbackResults
 * @returns {boolean}
 */
function _isValidPlaybackResults(playbackResults) {
  return Array.isArray(playbackResults) &&
    playbackResults.every((r) => r && typeof r.segmentId === 'string' && typeof r.played === 'boolean');
}

/**
 * Core method (Final Implementation Contract item 3). Real,
 * deterministic, segmentId-keyed join between Engine 6's cue timeline and
 * Engine 7's playback results. Never computes or returns a fabricated
 * drift/offset value — see file header (Rule 6 / MD-021).
 * @param {{cues: Array<{segmentId:string,startMs:number,endMs:number}>, skippedSegmentIds: string[]}} timeline - Engine 6's buildTimeline() return value
 * @param {Array<{segmentId:string, played:boolean, providerId?:string, reason?:string}>} playbackResults - Engine 7's generateSpeechForSegments() return value
 * @param {{segmentIds?: string[]}} [options] - optional explicit set of segmentIds to classify (defaults to the union of both inputs)
 * @returns {{results: Array<{segmentId:string, classification:string, hasCue:boolean, wasPlayed:boolean}>, summary: Record<string, number>}}
 */
function crossCheckTiming(timeline, playbackResults, options = {}) {
  try {
    if (!_isValidTimeline(timeline)) {
      throw new TypeError('[SynchronizationEngine] crossCheckTiming() requires a timeline shaped like Engine 6\'s buildTimeline() return value ({cues: [], skippedSegmentIds: []}).');
    }
    if (!_isValidPlaybackResults(playbackResults)) {
      throw new TypeError('[SynchronizationEngine] crossCheckTiming() requires playbackResults shaped like Engine 7\'s generateSpeechForSegments() return value ([{segmentId, played}, ...]).');
    }

    const cueBySegmentId = new Map(timeline.cues.map((c) => [c.segmentId, c]));
    const skippedSet = new Set(timeline.skippedSegmentIds);
    const playbackBySegmentId = new Map(playbackResults.map((r) => [r.segmentId, r]));

    const segmentIds = Array.isArray(options.segmentIds) && options.segmentIds.length > 0
      ? Array.from(new Set(options.segmentIds))
      : Array.from(new Set([...cueBySegmentId.keys(), ...skippedSet, ...playbackBySegmentId.keys()]));

    const results = segmentIds.map((segmentId) => {
      const hasCue = cueBySegmentId.has(segmentId);
      const playback = playbackBySegmentId.get(segmentId);
      const wasPlayed = Boolean(playback && playback.played === true);
      const wasSubmittedForPlayback = playbackBySegmentId.has(segmentId);

      let classification;
      if (hasCue && wasPlayed) {
        classification = CLASSIFICATIONS.ALIGNED;
      } else if (hasCue && !wasPlayed) {
        classification = CLASSIFICATIONS.TIMING_WITHOUT_PLAYBACK;
      } else if (!hasCue && wasPlayed) {
        classification = CLASSIFICATIONS.PLAYBACK_WITHOUT_TIMING;
      } else if (!hasCue && !wasSubmittedForPlayback) {
        classification = CLASSIFICATIONS.UNRESOLVED;
      } else {
        // No cue (skipped or never submitted to Engine 6), and a playback
        // result exists but played:false — no timing exists to check
        // against, and playback itself did not succeed either.
        classification = CLASSIFICATIONS.UNRESOLVED;
      }

      return Object.freeze({ segmentId, classification, hasCue, wasPlayed });
    });

    const summary = Object.values(CLASSIFICATIONS).reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
    for (const r of results) summary[r.classification] += 1;

    const envelope = Object.freeze({ results: Object.freeze(results), summary: Object.freeze(summary) });
    emit(EVENTS.CROSS_CHECKED, { count: results.length, summary });
    return envelope;
  } catch (err) {
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }
}

/** Honest capability report — no fabricated support claims. */
function getCapabilities() {
  return Object.freeze({
    // No engine in this pipeline produces a real audio duration/buffer
    // (MD-021, confirmed Phase 0 + re-confirmed Phase 2 Review) — a
    // numeric drift/offset cannot be honestly computed this pass.
    realDriftMeasurement: false,
    // Real, deterministic, segmentId-keyed classification IS implemented.
    timingPlaybackCrossCheck: true,
    classifications: Object.values(CLASSIFICATIONS)
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'synchronization-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 36,
    mandatory: false,
    // Depends on Engine 6 (Subtitle Timeline) and Engine 7 (Voice
    // Generation) only, both already Closed (Compose "Dependency graph"
    // section, Phase 2 Review) — reads their return shapes, does not
    // call either module directly.
    dependencies: ['SubtitleTimelineEngine', 'VoiceGenerationEngine']
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[SynchronizationEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  listeners.clear();
}

const SynchronizationEngine = Object.freeze({
  EVENTS,
  CLASSIFICATIONS,
  on,
  crossCheckTiming,
  getCapabilities,
  getServiceManifest,
  registerWithKernel,
  __resetForTests
});

export default SynchronizationEngine;
