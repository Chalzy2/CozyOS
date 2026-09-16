/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Test Studio — TestPackage
 * core/modules/teststudio/test-package.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Packaging Layer — Package / Manifest Registry
 *
 * SINGLE RESPONSIBILITY
 *   Stores immutable Test Studio package manifests supplied by
 *   external producers without loading, installing, validating,
 *   executing, resolving, or publishing packages.
 *
 * ZERO LOGIC RULE — this module never:
 *   - installs packages
 *   - loads packages
 *   - executes packages
 *   - imports modules
 *   - exports modules
 *   - resolves dependencies
 *   - validates dependency graphs
 *   - downloads packages
 *   - publishes packages
 *   - performs assertions
 *   - executes tests
 *   - formats reports
 *   - modifies registry
 *   - modifies runner
 *   - modifies reporter
 *   - modifies scheduler
 *   - modifies plugins
 *   - modifies environments
 *   - modifies coverage
 *   - modifies benchmarks
 *   - modifies snapshots
 *   - modifies fixtures
 *   - modifies mocks
 *   - accesses DOM
 *   - accesses filesystem
 *   - accesses network
 *   - uses timers
 *   - uses localStorage
 *   - uses sessionStorage
 *   - calculates versions
 *   - resolves semantic versions
 *   - fabricates metadata
 *
 *   Package manifests are accepted exactly as supplied by a
 *   certified producer.
 *
 * FROZEN DEPENDENCIES
 *   None. Like every registry introduced after TestPlugin,
 *   TestPackage is completely isolated. Future package managers
 *   may write into it. Future installers may read from it. The
 *   registry itself depends on nobody.
 *
 * PACKAGE DESCRIPTOR
 *   { id, packageName, version, manifest, metadata }
 *
 *   Field notes:
 *   - id          — unique registry identifier
 *   - packageName — package identity supplied by the producer
 *   - version     — opaque version string; the registry never
 *                   parses or compares semantic versions
 *   - manifest    — opaque, serializable package descriptor;
 *                   never loaded, resolved, or interpreted
 *   - metadata    — optional producer metadata
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
 *   - No dependency resolution
 *   - No installation logic
 *   - No semantic version parsing
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /**
   * @const {ReadonlyArray<string>} Required identity/label fields on
   * every package descriptor. "manifest" is deliberately excluded
   * from this list — it is validated separately (see
   * _validateDescriptor) because it is an opaque payload that may
   * legitimately be an empty string, zero, false, or null, none of
   * which should be rejected the way a missing label would be.
   */
  const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(['id', 'packageName', 'version']);

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
   * Deep-clones a package descriptor via JSON round-trip (stripping
   * any non-serializable content such as functions) and then
   * deep-freezes the clone. This guarantees stored descriptors are
   * fully isolated from the caller's original object and cannot be
   * mutated later. Also enforces that manifest/metadata are
   * JSON-compatible, since non-serializable values silently vanish
   * in the round-trip. This is plain isolation and freezing — the
   * version string is never parsed and the manifest is never
   * resolved or interpreted.
   * @param {Object} record
   * @returns {Object} frozen, deep-cloned descriptor
   */
  function _deepFreezeCopy(record) {
    const copy = JSON.parse(JSON.stringify(record));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw package descriptor before it is registered.
   * Guards against null, non-object, array, missing/empty identity
   * fields, and a missing manifest payload. Throws a descriptive,
   * actionable Error on failure.
   *
   * manifest is validated only for presence (the key must exist and
   * not be undefined) — its value is never inspected, typed,
   * resolved, or otherwise interpreted, since it is an opaque
   * payload that may legitimately be "", 0, false, null, an object,
   * or an array. version is treated as a required identity field and
   * validated only for non-empty presence — it is never parsed as
   * semver or compared against any other version.
   *
   * @param {*} record
   * @throws {Error}
   */
  function _validateDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[TestPackage] package record must be a non-null, non-array object.');
    }
    REQUIRED_DESCRIPTOR_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[TestPackage] package record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[TestPackage] record.id must be a non-empty string.');
    }
    if (!('manifest' in record) || record.manifest === undefined) {
      throw new Error('[TestPackage] package record missing required field: "manifest".');
    }
  }

  /**
   * Registers a new package descriptor.
   *
   * Descriptor shape:
   *   { id, packageName, version, manifest, metadata }
   *
   * - id, packageName, version, and manifest are required.
   * - metadata defaults to {} if omitted.
   * - version is stored as an opaque string: this module never
   *   parses, compares, or resolves semantic versions.
   * - manifest is stored opaquely: this module never loads,
   *   installs, executes, or resolves it.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored descriptor
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateDescriptor(record);
    const id = _normalizeId(record.id);

    if (_registry.has(id)) {
      throw new Error('[TestPackage] duplicate package record id: "' + id + '". Unregister it before re-registering.');
    }

    const descriptor = _deepFreezeCopy({
      id: id,
      packageName: record.packageName,
      version: record.version,
      manifest: record.manifest,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _registry.set(id, descriptor);
    return descriptor;
  }

  /**
   * Removes a registered package descriptor by id.
   * @param {string} id
   * @returns {boolean} true if a record was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.delete(normalized);
  }

  /**
   * Retrieves a single registered package descriptor by id.
   * @param {string} id
   * @returns {Object|null} frozen descriptor, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _registry.get(normalized) || null;
  }

  /**
   * Retrieves all registered package descriptors.
   * @returns {ReadonlyArray<Object>} frozen array of frozen descriptors
   */
  function getAll() {
    return Object.freeze(Array.from(_registry.values()));
  }

  /**
   * Checks whether a package descriptor with the given id is registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.has(normalized);
  }

  /**
   * Returns the number of currently registered package descriptors.
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
  window.CozyOS.TestPackage = Object.freeze({
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
