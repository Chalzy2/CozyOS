/**
 * CozyOS Enterprise Network Coordination Kernel
 * FILE: core/modules/network/cozy-network.js
 * VERSION: 1.0.0-ENTERPRISE
 *
 * CozyNetwork coordinates every network-related object, session, route,
 * connection, transport, synchronization request, offline communication,
 * device, and network topology across CozyOS. It performs ZERO networking,
 * ZERO protocol, ZERO encryption, ZERO compression, and ZERO synchronization
 * execution. It is a coordinator, registry manager, and bookkeeper only.
 *
 * ARCHITECTURE DECISIONS (resolved ambiguities, authored at build time):
 *
 * 1. Public API Freeze — The kernel's public API surface (the object
 *    returned by createCozyNetwork) is frozen once after registration
 *    completes, matching the other CozyOS enterprise kernels. Individual
 *    registries remain open to accept new entries. Individual adapter /
 *    plugin / integration OBJECTS registered into those registries are
 *    never frozen themselves (their entries are deep-cloned on the way in
 *    and deep-frozen only on the way OUT via get()/list(), so kernel state
 *    stays internally mutable while every value handed to a caller is
 *    immutable).
 *
 * 2. Version Conflict — VERSION_CONFLICT applies ONLY to the CozyNetwork
 *    kernel version during global kernel registration (hot-reload
 *    behavior). It has nothing to do with the per-entity offline-sync
 *    `version` field, which is pure entity revision tracking local to a
 *    single record.
 *
 * 3. Registry API Contract — Every registry exposes the standard CozyOS
 *    enterprise CRUD contract: register(), remove(), get(), list(), has(),
 *    count(). The Session Registry additionally exposes create(), start(),
 *    pause(), resume(), stop(), archive(), export_(), import_().
 *    (`register()` on any registry acts as create-or-update: unknown id =>
 *    create; known id => versioned update. This keeps a single entry point
 *    while still satisfying "register/remove/get/list/has/count" exactly
 *    as specified, and mirrors "merge-only import" semantics elsewhere.)
 *
 * 4. Security Choke Point — validateSecurity() recursively scans every
 *    entity at every nesting depth, at every registry entry point. Any
 *    prohibited field anywhere in the object graph rejects the ENTIRE
 *    operation by throwing CozyNetworkSecurityError. No partial writes,
 *    no silent stripping.
 *
 * 5. Connection Registry vs Adapter Registry — Connection Registry holds
 *    only runtime coordination records (connectionId, deviceId, peerId,
 *    transport, state, timestamps, diagnostics). Adapter Registry holds
 *    only capability descriptors (which transports/protocols a plugged-in
 *    adapter claims to support). Neither performs networking; adapters
 *    provide capability, connections represent active coordination state.
 *
 * 6. No networking behavior is implemented anywhere in this file. Every
 *    method is coordination, registry management, lifecycle bookkeeping,
 *    or diagnostics.
 *
 * 7. This file is complete, single-pass, and ready for enterprise
 *    certification. No TODOs, no placeholders, no deferred sections.
 */

'use strict';

/* ============================================================================
 * SECTION 1: CONSTANTS
 * ==========================================================================*/

const KERNEL_NAME = 'CozyNetwork';
const KERNEL_VERSION = '1.0.0-ENTERPRISE';

// Prohibited field names (Security Choke Point). Matched after normalization
// (lowercased, with underscores/hyphens/whitespace stripped) so that
// "api_key", "apiKey", "API-KEY" etc. all collapse to the same check.
// Exact normalized-name matching is used (not substring matching) so that
// legitimate compound fields are not accidentally rejected while every
// field literally named in the specification is always caught.
const PROHIBITED_FIELD_NAMES = Object.freeze([
  'password',
  'passcode',
  'pin',
  'secret',
  'token',
  'jwt',
  'apikey',
  'privatekey',
  'certificate',
  'credential',
  'fingerprint',
  'biometric',
  'retina',
  'iris',
  'faceembedding',
  'voiceprint',
]);

const PROHIBITED_FIELD_SET = new Set(PROHIBITED_FIELD_NAMES);

// Known integrations allowed into the Closed Integration Registry.
const KNOWN_INTEGRATIONS = Object.freeze([
  'CozyIdentity',
  'CozyStorage',
  'CozySync',
  'CozySpeech',
  'CozyTranslate',
  'CozyMedia',
  'CozyCamera',
  'CozyVision',
  'CozyAI',
  'OurCozyLive',
  'CozyEmergency',
  'CozySecurity',
]);

const KNOWN_INTEGRATION_SET = new Set(KNOWN_INTEGRATIONS);

// Valid Network Session Registry states and legal transitions.
const SESSION_STATES = Object.freeze({
  CREATED: 'created',
  ACTIVE: 'active',
  PAUSED: 'paused',
  STOPPED: 'stopped',
  ARCHIVED: 'archived',
});

const SESSION_TRANSITIONS = Object.freeze({
  [SESSION_STATES.CREATED]: new Set([SESSION_STATES.ACTIVE]),
  [SESSION_STATES.ACTIVE]: new Set([SESSION_STATES.PAUSED, SESSION_STATES.STOPPED]),
  [SESSION_STATES.PAUSED]: new Set([SESSION_STATES.ACTIVE, SESSION_STATES.STOPPED]),
  [SESSION_STATES.STOPPED]: new Set([SESSION_STATES.ARCHIVED]),
  [SESSION_STATES.ARCHIVED]: new Set([]),
});

const OFFLINE_QUEUE_STATES = Object.freeze([
  'pending',
  'queued',
  'delivered',
  'failed',
  'retry',
]);

/* ============================================================================
 * SECTION 2: ERROR TYPES
 * ==========================================================================*/

class CozyNetworkError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'CozyNetworkError';
    this.code = code || 'COZY_NETWORK_ERROR';
    this.details = details || null;
    this.timestamp = new Date().toISOString();
  }
}

class CozyNetworkSecurityError extends CozyNetworkError {
  constructor(message, details) {
    super(message, 'SECURITY_REJECTED', details);
    this.name = 'CozyNetworkSecurityError';
  }
}

class CozyNetworkValidationError extends CozyNetworkError {
  constructor(message, details) {
    super(message, 'VALIDATION_FAILED', details);
    this.name = 'CozyNetworkValidationError';
  }
}

class CozyNetworkNotFoundError extends CozyNetworkError {
  constructor(message, details) {
    super(message, 'NOT_FOUND', details);
    this.name = 'CozyNetworkNotFoundError';
  }
}

class CozyNetworkStateError extends CozyNetworkError {
  constructor(message, details) {
    super(message, 'INVALID_STATE_TRANSITION', details);
    this.name = 'CozyNetworkStateError';
  }
}

class CozyNetworkVersionConflictError extends CozyNetworkError {
  constructor(message, details) {
    super(message, 'VERSION_CONFLICT', details);
    this.name = 'CozyNetworkVersionConflictError';
  }
}

/* ============================================================================
 * SECTION 3: UTILITIES
 * ==========================================================================*/

function nowISO() {
  return new Date().toISOString();
}

let __idCounter = 0;
function generateId(prefix) {
  __idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${__idCounter}_${rand}`;
}

function normalizeKey(key) {
  return String(key).toLowerCase().replace(/[_\-\s]/g, '');
}

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Recursive security scan. Rejects the ENTIRE operation (throws) the moment
 * any prohibited field name is found at any nesting depth. Never mutates,
 * never strips — rejection only.
 */
function validateSecurity(value, pathStack) {
  pathStack = pathStack || [];

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      validateSecurity(value[i], pathStack.concat(`[${i}]`));
    }
    return;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    for (const key of keys) {
      const normalized = normalizeKey(key);
      if (PROHIBITED_FIELD_SET.has(normalized)) {
        throw new CozyNetworkSecurityError(
          `Security rejection: prohibited field "${key}" found at path "${pathStack
            .concat(key)
            .join('.')}". Operation aborted; no partial registration occurred.`,
          { field: key, path: pathStack.concat(key).join('.') }
        );
      }
      validateSecurity(value[key], pathStack.concat(key));
    }
  }
}

/** Deep clone via structuredClone when available, JSON fallback otherwise. */
function deepClone(value) {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (e) {
      // fall through to JSON strategy for non-structured-cloneable values
    }
  }
  return JSON.parse(JSON.stringify(value));
}

/** Recursive deep freeze. Used only on values about to leave the kernel. */
function deepFreeze(value) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return value;
  }
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  const props = Object.getOwnPropertyNames(value);
  for (const prop of props) {
    const child = value[prop];
    if (child !== null && (typeof child === 'object' || typeof child === 'function')) {
      deepFreeze(child);
    }
  }
  return value;
}

function frozenClone(value) {
  return deepFreeze(deepClone(value));
}

/**
 * Stamp / advance Offline Sync Metadata on an entity.
 * On first registration: sets localId, globalId, syncState, conflictState,
 * version=1, createdOffline, lastModified.
 * On update (existing record passed in): preserves localId/globalId,
 * increments version, refreshes lastModified, sets syncState to 'modified'.
 */
function stampOfflineSyncMetadata(entity, existing) {
  const stamped = Object.assign({}, entity);
  if (existing) {
    stamped.localId = existing.localId;
    stamped.globalId =
      stamped.globalId !== undefined ? stamped.globalId : existing.globalId;
    stamped.conflictState = stamped.conflictState || existing.conflictState || 'none';
    stamped.version = (existing.version || 1) + 1;
    stamped.createdOffline = existing.createdOffline;
    stamped.syncState = stamped.syncState || 'modified';
    stamped.lastModified = nowISO();
  } else {
    stamped.localId = stamped.localId || generateId('local');
    stamped.globalId = stamped.globalId !== undefined ? stamped.globalId : null;
    stamped.syncState = stamped.syncState || 'pending';
    stamped.conflictState = stamped.conflictState || 'none';
    stamped.version = 1;
    stamped.createdOffline = stamped.createdOffline !== undefined ? stamped.createdOffline : true;
    stamped.lastModified = nowISO();
  }
  return stamped;
}

/* ============================================================================
 * SECTION 4: EVENT BUS (fault isolated)
 * ==========================================================================*/

class CozyEventBus {
  constructor() {
    this._listeners = new Map(); // eventName -> Set<{ fn, once }>
  }

  on(eventName, fn) {
    if (typeof fn !== 'function') {
      throw new CozyNetworkValidationError('EventBus.on requires a function listener.');
    }
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    const record = { fn, once: false };
    this._listeners.get(eventName).add(record);
    return () => this._listeners.get(eventName)?.delete(record);
  }

  once(eventName, fn) {
    if (typeof fn !== 'function') {
      throw new CozyNetworkValidationError('EventBus.once requires a function listener.');
    }
    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, new Set());
    }
    const record = { fn, once: true };
    this._listeners.get(eventName).add(record);
    return () => this._listeners.get(eventName)?.delete(record);
  }

  off(eventName, fn) {
    const set = this._listeners.get(eventName);
    if (!set) return false;
    let removed = false;
    for (const record of set) {
      if (record.fn === fn) {
        set.delete(record);
        removed = true;
      }
    }
    return removed;
  }

  emit(eventName, payload) {
    const set = this._listeners.get(eventName);
    if (!set || set.size === 0) return 0;
    let delivered = 0;
    const frozenPayload = frozenClone(payload);
    for (const record of Array.from(set)) {
      try {
        record.fn(frozenPayload);
        delivered += 1;
      } catch (err) {
        // Fault isolation: one listener throwing never breaks the bus or
        // other listeners. Failures are swallowed at the boundary and
        // surfaced only via a dedicated 'eventBus:error' event.
        this._safeEmitError(eventName, err);
      } finally {
        if (record.once) set.delete(record);
      }
    }
    return delivered;
  }

  _safeEmitError(sourceEvent, err) {
    const set = this._listeners.get('eventBus:error');
    if (!set) return;
    for (const record of Array.from(set)) {
      try {
        record.fn({
          sourceEvent,
          message: err && err.message,
          timestamp: nowISO(),
        });
      } catch (_) {
        // never allow error-handling itself to throw
      }
    }
  }

  listenerCount(eventName) {
    const set = this._listeners.get(eventName);
    return set ? set.size : 0;
  }
}

/* ============================================================================
 * SECTION 5: TIMELINE (append-only, never editable)
 * ==========================================================================*/

class CozyTimeline {
  constructor() {
    this._entries = [];
  }

  append(entry) {
    const record = Object.freeze(
      Object.assign({}, deepClone(entry), {
        id: generateId('tl'),
        timestamp: nowISO(),
      })
    );
    this._entries.push(record);
    return frozenClone(record);
  }

  list(predicate) {
    const items = typeof predicate === 'function' ? this._entries.filter(predicate) : this._entries;
    return frozenClone(items);
  }

  count() {
    return this._entries.length;
  }
}

/* ============================================================================
 * SECTION 6: AUDIT REGISTRY (every mutation logged, append-only)
 * ==========================================================================*/

class CozyAuditRegistry {
  constructor(timeline) {
    this._entries = [];
    this._timeline = timeline;
  }

  logMutation(registryName, operation, entityId, details) {
    const record = Object.freeze({
      id: generateId('audit'),
      registryName,
      operation,
      entityId: entityId !== undefined ? String(entityId) : null,
      details: deepClone(details) || null,
      timestamp: nowISO(),
    });
    this._entries.push(record);
    if (this._timeline) {
      this._timeline.append({
        type: 'audit',
        registryName,
        operation,
        entityId: record.entityId,
      });
    }
    return frozenClone(record);
  }

  list(predicate) {
    const items = typeof predicate === 'function' ? this._entries.filter(predicate) : this._entries;
    return frozenClone(items);
  }

  count() {
    return this._entries.length;
  }
}

/* ============================================================================
 * SECTION 7: GENERIC ENTERPRISE REGISTRY FACTORY
 * ==========================================================================*/

/**
 * Creates a standard CozyOS enterprise registry implementing the
 * register/remove/get/list/has/count contract, with recursive security
 * validation, offline-sync metadata stamping, append-only audit + timeline
 * logging, event emission, and deep-frozen outbound values.
 *
 * options.idField          - property name used as the registry key (default "id")
 * options.validate(entity)  - optional extra synchronous validator; should throw
 *                              CozyNetworkValidationError on failure
 * options.applySyncMetadata - whether to stamp offline sync metadata (default true)
 */
function createRegistry(name, deps, options) {
  options = options || {};
  const idField = options.idField || 'id';
  const applySyncMetadata = options.applySyncMetadata !== false;
  const extraValidate = typeof options.validate === 'function' ? options.validate : null;

  const store = new Map();

  function register(entity) {
    if (!isPlainObject(entity)) {
      throw new CozyNetworkValidationError(
        `${name}.register requires a plain object entity.`
      );
    }

    // Security Choke Point: recursive, whole-operation rejection.
    validateSecurity(entity, [name]);

    if (extraValidate) extraValidate(entity);

    let id = entity[idField];
    const existing = id !== undefined && id !== null ? store.get(id) : undefined;

    let toStore = deepClone(entity);
    if (applySyncMetadata) {
      toStore = stampOfflineSyncMetadata(toStore, existing);
    }

    if (!toStore[idField]) {
      toStore[idField] = generateId(name);
    }
    id = toStore[idField];

    store.set(id, toStore);

    deps.audit.logMutation(name, existing ? 'update' : 'create', id, { idField });
    deps.eventBus.emit(`${name}:registered`, toStore);

    return frozenClone(toStore);
  }

  function remove(id) {
    if (!store.has(id)) return false;
    store.delete(id);
    deps.audit.logMutation(name, 'remove', id, {});
    deps.eventBus.emit(`${name}:removed`, { [idField]: id });
    return true;
  }

  function get(id) {
    if (!store.has(id)) return null;
    return frozenClone(store.get(id));
  }

  function list(predicate) {
    const all = Array.from(store.values());
    const filtered = typeof predicate === 'function' ? all.filter(predicate) : all;
    return frozenClone(filtered);
  }

  function has(id) {
    return store.has(id);
  }

  function count() {
    return store.size;
  }

  return { name, register, remove, get, list, has, count };
}

/* ============================================================================
 * SECTION 8: NETWORK SESSION REGISTRY (extended lifecycle)
 * ==========================================================================*/

function createSessionRegistry(deps) {
  const base = createRegistry('sessionRegistry', deps, {
    idField: 'sessionId',
    validate(entity) {
      if (entity.state && !Object.values(SESSION_STATES).includes(entity.state)) {
        throw new CozyNetworkValidationError(
          `sessionRegistry: invalid state "${entity.state}".`
        );
      }
    },
  });

  function requireSession(sessionId) {
    if (!base.has(sessionId)) {
      throw new CozyNetworkNotFoundError(
        `sessionRegistry: no session found with id "${sessionId}".`
      );
    }
    return base.get(sessionId);
  }

  function transition(sessionId, toState) {
    const session = requireSession(sessionId);
    const fromState = session.state || SESSION_STATES.CREATED;
    const allowed = SESSION_TRANSITIONS[fromState] || new Set();
    if (!allowed.has(toState)) {
      throw new CozyNetworkStateError(
        `sessionRegistry: illegal transition "${fromState}" -> "${toState}" for session "${sessionId}".`,
        { sessionId, fromState, toState }
      );
    }
    const updated = Object.assign({}, session, {
      sessionId,
      state: toState,
      lastTransitionAt: nowISO(),
    });
    return base.register(updated);
  }

  function create(sessionData) {
    const entity = Object.assign({}, sessionData, {
      state: SESSION_STATES.CREATED,
      createdAt: nowISO(),
    });
    return base.register(entity);
  }

  function start(sessionId) {
    return transition(sessionId, SESSION_STATES.ACTIVE);
  }

  function pause(sessionId) {
    return transition(sessionId, SESSION_STATES.PAUSED);
  }

  function resume(sessionId) {
    return transition(sessionId, SESSION_STATES.ACTIVE);
  }

  function stop(sessionId) {
    return transition(sessionId, SESSION_STATES.STOPPED);
  }

  function archive(sessionId) {
    return transition(sessionId, SESSION_STATES.ARCHIVED);
  }

  function export_(sessionId) {
    const session = requireSession(sessionId);
    deps.audit.logMutation('sessionRegistry', 'export', sessionId, {});
    return frozenClone({
      exportedAt: nowISO(),
      kernelVersion: KERNEL_VERSION,
      session,
    });
  }

  /**
   * Merge-only import: never overwrites an existing record, never creates
   * duplicates. Returns a report describing what was imported vs skipped.
   */
  function import_(payload) {
    if (!isPlainObject(payload) || !isPlainObject(payload.session)) {
      throw new CozyNetworkValidationError(
        'sessionRegistry.import_ requires a payload of shape { session }.'
      );
    }
    const incoming = payload.session;
    const sessionId = incoming.sessionId;
    if (sessionId && base.has(sessionId)) {
      return frozenClone({
        imported: false,
        reason: 'ALREADY_EXISTS',
        sessionId,
      });
    }
    const registered = base.register(incoming);
    return frozenClone({
      imported: true,
      sessionId: registered.sessionId,
    });
  }

  return Object.assign({}, base, {
    create,
    start,
    pause,
    resume,
    stop,
    archive,
    export: export_,
    import: import_,
  });
}

/* ============================================================================
 * SECTION 9: CLOSED INTEGRATION REGISTRY (allowlist enforced)
 * ==========================================================================*/

function createClosedIntegrationRegistry(deps) {
  return createRegistry('closedIntegrationRegistry', deps, {
    idField: 'name',
    validate(entity) {
      if (!entity.name || !KNOWN_INTEGRATION_SET.has(entity.name)) {
        throw new CozyNetworkValidationError(
          `closedIntegrationRegistry: "${entity.name}" is not a known CozyOS integration.`,
          { allowed: KNOWN_INTEGRATIONS }
        );
      }
    },
  });
}

/* ============================================================================
 * SECTION 10: CONNECTION REGISTRY (runtime coordination records only)
 * ==========================================================================*/

function createConnectionRegistry(deps) {
  return createRegistry('connectionRegistry', deps, {
    idField: 'connectionId',
    validate(entity) {
      if (!entity.transport) {
        throw new CozyNetworkValidationError(
          'connectionRegistry: entity requires a "transport" field.'
        );
      }
      if (!entity.deviceId && !entity.peerId) {
        throw new CozyNetworkValidationError(
          'connectionRegistry: entity requires a "deviceId" or "peerId" field.'
        );
      }
    },
  });
}

/* ============================================================================
 * SECTION 11: OFFLINE QUEUE REGISTRY (status-constrained)
 * ==========================================================================*/

function createOfflineQueueRegistry(deps) {
  return createRegistry('offlineQueueRegistry', deps, {
    idField: 'queueItemId',
    validate(entity) {
      if (entity.status && !OFFLINE_QUEUE_STATES.includes(entity.status)) {
        throw new CozyNetworkValidationError(
          `offlineQueueRegistry: invalid status "${entity.status}".`,
          { allowed: OFFLINE_QUEUE_STATES }
        );
      }
    },
  });
}

/* ============================================================================
 * SECTION 12: KERNEL FACTORY
 * ==========================================================================*/

// Global registry of kernel instances by name, used solely to implement the
// kernel-level VERSION_CONFLICT / hot-reload behavior (decision #2). This is
// bookkeeping about the kernel module itself, not about networking.
const __KERNEL_GLOBAL_REGISTRY_KEY = '__CozyOS_Kernel_Registry__';

function getGlobalKernelRegistry() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  if (!g[__KERNEL_GLOBAL_REGISTRY_KEY]) {
    g[__KERNEL_GLOBAL_REGISTRY_KEY] = new Map();
  }
  return g[__KERNEL_GLOBAL_REGISTRY_KEY];
}

/**
 * Registers this kernel instance globally by name+version.
 * - No prior registration: proceeds normally.
 * - Same name + same version already registered: hot-reload silently
 *   (existing reference is replaced with the new instance).
 * - Same name + different version already registered: throws
 *   CozyNetworkVersionConflictError.
 */
function registerKernelGlobally(instance) {
  const registry = getGlobalKernelRegistry();
  const existing = registry.get(KERNEL_NAME);
  if (existing && existing.version !== KERNEL_VERSION) {
    throw new CozyNetworkVersionConflictError(
      `VERSION_CONFLICT: ${KERNEL_NAME} is already registered at version ` +
        `"${existing.version}"; refusing to register version "${KERNEL_VERSION}". ` +
        `Different kernel versions cannot coexist.`,
      { existingVersion: existing.version, incomingVersion: KERNEL_VERSION }
    );
  }
  // Either no prior registration, or identical version -> hot-reload silently.
  registry.set(KERNEL_NAME, { version: KERNEL_VERSION, instance });
}

/**
 * Builds and returns a fully wired CozyNetwork kernel instance. The returned
 * public API object is deep-frozen after all registries are constructed and
 * wired (Public API Freeze, decision #1). Registries referenced from the
 * frozen object remain internally mutable via their own register()/remove()
 * closures, since freezing the outer object only prevents replacing or
 * adding top-level kernel properties/methods — it does not touch the Maps
 * closed over inside each registry.
 */
function createCozyNetwork() {
  const timeline = new CozyTimeline();
  const audit = new CozyAuditRegistry(timeline);
  const eventBus = new CozyEventBus();
  const deps = { audit, eventBus, timeline };

  const registries = {
    sessionRegistry: createSessionRegistry(deps),
    deviceRegistry: createRegistry('deviceRegistry', deps, { idField: 'deviceId' }),
    peerRegistry: createRegistry('peerRegistry', deps, { idField: 'peerId' }),
    nodeRegistry: createRegistry('nodeRegistry', deps, { idField: 'nodeId' }),
    connectionRegistry: createConnectionRegistry(deps),
    transportRegistry: createRegistry('transportRegistry', deps, { idField: 'transportId' }),
    routeRegistry: createRegistry('routeRegistry', deps, { idField: 'routeId' }),
    serviceRegistry: createRegistry('serviceRegistry', deps, { idField: 'serviceId' }),
    discoveryRegistry: createRegistry('discoveryRegistry', deps, { idField: 'discoveryId' }),
    synchronizationRegistry: createRegistry('synchronizationRegistry', deps, {
      idField: 'syncRequestId',
    }),
    offlineQueueRegistry: createOfflineQueueRegistry(deps),
    networkHealthRegistry: createRegistry('networkHealthRegistry', deps, {
      idField: 'healthRecordId',
    }),
    networkZoneRegistry: createRegistry('networkZoneRegistry', deps, { idField: 'zoneId' }),
    gatewayRegistry: createRegistry('gatewayRegistry', deps, { idField: 'gatewayId' }),
    bridgeRegistry: createRegistry('bridgeRegistry', deps, { idField: 'bridgeId' }),
    adapterRegistry: createRegistry('adapterRegistry', deps, { idField: 'adapterId' }),
    pluginRegistry: createRegistry('pluginRegistry', deps, { idField: 'pluginId' }),
    closedIntegrationRegistry: createClosedIntegrationRegistry(deps),
  };

  function getDiagnostics() {
    const registryCounts = {};
    for (const [key, reg] of Object.entries(registries)) {
      registryCounts[key] = reg.count();
    }
    return frozenClone({
      kernel: KERNEL_NAME,
      version: KERNEL_VERSION,
      generatedAt: nowISO(),
      registryCounts,
      sessionCount: registries.sessionRegistry.count(),
      connectionCount: registries.connectionRegistry.count(),
      timelineEntryCount: timeline.count(),
      auditEntryCount: audit.count(),
    });
  }

  const api = {
    kernelName: KERNEL_NAME,
    kernelVersion: KERNEL_VERSION,

    // Registries
    sessionRegistry: registries.sessionRegistry,
    deviceRegistry: registries.deviceRegistry,
    peerRegistry: registries.peerRegistry,
    nodeRegistry: registries.nodeRegistry,
    connectionRegistry: registries.connectionRegistry,
    transportRegistry: registries.transportRegistry,
    routeRegistry: registries.routeRegistry,
    serviceRegistry: registries.serviceRegistry,
    discoveryRegistry: registries.discoveryRegistry,
    synchronizationRegistry: registries.synchronizationRegistry,
    offlineQueueRegistry: registries.offlineQueueRegistry,
    networkHealthRegistry: registries.networkHealthRegistry,
    networkZoneRegistry: registries.networkZoneRegistry,
    gatewayRegistry: registries.gatewayRegistry,
    bridgeRegistry: registries.bridgeRegistry,
    adapterRegistry: registries.adapterRegistry,
    pluginRegistry: registries.pluginRegistry,
    closedIntegrationRegistry: registries.closedIntegrationRegistry,

    // Cross-cutting subsystems
    eventBus,
    timeline: {
      list: (predicate) => timeline.list(predicate),
      count: () => timeline.count(),
    },
    audit: {
      list: (predicate) => audit.list(predicate),
      count: () => audit.count(),
    },

    // Diagnostics
    getDiagnostics,
  };

  registerKernelGlobally(api);

  timeline.append({ type: 'kernel', event: 'initialized', version: KERNEL_VERSION });

  // Public API Freeze (decision #1): freeze the top-level kernel surface
  // after all registries/subsystems are wired and registered.
  return deepFreezeShallowStructure(api);
}

/**
 * Freezes the kernel's own top-level object and each named registry's
 * method-holder object, WITHOUT attempting to freeze internal Maps (which
 * are private closure state, inaccessible from outside anyway). This
 * satisfies "freeze the public API surface" while keeping registries able
 * to accept new entries via their still-callable register() methods.
 */
function deepFreezeShallowStructure(api) {
  for (const key of Object.keys(api)) {
    const value = api[key];
    if (value && typeof value === 'object' && !(value instanceof CozyEventBus)) {
      Object.freeze(value);
    }
  }
  Object.freeze(api);
  return api;
}

/* ============================================================================
 * SECTION 13: EXPORTS
 * ==========================================================================*/

const CozyNetwork = createCozyNetwork();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CozyNetwork,
    createCozyNetwork,
    KERNEL_VERSION,
    CozyNetworkError,
    CozyNetworkSecurityError,
    CozyNetworkValidationError,
    CozyNetworkNotFoundError,
    CozyNetworkStateError,
    CozyNetworkVersionConflictError,
  };
}

if (typeof globalThis !== 'undefined') {
  globalThis.CozyNetwork = CozyNetwork;
}
