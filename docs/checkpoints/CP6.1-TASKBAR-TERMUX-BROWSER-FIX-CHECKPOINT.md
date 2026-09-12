# CP6.1 Checkpoint: Taskbar — Termux Real-Browser Runtime Fix

**Checkpoint name:** CozyOS-CP6.1-Taskbar-Termux-Browser-Fix-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP6-Taskbar-Checkpoint.zip` (previous checkpoint,
Taskbar capability itself unchanged in behavior/functionality).
**Trigger:** Termux ran `node core/shell/tests/taskbar-browser.test.js`
and got `SKIPPED: playwright not installed in this environment` — an
honest report, not a pass. Per the mandatory workflow, Termux did not
attempt a manual repair; this checkpoint is Cloud's diagnosis and fix.

## Diagnosis (evidence gathered before touching anything)

- `package.json` already lists `playwright: "^1.62.1"` under
  `devDependencies` — the dependency is declared. "Not installed"
  therefore means `node_modules/playwright` doesn't exist on the
  Termux device, not that the project is missing a declaration.
- `server/webauthn-rp/test/browser-launch.js` — read in full — already
  documents *exactly* this class of problem: "Playwright's normal `npx
  playwright install chromium` downloads a desktop Linux (glibc)
  Chromium build. That build does not run under Termux... Playwright's
  official guidance for Android/Termux is therefore NOT 'download our
  Chromium anyway' — it's to point Playwright at a real, natively-built
  ARM Chromium already present on the system." Playwright's own default
  `npm install` postinstall step tries to download that unusable
  desktop build; on a Termux device this download is very likely to
  fail (wrong platform/arch), which can cause `npm install` to error
  out and leave `node_modules/playwright` absent entirely — the exact
  symptom Termux reported. **Conclusion: this is a known, already-
  solved-elsewhere class of problem in this repo, not a new one.**
- `tools/termux/chromium-dependency-verify.js` — already exists,
  already documents the two required Termux packages (`pkg install
  x11-repo` then `pkg install chromium`) and already independently
  verifies a real system Chromium binary launches and executes JS,
  using the same discovery logic the real E2E test uses.
- `server/webauthn-rp/test/browser-e2e-passkey-login.test.js` — already
  composes `browser-launch.js`'s `resolveLaunchOptions()` when calling
  `chromium.launch(...)`, rather than a bare `chromium.launch()`. My
  own `taskbar-browser.test.js` did **not** do this — it copied the
  bare-launch pattern from `living-worship-player-mini-pip-browser.test.js`
  (a pre-existing file, not touched by this or the prior checkpoint).
  **Conclusion: my test had a real gap — even once `playwright` itself
  is installed, a bare `chromium.launch()` still could not find
  Termux's system Chromium, since Playwright's own managed-browser
  resolution only works where `npx playwright install chromium`
  actually succeeded (not Termux). This needed a genuine fix, not a
  bypass.**

## What was built (repair, additive only)

- **`core/shell/tests/taskbar-browser.test.js`** — one change:
  `chromium.launch()` → `chromium.launch(resolveLaunchOptions({ headless: true }))`,
  importing `resolveLaunchOptions` from the existing, unmodified
  `server/webauthn-rp/test/browser-launch.js`. This composes the
  repo's own already-proven Chromium-discovery engine instead of
  inventing a second one — no new discovery logic was written anywhere.
  File header updated to disclose this and point to this checkpoint
  doc. Confirmed unchanged in this sandbox: all 12 taskbar tests still
  pass, since `browser-launch.js`'s discovery falls through to
  Playwright's own managed browser here exactly as before (no
  `COZY_E2E_CHROMIUM_PATH`, no system `chromium-browser` present in
  this sandbox) — the fix only changes behavior on a device where a
  system Chromium is actually discoverable, i.e. Termux.
- **This checkpoint document.**

## What was explicitly NOT touched

- `server/webauthn-rp/test/browser-launch.js` itself — read and
  `require()`'d only. Confirmed byte-identical to the CP5 baseline via
  checksum (see below) — it was never opened for editing.
- `core/shell/taskbar.js`, `core/shell/window-manager.js`,
  `core/shell/tests/taskbar-harness.html` — unchanged since CP6.
- `admin-workspace.html` — unchanged since CP6.
- Any authentication/WebAuthn production code, `render.yaml`, CP4
  production routing.
- `core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js`
  — its own bare-`chromium.launch()` limitation is pre-existing,
  out of this scope's ownership, and was not modified.
- `package.json` — no change. `playwright` was already correctly
  declared; the fix is a launch-options change plus a documented
  install-time environment variable, not a new dependency.

## The supported way to obtain a real browser runtime on Termux (documentation, not code)

Two independent things are required; both are Termux/device-side
operator steps, not Cloud-side code changes, since Cloud has no way to
run `pkg install` or `npm install` on the device itself:

1. **A real, natively-built Chromium binary**, via Termux's own package
   repository (already documented in `browser-launch.js` and
   `tools/termux/chromium-dependency-verify.js`, not invented here):
   ```
   pkg install x11-repo
   pkg install chromium
   ```
   This installs a real Android/ARM64 Chromium at
   `$PREFIX/bin/chromium-browser`, which `browser-launch.js`'s
   `discoverChromium()` finds automatically (via `which`, then via
   `$PREFIX/bin/chromium-browser` directly) — no manual path
   configuration needed unless the operator wants to override it via
   `COZY_E2E_CHROMIUM_PATH`.

2. **`playwright` actually present in `node_modules`.** If `npm
   install` previously failed or silently skipped it because
   Playwright's own postinstall step tried (and, on Termux, is
   expected to fail) to download its unusable desktop-Chromium build,
   re-run install with Playwright's own documented environment
   variable that skips that download:
   ```
   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install
   ```
   This lets `npm install` complete and populate `node_modules/playwright`
   without ever attempting the incompatible download — the system
   Chromium from step 1, found via `resolveLaunchOptions()`, is what
   actually gets launched, exactly as the real WebAuthn E2E test
   already relies on.

**Recommended verification order on the device** (smallest, already-
existing tool first, before re-attempting the full taskbar suite):
```
node tools/termux/chromium-dependency-verify.js
```
This independently proves (in 4 steps: version, raw launch, JS
execution, Playwright launch of that same binary) that a real browser
is actually usable in this environment *before* spending time on the
taskbar suite specifically. Only if this reports PASS on all 4 steps
should Termux re-run:
```
node core/shell/tests/taskbar-browser.test.js
```

## Tests (this sandbox, unchanged behavior confirmed)

```
node core/shell/tests/taskbar-browser.test.js
```
→ **12 passed / 0 failed** (identical result to CP6 — this environment
has no system Chromium override, so `resolveLaunchOptions()` falls
through to the same Playwright-managed browser used before).

## Regression check

```
node core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
```
→ **14 passed / 0 failed**, unchanged. `server/webauthn-rp/test/browser-launch.js`
was not modified, so nothing that already depended on it (the real
WebAuthn E2E test) is affected — confirmed by checksum, not just by
not having opened the file for editing:

```
$ md5sum server/webauthn-rp/test/browser-launch.js   # both checkpoints
84fd16a57a8d459cb1e82c6fa8622175  (CP5 baseline)
84fd16a57a8d459cb1e82c6fa8622175  (this checkpoint)
```

## Diff against the CP6 baseline

```
Only in this checkpoint: docs/checkpoints/CP6.1-TASKBAR-TERMUX-BROWSER-FIX-CHECKPOINT.md
Files core/shell/tests/taskbar-browser.test.js differ (browser-launch.js import + resolveLaunchOptions() call + header disclosure only — verified below)
```
The `taskbar-browser.test.js` diff is exactly: one new `require`, one
changed line (`chromium.launch()` → `chromium.launch(resolveLaunchOptions(...))`),
and header/skip-message comment additions. No test case, assertion, or
helper function body was altered — the 12 test cases are byte-for-byte
the same tests as CP6, just now capable of finding a real browser on
Termux.

## Bugs found/fixed

One: `taskbar-browser.test.js`'s Chromium launch did not compose this
repo's own existing, proven Chromium-discovery mechanism
(`browser-launch.js`), so it could never have found a real browser on
Termux even after `playwright` itself was installed. Fixed by
composing that existing engine — not by weakening, mocking, or
skipping the check.

## Known limitations (explicitly not claimed as done)

- **Taskbar has NOT been proven on real Android/Termux.** This
  checkpoint fixes the *mechanism* by which real-browser proof becomes
  possible; it does not itself constitute that proof. Termux must
  still run the verification steps above and report the actual result.
- **Whether Termux's specific device has `pkg install chromium`
  available/working, or whether its `npm install` needs
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, is not something Cloud can
  verify from this sandbox** (no real Android device, no network
  egress here — same standing limitation as every prior checkpoint).
  These are the most likely fixes given the evidence, not guaranteed
  facts about that specific device.

## Next action

Termux runs, in order, and reports the exact output of each (success
or failure, verbatim):
```
node tools/termux/chromium-dependency-verify.js
```
If that reports PASS on all steps:
```
node core/shell/tests/taskbar-browser.test.js
```
If `chromium-dependency-verify.js` itself fails or reports no
discovered binary, Termux runs the two `pkg install` commands and/or
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` documented above first,
then re-runs `chromium-dependency-verify.js` before retrying the
taskbar suite. No manual code repair on the Termux side either way —
if a *new* unexpected error appears, that comes back to Cloud again,
per the mandatory workflow.
