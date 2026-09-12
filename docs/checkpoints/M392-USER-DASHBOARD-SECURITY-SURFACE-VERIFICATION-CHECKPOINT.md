# M392 Checkpoint: User Dashboard Security Surface — Verification

## Scope of this checkpoint

This checkpoint does **not** add new architecture, migrate any auth
engine, or touch `core/shell/user-dashboard.js`'s implementation.
Ordinary users remain Firebase-based; administrators remain
Render-backed; no second auth engine was created. The work was purely
verification of the existing `#renderSecuritySection()` composition
already found in the checkpoint under review:

1. Locate/complete the missing DOM-level test coverage for
   `core/shell/user-dashboard.js`'s `#renderSecuritySection()`.
2. Prove `authentication-enrollment-panel.js` and
   `authentication-factor-management-panel.js` are actually mounted
   into the **ordinary-user** Settings → Security surface.
3. Run the relevant/full regression suite.
4. Real browser verification.
5. This checkpoint.

## 1. DOM-level test status (finding, not new work)

`core/shell/tests/user-dashboard-security-section.test.js` **already
exists in the checkpoint and is already complete** — it was not
actually missing. It covers, against the real, unmodified
`user-dashboard.js`:

- honest "not available" disclosure when neither security module is
  registered;
- mounting both real panels for an ordinary user (no
  `isPlatformAdmin`, no admin-boundary override supplied);
- mounting whichever single panel is registered, honestly, with no
  fabricated UI for the missing one;
- idempotent re-render: `destroy()` called on every pass before
  `init()`, no duplicate DOM stacking;
- the call-site contract that neither panel's `init()` is ever passed
  a client-supplied user id (each panel resolves its own signed-in
  session).

Ran as-is: **6/6 pass**, no code changes were needed or made.

## 2. Real mounting into the ordinary-user surface (confirmed, not mocked)

Beyond the Node test's fakes, this checkpoint traced the real
composition end to end by reading source directly:

- Both real panel files self-register at
  `window.CozyOS.Modules["authentication-enrollment-panel"]` and
  `window.CozyOS.Modules["authentication-factor-management-panel"]`
  (their own bottom-of-file registration, not a mocked stand-in).
- `dashboard.html` (the ordinary-user page — **not** only
  `admin-workspace.html`) includes both panel scripts, and
  loads them *before* `core/shell/user-dashboard.js`, so
  `window.CozyOS.Modules` is populated before `render()` ever runs.
- `#renderSecuritySection()` reads exactly those two keys and calls
  `getDashboard()` / `init()` / `destroy()` on whatever is present —
  matches what the DOM test already exercises with fakes.

## 3. Regression results (all actually run this session)

| Suite | Result |
|---|---|
| `user-dashboard-security-section.test.js` | 6/6 pass |
| `user-dashboard-level1-slice.test.js` | 12/12 pass |
| `user-dashboard-level1-drawer.test.js` | 26/26 pass |
| `core/modules/security/test/*.test.js` (5 files) | 45/45 pass |
| `dashboard-settings-admin-boundary-core.test.js` | 1/1 pass |
| Full `core/shell/tests/*.test.js` (non-browser, 28 files) | all pass (0 fail) — two suites (`launch-sequence-above-only`, `launch-sequence-no-replay-after-login`) run real ~17s startup timers and need a >40s cap; confirmed passing at 60s, not a regression |
| `taskbar-browser.test.js` | not run this session (browser-driven; out of scope for this surface) |

No failures anywhere in the executed scope.

## 4. Real browser verification

Environment note: this sandbox has no outbound network access, so the
real Firebase-backed login gate in `dashboard.html` cannot complete
end-to-end here (same documented limitation as prior browser
verification checkpoints in this repo). Real Chromium 141 via
Playwright, serving the actual repository over a local static server,
was used for what the environment does allow:

- Loaded the real, unmodified `dashboard.html`. Zero page errors.
  `window.CozyOS.Modules` genuinely contains both
  `authentication-enrollment-panel` and
  `authentication-factor-management-panel`, each with a real
  `getDashboard` function — confirmed live in the browser, not by
  static read alone.
- Called the real, unmodified `window.CozyOS.UserDashboard.render()`
  directly against a real DOM container (bypassing only the
  network-blocked Firebase login gate, not the dashboard code itself),
  then used the real `DashboardNavigationCore.switchTo('settings')`.
  The real `#cozy-ud-security-panel` DOM node exists and its
  `innerHTML` is the real `authentication-factor-management-panel.js`
  output (`#cozy-factormgmt-root`, its real styles and markup) — not a
  placeholder.
- One unrelated failed request was observed: `assets/video/forest.mp4`
  404s. Pre-existing, unrelated to the security surface, out of scope
  for this checkpoint — not investigated or fixed here.

## 5. Known limitations

- Full end-to-end verification through a real Firebase login is not
  possible in this network-disabled sandbox; verification here
  composes the real render path directly instead, as described above.
- `taskbar-browser.test.js` was not re-run this session (unrelated
  surface).
