/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS OCR Studio — OCRResult
 * core/modules/ocrstudio/ocr-result.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Immutable OCR Result Descriptor Registry
 *
 * SINGLE RESPONSIBILITY
 *   Stores and exposes OCR result descriptors produced by certified
 *   OCR engines. Never performs OCR, extracts text, edits
 *   recognition output, recalculates confidence, translates,
 *   summarizes, spell-checks, or generates reports.
 *
 * ZERO LOGIC RULE — this module never:
 *   - performs OCR recognition
 *   - extracts text
 *   - preprocesses images
 *   - parses PDFs
 *   - performs layout analysis
 *   - calculates or recalculates confidence
 *   - modifies recognized text
 *   - translates text
 *   - summarizes text
 *   - spell-checks text
 *   - fabricates OCR output
 *   - modifies OCRRegistry, OCREngine, OCRDocument, OCRHistory,
 *     OCRExporter, OCRRunner, or OCRUI
 *   - accesses the DOM, filesystem, or network
 *   - uses localStorage or sessionStorage
 *   - executes plugins
 *
 *   OCR results are stored exactly as supplied by the certified
 *   producer.
 *
 * FROZEN DEPENDENCIES
 *   None. OCRResult is intentionally isolated — it depends on
 *   nobody. In particular, documentId and engineId are stored as
 *   opaque identifier strings only: this module never calls
 *   OCRDocument or OCREngine to verify they refer to anything real.
 *   Cross-referencing validation, if ever needed, belongs to a
 *   future consuming module, not to this isolated registry.
 *
 * OCR RESULT DESCRIPTOR
 *   { id, documentId, engineId, recognizedText, confidence, metadata }
 *
 *   Field notes:
 *   - id             — unique result identifier
 *   - documentId     — identifier of the originating OCR document
 *                      (opaque string; not verified against OCRDocument)
 *   - engineId       — identifier of the OCR engine that produced
 *                      the result (opaque string; not verified
 *                      against OCREngine or OCRRegistry)
 *   - recognizedText — opaque text payload; never interpreted or
 *                      modified. Validated only for presence — a
 *                      legitimately blank result ("") must not be
 *                      rejected as "missing"
 *   - confidence     — producer-supplied value, stored exactly as
 *                      received; never recalculated or validated
 *                      beyond presence. A legitimate 0 or false
 *                      confidence value must not be rejected as
 *                      "missing"
 *   - metadata       — optional producer metadata
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
 *   - Deterministic behavior
 *   - No hidden state
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
   * @const {ReadonlyArray<string>} Required identity/label fields on
   * every result descriptor. These are real identifiers and must be
   * non-empty strings. "recognizedText" and "confidence" are
   * deliberately excluded — they are opaque producer payloads
   * validated separately, for presence only (see
   * _validateResultDescriptor), because they may legitimately be
   * falsy values ("" for a blank result, 0 or false for a
   * confidence score) that must not be misread as "missing".
   */
  const REQUIRED_IDENTITY_FIELDS = Object.freeze(['id', 'documentId', 'engineId']);

  /**
   * @const {ReadonlyArray<string>} Opaque payload fields validated
   * for key-presence only (must not be `undefined`). Their value is
   * never inspected, typed, recalculated, or otherwise interpreted.
   */
  const REQUIRED_PAYLOAD_FIELDS = Object.freeze(['recognizedText', 'confidence']);

  /**
   * Internal store: Map<string, FrozenDescriptor>.
   * Map is used (not a plain object) to guarantee O(1) get/has/delete
   * and to avoid prototype-pollution surface area.
   * @type {Map<string, Object>}
   */
  let _results = new Map();

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
   * Deep-clones a result entry via JSON round-trip (stripping any
   * non-serializable content such as functions) and then deep-freezes
   * the clone. This guarantees stored entries are fully isolated from
   * the caller's original object and cannot be mutated later. Also
   * enforces that recognizedText/confidence/metadata are
   * JSON-compatible, since non-serializable values silently vanish
   * in the round-trip. This is plain isolation and freezing — the
   * result payload is never interpreted, recalculated, or executed.
   * @param {Object} entry
   * @returns {Object} frozen, deep-cloned entry
   */
  function _deepFreezeCopy(entry) {
    const copy = JSON.parse(JSON.stringify(entry));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw result record before it is registered. Guards
   * against null, non-object, array, missing/empty identity fields
   * (id, documentId, engineId), and missing opaque payload fields
   * (recognizedText, confidence). Throws a descriptive, actionable
   * Error on failure.
   *
   * recognizedText and confidence are validated only for presence
   * (the key must exist and not be undefined) — their values are
   * never inspected, typed, recalculated, or otherwise interpreted,
   * since both may legitimately be falsy ("", 0, false, null).
   *
   * @param {*} record
   * @throws {Error}
   */
  function _validateResultDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[OCRResult] registration record must be a non-null, non-array object.');
    }
    REQUIRED_IDENTITY_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[OCRResult] registration record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[OCRResult] record.id must be a non-empty string.');
    }
    REQUIRED_PAYLOAD_FIELDS.forEach(function (field) {
      if (!(field in record) || record[field] === undefined) {
        throw new Error('[OCRResult] registration record missing required field: "' + field + '".');
      }
    });
  }

  /**
   * Registers a new OCR result descriptor.
   *
   * Descriptor shape:
   *   { id, documentId, engineId, recognizedText, confidence, metadata }
   *
   * - id, documentId, engineId, recognizedText, and confidence are
   *   required.
   * - metadata defaults to {} if omitted.
   * - recognizedText and confidence are stored opaquely: this module
   *   never interprets, recalculates, or validates them beyond
   *   presence.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored entry
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateResultDescriptor(record);
    const id = _normalizeId(record.id);

    if (_results.has(id)) {
      throw new Error('[OCRResult] duplicate registration id: "' + id + '". Unregister it before re-registering.');
    }

    const entry = _deepFreezeCopy({
      id: id,
      documentId: record.documentId,
      engineId: record.engineId,
      recognizedText: record.recognizedText,
      confidence: record.confidence,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _results.set(id, entry);
    return entry;
  }

  /**
   * Removes a registered result descriptor by id.
   * @param {string} id
   * @returns {boolean} true if an entry was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _results.delete(normalized);
  }

  /**
   * Retrieves a single registered result descriptor by id.
   * @param {string} id
   * @returns {Object|null} frozen entry, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _results.get(normalized) || null;
  }

  /**
   * Retrieves all registered result descriptors.
   * @returns {ReadonlyArray<Object>} frozen array of frozen entries
   */
  function getAll() {
    return Object.freeze(Array.from(_results.values()));
  }

  /**
   * Checks whether a result descriptor with the given id is
   * registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _results.has(normalized);
  }

  /**
   * Returns the number of currently registered result descriptors.
   * @returns {number}
   */
  function count() {
    return _results.size;
  }

  /**
   * Resets the registry by replacing the internal Map with a new,
   * empty one. Does not replace or reassign the frozen public API
   * object, so re-registration works immediately after clear() and
   * hot-reload of the consuming module remains safe.
   * @returns {boolean} true, always
   */
  function clear() {
    _results = new Map();
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
  window.CozyOS.OCRResult = Object.freeze({
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
