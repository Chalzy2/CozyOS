/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS OCR Studio — OCRRunner
 * core/modules/ocrstudio/ocr-runner.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Execution Coordination
 *
 * SINGLE RESPONSIBILITY
 *   OCRRunner is responsible only for coordinating certified OCR
 *   execution requests using the frozen public APIs of OCRRegistry,
 *   OCRDocument, OCRResult, and OCREngine. It is the execution
 *   coordinator. It is NOT an OCR engine.
 *
 * ZERO LOGIC RULE — this module never:
 *   - performs OCR recognition itself
 *   - extracts text itself
 *   - preprocesses images
 *   - parses PDFs
 *   - performs layout analysis
 *   - calculates confidence
 *   - edits recognition output
 *   - generates reports
 *   - manages UI
 *   - modifies OCRRegistry
 *   - modifies OCRDocument
 *   - modifies OCRResult
 *   - fabricates OCR output
 *   - fabricates confidence values
 *   - translates text
 *   - summarizes text
 *   - spell-checks text
 *   - stores history
 *   - modifies OCRExporter, OCRDashboard, or OCRUI
 *   - accesses the DOM, filesystem, or network directly
 *   - uses localStorage or sessionStorage
 *
 * FROZEN DEPENDENCIES — VERIFIED, NOT ASSUMED
 *   Every dependency call below was checked against the actual
 *   production source of each module before this file was written.
 *
 *   window.CozyOS.OCRDocument (v1.0.0) — read-only:
 *     - OCRDocument.get(id) → frozen entry | null
 *   Used only to attach informational document context to a run()
 *   response. OCRRunner never registers, unregisters, or clears
 *   document entries.
 *
 *   window.CozyOS.OCREngine (v1.0.0) — delegated execution:
 *     - OCREngine.process(request) → frozen response frame
 *     - OCREngine.cancel(requestId) → frozen result frame
 *     - OCREngine.getStatus(requestId) → frozen record | null
 *   OCRRunner never re-implements OCREngine's lifecycle. It builds
 *   the request object OCREngine expects (requestId, engineId,
 *   payload — per ocr-engine.js's own documented request contract)
 *   and returns OCREngine's response, enriched only with read-only
 *   document context that OCREngine itself does not attach.
 *
 * DEPENDENCIES INTENTIONALLY NOT USED
 *   window.CozyOS.OCRRegistry — not referenced directly. OCREngine
 *   already performs the read-only OCRRegistry lookup for a
 *   supplied engineId (see ocr-engine.js). Duplicating that lookup
 *   here would mean two modules independently interpreting the
 *   same registry entry, which is unnecessary and out of scope for
 *   a coordinator.
 *
 *   window.CozyOS.OCRResult — not referenced. Per OCREngine's
 *   Honest Capability Statement, no module in this subsystem
 *   currently produces OCR results (every process() call resolves
 *   to DEFERRED), so there is nothing for OCRRunner to legitimately
 *   read, attach, or reference from OCRResult yet. Wiring OCRRunner
 *   to OCRResult now would require guessing when/how a result gets
 *   created, which is exactly the kind of fabricated contract this
 *   build must not introduce. This should be revisited in a
 *   controlled future certification cycle once a real module
 *   actually registers OCRResult entries.
 *
 * ── HONEST CAPABILITY STATEMENT (read before extending this file) ──
 *   Because OCREngine.process() currently always resolves to status
 *   "DEFERRED" (see ocr-engine.js), every OCRRunner.run() and
 *   runBatch() call will likewise resolve to DEFERRED for every
 *   structurally valid request. This is not a bug or a stub in this
 *   file — OCRRunner faithfully coordinates and forwards whatever
 *   OCREngine legitimately returns. OCRRunner does not, and must
 *   not, fabricate a different outcome than the one OCREngine
 *   actually produced.
 *
 * OCRRunner's OWN REQUEST/RESPONSE CONTRACT
 *   (Defined by this file. Not inferred from any other module.
 *   Flagged explicitly below under Architecture Review — downstream
 *   modules must treat this as the authoritative shape.)
 *
 *   run(request):
 *     request = {
 *       requestId?: string,   // optional; forwarded as-is to OCREngine
 *       documentId?: string,  // optional; read-only OCRDocument.get()
 *                             // lookup, attached for informational
 *                             // context only — never enforced, never
 *                             // blocks execution, never invoked
 *       engineId?: string,    // optional; forwarded as-is to OCREngine
 *       payload?: *           // fully opaque; forwarded as-is,
 *                             // never inspected by this module
 *     }
 *     returns a frozen frame:
 *       {
 *         timestamp, requestId, status, reason,
 *         documentId, documentDescriptor,
 *         engineId, engineDescriptor
 *       }
 *     "status"/"reason" are OCREngine's own values, passed through
 *     unchanged, except when this module rejects a structurally
 *     invalid request before ever calling OCREngine (status
 *     "REJECTED", reusing OCREngine's existing status vocabulary
 *     for consistency rather than inventing a parallel one).
 *
 *   runBatch(requests):
 *     requests = Array<request>   // each item per run()'s shape above
 *     returns a frozen frame:
 *       {
 *         timestamp, batchId, total,
 *         summary: { deferred, rejected, cancelled, other },
 *         results: Array<run() response frame>
 *       }
 *     Batch size is bounded (see _MAX_BATCH_SIZE) to prevent a
 *     single call from issuing an unbounded number of downstream
 *     OCREngine requests.
 *
 * INTERNAL DESIGN RULES
 *   - No hidden state: OCRRunner keeps no request-tracking map of
 *     its own. getStatus()/cancel() delegate directly to OCREngine,
 *     which is the sole owner of request lifecycle state.
 *   - Deep-freeze all returned frames
 *   - Deterministic behavior
 *   - CSP compliant (no eval, no inline handlers, no dynamic code)
 *   - ES2022
 *   - Public API only: run, runBatch, cancel, getStatus, getVersion
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /** @const {string} Reused from OCREngine's status vocabulary. */
  const STATUS_REJECTED = 'REJECTED';

  /** @const {number} Upper bound on requests accepted by a single runBatch() call. */
  const _MAX_BATCH_SIZE = 500;

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
   * Generates a batch id. Uses crypto.randomUUID() when available,
   * with a non-cryptographic fallback, matching the pattern used in
   * ocr-engine.js for non-security-critical identifiers.
   * @returns {string}
   */
  function _generateBatchId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return 'batch_' + crypto.randomUUID();
      }
    } catch (e) {
      // fall through to fallback
    }
    return 'batch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
  }

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
   * Builds and freezes a response/record frame. Centralized so every
   * return path has an identical, frozen shape.
   * @param {Object} fields
   * @returns {Object}
   */
  function _buildFrame(fields) {
    return _freezeRecursive(Object.assign({ timestamp: Date.now() }, fields));
  }

  /**
   * Validates the structural shape of an incoming run() request.
   * Only checks what THIS module needs to safely coordinate the
   * request — it never inspects or interprets `payload`.
   * @param {*} request
   * @returns {string|null} error reason, or null if valid
   */
  function _validateRunRequest(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      return 'request must be a non-null, non-array object.';
    }
    if (request.requestId !== undefined && _normalizeId(request.requestId) === null) {
      return 'request.requestId, if supplied, must be a non-empty string.';
    }
    if (request.documentId !== undefined && _normalizeId(request.documentId) === null) {
      return 'request.documentId, if supplied, must be a non-empty string.';
    }
    if (request.engineId !== undefined && _normalizeId(request.engineId) === null) {
      return 'request.engineId, if supplied, must be a non-empty string.';
    }
    return null;
  }

  /**
   * Performs a read-only OCRDocument lookup for informational
   * context. Never blocks or alters execution based on the result —
   * a missing document is reported, not enforced. The descriptor,
   * if found, is never invoked or interpreted.
   * @param {string|null} documentId
   * @returns {Object|null} frozen document descriptor, or null
   */
  function _lookupDocumentContext(documentId) {
    if (!documentId) return null;
    const documents = window.CozyOS.OCRDocument;
    if (!documents || typeof documents.get !== 'function') return null;
    return documents.get(documentId) || null;
  }

  /**
   * Coordinates a single OCR execution request by delegating to
   * OCREngine.process() and attaching read-only OCRDocument context.
   * See file header for the full request/response contract.
   *
   * @param {Object} request — see file header for shape
   * @returns {Object} frozen response frame
   */
  function run(request) {
    const validationError = _validateRunRequest(request);
    if (validationError) {
      return _buildFrame({
        requestId: (request && typeof request === 'object' && !Array.isArray(request) && _normalizeId(request.requestId)) || null,
        status: STATUS_REJECTED,
        reason: validationError,
        documentId: null,
        documentDescriptor: null,
        engineId: null,
        engineDescriptor: null
      });
    }

    const documentId = _normalizeId(request.documentId);
    const documentDescriptor = _lookupDocumentContext(documentId);

    const engine = window.CozyOS.OCREngine;
    if (!engine || typeof engine.process !== 'function') {
      return _buildFrame({
        requestId: _normalizeId(request.requestId) || null,
        status: STATUS_REJECTED,
        reason: 'window.CozyOS.OCREngine is not available; OCRRunner cannot coordinate execution without it.',
        documentId: documentId || null,
        documentDescriptor: documentDescriptor,
        engineId: _normalizeId(request.engineId) || null,
        engineDescriptor: null
      });
    }

    const engineResponse = engine.process({
      requestId: request.requestId,
      engineId: request.engineId,
      payload: request.payload
    });

    return _buildFrame({
      requestId: engineResponse.requestId,
      status: engineResponse.status,
      reason: engineResponse.reason,
      documentId: documentId || null,
      documentDescriptor: documentDescriptor,
      engineId: engineResponse.engineId,
      engineDescriptor: engineResponse.engineDescriptor
    });
  }

  /**
   * Coordinates a batch of OCR execution requests by calling run()
   * for each one, in order. Bounded at _MAX_BATCH_SIZE to prevent a
   * single call from issuing an unbounded number of downstream
   * OCREngine requests. See file header for the full contract.
   *
   * @param {Array<Object>} requests
   * @returns {Object} frozen batch frame
   */
  function runBatch(requests) {
    const batchId = _generateBatchId();

    if (!Array.isArray(requests)) {
      return _buildFrame({
        batchId: batchId,
        total: 0,
        summary: { deferred: 0, rejected: 0, cancelled: 0, other: 0 },
        results: [],
        reason: 'requests must be an array of request objects.'
      });
    }

    if (requests.length > _MAX_BATCH_SIZE) {
      return _buildFrame({
        batchId: batchId,
        total: requests.length,
        summary: { deferred: 0, rejected: 0, cancelled: 0, other: 0 },
        results: [],
        reason: 'batch size ' + requests.length + ' exceeds maximum of ' + _MAX_BATCH_SIZE + '.'
      });
    }

    const summary = { deferred: 0, rejected: 0, cancelled: 0, other: 0 };
    const results = requests.map(function (request) {
      const result = run(request);
      if (result.status === 'DEFERRED') summary.deferred += 1;
      else if (result.status === 'REJECTED') summary.rejected += 1;
      else if (result.status === 'CANCELLED') summary.cancelled += 1;
      else summary.other += 1;
      return result;
    });

    return _buildFrame({
      batchId: batchId,
      total: results.length,
      summary: summary,
      results: Object.freeze(results)
    });
  }

  /**
   * Cancels a tracked request by delegating directly to
   * OCREngine.cancel(). OCRRunner keeps no request-tracking state of
   * its own — OCREngine is the sole owner of request lifecycle
   * state.
   * @param {string} requestId
   * @returns {Object} frozen result frame
   */
  function cancel(requestId) {
    const engine = window.CozyOS.OCREngine;
    if (!engine || typeof engine.cancel !== 'function') {
      return _buildFrame({
        requestId: _normalizeId(requestId) || null,
        success: false,
        reason: 'window.CozyOS.OCREngine is not available; OCRRunner cannot cancel without it.'
      });
    }
    return engine.cancel(requestId);
  }

  /**
   * Retrieves the current status of a tracked request by delegating
   * directly to OCREngine.getStatus().
   * @param {string} requestId
   * @returns {Object|null} frozen record, or null if not tracked / invalid id
   */
  function getStatus(requestId) {
    const engine = window.CozyOS.OCREngine;
    if (!engine || typeof engine.getStatus !== 'function') return null;
    return engine.getStatus(requestId);
  }

  /**
   * Returns the module version string.
   * @returns {string}
   */
  function getVersion() {
    return VERSION;
  }

  /**
   * Frozen public API. Exactly the five methods specified for
   * OCRRunner — no additional surface area.
   */
  window.CozyOS.OCRRunner = Object.freeze({
    run: run,
    runBatch: runBatch,
    cancel: cancel,
    getStatus: getStatus,
    getVersion: getVersion
  });
})();
