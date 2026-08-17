/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS OCR Studio — OCRRegistry
 * core/modules/ocrstudio/ocr-registry.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Root Descriptor Registry
 *
 * SINGLE RESPONSIBILITY
 *   Stores immutable, generic registration descriptors for the
 *   OCR Studio subsystem without performing OCR recognition,
 *   execution, or interpretation of any registered payload.
 *
 * ZERO LOGIC RULE — this module never:
 *   - performs OCR recognition
 *   - calculates confidence
 *   - modifies recognition results
 *   - fabricates extracted text
 *   - corrects spelling
 *   - translates text
 *   - summarizes text
 *   - executes plugins
 *   - executes any registered descriptor
 *   - accesses private module state
 *   - accesses filesystem directly
 *   - accesses network directly
 *   - accesses localStorage
 *   - accesses sessionStorage
 *   - modifies other Core modules
 *   - formats reports
 *   - stores history
 *
 *   Registration descriptors are accepted exactly as supplied by
 *   a certified producer.
 *
 * FROZEN DEPENDENCIES
 *   None. Consistent with every registry-style module in the
 *   frozen Test Studio subsystem, OCRRegistry is completely
 *   isolated. The registry itself depends on nobody. Other OCR
 *   Studio modules (ocr-engine, ocr-document, ocr-result, etc.)
 *   are themselves independent, self-contained registries and do
 *   not depend on OCRRegistry either — this module does not act
 *   as a shared base class or utility that other modules import.
 *
 * REGISTRY DESCRIPTOR
 *   { id, name, category, descriptor, metadata }
 *
 *   Field notes:
 *   - id         — unique registry identifier
 *   - name       — human-readable label supplied by the producer
 *   - category   — producer-defined classification label (e.g.
 *                  "engine", "document", "plugin") — an opaque
 *                  string, not restricted to a fixed enum and
 *                  never used to branch storage behavior
 *   - descriptor — opaque, serializable registration payload;
 *                  stored exactly as supplied, never interpreted,
 *                  executed, or resolved
 *   - metadata   — optional producer metadata
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
 *   - No execution of registered descriptors
 *   - CSP compliant (no eval, no inline handlers, no dynamic code)
 *   - ES2022, deterministic, no fabricated data
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /**
   * @const {ReadonlyArray<string>} Required identity/label fields on
   * every registry descriptor. "descriptor" is deliberately excluded
   * from this list — it is validated separately (see
   * _validateDescriptor) because it is an opaque payload that may
   * legitimately be an empty string, zero, false, or null, none of
   * which should be rejected the way a missing label would be.
   */
  const REQUIRED_DESCRIPTOR_FIELDS = Object.freeze(['id', 'name', 'category']);

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
   * Deep-clones a registry entry via JSON round-trip (stripping any
   * non-serializable content such as functions) and then deep-freezes
   * the clone. This guarantees stored entries are fully isolated from
   * the caller's original object and cannot be mutated later. Also
   * enforces that descriptor/metadata are JSON-compatible, since
   * non-serializable values silently vanish in the round-trip. This
   * is plain isolation and freezing — the descriptor payload is
   * never interpreted or executed.
   * @param {Object} entry
   * @returns {Object} frozen, deep-cloned entry
   */
  function _deepFreezeCopy(entry) {
    const copy = JSON.parse(JSON.stringify(entry));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw registration record before it is registered.
   * Guards against null, non-object, array, missing/empty identity
   * fields, and a missing descriptor payload. Throws a descriptive,
   * actionable Error on failure.
   *
   * descriptor is validated only for presence (the key must exist
   * and not be undefined) — its value is never inspected, typed,
   * executed, or otherwise interpreted, since it is an opaque
   * payload that may legitimately be "", 0, false, null, an object,
   * or an array.
   *
   * @param {*} record
   * @throws {Error}
   */
  function _validateDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[OCRRegistry] registration record must be a non-null, non-array object.');
    }
    REQUIRED_DESCRIPTOR_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[OCRRegistry] registration record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[OCRRegistry] record.id must be a non-empty string.');
    }
    if (!('descriptor' in record) || record.descriptor === undefined) {
      throw new Error('[OCRRegistry] registration record missing required field: "descriptor".');
    }
  }

  /**
   * Registers a new entry in the root OCR Studio registry.
   *
   * Descriptor shape:
   *   { id, name, category, descriptor, metadata }
   *
   * - id, name, category, and descriptor are required.
   * - metadata defaults to {} if omitted.
   * - descriptor is stored opaquely: this module never executes,
   *   resolves, or interprets it.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored entry
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateDescriptor(record);
    const id = _normalizeId(record.id);

    if (_registry.has(id)) {
      throw new Error('[OCRRegistry] duplicate registration id: "' + id + '". Unregister it before re-registering.');
    }

    const entry = _deepFreezeCopy({
      id: id,
      name: record.name,
      category: record.category,
      descriptor: record.descriptor,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _registry.set(id, entry);
    return entry;
  }

  /**
   * Removes a registered entry by id.
   * @param {string} id
   * @returns {boolean} true if an entry was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.delete(normalized);
  }

  /**
   * Retrieves a single registered entry by id.
   * @param {string} id
   * @returns {Object|null} frozen entry, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _registry.get(normalized) || null;
  }

  /**
   * Retrieves all registered entries.
   * @returns {ReadonlyArray<Object>} frozen array of frozen entries
   */
  function getAll() {
    return Object.freeze(Array.from(_registry.values()));
  }

  /**
   * Checks whether an entry with the given id is registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _registry.has(normalized);
  }

  /**
   * Returns the number of currently registered entries.
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
   * Frozen public API. Exactly eight methods, matching the
   * registry-family contract established by the frozen Test Studio
   * subsystem. No private members are exposed.
   */
  window.CozyOS.OCRRegistry = Object.freeze({
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
