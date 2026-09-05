# CP4 — Render Deployment Checkpoint

**Checkpoint name:** CP4-Render-Deployment-IMPLEMENTED
**Implementation date:** 2026-08-28
**Baseline this checkpoint was built from:** `CozyOS-main_zip_0012.zip`
(user-supplied). This manifest and the ZIP built alongside it are the
first point at which `render.yaml` and `test/deployment/render-yaml.test.js`
exist in that baseline's history — they were not present before this
checkpoint and were not carried over from any earlier snapshot.

## Files added / modified / deleted

Verified by a full recursive diff against the untouched baseline archive.
This checkpoint touches exactly three paths:

| Path | Change |
|---|---|
| `render.yaml` | Added |
| `test/deployment/render-yaml.test.js` | Added |
| `docs/render-deployment.md` | Modified (removed stale references to the now-deleted `functions/webauthn/[[path]].js` Cloudflare Pages adapter; documented that `COZY_RP_ID`/`COZY_RP_ORIGIN` are now hardcoded to the confirmed production hostname) |

Nothing else in the repository was added, modified, or deleted by this
checkpoint. No files were deleted as part of this work — the absence of
`functions/`, `docs/webauthn-pages-adapter-known-issue.md`, and any
`.git` directory in this repository predates this checkpoint; it was
observed and documented, not caused, here.

**Stale duplicate artifacts found in the baseline (not created here,
not modified here):** the repository root already contained
`render.yaml.txt` and `render-yaml.test.js`. Both are byte-identical to
an earlier, superseded draft (before `COZY_RP_ID`/`COZY_RP_ORIGIN` were
hardcoded to `cozyos.org`), just misplaced — the `.txt` extension makes
`render.yaml.txt` invisible to Render, and root-level `render-yaml.test.js`
is outside `test/deployment/` so it won't be picked up by the same glob
as the real one. They are inert but confusing. Recommend deleting both in
the next checkpoint rather than continuing to carry two versions of the
same file.

## Tests actually run and exact pass/fail counts

Run directly against this checkpoint's file tree immediately before
packaging:

- `node --test test/deployment/render-yaml.test.js` → **8 pass / 0 fail**
- `node --test $(find server -name "*.test.js")` (all of `server/ai`,
  `server/auth`, `server/live-relay`, `server/test`, `server/webauthn-rp`,
  including the real headless-browser passkey e2e test) → **305 pass / 0 fail**
- `node --check test/deployment/render-yaml.test.js` → valid syntax
- `python3 -c "import yaml; yaml.safe_load(open('render.yaml'))"` → parses
  cleanly as YAML; dumped structure confirmed a single `web` service with
  the disk and all seven env vars intact (see below)

No test file was modified to make it pass. No security/auth file was
modified at all — see "Protected files confirmed untouched" below.

## Deployment configuration implemented

`render.yaml` — single web service:
- `runtime: node`, `startCommand: node server/static-boundary-server.js`
- `healthCheckPath: /` (always-200 public route, not the 401-when-logged-out
  `/webauthn/session`)
- Persistent disk `cozyos-webauthn-data`, 1GB, mounted at `/var/data`
- `COZY_WEBAUTHN_DB=/var/data/cozy-webauthn.sqlite` (on the persistent disk)
- `COZY_WEBAUTHN_COOKIE_SECURE=1`
- `COZY_FIREBASE_PROJECT_ID=cozycabin-affiliate`
- `NODE_VERSION=22.22.0` (pinned; matches the version this was tested against)
- `COZY_RP_ID=cozyos.org`, `COZY_RP_ORIGIN=https://cozyos.org` — hardcoded
  because the production hostname was confirmed reachable (direct fetch
  returned CozyOS-branded HTML, no redirect to a different host)

This has been **locally verified** (booting the actual `startCommand`
with these exact env vars against this exact repository) to produce:
- `GET /` → `200`
- `GET /webauthn/session` (no cookie) → `401`, `Content-Type: application/json`,
  `{"authenticated":false}`
- `GET /admin` (no session) → `404`

It has **never been deployed to Render**. Local verification is not live
verification — see "Known remaining external deployment actions."

## Protected files confirmed untouched

Byte-for-byte diffed against the untouched baseline archive, all identical:
- `server/static-boundary-server.js`
- `server/webauthn-rp/server.js`
- `server/webauthn-rp/db.js`
- `package.json`
- commit `9740318`'s gate/session logic (not modified; this checkpoint has
  no `.git` directory to check against, so this is stated on the basis
  that no file under `server/webauthn-rp/` or `core/shell/admin-gate-core.js`
  was touched, not on a `git diff` against that commit — see the caveat
  below)

**Caveat, stated plainly:** this repository snapshot has no `.git`
directory, so `git status` / `git diff --check` / a diff against commit
`9740318` cannot be run here. "Untouched" above means "byte-identical to
the untouched baseline archive as extracted," not "verified against the
real git history." Run `git diff --check` yourself once these files are
in your real checkout.

## Known remaining external deployment actions

1. Create the Render Web Service (Blueprint) from this repository.
2. Confirm the same-origin routing decision at the Cloudflare layer for
   `cozyos.org` — specifically, whether it's currently a Cloudflare Pages
   project's Custom Domain or a plain DNS zone proxied through Cloudflare.
   This determines which of the two options in `docs/render-deployment.md`
   is actually available; it has not been checked because this environment
   has no access to that Cloudflare account.
3. Live-verify `GET https://cozyos.org/webauthn/session` returns `401`
   JSON (not `index.html`) once routing is in place.
4. Verify a real passkey login round-trips the session cookie through
   whatever routing option is chosen.

## Exact next step

In Termux, against the real repository:
```bash
git status
git add render.yaml docs/render-deployment.md test/deployment/render-yaml.test.js docs/checkpoints/CP4-RENDER-CHECKPOINT.md
git diff --cached --check
node --test test/deployment/render-yaml.test.js
node --test $(find server -name "*.test.js")
git commit -m "CP4: Render deployment config + checkpoint manifest"
git push
```
Then resolve remaining action #2 above and report back which Cloudflare
setup serves `cozyos.org`, so the next checkpoint can implement the actual
routing instead of documenting two options.
