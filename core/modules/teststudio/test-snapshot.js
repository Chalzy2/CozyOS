/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Test Studio — TestSnapshot
 * core/modules/teststudio/test-snapshot.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * NOTE: This file supersedes an earlier draft of test-snapshot.js
 * that used a { snapshot, type, content } descriptor shape. That
 * draft is retired — this version, using
 * { snapshotName, snapshotData, format }, is the authoritative
 * schema.
 *
 * LAYER
 *   Analysis Layer — Snapshot Registry
 *
 * SINGLE RESPONSIBILITY
 *   Store immutable snapshot records produced by external
 *   snapshot generators without comparing, generating, or
 *   validating snapshot content.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes tests
 *   - performs assertions
 *   - compares snapshots
 *   - generates snapshots
 *   - updates snapshots
 *   - validates snapshot equality
 *   - performs diff operations
 *   - formats reports
 *   - modifies history
 *   - modifies registry
 *   - modifies runner
 *   - modifies reporter
 *   - modifies scheduler
 *   - modifies environment
 *   - modifies coverage
 *   - modifies benchmark data
 *   - accesses DOM
 *   - accesses filesystem
 *   - accesses network
 *   - uses timers
 *   - uses localStorage
 *   - uses sessionStorage
 *   - calculates hashes
 *   - performs serialization logic beyond immutable storage
 *
 *   Snapshot data is accepted exactly as supplied by a certified
 *   producer.
 *
 * FROZEN DEPENDENCIES
 *   None. Like TestCoverage and TestBenchmark, this module is
 *   intentionally isolated. Future snapshot generators will write
 *   into it. Future Reporter/UI/Dashboard modules may read from
 *   it. The module itself depends on nobody.
 *
 * SNAPSHOT DESCRIPTOR
 *   { id, suiteId, snapshotName, snapshotData, format, metadata }
 *
 *   Notes:
 *   - snapshotData is opaque. The registry never interprets it.
 *     It may contain JSON, text, HTML, XML, Markdown, or any
 *     other serializable structure.
 *   - format is a producer-defined label (e.g. "json", "html",
 *     "text") — an opaque string, not restricted to a fixed enum
 *     and never used to branch storage behavior.
 *   - No comparison is performed, ever, on snapshotData.
 *
 * INTERNAL DESIGN RULES
 *   - Map storage
 *   - O(1) lookup
 *   - Deep-freeze descriptors
 *   - Duplicate protection
 *   - Immutable returns
 *   - Hot-reload safe
 *   - JSON-compatible storage
 *   - No hidden state
 *   - No snapshot comparison
 *   - No snapshot generation
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /**
   * @const {ReadonlyArray<string>} Required identity/label fields on
   * every snapshot descriptor. "snapshotData" is deliberately
   * excluded from this list — it is validated separately (see
   * _validateDescriptor) because it is an opaque payload that may
   * legitimately be an empty string, zero, false, or null, none of
   * which should be rejected the way a missing label would be.
   */
  const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(['id', 'suiteId', 'snapshotName', 'format']);

  /**
   * Internal store: Map<string, FrozenDescriptor>.
   * Map is used (not a plain object) to guarantee O(1) get/has/delete
   * and to avoid prototype-pollution surface area.
   * @type {Map<string, Object>}
   */
  let _registry = new Map();

  /**
   * Normalizes a candidate id into a trimmed, non-empty string, or null
   * if the candidate is not usable as an id. Used to defensively guard
   * every public method that accepts an id.
   * @param {*} id
   * @returns {string|null}
   */
  function _normalizeId(id) {
    if (typeof id !== 'string') return null;
    const trimmed = id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Recursively freezes an object graph in place (objects and arrays).
   * Primitives are returned as-is. Applied at store-time and on every
   * return path so callers can never mutate registry-owned state.
   * @param {*} value
   * @returns {*} the same value, frozen if it was an object/array
   */
  function _freezeRecursive(value) {
    if (value && typeof value === 'object') {
      Object.getOwnPropertyNames(value).forEach(function (key) {
        _freezeRecursive(value[key]);
      });
      Object.freeze(value);
    }
    return value;
  }

  /**
   * Deep-clones a snapshot descriptor via JSON round-trip (stripping
   * any non-serializable content such as functions) and then
   * deep-freezes the clone. This guarantees stored descriptors are
   * fully isolated from the caller's original object and cannot be
   * mutated later. Also enforces that snapshotData/metadata are
   * JSON-compatible, since non-serializable values silently vanish
   * in the round-trip. This is the only "serialization logic" the
   * module performs — plain isolation and freezing, never
   * interpretation.
   * @param {Object} record
   * @returns {Object} frozen, deep-cloned descriptor
   */
  function _deepFreezeCopy(record) {
    const copy = JSON.parse(JSON.stringify(record));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw snapshot descriptor before it is registered.
   * Guards against null, non-object, array, missing/empty identity
   * fields, and a missing snapshotData payload. Throws a
   * descriptive, actionable Error on failure.
   *
   * snapshotData is validated only for presence (the key must exist
   * and not be undefined) — its value is never inspected, typed,
   * diffed, hashed, or otherwise interpreted, since it is an opaque
   * payload that may legitimately be "", 0, false, null, an object,
   * or an array.
   *
   * @param {*} record
   * @throws {Error}
   */
  function _validateDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[TestSnapshot] snapshot record must be a non-null, non-array object.');
    }
    REQUIRED_DESCRIPTOR_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[TestSnapshot] snapshot record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[TestSnapshot] record.id must be a non-empty string.');
    }
    if (!('snapshotData' in record) || record.snapshotData === undefined) {
      throw new Error('[TestSnapshot] snapshot record missing required field: "snapshotData".');
    }
  }

  /**
   * Registers a new snapshot descriptor.
   *
   * Descriptor shape:
   *   { id, suiteId, snapshotName, snapshotData, format, metadata }
   *
   * - id, suiteId, snapshotName, format, and snapshotData are
   *   required.
   * - metadata defaults to {} if omitted.
   * - snapshotData is stored opaquely: this module never generates,
   *   compares, updates, validates, diffs, or hashes it.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored descriptor
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateDescriptor(record);
    const id = _normalizeId(record.id);

    if (_registry.has(id)) {
      throw new Error('[TestSnapshot] duplicate snapshot record id: "' + id + '". Unregister it before re-registering.');
    }

    const descriptor = _deepFreezeCopy({
      id: id,
      suiteId: record.suiteId,
      snapshotName: record.snapshotName,
      snapshotData: record.snapshotData,
      format: record.format,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _registry.set(id, descriptor);
    return descriptor;
  }

  /**
   * Removes a registered snapshot descriptor by id.
   * @param {string} id
   * @returns {boolean} true if a record was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.delete(normalized);
  }

  /**
   * Retrieves a single registered snapshot descriptor by id.
   * @param {string} id
   * @returns {Object|null} frozen descriptor, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _registry.get(normalized) || null;
  }

  /**
   * Retrieves all registered snapshot descriptors.
   * @returns {ReadonlyArray<Object>} frozen array of frozen descriptors
   */
  function getAll() {
    return Object.freeze(Array.from(_registry.values()));
  }

  /**
   * Checks whether a snapshot descriptor with the given id is registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.has(normalized);
  }

  /**
   * Returns the number of currently registered snapshot descriptors.
   * @returns {number}
   */
  function count() {
    return _registry.size;
  }

  /**
   * Resets the registry by replacing the internal Map with a new,
   * empty one. Does not replace or reassign the frozen public API
   * object, so re-registration works immediately after clear() and
   * hot-reload of the consuming module remains safe.
   * @returns {boolean} true, always
   */
  function clear() {
    _registry = new Map();
    return true;
  }

  /**
   * Returns the module version string.
   * @returns {string}
   */
  function getVersion() {
    return VERSION;
  }

  /**
   * Frozen public API. Exactly eight methods, matching specification.
   * No private members are exposed.
   */
  window.CozyOS.TestSnapshot = Object.freeze({
    register: register,
    unregister: unregister,
    get: get,
    getAll: getAll,
    has: has,
    count: count,
    clear: clear,
    getVersion: getVersion
  });
})();
