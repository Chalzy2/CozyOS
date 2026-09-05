# CozyOS — Security Boundary: Current State and Deployment Requirement

## The limitation (item 19 of the milestone brief)

cozyos.org is deployed on **GitHub Pages** (confirmed via `sw.js` comments
and repo structure — no `.github/workflows` deploy pipeline, no CNAME/edge
config for anything else). GitHub Pages serves static files only. It cannot
run server-side code, cannot inspect a cookie, and cannot conditionally
decide what bytes to return based on who is asking. Concretely:

> Any file present in the repository — including `dashboard.html` and
> `Chalzydashboard.html` — is returned byte-for-byte to any HTTP client
> that requests its path, unauthenticated or not.

**No amount of JavaScript inside those files changes this.** A script tag
that checks `isPlatformAdmin` only runs *after* the browser has already
received the full HTML/JS of the administrator app. This is what the
milestone brief means by "a client-side gate is not a hard boundary" — it
is correct, and it is a platform limitation, not a bug in this repository.

## What was fixed at the repository level (real, tested)

1. **`dashboard.html`** previously mounted the live administrator workspace
   for *any authenticated user* (not just admins) with zero role check.
   Fixed: it now runs the same real `isPlatformAdmin` check
   `Chalzydashboard.html` uses before calling `mountWorkspaceWhenReady()`;
   non-admins are redirected to the canonical `chalzydashboard.html` gate
   instead of ever seeing the workspace mount.
2. **`manifest.json` / `PWA/manifest.json`** `start_url` pointed installed
   PWAs straight at `/dashboard.html`. Fixed to `/index.html`.
3. **`router.js`** defaulted an empty path to `"dashboard.html"`. Fixed to
   `"index.html"`.
4. **`sw.js`** was already correct — its offline navigation fallback uses
   `index.html`, not `dashboard.html`. No change needed.

These are real improvements and close the worst practical risk (an
ordinary logged-in user silently landing in the admin workspace), but they
are still a **client-side gate**, subject to the platform limitation above.
An attacker who requests `dashboard.html` directly with `curl` (no
JavaScript execution at all) still receives the full file contents from
GitHub Pages today. It contains no live secrets — every privileged action
still requires its own server-side authorization check — but the
administrator UI's structure is not hidden.

## What a real hard boundary requires

`server/static-boundary-server.js` (new in this milestone) is a working,
locally-tested reference implementation of the actual fix: a small HTTP
server that serves the site and returns a plain `404` for `/dashboard`,
`/dashboard.html`, `/admin` etc. to anyone without a verified administrator
session, decided **before** any file bytes are sent. Verified locally:

```
GET /                 -> 200 (public entry)
GET /dashboard.html   -> 404
GET /dashboard        -> 404
GET /admin            -> 404
GET /chalzydashboard  -> 200 (canonical admin gate page)
```

To make this the live behavior of cozyos.org, GitHub Pages must be
replaced or fronted by something that can execute this code per-request.
Options, roughly in order of effort:

- **Cloudflare Pages + Pages Functions** — keep static hosting, add a
  `functions/_middleware.js` that ports the same allow/deny logic (no
  separate server process to run).
- **A small always-on Node process** (Render, Railway, Fly.io, a VPS) —
  run `server/static-boundary-server.js` directly, point cozyos.org's DNS
  at it.
- **Netlify + Edge Functions** — same idea as Cloudflare, Netlify's
  equivalent primitive.

Any of these require choosing a host, so this wasn't done automatically.

## The remaining prerequisite: session unification

`server/static-boundary-server.js` currently authorizes requests using
**only** the new WebAuthn RP's own session cookie (`cozy_admin_session`).
The live site's actual login flow (`Chalzydashboard.html` /
`auth-coordinator.js`) still authenticates through the existing
Firebase-based `IdentityEngine`, which does not issue that cookie. Until
the frontend login flow is migrated to authenticate through the WebAuthn
RP (or a bridge mirrors one session into the other), a real, legitimately
logged-in Firebase-session administrator will be **denied** by this
server, not admitted. **Do not point production DNS at this server until
that integration work is done and tested against a real login.** This is
the honest scope boundary of this milestone: the routing enforcement layer
is real and tested; wiring it to the live identity system is the next
milestone.

## Categories, per the brief's own honesty requirement

- TESTED IN CLOUD/LOCAL ENVIRONMENT: route enforcement in
  `static-boundary-server.js` (curl against `localhost:8787`, see above);
  all 17 pre-existing `server/webauthn-rp` tests still pass after merge.
- TESTED ON TERMUX: not done — no device available in this environment.
- TESTED AGAINST LIVE cozyos.org: not done — this environment has no
  network egress and no access to the live domain or its DNS/hosting
  config.
- NOT YET TESTED: the `dashboard.html` client-side gate fix, in a real
  browser, against a real logged-in admin and a real logged-in non-admin
  account. The code mirrors `Chalzydashboard.html`'s already-used pattern
  exactly, but it has not been exercised in a browser in this session.
