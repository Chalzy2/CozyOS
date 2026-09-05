# CP4 — Part 3B-2 Checkpoint: Offline-Testable Verification Architecture

**Checkpoint name:** CozyOS-CP4-Part3B-2-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP4-Part3B-1-Checkpoint.zip`, modified only as
described below.

## Why this checkpoint exists

The sandbox this work is being done in has no outbound network access
(confirmed: `x-deny-reason: host_not_allowed` on every request). That is
being treated as an intentional environment property, not a defect to
work around. The verification architecture is now split cleanly:

- **Offline (this sandbox, or any CI/dev machine):** exercise
  `scripts/verify-production-routing.sh`'s actual decision logic —
  status/content-type/body classification, HTML-shell detection, cookie
  flag checking, temp-directory fallback — against fabricated, canned
  HTTP responses. Zero network required. This is what CP4-PART3B-2 adds.
- **Online (Termux, or any networked machine):** run the same script for
  real against `https://cozyos.org`. This is the only place a live
  routing conclusion can be drawn. Not performed in this checkpoint.

Sandbox network failure was **not** interpreted as a CozyOS production
failure at any point in this work.

## What changed

`scripts/verify-production-routing.sh` was refactored, with no change to
what it checks or how it decides pass/warn/fail — only how the logic is
organized:

- All decision logic was extracted into small, pure, network-free
  functions: `classify_root`, `classify_webauthn_session_route`,
  `classify_webauthn_session_body`, `classify_auth_route`,
  `classify_admin_route`, `classify_chalzydashboard_route`,
  `classify_cookie_flag`, plus the helpers `resolve_workdir` and
  `body_looks_like_html_shell_file`. Each classifier takes plain
  arguments (status code, content-type string, a path to a body file)
  and returns a decision — no curl call, no environment dependency, no
  side effects beyond reading the given file.
- All networked work (the `fetch` function, the route loop, cookie-flag
  orchestration, live output) was moved into a `main()` function.
- A guard at the bottom (`if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]`) means
  `main()` — and therefore any network call — only runs when the script
  is **executed** directly. When the script is **sourced** (as the new
  offline tests do), only function definitions load; nothing is fetched.
- Behavior when run directly and live is unchanged: same routes checked
  (`/`, `/webauthn/session`, `/auth/google`, `/admin`,
  `/chalzydashboard`), same Part 2 deep body check, same optional Part 3
  cookie-flag check via `--set-cookie-header`, same summary/exit-code
  logic. This is a structural refactor, not a behavior change.
- The Termux temp-directory fix from Part 3B-1 (`resolve_workdir`,
  falling back `TMPDIR -> /tmp -> .`) is preserved, now as its own named,
  independently-testable function.

**New file:** `test/deployment/verify-production-routing-offline.test.js`
— 21 `node:test` cases that source the script and call its classify_*
functions directly with fabricated inputs, covering (at minimum, per the
request):
- `/webauthn/session` → 401 JSON `{"authenticated":false}` → PASS
- `/webauthn/session` → 200 `text/html` → FAIL (Pages/static fallback)
- `/webauthn/session` → unexpected content-type (200 `text/plain`) → WARN
- `/webauthn/session` → 401 JSON content-type but HTML-looking body → FAIL
- deep body check (Part 2 logic): correct JSON shape → PASS, HTML → FAIL
- `/` → 200 → PASS; non-200 → WARN
- `/admin` → 404 → PASS; leaked admin HTML → FAIL; other status → WARN
- `/chalzydashboard` → 200 HTML gate → PASS; unexpected → WARN
- `/auth/*` → non-HTML → PASS; HTML shell → WARN
- Set-Cookie: all four flags present → all PASS; missing `Secure` → FAIL
  for that flag only, others still PASS
- `resolve_workdir` with a missing `TMPDIR` → falls back to a writable dir
- `resolve_workdir` with an existing-but-unwritable `TMPDIR` → falls back
  to a writable dir
- `body_looks_like_html_shell_file` correctly distinguishes HTML from
  JSON/plain bodies
- Sourcing the script itself makes no network call (a `timeout`-bounded
  sanity check on the source step)

No test file was modified to make it pass, and no existing test was
touched — this is a new file only.

## What was explicitly NOT touched

- `server/static-boundary-server.js`
- `server/webauthn-rp/server.js`
- `server/webauthn-rp/db.js`
- Any authentication/gate code
- `render.yaml`
- Any existing test file (including `test/deployment/render-yaml.test.js`)
- Any Cloudflare or Render configuration (none is stored in this repo)

## Verification performed

- `bash -n scripts/verify-production-routing.sh` → syntax OK
- `node --test test/deployment/verify-production-routing-offline.test.js`
  → **21 pass / 0 fail**, zero network access used
- `node --test test/deployment/render-yaml.test.js` → **8 pass / 0 fail**
  (unchanged, still passing after the refactor)
- `node --test $(find test/deployment -name "*.test.js")` → **29 pass /
  0 fail** combined
- `node --test $(find server -name "*.test.js")` → **305 pass / 0 fail**
- `diff -rq` against the Part 3B-1 checkpoint tree → only
  `scripts/verify-production-routing.sh` (modified) and
  `test/deployment/verify-production-routing-offline.test.js` (added)
  differ; everything else byte-identical

## Live Termux run against https://cozyos.org

**Still not performed as of this checkpoint.** That remains the explicit
next step, run from a networked environment, kept entirely separate from
the repository's own test suite. The repository test suite (`node --test
$(find server -name "*.test.js")` plus everything under
`test/deployment/`) requires no network access at all, now or previously
by design for `render-yaml.test.js`, and this checkpoint keeps that
property true for the new offline verification tests too.

## Files changed since Part 3B-1 checkpoint

- **Modified:** `scripts/verify-production-routing.sh` (structural
  refactor: pure classify_* functions extracted, main() network logic
  gated behind a sourced-vs-executed guard; behavior unchanged)
- **Added:** `test/deployment/verify-production-routing-offline.test.js`
- **Added:** `docs/checkpoints/CP4-PART3B-2-CHECKPOINT.md` (this file)
- **Nothing else changed.**

## Files deliberately untouched (unchanged since CP4 baseline)

- `server/static-boundary-server.js`
- `server/webauthn-rp/server.js`
- `server/webauthn-rp/db.js`
- `package.json`
- All existing `server/**/*.test.js`
- `render.yaml`, `docs/render-deployment.md`,
  `test/deployment/render-yaml.test.js`
- Known stale files `render.yaml.txt` and root `render-yaml.test.js` —
  still present, still not cleaned up, unchanged

## Next action

Run `scripts/verify-production-routing.sh` for real, directly (not
sourced), from Termux against `https://cozyos.org`, and report the exact
output. Also still needed: confirmation of which Cloudflare routing
option (direct DNS-to-Render, or Origin Rule on a Pages Custom Domain) is
actually configured for `cozyos.org` — not yet reported. Once both are in
hand, Part 3B can conclude for real: either "everything passes, create
the Part 3B live-verification checkpoint" or "something failed, diagnose
which layer" per the original Part 3B instructions.
