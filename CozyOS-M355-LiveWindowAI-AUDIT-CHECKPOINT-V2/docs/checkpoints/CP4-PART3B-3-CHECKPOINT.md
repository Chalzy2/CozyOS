# CP4 — Part 3B-3 Checkpoint: Live Production Verification (cozyos.org)

**Checkpoint name:** CozyOS-CP4-Part3B-3-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP4-Part3B-2-Checkpoint.zip`, no application/auth/gate
code changed since that checkpoint. This checkpoint adds only this file.

## Why this checkpoint exists

This is the first checkpoint in the CP4-Part3B line backed by a real,
successful Termux run against the live production domain
`https://cozyos.org`. Every prior Part 3A/3B checkpoint recorded this step
as "not yet performed" or "not yet reported" — this one records the actual
result.

## Live Termux production verification result

Run directly (not sourced) against `https://cozyos.org`:

| Route | Result | Status |
|---|---|---|
| `/` | HTTP 200 | PASS |
| `/webauthn/session` | HTTP 401, `application/json` | PASS |
| `/auth/google` | HTTP 404, `application/json` | PASS |
| `/admin` | HTTP 404 | PASS |
| `/chalzydashboard` | HTTP 200, `text/html` | PASS |
| `/webauthn/session` body shape | matches expected unauthenticated JSON shape | PASS |

**Total: 6 PASS, 0 FAIL, 1 WARN.**

**Warning (open item, not a failure):** authenticated `Set-Cookie` flags
(e.g. `Secure`, `HttpOnly`, `SameSite`, `Path`) have not yet been tested
against a real authenticated session in production. This remains
unverified and is explicitly carried forward, not closed by this
checkpoint.

## On the earlier `/` timeout

Two prior Termux runs in this Part 3B line reported `/` timing out after
10 seconds with 0 bytes, while every other route passed. Substantial
investigation was done against this repository and against reported
Render configuration facts (missing `COZY_WEBAUTHN_DB`, missing
`COZY_WEBAUTHN_COOKIE_SECURE`, empty Health Check Path) in the course of
that work — none of them were found to mechanistically explain a hang
isolated to `/`, and no code or configuration change was made as a result
(see conversation history for that diagnostic trail; it is not duplicated
into repo files here).

This run — a subsequent, direct test of `/` and the custom domain — did
not reproduce the timeout. Per the instruction that initiated this
checkpoint: **the earlier `/` timeout is recorded as observed-but-not-
reproduced, and is explicitly not being treated as a confirmed code
defect.** No application, auth, or gate code was changed to make this
result happen. If it recurs, the unresolved candidates from the prior
diagnostic session (Cloudflare proxy status on the DNS record pointing at
Render; Render Logs at the exact timestamp of a hung request) are still
the next things to check — this checkpoint does not close that
investigation, it only records that the symptom is not currently
present.

## What changed since Part 3B-2

- **Added:** `docs/checkpoints/CP4-PART3B-3-CHECKPOINT.md` (this file)
- **Nothing else changed.** No application code, no auth/WebAuthn/gate
  code, no `render.yaml`, no test files, no scripts were modified.

## Verification performed for this checkpoint

- `diff -rq` against the Part 3B-2 checkpoint tree → only this file
  differs (added); everything else byte-identical.
- Checkpoint ZIP built from the current working tree, then extracted to a
  clean directory and `diff -rq`'d back against the source tree it was
  built from, to confirm the archive is a faithful, lossless copy (see
  extraction-verification note below).
- The 305-test `server/**/*.test.js` suite and the 29-test
  `test/deployment/` suite were **not** re-run for this checkpoint, per
  instruction — no code they cover changed.

## Next action

- Authenticated `Set-Cookie` flag verification against a real logged-in
  session on `https://cozyos.org` (the one open WARN item above).
- If the `/` timeout recurs, follow up on the two unresolved candidates
  noted above rather than re-diagnosing from scratch.
- Any future code change returns to Cloud for implementation and
  verification before another Termux deployment/proof cycle.
