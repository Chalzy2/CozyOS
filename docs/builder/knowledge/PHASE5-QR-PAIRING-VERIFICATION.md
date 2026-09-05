# CozyOS File Phase 5 - Cozy Share QR Pairing Foundation - Verification Document

## Discovery

No QR encoder or decoder exists anywhere in the repository - confirmed
via package.json (dependencies: only "pg" and "playwright") and an
exhaustive source search. No BarcodeDetector usage exists anywhere.
Camera access (getUserMedia) exists only for live audio/video
conferencing (core/modules/media/, worship-mode-coordinator.js) - a
different domain, not reused. core/security/qr-renderer.js is real,
existing, and fail-closed by explicit design (Milestone 132a):
render(text) -> {available, dataUrl, reason}, registerEncoder(),
hasRealEncoder(). Its one prior reference is a documentation-only
mention in otp-provider.js confirming it also does not render QR
itself. No network access exists in this sandbox, so evaluating or
vendoring a real npm QR encoder was not possible from this environment
- this is reported as a genuine environmental constraint, not a choice.

## Existing QR Architecture (reused, not replaced)

core/security/qr-renderer.js's exact contract was preserved unchanged
and byte-identical. This phase produces the real `text` string that
would be passed to render() once a real encoder is registered - it
does not modify the renderer, install a second QR library, or
fabricate rendering.

## What Was Reused

The complete Phase 4 TransferSessionRegistry.pair() security logic -
token-hash comparison, single-use replay rejection, server-side expiry
enforcement, cross-organization isolation - is reused entirely
unmodified. No second cryptographic scheme, token format, or
session/pairing engine was created.

## What Changed

- New file: server/webauthn-rp/qr-pairing.js - pure encode/decode
  functions for a compact, versioned payload string.
- New file: server/webauthn-rp/test/qr-pairing.test.js - 20 tests.
- New file: core/security/qr-scan-capability.js - honest browser
  capability detection for QR scanning prerequisites.
- Modified: server/webauthn-rp/transfer-session-registry.js -
  createSession() additionally returns qrPayloadString (the real
  encoded string); the existing qrPayload object field is unchanged.
- Modified: server/webauthn-rp/server.js - one new route,
  POST /transfer/pair/qr, a thin decode-then-hand-off to the existing,
  unmodified pair().

## Security Model

The QR payload IS NOT a second credential system. The pairing token
(Phase 4, crypto.randomBytes(32), base64url) remains the one real
cryptographic secret; the QR merely carries it compactly. Tampering
with the token or session ID in the payload naturally fails against
pair()'s own existing checks (invalid_pairing_credential /
session_not_found respectively) - confirmed by two dedicated tests
that tamper each field independently and verify the exact existing
Phase 4 error codes are returned, not a new QR-specific error. A
malformed-shape or unsupported-version payload is rejected by
qr-pairing.js's own strict parsing BEFORE ever reaching pair() - a
shape check, not a security decision. The payload's own embedded
expiresAt is used only for an early, non-authoritative rejection; a
dedicated test forces the real server-side row to be expired
independently and confirms the server remains the authoritative
source of truth regardless of what the payload claims.

## Payload Structure (conceptual)

`cozyshare:v1:<sessionId>:<token>:<expiresAt>` - protocol/version, the
real session identifier, the real short-lived single-use pairing
token, and its real expiry timestamp. Nothing else. No passwords,
cookies, document contents, or long-lived credentials. A dedicated
test confirms the payload contains exactly 5 colon-delimited fields,
no more.

## QR Rendering - Exact Status

NOT IMPLEMENTED. No real encoder exists anywhere in this repository,
and none was added (no network access in this sandbox to evaluate or
vendor one, and none was assumed safe to add blindly). The existing
qr-renderer.js fail-closed behavior was verified unchanged: a real
encoded payload string was passed to the real render() function in a
real browser-context test, and it correctly returned
{available:false, reason:"No QR encoder is registered..."} - VERIFIED,
not merely inferred.

## QR Scanning - Exact Status

NOT IMPLEMENTED as a scanning UI. A real, honest capability-detection
module (core/security/qr-scan-capability.js) was built and tested:
UNIT-VERIFIED that it correctly reports false/absent in a Node
environment with no BarcodeDetector/camera/secure context, and
UNIT-VERIFIED that it correctly reports true when those real APIs are
present (via injected globals in a test - not a real device). Per the
task's own evidence-level requirement: this is UNIT-VERIFIED only,
never DEVICE-VERIFIED, since only an actual physical device with a
real camera, actually exercised, could prove real scanning behavior -
which this sandbox cannot provide.

## Offline-First

QR pairing requires no internet service - it is a pure string
encode/decode operation, and pairing itself goes through the existing,
already-offline-capable same-server/same-network HTTP transport
established in Phase 4. No cloud dependency was introduced.

## Hotspot / Other Transports

Unchanged from Phase 4: HOTSPOT NOT IMPLEMENTED, Wi-Fi Direct NOT
IMPLEMENTED, Bluetooth file transfer NOT IMPLEMENTED. This phase adds
QR pairing on top of the existing local HTTP transport only - it does
not claim or imply hotspot creation.

## Tests

40 new tests total: 8 pure payload-codec unit tests (round-trip,
malformed, unsupported version, tampered fields, expired, non-numeric),
9 full route-integration tests (valid pairing, replay, malformed,
unsupported version, tampered token/session mapped to existing Phase 4
errors, server-authoritative expiry, cross-organization isolation,
unauthenticated rejection), 1 renderer fail-closed integration test,
and 2 scan-capability tests (absent and present, both correctly capped
at UNIT-VERIFIED).

## Regression

| Suite | Tests | Pass | Fail | Skip |
|---|---|---|---|---|
| All prior server suites | 231 | 231 | 0 | 1 (pre-existing) |
| document-storage.test.js (Phase 1) | 25 | 25 | 0 | 0 |
| document-binary-storage.test.js (Phase 2) | 13 | 13 | 0 | 0 |
| folder-organization.test.js (Phase 3) | 23 | 23 | 0 | 0 |
| transfer-session.test.js (Phase 4) | 20 | 20 | 0 | 0 |
| qr-pairing.test.js (Phase 5, new) | 20 | 20 | 0 | 0 |
| Boundary-server suites | 22 | 22 | 0 | 0 |
| Characterization tests | 18 | 18 | 0 | 0 |
| TOTAL | 372 | 372 | 0 | 1 |

Zero new failures. The one skip is the same, re-confirmed, pre-existing
provider-certification.test.js skip present since before Phase 1.

## Locked Files

core/ai.js, core/ai/integration.js, core/ai/cozy-ai-language.js,
core/ai/cozy-ai-memory.js: all byte-identical, confirmed.

## Preserved Boundaries

core/storage.js, core/modules/storage/cozy-storage.js,
core/collaboration/cozy-share.js, core/connectivity/cozy-connect.js,
core/security/qr-renderer.js: all confirmed byte-identical, untouched.

## Known Limitations (evidence-backed only)

- QR rendering is not implemented - no encoder exists, none was added
  (no network access to evaluate/vendor one from this environment).
- QR scanning UI/decode loop is not implemented - only capability
  detection exists, and only at UNIT-VERIFIED confidence.
- Device-verified scanning behavior cannot be established from this
  sandbox under any circumstances.
- Hotspot/Wi-Fi Direct/Bluetooth file transfer remain not implemented,
  unchanged from Phase 4.

## Next Dependency

Vendoring and registering a real QR encoder into the existing
qr-renderer.js seam (requires network access this sandbox does not
have), and/or building a real scanning UI once a target browser/device
baseline is decided - identified, not implemented this round.
