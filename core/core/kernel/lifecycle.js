/**
 * =============================================================================
 * CozyOS Kernel — Lifecycle Engine
 * File: core/kernel/lifecycle.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * The Lifecycle Engine owns RUNTIME STATE only, per the frozen CozyOS
 * Kernel Standard (Rule 12). It begins managing a service the moment
 * Bootstrap hands it a validated, compatibility-checked manifest, and
 * takes it from REGISTERED through INITIALIZING, VERIFYING, READY,
 * RUNNING, PAUSED, STOPPING, STOPPED, RESTARTING, FAILED, RECOVERING.
 *
 * It never renders UI. It never loads applications. It never registers
 * services and it never performs compatibility checks — those belong to
 * Bootstrap (core/kernel/bootstrap.js) and Compatibility
 * (core/kernel/compatibility.js) respectively (Rule 1: Single
 * Responsibility). Lifecycle assumes any manifest it receives has
 * already passed both.
 *
 * DESIGN RULES
 * -------------
 * - No UI rendering. No HTML or CSS.
 * - No application logic. No business logic.
 * - No registration logic (Rule 1 — that's Bootstrap's domain).
 * - No compatibility logic (Rule 14 — that's Compatibility's domain).
 * - Pure kernel runtime-state management only.
 * - Public surface is exposed as a single frozen object (frozen-object
 *   architecture per CozyOS kernel convention).
 *
 * SECURITY
 * --------
 * Only Bootstrap may accept a service into Lifecycle, or start, pause,
 * resume, stop, restart, fail, recover, or remove it. Every mutating
 * call requires the authorization token Bootstrap obtained by calling
 * setBootstrapToken() (see `authorizeCaller` below). Applications must
 * never be given this token.
 *
 * ⚠ RECONCILIATION FLAG:
 * Diagnostics (core/kernel/diagnostics.js) is referenced by the Kernel
 * Standard but not yet built or seen by this module — getLifecycleReport()
 * below is Lifecycle's own contribution to that framework (Rule 13), not
 * a replacement for it. Reconcile the report shape against diagnostics.js
 * once it exists.
 * =============================================================================
 */

'use strict';

// -----------------------------------------------------------------------------
// Core States (frozen — every service exists in exactly one of these)
// -----------------------------------------------------------------------------

const STATES = Object.freeze({
  REGISTERED: 'REGISTERED',
  INITIALIZING: 'INITIALIZING',
  VERIFYING: 'VERIFYING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  STOPPING: 'STOPPING',
  STOPPED: 'STOPPED',
  RESTARTING: 'RESTARTING',
  FAILED: 'FAILED',
  RECOVERING: 'RECOVERING',
  DISABLED: 'DISABLED',
  REMOVED: 'REMOVED',
  PERMANENT_FAILURE: 'PERMANENT_FAILURE'
});

// Legal transitions, keyed by current state -> allowed next states.
// Used to reject illegal jumps rather than trusting callers.
const TRANSITIONS = Object.freeze({
  [STATES.REGISTERED]: [STATES.INITIALIZING, STATES.REMOVED, STATES.DISABLED],
  [STATES.INITIALIZING]: [STATES.VERIFYING, STATES.FAILED],
  [STATES.VERIFYING]: [STATES.READY, STATES.FAILED],
  [STATES.READY]: [STATES.RUNNING, STATES.DISABLED, STATES.REMOVED],
  [STATES.RUNNING]: [STATES.PAUSED, STATES.STOPPING, STATES.FAILED],
  [STATES.PAUSED]: [STATES.RUNNING, STATES.STOPPING],
  [STATES.STOPPING]: [STATES.STOPPED],
  [STATES.STOPPED]: [STATES.RESTARTING, STATES.REMOVED, STATES.DISABLED],
  [STATES.RESTARTING]: [STATES.INITIALIZING],
  [STATES.FAILED]: [STATES.RECOVERING, STATES.PERMANENT_FAILURE, STATES.REMOVED],
  [STATES.RECOVERING]: [STATES.READY, STATES.FAILED],
  [STATES.DISABLED]: [STATES.INITIALIZING, STATES.REMOVED],
  [STATES.PERMANENT_FAILURE]: [STATES.REMOVED],
  [STATES.REMOVED]: []
});

const RESTART_POLICIES = Object.freeze({
  NONE: 'NONE',
  ON_FAILURE: 'ON_FAILURE',
  ALWAYS: 'ALWAYS'
});

const VALID_RETRY_LIMITS = Object.freeze([1, 2, 3, 5, 10]);

const EVENTS = Object.freeze({
  REGISTERED: 'service:registered',
  INITIALIZING: 'service:initializing',
  VERIFYING: 'service:verifying',
  READY: 'service:ready',
  RUNNING: 'service:running',
  PAUSED: 'service:paused',
  RESUMED: 'service:resumed',
  STOPPED: 'service:stopped',
  FAILED: 'service:failed',
  RECOVERING: 'service:recovering',
  REMOVED: 'service:removed',
  PERMANENT_FAILURE: 'service:permanent-failure',
  PLATFORM_DEGRADED: 'platform:degraded'
});

// -----------------------------------------------------------------------------
// Internal state (module-private — not exported, not mutable from outside)
// -----------------------------------------------------------------------------

/** @type {Map<string, ServiceRecord>} */
const registry = new Map();

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

// ASSUMPTION: Bootstrap identifies itself with a token it alone holds.
// Reconcile against bootstrap.js's actual auth mechanism if different
// (e.g. a capability object, a symbol, or a signed handshake).
let bootstrapToken = null;

// -----------------------------------------------------------------------------
// Event bus (minimal internal pub/sub — no external dependency)
// -----------------------------------------------------------------------------

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
      // A listener's failure must never break the lifecycle engine itself.
      // eslint-disable-next-line no-console
      console.error(`[Lifecycle] listener error on "${eventName}":`, err);
    }
  }
}

// -----------------------------------------------------------------------------
// Security — only Bootstrap may perform mutating operations
// -----------------------------------------------------------------------------

function setBootstrapToken(token) {
  if (bootstrapToken !== null) {
    throw new Error('[Lifecycle] Bootstrap token already set. Refusing to overwrite.');
  }
  bootstrapToken = token;
}

function authorizeCaller(callerToken) {
  if (bootstrapToken === null) {
    throw new Error('[Lifecycle] No Bootstrap token registered. Call setBootstrapToken() first.');
  }
  if (callerToken !== bootstrapToken) {
    throw new Error('[Lifecycle] Unauthorized: only Bootstrap may mutate service lifecycles.');
  }
}

// -----------------------------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------------------------

function assertRegistered(serviceName) {
  const record = registry.get(serviceName);
  if (!record) {
    throw new Error(`[Lifecycle] Unknown service: "${serviceName}"`);
  }
  return record;
}

function transition(record, nextState) {
  const allowed = TRANSITIONS[record.state] || [];
  if (!allowed.includes(nextState)) {
    throw new Error(
      `[Lifecycle] Illegal transition for "${record.name}": ${record.state} -> ${nextState}`
    );
  }
  record.state = nextState;
  record.history.push({ state: nextState, at: Date.now() });
  if (record.history.length > 50) record.history.shift(); // bounded history
}

function now() {
  return Date.now();
}

// -----------------------------------------------------------------------------
// Public API — Acceptance into runtime (called by Bootstrap only)
// -----------------------------------------------------------------------------

/**
 * Accepts a service into Lifecycle's runtime tracking at REGISTERED state.
 *
 * This is NOT registration — registration (identity, manifest validation,
 * compatibility checking) is Bootstrap's job and has already happened by
 * the time this is called. Lifecycle just starts owning runtime state
 * from here (Rule 12).
 *
 * @param {*} token - Bootstrap's authorization token.
 * @param {object} manifest - The already-validated, already-compatibility-
 *   checked Service Manifest handed down by Bootstrap.
 * @param {string} manifest.name
 * @param {string} [manifest.version]
 * @param {string} [manifest.apiVersion]
 * @param {number} [manifest.priority]
 * @param {boolean} [manifest.mandatory]
 * @param {string} [manifest.minKernelVersion]
 * @param {string[]} [manifest.dependencies]
 * @param {object} [runtimeOptions] - Lifecycle-specific runtime policy,
 *   not part of the Bootstrap manifest.
 * @param {string} [runtimeOptions.restartPolicy] - One of RESTART_POLICIES.
 * @param {number} [runtimeOptions.maxRetries] - One of VALID_RETRY_LIMITS.
 */
function acceptRegisteredService(token, manifest, runtimeOptions = {}) {
  authorizeCaller(token);

  const name = manifest?.name;
  if (!name || typeof name !== 'string') {
    throw new Error('[Lifecycle] acceptRegisteredService requires manifest.name (non-empty string).');
  }
  if (registry.has(name)) {
    throw new Error(`[Lifecycle] Service "${name}" already has a runtime record.`);
  }

  const restartPolicy = runtimeOptions.restartPolicy || RESTART_POLICIES.ON_FAILURE;
  if (!Object.values(RESTART_POLICIES).includes(restartPolicy)) {
    throw new Error(`[Lifecycle] Invalid restartPolicy: "${restartPolicy}"`);
  }

  const maxRetries = runtimeOptions.maxRetries ?? 3;
  if (!VALID_RETRY_LIMITS.includes(maxRetries)) {
    throw new Error(`[Lifecycle] Invalid maxRetries: ${maxRetries}. Must be one of ${VALID_RETRY_LIMITS.join(', ')}`);
  }

  const record = {
    name,
    state: STATES.REGISTERED,
    dependencies: Array.isArray(manifest.dependencies) ? [...manifest.dependencies] : [],
    version: manifest.version || '0.0.0',
    apiVersion: manifest.apiVersion || '1.0.0',
    // Carried for diagnostics reporting only (Rule 13) — Lifecycle does not
    // interpret or enforce these; Bootstrap already did (Rules 9 & 14).
    priority: manifest.priority ?? null,
    mandatory: Boolean(manifest.mandatory),
    minKernelVersion: manifest.minKernelVersion || null,
    restartPolicy,
    maxRetries,
    retryCount: 0,
    restartCount: 0,
    failureCount: 0,
    recoveryCount: 0,
    startTime: null,
    readyTime: null,
    runningTime: null,
    lastFailure: null,
    lastRestart: null,
    history: [{ state: STATES.REGISTERED, at: now() }]
  };

  registry.set(name, record);
  emit(EVENTS.REGISTERED, { name, state: record.state });
  return getServiceState(name);
}

// -----------------------------------------------------------------------------
// Public API — Lifecycle transitions
// -----------------------------------------------------------------------------

function initializeService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.INITIALIZING);
  record.startTime = now();
  emit(EVENTS.INITIALIZING, { name, state: record.state });
  return getServiceState(name);
}

/**
 * Runs dependency checks for a service. Caller supplies the verification
 * function since the Lifecycle Engine has no knowledge of what a
 * "dependency" actually means for a given service (that would be business
 * logic). It only knows how to react to pass/fail.
 * @param {string} token
 * @param {string} name
 * @param {() => boolean | Promise<boolean>} [verifyFn] - Optional custom check.
 */
async function verifyService(token, name, verifyFn) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.VERIFYING);
  emit(EVENTS.VERIFYING, { name, state: record.state });

  let dependenciesSatisfied = true;
  for (const dep of record.dependencies) {
    const depRecord = registry.get(dep);
    if (!depRecord || depRecord.state !== STATES.RUNNING) {
      dependenciesSatisfied = false;
      break;
    }
  }

  let customCheckPassed = true;
  if (typeof verifyFn === 'function') {
    try {
      customCheckPassed = await verifyFn();
    } catch {
      customCheckPassed = false;
    }
  }

  if (dependenciesSatisfied && customCheckPassed) {
    transition(record, STATES.READY);
    record.readyTime = now();
    emit(EVENTS.READY, { name, state: record.state });
  } else {
    return failService(token, name, new Error('Dependency verification failed'));
  }

  return getServiceState(name);
}

function startService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.RUNNING);
  record.runningTime = now();
  emit(EVENTS.RUNNING, { name, state: record.state });
  return getServiceState(name);
}

function pauseService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.PAUSED);
  emit(EVENTS.PAUSED, { name, state: record.state });
  return getServiceState(name);
}

function resumeService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.RUNNING);
  emit(EVENTS.RESUMED, { name, state: record.state });
  return getServiceState(name);
}

function stopService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.STOPPING);
  transition(record, STATES.STOPPED);
  emit(EVENTS.STOPPED, { name, state: record.state });
  return getServiceState(name);
}

async function restartService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);

  // RUNNING -> STOPPING -> STOPPED -> RESTARTING -> INITIALIZING -> READY -> RUNNING
  if (record.state === STATES.RUNNING) {
    transition(record, STATES.STOPPING);
    transition(record, STATES.STOPPED);
    emit(EVENTS.STOPPED, { name, state: record.state });
  }
  transition(record, STATES.RESTARTING);
  transition(record, STATES.INITIALIZING);
  record.startTime = now();
  record.restartCount += 1;
  record.lastRestart = now();
  emit(EVENTS.INITIALIZING, { name, state: record.state });

  transition(record, STATES.READY);
  record.readyTime = now();
  emit(EVENTS.READY, { name, state: record.state });

  transition(record, STATES.RUNNING);
  record.runningTime = now();
  emit(EVENTS.RUNNING, { name, state: record.state });

  return getServiceState(name);
}

function removeService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.REMOVED);
  emit(EVENTS.REMOVED, { name, state: record.state });
  registry.delete(name);
  return true;
}

// -----------------------------------------------------------------------------
// Public API — Failure & recovery
// -----------------------------------------------------------------------------

function failService(token, name, error) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.FAILED);
  record.failureCount += 1;
  record.lastFailure = {
    error: error?.message || String(error || 'Unknown error'),
    timestamp: now(),
    stack: error?.stack || null,
    retryCount: record.retryCount
  };
  emit(EVENTS.FAILED, { name, state: record.state, error: record.lastFailure });

  if (record.restartPolicy === RESTART_POLICIES.NONE) {
    return escalateToPermanentFailure(record);
  }

  if (record.retryCount >= record.maxRetries) {
    return escalateToPermanentFailure(record);
  }

  return getServiceState(name);
}

function escalateToPermanentFailure(record) {
  transition(record, STATES.PERMANENT_FAILURE);
  emit(EVENTS.PERMANENT_FAILURE, { name: record.name, state: record.state });
  // ASSUMPTION: Bootstrap subscribes to PLATFORM_DEGRADED to flip overall
  // platform health. Reconcile the payload shape against bootstrap.js.
  emit(EVENTS.PLATFORM_DEGRADED, {
    reason: `Service "${record.name}" exceeded retry limit (${record.maxRetries}).`,
    service: record.name
  });
  return getServiceState(record.name);
}

/**
 * Attempts automatic recovery of a FAILED service.
 * FAILED -> RECOVERING -> READY -> RUNNING
 */
async function recoverService(token, name, verifyFn) {
  authorizeCaller(token);
  const record = assertRegistered(name);

  if (record.state !== STATES.FAILED) {
    throw new Error(`[Lifecycle] Cannot recover "${name}" from state ${record.state} (must be FAILED).`);
  }

  record.retryCount += 1;
  transition(record, STATES.RECOVERING);
  emit(EVENTS.RECOVERING, { name, state: record.state });

  transition(record, STATES.READY);
  record.readyTime = now();
  record.recoveryCount += 1;

  const started = startService(token, name);
  record.retryCount = 0; // reset on successful recovery
  return started;
}

// -----------------------------------------------------------------------------
// Public API — Read-only queries
// -----------------------------------------------------------------------------

function getServiceState(name) {
  const record = assertRegistered(name);
  return record.state;
}

function getLifecycleReport(name) {
  if (name) {
    const record = assertRegistered(name);
    return buildDiagnosticEntry(record);
  }
  return Array.from(registry.values()).map(buildDiagnosticEntry);
}

function buildDiagnosticEntry(record) {
  return Object.freeze({
    serviceName: record.name,
    currentState: record.state,
    startTime: record.startTime,
    readyTime: record.readyTime,
    runningTime: record.runningTime,
    restartCount: record.restartCount,
    failureCount: record.failureCount,
    recoveryCount: record.recoveryCount,
    lastFailure: record.lastFailure,
    lastRestart: record.lastRestart,
    dependencies: [...record.dependencies],
    currentVersion: record.version,
    apiVersion: record.apiVersion,
    priority: record.priority,
    mandatory: record.mandatory,
    minKernelVersion: record.minKernelVersion
  });
}

function getRunningServices() {
  return filterByState(STATES.RUNNING);
}

function getFailedServices() {
  return filterByState(STATES.FAILED);
}

function getPausedServices() {
  return filterByState(STATES.PAUSED);
}

function getStoppedServices() {
  return filterByState(STATES.STOPPED);
}

function filterByState(state) {
  const results = [];
  for (const record of registry.values()) {
    if (record.state === state) results.push(record.name);
  }
  return results;
}

// -----------------------------------------------------------------------------
// Frozen public surface
// -----------------------------------------------------------------------------

const LifecycleEngine = Object.freeze({
  // constants
  STATES,
  EVENTS,
  RESTART_POLICIES,

  // security
  setBootstrapToken,

  // events
  on,

  // acceptance into runtime — called by Bootstrap only, after it has
  // already registered and compatibility-checked the manifest
  acceptRegisteredService,

  // transitions (require Bootstrap token)
  initializeService,
  verifyService,
  startService,
  pauseService,
  resumeService,
  stopService,
  restartService,
  removeService,

  // failure & recovery (require Bootstrap token)
  failService,
  recoverService,

  // queries (read-only, no token required)
  getServiceState,
  getLifecycleReport,
  getRunningServices,
  getFailedServices,
  getPausedServices,
  getStoppedServices
});

export default LifecycleEngine;
