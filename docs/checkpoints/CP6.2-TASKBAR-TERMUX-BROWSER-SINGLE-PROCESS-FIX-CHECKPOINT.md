# CP6.2 Checkpoint: Taskbar — Termux Chromium `--single-process` Fix

**Checkpoint name:** CozyOS-CP6.2-Taskbar-Termux-Browser-SingleProcess-Fix-Checkpoint
**Created:** 2026-08-28
**Built from:** `CozyOS-CP6.1-Taskbar-Termux-Browser-Fix-Checkpoint.zip`
**Trigger:** Termux ran the CP6.1-recommended smallest-tool-first check,
`node tools/termux/chromium-dependency-verify.js`, and it FAILED at
step 2 (raw launch/dump-dom):

```
FAIL: raw launch/dump-dom failed: spawnSync .../chromium-browser ETIMEDOUT
CANNOT LINK EXECUTABLE "/proc/self/exe": library
  "/data/data/com.termux/files/usr/lib/libtermux-exec.so" ...
  is not accessible for the namespace
Failed to read /proc/sys/fs/inotify/max_user_watches
Could not bind NETLINK socket: Permission denied (13)
```

Real Chromium was discovered and its binary is present (step 1,
`--version`, was not reported as failing). Per the mandatory workflow,
Termux made no code changes and reported the failure verbatim for
Cloud's diagnosis.

## Diagnosis (evidence gathered before touching anything)

- The `CANNOT LINK EXECUTABLE "/proc/self/exe" ... libtermux-exec.so
  ... not accessible for the namespace` line is **byte-for-byte the
  same symptom** `browser-launch.js`'s header already documents as the
  reason `--no-zygote` was added in CP6.1. That flag is present in the
  current flag set and did not resolve it this time — so the working
  hypothesis from CP6.1 ("disabling the zygote host stops the
  re-exec") was only partially correct.
- Why `--no-zygote` alone is insufficient: on Linux/Android, Chromium's
  zygote is an optimization for *pre-forking* children; it is not the
  only path by which a child process gets launched via a re-exec of
  `/proc/self/exe`. `content::ChildProcessLauncher` re-execs the
  browser binary through `/proc/self/exe` for each renderer/
  network-service/utility child **independently of whether a zygote
  host is used**, as a guard against a tampered or relative `argv[0]`.
  `--no-zygote` removes the pre-fork zygote process; it does not
  remove this per-child re-exec. That re-exec bypasses the normal
  `chromium-browser` launch path Termux's `termux-exec` package
  intercepts via `LD_PRELOAD` (Termux's workaround for Android 10+'s
  W^X restriction on executing files from the app's private data
  directory), so the child's dynamic linker cannot find
  `libtermux-exec.so` in its new exec namespace and fails to link —
  exactly the reported error. The parent then blocks waiting for a
  child that will never come up, which is the `ETIMEDOUT` on the
  *outer* `execFileSync` call (30s timeout in the verify script).
- **Conclusion:** the fix needs to remove the remaining cause of any
  child-process launch, not just the zygote host. Chromium's own flag
  for that is `--single-process` (renderer runs inside the browser
  process — no renderer child, so no `/proc/self/exe` re-exec for it
  to fail on). This is the standard next-level fix Chromium documents
  for restricted-exec environments once `--no-zygote` alone is
  insufficient (the same environment class as Docker/gVisor/other
  locked-down sandboxes, not a CozyOS-specific invention).
- The other lines in the report — `inotify max_user_watches`,
  `NETLINK socket: Permission denied` — are unprivileged-Android
  warnings unrelated to this failure (Termux apps cannot read that
  sysctl or bind `NETLINK_ROUTE` sockets; Chromium degrades some
  internal file-watching/network-change-detection features
  gracefully when denied these, it does not block on them). Consistent
  with the standing instruction that DBus/inotify/NETLINK noise alone
  doesn't indicate the actionable failure — the actionable failure
  here is specifically the linker error plus the `ETIMEDOUT` around
  it, which are now addressed.

## What was built (repair, additive only)

- **`server/webauthn-rp/test/browser-launch.js`** — one change:
  `resolveLaunchOptions()`'s Android-native args gained
  `--single-process`, alongside the existing `--no-sandbox
  --no-zygote --disable-gpu --disable-dev-shm-usage --in-process-gpu`.
  Header comment extended with the reasoning above and an explicit,
  disclosed trade-off: Playwright's own docs flag `--single-process`
  as less exercised with CDP-driven automation than multi-process
  Chromium. Scoped to the Android-native branch only — no other
  platform's launch options are touched.
- **`tools/termux/chromium-dependency-verify.js`** — its raw-CLI flag
  list (used in step 2, *before* Playwright is ever require()'d, so it
  can't just import the flags from `browser-launch.js` at that point)
  was updated to match, with a comment explaining the two lists must
  be kept in sync by hand.
- **This checkpoint document.**

## What was explicitly NOT touched

- `core/shell/tests/taskbar-browser.test.js` — confirmed byte-identical
  to CP6.1 via checksum (below). It already composes
  `resolveLaunchOptions()` rather than hard-coding flags, so it
  inherits this fix automatically without being opened.
- `core/shell/taskbar.js`, `core/shell/window-manager.js`,
  `core/shell/tests/taskbar-harness.html` — unchanged since CP6.
- `admin-workspace.html`, `package.json` — unchanged.
- `core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js`
  — unchanged; regression-tested below.

```
$ md5sum core/shell/tests/taskbar-browser.test.js
0d34fcdd04ed665c24e7084afe42337f   (CP6.1 baseline and this checkpoint — identical)
```

## Tests (this sandbox, unchanged behavior confirmed)

```
node core/shell/tests/taskbar-browser.test.js
```
→ **12 passed / 0 failed** — unchanged from CP6.1. This sandbox has no
Android-native Chromium (no `PREFIX`, no `chromium-browser` on PATH),
so `resolveLaunchOptions()` falls through to Playwright's own managed
browser here exactly as before; `--single-process` is only appended
when `isAndroidNative` is true, so this run exercises the *unchanged*
code path and cannot by itself prove the Termux path — that still
requires Termux's own retry, below.

```
node core/modules/ChurchOS/test/living-worship-player-mini-pip-browser.test.js
```
→ **14 passed / 0 failed**, unchanged.

## Known limitations (explicitly not claimed as done)

- **Taskbar has still NOT been proven on real Android/Termux.** This
  checkpoint fixes the mechanism; it does not itself constitute
  Termux-side proof.
- `--single-process` trades away Chromium's normal process isolation.
  For a short-lived headless verification/test run this is an
  accepted, disclosed trade-off — it is not a change to any
  Taskbar/WindowManager production behavior, only to how the *test's*
  browser is launched.
- If step 4 of `chromium-dependency-verify.js` (Playwright driving the
  same binary) fails even after steps 1–3 pass, that would point at a
  Playwright-specific incompatibility with `--single-process`
  specifically (the trade-off flagged above) rather than the
  termux-exec/linker issue this checkpoint targets — a distinct
  finding, not assumed here, and worth reporting back as such if it
  occurs.
- Whether Termux's specific device still hits `NETLINK`/`inotify`
  permission warnings after this fix is expected and not itself a
  failure signal, per the diagnosis above.

## Next action

Termux re-runs, in order, and reports exact output:
```
node tools/termux/chromium-dependency-verify.js
```
If PASS on all 4 steps:
```
node core/shell/tests/taskbar-browser.test.js
```
If step 2 still fails with the same or a new error, that comes back to
Cloud again per the mandatory workflow — no manual code repair on the
Termux side.
