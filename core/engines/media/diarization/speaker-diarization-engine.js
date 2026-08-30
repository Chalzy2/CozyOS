/**
 * =============================================================================
 * CozyOS Media Engine — Speaker Diarization Engine (M388 Engine 4)
 * File: core/engines/media/diarization/speaker-diarization-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Resolves `MD-011` (no automatic, audio-derived speaker diarization
 * anywhere in the repository). Given a set of segments, groups them into
 * speaker turns and — via `applyToSpeechRegistry()` — writes the result
 * into `core/modules/speech/cozy-speech.js`'s already-open `_speakers`
 * registry using its existing public `registerSpeaker()`/
 * `addActiveSpeaker()` methods. Fourth of the Approved 11-engine
 * Implementation Order (docs/history/M388.md, Phase 2 Review).
 *
 * HONESTY (Rule 6)
 * ------------------
 * No real acoustic speaker-diarization model exists in this environment —
 * same environment constraint Engine 1 disclosed for real container
 * decode, and the direct reason Engine 4's own Compose/Review (`MD-019`)
 * capped what this engine can honestly claim: Engine 1's `decodeMedia()`
 * returns an honest `isReal:false` structural envelope for `audioTrack`,
 * so there is no real decoded audio anywhere in this environment for an
 * acoustic model to analyze even if one were wired in. This engine does
 * NOT fabricate speaker boundaries or a speaker count from an opaque,
 * unanalyzable signal. See ./provider-speaker-hint.js for the reference
 * provider's own detailed honesty notes: real, deterministic grouping of
 * contiguous caller-supplied speaker hints is used only when a hint is
 * actually present on a segment; otherwise this engine returns an honest
 * `isReal:false` empty envelope, per the Final Implementation Contract
 * (docs/history/M388-E4-Diarization-Compose.md, Phase 2, item 5).
 *
 * SCOPE BOUNDARIES (Final Implementation Contract, Phase 2 Review)
 * ------------------------------------------------------------------------
 * - New file only. Does NOT modify `cozy-live.js`, `cozy-speech.js`,
 *   `cozy-media.js`, or `media-pipeline-manager.js` — no exception was
 *   granted at Phase 2 Review (item 2, revises the Phase 1 draft's
 *   conditional wording). This engine is fully external.
 * - Attaches to `cozy-speech.js`'s existing `_speakers` registry ONLY
 *   through its already-public `registerSpeaker()`/`addActiveSpeaker()`
 *   methods (item 3) — no new registry invented, no locked file touched.
 * - Does not read from or write into `cozy-live.js`'s `relaySpeechSegment()`
 *   at all — `MD-019` (no `CozyDiarization` subsystem hook exists there)
 *   remains open/unassigned, same treatment as `MD-016` (item 6 — carried
 *   forward, not resolved here).
 * - Does not resolve `MD-016` (audio-buffer -> SpeechRecognitionAdapter
 *   bridge), `MD-013` (streaming pipeline), or `MD-010` (background audio
 *   separation, Engine 5) — explicitly out of scope (item 6).
 * =============================================================================
 */

'use strict';

import { createSpeakerHintProvider } from './provider-speaker-hint.js';

const EVENTS = Object.freeze({
  DIARIZED: 'speaker-diarization:diarized',
  APPLIED: 'speaker-diarization:applied-to-registry',
  ERROR: 'speaker-diarization:error'
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
  if (!provider || typeof provider.type !== 'string' || typeof provider.diarizeSegments !== 'function') {
    throw new TypeError('[SpeakerDiarizationEngine] registerProvider() requires a provider with a string `type` and a `diarizeSegments` method.');
  }
  providers.set(provider.type, provider);
  if (!activeProviderType) activeProviderType = provider.type;
  return true;
}

/** Registers the default honest reference provider — matches the sibling engines' convention. */
function registerDefaultProvider(type = 'reference-speaker-hint') {
  const provider = createSpeakerHintProvider(type);
  registerProvider(provider);
  return provider;
}

function getProvider(type) {
  const p = providers.get(type || activeProviderType);
  if (!p) throw new Error(`[SpeakerDiarizationEngine] no provider registered for type "${type || activeProviderType}".`);
  return p;
}

function unregisterProvider() {
  providers.clear();
  activeProviderType = null;
}

/**
 * Core method (Final Implementation Contract item 5). `audioTrack` is
 * accepted for interface symmetry with Engine 1's dependency graph (the
 * intended real upstream input) but is never inspected as raw samples —
 * no acoustic model exists this pass (see file header). Only explicit,
 * caller-supplied per-segment hints (via the active provider) drive a
 * real result.
 * @param {Array<{segmentId: string, speakerHint?: string}>} segments
 * @param {{providerType?: string, audioTrack?: {isReal?: boolean}}} [options]
 * @returns {{turns: object[], speakerCount: number, isReal: boolean, method: string}}
 */
function diarize(segments, options = {}) {
  const provider = getProvider(options.providerType);
  try {
    const result = provider.diarizeSegments(Array.isArray(segments) ? segments : []);
    const envelope = Object.freeze({ ...result });
    emit(EVENTS.DIARIZED, {
      speakerCount: envelope.speakerCount,
      isReal: envelope.isReal,
      method: envelope.method
    });
    return envelope;
  } catch (err) {
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }
}

/**
 * Writes a diarize() result into an EXISTING, running `cozy-speech.js`
 * instance's `_speakers` registry via its own public API only
 * (Implementation Contract item 3) — never touches cozy-speech.js itself.
 * For each distinct speaker hint in the result, registers (or reuses) a
 * speaker record and marks it active. Idempotent per hint within a single
 * call — repeated hints reuse the same registered speakerId rather than
 * registering duplicates.
 * @param {{registerSpeaker: (config: object) => string, addActiveSpeaker: (id: string) => string}} cozySpeech - a real, running CozySpeech instance
 * @param {{turns: Array<{speakerHint: string, segmentIds: string[]}>}} diarizationResult - the output of diarize()
 * @returns {{hintToSpeakerId: Record<string, string>, registeredCount: number}}
 */
function applyToSpeechRegistry(cozySpeech, diarizationResult) {
  if (!cozySpeech || typeof cozySpeech.registerSpeaker !== 'function' || typeof cozySpeech.addActiveSpeaker !== 'function') {
    throw new Error('[SpeakerDiarizationEngine] applyToSpeechRegistry() requires a real cozy-speech.js instance exposing registerSpeaker()/addActiveSpeaker().');
  }
  const hintToSpeakerId = {};
  if (!diarizationResult || !Array.isArray(diarizationResult.turns)) {
    return { hintToSpeakerId, registeredCount: 0 };
  }
  for (const turn of diarizationResult.turns) {
    const hint = turn.speakerHint;
    if (!hint || hintToSpeakerId[hint]) continue;
    // Honest, disclosed label: derived only from the caller's own hint
    // string, never invented — matches this engine's non-fabrication
    // convention (file header).
    const speakerId = cozySpeech.registerSpeaker({ name: hint, role: 'speaker' });
    cozySpeech.addActiveSpeaker(speakerId);
    hintToSpeakerId[hint] = speakerId;
  }
  const registeredCount = Object.keys(hintToSpeakerId).length;
  emit(EVENTS.APPLIED, { registeredCount });
  return Object.freeze({ hintToSpeakerId: Object.freeze(hintToSpeakerId), registeredCount });
}

/** Honest capability report — no fabricated support claims. */
function getCapabilities(providerType) {
  const provider = getProvider(providerType);
  return Object.freeze({
    // Real, deterministic — contiguous explicit speaker-hint grouping,
    // never fabricated from an opaque audio reference.
    speakerHintGrouping: typeof provider.diarizeSegments === 'function',
    // No acoustic (embedding/clustering) diarization model exists this
    // pass — honestly false, matching Engine 1's realDecode:false and
    // Engine 2's realAcousticDetection:false precedent.
    realAcousticDiarization: false
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'speaker-diarization-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 15,
    mandatory: false,
    // No blocking dependency within M388 (Compose/Review §2) — soft,
    // shared dependency on Engine 1's real decoded audio (not yet real)
    // and MD-016, neither resolved by nor blocking this engine.
    dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[SpeakerDiarizationEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  providers.clear();
  activeProviderType = null;
  listeners.clear();
}

const SpeakerDiarizationEngine = Object.freeze({
  EVENTS,
  on,
  registerProvider,
  registerDefaultProvider,
  unregisterProvider,
  getProvider,
  diarize,
  applyToSpeechRegistry,
  getCapabilities,
  getServiceManifest,
  registerWithKernel,
  __resetForTests
});

export default SpeakerDiarizationEngine;
