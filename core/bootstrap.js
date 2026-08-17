/**
 * =============================================================================
 * CozyOS Kernel — Bootstrap Engine
 * File: core/kernel/bootstrap.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Bootstrap owns platform startup (Rule 11) and service registration
 * (Rule 1). It is the single entry point through which every engine and
 * application joins the platform.
 *
 *   Browser
 *     │
 *     ▼
 *   Bootstrap
 *     │
 *     ├── registerService()      — accepts & validates a Service Manifest
 *     ├── validateManifest()     — shape/contract validation (Rule 9)
 *     ├── compatibility check    — delegated out, never implemented here (Rule 14)
 *     └── platform state         — BOOTING / READY / DEGRADED / SHUTDOWN (Rule 11)
 *     │
 *     ▼
 *   Lifecycle (core/kernel/lifecycle.js) — runtime state only (Rule 12)
 *
 * DESIGN RULES
 * -------------
 * - Bootstrap owns registration. Lifecycle never registers services (Rule 1).
 * - Bootstrap validates manifest SHAPE. It does not decide compatibility —
 *   that decision is delegated to Compatibility (core/kernel/compatibility.js)
 *   so this file never duplicates its job (Rule 2, Rule 14).
 * - Bootstrap is the only caller authorized to mutate Lifecycle state; it
 *   holds the sole Bootstrap token and never leaks it to applications
 *   (Rule 11).
 * - No UI. No business logic. No application code lives here.
 *
 * DEPENDENCY (Rule 17)
 * ----------------------
 * compatibility.js was built, self-certified, and wired in before this
 * file's registerService() was allowed to go live — Bootstrap depends on
 * it directly and no longer carries a fallback stub.
 *
 * ⚠ RECONCILIATION FLAG:
 * Diagnostics (core/kernel/diagnostics.js) is referenced by the Kernel
 * Standard but not yet seen by this module. getPlatformReport() below is
 * Bootstrap's own contribution to that framework (Rule 13), not a
 * replacement for it.
 * =============================================================================
 */

'use strict';

import Lifecycle from './lifecycle.js';
import Compatibility from './compatibility.js';

// -----------------------------------------------------------------------------
// Platform state (Bootstrap-owned, per Rule 11 — distinct from any single
// service's Lifecycle state)
// -----------------------------------------------------------------------------

const PLATFORM_STATES = Object.freeze({
  BOOTING: 'BOOTING',
  READY: 'READY',
  DEGRADED: 'DEGRADED',
  SHUTDOWN: 'SHUTDOWN'
});

const PLATFORM_EVENTS = Object.freeze({
  BOOTING: 'platform:booting',
  READY: 'platform:ready',
  DEGRADED: 'platform:degraded',
  SHUTDOWN: 'platform:shutdown',
  SERVICE_REGISTERED: 'platform:service-registered',
  SERVICE_REJECTED: 'platform:service-rejected'
});

const KERNEL_VERSION = '1.0.0';

let platformState = PLATFORM_STATES.BOOTING;

// -----------------------------------------------------------------------------
// Internal state
// -----------------------------------------------------------------------------

/** @type {Map<string, object>} name -> validated manifest (Bootstrap's own record) */
const manifestRegistry = new Map();

/** @type {Set<Function>} */
const platformListeners = new Map();

// Bootstrap generates and privately holds the one token that authorizes
// mutation of Lifecycle. It is never exported.
const bootstrapToken = (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `bootstrap-${Date.now()}-${Math.random().toString(36).slice(2)}`;

Lifecycle.setBootstrapToken(bootstrapToken);

// Compatibility decisions are delegated to core/kernel/compatibility.js
// (Rule 14, Rule 17). setCompatibilityChecker() remains available as an
// explicit override point — e.g. for test harnesses — but production
// wiring uses the real, certified engine by default.
let compatibilityChecker = Compatibility.check;

/**
 * Overrides the compatibility decision function. Intended for test
 * harnesses. Production code should not need to call this — the real
 * Compatibility engine is wired in by default.
 * @param {(manifest: object, context: { kernelVersion: string }) => { compatible: boolean, reason?: string } | Promise<{ compatible: boolean, reason?: string }>} checkerFn
 */
function setCompatibilityChecker(checkerFn) {
  if (typeof checkerFn !== 'function') {
    throw new Error('[Bootstrap] setCompatibilityChecker requires a function.');
  }
  compatibilityChecker = checkerFn;
}

// -----------------------------------------------------------------------------
// Platform event bus (separate from Lifecycle's — platform-level, not
// per-service)
// -----------------------------------------------------------------------------

function on(eventName, handler) {
  if (typeof handler !== 'function') return () => {};
  if (!platformListeners.has(eventName)) platformListeners.set(eventName, new Set());
  platformListeners.get(eventName).add(handler);
  return () => platformListeners.get(eventName)?.delete(handler);
}

function emit(eventName, payload) {
  const handlers = platformListeners.get(eventName);
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(Object.freeze({ ...payload }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Bootstrap] listener error on "${eventName}":`, err);
    }
  }
}

// Bootstrap watches Lifecycle for platform-wide degradation (Rule 11 owns
// degraded state; Lifecycle only reports it up, per Rule 12).
Lifecycle.on(Lifecycle.EVENTS.PLATFORM_DEGRADED, (payload) => {
  setPlatformState(PLATFORM_STATES.DEGRADED, payload);
});

// -----------------------------------------------------------------------------
// Manifest validation (Rule 9 — shape/contract only, not compatibility)
// -----------------------------------------------------------------------------

function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object.'] };
  }
  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('manifest.name is required and must be a string.');
  }
  if (manifest.version !== undefined && typeof manifest.version !== 'string') {
    errors.push('manifest.version must be a string if provided.');
  }
  if (manifest.apiVersion !== undefined && typeof manifest.apiVersion !== 'string') {
    errors.push('manifest.apiVersion must be a string if provided.');
  }
  if (manifest.priority !== undefined && typeof manifest.priority !== 'number') {
    errors.push('manifest.priority must be a number if provided.');
  }
  if (manifest.mandatory !== undefined && typeof manifest.mandatory !== 'boolean') {
    errors.push('manifest.mandatory must be a boolean if provided.');
  }
  if (manifest.minKernelVersion !== undefined && typeof manifest.minKernelVersion !== 'string') {
    errors.push('manifest.minKernelVersion must be a string if provided.');
  }
  if (manifest.dependencies !== undefined && !Array.isArray(manifest.dependencies)) {
    errors.push('manifest.dependencies must be an array if provided.');
  }
  if (manifest.name && manifestRegistry.has(manifest.name)) {
    errors.push(`A service named "${manifest.name}" is already registered.`);
  }

  return { valid: errors.length === 0, errors };
}

// -----------------------------------------------------------------------------
// Public API — Registration (Rule 1: this is Bootstrap's domain, not Lifecycle's)
// -----------------------------------------------------------------------------

/**
 * Registers a service with the platform. This is the ONLY entry point for
 * a service to join CozyOS.
 *
 * Flow: validateManifest() -> compatibility.check() -> Lifecycle.acceptRegisteredService()
 *
 * @param {object} manifest - Full Service Manifest (Rule 9).
 * @param {string} manifest.name
 * @param {string} [manifest.version]
 * @param {string} [manifest.apiVersion]
 * @param {number} [manifest.priority]
 * @param {boolean} [manifest.mandatory]
 * @param {string} [manifest.minKernelVersion]
 * @param {string[]} [manifest.dependencies]
 * @param {object} [runtimeOptions] - Passed through to Lifecycle untouched
 *   (restartPolicy, maxRetries) — Bootstrap does not interpret these.
 */
async function registerService(manifest, runtimeOptions = {}) {
  const { valid, errors } = validateManifest(manifest);
  if (!valid) {
    emit(PLATFORM_EVENTS.SERVICE_REJECTED, { name: manifest?.name, reason: 'invalid-manifest', errors });
    throw new Error(`[Bootstrap] Manifest validation failed for "${manifest?.name}": ${errors.join(' ')}`);
  }

  let compatibilityResult;
  try {
    compatibilityResult = await compatibilityChecker(manifest, { kernelVersion: KERNEL_VERSION });
  } catch (err) {
    emit(PLATFORM_EVENTS.SERVICE_REJECTED, { name: manifest.name, reason: 'compatibility-checker-threw', error: err?.message });
    throw new Error(`[Bootstrap] Compatibility check threw for "${manifest.name}": ${err?.message || err}`);
  }

  if (!compatibilityResult?.compatible) {
    emit(PLATFORM_EVENTS.SERVICE_REJECTED, {
      name: manifest.name,
      reason: 'incompatible',
      detail: compatibilityResult?.reason || 'No reason provided by compatibility checker.'
    });
    throw new Error(
      `[Bootstrap] "${manifest.name}" rejected: incompatible (${compatibilityResult?.reason || 'no reason given'})`
    );
  }

  manifestRegistry.set(manifest.name, Object.freeze({ ...manifest }));
  const state = Lifecycle.acceptRegisteredService(bootstrapToken, manifest, runtimeOptions);

  emit(PLATFORM_EVENTS.SERVICE_REGISTERED, { name: manifest.name, state });
  return state;
}

// -----------------------------------------------------------------------------
// Public API — Startup pass-through
// -----------------------------------------------------------------------------
//
// These simply forward to Lifecycle using Bootstrap's own token, because
// Rule 11 requires Bootstrap to be the only caller that can start, stop,
// restart, pause, resume, fail, or recover a service. Lifecycle itself
// still owns HOW the state machine works (Rule 12) — Bootstrap is just the
// only party permitted to invoke it.

function initializeService(name) {
  return Lifecycle.initializeService(bootstrapToken, name);
}
function verifyService(name, verifyFn) {
  return Lifecycle.verifyService(bootstrapToken, name, verifyFn);
}
function startService(name) {
  return Lifecycle.startService(bootstrapToken, name);
}
function pauseService(name) {
  return Lifecycle.pauseService(bootstrapToken, name);
}
function resumeService(name) {
  return Lifecycle.resumeService(bootstrapToken, name);
}
function stopService(name) {
  return Lifecycle.stopService(bootstrapToken, name);
}
function restartService(name, verifyFn) {
  return Lifecycle.restartService(bootstrapToken, name, verifyFn);
}
function removeService(name) {
  manifestRegistry.delete(name);
  return Lifecycle.removeService(bootstrapToken, name);
}
function failService(name, error) {
  return Lifecycle.failService(bootstrapToken, name, error);
}
function recoverService(name, verifyFn) {
  return Lifecycle.recoverService(bootstrapToken, name, verifyFn);
}

// -----------------------------------------------------------------------------
// Public API — Platform state (Rule 11)
// -----------------------------------------------------------------------------

function setPlatformState(nextState, detail) {
  if (!Object.values(PLATFORM_STATES).includes(nextState)) {
    throw new Error(`[Bootstrap] Invalid platform state: "${nextState}"`);
  }
  platformState = nextState;
  const eventMap = {
    [PLATFORM_STATES.BOOTING]: PLATFORM_EVENTS.BOOTING,
    [PLATFORM_STATES.READY]: PLATFORM_EVENTS.READY,
    [PLATFORM_STATES.DEGRADED]: PLATFORM_EVENTS.DEGRADED,
    [PLATFORM_STATES.SHUTDOWN]: PLATFORM_EVENTS.SHUTDOWN
  };
  emit(eventMap[nextState], { state: nextState, detail: detail || null });
}

function getPlatformState() {
  return platformState;
}

/**
 * Marks the platform READY. Call this once all mandatory services
 * (manifest.mandatory === true) have reached RUNNING. Bootstrap does not
 * decide "mandatory" logic here beyond this check — it only reads the flag
 * each manifest already declared.
 */
function markPlatformReady() {
  const mandatoryNotRunning = [...manifestRegistry.values()]
    .filter((m) => m.mandatory)
    .map((m) => m.name)
    .filter((name) => Lifecycle.getServiceState(name) !== Lifecycle.STATES.RUNNING);

  if (mandatoryNotRunning.length > 0) {
    throw new Error(
      `[Bootstrap] Cannot mark platform READY — mandatory services not RUNNING: ${mandatoryNotRunning.join(', ')}`
    );
  }
  setPlatformState(PLATFORM_STATES.READY);
}

function shutdownPlatform() {
  setPlatformState(PLATFORM_STATES.SHUTDOWN);
}

// -----------------------------------------------------------------------------
// Public API — Diagnostics / queries (Rule 13)
// -----------------------------------------------------------------------------

function getManifest(name) {
  return manifestRegistry.get(name) || null;
}

function getPlatformReport() {
  return Object.freeze({
    platformState,
    kernelVersion: KERNEL_VERSION,
    registeredServiceCount: manifestRegistry.size,
    services: Lifecycle.getLifecycleReport()
  });
}

// -----------------------------------------------------------------------------
// Frozen public surface
// -----------------------------------------------------------------------------

const Bootstrap = Object.freeze({
  PLATFORM_STATES,
  PLATFORM_EVENTS,
  KERNEL_VERSION,

  // compatibility wiring
  setCompatibilityChecker,

  // events
  on,

  // registration (the only entry point onto the platform)
  registerService,
  validateManifest,

  // startup pass-through to Lifecycle (only Bootstrap may call these)
  initializeService,
  verifyService,
  startService,
  pauseService,
  resumeService,
  stopService,
  restartService,
  removeService,
  failService,
  recoverService,

  // platform state
  getPlatformState,
  markPlatformReady,
  shutdownPlatform,

  // diagnostics
  getManifest,
  getPlatformReport
});

export default Bootstrap;
