# CozyOS Production Authentication — Root Cause Report

No code was changed. The evidence conclusively points to an external
Firebase Console configuration issue, not a repository defect.

---

## 1. ROOT CAUSE

The Firebase project cozycabin-affiliate is rejecting the specific
email/password combination submitted for the administrator account.
This is happening entirely within Firebase's own Authentication
service, before the request ever reaches any CozyOS server code.

## 2. EXACT FAILURE STAGE

Stage 1 of the traced flow — Firebase client-side sign-in
(signInWithEmailAndPassword) — fails. The flow never proceeds to
ID-token acquisition, never calls POST /webauthn/firebase/session, and
never reaches any CozyOS server-side code at all. Everything from
"Firebase ID token" onward in the target flow is NOT-RUN, not broken —
it simply hasn't been reached yet.

Traced precisely, file by file, not assumed:
- login.html line 776 calls auth.loginWithServerFirebase(email, password).
- core/modules/identity/auth-coordinator.js line 415 calls
  firebaseAuth.signInWithEmailAndPassword(email, password).
- Firebase/firebase-auth.js line 75 calls the real Firebase SDK's
  sdk.signInWithEmailAndPassword(authInstance, email, password) inside
  a try/catch that faithfully forwards err.code — confirmed by direct
  reading, this is a genuine, correct, unmodified pass-through, not a
  bug swallowing or mis-mapping the real error.
- The SDK's real, cryptographically-signed rejection reaches back up
  to auth-coordinator.js's error-mapping table (line 437), which maps
  the code auth/invalid-credential to exactly the message you saw:
  "This email/password combination was rejected by Firebase."

## 3. ACTUAL FIREBASE ERROR CODE

auth/invalid-credential — confirmed by tracing the exact string match
in the codebase's own error-label table, which has one-to-one,
unambiguous mappings for every other code (auth/user-not-found,
auth/wrong-password, auth/user-disabled, etc.). Only this exact code
produces the message you reported.

Important, and not something I'm inferring casually: in current
Firebase Auth SDKs, auth/invalid-credential is a deliberately
consolidated error code. Firebase merged what used to be two separate,
distinguishable codes — auth/wrong-password and auth/user-not-found —
into this single one, specifically as an anti-enumeration security
hardening measure, so an attacker probing sign-in cannot tell "wrong
password" apart from "no such account." This means the code itself
cannot distinguish those two cases for you either. Both of the
following are consistent with what you observed:
- The administrator account doesn't exist yet in this exact Firebase
  project, OR
- The account exists, but the password submitted doesn't match it.

A third, less likely possibility: Email/Password sign-in could be
disabled for this project, but that case normally produces
auth/operation-not-allowed instead, not auth/invalid-credential — so
this is not the most likely explanation, though still worth checking.

## 4. FIREBASE PROJECT USED

Confirmed directly from Firebase/firebase-config.js (non-secret
identity fields only):
- projectId: cozycabin-affiliate
- authDomain: cozycabin-affiliate.firebaseapp.com
- appId: 1:765281276271:web:1368fb340b1fb68a01189a
- An apiKey is present (Firebase Web API key — architecturally public
  by Firebase's own design, not a secret; already flagged in the prior
  deployment round for your separate confirmation that Console-side
  domain restrictions are configured)
- Confirmed as the only firebaseConfig definition anywhere in the
  repository, and confirmed that login.html loads exactly this file
  (plus firebase-app.js/firebase-auth.js, in the correct order) — there
  is no conflicting or stale config that could be loading instead.

## 5. AUTH PROVIDER STATUS

BLOCKED — cannot verify from this environment. Whether Email/Password
sign-in is enabled for the cozycabin-affiliate project is a Firebase
Console setting (Authentication -> Sign-in method) that I have no way
to check without network access to Firebase's own systems. Given the
specific error code returned (see section 3), this is possible but not
the most likely explanation.

## 6. ADMINISTRATOR ACCOUNT STATUS

BLOCKED — cannot verify from this environment. Whether the intended
administrator email exists as a real user in this Firebase project's
Authentication -> Users list, and whether it is enabled (not
disabled), can only be checked in the Firebase Console. This
repository's code gives no way to check this remotely, and I have no
network path to Firebase's Admin API either.

Important, and directly relevant to what to do next: bootstrap-admin.js
(inspected in full this round) cannot help here at all. Its own
documentation is explicit: it only flips the is_platform_admin bit on
a row in CozyOS's own server-side SQLite database — it "does not
create a WebAuthn credential or a Firebase link" and never touches
Firebase in any way. Running it again would not change Firebase's
sign-in decision, because Firebase's rejection happens entirely before
CozyOS's own database is ever consulted. This confirms the task's own
warning not to blindly rerun it was correct — it genuinely wouldn't
help this specific symptom.

## 7. PRODUCTION API STATUS

A real, already-existing, already-correct production hosting
configuration exists — render.yaml — found and inspected in full this
round, not created new:
- Service: Node web service on Render, startCommand: node
  server/static-boundary-server.js
- COZY_RP_ID: cozyos.org, COZY_RP_ORIGIN: https://cozyos.org — the real
  production domain, not localhost — already correctly set
- COZY_FIREBASE_PROJECT_ID: cozycabin-affiliate — matches the
  frontend's project exactly
- COZY_WEBAUTHN_COOKIE_SECURE: "1" — correctly set for production
- Persistent disk-mounted SQLite path — correctly configured so
  restarts don't wipe user data

However, this repository's own docs/render-deployment.md explicitly
states, as last written: "No live deploy has been created" and that
GET /webauthn/session against the real production hostname was "not
verified." BLOCKED — cannot verify from this environment whether an
actual Render deploy now exists and is reachable at cozyos.org, since I
have no network access to check it, and this documentation may or may
not be current.

This is not what's causing your current symptom — the failure you
described happens at Stage 1 (Firebase), before this API is ever
called — but it is very likely the next thing you'll hit once the
Firebase credential issue is resolved, so it's worth confirming before
you assume the whole flow will complete.

## 8. /webauthn/firebase/session STATUS

NOT-RUN — never reached in the failure you reported, and I have no
network access to probe it directly against the live domain in any
case. The server-side implementation itself was inspected this round
and is real, not stubbed: it performs genuine cryptographic
verification of the Firebase ID token
(verifyFirebaseIdToken(idToken, {projectId, fetchGoogleCerts})), fails
closed with 501 firebase_not_configured if no project ID is set, and
rejects a request with no idToken before ever attempting verification.

## 9. WEBAUTHN PRODUCTION CONFIGURATION STATUS

VERIFIED, from render.yaml — not left at localhost defaults:
COZY_RP_ID=cozyos.org, COZY_RP_ORIGIN=https://cozyos.org, both the real
production values, both correctly matching the live domain already
confirmed reachable in the browser.

## 10. COOKIE/SESSION STATUS

VERIFIED, from render.yaml + server code: COZY_WEBAUTHN_COOKIE_SECURE=1
is set for production. docs/render-deployment.md additionally
documents that the cozy_admin_session cookie is SameSite=Strict, which
requires the static frontend and /webauthn/* to be served from the
exact same origin — the doc flags this as something to confirm once a
specific DNS/routing choice (Cloudflare->Render direct, or a
Cloudflare Origin Rule) is actually made. BLOCKED — cannot verify from
this environment which of those two options was actually chosen for
cozyos.org, or whether same-origin routing is genuinely in place.

## 11. CORS/ORIGIN STATUS

Not evaluated this round — irrelevant to the Stage 1 failure you
reported, and would only become relevant once the flow reaches the
/webauthn/firebase/session call, which it currently never does.

## 12. FILES MODIFIED

None. This was a pure diagnostic round; no repository defect was found
that required a code change.

## 13. TESTS RUN

- server/test/firebase-admin-real-composition.test.js — 3 tests
- server/test/static-boundary-firebase.test.js — 3 tests
- server/webauthn-rp/test/firebase-session-integration.test.js — 10 tests

## 14. TEST RESULTS

16/16 pass, 0 fail, 0 skipped. This confirms the server-side Firebase
session code (token verification, administrator recognition via the
bootstrap CLI, rejection of ordinary users, rejection of forged
tokens, no-duplicate-account linking, fail-closed with no configured
project ID) is real, correct, and already covered — reinforcing that
the defect is not in this code, since the code you'd need working
downstream is already verified sound.

## 15. LIVE BROWSER VERIFICATION STATUS

Unchanged from what you reported — the static login page loads
correctly; the administrator sign-in attempt is genuinely reaching
Firebase and receiving a genuine rejection. No further browser
verification was possible or attempted from this environment (no
network access).

## 16. EXTERNAL CONFIGURATION REQUIRED — exactly what to check, in order

1. Firebase Console -> project cozycabin-affiliate -> Authentication ->
   Users. Confirm the intended administrator email actually exists as
   a user, and is not disabled. If it doesn't exist, create it there
   (Console-side — never send the password to me).
2. Firebase Console -> Authentication -> Sign-in method. Confirm
   Email/Password is enabled for this project.
3. If the account exists and the provider is enabled, the password
   being submitted does not match Firebase's record for that account.
   Use Firebase Console's own password-reset mechanism for that user
   (or delete and recreate the user with a known password) — never a
   workaround in code.
4. Once Firebase sign-in succeeds, confirm whether the Render service
   is actually deployed and reachable, since docs/render-deployment.md
   recorded it as not yet live as of its last update. A safe, non-
   secret check you can run yourself once you're ready:

   curl -i https://cozyos.org/webauthn/session

   Expect 401 {"authenticated":false} if the API is live and you're
   not logged in yet — a 404 or connection failure would mean the
   Render service isn't actually reachable at this origin yet, which
   is a separate, real blocker from the Firebase one.

## 17. BLOCKED ITEMS

- Firebase Console account/provider status (sections 5, 6) — no
  network access to Firebase from this environment.
- Actual current Render deployment reachability (section 7) — no
  network access.
- Same-origin routing choice for cozyos.org (section 10) — not
  recorded in the repository, and not verifiable remotely.

## 18. NOT-RUN ITEMS

- ID token acquisition, /webauthn/firebase/session call, server-side
  token verification against a live request, administrator session
  creation, dashboard redirect, protected API calls — all genuinely
  not reached yet, since Stage 1 fails first. None of this is
  "broken"; it simply hasn't been exercised by the failure you're
  seeing.

---

## Checkpoint

Not created. No code or configuration in the repository was changed
this round — a diagnostic-only round with no code changes does not
manufacture a new checkpoint. The current valid artifact remains
CozyOS-Merged-0003-CUMULATIVE-V2-AIIntegrationBridge-VERIFIED-FULL-CHECKPOINT.zip
(SHA-256 798e4b76819ed9282b5b612b67499ffb8a667316a588c9780c9df608f9d5005b),
and the deployed baseline commit remains
b59f48938a107b623adcbea5774944f0416d8763, both untouched.

## Locked files

core/ai.js, core/ai/cozy-ai-language.js, core/ai/cozy-ai-memory.js, and
core/ai/cozy-ai-integration.js were not read for modification purposes
and were not touched at all this round.
