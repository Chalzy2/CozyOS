# Milestone: Real WebAuthn Backend + Chalzydashboard Wiring

## IMPLEMENTED

- `server/webauthn-rp/` — a standalone Node HTTP server that is a real WebAuthn
  relying party: it does genuine CBOR decoding (`cbor.js`), COSE-key-to-crypto-key
  conversion and ECDSA/RSA signature verification (`authenticator-data.js`),
  and persists everything to a real on-disk SQLite database (`db.js`, via
  Node's built-in `node:sqlite` — no npm dependency, see LIMITATIONS).
- Endpoints: registration begin/complete, authentication begin/complete,
  current session, logout, list passkeys, revoke a passkey, and an
  already-authenticated-admin-only passkey enrollment begin/complete pair.
- `GET /webauthn/authorize/admin` — the single endpoint that decides admin
  access. It reads only the `is_platform_admin` column via the session
  cookie; no route ever lets a client set that column.
- HttpOnly, SameSite=Strict session cookies with a 30-day TTL, backed by a
  `sessions` table (not signed tokens), so revocation is immediate and real.
- Cloned-authenticator detection via strict sign-counter comparison.
- Fixed two real bugs: `manifest.json` and `PWA/manifest.json` both had
  `start_url` pointing at `/dashboard.html` instead of `/index.html` — fixed,
  and I re-scanned the tree for any other `start_url` offender (there were
  none besides an unrelated relative path in `applications/MpesaOS`).
- `Chalzydashboard.html` rewritten: it no longer asks any client-side
  identity module whether the user is an administrator. It now calls
  `GET /webauthn/authorize/admin` on load; on a non-authorized response it
  shows a real "Continue with Passkey" button that drives the actual
  browser `navigator.credentials.get()` WebAuthn API against the endpoints
  above, using a session cookie thereafter — no persisted client-side
  admin flag anywhere in this file.
- `dashboard.html` — added an additive, fail-closed guard at the very top
  of `<head>` that also calls `/webauthn/authorize/admin` before revealing
  the page, and redirects to `Chalzydashboard.html` on anything other than
  an explicit 200/authorized response (including network errors). This is
  defense-in-depth, not the full fix — see LIMITATIONS.
- 17 new real HTTP integration tests (`server/webauthn-rp/test/http-integration.test.js`)
  plus a test-only "virtual authenticator" (`test/virtual-authenticator.js`)
  that generates a real EC keypair and produces genuine CBOR/COSE-encoded
  attestation objects and ASN.1/DER ECDSA signatures — every test exercises
  the actual HTTP + crypto + SQLite path, not mocked functions.

## VERIFIED

- Real crypto round-trip (register → authenticate → resolve session) sanity
  script, run standalone before the test suite existed.
- All 17 new integration tests pass, run via `node --test`, covering:
  unauthenticated → 401; ordinary user → 403; valid admin auth → 200;
  forged `X-Is-Platform-Admin` header ignored; forged/garbage session
  cookie fails; revoked passkey fails; revoked session fails immediately;
  expired session fails (simulated clock, no real 30-day wait); forged
  ECDSA signature rejected; cloned-authenticator sign-counter replay
  rejected; expired/replayed challenge rejected; a request-body admin
  claim is never read by the authorization route; enrollment requires an
  existing admin session; multi-passkey enrollment and use; and session
  persistence across a full server-process restart against the same
  on-disk SQLite file (real cross-process persistence, not an in-memory
  stand-in).
- Existing test suites still pass unmodified: `server/auth` (47),
  `server/ai` (2), `server/live-relay` (132) — 181 pre-existing tests plus
  17 new ones, 198 total, all green, run together with `node --test`.
- The injected `<script>` blocks in `dashboard.html` and
  `Chalzydashboard.html` were extracted and passed `node --check` (valid
  JS syntax).
- Confirmed via `grep` that `manifest.json` / `PWA/manifest.json` were the
  only two manifests in the repo pointing `start_url` at `/dashboard.html`.

## NOT VERIFIED

- **No real browser exercised this.** `navigator.credentials.get()`/`.create()`
  against an actual platform authenticator (Touch ID, Windows Hello, a
  physical security key, etc.) has not been run. The virtual authenticator
  in tests is real cryptography but is not a browser or a real device.
- **`/chalzydashboard` → real backend, end-to-end, in a live browser** has
  not been exercised. What's verified is the HTTP contract the client code
  calls; the client code itself has not been click-tested.
- **The webauthn-rp server has not been deployed anywhere**, Termux
  included. Nothing here should be read as "production deployment
  complete."
- **I did not audit all ~70 files** that reference `dashboard.html` or
  `isPlatformAdmin`/`X-Is-Platform-Admin` found by the grep sweep below.
  I fixed the two real manifest bugs and added the dashboard.html guard,
  but dozens of other modules (ChurchOS, shell, security, organization,
  etc.) reference `isPlatformAdmin` and have not been individually
  reviewed for client-side-trust bugs. This is real remaining work, not
  hand-waved as done.
- Biometric login, TOTP, recovery codes, and identity-verification
  recovery are **not implemented** — correctly not implemented, not faked.
- No CSRF protection beyond `SameSite=Strict`, no rate limiting on any
  endpoint.

## LIMITATIONS & MISSING DEPENDENCIES

- **No npm registry access in this sandbox** (a real request returned 403
  — I did not fabricate this). `server/webauthn-rp/` is built entirely on
  Node built-ins (`node:sqlite`, `node:crypto`, `node:http`) with a hand-
  written minimal CBOR codec. Swap-in instructions for real libraries once
  you have network access: replace `cbor.js` with the `cbor` npm package
  and `authenticator-data.js`'s manual COSE handling with
  `@simplewebauthn/server`, which also adds attestation-format support
  (`packed`, `android-safetynet`, etc.) beyond the `none`/self-attestation
  path this build supports today.
- `node:sqlite` is still an experimental Node API (Node emits an
  `ExperimentalWarning`) — stable, but worth knowing before you rely on it
  long-term.
- **Architectural gap, not just a missing test**: `webauthn-rp` is a
  separate HTTP server/port from whatever serves the static HTML/JS files
  (there's no single production app server in this repo — deployment docs
  point at static hosting + Termux). That means:
  - The two servers must be reverse-proxied onto the same origin in
    production (WebAuthn ties credentials to an origin; the session
    cookie is `SameSite=Strict`). Not yet configured or verified anywhere.
  - The `dashboard.html` guard I added is a client-side, JavaScript-based
    redirect. A request that simply fetches the raw HTML (curl, JS
    disabled, etc.) still receives the full markup from the static file
    host, because that host has no concept of the session cookie or
    admin state. **True enforcement of "direct /dashboard.html access
    cannot bypass authorization" requires either moving HTML serving
    behind an authenticated app server, or an edge/proxy-level auth check
    (e.g. nginx `auth_request` or an equivalent), which does not exist in
    this repo yet.** I'm flagging this clearly rather than claiming the
    guard is a hard security boundary — it isn't one by itself.
- Passkey registration/enrollment for the very first administrator (before
  any admin session exists) has no HTTP path by design — `setPlatformAdmin()`
  is only callable from server-side code (a future seed/bootstrap script),
  never a route. That bootstrap script does not exist yet.

## NEXT BUILD MUST START WITH

1. Decide and implement the same-origin deployment shape (reverse proxy or
   merge into one app server) so cookies and WebAuthn origin checks are
   consistent, then re-verify the full flow through that real topology.
2. Write the admin-bootstrap script (`setPlatformAdmin` caller) so a first
   real administrator can be created and enroll their first real passkey
   in an actual browser, and do that click-through end-to-end.
3. Only then move to the Security Center features (multi-passkey UI, TOTP,
   recovery codes, session/device management UI, audit history UI) — the
   audit table (`audit_events`) already exists in the DB schema and is
   already being written to by `rp.js`, but has no UI yet.
4. Complete the broader repo audit this milestone explicitly did not
   finish: every `isPlatformAdmin`/`X-Is-Platform-Admin` reference outside
   `server/webauthn-rp/`, `Chalzydashboard.html`, and `dashboard.html`
   still needs individual review for whether it's UI-only state or an
   actual (incorrect) authorization decision.

Files changed/added this milestone are listed with SHA-256 hashes in
`SHA256-MANIFEST-WEBAUTHN-BACKEND-MILESTONE.txt`.
