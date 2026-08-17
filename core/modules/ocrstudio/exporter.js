/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS OCR Studio — OCRExporter
 * core/modules/ocrstudio/ocr-exporter.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — History Serialization
 *
 * SINGLE RESPONSIBILITY
 *   Serialize OCR history into exportable formats (JSON, TEXT).
 *   Nothing else.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes OCR
 *   - recognizes text
 *   - preprocesses images
 *   - parses images
 *   - parses PDFs
 *   - recalculates confidence
 *   - recalculates statistics
 *   - modifies OCRHistory, OCRRegistry, OCRRunner, OCRDocument,
 *     OCRResult, or any other registry
 *   - creates fake history
 *   - fabricates OCR results
 *   - translates text
 *   - summarizes text
 *   - spellchecks text
 *   - accesses the network
 *   - uses fetch or XMLHttpRequest
 *   - uses localStorage or sessionStorage
 *   - uses timers
 *   - accesses the filesystem
 *
 *   It only serializes existing history, exactly as supplied.
 *
 * FROZEN DEPENDENCIES — VERIFIED, NOT ASSUMED
 *   window.CozyOS.OCRHistory (v1.0.0) — read-only:
 *     - OCRHistory.getAll() → frozen array of frozen entries
 *   Used only by exportHistory(). No other OCRHistory method is
 *   called. This module never registers, unregisters, or clears
 *   OCRHistory entries, and never mutates any value returned by it.
 *   No other module dependency exists.
 *
 * PUBLIC API
 *   Exactly five methods:
 *     - exportJSON(history)
 *     - exportText(history)
 *     - exportHistory()
 *     - download(filename, data)
 *     - getVersion()
 *
 * OUTPUT FORMATS
 *   JSON — a deep-copied, isolated, pretty-printed JSON string of
 *     exactly the input structure (array stays an array; a single
 *     object stays a single object). No wrapper metadata is added.
 *   TEXT — a readable plain-text report, one block per history
 *     entry, listing only the known OCR history fields (id,
 *     requestId, documentId, engineId, status, recognizedText,
 *     confidence, startedAt, completedAt, metadata). A field that
 *     is truly absent (undefined) on a given entry is rendered as
 *     "—" — never inferred, never recalculated. A field that is
 *     present with a falsy value (0, false, "", null) is rendered
 *     as that literal value, since a falsy value is not "missing".
 *   No HTML, no PDF, no CSV, no ZIP, and no filesystem writes are
 *   produced by this module.
 *
 * NEW CONTRACTS INTRODUCED BY THIS FILE (flagged; not inferred from
 * any other module — see certification Architecture Review)
 *   - exportHistory() is defined here as: read OCRHistory.getAll(),
 *     then return exportJSON() of that array. "Serialized export"
 *     was not further specified upstream, so this file adopts the
 *     narrowest, least-invented reading: it reuses exportJSON's
 *     existing, already-specified behavior rather than inventing a
 *     new serialization shape.
 *   - download(filename, data) requires real browser Blob/URL/DOM
 *     APIs. When they are not present (e.g. a non-browser test
 *     environment), it throws a descriptive Error rather than
 *     silently no-oping or fabricating a successful download — the
 *     same architectural-honesty principle used elsewhere in this
 *     subsystem for capabilities that cannot legitimately execute
 *     in the current environment.
 *   - download() returns `true` on success as a minimal completion
 *     signal; this return value was not specified upstream.
 *
 * INTERNAL DESIGN RULES
 *   - No module state, no caches, no registry, no timers, no
 *     singleton flags, no hidden globals
 *   - Every exported structure is deep-copied (JSON round-trip,
 *     used only for isolation) before serialization
 *   - Returned objects/arrays are never the caller's original
 *     reference and are never mutated
 *   - Deterministic behavior
 *   - CSP compliant (no eval, no inline handlers, no dynamic code)
 *   - ES2022, strict mode, no console output, no side effects
 *     beyond the single, explicit, user-triggered download() action
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /** @const {string} Placeholder rendered for a truly absent (undefined) field in exportText(). */
  const MISSING_PLACEHOLDER = '\u2014'; // —

  /**
   * @const {ReadonlyArray<string>} The known OCR history fields, in
   * display order, used by exportText(). Any field absent on a
   * given entry renders as MISSING_PLACEHOLDER rather than being
   * inferred or omitted silently.
   */
  const HISTORY_FIELDS = Object.freeze([
    'id', 'requestId', 'documentId', 'engineId', 'status',
    'recognizedText', 'confidence', 'startedAt', 'completedAt', 'metadata'
  ]);

  /**
   * Recursively freezes an object graph in place (objects and
   * arrays). Primitives are returned as-is.
   * @param {*} value
   * @returns {*}
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
   * Isolates a value via a JSON round-trip: the copy shares no
   * references with the original, and any non-serializable content
   * (functions, etc.) is silently stripped by JSON itself. Used
   * only for isolation, per the Internal Design Rules — never to
   * infer or fabricate content.
   * @param {*} value
   * @returns {*} deep-copied value
   * @throws {TypeError} if value is not JSON-serializable at all
   *   (e.g. contains a circular reference)
   */
  function _isolate(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (e) {
      throw new TypeError('[OCRExporter] history could not be isolated for export (not JSON-serializable): ' + e.message);
    }
  }

  /**
   * Validates that a `history` argument is either a non-null,
   * non-array object, or an array whose entries are each a
   * non-null, non-array object. Throws a descriptive TypeError on
   * any violation.
   * @param {*} history
   * @throws {TypeError}
   */
  function _validateHistoryInput(history) {
    if (history === null || history === undefined) {
      throw new TypeError('[OCRExporter] history must be an array or a non-null object; received ' + history + '.');
    }
    if (Array.isArray(history)) {
      history.forEach(function (item, index) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          throw new TypeError('[OCRExporter] history[' + index + '] must be a non-null, non-array object.');
        }
      });
      return;
    }
    if (typeof history !== 'object') {
      throw new TypeError('[OCRExporter] history must be an array or a non-null object; received type "' + typeof history + '".');
    }
  }

  /**
   * Renders a single field value for the plain-text report.
   * A truly absent (undefined) field renders as MISSING_PLACEHOLDER.
   * A present-but-falsy field ("", 0, false, null) renders as its
   * literal value — falsy is not the same as missing.
   * @param {Object} entry
   * @param {string} field
   * @returns {string}
   */
  function _renderField(entry, field) {
    if (!(field in entry) || entry[field] === undefined) {
      return MISSING_PLACEHOLDER;
    }
    const value = entry[field];
    if (value === null) return 'null';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (e) {
        return MISSING_PLACEHOLDER;
      }
    }
    return String(value);
  }

  /**
   * Formats a single isolated entry as a labeled text block.
   * @param {Object} entry
   * @param {number} index
   * @returns {string}
   */
  function _formatEntryBlock(entry, index) {
    const lines = ['Record ' + (index + 1) + ':'];
    HISTORY_FIELDS.forEach(function (field) {
      lines.push('  ' + field + ': ' + _renderField(entry, field));
    });
    return lines.join('\n');
  }

  /**
   * Serializes an OCR history array or single history object into a
   * pretty-printed, isolated JSON string. The output preserves the
   * input's shape exactly (an array stays an array; a single object
   * stays a single object) — no wrapper metadata is added, and the
   * input itself is never modified.
   * @param {Array<Object>|Object} history
   * @returns {string} pretty-printed JSON string
   * @throws {TypeError} on invalid input
   */
  function exportJSON(history) {
    _validateHistoryInput(history);
    const isolated = _isolate(history);
    return JSON.stringify(isolated, null, 2);
  }

  /**
   * Formats an OCR history array or single history object into a
   * readable plain-text report. Only formats existing values; never
   * recalculates or infers anything. A truly absent field on any
   * entry renders as "—".
   * @param {Array<Object>|Object} history
   * @returns {string} plain-text report
   * @throws {TypeError} on invalid input
   */
  function exportText(history) {
    _validateHistoryInput(history);
    const isolated = _isolate(history);
    const entries = Array.isArray(isolated) ? isolated : [isolated];
    if (entries.length === 0) {
      return 'OCR History Export\n==================\n(no records)';
    }
    const blocks = entries.map(_formatEntryBlock);
    return 'OCR History Export\n==================\n\n' + blocks.join('\n\n');
  }

  /**
   * Reads the full current OCR history from OCRHistory.getAll()
   * (read-only) and returns it serialized via exportJSON(). Never
   * modifies OCRHistory or anything it returns.
   * @returns {string} pretty-printed JSON string of all history entries
   * @throws {Error} if window.CozyOS.OCRHistory is not available
   */
  function exportHistory() {
    const history = window.CozyOS.OCRHistory;
    if (!history || typeof history.getAll !== 'function') {
      throw new Error('[OCRExporter] window.CozyOS.OCRHistory is not available; cannot export history.');
    }
    const records = history.getAll();
    return exportJSON(records);
  }

  /**
   * Triggers a client-side file download of `data` as `filename`,
   * using a Blob and a temporary object URL. The object URL is
   * revoked immediately after the download is triggered, and no
   * DOM element persists afterward.
   *
   * Requires a real browser environment (Blob, URL.createObjectURL,
   * and document). If any of these are unavailable, this function
   * throws rather than fabricating a successful download.
   *
   * @param {string} filename
   * @param {string} data
   * @returns {boolean} true on success
   * @throws {TypeError} on invalid filename/data
   * @throws {Error} if the browser download APIs are unavailable
   */
  function download(filename, data) {
    if (typeof filename !== 'string' || filename.trim().length === 0) {
      throw new TypeError('[OCRExporter] filename must be a non-empty string.');
    }
    if (typeof data !== 'string') {
      throw new TypeError('[OCRExporter] data must be a string.');
    }
    if (
      typeof document === 'undefined' ||
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function'
    ) {
      throw new Error('[OCRExporter] download() requires a browser environment (Blob/URL/document APIs are not available here).');
    }

    const blob = new Blob([data], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);

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
   * Frozen public API. Exactly five methods. No private members are
   * exposed.
   */
  window.CozyOS.OCRExporter = Object.freeze({
    exportJSON: exportJSON,
    exportText: exportText,
    exportHistory: exportHistory,
    download: download,
    getVersion: getVersion
  });
})();
