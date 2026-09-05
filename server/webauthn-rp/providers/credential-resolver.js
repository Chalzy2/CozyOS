'use strict';

// CozyOS — Provider Credential Resolver (Phase 5.2)
// File Reference: server/webauthn-rp/providers/credential-resolver.js
//
// WHY THIS FILE EXISTS
// ---------------------
// Phase 5.1 discovery found: the client-side Vault engine
// (core/modules/vault/cozy-vault-engine.js) is real, well-designed
// secret management — but browser-only (window.CozyOS), not reusable in
// the Node.js server process. The server already has a real, working
// convention: process.env.COZY_* (COZY_DATABASE_URL, COZY_RP_ID,
// COZY_FIREBASE_PROJECT_ID, etc., used throughout static-boundary-server.js
// and bootstrap-admin.js). This file formalizes that SAME convention for
// provider credentials — it does not introduce a second secret system.
//
// WHAT THIS FILE DOES
//   Resolves a credential by environment variable NAME (never a value)
//   at call time, throwing a clear, actionable error if missing —
//   exactly the fail-closed posture every other credential lookup in
//   this codebase already has. Never logs, never caches, never returns
//   a default for a missing credential.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO
//   It does not store, encrypt, or manage credentials — that remains
//   the operator's job (setting real environment variables in whatever
//   real deployment environment eventually runs this). This is a lookup
//   helper, not a secret store.

class CredentialError extends Error {
  constructor(code, envVarName) {
    super(`${code}: ${envVarName}`);
    this.code = code;
    this.envVarName = envVarName;
  }
}

/**
 * resolveCredential — reads a named environment variable. Throws
 * (never returns undefined, never returns a fabricated default) if it's
 * missing or empty, so a misconfigured provider fails loudly and
 * immediately rather than silently operating with no credential.
 */
function resolveCredential(envVarName) {
  if (typeof envVarName !== 'string' || !envVarName.trim()) {
    throw new TypeError('[credential-resolver] envVarName must be a non-empty string.');
  }
  const value = process.env[envVarName];
  if (typeof value !== 'string' || !value.trim()) {
    throw new CredentialError('credential_not_configured', envVarName);
  }
  return value;
}

/** isCredentialConfigured — a non-throwing existence check, for adapters that want to report their own configured/not-configured status without triggering an error path. */
function isCredentialConfigured(envVarName) {
  try {
    resolveCredential(envVarName);
    return true;
  } catch (_err) {
    return false;
  }
}

module.exports = { resolveCredential, isCredentialConfigured, CredentialError };
