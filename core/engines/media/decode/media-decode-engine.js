/**
 * =============================================================================
 * CozyOS Media Engine — Media Decode Engine (M388 Engine 1)
 * File: core/engines/media/decode/media-decode-engine.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Extracts audio and video tracks from a loaded media file/stream handle,
 * producing decoded (or honestly-structural, see below) audio for the
 * downstream STT/translation pipeline and a video-track reference held for
 * later re-mux by Engine 9 (Media Encode). First of the Approved 11-engine
 * Implementation Order (docs/history/M388.md, Phase 2 Review) — no upstream
 * dependency within M388.
 *
 * NEW FILE, NOT `codec-decoding-engine.js` (AA-006, resolved in Compose §2)
 * ------------------------------------------------------------------------
 * `codec-decoding-engine.js`/`codec-encoding-engine.js` are reserved by a
 * different, narrower, still-image-container-codec contract owned by
 * media-pipeline-manager.js (part of MD-004/MD-009's image-codec half).
 * This engine's scope — media-file/stream demux, track extraction — has no
 * existing owner and lives in its own file per that finding.
 *
 * HONESTY (Rule 6)
 * ------------------
 * No real container demuxer exists in this environment. Per the Compose
 * report's own precedent (provider-inmemory.js's honesty pattern), this
 * engine returns real, computed metadata (byte length, sniffed container
 * type) plus an honest `isReal:false` structural envelope for tracks it
 * cannot actually decode — never a fabricated "success". See
 * ./provider-inmemory.js for the reference provider's own detailed notes.
 *
 * SCOPE BOUNDARIES (Implementation Contract, Compose §12)
 * ------------------------------------------------------------------------
 * - Does not modify media-pipeline-manager.js, cozy-media.js, or any file
 *   in the locked ownership table (docs/history/M388.md §6), except this
 *   engine's own registration entry added to
 *   core/bridge/engine-bridge-bootstrap.js's REGISTRATIONS array.
 * - Does not attempt to resolve MD-004 (still-image codec files missing) —
 *   a separate, already-tracked repair, out of this engine's scope.
 * - Does not implement the audio-buffer -> SpeechRecognitionAdapter bridge
 *   (MD-016) — a real, milestone-level sequencing gap found during Phase 2
 *   Review, not yet assigned an owning engine, and explicitly noted as not
 *   blocking this engine's own Phase 3.
 * =============================================================================
 */

'use strict';

import { createInMemoryDecodeProvider } from './provider-inmemory.js';

const EVENTS = Object.freeze({
  DECODED: 'decode:media-decoded',
  ATTACHED: 'decode:attached-to-coordinator',
  ERROR: 'decode:error'
});

const providers = new Map();
let activeProviderType = null;
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

function registerProvider(provider) {
  if (!provider || typeof provider.type !== 'string' || typeof provider.decode !== 'function') {
    throw new TypeError('[MediaDecodeEngine] registerProvider() requires a provider with a string `type` and a `decode` method.');
  }
  providers.set(provider.type, provider);
  if (!activeProviderType) activeProviderType = provider.type;
  return true;
}

/** Registers the default honest reference provider — matches the sibling engines' convention. */
function registerDefaultProvider(type = 'reference') {
  const provider = createInMemoryDecodeProvider(type);
  registerProvider(provider);
  return provider;
}

function getProvider(type) {
  const p = providers.get(type || activeProviderType);
  if (!p) throw new Error(`[MediaDecodeEngine] no provider registered for type "${type || activeProviderType}".`);
  return p;
}

function unregisterProvider() {
  providers.clear();
  activeProviderType = null;
}

/**
 * Core method (Compose §6). No existing name collision confirmed against
 * this repository during Compose.
 * @param {{bytes: Uint8Array, mimeType?: string, name?: string}} sourceHandle
 * @param {{providerType?: string}} [options]
 * @returns {{audioTrack: object|null, videoTrackRef: object|null, metadata: object}}
 */
function decodeMedia(sourceHandle, options = {}) {
  const provider = getProvider(options.providerType);
  try {
    const result = provider.decode(sourceHandle);
    emit(EVENTS.DECODED, {
      container: result.metadata.container,
      byteLength: result.metadata.byteLength,
      realDecode: false
    });
    return result;
  } catch (err) {
    emit(EVENTS.ERROR, { message: err.message });
    throw err;
  }
}

/** Honest capability report — no fabricated support claims (Compose §4/§9). */
function getCapabilities(providerType) {
  const provider = getProvider(providerType);
  const webCodecsAvailableInEnvironment =
    typeof provider.webCodecsAvailable === 'function' ? provider.webCodecsAvailable() : false;
  return Object.freeze({
    containers: ['mp4', 'webm', 'wav', 'ogg', 'flac', 'mp3'],
    // No elementary-stream codec decode implemented this pass — honest
    // empty list rather than an unearned claim.
    codecs: [],
    // Container demux is not wired to a real decode backend this pass
    // (Compose §4 left the WebCodecs-vs-reference-envelope choice as an
    // explicit, undecided Plan-stage question) — honestly false.
    realDecode: false,
    // Real, live-checked fact about this runtime; not yet exercised for
    // decoding (see file header).
    webCodecsAvailableInEnvironment
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'media-decode-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 14,
    mandatory: false,
    // First engine in the Approved Implementation Order — no upstream
    // dependency within M388 (Compose §7).
    dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[MediaDecodeEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

/**
 * Registers this engine as a plain-data adapter + pipeline descriptor into
 * the EXISTING cozy-media.js coordinator's registries. cozy-media.js is
 * never modified; this only writes into the extension points it already
 * exposes (Adapters.register / Pipelines.register) — same composition
 * pattern as media-pipeline-manager.js's own attachToCoordinator().
 * @param {object} cozyMedia - the running window.CozyOS.CozyMedia instance
 */
function attachToCoordinator(cozyMedia) {
  if (!cozyMedia || typeof cozyMedia.Adapters?.register !== 'function' || typeof cozyMedia.Pipelines?.register !== 'function') {
    throw new Error('[MediaDecodeEngine] attachToCoordinator() requires a real cozy-media.js CozyMedia instance.');
  }
  const adapterResult = cozyMedia.Adapters.register({
    name: 'media-decode-engine',
    kind: 'media-demux-adapter',
    version: '1.0.0',
    capabilities: ['media-decode']
  });
  if (!adapterResult.success) {
    throw new Error('[MediaDecodeEngine] failed to register adapter descriptor: ' + adapterResult.reason);
  }
  const pipelineResult = cozyMedia.Pipelines.register({
    name: 'media-decode-engine-pipeline',
    adapterId: adapterResult.data.id,
    stages: ['decode']
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
  providers.clear();
  activeProviderType = null;
  attachedCoordinatorAdapterId = null;
  listeners.clear();
}

const MediaDecodeEngine = Object.freeze({
  EVENTS,
  on,
  registerProvider,
  registerDefaultProvider,
  unregisterProvider,
  getProvider,
  decodeMedia,
  getCapabilities,
  getStatus,
  attachToCoordinator,
  getServiceManifest,
  registerWithKernel,
  __resetForTests
});

export default MediaDecodeEngine;
