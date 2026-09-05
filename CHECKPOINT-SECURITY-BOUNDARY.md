# CozyOS — Security Boundary, Canonical Admin Entry — Checkpoint

## IMPLEMENTATION STATUS
Scoped, real progress on the PRIMARY OBJECTIVE (static-hosting boundary +
bypass removal) and the WebAuthn backend merge. NOT a claim that all 30
sections of the brief are complete — see the honesty table below.

## FILES CREATED
- `server/static-boundary-server.js` — reference hard-boundary HTTP server
- `SECURITY-BOUNDARY-DEPLOYMENT.md` — limitation + deployment doc
- `server/webauthn-rp/*` — merged in from the delta zip (db.js, rp.js,
  server.js, cbor.js, authenticator-data.js, test/*)
- `PHASE-WEBAUTHN-BACKEND-IMPLEMENTATION-REPORT.md`,
  `SHA256-MANIFEST-WEBAUTHN-BACKEND-MILESTONE.txt` — carried over from delta

## FILES MODIFIED
- `dashboard.html` — added real `isPlatformAdmin` check before mounting the
  workspace (previously any authenticated user, not just admins, could
  reach it)
- `manifest.json`, `PWA/manifest.json` — `start_url` changed from
  `/dashboard.html` to `/index.html`
- `router.js` — default route changed from `dashboard.html` to `index.html`

## FILES REMOVED
None.

## SECURITY BOUNDARY CHANGES
- Real, curl-verified route enforcement in `static-boundary-server.js`:
  `/dashboard`, `/dashboard.html`, `/admin` → 404 for non-admin sessions;
  `/chalzydashboard` → canonical gate; `/` → public entry.
- `dashboard.html` no longer mounts the admin workspace for non-admin
  authenticated users.
- GitHub Pages' inability to enforce this at all documented explicitly,
  with the exact deployment change required (see
  SECURITY-BOUNDARY-DEPLOYMENT.md).

## AUTHENTICATION CHANGES
None beyond what the delta already implemented (merged, not re-built).

## RECOVERY CHANGES
None this milestone — out of scope for this pass, not attempted, not
claimed.

## SECURITY CENTER CHANGES
None this milestone — out of scope for this pass, not attempted, not
claimed.

## ROUTE CHANGES
`/chalzydashboard` reference-implemented as the canonical route in
`static-boundary-server.js`. `Chalzydashboard.html` remains the actual
source file, unchanged.

## TEST RESULTS
- `node --test server/webauthn-rp/test/http-integration.test.js` → 17/17
  passing after the merge into the main repo.
- `static-boundary-server.js` manually curl-tested against all 5 primary
  routes (see SECURITY-BOUNDARY-DEPLOYMENT.md) — all correct.
- `dashboard.html`'s new gate logic — NOT browser-tested this session (no
  browser available in this environment). Mirrors `Chalzydashboard.html`'s
  already-used, already-working pattern exactly.

## HASH MANIFEST
See `CHANGED-FILE-HASHES-SECURITY-BOUNDARY.txt`.

## LIMITATIONS & MISSING DEPENDENCIES
- GitHub Pages cannot enforce the hard boundary — needs a hosting change
  (Cloudflare Pages Functions / Netlify Edge Functions / always-on Node
  process). Not made automatically; requires a hosting decision.
- `static-boundary-server.js` authorizes against the WebAuthn RP's own
  session cookie only — NOT yet wired to the live Firebase-based session
  the frontend actually uses. Must not be pointed at production DNS until
  that integration is done and tested.
- CSRF protection and rate limiting: not implemented this milestone (item
  13 of the brief) — still an open, documented gap.
- Security Center UI (admin + user), audit log, recovery architecture,
  policy engine: not attempted this milestone.
- Full line-by-line audit of all 181 `dashboard.html` string references
  across the repo was not exhaustively catalogued; the ones with real
  security relevance (PWA start_url, router default, sw.js fallback,
  dashboard.html's own mount logic) were checked individually. The
  remainder are comments/redirect-target strings in files like the
  Firebase modules, not independent bypass paths — spot-checked, not every
  one individually tabulated.

## DEPLOYMENT REQUIREMENTS
See SECURITY-BOUNDARY-DEPLOYMENT.md.

## NEXT BUILD MUST START WITH
1. Decide the hosting platform for the hard boundary (Cloudflare Pages
   Functions is the lowest-effort option that keeps static hosting).
2. Unify the session system — either migrate the frontend login flow to
   authenticate through `server/webauthn-rp`, or have that flow mirror its
   result into the `cozy_admin_session` cookie `static-boundary-server.js`
   already checks.
3. Only then flip `static-boundary-server.js` (or its edge-function
   equivalent) into blocking/production mode.
4. CSRF + rate limiting (item 13) is the next-most-important gap after
   that.
