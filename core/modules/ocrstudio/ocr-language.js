/**
 * ══════════════════════════════════════════════════════════════
 * CozyOS Universal Cognitive Core — OCR LANGUAGE REGISTRY
 * core/modules/ocr/ocr-language.js
 * Version: 1.0.0-ENTERPRISE-FROZEN
 * ══════════════════════════════════════════════════════════════
 *
 * LAYER
 *   Core Infrastructure — Language Metadata Registry
 *
 * SINGLE RESPONSIBILITY
 *   Be the single central source of truth for OCR language
 *   metadata and configuration. Every OCR engine (Tesseract,
 *   PaddleOCR, EasyOCR, Google Vision, Azure OCR, future engines)
 *   obtains supported-language information from this module.
 *
 * THIS MODULE NEVER:
 *   - performs OCR
 *   - recognizes text
 *   - extracts text
 *   - translates text
 *   - detects language automatically
 *   - performs speech recognition
 *   - does AI reasoning or language learning
 *   - writes to a database
 *   - profiles users
 *   - synchronizes to the cloud
 *   - accesses the DOM, filesystem, or network
 *   - uses fetch, XMLHttpRequest, localStorage, sessionStorage
 *   - fabricates language data it was not given or does not
 *     already know as a plain linguistic fact (see CORE LANGUAGES)
 *
 *   It only registers, validates, and reports language metadata.
 *
 * CORE LANGUAGES (protected — cannot be removed, per directive)
 *   English (en), Kiswahili (sw), Arabic (ar), French (fr),
 *   Somali (so). Their linguistic metadata (native name, script,
 *   direction) is plain, verifiable linguistic fact, not invented
 *   business data. Their runtime/package fields (support level,
 *   download/installed status, package version, priority) are
 *   reasonable bundled-module defaults — see NEW CONTRACTS below.
 *
 *   All other languages named in the directive's "Future Expansion"
 *   list are documentation of intent only. None of them are
 *   pre-registered here, because doing so would mean fabricating
 *   runtime metadata (support level, engine compatibility, install
 *   status, etc.) this module has no basis for. They become real
 *   registry entries only when registerLanguage() is called with
 *   real data, at runtime, by a caller who has that data.
 *
 * PUBLIC API — 30 methods, grouped by responsibility
 *   Registry lifecycle:
 *     registerLanguage(descriptor), removeLanguage(code)
 *   Lookup:
 *     isCoreLanguage(code), isRegistered(code), getLanguage(code),
 *     getAllLanguages(), getCoreLanguages()
 *   Enablement:
 *     enableLanguage(code), disableLanguage(code), isEnabled(code)
 *   Aliases:
 *     setAlias(alias, code), resolveAlias(alias)
 *   Groups:
 *     setGroup(code, group), getLanguagesByGroup(group)
 *   Priority / ordering / default:
 *     setPriority(code, priority), getPriority(code),
 *     getPreferredOrder(), setDefaultLanguage(code),
 *     getDefaultLanguage()
 *   Validation:
 *     validateLanguageCode(code), validateCombination(codes)
 *   Engine compatibility:
 *     setEngineCompatibility(code, engines),
 *     isEngineCompatible(code, engine)
 *   Diagnostics / stats:
 *     getDiagnostics(), getStats()
 *   Import / export:
 *     exportRegistry(), importRegistry(data)
 *   Events:
 *     onChange(listener), offChange(listener)
 *   Version:
 *     getVersion()
 *
 * REGISTRY RESULT (every mutating method returns exactly this
 * shape, frozen; getters return plain/frozen values instead)
 *   {
 *     operation,  // the method name that produced this result
 *     success,    // boolean
 *     reason,     // descriptive string on failure, or null
 *     timestamp
 *   }
 *
 * NEW CONTRACTS INTRODUCED BY THIS FILE (flagged; not specified
 * upstream — parallel to the Architecture Review process used for
 * ocr-cli.js)
 *   - REGISTRY RESULT shape itself is new; the directive never
 *     specified a return contract for mutating calls. Modeled on
 *     OCRCLI's COMMAND RESULT for consistency across CozyOS.
 *   - Language code format is validated against a simplified
 *     BCP-47-like pattern: 2-3 lowercase letters, optional
 *     "-REGION" suffix (e.g. "en", "sw", "en-US"). The directive
 *     did not specify ISO 639-1 vs 639-3 vs a custom scheme.
 *   - Default runtime fields assigned to CORE LANGUAGES at load
 *     time: ocrSupportLevel: 'full', downloadStatus: 'bundled',
 *     installedStatus: 'installed', packageVersion: module VERSION,
 *     priority: registration order (0-4), engineCompatibility: [].
 *     These are operational defaults for a bundled module, not
 *     fabricated linguistic claims.
 *   - importRegistry() is additive/merge-only: it never overwrites
 *     an already-registered code (core or custom) and never wipes
 *     the existing registry. The directive asked for "export/import"
 *     but did not specify merge-vs-replace semantics; merge-only
 *     was chosen as the non-destructive default.
 *   - onChange()/offChange() is a new, minimal synchronous
 *     pub/sub contract satisfying the directive's "event-driven
 *     updates" requirement. Listener exceptions are caught so one
 *     bad listener cannot break emission to the others.
 *   - "Thread-safe operations" is interpreted as: every public
 *     method here runs to completion synchronously with no
 *     awaited gap and no external mutable state, so there is no
 *     window in which two calls can interleave. JS's single-
 *     threaded execution model makes this the only meaning that
 *     applies; this file does not use Workers or SharedArrayBuffer.
 *
 * INTERNAL DESIGN RULES
 *   - Internal state (registry, aliases, groups, listeners, stats)
 *     is a private Map/Set closed over by the IIFE — never exposed
 *     directly. All public getters return frozen copies, never
 *     live references, so external code cannot mutate registry
 *     state (Immutable Public Metadata requirement).
 *   - No eval, no dynamic code, no timers, no console output.
 *   - CSP compliant. ES2022, strict mode.
 *   - Deterministic given identical call sequences.
 * ══════════════════════════════════════════════════════════════
 */

window.CozyOS = window.CozyOS || {};

(function () {
  'use strict';

  /** @const {string} Module version. */
  const VERSION = '1.0.0';

  /** @const {RegExp} Simplified BCP-47-like code validator. See NEW CONTRACTS. */
  const CODE_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/;

  /** @const {ReadonlyArray<Object>} Plain linguistic facts for the 5 protected core languages. */
  const CORE_LANGUAGE_FACTS = Object.freeze([
    { code: 'en', displayName: 'English', nativeName: 'English', region: 'Global', continent: null, writingSystem: 'Alphabetic', script: 'Latin', direction: 'LTR' },
    { code: 'sw', displayName: 'Kiswahili', nativeName: 'Kiswahili', region: 'East Africa', continent: 'Africa', writingSystem: 'Alphabetic', script: 'Latin', direction: 'LTR' },
    { code: 'ar', displayName: 'Arabic', nativeName: 'العربية', region: 'Middle East & North Africa', continent: null, writingSystem: 'Alphabetic', script: 'Arabic', direction: 'RTL' },
    { code: 'fr', displayName: 'French', nativeName: 'Français', region: 'Global', continent: null, writingSystem: 'Alphabetic', script: 'Latin', direction: 'LTR' },
    { code: 'so', displayName: 'Somali', nativeName: 'Soomaali', region: 'Horn of Africa', continent: 'Africa', writingSystem: 'Alphabetic', script: 'Latin', direction: 'LTR' }
  ]);

  /** @const {ReadonlyArray<string>} Core language codes, canonical order. */
  const CORE_CODES = Object.freeze(CORE_LANGUAGE_FACTS.map(function (f) { return f.code; }));

  // ── Private, closed-over state — never exposed directly ──
  const _registry = new Map();   // code -> language record (mutable internal shape)
  const _aliases = new Map();    // lowercased alias -> code
  const _groups = new Map();     // code -> group string
  const _listeners = new Set();  // Set<function(type, payload)>
  const _stats = {
    registrations: 0, removals: 0, enables: 0, disables: 0,
    aliasesSet: 0, groupsSet: 0, prioritiesSet: 0, defaultChanges: 0,
    engineCompatibilitySets: 0, imports: 0, exports: 0, validations: 0
  };
  let _defaultLanguage = null;

  // ── Bootstrap core languages ──
  CORE_LANGUAGE_FACTS.forEach(function (fact, index) {
    _registry.set(fact.code, {
      code: fact.code,
      displayName: fact.displayName,
      nativeName: fact.nativeName,
      region: fact.region,
      continent: fact.continent,
      writingSystem: fact.writingSystem,
      script: fact.script,
      direction: fact.direction,
      ocrSupportLevel: 'full',
      engineCompatibility: [],
      downloadStatus: 'bundled',
      installedStatus: 'installed',
      packageVersion: VERSION,
      priority: index,
      protected: true,
      enabled: true
    });
  });
  _defaultLanguage = 'en';

  // ── Internal helpers ──

  function _buildOpResult(operation, success, reason) {
    return Object.freeze({
      operation: operation,
      success: success,
      reason: reason === undefined ? null : reason,
      timestamp: Date.now()
    });
  }

  function _freezeEntry(record) {
    return Object.freeze(Object.assign({}, record, {
      engineCompatibility: Object.freeze(record.engineCompatibility.slice())
    }));
  }

  function _emit(type, payload) {
    _listeners.forEach(function (listener) {
      try {
        listener(type, payload);
      } catch (e) {
        // A misbehaving listener must never break the registry or other listeners.
      }
    });
  }

  function _isValidCode(code) {
    return typeof code === 'string' && CODE_PATTERN.test(code);
  }

  // ── Lookup ──

  function isCoreLanguage(code) {
    return typeof code === 'string' && CORE_CODES.indexOf(code) !== -1;
  }

  function isRegistered(code) {
    return typeof code === 'string' && _registry.has(code);
  }

  function getLanguage(code) {
    if (typeof code !== 'string' || !_registry.has(code)) return null;
    return _freezeEntry(_registry.get(code));
  }

  function getAllLanguages() {
    const entries = Array.from(_registry.values()).sort(function (a, b) {
      return a.priority - b.priority || a.code.localeCompare(b.code);
    });
    return Object.freeze(entries.map(_freezeEntry));
  }

  function getCoreLanguages() {
    return CORE_CODES;
  }

  // ── Registry lifecycle ──

  function registerLanguage(descriptor) {
    const op = 'registerLanguage';
    if (!descriptor || typeof descriptor !== 'object') {
      return _buildOpResult(op, false, 'descriptor must be an object.');
    }
    const code = descriptor.code;
    if (!_isValidCode(code)) {
      return _buildOpResult(op, false, 'invalid or missing language code: "' + code + '".');
    }
    if (_registry.has(code)) {
      return _buildOpResult(op, false, 'language "' + code + '" is already registered.');
    }
    if (typeof descriptor.displayName !== 'string' || descriptor.displayName.trim().length === 0) {
      return _buildOpResult(op, false, 'displayName is required.');
    }

    const priority = _registry.size;
    _registry.set(code, {
      code: code,
      displayName: descriptor.displayName,
      nativeName: typeof descriptor.nativeName === 'string' ? descriptor.nativeName : descriptor.displayName,
      region: typeof descriptor.region === 'string' ? descriptor.region : null,
      continent: typeof descriptor.continent === 'string' ? descriptor.continent : null,
      writingSystem: typeof descriptor.writingSystem === 'string' ? descriptor.writingSystem : null,
      script: typeof descriptor.script === 'string' ? descriptor.script : null,
      direction: (descriptor.direction === 'RTL') ? 'RTL' : 'LTR',
      ocrSupportLevel: typeof descriptor.ocrSupportLevel === 'string' ? descriptor.ocrSupportLevel : 'unknown',
      engineCompatibility: [],
      downloadStatus: typeof descriptor.downloadStatus === 'string' ? descriptor.downloadStatus : 'not_downloaded',
      installedStatus: typeof descriptor.installedStatus === 'string' ? descriptor.installedStatus : 'not_installed',
      packageVersion: typeof descriptor.packageVersion === 'string' ? descriptor.packageVersion : null,
      priority: priority,
      protected: false,
      enabled: descriptor.enabled !== false
    });
    _stats.registrations += 1;
    _emit('register', { code: code });
    return _buildOpResult(op, true, null);
  }

  function removeLanguage(code) {
    const op = 'removeLanguage';
    if (typeof code !== 'string' || !_registry.has(code)) {
      return _buildOpResult(op, false, 'language "' + code + '" is not registered.');
    }
    if (_registry.get(code).protected) {
      return _buildOpResult(op, false, 'language "' + code + '" is a core language and cannot be removed.');
    }
    _registry.delete(code);
    _groups.delete(code);
    Array.from(_aliases.entries()).forEach(function (entry) {
      if (entry[1] === code) _aliases.delete(entry[0]);
    });
    if (_defaultLanguage === code) _defaultLanguage = null;
    _stats.removals += 1;
    _emit('remove', { code: code });
    return _buildOpResult(op, true, null);
  }

  // ── Enablement ──

  function enableLanguage(code) {
    const op = 'enableLanguage';
    if (typeof code !== 'string' || !_registry.has(code)) {
      return _buildOpResult(op, false, 'language "' + code + '" is not registered.');
    }
    _registry.get(code).enabled = true;
    _stats.enables += 1;
    _emit('enable', { code: code });
    return _buildOpResult(op, true, null);
  }

  function disableLanguage(code) {
    const op = 'disableLanguage';
    if (typeof code !== 'string' || !_registry.has(code)) {
      return _buildOpResult(op, false, 'language "' + code + '" is not registered.');
    }
    _registry.get(code).enabled = false;
    _stats.disables += 1;
    _emit('disable', { code: code });
    return _buildOpResult(op, true, null);
  }

  function isEnabled(code) {
    return typeof code === 'string' && _registry.has(code) && _registry.get(code).enabled === true;
  }

  // ── Aliases ──

  function setAlias(alias, code) {
    const op = 'setAlias';
    if (typeof alias !== 'string' || alias.trim().length === 0) {
      return _buildOpResult(op, false, 'alias must be a non-empty string.');
    }
    if (typeof code !== 'string' || !_registry.has(code)) {
      return _buildOpResult(op, false, 'language "' + code + '" is not registered.');
    }
    _aliases.set(alias.toLowerCase(), code);
    _stats.aliasesSet += 1;
    _emit('alias', { alias: alias.toLowerCase(), code: code });
    return _buildOpResult(op, true, null);
  }

  function resolveAlias(alias) {
    if (typeof alias !== 'string') return null;
    const lower = alias.toLowerCase();
    if (_aliases.has(lower)) return _aliases.get(lower);
    if (_registry.has(alias)) return alias;
    return null;
  }

  // ── Groups ──

  function setGroup(code, group) {
    const op = 'setGroup';
    if (typeof code !== 'string' || !_registry.has(code)) {
      return _buildOpResult(op, false, 'language "' + code + '" is not registered.');
    }
    if (typeof group !== 'string' || group.trim().length === 0) {
      return _buildOpResult(op, false, 'group must be a non-empty string.');
    }
    _groups.set(code, group);
    _stats.groupsSet += 1;
    _emit('group', { code: code, group: group });
    return _buildOpResult(op, true, null);
  }

  function getLanguagesByGroup(group) {
    if (typeof group !== 'string') return Object.freeze([]);
    const codes = [];
    _groups.forEach(function (g, code) {
      if (g === group) codes.push(code);
    });
    return Object.freeze(codes.sort());
  }

  // ── Priority / ordering / default ──

  function setPriority(code, priority) {
    const op = 'setPriority';
    if (typeof code !== 'string' || !_registry.has(code)) {
      return _buildOpResult(op, false, 'language "' + code + '" is not registered.');
    }
    if (typeof priority !== 'number' || !Number.isFinite(priority)) {
      return _buildOpResult(op, false, 'priority must be a finite number.');
    }
    _registry.get(code).priority = priority;
    _stats.prioritiesSet += 1;
    _emit('priority', { code: code, priority: priority });
    return _buildOpResult(op, true, null);
  }

  function getPriority(code) {
    if (typeof code !== 'string' || !_registry.has(code)) return null;
    return _registry.get(code).priority;
  }

  function getPreferredOrder() {
    return Object.freeze(
      Array.from(_registry.values())
        .sort(function (a, b) { return a.priority - b.priority || a.code.localeCompare(b.code); })
        .map(function (r) { return r.code; })
    );
  }

  function setDefaultLanguage(code) {
    const op = 'setDefaultLanguage';
    if (typeof code !== 'string' || !_registry.has(code)) {
      return _buildOpResult(op, false, 'language "' + code + '" is not registered.');
    }
    if (!_registry.get(code).enabled) {
      return _buildOpResult(op, false, 'language "' + code + '" is disabled and cannot be default.');
    }
    _defaultLanguage = code;
    _stats.defaultChanges += 1;
    _emit('default', { code: code });
    return _buildOpResult(op, true, null);
  }

  function getDefaultLanguage() {
    return _defaultLanguage;
  }

  // ── Validation ──

  function validateLanguageCode(code) {
    _stats.validations += 1;
    return _isValidCode(code);
  }

  function validateCombination(codes) {
    _stats.validations += 1;
    if (!Array.isArray(codes)) {
      return Object.freeze({ valid: false, invalid: Object.freeze([]), reason: 'codes must be an array.' });
    }
    const invalid = codes.filter(function (c) {
      return !(typeof c === 'string' && _registry.has(c) && _registry.get(c).enabled);
    });
    return Object.freeze({
      valid: invalid.length === 0,
      invalid: Object.freeze(invalid.slice()),
      reason: invalid.length === 0 ? null : 'one or more codes are unregistered or disabled.'
    });
  }

  // ── Engine compatibility ──

  function setEngineCompatibility(code, engines) {
    const op = 'setEngineCompatibility';
    if (typeof code !== 'string' || !_registry.has(code)) {
      return _buildOpResult(op, false, 'language "' + code + '" is not registered.');
    }
    if (!Array.isArray(engines) || !engines.every(function (e) { return typeof e === 'string'; })) {
      return _buildOpResult(op, false, 'engines must be an array of strings.');
    }
    _registry.get(code).engineCompatibility = engines.slice();
    _stats.engineCompatibilitySets += 1;
    _emit('engineCompatibility', { code: code, engines: engines.slice() });
    return _buildOpResult(op, true, null);
  }

  function isEngineCompatible(code, engine) {
    if (typeof code !== 'string' || !_registry.has(code) || typeof engine !== 'string') return false;
    return _registry.get(code).engineCompatibility.indexOf(engine) !== -1;
  }

  // ── Diagnostics / stats ──

  function getDiagnostics() {
    let enabledCount = 0;
    let coreCount = 0;
    _registry.forEach(function (r) {
      if (r.enabled) enabledCount += 1;
      if (r.protected) coreCount += 1;
    });
    const orphanedAliases = [];
    _aliases.forEach(function (code, alias) {
      if (!_registry.has(code)) orphanedAliases.push(alias);
    });
    return Object.freeze({
      totalLanguages: _registry.size,
      coreLanguages: coreCount,
      customLanguages: _registry.size - coreCount,
      enabledCount: enabledCount,
      disabledCount: _registry.size - enabledCount,
      aliasCount: _aliases.size,
      orphanedAliasCount: orphanedAliases.length,
      orphanedAliases: Object.freeze(orphanedAliases),
      groupCount: new Set(_groups.values()).size,
      hasDefaultLanguage: _defaultLanguage !== null,
      defaultLanguage: _defaultLanguage,
      timestamp: Date.now()
    });
  }

  function getStats() {
    return Object.freeze(Object.assign({}, _stats, { timestamp: Date.now() }));
  }

  // ── Import / export ──

  function exportRegistry() {
    _stats.exports += 1;
    return Object.freeze({
      version: VERSION,
      exportedAt: Date.now(),
      languages: getAllLanguages(),
      aliases: Object.freeze(Object.fromEntries(_aliases)),
      groups: Object.freeze(Object.fromEntries(_groups)),
      defaultLanguage: _defaultLanguage
    });
  }

  function importRegistry(data) {
    const op = 'importRegistry';
    if (!data || typeof data !== 'object' || !Array.isArray(data.languages)) {
      return _buildOpResult(op, false, 'data.languages must be an array.');
    }
    let imported = 0;
    let skipped = 0;
    let rejected = 0;
    data.languages.forEach(function (entry) {
      if (!entry || typeof entry !== 'object' || !_isValidCode(entry.code)) {
        rejected += 1;
        return;
      }
      if (_registry.has(entry.code)) {
        // Merge-only: never overwrite an existing (core or custom) entry.
        skipped += 1;
        return;
      }
      const result = registerLanguage(entry);
      if (result.success) {
        imported += 1;
      } else {
        rejected += 1;
      }
    });
    _stats.imports += 1;
    _emit('import', { imported: imported, skipped: skipped, rejected: rejected });
    return _buildOpResult(
      op,
      rejected === 0,
      rejected === 0 ? null : (imported + ' imported, ' + skipped + ' skipped (already registered), ' + rejected + ' rejected (invalid).')
    );
  }

  // ── Events ──

  function onChange(listener) {
    if (typeof listener !== 'function') return false;
    _listeners.add(listener);
    return true;
  }

  function offChange(listener) {
    return _listeners.delete(listener);
  }

  // ── Version ──

  function getVersion() {
    return VERSION;
  }

  /**
   * Frozen public API. 30 methods. No private members are exposed.
   */
  window.CozyOS.OCRLanguage = Object.freeze({
    registerLanguage: registerLanguage,
    removeLanguage: removeLanguage,
    isCoreLanguage: isCoreLanguage,
    isRegistered: isRegistered,
    getLanguage: getLanguage,
    getAllLanguages: getAllLanguages,
    getCoreLanguages: getCoreLanguages,
    enableLanguage: enableLanguage,
    disableLanguage: disableLanguage,
    isEnabled: isEnabled,
    setAlias: setAlias,
    resolveAlias: resolveAlias,
    setGroup: setGroup,
    getLanguagesByGroup: getLanguagesByGroup,
    setPriority: setPriority,
    getPriority: getPriority,
    getPreferredOrder: getPreferredOrder,
    setDefaultLanguage: setDefaultLanguage,
    getDefaultLanguage: getDefaultLanguage,
    validateLanguageCode: validateLanguageCode,
    validateCombination: validateCombination,
    setEngineCompatibility: setEngineCompatibility,
    isEngineCompatible: isEngineCompatible,
    getDiagnostics: getDiagnostics,
    getStats: getStats,
    exportRegistry: exportRegistry,
    importRegistry: importRegistry,
    onChange: onChange,
    offChange: offChange,
    getVersion: getVersion
  });
})();
