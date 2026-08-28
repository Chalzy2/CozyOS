# Render deployment — CozyOS Administrator backend

Status: `render.yaml` exists and is tested for shape (see
`test/deployment/render-yaml.test.js`). **It has never been deployed.**
Nothing below the "What render.yaml does" section has been verified live.
Do not treat this file as evidence that production is working.

## Why Render, and why this doesn't replace Cloudflare Pages

`server/static-boundary-server.js` is a real, always-on Node HTTP server —
it needs a host that keeps a process running and gives it a writable disk.
Cloudflare Pages/Pages Functions cannot do either: see
`docs/webauthn-pages-adapter-known-issue.md` for why `node:sqlite` +
`node:fs` (used by `server/webauthn-rp/db.js`) do not work on that
runtime. That is the reason this repository already has a Cloudflare
Pages Functions adapter (`functions/webauthn/[[path]].js`) that fixes
*routing* but explicitly documents that it does not, and cannot, fix
storage.

Cloudflare Pages continues to serve the CozyOS static frontend. Render
runs only the Node backend (`server/static-boundary-server.js`, which
mounts `server/webauthn-rp/server.js` unchanged, plus the SQLite-backed
session/credential store).

**Correction to prior status:** an earlier note in this project claimed
the Cloudflare Functions adapter had been "rejected and removed." That is
not accurate — `functions/webauthn/[[path]].js` and
`functions/_lib/node-http-shim.js` are still present in this repository.
Nothing in this change deletes them; they're simply not the production
path per `SECURITY-BOUNDARY-DEPLOYMENT.md`'s own option 2 (real Node host
+ Cloudflare as proxy), which this render.yaml implements the Render side
of.

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
- Deliberately leaves `COZY_RP_ID` and `COZY_RP_ORIGIN` unset
  (`sync: false`) — see the next section.

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
3. Once a production hostname is decided (see above), set `COZY_RP_ID`
   and `COZY_RP_ORIGIN` in Dashboard → service → Environment (they are
   `sync: false` in `render.yaml`, so Render will not deploy without them
   being set at least once manually).
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
