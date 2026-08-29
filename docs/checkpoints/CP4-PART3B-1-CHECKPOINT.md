# CP4 — Part 3B-1 Checkpoint: Verification Script Portability Fix

**Checkpoint name:** CozyOS-CP4-Part3B-1-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP4-Part3A-Checkpoint.zip`, modified only as described
below.

## What prompted this checkpoint

Running `scripts/verify-production-routing.sh` live from Termux against
`https://cozyos.org` failed with:

```
Permission denied on /tmp/cozyos-verify-status.11841
```

The script reached `https://cozyos.org` (proving network connectivity and
DNS resolution worked from Termux), but a hardcoded `/tmp/...` path used
for capturing curl's status code and stderr was not writable in that
environment. **This was a defect in the verification tool itself, not
evidence of a Render or Cloudflare routing problem.** No conclusion about
live routing correctness can be drawn from that failed run, and none is
drawn here.

## What was fixed

`scripts/verify-production-routing.sh` — temp-file handling was rewritten
to avoid ever assuming a writable `/tmp`:

- Old behavior: `TMP_HEADERS`/`TMP_BODY` used `mktemp` with a fallback to
  a hardcoded `/tmp/...$$` path; the `fetch()` function separately used
  two more hardcoded `/tmp/cozyos-verify-status.$$` /
  `/tmp/cozyos-verify-err.$$` paths that bypassed the `mktemp` fallback
  entirely — this is exactly what broke on Termux, where `/tmp` isn't
  guaranteed to exist or be writable by the app user.
- New behavior: resolves `${TMPDIR:-/tmp}` first (Termux sets `TMPDIR` to
  a writable path under `$PREFIX/tmp` by default), falls back to the
  current directory if that's not a writable directory either, creates a
  single `mktemp -d` work directory under it, and routes **all** temp
  files (headers, body, status, stderr) through that one directory. A
  single `cleanup()` trap removes the whole work directory on exit.

No other logic changed: the same routes are checked, the same pass/fail/
warn criteria apply, the same Part 3 cookie-flag inspection is unchanged.

## What was explicitly NOT touched

- `server/static-boundary-server.js`
- `server/webauthn-rp/server.js`
- `server/webauthn-rp/db.js`
- Any authentication/gate code
- `render.yaml`
- Any Cloudflare configuration (none is stored in this repo)
- Any existing test file

## Verification performed

- `bash -n scripts/verify-production-routing.sh` → syntax OK
- Simulated a forced-unwritable `TMPDIR` (`TMPDIR=/nonexistent-forced-fallback`)
  and ran the script end-to-end in this environment → completed with no
  permission errors, confirming the fallback path works.
- `node --test test/deployment/render-yaml.test.js` → **8 pass / 0 fail**
- `node --test $(find server -name "*.test.js")` → **305 pass / 0 fail**
- `diff -rq` against the Part 3A checkpoint tree → **only**
  `scripts/verify-production-routing.sh` differs; every other file is
  byte-identical.

## Live Termux run against https://cozyos.org

**Not yet performed with the corrected script as of this checkpoint.**
This sandbox has no outbound network access
(`x-deny-reason: host_not_allowed` on every request), so the corrected
script could not be run against the real `https://cozyos.org` from here.
The next step (still part of unblocking Part 3B) is to re-run the
corrected script from Termux and report the actual output — no live
routing conclusion (pass or fail) should be drawn until that real output
is in hand.

## Files changed since Part 3A checkpoint

- **Modified:** `scripts/verify-production-routing.sh` (temp-file
  handling only, as described above)
- **Added:** `docs/checkpoints/CP4-PART3B-1-CHECKPOINT.md` (this file)
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

Re-run the corrected `scripts/verify-production-routing.sh` from Termux
against `https://cozyos.org` and report the real output. That real
output — not the earlier permission-denied failure — is what determines
whether Part 3B proceeds to "everything passes, create the Part 3B
checkpoint" or to "something failed, diagnose which layer." Also still
needed before Part 3B can conclude: confirmation of which Cloudflare
routing option (direct DNS-to-Render, or Origin Rule on a Pages Custom
Domain) is actually configured for `cozyos.org` — this has not yet been
reported.
