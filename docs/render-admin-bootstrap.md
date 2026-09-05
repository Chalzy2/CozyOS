# Render Production Administrator Bootstrap - Explicit, One-Time Procedure

This is a manual, one-time administrative operation. It must never be
chained into the automatic server start command.

## The four required points

1. The Render Dashboard Start Command must be exactly: node server/static-boundary-server.js
2. bootstrap-admin.js must never be chained into automatic startup.
3. The persistent disk must be attached and mounted before bootstrap-admin.js is ever run.
4. bootstrap-admin.js grant is a deliberate, one-time manual operation, never an automatic step.

The rest of this document explains why, and gives the exact procedure.

## Background

A real Render deploy log showed the live service's actual configured
Start Command was:

```
node server/webauthn-rp/bootstrap-admin.js grant --db /var/data/cozy-webauthn.sqlite --email <admin> && node server/static-boundary-server.js
```

This repository's own render.yaml has never declared this. Its
startCommand is, and has always been in this codebase:

```
node server/static-boundary-server.js
```

The bootstrap-chained command was a Start Command override configured
directly in the Render Dashboard, independent of render.yaml. This is
an external configuration issue, not a repository defect. It caused a
real, observed production failure for two reasons.

Reason one: bootstrap-admin.js grant is an administrative operation
with no business running on every deploy or restart. It should only
ever be run once, deliberately, by a human.

Reason two: the failure itself, "EACCES: permission denied, mkdir
/var/data", revealed a second issue. The persistent disk declared in
render.yaml's disk block was very likely never actually attached to
the live service. Declaring a disk in render.yaml does not
automatically attach it to a pre-existing service that was not
originally created via Render's Blueprint sync. Attaching it can
require an explicit one-time step in the Render Dashboard.

## Step 1: Fix the Render Dashboard Start Command

Location: Render Dashboard, your service, Settings, Start Command.

The value must be exactly this, with no chaining, no "&&", and no
call to bootstrap-admin.js anywhere in it:

```
node server/static-boundary-server.js
```

Leaving this field empty also works. Render then falls back to
render.yaml's own startCommand, which already has the correct value
shown above.

## Step 2: Confirm the persistent disk is actually attached

Location: Render Dashboard, your service, Settings, Disks.

Confirm a disk is attached with all three of these matching
render.yaml exactly:

- Name: cozyos-webauthn-data
- Mount path: /var/data
- Size: 1 GB

If no disk is attached at all, attach one now using those exact
values. A disk merely being declared in render.yaml does not mean it
is attached to an already-existing service. This step confirms it
really is.

## Step 3: Redeploy and confirm a clean start

Redeploy the service after Steps 1 and 2 are both done. Check the
deploy log.

If the disk still is not actually attached correctly, the log will
now show a clear, actionable error from this repository's own fix in
server/webauthn-rp/db.js, explaining that the disk needs to be
attached in the Dashboard, instead of the old, opaque raw EACCES
message with no explanation.

## Step 4: Grant the first administrator, once, manually

Do this only after Step 3 confirms the server is actually running
cleanly. This step is never part of the automatic deploy and never
runs on every restart.

Location: Render Dashboard, your service, Shell tab. This gives you
an interactive shell inside the running container.

First, confirm the disk is genuinely mounted and writable:

```
ls -la /var/data
```

If that command fails or shows nothing, stop here. The disk
attachment from Step 2 has not actually taken effect yet. Running the
bootstrap command now would fail the exact same way it did before.

Once /var/data is confirmed to exist and be writable, run the grant
command exactly once, with the real administrator email in place of
the placeholder:

```
node server/webauthn-rp/bootstrap-admin.js grant --db /var/data/cozy-webauthn.sqlite --email <the real administrator email>
```

This sets is_platform_admin = 1 on that email's row in the persistent
database. It does not set a password and it does not touch Firebase.
See docs/builder/knowledge/ADMIN-AUTHENTICATION-ARCHITECTURE-CORRECTION.md
for the full trace of why those are separate concerns. The
administrator still needs to set a real password afterward, using the
existing, already-live "Forgot Password" flow on
https://cozyos.org/login.html, before they can actually sign in.

This grant command never needs to run again for the same email unless
authority is being deliberately revoked or re-granted later. It is
genuinely a one-time, or rare and deliberate, operation. It is never
an automatic startup step, and never chained with anything else.

## What this round changed and did not change

Changed: server/webauthn-rp/db.js's openDb() function now catches a
directory-creation failure and throws a clear, actionable error
identifying the likely Render disk-attachment cause, instead of
letting Node's raw EACCES propagate with no explanation. The success
path, directory creation working normally when the disk really is
attached, is completely unchanged, verified directly rather than
assumed.

Not changed: render.yaml itself required no change at all. Its
startCommand was already correct before this round. The actual defect
was external: a Dashboard-level Start Command override diverging from
render.yaml, combined with a likely-unattached persistent disk. Both
are documented above with the exact steps to correct them.

Not changed: the authentication flow, login.html's password-based
administrator sign-in fix from the prior round, or any locked AI file.
