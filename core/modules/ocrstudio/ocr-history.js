/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS OCR Studio — OCRHistory
 * core/modules/ocrstudio/ocr-history.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Immutable History Record Registry
 *
 * SINGLE RESPONSIBILITY
 *   Store and expose immutable OCR history records produced by
 *   external OCR execution modules. Nothing else.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes OCR
 *   - recognizes text
 *   - preprocesses images
 *   - parses OCR output
 *   - translates text
 *   - summarizes text
 *   - spellchecks text
 *   - calculates confidence
 *   - recalculates statistics
 *   - formats reports
 *   - exports history
 *   - modifies OCRRegistry, OCRDocument, OCREngine, OCRResult,
 *     OCRRunner, OCRExporter, or OCRDashboard
 *   - accesses the DOM, filesystem, or network
 *   - uses timers
 *   - uses localStorage or sessionStorage
 *   - uses fetch or XMLHttpRequest
 *
 *   History entries are accepted exactly as supplied. Nothing is
 *   derived.
 *
 * FROZEN DEPENDENCIES
 *   None. OCRHistory is intentionally isolated — it depends on
 *   nobody. requestId, documentId, and engineId are stored as
 *   opaque identifier strings only: this module never calls
 *   OCRRunner, OCREngine, or OCRDocument to verify they refer to
 *   anything real. Future modules will read from OCRHistory; it
 *   does not read from them.
 *
 * HISTORY DESCRIPTOR
 *   { id, requestId, documentId, engineId, status, recognizedText,
 *     confidence, startedAt, completedAt, metadata }
 *
 *   Field notes:
 *   - id             — unique history record identifier (identity
 *                      field; non-empty string required)
 *   - requestId      — identifier of the originating execution
 *                      request (identity field; opaque string; not
 *                      verified against OCRRunner/OCREngine)
 *   - documentId     — identifier of the originating document
 *                      (identity field; opaque string; not verified
 *                      against OCRDocument)
 *   - engineId       — identifier of the OCR engine involved
 *                      (identity field; opaque string; not verified
 *                      against OCRRegistry/OCREngine)
 *   - status         — producer-supplied opaque value; validated
 *                      only for presence (key must exist and not be
 *                      undefined) — never inspected, typed, or
 *                      otherwise interpreted
 *   - recognizedText — opaque payload; never interpreted or
 *                      modified. Validated only for presence — a
 *                      legitimately blank value ("") must not be
 *                      rejected as "missing"
 *   - confidence     — producer-supplied value, stored exactly as
 *                      received; never recalculated or validated
 *                      beyond presence. A legitimate 0 or false
 *                      confidence value must not be rejected as
 *                      "missing"
 *   - startedAt      — opaque producer-supplied timestamp;
 *                      validated only for presence
 *   - completedAt    — opaque producer-supplied timestamp;
 *                      validated only for presence
 *   - metadata       — optional producer metadata; defaults to {}
 *
 *   id, requestId, documentId, and engineId are identity fields:
 *   they must be non-empty strings (undefined, null, and "" are all
 *   rejected as missing). status, recognizedText, confidence,
 *   startedAt, and completedAt are opaque payload fields: they are
 *   rejected only when the key is truly absent (undefined) —
 *   legitimate falsy values ("", 0, false, null) are accepted and
 *   stored exactly as supplied. This module never validates any of
 *   the five payload fields beyond that presence check; they belong
 *   to producers.
 *
 * INTERNAL DESIGN RULES
 *   - Map storage
 *   - O(1) lookup
 *   - Deep-freeze descriptors
 *   - JSON round-trip isolation
 *   - Duplicate ID protection
 *   - Immutable return values
 *   - Frozen public API
 *   - Hot-reload safe
 *   - JSON-compatible storage
 *   - No hidden state
 *   - No side effects
 *   - Deterministic behavior
 *   - CSP compliant (no eval, no inline handlers, no dynamic code)
 *   - ES2022
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /**
   * @const {ReadonlyArray<string>} Required identity fields on every
   * history record. These are real identifiers and must be
   * non-empty strings (undefined, null, and "" are all rejected).
   */
  const REQUIRED_IDENTITY_FIELDS = Object.freeze(['id', 'requestId', 'documentId', 'engineId']);

  /**
   * @const {ReadonlyArray<string>} Opaque payload fields validated
   * for key-presence only (must not be `undefined`). Their values
   * are never inspected, typed, recalculated, or otherwise
   * interpreted — they may legitimately be falsy ("", 0, false,
   * null).
   */
  const REQUIRED_PAYLOAD_FIELDS = Object.freeze(['status', 'recognizedText', 'confidence', 'startedAt', 'completedAt']);

  /**
   * Internal store: Map<string, FrozenDescriptor>.
   * Map is used (not a plain object) to guarantee O(1) get/has/delete
   * and to avoid prototype-pollution surface area.
   * @type {Map<string, Object>}
   */
  let _history = new Map();

  /**
   * Normalizes a candidate id into a trimmed, non-empty string, or
   * null if the candidate is not usable as an id.
   * @param {*} id
   * @returns {string|null}
   */
  function _normalizeId(id) {
    if (typeof id !== 'string') return null;
    const trimmed = id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Recursively freezes an object graph in place (objects and
   * arrays). Primitives are returned as-is.
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
   * Deep-clones a history entry via JSON round-trip (stripping any
   * non-serializable content such as functions) and then deep-freezes
   * the clone. This guarantees stored entries are fully isolated from
   * the caller's original object and cannot be mutated later. Also
   * enforces that the payload fields and metadata are JSON-compatible,
   * since non-serializable values silently vanish in the round-trip.
   * This is plain isolation and freezing — nothing in the entry is
   * interpreted, recalculated, or executed.
   * @param {Object} entry
   * @returns {Object} frozen, deep-cloned entry
   */
  function _deepFreezeCopy(entry) {
    const copy = JSON.parse(JSON.stringify(entry));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw history record before it is registered. Guards
   * against null, non-object, array, missing/empty identity fields
   * (id, requestId, documentId, engineId), and missing opaque
   * payload fields (status, recognizedText, confidence, startedAt,
   * completedAt). Throws a descriptive, actionable Error on failure.
   *
   * The five payload fields are validated only for presence (the
   * key must exist and not be undefined) — their values are never
   * inspected, typed, recalculated, or otherwise interpreted, since
   * they may legitimately be falsy ("", 0, false, null).
   *
   * @param {*} record
   * @throws {Error}
   */
  function _validateHistoryDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[OCRHistory] registration record must be a non-null, non-array object.');
    }
    REQUIRED_IDENTITY_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[OCRHistory] registration record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[OCRHistory] record.id must be a non-empty string.');
    }
    REQUIRED_PAYLOAD_FIELDS.forEach(function (field) {
      if (!(field in record) || record[field] === undefined) {
        throw new Error('[OCRHistory] registration record missing required field: "' + field + '".');
      }
    });
  }

  /**
   * Registers a new OCR history record.
   *
   * Descriptor shape:
   *   { id, requestId, documentId, engineId, status, recognizedText,
   *     confidence, startedAt, completedAt, metadata }
   *
   * - id, requestId, documentId, and engineId are required
   *   non-empty-string identity fields.
   * - status, recognizedText, confidence, startedAt, and
   *   completedAt are required opaque payload fields, validated only
   *   for presence.
   * - metadata defaults to {} if omitted.
   * - All payload fields are stored exactly as supplied: this module
   *   never interprets, recalculates, or validates them beyond
   *   presence.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored entry
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateHistoryDescriptor(record);
    const id = _normalizeId(record.id);

    if (_history.has(id)) {
      throw new Error('[OCRHistory] duplicate registration id: "' + id + '". Unregister it before re-registering.');
    }

    const entry = _deepFreezeCopy({
      id: id,
      requestId: record.requestId,
      documentId: record.documentId,
      engineId: record.engineId,
      status: record.status,
      recognizedText: record.recognizedText,
      confidence: record.confidence,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _history.set(id, entry);
    return entry;
  }

  /**
   * Removes a registered history record by id.
   * @param {string} id
   * @returns {boolean} true if an entry was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _history.delete(normalized);
  }

  /**
   * Retrieves a single registered history record by id.
   * @param {string} id
   * @returns {Object|null} frozen entry, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _history.get(normalized) || null;
  }

  /**
   * Retrieves all registered history records.
   * @returns {ReadonlyArray<Object>} frozen array of frozen entries
   */
  function getAll() {
    return Object.freeze(Array.from(_history.values()));
  }

  /**
   * Checks whether a history record with the given id is registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _history.has(normalized);
  }

  /**
   * Returns the number of currently registered history records.
   * @returns {number}
   */
  function count() {
    return _history.size;
  }

  /**
   * Resets the registry by replacing the internal Map with a new,
   * empty one. Does not replace or reassign the frozen public API
   * object, so re-registration works immediately after clear() and
   * hot-reload of the consuming module remains safe.
   * @returns {boolean} true, always
   */
  function clear() {
    _history = new Map();
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
   * Frozen public API. Exactly eight methods. No private members
   * are exposed.
   */
  window.CozyOS.OCRHistory = Object.freeze({
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
