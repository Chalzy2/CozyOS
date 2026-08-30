# Render deployment — CozyOS Administrator backend

Status: `render.yaml` exists and is tested for shape (see
`test/deployment/render-yaml.test.js`). **It has never been deployed.**
Nothing below the "What render.yaml does" section has been verified live.
Do not treat this file as evidence that production is working.

## Why Render, and why this doesn't replace Cloudflare Pages

`server/static-boundary-server.js` is a real, always-on Node HTTP server —
it needs a host that keeps a process running and gives it a writable disk.
Cloudflare Pages/Pages Functions cannot do either, because `node:sqlite` +
`node:fs` (used by `server/webauthn-rp/db.js`) don't provide real
persistent storage on that runtime — see `SECURITY-BOUNDARY-DEPLOYMENT.md`,
which documents this and names "a small always-on Node process (Render,
Railway, Fly.io, a VPS)" as the option this file implements the Render
side of.

Cloudflare Pages continues to serve the CozyOS static frontend. Render
runs only the Node backend (`server/static-boundary-server.js`, which
mounts `server/webauthn-rp/server.js` unchanged, plus the SQLite-backed
session/credential store).

**Note on repo history:** an earlier draft of this repository had a
Cloudflare Pages Functions routing adapter at `functions/webauthn/[[path]].js`
plus `docs/webauthn-pages-adapter-known-issue.md` explaining why it
couldn't solve storage. Neither exists in this baseline — the `functions/`
directory has been removed entirely. That's consistent with the Render
decision (this repo no longer has two partial routing paths to reason
about), but it means the "Cloudflare Pages Functions was tried and
explicitly documented as storage-incompatible" paper trail is gone too;
if that reasoning is ever needed again, it now lives only in
`SECURITY-BOUNDARY-DEPLOYMENT.md`'s shorter summary and this note.

## What render.yaml does

- Runs `node server/static-boundary-server.js` on Render's Node runtime,
  pinned to Node 22.22.0 (matches the version this was tested against;
  `node:sqlite` is still an experimental API).
- Attaches a 1GB persistent disk at `/var/data` and points
  `COZY_WEBAUTHN_DB` at a file on it, so users/credentials/sessions
  survive deploys and restarts. Without this, `db.js` would open a fresh,
  empty SQLite file inside the container's ephemeral filesystem on every
  deploy.
- Sets `COZY_WEBAUTHN_COOKIE_SECURE=1` so `Set-Cookie` for
  `cozy_admin_session` includes `Secure` in production (see
  `server/webauthn-rp/server.js`, `sessionCookieHeader`).
- Health-checks `/` (always 200, unauthenticated), not `/webauthn/session`
  (correctly 401 when logged out — using it as a health check would make
  Render think a healthy, logged-out server is down).
- Sets `COZY_RP_ID=cozyos.org` and `COZY_RP_ORIGIN=https://cozyos.org` —
  the production hostname was confirmed reachable and serving the real
  CozyOS site (fetched directly, got CozyOS-branded HTML back, no
  redirect to a different host). See `test/deployment/render-yaml.test.js`
  for the guard that fails loudly if this drifts from that exact value.

## Remaining manual step: same-origin routing (not implemented here)

The frontend calls relative paths (`fetch('/webauthn/session', {credentials:
'include'})`). The `cozy_admin_session` cookie is `SameSite=Strict`. For
that to work in production, the browser's address bar must show one
single origin for both the static frontend and `/webauthn/*` — Render's
`https://<service>.onrender.com` and Cloudflare Pages'
`https://cozyos.pages.dev` are two different origins, and no cookie or
CORS setting fixes that; the routing itself has to be same-origin.

This doc intentionally does not pick a final hostname or wire DNS, because
doing so would mean guessing at infrastructure you haven't set up yet.
Two real options, consistent with the Render decision and without
resurrecting Cloudflare Workers/Pages Functions as the auth backend:

1. **Cloudflare DNS (proxied) points the production hostname directly at
   Render, and Render serves the whole site.** `static-boundary-server.js`
   already serves the full static tree (`siteRoot` = repo root) as well as
   `/webauthn/*` and `/auth/*`, so this requires no new code — only a
   Render custom domain + a Cloudflare CNAME. Cloudflare Pages would no
   longer serve production traffic for this hostname (it can still exist
   for previews/other subdomains).
2. **Keep Cloudflare Pages as the primary origin for static assets, and
   use a Cloudflare Origin Rule (not a Worker, not a Pages Function) to
   override the origin for `/webauthn/*` and `/auth/*` paths to the Render
   service**, on a zone-level (non-Pages) DNS record. This keeps Pages for
   everything else at the cost of one extra piece of Cloudflare
   configuration to maintain.

Whichever is chosen, the values below must be set to match:

| Render env var    | Must equal |
|---|---|
| `COZY_RP_ID`       | the exact hostname shown in the browser address bar (e.g. `cozyos.org`, no scheme) |
| `COZY_RP_ORIGIN`   | that hostname's full origin (e.g. `https://cozyos.org`) |

## Manual steps required in the Render dashboard

1. Create a new **Web Service** from this repository; Render will read
   `render.yaml` (Blueprint) automatically.
2. Confirm the disk (`cozyos-webauthn-data`, 1GB, `/var/data`) is
   attached — Blueprints create disks on first deploy, but verify it in
   Dashboard → service → Disks.
3. `COZY_RP_ID`/`COZY_RP_ORIGIN` are already set in `render.yaml` to
   `cozyos.org` / `https://cozyos.org` — no manual entry needed unless the
   production hostname changes.
4. If using option 1 above, add the chosen hostname under service →
   Settings → Custom Domains, and follow Render's shown DNS target for
   the Cloudflare CNAME.

## Verification not yet performed

- No live deploy has been created.
- `GET /webauthn/session` unauthenticated returning `401`
  `{"authenticated":false}` from the real production hostname — not
  verified.
- Real passkey registration/login against the deployed instance,
  confirming the session cookie round-trips through whatever routing
  option is chosen — not verified.
- Platform-admin vs. org-admin vs. forged-claim checks against the live
  deployment — not verified (all of these are covered by
  `server/webauthn-rp/test/*` locally, which is not the same as live
  verification).
