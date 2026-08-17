/**
 * =============================================================================
 * CozyOS Kernel — Lifecycle Engine
 * File: core/kernel/lifecycle.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * The Lifecycle Engine owns RUNTIME STATE only, per the frozen CozyOS
 * Kernel Standard (Rule 12), and is the single, permanent Lifecycle
 * owner for the entire platform (Constitution v7 — "Lifecycle Ownership
 * Rule"). It begins managing a component the moment its owning system
 * (Bootstrap for services; other owning engines for other kinds) hands
 * it a validated manifest, and takes it from REGISTERED through
 * INITIALIZING, VERIFYING, READY, RUNNING, PAUSED, STOPPING, STOPPED,
 * RESTARTING, FAILED, RECOVERING.
 *
 * Originally scoped to kernel services only, this file's scope was
 * generalized in place (rather than spinning up a second lifecycle
 * engine elsewhere) to also track applications, modules, coordinators,
 * engines, plugins, themes, backgrounds, resources, and AI/OCR/speech/
 * translation providers — all through the SAME state machine and event
 * taxonomy below. See "Component Kinds — Platform Lifecycle Ownership
 * Expansion" further down for exactly what's wired vs. deferred.
 *
 * It never renders UI. It never loads applications. It never registers
 * services and it never performs compatibility checks — those belong to
 * Bootstrap (core/kernel/bootstrap.js) and Compatibility
 * (core/kernel/compatibility.js) respectively (Rule 1: Single
 * Responsibility). Lifecycle assumes any manifest it receives has
 * already passed both. It also does not discover, audit, or execute —
 * those remain separate, currently-unbuilt platform concerns.
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

// -----------------------------------------------------------------------------
// Component Kinds — Platform Lifecycle Ownership Expansion
// -----------------------------------------------------------------------------
//
// CANONICAL LIFECYCLE OWNERSHIP DECLARATION
// ═══════════════════════════════════════════════════════════════════════
//   Every platform component has exactly ONE authoritative lifecycle
//   owner: THIS module. No second lifecycle engine may be created
//   anywhere in CozyOS (Constitution v7 — "No Duplicate Systems" and the
//   "Lifecycle Ownership Rule").
//
//   This module's scope was originally "kernel services accepted by
//   Bootstrap" only. It is now generalized to cover every registrable
//   platform component kind below, using the SAME state machine
//   (STATES/TRANSITIONS above — unchanged), the SAME event taxonomy
//   (EVENTS above — unchanged), and the SAME mutation functions
//   (initializeService/verifyService/startService/... below — unchanged).
//   A component's `kind` is metadata carried on its record, not a second
//   code path or a second set of states. There is still exactly one
//   state machine and one event bus in this file.
//
//   WIRED today (real, callable, exercised by tests):
//     - service — via Bootstrap -> acceptRegisteredService() (unchanged
//       signature and behavior; now a thin wrapper over acceptComponent()).
//     - plugin  — via the optional bridgePluginManagerEvents() bridge
//       below, which mirrors PluginManager's real, existing
//       cozyos:plugin:{install,enable,disable,error,timeout,remove}
//       window events. PluginManager remains the sole owner of plugin
//       execution; this bridge only mirrors state for visibility
//       (Rule: Lifecycle manages state only, never execution).
//
//   DEFERRED — kind exists in COMPONENT_KINDS and acceptComponent() will
//   accept it, but nothing in the platform calls it automatically yet.
//   No Discovery Engine exists in this codebase to auto-register these
//   (honest scope — not fabricated). Owning engines may call
//   acceptComponent() directly once they're ready to participate:
//     application, module, coordinator, engine, theme, background,
//     resource, ai_provider, ocr_provider, speech_provider,
//     translation_provider
//
//   This module still does not discover, audit, or execute anything.
//   Discovery/Audit/Operations remain separate, currently-unbuilt
//   concerns and are explicitly out of scope here.
// ═══════════════════════════════════════════════════════════════════════

const COMPONENT_KINDS = Object.freeze({
  SERVICE: 'service',
  APPLICATION: 'application',
  MODULE: 'module',
  COORDINATOR: 'coordinator',
  ENGINE: 'engine',
  PLUGIN: 'plugin',
  THEME: 'theme',
  BACKGROUND: 'background',
  RESOURCE: 'resource',
  AI_PROVIDER: 'ai_provider',
  OCR_PROVIDER: 'ocr_provider',
  SPEECH_PROVIDER: 'speech_provider',
  TRANSLATION_PROVIDER: 'translation_provider'
});

function isValidKind(kind) {
  return Object.values(COMPONENT_KINDS).includes(kind);
}

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
  // Thin wrapper — kept for 100% backward compatibility with every existing
  // caller (Bootstrap). All real logic now lives in acceptComponent().
  return acceptComponent(token, COMPONENT_KINDS.SERVICE, manifest, runtimeOptions);
}

/**
 * Accepts ANY platform component into Lifecycle's runtime tracking at
 * REGISTERED state. This is the generalized form of the original
 * acceptRegisteredService() (Lifecycle Ownership Rule) — identical
 * validation, identical record shape, identical REGISTERED-state
 * behavior, plus a `kind` tag so queries/reports/events can distinguish
 * component types sharing this single registry.
 *
 * This is NOT registration in the Manifest/Discovery sense — whatever
 * owning system calls this (Bootstrap for services, a future owning
 * engine for other kinds) has already done its own identity/manifest
 * validation. Lifecycle just starts owning runtime state from here.
 *
 * @param {*} token - Bootstrap's authorization token.
 * @param {string} kind - One of COMPONENT_KINDS.
 * @param {object} manifest
 * @param {string} manifest.name
 * @param {string} [manifest.version]
 * @param {string} [manifest.apiVersion]
 * @param {number} [manifest.priority]
 * @param {boolean} [manifest.mandatory]
 * @param {string} [manifest.minKernelVersion]
 * @param {string[]} [manifest.dependencies]
 * @param {object} [runtimeOptions]
 * @param {string} [runtimeOptions.restartPolicy] - One of RESTART_POLICIES.
 * @param {number} [runtimeOptions.maxRetries] - One of VALID_RETRY_LIMITS.
 */
function acceptComponent(token, kind, manifest, runtimeOptions = {}) {
  authorizeCaller(token);

  if (!isValidKind(kind)) {
    throw new Error(
      `[Lifecycle] Unknown component kind: "${kind}". Must be one of ${Object.values(COMPONENT_KINDS).join(', ')}`
    );
  }

  const name = manifest?.name;
  if (!name || typeof name !== 'string') {
    throw new Error('[Lifecycle] acceptComponent requires manifest.name (non-empty string).');
  }
  if (registry.has(name)) {
    throw new Error(`[Lifecycle] Component "${name}" already has a runtime record.`);
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
    kind,
    state: STATES.REGISTERED,
    dependencies: Array.isArray(manifest.dependencies) ? [...manifest.dependencies] : [],
    version: manifest.version || '0.0.0',
    apiVersion: manifest.apiVersion || '1.0.0',
    // Carried for diagnostics reporting only (Rule 13) — Lifecycle does not
    // interpret or enforce these; the caller already did (e.g. Bootstrap
    // per Rules 9 & 14 for services).
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
  emit(EVENTS.REGISTERED, { name, kind: record.kind, state: record.state });
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
  emit(EVENTS.INITIALIZING, { name, kind: record.kind, state: record.state });
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
  emit(EVENTS.VERIFYING, { name, kind: record.kind, state: record.state });

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
    emit(EVENTS.READY, { name, kind: record.kind, state: record.state });
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
  emit(EVENTS.RUNNING, { name, kind: record.kind, state: record.state });
  return getServiceState(name);
}

function pauseService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.PAUSED);
  emit(EVENTS.PAUSED, { name, kind: record.kind, state: record.state });
  return getServiceState(name);
}

function resumeService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.RUNNING);
  emit(EVENTS.RESUMED, { name, kind: record.kind, state: record.state });
  return getServiceState(name);
}

function stopService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.STOPPING);
  transition(record, STATES.STOPPED);
  emit(EVENTS.STOPPED, { name, kind: record.kind, state: record.state });
  return getServiceState(name);
}

async function restartService(token, name, verifyFn) {
  authorizeCaller(token);
  const record = assertRegistered(name);

  // RUNNING -> STOPPING -> STOPPED -> RESTARTING -> INITIALIZING -> VERIFYING -> READY -> RUNNING
  // BUGFIX (Rule 21): this previously jumped INITIALIZING -> READY directly,
  // which TRANSITIONS[INITIALIZING] (= [VERIFYING, FAILED]) forbids, and
  // reimplemented a stripped-down copy of verifyService()'s READY logic
  // (Rule 2 violation) instead of reusing it. Now it reuses the real
  // verifyService()/startService() so dependency checks run identically on
  // restart as they do on first start, and the transition stays legal.
  if (record.state === STATES.RUNNING) {
    transition(record, STATES.STOPPING);
    transition(record, STATES.STOPPED);
    emit(EVENTS.STOPPED, { name, kind: record.kind, state: record.state });
  }
  transition(record, STATES.RESTARTING);
  transition(record, STATES.INITIALIZING);
  record.startTime = now();
  record.restartCount += 1;
  record.lastRestart = now();
  emit(EVENTS.INITIALIZING, { name, kind: record.kind, state: record.state });

  await verifyService(token, name, verifyFn);

  return startService(token, name);
}

function removeService(token, name) {
  authorizeCaller(token);
  const record = assertRegistered(name);
  transition(record, STATES.REMOVED);
  emit(EVENTS.REMOVED, { name, kind: record.kind, state: record.state });
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
  emit(EVENTS.FAILED, { name, kind: record.kind, state: record.state, error: record.lastFailure });

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
  emit(EVENTS.PERMANENT_FAILURE, { name: record.name, kind: record.kind, state: record.state });
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
  emit(EVENTS.RECOVERING, { name, kind: record.kind, state: record.state });

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

/**
 * @param {string} [name] - If given, returns a single component's report
 *   regardless of kind (names are unique across the whole registry).
 * @param {string|null} [kindFilter] - When `name` is omitted, filters the
 *   list by kind. Defaults to 'service' so existing callers (e.g.
 *   Bootstrap.getPlatformReport()'s `services:` field) see EXACTLY the
 *   same result set as before this file supported other kinds. Pass
 *   `null` explicitly to get every component regardless of kind (used by
 *   getPlatformComponentsReport() below).
 */
function getLifecycleReport(name, kindFilter = COMPONENT_KINDS.SERVICE) {
  if (name) {
    const record = assertRegistered(name);
    return buildDiagnosticEntry(record);
  }
  const all = Array.from(registry.values());
  const filtered = kindFilter === null ? all : all.filter((r) => r.kind === kindFilter);
  return filtered.map(buildDiagnosticEntry);
}

/**
 * Full multi-kind platform report — every tracked component regardless
 * of kind, optionally narrowed to one kind. This is the query the new
 * Platform Lifecycle Center (Administrator Workspace) should use instead
 * of getLifecycleReport(), which stays service-scoped by default for
 * backward compatibility.
 * @param {string|null} [kind] - One of COMPONENT_KINDS, or null (default) for all.
 */
function getPlatformComponentsReport(kind = null) {
  if (kind !== null && !isValidKind(kind)) {
    throw new Error(`[Lifecycle] Unknown component kind: "${kind}".`);
  }
  return getLifecycleReport(undefined, kind);
}

function getComponentsByKind(kind) {
  if (!isValidKind(kind)) {
    throw new Error(`[Lifecycle] Unknown component kind: "${kind}".`);
  }
  const results = [];
  for (const record of registry.values()) {
    if (record.kind === kind) results.push(record.name);
  }
  return results;
}

function buildDiagnosticEntry(record) {
  return Object.freeze({
    serviceName: record.name,
    kind: record.kind,
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
  return filterByState(STATES.RUNNING, COMPONENT_KINDS.SERVICE);
}

function getFailedServices() {
  return filterByState(STATES.FAILED, COMPONENT_KINDS.SERVICE);
}

function getPausedServices() {
  return filterByState(STATES.PAUSED, COMPONENT_KINDS.SERVICE);
}

function getStoppedServices() {
  return filterByState(STATES.STOPPED, COMPONENT_KINDS.SERVICE);
}

/**
 * Generic, multi-kind version of getRunningServices()/getFailedServices()/
 * etc. — names of every component in `state`, optionally narrowed to one
 * kind (pass null for all kinds).
 */
function getComponentsByState(state, kind = null) {
  return filterByState(state, kind);
}

function filterByState(state, kind = null) {
  const results = [];
  for (const record of registry.values()) {
    if (record.state !== state) continue;
    if (kind !== null && record.kind !== kind) continue;
    results.push(record.name);
  }
  return results;
}

// -----------------------------------------------------------------------------
// Public API — Optional Integration Bridges
// -----------------------------------------------------------------------------

let pluginBridgeActive = false;
const pluginBridgeHandlers = [];

/**
 * Mirrors PluginManager's real cozyos:plugin:{install,enable,disable,
 * error,timeout,remove} window events (verified against
 * core/pluginManager.js — not fabricated) into this Lifecycle registry
 * under kind: 'plugin'. PluginManager remains the sole owner of plugin
 * execution, health, and crash isolation; this bridge only mirrors state
 * for cross-platform visibility (e.g. the Platform Lifecycle Center),
 * per the rule that Lifecycle manages state only and integrates with
 * existing lifecycle-emitting systems rather than replacing them.
 *
 * Best-effort by design: every mirrored transition only fires if it is
 * LEGAL under TRANSITIONS for the plugin's current recorded state. An
 * event that would require an illegal jump is skipped and logged rather
 * than forced — this bridge never fabricates a transition that didn't
 * legitimately happen.
 *
 * Must be called explicitly (e.g. by Bootstrap during platform startup).
 * This file does not attach the bridge on load, matching this
 * codebase's convention of explicit wiring over implicit side effects
 * (see module-loading-manager.js's init()).
 *
 * @param {*} token - Bootstrap's authorization token.
 */
function bridgePluginManagerEvents(token) {
  authorizeCaller(token);
  if (pluginBridgeActive) return; // idempotent
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return; // no window available (e.g. non-browser test context)
  }

  const attach = (eventName, handler) => {
    const wrapped = (evt) => handler(evt?.detail || {});
    window.addEventListener(`cozyos:plugin:${eventName}`, wrapped);
    pluginBridgeHandlers.push([`cozyos:plugin:${eventName}`, wrapped]);
  };

  const idOf = (detail) => detail.pluginId || detail.name;

  async function safelyWalkTo(name, target) {
    if (!name || !registry.has(name)) return;
    try {
      if (target === STATES.RUNNING) {
        if (registry.get(name)?.state === STATES.REGISTERED) initializeService(token, name);
        if (registry.get(name)?.state === STATES.INITIALIZING) await verifyService(token, name, () => true);
        if (registry.get(name)?.state === STATES.READY) startService(token, name);
      } else if (target === STATES.PAUSED) {
        if (registry.get(name)?.state === STATES.RUNNING) pauseService(token, name);
      } else if (target === STATES.REMOVED) {
        if (registry.get(name)?.state === STATES.RUNNING) stopService(token, name);
        const current = registry.get(name)?.state;
        if (current && (TRANSITIONS[current] || []).includes(STATES.REMOVED)) removeService(token, name);
      }
    } catch (err) {
      // Fail-soft: this bridge mirrors PluginManager, it never throws back
      // into it. A skipped mirror is a diagnostics gap, not a crash.
      // eslint-disable-next-line no-console
      console.warn(`[Lifecycle] Plugin bridge could not mirror "${name}" toward ${target}:`, err.message);
    }
  }

  attach('install', (detail) => {
    const name = idOf(detail);
    if (!name || registry.has(name)) return; // unnamed or already tracked
    try {
      acceptComponent(token, COMPONENT_KINDS.PLUGIN, { name, version: detail.version });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[Lifecycle] Plugin bridge could not register "${name}":`, err.message);
    }
  });

  attach('enable', (detail) => { safelyWalkTo(idOf(detail), STATES.RUNNING); });
  attach('disable', (detail) => { safelyWalkTo(idOf(detail), STATES.PAUSED); });
  attach('remove', (detail) => { safelyWalkTo(idOf(detail), STATES.REMOVED); });

  attach('error', (detail) => {
    const name = idOf(detail);
    if (!name || !registry.has(name)) return;
    try {
      failService(token, name, new Error(detail.message || 'Plugin reported an error'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[Lifecycle] Plugin bridge could not mark "${name}" FAILED:`, err.message);
    }
  });

  attach('timeout', (detail) => {
    const name = idOf(detail);
    if (!name || !registry.has(name)) return;
    try {
      failService(token, name, new Error('Plugin execution timed out'));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[Lifecycle] Plugin bridge could not mark "${name}" FAILED (timeout):`, err.message);
    }
  });

  pluginBridgeActive = true;
}

/** Test/teardown helper — detaches the plugin bridge listeners. */
function unbridgePluginManagerEvents() {
  if (typeof window !== 'undefined') {
    for (const [eventName, wrapped] of pluginBridgeHandlers) {
      window.removeEventListener(eventName, wrapped);
    }
  }
  pluginBridgeHandlers.length = 0;
  pluginBridgeActive = false;
}

// -----------------------------------------------------------------------------
// Frozen public surface
// -----------------------------------------------------------------------------

const LifecycleEngine = Object.freeze({
  // constants
  STATES,
  EVENTS,
  RESTART_POLICIES,
  COMPONENT_KINDS,

  // security
  setBootstrapToken,

  // events
  on,

  // acceptance into runtime — called by Bootstrap only, after it has
  // already registered and compatibility-checked the manifest
  acceptRegisteredService,
  // generalized acceptance for any component kind (Lifecycle Ownership Rule)
  acceptComponent,

  // transitions (require Bootstrap token) — kind-agnostic; operate on any
  // registered component regardless of kind, since the state machine and
  // its legality rules are the same for every kind
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
  getStoppedServices,

  // generalized, multi-kind queries (read-only, no token required)
  getPlatformComponentsReport,
  getComponentsByKind,
  getComponentsByState,

  // optional integration bridges (require Bootstrap token to attach)
  bridgePluginManagerEvents,
  unbridgePluginManagerEvents
});

export default LifecycleEngine;
