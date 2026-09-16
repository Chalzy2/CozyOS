/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Test Studio — TestCoverage
 * core/modules/teststudio/test-coverage.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Analysis Layer — Coverage Registry
 *
 * SINGLE RESPONSIBILITY
 *   Stores and exposes immutable test coverage records produced
 *   by external tools without calculating coverage itself.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes tests
 *   - performs assertions
 *   - calculates coverage
 *   - parses source code
 *   - instruments code
 *   - generates reports
 *   - formats reports
 *   - modifies history
 *   - modifies registry
 *   - modifies runner
 *   - modifies scheduler
 *   - modifies environment
 *   - accesses DOM
 *   - accesses filesystem
 *   - accesses network
 *   - uses timers
 *   - uses localStorage
 *   - uses sessionStorage
 *   - fabricates percentages
 *   - derives statistics
 *
 *   Coverage values are accepted exactly as supplied by a
 *   certified producer.
 *
 * FROZEN DEPENDENCIES
 *   None. This module is intentionally isolated. Future coverage
 *   generators may write into it. Future dashboards may read from
 *   it. The module itself depends on nobody.
 *
 * COVERAGE DESCRIPTOR
 *   {
 *     id, suiteId, file,
 *     linesCovered, linesTotal,
 *     branchesCovered, branchesTotal,
 *     functionsCovered, functionsTotal,
 *     metadata
 *   }
 *
 *   No percentages are stored. Percentages belong to
 *   visualization layers. Raw counts are stored exactly as
 *   supplied and are never combined, ratioed, or otherwise
 *   derived into new metrics by this module.
 *
 * INTERNAL DESIGN RULES
 *   - Map storage
 *   - O(1) lookup
 *   - Deep-freeze descriptors
 *   - Duplicate protection
 *   - Immutable returns
 *   - Hot-reload safe
 *   - No hidden state
 *   - JSON-compatible storage
 *   - No derived metrics
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /** @const {ReadonlyArray<string>} Required identity/location fields on every coverage record. */
  const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(['id', 'suiteId', 'file']);

  /**
   * @const {ReadonlyArray<string>} Required numeric count fields on every
   * coverage record. These are raw counts supplied by the producer;
   * this module validates their shape but never combines or derives
   * new values from them.
   */
  const REQUIRED_COUNT_FIELDS = Object.freeze([
    'linesCovered', 'linesTotal',
    'branchesCovered', 'branchesTotal',
    'functionsCovered', 'functionsTotal'
  ]);

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
   * validate raw coverage counts without interpreting or deriving
   * anything from them.
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
   * Deep-clones a coverage record via JSON round-trip (stripping any
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
   * Validates a raw coverage record before it is registered. Guards
   * against null, non-object, array, missing/empty identity fields,
   * and missing/invalid numeric count fields. Throws a descriptive,
   * actionable Error on failure. Does not check that covered <=
   * total or compute any ratio — that would constitute deriving a
   * statistic, which this module never does.
   * @param {*} record
   * @throws {Error}
   */
  function _validateDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[TestCoverage] coverage record must be a non-null, non-array object.');
    }
    REQUIRED_DESCRIPTOR_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[TestCoverage] coverage record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[TestCoverage] record.id must be a non-empty string.');
    }
    REQUIRED_COUNT_FIELDS.forEach(function (field) {
      if (!_isNonNegativeFiniteNumber(record[field])) {
        throw new Error('[TestCoverage] coverage record field "' + field + '" must be a non-negative finite number.');
      }
    });
  }

  /**
   * Registers a new coverage record.
   *
   * Descriptor shape:
   *   { id, suiteId, file, linesCovered, linesTotal,
   *     branchesCovered, branchesTotal, functionsCovered,
   *     functionsTotal, metadata }
   *
   * - id, suiteId, file, and all six count fields are required.
   * - metadata defaults to {} if omitted.
   * - Counts are stored exactly as supplied. This module never
   *   computes percentages, ratios, or any other derived statistic.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored descriptor
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateDescriptor(record);
    const id = _normalizeId(record.id);

    if (_registry.has(id)) {
      throw new Error('[TestCoverage] duplicate coverage record id: "' + id + '". Unregister it before re-registering.');
    }

    const descriptor = _deepFreezeCopy({
      id: id,
      suiteId: record.suiteId,
      file: record.file,
      linesCovered: record.linesCovered,
      linesTotal: record.linesTotal,
      branchesCovered: record.branchesCovered,
      branchesTotal: record.branchesTotal,
      functionsCovered: record.functionsCovered,
      functionsTotal: record.functionsTotal,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _registry.set(id, descriptor);
    return descriptor;
  }

  /**
   * Removes a registered coverage record by id.
   * @param {string} id
   * @returns {boolean} true if a record was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.delete(normalized);
  }

  /**
   * Retrieves a single registered coverage record by id.
   * @param {string} id
   * @returns {Object|null} frozen descriptor, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _registry.get(normalized) || null;
  }

  /**
   * Retrieves all registered coverage records.
   * @returns {ReadonlyArray<Object>} frozen array of frozen descriptors
   */
  function getAll() {
    return Object.freeze(Array.from(_registry.values()));
  }

  /**
   * Checks whether a coverage record with the given id is registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.has(normalized);
  }

  /**
   * Returns the number of currently registered coverage records.
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
  window.CozyOS.TestCoverage = Object.freeze({
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
