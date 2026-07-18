/**
 * core/kernel/kernel.js
 *
 * CozyOS Kernel — Public Entry Point & Orchestration Layer
 * =========================================================
 *
 * The Kernel is the single public API surface for the CozyOS Kernel layer.
 * It coordinates Bootstrap, Compatibility, Lifecycle, and Diagnostics.
 *
 * It does NOT:
 *   - perform compatibility checks
 *   - register services
 *   - manage runtime state
 *   - generate diagnostics
 *   - render UI
 *   - contain business logic
 *   - duplicate Bootstrap / Lifecycle / Diagnostics / Compatibility logic
 *
 * Every method below is a thin delegation to an existing, certified engine.
 * If a method body is more than "call the dependency and shape the return
 * value / emit an event", that is a bug per Rule 1 (Single Responsibility)
 * and Rule 2 (No Duplication).
 *
 * Compliance: CozyOS Engineering Rules v1.0, Rules 1-19.
 */

'use strict';

const { EventEmitter } = require('events');

// ---------------------------------------------------------------------------
// Kernel Metadata (Rule 9 — Service Manifest Contract / Rule 16 — Frozen Kernel)
// ---------------------------------------------------------------------------
const KERNEL_METADATA = Object.freeze({
  kernelName: 'CozyOS Kernel',
  kernelVersion: '1.0.0',
  apiVersion: '1.0.0',
  architectureVersion: '1.0.0',
  certification: 'ENTERPRISE_CERTIFIED',
  buildDate: '2026-07-18',
});

const PLATFORM_STATES = Object.freeze({
  BOOTING: 'BOOTING',
  READY: 'READY',
  DEGRADED: 'DEGRADED',
  ERROR: 'ERROR',
  SHUTDOWN: 'SHUTDOWN',
});

const KERNEL_EVENTS = Object.freeze({
  READY: 'kernel:ready',
  SHUTDOWN: 'kernel:shutdown',
  RESTART: 'kernel:restart',
  ERROR: 'kernel:error',
  DEGRADED: 'kernel:degraded',
});

/**
 * @typedef {Object} KernelDependencies
 * @property {Object} bootstrap     - Certified Bootstrap engine (Rule 11)
 * @property {Object} compatibility - Certified Compatibility engine (Rule 14)
 * @property {Object} lifecycle     - Certified Lifecycle engine (Rule 12)
 * @property {Object} diagnostics   - Certified Diagnostics engine (Rule 13)
 * @property {EventEmitter} [eventBus] - Shared platform event bus, if one
 *   exists (Rule 8 — Event Driven Architecture). Falls back to a local
 *   EventEmitter so the Kernel never has to implement its own pub/sub logic.
 */

class Kernel {
  /**
   * @param {KernelDependencies} dependencies
   *
   * The Kernel never constructs its own engines — they are injected.
   * This satisfies Rule 17 (Dependency-First Development): Bootstrap,
   * Compatibility, Lifecycle, and Diagnostics must already exist and be
   * certified before the Kernel can be instantiated.
   */
  constructor({ bootstrap, compatibility, lifecycle, diagnostics, eventBus } = {}) {
    const missing = ['bootstrap', 'compatibility', 'lifecycle', 'diagnostics'].filter(
      (dep) => !arguments[0] || !arguments[0][dep]
    );
    if (missing.length) {
      throw new Error(
        `[Kernel] Cannot initialize: missing required dependencies: ${missing.join(', ')}. ` +
          'Rule 17 (Dependency-First) requires Bootstrap, Compatibility, Lifecycle, and ' +
          'Diagnostics to be built and injected before the Kernel exists.'
      );
    }

    /** @private */
    this._bootstrap = bootstrap;
    /** @private */
    this._compatibility = compatibility;
    /** @private */
    this._lifecycle = lifecycle;
    /** @private */
    this._diagnostics = diagnostics;
    /** @private — reuse shared event bus if provided, never invent a new one */
    this._events = eventBus || new EventEmitter();
  }

  // ---------------------------------------------------------------------
  // Startup / Shutdown / Restart — delegate entirely to Bootstrap/Lifecycle
  // ---------------------------------------------------------------------

  /**
   * Starts the Kernel.
   * Flow: Kernel -> Bootstrap.initialize() -> Platform Ready
   */
  async initialize() {
    try {
      const result = await this._bootstrap.initialize();
      const state = this._bootstrap.getPlatformState();

      if (state === PLATFORM_STATES.READY) {
        this._events.emit(KERNEL_EVENTS.READY, result);
      } else if (state === PLATFORM_STATES.DEGRADED) {
        this._events.emit(KERNEL_EVENTS.DEGRADED, result);
      } else if (state === PLATFORM_STATES.ERROR) {
        this._events.emit(KERNEL_EVENTS.ERROR, result);
      }

      return result;
    } catch (err) {
      this._events.emit(KERNEL_EVENTS.ERROR, err);
      throw err;
    }
  }

  /**
   * Gracefully shuts down the platform.
   * Uses Bootstrap + Lifecycle. Never stops services directly.
   */
  async shutdown() {
    try {
      const result = await this._bootstrap.shutdown();
      this._events.emit(KERNEL_EVENTS.SHUTDOWN, result);
      return result;
    } catch (err) {
      this._events.emit(KERNEL_EVENTS.ERROR, err);
      throw err;
    }
  }

  /**
   * Gracefully restarts the platform via Lifecycle.
   */
  async restart() {
    try {
      const result = await this._lifecycle.restartService('platform');
      this._events.emit(KERNEL_EVENTS.RESTART, result);
      return result;
    } catch (err) {
      this._events.emit(KERNEL_EVENTS.ERROR, err);
      throw err;
    }
  }

  // ---------------------------------------------------------------------
  // Version / Metadata / Capabilities
  // ---------------------------------------------------------------------

  /**
   * @returns {{kernelVersion: string, platformVersion: string, apiVersion: string}}
   */
  getVersion() {
    return {
      kernelVersion: KERNEL_METADATA.kernelVersion,
      platformVersion: this._bootstrap.getPlatformVersion
        ? this._bootstrap.getPlatformVersion()
        : KERNEL_METADATA.kernelVersion,
      apiVersion: KERNEL_METADATA.apiVersion,
    };
  }

  /**
   * Read-only Kernel metadata (Rule 9, Rule 16).
   */
  getMetadata() {
    return { ...KERNEL_METADATA };
  }

  /**
   * Delegates to Bootstrap. One of: BOOTING, READY, DEGRADED, ERROR, SHUTDOWN.
   */
  getPlatformState() {
    return this._bootstrap.getPlatformState();
  }

  /**
   * Delegates to Diagnostics. Returns platform health.
   */
  getHealth() {
    return this._diagnostics.getHealth();
  }

  /**
   * Delegates to Diagnostics. Returns the Enterprise Boot Report.
   */
  getDiagnostics() {
    return this._diagnostics.getBootReport();
  }

  /**
   * Aggregates capability metadata from each Kernel service. Does not
   * compute capabilities itself — each engine reports its own.
   */
  getCapabilities() {
    return {
      compatibility: this._compatibility.getCapabilities
        ? this._compatibility.getCapabilities()
        : true,
      bootstrap: this._bootstrap.getCapabilities ? this._bootstrap.getCapabilities() : true,
      lifecycle: this._lifecycle.getCapabilities ? this._lifecycle.getCapabilities() : true,
      diagnostics: this._diagnostics.getCapabilities
        ? this._diagnostics.getCapabilities()
        : true,
      kernelVersion: KERNEL_METADATA.kernelVersion,
      apiVersion: KERNEL_METADATA.apiVersion,
      future: ['vault', 'identity', 'payment', 'documents', 'formula', 'language', 'ai'],
    };
  }

  /**
   * True only when Bootstrap reports platform state READY.
   */
  isReady() {
    return this._bootstrap.getPlatformState() === PLATFORM_STATES.READY;
  }

  // ---------------------------------------------------------------------
  // Engine Registration / Runtime — pure delegation, Kernel never registers
  // itself and never mutates runtime state directly.
  // ---------------------------------------------------------------------

  /**
   * Registers a new engine/service. Kernel -> Bootstrap.registerService().
   * @param {Object} manifest - Service Manifest (Rule 9).
   */
  registerEngine(manifest) {
    return this._bootstrap.registerService(manifest);
  }

  /**
   * Restarts a registered engine via Lifecycle.
   * @param {string} engineName
   */
  restartEngine(engineName) {
    return this._lifecycle.restartService(engineName);
  }

  /**
   * Stops a registered engine via Lifecycle.
   * @param {string} engineName
   */
  stopEngine(engineName) {
    return this._lifecycle.stopService(engineName);
  }

  /**
   * Returns registered engine metadata via Bootstrap.
   * @param {string} engineName
   */
  getEngine(engineName) {
    return this._bootstrap.getService(engineName);
  }

  // ---------------------------------------------------------------------
  // Reporting
  // ---------------------------------------------------------------------

  /**
   * Aggregated Kernel report: kernel info, platform info, diagnostics
   * summary, service count, health, version. Pure aggregation of
   * delegated calls — no independent computation.
   */
  getKernelReport() {
    return {
      kernel: this.getMetadata(),
      platform: this.getPlatformInfo(),
      state: this.getPlatformState(),
      health: this.getHealth(),
      diagnostics: this.getDiagnostics(),
      serviceCount: this._bootstrap.getServiceCount
        ? this._bootstrap.getServiceCount()
        : undefined,
      version: this.getVersion(),
    };
  }

  /**
   * Platform Name, Platform Version, Kernel Version, Architecture Version,
   * Certification, Supported Engines.
   */
  getPlatformInfo() {
    return {
      platformName: KERNEL_METADATA.kernelName,
      platformVersion: this._bootstrap.getPlatformVersion
        ? this._bootstrap.getPlatformVersion()
        : KERNEL_METADATA.kernelVersion,
      kernelVersion: KERNEL_METADATA.kernelVersion,
      architectureVersion: KERNEL_METADATA.architectureVersion,
      certification: KERNEL_METADATA.certification,
      supportedEngines: this._bootstrap.getRegisteredServices
        ? this._bootstrap.getRegisteredServices()
        : [],
    };
  }

  // ---------------------------------------------------------------------
  // Compatibility Integration — Kernel never validates itself
  // ---------------------------------------------------------------------

  /**
   * Delegates to Compatibility.check().
   */
  checkCompatibility(...args) {
    return this._compatibility.check(...args);
  }

  /**
   * Delegates to Compatibility.validateManifest().
   */
  validateManifest(manifest) {
    return this._compatibility.validateManifest(manifest);
  }

  // ---------------------------------------------------------------------
  // Event subscription (Rule 8 — Event Driven Architecture)
  // ---------------------------------------------------------------------

  /**
   * Subscribe to Kernel events: kernel:ready, kernel:shutdown,
   * kernel:restart, kernel:error, kernel:degraded.
   */
  on(eventName, handler) {
    this._events.on(eventName, handler);
    return this;
  }

  off(eventName, handler) {
    this._events.off(eventName, handler);
    return this;
  }
}

module.exports = { Kernel, KERNEL_METADATA, PLATFORM_STATES, KERNEL_EVENTS };
