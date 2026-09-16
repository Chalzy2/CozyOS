# Chalzcozy Administrator Identity Mapping — Investigation Evidence Report

## Verdict: this is a data gap, not a code defect. No code changes made.

## Trace performed

```
Chalzcozy → server username lookup (rp.getUserByUsername)
          → canonical administrator user (users.username = 'Chalzcozy')
          → password verification (rp.authenticateWithPassword)
          → authenticated server session (POST /auth/login)
          → GET /webauthn/session
          → AdminGateCore.decideGateAction
          → Enterprise Control Center
```

Every link in this chain was inspected and is already correct:

- `server/webauthn-rp/rp.js` `authenticateWithPassword({ email, username, password })`
  resolves `username` via `getUserByUsername()` before running the SAME
  password_hash verification as the email path. No second auth engine.
- `server/webauthn-rp/server.js` `POST /auth/login` already accepts
  either `{email}` or `{username}` and forwards to the above.
- `core/modules/identity/auth-coordinator.js` `loginWithServerPassword()`
  already sends `{username: identifier}` when the typed value has no
  `@` (so "Chalzcozy" is sent as a username, not misrouted as an email).
- `core/shell/cozy-login-gate.js`'s dedicated Administrator credentials
  form already calls `loginWithServerPassword()` (this was fixed in a
  prior patch — see its own inline comment referencing
  M-ADMIN-AUTH-RESTORE) — it no longer uses the legacy local-only
  `loginWithCredentials()`/IdentityEngine path.
- `GET /webauthn/session` and `core/shell/admin-gate-core.js` both
  already key strictly off the server's `is_platform_admin` value with
  no separate logic for username- vs email-based logins.

**Proof:** `server/webauthn-rp/test/username-login-integration.test.js`
(pre-existing, 10 tests) already exercises exactly this scenario — one
of its fixtures literally registers a user, maps the username
`'Chalzcozy'` to it, and logs in successfully. It passes cleanly on
this checkout (`node --test server/webauthn-rp/test/username-login-integration.test.js`
→ 10/10 pass).

## Root cause

`username` is a column added by migration `017_username_login.sql`
(applied automatically and idempotently on every server start via
`db.js`'s `migrateAddUsername()`), and it is populated **only** by the
trusted-operator CLI:

```
node server/webauthn-rp/bootstrap-admin.js set-username --db <path> --email <admin-email> --username Chalzcozy
```

This command has never been run — or was run against the wrong
email/casing — against the production database
(`/var/data/cozy-webauthn.sqlite` on Render, per `render.yaml`). The
real platform-admin account exists (it predates this feature, or was
promoted via `grant` before username-login shipped) but its `username`
column is `NULL`.

That single missing row-value fully explains both reported symptoms:

- **Password path** ("Invalid email or password, or this account may
  be disabled."): `authenticateWithPassword({ username: 'Chalzcozy', ... })`
  finds no row (`getUserByUsername` returns nothing), so it throws the
  same generic `invalid_credentials` an unknown identifier or a wrong
  password would throw (anti-enumeration by design — see `rp.js`'s own
  comment). The client shows the same generic string for all of these.
- **Biometric path** ("No real administrator account found for
  'Chalzcozy'."): this string is emitted by
  `core/shell/cozy-admin-recovery-wizard.js`'s local IdentityEngine
  lookup when it cannot resolve the typed identifier — consistent with
  the same missing mapping.

## New evidence added (offline, no production access)

`server/webauthn-rp/test/chalzcozy-admin-identity-mapping-fix.test.js`
— reproduces the exact pre-fix production state (a real, existing
platform-admin account with no username set), reproduces both reported
failure symptoms from it, then applies the exact proposed fix and
proves all 8 requested properties in one end-to-end run against a real
HTTP server and real SQLite database:

1. Chalzcozy resolves to exactly one existing platform-admin account
2. Wrong password remains rejected
3. Correct authentication produces a real server session (cookie)
4. `/webauthn/session` reports the administrator correctly
5. `AdminGateCore` permits the administrator (`LOAD_ADMIN_WORKSPACE`)
6. Ordinary users are unaffected (unchanged password_hash, no username
   side-effect, `is_platform_admin` stays `0`)
7. No duplicate administrator account is created (exactly one
   `is_platform_admin = 1` row, before and after)
8. A pre-existing enrolled WebAuthn credential is byte-identical before
   and after the fix (`set-username` never touches the `credentials`
   table)

Result: **1/1 new test passes**. Full related regression suite (this
new test + `username-login-integration.test.js` +
`password-auth-integration.test.js` + `admin-gate-core.test.js` +
`cozy-login-gate-server-auth-fix.test.js`) = **74/74 passing**, with
zero source files modified.

## The smallest safe fix (not yet applied — requires production DB access this environment does not have)

Before running anything, an operator should first confirm which
account is the real platform-admin, e.g.:

```
node server/webauthn-rp/bootstrap-admin.js list --db /var/data/cozy-webauthn.sqlite
```

Find the row printed as `[admin] <the-real-admin-email>`. Confirm
there is exactly one such row. Then, against that SAME email:

```
node server/webauthn-rp/bootstrap-admin.js set-username \
  --db /var/data/cozy-webauthn.sqlite \
  --email <the-real-admin-email> \
  --username Chalzcozy
```

This command:
- requires the email to already exist (will not fabricate a new user)
- never touches `password_hash`
- never touches `is_platform_admin`
- never touches `credentials` (biometric/passkey enrollments)
- is idempotent — safe to re-run

Re-run `list` afterward to confirm exactly one row now shows
`(username: Chalzcozy)` and it is the same admin row as before.

## What was intentionally NOT touched

Login UI, routing, Firebase, Render config, ordinary-user auth, and the
biometric/trusted-device mechanisms are all unmodified — the
investigation confirms the existing code for all of these is already
correct once the missing username mapping is restored on the existing
account.
