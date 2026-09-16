# CP4 — Part 3A Checkpoint: Deployment State Inspection

**Checkpoint name:** CozyOS-CP4-Part3A-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP4-Render-Part2-Checkpoint.zip`, unmodified.

This checkpoint contains **no repository changes** relative to Part 2 —
inspection determined that no code change is genuinely required to
proceed. Full repository state is included anyway, per the mandatory
checkpoint protocol, plus this determination and the exact dashboard
values needed for the next external step.

## Part 3A determination

1. **Has the Render service been created?** No. No service ID, deploy
   log, or `onrender.com` reference exists anywhere in this repository
   outside of explanatory doc text. `render.yaml` has never been applied.
2. **Is `render.yaml` ready for deployment?** Yes, unchanged since CP4:
   single `web` service, `runtime: node`, `startCommand: node
   server/static-boundary-server.js`, `healthCheckPath: /`, a 1GB disk
   at `/var/data`, and all required env vars (`NODE_ENV`,
   `NODE_VERSION`, `COZY_WEBAUTHN_DB`, `COZY_WEBAUTHN_COOKIE_SECURE`,
   `COZY_FIREBASE_PROJECT_ID`, `COZY_RP_ID`, `COZY_RP_ORIGIN`) already
   set to production values.
3. **What Render configuration still needs to be supplied?** Nothing in
   the Blueprint itself. Render will need you to connect the GitHub repo
   and approve the Blueprint — see exact steps below.
4. **What Cloudflare configuration is required?** Not yet decided. Two
   options remain open, as documented in `docs/render-deployment.md`;
   picking one requires knowing how `cozyos.org` is currently configured
   in your Cloudflare account, which this environment cannot see.

**Conclusion:** no repository change is required to proceed. The next
actionable steps are entirely in the Render and Cloudflare dashboards.

## Exact dashboard actions required (external — you must perform these)

### Step 1 — Determine current Cloudflare setup for `cozyos.org`

In the Cloudflare dashboard, check: is `cozyos.org` currently a
**Cloudflare Pages project's Custom Domain**, or a **plain DNS zone**
(A/AAAA/CNAME record, proxied) with no Pages project attached? This
determines which option below applies. Report back which one it is.

### Step 2 — Create the Render Web Service

1. Render dashboard → New → Blueprint.
2. Connect the GitHub repository containing this codebase.
3. Render reads `render.yaml` automatically. Confirm it shows:
   - Service name: `cozyos-admin-backend`
   - Type: Web Service, Runtime: Node
   - Plan: Starter, Region: Oregon
   - Disk: `cozyos-webauthn-data`, 1GB, mounted at `/var/data`
4. Approve and deploy.
5. After first deploy, Dashboard → service → Disks → confirm the disk
   is actually attached (Blueprints create disks on first deploy, but
   this has never been verified live — confirm it, don't assume it).

### Step 3 — Same-origin routing (pick based on Step 1's answer)

**If `cozyos.org` is a plain DNS zone (not a Pages Custom Domain):**
- Render service → Settings → Custom Domains → add `cozyos.org`.
- Render will show a target (typically a CNAME to
  `<service>.onrender.com`, or an ALIAS/ANAME for the apex).
- In Cloudflare DNS, point `cozyos.org` at that target, proxy status ON
  (orange cloud).
- Cloudflare Pages, if it exists for other subdomains, is unaffected.

**If `cozyos.org` is currently a Cloudflare Pages Custom Domain:**
- Do not remove the Pages Custom Domain if Pages is still serving other
  routes you want to keep.
- Cloudflare dashboard → the zone for `cozyos.org` → Rules → Origin
  Rules → create a rule:
  - **When:** URI Path starts with `/webauthn/` **OR** URI Path starts
    with `/auth/`
  - **Then:** Override to Origin → set the origin to the Render
    service's hostname (`cozyos-admin-backend.onrender.com` or your
    chosen custom domain on Render), port 443, keep SNI/host header as
    the Render hostname per Cloudflare's Origin Rule form.
  - Leave all other paths pointing at Cloudflare Pages (default,
    unchanged).

### Step 4 — Confirm the two env vars still match reality

`COZY_RP_ID=cozyos.org` and `COZY_RP_ORIGIN=https://cozyos.org` are
already set correctly in `render.yaml` for this hostname. No dashboard
edit needed **unless** the production hostname changes, in which case
both must be updated together (per `docs/render-deployment.md`) or
every previously-registered passkey breaks.

## What Claude cannot do from here

- Cannot access your Render or Cloudflare accounts.
- Cannot create the Render service, attach the domain, or write the
  Origin Rule — all of Steps 1–3 above are dashboard-only actions only
  you can perform.
- Cannot claim `cozyos.org` is live until you report back the actual
  result of running `scripts/verify-production-routing.sh` from a
  networked environment against the real hostname.

## Verification run at this checkpoint

- `node --test test/deployment/render-yaml.test.js` → **8 pass / 0 fail**
- `node --test $(find server -name "*.test.js")` → **305 pass / 0 fail**
- `bash -n scripts/verify-production-routing.sh` → syntax OK
- `diff -rq` against `CozyOS-CP4-Render-Part2-Checkpoint.zip` contents →
  no differences except this file itself (new)

## Files changed since Part 2 checkpoint

- **Added:** `docs/checkpoints/CP4-PART3A-CHECKPOINT.md` (this file)
- **Nothing else changed.**

## Files deliberately untouched (unchanged since CP4 baseline)

- `server/static-boundary-server.js`
- `server/webauthn-rp/server.js`
- `server/webauthn-rp/db.js`
- `package.json`
- All existing `server/**/*.test.js`
- `render.yaml`, `docs/render-deployment.md`,
  `test/deployment/render-yaml.test.js`,
  `scripts/verify-production-routing.sh`
- Known stale files `render.yaml.txt` and root `render-yaml.test.js` —
  still present, still not cleaned up, unchanged

## Next action: Part 3B

Blocked on you completing Steps 1–3 above and reporting back:
1. Which Cloudflare setup currently serves `cozyos.org` (Step 1's answer).
2. Confirmation the Render service is created and the disk is attached.
3. Which routing option was implemented.

Once reported, Part 3B is: run `scripts/verify-production-routing.sh`
from a networked environment against the live site and record the real
output here. No further repository code changes are anticipated for
Part 3B unless the live results reveal a genuine bug.
