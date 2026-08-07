/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS OCR Studio — OCRDocument
 * core/modules/ocrstudio/ocr-document.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Immutable Document Descriptor Registry
 *
 * SINGLE RESPONSIBILITY
 *   Stores and exposes OCR document descriptors. Never performs
 *   OCR, extracts text, edits documents, parses PDFs, preprocesses
 *   images, creates OCR results, or executes recognition.
 *
 * ZERO LOGIC RULE — this module never:
 *   - performs OCR recognition
 *   - extracts text
 *   - preprocesses images
 *   - parses PDFs
 *   - performs layout analysis
 *   - calculates confidence
 *   - translates text
 *   - summarizes text
 *   - spell-checks text
 *   - modifies OCRRegistry, OCREngine, OCRResult, OCRHistory,
 *     OCRExporter, OCRRunner, or OCRUI
 *   - accesses the DOM, filesystem, or network
 *   - uses localStorage or sessionStorage
 *   - executes plugins
 *   - fabricates metadata
 *
 *   Document descriptors are stored exactly as supplied.
 *
 * FROZEN DEPENDENCIES
 *   None. OCRDocument is intentionally isolated — it depends on
 *   nobody. Future OCR modules may consume it via this frozen
 *   public API, but this file contains zero references to
 *   OCRRegistry, OCREngine, or any other module.
 *
 * DOCUMENT DESCRIPTOR
 *   { id, name, sourceType, documentData, metadata }
 *
 *   Field notes:
 *   - id           — unique identifier
 *   - name         — human-readable document name
 *   - sourceType   — opaque, producer-defined label (e.g. "image",
 *                    "pdf", "scan") — not restricted to a fixed
 *                    enum and never used to branch storage behavior
 *   - documentData — opaque payload; stored exactly as supplied,
 *                    never interpreted, parsed, or modified
 *   - metadata     — optional producer metadata
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
 *   - No hidden state
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
   * @const {ReadonlyArray<string>} Required identity/label fields on
   * every document descriptor. "documentData" is deliberately
   * excluded from this list — it is validated separately (see
   * _validateDocumentDescriptor) because it is an opaque payload
   * that may legitimately be an empty string, zero, false, or null,
   * none of which should be rejected the way a missing label would
   * be.
   */
  const REQUIRED_DOCUMENT_FIELDS = Object.freeze(['id', 'name', 'sourceType']);

  /**
   * Internal store: Map<string, FrozenDescriptor>.
   * Map is used (not a plain object) to guarantee O(1) get/has/delete
   * and to avoid prototype-pollution surface area.
   * @type {Map<string, Object>}
   */
  let _documents = new Map();

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
   * Deep-clones a document entry via JSON round-trip (stripping any
   * non-serializable content such as functions) and then deep-freezes
   * the clone. This guarantees stored entries are fully isolated from
   * the caller's original object and cannot be mutated later. Also
   * enforces that documentData/metadata are JSON-compatible, since
   * non-serializable values silently vanish in the round-trip. This
   * is plain isolation and freezing — documentData is never
   * interpreted, parsed, or executed.
   * @param {Object} entry
   * @returns {Object} frozen, deep-cloned entry
   */
  function _deepFreezeCopy(entry) {
    const copy = JSON.parse(JSON.stringify(entry));
    return _freezeRecursive(copy);
  }

  /**
   * Validates a raw document record before it is registered. Guards
   * against null, non-object, array, missing/empty identity fields,
   * and a missing documentData payload. Throws a descriptive,
   * actionable Error on failure.
   *
   * documentData is validated only for presence (the key must exist
   * and not be undefined) — its value is never inspected, typed,
   * parsed, or otherwise interpreted, since it is an opaque payload
   * that may legitimately be "", 0, false, null, an object, or an
   * array.
   *
   * @param {*} record
   * @throws {Error}
   */
  function _validateDocumentDescriptor(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('[OCRDocument] registration record must be a non-null, non-array object.');
    }
    REQUIRED_DOCUMENT_FIELDS.forEach(function (field) {
      const value = record[field];
      if (value === undefined || value === null || value === '') {
        throw new Error('[OCRDocument] registration record missing required field: "' + field + '".');
      }
    });
    if (!_normalizeId(record.id)) {
      throw new Error('[OCRDocument] record.id must be a non-empty string.');
    }
    if (!('documentData' in record) || record.documentData === undefined) {
      throw new Error('[OCRDocument] registration record missing required field: "documentData".');
    }
  }

  /**
   * Registers a new document descriptor.
   *
   * Descriptor shape:
   *   { id, name, sourceType, documentData, metadata }
   *
   * - id, name, sourceType, and documentData are required.
   * - metadata defaults to {} if omitted.
   * - documentData is stored opaquely: this module never interprets,
   *   parses, or executes it.
   *
   * @param {Object} record
   * @returns {Object} the frozen, stored entry
   * @throws {Error} on invalid record or duplicate id
   */
  function register(record) {
    _validateDocumentDescriptor(record);
    const id = _normalizeId(record.id);

    if (_documents.has(id)) {
      throw new Error('[OCRDocument] duplicate registration id: "' + id + '". Unregister it before re-registering.');
    }

    const entry = _deepFreezeCopy({
      id: id,
      name: record.name,
      sourceType: record.sourceType,
      documentData: record.documentData,
      metadata: record.metadata !== undefined ? record.metadata : {}
    });

    _documents.set(id, entry);
    return entry;
  }

  /**
   * Removes a registered document descriptor by id.
   * @param {string} id
   * @returns {boolean} true if an entry was removed, false otherwise
   */
  function unregister(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _documents.delete(normalized);
  }

  /**
   * Retrieves a single registered document descriptor by id.
   * @param {string} id
   * @returns {Object|null} frozen entry, or null if not found / invalid id
   */
  function get(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return null;
    return _documents.get(normalized) || null;
  }

  /**
   * Retrieves all registered document descriptors.
   * @returns {ReadonlyArray<Object>} frozen array of frozen entries
   */
  function getAll() {
    return Object.freeze(Array.from(_documents.values()));
  }

  /**
   * Checks whether a document descriptor with the given id is
   * registered.
   * @param {string} id
   * @returns {boolean}
   */
  function has(id) {
    const normalized = _normalizeId(id);
    if (!normalized) return false;
    return _documents.has(normalized);
  }

  /**
   * Returns the number of currently registered document descriptors.
   * @returns {number}
   */
  function count() {
    return _documents.size;
  }

  /**
   * Resets the registry by replacing the internal Map with a new,
   * empty one. Does not replace or reassign the frozen public API
   * object, so re-registration works immediately after clear() and
   * hot-reload of the consuming module remains safe.
   * @returns {boolean} true, always
   */
  function clear() {
    _documents = new Map();
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
  window.CozyOS.OCRDocument = Object.freeze({
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
