/**
 * =============================================================================
 * CozyOS Media Engine — Subtitle Timeline Engine (M388 Engine 6)
 * File: core/engines/media/subtitles/subtitle-timeline-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Resolves `MD-014`'s generation half (no subtitle export/rendering
 * capability beyond `cozy-live.js`'s structural channel tracking). Given
 * a list of segments that already carry real text and real millisecond
 * timing, builds a real, ordered cue timeline and can export it as `.srt`
 * text. Sixth of the Approved 11-engine Implementation Order
 * (docs/history/M388.md, Phase 2 Review, item 6).
 *
 * HONESTY (Rule 6)
 * ------------------
 * This engine does not transcribe, translate, or infer timing — it has
 * no access to real audio and no ASR/MT model of its own (same
 * environment constraint already disclosed by Engines 1/2/4/5). It only
 * ever builds a timeline from segments the caller already has with real
 * text and real timing (e.g. a real ASR transcript, or Engine 3's own
 * translate() output composed with the original media's real cue
 * points). See ./provider-srt-formatter.js for the reference provider's
 * own detailed honesty notes: segments missing text or valid timing are
 * honestly skipped and reported, never fabricated; overlapping cues are
 * detected and reported, never silently rendered as clean (Final
 * Implementation Contract, Phase 2 Review, item 5).
 *
 * SCOPE BOUNDARIES (Final Implementation Contract, Phase 2 Review)
 * ------------------------------------------------------------------------
 * - New files only. Does NOT modify `cozy-live.js`, `cozy-speech.js`,
 *   `cozy-media.js`, `media-pipeline-manager.js`, `audio-manager.js`,
 *   `cozy-hearing.js`, or `ldce-caption-engine.js` (item 2).
 * - No registry write anywhere (item 3) — `cozy-live.js`'s
 *   `createSubtitleChannel()` is pure channel-routing metadata with no
 *   field for cue content; this engine's output is a returned value
 *   only, for a future caller (e.g. Engine 11's Coordinator role) to
 *   consume.
 * - Does not resolve `MD-014` beyond its generation half (e.g. any
 *   future burn-in/rendering-into-video capability), `MD-013`
 *   (streaming pipeline), or `MD-016` (item 6).
 * =============================================================================
 */

'use strict';

import { createSrtFormatterProvider } from './provider-srt-formatter.js';

const EVENTS = Object.freeze({
  TIMELINE_BUILT: 'subtitle-timeline:built',
  ERROR: 'subtitle-timeline:error'
});

const providers = new Map();
let activeProviderType = null;
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

function registerProvider(provider) {
  if (!provider || typeof provider.type !== 'string' || typeof provider.buildTimeline !== 'function' || typeof provider.toSrt !== 'function') {
    throw new TypeError('[SubtitleTimelineEngine] registerProvider() requires a provider with a string `type`, a `buildTimeline` method, and a `toSrt` method.');
  }
  providers.set(provider.type, provider);
  if (!activeProviderType) activeProviderType = provider.type;
  return true;
}

/** Registers the default honest reference provider — matches the sibling engines' convention. */
function registerDefaultProvider(type = 'reference-srt-formatter') {
  const provider = createSrtFormatterProvider(type);
  registerProvider(provider);
  return provider;
}

function getProvider(type) {
  const p = providers.get(type || activeProviderType);
  if (!p) throw new Error(`[SubtitleTimelineEngine] no provider registered for type "${type || activeProviderType}".`);
  return p;
}

function unregisterProvider() {
  providers.clear();
  activeProviderType = null;
}

/**
 * Core method (Final Implementation Contract item 5).
 * @param {Array<{segmentId: string, text?: string, startMs?: number, endMs?: number}>} segments
 * @param {{providerType?: string}} [options]
 * @returns {{cues: object[], skippedSegmentIds: string[], overlaps: object[], isReal: boolean, method: string}}
 */
function buildTimeline(segments, options = {}) {
  const provider = getProvider(options.providerType);
  try {
    const result = provider.buildTimeline(Array.isArray(segments) ? segments : []);
    const envelope = Object.freeze({ ...result });
    emit(EVENTS.TIMELINE_BUILT, {
      cueCount: envelope.cues.length,
      skippedCount: envelope.skippedSegmentIds.length,
      overlapCount: envelope.overlaps.length,
      isReal: envelope.isReal
    });
    return envelope;
  } catch (err) {
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }
}

/**
 * Real, deterministic `.srt` export of an already-built timeline (the
 * output of buildTimeline()). Does not build a timeline itself — callers
 * must call buildTimeline() first so any skips/overlaps are visible
 * before export, never silently absorbed into the exported text.
 * @param {{cues: object[]}} timeline
 * @param {{providerType?: string}} [options]
 * @returns {string}
 */
function exportSrt(timeline, options = {}) {
  const provider = getProvider(options.providerType);
  return provider.toSrt(timeline);
}

/** Honest capability report — no fabricated support claims. */
function getCapabilities(providerType) {
  const provider = getProvider(providerType);
  return Object.freeze({
    // Real, deterministic — cue-timeline construction and SRT export
    // from caller-supplied real text/timing, never fabricated.
    cueTimelineConstruction: typeof provider.buildTimeline === 'function',
    srtExport: typeof provider.toSrt === 'function',
    // No transcription, translation, or timing-inference model exists
    // this pass — honestly false, matching every sibling engine's own
    // realX:false precedent.
    realTranscriptionOrTiming: false
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'subtitle-timeline-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 15,
    mandatory: false,
    // No blocking dependency within M388 (Compose/Review §2) — soft
    // dependency on real timed/translated segments existing by the time
    // a caller (e.g. Engine 11) invokes this engine, not on any
    // specific upstream engine.
    dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[SubtitleTimelineEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  providers.clear();
  activeProviderType = null;
  listeners.clear();
}

const SubtitleTimelineEngine = Object.freeze({
  EVENTS,
  on,
  registerProvider,
  registerDefaultProvider,
  unregisterProvider,
  getProvider,
  buildTimeline,
  exportSrt,
  getCapabilities,
  getServiceManifest,
  registerWithKernel,
  __resetForTests
});

export default SubtitleTimelineEngine;
