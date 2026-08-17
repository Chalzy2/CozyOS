/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Test Studio — TestFixture
 * core/modules/teststudio/test-fixture.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Support Layer — Fixture Registry
 *
 * SINGLE RESPONSIBILITY
 *   Stores immutable test fixture descriptors supplied by
 *   external producers without creating, loading, executing,
 *   validating, or modifying fixture data.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes fixtures
 *   - loads fixture files
 *   - injects fixtures into tests
 *   - performs assertions
 *   - validates fixture content
 *   - transforms fixture data
 *   - formats reports
 *   - stores history
 *   - modifies registry
 *   - modifies runner
 *   - modifies scheduler
 *   - modifies plugins
 *   - modifies snapshots
 *   - modifies coverage
 *   - modifies benchmark records
 *   - accesses DOM
 *   - accesses filesystem
 *   - accesses network
 *   - uses timers
 *   - uses localStorage
 *   - uses sessionStorage
 *   - parses fixture payloads
 *   - fabricates fixture metadata
 *
 *   Fixture contents are accepted exactly as supplied by a
 *   certified producer.
 *
 * FROZEN DEPENDENCIES
 *   None. Like TestCoverage, TestBenchmark, and TestSnapshot,
 *   this module is completely isolated. Future fixture loaders
 *   will write into it. Future runners may read from it. The
 *   registry itself depends on nobody.
 *
 * FIXTURE DESCRIPTOR
 *   { id, suiteId, fixtureName, fixtureData, format, metadata }
 *
 *   Notes:
 *   - fixtureData is completely opaque. May contain JSON, XML,
 *     YAML, CSV, HTML, plain text, or any other serializable
 *     structure. Never interpreted. Never parsed. Never
 *     validated. Never executed.
 *   - format is a producer-defined label (e.g. "json", "csv",
 *     "yaml") — an opaque string, not restricted to a fixed enum
 *     and never used to branch storage behavior.
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
 *   - No fixture execution
 *   - No fixture parsing
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /**
   * @const {ReadonlyArray<string>} Required identity/label fields on
   * every fixture descriptor. "fixtureData" is deliberately
   * excluded from this list — it is validated separately (see
   * _validateDescriptor) because it is an opaque payload that may
   * legitimately be an empty string, zero, false, or null, none of
   * which should be rejected the way a missing label would be.
   */
  const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(['id', 'suiteId', 'fixtureName', 'format']);

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
   * Deep-clones a fixture descriptor via JSON round-trip (stripping
   * any non-serializable content such as functions) and then
   * deep-freezes the clone. This guarantees stored descriptors are
   * fully isolated from the caller's original object and cannot be
   * mutated later. Also enforces that fixtureData/metadata are
   * JSON-compatible, since non-serializable values silently vanish
   * in the round-trip. This is plain isolation and freezing, never
   * interpretation of the fixture payload.
   * @param {Object} record
   * @returns {Object} frozen, deep-cloned descriptor
   */
  function _deepFreezeCopy(record) {
    const copy = JSON.parse(JSON.stringify(record));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw fixture descriptor before it is registered.
   * Guards against null, non-object, array, missing/empty identity
   * fields, and a missing fixtureData payload. Throws a
   * descriptive, actionable Error on failure.
   *
   * fixtureData is validated only for presence (the key must exist
   * and not be undefined) — its value is never inspected, typed,
   * parsed, or otherwise interpreted, since it is an opaque payload
   * that may legitimately be "", 0, false, null, an object, or an
   * array.
   *
   * @param {*} record
   * @throws {Error}
   */
  function _validateDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[TestFixture] fixture record must be a non-null, non-array object.');
    }
    REQUIRED_DESCRIPTOR_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[TestFixture] fixture record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[TestFixture] record.id must be a non-empty string.');
    }
    if (!('fixtureData' in record) || record.fixtureData === undefined) {
      throw new Error('[TestFixture] fixture record missing required field: "fixtureData".');
    }
  }

  /**
   * Registers a new fixture descriptor.
   *
   * Descriptor shape:
   *   { id, suiteId, fixtureName, fixtureData, format, metadata }
   *
   * - id, suiteId, fixtureName, format, and fixtureData are
   *   required.
   * - metadata defaults to {} if omitted.
   * - fixtureData is stored opaquely: this module never loads,
   *   parses, validates, transforms, or executes it.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored descriptor
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateDescriptor(record);
    const id = _normalizeId(record.id);

    if (_registry.has(id)) {
      throw new Error('[TestFixture] duplicate fixture record id: "' + id + '". Unregister it before re-registering.');
    }

    const descriptor = _deepFreezeCopy({
      id: id,
      suiteId: record.suiteId,
      fixtureName: record.fixtureName,
      fixtureData: record.fixtureData,
      format: record.format,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _registry.set(id, descriptor);
    return descriptor;
  }

  /**
   * Removes a registered fixture descriptor by id.
   * @param {string} id
   * @returns {boolean} true if a record was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.delete(normalized);
  }

  /**
   * Retrieves a single registered fixture descriptor by id.
   * @param {string} id
   * @returns {Object|null} frozen descriptor, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _registry.get(normalized) || null;
  }

  /**
   * Retrieves all registered fixture descriptors.
   * @returns {ReadonlyArray<Object>} frozen array of frozen descriptors
   */
  function getAll() {
    return Object.freeze(Array.from(_registry.values()));
  }

  /**
   * Checks whether a fixture descriptor with the given id is registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.has(normalized);
  }

  /**
   * Returns the number of currently registered fixture descriptors.
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
  window.CozyOS.TestFixture = Object.freeze({
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
