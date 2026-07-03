/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS OCR Studio — OCREngine
 * core/modules/ocrstudio/ocr-engine.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Request Orchestration
 *
 * SINGLE RESPONSIBILITY
 *   Orchestrates OCR requests between certified OCR Studio modules
 *   using their frozen public APIs. It is NOT an OCR recognizer,
 *   image processor, parser, translator, report generator, or
 *   storage engine. It never owns OCR results.
 *
 * ZERO LOGIC RULE — this module never:
 *   - performs OCR recognition
 *   - extracts text itself
 *   - performs image preprocessing
 *   - modifies OCR results
 *   - calculates confidence scores
 *   - translates text
 *   - summarizes text
 *   - spell-checks text
 *   - parses PDFs
 *   - performs layout analysis
 *   - stores history
 *   - formats reports
 *   - modifies OCRRegistry, OCRDocument, OCRResult, OCRHistory,
 *     OCRExporter, OCRRunner, or OCRUI
 *   - accesses the DOM, network, filesystem, localStorage, or
 *     sessionStorage
 *
 * FROZEN DEPENDENCIES — VERIFIED, NOT ASSUMED
 *   window.CozyOS.OCRRegistry (v1.0.0) — the production source of
 *   this module was read directly and independently verified by
 *   functional testing (34+ assertions covering register/get/
 *   getAll/has/count/unregister/clear/getVersion, duplicate
 *   protection, deep-freeze, and falsy-vs-absent descriptor
 *   handling) before this file was written against it. Only the
 *   following calls are used, both read-only:
 *     - OCRRegistry.get(id)   → frozen entry | null
 *     - OCRRegistry.has(id)   → boolean
 *   No other OCRRegistry method is called. This module never
 *   registers, unregisters, or clears registry entries — it is a
 *   consumer, not a producer, of registry state.
 *
 * DEFERRED DEPENDENCIES — DO NOT ASSUME AN API
 *   window.CozyOS.OCRDocument — does not exist yet. Not referenced
 *   anywhere in this file.
 *   window.CozyOS.OCRResult — does not exist yet. Not referenced
 *   anywhere in this file.
 *   window.CozyOS.OCRRunner — does not exist yet. Not referenced
 *   anywhere in this file.
 *
 * ── HONEST CAPABILITY STATEMENT (read before extending this file) ──
 *   OCRRegistry stores descriptors opaquely: registration payloads
 *   are round-tripped through JSON at store-time, which silently
 *   strips any function value. This means a "descriptor" an OCR
 *   engine implementation registers here can NEVER itself be a
 *   live, callable reference — it is data only. Combined with the
 *   Zero Logic Rule (this module must never execute a registered
 *   descriptor) and the absence of OCRDocument/OCRResult/OCRRunner,
 *   there is currently no mechanism by which OCREngine could
 *   actually perform, delegate, or trigger OCR execution.
 *
 *   Consequently, process() in this version ALWAYS resolves to
 *   status "DEFERRED". This is not a placeholder or a stub — the
 *   request lifecycle (id assignment, duplicate protection,
 *   tracking, cancellation, status lookup, optional read-only
 *   OCRRegistry lookup for informational routing context) is fully
 *   implemented and real. What is deferred is only the execution
 *   step itself, because no executable module exists downstream
 *   yet. When OCRDocument/OCRResult/OCRRunner are built and frozen,
 *   this file should be revised in a controlled v1.1 certification
 *   cycle to add real execution — never by guessing their API
 *   ahead of time.
 *
 *   A direct consequence: cancel(requestId) is fully and correctly
 *   implemented, but because process() currently resolves
 *   synchronously and DEFERRED is a terminal status, there is no
 *   window in which a request is actually cancellable today.
 *   cancel() will report success:false with an explanatory reason
 *   for every request processed by this version. This becomes
 *   meaningful once a real asynchronous execution path exists.
 *
 * OCREngine's OWN REQUEST CONTRACT (defined by this file, not
 * inferred from any other module)
 *   process(request):
 *     request = {
 *       requestId?: string,   // optional; auto-generated if omitted
 *       engineId?: string,    // optional; if supplied, OCREngine
 *                             // performs a read-only OCRRegistry
 *                             // lookup and surfaces the descriptor
 *                             // (or its absence) for informational
 *                             // purposes only — it is never invoked
 *       payload?: *           // fully opaque; never inspected
 *     }
 *
 * INTERNAL DESIGN RULES
 *   - Bounded in-memory request tracking Map (no persistence, no
 *     "history" subsystem — that is OCRHistory's future job)
 *   - Deep-freeze all returned frames
 *   - Duplicate requestId protection
 *   - No hidden state beyond the bounded tracking map required to
 *     support cancel()/getStatus()
 *   - CSP compliant (no eval, no inline handlers, no dynamic code)
 *   - ES2022, deterministic, no fabricated data
 *   - Public API only: process, cancel, getStatus, getVersion
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion(). */
  const VERSION = '1.0.0';

  /**
   * @const {string} Terminal status meaning "accepted, but no
   * executable OCR pipeline exists downstream to act on it yet."
   * See file header — this is the only outcome process() can
   * currently produce for a structurally valid request.
   */
  const STATUS_DEFERRED = 'DEFERRED';

  /** @const {string} Status for a structurally invalid request. */
  const STATUS_REJECTED = 'REJECTED';

  /** @const {string} Status set by a successful cancel() call. */
  const STATUS_CANCELLED = 'CANCELLED';

  /**
   * @const {ReadonlyArray<string>} Statuses considered terminal —
   * a request in one of these states cannot be cancelled.
   */
  const TERMINAL_STATUSES = Object.freeze([STATUS_DEFERRED, STATUS_REJECTED, STATUS_CANCELLED]);

  /**
   * Bounded in-memory tracking store: Map<requestId, FrozenRecord>.
   * FIFO-evicted at _MAX_TRACKED_REQUESTS. This is request-lifecycle
   * bookkeeping required to support cancel()/getStatus(), not the
   * OCRHistory subsystem (which is a separate, future, dedicated
   * module — this map is never exposed for export/audit purposes).
   * @type {Map<string, Object>}
   */
  let _requests = new Map();

  /** @const {number} Bound on in-memory request tracking. */
  const _MAX_TRACKED_REQUESTS = 2000;

  /**
   * Normalizes a candidate id into a trimmed, non-empty string, or
   * null if unusable.
   * @param {*} id
   * @returns {string|null}
   */
  function _normalizeId(id) {
    if (typeof id !== 'string') return null;
    const trimmed = id.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Generates a request id when the caller doesn't supply one.
   * Uses crypto.randomUUID() when available, with a non-cryptographic
   * fallback for environments where it isn't (matching the pattern
   * used elsewhere in CozyOS for non-security-critical identifiers).
   * @returns {string}
   */
  function _generateRequestId() {
    try {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return 'req_' + crypto.randomUUID();
      }
    } catch (e) {
      // fall through to fallback
    }
    return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
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
   * Validates the structural shape of an incoming request. Only
   * checks what THIS module needs to safely process the request —
   * it never inspects or interprets `payload`.
   * @param {*} request
   * @returns {string|null} error reason, or null if valid
   */
  function _validateRequest(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      return 'request must be a non-null, non-array object.';
    }
    if (request.requestId !== undefined && _normalizeId(request.requestId) === null) {
      return 'request.requestId, if supplied, must be a non-empty string.';
    }
    if (request.engineId !== undefined && _normalizeId(request.engineId) === null) {
      return 'request.engineId, if supplied, must be a non-empty string.';
    }
    return null;
  }

  /**
   * Evicts the oldest tracked request if the bounded map is full.
   * Map preserves insertion order, so the first key is the oldest.
   */
  function _enforceTrackingBound() {
    if (_requests.size >= _MAX_TRACKED_REQUESTS) {
      const oldestKey = _requests.keys().next().value;
      if (oldestKey !== undefined) {
        _requests.delete(oldestKey);
      }
    }
  }

  /**
   * Orchestrates a single OCR request.
   *
   * Because OCRDocument, OCRResult, and OCRRunner do not exist yet
   * (see file header), every structurally valid request currently
   * resolves to status "DEFERRED" — there is no executable pipeline
   * to delegate to. If request.engineId is supplied, this method
   * performs a read-only OCRRegistry.get()/has() lookup purely to
   * surface informational routing context in the response; the
   * descriptor, if found, is never invoked.
   *
   * @param {Object} request — see file header for shape
   * @returns {Object} frozen response frame
   */
  function process(request) {
    const validationError = _validateRequest(request);
    if (validationError) {
      return _buildFrame({
        requestId: (request && typeof request === 'object' && !Array.isArray(request) && _normalizeId(request.requestId)) || null,
        status: STATUS_REJECTED,
        reason: validationError,
        engineId: null,
        engineDescriptor: null
      });
    }

    const requestedId = _normalizeId(request.requestId);
    if (requestedId && _requests.has(requestedId)) {
      return _buildFrame({
        requestId: requestedId,
        status: STATUS_REJECTED,
        reason: 'duplicate requestId: "' + requestedId + '" is already tracked.',
        engineId: null,
        engineDescriptor: null
      });
    }

    const requestId = requestedId || _generateRequestId();
    const engineId = _normalizeId(request.engineId);

    let engineDescriptor = null;
    let reason;

    if (engineId) {
      const registry = window.CozyOS.OCRRegistry;
      const found = registry && typeof registry.get === 'function' ? registry.get(engineId) : null;
      if (found) {
        engineDescriptor = found; // already frozen by OCRRegistry
        reason = 'OCRRegistry entry "' + engineId + '" found, but OCREngine has no executable pipeline ' +
          '(OCRDocument/OCRResult/OCRRunner are not yet available) — the descriptor is informational only ' +
          'and was not invoked.';
      } else {
        reason = 'No OCRRegistry entry found for engineId "' + engineId + '". Additionally, OCREngine has no ' +
          'executable pipeline yet (OCRDocument/OCRResult/OCRRunner are not yet available).';
      }
    } else {
      reason = 'No engineId supplied, and OCREngine has no executable pipeline yet ' +
        '(OCRDocument/OCRResult/OCRRunner are not yet available).';
    }

    const record = _buildFrame({
      requestId: requestId,
      status: STATUS_DEFERRED,
      reason: reason,
      engineId: engineId || null,
      engineDescriptor: engineDescriptor
    });

    _enforceTrackingBound();
    _requests.set(requestId, record);

    return record;
  }

  /**
   * Attempts to cancel a tracked request. Requests in a terminal
   * status (DEFERRED, REJECTED, CANCELLED) cannot be cancelled — see
   * the Honest Capability Statement in the file header for why every
   * request currently ends up terminal before cancel() could ever
   * meaningfully apply.
   * @param {string} requestId
   * @returns {Object} frozen result frame
   */
  function cancel(requestId) {
    const normalized = _normalizeId(requestId);
    if (!normalized) {
      return _buildFrame({ requestId: requestId || null, success: false, reason: 'requestId must be a non-empty string.' });
    }

    const record = _requests.get(normalized);
    if (!record) {
      return _buildFrame({ requestId: normalized, success: false, reason: 'no tracked request with this requestId.' });
    }

    if (TERMINAL_STATUSES.indexOf(record.status) !== -1) {
      return _buildFrame({
        requestId: normalized,
        success: false,
        reason: 'request is already in a terminal status ("' + record.status + '") and cannot be cancelled.'
      });
    }

    // Unreachable in the current build (every process() call resolves
    // directly to a terminal status) — retained for when a real
    // non-terminal in-flight state exists in a future version.
    const cancelledRecord = _buildFrame(Object.assign({}, record, { status: STATUS_CANCELLED, reason: 'cancelled by caller.' }));
    _requests.set(normalized, cancelledRecord);
    return _buildFrame({ requestId: normalized, success: true, reason: 'request cancelled.' });
  }

  /**
   * Retrieves the current tracked record for a request.
   * @param {string} requestId
   * @returns {Object|null} frozen record, or null if not tracked / invalid id
   */
  function getStatus(requestId) {
    const normalized = _normalizeId(requestId);
    if (!normalized) return null;
    return _requests.get(normalized) || null;
  }

  /**
   * Returns the module version string.
   * @returns {string}
   */
  function getVersion() {
    return VERSION;
  }

  /**
   * Frozen public API. Exactly the four methods specified for
   * OCREngine — no additional surface area.
   */
  window.CozyOS.OCREngine = Object.freeze({
    process: process,
    cancel: cancel,
    getStatus: getStatus,
    getVersion: getVersion
  });
})();
