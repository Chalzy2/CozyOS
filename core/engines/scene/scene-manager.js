/**
 * =============================================================================
 * CozyOS Platform Engine — Scene Manager
 * File: core/engines/scene/scene-manager.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Scene Manager owns exactly one domain (Rule 3): production SCENES — their
 * registry, lifecycle, switching, validation, preview, metadata, and
 * automation. It coordinates Camera Manager and Audio Manager; it does not
 * own cameras, PTZ, camera health, audio devices, mixing, or routing — a
 * scene stores only REFERENCES (ids) to those, never copies of their state
 * (Rule 2, "Scene Manager never duplicates camera or audio state").
 *
 * INTERFACE VERIFICATION (Rule 21 — performed before writing this file)
 * ------------------------------------------------------------------------
 * The build prompt's illustrative examples (switchCamera(), getCameraHealth(),
 * switchMix(), getInputHealth(), getOutputHealth()) do not exist on the real,
 * certified Camera Manager / Audio Manager surfaces. Per Rule 23 (Certified
 * Engines Become Stable), those frozen surfaces were NOT modified to match
 * the illustrative names. This file calls only real, existing public methods:
 *   Camera Manager: getCamera(id), checkCameraHealth(id), switchActiveCamera(id),
 *                    previewCamera(id)
 *   Audio Manager:   getMicrophone(id), checkMicHealth(id),
 *                    selectPrimaryMicrophone(id), getMixState(), KNOWN_BUSES
 * No internals of either engine are touched (Rule 3).
 *
 * RECORDING / STREAMING (Rule 6 — honest, not fabricated)
 * ------------------------------------------------------------
 * Recording Engine and Streaming Engine do not exist yet in this codebase.
 * A scene's `recording` / `streaming` fields are stored as declared INTENT
 * only (booleans a future Recording/Streaming Engine would read) — Scene
 * Manager does not simulate, fake, or partially implement recording or
 * streaming behavior itself.
 *
 * DEPENDENCIES (Rule 17)
 * ------------------------
 * Camera Manager, Audio Manager, and Kernel — all already built and
 * certified. No Platform Integration Layer exists yet; like Kernel-only
 * dependence in Camera/Audio Manager, that is an optional future
 * integration point, not a blocker.
 * =============================================================================
 */

'use strict';

import CameraManager from '../camera/camera-manager.js';
import AudioManager from '../audio/audio-manager.js';

// -----------------------------------------------------------------------------
// Scene status (exact vocabulary from the spec)
// -----------------------------------------------------------------------------

const SCENE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  READY: 'READY',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
  FAILED: 'FAILED',
  PREVIEW: 'PREVIEW'
});

const SCENE_TYPES = Object.freeze([
  'Manual', 'Automatic', 'Scheduled', 'Emergency', 'Presentation',
  'Interview', 'Worship', 'Conference', 'Training'
]);

const EVENTS = Object.freeze({
  CREATED: 'scene-created',
  UPDATED: 'scene-updated',
  DELETED: 'scene-deleted',
  ACTIVATED: 'scene-activated',
  DEACTIVATED: 'scene-deactivated',
  PREVIEW_STARTED: 'scene-preview-started',
  PREVIEW_ENDED: 'scene-preview-ended',
  SWITCH: 'scene-switch',
  FAILED: 'scene-failed',
  RESTORED: 'scene-restored'
});

// -----------------------------------------------------------------------------
// Internal state
// -----------------------------------------------------------------------------

/** @type {Map<string, object>} */
const scenes = new Map();

let activeSceneId = null;
let sceneSeq = 0;

/** Bounded switch history: { from, to, reason, at } */
const switchHistory = [];
const MAX_HISTORY = 50;

/** Bounded validation-failure log for diagnostics */
const validationFailures = [];
const MAX_FAILURES = 50;

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
      console.error(`[SceneManager] listener error on "${eventName}":`, err);
    }
  }
}

function now() {
  return Date.now();
}

function assertScene(id) {
  const record = scenes.get(id);
  if (!record) throw new Error(`[SceneManager] Unknown scene: "${id}"`);
  return record;
}

// -----------------------------------------------------------------------------
// Health-triggered automation wiring (Rule 8 — event driven, real events
// from the real certified engines, not polled or fabricated)
// -----------------------------------------------------------------------------

CameraManager.on(CameraManager.EVENTS.ERROR, ({ id }) => {
  maybeFailoverForDevice('camera', id);
});
AudioManager.on(AudioManager.EVENTS.ERROR, ({ id }) => {
  maybeFailoverForDevice('mic', id);
});

function maybeFailoverForDevice(kind, deviceId) {
  if (!activeSceneId) return;
  const active = scenes.get(activeSceneId);
  if (!active) return;
  const affectsActive =
    (kind === 'camera' && active.camera.primaryCameraId === deviceId) ||
    (kind === 'mic' && active.audio.primaryMicId === deviceId);
  if (!affectsActive || !active.fallbackSceneId) return;
  if (!scenes.has(active.fallbackSceneId)) return;

  // BUGFIX (Rule 21): activateScene() is async (it awaits real health
  // checks); emit() calls this handler synchronously and does not await it,
  // so this was previously a fire-and-forget call with a try/catch that
  // could only ever catch a SYNCHRONOUS throw — an async rejection escaped
  // as an unhandled promise rejection and crashed the process. A real
  // .catch() on the returned promise is required, not a try/catch around
  // the call site.
  activateScene(active.fallbackSceneId, { reason: 'health-fallback' }).catch((err) => {
    // Honest: if the fallback itself is not viable, report it rather than
    // silently pretending the switch happened (Rule 6).
    emit(EVENTS.FAILED, { id: active.fallbackSceneId, reason: 'health-fallback', error: err.message });
  });
}

// -----------------------------------------------------------------------------
// Public API — Scene Lifecycle: create / update / delete / archive / restore
// -----------------------------------------------------------------------------

function createScene(input) {
  if (!input || !input.name) {
    throw new Error('[SceneManager] createScene requires at least a "name".');
  }
  sceneSeq += 1;
  const id = `scene-${sceneSeq}`;
  const record = {
    id,
    name: input.name,
    description: input.description || '',
    owner: input.owner || null,
    category: input.category || null,
    type: SCENE_TYPES.includes(input.type) ? input.type : 'Manual',
    tags: Array.isArray(input.tags) ? [...input.tags] : [],
    priority: typeof input.priority === 'number' ? input.priority : 0,
    version: 1,
    status: SCENE_STATUS.INACTIVE,
    // References only (Rule 2) — never copies of Camera/Audio Manager state
    camera: {
      primaryCameraId: input.camera?.primaryCameraId || null,
      backupCameraId: input.camera?.backupCameraId || null
    },
    audio: {
      primaryMicId: input.audio?.primaryMicId || null
    },
    overlay: input.overlay || null,
    output: input.output || 'program',
    recording: Boolean(input.recording),   // declared intent only — Recording Engine doesn't exist yet
    streaming: Boolean(input.streaming),   // declared intent only — Streaming Engine doesn't exist yet
    fallbackSceneId: input.fallbackSceneId || null,
    autoSwitchSignal: input.autoSwitchSignal || null,
    scheduledAt: input.scheduledAt || null,
    scheduledTriggered: false,
    createdAt: now(),
    updatedAt: now(),
    activatedAt: null,
    previewOf: null // remembers prior status while in PREVIEW
  };
  scenes.set(id, record);
  emit(EVENTS.CREATED, { id });
  return getScene(id);
}

function updateScene(id, patch) {
  const record = assertScene(id);
  if (record.status === SCENE_STATUS.ARCHIVED) {
    throw new Error(`[SceneManager] Cannot update archived scene "${id}" — restore it first.`);
  }
  const editable = [
    'name', 'description', 'owner', 'category', 'type', 'tags', 'priority',
    'camera', 'audio', 'overlay', 'output', 'recording', 'streaming',
    'fallbackSceneId', 'autoSwitchSignal', 'scheduledAt'
  ];
  for (const key of editable) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) {
      if (key === 'camera') {
        record.camera = { ...record.camera, ...patch.camera };
      } else if (key === 'audio') {
        record.audio = { ...record.audio, ...patch.audio };
      } else {
        record[key] = patch[key];
      }
    }
  }
  record.version += 1;
  record.updatedAt = now();
  // Structural changes invalidate a prior READY verdict — force re-validation.
  // ACTIVE/PREVIEW scenes keep their live status; the operator is editing a
  // scene that is currently on-air/previewed and remains so until switched.
  if (record.status === SCENE_STATUS.READY || record.status === SCENE_STATUS.FAILED) {
    record.status = SCENE_STATUS.INACTIVE;
  }
  emit(EVENTS.UPDATED, { id });
  return getScene(id);
}

function deleteScene(id) {
  const record = assertScene(id);
  if (record.status === SCENE_STATUS.ACTIVE) {
    throw new Error(`[SceneManager] Cannot delete active scene "${id}" — deactivate it first.`);
  }
  scenes.delete(id);
  emit(EVENTS.DELETED, { id });
  return true;
}

function archiveScene(id) {
  const record = assertScene(id);
  if (record.status === SCENE_STATUS.ACTIVE) {
    throw new Error(`[SceneManager] Cannot archive active scene "${id}" — deactivate it first.`);
  }
  record.status = SCENE_STATUS.ARCHIVED;
  record.updatedAt = now();
  return getScene(id);
}

function restoreScene(id) {
  const record = assertScene(id);
  if (record.status !== SCENE_STATUS.ARCHIVED) {
    throw new Error(`[SceneManager] Cannot restore scene "${id}": it is not ARCHIVED.`);
  }
  record.status = SCENE_STATUS.INACTIVE;
  record.updatedAt = now();
  emit(EVENTS.RESTORED, { id });
  return getScene(id);
}

// -----------------------------------------------------------------------------
// Public API — Scene Validation (calls Camera/Audio Manager public methods
// only — Rule 3 — and performs REAL live health checks, not cached guesses)
// -----------------------------------------------------------------------------

async function validateSceneInternal(id) {
  const record = assertScene(id);
  const errors = [];

  // Camera checks
  if (!record.camera.primaryCameraId) {
    errors.push('No primary camera assigned.');
  } else {
    let cam;
    try {
      cam = CameraManager.getCamera(record.camera.primaryCameraId);
    } catch {
      errors.push(`Primary camera "${record.camera.primaryCameraId}" does not exist.`);
    }
    if (cam) {
      if (cam.state !== CameraManager.CAMERA_STATES.CONNECTED) {
        errors.push(`Primary camera "${cam.id}" is ${cam.state}, not CONNECTED.`);
      } else {
        const health = await CameraManager.checkCameraHealth(cam.id);
        if (!health.ok) errors.push(`Primary camera "${cam.id}" is unhealthy: ${health.detail || 'unknown fault'}.`);
      }
    }
  }
  if (record.camera.backupCameraId) {
    try {
      CameraManager.getCamera(record.camera.backupCameraId);
    } catch {
      errors.push(`Backup camera "${record.camera.backupCameraId}" does not exist.`);
    }
  }

  // Audio checks
  if (!record.audio.primaryMicId) {
    errors.push('No audio mix (primary microphone) assigned.');
  } else {
    let mic;
    try {
      mic = AudioManager.getMicrophone(record.audio.primaryMicId);
    } catch {
      errors.push(`Audio mix reference "${record.audio.primaryMicId}" does not exist.`);
    }
    if (mic) {
      if (mic.state !== AudioManager.MIC_STATES.CONNECTED) {
        errors.push(`Primary microphone "${mic.id}" is ${mic.state}, not CONNECTED.`);
      } else {
        const health = await AudioManager.checkMicHealth(mic.id);
        if (!health.ok) errors.push(`Primary microphone "${mic.id}" is unhealthy: ${health.detail || 'unknown fault'}.`);
      }
    }
  }

  // Output check — reuses Audio Manager's real, existing bus vocabulary
  // rather than inventing a separate "outputs" concept (Rule 2).
  if (!AudioManager.KNOWN_BUSES.includes(record.output)) {
    errors.push(`Output "${record.output}" is not a known bus (${AudioManager.KNOWN_BUSES.join(', ')}).`);
  }

  return { valid: errors.length === 0, errors };
}

async function validateScene(id) {
  const record = assertScene(id);
  const result = await validateSceneInternal(id);

  if (record.status !== SCENE_STATUS.ACTIVE && record.status !== SCENE_STATUS.ARCHIVED && record.status !== SCENE_STATUS.PREVIEW) {
    record.status = result.valid ? SCENE_STATUS.READY : SCENE_STATUS.FAILED;
    record.updatedAt = now();
  }
  if (!result.valid) {
    validationFailures.push({ id, errors: result.errors, at: now() });
    if (validationFailures.length > MAX_FAILURES) validationFailures.shift();
  }
  return result;
}

// -----------------------------------------------------------------------------
// Public API — Scene Preview (read-only — never touches production camera/
// audio state, per spec: "Preview without affecting production")
// -----------------------------------------------------------------------------

async function previewScene(id) {
  const record = assertScene(id);
  if (record.status === SCENE_STATUS.ARCHIVED) {
    throw new Error(`[SceneManager] Cannot preview archived scene "${id}".`);
  }
  const validation = await validateSceneInternal(id);

  const cameraInfo = record.camera.primaryCameraId
    ? safeGet(() => CameraManager.getCamera(record.camera.primaryCameraId))
    : null;
  const audioInfo = record.audio.primaryMicId
    ? safeGet(() => AudioManager.getMicrophone(record.audio.primaryMicId))
    : null;
  // previewCamera() only returns a handle for an already-CONNECTED camera —
  // preview never calls switchActiveCamera/selectPrimaryMicrophone, so
  // production output is never touched.
  const previewHandle = cameraInfo && cameraInfo.state === CameraManager.CAMERA_STATES.CONNECTED
    ? safeGet(() => CameraManager.previewCamera(cameraInfo.id))
    : null;

  record.previewOf = record.status;
  record.status = SCENE_STATUS.PREVIEW;
  record.updatedAt = now();
  emit(EVENTS.PREVIEW_STARTED, { id });

  return Object.freeze({
    id,
    valid: validation.valid,
    errors: validation.errors,
    camera: cameraInfo,
    previewHandle,
    audio: audioInfo,
    overlay: record.overlay,
    status: record.status
  });
}

function endPreview(id) {
  const record = assertScene(id);
  if (record.status !== SCENE_STATUS.PREVIEW) {
    throw new Error(`[SceneManager] Scene "${id}" is not in PREVIEW.`);
  }
  record.status = record.previewOf || SCENE_STATUS.INACTIVE;
  record.previewOf = null;
  record.updatedAt = now();
  emit(EVENTS.PREVIEW_ENDED, { id });
  return getScene(id);
}

function safeGet(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Public API — Scene Switching / Activation
// -----------------------------------------------------------------------------

async function activateScene(id, { reason = 'manual' } = {}) {
  const record = assertScene(id);
  if (record.status === SCENE_STATUS.ARCHIVED) {
    throw new Error(`[SceneManager] Cannot activate archived scene "${id}" — restore it first.`);
  }

  const validation = await validateSceneInternal(id);
  if (!validation.valid) {
    record.status = SCENE_STATUS.FAILED;
    record.updatedAt = now();
    validationFailures.push({ id, errors: validation.errors, at: now() });
    if (validationFailures.length > MAX_FAILURES) validationFailures.shift();
    emit(EVENTS.FAILED, { id, errors: validation.errors, reason });
    throw new Error(`[SceneManager] Cannot activate "${id}": ${validation.errors.join(' ')}`);
  }

  // Real calls to real, certified public methods only (Rule 3).
  CameraManager.switchActiveCamera(record.camera.primaryCameraId);
  AudioManager.selectPrimaryMicrophone(record.audio.primaryMicId);

  const previousId = activeSceneId;
  if (previousId && previousId !== id) {
    const previous = scenes.get(previousId);
    if (previous) {
      previous.status = SCENE_STATUS.READY;
      previous.updatedAt = now();
      emit(EVENTS.DEACTIVATED, { id: previousId });
    }
  }

  record.status = SCENE_STATUS.ACTIVE;
  record.activatedAt = now();
  record.updatedAt = now();
  activeSceneId = id;

  switchHistory.push({ from: previousId, to: id, reason, at: now() });
  if (switchHistory.length > MAX_HISTORY) switchHistory.shift();

  emit(EVENTS.ACTIVATED, { id, reason });
  emit(EVENTS.SWITCH, { from: previousId, to: id, reason });

  return getScene(id);
}

async function switchScene(id, { reason = 'manual', allowFallback = true } = {}) {
  try {
    return await activateScene(id, { reason });
  } catch (err) {
    const record = scenes.get(id);
    if (allowFallback && record?.fallbackSceneId && scenes.has(record.fallbackSceneId)) {
      return activateScene(record.fallbackSceneId, { reason: 'fallback' });
    }
    throw err;
  }
}

function deactivateScene(id) {
  const record = assertScene(id);
  if (activeSceneId !== id) {
    throw new Error(`[SceneManager] Scene "${id}" is not the active scene.`);
  }
  record.status = SCENE_STATUS.READY;
  record.updatedAt = now();
  activeSceneId = null;
  emit(EVENTS.DEACTIVATED, { id });
  return getScene(id);
}

async function undoLastSwitch() {
  const last = switchHistory[switchHistory.length - 1];
  if (!last || !last.from || !scenes.has(last.from)) {
    throw new Error('[SceneManager] No previous scene available to undo to.');
  }
  return activateScene(last.from, { reason: 'undo' });
}

function getActiveScene() {
  return activeSceneId ? getScene(activeSceneId) : null;
}

// -----------------------------------------------------------------------------
// Public API — Automation (Time/Schedule/Event(signal)/Health/Manual)
// Health-triggered failover is wired above via real engine events.
// Schedule/signal triggers are deterministic, callable functions rather than
// a hidden internal timer, so they stay honestly testable (Rule 6).
// -----------------------------------------------------------------------------

async function triggerSignal(signalName) {
  const candidate = [...scenes.values()].find(
    (s) => s.autoSwitchSignal === signalName && s.status !== SCENE_STATUS.ARCHIVED && s.id !== activeSceneId
  );
  if (!candidate) return null;
  return switchScene(candidate.id, { reason: `signal:${signalName}` });
}

async function runScheduledChecks(nowTs = now()) {
  const triggered = [];
  for (const record of scenes.values()) {
    if (
      record.scheduledAt &&
      !record.scheduledTriggered &&
      record.status !== SCENE_STATUS.ARCHIVED &&
      nowTs >= record.scheduledAt
    ) {
      record.scheduledTriggered = true;
      try {
        await switchScene(record.id, { reason: 'scheduled' });
        triggered.push(record.id);
      } catch (err) {
        emit(EVENTS.FAILED, { id: record.id, reason: 'scheduled', error: err.message });
      }
    }
  }
  return triggered;
}

// -----------------------------------------------------------------------------
// Public API — Queries
// -----------------------------------------------------------------------------

function getScene(id) {
  const record = assertScene(id);
  return Object.freeze({
    id: record.id,
    name: record.name,
    description: record.description,
    owner: record.owner,
    category: record.category,
    type: record.type,
    tags: [...record.tags],
    priority: record.priority,
    version: record.version,
    status: record.status,
    camera: { ...record.camera },
    audio: { ...record.audio },
    overlay: record.overlay,
    output: record.output,
    recording: record.recording,
    streaming: record.streaming,
    fallbackSceneId: record.fallbackSceneId,
    autoSwitchSignal: record.autoSwitchSignal,
    scheduledAt: record.scheduledAt,
    isActive: activeSceneId === record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    activatedAt: record.activatedAt
  });
}

function listScenes() {
  return [...scenes.keys()].map(getScene);
}

// -----------------------------------------------------------------------------
// Public API — Diagnostics (Rule 13, scene-domain only — Rule 3)
// -----------------------------------------------------------------------------

function getSceneDiagnostics() {
  const all = listScenes();
  return Object.freeze({
    registeredScenes: all.length,
    activeScene: getActiveScene(),
    inactiveScenes: all.filter((s) => s.status === SCENE_STATUS.INACTIVE).map((s) => s.id),
    readyScenes: all.filter((s) => s.status === SCENE_STATUS.READY).map((s) => s.id),
    failedScenes: all.filter((s) => s.status === SCENE_STATUS.FAILED).map((s) => s.id),
    archivedScenes: all.filter((s) => s.status === SCENE_STATUS.ARCHIVED).map((s) => s.id),
    previewScenes: all.filter((s) => s.status === SCENE_STATUS.PREVIEW).map((s) => s.id),
    validationFailures: [...validationFailures],
    switchHistory: [...switchHistory]
  });
}

// -----------------------------------------------------------------------------
// Kernel integration (same real, verified contract Camera/Audio Manager use)
// -----------------------------------------------------------------------------

function getServiceManifest() {
  return Object.freeze({
    name: 'scene-manager',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 20,
    mandatory: false,
    dependencies: ['camera-manager', 'audio-manager']
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[SceneManager] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

// -----------------------------------------------------------------------------
// Test-only reset
// -----------------------------------------------------------------------------

function __resetForTests() {
  scenes.clear();
  activeSceneId = null;
  sceneSeq = 0;
  switchHistory.length = 0;
  validationFailures.length = 0;
  listeners.clear();
}

// -----------------------------------------------------------------------------
// Frozen public surface
// -----------------------------------------------------------------------------

const SceneManager = Object.freeze({
  SCENE_STATUS,
  SCENE_TYPES,
  EVENTS,

  // events
  on,

  // lifecycle
  createScene,
  updateScene,
  deleteScene,
  archiveScene,
  restoreScene,

  // validation
  validateScene,

  // preview
  previewScene,
  endPreview,

  // switching
  activateScene,
  switchScene,
  deactivateScene,
  undoLastSwitch,
  getActiveScene,

  // automation
  triggerSignal,
  runScheduledChecks,

  // queries
  getScene,
  listScenes,

  // diagnostics
  getSceneDiagnostics,

  // kernel integration
  getServiceManifest,
  registerWithKernel,

  // test-only
  __resetForTests
});

export default SceneManager;
