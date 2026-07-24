/**
 * =============================================================================
 * CozyOS Media Engine — Record Export Session Manager
 * File: core/engines/media/record-export-session-manager.js
 * =============================================================================
 *
 * PURPOSE (promoted from Recording Export Engine, Milestone 140)
 * ------------------------------------------------------------------
 * Packages, organizes, and exports ALREADY-CAPTURED recording sessions.
 * Real export queue, real pause/resume/cancel (genuine async yield points,
 * not a cosmetic status flag — see _runJob), real progress reporting,
 * real chapters/bookmarks metadata, real integrity checksum.
 *
 * WHAT THIS DOES NOT OWN (unchanged from Milestone 140, restated per the
 * Phase 2 approval so the boundary can't drift silently)
 * ------------------------------------------------------------------
 *   - Camera capture           -> Camera Engine
 *   - Live recording/streaming -> no engine owns this yet (unbuilt)
 *   - Audio DSP                -> Audio Manager (permanent)
 *   - Playback                 -> Playback Engine
 *   - Frame synchronization    -> Scene Manager
 * This file only ever consumes frames/audio a caller already has in
 * memory. It never captures anything.
 *
 * HONESTY (Rule 6)
 * ------------------
 * checksum() is a real, deterministic, verifiable hash over the actually-
 * encoded payload bytes — not a cryptographic digest, and not claimed to
 * be one. Cloud/Vault export hooks are NOT implemented (see Not Approved
 * list in Phase 2) — getCapabilities() reports them as false rather than
 * silently omitting them.
 * =============================================================================
 */

'use strict';

import CodecEncodingEngine from './codec-encoding-engine.js';

const STATUS = Object.freeze({
  QUEUED: 'queued', RUNNING: 'running', PAUSED: 'paused',
  COMPLETED: 'completed', CANCELLED: 'cancelled', FAILED: 'failed'
});

const EVENTS = Object.freeze({
  PROGRESS: 'export:progress', PAUSED: 'export:paused', RESUMED: 'export:resumed',
  CANCELLED: 'export:cancelled', COMPLETED: 'export:completed', ERROR: 'export:error'
});

const jobs = new Map(); // jobId -> job
const jobHistory = []; // append-only log of every job ever created
let jobCounter = 0;
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

/** Real, deterministic, verifiable (not cryptographic) checksum over encoded frame payloads. */
function _checksum(encodedFrames, encodedAudio) {
  let hash = 0;
  const feed = (s) => { for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0; };
  for (const f of encodedFrames) feed(f.container.payload || '');
  if (encodedAudio) feed(encodedAudio.payload || '');
  return hash.toString(16);
}

function _buildBundle(job) {
  return Object.freeze({
    sessionId: job.sessionId, jobId: job.id, createdAt: job.completedAt,
    frameCount: job.encodedFrames.length, imageFormat: job.imageFormat,
    hasAudio: Boolean(job.encodedAudio),
    frames: Object.freeze([...job.encodedFrames]), audio: job.encodedAudio,
    chapters: Object.freeze([...job.chapters]), bookmarks: Object.freeze([...job.bookmarks]),
    checksum: _checksum(job.encodedFrames, job.encodedAudio)
  });
}

/** The real job driver. Yields a real microtask before every frame so pause()/cancel() called right after starting the job can genuinely interrupt it — not a cosmetic flag checked only "between calls". */
async function _runJob(job) {
  job.status = STATUS.RUNNING;
  if (!job.startedAt) job.startedAt = new Date().toISOString();
  const frames = job.session.videoFrames;

  for (let i = job.progressIndex; i < frames.length; i++) {
    await Promise.resolve(); // real yield point
    if (job.cancelRequested) {
      job.status = STATUS.CANCELLED;
      emit(EVENTS.CANCELLED, { jobId: job.id });
      return null;
    }
    if (job.pauseRequested) {
      job.status = STATUS.PAUSED;
      job.progressIndex = i;
      job.pauseRequested = false;
      emit(EVENTS.PAUSED, { jobId: job.id, progress: job.progress });
      return null;
    }
    try {
      const frame = frames[i];
      job.encodedFrames.push({
        index: frame.index,
        container: CodecEncodingEngine.encodeImage(frame.image, job.imageFormat, job.providerType)
      });
    } catch (err) {
      job.status = STATUS.FAILED;
      job.error = err.message;
      emit(EVENTS.ERROR, { jobId: job.id, message: err.message });
      return null;
    }
    job.progressIndex = i + 1;
    job.progress = frames.length === 0 ? 1 : job.progressIndex / frames.length;
    emit(EVENTS.PROGRESS, { jobId: job.id, progress: job.progress });
  }

  if (job.session.audio && !job.encodedAudio) {
    try {
      job.encodedAudio = CodecEncodingEngine.encodeAudioForExport(job.session.audio.buffer, job.session.audio.format, job.providerType);
    } catch (err) {
      job.status = STATUS.FAILED;
      job.error = err.message;
      emit(EVENTS.ERROR, { jobId: job.id, message: err.message });
      return null;
    }
  }

  job.bundle = _buildBundle(job);
  job.status = STATUS.COMPLETED;
  job.progress = 1;
  job.completedAt = new Date().toISOString();
  emit(EVENTS.COMPLETED, { jobId: job.id });
  return job.bundle;
}

function _createJob(session, options) {
  if (!session || typeof session.sessionId !== 'string') {
    throw new TypeError('[RecordExportSessionManager] requires session.sessionId.');
  }
  if (!Array.isArray(session.videoFrames)) {
    throw new TypeError('[RecordExportSessionManager] requires session.videoFrames array (may be empty).');
  }
  const jobId = `export_${++jobCounter}`;
  const job = {
    id: jobId, sessionId: session.sessionId, session,
    imageFormat: options.imageFormat || 'jpeg', providerType: options.providerType,
    status: STATUS.QUEUED, progress: 0, progressIndex: 0,
    encodedFrames: [], encodedAudio: null, bundle: null, error: null,
    pauseRequested: false, cancelRequested: false,
    chapters: options.chapters || [], bookmarks: options.bookmarks || [],
    createdAt: new Date().toISOString(), startedAt: null, completedAt: null
  };
  jobs.set(jobId, job);
  jobHistory.push({ jobId, sessionId: session.sessionId, queuedAt: job.createdAt });
  return job;
}

/** @returns {{ jobId: string, promise: Promise<object|null> }} — caller may await promise, or poll getStatus(jobId). */
function exportSession(session, options = {}) {
  const job = _createJob(session, options);
  const promise = _runJob(job);
  return { jobId: job.id, promise };
}

/** Exports only frames within [startIndex, endIndex). */
function exportClip(session, { startIndex, endIndex }, options = {}) {
  const clip = { ...session, videoFrames: session.videoFrames.slice(startIndex, endIndex) };
  return exportSession(clip, options);
}

/** Exports only the frames at the given indices. */
function exportFrames(session, indices, options = {}) {
  const set = new Set(indices);
  const subset = { ...session, videoFrames: session.videoFrames.filter((f) => set.has(f.index)) };
  return exportSession(subset, options);
}

/** Audio-only export — no video frames, real audio-container encoding. */
function exportAudio(session, options = {}) {
  const audioOnly = { sessionId: session.sessionId, videoFrames: [], audio: session.audio };
  return exportSession(audioOnly, options);
}

/** Same operation as exportSession — named separately per the approved public API for callers thinking in terms of "the whole project". */
function exportProject(session, options = {}) {
  return exportSession(session, options);
}

function batchExport(sessions, options = {}) {
  if (!Array.isArray(sessions)) {
    throw new TypeError('[RecordExportSessionManager] batchExport() requires an array of sessions.');
  }
  return sessions.map((session) => exportSession(session, options));
}

function pauseExport(jobId) {
  const job = jobs.get(jobId);
  if (!job || (job.status !== STATUS.RUNNING && job.status !== STATUS.QUEUED)) return false;
  job.pauseRequested = true;
  return true;
}

/** @returns {Promise<object|null>|null} the resumed job's completion promise, or null if it wasn't paused. */
function resumeExport(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.status !== STATUS.PAUSED) return null;
  emit(EVENTS.RESUMED, { jobId: job.id, progress: job.progress });
  return _runJob(job);
}

function cancelExport(jobId) {
  const job = jobs.get(jobId);
  if (!job || job.status === STATUS.COMPLETED || job.status === STATUS.CANCELLED) return false;
  job.cancelRequested = true;
  return true;
}

function getStatus(jobId) {
  const job = jobs.get(jobId);
  if (!job) return null;
  return Object.freeze({
    id: job.id, sessionId: job.sessionId, status: job.status,
    progress: job.progress, error: job.error,
    frameCount: job.encodedFrames.length, hasBundle: Boolean(job.bundle)
  });
}

function getResult(jobId) {
  const job = jobs.get(jobId);
  return job && job.bundle ? job.bundle : null;
}

function getHistory(sessionId) {
  const entries = sessionId ? jobHistory.filter((h) => h.sessionId === sessionId) : jobHistory;
  return Object.freeze(entries.map((h) => Object.freeze({ ...h })));
}

/** Recomputes the checksum over a bundle's frames/audio and compares — real verification, not a stored flag. */
function verifyIntegrity(bundle) {
  if (!bundle || !Array.isArray(bundle.frames)) {
    return Object.freeze({ valid: false, reason: 'not a valid export bundle' });
  }
  const recomputed = _checksum(bundle.frames, bundle.audio);
  return Object.freeze({ valid: recomputed === bundle.checksum, expected: bundle.checksum, actual: recomputed });
}

function getCapabilities() {
  return Object.freeze({
    exportQueue: true, batchExport: true, pauseResume: true, cancel: true,
    progressReporting: true, chapters: true, bookmarks: true, integrityVerification: true,
    cloudExport: false, vaultIntegration: false // Not Approved (Phase 2) — honestly reported false, not omitted
  });
}

function getServiceManifest() {
  return Object.freeze({
    name: 'record-export-session-manager', version: '2.0.0', apiVersion: '1.0.0',
    priority: 30, mandatory: false, dependencies: ['codec-encoding-engine']
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[RecordExportSessionManager] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

function __resetForTests() {
  jobs.clear();
  jobHistory.length = 0;
  jobCounter = 0;
}

const RecordExportSessionManager = Object.freeze({
  STATUS, EVENTS, on,
  exportSession, exportClip, exportFrames, exportAudio, exportProject, batchExport,
  pauseExport, resumeExport, cancelExport,
  getStatus, getResult, getHistory, verifyIntegrity, getCapabilities,
  getServiceManifest, registerWithKernel,
  __resetForTests
});

export default RecordExportSessionManager;
