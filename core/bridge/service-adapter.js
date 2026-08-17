/**
 * =============================================================================
 * CozyOS Engine Integration Bridge — Service Adapter
 * File: core/bridge/service-adapter.js
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Owns exposing an already-wrapped engine adapter (from Engine Adapter) as
 * a real window.CozyOS.<Name> service, and — if the real ServiceRegistry
 * is present on the same target — recording descriptive metadata via its
 * existing registerCoordinator() (per cozy-registry.js's own documented
 * contract: "a coordinator still lives at window.CozyOS.<Name> ... only
 * stores DESCRIPTIVE metadata"). This file never invents a second registry.
 *
 * `target` IS INJECTED, NEVER ASSUMED (testability + honesty)
 * ------------------------------------------------------------
 * This file never reads a bare `window` global itself. The caller (Engine
 * Bridge) is handed the real `window` in a browser context; tests pass a
 * plain object. This means Service Adapter makes no unverifiable claim
 * about running in a browser — it does exactly what it's told to a target
 * object, and nothing more.
 * =============================================================================
 */

'use strict';

function expose(target, globalName, adapter) {
  if (!target || typeof target !== 'object') {
    throw new TypeError('[ServiceAdapter] expose() requires a target object (the real `window` in a browser, or a test double).');
  }
  if (typeof globalName !== 'string' || !globalName) {
    throw new TypeError('[ServiceAdapter] expose() requires a non-empty globalName.');
  }
  if (!target.CozyOS) target.CozyOS = {};
  if (target.CozyOS[globalName] && target.CozyOS[globalName] !== adapter.engine) {
    throw new Error(`[ServiceAdapter] window.CozyOS.${globalName} is already occupied by a different object — refusing to overwrite (Conflict Review: no duplicate registration).`);
  }
  target.CozyOS[globalName] = adapter.engine;
  return true;
}

function withdraw(target, globalName) {
  if (target && target.CozyOS && globalName in target.CozyOS) {
    delete target.CozyOS[globalName];
    return true;
  }
  return false;
}

/** Best-effort: uses the real registerCoordinator() if present; never fabricates a catalog entry if it isn't. */
function registerCoordinatorMeta(target, meta) {
  if (target && target.CozyOS && typeof target.CozyOS.registerCoordinator === 'function') {
    return target.CozyOS.registerCoordinator(meta);
  }
  return Object.freeze({ success: false, reason: 'target.CozyOS.registerCoordinator is not available — descriptive metadata skipped, engine is still exposed and usable.' });
}

const ServiceAdapter = Object.freeze({ expose, withdraw, registerCoordinatorMeta });

export default ServiceAdapter;
