/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Enterprise Coordination Kernel — CozyCamera
 * core/modules/camera/cozy-camera.js
 * Version: 1.0.0-ENTERPRISE-FROZEN
 * ══════════════════════════════════════════════════════════════
 *
 * ROLE: Coordinator / Registry / Lifecycle Manager / Session
 * Manager / Device Coordinator / Storage Coordinator / Pipeline
 * Coordinator / Timeline Manager / Diagnostics Provider / Event
 * Coordinator / Bookkeeper for every camera-related entity in
 * CozyOS.
 *
 * THIS MODULE NEVER: drives a camera (no Browser Camera API, no
 * Android Camera API, no CameraX, no OpenCV), processes or
 * enhances images/video, performs face/object detection, OCR,
 * barcode/QR reading, AI vision, motion detection, editing,
 * filtering, HDR/exposure computation, compression, encoding,
 * decoding, streaming, or hardware control. All of that belongs
 * exclusively to registered adapters — this file stores adapter
 * DESCRIPTORS and never invokes them.
 *
 * ARCHITECTURE: mirrors CozyMedia / CozyStorage / CozySpeech /
 * CozyTranslate exactly — same generic registry factory, same
 * REGISTRY RESULT shape, same fault-isolated event bus, same
 * security choke point pattern, same merge-only import semantics.
 *
 * FLAGGED NEW CONTRACTS (not specified upstream — parallel to the
 * Architecture Review process used for prior CozyOS kernels):
 *   - REGISTRY RESULT shape reused from CozyMedia/OCRLanguage
 *     precedent for cross-module consistency.
 *   - Generic registry factory (_createRegistry) backs every flat
 *     "coordinate only" registry (camera types, devices, lenses,
 *     resolutions, frame rates, capture profiles, sources,
 *     destinations, storage, recordings, snapshots, streams,
 *     capture pipelines, playback, outputs, permissions, device
 *     health, adapters, plugins, integrations). Cameras and
 *     Sessions get bespoke wrappers (registerCamera/*Session*)
 *     because they carry status-transition and auto-type-
 *     registration semantics that don't fit a flat registry.
 *   - Offline-sync fields use the exact names the directive
 *     listed (localId, globalId, syncState, conflictState,
 *     version, lastModified, createdOffline); createdAt is kept
 *     alongside as an additive, non-conflicting extra field.
 *   - importKernelStateSnapshot() is merge-only / non-destructive
 *     (existing IDs are never overwritten) — CONFIRMED by design
 *     sign-off: this matches the established behavior in
 *     CozyStorage, CozySpeech, CozyTranslate, and CozyMedia, and is
 *     the safer default for an offline-first kernel where multiple
 *     devices or offline changes may need to synchronize. "Full
 *     fidelity" (item 27) means export/import round-trips every
 *     registry without omitting anything — it does NOT mean import
 *     may overwrite existing state. If a full-replace import is
 *     ever needed, it should be added as a separate, explicitly-
 *     named API (e.g. restoreKernelSnapshot() /
 *     replaceKernelStateSnapshot()), leaving
 *     importKernelStateSnapshot() as the safe, permanent default.
 *   - Security choke point rejects both the directive's named key
 *     patterns AND any function-typed value at any nesting level,
 *     since executable values must never enter a registry in the
 *     first place.
 *   - Version Conflict Protection is implemented as a module-load-
 *     time check: if `window.CozyOS.Camera` already exists with a
 *     different reported version, this file throws a
 *     CozyCameraError('VERSION_CONFLICT', ...) and does not
 *     replace the existing kernel. If the existing instance
 *     reports the SAME version, this file performs a silent,
 *     state-preserving no-op (hot reload) and leaves the original
 *     instance untouched rather than re-initializing empty
 *     registries over live data.
 *
 * DESIGN: ES2022, strict mode, CSP compliant, no eval/timers/
 * console output, no fetch/XHR/localStorage/sessionStorage, no
 * OS permission requests, deep-frozen public returns, defensive
 * deep-cloned inputs, immutable registries.
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  const VERSION = '1.0.0';

  // ── Enterprise error type (used ONLY for version conflicts —
  //    every runtime API call instead returns a REGISTRY RESULT) ──

  function CozyCameraError(code, message) {
    const err = new Error(message);
    err.name = 'CozyCameraError';
    err.code = code;
    return err;
  }

  // ── Version Conflict Protection / Hot Reload Safety ─────────────────
  // Only one version of CozyCamera may exist. A same-version re-load
  // (hot reload) is a safe no-op that preserves existing state. A
  // different-version re-load is an enterprise error: it must never
  // silently replace a live kernel with a different implementation.

  if (window.CozyOS.Camera && typeof window.CozyOS.Camera.getVersion === 'function') {
    const existingVersion = window.CozyOS.Camera.getVersion();
    if (existingVersion !== VERSION) {
      throw new CozyCameraError(
        'VERSION_CONFLICT',
        'CozyCamera version conflict: an existing instance reports v' + existingVersion +
        ', but this load is v' + VERSION + '. Only one version of CozyCamera may exist at a time.'
      );
    }
    // Same version — hot reload is allowed. Leave the existing, live
    // instance untouched and do not re-initialize over its state.
    return;
  }

  // ── Security choke point ────────────────────────────────────────────

  const FORBIDDEN_KEY_PATTERNS = [
    /password/i, /token/i, /secret/i, /certificate/i, /private[_-]?key/i,
    /biometric/i, /fingerprint/i, /faceprint/i, /api[_-]?key/i, /jwt/i,
  ];

  function _violatesSecurityPolicy(value, path) {
    path = path || '';
    if (typeof value === 'function') return path || '(root)';
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const hit = _violatesSecurityPolicy(value[i], path + '[' + i + ']');
        if (hit) return hit;
      }
      return null;
    }
    if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (FORBIDDEN_KEY_PATTERNS.some(function (p) { return p.test(key); })) {
          return path + '.' + key;
        }
        const hit = _violatesSecurityPolicy(value[key], path + '.' + key);
        if (hit) return hit;
      }
      return null;
    }
    return null;
  }

  // ── Structural helpers ───────────────────────────────────────────────

  function _deepClone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function _deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) { _deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  function _now() { return Date.now(); }

  function _genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  /**
   * Every mutating public method returns exactly this frozen shape.
   * @typedef {Object} RegistryResult
   * @property {string} operation
   * @property {string} entity
   * @property {boolean} success
   * @property {?string} reason
   * @property {number} timestamp
   * @property {*} [data]
   */
  function _buildResult(operation, entity, success, reason, data) {
    const out = { operation: operation, entity: entity, success: success, reason: reason || null, timestamp: _now() };
    if (data !== undefined) out.data = data;
    return Object.freeze(out);
  }

  // ── Event Bus (fault-isolated: one listener must never break another) ──

  const _listeners = new Map(); // event -> Set<fn>
  let _eventCount = 0;

  /** @param {string} event @param {function} fn */
  function on(event, fn) {
    if (typeof event !== 'string' || typeof fn !== 'function') {
      return _buildResult('on', 'eventBus', false, 'event must be a string and fn must be a function.');
    }
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(fn);
    return _buildResult('on', 'eventBus', true, null, { event: event });
  }

  /** @param {string} event @param {function} fn */
  function off(event, fn) {
    if (!_listeners.has(event)) return _buildResult('off', 'eventBus', false, 'no listeners for event.');
    const removed = _listeners.get(event).delete(fn);
    return _buildResult('off', 'eventBus', removed, removed ? null : 'listener not found.');
  }

  /** @param {string} event @param {function} fn */
  function once(event, fn) {
    if (typeof event !== 'string' || typeof fn !== 'function') {
      return _buildResult('once', 'eventBus', false, 'event must be a string and fn must be a function.');
    }
    const wrapper = function (payload) { off(event, wrapper); fn(payload); };
    return on(event, wrapper);
  }

  /** @param {string} event @param {Object} payload */
  function emit(event, payload) {
    _eventCount += 1;
    const frozenPayload = Object.freeze(Object.assign({}, payload, { event: event, timestamp: _now() }));
    const set = _listeners.get(event);
    if (!set) return;
    Array.from(set).forEach(function (fn) {
      try { fn(frozenPayload); } catch (e) { /* one bad listener must never break the bus */ }
    });
  }

  function getEventCount() { return _eventCount; }

  // ── Timeline Registry (append-only) ─────────────────────────────────

  const _timeline = [];

  /** @param {string} type @param {Object} [payload] @returns {RegistryResult} */
  function logTimelineEvent(type, payload) {
    if (typeof type !== 'string' || type.trim().length === 0) {
      return _buildResult('logTimelineEvent', 'timeline', false, 'type must be a non-empty string.');
    }
    const violation = _violatesSecurityPolicy(payload || {});
    if (violation) {
      return _buildResult('logTimelineEvent', 'timeline', false, 'payload rejected at security choke point: ' + violation);
    }
    const entry = Object.freeze({ id: _genId('tl'), type: type, payload: _deepFreeze(_deepClone(payload || {})), timestamp: _now() });
    _timeline.push(entry);
    emit('timeline:entry', { id: entry.id, type: type });
    return _buildResult('logTimelineEvent', 'timeline', true, null, { id: entry.id });
  }

  /** @param {Object} [filters] @returns {ReadonlyArray<Object>} */
  function getTimeline(filters) {
    filters = filters || {};
    let entries = _timeline.slice();
    if (typeof filters.type === 'string') entries = entries.filter(function (e) { return e.type === filters.type; });
    if (typeof filters.since === 'number') entries = entries.filter(function (e) { return e.timestamp >= filters.since; });
    if (typeof filters.limit === 'number') entries = entries.slice(-filters.limit);
    return Object.freeze(entries.slice());
  }

  function getTimelineCount() { return _timeline.length; }

  // ── Event Graph Registry (nodes / edges / relationships, coordinator only) ──

  const _graphEdges = new Map(); // fromNodeId -> Map<toNodeId, relation>

  function addGraphEdge(fromNodeId, toNodeId, relation) {
    if (typeof fromNodeId !== 'string' || typeof toNodeId !== 'string') {
      return _buildResult('addGraphEdge', 'eventGraph', false, 'fromNodeId and toNodeId must be strings.');
    }
    if (!_graphEdges.has(fromNodeId)) _graphEdges.set(fromNodeId, new Map());
    _graphEdges.get(fromNodeId).set(toNodeId, relation || 'related');
    emit('graph:edge', { from: fromNodeId, to: toNodeId, relation: relation || 'related' });
    return _buildResult('addGraphEdge', 'eventGraph', true, null, { from: fromNodeId, to: toNodeId });
  }

  function removeGraphEdge(fromNodeId, toNodeId) {
    if (!_graphEdges.has(fromNodeId) || !_graphEdges.get(fromNodeId).has(toNodeId)) {
      return _buildResult('removeGraphEdge', 'eventGraph', false, 'edge does not exist.');
    }
    _graphEdges.get(fromNodeId).delete(toNodeId);
    emit('graph:edgeRemoved', { from: fromNodeId, to: toNodeId });
    return _buildResult('removeGraphEdge', 'eventGraph', true, null);
  }

  function getGraphNeighbors(nodeId) {
    if (!_graphEdges.has(nodeId)) return Object.freeze([]);
    const out = [];
    _graphEdges.get(nodeId).forEach(function (relation, toNodeId) { out.push(Object.freeze({ to: toNodeId, relation: relation })); });
    return Object.freeze(out);
  }

  function hasGraphEdge(fromNodeId, toNodeId) {
    return _graphEdges.has(fromNodeId) && _graphEdges.get(fromNodeId).has(toNodeId);
  }

  function getGraphEdgeCount() {
    let total = 0;
    _graphEdges.forEach(function (m) { total += m.size; });
    return total;
  }

  // ── Generic registry factory ────────────────────────────────────────
  // Backs every flat "coordinate only, metadata only" registry with an
  // identical register/unregister/update/get/list/has/count contract,
  // and stamps the exact offline-sync fields the directive requires.

  function _createRegistry(entityName) {
    const _store = new Map();

    /** @param {Object} descriptor @returns {RegistryResult} */
    function register(descriptor) {
      if (!descriptor || typeof descriptor !== 'object') {
        return _buildResult('register', entityName, false, 'descriptor must be an object.');
      }
      const violation = _violatesSecurityPolicy(descriptor);
      if (violation) {
        return _buildResult('register', entityName, false, 'descriptor rejected at security choke point: ' + violation);
      }
      const id = typeof descriptor.id === 'string' && descriptor.id.length > 0 ? descriptor.id : _genId(entityName);
      if (_store.has(id)) {
        return _buildResult('register', entityName, false, 'id "' + id + '" is already registered in ' + entityName + '.');
      }
      const clone = _deepClone(descriptor);
      delete clone.id;
      const entry = Object.assign({}, clone, {
        id: id,
        localId: typeof descriptor.localId === 'string' ? descriptor.localId : id,
        globalId: typeof descriptor.globalId === 'string' ? descriptor.globalId : null,
        syncState: typeof descriptor.syncState === 'string' ? descriptor.syncState : 'local',
        conflictState: typeof descriptor.conflictState === 'string' ? descriptor.conflictState : 'none',
        version: typeof descriptor.version === 'number' ? descriptor.version : 1,
        createdOffline: descriptor.createdOffline === true,
        createdAt: _now(),
        lastModified: _now(),
      });
      _store.set(id, entry);
      emit(entityName + ':register', { id: id });
      return _buildResult('register', entityName, true, null, { id: id });
    }

    /** @param {string} id @returns {RegistryResult} */
    function unregister(id) {
      if (typeof id !== 'string' || !_store.has(id)) {
        return _buildResult('unregister', entityName, false, 'id "' + id + '" is not registered in ' + entityName + '.');
      }
      _store.delete(id);
      emit(entityName + ':unregister', { id: id });
      return _buildResult('unregister', entityName, true, null);
    }

    /** @param {string} id @param {Object} updates @returns {RegistryResult} */
    function update(id, updates) {
      if (typeof id !== 'string' || !_store.has(id)) {
        return _buildResult('update', entityName, false, 'id "' + id + '" is not registered in ' + entityName + '.');
      }
      if (!updates || typeof updates !== 'object') {
        return _buildResult('update', entityName, false, 'updates must be an object.');
      }
      const violation = _violatesSecurityPolicy(updates);
      if (violation) {
        return _buildResult('update', entityName, false, 'updates rejected at security choke point: ' + violation);
      }
      const existing = _store.get(id);
      const merged = Object.assign({}, existing, _deepClone(updates), {
        id: existing.id,
        createdAt: existing.createdAt,
        version: existing.version + 1,
        lastModified: _now(),
      });
      _store.set(id, merged);
      emit(entityName + ':update', { id: id });
      return _buildResult('update', entityName, true, null, { id: id });
    }

    /** @param {string} id @returns {?Object} */
    function get(id) {
      if (typeof id !== 'string' || !_store.has(id)) return null;
      return _deepFreeze(_deepClone(_store.get(id)));
    }

    /** @returns {ReadonlyArray<Object>} */
    function list() {
      return Object.freeze(Array.from(_store.values()).map(function (e) { return _deepFreeze(_deepClone(e)); }));
    }

    function has(id) { return typeof id === 'string' && _store.has(id); }
    function count() { return _store.size; }

    // Internal-only (export snapshot / diagnostics / import merge) — not part of the public API.
    function _rawSnapshot() { return Array.from(_store.values()).map(function (e) { return _deepClone(e); }); }
    function _rawImport(entries) {
      let imported = 0;
      entries.forEach(function (entry) {
        if (entry && typeof entry.id === 'string' && !_store.has(entry.id)) {
          _store.set(entry.id, entry);
          imported += 1;
        }
      });
      return imported;
    }
    function _rawSyncStates() { return Array.from(_store.values()).map(function (e) { return e.syncState; }); }

    return Object.freeze({
      register: register, unregister: unregister, update: update,
      get: get, list: list, has: has, count: count,
      _rawSnapshot: _rawSnapshot, _rawImport: _rawImport, _rawSyncStates: _rawSyncStates,
    });
  }

  // ── Flat coordinate-only registries (items 3–19, 22–24) ─────────────

  const CameraTypes = _createRegistry('cameraType');
  const Devices = _createRegistry('device');
  const Lenses = _createRegistry('lens');
  const Resolutions = _createRegistry('resolution');
  const FrameRates = _createRegistry('frameRate');
  const CaptureProfiles = _createRegistry('captureProfile');
  const Sources = _createRegistry('source');
  const Destinations = _createRegistry('destination');
  const Storage = _createRegistry('storage');
  const Recordings = _createRegistry('recording');
  const Snapshots = _createRegistry('snapshot');
  const Streams = _createRegistry('stream');
  const CapturePipelines = _createRegistry('capturePipeline');
  const Playback = _createRegistry('playback');
  const Outputs = _createRegistry('output');
  const Permissions = _createRegistry('permission');
  const DeviceHealth = _createRegistry('deviceHealth');
  const Adapters = _createRegistry('adapter');
  const Plugins = _createRegistry('plugin');
  const Integrations = _createRegistry('integration');

  // ── Camera Registry (item 2) — explicit named CRUD + auto camera-type
  //    registration, since "future types work automatically" (item 3) ──

  const _cameras = _createRegistry('camera');

  /** @param {Object} descriptor @returns {RegistryResult} */
  function registerCamera(descriptor) {
    if (descriptor && typeof descriptor.type === 'string' && descriptor.type.trim().length > 0 && !CameraTypes.has(descriptor.type)) {
      CameraTypes.register({ id: descriptor.type, label: descriptor.type });
    }
    const outcome = _cameras.register(descriptor);
    if (outcome.success) logTimelineEvent('camera:register', { cameraId: outcome.data.id });
    return outcome;
  }

  function removeCamera(id) {
    const outcome = _cameras.unregister(id);
    if (outcome.success) {
      logTimelineEvent('camera:remove', { cameraId: id });
      emit('camera:remove', { id: id });
    }
    return outcome;
  }

  function updateCamera(id, updates) { return _cameras.update(id, updates); }
  function getCamera(id) { return _cameras.get(id); }
  function listCameras() { return _cameras.list(); }
  function hasCamera(id) { return _cameras.has(id); }
  function countCameras() { return _cameras.count(); }

  // ── Camera Session Lifecycle (item 1) ────────────────────────────────

  const _sessions = new Map(); // sessionId -> session record (status-bearing, not a flat registry)

  const SESSION_TRANSITIONS = Object.freeze({
    created: Object.freeze(['active']),
    active: Object.freeze(['paused', 'stopped']),
    paused: Object.freeze(['active', 'stopped']),
    stopped: Object.freeze(['ended']),
    ended: Object.freeze(['archived']),
    archived: Object.freeze([]),
  });

  /** @param {Object} descriptor @returns {RegistryResult} */
  function createSession(descriptor) {
    const op = 'createSession';
    if (!descriptor || typeof descriptor !== 'object') {
      return _buildResult(op, 'session', false, 'descriptor must be an object.');
    }
    const violation = _violatesSecurityPolicy(descriptor);
    if (violation) {
      return _buildResult(op, 'session', false, 'descriptor rejected at security choke point: ' + violation);
    }
    if (descriptor.cameraId && !hasCamera(descriptor.cameraId)) {
      return _buildResult(op, 'session', false, 'cameraId "' + descriptor.cameraId + '" is not a registered camera.');
    }
    const id = typeof descriptor.id === 'string' && descriptor.id.length > 0 ? descriptor.id : _genId('session');
    if (_sessions.has(id)) {
      return _buildResult(op, 'session', false, 'session "' + id + '" already exists.');
    }
    const clone = _deepClone(descriptor);
    delete clone.id;
    const record = Object.assign({}, clone, {
      id: id,
      status: 'created',
      localId: typeof descriptor.localId === 'string' ? descriptor.localId : id,
      globalId: typeof descriptor.globalId === 'string' ? descriptor.globalId : null,
      syncState: typeof descriptor.syncState === 'string' ? descriptor.syncState : 'local',
      conflictState: typeof descriptor.conflictState === 'string' ? descriptor.conflictState : 'none',
      version: 1,
      createdOffline: descriptor.createdOffline === true,
      createdAt: _now(),
      lastModified: _now(),
      transitions: [{ from: null, to: 'created', at: _now() }],
    });
    _sessions.set(id, record);
    logTimelineEvent('session:create', { sessionId: id });
    emit('session:create', { id: id });
    return _buildResult(op, 'session', true, null, { id: id, status: 'created' });
  }

  function _transitionSession(op, id, targetStatus) {
    if (typeof id !== 'string' || !_sessions.has(id)) {
      return _buildResult(op, 'session', false, 'session "' + id + '" does not exist.');
    }
    const existing = _sessions.get(id);
    const allowed = SESSION_TRANSITIONS[existing.status] || [];
    if (allowed.indexOf(targetStatus) === -1) {
      // Rollback-safe: no mutation occurs on an invalid transition attempt.
      return _buildResult(op, 'session', false, 'invalid transition: cannot move from "' + existing.status + '" to "' + targetStatus + '".');
    }
    const nextTransitions = existing.transitions.concat([{ from: existing.status, to: targetStatus, at: _now() }]);
    const updated = Object.assign({}, existing, {
      status: targetStatus,
      version: existing.version + 1,
      lastModified: _now(),
      transitions: nextTransitions,
    });
    _sessions.set(id, updated);
    logTimelineEvent('session:' + targetStatus, { sessionId: id });
    emit('session:' + targetStatus, { id: id, status: targetStatus });
    return _buildResult(op, 'session', true, null, { id: id, status: targetStatus });
  }

  function startSession(id) { return _transitionSession('startSession', id, 'active'); }
  function pauseSession(id) { return _transitionSession('pauseSession', id, 'paused'); }
  function resumeSession(id) { return _transitionSession('resumeSession', id, 'active'); }
  function stopSession(id) { return _transitionSession('stopSession', id, 'stopped'); }
  function endSession(id) { return _transitionSession('endSession', id, 'ended'); }
  function archiveSession(id) { return _transitionSession('archiveSession', id, 'archived'); }

  function getSession(id) {
    if (typeof id !== 'string' || !_sessions.has(id)) return null;
    return _deepFreeze(_deepClone(_sessions.get(id)));
  }

  function listSessions(filters) {
    filters = filters || {};
    let entries = Array.from(_sessions.values());
    if (typeof filters.status === 'string') entries = entries.filter(function (s) { return s.status === filters.status; });
    if (typeof filters.cameraId === 'string') entries = entries.filter(function (s) { return s.cameraId === filters.cameraId; });
    return Object.freeze(entries.map(function (s) { return _deepFreeze(_deepClone(s)); }));
  }

  function hasSession(id) { return typeof id === 'string' && _sessions.has(id); }
  function countSessions() { return _sessions.size; }

  function exportSession(id) {
    if (typeof id !== 'string' || !_sessions.has(id)) {
      return _buildResult('exportSession', 'session', false, 'session "' + id + '" does not exist.');
    }
    return _buildResult('exportSession', 'session', true, null, _deepFreeze(_deepClone(_sessions.get(id))));
  }

  function importSession(record) {
    const op = 'importSession';
    if (!record || typeof record.id !== 'string') {
      return _buildResult(op, 'session', false, 'record must include an id.');
    }
    const violation = _violatesSecurityPolicy(record);
    if (violation) {
      return _buildResult(op, 'session', false, 'record rejected at security choke point: ' + violation);
    }
    if (_sessions.has(record.id)) {
      return _buildResult(op, 'session', false, 'session "' + record.id + '" already exists (import is merge-only).');
    }
    _sessions.set(record.id, _deepClone(record));
    emit('session:import', { id: record.id });
    return _buildResult(op, 'session', true, null, { id: record.id });
  }

  function getSessionDiagnostics(id) {
    if (typeof id !== 'string' || !_sessions.has(id)) {
      return _buildResult('getSessionDiagnostics', 'session', false, 'session "' + id + '" does not exist.');
    }
    const record = _sessions.get(id);
    const startedAt = record.transitions.find(function (t) { return t.to === 'active'; });
    const endedAt = record.transitions.find(function (t) { return t.to === 'ended'; });
    return _buildResult('getSessionDiagnostics', 'session', true, null, Object.freeze({
      id: record.id,
      status: record.status,
      transitionCount: record.transitions.length,
      startedAt: startedAt ? startedAt.at : null,
      endedAt: endedAt ? endedAt.at : null,
      durationMs: (startedAt && endedAt) ? (endedAt.at - startedAt.at) : null,
    }));
  }

  // ── Diagnostics Registry (item 25) ───────────────────────────────────

  const _flatRegistries = {
    cameraTypes: CameraTypes, devices: Devices, lenses: Lenses, resolutions: Resolutions,
    frameRates: FrameRates, captureProfiles: CaptureProfiles, sources: Sources,
    destinations: Destinations, storage: Storage, recordings: Recordings,
    snapshots: Snapshots, streams: Streams, capturePipelines: CapturePipelines,
    playback: Playback, outputs: Outputs, permissions: Permissions,
    deviceHealth: DeviceHealth, adapters: Adapters, plugins: Plugins, integrations: Integrations,
  };

  function getDiagnostics() {
    const counts = {};
    let totalTracked = 0;
    let syncedCount = 0;

    Object.keys(_flatRegistries).forEach(function (key) {
      const reg = _flatRegistries[key];
      counts[key + 'Count'] = reg.count();
      reg._rawSyncStates().forEach(function (state) {
        totalTracked += 1;
        if (state === 'synced') syncedCount += 1;
      });
    });

    const sessionStatusCounts = { created: 0, active: 0, paused: 0, stopped: 0, ended: 0, archived: 0 };
    _sessions.forEach(function (s) {
      if (sessionStatusCounts[s.status] !== undefined) sessionStatusCounts[s.status] += 1;
      totalTracked += 1;
      if (s.syncState === 'synced') syncedCount += 1;
    });

    Array.from(_cameras._rawSnapshot()).forEach(function (c) {
      totalTracked += 1;
      if (c.syncState === 'synced') syncedCount += 1;
    });

    return Object.freeze(Object.assign({}, counts, {
      cameraCount: _cameras.count(),
      sessionCount: _sessions.size,
      sessionStatusCounts: Object.freeze(sessionStatusCounts),
      synchronizationCount: syncedCount,
      unsyncedCount: totalTracked - syncedCount,
      eventCount: _eventCount,
      timelineEntries: _timeline.length,
      graphEdgeCount: getGraphEdgeCount(),
      registryHealth: 'ok',
      version: VERSION,
      generatedAt: _now(),
    }));
  }

  // ── Export / Import — full-fidelity, merge-only kernel snapshot ─────

  function exportKernelStateSnapshot() {
    const snapshot = {
      version: VERSION,
      exportedAt: _now(),
      cameras: _cameras._rawSnapshot(),
      sessions: Array.from(_sessions.values()).map(_deepClone),
      timeline: _timeline.slice(),
      graphEdges: Array.from(_graphEdges.entries()).map(function (e) {
        return { from: e[0], edges: Array.from(e[1].entries()).map(function (x) { return { to: x[0], relation: x[1] }; }) };
      }),
    };
    Object.keys(_flatRegistries).forEach(function (key) {
      snapshot[key] = _flatRegistries[key]._rawSnapshot();
    });

    const violation = _violatesSecurityPolicy(snapshot);
    if (violation) {
      // Should never trigger since every write path already passed the choke
      // point, but the export boundary re-checks as a final guarantee.
      return _buildResult('exportKernelStateSnapshot', 'kernel', false, 'snapshot rejected at security choke point: ' + violation);
    }
    return _buildResult('exportKernelStateSnapshot', 'kernel', true, null, _deepFreeze(snapshot));
  }

  function importKernelStateSnapshot(snapshot) {
    const op = 'importKernelStateSnapshot';
    if (!snapshot || typeof snapshot !== 'object') {
      return _buildResult(op, 'kernel', false, 'snapshot must be an object.');
    }
    const violation = _violatesSecurityPolicy(snapshot);
    if (violation) {
      return _buildResult(op, 'kernel', false, 'snapshot rejected at security choke point: ' + violation);
    }

    let importedCameras = 0;
    (snapshot.cameras || []).forEach(function (record) {
      if (record && typeof record.id === 'string' && !_cameras.has(record.id)) {
        importedCameras += _cameras._rawImport([record]);
      }
    });

    let importedSessions = 0;
    (snapshot.sessions || []).forEach(function (record) {
      if (record && typeof record.id === 'string' && !_sessions.has(record.id)) {
        _sessions.set(record.id, _deepClone(record));
        importedSessions += 1;
      }
    });

    let importedRegistryEntries = 0;
    Object.keys(_flatRegistries).forEach(function (key) {
      if (Array.isArray(snapshot[key])) {
        importedRegistryEntries += _flatRegistries[key]._rawImport(_deepClone(snapshot[key]));
      }
    });

    let importedTimeline = 0;
    (snapshot.timeline || []).forEach(function (entry) {
      if (entry && typeof entry.id === 'string' && !_timeline.some(function (t) { return t.id === entry.id; })) {
        _timeline.push(_deepClone(entry));
        importedTimeline += 1;
      }
    });

    (snapshot.graphEdges || []).forEach(function (node) {
      if (node && typeof node.from === 'string' && Array.isArray(node.edges)) {
        if (!_graphEdges.has(node.from)) _graphEdges.set(node.from, new Map());
        node.edges.forEach(function (edge) {
          if (edge && typeof edge.to === 'string' && !_graphEdges.get(node.from).has(edge.to)) {
            _graphEdges.get(node.from).set(edge.to, edge.relation || 'related');
          }
        });
      }
    });

    emit('kernel:import', { importedCameras: importedCameras, importedSessions: importedSessions, importedRegistryEntries: importedRegistryEntries, importedTimeline: importedTimeline });
    return _buildResult(op, 'kernel', true, null, {
      importedCameras: importedCameras,
      importedSessions: importedSessions,
      importedRegistryEntries: importedRegistryEntries,
      importedTimeline: importedTimeline,
    });
  }

  // ── Version ───────────────────────────────────────────────────────────

  function getVersionInfo() { return VERSION; }

  // ── Public API (frozen) ───────────────────────────────────────────────

  window.CozyOS.Camera = Object.freeze({
    // Camera Session Lifecycle (item 1)
    createSession: createSession,
    startSession: startSession,
    pauseSession: pauseSession,
    resumeSession: resumeSession,
    stopSession: stopSession,
    endSession: endSession,
    archiveSession: archiveSession,
    importSession: importSession,
    exportSession: exportSession,
    getSessionDiagnostics: getSessionDiagnostics,
    getSession: getSession,
    listSessions: listSessions,
    hasSession: hasSession,
    countSessions: countSessions,

    // Camera Registry (item 2) + Camera Type Registry (item 3, auto-registers)
    registerCamera: registerCamera,
    removeCamera: removeCamera,
    updateCamera: updateCamera,
    getCamera: getCamera,
    listCameras: listCameras,
    hasCamera: hasCamera,
    countCameras: countCameras,
    CameraTypes: CameraTypes,

    // Device / Lens / Resolution / Frame Rate / Capture Profile Registries (items 4–8)
    Devices: Devices,
    Lenses: Lenses,
    Resolutions: Resolutions,
    FrameRates: FrameRates,
    CaptureProfiles: CaptureProfiles,

    // Source / Destination Registries (items 9–10)
    Sources: Sources,
    Destinations: Destinations,

    // Storage / Recording / Snapshot / Stream Registries (items 11–14)
    Storage: Storage,
    Recordings: Recordings,
    Snapshots: Snapshots,
    Streams: Streams,

    // Capture Pipeline Registry (item 15, coordinator only, never executes)
    CapturePipelines: CapturePipelines,

    // Playback / Output Registries (items 16–17)
    Playback: Playback,
    Outputs: Outputs,

    // Permission Registry (item 18, bookkeeping only, no OS permission requests)
    Permissions: Permissions,

    // Device Health Registry (item 19)
    DeviceHealth: DeviceHealth,

    // Timeline Registry (item 20)
    logTimelineEvent: logTimelineEvent,
    getTimeline: getTimeline,
    getTimelineCount: getTimelineCount,

    // Event Graph Registry (item 21)
    addGraphEdge: addGraphEdge,
    removeGraphEdge: removeGraphEdge,
    getGraphNeighbors: getGraphNeighbors,
    hasGraphEdge: hasGraphEdge,
    getGraphEdgeCount: getGraphEdgeCount,

    // Adapter / Plugin / Closed Integration Registries (items 22–24, coordinate only)
    Adapters: Adapters,
    Plugins: Plugins,
    Integrations: Integrations,

    // Diagnostics Registry (item 25)
    getDiagnostics: getDiagnostics,

    // Import / Export (items 26–27, full-fidelity, merge-only)
    exportKernelStateSnapshot: exportKernelStateSnapshot,
    importKernelStateSnapshot: importKernelStateSnapshot,

    // Event Bus (fault-isolated)
    on: on,
    off: off,
    once: once,
    emit: emit,
    getEventCount: getEventCount,

    // Version (also the anchor for Version Conflict Protection above)
    getVersion: getVersionInfo,
  });
})();
