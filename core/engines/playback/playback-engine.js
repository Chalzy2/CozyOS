/**
 * =============================================================================
 * CozyOS Platform Engine — Playback Engine
 * File: core/engines/playback/playback-engine.js
 * =============================================================================
 *
 * PRODUCTION SPECIFICATION (Rule 31, kept brief per Rule 27)
 * ------------------------------------------------------------
 * Purpose: replay a previously recorded session — play, seek, pause,
 * resume, loop. A real-world problem this solves: an operator or auditor
 * needs to review a finished Cozy Live recording without re-deriving it
 * from raw camera/video state.
 *
 * Canonical ownership (Rule 32): Playback owns playback session state,
 * position/seek math, real frame retrieval, and playback timing. It does
 * NOT own: recording capture (Recording Engine), storage/destinations
 * (Recording Engine's Storage Provider), video transformation (Video
 * Processor), or archival/export mechanics — Recording Engine already
 * implements real ZIP export (createArchivePackage); Playback Engine reuses
 * it by direct delegation rather than reimplementing (Rule 2).
 *
 * Dependencies (Rule 17): Recording Engine (already certified) for
 * export delegation; otherwise reads only the real files Recording Engine
 * already wrote (manifest.json + segment/frame files) — no other engine
 * needed to play back a finished session.
 *
 * HONESTY (Rule 6)
 * ------------------
 * Only STOPPED sessions are supported for playback in this version —
 * reading segment/frame files from a still-RECORDING session risks reading
 * a partially-written frame; rather than fabricate a "safe" partial read,
 * that case is honestly rejected and documented as a future capability.
 * Playback timing uses real wall-clock pacing (setTimeout against real
 * elapsed time) at the session's real recorded frame rate — not simulated
 * instantaneous delivery.
 * =============================================================================
 */

'use strict';

import fs from 'fs';
import path from 'path';
import RecordingEngine from '../recording/recording-engine.js';

// -----------------------------------------------------------------------------
// Playback state
// -----------------------------------------------------------------------------

const PLAYBACK_STATES = Object.freeze({
  STOPPED: 'STOPPED',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  ENDED: 'ENDED',
  ERROR: 'ERROR'
});

const EVENTS = Object.freeze({
  LOADED: 'playback-loaded',
  FRAME: 'playback-frame',
  PLAYING: 'playback-started',
  PAUSED: 'playback-paused',
  RESUMED: 'playback-resumed',
  SEEKED: 'playback-seeked',
  ENDED: 'playback-ended',
  STOPPED: 'playback-stopped',
  ERROR: 'playback-error'
});

// -----------------------------------------------------------------------------
// Internal state
// -----------------------------------------------------------------------------

let state = PLAYBACK_STATES.STOPPED;
let session = null; // { dir, manifest, frames: [{segmentIndex, globalIndex, path, byteLength}], frameRate, loop }
let position = 0;   // global frame index
let playTimer = null;
let lastError = null;

/** @type {Map<string, Set<Function>>} */
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
  for (const handler of handlers) {
    try {
      handler(Object.freeze({ ...payload }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[PlaybackEngine] listener error on "${eventName}":`, err);
    }
  }
}

function assertLoaded() {
  if (!session) throw new Error('[PlaybackEngine] No session loaded — call loadSession() first.');
}

// -----------------------------------------------------------------------------
// Public API — Load (real scan of real files Recording Engine wrote)
// -----------------------------------------------------------------------------

function loadSession(sessionDir) {
  const manifestFile = path.join(sessionDir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) {
    throw new Error(`[PlaybackEngine] No manifest.json found at "${sessionDir}".`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (manifest.status !== 'STOPPED') {
    throw new Error(`[PlaybackEngine] Cannot load session with status "${manifest.status}" — only STOPPED sessions can be played back safely (a RECORDING session's most recent frame file may be partially written).`);
  }

  // Real directory scan — builds the frame index from what's actually on
  // disk, not from manifest counts alone (Rule 6: verify against reality).
  const frames = [];
  const segmentDirs = fs.readdirSync(sessionDir).filter((n) => n.startsWith('segment-')).sort();
  for (const segDirName of segmentDirs) {
    const segmentIndex = Number(segDirName.split('-')[1]);
    const full = path.join(sessionDir, segDirName);
    const frameFiles = fs.readdirSync(full).filter((n) => n.startsWith('frame-')).sort();
    for (const frameFile of frameFiles) {
      const framePath = path.join(full, frameFile);
      frames.push({
        segmentIndex,
        path: framePath,
        byteLength: fs.statSync(framePath).size
      });
    }
  }
  if (frames.length === 0) {
    throw new Error(`[PlaybackEngine] Session at "${sessionDir}" has no recorded frames to play.`);
  }
  frames.forEach((f, i) => { f.globalIndex = i; });

  session = {
    dir: sessionDir,
    manifest,
    frames,
    frameRate: manifest.metadata?.frameRate || 30,
    loop: false
  };
  position = 0;
  state = PLAYBACK_STATES.STOPPED;
  lastError = null;
  emit(EVENTS.LOADED, { sessionDir, frameCount: frames.length });
  return getStatus();
}

// -----------------------------------------------------------------------------
// Public API — Seek
// -----------------------------------------------------------------------------

function seek(globalFrameIndex) {
  assertLoaded();
  if (!Number.isInteger(globalFrameIndex) || globalFrameIndex < 0 || globalFrameIndex >= session.frames.length) {
    throw new Error(`[PlaybackEngine] seek() index out of range: ${globalFrameIndex} (0..${session.frames.length - 1}).`);
  }
  position = globalFrameIndex;
  if (state === PLAYBACK_STATES.ENDED) state = PLAYBACK_STATES.PAUSED;
  emit(EVENTS.SEEKED, { position });
  return getStatus();
}

function seekToTime(ms) {
  assertLoaded();
  const frameIndex = Math.min(session.frames.length - 1, Math.max(0, Math.round((ms / 1000) * session.frameRate)));
  return seek(frameIndex);
}

// -----------------------------------------------------------------------------
// Public API — Current frame (real bytes, real read from disk)
// -----------------------------------------------------------------------------

function getCurrentFrame() {
  assertLoaded();
  const frame = session.frames[position];
  const data = fs.readFileSync(frame.path); // real bytes off real disk
  return Object.freeze({
    globalIndex: frame.globalIndex,
    segmentIndex: frame.segmentIndex,
    byteLength: frame.byteLength,
    timestampMs: Math.round((position / session.frameRate) * 1000),
    data
  });
}

// -----------------------------------------------------------------------------
// Public API — Transport controls
// -----------------------------------------------------------------------------

function setLoop(enabled) {
  assertLoaded();
  session.loop = Boolean(enabled);
  return getStatus();
}

function play() {
  assertLoaded();
  if (state === PLAYBACK_STATES.PLAYING) return getStatus();
  if (state === PLAYBACK_STATES.ENDED) position = 0;
  state = PLAYBACK_STATES.PLAYING;
  emit(EVENTS.PLAYING, { position });
  scheduleNextFrame();
  return getStatus();
}

function scheduleNextFrame() {
  const intervalMs = Math.max(1, Math.round(1000 / session.frameRate)); // real pacing at the recorded frame rate
  playTimer = setTimeout(() => {
    if (state !== PLAYBACK_STATES.PLAYING) return;
    try {
      const frame = getCurrentFrame();
      emit(EVENTS.FRAME, frame);
    } catch (err) {
      state = PLAYBACK_STATES.ERROR;
      lastError = err.message;
      emit(EVENTS.ERROR, { error: err.message });
      return;
    }
    if (position >= session.frames.length - 1) {
      if (session.loop) {
        position = 0;
        scheduleNextFrame();
      } else {
        state = PLAYBACK_STATES.ENDED;
        emit(EVENTS.ENDED, { sessionDir: session.dir });
      }
    } else {
      position += 1;
      scheduleNextFrame();
    }
  }, intervalMs);
}

function pause() {
  assertLoaded();
  if (state !== PLAYBACK_STATES.PLAYING) {
    throw new Error(`[PlaybackEngine] Cannot pause: playback is ${state}, not PLAYING.`);
  }
  clearTimeout(playTimer);
  state = PLAYBACK_STATES.PAUSED;
  emit(EVENTS.PAUSED, { position });
  return getStatus();
}

function resume() {
  assertLoaded();
  if (state !== PLAYBACK_STATES.PAUSED) {
    throw new Error(`[PlaybackEngine] Cannot resume: playback is ${state}, not PAUSED.`);
  }
  state = PLAYBACK_STATES.PLAYING;
  emit(EVENTS.RESUMED, { position });
  scheduleNextFrame();
  return getStatus();
}

function stop() {
  assertLoaded();
  clearTimeout(playTimer);
  position = 0;
  state = PLAYBACK_STATES.STOPPED;
  emit(EVENTS.STOPPED, {});
  return getStatus();
}

// -----------------------------------------------------------------------------
// Public API — Export (Rule 2: reuse Recording Engine's real archive logic,
// never reimplemented here)
// -----------------------------------------------------------------------------

async function exportArchive(outputZipPath) {
  assertLoaded();
  return RecordingEngine.createArchivePackage(session.dir, outputZipPath);
}

// -----------------------------------------------------------------------------
// Public API — Queries / diagnostics
// -----------------------------------------------------------------------------

function getStatus() {
  return Object.freeze({
    state,
    sessionDir: session?.dir || null,
    position,
    frameCount: session?.frames?.length ?? 0,
    frameRate: session?.frameRate ?? null,
    loop: session?.loop ?? false,
    timestampMs: session ? Math.round((position / session.frameRate) * 1000) : null,
    lastError
  });
}

function getDiagnostics() {
  return Object.freeze({
    ...getStatus(),
    manifest: session?.manifest ? { sessionId: session.manifest.sessionId, integrity: session.manifest.integrity || null } : null
  });
}

// -----------------------------------------------------------------------------
// Kernel integration
// -----------------------------------------------------------------------------

function getServiceManifest() {
  return Object.freeze({
    name: 'playback-engine',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 50,
    mandatory: false,
    dependencies: ['recording-engine']
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[PlaybackEngine] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

// -----------------------------------------------------------------------------
// Test-only reset
// -----------------------------------------------------------------------------

function __resetForTests() {
  clearTimeout(playTimer);
  state = PLAYBACK_STATES.STOPPED;
  session = null;
  position = 0;
  lastError = null;
}

// -----------------------------------------------------------------------------
// Frozen public surface
// -----------------------------------------------------------------------------

const PlaybackEngine = Object.freeze({
  PLAYBACK_STATES,
  EVENTS,

  on,

  loadSession,
  seek,
  seekToTime,
  getCurrentFrame,
  setLoop,
  play,
  pause,
  resume,
  stop,
  exportArchive,

  getStatus,
  getDiagnostics,

  getServiceManifest,
  registerWithKernel,

  __resetForTests
});

export default PlaybackEngine;
