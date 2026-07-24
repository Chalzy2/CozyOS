/**
 * =============================================================================
 * CozyOS Media Engine — Media Pipeline Manager (Coordinator)
 * File: core/engines/media/media-pipeline-manager.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * The Media Engine's public facade. Exposes the Media.* API surface and
 * orchestrates the processing engines below it (Image, Background, Filter,
 * Enhancement, Codec Encoding/Decoding, Recording Export). It owns
 * pipeline sequencing only — never pixel math, DSP, playback, or scene
 * sync, all of which are permanently owned elsewhere per the accepted
 * Ownership Review.
 *
 * RELATIONSHIP TO core/modules/media/cozy-media.js (Rule: extend, don't
 * replace)
 * ------------------------------------------------------------------------
 * cozy-media.js is the existing Enterprise Media Coordination Kernel — a
 * registry/metadata/lifecycle layer that explicitly never transforms media
 * itself and stores only adapter DESCRIPTORS. This file is that missing
 * adapter's real implementation. attachToCoordinator() registers a plain
 * data descriptor (no function references — cozy-media.js's security
 * choke point rejects those, by design) into its existing Adapters and
 * Pipelines registries. cozy-media.js is never modified.
 *
 * LOCKED OWNERSHIP (accepted, permanent)
 * ------------------------------------------------------------------------
 *   Camera   -> core/engines/camera/camera-manager.js
 *   Vision   -> core/modules/vision/cozy-vision.js
 *   Audio    -> core/engines/audio/audio-manager.js (live DSP, permanent)
 *   Playback -> core/engines/playback/playback-engine.js
 *   Scene    -> core/engines/scene/scene-manager.js (camera/audio sync)
 * Media Engine must never duplicate any of the above.
 * =============================================================================
 */

'use strict';

import ImageEngine from './image-engine.js';
import BackgroundEngine from './background-engine.js';
import FilterEngine from './filter-engine.js';
import EnhancementEngine from './enhancement-engine.js';
import CodecEncodingEngine from './codec-encoding-engine.js';
import CodecDecodingEngine from './codec-decoding-engine.js';
import RecordExportSessionManager from './record-export-session-manager.js';
import EnvironmentEngine from './environment-engine.js';
import LiveEffectsEngine from './live-effects-engine.js';
import { createInMemoryMediaProvider } from './provider-inmemory.js';

const EVENTS = Object.freeze({
  EFFECT_ADDED: 'media:effect-added',
  EFFECT_REMOVED: 'media:effect-removed',
  ATTACHED: 'media:attached-to-coordinator',
  ERROR: 'media:error'
});

const listeners = new Map();
const activeEffects = new Map(); // sessionId -> Set<effectName>
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

/** Registers the default honest reference provider across every sub-engine that takes one. */
function registerDefaultProvider(type = 'reference') {
  const provider = createInMemoryMediaProvider(type);
  ImageEngine.registerProvider(provider);
  BackgroundEngine.registerProvider(provider);
  EnhancementEngine.registerProvider(provider);
  CodecEncodingEngine.registerProvider(provider);
  CodecDecodingEngine.registerProvider(provider);
  return provider;
}

function registerProvider(provider) {
  ImageEngine.registerProvider(provider);
  BackgroundEngine.registerProvider(provider);
  EnhancementEngine.registerProvider(provider);
  CodecEncodingEngine.registerProvider(provider);
  CodecDecodingEngine.registerProvider(provider);
  return true;
}

function unregisterProvider() {
  ImageEngine.__resetForTests();
  BackgroundEngine.__resetForTests();
  EnhancementEngine.__resetForTests();
  CodecEncodingEngine.__resetForTests();
  CodecDecodingEngine.__resetForTests();
}

/**
 * process() runs an ordered list of pipeline steps against a single frame.
 * @param {object} image - ImageHandle
 * @param {Array<{engine:'image'|'filter'|'background'|'enhancement', op:string, args?:Array}>} steps
 * @param {string} [sessionId] - required for background steps
 */
function process(image, steps = [], sessionId) {
  let current = image;
  for (const step of steps) {
    if (step.engine === 'image') {
      current = ImageEngine[step.op](current, ...(step.args || []));
    } else if (step.engine === 'filter') {
      current = FilterEngine.applyFilter(step.op, current, ImageEngine.getProvider());
    } else if (step.engine === 'background') {
      if (!sessionId) throw new Error('[MediaPipelineManager] background pipeline steps require a sessionId.');
      current = BackgroundEngine.process(sessionId, current);
    } else if (step.engine === 'enhancement') {
      current = EnhancementEngine[step.op](current, ...(step.args || []));
    } else {
      throw new TypeError(`[MediaPipelineManager] unknown pipeline engine "${step.engine}".`);
    }
  }
  return current;
}

function addEffect(sessionId, effectName) {
  if (!activeEffects.has(sessionId)) activeEffects.set(sessionId, new Set());
  activeEffects.get(sessionId).add(effectName);
  emit(EVENTS.EFFECT_ADDED, { sessionId, effectName });
  return true;
}

function removeEffect(sessionId, effectName) {
  const set = activeEffects.get(sessionId);
  const existed = Boolean(set && set.delete(effectName));
  if (existed) emit(EVENTS.EFFECT_REMOVED, { sessionId, effectName });
  return existed;
}

function listEffects(sessionId) {
  return Object.freeze(Array.from(activeEffects.get(sessionId) || []));
}

function enableBackground(sessionId, mode, options) { return BackgroundEngine.enableBackground(sessionId, mode, options); }
function disableBackground(sessionId) { return BackgroundEngine.disableBackground(sessionId); }
function applyFilter(name, image) { return FilterEngine.applyFilter(name, image, ImageEngine.getProvider()); }
function removeFilter(name) { return FilterEngine.unregisterFilter(name); }
function compress(image, format) { return CodecEncodingEngine.encodeImage(image, format); }
function exportRecording(session, imageFormat) { return RecordExportSessionManager.exportSession(session, { imageFormat }); }
function importContainer(container) { return CodecDecodingEngine.decodeImage(container); }

function getCapabilities() {
  return Object.freeze({
    image: ImageEngine.getCapabilities(),
    enhancement: EnhancementEngine.getCapabilities(),
    codec: CodecEncodingEngine.getCapabilities(),
    filters: FilterEngine.listFilters(),
    backgroundModes: BackgroundEngine.MODES
  });
}

function getStatus() {
  return Object.freeze({
    attachedToCoordinator: Boolean(attachedCoordinatorAdapterId),
    adapterId: attachedCoordinatorAdapterId,
    activeSessions: activeEffects.size
  });
}

/**
 * Registers the Media Engine as a plain-data adapter + pipeline descriptor
 * into the EXISTING cozy-media.js coordinator's registries. cozy-media.js
 * is never modified; this only ever writes into the extension points it
 * already exposes (Adapters.register / Pipelines.register).
 * @param {object} cozyMedia - the running window.CozyOS.CozyMedia instance
 */
function attachToCoordinator(cozyMedia) {
  if (!cozyMedia || typeof cozyMedia.Adapters?.register !== 'function' || typeof cozyMedia.Pipelines?.register !== 'function') {
    throw new Error('[MediaPipelineManager] attachToCoordinator() requires a real cozy-media.js CozyMedia instance.');
  }
  const adapterResult = cozyMedia.Adapters.register({
    name: 'media-engine',
    kind: 'media-transformation-adapter',
    version: '1.0.0',
    capabilities: [
      'image-transform', 'background-composite', 'filters',
      'enhancement', 'codec-encode', 'codec-decode', 'recording-export'
    ]
  });
  if (!adapterResult.success) {
    throw new Error('[MediaPipelineManager] failed to register adapter descriptor: ' + adapterResult.reason);
  }
  const pipelineResult = cozyMedia.Pipelines.register({
    name: 'media-engine-default-pipeline',
    adapterId: adapterResult.data.id,
    stages: ['image', 'background', 'filter', 'enhancement', 'codec']
  });
  attachedCoordinatorAdapterId = adapterResult.data.id;
  emit(EVENTS.ATTACHED, { adapterId: adapterResult.data.id, pipelineRegistered: pipelineResult.success });
  return Object.freeze({ adapterId: adapterResult.data.id, pipelineId: pipelineResult.success ? pipelineResult.data.id : null });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'media-pipeline-manager', version: '1.0.0', apiVersion: '1.0.0',
    priority: 15, mandatory: false,
    dependencies: ['image-engine', 'background-engine', 'filter-engine', 'enhancement-engine', 'codec-encoding-engine', 'codec-decoding-engine', 'recording-export-engine']
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[MediaPipelineManager] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  activeEffects.clear();
  attachedCoordinatorAdapterId = null;
  unregisterProvider();
}

const Media = Object.freeze({
  EVENTS, on,
  registerDefaultProvider, registerProvider, unregisterProvider,
  process,
  addEffect, removeEffect, listEffects,
  enableBackground, disableBackground,
  applyFilter, removeFilter,
  compress, importContainer,
  // NOTE (Rule 6 — honest scope): the original spec's Media.record()/
  // stream()/stop()/pause()/resume() imply live capture control, which
  // depends on a Recording/Streaming Engine that does not exist yet in
  // this codebase (per Scene Manager's own honest gap note). Only
  // exportSession() is implemented in Phase 1 — it packages segments a
  // caller already captured. Adding fake record/stop/pause methods here
  // would be exactly the kind of fabricated success this Constitution
  // forbids, so they are intentionally omitted until capture exists.
  exportSession: exportRecording,
  getCapabilities, getStatus,
  attachToCoordinator,
  getServiceManifest, registerWithKernel,
  __resetForTests,

  // sub-engines, exposed for direct access / Kernel registration
  ImageEngine, BackgroundEngine, FilterEngine, EnhancementEngine,
  CodecEncodingEngine, CodecDecodingEngine, RecordExportSessionManager,
  EnvironmentEngine, LiveEffectsEngine
});

export default Media;
