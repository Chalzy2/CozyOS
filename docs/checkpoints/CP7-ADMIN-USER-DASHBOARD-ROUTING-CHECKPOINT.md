# CP7 Checkpoint: Administrator/User Dashboard Post-Login Routing

**Checkpoint name:** CozyOS-CP7-Admin-User-Dashboard-Routing-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP6.8-Taskbar-CDP-Android-Diagnostics-Checkpoint.zip` (the last packaged checkpoint)

## Scope of this checkpoint — read before reviewing the file list

This checkpoint's subject is the completed, offline-first Administrator/
User Dashboard post-login routing repair. That work touches exactly
**one existing file** (`index.html`) and adds **three new files**.

Diffing the current tree against CP6.8's own manifest also surfaces
**two additional changed files** —
`tools/termux/lib/cdp-pipe-client.js` and
`tools/termux/taskbar-cdp-browser.test.js` — that are **not part of
this checkpoint's work**. They carry forward, byte-for-byte, the CP6.9
diagnostic-instrumentation changes (an interleaved send/response/event/
stderr trace, added to help diagnose the Android CDP `Page.enable`
timeout) made *before* the Chromium/Termux feasibility assessment
recommended pivoting away from that architecture. Nothing further was
done to either file in this session; they were not part of this task,
were not touched by it, and were not reopened. They are included here
only because this checkpoint packages the complete current tree, and
per instruction, no historical or in-flight change is silently
dropped from that package. **CP7 does not claim, extend, or re-verify
any Chromium/Android CDP work** — see the CP6.8 checkpoint for that
work's own status.

Reporting this plainly, rather than omitting it or folding it
silently into "the routing checkpoint," is the honest option per the
instruction to stop and report anything inconsistent rather than
guess or gloss over it.

## 1. Administrator routing implementation (confirmed)

`index.html`'s `resolveAuthState()` now additionally computes
`dashboardConfig = IdentityEngine.getDashboardConfig(userId)` — an
existing, in-memory, zero-network method already trusted elsewhere in
this codebase (`dashboard-settings-admin-boundary-core.js`).
`proceedPastSequence()` passes `{ authenticated, dashboardConfig }` to
the new pure `core/shell/post-login-routing-core.js`'s
`decidePostLoginDestination()`. Strict `dashboardConfig.isPlatformAdmin
=== true` routes to `chalzydashboard.html`; everything else keeps the
exact pre-existing behavior (mount the real User Dashboard inline, or
send unauthenticated visitors to `login.html`). The actual
Administrator security boundary — `admin-gate-core.js`'s
server-verified `decideGateAction()`/`resolveWorkspaceRoute()` plus
`chalzydashboard.html`'s own `fetch("/webauthn/session")` — was **not
modified** and independently re-verifies every arrival at
`/chalzydashboard`, regardless of how the browser got there.

## 2. Offline-first behavior (confirmed)

Zero new network calls. `getDashboardConfig()` is an in-memory lookup;
the only network call anywhere in the admin-routing path remains the
pre-existing `fetch("/webauthn/session")` inside `chalzydashboard.html`,
unchanged and un-relocated. An authenticated user with no computable
`dashboardConfig` (lookup failure, thrown error, unknown userId) still
reaches the User Dashboard — never blocked, never bounced to login —
confirmed by dedicated tests below.

## 3. Files changed (this checkpoint's actual subject)

- `index.html` — edited (`resolveAuthState()`/`proceedPastSequence()`,
  one new `<script>` tag)
- `core/shell/post-login-routing-core.js` — new
- `core/shell/tests/post-login-routing-core.test.js` — new
- `core/shell/tests/index-html-post-login-routing-wiring.test.js` — new

```
$ md5sum index.html
fbc81835a1a90a339a8bd21456bf4491
$ md5sum core/shell/post-login-routing-core.js
2ed2959361db5fa5482b7c07c2125233
$ md5sum core/shell/tests/post-login-routing-core.test.js
66f84a9cea411f628b777eeb826e13bf
$ md5sum core/shell/tests/index-html-post-login-routing-wiring.test.js
f17d0491e46c9cbfbce24a846703ca01
```

## 4. Files changed (carried forward, NOT this checkpoint's work — see Scope above)

```
$ md5sum tools/termux/lib/cdp-pipe-client.js
14f10b782681e881ad32317accef09e4   (CP6.9 diagnostic instrumentation, unchanged since)
$ md5sum tools/termux/taskbar-cdp-browser.test.js
3fdb8f2adeefb3ce4dbc938928d13862   (CP6.9 diagnostic instrumentation, unchanged since)
```

## 5. Files confirmed unchanged (hash-verified against pre-routing-work values)

```
server/webauthn-rp/test/browser-launch.js       2b0e6269670458499ee18fba16b789f4
tools/termux/chromium-single-process-bisect.js  21ffdcefae6ff8c56eb82e97bc45dadd
tools/termux/chromium-cdp-pipe-combination-diagnostic.js  b5651ece439fc1a3cb5cceb7248974de
core/shell/taskbar.js                            b0755554d55ddd0c83c262bee208d4de
core/shell/window-manager.js                     ede5ab12073a138209087feffe462f3f
core/shell/admin-gate-core.js                    9ab58854ff8aca0e3f178b47752b1d3e
server/static-boundary-server.js                 95e95621b49770d6eb794ef7a5ee200a
core/modules/identity/identity-engine.js         91c015349bb6db93971fbdc1b0c8416d
core/modules/identity/auth-coordinator.js        6dcc3b30376d1acea48bc5e0b780563b
login.html                                       2dc2d4f79c2a5a725918dd56843687f0
dashboard.html                                   98d06c5e59422a428de9b87894985576
chalzydashboard.html                             16cd9f8c61f995e7353eaee6e42b777a
```

No unrelated file was altered. No production logic was introduced beyond
the routing decision itself; no new feature was added.

## 6. Test results (all reported here were actually run, this session)

| Suite | Result |
|---|---|
| `core/shell/tests/post-login-routing-core.test.js` (new — pure decision logic) | **PASS** 12/12 |
| `core/shell/tests/index-html-post-login-routing-wiring.test.js` (new — real vm-extracted inline-script wiring) | **PASS** 6/6 |
| `core/shell/tests/admin-gate-core.test.js` (baseline, re-run) | **PASS** 33/33 |
| `server/test/chalzydashboard-gate-integration.test.js` (baseline, re-run) | **PASS** 6/6 |
| `test/deployment/verify-production-routing-offline.test.js` (baseline, re-run) | **PASS** 21/21 |
| `core/modules/identity/test/auth-coordinator.test.js` (regression) | **PASS** 26/26 |
| `core/security/test/login-decision-engine.test.js` (regression) | **PASS** 19/19 |

No SKIPPED, no BLOCKED entries — none of this work touches Android/Termux.

**Android/Termux browser verification: NOT claimed.** This checkpoint is
authentication/routing logic only, verified exclusively via Node's
built-in test runner. No browser (real or headless) was used or needed
for any test in this checkpoint.

## 7. Security regression results (confirmed)
- No URL/username/query-string/hash-fragment privilege escalation —
  explicitly tested with a fixture carrying `username: "chalzy2"`,
  `url: "/chalzydashboard?admin=true#admin"`, `role: "admin"`, all
  ignored; only a real `isPlatformAdmin === true` grants the
  `CHALZYDASHBOARD` routing hint.
- No client-role spoofing — `isPlatformAdmin: 1` and
  `isPlatformAdmin: "true"` both tested and rejected (strict `=== true`
  only, no truthy coercion).
- No accidental user→admin routing, no admin→user-dashboard
  fall-through — both directions explicitly tested and passing.
- `admin-gate-core.js` and `static-boundary-server.js` (the actual
  security boundary) were not modified in any way.

## 8. Known limitations
- `login.html` itself was not modified — all login methods already
  funnel through `index.html`'s single post-auth choke point, so no
  change there was necessary.
- A returning administrator visiting `/` directly (not immediately
  after a fresh login) is now also routed to `/chalzydashboard`, since
  `index.html`'s auth resolution runs identically for a freshly
  redirected login and a restored offline session. This is a
  deliberate consequence of reusing the one existing common point, not
  an oversight.
- The two carried-forward Chromium/CDP diagnostic files (section 4)
  remain exactly as CP6.9 left them; this checkpoint neither advances
  nor claims anything new about that work.
