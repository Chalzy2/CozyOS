/**
 * =============================================================================
 * CozyOS Kernel — Kernel Facade
 * File: core/kernel/kernel.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Kernel is the single entry point applications and platform engines use to
 * reach the kernel layer (Rule 4: Kernel Before Applications; Rule 10:
 * Dependency Direction Kernel -> Shared Engines -> Applications).
 *
 * Kernel owns NOTHING itself. It is a pure delegation facade over the four
 * real kernel engines:
 *   - Compatibility (core/kernel/compatibility.js) — version decisions
 *   - Bootstrap     (core/kernel/bootstrap.js)      — registration + platform state
 *   - Lifecycle     (core/kernel/lifecycle.js)       — runtime state (reached only
 *                                                       through Bootstrap's token,
 *                                                       never touched directly here)
 *   - Diagnostics   (core/kernel/diagnostics.js)     — observation + reporting
 *
 * Every exported function here does one of two things:
 *   1. Forwards a call straight to the engine that owns that responsibility, or
 *   2. Aggregates read-only reports from multiple engines into one convenience
 *      shape for callers (no new state, no new decisions — Rule 2, Rule 6).
 *
 * Kernel never calls Lifecycle directly. Rule 11 reserves Lifecycle mutation
 * for Bootstrap's private token; Kernel reaches runtime-state operations
 * exclusively through Bootstrap's own pass-through methods, exactly as an
 * application would.
 *
 * DEPENDENCIES (Rule 17)
 * ------------------------
 * Requires bootstrap.js, lifecycle.js (indirectly), compatibility.js, and
 * diagnostics.js — all already built, self-certified (26/26, see
 * Diagnostics.runSelfCertification), and integrated. No missing dependency
 * blocks this file.
 * =============================================================================
 */

'use strict';

import Bootstrap from './bootstrap.js';
import Compatibility from './compatibility.js';
import Diagnostics from './diagnostics.js';

// -----------------------------------------------------------------------------
// Re-exported constants (never redefined — Rule 2: single source of truth
// stays with the engine that owns it)
// -----------------------------------------------------------------------------

const KERNEL_VERSION = Bootstrap.KERNEL_VERSION;
const PLATFORM_STATES = Bootstrap.PLATFORM_STATES;

// -----------------------------------------------------------------------------
// Kernel-level event bus — forwards Bootstrap's platform events under a
// `kernel:*` namespace for application convenience. This is aggregation, not
// duplication: Kernel does not decide platform state, it only re-announces
// what Bootstrap already decided (Rule 1, Rule 8).
// -----------------------------------------------------------------------------

const kernelListeners = new Map();

function on(eventName, handler) {
  if (typeof handler !== 'function') return () => {};
  if (!kernelListeners.has(eventName)) kernelListeners.set(eventName, new Set());
  kernelListeners.get(eventName).add(handler);
  return () => kernelListeners.get(eventName)?.delete(handler);
}

function emit(eventName, payload) {
  const handlers = kernelListeners.get(eventName);
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Kernel] listener error on "${eventName}":`, err);
    }
  }
}

Bootstrap.on(Bootstrap.PLATFORM_EVENTS.READY, (payload) => emit('kernel:ready', payload));
Bootstrap.on(Bootstrap.PLATFORM_EVENTS.SHUTDOWN, (payload) => emit('kernel:shutdown', payload));
Bootstrap.on(Bootstrap.PLATFORM_EVENTS.DEGRADED, (payload) => emit('kernel:degraded', payload));
Bootstrap.on(Bootstrap.PLATFORM_EVENTS.SERVICE_REJECTED, (payload) => emit('kernel:error', payload));

// -----------------------------------------------------------------------------
// Registration & compatibility — forwarded to Bootstrap / Compatibility
// -----------------------------------------------------------------------------

function registerEngine(manifest, runtimeOptions) {
  return Bootstrap.registerService(manifest, runtimeOptions);
}

function validateManifest(manifest) {
  return Bootstrap.validateManifest(manifest);
}

function checkCompatibility(manifest) {
  return Compatibility.check(manifest, { kernelVersion: KERNEL_VERSION });
}

// -----------------------------------------------------------------------------
// Runtime state — forwarded to Bootstrap's own pass-through methods only.
// Kernel never imports or calls Lifecycle directly (Rule 11).
// -----------------------------------------------------------------------------

function initializeService(name) {
  return Bootstrap.initializeService(name);
}
function verifyService(name, verifyFn) {
  return Bootstrap.verifyService(name, verifyFn);
}
function startService(name) {
  return Bootstrap.startService(name);
}
function pauseService(name) {
  return Bootstrap.pauseService(name);
}
function resumeService(name) {
  return Bootstrap.resumeService(name);
}
function stopService(name) {
  return Bootstrap.stopService(name);
}
function restartService(name, verifyFn) {
  return Bootstrap.restartService(name, verifyFn);
}
function removeService(name) {
  return Bootstrap.removeService(name);
}
function failService(name, error) {
  return Bootstrap.failService(name, error);
}
function recoverService(name, verifyFn) {
  return Bootstrap.recoverService(name, verifyFn);
}

// -----------------------------------------------------------------------------
// Platform state — forwarded to Bootstrap (the sole owner, Rule 11)
// -----------------------------------------------------------------------------

function getPlatformState() {
  return Bootstrap.getPlatformState();
}
function markPlatformReady() {
  return Bootstrap.markPlatformReady();
}
function shutdownPlatform() {
  return Bootstrap.shutdownPlatform();
}
function isReady() {
  return Bootstrap.getPlatformState() === PLATFORM_STATES.READY;
}

// -----------------------------------------------------------------------------
// Diagnostics / health — forwarded to Diagnostics (the sole owner, Rule 13)
// -----------------------------------------------------------------------------

function getHealth() {
  return Diagnostics.getPlatformHealth();
}
function getServiceHealth(name) {
  return Diagnostics.getServiceHealth(name);
}
function getBootReport() {
  return Diagnostics.getBootReport();
}
function getStatistics() {
  return Diagnostics.getStatistics();
}
function getDashboard() {
  return Diagnostics.getDashboardSummary();
}

// -----------------------------------------------------------------------------
// Aggregated reports — read-only combination of existing reports, no new
// computation invented here (Rule 6: honest engineering, nothing fabricated)
// -----------------------------------------------------------------------------

function getCapabilities() {
  return Object.freeze({
    compatibility: Compatibility.getDiagnostics(),
    bootstrap: { kernelVersion: Bootstrap.KERNEL_VERSION },
    lifecycle: true,
    diagnostics: true,
    // AI Extension Points and other future providers declared by the spec
    // are intentionally not implemented (Rule 15: No Speculative Over-Build).
    future: []
  });
}

function getKernelReport() {
  return Object.freeze({
    kernelVersion: KERNEL_VERSION,
    platformState: getPlatformState(),
    platform: Bootstrap.getPlatformReport(),
    health: Diagnostics.getPlatformHealth(),
    dashboard: Diagnostics.getDashboardSummary()
  });
}

// -----------------------------------------------------------------------------
// Frozen public surface (Rule 16: Frozen Kernel Standard)
// -----------------------------------------------------------------------------

const Kernel = Object.freeze({
  KERNEL_VERSION,
  PLATFORM_STATES,

  // events
  on,

  // registration & compatibility
  registerEngine,
  validateManifest,
  checkCompatibility,

  // runtime state (via Bootstrap only)
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
  isReady,

  // diagnostics / health
  getHealth,
  getServiceHealth,
  getBootReport,
  getStatistics,
  getDashboard,

  // aggregated reports
  getCapabilities,
  getKernelReport
});

export default Kernel;
