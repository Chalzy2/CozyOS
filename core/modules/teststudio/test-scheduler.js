/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Test Studio — TestScheduler
 * core/modules/teststudio/test-scheduler.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Execution Scheduling
 *
 * SINGLE RESPONSIBILITY
 *   Schedules certified test execution requests without executing
 *   tests itself.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes tests directly
 *   - performs assertions
 *   - formats reports
 *   - stores history
 *   - modifies registry
 *   - modifies runner
 *   - modifies reporter
 *   - modifies plugins
 *   - modifies dashboard
 *   - recalculates results
 *   - fabricates statistics
 *   - accesses DOM
 *   - uses localStorage
 *   - uses sessionStorage
 *   - accesses filesystem
 *   - accesses network
 *
 *   It only stores and manages execution schedules. The scheduler
 *   may request execution through TestRunner.run() or
 *   TestRunner.runAll() when a scheduled task is triggered, but it
 *   must never contain test execution logic itself. (Triggering is
 *   deferred to the consuming module in v1.0.0 — see Internal
 *   Design Rules below.)
 *
 * FROZEN DEPENDENCIES (public APIs only, no private access)
 *   window.CozyOS.TestRunner
 *   window.CozyOS.TestRegistry
 *
 * INTERNAL DESIGN RULES
 *   - Map-based storage (O(1) lookup)
 *   - Deep-freeze stored descriptors
 *   - Duplicate ID protection
 *   - Immutable return values
 *   - No timers in v1.0.0
 *   - No background execution
 *   - No hidden state outside the scheduler registry
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /** @const {ReadonlyArray<string>} Required fields on every task descriptor. */
  const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(['id', 'suiteId', 'trigger']);

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
   * return path so callers can never mutate scheduler-owned state.
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
   * Deep-clones a task descriptor via JSON round-trip (stripping any
   * non-serializable content such as functions) and then deep-freezes
   * the clone. This guarantees stored descriptors are fully isolated
   * from the caller's original object and cannot be mutated later.
   * @param {Object} task
   * @returns {Object} frozen, deep-cloned descriptor
   */
  function _deepFreezeCopy(task) {
    const copy = JSON.parse(JSON.stringify(task));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw task descriptor before it is scheduled. Guards
   * against null, non-object, array, and missing/empty required
   * fields. Throws a descriptive, actionable Error on failure.
   * @param {*} task
   * @throws {Error}
   */
  function _validateDescriptor(task) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      throw new Error('[TestScheduler] task descriptor must be a non-null, non-array object.');
    }
    REQUIRED_DESCRIPTOR_FIELDS.forEach(function (field) {
      const value = task[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[TestScheduler] task descriptor missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(task.id)) {
      throw new Error('[TestScheduler] task.id must be a non-empty string.');
    }
  }

  /**
   * Schedules a new test task.
   *
   * Descriptor shape:
   *   { id, suiteId, trigger, enabled, metadata }
   *
   * - id, suiteId, trigger are required.
   * - enabled defaults to true if omitted.
   * - metadata defaults to {} if omitted.
   * - trigger is stored opaquely: the scheduler does not interpret,
   *   parse, or validate trigger expressions beyond preserving them.
   *
   * @param {Object} task
   * @returns {Object} the frozen, stored descriptor
   * @throws {Error} on invalid descriptor or duplicate id
   */
  function schedule(task) {
    _validateDescriptor(task);
    const id = _normalizeId(task.id);

    if (_registry.has(id)) {
      throw new Error('[TestScheduler] duplicate schedule id: "' + id + '". Unschedule it before re-scheduling.');
    }

    const descriptor = _deepFreezeCopy({
      id: id,
      suiteId: task.suiteId,
      trigger: task.trigger,
      enabled: task.enabled !== undefined ? task.enabled : true,
      metadata: task.metadata !== undefined ? task.metadata : {}
    });

    _registry.set(id, descriptor);
    return descriptor;
  }

  /**
   * Removes a scheduled task by id.
   * @param {string} id
   * @returns {boolean} true if a task was removed, false otherwise
   */
  function unschedule(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.delete(normalized);
  }

  /**
   * Retrieves a single scheduled task descriptor by id.
   * @param {string} id
   * @returns {Object|null} frozen descriptor, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _registry.get(normalized) || null;
  }

  /**
   * Retrieves all scheduled task descriptors.
   * @returns {ReadonlyArray<Object>} frozen array of frozen descriptors
   */
  function getAll() {
    return Object.freeze(Array.from(_registry.values()));
  }

  /**
   * Checks whether a task with the given id is currently scheduled.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.has(normalized);
  }

  /**
   * Returns the number of currently scheduled tasks.
   * @returns {number}
   */
  function count() {
    return _registry.size;
  }

  /**
   * Resets the scheduler by replacing the internal Map with a new,
   * empty one. Does not replace or reassign the frozen public API
   * object, so re-scheduling works immediately after clear() and
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
  window.CozyOS.TestScheduler = Object.freeze({
    schedule: schedule,
    unschedule: unschedule,
    get: get,
    getAll: getAll,
    has: has,
    count: count,
    clear: clear,
    getVersion: getVersion
  });
})();
