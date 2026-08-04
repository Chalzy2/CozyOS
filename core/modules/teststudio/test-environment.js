/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Test Studio — TestEnvironment
 * core/modules/teststudio/test-environment.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Execution Environment Registry
 *
 * SINGLE RESPONSIBILITY
 *   Registers, stores, and exposes immutable execution environment
 *   descriptors for Test Studio without executing or modifying
 *   tests.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes tests
 *   - schedules tests
 *   - performs assertions
 *   - formats reports
 *   - stores history
 *   - registers test suites
 *   - modifies TestRunner
 *   - modifies TestRegistry
 *   - modifies TestScheduler
 *   - modifies TestPlugin
 *   - modifies TestReporter
 *   - modifies TestHistory
 *   - accesses the DOM
 *   - uses timers
 *   - uses localStorage
 *   - uses sessionStorage
 *   - accesses network
 *   - accesses filesystem
 *   - fabricates environment data
 *
 *   It is purely an environment registry.
 *
 * FROZEN DEPENDENCIES
 *   None required in v1.0.0. This module is intentionally
 *   self-contained. Other modules (such as TestRunner) may later
 *   read registered environments through its public API, but
 *   TestEnvironment does not depend on them.
 *
 * ENVIRONMENT DESCRIPTOR
 *   { id, name, version, platform, configuration, metadata }
 *
 *   The descriptor is stored exactly as supplied (after validation
 *   and deep freezing). The module does not interpret
 *   configuration values.
 *
 * INTERNAL DESIGN RULES
 *   - Map-based storage
 *   - O(1) lookup
 *   - Deep-freeze stored descriptors
 *   - Duplicate ID protection
 *   - Immutable return values
 *   - Hot-reload safe
 *   - No hidden execution
 *   - No environment activation
 *   - No runtime switching
 *   - No side effects
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /** @const {ReadonlyArray<string>} Required fields on every environment descriptor. */
  const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(['id', 'name', 'version', 'platform']);

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
   * Deep-clones an environment descriptor via JSON round-trip
   * (stripping any non-serializable content such as functions) and
   * then deep-freezes the clone. This guarantees stored descriptors
   * are fully isolated from the caller's original object and cannot
   * be mutated later. Also enforces that configuration/metadata are
   * JSON-compatible, since non-serializable values silently vanish
   * in the round-trip.
   * @param {Object} environment
   * @returns {Object} frozen, deep-cloned descriptor
   */
  function _deepFreezeCopy(environment) {
    const copy = JSON.parse(JSON.stringify(environment));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw environment descriptor before it is registered.
   * Guards against null, non-object, array, and missing/empty
   * required fields. Throws a descriptive, actionable Error on
   * failure.
   * @param {*} environment
   * @throws {Error}
   */
  function _validateDescriptor(environment) {
    if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
      throw new Error('[TestEnvironment] environment descriptor must be a non-null, non-array object.');
    }
    REQUIRED_DESCRIPTOR_FIELDS.forEach(function (field) {
      const value = environment[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[TestEnvironment] environment descriptor missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(environment.id)) {
      throw new Error('[TestEnvironment] environment.id must be a non-empty string.');
    }
  }

  /**
   * Registers a new execution environment.
   *
   * Descriptor shape:
   *   { id, name, version, platform, configuration, metadata }
   *
   * - id, name, version, platform are required.
   * - configuration defaults to {} if omitted.
   * - metadata defaults to {} if omitted.
   * - configuration is stored opaquely: this module does not
   *   interpret, validate, or act on configuration values.
   *
   * @param {Object} environment
   * @returns {Object} the frozen, stored descriptor
   * @throws {Error} on invalid descriptor or duplicate id
   */
  function register(environment) {
    _validateDescriptor(environment);
    const id = _normalizeId(environment.id);

    if (_registry.has(id)) {
      throw new Error('[TestEnvironment] duplicate environment id: "' + id + '". Unregister it before re-registering.');
    }

    const descriptor = _deepFreezeCopy({
      id: id,
      name: environment.name,
      version: environment.version,
      platform: environment.platform,
      configuration: environment.configuration !== undefined ? environment.configuration : {},
      metadata: environment.metadata !== undefined ? environment.metadata : {}
    });

    _registry.set(id, descriptor);
    return descriptor;
  }

  /**
   * Removes a registered environment by id.
   * @param {string} id
   * @returns {boolean} true if an environment was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.delete(normalized);
  }

  /**
   * Retrieves a single registered environment descriptor by id.
   * @param {string} id
   * @returns {Object|null} frozen descriptor, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _registry.get(normalized) || null;
  }

  /**
   * Retrieves all registered environment descriptors.
   * @returns {ReadonlyArray<Object>} frozen array of frozen descriptors
   */
  function getAll() {
    return Object.freeze(Array.from(_registry.values()));
  }

  /**
   * Checks whether an environment with the given id is registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.has(normalized);
  }

  /**
   * Returns the number of currently registered environments.
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
  window.CozyOS.TestEnvironment = Object.freeze({
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
