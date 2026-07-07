/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Enterprise Coordination Kernel — CozyMedia
 * core/modules/media/cozy-media.js
 * Version: 1.0.0-ENTERPRISE
 * ══════════════════════════════════════════════════════════════
 *
 * ROLE: Single authoritative coordination layer for every media
 * asset in CozyOS. Coordinator / Registry / Lifecycle Manager /
 * Metadata Manager / Sync Coordinator / Event Coordinator /
 * Diagnostics Provider.
 *
 * THIS MODULE NEVER: decodes/encodes video, compresses/resizes/
 * rotates/edits images or video, generates thumbnails, performs
 * OCR/face/object detection, speech recognition, subtitles,
 * translation, streaming, camera/mic/hardware access, AI
 * execution, rendering, filters, enhancement, or restoration.
 * All computation is delegated to registered adapters — this
 * file stores adapter DESCRIPTORS only and never invokes them.
 *
 * FLAGGED NEW CONTRACTS (not specified upstream — parallel to the
 * Architecture Review process used for ocr-cli.js / ocr-language.js):
 *   - REGISTRY RESULT shape reused from OCRCLI/OCRLanguage precedent
 *     for cross-module consistency.
 *   - Generic registry factory (_createRegistry) backs every
 *     "coordinate only" registry (types, devices, sources,
 *     destinations, pipelines, adapters, plugins, integrations,
 *     recordings, playback sessions, playlists, sharing,
 *     permissions, collections) so all of them expose the exact
 *     same register/unregister/get/list/has/count/update contract,
 *     per "Public API Rules". Media, metadata, versions, timeline,
 *     and the event graph have bespoke shapes because their
 *     semantics (status transitions, append-only logs, edges)
 *     don't fit a flat key/value registry.
 *   - importKernelStateSnapshot() is merge-only / non-destructive,
 *     matching the ocr-language.js precedent: existing IDs are
 *     never overwritten, the registry is never wiped.
 *   - Security choke point rejects both suspicious key names
 *     (password/token/secret/apiKey/certificate/biometric/
 *     credential/privateKey) AND any function-typed value, since
 *     "never serialize executable functions" implies functions
 *     must never enter a registry in the first place, not just be
 *     stripped at export time.
 *   - "Offline-first, internet optional" is implemented as: every
 *     entity carries localId/globalId/syncState/conflictState/
 *     version/createdOffline, and nothing in this file ever
 *     performs a network call — sync state is bookkeeping only,
 *     actual synchronization is delegated to CozySync.
 *
 * DESIGN: ES2022, strict mode, CSP compliant, no eval/timers/
 * console output, no fetch/XHR/localStorage/sessionStorage,
 * deep-frozen public returns, defensive deep-cloned inputs.
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  const VERSION = '1.0.0';

  // ── Security choke point ──────────────────────────────────────────

  const FORBIDDEN_KEY_PATTERNS = [
    /password/i, /token/i, /api[_-]?key/i, /secret/i, /certificate/i,
    /biometric/i, /credential/i, /private[_-]?key/i, /auth[_-]?header/i,
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

  // ── Structural helpers ─────────────────────────────────────────────

  function _deepClone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function _deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) {
      _deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  function _now() { return Date.now(); }

  function _genId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function _buildResult(operation, entity, success, reason, data) {
    const out = { operation: operation, entity: entity, success: success, reason: reason || null, timestamp: _now() };
    if (data !== undefined) out.data = data;
    return Object.freeze(out);
  }

  // ── Event Bus (fault-isolated) ──────────────────────────────────────

  const _listeners = new Map(); // event -> Set<fn>
  const _onceWrappers = new Map(); // original fn -> wrapper fn (per event, last registered)
  let _eventCount = 0;

  function on(event, fn) {
    if (typeof event !== 'string' || typeof fn !== 'function') {
      return _buildResult('on', 'eventBus', false, 'event must be a string and fn must be a function.');
    }
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(fn);
    return _buildResult('on', 'eventBus', true, null, { event: event });
  }

  function off(event, fn) {
    if (!_listeners.has(event)) return _buildResult('off', 'eventBus', false, 'no listeners for event.');
    const removed = _listeners.get(event).delete(fn);
    return _buildResult('off', 'eventBus', removed, removed ? null : 'listener not found.');
  }

  function once(event, fn) {
    if (typeof event !== 'string' || typeof fn !== 'function') {
      return _buildResult('once', 'eventBus', false, 'event must be a string and fn must be a function.');
    }
    const wrapper = function (payload) {
      off(event, wrapper);
      fn(payload);
    };
    return on(event, wrapper);
  }

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

  // ── Timeline (append-only) ─────────────────────────────────────────

  const _timeline = [];

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

  function getTimeline(filters) {
    filters = filters || {};
    let entries = _timeline.slice();
    if (typeof filters.type === 'string') {
      entries = entries.filter(function (e) { return e.type === filters.type; });
    }
    if (typeof filters.since === 'number') {
      entries = entries.filter(function (e) { return e.timestamp >= filters.since; });
    }
    if (typeof filters.limit === 'number') {
      entries = entries.slice(-filters.limit);
    }
    return Object.freeze(entries.slice());
  }

  function getTimelineCount() { return _timeline.length; }

  // ── Event Graph (bookkeeping only) ──────────────────────────────────

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
    _graphEdges.get(nodeId).forEach(function (relation, toNodeId) {
      out.push(Object.freeze({ to: toNodeId, relation: relation }));
    });
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

  // ── Generic registry factory (types/devices/sources/destinations/
  //    pipelines/adapters/plugins/integrations/recordings/playback
  //    sessions/playlists/sharing/permissions/collections) ────────────

  function _createRegistry(entityName) {
    const _store = new Map();

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
        updatedAt: _now(),
      });
      _store.set(id, entry);
      emit(entityName + ':register', { id: id });
      return _buildResult('register', entityName, true, null, { id: id });
    }

    function unregister(id) {
      if (typeof id !== 'string' || !_store.has(id)) {
        return _buildResult('unregister', entityName, false, 'id "' + id + '" is not registered in ' + entityName + '.');
      }
      _store.delete(id);
      emit(entityName + ':unregister', { id: id });
      return _buildResult('unregister', entityName, true, null);
    }

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
        updatedAt: _now(),
      });
      _store.set(id, merged);
      emit(entityName + ':update', { id: id });
      return _buildResult('update', entityName, true, null, { id: id });
    }

    function get(id) {
      if (typeof id !== 'string' || !_store.has(id)) return null;
      return _deepFreeze(_deepClone(_store.get(id)));
    }

    function list() {
      return Object.freeze(Array.from(_store.values()).map(function (e) { return _deepFreeze(_deepClone(e)); }));
    }

    function has(id) { return typeof id === 'string' && _store.has(id); }

    function count() { return _store.size; }

    function _rawSnapshot() {
      // Internal use only (export snapshot / diagnostics) — not part of public API.
      return Array.from(_store.values()).map(function (e) { return _deepClone(e); });
    }

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

    return Object.freeze({
      register: register, unregister: unregister, update: update,
      get: get, list: list, has: has, count: count,
      _rawSnapshot: _rawSnapshot, _rawImport: _rawImport,
    });
  }

  const MediaTypes = _createRegistry('mediaType');
  const Devices = _createRegistry('device');
  const Sources = _createRegistry('source');
  const Destinations = _createRegistry('destination');
  const Pipelines = _createRegistry('pipeline');
  const Adapters = _createRegistry('adapter');
  const Plugins = _createRegistry('plugin');
  const Integrations = _createRegistry('integration');
  const Recordings = _createRegistry('recording');
  const PlaybackSessions = _createRegistry('playbackSession');
  const Playlists = _createRegistry('playlist');
  const Shares = _createRegistry('share');
  const Permissions = _createRegistry('permission');
  const Collections = _createRegistry('collection');

  // ── Collection membership (albums/galleries/libraries/folders/
  //    collections/projects/workspaces/archives share one registry,
  //    disambiguated by a `kind` field on the descriptor) ─────────────

  const _collectionMembers = new Map(); // collectionId -> Set<mediaId>

  function addMediaToCollection(collectionId, mediaId) {
    if (!Collections.has(collectionId)) {
      return _buildResult('addMediaToCollection', 'collection', false, 'collection "' + collectionId + '" is not registered.');
    }
    if (!_media.has(mediaId)) {
      return _buildResult('addMediaToCollection', 'collection', false, 'media "' + mediaId + '" is not registered.');
    }
    if (!_collectionMembers.has(collectionId)) _collectionMembers.set(collectionId, new Set());
    _collectionMembers.get(collectionId).add(mediaId);
    addGraphEdge('media:' + mediaId, 'collection:' + collectionId, 'memberOf');
    emit('collection:memberAdded', { collectionId: collectionId, mediaId: mediaId });
    return _buildResult('addMediaToCollection', 'collection', true, null);
  }

  function removeMediaFromCollection(collectionId, mediaId) {
    if (!_collectionMembers.has(collectionId) || !_collectionMembers.get(collectionId).has(mediaId)) {
      return _buildResult('removeMediaFromCollection', 'collection', false, 'media is not a member of that collection.');
    }
    _collectionMembers.get(collectionId).delete(mediaId);
    removeGraphEdge('media:' + mediaId, 'collection:' + collectionId);
    emit('collection:memberRemoved', { collectionId: collectionId, mediaId: mediaId });
    return _buildResult('removeMediaFromCollection', 'collection', true, null);
  }

  function listCollectionMedia(collectionId) {
    if (!_collectionMembers.has(collectionId)) return Object.freeze([]);
    return Object.freeze(Array.from(_collectionMembers.get(collectionId)));
  }

  // ── Media Lifecycle ─────────────────────────────────────────────────

  const _media = new Map();       // mediaId -> media record
  const _mediaMetadata = new Map(); // mediaId -> metadata object
  const _mediaVersions = new Map(); // mediaId -> array of version records

  const MEDIA_STATUSES = Object.freeze(['active', 'archived', 'deleted']);

  function createMedia(descriptor) {
    const op = 'createMedia';
    if (!descriptor || typeof descriptor !== 'object') {
      return _buildResult(op, 'media', false, 'descriptor must be an object.');
    }
    if (typeof descriptor.type !== 'string' || descriptor.type.trim().length === 0) {
      return _buildResult(op, 'media', false, 'descriptor.type is required (open registry — any string is valid).');
    }
    const violation = _violatesSecurityPolicy(descriptor);
    if (violation) {
      return _buildResult(op, 'media', false, 'descriptor rejected at security choke point: ' + violation);
    }
    const id = typeof descriptor.id === 'string' && descriptor.id.length > 0 ? descriptor.id : _genId('media');
    if (_media.has(id)) {
      return _buildResult(op, 'media', false, 'media "' + id + '" already exists.');
    }

    // Future media types "work automatically" — auto-register the type on first sight.
    if (!MediaTypes.has(descriptor.type)) {
      MediaTypes.register({ id: descriptor.type, label: descriptor.type });
    }

    const clone = _deepClone(descriptor);
    delete clone.id;
    const record = Object.assign({}, clone, {
      id: id,
      status: 'active',
      localId: typeof descriptor.localId === 'string' ? descriptor.localId : id,
      globalId: typeof descriptor.globalId === 'string' ? descriptor.globalId : null,
      syncState: typeof descriptor.syncState === 'string' ? descriptor.syncState : 'local',
      conflictState: typeof descriptor.conflictState === 'string' ? descriptor.conflictState : 'none',
      version: 1,
      createdOffline: descriptor.createdOffline === true,
      createdAt: _now(),
      updatedAt: _now(),
    });
    _media.set(id, record);
    _mediaVersions.set(id, [{ versionNumber: 1, parentVersion: null, author: descriptor.author || null, timestamp: _now() }]);
    logTimelineEvent('media:create', { mediaId: id, type: descriptor.type });
    emit('media:create', { id: id });
    return _buildResult(op, 'media', true, null, { id: id });
  }

  function updateMedia(id, updates) {
    const op = 'updateMedia';
    if (typeof id !== 'string' || !_media.has(id)) {
      return _buildResult(op, 'media', false, 'media "' + id + '" does not exist.');
    }
    if (!updates || typeof updates !== 'object') {
      return _buildResult(op, 'media', false, 'updates must be an object.');
    }
    const violation = _violatesSecurityPolicy(updates);
    if (violation) {
      return _buildResult(op, 'media', false, 'updates rejected at security choke point: ' + violation);
    }
    const existing = _media.get(id);
    const nextVersion = existing.version + 1;
    const merged = Object.assign({}, existing, _deepClone(updates), {
      id: existing.id,
      status: existing.status,
      createdAt: existing.createdAt,
      version: nextVersion,
      updatedAt: _now(),
    });
    _media.set(id, merged);
    const chain = _mediaVersions.get(id) || [];
    chain.push({ versionNumber: nextVersion, parentVersion: nextVersion - 1, author: updates.author || null, timestamp: _now() });
    _mediaVersions.set(id, chain);
    logTimelineEvent('media:update', { mediaId: id, version: nextVersion });
    emit('media:update', { id: id, version: nextVersion });
    return _buildResult(op, 'media', true, null, { id: id, version: nextVersion });
  }

  function _setMediaStatus(op, id, status) {
    if (typeof id !== 'string' || !_media.has(id)) {
      return _buildResult(op, 'media', false, 'media "' + id + '" does not exist.');
    }
    const existing = _media.get(id);
    _media.set(id, Object.assign({}, existing, { status: status, updatedAt: _now() }));
    logTimelineEvent('media:' + status, { mediaId: id });
    emit('media:' + status, { id: id });
    return _buildResult(op, 'media', true, null, { id: id, status: status });
  }

  function archiveMedia(id) { return _setMediaStatus('archiveMedia', id, 'archived'); }
  function restoreMedia(id) { return _setMediaStatus('restoreMedia', id, 'active'); }

  function deleteMedia(id) {
    const op = 'deleteMedia';
    if (typeof id !== 'string' || !_media.has(id)) {
      return _buildResult(op, 'media', false, 'media "' + id + '" does not exist.');
    }
    const existing = _media.get(id);
    _media.set(id, Object.assign({}, existing, { status: 'deleted', updatedAt: _now() }));
    logTimelineEvent('media:delete', { mediaId: id });
    emit('media:delete', { id: id });
    return _buildResult(op, 'media', true, null, { id: id });
  }

  function getMedia(id) {
    if (typeof id !== 'string' || !_media.has(id)) return null;
    return _deepFreeze(_deepClone(_media.get(id)));
  }

  function listMedia(filters) {
    filters = filters || {};
    let entries = Array.from(_media.values());
    if (typeof filters.status === 'string') entries = entries.filter(function (m) { return m.status === filters.status; });
    if (typeof filters.type === 'string') entries = entries.filter(function (m) { return m.type === filters.type; });
    return Object.freeze(entries.map(function (m) { return _deepFreeze(_deepClone(m)); }));
  }

  function hasMedia(id) { return typeof id === 'string' && _media.has(id); }
  function countMedia() { return _media.size; }

  function exportMedia(id) {
    if (typeof id !== 'string' || !_media.has(id)) {
      return _buildResult('exportMedia', 'media', false, 'media "' + id + '" does not exist.');
    }
    const record = _deepClone(_media.get(id));
    const metadata = _mediaMetadata.has(id) ? _deepClone(_mediaMetadata.get(id)) : null;
    const versions = _deepClone(_mediaVersions.get(id) || []);
    return _buildResult('exportMedia', 'media', true, null, _deepFreeze({ record: record, metadata: metadata, versions: versions }));
  }

  function importMedia(payload) {
    const op = 'importMedia';
    if (!payload || typeof payload !== 'object' || !payload.record || typeof payload.record.id !== 'string') {
      return _buildResult(op, 'media', false, 'payload must include a record with an id.');
    }
    const violation = _violatesSecurityPolicy(payload);
    if (violation) {
      return _buildResult(op, 'media', false, 'payload rejected at security choke point: ' + violation);
    }
    if (_media.has(payload.record.id)) {
      return _buildResult(op, 'media', false, 'media "' + payload.record.id + '" already exists (import is merge-only).');
    }
    _media.set(payload.record.id, _deepClone(payload.record));
    if (payload.metadata) _mediaMetadata.set(payload.record.id, _deepClone(payload.metadata));
    if (Array.isArray(payload.versions)) _mediaVersions.set(payload.record.id, _deepClone(payload.versions));
    emit('media:import', { id: payload.record.id });
    return _buildResult(op, 'media', true, null, { id: payload.record.id });
  }

  // ── Metadata Registry (descriptive fields only) ─────────────────────

  function setMetadata(mediaId, metadata) {
    const op = 'setMetadata';
    if (typeof mediaId !== 'string' || !_media.has(mediaId)) {
      return _buildResult(op, 'metadata', false, 'media "' + mediaId + '" does not exist.');
    }
    if (!metadata || typeof metadata !== 'object') {
      return _buildResult(op, 'metadata', false, 'metadata must be an object.');
    }
    const violation = _violatesSecurityPolicy(metadata);
    if (violation) {
      return _buildResult(op, 'metadata', false, 'metadata rejected at security choke point: ' + violation);
    }
    const existing = _mediaMetadata.get(mediaId) || {};
    const merged = Object.assign({}, existing, _deepClone(metadata), { updatedAt: _now() });
    _mediaMetadata.set(mediaId, merged);
    emit('metadata:set', { mediaId: mediaId });
    return _buildResult(op, 'metadata', true, null, { mediaId: mediaId });
  }

  function getMetadata(mediaId) {
    if (typeof mediaId !== 'string' || !_mediaMetadata.has(mediaId)) return null;
    return _deepFreeze(_deepClone(_mediaMetadata.get(mediaId)));
  }

  // ── Version Registry ─────────────────────────────────────────────────

  function getVersions(mediaId) {
    if (typeof mediaId !== 'string' || !_mediaVersions.has(mediaId)) return Object.freeze([]);
    return _deepFreeze(_deepClone(_mediaVersions.get(mediaId)));
  }

  function getVersion(mediaId, versionNumber) {
    const chain = _mediaVersions.get(mediaId);
    if (!chain) return null;
    const found = chain.find(function (v) { return v.versionNumber === versionNumber; });
    return found ? _deepFreeze(_deepClone(found)) : null;
  }

  // ── Playback coordination (never decodes media) ─────────────────────

  function updatePlaybackState(sessionId, action, params) {
    const op = 'updatePlaybackState';
    if (!PlaybackSessions.has(sessionId)) {
      return _buildResult(op, 'playbackSession', false, 'session "' + sessionId + '" is not registered.');
    }
    const allowedActions = ['play', 'pause', 'stop', 'seek', 'speed', 'loop'];
    if (allowedActions.indexOf(action) === -1) {
      return _buildResult(op, 'playbackSession', false, 'action must be one of: ' + allowedActions.join(', '));
    }
    const result = PlaybackSessions.update(sessionId, Object.assign({ lastAction: action }, params || {}));
    logTimelineEvent('playback:' + action, { sessionId: sessionId });
    return result;
  }

  // ── Diagnostics (bookkeeping only, no AI diagnostics) ───────────────

  function getDiagnostics() {
    let syncedCount = 0, totalTracked = 0;
    const allSyncCarriers = []
      .concat(Array.from(_media.values()))
      .concat(MediaTypes._rawSnapshot(), Devices._rawSnapshot(), Sources._rawSnapshot(),
        Destinations._rawSnapshot(), Pipelines._rawSnapshot(), Adapters._rawSnapshot(),
        Plugins._rawSnapshot(), Integrations._rawSnapshot(), Recordings._rawSnapshot(),
        PlaybackSessions._rawSnapshot(), Playlists._rawSnapshot(), Shares._rawSnapshot(),
        Permissions._rawSnapshot(), Collections._rawSnapshot());
    allSyncCarriers.forEach(function (e) {
      totalTracked += 1;
      if (e.syncState === 'synced') syncedCount += 1;
    });

    return Object.freeze({
      mediaCount: _media.size,
      albumCount: Collections.count(), // collections registry covers albums/galleries/libraries/etc. via `kind`
      collectionCount: Collections.count(),
      playlistCount: Playlists.count(),
      recordingCount: Recordings.count(),
      playbackSessionCount: PlaybackSessions.count(),
      adapterCount: Adapters.count(),
      pluginCount: Plugins.count(),
      integrationCount: Integrations.count(),
      deviceCount: Devices.count(),
      sourceCount: Sources.count(),
      destinationCount: Destinations.count(),
      pipelineCount: Pipelines.count(),
      shareCount: Shares.count(),
      permissionCount: Permissions.count(),
      mediaTypeCount: MediaTypes.count(),
      versionCount: Array.from(_mediaVersions.values()).reduce(function (sum, chain) { return sum + chain.length; }, 0),
      synchronizationCount: syncedCount,
      unsyncedCount: totalTracked - syncedCount,
      eventCount: _eventCount,
      timelineEntries: _timeline.length,
      graphEdgeCount: getGraphEdgeCount(),
      registryHealth: 'ok',
      version: VERSION,
      timestamp: _now(),
    });
  }

  // ── Export / Import full kernel snapshot ─────────────────────────────

  function exportKernelStateSnapshot() {
    const snapshot = {
      version: VERSION,
      exportedAt: _now(),
      media: Array.from(_media.values()).map(_deepClone),
      metadata: Array.from(_mediaMetadata.entries()).map(function (e) { return { mediaId: e[0], metadata: e[1] }; }),
      versions: Array.from(_mediaVersions.entries()).map(function (e) { return { mediaId: e[0], versions: e[1] }; }),
      mediaTypes: MediaTypes._rawSnapshot(),
      devices: Devices._rawSnapshot(),
      sources: Sources._rawSnapshot(),
      destinations: Destinations._rawSnapshot(),
      pipelines: Pipelines._rawSnapshot(),
      adapters: Adapters._rawSnapshot(),
      plugins: Plugins._rawSnapshot(),
      integrations: Integrations._rawSnapshot(),
      recordings: Recordings._rawSnapshot(),
      playbackSessions: PlaybackSessions._rawSnapshot(),
      playlists: Playlists._rawSnapshot(),
      shares: Shares._rawSnapshot(),
      permissions: Permissions._rawSnapshot(),
      collections: Collections._rawSnapshot(),
      collectionMembers: Array.from(_collectionMembers.entries()).map(function (e) { return { collectionId: e[0], mediaIds: Array.from(e[1]) }; }),
      timeline: _timeline.slice(),
      graphEdges: Array.from(_graphEdges.entries()).map(function (e) {
        return { from: e[0], edges: Array.from(e[1].entries()).map(function (x) { return { to: x[0], relation: x[1] }; }) };
      }),
    };
    const violation = _violatesSecurityPolicy(snapshot);
    if (violation) {
      // Should never happen since every write path already passes the choke point,
      // but the export path re-checks as a final guarantee before leaving the kernel.
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

    let importedMedia = 0;
    (snapshot.media || []).forEach(function (record) {
      if (record && typeof record.id === 'string' && !_media.has(record.id)) {
        _media.set(record.id, _deepClone(record));
        importedMedia += 1;
      }
    });
    (snapshot.metadata || []).forEach(function (e) {
      if (e && typeof e.mediaId === 'string' && !_mediaMetadata.has(e.mediaId)) {
        _mediaMetadata.set(e.mediaId, _deepClone(e.metadata));
      }
    });
    (snapshot.versions || []).forEach(function (e) {
      if (e && typeof e.mediaId === 'string' && !_mediaVersions.has(e.mediaId)) {
        _mediaVersions.set(e.mediaId, _deepClone(e.versions));
      }
    });

    const registryImportMap = {
      mediaTypes: MediaTypes, devices: Devices, sources: Sources, destinations: Destinations,
      pipelines: Pipelines, adapters: Adapters, plugins: Plugins, integrations: Integrations,
      recordings: Recordings, playbackSessions: PlaybackSessions, playlists: Playlists,
      shares: Shares, permissions: Permissions, collections: Collections,
    };
    let importedRegistryEntries = 0;
    Object.keys(registryImportMap).forEach(function (key) {
      if (Array.isArray(snapshot[key])) {
        importedRegistryEntries += registryImportMap[key]._rawImport(_deepClone(snapshot[key]));
      }
    });

    (snapshot.collectionMembers || []).forEach(function (e) {
      if (e && typeof e.collectionId === 'string' && Array.isArray(e.mediaIds)) {
        if (!_collectionMembers.has(e.collectionId)) _collectionMembers.set(e.collectionId, new Set());
        e.mediaIds.forEach(function (mid) { _collectionMembers.get(e.collectionId).add(mid); });
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

    emit('kernel:import', { importedMedia: importedMedia, importedRegistryEntries: importedRegistryEntries, importedTimeline: importedTimeline });
    return _buildResult(op, 'kernel', true, null, {
      importedMedia: importedMedia,
      importedRegistryEntries: importedRegistryEntries,
      importedTimeline: importedTimeline,
    });
  }

  // ── Version ───────────────────────────────────────────────────────

  function getVersionInfo() { return VERSION; }

  // ── Public API (frozen) ─────────────────────────────────────────────

  window.CozyOS.CozyMedia = Object.freeze({
    // Media Lifecycle
    createMedia: createMedia,
    updateMedia: updateMedia,
    archiveMedia: archiveMedia,
    restoreMedia: restoreMedia,
    deleteMedia: deleteMedia,
    getMedia: getMedia,
    listMedia: listMedia,
    hasMedia: hasMedia,
    countMedia: countMedia,
    exportMedia: exportMedia,
    importMedia: importMedia,

    // Metadata Registry
    setMetadata: setMetadata,
    getMetadata: getMetadata,

    // Version Registry
    getVersions: getVersions,
    getVersion: getVersion,

    // Media Types (open registry — auto-registers on first createMedia use)
    MediaTypes: MediaTypes,

    // Collections (albums/galleries/libraries/folders/collections/
    // projects/workspaces/archives — disambiguated via descriptor.kind)
    Collections: Collections,
    addMediaToCollection: addMediaToCollection,
    removeMediaFromCollection: removeMediaFromCollection,
    listCollectionMedia: listCollectionMedia,

    // Device / Source / Destination Registries
    Devices: Devices,
    Sources: Sources,
    Destinations: Destinations,

    // Media Pipeline Registry (store only, never executes)
    Pipelines: Pipelines,

    // Timeline
    logTimelineEvent: logTimelineEvent,
    getTimeline: getTimeline,
    getTimelineCount: getTimelineCount,

    // Playback Registry (coordinate only, never decodes)
    PlaybackSessions: PlaybackSessions,
    updatePlaybackState: updatePlaybackState,

    // Recording Registry (coordinate only, never records)
    Recordings: Recordings,

    // Playlist Registry
    Playlists: Playlists,

    // Sharing Registry
    Shares: Shares,

    // Permissions Registry
    Permissions: Permissions,

    // Event Graph
    addGraphEdge: addGraphEdge,
    removeGraphEdge: removeGraphEdge,
    getGraphNeighbors: getGraphNeighbors,
    hasGraphEdge: hasGraphEdge,
    getGraphEdgeCount: getGraphEdgeCount,

    // Adapter / Plugin / Closed Integration Registries (coordinate only)
    Adapters: Adapters,
    Plugins: Plugins,
    Integrations: Integrations,

    // Event Bus (fault-isolated)
    on: on,
    off: off,
    once: once,
    emit: emit,
    getEventCount: getEventCount,

    // Diagnostics
    getDiagnostics: getDiagnostics,

    // Export / Import (merge-only)
    exportKernelStateSnapshot: exportKernelStateSnapshot,
    importKernelStateSnapshot: importKernelStateSnapshot,

    // Version
    getVersion: getVersionInfo,
  });
})();
