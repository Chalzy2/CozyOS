'use strict';

// CozyOS File - Phase 5: Cozy Share QR Pairing Payload
// File Reference: server/webauthn-rp/qr-pairing.js
//
// REPOSITORY DISCOVERY THIS ROUND:
//   No QR encoder/decoder exists anywhere in this repository (confirmed
//   via package.json - only "pg" and "playwright" are dependencies -
//   and an exhaustive source search). core/security/qr-renderer.js is
//   real, existing, and fail-closed by explicit design (Milestone
//   132a): render(text) -> {available, dataUrl, reason}, always
//   available:false until a real encoder is registered via
//   registerEncoder(). This file does not duplicate, replace, or
//   modify that contract - it produces the real `text` string that
//   render() would be called with, once a real encoder exists.
//   No BarcodeDetector usage and no QR-specific camera code exists
//   anywhere either (getUserMedia exists only for live audio/video
//   conferencing - core/modules/media/, a different domain).
//
// ARCHITECTURE DECISION: no new session/pairing/token engine was
// created. TransferSessionRegistry.pair() (Phase 4, unmodified) already
// contains the complete, real security logic - token-hash comparison,
// replay rejection, expiry enforcement, cross-organization isolation.
// This file is a thin, pure encode/decode layer: it turns an existing
// session's real sessionId/token/expiresAt into a compact, versioned
// string, and parses a scanned string back into the same three real
// values for the caller to hand to the EXISTING, unmodified pair()
// method. No second cryptographic scheme was invented - the base64url
// pairing token (Phase 4, crypto.randomBytes(32)) IS the real
// credential; tampering with any field in the payload naturally fails
// against pair()'s own real, existing checks (wrong token ->
// invalid_pairing_credential, wrong session -> session_not_found),
// without needing a redundant signature on top.
//
// PAYLOAD FORMAT: "cozyshare:v1:<sessionId>:<token>:<expiresAt>"
//   A compact, versioned, colon-delimited URI-style string - chosen
//   over JSON for QR efficiency (shorter payloads scan more reliably)
//   and because both sessionId (UUID) and token (base64url) contain no
//   colons, making strict, unambiguous parsing straightforward and
//   safe without needing escaping.
//
// WHAT THE QR CONTAINS, EXACTLY (per the explicit minimal-payload
// requirement): protocol/version, the real session identifier, the
// real short-lived single-use pairing token, and its real expiry
// timestamp. Nothing else - no passwords, no cookies, no document
// contents, no personal information, no long-lived credential.

const CURRENT_VERSION = 'v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/; // base64url shape, generous bounds around the real 32-byte/43-char token.

class QrPayloadError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * encodeQrPayload({sessionId, token, expiresAt})
 *   Pure function - produces the exact string that would be passed to
 *   window.CozyOS.QRRenderer.render(text) once a real encoder exists.
 */
function encodeQrPayload({ sessionId, token, expiresAt }) {
  if (!sessionId || !token || !Number.isInteger(expiresAt)) {
    throw new TypeError('[qr-pairing] encodeQrPayload(): sessionId, token, and an integer expiresAt are all required.');
  }
  return `cozyshare:${CURRENT_VERSION}:${sessionId}:${token}:${expiresAt}`;
}

/**
 * decodeQrPayload(raw)
 *   Strict, fail-closed parsing. Any malformed shape, wrong field
 *   count, unsupported version, or field failing its own format check
 *   is rejected with a specific reason - never partially accepted.
 *   This is a payload-shape check only; the real, authoritative
 *   security decision (does this token actually match this session,
 *   has the server-side row actually expired, is this session still
 *   pairable) remains entirely inside the existing, unmodified
 *   TransferSessionRegistry.pair() - this function never makes a
 *   security decision on its own, only a shape decision.
 */
function decodeQrPayload(raw) {
  if (typeof raw !== 'string' || !raw) return { valid: false, reason: 'malformed_payload' };

  const parts = raw.split(':');
  if (parts.length !== 5) return { valid: false, reason: 'malformed_payload' };
  const [scheme, version, sessionId, token, expiresAtStr] = parts;

  if (scheme !== 'cozyshare') return { valid: false, reason: 'malformed_payload' };
  if (version !== CURRENT_VERSION) return { valid: false, reason: 'unsupported_version' };
  if (!UUID_PATTERN.test(sessionId)) return { valid: false, reason: 'malformed_payload' };
  if (!TOKEN_PATTERN.test(token)) return { valid: false, reason: 'malformed_payload' };
  if (!/^\d+$/.test(expiresAtStr)) return { valid: false, reason: 'malformed_payload' };

  const expiresAt = Number(expiresAtStr);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) return { valid: false, reason: 'malformed_payload' };

  // Early, honest, non-authoritative rejection for an obviously expired
  // payload (saves a round trip to the database) - the REAL,
  // authoritative expiry check still happens inside pair() itself
  // against the server's own row, exactly as Phase 4 already does. This
  // is defense in depth, not a second source of truth.
  if (expiresAt < Date.now()) return { valid: false, reason: 'expired_payload' };

  return { valid: true, sessionId, token, expiresAt };
}

module.exports = { encodeQrPayload, decodeQrPayload, QrPayloadError, CURRENT_VERSION };
