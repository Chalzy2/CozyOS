# CP4 — Render Deployment, Part 2 Checkpoint

**Checkpoint name:** CozyOS-CP4-Render-Part2-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP4-Render-Deployment-IMPLEMENTED.zip` (the CP4 checkpoint
this document's parent, `CP4-RENDER-CHECKPOINT.md`, describes).

This is a hard recovery boundary, created deliberately **before** any live
Render or Cloudflare change is made, and before Part 3 (live production
verification) begins. If Part 3 needs to be redone from scratch on a new
account, restore from this ZIP rather than re-deriving state from chat
history.

## CP4 Render implementation status

- Render Blueprint (`render.yaml`) implemented, locally boot-tested, not
  yet deployed.
- Documentation of the routing decision and the two same-origin options
  (`docs/render-deployment.md`) implemented.
- Deployment config regression tests (`test/deployment/render-yaml.test.js`)
  implemented and passing.
- Production routing verification tooling
  (`scripts/verify-production-routing.sh`) implemented in Part 2 of this
  session, syntax-checked, dry-run tested locally. **Not yet run against
  live `cozyos.org`** — this sandbox has no outbound network access
  (`x-deny-reason: host_not_allowed` on every attempt). Must be run from
  an environment with real egress (e.g. Termux) once routing is live.
- **The Cloudflare same-origin routing itself has NOT been implemented or
  confirmed.** `docs/render-deployment.md` presents two options (proxied
  DNS directly to Render, or a Cloudflare Origin Rule scoping
  `/webauthn/*` and `/auth/*` to Render) without picking one, and
  `CP4-RENDER-CHECKPOINT.md` lists resolving this as an open external
  action. Do not treat this as decided.
- No Render Web Service has been created. No live deploy exists.

## Files present at this checkpoint (relevant to Render work)

| Path | Status |
|---|---|
| `render.yaml` | Implemented (CP4). Unmodified since. |
| `docs/render-deployment.md` | Implemented (CP4). Unmodified since. |
| `test/deployment/render-yaml.test.js` | Implemented (CP4). Unmodified since. |
| `docs/checkpoints/CP4-RENDER-CHECKPOINT.md` | Implemented (CP4). Unmodified since. |
| `scripts/verify-production-routing.sh` | **New in Part 2 of this session.** |
| `docs/checkpoints/CP4-RENDER-PART2-CHECKPOINT.md` | **New — this file.** |

All other source and test files in the repository (the full `server/`
tree, `core/`, `applications/`, frontend HTML/JS, `harness/`, etc.) are
present in this ZIP unchanged from the CP4 baseline. This checkpoint is
a full repository snapshot, not a diff-only patch — restoring it does
not require reassembling files from multiple sources.

## Exact files changed since the CP4 baseline

Verified by recursive diff against the untouched CP4 ZIP
(`CozyOS-CP4-Render-Deployment-IMPLEMENTED.zip`):

- **Added:** `scripts/verify-production-routing.sh`
- **Added:** `docs/checkpoints/CP4-RENDER-PART2-CHECKPOINT.md` (this file)
- **Nothing else added, modified, or deleted.**

## Files deliberately left untouched

Protected/security-boundary files — confirmed byte-identical to the CP4
baseline, not touched in Part 2:

- `server/static-boundary-server.js`
- `server/webauthn-rp/server.js`
- `server/webauthn-rp/db.js`
- `package.json`
- All existing `server/**/*.test.js` files

No authentication, gate, or session logic was reopened or edited in
Part 2. Part 2's only work was adding the read-only verification script
and this checkpoint documentation.

## Known stale files (pre-existing, not created or resolved here)

Carried over from the CP4 baseline, still present, still not cleaned up:

- `render.yaml.txt` (repo root) — byte-identical to an earlier, superseded
  draft of `render.yaml` (predates the `COZY_RP_ID`/`COZY_RP_ORIGIN`
  hardcoding). Inert: the `.txt` extension makes it invisible to Render.
- `render-yaml.test.js` (repo root, **not** under `test/deployment/`) —
  byte-identical to an earlier draft of the real test file. Inert: it's
  outside the glob Render/CI would pick up (`test/deployment/`).

CP4's own checkpoint recommended deleting both in "the next checkpoint."
That cleanup was **not** performed here, on purpose — this checkpoint's
scope was limited to what the user explicitly asked for (verification
tooling + checkpoint), and the user's instruction for this step was
"do not modify anything else." Treat deleting these two stale files as
a candidate for Part 3 or a later cleanup step, not done yet.

## Exact test results at this checkpoint

Run directly against this checkpoint's file tree:

- `bash -n scripts/verify-production-routing.sh` → syntax OK
- `node --test test/deployment/render-yaml.test.js` → **8 pass / 0 fail**
- `node --test $(find server -name "*.test.js")` → **305 pass / 0 fail**
- `diff -rq` of this tree against the untouched CP4 baseline ZIP → only
  the two new files listed above; everything else byte-identical

## Current unresolved external step

Live Render/Cloudflare routing. Specifically, in order:

1. Confirm what currently serves `cozyos.org` at the Cloudflare layer —
   a Cloudflare Pages project's Custom Domain, or a plain DNS zone
   proxied through Cloudflare. This determines which of the two options
   in `docs/render-deployment.md` is actually available.
2. Create the Render Web Service (Blueprint) from this repository.
3. Confirm the disk (`cozyos-webauthn-data`, 1GB, `/var/data`) attached
   in Render Dashboard → service → Disks.
4. Implement same-origin routing per whichever option #1 determines
   (direct DNS-to-Render, or a Cloudflare Origin Rule scoping
   `/webauthn/*` and `/auth/*` to the Render service).
5. Run `scripts/verify-production-routing.sh` from an environment with
   real network access against the live `https://cozyos.org`.
6. Perform a real passkey login against the deployed instance and check
   the `cozy_admin_session` Set-Cookie flags with
   `scripts/verify-production-routing.sh --set-cookie-header '...'`.

None of steps 1–6 have been performed. This checkpoint exists specifically
so that work can resume from here without redoing Part 1/Part 2, and
without any live infrastructure change having been made yet.

## Exact next action: Part 3

Part 3 = live deployment verification. In order:

1. Resolve unresolved step 1 above (what currently serves `cozyos.org`).
2. Create the Render Web Service and confirm the disk.
3. Implement the chosen same-origin routing at the Cloudflare layer.
4. Run `scripts/verify-production-routing.sh` against the live site from
   a networked environment (e.g. Termux) and report the raw output.
5. Report pass/fail per route, plus the unauthenticated-cookie inspection
   from Part 3 of the script's own output.
6. Only after that: perform one real passkey login and check Set-Cookie
   flags with `--set-cookie-header`.

Do not skip ahead to routing changes or a live deploy without this
checkpoint ZIP existing first — it already does, as of this file.
