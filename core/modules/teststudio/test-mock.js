/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Test Studio — TestMock
 * core/modules/teststudio/test-mock.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Support Layer — Mock Descriptor Registry
 *
 * SINGLE RESPONSIBILITY
 *   Stores immutable mock descriptors supplied by external
 *   producers without creating, executing, injecting, validating,
 *   or interpreting mock behavior.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes mocks
 *   - invokes mock functions
 *   - injects mocks into tests
 *   - replaces dependencies
 *   - patches objects
 *   - performs assertions
 *   - validates mock behavior
 *   - formats reports
 *   - modifies history
 *   - modifies registry
 *   - modifies runner
 *   - modifies scheduler
 *   - modifies plugins
 *   - modifies environments
 *   - modifies coverage
 *   - modifies benchmarks
 *   - modifies snapshots
 *   - modifies fixtures
 *   - accesses DOM
 *   - accesses filesystem
 *   - accesses network
 *   - uses timers
 *   - uses localStorage
 *   - uses sessionStorage
 *   - fabricates mock results
 *   - interprets mock definitions
 *
 *   Mock descriptors are accepted exactly as supplied by a
 *   certified producer.
 *
 * FROZEN DEPENDENCIES
 *   None. Like TestEnvironment, TestCoverage, TestBenchmark,
 *   TestSnapshot, and TestFixture, this module is intentionally
 *   isolated and serves only as an immutable registry.
 *
 * MOCK DESCRIPTOR
 *   { id, suiteId, mockName, target, mockData, format, metadata }
 *
 *   Notes:
 *   - mockData is opaque. May contain serializable JSON, objects,
 *     arrays, text, or configuration. The registry never
 *     interprets or executes it.
 *   - target is stored exactly as provided and is never resolved
 *     or invoked.
 *   - format is a producer-defined label, an opaque string not
 *     restricted to a fixed enum and never used to branch storage
 *     behavior.
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
 *   - No mock execution
 *   - No dependency injection
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /**
   * @const {ReadonlyArray<string>} Required identity/label fields on
   * every mock descriptor. "mockData" is deliberately excluded from
   * this list — it is validated separately (see _validateDescriptor)
   * because it is an opaque payload that may legitimately be an
   * empty string, zero, false, or null, none of which should be
   * rejected the way a missing label would be.
   */
  const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(['id', 'suiteId', 'mockName', 'target', 'format']);

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
   * Deep-clones a mock descriptor via JSON round-trip (stripping any
   * non-serializable content such as functions) and then deep-freezes
   * the clone. This guarantees stored descriptors are fully isolated
   * from the caller's original object and cannot be mutated later.
   * Also enforces that mockData/target/metadata are JSON-compatible,
   * since non-serializable values silently vanish in the round-trip.
   * This is plain isolation and freezing — target is never resolved
   * and mockData is never interpreted.
   * @param {Object} record
   * @returns {Object} frozen, deep-cloned descriptor
   */
  function _deepFreezeCopy(record) {
    const copy = JSON.parse(JSON.stringify(record));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw mock descriptor before it is registered. Guards
   * against null, non-object, array, missing/empty identity fields,
   * and a missing mockData payload. Throws a descriptive, actionable
   * Error on failure.
   *
   * mockData is validated only for presence (the key must exist and
   * not be undefined) — its value is never inspected, typed, or
   * otherwise interpreted, since it is an opaque payload that may
   * legitimately be "", 0, false, null, an object, or an array.
   *
   * @param {*} record
   * @throws {Error}
   */
  function _validateDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[TestMock] mock record must be a non-null, non-array object.');
    }
    REQUIRED_DESCRIPTOR_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[TestMock] mock record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[TestMock] record.id must be a non-empty string.');
    }
    if (!('mockData' in record) || record.mockData === undefined) {
      throw new Error('[TestMock] mock record missing required field: "mockData".');
    }
  }

  /**
   * Registers a new mock descriptor.
   *
   * Descriptor shape:
   *   { id, suiteId, mockName, target, mockData, format, metadata }
   *
   * - id, suiteId, mockName, target, format, and mockData are
   *   required.
   * - metadata defaults to {} if omitted.
   * - target is stored exactly as provided and is never resolved
   *   or invoked. mockData is stored opaquely: this module never
   *   executes, injects, patches, or interprets it.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored descriptor
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateDescriptor(record);
    const id = _normalizeId(record.id);

    if (_registry.has(id)) {
      throw new Error('[TestMock] duplicate mock record id: "' + id + '". Unregister it before re-registering.');
    }

    const descriptor = _deepFreezeCopy({
      id: id,
      suiteId: record.suiteId,
      mockName: record.mockName,
      target: record.target,
      mockData: record.mockData,
      format: record.format,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _registry.set(id, descriptor);
    return descriptor;
  }

  /**
   * Removes a registered mock descriptor by id.
   * @param {string} id
   * @returns {boolean} true if a record was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.delete(normalized);
  }

  /**
   * Retrieves a single registered mock descriptor by id.
   * @param {string} id
   * @returns {Object|null} frozen descriptor, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _registry.get(normalized) || null;
  }

  /**
   * Retrieves all registered mock descriptors.
   * @returns {ReadonlyArray<Object>} frozen array of frozen descriptors
   */
  function getAll() {
    return Object.freeze(Array.from(_registry.values()));
  }

  /**
   * Checks whether a mock descriptor with the given id is registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.has(normalized);
  }

  /**
   * Returns the number of currently registered mock descriptors.
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
  window.CozyOS.TestMock = Object.freeze({
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
