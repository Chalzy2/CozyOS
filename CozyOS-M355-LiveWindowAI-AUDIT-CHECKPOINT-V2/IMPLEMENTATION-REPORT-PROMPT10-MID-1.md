# IMPLEMENTATION REPORT — PROMPT10-MID-1

Continued from verified COS-DASHBOARD-PROMPT9B-MID-1. Confirmed on
inspection: the 9B report's claims matched the actual source
(PhoneAccountLinkage genuinely wired via phone-linkage-bootstrap.js;
GoogleAccountLinkage genuinely still unconnected; 155-file regression
genuinely not completed, not silently marked green). No phone work
was redone — no defect found in it.

## PROMPT 10 STATUS

### GOOGLE LINKAGE
Partially advanced, honestly not complete. What changed: Google
linkage now has a REAL, persistent, restart-surviving server-side
store (`server/auth/google-linkage-store-adapter.js`), composed with
the already-existing, already-tested `CozyGoogleAccountLinkage` and
`GoogleAuthAdapterServer` (`server/auth/google-login-endpoint.js`,
built in Prompt 7 — reused, not duplicated, per the "no second auth
server" instruction). This closes the persistence half of the Google
blocker identified in Prompt 9B.

Repo-wide search (per §3) confirmed again: the only real HTTP server
in this repository is `live-distribution-signaling-server.js`, and
it belongs to a separate trust domain (live-streaming session
tokens) — `google-login-endpoint.js`'s own header explicitly warns
against repurposing it, and this milestone did not touch it.
`google-login-endpoint.js` already IS the correct, existing,
reusable server-side linkage contract Prompt 10 §16 asks for — it did
not need to be rebuilt, only given a real store.

**Still NOT connected — genuine architecture blocker, not an
oversight:** browser-side wiring. Two distinct, real problems here,
neither invented an answer for unilaterally:
1. **Linking a new Google account to an existing, signed-in CozyOS
   account** (`linkAccount(userId, idToken)`) requires the server to
   know *which* CozyOS account is asking. This repo's identity/session
   model is browser-local (IdentityEngine + IdentityStorage,
   confirmed in Prompt 9A/9B) — there is no existing authenticated
   session concept that crosses the browser→server boundary for the
   general app. The only session-token machinery that exists
   (`session-token.js`, `session-authority.js`) belongs to the
   separate live-relay trust domain, and reusing it here would cross
   trust domains — exactly what this milestone's own instructions warn
   against. This is a genuine product/architecture decision (e.g., a
   short-lived, purpose-built linking token minted by the browser's
   local session and verified server-side) that needs a decision, not
   an invented workaround.
2. **Reading Google-linked state back into the local, synchronous
   `buildFactorSnapshot()` decision tree** requires the browser to
   have a local, synchronous, cached copy of "is this account's
   Google linked" (the server's file-based record is the source of
   truth, but it's neither local nor synchronous from the browser's
   perspective). No such caching mechanism exists yet, and building
   one is a real design decision (what triggers a refresh, staleness
   handling) rather than a one-line wiring fix.

Login-time resolution (`resolveLoginCandidate`, no prior session
required — identity comes entirely from the verified Google token)
does NOT have this problem and was proven fully end-to-end this
milestone (see TESTS), but still has no browser-side caller — no
fetch() call exists anywhere in login.html/dashboard.html, and there
is still no deployed, reachable instance of this server. Both remain
honestly unbuilt.

### GOOGLE TOKEN VERIFICATION
Unchanged and already real (Prompt 7) — RS256 signature, issuer,
audience, expiry, auth_time, all reused via
`firebase-identity-issuer.js`. Re-verified working end-to-end this
milestone through the real HTTP endpoint with real RSA-signed tokens
(see TESTS).

### GOOGLE LOGIN
NOT usable end-to-end in production — see "GOOGLE LINKAGE" above.
Server-side chain (verify → resolve → persist) is real and tested;
browser-side caller does not exist; no deployment exists.

### PHONE LINKAGE
Unchanged since 9B — confirmed intact by direct inspection, not
re-verified by re-running its full original suite this pass (only
`auth-coordinator.test.js`, which exercises phone through the
decision tree, was re-run — 14/14).

### PHONE LOGIN
Unchanged since 9B. `auth-coordinator.test.js`'s existing coverage
already includes real decision-tree cases for phone ("no passkey,
real verified+usable phone linkage -> primaryFactor is phone" and
"phone linkage reports verified:false -> phone never selected even
if loginUsable claims true") — both still passing, confirming the
browser cannot force a phone-verified state client-side.

### PASSKEY
Unchanged. Existing WebAuthn/passkey infrastructure remains
authoritative; not touched.

### FINGERPRINT/FACE
Unchanged — resolve through the existing Passkey/platform-authenticator
path where the platform provides it; no separate biometric engine
exists or was created.

### VOICE
Unchanged — searched again per §12; no real voice backend found;
remains unavailable. Not fabricated.

### TRUSTED DEVICE
Unchanged — still scoped to platform-admin recovery
(`auth-coordinator.test.js`'s "a non-admin account never receives
trusted-device in an ordinary login context" still passes). Not
touched.

### PASSWORD
Unchanged.

### PASSWORD RESET
Unchanged — not touched this milestone.

### LOGIN DECISION TREE
Unchanged logic (`buildFactorSnapshot()`/`login-decision-engine.js`
not modified). Re-confirmed reachable and correct via
`auth-coordinator.test.js` (14/14), including the still-accurate
"GoogleAccountLinkage not loaded (matches production today) -> google
never selected" case — this test's title remains true after this
milestone, since Google still isn't wired into the browser.

### SECURITY UI
UNCHANGED. No files under login.html/dashboard.html markup/CSS or
Settings→Security were touched this milestone.

## FILES CREATED
- server/auth/google-linkage-store-adapter.js
- server/auth/test/google-linkage-store-adapter.test.js
- server/auth/test/google-persistent-linkage-integration.test.js

## FILES MODIFIED
None.

## FILES DELETED
None.

## TESTS
new (google-linkage-store-adapter.test.js) = 8/8
new (google-persistent-linkage-integration.test.js, real HTTP server
  + real RS256 tokens + real process stop/restart against the same
  backing file) = 2/2
direct regression (google-login-endpoint.test.js) = 25/25
direct regression (google-account-linkage.test.js) = 15/15
direct regression (auth-coordinator.test.js) = 14/14
fresh extraction = see below (not yet run — run during packaging,
  see TEST-RESULTS-PROMPT10-MID-1.txt for final fresh-extraction figures)
FULL REPO REGRESSION: NOT COMPLETED this pass either (not attempted,
following 9B's documented timeout at that scale — see
TEST-RESULTS-PROMPT10-MID-1.txt).

## PROTECTED FILES
core/modules/founder-story/* and core/shell/cozy-login-gate.js —
verified byte-identical via direct `diff` against the original
PROMPT9A-MID-1 extraction. Unchanged.

## BROWSER
NOT VERIFIED — no real browser/DOM exists in this sandbox, and no
browser-side Google code was written this milestone (see "GOOGLE
LINKAGE" above for why).

## DEVICE
NOT VERIFIED.

## INTERNET
NOT VERIFIED.

## PRODUCTION
NOT VERIFIED. No deployment of google-login-endpoint.js exists
anywhere reachable.

## KNOWN LIMITATIONS
1. Google linkage still cannot be exercised from a real signed-in
   browser session — needs the two architecture decisions described
   in "GOOGLE LINKAGE" above before any further code is written for
   it.
2. `GoogleLinkageStoreAdapter` has no file locking — safe for a
   single server process, not verified for multiple concurrent
   instances.
3. Full repo regression still not completed in this sandbox at any
   point across 9B or 10.
4. No production Google OAuth client/project configuration exists;
   `PROJECT_ID` remains test-only in all suites run so far.

## NEXT BUILD MUST START WITH
1. A real product/architecture decision on how the server learns
   "which CozyOS account is asking to link Google" — options include
   a short-lived local-session-minted linking token verified
   server-side, or moving to a networked session model; this decision
   should be made explicitly, not inferred from code.
2. A decision on how buildFactorSnapshot()'s synchronous local check
   learns the server's Google-linked state (local cache + refresh
   trigger design).
3. Only after both: the actual browser-side fetch() wiring into
   login.html/dashboard.html's Settings→Security screen (existing
   controls only, per the UI rule).
