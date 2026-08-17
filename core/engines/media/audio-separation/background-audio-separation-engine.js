/**
 * =============================================================================
 * CozyOS Media Engine — Background Audio Separation Engine (M388 Engine 5)
 * File: core/engines/media/audio-separation/background-audio-separation-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Resolves `MD-010` (no background/ambient audio separation capability).
 * Given a segment list and Engine 4 (Speaker Diarization)'s own `diarize()`
 * output, computes a real, deterministic partition of which segments are
 * attributed speech (covered by a real diarization turn) versus
 * unclassified (not covered). Fifth of the Approved 11-engine
 * Implementation Order (docs/history/M388.md, Phase 2 Review).
 *
 * NAMING NOTE (AA-007, flagged, not silently decided)
 * ------------------------------------------------------------------------
 * `core/engines/media/media-pipeline-manager.js` already imports an
 * unbuilt `background-engine.js` (one of `MD-004`'s missing files) as a
 * VISUAL effects engine (grouped with `image-engine.js`/`filter-
 * engine.js`/`enhancement-engine.js`). This file deliberately lives at a
 * distinct path — `core/engines/media/audio-separation/` — so it can
 * never collide with that unrelated, still-unbuilt visual feature.
 *
 * HONESTY (Rule 6)
 * ------------------
 * No real acoustic source-separation model exists in this environment,
 * and Engine 1's own `isReal:false` audio-track envelope means there is
 * no real decoded audio for one to operate on even if it existed — same
 * environment constraint already disclosed by Engines 1/2/4. This engine
 * does NOT fabricate a speech/background split from an opaque signal.
 * See ./provider-turn-coverage.js for the reference provider's own
 * detailed honesty notes: a segment is only ever labeled `speech` when a
 * real Engine 4 diarization turn actually covers it; an uncovered
 * segment is labeled `unclassified`, never `background` — this engine
 * has no positive signal that an uncovered segment is actually
 * background/ambient audio rather than an unlabeled speaker or silence,
 * and does not infer one (Final Implementation Contract, Phase 2 Review,
 * item 5).
 *
 * SCOPE BOUNDARIES (Final Implementation Contract, Phase 2 Review)
 * ------------------------------------------------------------------------
 * - New files only. Does NOT modify `cozy-live.js`, `cozy-speech.js`,
 *   `cozy-media.js`, `media-pipeline-manager.js`, `audio-manager.js`, or
 *   `cozy-hearing.js` (item 2).
 * - Consumes Engine 4's `diarize()` output only as a plain function
 *   argument — no new coupling invented (item 3). No registry write
 *   anywhere: unlike Engines 2–4, no existing repository registry holds
 *   a speech/background partition, so none is written into.
 * - Does not resolve `MD-009` (media encode, Engine 9), `MD-013`
 *   (streaming pipeline, Engine 10), or `MD-016` (audio-buffer -> STT
 *   bridge) — explicitly out of scope (item 6).
 * =============================================================================
 */

'use strict';

import { createTurnCoverageProvider } from './provider-turn-coverage.js';

const EVENTS = Object.freeze({
  PARTITIONED: 'background-audio-separation:partitioned',
  ERROR: 'background-audio-separation:error'
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
  if (!provider || typeof provider.type !== 'string' || typeof provider.partitionSegments !== 'function') {
    throw new TypeError('[BackgroundAudioSeparationEngine] registerProvider() requires a provider with a string `type` and a `partitionSegments` method.');
  }
  providers.set(provider.type, provider);
  if (!activeProviderType) activeProviderType = provider.type;
  return true;
}

/** Registers the default honest reference provider — matches the sibling engines' convention. */
function registerDefaultProvider(type = 'reference-turn-coverage') {
  const provider = createTurnCoverageProvider(type);
  registerProvider(provider);
  return provider;
}

function getProvider(type) {
  const p = providers.get(type || activeProviderType);
  if (!p) throw new Error(`[BackgroundAudioSeparationEngine] no provider registered for type "${type || activeProviderType}".`);
  return p;
}

function unregisterProvider() {
  providers.clear();
  activeProviderType = null;
}

/**
 * Core method (Final Implementation Contract item 5). `diarizationResult`
 * is expected to be Engine 4's own `diarize()` return value (or any
 * object with the same `{ turns: [{ segmentIds }] }` shape) — this
 * engine never calls Engine 4 itself, keeping the two engines decoupled
 * (Compose/Review §4, item 3).
 * @param {Array<{segmentId: string}>} segments
 * @param {{turns?: Array<{segmentIds: string[]}>}} [diarizationResult]
 * @param {{providerType?: string}} [options]
 * @returns {{speechSegmentIds: string[], unclassifiedSegmentIds: string[], isReal: boolean, method: string}}
 */
function partition(segments, diarizationResult, options = {}) {
  const provider = getProvider(options.providerType);
  try {
    const result = provider.partitionSegments(Array.isArray(segments) ? segments : [], diarizationResult);
    const envelope = Object.freeze({ ...result });
    emit(EVENTS.PARTITIONED, {
      speechCount: envelope.speechSegmentIds.length,
      unclassifiedCount: envelope.unclassifiedSegmentIds.length,
      isReal: envelope.isReal,
      method: envelope.method
    });
    return envelope;
  } catch (err) {
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }
}

/** Honest capability report — no fabricated support claims. */
function getCapabilities(providerType) {
  const provider = getProvider(providerType);
  return Object.freeze({
    // Real, deterministic — diarization-turn-coverage partitioning,
    // never fabricated from an opaque audio reference.
    turnCoveragePartitioning: typeof provider.partitionSegments === 'function',
    // No acoustic (spectral/embedding) source-separation model exists
    // this pass — honestly false, matching Engine 1's realDecode:false,
    // Engine 2's realAcousticDetection:false, and Engine 4's
    // realAcousticDiarization:false precedent.
    realAcousticSeparation: false
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'background-audio-separation-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 15,
    mandatory: false,
    // No blocking dependency within M388 (Compose/Review §2) — soft,
    // shared dependency on Engine 1's real decoded audio (not yet real)
    // and Engine 4's diarization output, neither resolved by nor
    // blocking this engine.
    dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[BackgroundAudioSeparationEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  providers.clear();
  activeProviderType = null;
  listeners.clear();
}

const BackgroundAudioSeparationEngine = Object.freeze({
  EVENTS,
  on,
  registerProvider,
  registerDefaultProvider,
  unregisterProvider,
  getProvider,
  partition,
  getCapabilities,
  getServiceManifest,
  registerWithKernel,
  __resetForTests
});

export default BackgroundAudioSeparationEngine;
