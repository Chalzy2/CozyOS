# Render Production Administrator Username Mapping — Explicit, One-Time Procedure

This is a manual, one-time administrative operation, run the same way
and for the same reasons as `docs/render-admin-bootstrap.md`'s `grant`
procedure. It must never be chained into automatic server startup, and
it is never reachable from any HTTP endpoint — see
`server/webauthn-rp/bootstrap-admin.js`'s own header and
`server/webauthn-rp/migrations/017_username_login.sql`'s comment for
why that boundary exists.

## When to use this

Use this only when a real, already-existing platform-admin account
(`is_platform_admin = 1`, already has a working password) needs an
additional `username` lookup key (e.g. `Chalzcozy`) so it can sign in
with that username instead of typing its full email.

This command never:
- creates a new user (the email must already exist — use `grant` first
  if it does not),
- changes `password_hash`,
- changes `is_platform_admin`,
- touches `credentials` (WebAuthn/passkey/biometric enrollments), or
- touches Firebase.

It only ever writes one column (`username`) on one existing row.

## Step 1: Confirm the code is already deployed

`server/webauthn-rp/bootstrap-admin.js`'s `set-username` command and
`server/webauthn-rp/rp.js`'s `getUserByUsername()`/
`authenticateWithPassword({ username, ... })` must already be live —
i.e., this checkpoint has been deployed to Render. If unsure, check the
deploy log for this checkpoint's commit, or run `list` (Step 2) and
confirm it prints a `username` column without erroring.

## Step 2: Identify the existing administrator account

Location: Render Dashboard → your service → **Shell** tab (an
interactive shell inside the running container — same place `grant`
is run per `docs/render-admin-bootstrap.md`).

```
node server/webauthn-rp/bootstrap-admin.js list --db /var/data/cozy-webauthn.sqlite
```

Confirm exactly one row is printed with the `[admin]` prefix. That
row's email is the one existing account this procedure will map — copy
it exactly.

If more than one `[admin]` row exists, or the expected account is
missing, **stop** — that is a separate, pre-existing condition this
procedure does not fix, and running `set-username` blindly would not
correct it.

## Step 3: Map the username onto that SAME existing account

```
node server/webauthn-rp/bootstrap-admin.js set-username \
  --db /var/data/cozy-webauthn.sqlite \
  --email <the exact email printed as [admin] in Step 2> \
  --username Chalzcozy
```

Expected output:

```
Set username 'Chalzcozy' for <email> (user <id>). Password/admin status unchanged.
```

If instead you see `No CozyOS user found for <email>`, the email was
mistyped — re-run Step 2 and copy it exactly; do not fall back to
`grant`, which would create a second account.

## Step 4: Verify

Re-run `list` and confirm:

- still exactly one `[admin]` row,
- that row now shows `(username: Chalzcozy)`,
- the `id` is unchanged from Step 2.

```
node server/webauthn-rp/bootstrap-admin.js list --db /var/data/cozy-webauthn.sqlite
```

Then, from a real browser against the live site, confirm:
- signing in with `Chalzcozy` + the account's existing real password
  succeeds and reaches the Enterprise Control Center,
- the wrong password with `Chalzcozy` is still rejected,
- any ordinary user account still signs in normally.

## What this procedure never does

- Never creates a second administrator account.
- Never resets or sets a password.
- Never touches Firebase or any ordinary-user account.
- Never runs automatically on deploy, restart, or any request —
  identical posture to `grant` in `docs/render-admin-bootstrap.md`, and
  for the same reason: an administrative identity change must be a
  deliberate, auditable, human action, never a side effect of shipping
  code.
