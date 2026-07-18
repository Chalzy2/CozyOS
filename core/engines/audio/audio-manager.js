/**
 * =============================================================================
 * CozyOS Platform Engine — Audio Manager
 * File: core/engines/audio/audio-manager.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Audio Manager owns two related things in one domain (Rule 3): the
 * lifecycle of microphone DEVICES, and the MIXER state layered on top of
 * them — gain, mute, echo cancellation, noise reduction, monitoring levels,
 * routing to output buses, and backup-microphone failover. It does not own
 * video, scenes, encoding, recording, or streaming (Rule 1).
 *
 * RELATIONSHIP TO CAMERA MANAGER (read per Rule 21 before writing this file)
 * ------------------------------------------------------------------------
 * Camera Manager (core/engines/camera/camera-manager.js) is a sibling
 * engine, not a dependency — per the architecture, Camera Sources -> Camera
 * Manager and Microphones -> Audio Manager both feed Scene Manager
 * independently; nothing here calls into Camera Manager. Its real,
 * certified interface was read first only to confirm the conventions this
 * file should follow: frozen singleton, STATES/EVENTS constants, a
 * provider-interface seam for hardware (never fabricated), on() event bus,
 * getServiceManifest()/registerWithKernel() for Kernel integration, and
 * __resetForTests(). Kernel's real registerEngine()/validateManifest()
 * contract (already verified in kernel.test.js) is reused as-is, unchanged.
 *
 * HONESTY (Rule 6 — no fabricated DSP/hardware access)
 * ---------------------------------------------------------
 * This runtime has no real audio hardware. Device I/O and DSP capability
 * (gain, mute, echo cancellation, noise reduction, level metering) sit
 * behind a PROVIDER INTERFACE. Base device operations (list/connect/
 * disconnect/health) are required of every provider; DSP methods are
 * OPTIONAL per provider (some hardware exposes hardware gain/mute, some
 * doesn't) — Audio Manager calls them only if present and throws an honest
 * "not supported by this provider" error otherwise, never a fabricated
 * success. Software mute is the one exception: since Audio Manager owns the
 * mix itself, mute state is always tracked here regardless of hardware DSP
 * support, so downstream mixing can honor it even on dumb hardware.
 *
 * PROVIDER INTERFACE CONTRACT
 * ------------------------------
 * A provider adapter is an object of shape:
 *   {
 *     type: string,
 *     listDevices(): Promise<Array<{ externalId, name, metadata? }>>,
 *     connect(externalId): Promise<{ streamHandle }>,
 *     disconnect(externalId): Promise<void>,
 *     getHealth(externalId): Promise<{ ok: boolean, detail?: string }>,
 *     setGain?(externalId, gainDb): Promise<void>,
 *     setMute?(externalId, muted): Promise<void>,
 *     setEchoCancellation?(externalId, enabled): Promise<void>,
 *     setNoiseReduction?(externalId, enabled): Promise<void>,
 *     getLevel?(externalId): Promise<{ peakDb: number, rmsDb: number }>,
 *     on?(eventName, handler): () => void   // 'device:added' | 'device:removed'
 *   }
 *
 * DEPENDENCIES (Rule 17)
 * ------------------------
 * Depends on Kernel (core/kernel/kernel.js) only for optional self-
 * registration as a platform service. Identity (who may mute/route) and
 * Vault are not required for this module, per the agreed Phase 1 scope.
 * =============================================================================
 */

'use strict';

// -----------------------------------------------------------------------------
// Microphone device states — same pattern as Camera Manager's CAMERA_STATES,
// independently defined for Audio Manager's own domain (Rule 3: each device-
// owning engine owns its own FSM; this is a shared pattern, not a shared
// responsibility, so it is not a Rule 2 duplication).
// -----------------------------------------------------------------------------

const MIC_STATES = Object.freeze({
  REGISTERED: 'REGISTERED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  ERROR: 'ERROR',
  DISCONNECTED: 'DISCONNECTED',
  REMOVED: 'REMOVED'
});

const TRANSITIONS = Object.freeze({
  [MIC_STATES.REGISTERED]: [MIC_STATES.CONNECTING, MIC_STATES.REMOVED],
  [MIC_STATES.CONNECTING]: [MIC_STATES.CONNECTED, MIC_STATES.ERROR],
  [MIC_STATES.CONNECTED]: [MIC_STATES.DISCONNECTED, MIC_STATES.ERROR],
  [MIC_STATES.ERROR]: [MIC_STATES.CONNECTING, MIC_STATES.REMOVED],
  [MIC_STATES.DISCONNECTED]: [MIC_STATES.CONNECTING, MIC_STATES.REMOVED],
  [MIC_STATES.REMOVED]: []
});

const EVENTS = Object.freeze({
  DETECTED: 'audio:detected',
  REGISTERED: 'audio:registered',
  CONNECTING: 'audio:connecting',
  CONNECTED: 'audio:connected',
  PRIMARY_CHANGED: 'audio:primary-changed',
  BACKUP_FAILOVER: 'audio:backup-failover',
  DISCONNECTED: 'audio:disconnected',
  ERROR: 'audio:error',
  REMOVED: 'audio:removed',
  HOTPLUG_ADDED: 'audio:hotplug-added',
  HOTPLUG_REMOVED: 'audio:hotplug-removed',
  GAIN_CHANGED: 'audio:gain-changed',
  MUTE_CHANGED: 'audio:mute-changed',
  ROUTING_CHANGED: 'audio:routing-changed'
});

const DEFAULT_GAIN_DB = 0;

// -----------------------------------------------------------------------------
// Internal state
// -----------------------------------------------------------------------------

/** @type {Map<string, object>} providerType -> provider adapter */
const providers = new Map();

/** @type {Map<string, object>} micId -> mic/channel record */
const microphones = new Map();

const lastDetection = new Map();

let primaryMicId = null;
let backupMicId = null;
let micSeq = 0;

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
      console.error(`[AudioManager] listener error on "${eventName}":`, err);
    }
  }
}

function now() {
  return Date.now();
}

function assertMic(id) {
  const record = microphones.get(id);
  if (!record) throw new Error(`[AudioManager] Unknown microphone: "${id}"`);
  return record;
}

function transition(record, nextState) {
  const allowed = TRANSITIONS[record.state] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(`[AudioManager] Illegal transition for "${record.id}": ${record.state} -> ${nextState}`);
  }
  record.state = nextState;
  record.history.push({ state: nextState, at: now() });
  if (record.history.length > 50) record.history.shift();
}

// -----------------------------------------------------------------------------
// Public API — Provider registration (Rule 17)
// -----------------------------------------------------------------------------

function registerProvider(adapter) {
  if (!adapter || typeof adapter !== 'object') {
    throw new Error('[AudioManager] registerProvider requires an adapter object.');
  }
  if (!adapter.type || typeof adapter.type !== 'string') {
    throw new Error('[AudioManager] provider adapter requires a string "type".');
  }
  const requiredFns = ['listDevices', 'connect', 'disconnect', 'getHealth'];
  for (const fn of requiredFns) {
    if (typeof adapter[fn] !== 'function') {
      throw new Error(`[AudioManager] provider "${adapter.type}" is missing required method "${fn}".`);
    }
  }
  providers.set(adapter.type, adapter);

  if (typeof adapter.on === 'function') {
    adapter.on('device:added', (device) => {
      emit(EVENTS.HOTPLUG_ADDED, { providerType: adapter.type, device });
    });
    adapter.on('device:removed', (device) => {
      const existing = [...microphones.values()].find(
        (m) => m.providerType === adapter.type && m.externalId === device.externalId
      );
      if (existing && existing.state === MIC_STATES.CONNECTED) {
        transition(existing, MIC_STATES.DISCONNECTED);
        emit(EVENTS.DISCONNECTED, { id: existing.id, reason: 'hot-unplug' });
        handlePrimaryLoss(existing.id, 'hot-unplug');
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
// Public API — Detection
// -----------------------------------------------------------------------------

async function detectMicrophones(providerType) {
  const types = providerType ? [providerType] : [...providers.keys()];
  const results = [];

  for (const type of types) {
    const provider = providers.get(type);
    if (!provider) {
      throw new Error(`[AudioManager] No provider registered for type "${type}".`);
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

function registerMicrophone({ providerType, externalId, name, metadata }) {
  if (!providers.has(providerType)) {
    throw new Error(`[AudioManager] Cannot register microphone: no provider for type "${providerType}".`);
  }
  if (!externalId) {
    throw new Error('[AudioManager] registerMicrophone requires externalId.');
  }
  const alreadyRegistered = [...microphones.values()].find(
    (m) => m.providerType === providerType && m.externalId === externalId && m.state !== MIC_STATES.REMOVED
  );
  if (alreadyRegistered) {
    throw new Error(`[AudioManager] Microphone "${externalId}" (${providerType}) is already registered as "${alreadyRegistered.id}".`);
  }

  micSeq += 1;
  const id = `mic-${micSeq}`;
  const record = {
    id,
    providerType,
    externalId,
    name: name || externalId,
    metadata: metadata || {},
    state: MIC_STATES.REGISTERED,
    streamHandle: null,
    lastHealth: null,
    // mixer state — owned here regardless of provider DSP support (Rule 6)
    gainDb: DEFAULT_GAIN_DB,
    muted: false,
    echoCancellation: false,
    noiseReduction: false,
    routing: [],
    registeredAt: now(),
    connectedAt: null,
    history: [{ state: MIC_STATES.REGISTERED, at: now() }]
  };
  microphones.set(id, record);
  emit(EVENTS.REGISTERED, { id, providerType, externalId });
  return getMicrophone(id);
}

async function removeMicrophone(id) {
  const record = assertMic(id);
  if (record.state === MIC_STATES.CONNECTED) {
    // Awaited: disconnectMicrophone() is async — an unawaited call here would
    // race the REMOVED transition ahead of DISCONNECTED, exactly the bug
    // caught and fixed in Camera Manager's removeCamera(). Awaited from the
    // start here because that lesson was read first (Rule 21).
    await disconnectMicrophone(id);
  }
  transition(record, MIC_STATES.REMOVED);
  clearRoleIfHeld(id);
  microphones.delete(id);
  emit(EVENTS.REMOVED, { id });
  return true;
}

function clearRoleIfHeld(id) {
  if (primaryMicId === id) {
    primaryMicId = null;
    emit(EVENTS.PRIMARY_CHANGED, { id: null, previous: id });
  }
  if (backupMicId === id) {
    backupMicId = null;
  }
}

// -----------------------------------------------------------------------------
// Public API — Connect / disconnect
// -----------------------------------------------------------------------------

async function connectMicrophone(id) {
  const record = assertMic(id);
  const provider = providers.get(record.providerType);
  transition(record, MIC_STATES.CONNECTING);
  emit(EVENTS.CONNECTING, { id });

  try {
    const { streamHandle } = await provider.connect(record.externalId);
    record.streamHandle = streamHandle;
    transition(record, MIC_STATES.CONNECTED);
    record.connectedAt = now();
    emit(EVENTS.CONNECTED, { id, streamHandle });
    return getMicrophone(id);
  } catch (err) {
    transition(record, MIC_STATES.ERROR);
    emit(EVENTS.ERROR, { id, error: err?.message || String(err) });
    throw err;
  }
}

async function disconnectMicrophone(id) {
  const record = assertMic(id);
  const provider = providers.get(record.providerType);
  await provider.disconnect(record.externalId);
  record.streamHandle = null;
  transition(record, MIC_STATES.DISCONNECTED);
  emit(EVENTS.DISCONNECTED, { id });
  handlePrimaryLoss(id, 'manual-disconnect');
  return getMicrophone(id);
}

// -----------------------------------------------------------------------------
// Public API — Microphone selection & backup failover
// (spec line items: "Microphone selection", "Backup microphone switching")
// -----------------------------------------------------------------------------

function selectPrimaryMicrophone(id) {
  const record = assertMic(id);
  if (record.state !== MIC_STATES.CONNECTED) {
    throw new Error(`[AudioManager] Cannot select "${id}" as primary: microphone is ${record.state}, not CONNECTED.`);
  }
  const previous = primaryMicId;
  primaryMicId = id;
  emit(EVENTS.PRIMARY_CHANGED, { id, previous });
  return getMicrophone(id);
}

function getPrimaryMicrophone() {
  return primaryMicId ? getMicrophone(primaryMicId) : null;
}

function setBackupMicrophone(id) {
  // Registering a backup does not require it to be connected yet — a backup
  // mic may be wired but only powered on when needed. Failover itself does
  // require CONNECTED at the moment of failover (checked in attemptFailover).
  assertMic(id);
  backupMicId = id;
  return getMicrophone(id);
}

function getBackupMicrophone() {
  return backupMicId ? getMicrophone(backupMicId) : null;
}

/**
 * Called whenever the primary microphone is lost (disconnect, hot-unplug,
 * or a failed health check) to honor the "Backup microphone switching"
 * responsibility. Only fails over if a backup is configured AND currently
 * CONNECTED — never promotes a backup that isn't actually ready, which
 * would just trade one silent failure for another (Rule 6).
 */
function handlePrimaryLoss(lostId, reason) {
  if (primaryMicId !== lostId) return; // the lost mic wasn't primary — nothing to do
  const previous = primaryMicId;
  primaryMicId = null;
  emit(EVENTS.PRIMARY_CHANGED, { id: null, previous });

  if (!backupMicId) return;
  const backup = microphones.get(backupMicId);
  if (!backup || backup.state !== MIC_STATES.CONNECTED) return;

  primaryMicId = backupMicId;
  emit(EVENTS.BACKUP_FAILOVER, { from: previous, to: primaryMicId, reason });
  emit(EVENTS.PRIMARY_CHANGED, { id: primaryMicId, previous: null });
}

// -----------------------------------------------------------------------------
// Public API — Mixer: gain, mute, echo cancellation, noise reduction
// (Rule 6: hardware DSP calls only made if the provider implements them;
// software mute is always tracked here regardless of hardware support)
// -----------------------------------------------------------------------------

async function setGain(id, gainDb) {
  const record = assertMic(id);
  if (typeof gainDb !== 'number' || Number.isNaN(gainDb)) {
    throw new Error('[AudioManager] setGain requires a numeric gainDb.');
  }
  const provider = providers.get(record.providerType);
  if (typeof provider.setGain === 'function') {
    await provider.setGain(record.externalId, gainDb);
  }
  record.gainDb = gainDb;
  emit(EVENTS.GAIN_CHANGED, { id, gainDb });
  return getMicrophone(id);
}

function getGain(id) {
  return assertMic(id).gainDb;
}

async function setMute(id, muted) {
  const record = assertMic(id);
  const provider = providers.get(record.providerType);
  // Best-effort hardware mute if the provider supports it; software mute
  // flag is authoritative for mixing regardless (see file header).
  if (typeof provider.setMute === 'function') {
    await provider.setMute(record.externalId, Boolean(muted));
  }
  record.muted = Boolean(muted);
  emit(EVENTS.MUTE_CHANGED, { id, muted: record.muted });
  return getMicrophone(id);
}

function isMuted(id) {
  return assertMic(id).muted;
}

async function setEchoCancellation(id, enabled) {
  const record = assertMic(id);
  const provider = providers.get(record.providerType);
  if (typeof provider.setEchoCancellation !== 'function') {
    throw new Error(`[AudioManager] Provider "${record.providerType}" does not support echo cancellation.`);
  }
  await provider.setEchoCancellation(record.externalId, Boolean(enabled));
  record.echoCancellation = Boolean(enabled);
  return getMicrophone(id);
}

async function setNoiseReduction(id, enabled) {
  const record = assertMic(id);
  const provider = providers.get(record.providerType);
  if (typeof provider.setNoiseReduction !== 'function') {
    throw new Error(`[AudioManager] Provider "${record.providerType}" does not support noise reduction.`);
  }
  await provider.setNoiseReduction(record.externalId, Boolean(enabled));
  record.noiseReduction = Boolean(enabled);
  return getMicrophone(id);
}

// -----------------------------------------------------------------------------
// Public API — Monitoring (real provider levels only — never fabricated)
// -----------------------------------------------------------------------------

async function getLevel(id) {
  const record = assertMic(id);
  if (record.state !== MIC_STATES.CONNECTED) {
    throw new Error(`[AudioManager] Cannot read level for "${id}": microphone is ${record.state}, not CONNECTED.`);
  }
  const provider = providers.get(record.providerType);
  if (typeof provider.getLevel !== 'function') {
    throw new Error(`[AudioManager] Provider "${record.providerType}" does not support level monitoring.`);
  }
  return provider.getLevel(record.externalId);
}

// -----------------------------------------------------------------------------
// Public API — Routing ("Audio routing" spec line item)
// -----------------------------------------------------------------------------

const KNOWN_BUSES = Object.freeze(['program', 'record', 'monitor']);

function setRouting(id, buses) {
  const record = assertMic(id);
  if (!Array.isArray(buses) || buses.some((b) => !KNOWN_BUSES.includes(b))) {
    throw new Error(`[AudioManager] setRouting requires an array drawn from [${KNOWN_BUSES.join(', ')}].`);
  }
  record.routing = [...new Set(buses)];
  emit(EVENTS.ROUTING_CHANGED, { id, routing: record.routing });
  return getMicrophone(id);
}

function getRouting(id) {
  return [...assertMic(id).routing];
}

// -----------------------------------------------------------------------------
// Public API — Health
// -----------------------------------------------------------------------------

async function checkMicHealth(id) {
  const record = assertMic(id);
  const provider = providers.get(record.providerType);
  try {
    const health = await provider.getHealth(record.externalId);
    record.lastHealth = { ...health, checkedAt: now() };
    if (health && health.ok === false && record.state === MIC_STATES.CONNECTED) {
      transition(record, MIC_STATES.ERROR);
      emit(EVENTS.ERROR, { id, error: health.detail || 'Provider reported unhealthy.' });
      handlePrimaryLoss(id, 'health-check-failed');
    }
    return record.lastHealth;
  } catch (err) {
    record.lastHealth = { ok: false, detail: err?.message || String(err), checkedAt: now() };
    return record.lastHealth;
  }
}

async function checkAllHealth() {
  const results = [];
  for (const id of microphones.keys()) {
    results.push({ id, health: await checkMicHealth(id) });
  }
  return results;
}

// -----------------------------------------------------------------------------
// Public API — Queries
// -----------------------------------------------------------------------------

function getMicrophone(id) {
  const record = assertMic(id);
  return Object.freeze({
    id: record.id,
    providerType: record.providerType,
    externalId: record.externalId,
    name: record.name,
    metadata: { ...record.metadata },
    state: record.state,
    isPrimary: primaryMicId === record.id,
    isBackup: backupMicId === record.id,
    gainDb: record.gainDb,
    muted: record.muted,
    echoCancellation: record.echoCancellation,
    noiseReduction: record.noiseReduction,
    routing: [...record.routing],
    lastHealth: record.lastHealth,
    registeredAt: record.registeredAt,
    connectedAt: record.connectedAt
  });
}

function listMicrophones() {
  return [...microphones.keys()].map(getMicrophone);
}

function getLastDetection(providerType) {
  return lastDetection.get(providerType) || null;
}

/**
 * Read-only mixer snapshot for downstream engines (Scene Manager / Video
 * Processor) — a projection of state already tracked here, nothing new
 * computed or fabricated.
 */
function getMixState() {
  return Object.freeze({
    primaryMicId,
    backupMicId,
    channels: listMicrophones()
  });
}

// -----------------------------------------------------------------------------
// Kernel integration (same real, verified contract Camera Manager uses)
// -----------------------------------------------------------------------------

function getServiceManifest() {
  return Object.freeze({
    name: 'audio-manager',
    version: '1.0.0',
    apiVersion: '1.0.0',
    priority: 10,
    mandatory: false,
    dependencies: []
  });
}

async function registerWithKernel(kernel) {
  if (!kernel || typeof kernel.registerEngine !== 'function') {
    throw new Error('[AudioManager] registerWithKernel requires a real Kernel instance.');
  }
  return kernel.registerEngine(getServiceManifest());
}

// -----------------------------------------------------------------------------
// Test-only reset
// -----------------------------------------------------------------------------

function __resetForTests() {
  providers.clear();
  microphones.clear();
  lastDetection.clear();
  primaryMicId = null;
  backupMicId = null;
  micSeq = 0;
  listeners.clear();
}

// -----------------------------------------------------------------------------
// Frozen public surface
// -----------------------------------------------------------------------------

const AudioManager = Object.freeze({
  MIC_STATES,
  EVENTS,

  // events
  on,

  // providers
  registerProvider,
  getProvider,
  listProviders,

  // detection
  detectMicrophones,
  getLastDetection,

  // registration
  registerMicrophone,
  removeMicrophone,

  // connection
  connectMicrophone,
  disconnectMicrophone,

  // selection & backup failover
  selectPrimaryMicrophone,
  getPrimaryMicrophone,
  setBackupMicrophone,
  getBackupMicrophone,

  // mixer
  setGain,
  getGain,
  setMute,
  isMuted,
  setEchoCancellation,
  setNoiseReduction,

  // monitoring
  getLevel,

  // routing
  setRouting,
  getRouting,
  KNOWN_BUSES,

  // health
  checkMicHealth,
  checkAllHealth,

  // queries
  getMicrophone,
  listMicrophones,
  getMixState,

  // kernel integration
  getServiceManifest,
  registerWithKernel,

  // test-only
  __resetForTests
});

export default AudioManager;
