# PHASE 6 — PATCH #6: Live-Relay Composition Bridge

**Type:** Implementation. Cumulative on top of Patch #5 (audit-only) and
Patch #4 (server identity chain).
**Scope:** Two new files only. Zero existing production files modified.

## Short audit (context for this patch)

Per PATCH5-AUDIT-REPORT.md's Step-6 findings, treated as already
established and not repeated here:
- Firebase is the real, shipped identity source (`dashboard.html` →
  `firebase-session-bridge.js` → `CozyOS.Session`).
- `LDCESessionEngine` is the real, shipped session/roster owner, using
  `CozyOS.Session.current().uid` — which is the raw Firebase uid.
- The server-backed relay stack (`/identity/assertion` → `SessionAuthority`
  → `RemoteRelayTransportProvider` → `CozyLiveParticipationController`) is
  real and fully tested but had no "integrating call site" — a gap that
  `cozy-live-participation-controller.js`'s own header already names by
  requirement ("the integrating call site MUST route the provider's
  onEvent messages into this controller's handleTransportEvent").

## What was implemented

**`core/shell/live/live-relay-composition-bridge.js`** — the missing
integrating call site. `LiveRelayCompositionBridge.establishRelaySession(opts)`
composes, in order:
1. `getFirebaseIdToken()` — real passthrough to the already-loaded
   `CozyOS.Firebase.Auth`, fails closed on no user / init failure /
   `getIdToken()` failure.
2. `obtainIdentityAssertion()` — `POST <relayHttpUrl>/identity/assertion`
   with the real ID token as `Authorization: Bearer`, verifies the
   returned `userId` matches the signed-in Firebase uid before trusting
   it (defensive, fails closed on mismatch).
3. `fetchParticipationToken()` — `POST <relayHttpUrl>/session/:id/token/:sub`
   (or `/register-host/:hostId` + a required follow-up `/token` call)
   with the assertion as `Authorization: Bearer`.
4. Constructs `RemoteRelayTransportProvider` with a `getToken` closure
   returning the pre-fetched participation token, and
   `CozyLiveParticipationController` wired to receive its events — in an
   order that avoids a real ordering bug in
   `cozy-live-participation-controller.js`'s own header example (see
   the new file's "A DOCUMENTATION DISCREPANCY..." section; that other
   file was not modified).

Preserves every responsibility boundary named in the handoff:
Firebase/`CozyOS.Session` remains the sole identity source,
`LDCESessionEngine` remains the sole session/roster/language owner (this
file only accepts a `sessionId` it already created), `SessionAuthority`
remains the sole speaking authority, `TransportSelector` is passed
through unmodified and optional, `ParticipationController` remains the
sole capture/speaking client, and no `CozyLiveDistributionTransport`
code was touched.

**`core/shell/live/tests/live-relay-composition-bridge.test.js`** — 18
focused tests against controlled fixtures (fake fetch, fake Firebase
Auth service, fake provider/controller constructors — same "no live
network in this sandbox" disclosure as the rest of this repository's
test suite). Covers: real happy-path composition and wiring
(A/B/C/D/end-to-end), no-Firebase-user fail-closed (E), ID-token-fetch
failure fail-closed (F), assertion-endpoint rejection fail-closed (G),
assertion/uid-mismatch fail-closed — no participation-token confusion
(H), a signed-in-user change producing that user's identity and never
a stale one (I), backward-compatible required-opts validation (J), the
register-host path's real two-step token flow, and a missing-provider
fail-closed case.

## What was deliberately NOT done (per the handoff's own boundary)

- **No product decision made.** This bridge is not called from
  `LDCESessionEngine`, `dashboard.html`, or any shipped page. WHEN a
  session should use this relay path instead of/alongside LDCE's
  existing Firestore mesh signaling remains the open product question
  from PATCH5-AUDIT-REPORT.md's Step 6 (options A/B/C/D). This patch
  builds the mechanism a future caller would use once that's decided —
  it does not decide it.
- **No token-refresh-on-reconnect.** Documented as a known limitation in
  the new file's header: `RemoteRelayTransportProvider.getToken()` is
  called synchronously on every reconnect, so this bridge can only
  supply one pre-fetched token for the connection's lifetime. A
  deployment whose token TTL is shorter than a real session's lifetime
  will see reconnects rejected after expiry — a real, separate
  follow-on dependency.
- **No real-network/real-Firebase verification**, for the same
  environment reason already disclosed elsewhere in this repository
  (no outbound internet in this sandbox).

## Verification

```
IMPLEMENTED:
core/shell/live/live-relay-composition-bridge.js (new)
core/shell/live/tests/live-relay-composition-bridge.test.js (new, 18 tests)

VERIFIED:
BASELINE (server/live-relay, unchanged from Patch #4): 132/132
NEW (live-relay-composition-bridge):                    18/18
TOTAL:                                                  150/150
FAILURES: 0
Whole-tree diff vs Patch #5: exactly the two files above, nothing else.
Protected files (server/live-relay/identity-assertion.js,
firebase-identity-issuer.js, session-authority.js, core/shell/
cozy-login-gate.js, core/modules/founder-story/*): byte-identical to
Patch #4 (see protected-file-audit hashes below).
Fresh extraction: re-run, see Step 10 verification.

NOT VERIFIED:
Real Firebase login, real Google public-key retrieval, real production
Firebase ID token, real WebSocket connection to a live relay server —
none attempted, none claimed. Only the bridge's own control-flow logic
against controlled fixtures is verified.
No production page calls this bridge yet — that wiring is a separate,
explicit follow-on change per the "what was NOT done" section above.

KNOWN LIMITATIONS:
Token freshness across reconnects (see file header). No production
caller yet (deliberate — see above).

MISSING DEPENDENCY:
A product decision on when/whether the relay path activates for a
given LDCE session (PATCH5-AUDIT-REPORT.md Step 6, options A-D still
open).

NEXT BUILD MUST START WITH:
Once the product decision above is made, wire establishRelaySession()
into the chosen call site (e.g. an optional relay-mode extension to
LDCESessionEngine, or a small live-shell wrapper — per whichever option
is chosen) and add real-Firebase/real-network verification if/when this
sandbox or a deployment target has outbound network access.
```
