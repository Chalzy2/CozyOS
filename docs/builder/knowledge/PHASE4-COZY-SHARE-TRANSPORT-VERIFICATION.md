# CozyOS File Phase 4 - Cozy Share Offline Transport Foundation - Verification Document

## Cozy Share Discovery

`core/collaboration/cozy-share.js` exists and is real, confirmed again
this round unchanged (byte-identical) - it is a Device Collaboration
Session Manager for LIVE PRODUCTION roles (camera-operator, audio-
operator, lighting-operator, projection-operator, presenter, viewer)
during a broadcast. This is a genuinely different problem domain from
file/folder transfer, despite the identical product name. It was not
modified, renamed, or given file-transfer responsibilities.

## Domain Boundary

`core/collaboration/cozy-share.js` (live production) and the new
`server/webauthn-rp/transfer-session-registry.js` (offline file
transfer, this phase) are deliberately kept separate at the domain
layer, exactly as instructed. Both may eventually share low-level
transport primitives, but neither was conflated into the other.

## CozyConnect Findings

`core/connectivity/cozy-connect.js` is real and unchanged (byte-
identical, confirmed). A genuine provider-registry architecture:
Bluetooth (navigator.bluetooth) and USB (navigator.usb) providers call
real browser APIs and honestly report {supported:false, reason} when
unavailable. No WiFi Direct or hotspot-control provider exists. This is
browser-side hardware discovery - a different concern from the
server-side session management this phase implements.

## Offline Transport - Exact Real Implementation

Real, implemented, and tested: same-network HTTP transport, using this
exact server's own existing session/cookie/route conventions - a
sender creates a session on a reachable server; a receiver (a
different authenticated user, potentially a different organization)
pairs with a real, cryptographically random, single-use token and
receives content through real HTTP calls, with the receiver's
organization always resolved from their own authenticated session -
never from sender-supplied identity.

Honest scope of what was actually verified: this sandbox provides one
process, one network stack. All 20 new tests exercise the complete,
real, non-mocked code path (session creation, pairing, manifest
retrieval, streamed content copy, independent checksum verification,
receiver-side document creation) via genuine HTTP requests to a real
running server - this is LOCAL TRANSPORT VERIFIED, not REAL
DEVICE-TO-DEVICE VERIFIED (which would require two physically separate
devices/network stacks this environment cannot provide) and not merely
ARCHITECTURE VERIFIED ONLY (the code genuinely executes and produces
correct, checksum-verified results, not just a design on paper).

## QR Pairing - Exact Implementation Status

Real: the QR payload is genuinely generated at session creation
({v:1, sessionId, token, itemCount}), using the same real,
cryptographically random token (crypto.randomBytes(32)) that secures
pairing itself.

Not implemented, honestly, not fabricated: QR rendering (turning that
payload into a scannable image) and QR scanning (camera capture +
decode). Repository-wide search confirmed zero QR encoder/decoder
exists anywhere in this codebase. core/security/qr-renderer.js is a
real, existing, honest interface stub (Milestone 132a) that always
fails closed with a specific reason until a real encoder is registered
via its own registerEncoder() seam - this phase does not install a
second QR library, vendor one, or fabricate rendering.

## Hotspot - Exact Implementation Status

Not implemented - platform limitation, confirmed not assumed. Hotspot
creation/control requires native OS integration no browser API
exposes (confirmed independently by cozy-share.js's own header,
re-verified this round). This phase's real transport (same-network
HTTP) is the "hotspot NETWORK USAGE" half of the distinction the task
drew - it can transfer data over an existing local network, but this
repository contains no code path that creates or controls the network
itself.

## Other Transports - Capability Table

| Transport | Status | Evidence |
|---|---|---|
| Local Network / Same-server HTTP | SUPPORTED | Real, implemented, tested this round (20 tests) |
| QR pairing (session/token logic) | SUPPORTED | Real, implemented, tested this round |
| QR rendering/scanning | NOT IMPLEMENTED | Zero encoder/decoder found repository-wide; honest existing stub confirmed |
| Bluetooth | PLATFORM-DEPENDENT | Real capability detection exists in CozyConnect; no file-transfer-specific integration built this round |
| USB/OTG | PLATFORM-DEPENDENT | Real capability detection exists in CozyConnect; no file-transfer-specific integration built this round |
| Wi-Fi Direct | UNAVAILABLE | No browser API exists; confirmed absent in CozyConnect |
| NFC | UNAVAILABLE | No browser API integration found for file transfer |
| WebRTC | NOT IMPLEMENTED | Real WebRTC/signaling code exists (server/live-relay/) but is scoped to live audio/video relay, a different domain |
| Online/cloud transfer | NOT IMPLEMENTED THIS PHASE | Deliberately deferred per explicit instruction |

## Transfer Session Lifecycle

Real states, enforced by a real database CHECK constraint and real
code guards: pairing -> connected -> transfer_negotiation ->
transferring -> verifying -> completed, with real failure paths
(failed, cancelled, corrupted, expired). Invalid transitions are
honestly rejected (tested: completing/cancelling an already-terminal
session returns invalid_state_transition, never silently succeeds).

## Integrity - Checksum Evidence

The receiver never trusts the sender-recorded checksum blindly -
transferItem() independently recomputes SHA-256 over the actual bytes
as they are copied, and only then compares against the manifest's
recorded value. A real test directly tampers with the manifest's
stored checksum and confirms: the transfer is rejected with
checksum_mismatch, the session is marked corrupted (never silently
completed).

## Large File - Actual Test

A real 3MB payload (crypto.randomBytes) was transferred through the
complete, real path and confirmed byte-for-byte identical on the
receiving side. This proves 3MB was tested - it does not prove
unlimited transfer size. The existing Phase 2 binary-upload limit
(25MB) still applies to the underlying storage calls this transport
reuses.

## Folder Transfer - Hierarchy Preservation Result

A received document was placed directly into a real, pre-existing
destination folder in the receiver's own organization via
folders.moveDocument() (the existing Phase 3 API, unmodified) -
confirmed by a real test. Full nested-hierarchy reconstruction was not
built this round - the current scope proves single-destination-folder
placement works correctly and compatibly.

## Security - Test Results

20 new tests, all passing: session creation, one-active-session
enforcement (a real partial unique index), real single-use pairing
with cryptographically random tokens, replay rejection, forged/wrong
token rejection, forged/nonexistent session ID rejection, forged
organizationId rejection, forged documentId rejection, path-traversal-
shaped and absolute/Windows-drive-path rejection, non-party access
rejection, invalid state transition rejection, session expiration
enforcement, and checksum-mismatch/corruption detection.

## Persistence - Restart Results

Real test: PROCESS A creates a session, pairs it with a real receiver.
The server is fully closed. PROCESS B (a genuinely new server
instance, same database file) successfully completes the real receive
operation, with the checksum matching exactly. VERIFIED.

## Render

NOT VERIFIED FROM CURRENT EXECUTION ENVIRONMENT. No network or Shell
access to the live Render service exists in this sandbox. The new
tables follow the exact same SQLite-file-on-persistent-disk pattern
already partially verified for COZY_WEBAUTHN_DB in Phase 2/3.

## Real Device-to-Device Test

NOT AVAILABLE FROM THIS ENVIRONMENT. No second physical device, no
second real network stack. Explicitly not fabricated.

## PostgreSQL Status

BLOCKED / NOT VERIFIED - no live PostgreSQL server in this
environment. SQLite was not substituted and presented as PostgreSQL-
verified.

## Regression Results

| Suite | Tests | Pass | Fail | Skip |
|---|---|---|---|---|
| All prior server suites | 231 | 231 | 0 | 1 (pre-existing) |
| document-storage.test.js (Phase 1) | 25 | 25 | 0 | 0 |
| document-binary-storage.test.js (Phase 2) | 13 | 13 | 0 | 0 |
| folder-organization.test.js (Phase 3) | 23 | 23 | 0 | 0 |
| transfer-session.test.js (Phase 4, new) | 20 | 20 | 0 | 0 |
| Boundary-server suites | 22 | 22 | 0 | 0 |
| TOTAL | 334 | 334 | 0 | 1 |

Zero new failures. The one skip is the same, re-confirmed, pre-existing
provider-certification.test.js skip present since before Phase 1.

## Locked Files

| File | Status |
|---|---|
| core/ai.js | byte-identical |
| core/ai/integration.js | byte-identical |
| core/ai/cozy-ai-language.js | byte-identical |
| core/ai/cozy-ai-memory.js | byte-identical |
| core/ai/cozy-ai-integration.js | byte-identical |

## Storage Coordinators

| File | Status |
|---|---|
| core/storage.js | byte-identical |
| core/modules/storage/cozy-storage.js | byte-identical |
| core/collaboration/cozy-share.js | byte-identical (live-production domain, untouched) |
| core/connectivity/cozy-connect.js | byte-identical (untouched) |

## One Real, Additive, Justified Change to Phase 1 Code

document-storage.js's load() method now additionally returns
binarySize/binaryMimeType/binaryChecksum/hasBinary as sibling fields
alongside the existing, unchanged record field - required so Phase 4's
manifest-building could access real binary metadata not previously
exposed. Purely additive; the full, unmodified Phase 1 test suite (25
tests) was re-run and confirmed still passing before and after this
change.

## Known Limitations (evidence-backed only)

- QR rendering/scanning is not implemented - no encoder/decoder exists
  anywhere in this repository.
- Hotspot creation/control is not implemented - no browser API exists.
- Bluetooth/USB/Wi-Fi Direct/NFC/WebRTC file-transfer-specific
  integration is not implemented this round.
- Automatic multi-level folder hierarchy reconstruction on receive is
  not implemented - single-destination-folder placement is proven.
- Resumable/chunked transfer for interrupted connections is not
  implemented this round.
- Real device-to-device transfer remains unverified in this
  environment.
- Render's and PostgreSQL's specific behavior for the new schema
  remain unverified in this environment.

## Next Dependency

QR rendering/scanning (registering a real encoder into the existing
qr-renderer.js seam) and/or automatic folder-hierarchy reconstruction
on receive - identified, not implemented this round.
