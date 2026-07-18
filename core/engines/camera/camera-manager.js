/**
 * =============================================================================
 * CozyOS Platform Engine — Camera Manager
 * File: core/engines/camera/camera-manager.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Camera Manager owns exactly one domain (Rule 3): the lifecycle of camera
 * DEVICES feeding Cozy Live — detect, register, connect/switch, preview
 * handle, PTZ, hot-plug, per-device health. It does not own audio, scenes,
 * encoding, recording, or streaming — those are separate engines downstream
 * in the Cozy Live pipeline (Rule 1).
 *
 * HONESTY (Rule 6 — no fabricated hardware access)
 * ---------------------------------------------------
 * This runtime has no real USB/IP/HDMI/PTZ hardware to talk to. Rather than
 * fabricate device I/O, Camera Manager defines a PROVIDER INTERFACE
 * (mirroring the spec's own "AI Extension Points: expose provider
 * interfaces, do not implement" pattern) and contains zero hardware-specific
 * code itself. A real deployment wires in real adapters — e.g. node-usb,
 * ONVIF/RTSP for IP cameras, a capture-card SDK for HDMI, getUserMedia for
 * webcam, PTZ-over-VISCA/ONVIF for PTZ — each implementing the same
 * interface. This file ships one reference provider
 * (createInMemoryCameraProvider, in provider-inmemory.js) purely so the
 * orchestration logic below is genuinely exercised end-to-end by real,
 * executed tests (Rule 20) instead of being verified only on paper.
 *
 * PROVIDER INTERFACE CONTRACT
 * ------------------------------
 * A provider adapter is an object of shape:
 *   {
 *     type: string,                                  // 'usb' | 'ip' | 'hdmi' | 'webcam' | 'ptz' | custom
 *     listDevices(): Promise<Array<{ externalId, name, metadata?, ptzCapable? }>>,
 *     connect(externalId): Promise<{ streamHandle }>,
 *     disconnect(externalId): Promise<void>,
 *     getHealth(externalId): Promise<{ ok: boolean, detail?: string }>,
 *     sendPTZCommand?(externalId, command): Promise<void>,  // only if ptzCapable devices exist
 *     on?(eventName, handler): () => void                    // optional hot-plug source:
 *                                                              // 'device:added' | 'device:removed'
 *   }
 *
 * DEPENDENCIES (Rule 17)
 * ------------------------
 * Depends on Kernel (core/kernel/kernel.js) only for optional self-
 * registration as a platform service (registerWithKernel). Camera-level
 * orchestration itself has zero kernel dependency and works standalone.
 * Identity (permission: who can switch/connect a camera) and Vault (secure
 * stream credentials) are NOT required for this module — per the agreed
 * Phase 1 scope, those integrate later without changing this file's public
 * surface.
 * =============================================================================
 */

'use strict';

// -----------------------------------------------------------------------------
// Camera device states (Camera Manager's own domain — distinct from
// Lifecycle's SERVICE runtime states; a managed device is not a platform
// service, so this is a separate state machine, not duplication of Rule 12)
// -----------------------------------------------------------------------------

const CAMERA_STATES = Object.freeze({
  DETECTED: 'DETECTED',       // seen by a provider, not yet registered
  REGISTERED: 'REGISTERED',   // known to Camera Manager, not connected
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR',
  DISCONNECTED: 'DISCONNECTED',
  REMOVED: 'REMOVED'
});

const TRANSITIONS = Object.freeze({
  [CAMERA_STATES.REGISTERED]: [CAMERA_STATES.CONNECTING, CAMERA_STATES.REMOVED],
  [CAMERA_STATES.CONNECTING]: [CAMERA_STATES.CONNECTED, CAMERA_STATES.ERROR],
  [CAMERA_STATES.CONNECTED]: [CAMERA_STATES.DISCONNECTED, CAMERA_STATES.ERROR],
  [CAMERA_STATES.ERROR]: [CAMERA_STATES.CONNECTING, CAMERA_STATES.REMOVED],
  [CAMERA_STATES.DISCONNECTED]: [CAMERA_STATES.CONNECTING, CAMERA_STATES.REMOVED],
  [CAMERA_STATES.REMOVED]: []
});

const EVENTS = Object.freeze({
  DETECTED: 'camera:detected',
  REGISTERED: 'camera:registered',
  CONNECTING: 'camera:connecting',
  CONNECTED: 'camera:connected',
  ACTIVE_CHANGED: 'camera:active-changed',
  DISCONNECTED: 'camera:disconnected',
  ERROR: 'camera:error',
  REMOVED: 'camera:removed',
  HOTPLUG_ADDED: 'camera:hotplug-added',
  HOTPLUG_REMOVED: 'camera:hotplug-removed'
});

// -----------------------------------------------------------------------------
// Internal state
// -----------------------------------------------------------------------------

/** @type {Map<string, object>} providerType -> provider adapter */
const providers = new Map();

/** @type {Map<string, object>} cameraId -> camera record */
const cameras = new Map();

/** Last raw detection result per provider type, for diagnostics only. */
const lastDetection = new Map();

let activeCameraId = null;
let cameraSeq = 0;

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
      console.error(`[CameraManager] listener error on "${eventName}":`, err);
    }
  }
}

function now() {
  return Date.now();
}

function assertCamera(id) {
  const record = cameras.get(id);
  if (!record) throw new Error(`[CameraManager] Unknown camera: "${id}"`);
  return record;
}

function transition(record, nextState) {
  const allowed = TRANSITIONS[record.state] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(`[CameraManager] Illegal transition for "${record.id}": ${record.state} -> ${nextState}`);
  }
  record.state = nextState;
  record.history.push({ state: nextState, at: now() });
  if (record.history.length > 50) record.history.shift();
}

// -----------------------------------------------------------------------------
// Public API — Provider registration (Rule 17: dependency-first extension
// point, not a fabricated hardware implementation)
// -----------------------------------------------------------------------------

function registerProvider(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('[CameraManager] registerProvider requires an adapter object.');
  }
  if (!adapter.type || typeof adapter.type !== 'string') {
    throw new Error('[CameraManager] provider adapter requires a string "type".');
  }
  const requiredFns = ['listDevices', 'connect', 'disconnect', 'getHealth'];
  for (const fn of requiredFns) {
    if (typeof adapter[fn] !== 'function') {
      throw new Error(`[CameraManager] provider "${adapter.type}" is missing required method "${fn}".`);
    }
  }
  providers.set(adapter.type, adapter);

  // Hot-plug support (Rule 8: event-driven) — only if the provider exposes
  // its own event source. Camera Manager never polls hardware itself.
  if (typeof adapter.on === 'function') {
    adapter.on('device:added', (device) => {
      emit(EVENTS.HOTPLUG_ADDED, { providerType: adapter.type, device });
    });
    adapter.on('device:removed', (device) => {
      // If a hot-unplugged device was connected, mark it accordingly rather
      // than silently losing track of it.
      const existing = [...cameras.values()].find(
        (c) => c.providerType === adapter.type && c.externalId === device.externalId
      );
      if (existing && existing.state === CAMERA_STATES.CONNECTED) {
        transition(existing, CAMERA_STATES.DISCONNECTED);
        emit(EVENTS.DISCONNECTED, { id: existing.id, reason: 'hot-unplug' });
      }
      emit(EVENTS.HOTPLUG_REMOVED, { providerType: adapter.type, device });
    });
  }

  return true;
}

function getProvider(type) {
  return providers.get(type) || null;
}

function listProviders() {
  return [...providers.keys()];
}

// -----------------------------------------------------------------------------
// Public API — Detection (Rule 6: reports exactly what providers return,
// never invents devices)
// -----------------------------------------------------------------------------

async function detectCameras(providerType) {
  const types = providerType ? [providerType] : [...providers.keys()];
  const results = [];

  for (const type of types) {
    const provider = providers.get(type);
    if (!provider) {
      throw new Error(`[CameraManager] No provider registered for type "${type}".`);
    }
    const devices = await provider.listDevices();
    lastDetection.set(type, { at: now(), devices });
    for (const device of devices) {
      const entry = { providerType: type, ...device };
      results.push(entry);
      emit(EVENTS.DETECTED, entry);
    }
  }
  return results;
}

// -----------------------------------------------------------------------------
// Public API — Registration
// -----------------------------------------------------------------------------

function registerCamera({ providerType, externalId, name, metadata, ptzCapable }) {
  if (!providers.has(providerType)) {
    throw new Error(`[CameraManager] Cannot register camera: no provider for type "${providerType}".`);
  }
  if (!externalId) {
    throw new Error('[CameraManager] registerCamera requires externalId.');
  }
  const alreadyRegistered = [...cameras.values()].find(
    (c) => c.providerType === providerType && c.externalId === externalId && c.state !== CAMERA_STATES.REMOVED
  );
  if (alreadyRegistered) {
    throw new Error(`[CameraManager] Camera "${externalId}" (${providerType}) is already registered as "${alreadyRegistered.id}".`);
  }

  cameraSeq += 1;
  const id = `cam-${cameraSeq}`;
  const record = {
    id,
    providerType,
    externalId,
    name: name || externalId,
    metadata: metadata || {},
    ptzCapable: Boolean(ptzCapable),
    state: CAMERA_STATES.REGISTERED,
    streamHandle: null,
    lastHealth: null,
    registeredAt: now(),
    connectedAt: null,
    history: [{ state: CAMERA_STATES.REGISTERED, at: now() }]
  };
  cameras.set(id, record);
  emit(EVENTS.REGISTERED, { id, providerType, externalId });
  return getCamera(id);
}

async function removeCamera(id) {
  const record = assertCamera(id);
  if (record.state === CAMERA_STATES.CONNECTED) {
    // Best-effort disconnect before removal — never leave a provider handle dangling.
    // BUGFIX: disconnectCamera() is async; this must be awaited or the REMOVED
    // transition below races ahead of the DISCONNECTED transition and hits the
    // real state machine's illegal-transition guard (CONNECTED -> REMOVED is
    // not a legal edge — only DISCONNECTED -> REMOVED is).
    await disconnectCamera(id);
  }
  transition(record, CAMERA_STATES.REMOVED);
  if (activeCameraId === id) {
    activeCameraId = null;
    emit(EVENTS.ACTIVE_CHANGED, { id: null, previous: id });
  }
  cameras.delete(id);
  emit(EVENTS.REMOVED, { id });
  return true;
}

// -----------------------------------------------------------------------------
// Public API — Connect / switch / disconnect
// -----------------------------------------------------------------------------

async function connectCamera(id) {
  const record = assertCamera(id);
  const provider = providers.get(record.providerType);
  transition(record, CAMERA_STATES.CONNECTING);
  emit(EVENTS.CONNECTING, { id });

  try {
    const { streamHandle } = await provider.connect(record.externalId);
    record.streamHandle = streamHandle;
    transition(record, CAMERA_STATES.CONNECTED);
    record.connectedAt = now();
    emit(EVENTS.CONNECTED, { id, streamHandle });
    return getCamera(id);
  } catch (err) {
    transition(record, CAMERA_STATES.ERROR);
    emit(EVENTS.ERROR, { id, error: err?.message || String(err) });
    throw err;
  }
}

async function disconnectCamera(id) {
  const record = assertCamera(id);
  const provider = providers.get(record.providerType);
  await provider.disconnect(record.externalId);
  record.streamHandle = null;
  transition(record, CAMERA_STATES.DISCONNECTED);
  if (activeCameraId === id) {
    activeCameraId = null;
    emit(EVENTS.ACTIVE_CHANGED, { id: null, previous: record.id });
  }
  emit(EVENTS.DISCONNECTED, { id });
  return getCamera(id);
}

/**
 * Sets the active (program-output) camera. Requires the camera to already
 * be CONNECTED — switching does not implicitly connect (explicit over
 * implicit, so failures are never silently masked).
 */
function switchActiveCamera(id) {
  const record = assertCamera(id);
  if (record.state !== CAMERA_STATES.CONNECTED) {
    throw new Error(`[CameraManager] Cannot switch to "${id}": camera is ${record.state}, not CONNECTED.`);
  }
  const previous = activeCameraId;
  activeCameraId = id;
  emit(EVENTS.ACTIVE_CHANGED, { id, previous });
  return getCamera(id);
}

function getActiveCamera() {
  return activeCameraId ? getCamera(activeCameraId) : null;
}

// -----------------------------------------------------------------------------
// Public API — Preview (returns whatever provider-supplied handle exists;
// never fabricates video data — Rule 6)
// -----------------------------------------------------------------------------

function previewCamera(id) {
  const record = assertCamera(id);
  if (record.state !== CAMERA_STATES.CONNECTED) {
    throw new Error(`[CameraManager] Cannot preview "${id}": camera is ${record.state}, not CONNECTED.`);
  }
  return record.streamHandle;
}

// -----------------------------------------------------------------------------
// Public API — PTZ (Rule 15: no speculative over-build — only exposed for
// cameras that actually declared ptzCapable AND whose provider implements it)
// -----------------------------------------------------------------------------

async function sendPTZCommand(id, command) {
  const record = assertCamera(id);
  if (!record.ptzCapable) {
    throw new Error(`[CameraManager] Camera "${id}" is not PTZ-capable.`);
  }
  const provider = providers.get(record.providerType);
  if (typeof provider.sendPTZCommand !== 'function') {
    throw new Error(`[CameraManager] Provider "${record.providerType}" does not implement sendPTZCommand.`);
  }
  if (record.state !== CAMERA_STATES.CONNECTED) {
    throw new Error(`[CameraManager] Cannot send PTZ command to "${id}": camera is ${record.state}, not CONNECTED.`);
  }
  await provider.sendPTZCommand(record.externalId, command);
  return true;
}

// -----------------------------------------------------------------------------
// Public API — Health / diagnostics (Rule 13, camera-domain only — Rule 3)
// -----------------------------------------------------------------------------

async function checkCameraHealth(id) {
  const record = assertCamera(id);
  const provider = providers.get(record.providerType);
  try {
    const health = await provider.getHealth(record.externalId);
    record.lastHealth = { ...health, checkedAt: now() };
    if (health && health.ok === false && record.state === CAMERA_STATES.CONNECTED) {
      transition(record, CAMERA_STATES.ERROR);
      emit(EVENTS.ERROR, { id, error: health.detail || 'Provider reported unhealthy.' });
    }
    return record.lastHealth;
  } catch (err) {
    record.lastHealth = { ok: false, detail: err?.message || String(err), checkedAt: now() };
    return record.lastHealth;
  }
}

async function checkAllHealth() {
  const results = [];
  for (const id of cameras.keys()) {
    results.push({ id, health: await checkCameraHealth(id) });
  }
  return results;
}

// -----------------------------------------------------------------------------
// Public API — Queries
// -----------------------------------------------------------------------------

function getCamera(id) {
  const record = assertCamera(id);
  return Object.freeze({
    id: record.id,
    providerType: record.providerType,
    externalId: record.externalId,
    name: record.name,
    metadata: { ...record.metadata },
    ptzCapable: record.ptzCapable,
    state: record.state,
    isActive: activeCameraId === record.id,
    lastHealth: record.lastHealth,
    registeredAt: record.registeredAt,
    connectedAt: record.connectedAt
  });
}

function listCameras() {
  return [...cameras.keys()].map(getCamera);
}

function getLastDetection(providerType) {
  return lastDetection.get(providerType) || null;
}

// -----------------------------------------------------------------------------
// Kernel integration (Rule 9 — Service Manifest, optional self-registration)
// -----------------------------------------------------------------------------

function getServiceManifest() {
  return Object.freeze({
    name: 'camera-manager',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 10,
    mandatory: false,
    dependencies: []
  });
}

/**
 * Registers Camera Manager itself as a platform service with a real Kernel
 * instance. Optional — Camera Manager's own device logic works without
 * this, per the agreed Phase 1 (offline-first media core before kernel/
 * identity/vault integration is mandatory).
 * @param {object} kernel - the real Kernel singleton (core/kernel/kernel.js)
 */
async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[CameraManager] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

// -----------------------------------------------------------------------------
// Test-only reset (not part of the frozen public surface — used exclusively
// by the test suite to isolate cases; production code has no reason to call
// this since a running platform has exactly one Camera Manager instance)
// -----------------------------------------------------------------------------

function __resetForTests() {
  providers.clear();
  cameras.clear();
  lastDetection.clear();
  activeCameraId = null;
  cameraSeq = 0;
  listeners.clear();
}

// -----------------------------------------------------------------------------
// Frozen public surface
// -----------------------------------------------------------------------------

const CameraManager = Object.freeze({
  CAMERA_STATES,
  EVENTS,

  // events
  on,

  // providers
  registerProvider,
  getProvider,
  listProviders,

  // detection
  detectCameras,
  getLastDetection,

  // registration
  registerCamera,
  removeCamera,

  // connection / switching
  connectCamera,
  disconnectCamera,
  switchActiveCamera,
  getActiveCamera,

  // preview
  previewCamera,

  // PTZ
  sendPTZCommand,

  // health
  checkCameraHealth,
  checkAllHealth,

  // queries
  getCamera,
  listCameras,

  // kernel integration
  getServiceManifest,
  registerWithKernel,

  // test-only
  __resetForTests
});

export default CameraManager;
