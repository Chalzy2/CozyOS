# CozyOS Administrator Authentication — Corrected Architecture Trace

No code was changed. No Firebase user was created, reset, or modified.
This corrects the prior round's conclusion using the actual historical
architecture, traced directly from the repository.

---

## ORIGINAL ADMIN AUTHENTICATION

WebAuthn passkey, verified server-side against CozyOS's own database —
no Firebase involved at all. Traced directly: login.html contains a
genuine, separate "Passkey" button (line 375, under "More sign-in
options," collapsed by default) that calls
POST /webauthn/authenticate/complete (line 1259) — a real
cryptographic WebAuthn ceremony verified entirely server-side against
credentials stored in CozyOS's own database. This is architecturally
independent of Firebase; nothing in this path touches
Firebase/firebase-auth.js at all.

## BOOTSTRAP STORAGE

server/webauthn-rp/bootstrap-admin.js's grant command does exactly one
thing, confirmed by reading its actual SQL: it inserts-or-finds a row
in the users table by email, then sets is_platform_admin = 1 on that
row. Traced precisely (Postgres path shown, SQLite path is
equivalent):

  INSERT INTO users (id, email, is_platform_admin, created_at) VALUES ($1, $2, 0, $3)
  -- then:
  UPDATE users SET is_platform_admin = 1 WHERE id = $1

This creates no WebAuthn credential and no Firebase link. The
firebase_uid column on that new row starts, and stays, NULL until
something else links it. Administrator authority (the bit) and
administrator credentials (a way to actually prove you're that email)
are two separate things in this schema, and grant only ever provisions
the former.

## CHALZYDASHBOARD CHANGE

chalzydashboard.html is not a login page and never authenticates
anyone. Confirmed directly — it loads only auth-coordinator.js and
contains no login form of any kind. Its actual role, confirmed by the
existing, passing test suite
(server/test/chalzydashboard-gate-integration.test.js, specifically
the test literally named RP-ADMIN-ROUTING-SPLIT): it is a session gate
— a protected page that checks an already-established server session
via GET /webauthn/session and reads that session's isPlatformAdmin
flag. The same test suite confirms /dashboard.html was deliberately
split off to always serve the ordinary User Dashboard, never the admin
workspace, regardless of session state — meaning the "Dashboard ->
Chalzydashboard" transition this task refers to was a post-login
destination/routing split (where an authenticated admin session gets
sent), not a change to how login itself works. login.html — the
actual login form, containing both the Firebase form and the Passkey
button — was not part of that split at all.

## CURRENT ADMIN AUTHENTICATION

Confirmed, by direct code inspection, that two genuinely separate,
independently-implemented sign-in paths coexist on the same
login.html, side by side, both leading to the identical kind of
session (same cookie, same downstream isPlatformAdmin check):

1. Passkey (POST /webauthn/authenticate/complete) — the original,
   Firebase-independent, server-database-only mechanism.
2. "Administrator Email/Password" (Firebase signInWithEmailAndPassword
   -> POST /webauthn/firebase/session) — a separate, additional
   identity-bridge path, confirmed real and already covered by 10
   passing tests in firebase-session-integration.test.js, including
   the specific test "an administrator granted via the bootstrap CLI
   is recognized through the Firebase login path."

Neither path is broken, and neither incorrectly shadows or overrides
the other — they are architecturally parallel, both calling into the
same server-side isPlatformAdmin resolution once a session exists. I
found no code defect that routes the administrator form through
Firebase "by mistake"; the Firebase form is a real, deliberately-built,
already-tested, alternate way to reach the same destination — it is
just not the original mechanism, and it depends on a precondition (a
linked Firebase account) that the original mechanism never required.

## CURRENT FIREBASE ROLE

An additional identity-verification bridge, not the administrator
credential store. This matches the corrected architecture exactly:
Firebase's job, once a sign-in succeeds, is only to prove "this real
person controls this email address," after which the server — not
Firebase — looks up the CozyOS users row for that email and decides
isPlatformAdmin from the server's own is_platform_admin column. The
already-passing test suite's own naming confirms this design intent —
the admin decision is a property of the CozyOS session, not of which
identity provider produced it.

## ROOT CAUSE

Not a code defect. The evidence points to one of two real, external
possibilities, and I cannot distinguish between them without
information only you have:

1. Most likely, given the corrected architecture: the administrator
   account was provisioned via bootstrap-admin.js grant (setting
   is_platform_admin = 1) but was never linked to a Firebase account,
   and — this is the key open question — may never have completed a
   WebAuthn passkey registration either. If so, the "Administrator
   Email/Password" Firebase form was never going to work for this
   account (no Firebase user exists for it at all, which is exactly
   consistent with the ambiguous auth/invalid-credential code
   explained in the prior round — Firebase reporting "no such account"
   and "wrong password" identically). The Passkey button would only
   work if a passkey was separately, previously registered for this
   email (via the "Create Account" flow, which calls a WebAuthn
   registration ceremony, confirmed present in login.html).
2. Possible but not evidenced either way: a passkey genuinely was
   registered previously, on a different device than the one now being
   used to test login — WebAuthn passkeys are typically
   device/platform-bound (or synced via a platform passkey provider),
   so attempting the Passkey button on a different device than the one
   it was registered on could also fail, for reasons unrelated to
   Firebase entirely.

I cannot determine which of these applies from the repository alone —
that requires knowing your own account's actual provisioning history,
which isn't recorded anywhere in code.

## REQUIRED CODE CHANGE

None identified. No architectural correction, routing fix, or Firebase
account action is needed in the repository. The two authentication
paths are both real, both correctly implemented, and both already
covered by passing tests. The practical next step is operational, not
a code change:

1. Try the "Passkey" button under "More sign-in options" on login.html,
   on the same device (or synced passkey provider) used when the
   administrator account was originally set up, if it was.
2. If no passkey was ever registered for this email, use "Create
   Account" to complete a real WebAuthn registration for the exact
   email bootstrap-admin.js grant was run against — this creates the
   actual credential the original mechanism requires, entirely inside
   CozyOS's own database, no Firebase involved.
3. The Firebase email/password form remains a legitimate, intentional
   alternative for later/other administrators or convenience — but
   only once a real Firebase account for that email is separately
   created and its first successful sign-in gets linked to the CozyOS
   user row (which the already-passing test suite confirms happens
   automatically on first successful Firebase login for a matching
   email) — not a step to take today unless that's the path you
   actually intend to use going forward.

## TESTS

No new tests were needed — the existing suite already covers exactly
the scenarios this trace depended on, all confirmed passing again this
round:
- server/webauthn-rp/test/firebase-session-integration.test.js (10/10)
  — including "an administrator granted via the bootstrap CLI is
  recognized through the Firebase login path" and "an ordinary
  Firebase-authenticated user is denied administrator authorization."
- server/test/chalzydashboard-gate-integration.test.js (6/6, from the
  prior round's regression) — including the RP-ADMIN-ROUTING-SPLIT
  test confirming the dashboard/chalzydashboard split is a routing
  concern, not an authentication-mechanism concern.

---

## What was explicitly NOT done, per the constraints

No Firebase user was created. No Firebase password was reset or
changed. No Firebase project configuration was modified. No new
authentication architecture was invented. No code was changed. No
checkpoint was created, since nothing in the repository changed.
