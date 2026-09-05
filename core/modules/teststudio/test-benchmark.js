/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Test Studio — TestBenchmark
 * core/modules/teststudio/test-benchmark.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Analysis Layer — Benchmark Registry
 *
 * SINGLE RESPONSIBILITY
 *   Store and expose immutable benchmark records produced by
 *   certified benchmark runners without calculating benchmark
 *   results itself.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes benchmarks
 *   - executes tests
 *   - measures execution time
 *   - starts timers
 *   - stops timers
 *   - averages benchmark runs
 *   - calculates min/max
 *   - calculates median
 *   - calculates percentiles
 *   - calculates throughput
 *   - calculates memory usage
 *   - derives statistics
 *   - formats reports
 *   - generates reports
 *   - modifies TestRunner
 *   - modifies TestHistory
 *   - modifies TestCoverage
 *   - modifies TestEnvironment
 *   - modifies TestScheduler
 *   - accesses DOM
 *   - accesses network
 *   - accesses filesystem
 *   - uses localStorage
 *   - uses sessionStorage
 *   - uses timers
 *
 *   Benchmark values are accepted exactly as supplied by a
 *   certified producer.
 *
 * FROZEN DEPENDENCIES
 *   None. Like TestCoverage, this module is intentionally
 *   isolated. Future benchmark runners may write to it. Future
 *   dashboards may read from it. The registry itself depends on
 *   nobody.
 *
 * BENCHMARK DESCRIPTOR
 *   {
 *     id, suiteId, benchmark,
 *     durationMs, memoryBytes, iterations,
 *     metadata
 *   }
 *
 *   Notes:
 *   - durationMs is supplied externally.
 *   - memoryBytes is supplied externally.
 *   - iterations is supplied externally.
 *   - The module never validates relationships between them
 *     (e.g. it does not check durationMs against iterations, or
 *     derive a per-iteration figure). Each field is validated
 *     independently for shape only.
 *   - No averages. No derived metrics. No performance scoring.
 *
 * INTERNAL DESIGN RULES
 *   - Map storage
 *   - O(1) lookup
 *   - Deep-freeze descriptors
 *   - Duplicate protection
 *   - Immutable returns
 *   - JSON-compatible storage
 *   - Hot-reload safe
 *   - No hidden caches
 *   - No derived values
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /** @const {ReadonlyArray<string>} Required identity fields on every benchmark record. */
  const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(['id', 'suiteId', 'benchmark']);

  /**
   * @const {ReadonlyArray<string>} Required numeric fields on every
   * benchmark record. These are raw, externally-supplied values;
   * this module validates each field's individual shape only and
   * never checks relationships between them or derives new values.
   */
  const REQUIRED_NUMERIC_FIELDS = Object.freeze(['durationMs', 'memoryBytes', 'iterations']);

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
   * Checks whether a value is a finite, non-negative number. Used to
   * validate raw benchmark values without interpreting, comparing,
   * or deriving anything from them.
   * @param {*} value
   * @returns {boolean}
   */
  function _isNonNegativeFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
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
   * Deep-clones a benchmark record via JSON round-trip (stripping any
   * non-serializable content such as functions) and then deep-freezes
   * the clone. This guarantees stored records are fully isolated from
   * the caller's original object and cannot be mutated later.
   * @param {Object} record
   * @returns {Object} frozen, deep-cloned descriptor
   */
  function _deepFreezeCopy(record) {
    const copy = JSON.parse(JSON.stringify(record));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw benchmark record before it is registered. Guards
   * against null, non-object, array, missing/empty identity fields,
   * and missing/invalid numeric fields. Throws a descriptive,
   * actionable Error on failure. Each numeric field is validated
   * independently — this function never compares fields against
   * each other or computes any relationship, since that would
   * constitute deriving a statistic.
   * @param {*} record
   * @throws {Error}
   */
  function _validateDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[TestBenchmark] benchmark record must be a non-null, non-array object.');
    }
    REQUIRED_DESCRIPTOR_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[TestBenchmark] benchmark record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[TestBenchmark] record.id must be a non-empty string.');
    }
    REQUIRED_NUMERIC_FIELDS.forEach(function (field) {
      if (!_isNonNegativeFiniteNumber(record[field])) {
        throw new Error('[TestBenchmark] benchmark record field "' + field + '" must be a non-negative finite number.');
      }
    });
  }

  /**
   * Registers a new benchmark record.
   *
   * Descriptor shape:
   *   { id, suiteId, benchmark, durationMs, memoryBytes,
   *     iterations, metadata }
   *
   * - id, suiteId, benchmark, durationMs, memoryBytes, and
   *   iterations are required.
   * - metadata defaults to {} if omitted.
   * - Values are stored exactly as supplied. This module never
   *   averages, scores, or otherwise derives new figures from
   *   durationMs, memoryBytes, or iterations.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored descriptor
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateDescriptor(record);
    const id = _normalizeId(record.id);

    if (_registry.has(id)) {
      throw new Error('[TestBenchmark] duplicate benchmark record id: "' + id + '". Unregister it before re-registering.');
    }

    const descriptor = _deepFreezeCopy({
      id: id,
      suiteId: record.suiteId,
      benchmark: record.benchmark,
      durationMs: record.durationMs,
      memoryBytes: record.memoryBytes,
      iterations: record.iterations,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _registry.set(id, descriptor);
    return descriptor;
  }

  /**
   * Removes a registered benchmark record by id.
   * @param {string} id
   * @returns {boolean} true if a record was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.delete(normalized);
  }

  /**
   * Retrieves a single registered benchmark record by id.
   * @param {string} id
   * @returns {Object|null} frozen descriptor, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _registry.get(normalized) || null;
  }

  /**
   * Retrieves all registered benchmark records.
   * @returns {ReadonlyArray<Object>} frozen array of frozen descriptors
   */
  function getAll() {
    return Object.freeze(Array.from(_registry.values()));
  }

  /**
   * Checks whether a benchmark record with the given id is registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.has(normalized);
  }

  /**
   * Returns the number of currently registered benchmark records.
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
  window.CozyOS.TestBenchmark = Object.freeze({
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
