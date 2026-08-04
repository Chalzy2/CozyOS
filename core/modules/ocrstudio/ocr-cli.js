/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS OCR Studio — OCRCLI
 * core/modules/ocrstudio/ocr-cli.js
 * Version: 1.0.0-PRODUCTION
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Command Interface
 *
 * SINGLE RESPONSIBILITY
 *   Provide a command interface that validates OCR Studio commands
 *   and delegates them to frozen OCR Studio public APIs. This
 *   module never performs OCR itself.
 *
 * ZERO LOGIC RULE — this module never:
 *   - executes OCR
 *   - recognizes text
 *   - extracts text
 *   - parses images
 *   - preprocesses documents
 *   - translates text
 *   - summarizes text
 *   - spellchecks text
 *   - calculates confidence
 *   - modifies OCRRegistry, OCRDocument, OCRResult, OCRRunner,
 *     OCRHistory, OCRExporter, or any other registry
 *   - fabricates OCR output
 *   - fabricates history
 *   - fabricates statistics
 *   - accesses the DOM, filesystem, or network
 *   - uses fetch or XMLHttpRequest
 *   - uses localStorage or sessionStorage
 *   - uses timers
 *
 *   It only validates commands and delegates to frozen public APIs.
 *
 * FROZEN DEPENDENCIES — READ-ONLY, VERIFIED
 *   window.CozyOS.OCRRunner   — run(), runBatch(), getStatus(), cancel()
 *   window.CozyOS.OCRHistory  — getAll()
 *   window.CozyOS.OCRExporter — exportHistory()
 *   Only these six methods, across exactly these three modules, are
 *   ever called. No private state is accessed. No returned object
 *   is ever mutated — this module's own result wrapper is frozen
 *   shallowly (see _buildResult), leaving each delegate's own
 *   already-frozen return value untouched and unaltered.
 *
 * SUPPORTED COMMANDS
 *   run       — delegates only to OCRRunner.run(args)
 *   runBatch  — delegates only to OCRRunner.runBatch(args)
 *   status    — delegates only to OCRRunner.getStatus(args)
 *   cancel    — delegates only to OCRRunner.cancel(args)
 *   history   — delegates only to OCRHistory.getAll()
 *   export    — delegates only to OCRExporter.exportHistory()
 *   version   — returns this module's own version only
 *   (anything else) — rejected with a descriptive reason; execution
 *     is never fabricated for an unsupported command.
 *
 * PUBLIC API
 *   Exactly four methods:
 *     - execute(command, args)
 *     - help()
 *     - getVersion()
 *     - listCommands()
 *
 * COMMAND RESULT (every execute() call returns exactly this shape,
 * frozen; no additional fields are ever added)
 *   {
 *     command,    // the raw command value as supplied
 *     success,    // boolean
 *     result,     // the delegate's return value, or null
 *     reason,     // descriptive string on failure, or null
 *     timestamp
 *   }
 *
 * VALIDATION
 *   A null, non-string, empty, or unrecognized command is never
 *   thrown for — it is reported via a COMMAND RESULT with
 *   success:false and a descriptive reason. This module throws
 *   TypeError only for a structurally invalid API input in a
 *   context where no graceful COMMAND RESULT could be constructed;
 *   in this build, `command` validation itself is always resolvable
 *   into a COMMAND RESULT (per VALIDATION above), and `args` is
 *   opaque and forwarded to the delegate exactly as supplied without
 *   inspection — so no path in this file currently exercises that
 *   TypeError. Any exception unexpectedly thrown by a delegate is
 *   caught and reported as a failed COMMAND RESULT rather than
 *   propagated, so execute() itself never throws.
 *
 * NEW CONTRACTS INTRODUCED BY THIS FILE (flagged; not specified
 * upstream — see certification Architecture Review)
 *   - help()'s return shape was not specified. This file returns a
 *     frozen array of frozen { command, description } entries,
 *     using the exact command descriptions from this directive's own
 *     "Supported Commands" section — no new descriptive content is
 *     invented.
 *   - listCommands() returns a frozen array of the seven supported
 *     command name strings (including "version"), in the order
 *     listed under Supported Commands.
 *
 * INTERNAL DESIGN RULES
 *   - No registry, no Map, no caches, no timers, no hidden globals,
 *     no singleton flags, no persistent state
 *   - Command dispatch uses a plain switch statement, not a lookup
 *     table, per "No Map" / "No registry"
 *   - Deep-freeze not required for delegate return values (they are
 *     already frozen by their owning module); this module's own
 *     wrapper object is frozen with a single, shallow Object.freeze
 *   - Deterministic behavior
 *   - CSP compliant (no eval, no inline handlers, no dynamic code)
 *   - ES2022, strict mode, no console output, no side effects
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version, returned by getVersion() and the "version" command. */
  const VERSION = '1.0.0';

  /**
   * @const {ReadonlyArray<{command: string, description: string}>}
   * Supported command descriptors, in canonical order. Descriptions
   * are taken verbatim in meaning from this file's own Supported
   * Commands documentation above — nothing here is invented.
   */
  const COMMAND_DESCRIPTORS = Object.freeze([
    Object.freeze({ command: 'run', description: 'Run one OCR request. Delegates only to OCRRunner.run().' }),
    Object.freeze({ command: 'runBatch', description: 'Run a batch of OCR requests. Delegates only to OCRRunner.runBatch().' }),
    Object.freeze({ command: 'status', description: 'Get the status of a tracked request. Delegates only to OCRRunner.getStatus().' }),
    Object.freeze({ command: 'cancel', description: 'Cancel a tracked request. Delegates only to OCRRunner.cancel().' }),
    Object.freeze({ command: 'history', description: 'List all OCR history records. Delegates only to OCRHistory.getAll().' }),
    Object.freeze({ command: 'export', description: 'Export OCR history. Delegates only to OCRExporter.exportHistory().' }),
    Object.freeze({ command: 'version', description: 'Return this module\'s own version only.' })
  ]);

  /**
   * Builds and freezes a COMMAND RESULT frame. Centralized so every
   * execute() return path has an identical, frozen shape with
   * exactly the documented fields — nothing more.
   * @param {*} command — the raw command value as supplied to execute()
   * @param {boolean} success
   * @param {*} result
   * @param {string|null} reason
   * @returns {Object} frozen command result
   */
  function _buildResult(command, success, result, reason) {
    return Object.freeze({
      command: command,
      success: success,
      result: result === undefined ? null : result,
      reason: reason === undefined ? null : reason,
      timestamp: Date.now()
    });
  }

  /**
   * Delegates a command to a single method on a frozen OCR Studio
   * module, forwarding `args` exactly as supplied (opaque; never
   * inspected). Any exception thrown by the delegate is caught and
   * reported as a failed COMMAND RESULT rather than propagated.
   * @param {string} command — the validated, trimmed command name
   * @param {string} moduleName — e.g. "OCRRunner"
   * @param {string} methodName — e.g. "run"
   * @param {*} args — forwarded as-is
   * @returns {Object} frozen command result
   */
  function _delegate(command, moduleName, methodName, args) {
    const target = window.CozyOS && window.CozyOS[moduleName];
    if (!target || typeof target[methodName] !== 'function') {
      return _buildResult(command, false, null, 'window.CozyOS.' + moduleName + '.' + methodName + '() is not available.');
    }
    try {
      const result = target[methodName](args);
      return _buildResult(command, true, result === undefined ? null : result, null);
    } catch (e) {
      return _buildResult(command, false, null, 'delegation to ' + moduleName + '.' + methodName + '() failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  /**
   * Validates, dispatches, and delegates a single OCR Studio
   * command. Never throws for a null, non-string, empty, or
   * unrecognized command — those are reported via a failed COMMAND
   * RESULT instead. `args` is opaque and is forwarded to the
   * delegate exactly as supplied, without inspection.
   *
   * @param {*} command
   * @param {*} [args]
   * @returns {Object} frozen COMMAND RESULT (see file header)
   */
  function execute(command, args) {
    if (typeof command !== 'string') {
      return _buildResult(command === undefined ? null : command, false, null, 'command must be a string.');
    }

    const trimmed = command.trim();
    if (trimmed.length === 0) {
      return _buildResult(command, false, null, 'command must be a non-empty string.');
    }

    switch (trimmed) {
      case 'run':
        return _delegate(trimmed, 'OCRRunner', 'run', args);
      case 'runBatch':
        return _delegate(trimmed, 'OCRRunner', 'runBatch', args);
      case 'status':
        return _delegate(trimmed, 'OCRRunner', 'getStatus', args);
      case 'cancel':
        return _delegate(trimmed, 'OCRRunner', 'cancel', args);
      case 'history':
        return _delegate(trimmed, 'OCRHistory', 'getAll', args);
      case 'export':
        return _delegate(trimmed, 'OCRExporter', 'exportHistory', args);
      case 'version':
        return _buildResult(trimmed, true, VERSION, null);
      default:
        return _buildResult(trimmed, false, null, 'unknown command: "' + trimmed + '".');
    }
  }

  /**
   * Returns a frozen list of supported command descriptors. See the
   * file header's "New Contracts Introduced" note — this return
   * shape was not specified upstream.
   * @returns {ReadonlyArray<{command: string, description: string}>}
   */
  function help() {
    return COMMAND_DESCRIPTORS;
  }

  /**
   * Returns a frozen list of supported command name strings, in
   * canonical order.
   * @returns {ReadonlyArray<string>}
   */
  function listCommands() {
    return Object.freeze(COMMAND_DESCRIPTORS.map(function (entry) { return entry.command; }));
  }

  /**
   * Returns the module version string.
   * @returns {string}
   */
  function getVersion() {
    return VERSION;
  }

  /**
   * Frozen public API. Exactly four methods. No private members are
   * exposed.
   */
  window.CozyOS.OCRCLI = Object.freeze({
    execute: execute,
    help: help,
    getVersion: getVersion,
    listCommands: listCommands
  });
})();
