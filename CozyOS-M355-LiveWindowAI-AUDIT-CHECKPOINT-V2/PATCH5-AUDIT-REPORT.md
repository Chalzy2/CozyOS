# PHASE 6 — PATCH #5: Production Browser Composition-Owner Audit

**Type:** Audit only. Zero production code changed.
**Baseline:** COS-STEP4D-B-PHASE6-PATCH-4.zip (unmodified, extracted and re-verified below).

## MOST IMPORTANT LINE FOR THE NEXT BUILDER

Patch #4's server identity chain is complete and untouched. The browser
integration point the Patch #4→#5 handoff assumed exists ("the real
production browser Firebase auth owner") **does not exist** for the
server-backed relay path. Before any browser identity wiring is written,
a composition-owner decision (Step 3 below) has to be made deliberately —
this patch documents the evidence for that decision but does not make it.

## STEP 1 — THE RESPONSIBILITY GAP, TRACED AND CONFIRMED

Two separate, fully real, currently disconnected worlds exist in this
repository:

**World A — actual production live-communication path (wired into
`dashboard.html`, the real shipped entry point):**

```
dashboard.html
  → Firebase/firebase-auth.js, firebase-session.js  (real Firebase SDK)
  → core/modules/session/firebase-session-bridge.js  (Firebase → CozyOS.Session)
  → core/modules/identity/identity-engine.js         (CozyOS-native identity/ACL)
  → core/modules/communication/ldce-session-engine.js ("LDCESessionEngine")
      · current user via window.CozyOS.Session.current().uid
      · permissions via window.CozyOS.IdentityEngine
      · signaling via window.CozyOS.Firebase.Firestore (mesh, data-channel,
        pairwise WebRTC offer/answer documents) — NOT a WebSocket relay
  → core/modules/communication/ldce-media-session-engine.js (Stage 2: tracks,
      screen share; same signaling substrate as above)
```

**World B — server-backed relay path built in Patches 1–4 (fully
implemented and tested, but only ever called from test/harness code):**

```
harness/run-harness.js (test harness only — not a shipped page)
  → core/shell/live/providers/cozy-live-remote-relay-transport-provider.js
      (RemoteRelayTransportProvider, opts.getToken)
  → server/live-relay/live-distribution-signaling-server.js
      → /identity/assertion → firebase-identity-issuer.js → identity-assertion.js
      → session-authority.js → /token, /register-host
```

`core/shell/live/cozy-live-session.js` — a third file, separate from LDCE —
was the file named in the Patch #4→#5 handoff as "the real production live
session orchestrator." It is **not** reachable from `dashboard.html`,
`index.html`, or any other shipped page. Its only HTML host,
`core/shell/live/ui/cozy-living-live-surface-dashboard.html`, is referenced
by nothing except its own test file
(`core/shell/live/tests/cozy-living-live-surface-dashboard-browser.test.js`).
It is orphaned — not the production owner the prior handoff assumed.

**Where the two worlds currently stop:** World A ends at Firestore
mesh-signaling; World B starts at a WebSocket relay server. Neither
currently calls into the other. No file outside `server/` and its own
`test/` directory references `/identity/assertion`, `/token`, or
`register-host`.

## STEP 4 — COMPARISON AGAINST EXISTING PRODUCTION ARCHITECTURE

| | World A (production, shipped) | World B (server-backed relay, tested) |
|---|---|---|
| Identity source | Firebase → `CozyOS.Session.current().uid` (a CozyOS uid, not a raw ID token) | Firebase **ID token** required at `/identity/assertion` |
| Signaling | Firestore documents, mesh/pairwise | WebSocket to a standalone relay server |
| Scale model | Peer-to-peer mesh (Section 16 header: unlimited broadcast explicitly `CAPABILITY_UNAVAILABLE`) | Server-hub relay, designed for the case mesh can't cover |
| Reachable Firebase ID token at this boundary? | Not currently retrieved here — `Session.current()` returns a CozyOS-shaped record, not the SDK user object | N/A (this is the consumer, not the source) |

This is why Step 6 below stops rather than picks an owner: LDCESessionEngine
(the actual production entry point) is architecturally a mesh/Firestore
signaling coordinator, not a relay-server client. Wiring it to
`/identity/assertion` is possible in principle — `window.CozyOS.Firebase.Auth`
is already loaded on the same page and can hand back a real ID token via
its raw SDK passthroughs — but doing so is a genuine feature decision
(when does the relay path get used instead of/alongside mesh signaling?),
not a mechanical connection of two things that already agree they're the
same integration.

## STEP 5 — IS FIREBASE ACTUALLY THE PRODUCTION IDENTITY SOURCE?

Yes, confirmed, not assumed. `dashboard.html` loads the full
`Firebase/*.js` stack followed by `firebase-session-bridge.js`, which is
documented and implemented as the sole translator of real Firebase
`onAuthStateChanged` state into `CozyOS.Session`. This is genuine
production wiring, not a dormant subsystem — so a Firebase ID token IS
obtainable on the same page LDCESessionEngine runs on, via
`CozyOS.Firebase.Auth.getAuthInstance().currentUser.getIdToken()`. That
part of the original handoff's assumption was directionally correct; what
was missing was the second half — an existing *consumer* of that token for
the relay path.

## STEP 6 — STOP CONDITION REACHED

No existing production file legitimately owns all of: knows the
authenticated user, knows/creates the session id, controls
publisher/viewer role, AND has a reason to construct a
`RemoteRelayTransportProvider` today. LDCESessionEngine satisfies the
first three but has no current reason to construct World B's relay
client — it ships its own working signaling path. Per the instruction not
to invent an owner merely for convenience, no composition code was
written this patch.

```
IMPLEMENTED:
None — audit only.

VERIFIED:
Patch #4 remains intact; fresh extraction confirmed; 132/132 server
tests pass (server/live-relay), identical to the Patch #4 baseline.
Protected files (server/live-relay/identity-assertion.js,
firebase-identity-issuer.js, session-authority.js, core/shell/
cozy-login-gate.js, core/modules/founder-story/*) are byte-identical
to Patch #4 (see protected-file-audit.sha256 / diff below).

NEW FINDING:
No production browser composition owner exists for the Firebase →
/identity/assertion → SessionAuthority → RemoteRelayTransportProvider
path. The file previously assumed to be that owner
(core/shell/live/cozy-live-session.js) is not reachable from any
shipped page. The actual production live-communication entry point
(core/modules/communication/ldce-session-engine.js, wired into
dashboard.html) uses a architecturally different signaling model
(Firestore mesh) and has no existing reason to construct the relay
client.

NOT VERIFIED:
Production browser authentication through /identity/assertion (still
not attempted — correctly, since no real caller exists yet).

KNOWN LIMITATIONS:
This audit did not decide, and did not implement, the composition
owner. It also did not investigate whether product intent is for the
relay path to replace, or run alongside, LDCE's mesh signaling — that
product decision sits upstream of any further engineering here.

MISSING DEPENDENCY:
A deliberate decision among:
  A. Extend LDCESessionEngine to optionally use the relay path
     (e.g. for session sizes mesh can't cover), pulling a Firebase ID
     token from window.CozyOS.Firebase.Auth at session-start time.
  B. Build a small, separate composition wrapper owned by the live
     shell, used only when the relay path is explicitly selected.
  C. Revive core/shell/live/cozy-live-session.js as the intended
     production owner and wire it into a shipped page for the first
     time (this would be a bigger, separate scope change).
  D. Some other owner not yet surfaced by this audit.

NEXT BUILD MUST START WITH:
Get an explicit answer to the Step-6 missing-dependency question above
before writing any composition code. Once an owner is chosen, the
smallest correct integration is: obtain the Firebase ID token from
window.CozyOS.Firebase.Auth (already loaded on dashboard.html) →
POST /identity/assertion → pass the resulting assertion as
opts.getToken's Authorization: Bearer value into
RemoteRelayTransportProvider, exactly as Patch #4's server side already
expects.
```
