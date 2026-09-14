# STEP 4D-B / PHASE 6 — PATCH #2: Trusted Production Identity Issuer Search

Parent: COS-STEP4D-B-PHASE6-PATCH-1.zip
Parent SHA-256: 5c487f59399d1e9ea459ba44aa2f6aed1081f2e9b9ef3e3b6cbc9acd46880560

PRODUCTION CODE CHANGED: 0
DOCUMENTATION-ONLY PATCH — OUTCOME B (no real issuer exists)

## SCOPE
Patch #1 built and verified a fail-closed identity-assertion seam
(`server/live-relay/identity-assertion.js`) but explicitly left "trusted
production identity issuer" as a missing dependency — nothing calls
`signAssertion()` from a genuine authenticated source. This patch's job
was to search the entire repository for an existing, legitimate,
server-reachable source of authenticated identity that could be wired
to that seam, and reach one of exactly two outcomes: connect a real
issuer (Outcome A), or document precisely that none exists (Outcome B).

## METHOD
Repository-wide search across every category named in the continuation
brief: IdentityEngine, AuthorizationCoordinator, session managers,
login/session-token infrastructure, Firebase authentication, Firebase
Admin/server authentication, signed identity assertions, server
authentication middleware, reverse-proxy authentication,
deployment/bootstrap authentication, trusted request headers, existing
server-side identity verification. Documentation and bootstrap code
were also checked, not only source files.

## FINDINGS (one row per candidate actually found)

| Candidate | Location | Real server-reachable trust boundary? |
|---|---|---|
| IdentityEngine | core/modules/identity/identity-engine.js | No — file's own header states it is "LOCAL identity verification (like a single-machine app), not networked multi-party authentication — no server." Registers under `window.CozyOS`, browser-only. |
| AuthCoordinator (login orchestration) | core/modules/identity/auth-coordinator.js | No — orchestrates IdentityEngine login/session establishment; browser-only, same trust boundary as IdentityEngine. |
| AuthorizationCoordinator (step-up policy) | core/security/auth-coordinator.js | No — registers as `window.CozyOS.AuthorizationCoordinator`; own header states "Never authenticates a user itself" — it composes CozyOS.Auth/AuthPolicyEngine/AuthFactorRegistry, all of which are themselves browser-only, built on IdentityEngine. |
| Session Manager | core/security/session-manager.js | No — its own header states its hard dependency is IdentityEngine and its real job is idle-timeout/trusted-device/bulk-logout policy on top of IdentityEngine's browser-local sessions, not new authentication. |
| cozy-auth.js (Admin Session Layer) | core/security/cozy-auth.js | No — explicitly composes IdentityEngine's own session state; browser-only. |
| Firebase Authentication (client SDK usage) | (searched, present elsewhere in repo for other features) | No server-verification path found — no `firebase-admin`, no `verifyIdToken` call anywhere in the repository (`grep -rl "firebase-admin\|verifyIdToken"` returned zero matches). |
| Reverse-proxy / trusted-header mentions | server/live-relay/live-distribution-signaling-server.js, server/live-relay/README.md | Not implemented — both mentions are deployment-guidance PROSE ("a reverse proxy that only forwards this request for the caller's own verified identity," "terminate TLS at a reverse proxy") describing what an *operator* would still need to add. No header-parsing/trusted-header code exists anywhere in the repository. |
| server/live-relay/* (Node process) | server/live-relay/ | The ONLY genuinely server-side code in the entire repository. Contains SessionAuthority, session-token.js, and (as of Patch #1) identity-assertion.js — but nothing in this directory authenticates an end user; it only issues/verifies tokens for identities already resolved elsewhere. |

No other candidate (AuthPolicyEngine, AuthFactorRegistry,
webauthn-provider.js, otp-provider.js, authentication-enrollment-store.js
— all under core/security/) changes this conclusion: every one of them
is browser-local, built on or alongside IdentityEngine, with zero
network-reachable server-side verification component.

## DECISION GATE — OUTCOME B

No real trusted production identity issuer exists anywhere in this
repository. Every authentication-shaped component found is browser-
local (registers under `window.CozyOS.*`, depends on IdentityEngine's
own explicitly-disclosed local-only scope). The only server process in
the repository (`server/live-relay/`) issues and verifies tokens for an
identity it is told, but has no mechanism to independently authenticate
that identity itself.

Per the governing rule: do not invent one. This patch does not create a
placeholder issuer, a fake Firebase Admin integration, a trusted-header
parser with no real upstream trust boundary, or any other fabricated
authentication mechanism.

## MISSING DEPENDENCY (precise)

```
MISSING:
  trusted production identity issuer

WHY:
  browser-local IdentityEngine (core/modules/identity/identity-engine.js)
  cannot authenticate the Node signaling process
  (server/live-relay/live-distribution-signaling-server.js), and no
  server-side verifier exists anywhere in this repository — no
  firebase-admin, no verifyIdToken, no reverse-proxy trusted-header
  implementation, no independent authentication middleware.

REQUIRED:
  a real server-side authentication/identity bridge (e.g. a genuine
  IdentityEngine-to-server session bridge, or integrating an actual
  Firebase Admin SDK ID-token verification path), or an existing
  trusted authentication provider — none of which currently exists in
  this repository.
```

## WHAT THIS PATCH DOES NOT DO
- Does not modify identity-assertion.js.
- Does not modify live-distribution-signaling-server.js.
- Does not modify SessionAuthority, session-token.js, or LDCESessionEngine.
- Does not add a new authentication abstraction merely because the real
  issuer is missing.
- Does not begin the Live Participation Composition Root — that remains
  correctly blocked on this dependency per the Phase 5 decision gate.

## IMPLEMENTED
None. Documentation only.

## VERIFIED
- Parent (COS-STEP4D-B-PHASE6-PATCH-1.zip) SHA-256, `unzip -t`, manifest
  presence, and the 108/108 live-relay baseline all reconfirmed from a
  fresh extraction before this search began.
- Every claim in the FINDINGS table above traced to an actual header
  comment or grep result in the real source files, not inferred from
  filenames.
- `grep -rl "firebase-admin\|verifyIdToken"` across the full repository:
  zero matches.

## NOT VERIFIED
No tests run in this patch — no production code changed.

## KNOWN LIMITATIONS (carried over, unchanged from Patch #1)
- LDCESessionEngine has its own competing speaking-flag/signaling
  machinery that must stay walled off from the live-relay stack.
- No reconnect state exists in LDCESessionEngine.
- No broadcast-scale session type exists in LDCESessionEngine.
- Audio -> speech-recognition bridge for LiveChurchLanguageOrchestrator
  remains unresolved (carried over from the Transport Reconciliation
  phase).

## DEPENDENCY STATUS TABLE

| Dependency | Status |
|---|---|
| Transport reconciliation | Verified complete (prior patch) |
| LDCESessionEngine composition-root evaluation | Verified complete (Phase 5 audit) |
| Identity-assertion fail-closed seam | Verified complete (Phase 6 Patch #1) |
| Trusted production identity issuer | Confirmed missing — repository-wide search complete, Outcome B (this patch) |
| Live Participation Composition Root wrapper | Missing — blocked on identity issuer |
| Audio -> speech-recognition bridge | Missing |
| REAL_RTP_SFU | External/Missing (by design) |
| Worldwide church discovery | Missing (out of scope) |

## NEXT BUILD MUST START WITH
A real server-side trusted identity issuer must be built or genuinely
integrated (e.g. a production IdentityEngine-to-server bridge, or a
real Firebase Admin ID-token verification path) before
`identity-assertion.js#signAssertion()` can be called from anything
real. Only once that issuer is built AND verified does the identity
chain become: real authenticated caller -> trusted server-side identity
verification -> verified user/subject -> identity-assertion seam ->
SessionAuthority -> signed live-session token. The Live Participation
Composition Root wrapper still must not be built before that.

## PATCH DISCIPLINE
Patch #2 is cumulative: Patch #1's full state (identity-assertion.js,
signaling-server integration, 18 tests) plus this one documentation
file. A fresh extraction of this ZIP requires no separate reconstruction
of Patch #1.
