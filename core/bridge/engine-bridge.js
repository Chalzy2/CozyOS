/**
 * =============================================================================
 * CozyOS Engine Integration Bridge — Engine Bridge (Facade)
 * File: core/bridge/engine-bridge.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * The single public surface for Milestone 141: lets window.CozyOS-side code
 * reach certified ES-module engines (Camera, Audio, Playback, Scene,
 * Media) without migrating them and without dashboard.html knowing any
 * loading details. Owns: module loading (delegated to Module Loader),
 * adapter creation (delegated to Engine Adapter), registration/resolution/
 * lazy init/unload bookkeeping, and error handling. Nothing else — it does
 * not own Camera, Vision, Media, Audio, Playback, Scene, Storage, Identity,
 * Security, or AI, per this milestone's explicit boundary.
 *
 * FAIL CLOSED (Rule 6)
 * ----------------------
 * load()/resolve() never throw past this file's boundary and never return
 * a fabricated engine. A failed import, a failed compatibility check, or a
 * naming conflict all result in status "unavailable" and a real reason
 * string — the caller decides what to do (e.g. dashboard shows "Media
 * unavailable" rather than crashing).
 * =============================================================================
 */

'use strict';

import ModuleLoader from './module-loader.js';
import EngineAdapter from './engine-adapter.js';
import ServiceAdapter from './service-adapter.js';

const STATUS = Object.freeze({
  REGISTERED: 'registered',
  LOADING: 'loading',
  LOADED: 'loaded',
  UNAVAILABLE: 'unavailable',
  UNLOADED: 'unloaded'
});

const registrations = new Map(); // name -> { modulePath, globalName, expectedManifestName, coordinatorMeta, status, adapter, error }
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

/**
 * @param {string} name - bridge-internal registration key, e.g. "media"
 * @param {object} config
 * @param {string} config.modulePath - path to the ES module, resolved relative to core/bridge/
 * @param {string} config.globalName - property name under window.CozyOS.*, e.g. "MediaEngine"
 * @param {string} [config.expectedManifestName] - checked against the engine's own getServiceManifest().name
 * @param {object} [config.coordinatorMeta] - passed to ServiceRegistry.registerCoordinator() if available
 */
function register(name, config = {}) {
  if (registrations.has(name)) {
    throw new Error(`[EngineBridge] "${name}" is already registered — no duplicate registration (Conflict Review).`);
  }
  const { modulePath, globalName, expectedManifestName = null, coordinatorMeta = null } = config;
  if (!modulePath || !globalName) {
    throw new TypeError('[EngineBridge] register() requires modulePath and globalName.');
  }
  registrations.set(name, {
    modulePath, globalName, expectedManifestName, coordinatorMeta,
    status: STATUS.REGISTERED, adapter: null, error: null
  });
  emit('registered', { name });
  return true;
}

/**
 * Loads (or returns already-loaded) engine. Fails closed — always resolves
 * to a { success, reason? } shape, never throws, never fabricates success.
 * @param {string} name
 * @param {{ target?: object, kernel?: object }} [opts] - target is the real `window` (or a test double); kernel is the real Kernel singleton
 */
async function load(name, opts = {}) {
  const reg = registrations.get(name);
  if (!reg) return Object.freeze({ success: false, reason: `"${name}" is not registered.` });
  if (reg.status === STATUS.LOADED) return Object.freeze({ success: true, alreadyLoaded: true });

  reg.status = STATUS.LOADING;
  try {
    const mod = await ModuleLoader.loadModule(reg.modulePath);
    const adapter = EngineAdapter.wrap(mod, { name: reg.expectedManifestName });

    if (opts.kernel) {
      const compat = await EngineAdapter.checkCompatibility(adapter.manifest, opts.kernel);
      if (!compat.compatible) {
        throw new Error(`failed Kernel compatibility check: ${compat.reason}`);
      }
      await EngineAdapter.registerWithKernel(adapter.engine, opts.kernel);
    }

    if (opts.target) {
      ServiceAdapter.expose(opts.target, reg.globalName, adapter);
      if (reg.coordinatorMeta) ServiceAdapter.registerCoordinatorMeta(opts.target, reg.coordinatorMeta);
    }

    reg.adapter = adapter;
    reg.status = STATUS.LOADED;
    reg.error = null;
    emit('loaded', { name });
    return Object.freeze({ success: true });
  } catch (err) {
    reg.status = STATUS.UNAVAILABLE;
    reg.error = err.message;
    reg.adapter = null;
    emit('error', { name, message: err.message });
    return Object.freeze({ success: false, reason: err.message });
  }
}

/** Lazy resolution: loads on first access if not already loaded. Returns null (never a fabricated stub) on failure. */
async function resolve(name, opts) {
  const reg = registrations.get(name);
  if (!reg) return null;
  if (reg.status !== STATUS.LOADED) {
    const result = await load(name, opts);
    if (!result.success) return null;
  }
  return registrations.get(name).adapter.engine;
}

function unload(name, target) {
  const reg = registrations.get(name);
  if (!reg) return false;
  if (target) ServiceAdapter.withdraw(target, reg.globalName);
  ModuleLoader.unload(reg.modulePath);
  reg.status = STATUS.UNLOADED;
  reg.adapter = null;
  emit('unloaded', { name });
  return true;
}

function isLoaded(name) {
  const reg = registrations.get(name);
  return Boolean(reg && reg.status === STATUS.LOADED);
}

function getStatus(name) {
  const reg = registrations.get(name);
  return reg
    ? Object.freeze({ status: reg.status, error: reg.error })
    : Object.freeze({ status: 'unregistered', error: null });
}

function getCapabilities(name) {
  const reg = registrations.get(name);
  return reg && reg.adapter ? reg.adapter.capabilities : null;
}

function listRegistered() {
  return Object.freeze(Array.from(registrations.keys()));
}

function __resetForTests() {
  registrations.clear();
  ModuleLoader.__resetForTests();
}

const EngineBridge = Object.freeze({
  STATUS, on,
  register, load, resolve, unload, isLoaded, getStatus, getCapabilities, listRegistered,
  __resetForTests
});

export default EngineBridge;
