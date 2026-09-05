# Chalzcozy Administrator Username Mapping — Checkpoint

**Checkpoint name:** CHALZCOZY-USERNAME-MAPPING-VERIFIED
**Baseline this checkpoint was built from:**
`CozyOS-main-AboveOnlyMobileClippingFix-CHECKPOINT.zip` (user-supplied).

## Verdict

The live Administrator identity-mapping gap is a **data** gap on the
production database, not a code defect. Every server-side and
client-side code path for username-based Administrator login was
already correct in the baseline and is already covered by a passing
pre-existing test suite. **No application source file was modified by
this checkpoint.**

## Files added by this checkpoint

Verified — exactly three paths added, nothing else touched, nothing
deleted:

| Path | Change | Purpose |
|---|---|---|
| `server/webauthn-rp/test/chalzcozy-admin-identity-mapping-fix.test.js` | Added | Offline, disposable-DB regression test reproducing the exact reported failure from a realistic pre-fix state, then proving all 8 requested properties after applying the fix. Never touches production. |
| `docs/render-admin-username-mapping.md` | Added | Operational runbook for the one-time, manual, Shell-tab `set-username` command — same pattern and same safeguards as the existing `docs/render-admin-bootstrap.md` `grant` runbook. |
| `CHALZCOZY-ADMIN-IDENTITY-MAPPING-EVIDENCE-REPORT.md` | Added | Investigation trace and root-cause evidence. |

No changes to: login UI, routing, `render.yaml`, Firebase integration,
ordinary-user authentication, `server/webauthn-rp/rp.js`,
`server/webauthn-rp/server.js`, `server/webauthn-rp/bootstrap-admin.js`,
or any biometric/trusted-device mechanism. All of these were inspected
and found already correct — see the evidence report for the full trace.

## Why no code change was made

`server/webauthn-rp/bootstrap-admin.js` already implements `set-username`
exactly as needed: it requires the target email to already exist (never
fabricates an account), and it never touches `password_hash` or
`is_platform_admin`. `server/webauthn-rp/rp.js`'s
`authenticateWithPassword()` already resolves `username` OR `email` to
the same canonical row before running the same, single password
verification path. `POST /auth/login`, `GET /webauthn/session`, and
`core/shell/admin-gate-core.js` were all confirmed to already behave
correctly once that one column is populated. Writing new code to
perform this mapping would duplicate an existing, correct, tested
mechanism — the actual gap is that this mechanism has never been run
against the live production database for this account.

## Tests run and exact pass/fail counts (this checkpoint, local, offline)

```
node --test server/webauthn-rp/test/chalzcozy-admin-identity-mapping-fix.test.js
  1 pass / 0 fail

node --test server/webauthn-rp/test/username-login-integration.test.js
  10 pass / 0 fail

node --test core/shell/tests/admin-gate-core.test.js
  4 pass / 0 fail

node --test core/shell/tests/cozy-login-gate-server-auth-fix.test.js
  (pre-existing, unmodified — passing)

node --test core/shell/tests/login-html-admin-username-field.test.js
  5 pass / 0 fail

node --test core/modules/identity/test/auth-coordinator-server-password-identifier.test.js
  6 pass / 0 fail
```

No pre-existing test was modified, and none regressed.

## What remains — a manual, one-time, non-code operator action

This checkpoint does **not** and cannot perform the actual production
database write. There is no code path in this application, and no tool
available to the party preparing this checkpoint, that reaches the
live Render persistent disk — by design (see
`server/webauthn-rp/bootstrap-admin.js`'s own header: this must run
"over an already-trusted Termux/SSH session — never over a public HTTP
endpoint," and `docs/render-admin-bootstrap.md`'s documented incident
about why it must never be chained into automatic startup).

After this checkpoint is deployed, a human with access to the Render
Dashboard's **Shell** tab must run the three commands in
`docs/render-admin-username-mapping.md` once:

1. `list` — identify the one existing `[admin]` row and copy its email.
2. `set-username --email <that email> --username Chalzcozy` — write the
   mapping onto that same row.
3. `list` again — verify exactly one `[admin]` row, now showing
   `(username: Chalzcozy)`, same `id` as before.

Then verify live: `Chalzcozy` + the account's real existing password
signs in; the wrong password is still rejected; ordinary users are
unaffected.

## Deploy sequence

1. Push this checkpoint's full tree to GitHub `main`.
2. Render's existing `autoDeploy: true` (per `render.yaml`, unchanged)
   deploys it — no Start Command change, no disk change, no env var
   change.
3. Once the deploy is confirmed healthy, run the three-step manual
   procedure above, once, via the Shell tab.
